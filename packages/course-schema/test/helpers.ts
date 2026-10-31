import { richTextFromPlain as p } from '../src/richtext';
import type { LessonGraph } from '../src/graph';
import type { AnyNode } from '../src/nodes';

/** Grafo linear mínimo: content -> choice(2 opções) -> consequências -> end */
export function linearGraph(overrides: Partial<LessonGraph> = {}): LessonGraph {
  const nodes: AnyNode[] = [
    { id: 'intro', type: 'content', body: p('Intro'), objectiveIds: [], required: true },
    { id: 'q', type: 'choice', prompt: p('Escolha'), objectiveIds: ['o1'], required: true, options: [
      { id: 'a', label: 'A', feedback: p('fa') },
      { id: 'b', label: 'B', feedback: p('fb') },
    ] },
    { id: 'ca', type: 'consequence', body: p('ca'), tone: 'positive', objectiveIds: [], required: true },
    { id: 'cb', type: 'consequence', body: p('cb'), tone: 'negative', objectiveIds: [], required: true },
    { id: 'fim', type: 'end', summary: p('fim'), objectiveIds: [], required: true },
  ];
  return {
    schemaVersion: 1,
    startNodeId: 'intro',
    variables: [],
    nodes,
    edges: [
      { id: 'e1', from: 'intro', to: 'q' },
      { id: 'e2', from: 'q', to: 'ca', optionId: 'a' },
      { id: 'e3', from: 'q', to: 'cb', optionId: 'b' },
      { id: 'e4', from: 'ca', to: 'fim' },
      { id: 'e5', from: 'cb', to: 'fim' },
    ],
    layout: { positions: {} },
    ...overrides,
  };
}
