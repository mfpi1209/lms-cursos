'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookOpen, Check, Clock3, Info, ListVideo, Play, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCourseVideo } from '@lms/course-schema';
import { videoShort, videoSpoken, type CourseVideo } from '../_lib/video-text';

export type { CourseVideo };

export interface CourseTileData {
  id: string;
  href: string;
  chaptersHref: string;
  /** título de apresentação (o mesmo da capa) */
  title: string;
  /** nome canônico do curso; aparece na ficha quando difere do título curto */
  fullTitle: string;
  summary?: string;
  thumb?: string;
  /** quadro com a instrutora centrada (reação), para a capa em pé sem arte */
  posterThumb?: string;
  /** capa em pé desenhada (título e marca já na arte): mostrada inteira, sem texto por cima */
  posterArt?: string;
  /** imagem do cartão deitado: banner largo do instrutor, retrato no estúdio ou quadro do vídeo (nessa ordem); `fallback` entra se a imagem não carregar */
  wide?: { src: string; kind: 'banner' | 'portrait' | 'frame'; fallback?: string };
  /** vídeo de abertura do curso (prévia muda na ficha) */
  previewSrc?: string;
  presenter?: string;
  lessons: number;
  completed: number;
  /** tempo de vídeo do percurso publicado (segundos; faixa pelos ramos) */
  video: CourseVideo;
  decisions: number;
  lessonTitles: string[];
  /** aula concluída (mesma ordem de `lessonTitles`) */
  lessonDone?: boolean[];
  /** próxima aula (base 0) */
  nextLessonIndex?: number;
  status: 'new' | 'in_progress' | 'completed';
  cta: string;
  trail?: string;
  /**
   * Conteúdo novo disponível: aula(s) acrescentada(s) depois de o aluno concluir o curso. NÃO é pendência (o curso segue
   * concluído); só um aviso com atalho para a primeira aula nova.
   */
  news?: { count: number; href: string; title: string; /** posição (base 0) das aulas novas em `lessonTitles` */ indexes: number[] };
}

/** "Novo": sinal discreto de conteúdo novo num curso concluído (não vira pendente, nem muda a %). */
export function NewContentChip({ news, className }: { news: NonNullable<CourseTileData['news']>; className?: string }) {
  return (
    <span data-testid="new-content-chip" className={cn('inline-flex items-center gap-1 rounded-full bg-white py-0.5 px-2.5 text-xs font-bold text-[#1d1e4c]', className)}>
      <Sparkles className="size-3.5" aria-hidden="true" />
      Novo
      <span className="sr-only">: conteúdo novo disponível{news.count > 1 ? ` (${news.count} aulas)` : ''}</span>
    </span>
  );
}

