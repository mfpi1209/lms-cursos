'use client';

import type { AssessmentOutcome, AttemptState, ProgressSummary } from '@lms/course-engine';
import type { LessonGraph, RichTextDocument, Scalar } from '@lms/course-schema';
import { api } from '@/lib/api';
import type { PlayerDriver, PlayerStart, PlayerStepResult } from './types';

interface PreviewStartResponse {
  state: AttemptState;
  progress: ProgressSummary;
  transitioned: boolean;
  toNodeId: string;
}

interface PreviewStepResponse {
  state: AttemptState;
  feedback?: RichTextDocument;
  assessment?: AssessmentOutcome;
  transitioned: boolean;
  fromNodeId: string;
  toNodeId: string;
  progress: ProgressSummary;
}

export interface PreviewStartAt {
  nodeId: string;
  variables?: Record<string, Scalar>;
}

export interface PreviewDriverOptions {
  /** modo de teste: começa nesta cena com estas variáveis */
  startAt?: PreviewStartAt;
  /** `allowBack` da aula */
  allowBack?: boolean;
}

/** Driver da prévia com leitura do estado atual (barra "Modo de teste"). */
export interface PreviewDriver extends PlayerDriver {
  getState(): AttemptState | null;
  /** avisa a cada novo estado (início, passo, volta); devolve o cancelamento */
  subscribe(listener: (state: AttemptState) => void): () => void;
}

/**
 * Driver da prévia do estúdio: mesmo motor, sem persistência. O estado fica
 * em memória e vai e volta com cada chamada a /api/preview/step. A revisão é
 * local e só serve para o player manter o mesmo contrato do LMS.
 */
export function createPreviewDriver(graph: LessonGraph, opts: PreviewDriverOptions = {}): PreviewDriver {
  let state: AttemptState | null = null;
  let revision = 1;
  const listeners = new Set<(s: AttemptState) => void>();
  const emit = (s: AttemptState) => {
    for (const l of listeners) l(s);
  };

  async function begin(): Promise<PlayerStart> {
    const res = await api<PreviewStartResponse>('/api/preview/step', { json: opts.startAt ? { graph, startAt: opts.startAt } : { graph } });
    state = res.state;
    revision = 1;
    emit(res.state);
    return { state: res.state, revision, progress: res.progress, attemptNumber: 1 };
  }

  function toResult(res: PreviewStepResponse): PlayerStepResult {
    state = res.state;
    revision += 1;
    emit(res.state);
    return {
      state: res.state,
      revision,
      feedback: res.feedback,
      assessment: res.assessment,
      transitioned: res.transitioned,
      fromNodeId: res.fromNodeId,
      toNodeId: res.toNodeId,
      progress: res.progress,
      lessonCompleted: res.state.status === 'completed',
      courseCompleted: false,
    };
  }

  return {
    mode: 'preview',
    start: begin,
    restart: begin,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async step(input): Promise<PlayerStepResult> {
      if (!state) throw new Error('A prévia ainda não foi iniciada');
      return toResult(await api<PreviewStepResponse>('/api/preview/step', { json: { graph, state, intent: input.intent } }));
    },
    async navigate(input): Promise<PlayerStepResult> {
      if (!state) throw new Error('A prévia ainda não foi iniciada');
      return toResult(await api<PreviewStepResponse>('/api/preview/step', { json: { graph, state, navigate: input.target, allowBack: opts.allowBack } }));
    },
  };
}
