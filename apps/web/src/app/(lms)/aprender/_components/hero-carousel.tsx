'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeroSlide {
  id: string;
  image: string;
  /** dimensões reais do arquivo (reservam o espaço: sem salto de layout) */
  width: number;
  height: number;
  /** `object-position` do quadro 16:9 */
  position?: string;
  /** etiqueta: "Em destaque", ou "Para rever e praticar" só quando o curso (ou a trilha) está mesmo concluído */
  label: string;
  title: string;
  tagline?: string;
  presenter?: string;
  href: string;
  cta: string;
}

const ROTATE_MS = 7000;

/**
 * Destaque do Explorar: quadros 16:9 (roxo à esquerda, instrutor à direita) em carrossel. O texto é HTML sobre a parte
 * roxa da própria arte (no celular estreito, num bloco roxo abaixo da imagem, sem cobrir o rosto). NÃO gira sozinho: quem
 * quiser liga a rotação pelo botão ▶ (que pausa com o ponteiro, o foco e movimento reduzido). Setas e pontos de 44 px no
 * rodapé direito; um slide visível por vez (os outros ficam inertes). Só o primeiro quadro pede prioridade de carga.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [i, setI] = React.useState(0);
  const [auto, setAuto] = React.useState(false);
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
    if (n < 2 || !auto || hover || reduced) return;
    const t = window.setTimeout(() => go(i + 1), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [i, n, auto, hover, reduced, go]);

  if (!n) return null;
  const btn = 'grid size-11 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white';
  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Cursos em destaque"
      className="relative isolate overflow-hidden rounded-[14px] bg-[#1d1e4c] shadow-[0_6px_20px_rgba(29,30,76,0.12)] md:rounded-[16px]"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
      data-testid="explore-hero"
    >
      <div className="grid">
        {slides.map((s, k) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="destaque"
            aria-label={`${k + 1} de ${n}: ${s.title}`}
            aria-hidden={k !== i}
            inert={k !== i}
            data-testid="hero-slide"
            className={cn('relative col-start-1 row-start-1 flex flex-col transition-opacity duration-500 motion-reduce:transition-none sm:aspect-video', k === i ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            <div className="relative aspect-video w-full overflow-hidden sm:absolute sm:inset-0 sm:aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image}
                alt=""
                width={s.width}
                height={s.height}
                decoding="async"
                {...(k === 0 ? { loading: 'eager' as const, fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: s.position ?? '100% 50%' }}
              />
            </div>
            <div className="relative flex flex-col gap-2 px-[18px] pb-4 pt-[18px] sm:absolute sm:inset-y-0 sm:left-0 sm:w-[52%] sm:justify-center sm:p-7">
              <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.1em] text-[#ffa257]" data-testid="hero-label">{s.label}</p>
              <h2 className="text-[22px]! font-extrabold! leading-[26px]! tracking-[-0.015em]! text-white! [text-wrap:balance] sm:text-[clamp(1.375rem,0.6rem+1.9vw,2.25rem)]! sm:leading-[1.08]!">{s.title}</h2>
              {s.tagline && <p className="line-clamp-3 max-w-[38ch] text-[14px] leading-5 text-[#e6e4fa] sm:line-clamp-2 sm:text-[15px] sm:leading-[22px] lg:max-xl:hidden xl:line-clamp-3">{s.tagline}</p>}
              {s.presenter && <p className="text-[13px] leading-[18px] text-[#d2cbf6]">com {s.presenter}</p>}
              <div className="mt-1.5">
                <Link href={s.href} data-testid="hero-cta" className="inline-flex min-h-12 items-center gap-2 rounded-[12px] bg-[#FF7A08] px-5 py-3 text-[16px] font-semibold text-[#1d1e4c] shadow-[0_10px_24px_-12px_#FF7A08] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <Play className="size-[18px] fill-current" aria-hidden="true" />
                  {s.cta}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="relative z-10 flex items-center justify-end gap-0.5 px-2 pb-2 sm:absolute sm:bottom-2 sm:right-2 sm:p-0">
          <div className="flex items-center gap-0.5 rounded-full bg-[#1d1e4c]/80 p-0.5 backdrop-blur-sm">
            <button type="button" onClick={() => go(i - 1)} aria-label="Destaque anterior" className={btn}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <p className="min-w-[3.25rem] px-1 text-center text-[13px] font-semibold tabular-nums leading-none text-white" aria-live="polite" data-testid="hero-count">
              {i + 1}<span aria-hidden="true"> / </span><span className="sr-only"> de </span>{n}
            </p>
            <button type="button" onClick={() => go(i + 1)} aria-label="Próximo destaque" className={btn}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            {!reduced && (
              <button type="button" onClick={() => setAuto((p) => !p)} aria-label={auto ? 'Pausar a troca automática dos destaques' : 'Trocar os destaques automaticamente'} aria-pressed={auto} className={btn} data-testid="hero-auto">
                {auto ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-4 fill-current" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
