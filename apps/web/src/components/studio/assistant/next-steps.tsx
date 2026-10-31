'use client';

import * as React from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { computeNextSteps, type NextStep } from '@lms/ai/client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDraft } from '@/components/studio/draft-provider';
import { useSharedMediaQueue } from '@/components/studio/media-queue/use-media-queue';
import { ActionButton, CostBadge } from './action-button';
import { useAssistantState } from './use-assistant';

const REFRESH_DEBOUNCE_MS = 800;

const SEVERITY: Record<NextStep['severity'], { label: string; dot: string; text: string; ring: string }> = {
  blocker: { label: 'Precisa resolver', dot: 'bg-danger', text: 'text-danger', ring: 'border-danger/30 bg-danger-soft/40' },
  recommended: { label: 'Recomendado', dot: 'bg-accent', text: 'text-accent-strong', ring: 'border-line bg-surface' },
  optional: { label: 'Opcional', dot: 'bg-fg-faint', text: 'text-fg-muted', ring: 'border-line bg-surface' },
};

/**
 * Próximos passos calculados do estado do curso (sem IA). Recarrega quando o
 * rascunho muda de revisão. Se a rota não responder, calcula no navegador com
 * a mesma função pura do pacote de IA (rascunho local + fila de vídeos).
 */
export function useNextSteps(lessonId?: string) {
  const { courseId, revision, document: doc } = useDraft();
  const queue = useSharedMediaQueue();
  const localRef = React.useRef<() => NextStep[]>(() => []);
  localRef.current = () => {
    try {
      const mediaQueue = queue?.data?.items.map((i) => ({ lessonId: i.lessonId, nodeId: i.nodeId, status: i.status }));
      return computeNextSteps(doc, { courseId, lessonId, mediaQueue });
    } catch {
      return [];
    }
  };
  const [state, setState] = React.useState<{ steps: NextStep[]; loading: boolean }>({ steps: [], loading: true });
  React.useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      const qs = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : '';
      api<{ steps: NextStep[] }>(`/api/courses/${courseId}/assistant/next-steps${qs}`)
        .then((r) => !cancelled && setState({ steps: r.steps ?? [], loading: false }))
        .catch(() => !cancelled && setState({ steps: localRef.current(), loading: false }));
    }, REFRESH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [courseId, lessonId, revision]);
  return state;
}

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, v: boolean) {
  try {
    window.localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* armazenamento indisponível: só não lembra */
  }
}

export interface NextStepsProps {
  lessonId?: string;
  /** card: painel do curso; inline: topo do storyboard; dock: estado vazio do assistente */
  variant?: 'card' | 'inline' | 'dock';
  /** recolhível, lembrando o estado neste navegador */
  collapsible?: boolean;
  storageKey?: string;
  headingLevel?: 'h2' | 'h3';
  /** máximo de passos exibidos */
  limit?: number;
  className?: string;
}

/** Cartão compacto "Próximos passos": bloqueios, recomendações e opcionais, cada um com sua ação. */
export function NextSteps({ lessonId, variant = 'card', collapsible = false, storageKey = 'lms.next-steps.collapsed', headingLevel = 'h2', limit = 5, className }: NextStepsProps) {
  const { steps, loading } = useNextSteps(lessonId);
  const assistant = useAssistantState();
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    if (collapsible) setCollapsed(readCollapsed(storageKey));
  }, [collapsible, storageKey]);
  const headingId = React.useId();
  const listId = React.useId();
  const Heading = headingLevel;

  if (loading && steps.length === 0) return null;
  if (steps.length === 0 && variant !== 'card') return null;

  const shown = steps.slice(0, limit);
  const blockers = steps.filter((s) => s.severity === 'blocker').length;
  const toggle = () => {
    setCollapsed((v) => {
      writeCollapsed(storageKey, !v);
      return !v;
    });
  };

  const summary = steps.length === 0 ? 'Tudo em ordem' : blockers > 0 ? `${blockers} para resolver` : `${steps.length} ${steps.length === 1 ? 'sugestão' : 'sugestões'}`;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="next-steps"
      className={cn(variant === 'dock' ? 'space-y-2' : 'panel px-4 py-3 sm:px-5', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <Heading id={headingId} className={cn('flex items-center gap-2 font-sans font-semibold text-fg', variant === 'dock' ? 'text-sm' : 'text-base')}>
          <ListChecks className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          Próximos passos
          <span className={cn('text-xs font-normal', blockers > 0 ? 'text-danger' : 'text-fg-faint')}>{summary}</span>
        </Heading>
        {collapsible && steps.length > 0 && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={listId}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            data-testid="next-steps-toggle"
          >
            {collapsed ? 'Mostrar' : 'Recolher'}
            <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !collapsed && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
      </div>
      {steps.length === 0 ? (
        <p className="mt-1 text-sm text-fg-muted">Nada pendente agora. Bom trabalho.</p>
      ) : (
        !collapsed && (
          <ol id={listId} className={cn('space-y-2', variant !== 'dock' && 'mt-3')}>
            {shown.map((s) => {
              const sev = SEVERITY[s.severity];
              return (
                <li key={s.id} className={cn('space-y-1.5 rounded-xl border px-3 py-2.5', sev.ring)} data-testid={`next-step-${s.id}`} data-severity={s.severity}>
                  {/* layout estável: título numa linha só, selos numa linha, ação embaixo (armar a confirmação não reposiciona o título) */}
                  <p className="flex items-start gap-2 text-sm font-medium text-fg">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', sev.dot)} aria-hidden="true" />
                    <span className="min-w-0 flex-1">{s.title}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4">
                    <span className={cn('text-xs font-normal', sev.text)}>{sev.label}</span>
                    {s.action && <CostBadge cost={s.action.cost} />}
                  </div>
                  {s.detail && <p className="pl-4 text-xs leading-relaxed text-fg-muted">{s.detail}</p>}
                  {s.action && (
                    <div className="pl-4 pt-0.5">
                      <ActionButton action={s.action} simulated={assistant?.simulated ?? null} testId={`next-step-action-${s.id}`} />
                    </div>
                  )}
                </li>
              );
            })}
            {steps.length > shown.length && <li className="px-1 text-xs text-fg-faint">E mais {steps.length - shown.length}.</li>}
          </ol>
        )
      )}
    </section>
  );
}
