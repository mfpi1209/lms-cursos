import { getDb, learning, publishing } from '@lms/db';
import { allLessons } from '@lms/course-schema';
import { lessonThumbUrl } from '../_components/learner-ui';
import type { CourseTileData } from '../_components/course-tile';

type Enrollment = Awaited<ReturnType<typeof learning.listEnrollmentsForUser>>[number];

export interface LearnerCourse {
  enr: Enrollment;
  lessons: ReturnType<typeof allLessons>;
  done: boolean[];
  current?: number;
  completedLessons: number;
  totalLessons: number;
  started: boolean;
  isDone: boolean;
  startHref: string;
  cta: string;
  rail: number;
  lessonsCopy: string | null;
  tagline?: string;
  backdrop?: string;
  thumb?: string;
  posterThumb?: string;
  posterArt?: string;
  presenter?: string;
  lastActivity: number;
  heroVideo?: string;
  openingVideo?: string;
  decisions: number;
  minutes: number;
  trail?: string;
  tile: CourseTileData;
}

type MediaNode = { type: string; id: string; media?: { kind?: string; assetId?: string } | null; options?: Array<{ reaction?: { media?: { kind?: string; assetId?: string } } }> };

/** Primeiro vídeo de cena de uma aula. */
function firstVideo(lesson: { graph: { nodes: unknown[] } } | undefined): string | undefined {
  for (const n of (lesson?.graph.nodes ?? []) as MediaNode[]) if (n.media?.kind === 'video' && n.media.assetId) return n.media.assetId;
  return undefined;
}

/** Primeira reação em vídeo do curso: a instrutora centrada, boa para a capa em pé. */
function firstReaction(nodes: MediaNode[]): string | undefined {
  for (const n of nodes) for (const o of n.options ?? []) if (o.reaction?.media?.kind === 'video' && o.reaction.media.assetId) return o.reaction.media.assetId;
  return undefined;
}

/** Cursos do aluno com progresso, capas, tempo e trilha (vitrine e "Minhas trilhas"). */
export async function loadLearnerCourses(userId: string) {
  const db = getDb();
  const enrollments = await learning.listEnrollmentsForUser(db, userId);
  const attemptsByEnrollment = await Promise.all(enrollments.map((e) => learning.listAttemptsForEnrollment(db, e.id)));
  const versions = await Promise.all(enrollments.map((e) => publishing.getVersion(db, e.versionId)));
  const courses: LearnerCourse[] = enrollments.map((enr, i) => {
    const attempts = attemptsByEnrollment[i] ?? [];
    const doc = versions[i]?.document;
    const presenterImg = doc?.presentation.avatarPreviewUrl;
    // Progresso = aulas concluídas (ao menos uma tentativa concluída, sem contar repetições) / aulas da versão matriculada.
    const lessons = doc ? allLessons(doc) : [];
    const lessonIds = new Set(lessons.map((l) => l.id));
    const totalLessons = lessonIds.size;
    const completedSet = new Set(attempts.filter((a) => a.status === 'completed' && lessonIds.has(a.lessonId)).map((a) => a.lessonId));
    const completedLessons = completedSet.size;
    const done = lessons.map((l) => completedSet.has(l.id));
    const isDone = enr.status === 'completed';
    const current = isDone ? -1 : done.findIndex((d) => !d);
    const started = attempts.length > 0;
    // "Começar"/"Continuar" vai direto para a aula certa (a em andamento ou a próxima); concluído: a página do curso
    const inProgress = lessons.find((l) => attempts.some((a) => a.lessonId === l.id && a.status === 'in_progress'));
    const nextLesson = isDone ? undefined : (inProgress ?? lessons.find((l) => !completedSet.has(l.id)));
    const nextIndex = nextLesson ? lessons.findIndex((l) => l.id === nextLesson.id) : -1;
    const startHref = nextLesson ? `/aprender/${enr.id}/aulas/${nextLesson.id}` : `/aprender/${enr.id}`;
    const cta = isDone ? 'Ver o curso' : inProgress ? `Continuar aula ${nextIndex + 1}` : started ? `Começar aula ${nextIndex + 1}` : 'Começar';
    const rail = isDone ? 100 : totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const lessonsCopy = totalLessons > 0 ? `${totalLessons} ${totalLessons === 1 ? 'aula' : 'aulas'} · ${completedLessons} ${completedLessons === 1 ? 'concluída' : 'concluídas'}` : null;
    const tagline = doc?.learnerSummary?.trim() || doc?.branding.tagline?.trim() || doc?.description?.trim() || undefined;
    const backdrop = (nextLesson && lessonThumbUrl(nextLesson, 0.15)) || (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const thumb = (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const nodes = lessons.flatMap((l) => l.graph.nodes as unknown as MediaNode[]);
    const reaction = firstReaction(nodes);
    // capa em pé desenhada (com título e marca na arte) vence o quadro do vídeo
    const posterArt = enr.coursePosterAssetId ? `/api/assets/${enr.coursePosterAssetId}` : undefined;
    const posterThumb = posterArt ?? (reaction ? `/api/assets/${reaction}/thumb?at=0.5` : thumb);
    const presenter = doc?.branding.presenterName?.trim() || doc?.presentation.avatarName?.trim() || undefined;
    const lastActivity = Math.max(0, ...attempts.map((a) => new Date(a.startedAt).getTime()));
    const decisions = nodes.filter((n) => n.type === 'choice').length;
    // mesma conta da página do curso ("cerca de N min"): o tempo estimado de cada aula
    const minutes = lessons.reduce((a, l) => a + l.estimatedMinutes, 0);
    const heroVideo = firstVideo(nextLesson ?? lessons[0]);
    const openingVideo = firstVideo(lessons[0]);
    const trail = enr.courseTrail ?? undefined;
    const tile: CourseTileData = {
      id: enr.id,
      href: startHref,
      chaptersHref: `/aprender/${enr.id}`,
      title: enr.courseTitle,
      ...(tagline ? { summary: tagline } : {}),
      ...(thumb ? { thumb } : {}),
      ...(posterThumb ? { posterThumb } : {}),
      ...(posterArt ? { posterArt } : {}),
      ...(openingVideo ? { previewSrc: `/api/assets/${openingVideo}` } : {}),
      ...(presenter ? { presenter } : {}),
      lessons: totalLessons,
      completed: completedLessons,
      minutes,
      decisions,
      lessonTitles: lessons.map((l) => l.title),
      status: isDone ? 'completed' : started ? 'in_progress' : 'new',
      cta,
      ...(trail ? { trail } : {}),
    };
    return { enr, lessons, done, ...(current >= 0 ? { current } : {}), completedLessons, totalLessons, started, isDone, startHref, cta, rail, lessonsCopy, ...(tagline ? { tagline } : {}), ...(backdrop ? { backdrop } : {}), ...(thumb ? { thumb } : {}), ...(posterThumb ? { posterThumb } : {}), ...(posterArt ? { posterArt } : {}), ...(presenter ? { presenter } : {}), lastActivity, ...(heroVideo ? { heroVideo } : {}), ...(openingVideo ? { openingVideo } : {}), decisions, minutes, ...(trail ? { trail } : {}), tile };
  });
  const trails = [...new Set(courses.map((c) => c.trail).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { enrollments, courses, trails };
}
