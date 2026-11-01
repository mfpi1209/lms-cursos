import { Suspense } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { requireViewer } from '@/server/viewer';
import { cn } from '@/lib/utils';
import { ctaPrimary } from './_components/learner-ui';
import { Catalog, type CatalogItem } from './_components/catalog';
import { CoverImage } from './_components/course-tile';
import { ExploreButton } from './_components/explore-button';
import { HomeSkeleton } from './_components/home-skeleton';
import { loadLearnerCourses, type LearnerCourse } from './_lib/learner-courses';
import { HERO_BANNER_COURSE_IDS } from './_lib/short-titles';
import { heroArtFor } from './_lib/course-art';
import { HeroCarousel, type HeroSlide } from './_components/hero-carousel';
import { formatLessonVideo, trailCheckFor, trailSlug } from '@lms/course-schema';
import { getDb, recognition } from '@lms/db';
import { buildSeriesCards, partLabel, seriesInfoFor, type SeriesCardData } from './_lib/series';
import { seriesCardCta } from './_components/series-tile';

export const metadata = { title: 'Explorar' };
export const dynamic = 'force-dynamic';

/**
 * Vitrine do aluno ("editorial claro"): saudação e chamada pelo ESTADO REAL do aluno, destaque 16:9, filtros e as seções
 * por trilha. Estados (derivados dos dados, sem inventar nada):
 * - nada começado: "Um novo capítulo na sua carreira." e Explorar cursos;
 * - curso em andamento: "Continue de onde parou", com o curso e a aula reais e o botão Continuar (sem um segundo botão equivalente);
 * - algo concluído e nada em andamento: "Seu próximo passo começa aqui.";
 * - tudo concluído: "Seu próximo passo começa aqui." com "Reveja uma situação…" e o destaque "Para rever e praticar".
 * A ordem do DOM é a ordem visual em todas as larguras.
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer();
  const { q } = await searchParams;
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home userId={viewer.user.id} name={viewer.user.name} {...(q ? { q } : {})} />
    </Suspense>
  );
}

type Mode = 'new' | 'progress' | 'next' | 'done';

async function Home({ userId, name, q }: { userId: string; name?: string | null; q?: string }) {
  const { courses, trails } = await loadLearnerCourses(userId);
  const firstName = name?.trim().split(/\s+/)[0];

  // continuar: o curso em andamento mais recente
  const resume = [...courses].sort((a, b) => b.lastActivity - a.lastActivity).find((c) => c.started && !c.isDone);
  const mode: Mode = resume ? 'progress' : courses.length > 0 && courses.every((c) => c.isDone) ? 'done' : courses.some((c) => c.started) ? 'next' : 'new';
  // trilha em série: um cartão por trilha (cursos continuam matriculados e concluídos como antes)
  const badges = new Set((await recognition.listBadgesForUser(getDb(), userId)).filter((b) => !b.revokedAt).map((b) => b.trailKey));
  const seriesByTrail = buildSeriesCards(courses, trails, badges, (t) => !!trailCheckFor(t));
  const series: Record<string, SeriesCardData> = Object.fromEntries(seriesByTrail);
  const resumeSeries = resume?.trail ? series[resume.trail]?.key : undefined;

  // destaque: os banners dos instrutores (carrossel), só dos cursos em que o aluno está matriculado
  const seenSeries = new Set<string>();
  const slides: HeroSlide[] = HERO_BANNER_COURSE_IDS.flatMap((id): HeroSlide[] => {
    const c = courses.find((x) => x.enr.courseId === id);
    if (!c) return [];
    // com um curso em andamento, a retomada já é o botão principal: o mesmo curso não vira um segundo botão no destaque
    if (resume && (c.enr.courseId === resume.enr.courseId || (resumeSeries && c.trail && series[c.trail]?.key === resumeSeries))) return [];
    const art = heroArtFor(c.slug);
    const image = art ? { image: art.src, width: art.width, height: art.height, position: art.position } : { image: `/destaque/${id}.webp`, width: 1774, height: 887, position: '100% 40%' };
    // no destaque, a série entra uma vez só (não um slide por parte)
    const card = c.trail ? series[c.trail] : undefined;
    if (card) {
      if (seenSeries.has(card.key)) return [];
      seenSeries.add(card.key);
      const cta = seriesCardCta(card);
      return [{ id, ...image, label: card.status === 'completed' ? 'Para rever e praticar' : 'Em destaque', title: card.trail, ...(card.instructor ? { presenter: card.instructor } : {}), href: cta.href, cta: cta.label }];
    }
    return [
      {
        id,
        ...image,
        label: c.isDone ? 'Para rever e praticar' : 'Em destaque',
        title: c.shortTitle,
        ...(c.tagline ? { tagline: c.tagline } : {}),
        ...(c.presenter ? { presenter: c.presenter } : {}),
        href: c.startHref,
        cta: c.started && !c.isDone ? 'Continuar' : c.isDone ? 'Rever curso' : 'Começar',
      },
    ];
  });
  const items: CatalogItem[] = courses.map((c) => ({ tile: c.tile, slug: c.slug, ...(c.trail ? { trail: c.trail } : {}), done: c.isDone, started: c.started }));

  const hl = 'text-[var(--im-accent-ink)]';
  return (
    <div className="lms-editorial">
      <section className={cn('dna-hero', slides.length === 0 && 'lg:grid-cols-1!')} aria-labelledby="explore-title" data-testid="home-hero" data-mode={mode}>
        <div className="min-w-0 space-y-3 md:space-y-4">
          {firstName && <p className="text-[15px] font-medium leading-6 text-fg-muted md:text-base">Olá, {firstName}.</p>}
          <h1 id="explore-title" className="max-w-[480px] text-[32px]! font-extrabold! leading-9! tracking-[-0.025em]! text-fg md:text-[48px]! md:leading-[52px]!">
            {mode === 'progress' && (
              <>
                Continue de <span className={hl}>onde parou</span>
              </>
            )}
            {mode === 'new' && (
              <>
                Um novo capítulo na sua <span className={hl}>carreira.</span>
              </>
            )}
            {(mode === 'next' || mode === 'done') && (
              <>
                Seu <span className={hl}>próximo passo</span> começa aqui.
              </>
            )}
          </h1>
          {mode === 'progress' && resume ? (
            <ContinueCard c={resume} />
          ) : (
            <>
              <p className="max-w-[480px] text-[15px] leading-[22px] text-fg-muted md:text-base md:leading-6">{mode === 'done' ? 'Reveja uma situação. Experimente na prática.' : 'Escolha uma situação. Aprenda na prática.'}</p>
              <div className="pt-1">
                <ExploreButton />
              </div>
            </>
          )}
        </div>
        {slides.length > 0 && <HeroCarousel slides={slides} />}
      </section>

      <Catalog items={items} series={series} trails={trails.map((name) => ({ name, slug: trailSlug(name) }))} {...(q ? { query: q } : {})} />

      {courses.length === 0 && (
        <div className="mt-8 rounded-[16px] border border-line bg-surface p-6 sm:p-8" data-testid="enrollment-empty">
          <p className="text-lg font-medium text-fg">Você ainda não está matriculado em nenhum curso.</p>
          <p className="mt-1 text-base text-fg-muted">Quando a equipe liberar um curso para você, ele aparece aqui.</p>
        </div>
      )}
    </div>
  );
}

/**
 * "Continue de onde parou": a aula em andamento (o player retoma do ponto registrado). Andamento em aulas concluídas, sem
 * inventar porcentagem de reprodução. Um único controle: o botão "Continuar".
 */
