'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDraft } from '@/components/studio/draft-provider';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface RevisionRow {
  id: string;
  revision: number;
  origin: string;
  note: string | null;
  authorName: string;
  createdAt: string;
}

const ORIGIN_LABEL: Record<string, string> = { create: 'criação', manual: 'edição', restore: 'restauração', publish: 'publicação', assistant: 'assistente', agent: 'proposta da IA', media: 'vídeo', author: 'edição' };

export function RevisionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { courseId, revision, status, restoreRevision } = useDraft();
  const [rows, setRows] = React.useState<RevisionRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    api<{ revisions: RevisionRow[] }>(`/api/courses/${courseId}/revisions`)
      .then((r) => setRows(r.revisions))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erro ao carregar revisões'));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, courseId, onClose, revision]);

  if (!open) return null;

  const restore = async (n: number) => {
    const pending = status === 'dirty' || status === 'saving' ? ' Suas alterações não gravadas serão perdidas.' : '';
    if (!window.confirm(`Restaurar a revisão ${n} como nova revisão do rascunho?${pending}`)) return;
    setBusy(n);
    setError(null);
    try {
      await restoreRevision(n);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao restaurar');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-bg/75 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="revisions-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface shadow-2xl"
        data-testid="revisions-drawer"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="revisions-title" className="display text-lg">Revisões do rascunho</h2>
          <Button ref={closeRef} variant="ghost" size="sm" aria-label="Fechar" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3">
          <p className="mb-3 text-xs text-fg-muted">Restaurar cria uma nova revisão com o conteúdo antigo; o histórico nunca é reescrito.</p>
          {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
          {!rows && !error && <p className="text-sm text-fg-muted">Carregando…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-fg-muted">Nenhuma revisão.</p>}
          <ul className="space-y-2">
            {rows?.map((r) => (
              <li key={r.id} className="panel p-3" data-testid={`revision-${r.revision}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-medium text-fg">
                      Revisão {r.revision} {r.revision === revision && <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">atual</span>}
                    </p>
                    <p className="text-fg-muted">
                      {ORIGIN_LABEL[r.origin] ?? r.origin} · {r.authorName} · {formatDate(r.createdAt)}
                    </p>
                    {r.note && <p className="text-fg-muted">{r.note}</p>}
                  </div>
                  <Button variant="secondary" size="sm" disabled={r.revision === revision || busy !== null} onClick={() => void restore(r.revision)}>
                    {busy === r.revision ? 'Restaurando…' : 'Restaurar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
