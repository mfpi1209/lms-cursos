'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookOpen, Check, Clock3, Info, ListVideo, Play, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCourseVideo } from '@lms/course-schema';
import { videoShort, videoSpoken, type CourseVideo } from '../_lib/video-text';
import type { CoverArt } from '../_lib/course-art';

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
  /** quadro com a instrutora centrada (reação): retrato de reserva quando o curso não tem arte */
  posterThumb?: string;
  /** capa em pé antiga (título na arte): só reserva */
  posterArt?: string;
  /** imagem antiga do cartão deitado (banner, retrato do estúdio ou quadro do vídeo): reserva quando o curso não tem arte */
  wide?: { src: string; kind: 'banner' | 'portrait' | 'frame'; fallback?: string };
  /** arte da vitrine (WebP em `public/capas`, sem texto): título e dados são HTML sobre o cartão */
  art?: CoverArt;
  /** vídeo de abertura do curso (não usado nos cartões: sem vídeo automático na vitrine) */
  previewSrc?: string;
  presenter?: string;
  /** aulas obrigatórias (base do progresso: "x de y concluídas"); para MOSTRAR o total use `lessonsTotal` */
  lessons: number;
  /** TODAS as aulas da versão matriculada (inclusive as opcionais de quem já concluiu): é o número dos cartões e da ficha */
  lessonsTotal: number;
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
    <span data-testid="new-content-chip" className={cn('inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-bold leading-4 text-[#1d1e4c]', className)}>
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

const aulas = (n: number) => `${n} ${n === 1 ? 'aula' : 'aulas'}`;

/** "4 minutos de vídeo, 2 aulas, 6 decisões" (texto corrido, para rótulos acessíveis) */
export function courseFacts(c: Pick<CourseTileData, 'video' | 'lessonsTotal' | 'decisions'>): string {
  return [videoSpoken(c.video) ?? (c.video.unavailable ? 'duração indisponível' : null), aulas(c.lessonsTotal), c.decisions > 0 ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'}` : null].filter(Boolean).join(', ');
}

const percentOf = (c: Pick<CourseTileData, 'status' | 'lessons' | 'completed'>) => (c.status === 'completed' ? 100 : c.lessons > 0 ? Math.round((c.completed / c.lessons) * 100) : 0);

/**
 * Imagem de um cartão ou quadro: a arte da vitrine e, se ela não carregar (ou o curso não tiver arte), os retratos de
 * reserva em ordem; sem nenhum, um fundo marinho com a inicial. O quadro tem proporção fixa: nada muda de lugar quando a
 * imagem chega ou falha. Só a primeira imagem da página pede prioridade (`priority`); as demais são preguiçosas.
 */
export function CoverImage({ art, fallbacks = [], format, title, priority = false, className, position }: { art?: CoverArt; fallbacks?: Array<string | undefined>; format: 'portrait' | 'landscape' | 'wide'; title: string; priority?: boolean; className?: string; position?: string }) {
  const sources = React.useMemo(() => [...(art ? [art.src] : []), ...fallbacks.filter((s): s is string => !!s)], [art, fallbacks]);
  const [i, setI] = React.useState(0);
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    // erro que aconteceu antes de a página hidratar
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setI((n) => n + 1);
  }, []);
  const src = sources[i];
  if (!src) {
    return (
      <span aria-hidden="true" data-testid="cover-missing" className={cn('absolute inset-0 -z-[2] grid place-items-center bg-[image:radial-gradient(60%_70%_at_65%_40%,#2a2c64_0%,#171840_70%)]', className)}>
        <span className="text-[72px] font-bold leading-none text-white/15">{title.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
      </span>
    );
  }
  const native = i === 0 && !!art;
  const pos = native && art ? (position ?? art.position[format]) : '50% 20%';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={src}
      src={src}
      alt=""
      width={native ? art!.width : format === 'landscape' ? 1448 : 1086}
      height={native ? art!.height : format === 'landscape' ? 1086 : 1448}
      loading={priority ? 'eager' : 'lazy'}
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setI((n) => n + 1)}
      className={cn('dna-card__img', className)}
      style={{ objectPosition: pos }}
    />
  );
}

