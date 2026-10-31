'use client';

import { useId, useState } from 'react';
import { ChevronDown, MessageSquareQuote } from 'lucide-react';
import type { AnyNode } from '@lms/course-schema';
import { cn } from '@/lib/utils';

/** Fala escrita do nó (o roteiro do vídeo), quando houver. */
export function narrationOf(node: AnyNode | undefined | null): string | null {
  if (!node || !('narration' in node) || typeof node.narration !== 'string') return null;
  const t = node.narration.replace(/\s+/g, ' ').trim();
  return t || null;
}

/** "O que a Marina diz" / "O que o Caio diz" / "A apresentadora diz" (sem nome). */
export function narrationHeading(presenterName?: string, pronoun?: 'she' | 'he' | 'they'): string {
  const name = presenterName?.trim();
  if (!name) return pronoun === 'he' ? 'O apresentador diz' : 'A apresentadora diz';
  const article = pronoun === 'he' ? 'o ' : pronoun === 'they' ? '' : 'a ';
  return `O que ${article}${name} diz`;
}

/** Quebra a fala em parágrafos curtos (duas frases cada), mais fáceis de ler. */
function paragraphs(text: string): string[] {
  const sentences = text.split(/(?<=[.!?…]["”»)]?)\s+(?=[A-ZÀ-Ý“"‘'(¿¡0-9])/u).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
  return out;
}

/**
 * A fala da apresentadora em texto. Sem vídeo pronto (sem mídia, mídia que
 * falhou ou não existe), o conteúdo da cena só chega por aqui: o bloco abre
 * aberto, com o título "O que a Marina diz". Com vídeo, as legendas continuam e
 * o bloco fica recolhido como "Ler a fala".
 *
 * Acessível: o título é um `<h3>` com um botão `aria-expanded` que controla a
 * região do texto. Só tokens de tema (claro/escuro).
 */
export function NarrationBlock({
  narration,
  heading,
  hasVideo,
  className,
}: {
  narration: string;
  /** título do bloco (ver `narrationHeading`) */
  heading: string;
  /** há vídeo pronto: o bloco começa recolhido, como "Ler a fala" */
  hasVideo: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!hasVideo);
  const regionId = useId();
  const label = hasVideo ? 'Ler a fala' : heading;
  return (
    <section data-testid="narration-block" data-open={open || undefined} className={cn('rounded-[16px] border border-line bg-surface-2/80 backdrop-blur-md', className)}>
      <h3 className="m-0 text-base! font-semibold! leading-snug! text-fg">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((v) => !v)}
          data-testid="narration-toggle"
          className="flex min-h-12 w-full items-center gap-3 rounded-[16px] px-4 py-2.5 text-left hover:bg-fg/5 md:px-5"
        >
          <MessageSquareQuote className="size-5 shrink-0 text-accent-strong" aria-hidden="true" />
          <span className="min-w-0 flex-1">{label}</span>
          <ChevronDown className={cn('size-5 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </h3>
      <div id={regionId} hidden={!open} className="space-y-3 border-t border-line px-4 pb-4 pt-3 md:px-5">
        {hasVideo && <p className="text-sm font-medium text-fg-muted">{heading}</p>}
        {paragraphs(narration).map((t, i) => (
          <p key={i} className="text-[17px] leading-relaxed text-fg md:text-[18px]">
            {t}
          </p>
        ))}
      </div>
    </section>
  );
}
