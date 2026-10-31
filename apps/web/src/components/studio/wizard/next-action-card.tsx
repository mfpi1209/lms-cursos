'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Clapperboard, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { AI_MODE_LABEL, MEDIA_MODE_LABEL, useModes, type Modes } from './use-modes';
import type { PrimaryAction } from './next-action';

const COST_LABEL = { free: 'Sem custo', ai: 'Usa IA', paid: 'Pago' } as const;

/** Selos "IA: demonstração / IA real" e "Vídeo simulado / Vídeo real". */
export function ModeBadges({ modes, className }: { modes: Modes; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} data-testid="mode-badges">
      <Badge tone={modes.aiDemo === false ? 'ai' : 'neutral'} title={modes.aiProvider ? `Provedor: ${modes.aiProvider}` : undefined}>
        <Sparkles className="h-3 w-3" aria-hidden="true" /> {AI_MODE_LABEL(modes)}
      </Badge>
      <Badge tone={modes.mediaSimulation === false ? 'warning' : 'neutral'}>
        <Clapperboard className="h-3 w-3" aria-hidden="true" /> {MEDIA_MODE_LABEL(modes)}
      </Badge>
    </div>
  );
}

/**
 * "Próxima ação": uma só, com o que acontece e o que custa. `onGo` leva ao
 * passo (assistente); `href` leva por link (painel do curso).
 */
export function NextActionCard({
  action,
  onGo,
  href,
  variant = 'rail',
  className,
  children,
}: {
  action: PrimaryAction;
  onGo?: (action: PrimaryAction) => void;
  href?: string;
  /** rail: coluna à direita (desktop); strip: faixa acima do passo (celular) */
  variant?: 'rail' | 'strip';
  className?: string;
  /** conteúdo extra abaixo (ex.: estado de gravação) */
  children?: React.ReactNode;
}) {
  const modes = useModes();
  const strip = variant === 'strip';
  const tone = action.cost === 'paid' ? 'warning' : action.cost === 'ai' ? 'ai' : 'neutral';
  const btnCls = cn(buttonVariants({ size: strip ? 'sm' : 'md', variant: action.cost === 'paid' ? 'paid' : 'primary' }), strip ? 'shrink-0' : 'w-full');
  return (
    <section aria-labelledby="next-action-title" className={cn('panel panel-accent', strip ? 'flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3' : 'space-y-4 p-5', className)} data-testid="next-action" data-action={action.id}>
      <div className={cn('min-w-0', strip ? 'flex-1 basis-56' : 'space-y-1')}>
        <p id="next-action-title" className="eyebrow">Próxima ação</p>
        <p className="font-display text-lg font-bold leading-tight text-fg">{action.label}</p>
        <p className={cn('text-sm text-fg-muted', strip && 'line-clamp-2')}>{action.hint}</p>
      </div>
      <div className={cn('flex items-center gap-2', strip ? 'shrink-0' : 'flex-col items-stretch')}>
        {action.waiting ? (
          <Button disabled className={btnCls} data-testid="next-action-go">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {action.label}
          </Button>
        ) : href ? (
          <Link href={href} className={btnCls} data-testid="next-action-go">
            {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <Button className={btnCls} onClick={() => onGo?.(action)} data-testid="next-action-go">
            {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {!strip && <Badge tone={tone} className="self-start">{COST_LABEL[action.cost]}</Badge>}
      </div>
      <div className={cn(strip ? 'basis-full' : 'border-t border-line pt-3', 'space-y-2')}>
        <ModeBadges modes={modes} />
        {children}
      </div>
    </section>
  );
}
