import { getDb, authoring } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function POST(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    return authoring.duplicateCourse(getDb(), { courseId, userId: viewer.user.id, workspaceId: viewer.workspace.id });
  });
}
