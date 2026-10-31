import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getDb, authoring } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { LessonWorkspace } from './lesson-workspace';

export const metadata = { title: 'Editor de aula' };
export const dynamic = 'force-dynamic';

export default async function LessonEditorPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const viewer = await requireStaff();
  const { courseId, lessonId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft || !findLesson(draft.document, lessonId)) notFound();
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Carregando editor…</p>}>
      <LessonWorkspace courseId={courseId} lessonId={lessonId} />
    </Suspense>
  );
}
