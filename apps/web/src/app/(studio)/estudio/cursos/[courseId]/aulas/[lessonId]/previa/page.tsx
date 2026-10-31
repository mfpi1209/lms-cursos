import { notFound } from 'next/navigation';
import { getDb, authoring } from '@lms/db';
import { allLessons, findLesson } from '@lms/course-schema';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { buildPlatformContext } from '@/components/player/platform-context';
import { platformDefaultBumper } from '@/server/bumper';
import { PreviewClient } from './preview-client';
import { parseTestParams } from '@/components/studio/test-mode/test-model';

export const metadata = { title: 'Prévia da aula' };
export const dynamic = 'force-dynamic';

export default async function LessonPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireStaff();
  const { courseId, lessonId } = await params;
  const sp = await searchParams;
  const player = Array.isArray(sp.player) ? sp.player[0] : sp.player;
  await requireCourseInWorkspace(viewer, courseId);
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) notFound();
  const found = findLesson(draft.document, lessonId);
  if (!found) notFound();
  // Mesmo visual do aluno. Sem matrícula: o roteiro mostra só as respostas desta prévia.
  const platform = buildPlatformContext({
    document: draft.document,
    lessonId,
    hrefFor: (id) => `/estudio/cursos/${courseId}/aulas/${id}/previa`,
    forceClassic: player === 'classic',
    defaultBumper: await platformDefaultBumper(viewer.workspace.id, draft.document.branding.bumper?.assetId),
  });
  // Modo de teste: ?cena=<nó>&v.<variável>=<valor> começa nessa cena com esses valores (prévia, nada é salvo)
  const test = parseTestParams(found.lesson.graph, sp);
  return (
    <PreviewClient
      courseId={courseId}
      startAt={test.nodeId ? { nodeId: test.nodeId, variables: test.variables } : Object.keys(test.variables).length ? { nodeId: found.lesson.graph.startNodeId, variables: test.variables } : undefined}
      lessons={allLessons(draft.document).map((l) => ({ id: l.id, title: l.title }))}
      lesson={found.lesson}
      courseTitle={draft.document.title}
      exitHref={`/estudio/cursos/${courseId}/aulas/${lessonId}`}
      revision={draft.revision}
      platform={platform}
    />
  );
}
