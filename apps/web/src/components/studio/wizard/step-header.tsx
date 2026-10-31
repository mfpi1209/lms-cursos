'use client';

import * as React from 'react';
import { Check, CircleDashed, Sparkles, ThumbsUp, UserRound } from 'lucide-react';
import type { WizardStep } from '@lms/course-schema';
import { WIZARD_STEPS } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { STEP_META, STEP_STATUS_LABEL, stepIndex, type StepStatus } from './wizard-state';

const STATUS_STYLE: Record<StepStatus, string> = {
  not_started: 'border-line-strong text-fg-muted',
  in_progress: 'border-accent/50 bg-accent-soft text-accent-strong',
  ready: 'border-success/40 bg-success-soft text-success',
  stale: 'border-paid/40 bg-paid-soft text-paid',
};

/** Chip de estado de um passo (não iniciado / em andamento / pronto / desatualizado). */
export function StatusChip({ status, className }: { status: StepStatus; className?: string }) {
  const Icon = status === 'ready' ? Check : CircleDashed;
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', STATUS_STYLE[status], className)} data-testid="step-status" data-status={status}>
      <Icon className="h-3.5 w-3.5" strokeWidth={status === 'ready' ? 3 : 2} aria-hidden="true" />
      {STEP_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Cabeçalho de passo: número, título, uma linha de resumo e as três linhas
 * didáticas (o que você faz / o que a IA faz / o que você aprova), mais o chip de estado.
 */
export const StepHeader = React.forwardRef<HTMLHeadingElement, { step: WizardStep; status: StepStatus; className?: string }>(function StepHeader({ step, status, className }, ref) {
  const meta = STEP_META[step];
  const n = stepIndex(step) + 1;
  return (
    <header className={cn('space-y-4', className)} data-testid={`step-header-${step}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="eyebrow whitespace-nowrap">Passo {n} de {WIZARD_STEPS.length}</p>
        <StatusChip status={status} />
      </div>
      <h1 ref={ref} tabIndex={-1} className="outline-none">{meta.label}</h1>
      <p className="max-w-prose text-lg text-fg-muted">{meta.lead}</p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Line icon={<UserRound className="h-4 w-4" aria-hidden="true" />} label="O que você faz" text={meta.youDo} />
        {meta.aiDoes && <Line icon={<Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />} label="O que a IA faz" text={meta.aiDoes} />}
        <Line icon={<ThumbsUp className="h-4 w-4" aria-hidden="true" />} label="O que você aprova" text={meta.youApprove} />
      </dl>
    </header>
  );
});

function Line({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-line bg-bg-2 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-fg-muted">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-fg-faint">{label}</dt>
        <dd className="text-fg-muted">{text}</dd>
      </div>
    </div>
  );
}
