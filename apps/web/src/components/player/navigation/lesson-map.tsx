'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Keyboard, List, RotateCcw, X } from 'lucide-react';
import type { AttemptState, BackAvailability, ProgressSummary } from '@lms/course-engine';
import type { Lesson } from '@lms/course-schema';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/components/ui/focus-trap';
import { findNode } from '../use-player-session';
import { sceneKind, sceneName } from './scene-icon';

export interface LessonMapProps {
  open: boolean;
  onClose(): void;
  lesson: Lesson;
  state: AttemptState | null;
  progress: ProgressSummary | null;
  canGoBack: boolean;
  backBlocked: Extract<BackAvailability, { ok: false }> | null;
  pending: boolean;
  onGoTo(pathIndex: number): Promise<boolean> | void;
  /** recomeçar a aula (nova tentativa); ausente = sem o botão */
  onRestart?(): Promise<void> | void;
  /** página do curso (lista de aulas) */
  lessonsHref: string;
  /** "Abrir no estúdio" (só equipe que edita o curso) */
  studioHref?: string;
  /** palco da plataforma (cores do tema do player) */
  platform?: boolean;
}

const BTN = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Mapa da aula: gaveta lateral com as cenas JÁ VISTAS (nunca as futuras, para
 * não revelar os caminhos), a atual em destaque, "Voltar para esta cena",
 * recomeçar, lista de aulas e os atalhos de teclado. Esc fecha; foco preso.
 */