/** "5 min de vídeo", "6–8 min de vídeo", "Menos de 1 min de vídeo", "Duração indisponível" ou null (sem vídeo). */
export function videoLabel(v: CourseVideo, withSuffix = true): string | null {
  if (v.unavailable) return 'Duração indisponível';
  const t = formatCourseVideo(v);
  return t ? (withSuffix ? `${t} de vídeo` : t) : null;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const aulas = (n: number) => `${n} ${n === 1 ? 'aula' : 'aulas'}`;

/** "4 minutos de vídeo, 2 aulas, 6 decisões" (texto corrido, para rótulos acessíveis) */
export function courseFacts(c: Pick<CourseTileData, 'video' | 'lessons' | 'decisions'>): string {
  return [videoSpoken(c.video) ?? (c.video.unavailable ? 'duração indisponível' : null), aulas(c.lessons), c.decisions > 0 ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'}` : null].filter(Boolean).join(', ');
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

/** Pincelada laranja sob um título manuscrito. */
export function Swoosh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" className={className}>
      <path d="M3 12c38-6 92-9 194-5" fill="none" stroke="var(--im-accent)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

/** "🕒 6 min | 📖 2 aulas": ícones e texto curto para os olhos; o texto por extenso fica para o leitor de tela. */
function Facts({ c, className, compact }: { c: Pick<CourseTileData, 'video' | 'lessons'>; className?: string; compact?: boolean }) {
  const short = videoShort(c.video);
  const spoken = videoSpoken(c.video);
  return (
    <span className={cn('flex flex-wrap items-center gap-y-0.5 text-[13px] leading-tight tabular-nums', compact ? 'gap-x-1.5 text-[12px] sm:gap-x-2 sm:text-[13px]' : 'gap-x-2', className)}>
      {short && (
        <>
          <span aria-hidden="true" className="inline-flex items-center gap-1 sm:gap-1.5">
            <Clock3 className={cn('shrink-0', compact ? 'size-3.5 sm:size-4' : 'size-4')} />
            {short}
          </span>
          <span className="sr-only">{spoken}, </span>
          <span aria-hidden="true" className="opacity-50">|</span>
        </>
      )}
      <span aria-hidden="true" className="inline-flex items-center gap-1.5">
        <BookOpen className={cn('shrink-0', compact ? 'size-3.5 sm:size-4' : 'size-4')} />
        {aulas(c.lessons)}
      </span>
      <span className="sr-only">{aulas(c.lessons)}.</span>
    </span>
  );
}

const percentOf = (c: CourseTileData) => (c.status === 'completed' ? 100 : c.lessons > 0 ? Math.round((c.completed / c.lessons) * 100) : 0);

function ProgressEdge({ c }: { c: CourseTileData }) {
  if (c.status === 'new') return null;
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-white/25">
      <span className="block h-full bg-[#FF7A08]" style={{ width: `${Math.max(4, percentOf(c))}%` }} />
    </span>
  );
}

/** Imagem da ficha: prévia em vídeo da abertura (com movimento permitido) ou o quadro do vídeo. */
function DetailsMedia({ c, video, className }: { c: CourseTileData; video: boolean; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-[var(--im-media-bg)]', className)}>
      {video && c.previewSrc && !reducedMotion() ? (
        <PreviewVideo src={c.previewSrc} poster={c.thumb} className="h-full w-full object-cover object-[50%_30%]" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover object-[50%_30%]" />
      )}
      <ProgressEdge c={c} />
    </div>
  );
}

/** Ações principais da ficha: começar/continuar/rever (estado real) e Capítulos. */
function DetailsActions({ c, first }: { c: CourseTileData; first?: React.Ref<HTMLAnchorElement> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link ref={first} href={c.href} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent-fill px-4 text-[15px] font-semibold text-accent-fill-fg hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <Play className="size-4 fill-current" aria-hidden="true" />
        {c.cta}
      </Link>
      <Link href={c.chaptersHref} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <ListVideo className="size-4" aria-hidden="true" />
        Capítulos
      </Link>
    </div>
  );
}

/**
 * Corpo da ficha (igual no computador e no celular), sem cortar nada: título curto e nome completo,
 * instrutor, duração · aulas · decisões, progresso, descrição, todas as aulas (com o estado de cada uma) e trilha.
 */
function DetailsBody({ c, headingId }: { c: CourseTileData; headingId: string }) {
  const pct = percentOf(c);
  const facts = [videoLabel(c.video), `${c.lessons} ${c.lessons === 1 ? 'aula' : 'aulas'}`, c.decisions > 0 ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'}` : null].filter((x): x is string => !!x);
  return (
    <div className="space-y-4">
      <div>
        <h3 id={headingId} className="text-[20px]! font-bold! leading-tight text-fg">{c.title}</h3>
        {c.fullTitle && c.fullTitle !== c.title && <p className="mt-0.5 text-[15px] leading-snug text-fg-muted">{c.fullTitle}</p>}
      </div>
      <div className="space-y-1">
        {c.presenter && <p className="text-[15px] text-fg">Com {c.presenter}</p>}
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted" aria-label="Sobre o curso">
          {facts.map((f, i) => (
            <li key={f} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-fg/30" />}
              {i === 0 && !!videoLabel(c.video) && <Clock3 className="size-4" aria-hidden="true" />}
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <div role="progressbar" aria-label="Aulas concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${c.completed} de ${c.lessons} aulas concluídas`} className="h-1.5 overflow-hidden rounded-full bg-fg/10">
          <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${c.status === 'new' ? 0 : Math.max(4, pct)}%` }} />
        </div>
        <p className="text-sm text-fg-muted">
          {c.status === 'completed' ? 'Curso concluído' : c.status === 'in_progress' ? `${c.completed} de ${c.lessons} aulas concluídas` : 'Você ainda não começou'}
        </p>
        {c.news && (
          <p data-testid="new-content-note" className="text-sm text-fg">
            <span className="font-semibold text-[var(--im-accent-ink,var(--im-accent))]">Conteúdo novo disponível</span>
            {': '}
            <a href={c.news.href} className="underline underline-offset-4">{c.news.title}</a>
            <span className="text-fg-muted"> (opcional; o curso segue concluído)</span>
          </p>
        )}
      </div>
      {c.summary && <p className="text-[15px] leading-relaxed text-fg/85">{c.summary}</p>}
      {c.lessonTitles.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-fg">Aulas</h4>
          <ol className="mt-1.5 space-y-1.5">
            {c.lessonTitles.map((t, i) => {
              const done = !!c.lessonDone?.[i];
              const next = !done && c.nextLessonIndex === i && c.status !== 'completed';
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-fg/85">
                  <span aria-hidden="true" className={cn('mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums', done ? 'bg-accent-fill text-accent-fill-fg' : next ? 'border-2 border-[var(--im-accent)] text-fg' : 'border border-line text-fg-muted')}>
                    {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span>
                    {t}
                    <span className="sr-only">{done ? ' (concluída)' : next ? ' (próxima)' : ''}</span>
                    {!done && c.news?.indexes.includes(i) && <span className="ml-1.5 text-xs font-medium text-[var(--im-accent-ink,var(--im-accent))]">novo</span>}
                    {next && <span aria-hidden="true" className="ml-1.5 text-xs font-medium text-[var(--im-accent-ink,var(--im-accent))]">próxima</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {c.trail && <p className="text-sm text-fg-muted">Trilha: <span className="font-medium text-fg">{c.trail}</span></p>}
    </div>
  );
}

/**
 * Imagem do cartão deitado, à direita. Banner largo do instrutor: cobre o cartão todo (o marinho já está na arte).
 * Retrato ou quadro do vídeo: ocupa a direita e funde no marinho pelo degradê do cartão. O retrato do estúdio vem
 * de um endereço que pode expirar: se não carregar, entra o quadro do vídeo de abertura.
 */
function WideImage({ c }: { c: CourseTileData }) {
  const w = c.wide;
  const [failed, setFailed] = React.useState(false);
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    // erro que aconteceu antes de a página hidratar
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  if (!w) return null;
  const useFallback = failed && !!w.fallback;
  if (failed && !w.fallback) return null;
  const src = useFallback ? w.fallback! : w.src;
  const kind = useFallback ? 'frame' : w.kind;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        'absolute -z-[2] object-cover',
        kind === 'banner' ? 'inset-0 h-full w-full object-right' : 'inset-y-0 right-0 h-full w-[68%]',
        kind === 'portrait' && 'object-[50%_18%]',
        kind === 'frame' && 'object-[50%_20%]',
      )}
    />
  );
}

export type TileVariant = 'poster' | 'wide';

/**
 * Curso na fileira da vitrine. Computador: o mouse parado (ou o foco do teclado) no cartão abre a ficha
 * flutuante por cima, sem mexer no layout; dá para levar o ponteiro até ela; Esc fecha. Celular e botão ⓘ:
 * a mesma ficha completa numa janela. O botão ⓘ é irmão do link do cartão (nada interativo aninhado).
 */
export function CourseTile({ c, testId, variant = 'poster' }: { c: CourseTileData; testId?: string; variant?: TileVariant }) {
  const liRef = React.useRef<HTMLLIElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const linkRef = React.useRef<HTMLAnchorElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const openSoon = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => cardRef.current && setAnchor(cardRef.current.getBoundingClientRect()), delay);
  };
  const close = React.useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
    setPos(null);
  }, []);

  // posição: centrada no cartão, presa à janela; a altura máxima vem da janela (o conteúdo rola por dentro)
  React.useLayoutEffect(() => {
    if (!anchor) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw - 24, Math.max(380, anchor.width * 1.45));
    const left = Math.max(12, Math.min(vw - width - 12, anchor.left + anchor.width / 2 - width / 2));
    const maxHeight = vh - 24;
    const natural = panelRef.current?.scrollHeight ?? 520;
    const height = Math.min(natural, maxHeight);
    const top = Math.max(12, Math.min(vh - 12 - height, anchor.top - anchor.height * 0.12));
    setPos({ left, top, width, maxHeight });
  }, [anchor]);

  React.useEffect(() => {
    if (!anchor) return;
    const onScroll = (e: Event) => {
      // rolar dentro da ficha não fecha; rolar a página ou a fileira, sim
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside = liRef.current?.contains(document.activeElement);
      close();
      if (inside) linkRef.current?.focus();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, close]);

  const headingId = `tile-${c.id}`;

  const done = c.status === 'completed';
  const lessonsDone = c.status === 'in_progress' ? `${c.completed} de ${c.lessons} ${c.lessons === 1 ? 'aula' : 'aulas'}` : null;

  return (
    <li
      ref={liRef}
      className={variant === 'poster' ? 'flex w-[44vw] max-w-[260px] shrink-0 snap-start sm:w-[220px] xl:w-[240px] 2xl:w-[260px]' : 'flex w-[85vw] max-w-[440px] shrink-0 snap-start sm:w-[380px] xl:w-[420px]'}
      onMouseEnter={() => finePointer() && openSoon(450)}
      onMouseLeave={close}
      onFocus={(e) => {
        // foco do teclado no cartão abre a ficha (a ficha fica dentro do <li>: a ordem do Tab segue a tela)
        const t = e.target as Element;
        if (finePointer() && t === linkRef.current && t.matches(':focus-visible')) openSoon(250);
      }}
      onBlur={(e) => {
        if (!liRef.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <div ref={cardRef} className="relative w-full">
        {/* um só controle por cartão: o link é o cartão inteiro e o "botão" é só visual (nada interativo dentro dele) */}
        <Link
          ref={linkRef}
          href={c.href}
          data-testid={testId}
          className="group/cc block h-full rounded-[16px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {variant === 'poster' ? (
            <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] bg-[#1d1e4c] text-white shadow-[0_22px_45px_-30px_rgba(29,30,76,0.6)] ring-1 ring-inset ring-white/10 transition-transform duration-200 group-hover/cc:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/cc:translate-y-0">
              <div className="relative aspect-[3/4] overflow-hidden">
                {c.news && <NewContentChip news={c.news} className="absolute left-2.5 top-2.5 z-10 shadow" />}
                {c.posterArt ? (
                  // a arte é 3:4 como o cartão: aparece inteira (título, nome e rosto), sem texto por cima
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.posterArt} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                ) : (
                  <>
                    {(c.posterThumb || c.thumb) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.posterThumb ?? c.thumb} alt="" loading="lazy" className="h-full w-full origin-[50%_8%] scale-[1.3] object-cover object-[50%_12%]" />
                    )}
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#1d1e4c] via-[#1d1e4c]/30 via-45% to-transparent" />
                    <span aria-hidden="true" className="absolute inset-x-3.5 bottom-2 block">
                      <span className="font-hand line-clamp-3 block -rotate-2 text-[30px] font-bold leading-[0.95] text-white [text-wrap:balance] sm:text-[32px]">{c.title}</span>
                      <Swoosh className="mt-1 h-3 w-[68%]" />
                    </span>
                  </>
                )}
              </div>
              {/* dentro do cartão, embaixo do título: instrutor e a linha de duração e aulas */}
              <span className="relative flex flex-1 flex-col justify-center gap-1 px-3 pb-3.5 pt-2.5 sm:px-3.5">
                <span className="sr-only">{c.title}. </span>
                {/* a capa desenhada já traz "com X" na arte: aqui só para leitor de tela (sem repetir na tela) */}
                {c.presenter && <span className={c.posterArt ? 'sr-only' : 'text-[13px] leading-tight text-[#d9d8f5]'}>com {c.presenter}</span>}
                <Facts c={c} className="text-white" compact />
                <span className="sr-only">
                  {done ? 'Concluído. ' : c.status === 'in_progress' ? `${lessonsDone} concluídas. ` : 'Novo. '}
                  {c.cta}.
                </span>
              </span>
              <ProgressEdge c={c} />
            </div>
          ) : (
            <div className="relative isolate flex h-full min-h-[184px] overflow-hidden rounded-[16px] bg-[#1d1e4c] text-white shadow-[0_22px_45px_-30px_rgba(29,30,76,0.6)] ring-1 ring-inset ring-white/10 transition-transform duration-200 group-hover/cc:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/cc:translate-y-0 xl:min-h-[190px]">
              <WideImage c={c} />
              {/* a foto funde com o marinho: o texto fica sempre sobre marinho (contraste AA) */}
              <div aria-hidden="true" className={cn('absolute inset-0 -z-[1] bg-gradient-to-r from-[#1d1e4c] via-[#1d1e4c]/90 to-[#1d1e4c]/0', c.wide?.kind === 'banner' ? 'from-30% via-48%' : 'from-38% via-56%')} />
              {c.news && <NewContentChip news={c.news} className="absolute right-3 top-3 z-10 shadow" />}
              {done && (
                <span className="absolute left-4 top-3.5 inline-flex items-center gap-1 rounded-full bg-[#FF7A08] py-0.5 pl-2 pr-3 text-xs font-bold text-[#1d1e4c]">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  Concluído
                </span>
              )}
              <span className={cn('relative flex w-[70%] max-w-[300px] flex-col justify-center gap-1.5 px-4 py-3.5 sm:w-[66%] sm:px-5', done && 'pt-11')}>
                <span className="line-clamp-2 text-[18px] font-extrabold leading-[1.1] text-white [text-wrap:balance] sm:text-[20px]">{c.title}</span>
                {c.presenter && <span className="text-[13px] leading-tight text-[#d9d8f5]">com {c.presenter}</span>}
                <Facts c={c} className="text-white/90" />
                <span className="sr-only">
                  {done ? 'Concluído. ' : c.status === 'in_progress' ? `${lessonsDone} concluídas. ` : 'Novo. '}
                </span>
                <span className="mt-1 flex items-center gap-2.5 sm:gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold sm:px-4 sm:text-[14px]',
                      done ? 'border-2 border-white/85 text-white' : 'bg-[#FF7A08] text-[#1d1e4c] shadow-[0_10px_24px_-12px_#FF7A08]',
                    )}
                  >
                    <Play className="size-3.5 fill-current" />
                    {done ? 'Rever' : c.status === 'in_progress' ? 'Continuar' : 'Começar'}
                  </span>
                  <span className="sr-only">{c.cta}.</span>
                  {lessonsDone && (
                    <span aria-hidden="true" className="whitespace-nowrap text-[12px] tabular-nums text-white/90 sm:text-[13px]">
                      {lessonsDone}
                    </span>
                  )}
                </span>
              </span>
              <ProgressEdge c={c} />
            </div>
          )}
        </Link>
        {/* o botão ⓘ é irmão do link (não fica dentro dele): abre a ficha completa, também no celular */}
        <button
          type="button"
          onClick={() => {
            close();
            dialogRef.current?.showModal();
          }}
          aria-haspopup="dialog"
          aria-label={`Detalhes de ${c.title}`}
          className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-full text-white focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-accent"
        >
          <span className="grid size-9 place-items-center rounded-full bg-black/45 backdrop-blur-sm hover:bg-black/70">
            <Info className="size-[18px]" aria-hidden="true" />
          </span>
        </button>
      </div>

      {anchor && (
        // ficha flutuante (computador): fixa na janela, fora do fluxo — abrir não mexe no catálogo
        <div
          ref={panelRef}
          role="group"
          aria-labelledby={`${headingId}-pop`}
          className="fixed z-50 flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_70px_-25px_rgba(15,16,48,0.6)] motion-safe:animate-[tile-in_180ms_ease-out]"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { left: -9999, top: 0, width: 400, visibility: 'hidden' }}
        >
          <DetailsMedia c={c} video className="aspect-video max-h-[34vh] w-full" />
          <div className="border-b border-line px-4 py-3">
            <DetailsActions c={c} />
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
            <DetailsBody c={c} headingId={`${headingId}-pop`} />
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={`${headingId}-dlg`}
        className="m-auto max-h-[min(92dvh,860px)] w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 open:flex open:flex-col max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="relative shrink-0">
          <DetailsMedia c={c} video={false} className="aspect-video max-h-[30dvh] w-full" />
          <form method="dialog" className="absolute right-2 top-2">
            <button aria-label="Fechar" className="grid size-11 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
              <X className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>
        <div className="shrink-0 border-b border-line px-5 py-3">
          <DetailsActions c={c} />
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          <DetailsBody c={c} headingId={`${headingId}-dlg`} />
        </div>
      </dialog>
    </li>
  );
}
