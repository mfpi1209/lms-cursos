'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { recapToPlainText, type ResolvedRecapItem } from '@lms/course-engine';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MissionLogger } from './mission-logger';

export interface RecapViewProps {
  /** itens já resolvidos (ver `useRecap` / `resolveRecap`) */
  items: ResolvedRecapItem[];
  title: string;
  closingLine?: string;
  /** 'page' = bloco na página de conclusão; 'drawer' = painel lateral, sem moldura própria */
  variant?: 'page' | 'drawer';
  /** chamado depois de copiar (telemetria, fechar gaveta…); a cópia em si é feita aqui */
  onCopy?: (text: string) => void;
  /** foca o título ao montar (gaveta aberta pelo aluno) */
  autoFocus?: boolean;
  /** nível do título (h2 numa gaveta própria, h3 dentro da página de conclusão) */
  headingLevel?: 2 | 3;
  /** matrícula (LMS): habilita marcar "Já experimentei" e escrever o que percebeu nas missões do roteiro */
  enrollmentId?: string;
  className?: string;
}

/**
 * "Meu roteiro": o que o aluno leva da aula, nas palavras dele. Componente
 * autocontido: não sabe nada do layout do player — recebe itens resolvidos e
 * renderiza. Só mostra o que a pessoa escreveu/escolheu e os lembretes fixos
 * do autor; fonte vazia aparece como `emptyText` em tom discreto, nunca um
 * exemplo.
 *
 * Impressão: `[data-print-target]` + `html[data-print="recap"]` (globals.css)
 * esconde todo o resto da página enquanto a caixa de impressão está aberta.
 */
