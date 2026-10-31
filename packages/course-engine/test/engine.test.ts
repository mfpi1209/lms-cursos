import { describe, expect, it } from 'vitest';
import { comunicacaoPrimeiroEmprego, richTextFromPlain as p, type LessonGraph } from '@lms/course-schema';
import { applyIntent, createInitialState, computeProgress, summarizeObjectives, EngineError, type Evidence } from '../src';

const lesson1 = comunicacaoPrimeiroEmprego.modules[0]!.lessons[0]!.graph;
const lesson2 = comunicacaoPrimeiroEmprego.modules[0]!.lessons[1]!.graph;
const now = new Date('2026-01-01T00:00:00Z');

describe('transições determinísticas', () => {
  it('escolhas diferentes levam a consequências diferentes e se reencontram', () => {
    const s0 = createInitialState(lesson1, now);
    expect(s0.currentNodeId).toBe('decisao_prazo');
    const a = applyIntent(lesson1, s0, { kind: 'choose', optionId: 'aceita' }, now);
    const b = applyIntent(lesson1, s0, { kind: 'choose', optionId: 'negocia' }, now);
    expect(a.toNodeId).toBe('cons_aceita');
    expect(b.toNodeId).toBe('cons_negocia');
    expect(a.feedback).toBeDefined();
    expect(a.state.variables.confianca).toBe(-1);
    expect(b.state.variables.confianca).toBe(1);
    const a2 = applyIntent(lesson1, a.state, { kind: 'advance' }, now);
    const b2 = applyIntent(lesson1, b.state, { kind: 'advance' }, now);
    expect(a2.toNodeId).toBe('conteudo_negociar');
    expect(b2.toNodeId).toBe('conteudo_negociar');
  });

  it('rejeita intenção incompatível com o bloco e opção inexistente', () => {
    const s0 = createInitialState(lesson1, now);
    expect(() => applyIntent(lesson1, s0, { kind: 'advance' }, now)).toThrowError(EngineError);
    expect(() => applyIntent(lesson1, s0, { kind: 'choose', optionId: 'zzz' }, now)).toThrow(/não existe/);
  });

  it('reflexão exige tamanho mínimo e registra sem avaliar', () => {
    let s = createInitialState(lesson1, now);
    s = applyIntent(lesson1, s, { kind: 'choose', optionId: 'negocia' }, now).state;
    s = applyIntent(lesson1, s, { kind: 'advance' }, now).state;
    s = applyIntent(lesson1, s, { kind: 'advance' }, now).state;
    s = applyIntent(lesson1, s, { kind: 'choose', optionId: 'manda_gestora' }, now).state;
    s = applyIntent(lesson1, s, { kind: 'advance' }, now).state;
    expect(s.currentNodeId).toBe('reflexao_prazo');
    expect(() => applyIntent(lesson1, s, { kind: 'reflect', text: 'curto' }, now)).toThrow(/ao menos 40/);
    const r = applyIntent(lesson1, s, { kind: 'reflect', text: 'x'.repeat(60) }, now);
    expect(r.toNodeId).toBe('avaliacao_prazo');
    expect(r.state.answers.reflexao_prazo?.text?.length).toBe(60);
    expect(r.evidence[0]).toMatchObject({ kind: 'reflection', objectiveId: 'obj_negociar_prazo' });
  });

  it('avaliação: errar permite repetir até o limite, depois avança reprovado', () => {
    let s = createInitialState(lesson1, now);
    for (const i of [{ kind: 'choose', optionId: 'aceita' }, { kind: 'advance' }, { kind: 'advance' }, { kind: 'choose', optionId: 'recusa_seco' }, { kind: 'advance' }, { kind: 'reflect', text: 'y'.repeat(50) }] as const)
      s = applyIntent(lesson1, s, i, now).state;
    expect(s.currentNodeId).toBe('avaliacao_prazo');
    const first = applyIntent(lesson1, s, { kind: 'assess', optionIds: ['a'] }, now);
    expect(first.transitioned).toBe(false);
    expect(first.assessment).toMatchObject({ passed: false, retry: true, attemptsLeft: 1 });
    expect(first.evidence).toEqual([]);
    const second = applyIntent(lesson1, first.state, { kind: 'assess', optionIds: ['c'] }, now);
    expect(second.transitioned).toBe(true);
    expect(second.assessment).toMatchObject({ passed: false, retry: false, attemptsLeft: 0, attemptsUsed: 2 });
    expect(second.evidence[0]?.value).toMatchObject({ passed: false });
    expect(second.state.status).toBe('completed');
    expect(() => applyIntent(lesson1, second.state, { kind: 'advance' }, now)).toThrow(/concluída/);
  });

  it('avaliação múltipla exige todas as corretas e nenhuma errada', () => {
    let s = createInitialState(lesson2, now);
    for (const i of [{ kind: 'advance' }, { kind: 'choose', optionId: 'demorou' }, { kind: 'advance' }, { kind: 'advance' }, { kind: 'choose', optionId: 'corrige_claro' }, { kind: 'advance' }] as const)
      s = applyIntent(lesson2, s, i, now).state;
    expect(s.currentNodeId).toBe('avaliacao_correcao');
    const partial = applyIntent(lesson2, s, { kind: 'assess', optionIds: ['o_que', 'alternativa'] }, now);
    expect(partial.assessment?.passed).toBe(false);
    const ok = applyIntent(lesson2, s, { kind: 'assess', optionIds: ['o_que', 'alternativa', 'desculpas'] }, now);
    expect(ok.assessment?.passed).toBe(true);
    expect(ok.toNodeId).toBe('reflexao_mensagem');
  });

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    const s0 = createInitialState(lesson1, now);
    const r1 = applyIntent(lesson1, s0, { kind: 'choose', optionId: 'recusa' }, now);
    const r2 = applyIntent(lesson1, s0, { kind: 'choose', optionId: 'recusa' }, now);
    expect(r1).toEqual(r2);
    expect(s0.currentNodeId).toBe('decisao_prazo'); // não muta a entrada
  });
});

