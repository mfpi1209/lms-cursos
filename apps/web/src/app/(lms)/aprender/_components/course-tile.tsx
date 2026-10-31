'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Clock3, Info, ListVideo, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CourseTileData {
  id: string;
  href: string;
  chaptersHref: string;
  title: string;
  summary?: string;
  thumb?: string;
  /** quadro com a instrutora centrada (reação), para a capa em pé */
  posterThumb?: string;
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
      <span aria-hidden="true" className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-accent-fill py-0.5 pl-1.5 pr-2.5 text-xs font-semibold text-accent-fill-fg">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        Concluído
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
/** Pincelada laranja sob o título manuscrito. */
export function Swoosh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" className={className}>
      <path d="M3 12c38-6 92-9 194-5" fill="none" stroke="var(--im-accent)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export type TileVariant = 'poster' | 'wide';

export function CourseTile({ c, testId, variant = 'poster' }: { c: CourseTileData; testId?: string; variant?: TileVariant }) {
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
    <li
      className={variant === 'poster' ? 'w-[46vw] max-w-[260px] shrink-0 snap-start sm:w-[220px] xl:w-[240px] 2xl:w-[260px]' : 'w-[84vw] max-w-[420px] shrink-0 snap-start sm:w-[360px] xl:w-[380px]'}
      onMouseEnter={open}
      onMouseLeave={(e) => {
        // sair do cartão para a ficha não fecha
        const to = e.relatedTarget as Node | null;
        if (to && to instanceof Node && document.querySelector('[role="group"][aria-label^="Ficha de"]')?.contains(to)) return;
        close();
      }}
    >
      <div ref={cardRef} className="relative">
        <Link
          href={c.href}
          data-testid={testId}
          aria-label={`${c.title}. ${state}. ${courseFacts(c)}. ${c.cta}.`}
          className="group/cc block rounded-[16px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {variant === 'poster' ? (
            <div className="relative aspect-[3/4] overflow-hidden rounded-[16px] bg-[#1d1e4c] shadow-[0_14px_30px_-18px_rgba(29,30,76,0.55)] transition-transform duration-200 group-hover/cc:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/cc:translate-y-0">
              {c.posterThumb || c.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.posterThumb ?? c.thumb} alt="" loading="lazy" className="h-full w-full origin-[50%_8%] scale-[1.3] object-cover object-[50%_12%]" />
              ) : null}
              {/* capa em pé: título manuscrito com pincelada laranja sobre a instrutora */}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#12132f]/95 via-[#12132f]/30 via-45% to-transparent" />
              <Badge status={c.status} />
              <span aria-hidden="true" className="absolute inset-x-3.5 bottom-3.5 block">
                <span className="font-hand line-clamp-3 -rotate-2 text-[30px] font-bold leading-[0.95] text-white [text-wrap:balance] sm:text-[32px]">{c.title}</span>
                <Swoosh className="mt-1 h-3 w-[68%]" />
                <span className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-white/90">
                  <Clock3 className="size-4" aria-hidden="true" />
                  {c.minutes > 0 ? `${c.minutes} min` : `${c.lessons} aulas`}
                </span>
              </span>
              <ProgressEdge c={c} />
            </div>
          ) : (
            <div className="relative flex aspect-[2.6/1] overflow-hidden rounded-[16px] bg-[#1d1e4c] shadow-[0_14px_30px_-18px_rgba(29,30,76,0.55)] transition-transform duration-200 group-hover/cc:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/cc:translate-y-0">
              {(c.posterThumb || c.thumb) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.posterThumb ?? c.thumb} alt="" loading="lazy" className="absolute inset-y-0 right-0 h-full w-[62%] object-cover object-[50%_20%]" />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#1d1e4c] from-40% via-[#1d1e4c]/70 via-55% to-transparent" />
              <span aria-hidden="true" className="relative flex max-w-[62%] flex-col justify-center gap-1.5 p-4">
                <span className="line-clamp-2 text-[17px] font-bold leading-tight text-white">{c.title}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-white/85">
                  <Clock3 className="size-4" aria-hidden="true" />
                  {c.minutes > 0 ? `${c.minutes} min` : `${c.lessons} aulas`}
                </span>
              </span>
              <span aria-hidden="true" className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-white/90 text-[#1d1e4c] shadow-lg transition-transform group-hover/cc:scale-105">
                <Play className="ml-0.5 size-5 fill-current" />
              </span>
              <Badge status={c.status} />
              <ProgressEdge c={c} />
            </div>
          )}
          {variant === 'poster' && c.status === 'in_progress' && <p className="mt-2 text-sm tabular-nums text-fg-muted">{c.completed} de {c.lessons} aulas</p>}
        </Link>
        {/* camada com a proporção da capa: o botão de detalhes fica no canto de cima dela */}
        <div className={cn('pointer-events-none absolute inset-x-0 top-0', variant === 'poster' ? 'aspect-[3/4]' : 'aspect-[2.6/1]')}>
          <button
            type="button"
            onClick={() => {
              close();
              dialogRef.current?.showModal();
            }}
            aria-label={`Detalhes de ${c.title}`}
            className="pointer-events-auto absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/45 text-white opacity-90 backdrop-blur-sm hover:bg-black/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

