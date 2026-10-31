import Link from 'next/link';
import { Play } from 'lucide-react';
import { requireViewer } from '@/server/viewer';
import { cn } from '@/lib/utils';
import { ctaPrimary } from './_components/learner-ui';
import { Catalog, type CatalogItem } from './_components/catalog';
import { ExploreButton } from './_components/explore-button';
import { loadLearnerCourses, type LearnerCourse } from './_lib/learner-courses';
import { HERO_COURSE_IDS } from './_lib/short-titles';

export const metadata = { title: 'Explorar' };
export const dynamic = 'force-dynamic';

/**
 * Vitrine do aluno ("editorial claro").
 * Computador: destaque compacto (texto à esquerda, três capas inclinadas à direita), "Continuar
 * assistindo", fichas por trilha e as fileiras. Celular com curso em andamento: saudação, título
 * curto e a retomada primeiro (sem a colagem); sem curso em andamento: apresentação breve e o botão.
 * A ordem do DOM é a ordem visual em todas as larguras.
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer();
  const { q } = await searchParams;
  const { courses, trails } = await loadLearnerCourses(viewer.user.id);
  const firstName = viewer.user.name?.trim().split(/\s+/)[0];

  // continuar: o curso em andamento mais recente
  const resume = [...courses].sort((a, b) => b.lastActivity - a.lastActivity).find((c) => c.started && !c.isDone);
  // destaque: as três capas aprovadas (Feedback sem medo, Conviver no trabalho, Mensagem profissional), quando o aluno tem esses cursos
  const fixed = HERO_COURSE_IDS.map((id) => courses.find((c) => c.enr.courseId === id && c.posterArt)).filter((c): c is LearnerCourse => !!c);
  const collage = fixed.length === 3 ? fixed : courses.filter((c) => c.posterArt).slice(0, 3);
  const items: CatalogItem[] = courses.map((c) => ({ tile: c.tile, ...(c.trail ? { trail: c.trail } : {}), done: c.isDone, started: c.started }));

  return (
    <div className="lms-editorial space-y-8 sm:space-y-10">
      <section className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-8 lg:gap-12" aria-labelledby="explore-title">
        <div className="space-y-3 md:space-y-4">
          {firstName && <p className="text-[15px] font-medium text-fg-muted">Olá, {firstName}.</p>}
          {/* com retomada, o celular mostra um título compacto; o computador mantém o título grande (um só h1: lê-se o que se vê) */}
          <h1
            id="explore-title"
            className={cn(
              'max-w-[13ch] font-black! leading-[0.96]! tracking-[-0.035em]! text-fg',
              resume ? 'text-[28px]! leading-[1.05]! tracking-[-0.02em]! max-md:max-w-none md:text-[clamp(2.25rem,1.4rem+3.4vw,4.5rem)]! md:leading-[0.96]! md:tracking-[-0.035em]!' : 'text-[clamp(2.25rem,1.4rem+3.4vw,4.5rem)]!',
            )}
          >
            {resume && <span className="md:hidden">Seu próximo passo começa aqui.</span>}
            <span className={cn(resume && 'max-md:hidden')}>
              Um novo capítulo na sua <span className="text-[var(--im-accent)]">carreira.</span>
            </span>
          </h1>
          <p className={cn('max-w-md text-lg leading-snug text-fg-muted md:text-xl', resume && 'max-md:hidden')}>Escolha uma situação. Aprenda na prática.</p>
          <div className={cn('pt-1', resume && 'max-md:hidden')}>
            <ExploreButton />
          </div>
        </div>
        {collage.length > 0 && <Collage items={collage} />}
      </section>

      {resume && <ContinueCard c={resume} />}

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

/**
 * Três capas aprovadas em leque, inteiras (3:4, com o título da própria arte), bordas claras e sombra suave.
 * Só no computador: no celular a retomada e o catálogo vêm primeiro.
 */