export function LessonMapDrawer(p: LessonMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => {
    setConfirming(false);
    p.onClose();
  }, [p]);
  useFocusTrap(ref, { active: p.open, onEscape: close, initialFocus: '[data-map-current] button, [data-map-close]' });

  useEffect(() => {
    if (!p.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [p.open]);

  if (!p.open) return null;
  const state = p.state;
  const path = state?.path ?? [];
  const last = path.length - 1;
  const completed = state?.status === 'completed';
  const remaining = p.progress?.remainingRequired ?? 0;
  const percent = completed ? 100 : Math.max(0, Math.min(100, Math.round(p.progress?.percent ?? 0)));
  const studio = p.studioHref && state ? `${p.studioHref}?node=${encodeURIComponent(state.currentNodeId)}` : p.studioHref;

  const goTo = async (i: number) => {
    const ok = await p.onGoTo(i);
    if (ok !== false) close();
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="lesson-map">
      <div className={cn('absolute inset-0 backdrop-blur-[2px]', p.platform ? 'bg-[var(--im-overlay)]' : 'bg-fg/40')} aria-hidden="true" onClick={close} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute inset-y-0 left-0 flex w-full max-w-[460px] flex-col border-r border-line bg-bg-2 text-fg shadow-[24px_0_60px_-30px_rgb(0_0_0/0.6)]',
          p.platform && 'theme-platform',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-muted">Mapa da aula</p>
            <h2 id={titleId} className="mt-0.5 text-xl! font-semibold! leading-snug! text-fg">{p.lesson.title}</h2>
          </div>
          <button type="button" data-map-close onClick={close} aria-label="Fechar mapa da aula" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-fg/10">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 md:px-6">
          <div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg-muted">Progresso da aula</span>
              <span className="font-semibold tabular-nums text-fg" data-testid="lesson-map-percent">{percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/12" aria-hidden="true">
              <div className="h-full rounded-full bg-accent-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <section aria-labelledby={`${titleId}-seen`}>
            <h3 id={`${titleId}-seen`} className="text-base! font-semibold! text-fg">Cenas que você já viu</h3>
            {path.length === 0 ? (
              <p className="mt-2 text-sm text-fg-muted">Carregando…</p>
            ) : (
              <ol className="mt-3 space-y-1.5" data-testid="lesson-map-scenes">
                {path.map((step, i) => {
                  const node = findNode(p.lesson, step.nodeId);
                  const { Icon, label, video } = sceneKind(node);
                  const current = i === last;
                  return (
                    <li
                      key={`${step.nodeId}-${i}`}
                      aria-current={current ? 'step' : undefined}
                      data-map-current={current || undefined}
                      data-testid={`lesson-map-scene-${step.nodeId}`}
                      className={cn('flex items-center gap-3 rounded-[12px] border px-3 py-2.5', current ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}
                    >
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', current ? 'bg-accent-fill text-accent-fill-fg' : 'bg-fg/8 text-fg-muted')} aria-hidden="true">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-fg">{sceneName(node)}</span>
                        <span className="block text-xs text-fg-muted">
                          {label}
                          {video && <span className="sr-only"> (cena com vídeo)</span>}
                          {current && ' · você está aqui'}
                        </span>
                      </span>
                      {!current && !completed && (
                        <button
                          type="button"
                          onClick={() => void goTo(i)}
                          disabled={!p.canGoBack || p.pending}
                          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-accent-strong underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline"
                          data-testid={`lesson-map-goto-${i}`}
                          aria-label={`Voltar para esta cena: ${sceneName(node)}`}
                        >
                          Voltar para esta cena
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-3 text-sm text-fg-muted" data-testid="lesson-map-ahead">
              {completed
                ? 'Você chegou ao fim desta aula.'
                : remaining > 1
                  ? `Mais ${remaining} cenas pela frente, dependendo das suas escolhas.`
                  : remaining === 1
                    ? 'Mais 1 cena pela frente.'
                    : 'Você está na reta final desta aula.'}
            </p>
            {p.backBlocked?.code === 'BACK_NOT_ALLOWED' && <p className="mt-2 text-sm text-fg-muted">Nesta aula não dá para voltar cenas: as respostas valem como estão.</p>}
            {completed && <p className="mt-2 text-sm text-fg-muted">Aula concluída. Para ver suas respostas, use “Rever” na lista de aulas.</p>}
          </section>

          <section className="space-y-2" aria-label="Ações">
            <Link href={p.lessonsHref} className={cn(BTN, 'w-full border border-line-strong text-fg hover:bg-fg/5')} data-testid="lesson-map-lessons">
              <List className="size-4" aria-hidden="true" /> Lista de aulas
            </Link>
            {p.onRestart &&
              (confirming ? (
                <div role="group" aria-label="Confirmar recomeço" className="space-y-3 rounded-[12px] border border-line-strong bg-surface p-4">
                  <p className="text-sm text-fg">Recomeçar a aula do início? Uma nova tentativa começa; a atual fica guardada no seu histórico.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cn(BTN, 'bg-accent-fill text-accent-fill-fg hover:brightness-105')}
                      disabled={p.pending}
                      data-testid="lesson-map-restart-confirm"
                      onClick={async () => {
                        await p.onRestart?.();
                        close();
                      }}
                    >
                      Recomeçar agora
                    </button>
                    <button type="button" className={cn(BTN, 'text-fg hover:bg-fg/5')} onClick={() => setConfirming(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={cn(BTN, 'w-full text-fg hover:bg-fg/5')} onClick={() => setConfirming(true)} data-testid="lesson-map-restart">
                  <RotateCcw className="size-4" aria-hidden="true" /> Recomeçar aula
                </button>
              ))}
            {studio && (
              <Link href={studio} className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline" data-testid="open-in-studio">
                <ExternalLink className="size-4" aria-hidden="true" /> Abrir no estúdio (equipe)
              </Link>
            )}
          </section>

          <section aria-labelledby={`${titleId}-keys`} className="rounded-[12px] border border-line p-4">
            <h3 id={`${titleId}-keys`} className="flex items-center gap-2 text-sm! font-semibold! text-fg">
              <Keyboard className="size-4" aria-hidden="true" /> Atalhos de teclado
            </h3>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt><Kbd>←</Kbd></dt>
              <dd className="text-fg-muted">Cena anterior</dd>
              <dt><Kbd>Enter</Kbd> <Kbd>→</Kbd></dt>
              <dd className="text-fg-muted">Continuar (só quando o botão principal é “Continuar”; nunca confirma uma escolha)</dd>
              <dt><Kbd>Esc</Kbd></dt>
              <dd className="text-fg-muted">Fechar este mapa</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-sans text-xs font-semibold text-fg">{children}</kbd>;
}

/** "Cena anterior": só aparece quando dá para voltar. */
export function BackSceneButton({ canGoBack, pending, onBack, className }: { canGoBack: boolean; pending: boolean; onBack(): void; className?: string }) {
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      disabled={pending}
      aria-keyshortcuts="ArrowLeft"
      data-testid="player-back"
      className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm font-medium text-fg hover:bg-fg/5 disabled:opacity-50', className)}
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Cena anterior
    </button>
  );
}
