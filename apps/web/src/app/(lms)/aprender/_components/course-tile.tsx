'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Info, ListVideo, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CourseTileData {
  id: string;
  href: string;
  chaptersHref: string;
  title: string;
  summary?: string;
  thumb?: string;
  /** vídeo de abertura do curso (prévia muda na ficha) */
  previewSrc?: string;
  presenter?: string;
  lessons: number;
  completed: number;
  minutes: number;
  decisions: number;
  lessonTitles: string[];
  status: 'new' | 'in_progress' | 'completed';
  cta: string;
  trail?: string;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** "≈ 8 min · 2 aulas · 6 decisões" */
export function courseFacts(c: Pick<CourseTileData, 'minutes' | 'lessons' | 'decisions'>): string {
  return [c.minutes > 0 ? `≈ ${c.minutes} min` : null, `${c.lessons} ${c.lessons === 1 ? 'aula' : 'aulas'}`, c.decisions > 0 ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'}` : null].filter(Boolean).join(' · ');
}

/** Vídeo mudo em laço curto (prévia): só toca com movimento permitido; pausa fora da tela. */
export function PreviewVideo({ src, poster, className, startAt = 2, seconds = 12, muted = true, onPlaying }: { src: string; poster?: string; className?: string; startAt?: number; seconds?: number; muted?: boolean; onPlaying?: () => void }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v || reducedMotion()) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) void v.play().catch(() => undefined);
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  React.useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return (
    <video
      ref={ref}
      src={`${src}#t=${startAt}`}
      poster={poster}
      muted={muted}
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      className={className}
      onPlaying={onPlaying}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.currentTime > startAt + seconds) v.currentTime = startAt;
      }}
      onEnded={(e) => {
        e.currentTarget.currentTime = startAt;
        void e.currentTarget.play().catch(() => undefined);
      }}
    />
  );
}

function Badge({ status }: { status: CourseTileData['status'] }) {
  if (status === 'new') return <span aria-hidden="true" className="absolute left-2.5 top-2.5 rounded-full bg-accent-fill px-2.5 py-0.5 text-xs font-semibold text-accent-fill-fg">Novo</span>;
  if (status === 'completed')
    return (
      <span aria-hidden="true" className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-accent-fill text-accent-fill-fg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
      </span>
    );
  return null;
}

function ProgressEdge({ c }: { c: CourseTileData }) {
  if (c.status === 'new') return null;
  const pct = c.status === 'completed' ? 100 : c.lessons > 0 ? Math.round((c.completed / c.lessons) * 100) : 0;
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
      <span className="block h-full bg-accent-fill" style={{ width: `${Math.max(4, pct)}%` }} />
    </span>
  );
}

/** Conteúdo da ficha (o mesmo na ficha de passar o mouse e na janela de detalhes). */
function Details({ c, headingId, compact }: { c: CourseTileData; headingId?: string; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={c.href} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent-fill px-4 text-[15px] font-semibold text-accent-fill-fg hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Play className="size-4 fill-current" aria-hidden="true" />
          {c.cta}
        </Link>
        <Link href={c.chaptersHref} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ListVideo className="size-4" aria-hidden="true" />
          Capítulos
        </Link>
      </div>
      <div>
        <h3 id={headingId} className="text-[18px] font-semibold leading-snug text-fg">{c.title}</h3>
        <p className="mt-1 text-sm text-fg-muted">
          {[c.presenter, courseFacts(c)].filter(Boolean).join(' · ')}
          {c.status === 'in_progress' && ` · ${c.completed} de ${c.lessons} concluídas`}
        </p>
      </div>
      {c.summary && <p className={cn('text-[15px] leading-relaxed text-fg/85', compact && 'line-clamp-3')}>{c.summary}</p>}
      {c.lessonTitles.length > 0 && (
        <ol className="space-y-1 text-sm text-fg/80">
          {c.lessonTitles.slice(0, compact ? 3 : 20).map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-5 shrink-0 tabular-nums text-fg-muted">{i + 1}</span>
              <span className="line-clamp-1">{t}</span>
            </li>
          ))}
          {compact && c.lessonTitles.length > 3 && <li className="pl-7 text-fg-muted">e mais {c.lessonTitles.length - 3}</li>}
        </ol>
      )}
      {c.trail && <p className="text-xs text-fg-muted">Trilha: {c.trail}</p>}
    </div>
  );
}

/**
 * Curso na fileira da vitrine (modelo serviço de vídeo). Capa 16:9 com selo, duração e progresso.
 * Mouse parado em cima (computador): abre a ficha por cima, com prévia em vídeo, resumo e aulas.
 * Botão de detalhes (todas as telas e teclado): a mesma ficha numa janela.
 */
