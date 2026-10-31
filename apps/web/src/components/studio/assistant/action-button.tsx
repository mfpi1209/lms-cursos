'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { AssistantAction } from '@lms/ai/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { errorText } from '@/components/studio/storyboard/use-media-jobs';
import { useSharedMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { focusAfter } from '@/components/ui/focus-trap';
import { useAssistant, type ActionOutcome, type AnglePreview, type VideoPlan } from './use-assistant';

const COST_LABEL: Record<AssistantAction['cost'], string> = { free: 'Sem custo', ai: 'IA', paid: 'Pago' };

export function CostBadge({ cost }: { cost: AssistantAction['cost'] }) {
  return <Badge tone={cost === 'paid' ? 'warning' : cost === 'ai' ? 'ai' : 'neutral'}>{COST_LABEL[cost]}</Badge>;
}

type Phase = 'idle' | 'preparing' | 'armed' | 'running' | 'done';

/**
 * Botão de um cartão de ação, com a regra de custo:
 * - sem custo: "Fazer";
 * - IA: "Pedir proposta" (vira proposta revisável, nada é aplicado sozinho);
 * - pago: dois cliques — "Gerar (pago)" mostra o que será cobrado e arma a
 *   confirmação; só "Confirmar: gerar e cobrar" executa. Em demonstração, os
 *   rótulos dizem "(demonstração)".
 */
export function ActionButton({ action, simulated, testId, className }: { action: AssistantAction; simulated: boolean | null; testId?: string; className?: string }) {
  const assistant = useAssistant();
  // modo de demonstração: o que o assistente informou; antes da primeira resposta, o que a fila de vídeos informa
  const queueSimulation = useSharedMediaQueue()?.data?.simulation ?? null;
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [plan, setPlan] = React.useState<VideoPlan | null>(null);
  const [angle, setAngle] = React.useState<AnglePreview | null>(null);
  const [outcome, setOutcome] = React.useState<ActionOutcome | null>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const outcomeRef = React.useRef<HTMLParagraphElement>(null);
  const detailId = React.useId();

  const sim = action.kind === 'generate_angle' && angle ? angle.simulated : (simulated ?? queueSimulation ?? false);
  const paid = action.cost === 'paid';
  const working = phase === 'running' || phase === 'preparing';

  const fail = (e: unknown) => {
    setOutcome({ tone: 'error', message: errorText(e, 'Não foi possível concluir esta ação.') });
    setPhase('idle');
  };

  const run = async (confirmed: boolean) => {
    setPhase('running');
    setOutcome(null);
    try {
      const r = await assistant.runAction(action, { confirmed });
      setOutcome(r);
      const next: Phase = paid && r?.tone !== 'error' ? 'done' : 'idle';
      setPhase(next);
      // o botão fica desabilitado em "done": o foco vai para a mensagem de resultado
      if (next === 'done') focusAfter(() => outcomeRef.current);
    } catch (e) {
      fail(e);
    }
  };

  const cancel = () => {
    setPhase('idle');
    setPlan(null);
    setAngle(null);
    // "Cancelar" some: o foco volta ao botão principal
    focusAfter(() => confirmRef.current);
  };

  const onClick = async () => {
    if (working || phase === 'done') return;
    if (!paid) return void run(false);
    if (phase === 'armed') return void run(true);
    // pago, primeiro clique: mostra o que vai ser cobrado e arma a confirmação
    setOutcome(null);
    if (action.kind === 'generate_videos') {
      const p = assistant.planVideos(action);
      if (p.blocker) return setOutcome({ tone: 'error', message: p.blocker });
      if (p.nodeIds.length === 0) return setOutcome({ tone: 'info', message: 'Nada a gerar: essas cenas já têm vídeo ou estão sem fala.' });
      setPlan(p);
      setPhase('armed');
    } else if (action.kind === 'generate_angle') {
      setPhase('preparing');
      try {
        setAngle(await assistant.previewAngle(action));
        setPhase('armed');
      } catch (e) {
        fail(e);
      }
    }
  };

  // a confirmação recebe o foco para o segundo clique ficar claro também no teclado
  React.useEffect(() => {
    if (phase === 'armed') confirmRef.current?.focus();
  }, [phase]);

  const label = (() => {
    if (phase === 'running') return action.cost === 'free' ? 'Fazendo…' : 'Enviando…';
    if (action.cost === 'free') return 'Fazer';
    if (action.cost === 'ai') return 'Pedir proposta';
    if (phase === 'preparing') return 'Preparando…';
    if (phase === 'done') return 'Pedido enviado';
    if (phase === 'armed') return sim ? 'Confirmar: gerar (demonstração)' : 'Confirmar: gerar e cobrar';
    return sim ? 'Gerar (demonstração)' : 'Gerar (pago)';
  })();

  const run_ = outcome?.runId ? assistant.runs.get(outcome.runId) : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      {phase === 'armed' && (plan || angle) && (
        <div id={detailId} className="space-y-1.5 rounded-xl border border-paid/30 bg-paid-soft px-3 py-2 text-xs text-paid">
          {plan && (
            <p>
              {plan.nodeIds.length} {plan.nodeIds.length === 1 ? 'vídeo' : 'vídeos'} · {plan.chars.toLocaleString('pt-BR')} caracteres · {plan.summary}
              {plan.skipped > 0 && ` · ${plan.skipped} ${plan.skipped === 1 ? 'cena fica' : 'cenas ficam'} de fora`}
            </p>
          )}
          {angle && (
            <>
              <p className="font-medium">Pedido que vai para a HeyGen</p>
              <p className="rounded-lg bg-bg px-2 py-1.5 font-mono leading-relaxed text-fg" lang="en">{angle.prompt}</p>
              {angle.note && <p>{angle.note}</p>}
            </>
          )}
          <p role="status">{sim ? 'Modo de demonstração: nenhuma cobrança será feita. Clique de novo para confirmar.' : 'Ação paga nos provedores externos. Clique de novo para confirmar a cobrança.'}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={confirmRef}
          variant={action.cost === 'paid' ? 'paid' : action.cost === 'ai' ? 'ai' : 'primary'}
          size="sm"
          className={cn(working && 'opacity-60')}
          // enquanto trabalha, o botão continua focável (aria-busy) para o foco não cair no body
          disabled={phase === 'done'}
          aria-busy={working || undefined}
          aria-disabled={working || undefined}
          aria-describedby={phase === 'armed' ? detailId : undefined}
          onClick={() => void onClick()}
          data-testid={testId}
          data-armed={phase === 'armed' ? 'true' : undefined}
        >
          {working && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {label}
        </Button>
        {phase === 'armed' && (
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancelar
          </Button>
        )}
      </div>
      {outcome && (
        <p ref={outcomeRef} tabIndex={-1} role={outcome.tone === 'error' ? 'alert' : 'status'} className={cn('rounded text-xs', outcome.tone === 'error' ? 'text-danger' : outcome.tone === 'success' ? 'text-success' : 'text-fg-muted')}>
          {run_ ? <RunLine status={run_.status} error={run_.error} fallback={outcome.message} /> : outcome.message}
          {outcome.href && (!run_ || run_.status !== 'failed') && (
            <>
              {' '}
              <Link href={outcome.href} className="font-medium text-accent-strong underline-offset-2 hover:underline">
                {outcome.hrefLabel ?? 'Abrir'}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function RunLine({ status, error, fallback }: { status: string; error: string | null; fallback: string }) {
  if (status === 'queued' || status === 'running') return <>A IA está preparando a proposta…</>;
  if (status === 'succeeded') return <>Proposta pronta para revisão.</>;
  if (status === 'failed') return <span className="text-danger">A IA não conseguiu concluir{error ? `: ${error}` : '.'}</span>;
  return <>{fallback}</>;
}

/** Cartão de ação devolvido pelo assistente. */
export function ActionCard({ action, simulated }: { action: AssistantAction; simulated: boolean | null }) {
  return (
    <article className="space-y-2 rounded-2xl border border-line bg-surface p-3" data-testid={`assistant-action-card-${action.kind}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-5 text-fg">{action.label}</h4>
        <CostBadge cost={action.cost} />
      </div>
      {action.description && <p className="text-xs leading-relaxed text-fg-muted">{action.description}</p>}
      <ActionButton action={action} simulated={simulated} testId={`assistant-action-${action.kind}`} />
    </article>
  );
}
