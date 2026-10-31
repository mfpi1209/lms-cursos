'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Fileira horizontal da vitrine: título, contagem e cartões que deslizam. Celular: desliza com o dedo e o
 * próximo cartão aparece pela metade. Computador: setas no cabeçalho da fileira (nunca por cima dos
 * cartões), desativadas quando não há mais cursos naquela direção. Só a faixa rola para o lado.
 */
export function CourseRail({ title, count, testId, children }: { title: string; count: number; testId?: string; children: React.ReactNode }) {
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
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="flex items-baseline gap-2 text-[22px]! leading-tight text-fg sm:text-[26px]!">
          {title}
          <span className="text-base font-normal text-fg-muted">{count}</span>
        </h2>
        {scrollable && (
          <div className="hidden shrink-0 gap-2 md:flex">
            <button type="button" aria-label={`Ver cursos anteriores em ${title}`} onClick={() => page(-1)} disabled={edges.start} className={arrow}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Ver mais cursos em ${title}`} onClick={() => page(1)} disabled={edges.end} className={arrow}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <ol ref={ref} onScroll={measure} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:gap-4 sm:px-8 xl:-mx-14 xl:scroll-px-14 xl:gap-5 xl:px-14 [&::-webkit-scrollbar]:hidden">
        {children}
      </ol>
    </section>
  );
}
