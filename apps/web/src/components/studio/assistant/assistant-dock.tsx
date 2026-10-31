'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { findLesson, type CourseDocument } from '@lms/course-schema';
import { promptSuggestions, type AssistantContext, type PromptSuggestion } from '@lms/ai/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { OverlayPortal } from '@/components/ui/overlay-portal';
import { useDraft } from '@/components/studio/draft-provider';
import { sceneTypeLabel } from '@/components/studio/storyboard/scene-model';
import { STEP_META } from '@/components/studio/wizard/wizard-state';
import { ActionCard } from './action-button';
import { NextSteps } from './next-steps';
import { localSuggestions } from './suggestions';
import { useAssistant } from './use-assistant';

const INPUT_MAX = 2000;

/** "Aula: X · Cena: Y" (ou o equivalente da tela). */
export function contextLine(ctx: AssistantContext, doc: CourseDocument): string {
  switch (ctx.screen) {
    case 'storyboard': {
      const found = ctx.lessonId ? findLesson(doc, ctx.lessonId) : undefined;
      const parts = [`Aula: ${found?.lesson.title || 'sem título'}`];
      if (ctx.nodeId) {
        const node = found?.lesson.graph.nodes.find((n) => n.id === ctx.nodeId);
        parts.push(`Cena: ${node?.title?.trim() || (node ? sceneTypeLabel(node.type) : 'selecionada')}`);
      }
      return parts.join(' · ');
    }
    case 'wizard': {
      const meta = ctx.step ? (STEP_META as Record<string, { short: string }>)[ctx.step] : undefined;
      return meta ? `Montagem · Passo: ${meta.short}` : 'Montagem do curso';
    }
    case 'production':
      return 'Produção de vídeos';
    case 'review':
      return 'Revisão e publicação';
    default:
      return `Curso: ${doc.title || 'sem título'}`;
  }
}

/** Texto da região ao vivo: um ponto final só e plural certo ("1 ação sugerida" / "N ações sugeridas"). */
export function liveStatus(reply: string, actions: number): string {
  const text = reply.trim().replace(/[.!?…]+$/u, '');
  const tail = actions === 0 ? '' : actions === 1 ? ' 1 ação sugerida.' : ` ${actions} ações sugeridas.`;
  return `Assistente: ${text}.${tail}`;
}

/** Atalhos de prompt do contexto atual (função pura do pacote de IA); sem nenhum, os locais. */
function usePromptSuggestions(ctx: AssistantContext, doc: CourseDocument): PromptSuggestion[] {
  return React.useMemo(() => {
    let list: PromptSuggestion[] = [];
    try {
      list = promptSuggestions(ctx, doc);
    } catch {
      list = [];
    }
    return (list.length > 0 ? list : localSuggestions(ctx)).slice(0, 4);
  }, [ctx, doc]);
}

/**
 * Assistente do estúdio: pílula flutuante "Peça à IA… ⌘K" que abre um painel
 * (gaveta à direita a partir de lg, folha inferior no celular) com o contexto
 * da tela, sugestões, a conversa e os cartões de ação. Montado uma vez no
 * layout do curso.
 */
