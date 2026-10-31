'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { WIZARD_STEPS, type CourseDocument, type WizardStep } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { STEP_META, STEP_STATUS_LABEL, stepStatus, type StepStatus, type StepStatusContext } from './wizard-state';

export const DOT_STYLE: Record<StepStatus, string> = {
  not_started: 'border-line-strong bg-surface text-fg-faint',
  in_progress: 'border-accent bg-accent-soft text-accent-strong',
  ready: 'border-accent bg-accent-fill text-accent-fill-fg',
  stale: 'border-paid bg-paid-soft text-paid',
};

export function trailStatuses(doc: CourseDocument, ctx: StepStatusContext = {}): Record<WizardStep, StepStatus> {
  return Object.fromEntries(WIZARD_STEPS.map((s) => [s, stepStatus(s, doc, ctx)])) as Record<WizardStep, StepStatus>;
}

/**
 * A trilha em 8 passos com o estado de cada um. Horizontal e compacta: serve
 * ao painel do curso (links para o passo) e ao celular no assistente (botões).
 */
export function TrailStrip({
  doc,
  ctx,
  current,
  hrefFor,
  onSelect,
  reachableIndex,
  className,
}: {
  doc: CourseDocument;
  ctx?: StepStatusContext;
  current?: WizardStep;
  /** link por passo (painel do curso) */
  hrefFor?: (step: WizardStep) => string;
  /** clique por passo (assistente) */
  onSelect?: (step: WizardStep) => void;
  /** índice máximo navegável (assistente); sem ele, tudo é navegável */
  reachableIndex?: number;
  className?: string;
}) {
  const statuses = React.useMemo(() => trailStatuses(doc, ctx), [doc, ctx]);
  const done = WIZARD_STEPS.filter((s) => statuses[s] === 'ready').length;
  return (
    <nav aria-label="Trilha de montagem" className={cn('space-y-2', className)} data-testid="trail-strip">
      <p className="text-xs text-fg-faint">
        <span className="font-medium text-fg">{done} de {WIZARD_STEPS.length}</span> passos prontos
      </p>
      <ol className="scroll-fade-x relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {WIZARD_STEPS.map((s, i) => {
          const st = statuses[s];
          const isCurrent = s === current;
          const enabled = reachableIndex === undefined || i <= reachableIndex;
          const label = `${i + 1}. ${STEP_META[s].short}`;
          const inner = (
            <>
              <span aria-hidden="true" className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-semibold tabular-nums', DOT_STYLE[st], isCurrent && 'ring-2 ring-accent/40 ring-offset-1 ring-offset-bg')}>
                {st === 'ready' ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('whitespace-nowrap text-xs font-medium', isCurrent ? 'text-fg' : st === 'not_started' ? 'text-fg-faint' : 'text-fg-muted')}>{STEP_META[s].short}</span>
              <span className="sr-only">: {STEP_STATUS_LABEL[st]}{isCurrent ? ' (passo atual)' : ''}</span>
            </>
          );
          const cls = cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2 pr-3 transition-colors', isCurrent ? 'border-accent/50 bg-accent-soft/50' : 'border-transparent', enabled && !isCurrent && 'hover:border-line-strong hover:bg-surface-2', !enabled && 'cursor-not-allowed opacity-60');
          return (
            <li key={s}>
              {hrefFor && enabled ? (
                <Link href={hrefFor(s)} className={cls} aria-current={isCurrent ? 'step' : undefined} aria-label={label} data-testid={`trail-${s}`}>{inner}</Link>
              ) : (
                <button type="button" className={cls} disabled={!enabled} onClick={() => onSelect?.(s)} aria-current={isCurrent ? 'step' : undefined} aria-label={label} data-testid={`trail-${s}`}>{inner}</button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
