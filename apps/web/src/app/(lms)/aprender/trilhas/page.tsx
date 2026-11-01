import { getDb, learning, recognition } from '@lms/db';
import { trailCheckFor, trailSlug } from '@lms/course-schema';
import { requireViewer } from '@/server/viewer';
import { Achievements, type TrailProgress } from '../_components/achievements';
import { CourseRail } from '../_components/course-rail';
import { CourseTile } from '../_components/course-tile';
import { SeriesTile } from '../_components/series-tile';
import { loadLearnerCourses } from '../_lib/learner-courses';
import { orderInTrail, trailProgressCopy } from '../_lib/trail-order';
import { buildSeriesCards } from '../_lib/series';

export const metadata = { title: 'Minhas trilhas' };
export const dynamic = 'force-dynamic';

/** "Minhas trilhas": progresso geral (conquistas e selos) e os cursos de cada trilha, os não concluídos primeiro. */
export default async function MyTrailsPage() {
  const viewer = await requireViewer();
  const { enrollments, courses, trails } = await loadLearnerCourses(viewer.user.id);
  const stats = await learning.learnerStats(getDb(), enrollments.map((e) => e.id));
  const badges = new Set((await recognition.listBadgesForUser(getDb(), viewer.user.id)).filter((b) => !b.revokedAt).map((b) => b.trailKey));
  // trilha em série: um cartão que abre as partes, em vez de um por curso
  const series = buildSeriesCards(courses, trails, badges, (t) => !!trailCheckFor(t));
  const progress: TrailProgress[] = trails.map((trail) => {
    const inTrail = courses.filter((c) => c.trail === trail);
    return { trail, done: inTrail.filter((c) => c.isDone).length, total: inTrail.length, badge: badges.has(trailSlug(trail)), href: `/aprender/trilhas/${trailSlug(trail)}` };
  });
  const groups = [...trails, ...(courses.some((c) => !c.trail) ? ['Mais cursos'] : [])].map((t) => {
    const all = courses.filter((c) => (c.trail ?? 'Mais cursos') === t);
    const card = series.get(t);
    return { title: t, done: card ? card.partsDone : all.filter((c) => c.isDone).length, total: card ? card.total : all.length, series: card, items: card ? [] : orderInTrail(all, (c) => ({ done: c.isDone, started: c.started, title: c.shortTitle })) };
  });
  return (
    <div className="lms-editorial space-y-10">
      <div className="space-y-3">
        <h1 className="text-[clamp(2.25rem,1.5rem+3vw,3.75rem)]! font-black! leading-[0.98]! tracking-[-0.03em]! text-fg">Minhas trilhas</h1>
        <p className="max-w-prose text-lg text-fg-muted">Seu avanço em cada tema. Cada curso concluído é uma conquista. O Selo DNA Work de uma trilha sai quando você conclui os cursos, salva as atividades “Na prática” e passa na checagem final.</p>
      </div>
      <Achievements coursesDone={courses.filter((c) => c.isDone).length} coursesTotal={courses.length} lessonsDone={courses.reduce((a, c) => a + c.completedLessons, 0)} choices={stats.choices} activeDays={stats.activeDays} trails={progress} />
      {groups.map((g) => (
        <CourseRail
          key={g.title}
          title={g.title}
          count={g.series ? g.series.total : g.items.length}
          {...(g.series ? { countLabel: `trilha em ${g.series.total} partes` } : {})}
          testId={`trail-${trailSlug(g.title)}`}
          layout={g.series ? 'trails' : 'cards'}
          progress={trailProgressCopy(g.done, g.total, g.series ? 'partes' : undefined)}
          {...(g.title !== 'Mais cursos' ? { href: `/aprender/trilhas/${trailSlug(g.title)}` } : {})}
        >
          {g.series ? <SeriesTile s={g.series} testId={`series-${trailSlug(g.title)}`} /> : g.items.map((c) => <CourseTile key={c.enr.id} c={c.tile} variant="landscape" />)}
        </CourseRail>
      ))}
    </div>
  );
}
