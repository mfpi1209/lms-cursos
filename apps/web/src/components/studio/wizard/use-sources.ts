'use client';

import * as React from 'react';
import { api } from '@/lib/api';
import { errorMessage } from './agent-api';

export type SourceKind = 'paste' | 'txt' | 'md' | 'pdf';
/** `processing`: PDF ainda sendo lido pelo worker. */
export type SourceStatus = 'processing' | 'ready' | 'needs_ocr' | 'failed';

export interface Source {
  id: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  chars: number;
  pages?: number | null;
  excerpt?: string | null;
  error?: string | null;
  originalName?: string | null;
  createdAt: string;
}

export interface SourcesValue {
  courseId: string;
  /** null enquanto carrega a primeira vez */
  sources: Source[] | null;
  error: string | null;
  processing: number;
  failed: number;
  ready: number;
  reload(): Promise<void>;
  /** adiciona (ou substitui) uma fonte na lista local */
  upsert(s: Source): void;
  remove(id: string): void;
}

/** Enquanto houver fonte em leitura, consulta a lista a cada 2,5 s. */
const PROCESSING_POLL_MS = 2500;

export function useSourcesPolling(courseId: string, enabled = true): SourcesValue {
  const [sources, setSources] = React.useState<Source[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const aliveRef = React.useRef(true);

  const reload = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api<{ sources: Source[] }>(`/api/courses/${courseId}/sources`);
      if (!aliveRef.current) return;
      setSources(r.sources);
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(errorMessage(e, 'Não foi possível listar as fontes'));
    }
  }, [courseId, enabled]);

  React.useEffect(() => {
    aliveRef.current = true;
    void reload();
    return () => {
      aliveRef.current = false;
    };
  }, [reload]);

  const processing = sources?.filter((s) => s.status === 'processing').length ?? 0;
  React.useEffect(() => {
    if (processing === 0) return;
    const t = setInterval(() => void reload(), PROCESSING_POLL_MS);
    return () => clearInterval(t);
  }, [processing, reload]);

  const upsert = React.useCallback((s: Source) => {
    setSources((cur) => {
      const list = cur ?? [];
      return list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list];
    });
  }, []);
  const remove = React.useCallback((id: string) => setSources((cur) => (cur ?? []).filter((x) => x.id !== id)), []);

  return React.useMemo<SourcesValue>(
    () => ({
      courseId,
      sources,
      error,
      processing,
      failed: sources?.filter((s) => s.status === 'failed').length ?? 0,
      ready: sources?.filter((s) => s.status === 'ready').length ?? 0,
      reload,
      upsert,
      remove,
    }),
    [courseId, sources, error, processing, reload, upsert, remove],
  );
}

const SourcesContext = React.createContext<SourcesValue | null>(null);

/** Uma única consulta das fontes para o assistente inteiro (trilha, próxima ação e passo "Material"). */
export function SourcesProvider({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const value = useSourcesPolling(courseId);
  return React.createElement(SourcesContext.Provider, { value }, children);
}

export function useSources(courseId: string): SourcesValue {
  const ctx = React.useContext(SourcesContext);
  const shared = !!ctx && ctx.courseId === courseId;
  // fora do provider (ex.: painel), consulta por conta própria
  const own = useSourcesPolling(courseId, !shared);
  return shared ? ctx : own;
}
