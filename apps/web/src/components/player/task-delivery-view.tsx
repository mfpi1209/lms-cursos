'use client';

import { useId, useRef } from 'react';
import { Check, CircleCheck, Clock3, ExternalLink, FileText, Undo2, X } from 'lucide-react';
import { TASK_LABELS, TASK_LINK_MAX, type TaskStatus } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { TASK_PRIVACY_HINT, TASK_STATUS_LABEL, acceptedFileNames, formatBytes, type TaskDraft, type TaskRecordView } from './task-delivery';

/*
 * Peças visuais da entrega de tarefa, iguais no player da plataforma, no player clássico e na página do curso.
 * As cores usam os tokens comuns (`fg`, `line`, `danger`) e o acento do player quando ele existe (`--im-*`), com o
 * acento do tema como reserva: funcionam nos dois temas e dentro da tela cheia.
 */

const ACCENT_INK = 'var(--im-accent-ink, var(--t-accent))';
const CARD = 'rounded-[16px] border border-line bg-[var(--im-card,var(--t-surface-2))] p-4 md:p-5';
const FIELD =
  'block min-h-14 w-full rounded-[14px] border border-line-strong bg-[var(--im-outline-bg,transparent)] px-4 text-[17px] text-fg outline-none placeholder:text-fg-muted focus-visible:border-transparent focus-visible:shadow-[0_0_0_3px_var(--im-accent-ink,var(--t-accent))] disabled:opacity-60 aria-[invalid=true]:border-danger';

