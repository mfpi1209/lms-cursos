'use client';

import * as React from 'react';
import { api, ApiError } from '@/lib/api';
import { useDraft } from '@/components/studio/draft-provider';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required';

export interface MediaJob {
  id: string;
  lessonId: string;
  nodeId: string;
  status: JobStatus;
  simulated: boolean;
  outputAssetId: string | null;
  outputUrl: string | null;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
  input: { avatarId: string; voiceProvider: 'heygen' | 'elevenlabs'; voiceId: string | null; scriptChars: number };
}

export const ACTIVE_JOB: ReadonlySet<JobStatus> = new Set(['queued', 'running']);
const POLL_MS = 5000;

export function jobStatusLabel(job: MediaJob): string {
  switch (job.status) {
    case 'queued':
      return 'Na fila';
    case 'running':
      return 'Gerando';
    case 'succeeded':
      return job.simulated || !job.outputAssetId ? 'Simulado' : 'Pronto';
    case 'failed':
      return 'Falhou';
    case 'canceled':
      return 'Cancelado';
    case 'reconciliation_required':
      return 'Precisa de conferência';
  }
}

export function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;
}

/**
 * Jobs de mídia da aula inteira, com o mais recente por cena. Enquanto houver
 * job ativo, consulta a cada 5 s. Quando um job termina com vídeo e não há
 * alterações locais, recarrega o rascunho para trazer a mídia anexada pelo worker.
 */
export function useLessonMediaJobs(courseId: string, lessonId: string) {
  const { status: draftStatus, reload } = useDraft();
  const [latestByNode, setLatestByNode] = React.useState<Map<string, MediaJob>>(() => new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const prevRef = React.useRef<Map<string, JobStatus>>(new Map());
  const draftStatusRef = React.useRef(draftStatus);
  draftStatusRef.current = draftStatus;

  const refresh = React.useCallback(async () => {
    try {
      const r = await api<{ jobs: MediaJob[] }>(`/api/courses/${courseId}/media-jobs?lessonId=${encodeURIComponent(lessonId)}`);
      const sorted = [...r.jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const latest = new Map<string, MediaJob>();
      for (const j of sorted) if (!latest.has(j.nodeId)) latest.set(j.nodeId, j);
      setLatestByNode(latest);
      setError(null);
      let finishedWithVideo = false;
      let finishedSimulated = false;
      for (const j of sorted) {
        const prev = prevRef.current.get(j.id);
        if (prev && ACTIVE_JOB.has(prev) && j.status === 'succeeded') {
          // simulado COM saída (prévia substituta) também anexa mídia à cena
          if (!j.outputAssetId) finishedSimulated = true;
          else finishedWithVideo = true;
        }
      }
      prevRef.current = new Map(sorted.map((j) => [j.id, j.status]));
      if (finishedWithVideo) {
        if (draftStatusRef.current === 'saved') {
          try {
            await reload();
            setNotice('Vídeo pronto: a mídia foi anexada à cena.');
          } catch {
            setNotice('Vídeo pronto. Recarregue a página para ver a mídia anexada.');
          }
        } else {
          setNotice('Vídeo pronto. Assim que suas alterações forem salvas, a mídia aparece na cena.');
        }
      } else if (finishedSimulated) {
        setNotice('Geração simulada concluída: nenhum vídeo foi produzido (nenhum provedor configurado).');
      }
    } catch (e) {
      setError(errorText(e, 'Não foi possível consultar os vídeos em geração'));
    }
  }, [courseId, lessonId, reload]);

  React.useEffect(() => {
    prevRef.current = new Map();
    void refresh();
  }, [refresh]);

  const hasActive = React.useMemo(() => [...latestByNode.values()].some((j) => ACTIVE_JOB.has(j.status)), [latestByNode]);
  React.useEffect(() => {
    if (!hasActive) return;
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(t);
  }, [hasActive, refresh]);

  return { latestByNode, hasActive, error, notice, dismissNotice: () => setNotice(null), refresh };
}
