import { z } from 'zod';
import { getDb, reviewMarks } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { markAction } from '@/server/video-review-fix';

export const runtime = 'nodejs';

const PatchSchema = z.object({ action: z.enum(['approve', 'resolve', 'reopen', 'still_wrong']) });

/**
 * `PATCH { action }`: `resolve` (Resolvida), `reopen` (reabrir / cancelar o pedido), `still_wrong` (Ainda errado: volta a
 * aberta apontando para o vídeo novo) e `approve` (Aprovar US$ X: registra a aprovação; o operador executa).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ courseId: string; markId: string }> }) {
  return route(async () => {
    const { action } = await parseBody(req, PatchSchema);
    const viewer = action === 'approve' ? await requireEditor() : await requireStaff();
    const { courseId, markId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const mark = await markAction({ workspaceId: viewer.workspace.id, userId: viewer.user.id }, courseId, markId, action);
    return { mark: { id: mark.id, status: mark.status, attempts: mark.attempts, approvalUsd: mark.approvalUsd, fix: mark.fix, history: mark.history } };
  });
}

/** `DELETE`: apaga a marca (marcada por engano). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ courseId: string; markId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId, markId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    await reviewMarks.deleteMark(getDb(), { workspaceId: viewer.workspace.id, markId });
    return { ok: true };
  });
}