/** "O que o avaliador confere": os critérios de sim ou não da tarefa, antes do envio. */
export function TaskCriteriaList({ criteria, auto, className }: { criteria: ReadonlyArray<{ id: string; label: string }>; /** correção automática: os critérios são só orientação */ auto?: boolean; className?: string }) {
  const headingId = useId();
  if (!criteria.length) return null;
  return (
    <section aria-labelledby={headingId} data-testid="task-criteria" className={cn(CARD, className)}>
      <h3 id={headingId} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/70">
        {auto ? 'O que conferir antes de enviar' : TASK_LABELS.criteria}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {criteria.map((c) => (
          <li key={c.id} className="flex items-start gap-3 text-[17px] leading-snug text-fg">
            <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line-strong" style={{ color: ACCENT_INK }}>
              <Check className="size-3.5" />
            </span>
            {c.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Campos do envio: o link (obrigatório) e, quando a tarefa aceita, o arquivo (opcional). */
export function TaskDeliveryFields({ draft, acceptedMime, disabled, preview }: { draft: TaskDraft; acceptedMime: readonly string[]; disabled?: boolean; /** prévia do estúdio: o arquivo não é enviado */ preview?: boolean }) {
  const linkId = useId();
  const linkHint = useId();
  const linkErr = useId();
  const fileId = useId();
  const fileTitle = useId();
  const fileHint = useId();
  const fileName = useId();
  const fileErr = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = !!disabled || draft.uploading;
  const chosenFile = draft.file && !draft.fileError ? draft.file : null;
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={linkId} className="block text-[16px] font-semibold text-fg">
          {TASK_LABELS.link}
        </label>
        <input
          id={linkId}
          data-testid="task-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={TASK_LINK_MAX}
          placeholder="https://"
          value={draft.link}
          disabled={busy}
          onChange={(e) => draft.setLink(e.target.value)}
          aria-invalid={draft.linkError ? true : undefined}
          aria-describedby={`${linkHint}${draft.linkError ? ` ${linkErr}` : ''}`}
          className={cn(FIELD, 'mt-2')}
        />
        <p id={linkHint} className="mt-2 text-[14px] leading-snug text-fg/75">
          Precisa começar com https://. Antes de enviar, confira se o link abre para quem não é você.
        </p>
        {draft.linkError && (
          <p id={linkErr} role="alert" data-testid="task-link-error" className="mt-2 text-[15px] font-medium text-danger">
            {draft.linkError}
          </p>
        )}
      </div>

      {acceptedMime.length > 0 && (
        <div>
          <span id={fileTitle} className="block text-[16px] font-semibold text-fg">
            {TASK_LABELS.file}
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {/* o campo nativo fica escondido, mas focável: Tab chega nele, Enter/Espaço abre o seletor e o rótulo acompanha o foco */}
            <input
              id={fileId}
              ref={fileInput}
              data-testid="task-file"
              type="file"
              accept={acceptedMime.join(',')}
              disabled={busy || preview}
              onChange={(e) => draft.chooseFile(e.target.files?.[0] ?? null)}
              aria-labelledby={fileTitle}
              aria-invalid={draft.fileError ? true : undefined}
              aria-describedby={`${fileHint} ${fileName}${draft.fileError ? ` ${fileErr}` : ''}`}
              className="peer sr-only"
            />
            <label
              htmlFor={fileId}
              aria-hidden="true"
              data-testid="task-file-picker"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-[14px] border border-line-strong bg-fg/10 px-4 text-[15px] font-semibold text-fg hover:bg-fg/15 peer-focus-visible:shadow-[0_0_0_3px_var(--im-accent-ink,var(--t-accent))] peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
            >
              Escolher arquivo
            </label>
            <span id={fileName} data-testid="task-file-name" className="min-w-0 break-all text-[15px] text-fg/85">
              {chosenFile ? `${chosenFile.name} (${formatBytes(chosenFile.size)})` : 'Nenhum arquivo escolhido'}
            </span>
            {chosenFile && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  draft.chooseFile(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-[15px] font-semibold underline underline-offset-4 hover:no-underline disabled:opacity-60"
              >
                <X aria-hidden="true" className="size-4" />
                Remover
              </button>
            )}
          </div>
          <p id={fileHint} className="mt-2 text-[14px] leading-snug text-fg/75">
            {preview ? 'Na prévia, o arquivo não é enviado.' : `${acceptedFileNames(acceptedMime)}, até 10 MB.`}
          </p>
          {draft.fileError && (
            <p id={fileErr} role="alert" data-testid="task-file-error" className="mt-2 text-[15px] font-medium text-danger">
              {draft.fileError}
            </p>
          )}
        </div>
      )}

      <p className="text-[14px] leading-snug text-fg/70">{TASK_PRIVACY_HINT}</p>
      <p aria-live="polite" className="sr-only">
        {draft.uploading ? 'Enviando o arquivo…' : ''}
      </p>
    </div>
  );
}

const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>> = { submitted: Clock3, approved: CircleCheck, returned: Undo2 };
const STATUS_TEXT: Record<TaskStatus, { title: string; body: string }> = {
  submitted: { title: TASK_LABELS.submitted, body: 'Um avaliador vai conferir sua entrega. Você pode seguir com o curso: a resposta aparece aqui e na página do curso.' },
  approved: { title: TASK_LABELS.approved, body: 'Sua entrega foi conferida e aprovada.' },
  returned: { title: TASK_LABELS.returned, body: 'O avaliador pediu um ajuste. Veja o comentário e envie de novo.' },
};

/**
 * A situação da entrega para o aluno: em correção, aprovada ou devolvida, com o que foi enviado, o comentário do
 * avaliador e os critérios conferidos. O link do próprio aluno abre em outra aba, sem repassar a origem.
 */
export function TaskStatusCard({ record, className, headingLevel = 3 }: { record: Pick<TaskRecordView, 'status' | 'link' | 'file' | 'comment' | 'criteria'>; className?: string; headingLevel?: 3 | 4 }) {
  const Icon = STATUS_ICON[record.status];
  const text = STATUS_TEXT[record.status];
  const H = `h${headingLevel}` as 'h3' | 'h4';
  const returned = record.status === 'returned';
  return (
    <div
      role="status"
      data-testid="task-status"
      data-status={record.status}
      className={cn('rounded-[16px] border px-5 py-4 text-fg', returned ? 'border-danger/50 bg-danger-soft' : 'border-[var(--im-accent-line,var(--t-line-strong))] bg-[color-mix(in_oklab,var(--im-accent,var(--t-accent))_10%,transparent)]', className)}
    >
      <H className="flex items-start gap-3 text-[20px] font-semibold leading-snug">
        <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
        <span>
          <span className="sr-only">Situação da entrega: {TASK_STATUS_LABEL[record.status]}. </span>
          {text.title}
        </span>
      </H>
      <p className="mt-2 pl-9 text-[16px] leading-snug text-fg/85">{text.body}</p>

      {record.comment && (
        <div data-testid="task-comment" className="mt-4 rounded-[12px] border border-line bg-[var(--im-card,var(--t-surface))] p-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg/70">Comentário do avaliador</p>
          <p className="mt-1.5 whitespace-pre-line break-words text-[17px] leading-relaxed text-fg">{record.comment}</p>
        </div>
      )}

      {record.criteria.length > 0 && (
        <ul data-testid="task-criteria-results" className="mt-4 space-y-2">
          {record.criteria.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 text-[16px] leading-snug text-fg">
              {c.met ? <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" style={{ color: ACCENT_INK }} /> : <X aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />}
              <span>
                <span className="sr-only">{c.met ? 'Atendido: ' : 'Não atendido: '}</span>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 space-y-1.5 text-[15px] text-fg/85">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <dt className="font-semibold text-fg">Link enviado:</dt>
          <dd className="min-w-0">
            <a href={record.link} target="_blank" rel="noopener noreferrer" data-testid="task-sent-link" className="inline-flex min-h-8 max-w-full items-center gap-1 break-all underline underline-offset-4 hover:no-underline">
              {record.link}
              <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          </dd>
        </div>
        {record.file && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="font-semibold text-fg">Arquivo enviado:</dt>
            <dd className="min-w-0">
              <a href={`/api/assets/${record.file.assetId}`} target="_blank" rel="noopener noreferrer" data-testid="task-sent-file" className="inline-flex min-h-8 max-w-full items-center gap-1 break-all underline underline-offset-4 hover:no-underline">
                <FileText aria-hidden="true" className="size-4 shrink-0" />
                {record.file.name ?? 'arquivo'} ({formatBytes(record.file.sizeBytes)})
              </a>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
