'use client';

import * as React from 'react';
import { api, ApiError } from '@/lib/api';
import { useDraft } from '@/components/studio/draft-provider';
import type { MediaQueueItem, MediaQueueResponse, QueuePhase } from './queue-model';

export type { MediaQueueItem, MediaQueueResponse } from './queue-model';

/** Intervalo de consulta enquanto há vídeo na fila ou em produção. */
const BUSY_POLL_MS = 4000;
/** Intervalo quando nada está em andamento (ou a aba está oculta). */
const IDLE_POLL_MS = 30000;
/** Recarregar o rascunho no máximo uma vez a cada 5 s. */
const RELOAD_THROTTLE_MS = 5000;

export interface MediaQueueValue {
  courseId: string;
  data: MediaQueueResponse | null;
  /** primeira carga ainda não terminou */
  loading: boolean;
  error: string | null;
  itemByJobId: ReadonlyMap<string, MediaQueueItem>;
  /** Consulta agora (e reinicia o intervalo). */
  refresh(): Promise<void>;
  /** Cancela tudo o que ainda espera na fila; devolve quantos foram cancelados. Não mexe nos que já estão no HeyGen. */
  cancelWaiting(): Promise<number>;
  /** Cancela um vídeo que ainda está na fila. Lança erro legível se ele já foi enviado ao HeyGen. */
  cancelOne(jobId: string): Promise<void>;
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;
}

function isBusy(data: MediaQueueResponse | null): boolean {
  return !!data && data.summary.waiting + data.summary.active > 0;
}

/**
 * Consulta a fila de produção do curso: a cada 4 s enquanto houver vídeo na
 * fila ou em produção, a cada 30 s fora disso. Quando um vídeo fica pronto,
 * recarrega o rascunho (se não houver alterações locais) para a mídia anexada
 * pelo worker aparecer na cena.
 */
function useMediaQueuePolling(courseId: string, enabled: boolean): MediaQueueValue {
  const { status: draftStatus, reload } = useDraft();
  const [data, setData] = React.useState<MediaQueueResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = React.useRef(0);
  const aliveRef = React.useRef(true);
  const prevPhaseRef = React.useRef<Map<string, QueuePhase> | null>(null);
  const firstLoadAtRef = React.useRef<number>(0);

  // recarga do rascunho (com limite de frequência e espera por "salvo")
  const draftStatusRef = React.useRef(draftStatus);
  draftStatusRef.current = draftStatus;
  const reloadRef = React.useRef(reload);
  reloadRef.current = reload;
  const lastReloadRef = React.useRef(0);
  const pendingReloadRef = React.useRef(false);
  const reloadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestReload = React.useCallback(() => {
    pendingReloadRef.current = true;
    if (draftStatusRef.current !== 'saved') return; // tenta quando o rascunho estiver salvo
    if (reloadTimerRef.current) return; // já agendada
    const wait = Math.max(0, lastReloadRef.current + RELOAD_THROTTLE_MS - Date.now());
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      if (!aliveRef.current || !pendingReloadRef.current || draftStatusRef.current !== 'saved') return;
      pendingReloadRef.current = false;
      lastReloadRef.current = Date.now();
      void reloadRef.current().catch(() => undefined);
    }, wait);
  }, []);

  React.useEffect(() => {
    if (draftStatus === 'saved' && pendingReloadRef.current) requestReload();
  }, [draftStatus, requestReload]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const fetchRef = React.useRef<() => Promise<void>>(async () => undefined);

  const schedule = React.useCallback((next: MediaQueueResponse | null) => {
    clearTimer();
    if (!aliveRef.current) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const ms = isBusy(next) && !hidden ? BUSY_POLL_MS : IDLE_POLL_MS;
    timerRef.current = setTimeout(() => void fetchRef.current(), ms);
  }, []);

  const fetchOnce = React.useCallback(async () => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    try {
      const r = await api<MediaQueueResponse>(`/api/courses/${courseId}/media-queue`);
      if (!aliveRef.current || seq !== seqRef.current) return;
      // vídeos que acabaram de ficar prontos desde a última consulta
      const prev = prevPhaseRef.current;
      if (prev) {
        const becameDone = r.items.some((it) => {
          if (it.phase !== 'done' || (it.simulated && !it.outputUrl)) return false;
          const before = prev.get(it.jobId);
          if (before !== undefined) return before !== 'done';
          // job criado e concluído entre duas consultas
          return !!it.finishedAt && new Date(it.finishedAt).getTime() > firstLoadAtRef.current;
        });
        if (becameDone) requestReload();
      } else {
        firstLoadAtRef.current = Date.now();
      }
      prevPhaseRef.current = new Map(r.items.map((it) => [it.jobId, it.phase]));
      setData(r);
      setError(null);
      setLoading(false);
      schedule(r);
    } catch (e) {
      if (!aliveRef.current || seq !== seqRef.current) return;
      setError(messageOf(e, 'Não foi possível consultar a fila de vídeos'));
      setLoading(false);
      schedule(null);
    }
  }, [courseId, enabled, requestReload, schedule]);
  fetchRef.current = fetchOnce;

  React.useEffect(() => {
    aliveRef.current = true;
    prevPhaseRef.current = null;
    if (!enabled) return;
    void fetchOnce();
    // ao voltar para a aba, atualiza na hora
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      aliveRef.current = false;
      seqRef.current++;
      clearTimer();
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, fetchOnce]);

  const refresh = React.useCallback(async () => {
    clearTimer();
    await fetchRef.current();
  }, []);

  const cancelWaiting = React.useCallback(async () => {
    try {
      const r = await api<{ canceled: number }>(`/api/courses/${courseId}/media-queue/cancel-waiting`, { method: 'POST' });
      return r.canceled;
    } finally {
      await refresh();
    }
  }, [courseId, refresh]);

  const cancelOne = React.useCallback(
    async (jobId: string) => {
      try {
        await api<{ status: string }>(`/api/media-jobs/${jobId}/cancel`, { method: 'POST' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) throw new Error('Este vídeo já foi enviado ao HeyGen e não pode mais ser cancelado.');
        throw new Error(messageOf(e, 'Não foi possível cancelar'));
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const itemByJobId = React.useMemo(() => new Map((data?.items ?? []).map((it) => [it.jobId, it])), [data]);

  return React.useMemo(
    () => ({ courseId, data, loading, error, itemByJobId, refresh, cancelWaiting, cancelOne }),
    [courseId, data, loading, error, itemByJobId, refresh, cancelWaiting, cancelOne],
  );
}

const MediaQueueContext = React.createContext<MediaQueueValue | null>(null);

/**
 * Uma única consulta da fila para toda a área do curso (indicador, painel,
 * storyboard). Fica dentro do DraftProvider.
 */
export function MediaQueueProvider({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const value = useMediaQueuePolling(courseId, true);
  return React.createElement(MediaQueueContext.Provider, { value }, children);
}

/**
 * Fila de produção de vídeos do curso. Usa a consulta compartilhada do
 * MediaQueueProvider quando existe; fora dele, consulta por conta própria.
 */
export function useMediaQueue(courseId: string): MediaQueueValue {
  const ctx = React.useContext(MediaQueueContext);
  const shared = !!ctx && ctx.courseId === courseId;
  const own = useMediaQueuePolling(courseId, !shared);
  return shared ? ctx : own;
}

/** Fila compartilhada, se houver provider; nunca inicia consulta própria (para componentes repetidos, como cada cena). */
export function useSharedMediaQueue(): MediaQueueValue | null {
  return React.useContext(MediaQueueContext);
}
