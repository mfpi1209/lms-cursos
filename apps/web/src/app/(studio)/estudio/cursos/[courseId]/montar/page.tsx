import { identity } from '@lms/db';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { WizardShell } from '@/components/studio/wizard/wizard-shell';

export const metadata = { title: 'Montar curso' };
export const dynamic = 'force-dynamic';

export default async function AssemblePage({ params }: { params: Promise<{ courseId: string }> }) {
  const viewer = await requireStaff();
  const { courseId } = await params;
  await requireCourseInWorkspace(viewer, courseId);
  return <WizardShell courseId={courseId} canPublish={identity.canPublish(viewer.role)} />;
}
