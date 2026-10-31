'use client';

import { useMemo } from 'react';
import { resolveRecap, type AttemptState, type ResolvedRecapItem } from '@lms/course-engine';
import type { EndNode, LessonGraph } from '@lms/course-schema';

export const DEFAULT_RECAP_TITLE = 'Meu roteiro';

export interface RecapSelection {
  endNode: EndNode;
  title: string;
  closingLine?: string;
  items: ResolvedRecapItem[];
}

/**
 * Encerramento que define a página "Meu roteiro" para esta tentativa.
 * Com mais de um encerramento, prefere o que o aluno alcançou (nó atual);
 * senão, o primeiro que tenha recap. `null` quando a aula não tem recap.
 */
export function findRecapEndNode(graph: LessonGraph, state?: AttemptState | null): EndNode | null {
  const ends = graph.nodes.filter((n): n is EndNode => n.type === 'end' && !!n.recap && n.recap.length > 0);
  if (ends.length === 0) return null;
  const current = state ? ends.find((n) => n.id === state.currentNodeId) : undefined;
  return current ?? ends[0]!;
}

/**
 * Seletor puro: resolve o roteiro contra o estado ATUAL da tentativa. Funciona
 * no meio da aula (o que ainda não foi respondido sai com `value: null` e o
 * player mostra `emptyText`) e também no encerramento.
 */
export function selectRecap(graph: LessonGraph, state: AttemptState | null | undefined): RecapSelection | null {
  const endNode = findRecapEndNode(graph, state);
  if (!endNode) return null;
  const empty: AttemptState = state ?? {
    stateVersion: 1,
    status: 'in_progress',
    currentNodeId: graph.startNodeId,
    variables: {},
    path: [],
    answers: {},
    completedNodeIds: [],
    startedAt: '',
  };
  return {
    endNode,
    title: endNode.recapTitle?.trim() || DEFAULT_RECAP_TITLE,
    closingLine: endNode.closingLine?.trim() || undefined,
    items: resolveRecap(graph, endNode, empty),
  };
}

/** Versão com memo para componentes do player (gaveta, página final…). */
export function useRecap(graph: LessonGraph, state: AttemptState | null | undefined): RecapSelection | null {
  return useMemo(() => selectRecap(graph, state), [graph, state]);
}
