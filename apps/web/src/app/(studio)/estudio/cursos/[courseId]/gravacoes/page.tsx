import { identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { screenRecordingLimit } from '@/server/screen-recordings';
import { ScreenRecordingsPanel } from '@/components/studio/screen-recordings/screen-recordings-panel';

export const metadata = { title: 'Gravações de tela' };
export const dynamic = 'force-dynamic';

/** Gravações de tela do curso: o que falta enviar, envio em lote por nome de arquivo e o estado depois da montagem. */
export default async function ScreenRecordingsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  return <ScreenRecordingsPanel courseId={courseId} canEdit={identity.canEdit(viewer.role)} maxBytes={screenRecordingLimit()} />;
}
