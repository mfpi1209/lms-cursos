import { getDb, sources, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function DELETE(_req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { sourceId } = await ctx.params;
    const src = await sources.getSource(getDb(), sourceId);
    if (!src) throw new DomainError('NOT_FOUND', 'Fonte não encontrada');
    await requireCourseInWorkspace(viewer, src.courseId);
    await sources.deleteSource(getDb(), sourceId);
    return { ok: true };
  });
}
