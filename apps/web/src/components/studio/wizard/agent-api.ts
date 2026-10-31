'use client';

import * as React from 'react';
import type { ExperienceFamily, LessonGraph } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { useDraft } from '@/components/studio/draft-provider';

/* ------------------------------------------------------------------ */
/* Tipos dos contratos de IA (ver docs do lead)                        */
/* ------------------------------------------------------------------ */

export interface AiCapabilities {
  configured: boolean;
  provider: 'anthropic' | 'openai' | 'fake';
  model: string;
  fallbackProvider?: string;
  note: string;
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export const RUN_ACTIVE = new Set<RunStatus>(['queued', 'running']);

/** Execução na fila há mais que isto sem o worker a reivindicar: "o worker não responde". */
export const QUEUED_STALL_SECONDS = 120;

export interface AgentRun {
  id: string;
  task: 'outline' | 'lesson' | string;
  lessonId?: string | null;
  status: RunStatus;
  provider: string;
  model: string;
  latencyMs?: number;
  usage?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  error?: string | null;
  proposalId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface OutlinePayload {
  objectives: { id: string; title: string; criterion: string; required: boolean }[];
  modules: {
    id: string;
    title: string;
    description: string;
    lessons: {
      id: string;
      title: string;
      description: string;
      family: ExperienceFamily;
      estimatedMinutes: number;
      objectiveIds: string[];
      rationale: string;
      keyScenes: string[];
    }[];
  }[];
  /** aulas da estrutura atual que a IA removeu de propósito */
  removedLessonIds?: string[];
}

export type OutlineLessonStatus = 'kept' | 'retitled' | 'new' | 'removed' | 'contentLost';

/** O que acontece com cada aula ao aplicar a estrutura (calculado pelo servidor contra o rascunho). */
export interface OutlineLessonPlan {
  lessonId: string;
  title: string;
  previousTitle?: string;
  status: OutlineLessonStatus;
  sceneCount: number;
  mediaCount: number;
  moduleId: string;
}

export interface OutlineSummary {
  objectives?: number;
  modules?: number;
  lessons?: number;
  plan?: OutlineLessonPlan[];
  lost?: number;
  lostScenes?: number;
  kept?: number;
  retitled?: number;
  added?: number;
  removed?: number;
  replacesProposalId?: string;
}

export interface LessonIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export interface LessonPayload {
  lessonId: string;
  graph: LessonGraph;
  /** ainda há erros de estrutura depois dos reparos: aplicar exige "aplicar mesmo assim" */
  hasErrors?: boolean;
  issues?: { errors: LessonIssue[]; warnings: LessonIssue[] };
}

export interface LessonSummary {
  scenes?: number;
  decisions?: number;
  assessments?: number;
  changed?: number;
  added?: number;
  removed?: number;
  unchanged?: number;
  errors?: number;
  warnings?: number;
  hasErrors?: boolean;
  /** cenas da aula atual que a proposta substitui (0 = aula vazia) */
  replacesScenes?: number;
  /** vídeos já anexados na aula atual que a proposta substitui */
  replacesMedia?: number;
  compiled?: { errors: number; warnings: number };
}

export type ProposalStatus = 'proposed' | 'applied' | 'rejected' | 'conflict';

export interface AgentProposal<P = OutlinePayload | LessonPayload, S = OutlineSummary & LessonSummary> {
  id: string;
  kind: 'outline' | 'lesson' | string;
  lessonId?: string | null;
  baseRevision: number;
  status: ProposalStatus;
  rationale: string;
  summary: S;
  payload: P;
  createdAt: string;
}

export const AI_NOT_CONFIGURED = 'Nenhum provedor de IA configurado — adicione ANTHROPIC_API_KEY ou OPENAI_API_KEY. Você pode seguir pelo caminho manual.';

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Consulta /api/ai/capabilities uma vez; `null` enquanto carrega. */
export function useAiCapabilities() {
  const [caps, setCaps] = React.useState<AiCapabilities | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    api<AiCapabilities>('/api/ai/capabilities')
      .then((c) => alive && setCaps(c))
      .catch((e) => alive && setError(errorMessage(e, 'Não foi possível consultar a IA')));
    return () => {
      alive = false;
    };
  }, []);
  return { caps, error, configured: !!caps?.configured, loading: caps === null && error === null };
}

/** Segundos desde um instante ISO, atualizado a cada segundo enquanto `active`. */
export function useElapsedSeconds(sinceIso: string | undefined | null, active: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!sinceIso) return 0;
  return Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 1000));
}

