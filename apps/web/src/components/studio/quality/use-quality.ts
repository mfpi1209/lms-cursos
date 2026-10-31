'use client';

import * as React from 'react';
import { api, ApiError } from '@/lib/api';
import { errorText } from '@/components/studio/storyboard/use-media-jobs';
import { ACTIVE_RUN, type AgentRun } from '@/components/studio/storyboard/use-agent-runs';
import type { CourseQuality, LessonQuality } from './quality-model';

/*
 * Avaliação de qualidade: leitura dos scorecards e disparo da avaliação pela IA.
 *
 *   GET  /api/courses/[courseId]/quality                      → CourseQuality
 *   GET  /api/courses/[courseId]/quality/[lessonId]           → LessonQuality
 *   POST /api/courses/[courseId]/agent/lessons/[lessonId]/evaluate { includeVideo? } → { run }
 *   GET  /api/agent-runs/[id]                                 → { run } (consulta até terminar)
 *
 * Enquanto o servidor não tiver a rota (404), a interface mostra "ainda não
 * disponível" em vez de erro.
 */

const POLL_MS = 3000;
/** tarefas do agente que correspondem à avaliação (nome final definido no servidor) */
const EVALUATE_TASK = /evaluat|quality|avalia/i;

/** 404 da rota (ou página HTML de "não encontrado" que não é JSON): recurso ainda não existe no servidor. */
export function isUnavailable(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 404;
  return e instanceof SyntaxError;
}

function isConflict(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}

/** Normaliza a resposta do POST (pode vir só com id/status). */
function asRun(partial: Partial<AgentRun> & { id: string; status: AgentRun['status'] }, lessonId: string): AgentRun {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    task: partial.task ?? 'evaluate_lesson',
    lessonId: partial.lessonId ?? lessonId,
    status: partial.status,
    provider: partial.provider ?? '',
    model: partial.model ?? '',
    error: partial.error ?? null,
    proposalId: partial.proposalId ?? null,
    createdAt: partial.createdAt ?? now,
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
  };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t);
      resolve();
    });
  });
}

/** Consulta a execução até terminar (ou até o sinal abortar). Chama `onTick` a cada leitura. */
export async function waitForRun(runId: string, opts: { signal?: AbortSignal; onTick?: (run: AgentRun) => void } = {}): Promise<AgentRun | null> {
  for (;;) {
    if (opts.signal?.aborted) return null;
    const r = await api<{ run: AgentRun }>(`/api/agent-runs/${runId}`);
    opts.onTick?.(r.run);
    if (!ACTIVE_RUN.has(r.run.status)) return r.run;
    await sleep(POLL_MS, opts.signal);
  }
}

export async function startEvaluation(courseId: string, lessonId: string, includeVideo: boolean): Promise<AgentRun> {
  const r = await api<{ run: Partial<AgentRun> & { id: string; status: AgentRun['status'] } }>(`/api/courses/${courseId}/agent/lessons/${lessonId}/evaluate`, { json: { includeVideo } });
  return asRun(r.run, lessonId);
}

/* ------------------------------------------------------------------ */
/* Aula                                                                */
/* ------------------------------------------------------------------ */

export interface LessonQualityState {
  data: LessonQuality | null;
  loading: boolean;
  /** a rota ainda não existe no servidor */
  unavailable: boolean;
  error: string | null;
  /** execução da avaliação em andamento */
  run: AgentRun | null;
  failedRun: AgentRun | null;
  /** pedido sendo enviado */
  busy: boolean;
  /** incrementa a cada avaliação concluída nesta sessão (para levar o foco ao resultado) */
  completedCount: number;
  refresh(): Promise<void>;
  evaluate(includeVideo: boolean): Promise<void>;
  dismissFailed(): void;
  clearError(): void;
}