/** "🕒 6 min · 📖 2 aulas (· 1 de 2 concluídas)": ícones e texto curto para os olhos; o texto por extenso fica para o leitor de tela. */
function CardMeta({ c }: { c: CourseTileData }) {
  const short = videoShort(c.video);
  const spoken = videoSpoken(c.video);
  return (
    <ul className="dna-card__meta" data-testid="card-meta">
      {short && (
        <li>
          <Clock3 className="size-4 shrink-0" aria-hidden="true" />
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{spoken}</span>
        </li>
      )}
      <li>
        <BookOpen className="size-4 shrink-0" aria-hidden="true" />
        {aulas(c.lessonsTotal)}
      </li>
    </ul>
  );
}

/** Barra de progresso na borda de baixo do cartão: só a fração REAL concluída (curso novo não tem barra). */
function ProgressEdge({ c }: { c: Pick<CourseTileData, 'status' | 'lessons' | 'completed'> }) {
  const pct = percentOf(c);
  if (c.status === 'new' || pct <= 0) return null;
  return (
    <span aria-hidden="true" className="dna-card__progress" data-testid="card-progress">
      <span style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  );
}

/** Quadro 16:9 da ficha: a arte (corte da parte de cima, onde está o rosto) ou o retrato de reserva. */
function DetailsMedia({ c, className }: { c: CourseTileData; className?: string }) {
  return (
    <div className={cn('relative isolate shrink-0 overflow-hidden bg-[#1d1e4c]', className)}>
      <CoverImage art={c.art} fallbacks={[c.thumb, c.wide?.src]} format="wide" title={c.title} />
      {c.status !== 'new' && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
          <span className="block h-full bg-[#FF7A08]" style={{ width: `${percentOf(c)}%` }} />
        </span>
      )}
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
 * Corpo da ficha, sem cortar nada: título curto e nome completo, instrutor, duração · aulas · decisões, progresso,
 * descrição, todas as aulas (com o estado de cada uma) e trilha.
 */
function DetailsBody({ c, headingId }: { c: CourseTileData; headingId: string }) {
  const pct = percentOf(c);
  const facts = [videoLabel(c.video), aulas(c.lessonsTotal), c.decisions > 0 ? `${c.decisions} ${c.decisions === 1 ? 'decisão' : 'decisões'}` : null].filter((x): x is string => !!x);
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
          <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${c.status === 'new' ? 0 : pct}%` }} />
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
 * Ficha do curso numa janela (dialog nativo): título, descrição, duração e aulas reais e a ação Começar/Continuar/Rever.
 * Abre por clique, toque ou teclado no botão ⓘ; Esc ou o X fecham e o foco volta ao botão. Só existe enquanto aberta
 * (nenhuma imagem da ficha carrega antes de alguém abrir).
 */
function DetailsDialog({ c, headingId, onClose }: { c: CourseTileData; headingId: string; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = ref.current;
    // sem `close()` na limpeza: o StrictMode (dev) roda a limpeza logo depois de montar e o evento `close` desmontaria a ficha
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      data-testid="course-details"
      className="m-auto max-h-[min(92dvh,860px)] w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 open:flex open:flex-col max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="relative shrink-0">
        <DetailsMedia c={c} className="aspect-video max-h-[30dvh] w-full" />
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
        <DetailsBody c={c} headingId={headingId} />
      </div>
    </dialog>
  );
}

export type TileVariant = 'landscape' | 'portrait';

/**
 * Curso na vitrine: cartão com a arte ao fundo e TODO o conteúdo em HTML dentro dele (título inteiro, instrutor, duração,
 * aulas, estado e progresso reais). `landscape` = 4:3 (seções de 3 cursos; as capas em pé são cortadas na parte de cima,
 * onde está o rosto); `portrait` = 3:4 (fileira de 5).
 *
 * O título é o link e cobre o cartão inteiro (`after:` esticado); o botão ⓘ é IRMÃO do link, em camada própria, e abre a
 * ficha completa por clique, toque ou teclado (sem popover por hover). O mouse só levanta o cartão (ponteiro fino).
 */
export function CourseTile({ c, testId, variant = 'landscape', priority = false }: { c: CourseTileData; testId?: string; variant?: TileVariant; priority?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const infoRef = React.useRef<HTMLButtonElement>(null);
  const headingId = `tile-${c.id}`;
  const done = c.status === 'completed';
  const inProgress = c.status === 'in_progress';
  const portrait = variant === 'portrait';
  // a arte deitada (4:3) preenche o cartão e já traz o roxo embaixo; a em pé cortada em 4:3 perde o roxo e ganha um véu leve
  const nativeFit = !!c.art && ((variant === 'landscape' && c.art.format === 'landscape') || (variant === 'portrait' && c.art.format === 'portrait'));
  const fallbacks = React.useMemo(() => [c.posterThumb, c.wide?.src, c.thumb, c.wide?.fallback], [c.posterThumb, c.wide?.src, c.wide?.fallback, c.thumb]);
  const status = done ? 'Concluído' : inProgress ? `Em andamento, ${c.completed} de ${c.lessons} aulas concluídas` : 'Ainda não começou';

  return (
    <li className="dna-li" data-status={c.status}>
      <div className={cn('dna-card', portrait ? 'dna-card--portrait' : 'dna-card--landscape')}>
        <CoverImage art={c.art} fallbacks={fallbacks} format={variant} title={c.title} priority={priority} />
        <span aria-hidden="true" className={cn('dna-card__scrim', nativeFit ? 'dna-card__scrim--soft' : 'dna-card__scrim--full')} />
        <div className={cn('dna-card__box', portrait && 'dna-card__box--portrait')}>
          {/* estado: só dado real (concluído, em andamento, conteúdo novo); curso que não começou não tem selo */}
          {(done || inProgress || c.news) && (
            <div className="dna-card__top">
              {done && (
                <span className="dna-card__badge" data-testid="card-done">
                  <span className="grid size-4 place-items-center rounded-full bg-[#FF7A08] text-[#1d1e4c]">
                    <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
                  </span>
                  Concluído
                </span>
              )}
              {inProgress && (
                <span className="dna-card__badge" data-testid="card-progress-badge">
                  <span className="sr-only md:not-sr-only">Em andamento</span>
                  <span className="font-semibold tabular-nums text-[#ffb070]">
                    {c.completed}/{c.lessons}
                    <span className="sr-only"> aulas concluídas{' '}(em andamento)</span>
                  </span>
                </span>
              )}
              {c.news && <NewContentChip news={c.news} />}
            </div>
          )}
          <div className="dna-card__text">
            <h3 className="dna-card__title">
              <Link href={c.href} data-testid={testId} className="dna-card__link">
                {c.title}
                <span className="sr-only">
                  . {status}. {c.cta}.
                </span>
              </Link>
            </h3>
            {c.presenter && <p className="dna-card__by">com {c.presenter}</p>}
            <CardMeta c={c} />
          </div>
        </div>
        <ProgressEdge c={c} />
        {/* o botão ⓘ é irmão do link (nada interativo dentro dele): abre a ficha completa, também no celular e pelo teclado */}
        <button type="button" ref={infoRef} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Detalhes de ${c.title}`} className="dna-card__info" data-testid="card-info">
          <span>
            <Info className="size-5" aria-hidden="true" />
          </span>
        </button>
      </div>
      {open && (
        <DetailsDialog
          c={c}
          headingId={`${headingId}-dlg`}
          onClose={() => {
            setOpen(false);
            infoRef.current?.focus();
          }}
        />
      )}
    </li>
  );
}