function ContinueCard({ c }: { c: LearnerCourse }) {
  const lessonVideo = c.nextLessonVideo ? formatLessonVideo(c.nextLessonVideo) : null;
  // curso de uma trilha em série: diz de qual trilha e qual parte (o título continua sendo o do curso)
  const part = seriesInfoFor(c);
  const lessonLine = c.nextLessonIndex !== undefined && c.nextLessonTitle ? `${part ? `${part.trail} · ${partLabel(part.part, part.total)} · ` : ''}Aula ${c.nextLessonIndex + 1} de ${c.lessonsTotal} · ${c.nextLessonTitle}${lessonVideo ? ` · ${lessonVideo} de vídeo` : ''}` : null;
  return (
    <section aria-labelledby="resume-title" className="rounded-[16px] border border-line bg-surface p-3 shadow-[0_6px_20px_rgba(29,30,76,0.08)] sm:p-4" data-testid="continue-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div aria-hidden="true" className="relative isolate aspect-video w-[112px] shrink-0 overflow-hidden rounded-[10px] bg-[#1d1e4c] sm:w-[160px] sm:rounded-[12px]">
          <CoverImage art={c.art} fallbacks={[c.backdrop, c.thumb]} format="wide" title={c.shortTitle} />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-8 place-items-center rounded-full bg-white/90 text-[#1d1e4c] shadow-lg">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-128px)] space-y-1.5 sm:basis-0">
          <h2 id="resume-title" className="text-[19px]! font-bold! leading-tight text-fg sm:text-[20px]!">{c.shortTitle}</h2>
          {lessonLine && <p className="text-[13px] leading-[18px] text-fg-muted md:text-sm">{lessonLine}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            <span role="progressbar" aria-label="Aulas concluídas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.rail} aria-valuetext={`${c.completedLessons} de ${c.totalLessons} aulas concluídas`} className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-fg/10">
              <span className="block h-full rounded-full bg-[#FF7A08]" style={{ width: `${c.rail}%` }} />
            </span>
            <span className="shrink-0 text-[13px] tabular-nums text-fg-muted md:text-sm" data-testid="enrollment-progress">
              {c.completedLessons} de {c.totalLessons} {c.totalLessons === 1 ? 'aula concluída' : 'aulas concluídas'}
            </span>
          </div>
        </div>
        <Link href={c.startHref} className={cn(ctaPrimary, 'min-h-12 w-full px-5')} data-testid="enrollment-start" aria-label={`Continuar ${c.shortTitle}${lessonLine ? `, ${lessonLine}` : ''}`}>
          <Play className="size-5 fill-current" aria-hidden="true" />
          Continuar
        </Link>
      </div>
    </section>
  );
}
