'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, Clock3, Pencil } from 'lucide-react';
import { MISSION_NOTE_MAX, MISSION_LABELS, type MissionStatus } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface MissionLoggerRecord {
  status: 'none' | MissionStatus;
  note: string | null;
  /** versão do registro salvo (concorrência otimista); ausente enquanto não há registro */
  revision?: number;
}

/**
 * Estado de uma missão "Leve para a vida real" FORA da aula ("Meu roteiro", "Missões para depois"): mostra o estado
 * (ainda não chegou / Vou fazer depois / Já experimentei) e deixa a pessoa voltar, marcar "Já experimentei" e escrever
 * "O que você percebeu?" (opcional, até 500 caracteres, editável).
 *
 * Gravação: PUT /api/enrollments/:id/missions/:nodeId. A confirmação ("Salvo.") só aparece DEPOIS de o servidor responder;
 * se falhar, o texto digitado fica no campo e o erro aparece junto do botão.
 */
export function MissionLogger({
  enrollmentId,
  nodeId,
  initial,
  className,
  onSaved,
}: {
  enrollmentId: string;
  nodeId: string;
  initial: MissionLoggerRecord;
  className?: string;
  onSaved?: (r: MissionLoggerRecord) => void;
}) {
  const [rec, setRec] = useState<MissionLoggerRecord>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const fieldId = useId();
  const hintId = useId();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // o registro mudou fora daqui (gaveta reaberta, outra aba): acompanha, sem apagar o que a pessoa está digitando
  useEffect(() => {
    setRec(initial);
    if (!editing) setDraft(initial.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.status, initial.note, initial.revision]);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  if (rec.status === 'none' || rec.revision === undefined) {
    return (
      <p data-testid={`mission-state-${nodeId}`} data-state="none" className={cn('text-sm text-fg-muted', className)}>
        Disponível quando você chegar a esta etapa na aula.
      </p>
    );
  }

  const len = draft.trim().length;
  const tooLong = len > MISSION_NOTE_MAX;

  async function save() {
    if (saving || tooLong) return;
    setSaving(true);
    setError(null);
    setConfirmed(false);
    try {
      const res = await api<{ mission: { status: MissionStatus; note: string | null; revision: number } }>(`/api/enrollments/${encodeURIComponent(enrollmentId)}/missions/${encodeURIComponent(nodeId)}`, {
        method: 'PUT',
        json: { status: 'done', note: draft.trim() || null, expectedRevision: rec.revision },
      });
      const next: MissionLoggerRecord = { status: res.mission.status, note: res.mission.note, revision: res.mission.revision };
      setRec(next);
      setDraft(next.note ?? '');
      setEditing(false);
      setConfirmed(true);
      onSaved?.(next);
    } catch (e) {
      // o texto continua no campo
      setError(e instanceof ApiError ? e.message : 'Não foi possível salvar. Verifique a conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const done = rec.status === 'done';
  return (
    <div data-testid={`mission-state-${nodeId}`} data-state={rec.status} className={cn('space-y-2.5', className)}>
      <p className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold', done ? 'bg-success/15 text-success' : 'bg-fg/8 text-fg')}>
        {done ? <CircleCheck className="size-4" aria-hidden="true" /> : <Clock3 className="size-4" aria-hidden="true" />}
        {done ? MISSION_LABELS.done : MISSION_LABELS.later}
      </p>

      {done && rec.note && !editing && (
        <p data-testid={`mission-note-${nodeId}`} className="whitespace-pre-wrap rounded-xl bg-fg/5 px-3 py-2 text-base leading-relaxed text-fg">
          <span className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">{MISSION_LABELS.note}</span>
          {rec.note}
        </p>
      )}

      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={fieldId} className="block text-sm font-semibold text-fg">
            {MISSION_LABELS.note} <span className="font-normal text-fg-muted">(opcional)</span>
          </label>
          <textarea
            id={fieldId}
            ref={taRef}
            data-testid={`mission-note-input-${nodeId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            disabled={saving}
            aria-describedby={hintId}
            aria-invalid={tooLong || !!error || undefined}
            placeholder="Como foi? O que deu certo, o que foi difícil…"
            className="block min-h-24 w-full resize-y rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-base leading-relaxed text-fg outline-none placeholder:text-fg-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <p id={hintId} className={cn('text-right text-xs tabular-nums', tooLong ? 'text-danger' : 'text-fg-muted')}>
            {len}/{MISSION_NOTE_MAX}
          </p>
          {error && (
            <p role="alert" data-testid={`mission-error-${nodeId}`} className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error} Seu texto continua aqui.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving || tooLong} aria-busy={saving} data-testid={`mission-save-${nodeId}`}>
              {saving ? 'Salvando…' : done ? 'Salvar' : 'Já experimentei'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setEditing(false); setDraft(rec.note ?? ''); setError(null); }}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={done ? 'secondary' : 'primary'} data-testid={`mission-open-${nodeId}`} onClick={() => { setEditing(true); setConfirmed(false); setError(null); }}>
            {done ? (
              <>
                <Pencil className="size-4" aria-hidden="true" />
                {rec.note ? 'Editar o que percebi' : 'Escrever o que percebi'}
              </>
            ) : (
              MISSION_LABELS.done
            )}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" data-testid={`mission-confirmed-${nodeId}`} className="min-h-5 text-sm font-medium text-success">
        {confirmed ? (done ? 'Salvo no seu Meu roteiro.' : 'Salvo.') : ''}
      </p>
    </div>
  );
}
