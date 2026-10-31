import { notFound } from 'next/navigation';
import { DomainError, getDb, identity, learning } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { requireViewer, HttpError } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';
import { learnerTabTitle } from '@/server/learner-metadata';
import { buildPlatformContext } from '@/components/player/platform-context';
import { platformDefaultBumper } from '@/server/bumper';
import type { LessonRunStatus } from '@/components/player/types';
import { LessonClient } from './lesson-client';

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
  });
  // equipe que edita este curso: link discreto "Abrir no estúdio" (na cena atual)
  if (identity.canEdit(viewer.role) && enr.course.workspaceId === viewer.workspace.id) platform.studioHref = `/estudio/cursos/${enr.course.id}/aulas/${lessonId}`;

  // A aula é JSON serializável (schema zod): vai como prop para o cliente.
  return <LessonClient lesson={found.lesson} enrollmentId={enrollmentId} courseTitle={enr.course.title} platform={platform} restart={reiniciar === '1'} />;
}
