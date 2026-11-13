import Link from 'next/link';
import { Paperclip } from 'lucide-react';
import type { submissions } from '@lms/db';
import { Badge, Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';

export type SubmissionStatus = 'submitted' | 'approved' | 'returned';

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tab: string; tone: 'brand' | 'success' | 'neutral'; empty: string }> = {
  submitted: { label: 'Para corrigir', tab: 'Para corrigir', tone: 'brand', empty: 'Nenhuma entrega esperando correção.' },
  returned: { label: 'Devolvida', tab: 'Devolvidas', tone: 'neutral', empty: 'Nenhuma entrega devolvida esperando o reenvio do aluno.' },
  approved: { label: 'Aprovada', tab: 'Aprovadas', tone: 'success', empty: 'Nenhuma entrega aprovada ainda.' },
};

export function parseSubmissionStatus(v: string | string[] | undefined): SubmissionStatus {
  const s = Array.isArray(v) ? v[0] : v;
  return s === 'approved' || s === 'returned' ? s : 'submitted';
}

/** Abas por situação (links: funcionam sem JavaScript e mantêm o endereço compartilhável). */
export function SubmissionStatusTabs({ basePath, current, pending, extraQuery = '' }: { basePath: string; current: SubmissionStatus; pending: number; extraQuery?: string }) {
  const href = (s: SubmissionStatus) => {
    const q = [s === 'submitted' ? '' : `situacao=${s}`, extraQuery].filter(Boolean).join('&');
    return q ? `${basePath}?${q}` : basePath;
  };
  return (
    <nav aria-label="Situação das entregas" className="flex flex-wrap gap-2">
      {(['submitted', 'returned', 'approved'] as const).map((s) => (
        <Link
          key={s}
          href={href(s)}
          aria-current={s === current ? 'page' : undefined}
          data-testid={`submissions-tab-${s}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            s === current ? 'border-accent bg-accent-soft text-fg' : 'border-line-strong text-fg-muted hover:border-fg/40 hover:text-fg',
          )}
        >
          {SUBMISSION_STATUS[s].tab}
          {s === 'submitted' && pending > 0 && (
            <span className="rounded-full bg-accent-fill px-2 py-0.5 text-xs font-bold text-accent-fill-fg">
              {pending}
              <span className="sr-only"> {pending === 1 ? 'entrega' : 'entregas'}</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Lista de entregas (fila de correção). Em "Para corrigir", a mais antiga vem primeiro. */
export function SubmissionList({ items, status, showCourse }: { items: submissions.SubmissionListItem[]; status: SubmissionStatus; /** fila do workspace: mostra o curso de cada entrega */ showCourse?: boolean }) {
  if (items.length === 0) return <Card className="px-6 py-10 text-center text-fg-muted">{SUBMISSION_STATUS[status].empty}</Card>;
  return (
    <ul className="space-y-3" data-testid="submission-list">
      {items.map((it) => (
        <li key={it.id} data-testid={`submission-${it.id}`} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-base font-bold text-accent-strong" aria-hidden="true">
              {(it.studentName.trim()[0] ?? '?').toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">
                {it.studentName} <span className="font-normal text-fg-faint">· {it.studentEmail}</span>
              </p>
              <p className="text-sm text-fg-muted">
                {it.taskTitle}
                {showCourse && <> · {it.courseTitle}</>}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg-faint">
                <span>
                  {status === 'submitted' ? 'Enviada em' : status === 'approved' ? 'Aprovada em' : 'Devolvida em'} {formatDate(status === 'submitted' ? it.submittedAt : it.reviewedAt)}
                </span>
                {status !== 'submitted' && <span>· {it.reviewerName ? `por ${it.reviewerName}` : 'aprovação automática'}</span>}
                {it.hasFile && (
                  <span className="inline-flex items-center gap-1">
                    · <Paperclip className="size-3.5" aria-hidden="true" /> com arquivo
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={SUBMISSION_STATUS[status].tone}>{SUBMISSION_STATUS[status].label}</Badge>
            <Link href={`/estudio/entregas/${it.id}`} className={cn(buttonVariants({ variant: status === 'submitted' ? 'primary' : 'secondary', size: 'sm' }))} data-testid="submission-open">
              {status === 'submitted' ? 'Corrigir' : 'Ver'}
              <span className="sr-only"> a entrega de {it.studentName}</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