export function CourseTile({ c, testId }: { c: CourseTileData; testId?: string }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const [hover, setHover] = React.useState<DOMRect | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const open = () => {
    if (!finePointer()) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => cardRef.current && setHover(cardRef.current.getBoundingClientRect()), 450);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    setHover(null);
  };
  React.useEffect(() => {
    if (!hover) return;
    const off = () => setHover(null);
    window.addEventListener('scroll', off, { passive: true, capture: true });
    window.addEventListener('resize', off);
    return () => {
      window.removeEventListener('scroll', off, { capture: true });
      window.removeEventListener('resize', off);
    };
  }, [hover]);

  const state = c.status === 'completed' ? 'Concluído' : c.status === 'in_progress' ? `${c.completed} de ${c.lessons} aulas concluídas` : 'Novo';
  const headingId = `tile-${c.id}`;

  // ficha flutuante: 1,5× a largura do cartão, centrada nele e presa à janela
  let panel: React.ReactNode = null;
  if (hover && mounted) {
    const w = Math.min(window.innerWidth - 24, hover.width * 1.5);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, hover.left + hover.width / 2 - w / 2));
    const top = Math.max(12, hover.top - hover.height * 0.25);
    panel = createPortal(
      <div
        role="group"
        aria-label={`Ficha de ${c.title}`}
        onMouseLeave={close}
        className="fixed z-50 overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_70px_-25px_rgba(15,16,48,0.6)] motion-safe:animate-[tile-in_180ms_ease-out]"
        style={{ left, top, width: w }}
      >
        <div className="relative aspect-video bg-[var(--im-media-bg)]">
          {c.previewSrc && !reducedMotion() ? (
            <PreviewVideo src={c.previewSrc} poster={c.thumb} className="h-full w-full object-cover object-[50%_30%]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover object-[50%_30%]" />
          )}
          <ProgressEdge c={c} />
        </div>
        <div className="p-4">
          <Details c={c} compact />
        </div>
      </div>,
      // dentro da área com as cores da marca (fora dela os tokens voltam ao tema padrão)
      cardRef.current?.closest('.theme-platform') ?? document.body,
    );
  }

  return (
    <li className="w-[72vw] max-w-[300px] shrink-0 snap-start sm:w-[280px] xl:w-[300px] 2xl:w-[330px] 2xl:max-w-[330px]" onMouseEnter={open} onMouseLeave={(e) => {
      // sair do cartão para a ficha não fecha
      const to = e.relatedTarget as Node | null;
      if (to && to instanceof Node && document.querySelector('[role="group"][aria-label^="Ficha de"]')?.contains(to)) return;
      close();
    }}>
      <div ref={cardRef} className="relative">
        <Link
          href={c.href}
          data-testid={testId}
          aria-label={`${c.title}. ${state}. ${courseFacts(c)}. ${c.cta}.`}
          className="group/cc block rounded-[14px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <div className="relative aspect-video overflow-hidden rounded-[14px] border border-line bg-[var(--im-media-bg)]">
            {c.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.thumb} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_30%]" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[image:var(--im-media-empty)]">
                <span className="text-5xl font-semibold lowercase text-fg/15">{c.title.trim().charAt(0)}</span>
              </div>
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
            <Badge status={c.status} />
            <span aria-hidden="true" className="absolute bottom-3 left-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{courseFacts(c)}</span>
            <ProgressEdge c={c} />
          </div>
          <p className="mt-2.5 line-clamp-2 text-[17px] font-semibold leading-snug text-fg">{c.title}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{[c.presenter, c.status === 'in_progress' ? `${c.completed} de ${c.lessons} aulas` : null].filter(Boolean).join(' · ') || c.cta}</p>
        </Link>
        {/* camada com a mesma proporção da capa: o botão de detalhes fica no canto de baixo dela */}
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-video">
          <button
            type="button"
            onClick={() => {
              close();
              dialogRef.current?.showModal();
            }}
            aria-label={`Detalhes de ${c.title}`}
            className="pointer-events-auto absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Info className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
      {panel}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${headingId}-dlg`}
        className="m-auto w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 max-sm:mb-0 max-sm:rounded-b-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="relative aspect-video bg-[var(--im-media-bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover object-[50%_30%]" />}
          <ProgressEdge c={c} />
          <form method="dialog" className="absolute right-3 top-3">
            <button aria-label="Fechar" className="grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
              <X className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
        <div className="max-h-[50dvh] overflow-y-auto p-5">
          <Details c={c} headingId={`${headingId}-dlg`} />
        </div>
      </dialog>
    </li>
  );
}

/**
 * Fundo do destaque: a imagem e, por cima, a prévia em vídeo da instrutora (muda, em laço, como o trailer de
 * um serviço de vídeo). Botão "Ouvir" liga o som; com movimento reduzido fica só a imagem.
 */
export function HeroBackdrop({ image, videoSrc }: { image?: string; videoSrc?: string }) {
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const cls = 'absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[50%_30%] sm:w-[68%]';
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="" aria-hidden="true" className={cls} />}
      {videoSrc && <PreviewVideo src={videoSrc} poster={image} muted={muted} startAt={1} seconds={20} onPlaying={() => setPlaying(true)} className={cn(cls, 'transition-opacity duration-700', playing ? 'opacity-100' : 'opacity-0')} />}
      {videoSrc && playing && (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={!muted}
          className="absolute right-4 top-4 z-10 inline-flex sm:bottom-4 sm:top-auto min-h-11 items-center gap-2 rounded-full border border-white/40 bg-black/45 px-4 text-sm font-semibold text-white backdrop-blur hover:bg-black/60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {muted ? 'Ouvir' : 'Sem som'}
        </button>
      )}
    </>
  );
}
