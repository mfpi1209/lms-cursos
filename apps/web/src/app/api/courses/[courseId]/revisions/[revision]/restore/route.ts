import { z } from 'zod';
import { getDb, authoring } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

const Schema = z.object({ expectedRevision: z.number().int().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string; revision: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId, revision } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const { expectedRevision } = await parseBody(req, Schema);
    return authoring.restoreDraftRevision(getDb(), { courseId, revision: Number(revision), expectedRevision, userId: viewer.user.id });
  });
}
