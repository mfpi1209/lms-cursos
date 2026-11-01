import { getDb, learning, publishing } from '@lms/db';
import { allLessons, sortTrails } from '@lms/course-schema';
import { lessonThumbUrl } from '../_components/learner-ui';
import type { CourseTileData, CourseVideo } from '../_components/course-tile';
import { HERO_BANNER_COURSE_IDS, shortTitleFor } from './short-titles';
import { versionsRuntime } from '@/server/lesson-runtime';

type Enrollment = Awaited<ReturnType<typeof learning.listEnrollmentsForUser>>[number];

export interface LearnerCourse {
  enr: Enrollment;
  lessons: ReturnType<typeof allLessons>;
  done: boolean[];
  current?: number;
  /** aulas obrigatórias concluídas / obrigatórias (conteúdo novo opcional de quem já concluiu não entra) */
  completedLessons: number;
  totalLessons: number;
  /** conteúdo novo (aulas acrescentadas depois da conclusão) ainda não feito: índices em `lessons` */
  newLessonIndexes: number[];
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
  /** tempo de vídeo do curso (segundos, faixa pelos ramos) */
  video: CourseVideo;
  /** tempo de vídeo da próxima aula ("Continuar assistindo") */
  nextLessonVideo?: { minS: number; maxS: number };
  trail?: string;
  /** chave estável do curso (`courses.slug`): posição nas trilhas em série */
  slug: string;
  /** quadro com o instrutor (sem título na arte): imagem do cartão da série */
  portrait?: string;
  /** título de apresentação (capas, vitrine, retomada); o canônico fica em `enr.courseTitle` */
  shortTitle: string;
  /** próxima aula (a em andamento ou a primeira não concluída), base 0; undefined quando concluído */
  nextLessonIndex?: number;
  nextLessonTitle?: string;
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
  // tempo de VÍDEO do percurso publicado (faixa mín–máx por causa dos ramos), não a estimativa fixa do roteiro
  const runtimes = await versionsRuntime(versions.flatMap((v) => (v ? [{ id: v.id, lessons: allLessons(v.document) }] : [])));
  const courses: LearnerCourse[] = enrollments.map((enr, i) => {
    const attempts = attemptsByEnrollment[i] ?? [];
    const doc = versions[i]?.document;
    const presenterImg = doc?.presentation.avatarPreviewUrl;
    // Progresso = aulas concluídas (ao menos uma tentativa concluída, sem contar repetições) / aulas da versão matriculada.
    const lessons = doc ? allLessons(doc) : [];
    const lessonIds = new Set(lessons.map((l) => l.id));
    // aulas acrescentadas DEPOIS de a pessoa concluir não contam como pendentes: ficam de fora do total e da % (conteúdo novo)
    const optional = new Set(enr.optionalLessonIds);
    const isDone = enr.status === 'completed';
    const countedIds = isDone ? new Set(lessons.filter((l) => !optional.has(l.id)).map((l) => l.id)) : lessonIds;
    const totalLessons = countedIds.size;
    const completedSet = new Set(attempts.filter((a) => a.status === 'completed' && lessonIds.has(a.lessonId)).map((a) => a.lessonId));
    const completedLessons = [...completedSet].filter((id) => countedIds.has(id)).length;
    const done = lessons.map((l) => completedSet.has(l.id));
    const newLessonIndexes = isDone ? lessons.flatMap((l, i) => (optional.has(l.id) && !completedSet.has(l.id) ? [i] : [])) : [];
    const current = isDone ? -1 : done.findIndex((d) => !d);
    const started = attempts.length > 0;
    // "Começar"/"Continuar" vai direto para a aula certa (a em andamento ou a próxima); concluído: a página do curso
    const inProgress = lessons.find((l) => attempts.some((a) => a.lessonId === l.id && a.status === 'in_progress'));
    const nextLesson = isDone ? undefined : (inProgress ?? lessons.find((l) => !completedSet.has(l.id)));
    const nextIndex = nextLesson ? lessons.findIndex((l) => l.id === nextLesson.id) : -1;
    const startHref = nextLesson ? `/aprender/${enr.id}/aulas/${nextLesson.id}` : `/aprender/${enr.id}`;
    const cta = isDone ? 'Rever o curso' : inProgress ? `Continuar aula ${nextIndex + 1}` : started ? `Começar aula ${nextIndex + 1}` : 'Começar';
    const rail = isDone ? 100 : totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const lessonsCopy = totalLessons > 0 ? `${totalLessons} ${totalLessons === 1 ? 'aula' : 'aulas'} · ${completedLessons} ${completedLessons === 1 ? 'concluída' : 'concluídas'}` : null;
    const tagline = doc?.learnerSummary?.trim() || doc?.branding.tagline?.trim() || doc?.description?.trim() || undefined;
    const backdrop = (nextLesson && lessonThumbUrl(nextLesson, 0.15)) || (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const thumb = (lessons[0] && lessonThumbUrl(lessons[0], 0.15)) || presenterImg;
    const nodes = lessons.flatMap((l) => l.graph.nodes as unknown as MediaNode[]);
    const reaction = firstReaction(nodes);
    // capa em pé desenhada (com título e marca na arte) vence o quadro do vídeo
    const posterArt = enr.coursePosterAssetId ? `/api/assets/${enr.coursePosterAssetId}` : undefined;
    const portrait = reaction ? `/api/assets/${reaction}/thumb?at=0.5` : thumb;
    const posterThumb = posterArt ?? portrait;
    const presenter = doc?.branding.presenterName?.trim() || doc?.presentation.avatarName?.trim() || undefined;
    const lastActivity = Math.max(0, ...attempts.map((a) => new Date(a.startedAt).getTime()));
    const decisions = nodes.filter((n) => n.type === 'choice').length;
    // mesma conta da página do curso e da lista de aulas: tempo de vídeo do percurso publicado, em segundos
    const rt = versions[i] ? runtimes.get(versions[i]!.id) : undefined;
    const video: CourseVideo = rt ? { minS: rt.course.minS, maxS: rt.course.maxS, ...(rt.course.missing.length ? { unavailable: true } : {}) } : { minS: 0, maxS: 0 };
    const nextLessonVideo = nextLesson && rt ? rt.lessons.get(nextLesson.id) : undefined;
    const heroVideo = firstVideo(nextLesson ?? lessons[0]);
    const openingVideo = firstVideo(lessons[0]);
    const trail = enr.courseTrail ?? undefined;
    // imagem do cartão deitado: 1) banner largo do instrutor (public/destaque), 2) retrato do instrutor no estúdio
    // (a cena mostra o quadro do vídeo se o retrato não carregar), 3) quadro do vídeo de abertura
    const wideFrame = thumb;
    const wide: CourseTileData['wide'] | undefined = (HERO_BANNER_COURSE_IDS as readonly string[]).includes(enr.courseId)
      ? { src: `/destaque/${enr.courseId}.webp`, kind: 'banner', ...(wideFrame ? { fallback: wideFrame } : {}) }
      : presenterImg
        ? { src: presenterImg, kind: 'portrait', ...(wideFrame ? { fallback: wideFrame } : {}) }
        : wideFrame
          ? { src: wideFrame, kind: 'frame' }
          : undefined;
    const shortTitle = shortTitleFor(enr.courseId, enr.courseTitle);
    const tile: CourseTileData = {
      id: enr.id,
      href: startHref,
      chaptersHref: `/aprender/${enr.id}`,
      title: shortTitle,
      fullTitle: enr.courseTitle,
      ...(tagline ? { summary: tagline } : {}),
      ...(thumb ? { thumb } : {}),
      ...(posterThumb ? { posterThumb } : {}),
      ...(posterArt ? { posterArt } : {}),
      ...(wide ? { wide } : {}),
      ...(openingVideo ? { previewSrc: `/api/assets/${openingVideo}` } : {}),
      ...(presenter ? { presenter } : {}),
      lessons: totalLessons,
      completed: completedLessons,
      video,
      decisions,
      lessonTitles: lessons.map((l) => l.title),
      lessonDone: done,
      ...(nextIndex >= 0 ? { nextLessonIndex: nextIndex } : {}),
      status: isDone ? 'completed' : started ? 'in_progress' : 'new',
      cta,
      ...(newLessonIndexes.length ? { news: { count: newLessonIndexes.length, href: `/aprender/${enr.id}/aulas/${lessons[newLessonIndexes[0]!]!.id}`, title: lessons[newLessonIndexes[0]!]!.title, indexes: newLessonIndexes } } : {}),
      ...(trail ? { trail } : {}),
    };
    return { enr, lessons, done, ...(current >= 0 ? { current } : {}), completedLessons, totalLessons, newLessonIndexes, started, isDone, startHref, cta, rail, lessonsCopy, ...(tagline ? { tagline } : {}), ...(backdrop ? { backdrop } : {}), ...(thumb ? { thumb } : {}), ...(posterThumb ? { posterThumb } : {}), ...(posterArt ? { posterArt } : {}), ...(presenter ? { presenter } : {}), lastActivity, ...(heroVideo ? { heroVideo } : {}), ...(openingVideo ? { openingVideo } : {}), decisions, video, ...(nextLessonVideo && !nextLessonVideo.missing.length ? { nextLessonVideo: { minS: nextLessonVideo.minS, maxS: nextLessonVideo.maxS } } : {}), ...(trail ? { trail } : {}), slug: enr.courseSlug, ...(portrait ? { portrait } : {}), shortTitle, ...(nextLesson && nextIndex >= 0 ? { nextLessonIndex: nextIndex, nextLessonTitle: nextLesson.title } : {}), tile };
  });
  // trilhas na ordem de aprendizado (TRAIL_ORDER), não alfabética
  const trails = sortTrails([...new Set(courses.map((c) => c.trail).filter((t): t is string => !!t))]);
  return { enrollments, courses, trails };
}
