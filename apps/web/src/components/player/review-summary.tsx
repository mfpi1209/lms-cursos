'use client';

import { Check, Lightbulb } from 'lucide-react';
import { REVIEW_MARK_LABELS, type ReviewSummary } from '@lms/course-engine';
import { cn } from '@/lib/utils';

/**
 * Resultado de uma sequência de decisões (ex.: "Resultado da simulação"): no
 * topo, "3 de 4 respostas fortes"; para cada decisão, a pergunta, a resposta
 * escolhida, a marca ("Forte" / "Pode melhorar") e a dica do retorno.
 * Só tokens de tema (claro/escuro).
 */
export function ReviewSummaryView({ review, className, headingLevel = 3 }: { review: ReviewSummary; className?: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  if (review.items.length === 0) return null;
  return (
    <section data-testid="review-summary" aria-label="Suas respostas" className={cn('space-y-3', className)}>
      {review.headline && (
        <p data-testid="review-headline" className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg md:text-[26px]">
          {review.headline}
        </p>
      )}
      <ol className="space-y-2.5">
        {review.items.map((item, i) => (
          <li key={item.nodeId} data-testid={`review-item-${item.nodeId}`} className="rounded-[14px] border border-line bg-surface-2/80 px-4 py-3 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <Heading className="m-0 min-w-0 text-[15px]! font-medium! leading-snug! text-fg-muted">
                <span className="sr-only">Pergunta {i + 1}: </span>
                {item.question}
              </Heading>
              {item.mark && (
                <span
                  data-testid="review-mark"
                  data-mark={item.mark}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold',
                    item.mark === 'strong' ? 'bg-accent-fill text-accent-fill-fg' : 'border border-line-strong text-fg',
                  )}
                >
                  {item.mark === 'strong' && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                  {REVIEW_MARK_LABELS[item.mark]}
                </span>
              )}
            </div>
            {item.answer ? (
              <p className="mt-1.5 text-[17px] leading-snug text-fg">
                <span className="sr-only">Sua resposta: </span>
                {item.answer}
              </p>
            ) : (
              <p className="mt-1.5 text-[15px] text-fg-muted">Sem resposta nesta tentativa.</p>
            )}
            {item.tip && (
              <p className="mt-1.5 flex items-start gap-2 text-[15px] leading-snug text-fg-muted">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
                <span>
                  <span className="sr-only">Dica: </span>
                  {item.tip}
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
