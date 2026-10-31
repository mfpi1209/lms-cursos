import { getDb, learning } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { Achievements, type TrailProgress } from '../_components/achievements';
import { CourseRail } from '../_components/course-rail';
import { CourseTile } from '../_components/course-tile';
import { loadLearnerCourses } from '../_lib/learner-courses';

export const metadata = { title: 'Minhas trilhas' };
export const dynamic = 'force-dynamic';

/** "Minhas trilhas": progresso geral (conquistas e selos) e os cursos de cada trilha, os não concluídos primeiro. */
export default async function MyTrailsPage() {
  const viewer = await requireViewer();
  const { enrollments, courses, trails } = await loadLearnerCourses(viewer.user.id);
  const stats = await learning.learnerStats(getDb(), enrollments.map((e) => e.id));
  const progress: TrailProgress[] = trails.map((trail) => {
    const inTrail = courses.filter((c) => c.trail === trail);
    return { trail, done: inTrail.filter((c) => c.isDone).length, total: inTrail.length };
  });
  const groups = [...trails, ...(courses.some((c) => !c.trail) ? ['Mais cursos'] : [])].map((t) => ({
    title: t,
    items: courses.filter((c) => (c.trail ?? 'Mais cursos') === t).sort((a, b) => Number(a.isDone) - Number(b.isDone) || Number(b.started) - Number(a.started)),
  }));
  return (
    <div className="lms-editorial space-y-10">
      <div className="space-y-3">
        <h1 className="text-[clamp(2.25rem,1.5rem+3vw,3.75rem)]! font-black! leading-[0.98]! tracking-[-0.03em]! text-fg">Minhas trilhas</h1>
        <p className="max-w-prose text-lg text-fg-muted">Seu avanço em cada tema. Conclua todos os cursos de uma trilha para ganhar o selo.</p>
      </div>
      <Achievements coursesDone={courses.filter((c) => c.isDone).length} coursesTotal={courses.length} lessonsDone={courses.reduce((a, c) => a + c.completedLessons, 0)} choices={stats.choices} activeDays={stats.activeDays} trails={progress} />
      {groups.map((g) => (
        <CourseRail key={g.title} title={g.title} count={g.items.length} testId={`trail-${g.title}`}>
          {g.items.map((c) => (
            <CourseTile key={c.enr.id} c={c.tile} variant="wide" />
          ))}
        </CourseRail>
      ))}
    </div>
  );
}
