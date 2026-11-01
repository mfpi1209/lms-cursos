import { notFound } from 'next/navigation';
import { DomainError, getDb, identity, learning, recognition } from '@lms/db';
import { findLesson, trailSlug } from '@lms/course-schema';
import { requireViewer, HttpError } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';
import { learnerTabTitle } from '@/server/learner-metadata';
import { buildPlatformContext } from '@/components/player/platform-context';
import { platformDefaultBumper } from '@/server/bumper';
import type { LessonRunStatus } from '@/components/player/types';
import { brandMarkOf, getBrand } from '@/config/brand';
import { LessonClient } from './lesson-client';
import { shortTitleFor } from '../../../_lib/short-titles';
import { loadPlayerSeries } from '../../../_lib/series-server';
import { trailSealNote } from '../../../_lib/trail-note';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ enrollmentId: string; lessonId: string }> }) {
  const { enrollmentId, lessonId } = await params;
  return learnerTabTitle(enrollmentId, { lessonId, fallback: 'Aula' });
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string; lessonId: string }>;
  searchParams: Promise<{ player?: string; reiniciar?: string }>;
}) {
  const viewer = await requireViewer();
  const { enrollmentId, lessonId } = await params;
  const { player, reiniciar } = await searchParams;

  let enr: Awaited<ReturnType<typeof requireOwnEnrollment>>;
  try {
    enr = await requireOwnEnrollment(viewer, enrollmentId);
  } catch (e) {
    if ((e instanceof DomainError && e.code === 'NOT_FOUND') || (e instanceof HttpError && e.status === 404)) notFound();
    throw e;
  }
  const found = findLesson(enr.document, lessonId);
  if (!found) notFound();

  // Situação de cada aula (segmentos de progresso do palco): concluída se alguma tentativa concluiu.
  const attempts = await learning.listAttemptsForEnrollment(getDb(), enrollmentId);
  const statuses: Record<string, LessonRunStatus> = {};
  for (const a of attempts) {
    if (a.status === 'completed') statuses[a.lessonId] = 'completed';
    else if (a.status === 'in_progress' && statuses[a.lessonId] !== 'completed') statuses[a.lessonId] = 'in_progress';
  }
  const platform = buildPlatformContext({
    document: enr.document,
    lessonId,
    statuses,
    enrollmentId,
    hrefFor: (id) => `/aprender/${enrollmentId}/aulas/${id}`,
    forceClassic: player === 'classic',
    // vinheta padrão do workspace do curso (quando o curso não define a sua)
    defaultBumper: await platformDefaultBumper(enr.course.workspaceId, enr.document.branding.bumper?.assetId),
    // o canto esquerdo do cabeçalho mostra o logo da marca, como o catálogo e a página do curso
    brandMark: brandMarkOf(getBrand(enr.course.workspaceId)),
  });
  // equipe que edita este curso: link discreto "Abrir no estúdio" (na cena atual)
  // topo do player: o centro mostra o mesmo nome curto das capas (`shortTitleFor`, o do catálogo); o wordmark/subtitle gravados no curso não entram
  const short = shortTitleFor(enr.course.id, '');
  platform.courseShortTitle = shortTitleFor(enr.course.id, enr.course.title);
  // reconhecimento: conquista por curso (na plataforma) e Selo DNA Work por trilha (não há mais selo por curso)
  platform.achievement = `Curso concluído · ${short || enr.course.title}`;
  if (enr.course.trail) {
    const ts = await recognition.trailStatus(getDb(), { workspaceId: enr.course.workspaceId, userId: viewer.user.id, trail: enr.course.trail });
    platform.courseTrail = { name: ts.trail, href: `/aprender/trilhas/${trailSlug(ts.trail)}`, done: ts.courses.filter((c) => c.done).length, total: ts.courses.length, badge: !!ts.badge, currentDone: ts.courses.some((c) => c.courseId === enr.course.id && c.done) };
    // trilha em série (só apresentação): "Trilha · Parte N de 3" no cabeçalho e a próxima parte no fim do curso
    const series = await loadPlayerSeries({ userId: viewer.user.id, courseSlug: enr.course.slug, trail: enr.course.trail, currentEnrollmentId: enrollmentId });
    if (series) {
      platform.series = series;
      // o que falta para o selo, contando este curso como concluído (o aluno chega ao fim dele)
      const note = trailSealNote({ ...ts, courses: ts.courses.map((c) => (c.courseId === enr.course.id ? { ...c, done: true } : c)) }, 'parte');
      platform.courseTrail = { ...platform.courseTrail, series: true, sealNote: note };
    }
  }
  if (identity.canEdit(viewer.role) && enr.course.workspaceId === viewer.workspace.id) platform.studioHref = `/estudio/cursos/${enr.course.id}/aulas/${lessonId}`;

  // A aula é JSON serializável (schema zod): vai como prop para o cliente.
  return <LessonClient lesson={found.lesson} enrollmentId={enrollmentId} courseTitle={enr.course.title} platform={platform} restart={reiniciar === '1'} />;
}
