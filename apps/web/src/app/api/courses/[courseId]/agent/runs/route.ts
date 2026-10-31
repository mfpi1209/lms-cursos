import { getDb, agent } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    return { runs: (await agent.listRunsForCourse(getDb(), courseId)).map(agent.publicRun) };
  });
}