describe('condições em arestas', () => {
  const g: LessonGraph = {
    schemaVersion: 1,
    startNodeId: 'q',
    variables: [{ name: 'pts', type: 'number', initial: 0 }],
    nodes: [
      { id: 'q', type: 'choice', prompt: p('?'), objectiveIds: [], required: true, options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }] },
      { id: 'meio', type: 'content', body: p('m'), objectiveIds: [], required: true },
      { id: 'bom', type: 'end', summary: p('bom'), objectiveIds: [], required: true },
      { id: 'ruim', type: 'end', summary: p('ruim'), objectiveIds: [], required: true },
    ],
    edges: [
      { id: 'e1', from: 'q', to: 'meio', optionId: 'a', effects: [{ op: 'inc', var: 'pts', by: 2 }] },
      { id: 'e2', from: 'q', to: 'meio', optionId: 'b' },
      { id: 'e3', from: 'meio', to: 'bom', condition: { op: 'and', conditions: [{ op: 'gte', var: 'pts', value: 2 }, { op: 'answered', nodeId: 'q', optionId: 'a' }] }, priority: 1 },
      { id: 'e4', from: 'meio', to: 'ruim', isDefault: true },
    ],
    layout: { positions: {} },
  };
  it('avalia prioridade, efeitos e fallback', () => {
    const s0 = createInitialState(g, now);
    const a = applyIntent(g, applyIntent(g, s0, { kind: 'choose', optionId: 'a' }, now).state, { kind: 'advance' }, now);
    const b = applyIntent(g, applyIntent(g, s0, { kind: 'choose', optionId: 'b' }, now).state, { kind: 'advance' }, now);
    expect(a.toNodeId).toBe('bom');
    expect(b.toNodeId).toBe('ruim');
  });
});

