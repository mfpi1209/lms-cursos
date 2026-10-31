import { getDb, learning } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ enrollmentId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { enrollmentId } = await ctx.params;
    const report = await learning.getEnrollmentReport(getDb(), enrollmentId);
    await requireCourseInWorkspace(viewer, report.course.id);
    return report;
  });
}
