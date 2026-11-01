import { getDb, learning, publishing } from '@lms/db';
import { allLessons, seriesPartOf, trailSlug } from '@lms/course-schema';
import type { PlatformSeries } from '@/components/player/types';
import { pickNextPart, type SeriesSibling } from './series';
import { shortTitleFor } from './short-titles';

/**
 * Contexto de trilha em série para o player (servidor): em qual parte o curso está e qual abrir depois. Lê as matrículas
 * do aluno nas outras partes (a mesma matrícula e a mesma "aula certa" do cartão do curso). Curso fora de série: undefined.
 */
export async function loadPlayerSeries(input: { userId: string; courseSlug: string; trail: string | null | undefined; currentEnrollmentId: string }): Promise<PlatformSeries | undefined> {
  const part = seriesPartOf(input.courseSlug, input.trail);
  if (!part) return undefined;
  const db = getDb();
  const enrollments = await learning.listEnrollmentsForUser(db, input.userId);
  const siblings: SeriesSibling[] = await Promise.all(
    part.series.courses.map(async (slug, i): Promise<SeriesSibling> => {
      const n = i + 1;
      const enr = enrollments.find((e) => e.courseSlug === slug && e.id !== input.currentEnrollmentId);
      if (n === part.part || !enr) return { n, title: `Parte ${n}`, available: false, done: false, started: false, href: '' };
      const [attempts, version] = await Promise.all([learning.listAttemptsForEnrollment(db, enr.id), publishing.getVersion(db, enr.versionId)]);
      const lessons = version ? allLessons(version.document) : [];
      const completed = new Set(attempts.filter((a) => a.status === 'completed').map((a) => a.lessonId));
      const inProgress = lessons.find((l) => attempts.some((a) => a.lessonId === l.id && a.status === 'in_progress'));
      const next = inProgress ?? lessons.find((l) => !completed.has(l.id));
      const done = enr.status === 'completed';
      return { n, title: shortTitleFor(enr.courseId, enr.courseTitle), available: true, done, started: attempts.length > 0, href: next && !done ? `/aprender/${enr.id}/aulas/${next.id}` : `/aprender/${enr.id}` };
    }),
  );
  const { othersDone, next } = pickNextPart(
    part.part,
    siblings.filter((p) => p.n !== part.part),
  );
  return { trail: part.series.trail, trailHref: `/aprender/trilhas/${trailSlug(part.series.trail)}`, part: part.part, total: part.total, othersDone, ...(next ? { next } : {}) };
}
