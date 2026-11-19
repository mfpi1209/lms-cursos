'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import type { Intent } from '@lms/course-engine';
import { TASK_LABELS, taskAcceptedMime, taskInstructionOf, type TaskNode } from '@lms/course-schema';
import { Button } from '@/components/ui/button';
import { useTaskDraft, useTaskRecord } from './task-delivery';
import { TaskCriteriaList, TaskDeliveryFields, TaskStatusCard } from './task-delivery-view';

/** Matrícula do aluno no player clássico (ausente na prévia do estúdio: nada é gravado e o arquivo não é enviado). */
export const TaskEnrollmentContext = createContext<string | undefined>(undefined);

/**
 * Tarefa com entrega no visual clássico (prévia do estúdio e `?player=classic`): as mesmas regras do player da
 * plataforma. Depois do envio a aula segue; a situação da entrega aparece ao voltar à tarefa e na página do curso.
 */
export function TaskView({ node, pending, fieldError, onSend }: { node: TaskNode; pending: boolean; fieldError: string | null; onSend: (i: Intent) => void }) {
  const enrollmentId = useContext(TaskEnrollmentContext);
  const existing = useTaskRecord(enrollmentId, node.id);
  const acceptedMime = taskAcceptedMime(node);
  const draft = useTaskDraft({ acceptedMime, ...(enrollmentId ? { uploadUrl: `/api/enrollments/${enrollmentId}/tasks/${node.id}/file` } : {}) });
  const record = existing.record;
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || record?.status !== 'returned') return;
    prefilled.current = true;
    if (!draft.link) draft.setLink(record.link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);
  const instruction = taskInstructionOf(node);
  const busy = pending || draft.uploading;
  const error = fieldError ? (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {fieldError}
    </p>
  ) : null;

  if (existing.loading) {
    return (
      <p role="status" className="text-fg-muted" data-testid="task-panel" data-state="loading">
        Carregando sua entrega…
      </p>
    );
  }
  if (record && record.status !== 'returned') {
    return (
      <div className="space-y-5" data-testid="task-panel" data-state={record.status}>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">{TASK_LABELS.moment}</p>
        {instruction && <p className="whitespace-pre-line text-lg leading-relaxed text-fg">{instruction}</p>}
        <TaskStatusCard record={record} />
        {error}
        <Button type="button" size="lg" className="w-full rounded-full sm:w-auto" data-testid="task-keep" disabled={pending} onClick={() => onSend({ kind: 'submit', keep: true })}>
          Continuar
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      data-testid="task-panel"
      data-state={record ? 'returned' : 'open'}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        void draft.prepare().then((payload) => {
          if (payload) onSend({ kind: 'submit', link: payload.link, ...(payload.fileAssetId ? { fileAssetId: payload.fileAssetId } : {}) });
        });
      }}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">{TASK_LABELS.moment}</p>
      {instruction && (
        <p className="whitespace-pre-line text-lg leading-relaxed text-fg" data-testid="task-instruction">
          {instruction}
        </p>
      )}
      {record && <TaskStatusCard record={record} />}
      <TaskCriteriaList criteria={node.criteria} auto={node.review === 'auto'} />
      <TaskDeliveryFields draft={draft} acceptedMime={acceptedMime} disabled={pending} preview={!enrollmentId} />
      {error}
      <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="task-submit" disabled={busy} aria-busy={busy}>
        {draft.uploading ? 'Enviando o arquivo…' : pending ? 'Enviando…' : record ? 'Enviar de novo' : TASK_LABELS.submit}
      </Button>
      {!enrollmentId && <p className="text-sm text-fg-muted">Na prévia, nada é gravado nem enviado para correção.</p>}
    </form>
  );
}
