'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { CourseDocumentSchema, type CourseDocument } from '@lms/course-schema';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { deepEqual, narrowRebase } from './graph-ops';

export type DraftStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

export interface DraftContextValue {
  courseId: string;
  document: CourseDocument;
  revision: number;
  status: DraftStatus;
  lastSavedAt: string | null;
  errorMessage: string | null;
  /** revisão atual no servidor quando há conflito */
  conflictRevision: number | null;
  /**
   * Aplica uma alteração ao documento. `coalesce` agrupa alterações seguidas
   * da mesma origem (ex.: digitação num campo) numa única entrada de desfazer.
   */
  update(fn: (doc: CourseDocument) => CourseDocument, opts?: { coalesce?: string }): void;
  undo(): void;
  canUndo: boolean;
  /** Descarta alterações locais e busca o rascunho do servidor. */
  reload(): Promise<void>;
  /** Força a gravação imediata (ignora o debounce). */
  saveNow(): Promise<void>;
  restoreRevision(revision: number): Promise<void>;
}

const DraftContext = React.createContext<DraftContextValue | null>(null);

const AUTOSAVE_DELAY_MS = 1200;
const UNDO_LIMIT = 50;
const COALESCE_WINDOW_MS = 1500;

export const SAVE_STATUS_LABEL: Record<DraftStatus, string> = {
  saved: 'Salvo',
  dirty: 'Alterações não salvas',
  saving: 'Salvando…',
  conflict: 'Conflito de edição',
  error: 'Erro ao salvar',
};

interface State {
  document: CourseDocument;
  revision: number;
  status: DraftStatus;
  lastSavedAt: string | null;
  errorMessage: string | null;
  conflictRevision: number | null;
}

type DraftResponse = { document: CourseDocument; revision: number; updatedAt: string };

