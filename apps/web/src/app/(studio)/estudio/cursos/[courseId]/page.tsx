import { notFound, redirect } from 'next/navigation';
import { getDb, authoring } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { CoursePanel } from '@/components/studio/course-panel';
import { AssistantScope } from '@/components/studio/assistant/use-assistant';
import { NextSteps } from '@/components/studio/assistant/next-steps';

export const metadata = { title: 'Painel do curso' };
export const dynamic = 'force-dynamic';

/**
 * Casa do curso. Só na PRIMEIRA visita (curso recém-criado, ainda sem aulas)
 * leva direto ao assistente de montagem; depois disso o painel fica sempre
 * acessível, com um aviso enquanto a montagem não terminou.
 */
export default async function CourseHomePage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  const course = await requireCourseInWorkspace(viewer, courseId);
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) notFound();
  // cursos publicados antes do assistente existir contam como montagem concluída
  const assembling = !draft.document.wizard.finished && course.latestVersionNumber === 0;
  const hasLessons = draft.document.modules.some((m) => m.lessons.length > 0);
  if (assembling && !hasLessons) redirect(`/estudio/cursos/${courseId}/montar`);
  return (
    <div className="space-y-8">
      <AssistantScope context={{ screen: 'course' }} />
      <NextSteps variant="card" headingLevel="h2" />
      <CoursePanel courseId={courseId} latestVersionNumber={course.latestVersionNumber} assembling={assembling} />
    </div>
  );
}
