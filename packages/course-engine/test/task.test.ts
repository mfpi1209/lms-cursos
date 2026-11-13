import { describe, expect, it } from 'vitest';
import { LessonGraphSchema, richTextFromPlain as p, type LessonGraph } from '@lms/course-schema';
import { applyIntent, computeProgress, createInitialState, EngineError, navigateBack } from '../src';

const now = new Date('2026-01-01T00:00:00Z');

/** vídeo → tarefa → fim */
const graph = (over: Record<string, unknown> = {}): LessonGraph =>
  LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'intro',
    variables: [],
    nodes: [
      { id: 'intro', type: 'scenario', title: 'Abertura', body: p('Grave e envie.') },
      { id: 'tarefa', type: 'task', title: 'Missão final', instruction: 'Envie o link do vídeo.', deliverable: 'link_file', criteria: [{ id: 'c1', label: 'Tem até 1 minuto' }], ...over },
      { id: 'fim', type: 'end', summary: p('Pronto.') },
    ],
    edges: [
      { id: 'e1', from: 'intro', to: 'tarefa' },
      { id: 'e2', from: 'tarefa', to: 'fim' },
    ],
  });

const atTask = (g: LessonGraph) => applyIntent(g, createInitialState(g, now), { kind: 'advance' }, now).state;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'OK';
};

describe('motor: intenção submit (tarefa com entrega)', () => {
  it('um envio válido segue a aula e conclui (a correção fica para depois)', () => {
    const g = graph();
    const s = atTask(g);
    expect(s.currentNodeId).toBe('tarefa');
    const r = applyIntent(g, s, { kind: 'submit', link: ' https://youtu.be/abc ', fileAssetId: 'ast_123' }, now);
    expect(r.transitioned).toBe(true);
    expect(r.toNodeId).toBe('fim');
    expect(r.state.status).toBe('completed');
    expect(r.state.completedNodeIds).toContain('tarefa');
    expect(r.evidence).toEqual([]);
    // o estado da tentativa não guarda o link nem o arquivo
    expect(r.state.answers.tarefa).toEqual({ submission: 'sent', answeredAt: now.toISOString() });
    expect(JSON.stringify(r.state)).not.toContain('youtu.be');
    expect(JSON.stringify(r.state)).not.toContain('ast_123');
    expect(computeProgress(g, r.state).percent).toBe(100);
  });

  it('o arquivo é opcional com "link e arquivo"', () => {
    const g = graph();
    expect(applyIntent(g, atTask(g), { kind: 'submit', link: 'https://exemplo.com/v' }, now).toNodeId).toBe('fim');
  });

  it('recusa envio sem link, com link que não é https ou longo demais, e não sai do lugar', () => {
    const g = graph();
    const s = atTask(g);
    for (const link of [undefined, '', '   ', 'http://exemplo.com', 'exemplo.com/video', 'javascript:alert(1)', `https://exemplo.com/${'a'.repeat(2000)}`]) {
      expect(code(() => applyIntent(g, s, { kind: 'submit', ...(link === undefined ? {} : { link }) }, now)), String(link)).toBe('INVALID_SUBMISSION');
    }
    expect(s.currentNodeId).toBe('tarefa');
    expect(s.answers.tarefa).toBeUndefined();
  });

  it('recusa arquivo em tarefa que recebe só o link, e identificador de arquivo malformado', () => {
    const onlyLink = graph({ deliverable: 'link' });
    expect(code(() => applyIntent(onlyLink, atTask(onlyLink), { kind: 'submit', link: 'https://exemplo.com/v', fileAssetId: 'ast_1' }, now))).toBe('INVALID_SUBMISSION');
    expect(applyIntent(onlyLink, atTask(onlyLink), { kind: 'submit', link: 'https://exemplo.com/v' }, now).toNodeId).toBe('fim');
    const g = graph();
    expect(code(() => applyIntent(g, atTask(g), { kind: 'submit', link: 'https://exemplo.com/v', fileAssetId: '../etc/passwd' }, now))).toBe('INVALID_SUBMISSION');
  });

  it('o contrato antigo "file" aceita arquivo; "text" não', () => {
    const file = graph({ deliverable: 'file' });
    expect(applyIntent(file, atTask(file), { kind: 'submit', link: 'https://exemplo.com/v', fileAssetId: 'ast_1' }, now).toNodeId).toBe('fim');
    const text = graph({ deliverable: 'text' });
    expect(code(() => applyIntent(text, atTask(text), { kind: 'submit', link: 'https://exemplo.com/v', fileAssetId: 'ast_1' }, now))).toBe('INVALID_SUBMISSION');
  });

  it('keep segue com a entrega que já existe, sem link; com link junto é recusado', () => {
    const g = graph();
    const r = applyIntent(g, atTask(g), { kind: 'submit', keep: true }, now);
    expect(r.toNodeId).toBe('fim');
    expect(r.state.answers.tarefa).toEqual({ submission: 'kept', answeredAt: now.toISOString() });
    expect(code(() => applyIntent(g, atTask(g), { kind: 'submit', keep: true, link: 'https://exemplo.com/v' }, now))).toBe('INVALID_SUBMISSION');
  });

  it('a tarefa só aceita submit, e os outros blocos não aceitam submit', () => {
    const g = graph();
    const s = atTask(g);
    expect(code(() => applyIntent(g, s, { kind: 'advance' }, now))).toBe('INTENT_MISMATCH');
    expect(code(() => applyIntent(g, s, { kind: 'reflect', text: 'https://exemplo.com/v' }, now))).toBe('INTENT_MISMATCH');
    expect(code(() => applyIntent(g, createInitialState(g, now), { kind: 'submit', link: 'https://exemplo.com/v' }, now))).toBe('INTENT_MISMATCH');
  });

  it('tarefa não obrigatória também pede um envio válido para seguir (a regra de obrigatória é do certificado)', () => {
    const g = graph({ required: false });
    expect(code(() => applyIntent(g, atTask(g), { kind: 'advance' }, now))).toBe('INTENT_MISMATCH');
    expect(applyIntent(g, atTask(g), { kind: 'submit', link: 'https://exemplo.com/v' }, now).state.status).toBe('completed');
  });

  it('voltar uma cena depois do envio devolve o aluno à tarefa, sem a marca de envio', () => {
    const g = LessonGraphSchema.parse({
      ...graph(),
      nodes: [...graph().nodes.slice(0, 2), { id: 'depois', type: 'content', title: 'Depois', body: p('Obrigado.') }, graph().nodes[2]],
      edges: [
        { id: 'e1', from: 'intro', to: 'tarefa' },
        { id: 'e2', from: 'tarefa', to: 'depois' },
        { id: 'e3', from: 'depois', to: 'fim' },
      ],
    });
    const sent = applyIntent(g, atTask(g), { kind: 'submit', link: 'https://exemplo.com/v' }, now).state;
    expect(sent.currentNodeId).toBe('depois');
    const back = navigateBack(g, sent, { kind: 'back' }, { allowBack: true });
    expect(back.state.currentNodeId).toBe('tarefa');
    expect(back.state.answers.tarefa).toBeUndefined();
  });
});
