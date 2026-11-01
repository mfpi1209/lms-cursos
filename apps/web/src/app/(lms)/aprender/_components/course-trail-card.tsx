import Link from 'next/link';
import { Award, Check, Trophy } from 'lucide-react';
import { trailSlug } from '@lms/course-schema';
import type { recognition } from '@lms/db';
import { cn } from '@/lib/utils';
import { TrailSeal } from '@/components/trail-seal';
import { trailSealNote } from '../_lib/trail-note';

type TrailStatus = Awaited<ReturnType<typeof recognition.trailStatus>>;

/**
 * Ficha do curso: a conquista deste curso (só dentro da plataforma) e a trilha da qual ele faz parte, com o
 * progresso e o que falta para o Selo DNA Work da trilha (que é o reconhecimento para o currículo).
 */
export function CourseTrailCard({ status, courseDone, courseLabel, part }: { status: TrailStatus; courseDone: boolean; courseLabel: string; /** o curso é uma parte de uma trilha em série */ part?: { n: number; total: number } }) {
  const total = status.courses.length;
  const done = status.courses.filter((c) => c.done).length;
  const what = trailSealNote(status, part ? 'parte' : 'curso');
  return (
    <section aria-labelledby="trail-card-title" className="grid gap-4 rounded-[22px] border border-line bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-6" data-testid="course-trail">
      {status.badge ? (
        <TrailSeal trail={status.trail} size={56} tone="light" />
      ) : (
        <span className="grid size-12 place-items-center rounded-full border border-dashed border-line-strong text-fg-muted">
          <Award className="size-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 space-y-1">
        {courseDone && (
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg" data-testid="course-achievement">
            <Trophy className="size-4 text-[var(--im-accent-ink)]" aria-hidden="true" />
            Conquista: Curso concluído · {courseLabel}
          </p>
        )}
        <h2 id="trail-card-title" className="text-[19px]! font-semibold! leading-snug text-fg">
          {part ? `Parte ${part.n} de ${part.total} da trilha ${status.trail}` : `Este curso faz parte da trilha ${status.trail}`}
        </h2>
        <p className="text-[15px] text-fg-muted">
          {done} de {total} {part ? (total === 1 ? 'parte concluída' : 'partes concluídas') : total === 1 ? 'curso concluído' : 'cursos concluídos'}. {what}
        </p>
        <ol className="mt-2 flex flex-wrap gap-1.5" aria-label={part ? 'Partes da trilha' : 'Cursos da trilha'}>
          {status.courses.map((c) => (
            <li key={c.courseId} title={c.title} className={cn('inline-flex h-2.5 w-8 rounded-full', c.done ? 'bg-[var(--im-accent)]' : 'bg-fg/12')}>
              <span className="sr-only">
                {c.title}: {c.done ? 'concluído' : 'não concluído'}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Link href={`/aprender/trilhas/${trailSlug(status.trail)}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-semibold text-fg hover:bg-fg/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" data-testid="course-trail-link">
        {status.badge ? <Check className="size-4" aria-hidden="true" /> : null}
        {status.badge ? 'Ver meu selo' : 'Ver o caminho até o Selo'}
      </Link>
    </section>
  );
}
