'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Fileira horizontal da vitrine (modelo serviço de vídeo): título, contagem e cartões que deslizam.
 * No celular, desliza com o dedo; no computador, setas aparecem nas bordas quando há mais cartões.
 */
export function CourseRail({ title, count, testId, children }: { title: string; count: number; testId?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
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

  const headingId = `rail-${title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}`;
  const arrow = 'absolute top-[calc(50%-1.5rem)] z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/95 text-fg shadow-lg backdrop-blur transition-opacity hover:bg-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent md:grid';

  return (
    <section aria-labelledby={headingId} className="space-y-3" data-testid={testId}>
      <h2 id={headingId} className="flex items-baseline gap-2 text-[22px] leading-tight text-fg sm:text-[26px]">
        {title}
        <span className="text-base font-normal text-fg-muted">{count}</span>
      </h2>
      <div className="relative">
        <button type="button" aria-label={`Ver cursos anteriores em ${title}`} onClick={() => page(-1)} className={cn(arrow, 'left-1 xl:left-3', edges.start && 'invisible opacity-0')} tabIndex={edges.start ? -1 : 0}>
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <ol ref={ref} onScroll={measure} className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 xl:-mx-14 xl:scroll-px-14 xl:gap-5 xl:px-14 [&::-webkit-scrollbar]:hidden">
          {children}
        </ol>
        <button type="button" aria-label={`Ver mais cursos em ${title}`} onClick={() => page(1)} className={cn(arrow, 'right-1 xl:right-3', edges.end && 'invisible opacity-0')} tabIndex={edges.end ? -1 : 0}>
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
