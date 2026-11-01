'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ctaOutline, ctaPrimary } from '../../_components/learner-ui';

import type { PublicTrailCheck } from '@lms/course-schema';

type PublicCheck = PublicTrailCheck;
type Result = { total: number; correct: number; needed: number; passed: boolean; results: Array<{ id: string; chosen: string | null; correct: boolean; feedback: string }> };

/**
 * Checagem final da trilha: todas as situações visíveis, uma escolha por situação (rádios nativos), envio
 * único, retorno por situação e "Refazer" sem limite. Não é prova punitiva: o retorno explica cada escolha.
 */
export function TrailCheckForm({ trailKey, check: inicial, passRatio, passedBefore, hasBadge }: { trailKey: string; check: PublicCheck; passRatio: number; passedBefore: boolean; hasBadge: boolean }) {
  const router = useRouter();
  // as opções chegam embaralhadas pelo servidor (por aluno e tentativa); ao refazer, o servidor devolve a ordem da próxima tentativa
  const [check, setCheck] = useState<PublicCheck>(inicial);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [badgeNow, setBadgeNow] = useState(false);
  // selo já emitido: a checagem fica recolhida (aprovado), com a opção de refazer para treinar
  const [open, setOpen] = useState(!hasBadge);
  const summaryRef = useRef<HTMLDivElement>(null);
  const total = check.situations.length;
  const needed = Math.ceil(total * passRatio);
  const answered = check.situations.filter((s) => answers[s.id]).length;
  const missing = total - answered;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || missing > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/trilhas/${trailKey}/checagem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Não foi possível enviar.');
      setResult(body.result as Result);
      if (body.badge && !hasBadge) setBadgeNow(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Não foi possível enviar.'} Suas respostas continuam marcadas; tente de novo.`);
    } finally {
      setSending(false);
    }
  }

  async function redo() {
    setResult(null);
    setAnswers({});
    setBadgeNow(false);
    try {
      const res = await fetch(`/api/trilhas/${trailKey}/checagem`, { cache: 'no-store' });
      const body = await res.json();
      if (res.ok && body?.check) setCheck(body.check as PublicCheck);
    } catch {
      // sem rede: refaz com a mesma ordem
    }
    requestAnimationFrame(() => document.getElementById(`sit-${check.situations[0]?.id}`)?.focus());
  }

  const byId = new Map(result?.results.map((r) => [r.id, r]));

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="trail-check-done">
        <p className="text-[15px] text-fg">Você passou na checagem final desta trilha.</p>
        <button type="button" onClick={() => setOpen(true)} className={cn(ctaOutline, 'min-h-11 px-5')}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Refazer para treinar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" data-testid="trail-check" noValidate>
      <p className="text-[15px] text-fg-muted">
        {total} situações novas, parecidas com as dos cursos. Para passar, acerte {needed}. Depois de enviar, você vê o retorno de cada uma e pode refazer quantas vezes quiser.
        {passedBefore && !result ? ' Você já passou nesta checagem.' : ''}
      </p>
      {check.situations.map((s, i) => {
        const r = byId.get(s.id);
        return (
          <fieldset key={s.id} id={`sit-${s.id}`} tabIndex={-1} className="space-y-3 rounded-[16px] border border-line p-4 outline-none sm:p-5" disabled={!!result}>
            <legend className="sr-only">
              Situação {i + 1} de {total}: {s.title}
            </legend>
            <p aria-hidden="true" className="text-sm font-medium text-fg-muted">
              Situação {i + 1} de {total}
            </p>
            <p className="rounded-[12px] border-l-4 border-[var(--im-accent)] bg-fg/[0.04] px-4 py-3 text-[16px] leading-relaxed text-fg/90">{s.situation}</p>
            <p aria-hidden="true" className="text-[18px] font-semibold leading-snug text-fg">
              {s.title}
            </p>
            <div className="space-y-2">
              {s.options.map((o) => {
                const chosen = answers[s.id] === o.id;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3 text-[16px] leading-snug transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--im-accent-ink)]',
                      chosen ? 'border-[var(--im-accent)] bg-[var(--im-accent)]/10 text-fg' : 'border-line text-fg/90 hover:border-fg/30',
                      result && 'cursor-default',
                    )}
                  >
                    <input type="radio" name={s.id} value={o.id} checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [s.id]: o.id }))} className="mt-0.5 size-5 shrink-0 accent-[var(--im-accent)]" />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
            {r && (
              <p className={cn('flex items-start gap-2 rounded-[12px] px-3 py-2 text-[15px] leading-snug', r.correct ? 'bg-success/10 text-fg' : 'bg-fg/[0.05] text-fg')} data-testid={`check-feedback-${s.id}`}>
                {r.correct ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <X className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />}
                <span>
                  <span className="font-semibold">{r.correct ? 'Boa escolha. ' : 'Reveja. '}</span>
                  {r.feedback}
                </span>
              </p>
            )}
          </fieldset>
        );
      })}

      {error && (
        <p role="alert" className="rounded-[12px] border border-line bg-fg/[0.04] px-4 py-3 text-[15px] text-fg">
          {error}
        </p>
      )}

      {result ? (
        <div ref={summaryRef} tabIndex={-1} role="status" className="space-y-3 rounded-[16px] border border-line bg-surface p-4 outline-none sm:p-5" data-testid="check-summary">
          <p className="text-[18px] font-semibold text-fg">
            {result.correct} de {result.total} {result.passed ? '· aprovado na checagem' : `· faltou pouco: para passar, são ${result.needed}`}
          </p>
          {badgeNow ? (
            <p className="text-[16px] text-fg">Você ganhou o Selo DNA Work · {check.trail}.</p>
          ) : result.passed && !hasBadge ? (
            <p className="text-[15px] text-fg-muted">Checagem aprovada. O selo sai quando todos os cursos estiverem concluídos e as atividades salvas.</p>
          ) : !result.passed ? (
            <p className="text-[15px] text-fg-muted">Leia o retorno de cada situação e refaça quando quiser.</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {badgeNow && (
              <button type="button" onClick={() => router.refresh()} className={cn(ctaPrimary, 'min-h-12 px-6')}>
                Ver meu selo
              </button>
            )}
            <button type="button" onClick={redo} className={cn(ctaOutline, 'min-h-12 px-6')}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Refazer checagem
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={sending || missing > 0} className={cn(ctaPrimary, 'min-h-12 px-7 disabled:opacity-60')} data-testid="check-submit">
            {sending ? 'Enviando…' : 'Enviar respostas'}
          </button>
          <span className="text-[15px] text-fg-muted" aria-live="polite">
            {missing > 0 ? `${missing === 1 ? 'Falta 1 situação' : `Faltam ${missing} situações`}.` : 'Tudo respondido.'}
          </span>
        </div>
      )}
    </form>
  );
}
