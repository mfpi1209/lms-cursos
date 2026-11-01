'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeroSlide {
  id: string;
  image: string;
  title: string;
  tagline?: string;
  presenter?: string;
  href: string;
  cta: string;
}

const ROTATE_MS = 7000;

/**
 * Destaque do Explorar: banners largos (marinho à esquerda, instrutor à direita) em carrossel. O texto fica sobre
 * a parte marinho do próprio banner. Gira sozinho a cada 7 s, pausa com o ponteiro, o foco ou o botão de pausa, e
 * não gira com movimento reduzido. Setas e pontos para navegar; um slide visível por vez (os outros ficam inertes).
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);
  const n = slides.length;
  const go = React.useCallback((k: number) => setI(((k % n) + n) % n), [n]);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  React.useEffect(() => {
    if (n < 2 || paused || hover || reduced) return;
    const t = window.setTimeout(() => go(i + 1), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [i, n, paused, hover, reduced, go]);

  if (!n) return null;
  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Cursos em destaque"
      className="relative overflow-hidden rounded-[20px] bg-[#1d1e4c] shadow-[0_22px_45px_-30px_rgba(29,30,76,0.6)]"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
      data-testid="explore-hero"
    >
      <div className="relative aspect-[4/3] sm:aspect-[2/1]">
        {slides.map((s, k) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="destaque"
            aria-label={`${k + 1} de ${n}: ${s.title}`}
            aria-hidden={k !== i}
            inert={k !== i}
            className={cn('absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none', k === i ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover object-[78%_20%] sm:object-right" loading={k === 0 ? 'eager' : 'lazy'} />
            {/* no celular o instrutor ocupa mais o quadro: um véu marinho embaixo garante a leitura */}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#1d1e4c] via-[#1d1e4c]/55 to-transparent sm:hidden" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:w-[52%] sm:justify-center sm:p-8 lg:p-10">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#ff9a3d]">Em destaque</p>
              <h2 className="mt-1.5 text-[28px]! font-black! leading-[1.02]! tracking-[-0.02em]! text-white! sm:text-[clamp(1.75rem,1rem+2.4vw,3rem)]!">{s.title}</h2>
              {s.tagline && <p className="mt-2 line-clamp-2 max-w-[38ch] text-[15px] leading-snug text-[#d9d8f5] sm:text-[17px]">{s.tagline}</p>}
              {s.presenter && <p className="mt-2 text-[14px] text-[#b9b7e6]">com {s.presenter}</p>}
              <div className="mt-4">
                <Link
                  href={s.href}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#FF7A08] px-6 text-[16px] font-semibold text-[#1d1e4c] shadow-[0_10px_24px_-12px_#FF7A08] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Play className="size-4 fill-current" aria-hidden="true" />
                  {s.cta}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[#1d1e4c]/70 p-1 backdrop-blur sm:bottom-4 sm:right-4 sm:top-auto">
          <button type="button" onClick={() => go(i - 1)} aria-label="Destaque anterior" className="grid size-9 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1.5 px-1" role="group" aria-label="Escolher destaque">
            {slides.map((s, k) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(k)}
                aria-label={`Destaque ${k + 1}: ${s.title}`}
                aria-current={k === i ? 'true' : undefined}
                className={cn('h-2 rounded-full transition-all motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white', k === i ? 'w-6 bg-[#FF7A08]' : 'w-2 bg-white/50 hover:bg-white/80')}
              />
            ))}
          </div>
          <button type="button" onClick={() => go(i + 1)} aria-label="Próximo destaque" className="grid size-9 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          {!reduced && (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Retomar destaques automáticos' : 'Pausar destaques automáticos'} aria-pressed={paused} className="grid size-9 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
              {paused ? <Play className="size-4 fill-current" aria-hidden="true" /> : <Pause className="size-4 fill-current" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
