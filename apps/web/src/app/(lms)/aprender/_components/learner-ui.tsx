import Link from 'next/link';
import type { Lesson } from '@lms/course-schema';
import { cn } from '@/lib/utils';

/**
 * Peças da área do aluno no visual da plataforma (servidor; sem estado).
 * Mesma linguagem do palco do player (tokens do tema: claro ou escuro), acento lima.
 */

/** Imagem do curso: o apresentador (still) fundindo no fundo do tema; sem imagem, um fundo gerado com a inicial. */
export function CourseArt({ src, title, className, fade = 'left' }: { src?: string; title: string; className?: string; fade?: 'left' | 'bottom' | 'none' }) {
  return (
    <div className={cn('relative overflow-hidden bg-[var(--im-media-bg)]', !src && 'max-sm:hidden', className)} aria-hidden="true">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover object-[center_25%]" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[image:var(--im-media-empty)]">
          <span className="text-[96px] font-semibold leading-none tracking-[-0.05em] text-fg/10 lowercase">{title.trim().charAt(0)}</span>
        </div>
      )}
      {fade === 'left' && <div className="absolute inset-0 hidden bg-[image:var(--im-art-scrim-x)] sm:block" />}
      {fade !== 'none' && <div className="absolute inset-0 bg-[image:var(--im-art-scrim-y)] sm:hidden" />}
    </div>
  );
}

/** Progresso em segmentos (um por aula). Decorativo: o texto/aria fica no chamador. */
export function Segments({ total, done, current, className }: { total: number; done: boolean[]; current?: number; className?: string }) {
  const n = Math.max(1, total);
  return (
    <span aria-hidden="true" className={cn('flex w-full items-center gap-1.5', className)}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1 min-w-3 flex-1 rounded-full',
            done[i] ? 'bg-accent-fill shadow-[inset_0_0_0_1px_var(--im-seg-ring)]' : i === current ? 'bg-[color-mix(in_oklab,var(--im-accent)_45%,transparent)] shadow-[inset_0_0_0_1px_var(--im-seg-ring)]' : 'bg-fg/15',
          )}
        />
      ))}
    </span>
  );
}

/** Pílula de estado ("EM ANDAMENTO") com ponto colorido — a mesma do palco. */
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'accent' | 'neutral' | 'done' }) {
  return (
    <span className="inline-flex w-fit self-start min-h-8 items-center gap-2 rounded-full border border-[var(--im-chip-line)] bg-[var(--im-chip)] px-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg">
      <span aria-hidden="true" className={cn('size-2 rounded-full', tone === 'accent' ? 'bg-accent-fill shadow-[0_0_0_1.5px_var(--im-seg-ring)]' : tone === 'done' ? 'bg-success' : 'bg-fg/60')} />
      {label}
    </span>
  );
}

const CTA_BASE =
  'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-6 text-base font-semibold transition-[filter,background-color,border-color] focus-visible:outline-3! focus-visible:outline-offset-2! focus-visible:outline-accent!';

/** Classes do botão principal (lima, texto marinho) e do contorno. */
export const ctaPrimary = cn(CTA_BASE, 'bg-accent-fill text-accent-fill-fg shadow-[0_10px_30px_-14px_var(--im-accent)] hover:brightness-105');
export const ctaOutline = cn(CTA_BASE, 'border border-line-strong font-medium text-fg hover:border-fg/40 hover:bg-fg/5');

/** Miniatura da aula: um quadro do primeiro vídeo dela (rota de miniatura, gerada uma vez e guardada). */
export function lessonThumbUrl(lesson: Lesson, at = 0.4): string | undefined {
  for (const n of lesson.graph.nodes) {
    const m = (n as { media?: { kind?: string; assetId?: string } | null }).media;
    if (m?.kind === 'video' && m.assetId) return `/api/assets/${m.assetId}/thumb?at=${at}`;
  }
  return undefined;
}

/**
 * Capítulo (uma aula) no trilho horizontal, estilo serviço de vídeo: quadro 16:9
 * com número, duração e barra de progresso na borda de baixo; título embaixo.
 * O cartão inteiro é o link (Começar/Continuar/Rever).
 */
export function ChapterCard({
  href,
  index,
  title,
  minutes,
  thumb,
  status,
  percent,
  isNext,
  testId,
}: {
  href: string;
  index: number;
  title: string;
  minutes: number;
  thumb?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percent: number;
  isNext: boolean;
  testId?: string;
}) {
  const action = status === 'completed' ? 'Rever' : status === 'in_progress' ? 'Continuar' : 'Começar';
  const state = status === 'completed' ? 'Concluída' : status === 'in_progress' ? `Em andamento, ${percent}%` : 'Não iniciada';
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-label={`Aula ${index}: ${title}. ${state}. ${action}.`}
      className="group/ch block w-[78vw] max-w-[320px] shrink-0 snap-start rounded-[14px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-[300px]"
    >
      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-[14px] border bg-[var(--im-media-bg)] transition-transform duration-200 group-hover/ch:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/ch:translate-y-0',
          isNext ? 'border-[var(--im-accent-line)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--im-accent)_35%,transparent)]' : 'border-line',
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[image:var(--im-media-empty)]">
            <span className="text-5xl font-semibold text-fg/15">{index}</span>
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
        <span aria-hidden="true" className="absolute left-2.5 top-2.5 grid min-w-8 place-items-center rounded-full bg-black/60 px-2 py-0.5 text-sm font-semibold tabular-nums text-white">
          {index}
        </span>
        {status === 'completed' && (
          <span aria-hidden="true" className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-accent-fill text-accent-fill-fg">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </span>
        )}
        <span aria-hidden="true" className="absolute bottom-3 right-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{minutes} min</span>
        {/* tocar: aparece ao passar o mouse ou focar */}
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover/ch:opacity-100 group-focus-visible/ch:opacity-100">
          <span className="grid size-14 place-items-center rounded-full bg-white/90 text-[#1D1E4C] shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </span>
        {status !== 'not_started' && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-accent-fill" style={{ width: `${status === 'completed' ? 100 : Math.max(4, percent)}%` }} />
          </span>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <p className="text-[13px] font-medium text-fg-muted">
          Aula {index} · {status === 'completed' ? <span className="text-success">Concluída</span> : status === 'in_progress' ? <span className="text-accent">Em andamento</span> : 'Não iniciada'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug text-fg">{title}</p>
      </div>
    </Link>
  );
}