export function DraftProvider({
  courseId,
  initialDocument,
  initialRevision,
  initialUpdatedAt,
  children,
}: {
  courseId: string;
  initialDocument: CourseDocument;
  initialRevision: number;
  initialUpdatedAt: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<State>({
    document: initialDocument,
    revision: initialRevision,
    status: 'saved',
    lastSavedAt: initialUpdatedAt,
    errorMessage: null,
    conflictRevision: null,
  });
  const [undoCount, setUndoCount] = React.useState(0);

  // Refs: fonte síncrona da verdade para decisões fora do ciclo de render.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const docRef = React.useRef<CourseDocument>(initialDocument);
  /** último documento conhecido no servidor (base para rebase estreito e para "nada a salvar") */
  const baseDocRef = React.useRef<CourseDocument>(initialDocument);
  const undoRef = React.useRef<CourseDocument[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef(false);
  const lastCoalesceRef = React.useRef<{ key: string; at: number } | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const adopt = React.useCallback((res: DraftResponse) => {
    const doc = CourseDocumentSchema.parse(res.document);
    docRef.current = doc;
    baseDocRef.current = doc;
    undoRef.current = [];
    lastCoalesceRef.current = null;
    setUndoCount(0);
    setState({ document: doc, revision: res.revision, status: 'saved', lastSavedAt: res.updatedAt, errorMessage: null, conflictRevision: null });
  }, []);

  const saveRef = React.useRef<(opts?: { retried?: boolean }) => Promise<void>>(async () => undefined);

  const scheduleSave = React.useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY_MS);
  }, [clearTimer]);

  const save = React.useCallback(
    async (opts: { retried?: boolean } = {}) => {
      clearTimer();
      if (savingRef.current) return;
      if (stateRef.current.status === 'conflict') return;
      const sent = docRef.current;
      if (sent === baseDocRef.current) {
        setState((s) => (s.status === 'dirty' ? { ...s, status: 'saved' } : s));
        return;
      }
      const parsed = CourseDocumentSchema.safeParse(sent);
      if (!parsed.success) {
        setState((s) => ({ ...s, status: 'error', errorMessage: 'O documento ficou inválido; desfaça a última alteração.' }));
        return;
      }
      savingRef.current = true;
      const expectedRevision = stateRef.current.revision;
      setState((s) => ({ ...s, status: 'saving', errorMessage: null }));
      try {
        const res = await api<{ revision: number; updatedAt: string }>(`/api/courses/${courseId}/draft`, {
          method: 'PUT',
          json: { document: parsed.data, expectedRevision },
        });
        baseDocRef.current = sent;
        savingRef.current = false;
        const stillDirty = docRef.current !== sent;
        setState((s) => ({ ...s, revision: res.revision, lastSavedAt: res.updatedAt, status: stillDirty ? 'dirty' : 'saved', errorMessage: null }));
        if (stillDirty) scheduleSave();
      } catch (err) {
        savingRef.current = false;
        if (err instanceof ApiError && err.status === 409) {
          const details = (err.details ?? {}) as { currentRevision?: number };
          // Rebase estreito (uma vez): se o servidor só mudou `media` de nós
          // (worker de mídia / reaproveitamento), absorve e reenvia em silêncio.
          if (!opts.retried) {
            const rebased = await tryNarrowRebase();
            if (rebased === 'retry') {
              await saveRef.current({ retried: true });
              return;
            }
            if (rebased === 'adopted') return;
          }
          setState((s) => ({ ...s, status: 'conflict', conflictRevision: details.currentRevision ?? null, errorMessage: err.message }));
          return;
        }
        setState((s) => ({ ...s, status: 'error', errorMessage: err instanceof Error ? err.message : 'Erro ao salvar' }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, clearTimer, scheduleSave],
  );

  /**
   * Busca o rascunho do servidor e, se ele só difere da base em `media`,
   * mescla essas mídias no documento local (sem tocar edições locais).
   * 'retry' → há alterações locais a reenviar; 'adopted' → o local ficou igual
   * ao servidor; null → conflito real.
   */
  async function tryNarrowRebase(): Promise<'retry' | 'adopted' | null> {
    try {
      const res = await api<DraftResponse>(`/api/courses/${courseId}/draft`);
      const serverDoc = CourseDocumentSchema.parse(res.document);
      const merged = narrowRebase(docRef.current, baseDocRef.current, serverDoc);
      if (!merged) return null;
      baseDocRef.current = serverDoc;
      if (deepEqual(merged, serverDoc)) {
        docRef.current = serverDoc;
        baseDocRef.current = serverDoc;
        setState((s) => ({ ...s, document: serverDoc, revision: res.revision, lastSavedAt: res.updatedAt, status: 'saved', errorMessage: null, conflictRevision: null }));
        return 'adopted';
      }
      docRef.current = merged;
      setState((s) => ({ ...s, document: merged, revision: res.revision, status: 'dirty' }));
      return 'retry';
    } catch {
      return null;
    }
  }
  saveRef.current = save;

  const update = React.useCallback<DraftContextValue['update']>(
    (fn, opts) => {
      const prev = docRef.current;
      const next = fn(prev);
      if (next === prev) return;
      const now = Date.now();
      const key = opts?.coalesce;
      const coalesced = !!key && lastCoalesceRef.current?.key === key && now - lastCoalesceRef.current.at < COALESCE_WINDOW_MS;
      lastCoalesceRef.current = key ? { key, at: now } : null;
      if (!coalesced) {
        undoRef.current.push(prev);
        if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift();
        setUndoCount(undoRef.current.length);
      }
      docRef.current = next;
      setState((s) => ({ ...s, document: next, status: s.status === 'conflict' ? 'conflict' : 'dirty' }));
      if (stateRef.current.status !== 'conflict') scheduleSave();
    },
    [scheduleSave],
  );

  const undo = React.useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    lastCoalesceRef.current = null;
    setUndoCount(undoRef.current.length);
    docRef.current = prev;
    setState((s) => ({ ...s, document: prev, status: s.status === 'conflict' ? 'conflict' : prev === baseDocRef.current ? 'saved' : 'dirty' }));
    if (stateRef.current.status !== 'conflict') scheduleSave();
  }, [scheduleSave]);

  const reload = React.useCallback(async () => {
    clearTimer();
    adopt(await api<DraftResponse>(`/api/courses/${courseId}/draft`));
  }, [courseId, clearTimer, adopt]);

  const saveNow = React.useCallback(async () => save(), [save]);


  const restoreRevision = React.useCallback(
    async (revision: number) => {
      clearTimer();
      await api<{ revision: number }>(`/api/courses/${courseId}/revisions/${revision}/restore`, {
        json: { expectedRevision: stateRef.current.revision },
      });
      await reload();
    },
    [courseId, clearTimer, reload],
  );

  // Protege contra fechar/recarregar a aba com alterações pendentes.
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const st = stateRef.current.status;
      if (st === 'dirty' || st === 'saving' || st === 'conflict') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Ao trocar de página dentro do curso sem alterações pendentes, sincroniza
  // silenciosamente com o servidor (outra página pode ter gravado/restaurado).
  const pathname = usePathname();
  const firstPathRef = React.useRef(true);
  React.useEffect(() => {
    if (firstPathRef.current) {
      firstPathRef.current = false;
      return;
    }
    if (stateRef.current.status !== 'saved') return;
    api<DraftResponse>(`/api/courses/${courseId}/draft`)
      .then((res) => {
        if (stateRef.current.status === 'saved' && res.revision !== stateRef.current.revision) adopt(res);
      })
      .catch(() => undefined);
  }, [pathname, courseId, adopt]);

  React.useEffect(() => () => clearTimer(), [clearTimer]);

  const value = React.useMemo<DraftContextValue>(
    () => ({
      courseId,
      document: state.document,
      revision: state.revision,
      status: state.status,
      lastSavedAt: state.lastSavedAt,
      errorMessage: state.errorMessage,
      conflictRevision: state.conflictRevision,
      update,
      undo,
      canUndo: undoCount > 0,
      reload,
      saveNow,
      restoreRevision,
    }),
    [courseId, state, update, undo, undoCount, reload, saveNow, restoreRevision],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = React.useContext(DraftContext);
  if (!ctx) throw new Error('useDraft precisa estar dentro de <DraftProvider>');
  return ctx;
}

const STATUS_CLASS: Record<DraftStatus, { text: string; dot: string }> = {
  saved: { text: 'text-success', dot: 'bg-success' },
  dirty: { text: 'text-fg-muted', dot: 'bg-fg-faint' },
  saving: { text: 'text-fg-muted', dot: 'bg-accent pulse-dot' },
  conflict: { text: 'text-danger', dot: 'bg-danger' },
  error: { text: 'text-danger', dot: 'bg-danger' },
};

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Texto para copiar as alterações locais (em conflito): o documento inteiro, para nada se perder. */
function localChangesText(doc: CourseDocument, revision: number): string {
  return `# Alterações locais do curso "${doc.title}" (base: revisão ${revision}), copiadas em ${new Date().toLocaleString('pt-BR')}\n${JSON.stringify(doc, null, 2)}`;
}

/** Indicador de estado do rascunho ("Salvo às HH:MM") com ações de recuperação. */
export function SaveStatus({ className }: { className?: string }) {
  const { status, errorMessage, conflictRevision, reload, saveNow, document: doc, revision, lastSavedAt } = useDraft();
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<'ok' | 'fail' | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* o status reflete o erro */
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(localChangesText(doc, revision));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };
  const cls = STATUS_CLASS[status];
  const savedAt = status === 'saved' && lastSavedAt ? timeFmt.format(new Date(lastSavedAt)) : null;
  const pill = 'inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-medium disabled:opacity-50';
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
      <span data-testid="save-status" role="status" aria-live="polite" className={cn('inline-flex items-center gap-2 font-medium', cls.text)}>
        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', cls.dot)} />
        {savedAt ? `Salvo às ${savedAt}` : SAVE_STATUS_LABEL[status]}
      </span>
      {status === 'conflict' && (
        <>
          <span className="text-xs text-fg-muted" data-testid="conflict-text">
            {conflictRevision ? `Outra pessoa (ou outra aba) gravou a revisão ${conflictRevision}. ` : 'O rascunho mudou no servidor. '}
            Suas alterações ainda não foram salvas e não dá para juntar as duas versões: copie o que você mudou antes de recarregar, porque recarregar descarta as suas alterações.
          </span>
          <button type="button" onClick={() => void copy()} className={cn(pill, 'border-line-strong bg-surface text-fg hover:bg-surface-2')} data-testid="conflict-copy">
            {copied === 'ok' ? 'Copiado' : copied === 'fail' ? 'Não foi possível copiar' : 'Copiar minhas alterações'}
          </button>
          <button type="button" disabled={busy} onClick={() => void run(reload)} className={cn(pill, 'border-danger/30 bg-danger-soft text-danger hover:border-danger/60')} data-testid="conflict-discard">
            Descartar e recarregar
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          {errorMessage && <span className="text-xs text-fg-muted">{errorMessage}</span>}
          <button type="button" disabled={busy} onClick={() => void run(saveNow)} className={cn(pill, 'border-line-strong bg-surface text-fg hover:bg-surface-2')}>
            Tentar novamente
          </button>
        </>
      )}
    </div>
  );
}
