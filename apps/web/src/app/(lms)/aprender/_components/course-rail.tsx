'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Fileira horizontal da vitrine: título e cartões que deslizam. Celular: desliza com o dedo, com encaixe (snap), e o
 * próximo cartão aparece pela beirada. Computador: setas ‹ › no canto superior direito da fileira (nunca por cima
 * dos cartões), desativadas quando não há mais cursos naquela direção. Só a faixa rola para o lado.
 */
export function CourseRail({ title, count, countLabel, testId, progress, href, hrefLabel = 'Ver trilha', children }: { title: string; count: number; /** leitor de tela: substitui "N cursos" (ex.: "trilha em 3 partes") */ countLabel?: string; testId?: string; /** linha de progresso sob o título (ex.: "1 de 3 concluídos") */ progress?: string; /** página da trilha */ href?: string; hrefLabel?: string; children: React.ReactNode }) {
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

  const arrow = 'grid size-11 place-items-center rounded-full border border-line bg-surface text-fg transition-opacity hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35 disabled:hover:bg-surface';
  const scrollable = !(edges.start && edges.end);

  return (
    <section aria-labelledby={headingId} className="space-y-3" data-testid={testId}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[22px]! leading-tight text-fg sm:text-[26px]!">
            {title}
            <span className="sr-only">, {countLabel ?? `${count} ${count === 1 ? 'curso' : 'cursos'}`}</span>
          </h2>
          {progress && <p className="mt-0.5 text-[15px] text-fg-muted">{progress}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link href={href} aria-label={`${hrefLabel}: ${title}`} className="inline-flex min-h-11 items-center gap-0.5 rounded-full px-2 text-[15px] font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {hrefLabel}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          )}
          {scrollable && (
            <div className="hidden gap-2 md:flex">
              <button type="button" aria-label={`Ver cursos anteriores em ${title}`} onClick={() => page(-1)} disabled={edges.start} className={arrow}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Ver mais cursos em ${title}`} onClick={() => page(1)} disabled={edges.end} className={arrow}>
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
      <ol ref={ref} onScroll={measure} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:gap-4 sm:px-8 xl:-mx-14 xl:scroll-px-14 xl:gap-5 xl:px-14 [&::-webkit-scrollbar]:hidden">
        {children}
      </ol>
    </section>
  );
}
