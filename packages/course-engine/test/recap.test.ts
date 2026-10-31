import { describe, expect, it } from 'vitest';
import { richTextFromPlain as p, type AnyNode, type EndNode, type LessonGraph } from '@lms/course-schema';
import { createInitialState, applyIntent, resolveRecap, recapToPlainText } from '../src';

const now = new Date('2026-01-01T00:00:00Z');

function graph(): LessonGraph {
  const nodes: AnyNode[] = [
    { id: 'q', type: 'choice', title: 'Primeira decisão', prompt: p('Escolha'), objectiveIds: [], required: true, options: [
      { id: 'a', label: 'Aviso cedo', feedback: p('fa') },
      { id: 'b', label: 'Espero', feedback: p('fb') },
    ] },
    { id: 'r', type: 'reflection', title: 'Sua frase', prompt: p('Escreva'), objectiveIds: [], required: true, minLength: 0, maxLength: 500 },
    { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true, recap: [
      { id: 'i1', label: 'O que eu decidi', kind: 'choice', nodeId: 'q', emptyText: 'Completar quando quiser' },
      { id: 'i2', label: 'Minha frase', kind: 'reflection', nodeId: 'r', emptyText: 'Escreva depois' },
      { id: 'i3', label: 'Para lembrar', kind: 'checklist', items: ['Respirar', ' Avisar cedo ', ''], emptyText: 'Completar quando quiser' },
      { id: 'i4', label: 'Dica', kind: 'text', text: 'Você não precisa decorar.', emptyText: 'Completar quando quiser' },
      { id: 'i5', label: 'De outra aula', kind: 'reflection', nodeId: 'outra_aula_r', emptyText: 'Completar quando quiser' },
      { id: 'i6', label: 'Decisão de outra aula', kind: 'choice', nodeId: 'outra_aula_q', emptyText: 'Completar quando quiser' },
    ] },
  ];
  return {
    schemaVersion: 1,
    startNodeId: 'q',
    variables: [],
    nodes,
    edges: [
      { id: 'e1', from: 'q', to: 'r', optionId: 'a' },
      { id: 'e2', from: 'q', to: 'r', optionId: 'b' },
      { id: 'e3', from: 'r', to: 'fim' },
    ],
    layout: { positions: {} },
  };
}

const endOf = (g: LessonGraph) => g.nodes.find((n) => n.type === 'end') as EndNode;

