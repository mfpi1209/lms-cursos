'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { TASK_COMMENT_MAX } from '@lms/course-schema';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Answer = boolean | null;

/**
 * Correção de uma entrega: o avaliador marca sim ou não em cada critério e aprova (todos atendidos) ou devolve com um
 * comentário. As regras valem no servidor (`submissions.reviewSubmission`); aqui os botões só refletem o que ele aceita.
 * `revision` é a versão que o avaliador está vendo: se o aluno reenviou ou outra pessoa corrigiu, o servidor recusa.
 */
export function ReviewForm({ submissionId, revision, criteria, backHref }: { submissionId: string; revision: number; criteria: Array<{ id: string; label: string }>; backHref: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(criteria.map((c) => [c.id, null])));
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<'approve' | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approve' | 'return' | null>(null);
  const commentId = useId();
  const hintId = useId();
  const errorId = useId();

  const allAnswered = criteria.every((c) => answers[c.id] !== null);
  const allMet = criteria.every((c) => answers[c.id] === true);
  const text = comment.trim();
  const tooLong = text.length > TASK_COMMENT_MAX;
  const canApprove = allAnswered && allMet && !tooLong;
  const canReturn = allAnswered && text.length >= 3 && !tooLong;
  const why = !allAnswered
    ? 'Marque sim ou não em cada critério.'
    : allMet
      ? 'Todos os critérios atendidos: você pode aprovar. Para devolver mesmo assim, escreva o que ajustar.'
      : text.length < 3
        ? 'Há critério não atendido: escreva um comentário dizendo o que ajustar e devolva.'
        : 'Há critério não atendido: a entrega só pode ser devolvida.';

  async function decide(decision: 'approve' | 'return') {
    if (pending) return;
    setPending(decision);
    setError(null);
    try {
      await api(`/api/submissions/${submissionId}/review`, {
        json: { decision, criteria: criteria.map((c) => ({ id: c.id, met: answers[c.id] === true })), comment: text || null, expectedRevision: revision },
      });
      setDone(decision);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível gravar a correção. Confira a conexão e tente de novo.');
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return (
      <Card role="status" data-testid="review-done" className="space-y-3">
        <p className="text-lg font-semibold text-fg">{done === 'approve' ? 'Entrega aprovada.' : 'Entrega devolvida com o seu comentário.'}</p>
        <p className="text-fg-muted">{done === 'approve' ? 'O aluno já vê a aprovação na aula e na página do curso.' : 'O aluno vê o comentário e pode reenviar. A entrega volta para a fila quando ele reenviar.'}</p>
        <a href={backHref} className="inline-flex min-h-11 items-center font-medium text-fg underline underline-offset-4 hover:no-underline">
          Voltar para a fila do curso
        </a>
      </Card>
    );
  }

  return (
    <Card data-testid="review-form">
      <form
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Correção</h2>
        <div className="space-y-4">
          {criteria.map((c, i) => (
            <fieldset key={c.id} data-testid={`criterion-${c.id}`} className="rounded-xl border border-line p-4">
              <legend className="px-1 text-base font-medium text-fg">
                <span className="text-fg-faint">{i + 1}. </span>
                {c.label}
              </legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {([true, false] as const).map((value) => {
                  const checked = answers[c.id] === value;
                  return (
                    <label
                      key={String(value)}
                      className={cn(
                        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                        checked ? (value ? 'border-success bg-success/10 text-fg' : 'border-danger bg-danger-soft text-fg') : 'border-line-strong text-fg-muted hover:border-fg/40 hover:text-fg',
                      )}
                    >
                      <input
                        type="radio"
                        name={`criterio-${c.id}`}
                        className="size-4"
                        checked={checked}
                        disabled={!!pending}
                        data-testid={`criterion-${c.id}-${value ? 'sim' : 'nao'}`}
                        onChange={() => setAnswers((prev) => ({ ...prev, [c.id]: value }))}
                      />
                      {value ? 'Sim' : 'Não'}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div>
          <label htmlFor={commentId} className="block text-base font-medium text-fg">
            Comentário para o aluno
          </label>
          <p id={hintId} className="mt-0.5 text-sm text-fg-muted">
            Obrigatório para devolver; opcional para aprovar. O aluno lê exatamente este texto. Diga o que ajustar, em linguagem simples.
          </p>
          <Textarea
            id={commentId}
            data-testid="review-comment"
            className="mt-2 min-h-28"
            rows={4}
            value={comment}
            maxLength={TASK_COMMENT_MAX + 200}
            disabled={!!pending}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
            aria-invalid={tooLong || undefined}
            onChange={(e) => setComment(e.target.value)}
          />
          <p className={cn('mt-1 text-right text-xs tabular-nums', tooLong ? 'text-danger' : 'text-fg-faint')}>
            {text.length}/{TASK_COMMENT_MAX}
          </p>
        </div>

        {error && (
          <p id={errorId} role="alert" data-testid="review-error" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <p className="text-sm text-fg-muted" data-testid="review-hint" aria-live="polite">
            {why}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" size="lg" data-testid="review-approve" disabled={!canApprove || !!pending} aria-busy={pending === 'approve'} onClick={() => void decide('approve')}>
              {pending === 'approve' ? 'Aprovando…' : 'Aprovar'}
            </Button>
            <Button type="button" variant="secondary" size="lg" data-testid="review-return" disabled={!canReturn || !!pending} aria-busy={pending === 'return'} onClick={() => void decide('return')}>
              {pending === 'return' ? 'Devolvendo…' : 'Devolver com comentário'}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