export function useLessonQuality(courseId: string, lessonId: string): LessonQualityState {
  const [data, setData] = React.useState<LessonQuality | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<AgentRun | null>(null);
  const [failedRun, setFailedRun] = React.useState<AgentRun | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [completedCount, setCompletedCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      const r = await api<LessonQuality>(`/api/courses/${courseId}/quality/${lessonId}`);
      setData({ scorecard: r.scorecard ?? null, stale: !!r.stale });
      setUnavailable(false);
    } catch (e) {
      if (isUnavailable(e)) setUnavailable(true);
      else setError(errorText(e, 'Não foi possível carregar a avaliação'));
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  // Carrega a avaliação e retoma uma execução em andamento (ex.: página recarregada no meio).
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setRun(null);
    void refresh();
    api<{ runs: AgentRun[] }>(`/api/courses/${courseId}/agent/runs`)
      .then((r) => {
        if (cancelled) return;
        const mine = r.runs.filter((x) => x.lessonId === lessonId && EVALUATE_TASK.test(x.task) && ACTIVE_RUN.has(x.status));
        if (mine[0]) setRun(mine[0]);
      })
      .catch(() => {
        /* sem histórico: segue sem retomar */
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId, refresh]);

  // Consulta a execução ativa até terminar; ao concluir, recarrega a avaliação.
  const runId = run && ACTIVE_RUN.has(run.status) ? run.id : null;
  React.useEffect(() => {
    if (!runId) return;
    const ctl = new AbortController();
    waitForRun(runId, { signal: ctl.signal, onTick: (r) => setRun(r) })
      .then(async (r) => {
        if (!r || ctl.signal.aborted) return;
        if (r.status === 'succeeded') {
          await refresh();
          setCompletedCount((n) => n + 1);
        } else if (r.status === 'failed') {
          setFailedRun(r);
        }
        setRun(null);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError(errorText(e, 'Não foi possível acompanhar a avaliação'));
        setRun(null);
      });
    return () => ctl.abort();
  }, [runId, refresh]);

  const evaluate = React.useCallback(
    async (includeVideo: boolean) => {
      setBusy(true);
      setError(null);
      setFailedRun(null);
      try {
        setRun(await startEvaluation(courseId, lessonId, includeVideo));
      } catch (e) {
        if (isUnavailable(e)) setUnavailable(true);
        else setError(isConflict(e) ? 'Já existe uma execução da IA em andamento para esta aula. Aguarde terminar.' : errorText(e, 'Não foi possível pedir a avaliação'));
      } finally {
        setBusy(false);
      }
    },
    [courseId, lessonId],
  );

  return {
    data,
    loading,
    unavailable,
    error,
    run,
    failedRun,
    busy,
    completedCount,
    refresh,
    evaluate,
    dismissFailed: () => setFailedRun(null),
    clearError: () => setError(null),
  };
}

/* ------------------------------------------------------------------ */
/* Curso                                                               */
/* ------------------------------------------------------------------ */

export interface EvaluateAllProgress {
  running: boolean;
  /** índice (1-based) da aula em avaliação */
  current: number;
  total: number;
  currentLessonId: string | null;
  done: string[];
  /** aulas puladas por já terem execução em andamento (409) */
  skipped: string[];
  failed: { lessonId: string; error: string }[];
}

export interface CourseQualityState {
  data: CourseQuality | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  refresh(): Promise<void>;
  /** avalia as aulas uma a uma (espera cada execução terminar antes da próxima) */
  evaluateAll(lessonIds: string[], includeVideo: boolean): Promise<void>;
  cancelAll(): void;
  progress: EvaluateAllProgress | null;
  clearError(): void;
}

export function useCourseQuality(courseId: string, opts: { enabled?: boolean } = {}): CourseQualityState {
  const enabled = opts.enabled ?? true;
  const [data, setData] = React.useState<CourseQuality | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [unavailable, setUnavailable] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<EvaluateAllProgress | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const r = await api<CourseQuality>(`/api/courses/${courseId}/quality`);
      setData({ lessons: r.lessons ?? [], course: r.course ?? { overall: null, dimensions: {} } });
      setUnavailable(false);
    } catch (e) {
      if (isUnavailable(e)) setUnavailable(true);
      else setError(errorText(e, 'Não foi possível carregar a avaliação do curso'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const evaluateAll = React.useCallback(
    async (lessonIds: string[], includeVideo: boolean) => {
      if (lessonIds.length === 0) return;
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setError(null);
      const p: EvaluateAllProgress = { running: true, current: 0, total: lessonIds.length, currentLessonId: null, done: [], skipped: [], failed: [] };
      setProgress({ ...p });
      for (const lessonId of lessonIds) {
        if (ctl.signal.aborted) break;
        p.current += 1;
        p.currentLessonId = lessonId;
        setProgress({ ...p });
        try {
          const run = await startEvaluation(courseId, lessonId, includeVideo);
          const final = await waitForRun(run.id, { signal: ctl.signal });
          if (!final) break;
          if (final.status === 'succeeded') p.done.push(lessonId);
          else p.failed.push({ lessonId, error: final.error ?? 'erro desconhecido' });
          await refresh();
        } catch (e) {
          if (isUnavailable(e)) {
            setUnavailable(true);
            break;
          }
          if (isConflict(e)) p.skipped.push(lessonId);
          else p.failed.push({ lessonId, error: errorText(e, 'falhou') });
        }
        setProgress({ ...p });
      }
      p.running = false;
      p.currentLessonId = null;
      setProgress({ ...p });
    },
    [courseId, refresh],
  );

  const cancelAll = React.useCallback(() => {
    abortRef.current?.abort();
    setProgress((prev) => (prev ? { ...prev, running: false, currentLessonId: null } : prev));
  }, []);

  return { data, loading, unavailable, error, refresh, evaluateAll, cancelAll, progress, clearError: () => setError(null) };
}