export function RecapView({ items, title, closingLine, variant = 'page', onCopy, autoFocus = false, headingLevel = 3, enrollmentId, className }: RecapViewProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const closing = closingLine?.trim();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  // Foco no título quando a página aparece — só se ninguém mais (ex.: o quadro da cena) já pediu o foco.
  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      if (autoFocus || document.activeElement === document.body) el.focus({ preventScroll: !autoFocus });
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  useEffect(() => {
    if (copied === 'idle') return;
    const t = window.setTimeout(() => setCopied('idle'), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    const text = recapToPlainText(title, items, closing);
    try {
      await copyToClipboard(text);
      setCopied('done');
      onCopy?.(text);
    } catch {
      setCopied('failed');
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="player-recap"
      data-print-target
      data-variant={variant}
      className={cn('recap-page', variant === 'page' && 'rounded-[var(--radius-card)] border border-line bg-bg-2 p-5 sm:p-7', className)}
    >
      <header className="space-y-1">
        <p className="text-sm font-medium text-accent">Para levar com você</p>
        <Heading
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="display rounded-md text-2xl leading-tight text-fg focus-visible:outline-solid! focus-visible:outline-2! focus-visible:outline-offset-4! focus-visible:outline-accent/60! sm:text-3xl"
        >
          {title}
        </Heading>
        <p className="text-sm text-fg-muted">Com as suas respostas e escolhas. O que ficou em branco, você completa quando quiser.</p>
      </header>

      {items.length === 0 ? (
        <p className="mt-6 text-base text-fg-muted">Esta aula ainda não tem itens no roteiro.</p>
      ) : (
        <ol className="mt-6 space-y-5" aria-label={title}>
          {items.map((it, idx) => (
            <RecapBlock key={it.id} item={it} index={idx + 1} {...(enrollmentId ? { enrollmentId } : {})} />
          ))}
        </ol>
      )}

      {closing && (
        <p data-testid="recap-closing" className="display mt-7 border-l-4 border-accent bg-accent-soft py-3 pl-4 pr-3 text-lg leading-snug text-accent-strong sm:text-xl">
          {closing}
        </p>
      )}

      <div className="recap-actions mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button variant="secondary" className="w-full rounded-full sm:w-auto" data-testid="recap-copy" onClick={() => void copy()}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Copiar roteiro
        </Button>
        <Button variant="secondary" className="w-full rounded-full sm:w-auto" data-testid="recap-print" onClick={printRecap}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir / salvar PDF
        </Button>
        <p role="status" aria-live="polite" className={cn('text-sm', copied === 'failed' ? 'text-danger' : 'text-fg-muted')}>
          {copied === 'done' ? 'Roteiro copiado.' : copied === 'failed' ? 'Não foi possível copiar. Selecione o texto e copie manualmente.' : ''}
        </p>
      </div>
    </section>
  );
}

function RecapBlock({ item, index, enrollmentId }: { item: ResolvedRecapItem; index: number; enrollmentId?: string }) {
  const empty = item.value === null && !item.mission;
  return (
    <li data-testid={`recap-item-${item.id}`} data-empty={empty || undefined} className="grid grid-cols-[2rem_1fr] gap-x-3">
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
        {index}
      </span>
      <div className="min-w-0 pt-1">
        <h4 className="text-base font-semibold leading-snug text-fg">{item.label}</h4>
        {item.source && <p className="mt-0.5 text-xs text-fg-faint">De: {item.source.title}</p>}
        <div className="mt-2">
          {item.mission ? (
            <MissionItem item={item} {...(enrollmentId ? { enrollmentId } : {})} />
          ) : empty ? (
            <p className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-base italic text-fg-faint">{item.emptyText}</p>
          ) : Array.isArray(item.value) ? (
            <Checklist id={item.id} items={item.value} />
          ) : (
            <p className={cn('whitespace-pre-wrap text-lg leading-relaxed text-fg', item.kind === 'text' && 'text-base text-fg-muted')}>{item.value}</p>
          )}
        </div>
      </div>
    </li>
  );
}

/** Missão "Leve para a vida real" no roteiro: a ação, o estado e (no LMS) como voltar e marcar "Já experimentei". */
function MissionItem({ item, enrollmentId }: { item: ResolvedRecapItem; enrollmentId?: string }) {
  const m = item.mission!;
  return (
    <div className="space-y-3" data-testid={`recap-mission-${m.nodeId}`} data-status={m.status}>
      {m.action && <p className="whitespace-pre-line text-base leading-relaxed text-fg">{m.action}</p>}
      {m.alternative && (
        <details className="text-sm text-fg-muted">
          <summary className="min-h-8 cursor-pointer select-none font-medium text-fg">Se você ainda não trabalha</summary>
          <p className="mt-1 leading-relaxed">{m.alternative}</p>
        </details>
      )}
      {enrollmentId ? (
        <MissionLogger enrollmentId={enrollmentId} nodeId={m.nodeId} initial={{ status: m.status, note: m.note, ...(m.revision !== undefined ? { revision: m.revision } : {}) }} />
      ) : (
        <p className="text-sm font-medium text-fg" data-testid={`mission-static-${m.nodeId}`}>
          {m.status === 'done' ? 'Já experimentei' : m.status === 'later' ? 'Vou fazer depois' : item.emptyText}
          {m.status === 'done' && m.note ? `: ${m.note}` : ''}
        </p>
      )}
    </div>
  );
}

/** Checklist só visual (não é salva): serve para a pessoa marcar no papel ou na tela. */
function Checklist({ id, items }: { id: string; items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  return (
    <ul className="space-y-1.5" aria-label="Lista para marcar">
      {items.map((label, i) => {
        const inputId = `recap-${id}-${i}`;
        return (
          <li key={inputId}>
            <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 text-base leading-relaxed text-fg hover:bg-surface-2">
              <input
                id={inputId}
                type="checkbox"
                className="mt-1.5 h-4 w-4 shrink-0 accent-accent"
                checked={checked[i] ?? false}
                onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
              />
              <span className={cn(checked[i] && 'text-fg-muted line-through')}>{label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Ações                                                                     */
/* ------------------------------------------------------------------------ */

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

/** Imprime só o roteiro: liga `html[data-print="recap"]` durante a caixa de impressão. */
export function printRecap(): void {
  const root = document.documentElement;
  root.dataset.print = 'recap';
  const done = () => {
    delete root.dataset.print;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // navegadores sem afterprint confiável: limpa depois de um tempo
  window.setTimeout(done, 60_000);
  window.print();
}
