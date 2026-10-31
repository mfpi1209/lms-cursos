import { describe, expect, it } from 'vitest';
import { allLessons, podeEntrarLight, PODE_ENTRAR_LIGHT_NOTE_ID, type EndNode, type LessonGraph } from '@lms/course-schema';
import { applyIntent, createInitialState, resolveRecap, type AttemptState, type Intent } from '../src';

const lessons = allLessons(podeEntrarLight);
const now = new Date('2026-01-01T00:00:00Z');

/** Todas as intenções possíveis no nó atual (reflexão: pular e escrever). */
function intentsAt(g: LessonGraph, state: AttemptState): Intent[] {
  const n = g.nodes.find((x) => x.id === state.currentNodeId)!;
  if (n.type === 'choice') return n.options.map((o) => ({ kind: 'choose', optionId: o.id }));
  if (n.type === 'reflection') return [{ kind: 'reflect', text: '' }, { kind: 'reflect', text: 'Hoje eu estudo e quero começar.' }];
  return [{ kind: 'advance' }];
}

/** Percorre TODOS os caminhos da aula; devolve os estados finais. */
function explore(g: LessonGraph): AttemptState[] {
  const done: AttemptState[] = [];
  const stack: Array<{ state: AttemptState; steps: number }> = [{ state: createInitialState(g, { now }), steps: 0 }];
  while (stack.length) {
    const { state, steps } = stack.pop()!;
    if (state.status === 'completed') {
      done.push(state);
      continue;
    }
    if (steps > 20) throw new Error(`caminho longo demais em ${g.startNodeId}`);
    for (const i of intentsAt(g, state)) stack.push({ state: applyIntent(g, state, i, now).state, steps: steps + 1 });
  }
  return done;
}

describe('Pode entrar Light — todos os caminhos terminam', () => {
  it('cada combinação de respostas, em cada aula, chega a um encerramento sem passar duas vezes pela mesma cena', () => {
    const counts = lessons.map((l) => {
      const finals = explore(l.graph);
      for (const f of finals) {
        const end = l.graph.nodes.find((n) => n.id === f.currentNodeId)!;
        expect(end.type).toBe('end');
        const visited = f.path.map((p) => p.nodeId);
        expect(new Set(visited).size).toBe(visited.length);
      }
      return finals.length;
    });
    // 3×3 = 9 (aula 1), 3×3×3 = 27 (aula 2), 3⁴ × 2 (pular/escrever) = 162 (aula 3)
    expect(counts).toEqual([9, 27, 162]);
  });

  it('simulação: 6 a 8 pontos → "muito bem"; abaixo disso → "quase lá"; a anotação pode ser pulada', () => {
    const g = lessons[2]!.graph;
    const run = (opts: string[], note = '') => {
      let st = createInitialState(g, { now });
      for (const o of opts) st = applyIntent(g, st, { kind: 'choose', optionId: o }, now).state;
      expect(st.currentNodeId).toBe(PODE_ENTRAR_LIGHT_NOTE_ID);
      return applyIntent(g, st, { kind: 'reflect', text: note }, now).state;
    };
    const best = run(['a', 'a', 'b', 'a']);
    expect(best.variables.pontos).toBe(8);
    expect(best.currentNodeId).toBe('l3_fim_bom');
    expect(run(['a', 'a', 'b', 'b']).currentNodeId).toBe('l3_fim_bom'); // 6
    expect(run(['a', 'b', 'c', 'c']).currentNodeId).toBe('l3_fim_quase'); // 5
    const low = run(['c', 'c', 'a', 'b']);
    expect(low.variables.pontos).toBe(0);
    expect(low.currentNodeId).toBe('l3_fim_quase');
    expect(low.answers[PODE_ENTRAR_LIGHT_NOTE_ID]?.text).toBe('');
  });

  it('o roteiro mostra as escolhas das aulas 2 e 3 e o texto de vazio quando a anotação é pulada', () => {
    const g2 = lessons[1]!.graph;
    let s2 = createInitialState(g2, { now });
    for (const o of ['b', 'b', 'b']) s2 = applyIntent(g2, s2, { kind: 'choose', optionId: o }, now).state;
    const g3 = lessons[2]!.graph;
    let s3 = createInitialState(g3, { now });
    for (const o of ['a', 'a', 'b', 'a']) s3 = applyIntent(g3, s3, { kind: 'choose', optionId: o }, now).state;
    s3 = applyIntent(g3, s3, { kind: 'reflect', text: '' }, now).state;
    const end = g3.nodes.find((n) => n.id === s3.currentNodeId) as EndNode;
    const all = new Map(lessons.flatMap((l) => l.graph.nodes).map((n) => [n.id, n]));
    const answers = Object.fromEntries(Object.entries(s2.answers).map(([id, a]) => [id, { lessonId: lessons[1]!.id, kind: 'choice' as const, optionIds: a.optionIds, answeredAt: a.answeredAt }]));
    const items = resolveRecap(g3, end, s3, { answers, lookupNode: (id) => all.get(id) });
    const by = Object.fromEntries(items.map((i) => [i.label, i.value]));
    expect(by['Minha apresentação']).toBe('“Estudo administração, organizei prazos na turma e quero começar no atendimento.”');
    expect(by['Minha pergunta para a empresa']).toBe('“Como é a rotina da equipe no dia a dia?”');
    expect(by['Dia da entrevista']).toHaveLength(5);
    const nota = items.find((i) => i.label === 'Minha anotação')!;
    expect(nota.value).toBeNull();
    expect(nota.emptyText).toBe('Se quiser, escreva depois');
  });
});
