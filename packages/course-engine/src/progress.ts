import { evaluateCondition, type Edge, type LessonGraph, type Objective } from '@lms/course-schema';
import type { AttemptState, Evidence } from './state';
import { selectEdge } from './engine';

export interface ProgressSummary {
  completedRequired: number;
  remainingRequired: number;
  /** 0..100 — denominador = concluídos + ainda alcançáveis no caminho atual */
  percent: number;
  status: AttemptState['status'];
}

/** Nós alcançáveis a partir de um nó (ignorando condições: tudo que ainda *pode* acontecer). */
export function reachableFrom(graph: LessonGraph, startId: string, state?: AttemptState): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of graph.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const stack: string[] = [];
  // Primeiro salto: a partir do nó atual, só os destinos que o estado atual permite
  // (decisão: uma saída por opção; demais nós: a aresta que o motor escolheria agora).
  if (state) {
    seen.add(startId);
    const node = graph.nodes.find((n) => n.id === startId);
    const ctx = { variables: state.variables, answers: Object.fromEntries(Object.entries(state.answers).map(([k, a]) => [k, { optionIds: a.optionIds, text: a.text, passed: a.passed }])) };
    if (node?.type === 'choice') {
      for (const o of node.options) {
        const e: Edge | undefined = selectEdge(graph, startId, ctx, o.id);
        if (e) stack.push(e.to);
      }
    } else if (node && node.type !== 'end') {
      const e = selectEdge(graph, startId, ctx);
      if (e) stack.push(e.to);
      else for (const t of out.get(startId) ?? []) stack.push(t);
    }
    void evaluateCondition;
  } else stack.push(startId);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of out.get(id) ?? []) stack.push(t);
  }
  return seen;
}

/**
 * Progresso por requisitos alcançáveis do caminho. Caminhos alternativos
 * mutuamente exclusivos não inflam o denominador: uma vez passada a
 * bifurcação, os nós do outro ramo deixam de ser alcançáveis.
 */
export function computeProgress(graph: LessonGraph, state: AttemptState): ProgressSummary {
  const required = new Set(graph.nodes.filter((n) => n.required).map((n) => n.id));
  const completed = state.completedNodeIds.filter((id) => required.has(id));
  if (state.status === 'completed') return { completedRequired: completed.length, remainingRequired: 0, percent: 100, status: state.status };
  const ahead = reachableFrom(graph, state.currentNodeId, state);
  const completedSet = new Set(completed);
  let remaining = 0;
  for (const id of ahead) if (required.has(id) && !completedSet.has(id)) remaining++;
  const total = completed.length + remaining;
  const percent = total === 0 ? 0 : Math.round((completed.length / total) * 100);
  return { completedRequired: completed.length, remainingRequired: remaining, percent, status: state.status };
}

export type ObjectiveStatus = 'not_reached' | 'attempted' | 'demonstrated' | 'not_demonstrated';

export interface ObjectiveResult {
  objectiveId: string;
  title: string;
  required: boolean;
  status: ObjectiveStatus;
  evidenceCount: number;
  assessmentsPassed: number;
  assessmentsFailed: number;
}

/**
 * Resultado por objetivo a partir das evidências. Distingue conclusão de
 * desempenho: "demonstrated" exige avaliação determinística aprovada;
 * escolhas e reflexões contam como "attempted".
 */
export function summarizeObjectives(objectives: Objective[], evidence: Evidence[]): ObjectiveResult[] {
  return objectives.map((o) => {
    const ev = evidence.filter((e) => e.objectiveId === o.id);
    const passed = ev.filter((e) => e.kind === 'assessment' && e.value.passed === true).length;
    const failed = ev.filter((e) => e.kind === 'assessment' && e.value.passed === false).length;
    let status: ObjectiveStatus = 'not_reached';
    if (passed > 0) status = 'demonstrated';
    else if (failed > 0) status = 'not_demonstrated';
    else if (ev.length > 0) status = 'attempted';
    return { objectiveId: o.id, title: o.title, required: o.required, status, evidenceCount: ev.length, assessmentsPassed: passed, assessmentsFailed: failed };
  });
}