describe('progresso e objetivos', () => {
  it('não usa o total de nós como denominador: ramos exclusivos não inflam', () => {
    const s0 = createInitialState(lesson1, now);
    const p0 = computeProgress(lesson1, s0);
    // alcançáveis a partir do início: 12 nós obrigatórios (todos)
    expect(p0).toMatchObject({ completedRequired: 0, remainingRequired: 12, percent: 0 });
    const s1 = applyIntent(lesson1, s0, { kind: 'choose', optionId: 'negocia' }, now).state;
    const p1 = computeProgress(lesson1, s1);
    // decisão concluída; à frente: cons_negocia + conteudo + decisao2 + 3 cons + reflexão + avaliação + fim = 9
    expect(p1).toMatchObject({ completedRequired: 1, remainingRequired: 9, percent: 10 });
    const s2 = applyIntent(lesson1, s1, { kind: 'advance' }, now).state;
    expect(computeProgress(lesson1, s2)).toMatchObject({ completedRequired: 2, remainingRequired: 8, percent: 20 });
  });

  it('resume resultado por objetivo distinguindo conclusão de desempenho', () => {
    const ev: Evidence[] = [
      { objectiveId: 'obj_negociar_prazo', nodeId: 'decisao_prazo', kind: 'choice', value: { optionId: 'aceita' } },
      { objectiveId: 'obj_negociar_prazo', nodeId: 'avaliacao_prazo', kind: 'assessment', value: { passed: false } },
      { objectiveId: 'obj_corrigir_erro', nodeId: 'avaliacao_correcao', kind: 'assessment', value: { passed: true } },
      { objectiveId: 'obj_transparencia', nodeId: 'decisao_correcao', kind: 'choice', value: { optionId: 'espera' } },
    ];
    const r = summarizeObjectives(comunicacaoPrimeiroEmprego.objectives, ev);
    expect(r.map((x) => [x.objectiveId, x.status])).toEqual([
      ['obj_negociar_prazo', 'not_demonstrated'],
      ['obj_comunicar_limites', 'not_reached'],
      ['obj_corrigir_erro', 'demonstrated'],
      ['obj_transparencia', 'attempted'],
    ]);
  });
});

describe('progresso com condições (revisão)', () => {
  it('ramo condicional impossível no estado atual não infla o denominador', () => {
    const g: LessonGraph = {
      schemaVersion: 1,
      startNodeId: 'inicio',
      variables: [{ name: 'pts', type: 'number', initial: 0 }],
      nodes: [
        { id: 'inicio', type: 'content', body: p('i'), objectiveIds: [], required: true },
        { id: 'x1', type: 'content', body: p('x1'), objectiveIds: [], required: true },
        { id: 'x2', type: 'content', body: p('x2'), objectiveIds: [], required: true },
        { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true },
      ],
      edges: [
        { id: 'e1', from: 'inicio', to: 'x1', condition: { op: 'gte', var: 'pts', value: 5 }, priority: 1 },
        { id: 'e2', from: 'inicio', to: 'fim', isDefault: true },
        { id: 'e3', from: 'x1', to: 'x2' },
        { id: 'e4', from: 'x2', to: 'fim' },
      ],
      layout: { positions: {} },
    };
    const s0 = createInitialState(g, now);
    // com pts=0 só inicio e fim podem acontecer
    expect(computeProgress(g, s0)).toMatchObject({ completedRequired: 0, remainingRequired: 2, percent: 0 });
    const s1 = applyIntent(g, s0, { kind: 'advance' }, now);
    expect(s1.toNodeId).toBe('fim');
    expect(computeProgress(g, s1.state).percent).toBe(100);
  });
});

describe('variáveis de curso (carried)', () => {
  const g: LessonGraph = {
    schemaVersion: 1,
    startNodeId: 'inicio',
    variables: [
      { name: 'perfil', type: 'string', initial: 'padrao', scope: 'course' },
      { name: 'nivel', type: 'number', initial: 1, scope: 'course' },
      { name: 'local', type: 'number', initial: 0 },
    ],
    nodes: [
      { id: 'inicio', type: 'content', body: p('i'), objectiveIds: [], required: true },
      { id: 'a', type: 'end', summary: p('a'), objectiveIds: [], required: true },
      { id: 'b', type: 'end', summary: p('b'), objectiveIds: [], required: true },
    ],
    edges: [
      { id: 'e1', from: 'inicio', to: 'a', condition: { op: 'eq', var: 'perfil', value: 'x' }, priority: 1 },
      { id: 'e2', from: 'inicio', to: 'b', isDefault: true },
    ],
    layout: { positions: {} },
  };

  it('sem carried usa initial; aceita Date como 2º argumento (compatível)', () => {
    expect(createInitialState(g, now).variables).toEqual({ perfil: 'padrao', nivel: 1, local: 0 });
    expect(createInitialState(g, { now }).startedAt).toBe(now.toISOString());
  });

  it('carried substitui só variáveis de curso, com o tipo certo', () => {
    const s = createInitialState(g, { now, carried: { perfil: 'x', nivel: 'alto', local: 9, outra: true } });
    expect(s.variables).toEqual({ perfil: 'x', nivel: 1, local: 0 });
    expect(applyIntent(g, s, { kind: 'advance' }, now).toNodeId).toBe('a');
    expect(applyIntent(g, createInitialState(g, now), { kind: 'advance' }, now).toNodeId).toBe('b');
  });
});
