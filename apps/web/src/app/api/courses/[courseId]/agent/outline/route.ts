import { z } from 'zod';
import { agent } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';

const Schema = z.object({ instruction: z.string().max(2000).optional() }).default({});

/** Enfileira "Propor estrutura" (briefing + fontes). O worker chama o provedor. */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = req.headers.get('content-type')?.includes('json') ? await parseBody(req, Schema) : {};
    const run = await enqueueRun(viewer, { courseId, task: 'outline', instruction: body.instruction });
    return { run: agent.publicRun(run) };
  });
}
