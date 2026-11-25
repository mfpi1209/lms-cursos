import { allLessons, migrateCourseDocument } from '@lms/course-schema';
import { getDb, reports, tracking } from '@lms/db';
import { buildTrackRow, lessonSteps, type LessonStep, type TrackRow } from '@/lib/acompanhamento';

/** Máximo de matrículas carregadas na tela (o resumo é montado em memória). Acima disso: filtre por curso ou exporte. */
export const TRACKING_MAX_ROWS = 20_000;

export interface TrackingData {
  courses: tracking.TrackedCourse[];
  /** curso do filtro (`null` = todos) */
  course: tracking.TrackedCourse | null;
  rows: TrackRow[];
  /** passou do limite: `rows` tem só as primeiras TRACKING_MAX_ROWS */
  truncated: boolean;
  daily: tracking.DailyActive[];
  /** só com um curso escolhido */
  lessons: LessonStep[] | null;
  now: Date;
}

/**
 * Dados da tela de acompanhamento: uma linha por matrícula (progresso + atividade no curso), atividade diária dos
 * últimos 30 dias e, com um curso escolhido, o alcance de cada aula. `courseSlug` desconhecido = todos os cursos.
 */
export async function loadTracking(input: { workspaceId: string; courseSlug?: string | null }): Promise<TrackingData> {
  const db = getDb();
  const now = new Date();
  const courses = await tracking.trackedCourses(db, input.workspaceId);
  const course = input.courseSlug ? courses.find((c) => c.slug === input.courseSlug) ?? null : null;
  const scope = { workspaceId: input.workspaceId, ...(course ? { courseId: course.id } : {}) };

  const progress: reports.ProgressRow[] = [];
  let truncated = false;
  const readProgress = async () => {
    for await (const chunk of reports.progressRowsAll(db, scope)) {
      progress.push(...chunk);
      if (progress.length >= TRACKING_MAX_ROWS) {
        truncated = progress.length > TRACKING_MAX_ROWS;
        progress.length = Math.min(progress.length, TRACKING_MAX_ROWS);
        break;
      }
    }
  };
  const [, activity, daily, reach, document] = await Promise.all([
    readProgress(),
    tracking.enrollmentActivity(db, scope),
    tracking.dailyActiveStudents(db, { ...scope, days: 30, now }),
    course ? tracking.lessonReach(db, { workspaceId: input.workspaceId, courseId: course.id }) : Promise.resolve(null),
    course ? tracking.latestCourseDocument(db, course.id) : Promise.resolve(null),
  ]);

  const rows = progress.map((p) => buildTrackRow(p, activity.get(p.matricula_id), now));
  let lessons: LessonStep[] | null = null;
  if (course && reach) {
    const base = rows.filter((r) => r.situacao !== 'cancelada').length;
    const list = document ? allLessons(migrateCourseDocument(document)).map((l) => ({ id: l.id, title: l.title })) : [];
    lessons = lessonSteps(list, reach, base);
  }
  return { courses, course, rows, truncated, daily, lessons, now };
}
