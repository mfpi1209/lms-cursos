'use client';

import { Children, useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Como a fileira organiza os cartões (CSS em globals.css, `.dna-rail--*`):
 * - `wide3`: três cartões 4:3 que preenchem a linha no computador (≥ 1024 px); abaixo, trilho com dois e um pedaço do próximo;
 * - `portrait5`: cinco cartões 3:4 em colunas (≥ 1100 px); abaixo, trilho de cartões de 172–220 px;
 * - `trails`: cartões das trilhas, três por vez no computador largo e dois e meio abaixo (a 4ª sempre alcançável pelo trilho);
 * - `cards`: trilho simples de cartões 4:3 (usado em "Minhas trilhas").
 */
export type RailLayout = 'cards' | 'wide3' | 'portrait5' | 'trails';

/**
 * Seção da vitrine: título, andamento real e link da trilha, com os cartões numa grade ou num trilho que desliza.
 * Celular: desliza com o dedo (encaixe proximity), o próximo cartão aparece pela beirada. Computador: setas ‹ › no canto
 * superior direito da seção (nunca por cima dos cartões) quando há cartões fora da vista, desativadas na ponta. Só a faixa
 * rola para o lado; a página nunca.
 */
export function CourseRail({
  title,
  count,
  countLabel,
  testId,
  progress,
  href,
  hrefLabel = 'Ver trilha',
  layout = 'cards',
  className,
  lead,
  children,
}: {
  title: string;
  count: number;
  /** leitor de tela: substitui "N cursos" (ex.: "trilha em 3 partes") */
  countLabel?: string;
  testId?: string;
  /** linha de progresso sob o título (ex.: "1 de 3 concluídos") */
  progress?: string;
  /** página da trilha */
  href?: string;
  hrefLabel?: string;
  layout?: RailLayout;
  className?: string;
  /** itens (`<li>`) acima do trilho, em largura total (o cartão da trilha escolhida no filtro) */
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const headingId = useId();
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.85), behavior: reduce ? 'auto' : 'smooth' });
  };

  const arrow = 'grid size-11 place-items-center rounded-full border border-line bg-surface text-fg transition-opacity hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--dna-focus)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-surface';
  const scrollable = !(edges.start && edges.end);

  return (
    <section aria-labelledby={headingId} className={cn('dna-section', className)} data-testid={testId}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[21px]! font-bold! leading-[27px]! tracking-[-0.01em]! text-fg md:text-[24px]! md:leading-[30px]!">
            {title}
            <span className="sr-only">, {countLabel ?? `${count} ${count === 1 ? 'curso' : 'cursos'}`}</span>
          </h2>
          {progress && <p className="mt-1 text-[14px] leading-5 text-fg-muted md:text-[15px]">{progress}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {href && (
            <Link href={href} aria-label={`${hrefLabel}: ${title}`} className="inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-[13px] font-semibold leading-[18px] text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--dna-focus)] md:text-[14px] md:leading-5">
              {hrefLabel}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          )}
          {scrollable && (
            <div className="hidden gap-2 md:flex">
              <button type="button" aria-label={`Ver anteriores em ${title}`} onClick={() => page(-1)} disabled={edges.start} className={arrow}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Ver mais em ${title}`} onClick={() => page(1)} disabled={edges.end} className={arrow}>
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
      {lead && <ul className="mt-3 list-none p-0">{lead}</ul>}
      {Children.count(children) > 0 && (
        <ol ref={ref} onScroll={measure} className={cn('dna-rail', lead ? 'mt-2' : 'mt-3', `dna-rail--${layout}`)}>
          {children}
        </ol>
      )}
    </section>
  );
}
