import Link from 'next/link';
import { Play } from 'lucide-react';
import { requireViewer } from '@/server/viewer';
import { cn } from '@/lib/utils';
import { ctaPrimary } from './_components/learner-ui';
import { Swoosh } from './_components/course-tile';
import { Catalog, type CatalogItem } from './_components/catalog';
import { loadLearnerCourses, type LearnerCourse } from './_lib/learner-courses';

export const metadata = { title: 'Explorar' };
export const dynamic = 'force-dynamic';

/**
 * Vitrine do aluno, "editorial claro": título grande com a palavra de destaque em laranja, colagem
 * inclinada com as instrutoras e etiquetas manuscritas, "Continuar assistindo", fichas por trilha,
 * capas em pé ("Cursos em destaque") e cartões largos ("Cursos de 10 minutos").
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer();
  const { q } = await searchParams;
  const { courses, trails } = await loadLearnerCourses(viewer.user.id);
  const firstName = viewer.user.name?.trim().split(/\s+/)[0];

  // continuar: o curso em andamento mais recente
  const resume = [...courses].sort((a, b) => b.lastActivity - a.lastActivity).find((c) => c.started && !c.isDone);
  // colagem: até 3 instrutores diferentes, de trilhas diferentes quando possível
  const collage: LearnerCourse[] = [];
  for (const c of [...courses].sort((a, b) => Number(a.isDone) - Number(b.isDone))) {
    if (collage.length >= 3) break;
    if (!c.posterThumb || collage.some((x) => x.presenter === c.presenter || (x.trail && x.trail === c.trail))) continue;
    collage.push(c);
  }
  const items: CatalogItem[] = courses.map((c) => ({ tile: c.tile, ...(c.trail ? { trail: c.trail } : {}), done: c.isDone, started: c.started }));

  return (
    <div className="lms-editorial space-y-10 sm:space-y-12">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12" aria-labelledby="explore-title">
        <div className="space-y-6">
          {firstName && <p className="text-[15px] font-medium text-fg-muted">Olá, {firstName}.</p>}
          <h1 id="explore-title" className="max-w-[12ch] text-[clamp(2.75rem,1.6rem+4.4vw,5.25rem)]! font-black! leading-[0.95]! tracking-[-0.035em]! text-fg">
            Um novo capítulo na sua <span className="text-[var(--im-accent)]">carreira.</span>
          </h1>
          <p className="max-w-md text-xl leading-snug text-fg-muted">Escolha uma situação. Aprenda na prática.</p>
          <a href="#cursos" className={cn(ctaPrimary, 'min-h-14 px-8 text-[18px]')}>
            <Play className="size-5 fill-current" aria-hidden="true" />
            Explorar cursos
          </a>
        </div>
        {collage.length > 0 && <Collage items={collage} />}
      </section>

      {resume && <ContinueBar c={resume} />}

      <Catalog items={items} trails={trails} {...(q ? { query: q } : {})} />

      {courses.length === 0 && (
        <div className="rounded-[20px] border border-line bg-surface p-6 sm:p-8" data-testid="enrollment-empty">
          <p className="text-lg font-medium text-fg">Você ainda não está matriculado em nenhum curso.</p>
          <p className="mt-1 text-base text-fg-muted">Quando a equipe liberar um curso para você, ele aparece aqui.</p>
        </div>
      )}
    </div>
  );
}

/** Colagem do topo: fotos inclinadas das instrutoras, cada uma com o nome da trilha manuscrito. */
function Collage({ items }: { items: LearnerCourse[] }) {
  const frames = [
    'col-start-1 row-span-2 -rotate-[3deg] aspect-[3/4]',
    'col-start-2 rotate-[2.5deg] aspect-[4/3] translate-y-2',
    'col-start-2 -rotate-[1.5deg] aspect-[4/3] -translate-x-2',
  ];
  return (
    <div className="relative mx-auto grid w-full max-w-[640px] grid-cols-[1.05fr_1fr] gap-3 sm:gap-4" data-testid="explore-collage">
      {/* rabisco laranja, como no esboço */}
      <svg viewBox="0 0 80 60" aria-hidden="true" className="absolute -left-8 -top-6 hidden h-16 w-20 text-[var(--im-accent)] sm:block">
        <path d="M6 10c18 4 30 10 22 18S6 40 30 44s34 2 44 12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {items.map((c, i) => (
        <Link
          key={c.enr.id}
          href={c.startHref}
          aria-label={`${c.enr.courseTitle}${c.presenter ? `, com ${c.presenter}` : ''}. ${c.cta}.`}
          className={cn('group relative overflow-hidden rounded-[14px] border-[5px] border-white bg-[#1d1e4c] shadow-[0_22px_45px_-24px_rgba(29,30,76,0.6)] transition-transform duration-300 hover:rotate-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none', frames[i])}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.posterThumb} alt="" className={cn('h-full w-full object-cover', c.posterArt ? 'object-top' : 'origin-[50%_8%] scale-[1.25] object-[50%_12%]')} />
          {/* a capa desenhada já traz título e marca: na foto grande, sem etiqueta por cima */}
          {!(c.posterArt && i === 0) && <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />}
          {!(c.posterArt && i === 0) && <span aria-hidden="true" className={cn('absolute block', i === 0 ? 'bottom-5 left-4 right-4' : 'bottom-3 right-4 text-right')}>
            <span className="font-hand block -rotate-3 text-[34px] font-bold leading-[0.9] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-[40px]">{c.trail ?? c.enr.courseTitle}</span>
            <Swoosh className={cn('mt-1 h-3 w-[70%]', i !== 0 && 'ml-auto')} />
          </span>}
        </Link>
      ))}
    </div>
  );
}

