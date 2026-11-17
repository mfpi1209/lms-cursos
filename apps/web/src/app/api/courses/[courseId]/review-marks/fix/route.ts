import { z } from 'zod';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { requestFixes } from '@/server/video-review-fix';

export const runtime = 'nodejs';

const FixSchema = z.object({ markIds: z.array(z.string().min(1).max(64)).min(1).max(200) });

/**
 * "Corrigir" / "Corrigir tudo": classifica as marcas abertas (grátis / edição / pago / manual) com o orçamento do
 * estúdio, grava o prompt de correção e muda o status. Nada pago é enfileirado; grátis só com o estúdio em modo real.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const { markIds } = await parseBody(req, FixSchema);
    return requestFixes({ workspaceId: viewer.workspace.id, userId: viewer.user.id }, courseId, markIds);
  });
}