function Collage({ items }: { items: LearnerCourse[] }) {
  const tilt = ['-rotate-[4deg] translate-y-3', 'z-10 rotate-[1.5deg] -translate-y-1 scale-[1.06]', '-rotate-[1deg] translate-y-4'];
  return (
    <div className="relative mx-auto hidden w-full max-w-[700px] grid-cols-3 items-center gap-0 px-2 py-2 md:grid" data-testid="explore-collage">
      {items.map((c, i) => (
        <Link
          key={c.enr.id}
          href={c.startHref}
          aria-label={`${c.shortTitle}${c.shortTitle !== c.enr.courseTitle ? ` (${c.enr.courseTitle})` : ''}${c.presenter ? `, com ${c.presenter}` : ''}. ${c.cta}.`}
          className={cn(
            'relative -mx-1 block aspect-[3/4] overflow-hidden rounded-[12px] border-[4px] border-white bg-[#1d1e4c] shadow-[0_22px_45px_-24px_rgba(29,30,76,0.6)] transition-transform duration-300 hover:z-20 hover:rotate-0 focus-visible:z-20 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none',
            tilt[i],
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.posterArt ?? c.posterThumb} alt="" className="h-full w-full object-cover object-top" />
        </Link>
      ))}
    </div>
  );
}

/**
 * "Continuar assistindo": a aula em andamento (o player retoma do ponto registrado). Andamento em
 * aulas concluídas, sem inventar porcentagem de reprodução. Um único controle: o botão "Continuar".
 */
function ContinueCard({ c }: { c: LearnerCourse }) {
  const lessonLine = c.nextLessonIndex !== undefined && c.nextLessonTitle ? `Aula ${c.nextLessonIndex + 1} de ${c.totalLessons} · ${c.nextLessonTitle}` : null;
  return (
    <section aria-labelledby="resume-title" className="rounded-[20px] border border-line bg-surface p-3 shadow-[0_18px_40px_-30px_rgba(29,30,76,0.45)] sm:p-4" data-testid="continue-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap sm:gap-6">
        <div aria-hidden="true" className="relative aspect-video w-[112px] shrink-0 overflow-hidden rounded-[10px] bg-[#1d1e4c] sm:w-[188px] sm:rounded-[12px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(c.backdrop || c.thumb) && <img src={c.backdrop ?? c.thumb} alt="" className="h-full w-full object-cover object-[50%_30%]" />}
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-8 place-items-center rounded-full bg-white/90 text-[#1d1e4c] shadow-lg sm:size-10">
              <Play className="ml-0.5 size-4 fill-current sm:size-5" />
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-128px)] space-y-1.5 sm:basis-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted sm:text-xs">Continuar assistindo</p>
          <h2 id="resume-title" className="line-clamp-2 text-[19px]! font-bold! leading-tight text-fg sm:text-[22px]!">{c.shortTitle}</h2>
          {lessonLine && <p className="line-clamp-1 text-sm text-fg-muted">{lessonLine}</p>}
          <div className="flex items-center gap-3 pt-0.5">
            <span role="progressbar" aria-label="Aulas concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.rail} aria-valuetext={`${c.completedLessons} de ${c.totalLessons} aulas concluídas`} className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-fg/10">
              <span className="block h-full rounded-full bg-accent-fill" style={{ width: `${Math.max(4, c.rail)}%` }} />
            </span>
            <span className="shrink-0 text-sm tabular-nums text-fg-muted" data-testid="enrollment-progress">
              {c.completedLessons} de {c.totalLessons} {c.totalLessons === 1 ? 'aula concluída' : 'aulas concluídas'}
            </span>
          </div>
        </div>
        <Link href={c.startHref} className={cn(ctaPrimary, 'min-h-12 w-full px-7 sm:mr-1 sm:w-auto')} data-testid="enrollment-start" aria-label={`Continuar ${c.shortTitle}${lessonLine ? `, ${lessonLine}` : ''}`}>
          <Play className="size-5 fill-current" aria-hidden="true" />
          Continuar
        </Link>
      </div>
    </section>
  );
}