/** "Continuar assistindo": o curso em andamento mais recente, com a próxima aula a um toque. */
function ContinueBar({ c }: { c: LearnerCourse }) {
  return (
    <section aria-labelledby="resume-title" className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-3 shadow-[0_18px_40px_-30px_rgba(29,30,76,0.45)] sm:flex-row sm:items-center sm:gap-6 sm:p-4" data-testid="continue-bar">
      <Link href={c.startHref} className="group relative block aspect-video w-full shrink-0 overflow-hidden rounded-[14px] bg-[#1d1e4c] sm:w-[220px]" aria-label={`${c.cta}: ${c.enr.courseTitle}`} tabIndex={-1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.thumb && <img src={c.backdrop ?? c.thumb} alt="" className="h-full w-full object-cover object-[50%_30%]" />}
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[#1d1e4c] shadow-lg transition-transform group-hover:scale-105">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      </Link>
      <div className="min-w-0 flex-1 space-y-2 px-1 sm:px-0">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted">Continuar assistindo</p>
        <h2 id="resume-title" className="truncate text-[22px]! font-bold! leading-tight text-fg">{c.enr.courseTitle}</h2>
        <div className="flex items-center gap-4">
          <span role="progressbar" aria-label={`Progresso em ${c.enr.courseTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.rail} aria-valuetext={`${c.completedLessons} de ${c.totalLessons} aulas`} className="h-1.5 w-full max-w-[320px] overflow-hidden rounded-full bg-fg/10">
            <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${Math.max(4, c.rail)}%` }} />
          </span>
          <span className="shrink-0 text-sm tabular-nums text-fg-muted" data-testid="enrollment-progress">
            {c.completedLessons} de {c.totalLessons} aulas
          </span>
        </div>
      </div>
      <Link href={c.startHref} className={cn(ctaPrimary, 'min-h-12 px-7 sm:mr-2')} data-testid="enrollment-start">
        <Play className="size-5 fill-current" aria-hidden="true" />
        Continuar
      </Link>
    </section>
  );
}
