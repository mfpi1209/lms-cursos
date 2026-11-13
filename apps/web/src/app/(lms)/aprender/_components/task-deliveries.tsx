'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { TASK_STATUS_LABEL, useTaskDraft, type TaskRecordView } from '@/components/player/task-delivery';
import { TaskCriteriaList, TaskDeliveryFields, TaskStatusCard } from '@/components/player/task-delivery-view';

export interface TaskDeliveryItem {
  nodeId: string;
  lessonId: string;
  lessonTitle: string;
  /** posição da aula no curso (base 0) */
  lessonIndex: number;
  title: string;
  instruction: string;
  acceptedMime: string[];
  criteria: Array<{ id: string; label: string }>;
  required: boolean;
  review: 'manual' | 'auto';
  record: TaskRecordView | null;
}

/**
 * "Suas entregas": as tarefas com entrega do curso e a situação de cada uma (em correção, aprovada, devolvida).
 * A primeira entrega é feita na aula. Quando o avaliador devolve, o comentário aparece aqui e o aluno reenvia sem
 * reabrir a aula. Não é pendência do curso: ele conclui do mesmo jeito; a entrega aprovada conta para o certificado.
 */
export function TaskDeliveries({ enrollmentId, items }: { enrollmentId: string; items: TaskDeliveryItem[] }) {
  const [records, setRecords] = useState<Record<string, TaskRecordView | null>>(() => Object.fromEntries(items.map((i) => [i.nodeId, i.record])));
  if (items.length === 0) return null;
  const returned = items.filter((i) => records[i.nodeId]?.status === 'returned').length;
  const waiting = items.filter((i) => records[i.nodeId]?.status === 'submitted').length;
  const summary =
    returned > 0
      ? `${returned} ${returned === 1 ? 'entrega foi devolvida' : 'entregas foram devolvidas'} para ajuste. Veja o comentário e envie de novo.`
      : waiting > 0
        ? `${waiting} ${waiting === 1 ? 'entrega está' : 'entregas estão'} em correção. A resposta do avaliador aparece aqui.`
        : 'As entregas deste curso e a resposta do avaliador ficam aqui.';
  return (
    <section aria-labelledby="deliveries-heading" data-testid="task-deliveries" className="space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Send className="size-5" />
        </span>
        <div>
          <h2 id="deliveries-heading" className="text-[28px] leading-tight text-fg">
            Suas entregas
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-fg-muted" data-testid="task-deliveries-summary">
            {summary}
          </p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.nodeId} data-testid={`task-delivery-${item.nodeId}`} className="panel space-y-3 p-4 sm:p-5">
            <DeliveryCard enrollmentId={enrollmentId} item={item} record={records[item.nodeId] ?? null} onSaved={(r) => setRecords((prev) => ({ ...prev, [item.nodeId]: r }))} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeliveryCard({ enrollmentId, item, record, onSaved }: { enrollmentId: string; item: TaskDeliveryItem; record: TaskRecordView | null; onSaved: (r: TaskRecordView) => void }) {
  const lessonHref = `/aprender/${enrollmentId}/aulas/${item.lessonId}`;
  return (
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Aula {item.lessonIndex + 1} · {item.lessonTitle}
          {!item.required && ' · opcional'}
        </p>
        <h3 className="mt-1 text-lg font-semibold leading-snug text-fg">{item.title}</h3>
        {record && <p className="sr-only">Situação: {TASK_STATUS_LABEL[record.status]}</p>}
      </div>
      {!record && (
        <div data-testid="task-delivery-missing" className="space-y-2">
          <p className="text-base leading-relaxed text-fg/85">{item.instruction}</p>
          <p className="text-sm text-fg-muted">Você ainda não enviou esta entrega. O envio é feito na aula.</p>
          <Link href={lessonHref} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4 hover:no-underline">
            Ir para a aula
          </Link>
        </div>
      )}
      {record && <TaskStatusCard record={record} headingLevel={4} />}
      {record?.status === 'returned' && <ResubmitForm enrollmentId={enrollmentId} item={item} record={record} onSaved={onSaved} />}
    </>
  );
}

/** Reenvio de uma entrega devolvida, sem reabrir a aula. A confirmação só aparece depois de o servidor gravar. */
function ResubmitForm({ enrollmentId, item, record, onSaved }: { enrollmentId: string; item: TaskDeliveryItem; record: TaskRecordView; onSaved: (r: TaskRecordView) => void }) {
  const draft = useTaskDraft({ acceptedMime: item.acceptedMime, initialLink: record.link, uploadUrl: `/api/enrollments/${enrollmentId}/tasks/${item.nodeId}/file` });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || draft.uploading;
  return (
    <form
      data-testid="task-resubmit"
      className="space-y-4 border-t border-line pt-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        void (async () => {
          setError(null);
          const payload = await draft.prepare();
          if (!payload) return;
          setPending(true);
          try {
            const res = await api<{ task: TaskRecordView }>(`/api/enrollments/${enrollmentId}/tasks/${item.nodeId}`, { method: 'PUT', json: payload });
            onSaved(res.task);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Confira a conexão e tente de novo.');
          } finally {
            setPending(false);
          }
        })();
      }}
    >
      <TaskCriteriaList criteria={item.criteria} auto={item.review === 'auto'} />
      <TaskDeliveryFields draft={draft} acceptedMime={item.acceptedMime} disabled={pending} />
      {error && (
        <p role="alert" data-testid="task-resubmit-error" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full rounded-full sm:w-auto" data-testid="task-resubmit-send" disabled={busy} aria-busy={busy}>
        {draft.uploading ? 'Enviando o arquivo…' : pending ? 'Enviando…' : 'Enviar de novo'}
      </Button>
    </form>
  );
}