describe('resolveRecap', () => {
  it('sem respostas: fontes do aluno ficam vazias (null), itens fixos aparecem', () => {
    const g = graph();
    const items = resolveRecap(g, endOf(g), createInitialState(g, now));
    expect(items.map((i) => [i.id, i.value])).toEqual([
      ['i1', null],
      ['i2', null],
      ['i3', ['Respirar', 'Avisar cedo']],
      ['i4', 'Você não precisa decorar.'],
      ['i5', null],
      ['i6', null],
    ]);
    expect(items[0]?.source).toEqual({ nodeId: 'q', title: 'Primeira decisão' });
    expect(items[1]?.emptyText).toBe('Escreva depois');
    // fonte de outra aula sem lookup: sem título de origem
    expect(items[4]?.source).toBeUndefined();
  });

  it('usa o rótulo da opção escolhida e o texto da reflexão (trim)', () => {
    const g = graph();
    let s = createInitialState(g, now);
    s = applyIntent(g, s, { kind: 'choose', optionId: 'b' }, now).state;
    s = applyIntent(g, s, { kind: 'reflect', text: '  Eu avisaria cedo.  ' }, now).state;
    const items = resolveRecap(g, endOf(g), s);
    expect(items[0]?.value).toBe('Espero');
    expect(items[1]?.value).toBe('Eu avisaria cedo.');
  });

  it('fonte de outra aula: usa state.answers quando presente; decisão só com lookupNode', () => {
    const g = graph();
    const s = createInitialState(g, now);
    s.answers['outra_aula_r'] = { text: 'Resposta vinda de outra aula', answeredAt: now.toISOString() };
    s.answers['outra_aula_q'] = { optionIds: ['x'], answeredAt: now.toISOString() };
    const semLookup = resolveRecap(g, endOf(g), s);
    expect(semLookup[4]?.value).toBe('Resposta vinda de outra aula');
    expect(semLookup[5]?.value).toBeNull();
    const other: AnyNode = { id: 'outra_aula_q', type: 'choice', title: 'Decisão lá', prompt: p('?'), objectiveIds: [], required: true, options: [{ id: 'x', label: 'Opção X' }, { id: 'y', label: 'Opção Y' }] };
    const comLookup = resolveRecap(g, endOf(g), s, { lookupNode: (id) => (id === other.id ? other : undefined) });
    expect(comLookup[5]?.value).toBe('Opção X');
    expect(comLookup[5]?.source).toEqual({ nodeId: 'outra_aula_q', title: 'Decisão lá' });
  });

  it('item sem nodeId, checklist vazia e texto vazio resolvem para null', () => {
    const g = graph();
    const end: EndNode = { ...endOf(g), recap: [
      { id: 'a', label: 'A', kind: 'reflection', emptyText: 'vazio' },
      { id: 'b', label: 'B', kind: 'checklist', items: ['  '], emptyText: 'vazio' },
      { id: 'c', label: 'C', kind: 'text', text: '', emptyText: 'vazio' },
    ] };
    expect(resolveRecap(g, end, createInitialState(g, now)).map((i) => i.value)).toEqual([null, null, null]);
    expect(resolveRecap(g, { ...end, recap: undefined }, createInitialState(g, now))).toEqual([]);
  });

  it('recapToPlainText: texto simples com emptyText e checklist', () => {
    const txt = recapToPlainText('Meu roteiro', [
      { id: 'a', label: 'Frase', kind: 'reflection', value: 'Oi', emptyText: 'x' },
      { id: 'b', label: 'Vazio', kind: 'choice', value: null, emptyText: 'Completar quando quiser' },
      { id: 'c', label: 'Lista', kind: 'checklist', value: ['um', 'dois'], emptyText: 'x' },
    ], 'Fechamento.');
    expect(txt).toBe('Meu roteiro\n\nFrase\n  Oi\n\nVazio\n  Completar quando quiser\n\nLista\n  [ ] um\n  [ ] dois\n\nFechamento.\n');
  });
});

describe('resolveRecap com respostas do curso (opts.answers)', () => {
  it('resolve reflexão e decisão de outra aula usando o resumo de nós da API', () => {
    const g = graph();
    const s = createInitialState(g, now);
    // formato de GET /api/enrollments/[id]/answers
    const answers = {
      outra_aula_r: { lessonId: 'l2', kind: 'reflection' as const, text: '  Texto da aula 2 ', answeredAt: now.toISOString() },
      outra_aula_q: { lessonId: 'l3', kind: 'choice' as const, optionIds: ['y'], answeredAt: now.toISOString() },
    };
    const nodes: Record<string, { title: string; type: string; options?: { id: string; label: string }[] }> = {
      outra_aula_r: { title: 'Reflexão lá', type: 'reflection' },
      outra_aula_q: { title: 'Decisão lá', type: 'choice', options: [{ id: 'x', label: 'Opção X' }, { id: 'y', label: 'Opção Y' }] },
    };
    const items = resolveRecap(g, endOf(g), s, { answers, lookupNode: (id) => nodes[id] });
    expect(items[4]?.value).toBe('Texto da aula 2');
    expect(items[4]?.source).toEqual({ nodeId: 'outra_aula_r', title: 'Reflexão lá' });
    expect(items[5]?.value).toBe('Opção Y');
  });

  it('resposta da tentativa atual vence a do curso para o mesmo nó', () => {
    const g = graph();
    let s = createInitialState(g, now);
    s = applyIntent(g, s, { kind: 'choose', optionId: 'a' }, now).state;
    const items = resolveRecap(g, endOf(g), s, { answers: { q: { lessonId: 'l1', kind: 'choice', optionIds: ['b'], answeredAt: '2025-01-01T00:00:00Z' }, r: { lessonId: 'l1', kind: 'reflection', text: 'de antes', answeredAt: '2025-01-01T00:00:00Z' } } });
    expect(items[0]?.value).toBe('Aviso cedo');
    // a tentativa atual ainda não respondeu `r`: vale a resposta anterior
    expect(items[1]?.value).toBe('de antes');
  });
});
