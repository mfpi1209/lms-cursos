import { notFound } from 'next/navigation';
import { getDb, authoring, DomainError } from '@lms/db';
import { requireStaff, HttpError } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { DraftProvider } from '@/components/studio/draft-provider';
import { CourseChrome } from '@/components/studio/course-tabs';
import { MediaQueueProvider } from '@/components/studio/media-queue/use-media-queue';
import { AssistantProvider } from '@/components/studio/assistant/assistant-context';
import { AssistantDock } from '@/components/studio/assistant/assistant-dock';

export const dynamic = 'force-dynamic';

export default async function CourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  let course: Awaited<ReturnType<typeof requireCourseInWorkspace>>;
  try {
    course = await requireCourseInWorkspace(viewer, courseId);
  } catch (e) {
    if ((e instanceof DomainError && e.code === 'NOT_FOUND') || (e instanceof HttpError && e.status === 404)) notFound();
    throw e;
  }
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) notFound();

  return (
    <DraftProvider
      courseId={courseId}
      initialDocument={draft.document}
      initialRevision={draft.revision}
      initialUpdatedAt={draft.updatedAt ? new Date(draft.updatedAt).toISOString() : null}
    >
      <MediaQueueProvider courseId={courseId}>
        <AssistantProvider courseId={courseId}>
          <CourseChrome courseId={courseId} status={course.status} latestVersionNumber={course.latestVersionNumber} />
          {children}
          <AssistantDock />
        </AssistantProvider>
      </MediaQueueProvider>
    </DraftProvider>
  );
}
