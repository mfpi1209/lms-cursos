import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { ProductionPanel } from '@/components/studio/media-queue/production-panel';
import { AssistantScope } from '@/components/studio/assistant/use-assistant';

export const metadata = { title: 'Produção de vídeos' };
export const dynamic = 'force-dynamic';

/** Fila de produção de vídeos do curso, em tela cheia. */
export default async function ProductionPage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  return (
    <>
      <AssistantScope context={{ screen: 'production' }} />
      <ProductionPanel courseId={courseId} headingLevel="h2" />
    </>
  );
}
