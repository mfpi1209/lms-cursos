import { getDb, sources, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/** Coloca uma fonte com falha de volta na fila de leitura (o worker reprocessa o arquivo). */
export async function POST(_req: Request, ctx: { params: Promise<{ courseId: string; sourceId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId, sourceId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const db = getDb();
    const src = await sources.getSource(db, sourceId);
    if (!src || src.courseId !== courseId) throw new DomainError('NOT_FOUND', 'Fonte não encontrada');
    const row = await sources.requeueSourceIngest(db, sourceId);
    return { source: sources.publicSource(row) };
  });
}
