import { describe, expect, it } from 'vitest';
import { allLessons, podeEntrar, richTextFromPlain as p, type AnyNode, type EndNode, type LessonGraph, type Scalar } from '@lms/course-schema';
import {
  applyIntent,
  backAvailability,
  canGoBack,
  computeProgress,
  createInitialState,
  createStateAt,
  EngineError,
  navigateBack,
  resolveRecap,
  validateVariableOverrides,
  type AttemptState,
  type Intent,
} from '../src';

const now = new Date('2026-01-01T00:00:00Z');
const lessons = allLessons(podeEntrar);
const byId = (id: string): LessonGraph => lessons.find((l) => l.id === id)!.graph;
const simulacao = byId('aula_simulacao_final');
const abertura = byId('aula_abertura_preparacao');

const choose = (optionId: string): Intent => ({ kind: 'choose', optionId });
const advance: Intent = { kind: 'advance' };

function run(g: LessonGraph, intents: Intent[], carried?: Record<string, Scalar>): AttemptState {
  let state = createInitialState(g, { now, carried });
  for (const i of intents) state = applyIntent(g, state, i, now).state;
  return state;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return undefined;
}

describe('voltar uma cena (snapshot por passo)', () => {
  it('restaura exatamente o estado de quando a cena foi aberta (variáveis, respostas, concluídas, caminho)', () => {
    const atS02 = run(simulacao, [advance, choose('b')]);
    const atS03 = applyIntent(simulacao, atS02, choose('a'), now).state;
    expect(atS03.variables.pontos).toBe(4);
    const back = navigateBack(simulacao, atS03, { kind: 'back' });
    expect(back.toNodeId).toBe('s02_algo_deu_errado');
    expect(back.fromNodeId).toBe('s03_pergunta_confusa');
    expect(back.undone).toBe(1);
    expect(back.reconstructed).toBe(false);
    expect(back.state).toEqual(atS02);
    expect(back.state.variables.pontos).toBe(2);
    expect(back.state.answers.s02_algo_deu_errado).toBeUndefined();
    expect(back.state.answers.s01_perfil_combina?.optionIds).toEqual(['b']);
  });

  it('mudar a resposta depois de voltar recalcula pontos, caminho e encerramento', () => {
    // 2 + 2 + 2 + 2 = 8 → faixa e01
    const high = run(simulacao, [advance, choose('b'), choose('a'), choose('b'), choose('b')]);
    expect(high.variables.pontos).toBe(8);
    expect(high.currentNodeId).toBe('resultado_simulacao');
    // volta à S01 (índice 1 do caminho) e responde "c" (0 pontos)
    const back = navigateBack(simulacao, high, { kind: 'goto', pathIndex: 1, nodeId: 's01_perfil_combina' });
    expect(back.undone).toBe(4);
    expect(back.state.variables.pontos).toBe(0);
    expect(back.state.path.map((s) => s.nodeId)).toEqual(['intro_simulacao', 's01_perfil_combina']);
    expect(Object.keys(back.state.answers)).toEqual([]);
    expect(back.state.completedNodeIds).toEqual(['intro_simulacao']);
    let s = back.state;
    for (const i of [choose('c'), choose('c'), choose('a'), choose('a'), advance]) s = applyIntent(simulacao, s, i, now).state;
    // 0 + 0 + 0 + 1 = 1 → faixa e03, igual a quem respondeu assim desde o começo
    const direct = run(simulacao, [advance, choose('c'), choose('c'), choose('a'), choose('a'), advance]);
    expect(s.variables.pontos).toBe(1);
    expect(s.currentNodeId).toBe('e03_vamos_por_partes');
    expect(s).toEqual(direct);
    expect(computeProgress(simulacao, s)).toEqual(computeProgress(simulacao, direct));
  });

  it('o roteiro (recap) reflete a nova resposta', () => {
    const nodes: AnyNode[] = [
      { id: 'q', type: 'choice', title: 'Decisão', prompt: p('?'), objectiveIds: [], required: true, options: [{ id: 'a', label: 'Aviso cedo' }, { id: 'b', label: 'Espero' }] },
      { id: 'r', type: 'reflection', title: 'Frase', prompt: p('?'), objectiveIds: [], required: true, minLength: 0, maxLength: 500 },
      { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true, recap: [
        { id: 'i1', label: 'O que eu decidi', kind: 'choice', nodeId: 'q', emptyText: 'Completar quando quiser' },
        { id: 'i2', label: 'Minha frase', kind: 'reflection', nodeId: 'r', emptyText: 'Escreva depois' },
      ] },
    ];
    const g: LessonGraph = {
      schemaVersion: 1, startNodeId: 'q', variables: [], nodes, layout: { positions: {} },
      edges: [{ id: 'e1', from: 'q', to: 'r', optionId: 'a' }, { id: 'e2', from: 'q', to: 'r', optionId: 'b' }, { id: 'e3', from: 'r', to: 'fim' }],
    };
    const end = nodes[2] as EndNode;
    let s = run(g, [choose('a')]);
    expect(resolveRecap(g, end, s)[0]!.value).toBe('Aviso cedo');
    s = navigateBack(g, s, { kind: 'back' }).state;
    expect(resolveRecap(g, end, s)[0]!.value).toBeNull();
    s = applyIntent(g, s, choose('b'), now).state;
    s = applyIntent(g, s, { kind: 'reflect', text: 'Combino um prazo novo.' }, now).state;
    expect(s.status).toBe('completed');
    const items = resolveRecap(g, end, s);
    expect(items[0]!.value).toBe('Espero');
    expect(items[1]!.value).toBe('Combino um prazo novo.');
  });

  it('variável de curso (`perfil`): voltar antes da pergunta devolve o valor herdado; responder de novo grava o novo', () => {
    const atAtividade = run(abertura, [advance, choose('transicao'), advance], { perfil: 'experiencia' });
    expect(atAtividade.variables.perfil).toBe('transicao');
    const toQ01 = navigateBack(abertura, atAtividade, { kind: 'goto', pathIndex: 1, nodeId: 'q01_perfil' }).state;
    expect(toQ01.currentNodeId).toBe('q01_perfil');
    expect(toQ01.variables.perfil).toBe('experiencia');
    const again = applyIntent(abertura, toQ01, choose('primeiro_emprego'), now).state;
    expect(again.variables.perfil).toBe('primeiro_emprego');
    expect(again.currentNodeId).toBe('p01_primeiro_emprego');
    expect(again.path.map((x) => x.nodeId)).toEqual(['v01_entrevista_comeca', 'q01_perfil', 'p01_primeiro_emprego']);
    // voltar ao início mantém o valor herdado no começo da tentativa
    const toStart = navigateBack(abertura, again, { kind: 'goto', pathIndex: 0 }).state;
    expect(toStart.variables.perfil).toBe('experiencia');
  });

  it('avaliação: voltar desfaz as tentativas usadas na cena', () => {
    const g: LessonGraph = {
      schemaVersion: 1, startNodeId: 'c', variables: [], layout: { positions: {} },
      nodes: [
        { id: 'c', type: 'content', body: p('x'), objectiveIds: [], required: true },
        { id: 'av', type: 'assessment', prompt: p('?'), objectiveIds: [], required: true, mode: 'single', maxAttempts: 2, passing: { kind: 'all_correct' }, options: [{ id: 'a', label: 'A', correct: false }, { id: 'b', label: 'B', correct: true }] },
        { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true },
      ],
      edges: [{ id: 'e1', from: 'c', to: 'av' }, { id: 'e2', from: 'av', to: 'fim' }],
    };
    const failedOnce = applyIntent(g, run(g, [advance]), { kind: 'assess', optionIds: ['a'] }, now);
    expect(failedOnce.assessment?.retry).toBe(true);
    const back = navigateBack(g, failedOnce.state, { kind: 'back' }).state;
    expect(back.answers.av).toBeUndefined();
    const again = applyIntent(g, applyIntent(g, back, advance, now).state, { kind: 'assess', optionIds: ['a'] }, now);
    expect(again.assessment).toMatchObject({ attemptsUsed: 1, retry: true });
  });

  it('revisita (laço no grafo): cada visita volta com a resposta que o nó tinha ao entrar', () => {
    const g: LessonGraph = {
      schemaVersion: 1, startNodeId: 'q', layout: { positions: {} },
      variables: [{ name: 'tentativas', type: 'number', initial: 0 }],
      nodes: [
        { id: 'q', type: 'choice', prompt: p('?'), objectiveIds: [], required: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
        { id: 'cons', type: 'consequence', body: p('tente de novo'), objectiveIds: [], required: true, tone: 'negative', effects: [{ op: 'inc', var: 'tentativas', by: 1 }] },
        { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true },
      ],
      edges: [
        { id: 'e1', from: 'q', to: 'cons', optionId: 'a' },
        { id: 'e2', from: 'q', to: 'fim', optionId: 'b' },
        { id: 'e3', from: 'cons', to: 'q' },
      ],
    };
    const looped = run(g, [choose('a'), advance]); // q → cons → q (revisita)
    expect(looped.path[2]!.entryAnswer?.optionIds).toEqual(['a']);
    const atCons = navigateBack(g, looped, { kind: 'back' }).state;
    expect(atCons.currentNodeId).toBe('cons');
    expect(atCons.answers.q?.optionIds).toEqual(['a']);
    expect(atCons.variables.tentativas).toBe(1);
    const atStart = navigateBack(g, atCons, { kind: 'back' }).state;
    expect(atStart.answers.q).toBeUndefined();
    expect(atStart.variables.tentativas).toBe(0);
  });

  it('estado antigo sem snapshots: reconstrói por replay e chega ao mesmo resultado', () => {
    const modern = run(simulacao, [advance, choose('b'), choose('a'), choose('b')]);
    const legacy: AttemptState = { ...modern, path: modern.path.map(({ nodeId, at }) => ({ nodeId, at })) };
    const a = navigateBack(simulacao, modern, { kind: 'goto', pathIndex: 2 });
    const b = navigateBack(simulacao, legacy, { kind: 'goto', pathIndex: 2 });
    expect(b.reconstructed).toBe(true);
    expect(b.state.variables).toEqual(a.state.variables);
    expect(b.state.answers).toEqual(a.state.answers);
    expect(b.state.currentNodeId).toBe('s02_algo_deu_errado');
  });

  it('é determinístico', () => {
    const s = run(simulacao, [advance, choose('b'), choose('a')]);
    expect(navigateBack(simulacao, s, { kind: 'back' })).toEqual(navigateBack(simulacao, s, { kind: 'back' }));
  });
});

describe('quando não dá para voltar', () => {
  it('aula concluída → ATTEMPT_COMPLETED (use "Rever")', () => {
    const done = run(abertura, [advance, choose('primeiro_emprego'), advance, choose('colaborar'), advance, choose('b')]);
    expect(done.status).toBe('completed');
    expect(canGoBack(done)).toBe(false);
    expect(codeOf(() => navigateBack(abertura, done, { kind: 'back' }))).toBe('ATTEMPT_COMPLETED');
  });

  it('allowBack: false → BACK_NOT_ALLOWED', () => {
    const s = run(simulacao, [advance, choose('b')]);
    expect(canGoBack(s, { allowBack: true })).toBe(true);
    expect(backAvailability(s, { allowBack: false })).toMatchObject({ ok: false, code: 'BACK_NOT_ALLOWED' });
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'back' }, { allowBack: false }))).toBe('BACK_NOT_ALLOWED');
  });

  it('primeira cena → NO_PREVIOUS_SCENE; alvo fora do caminho ou trocado → INVALID_TARGET', () => {
    const s0 = createInitialState(simulacao, { now });
    expect(codeOf(() => navigateBack(simulacao, s0, { kind: 'back' }))).toBe('NO_PREVIOUS_SCENE');
    const s = run(simulacao, [advance, choose('b')]);
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'goto', pathIndex: 2 }))).toBe('INVALID_TARGET'); // a própria cena atual
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'goto', pathIndex: -1 }))).toBe('INVALID_TARGET');
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'goto', pathIndex: 1.5 }))).toBe('INVALID_TARGET');
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'goto', pathIndex: 0, nodeId: 's01_perfil_combina' }))).toBe('INVALID_TARGET');
  });
});