export function AssistantDock() {
  const a = useAssistant();
  const { document: doc } = useDraft();
  // Na prévia da aula o player ocupa a tela: a pílula cobriria os controles do vídeo.
  const pathname = usePathname();
  const onPreview = /\/previa(\/|$)/.test(pathname ?? '');
  const [text, setText] = React.useState('');
  const [mac, setMac] = React.useState(true);
  const pillRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const restoreFocus = React.useRef(false);
  const titleId = React.useId();
  const panelId = React.useId();
  const inputId = React.useId();
  const hintId = React.useId();

  const { open, toggle, setOpen, turns, busy, context } = a;
  const suggestions = usePromptSuggestions(context, doc);
  const line = contextLine(context, doc);
  const lastReply = [...turns].reverse().find((t) => t.role === 'assistant');

  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const close = React.useCallback(() => {
    restoreFocus.current = !!panelRef.current?.contains(document.activeElement);
    setOpen(false);
  }, [setOpen]);

  // ⌘K / Ctrl+K alterna o painel em qualquer lugar do curso
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, toggle]);

  // foco: entra no campo ao abrir; volta à pílula ao fechar (se estava no painel)
  React.useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(r);
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      const r = requestAnimationFrame(() => pillRef.current?.focus());
      return () => cancelAnimationFrame(r);
    }
  }, [open]);

  // rola a conversa para a última mensagem
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, busy, open]);

  // O layout do estúdio reserva espaço: embaixo (pílula) e à direita (painel aberto em ≥ lg). Ver globals.css.
  React.useEffect(() => {
    if (onPreview) return;
    const root = document.querySelector<HTMLElement>('.theme-studio');
    if (!root) return;
    root.setAttribute('data-assistant-dock', 'true');
    root.setAttribute('data-assistant-open', open ? 'true' : 'false');
    return () => {
      root.removeAttribute('data-assistant-dock');
      root.removeAttribute('data-assistant-open');
    };
  }, [open, onPreview]);

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText('');
    void a.ask(m);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  };

  if (onPreview) return null;

  return (
    <>
      <OverlayPortal>
        <div data-testid="assistant-dock" data-open={open ? 'true' : 'false'}>
          {!open && (
            <button
              ref={pillRef}
              type="button"
              onClick={toggle}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K"
              aria-label="Peça à IA (abre o assistente)"
              className={cn(
                // < sm: só o ícone, no canto direito; sm–lg: pílula centralizada; ≥ lg: canto inferior direito (fora das linhas de ação centradas)
                'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-ai/30 bg-surface/95 text-sm font-medium text-fg shadow-[0_16px_40px_-12px_rgb(0_0_0_/_0.7)] backdrop-blur-md transition-colors hover:border-ai/60 hover:bg-surface',
                'right-4 min-w-12 justify-center px-0',
                'sm:left-1/2 sm:right-auto sm:min-w-0 sm:-translate-x-1/2 sm:px-5',
                'lg:left-auto lg:right-6 lg:translate-x-0',
              )}
              data-testid="assistant-open"
            >
              <Sparkles className="h-5 w-5 text-ai sm:h-4 sm:w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Peça à IA…</span>
              <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-fg-muted sm:inline" aria-hidden="true">
                {mac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
          )}

          {open && (
            <>
              <div className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-[2px] lg:hidden" aria-hidden="true" onClick={close} />
              <section
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="false"
                aria-labelledby={titleId}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    close();
                  }
                }}
                className={cn(
                  'rise fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-line-strong bg-surface shadow-2xl',
                  'lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-0 lg:h-dvh lg:max-h-none lg:w-[var(--assistant-panel-width,26rem)] lg:rounded-none lg:border-l lg:border-t-0',
                )}
                data-testid="assistant-panel"
              >
                <header className="flex items-start gap-3 border-b border-line px-4 py-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ai-soft text-ai" aria-hidden="true">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="font-sans text-base font-semibold text-fg">
                      Assistente
                    </h2>
                    <p className="truncate text-xs text-fg-muted" title={line} data-testid="assistant-context">
                      {line}
                    </p>
                  </div>
                  {turns.length > 0 && (
                    <Button variant="ghost" size="sm" className="px-3" onClick={a.clearConversation} disabled={busy}>
                      Limpar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fechar o assistente" onClick={close}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </header>

                <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {turns.length === 0 ? (
                    <div className="space-y-4">
                      <p className="text-sm leading-relaxed text-fg-muted">
                        Peça ajuda com esta tela. Eu sugiro ações; ações de IA viram propostas para você revisar, e nada pago acontece sem a sua confirmação.
                      </p>
                      <NextSteps variant="dock" lessonId={context.lessonId} headingLevel="h3" limit={3} />
                    </div>
                  ) : (
                    <ol className="space-y-4" aria-label="Conversa">
                      {turns.map((t) =>
                        t.role === 'user' ? (
                          <li key={t.id} className="flex justify-end">
                            <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm text-fg">
                              <span className="sr-only">Você: </span>
                              {t.text}
                            </p>
                          </li>
                        ) : (
                          <li key={t.id} className="space-y-2">
                            <div
                              className={cn(
                                'max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md px-3.5 py-2 text-sm leading-relaxed',
                                t.error ? 'border border-danger/30 bg-danger-soft text-danger' : 'bg-surface-2 text-fg',
                              )}
                              data-testid="assistant-reply"
                            >
                              <span className="sr-only">Assistente: </span>
                              {t.text}
                              {t.simulated && <span className="mt-1 block text-xs text-fg-faint">Resposta de demonstração</span>}
                            </div>
                            {t.actions && t.actions.length > 0 && (
                              <ul className="space-y-2" aria-label="Ações sugeridas">
                                {t.actions.map((act, i) => (
                                  <li key={`${t.id}-${i}`}>
                                    <ActionCard action={act} simulated={t.simulated ?? a.simulated} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                  {busy && (
                    <p className="flex items-center gap-2 text-sm text-fg-muted" aria-hidden="true">
                      <span className="pulse-dot h-2 w-2 rounded-full bg-ai" />
                      Pensando…
                    </p>
                  )}
                </div>

                {/* leitores de tela: anuncia a resposta nova (ou que está pensando) */}
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {busy ? 'O assistente está pensando…' : lastReply ? liveStatus(lastReply.text, lastReply.actions?.length ?? 0) : ''}
                </p>

                <div className="space-y-2 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                  {suggestions.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Sugestões para esta tela">
                      {suggestions.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => send(s.prompt)}
                            title={s.prompt}
                            className="inline-flex min-h-9 items-center rounded-full border border-ai/25 bg-ai-soft/60 px-3 text-xs font-medium text-ai transition-colors hover:border-ai/50 hover:bg-ai-soft disabled:opacity-50"
                            data-testid={`assistant-chip-${s.id}`}
                          >
                            {s.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(text);
                    }}
                  >
                    <label htmlFor={inputId} className="sr-only">
                      Mensagem para o assistente
                    </label>
                    <textarea
                      ref={inputRef}
                      id={inputId}
                      rows={2}
                      maxLength={INPUT_MAX}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={onInputKey}
                      aria-describedby={hintId}
                      placeholder="Peça à IA…"
                      className="min-h-12 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-ai focus:outline-none focus:ring-2 focus:ring-ai/30"
                      data-testid="assistant-input"
                    />
                    <Button type="submit" variant="ai" size="icon" className="rounded-full" disabled={busy || !text.trim()} aria-label="Enviar mensagem" data-testid="assistant-send">
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </form>
                  <p id={hintId} className="hidden text-xs text-fg-faint sm:block">
                    Enter envia · Shift+Enter quebra a linha · Esc fecha
                  </p>
                </div>
              </section>
            </>
          )}
        </div>
      </OverlayPortal>
    </>
  );
}
