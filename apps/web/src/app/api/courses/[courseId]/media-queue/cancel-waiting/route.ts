import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/** Cancela todos os vídeos que ainda esperam na fila. Os já enviados ao HeyGen (pagos) seguem. */
export async function POST(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const rows = await getDb()
      .update(schema.mediaJobs)
      .set({ status: 'canceled', phase: 'canceled', finishedAt: new Date(), updatedAt: new Date(), lastError: 'cancelado pelo autor antes de iniciar' })
      .where(and(eq(schema.mediaJobs.courseId, courseId), eq(schema.mediaJobs.status, 'queued')))
      .returning({ id: schema.mediaJobs.id });
    return { canceled: rows.length };
  });
}