describe('começar numa cena (modo de teste da prévia)', () => {
  it('começa na cena pedida com as variáveis informadas e segue o motor normal', () => {
    const s = createStateAt(simulacao, 's03_pergunta_confusa', { variables: { pontos: 4 }, now });
    expect(s.currentNodeId).toBe('s03_pergunta_confusa');
    expect(s.variables.pontos).toBe(4);
    expect(s.path).toEqual([{ nodeId: 's03_pergunta_confusa', at: now.toISOString(), vars: { pontos: 4 } }]);
    expect(canGoBack(s)).toBe(false);
    const r = applyIntent(simulacao, s, choose('b'), now);
    expect(r.state.variables.pontos).toBe(6);
    // depois de avançar, dá para voltar à cena de partida
    expect(navigateBack(simulacao, r.state, { kind: 'back' }).state.variables.pontos).toBe(4);
  });

  it('variável de curso (`perfil`) informada escolhe o ramo', () => {
    const g = byId('aula_conte_sobre_voce');
    const start = g.nodes.find((n) => n.id === 'v03_apresentacao') ? 'v03_apresentacao' : g.startNodeId;
    const s = createStateAt(g, start, { variables: { perfil: 'experiencia' }, now });
    let cur = s;
    for (let i = 0; i < 4 && !cur.currentNodeId.startsWith('q03_'); i++) cur = applyIntent(g, cur, advance, now).state;
    expect(cur.currentNodeId).toBe('q03_experiencia');
    // sem informar: usa o valor inicial declarado
    expect(createStateAt(g, start, { now }).variables.perfil).toBe('primeiro_emprego');
  });

  it('valida cena e variáveis contra o grafo', () => {
    expect(codeOf(() => createStateAt(simulacao, 'nao_existe'))).toBe('NODE_NOT_FOUND');
    expect(codeOf(() => createStateAt(simulacao, 's01_perfil_combina', { variables: { perfil: 'x' } }))).toBe('INVALID_VARIABLE');
    expect(codeOf(() => createStateAt(simulacao, 's01_perfil_combina', { variables: { pontos: 'muitos' } }))).toBe('INVALID_VARIABLE');
    expect(codeOf(() => createStateAt(simulacao, 's01_perfil_combina', { variables: { pontos: Number.POSITIVE_INFINITY } }))).toBe('INVALID_VARIABLE');
    expect(validateVariableOverrides(simulacao, { pontos: 3 })).toEqual([]);
    expect(validateVariableOverrides(simulacao, { pontos: true })[0]).toMatch(/number/);
  });

  it('começar no encerramento já conta como concluída', () => {
    const s = createStateAt(simulacao, 'fim_e02', { now });
    expect(s.status).toBe('completed');
    expect(codeOf(() => navigateBack(simulacao, s, { kind: 'back' }))).toBe('ATTEMPT_COMPLETED');
  });
});