export function formatElapsed(s: number) {
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** true quando a execução está na fila há mais de QUEUED_STALL_SECONDS (o worker não a reivindicou). */
export function isStalled(run: Pick<AgentRun, 'status' | 'createdAt'> | null | undefined, elapsedSeconds: number): boolean {
  return !!run && run.status === 'queued' && elapsedSeconds >= QUEUED_STALL_SECONDS;
}

/** Cancela uma execução presa (fila ou em andamento). */
export async function cancelRun(runId: string): Promise<AgentRun> {
  return (await api<{ run: AgentRun }>(`/api/agent-runs/${runId}/cancel`, { method: 'POST' })).run;
}

/* ------------------------------------------------------------------ */
/* Aplicar propostas                                                   */
/* ------------------------------------------------------------------ */

export interface ApplyOptions {
  /** conflito de revisão: aplica mesmo com a aula/estrutura editada depois da proposta */
  force?: boolean;
  /** estrutura: confirma a perda das cenas das aulas removidas */
  confirmLoss?: boolean;
  /** aula: aplica mesmo com erros de estrutura */
  acceptErrors?: boolean;
}

/** Respostas 409 do servidor, já interpretadas. */
export type ApplyRefusal =
  | { kind: 'conflict'; message: string }
  | { kind: 'contentLoss'; message: string; lost: OutlineLessonPlan[]; lostScenes: number }
  | { kind: 'hasErrors'; message: string; errors: LessonIssue[] }
  | { kind: 'stale'; message: string };

export class ApplyConflict extends Error {
  constructor(public readonly refusal: ApplyRefusal) {
    super(refusal.message);
    this.name = 'ApplyConflict';
  }
}

/** Interpreta um 409 de /apply (ou /apply-batch): o que o servidor pede para confirmar. */
export function applyRefusalOf(e: unknown): ApplyRefusal | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = (e.details ?? {}) as { conflict?: boolean; contentLoss?: boolean; lost?: OutlineLessonPlan[]; lostScenes?: number; hasErrors?: boolean; errors?: LessonIssue[]; currentRevision?: number };
  if (d.contentLoss) return { kind: 'contentLoss', message: e.message, lost: d.lost ?? [], lostScenes: d.lostScenes ?? 0 };
  if (d.hasErrors) return { kind: 'hasErrors', message: e.message, errors: d.errors ?? [] };
  if (d.conflict) return { kind: 'conflict', message: e.message };
  return { kind: 'stale', message: 'O rascunho mudou enquanto você revisava. Recarregamos a versão atual; confira e aplique de novo.' };
}

/**
 * Aplica propostas com a revisão certa: grava o que estiver pendente, lê a
 * revisão atual e envia como `expectedRevision`. Em 409 recarrega o rascunho
 * (quando a revisão ficou velha) e lança `ApplyConflict` com o que o servidor
 * pede (confirmar perda, aceitar erros, forçar). Em sucesso recarrega para o
 * documento refletir o que o servidor gravou.
 */
export function useApplyProposals() {
  const { courseId, saveNow, reload } = useDraft();

  const withRevision = React.useCallback(
    async <T,>(fn: (expectedRevision: number) => Promise<T>): Promise<T> => {
      await saveNow();
      const { revision } = await api<{ revision: number }>(`/api/courses/${courseId}/draft`);
      try {
        const out = await fn(revision);
        await reload();
        return out;
      } catch (e) {
        const refusal = applyRefusalOf(e);
        if (refusal) {
          if (refusal.kind === 'stale') await reload();
          throw new ApplyConflict(refusal);
        }
        throw e;
      }
    },
    [courseId, saveNow, reload],
  );

  const applyOne = React.useCallback(
    (proposalId: string, opts: ApplyOptions = {}) =>
      withRevision((expectedRevision) => api<{ revision: number; plan?: OutlineLessonPlan[]; lost?: number; compiled?: { errors: number; warnings: number } }>(`/api/agent-proposals/${proposalId}/apply`, { json: { expectedRevision, ...opts } })),
    [withRevision],
  );

  const applyBatch = React.useCallback(
    (proposalIds: string[], opts: ApplyOptions = {}) =>
      withRevision((expectedRevision) => api<{ revision: number; applied: number }>(`/api/courses/${courseId}/agent/apply-batch`, { json: { proposalIds, expectedRevision, ...opts } })),
    [withRevision, courseId],
  );

  const reject = React.useCallback((proposalId: string) => api<{ ok: true }>(`/api/agent-proposals/${proposalId}/reject`, { method: 'POST' }), []);

  return { applyOne, applyBatch, reject, withRevision };
}
