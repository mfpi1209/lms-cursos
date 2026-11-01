import Link from 'next/link';
import { Award, Check, ListVideo, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrailSeal } from '@/components/trail-seal';
import { Segments, StatusPill, ctaOutline, ctaPrimary } from '../../_components/learner-ui';
import { partLabel, seriesLessonsCopy, seriesMetaCopy, type SeriesCardData, type SeriesPart } from '../../_lib/series';

/**
 * Trilha em série: o topo da página da trilha. Mostra o instrutor, o progresso somado, o botão certo (Começar,
 * Continuar parte N, Ver o selo) e, abaixo, cada parte com o curso, as aulas, o progresso e o próprio botão de continuar.
 * O caminho até o Selo (atividades "Na prática" e checagem final) segue nos passos logo depois.
 */
export function SeriesParts({ s, sealNote }: { s: SeriesCardData; /** o que falta para o selo, em uma frase (vem do servidor) */ sealNote: string }) {
  const done = s.status === 'completed';
  return (
    <div className="space-y-6" data-testid="series-page">
      <section aria-labelledby="series-summary-title" className="rounded-[22px] border border-line bg-surface p-5 sm:p-6" data-testid="series-summary">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {s.badge ? (
            <TrailSeal trail={s.trail} size={88} tone="light" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-fg-muted">
              <Award className="size-7" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1 basis-[16rem] space-y-1.5">
            <h2 id="series-summary-title" className="text-[20px]! font-bold! leading-snug text-fg">
              {seriesMetaCopy(s.total, s.instructor)}
            </h2>
            <p className="text-[15px] text-fg-muted">
              {s.partsDone} de {s.total} {s.total === 1 ? 'parte concluída' : 'partes concluídas'} · {seriesLessonsCopy(s.completed, s.lessons)}
            </p>
            <div role="progressbar" aria-label="Progresso na trilha" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent} aria-valuetext={seriesLessonsCopy(s.completed, s.lessons)} className="h-1.5 max-w-md overflow-hidden rounded-full bg-fg/10">
              <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${s.status === 'new' ? 0 : Math.max(4, s.percent)}%` }} />
            </div>
            <p className="text-[15px] text-fg/85" data-testid="series-seal-note">
              {sealNote}
            </p>
          </div>
          {!done && (
            <Link href={s.cta.href} className={cn(ctaPrimary, 'min-h-12 px-6')} data-testid="series-summary-cta">
              <Play className="size-4 fill-current" aria-hidden="true" />
              {s.cta.label}
            </Link>
          )}
        </div>
      </section>

      <ol className="space-y-4" aria-label="Partes da trilha">
        {s.parts.map((p) => (
          <PartCard key={p.slug} p={p} total={s.total} current={s.nextPart === p.n} />
        ))}
      </ol>
    </div>
  );
}

const STATUS_LABEL = { completed: 'Concluída', in_progress: 'Em andamento', new: 'Não iniciada' } as const;

function PartCard({ p, total, current }: { p: SeriesPart; total: number; current: boolean }) {
  if (!p.available) {
    return (
      <li className="rounded-[20px] border border-dashed border-line bg-surface p-5 sm:p-6" data-testid={`series-part-${p.n}`}>
        <p className="text-sm font-semibold text-fg-muted">{partLabel(p.n, total)}</p>
        <p className="mt-1 text-[16px] text-fg-muted">Ainda não liberada para você.</p>
      </li>
    );
  }
  const done = p.status === 'completed';
  return (
    <li className={cn('rounded-[20px] border bg-surface p-5 sm:p-6', current ? 'border-[var(--im-accent-line)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--im-accent)_25%,transparent)]' : 'border-line')} data-testid={`series-part-${p.n}`} data-status={p.status}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-[16rem] space-y-1.5">
          <p className="text-sm font-semibold text-fg-muted">{partLabel(p.n, total)}</p>
          <h3 className="text-[22px]! font-bold! leading-tight text-fg">{p.title}</h3>
          {p.fullTitle && <p className="text-[15px] text-fg-muted">{p.fullTitle}</p>}
          <StatusPill label={STATUS_LABEL[p.status]} tone={done ? 'done' : p.status === 'in_progress' ? 'accent' : 'neutral'} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={p.href} className={cn(done ? ctaOutline : ctaPrimary, 'min-h-12 px-5')} data-testid={`series-part-${p.n}-cta`}>
            {!done && <Play className="size-4 fill-current" aria-hidden="true" />}
            {done ? 'Rever' : p.cta === 'Começar' ? 'Começar' : p.cta}
            <span className="sr-only"> {partLabel(p.n, total)}: {p.title}</span>
          </Link>
          {p.chaptersHref && (
            <Link href={p.chaptersHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[15px] font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <ListVideo className="size-4" aria-hidden="true" />
              Ver capítulos
              <span className="sr-only"> da {partLabel(p.n, total)}</span>
            </Link>
          )}
        </div>
      </div>
      {p.summary && <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-fg/85">{p.summary}</p>}
      <div className="mt-4 space-y-2">
        <div role="progressbar" aria-label={`Progresso: ${partLabel(p.n, total)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.lessons > 0 ? Math.round((p.completed / p.lessons) * 100) : 0} aria-valuetext={seriesLessonsCopy(p.completed, p.lessons)} className="max-w-md">
          <Segments total={p.lessons} done={p.lessonDone} current={done ? undefined : p.nextLessonIndex} />
        </div>
        <p className="text-sm text-fg-muted">{seriesLessonsCopy(p.completed, p.lessons)}</p>
      </div>
      {p.lessonTitles.length > 0 && (
        <ol className="mt-3 space-y-1.5" aria-label={`Aulas da ${partLabel(p.n, total)}`}>
          {p.lessonTitles.map((t, i) => {
            const lessonDone = !!p.lessonDone[i];
            const next = !lessonDone && p.nextLessonIndex === i && !done;
            return (
              <li key={i} className="flex items-start gap-2.5 text-[15px] leading-snug text-fg/85">
                <span aria-hidden="true" className={cn('mt-px grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums', lessonDone ? 'bg-accent-fill text-accent-fill-fg' : next ? 'border-2 border-[var(--im-accent)] text-fg' : 'border border-line text-fg-muted')}>
                  {lessonDone ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span>
                  {t}
                  <span className="sr-only">{lessonDone ? ' (concluída)' : next ? ' (próxima)' : ''}</span>
                  {next && (
                    <span aria-hidden="true" className="ml-1.5 text-xs font-medium text-[var(--im-accent-ink,var(--im-accent))]">
                      próxima
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}
