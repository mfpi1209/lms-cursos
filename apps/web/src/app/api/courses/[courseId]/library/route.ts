import { z } from 'zod';
import { getDb, library } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

const ApplySchema = z.object({ template: z.string().trim().min(1).max(80), expectedRevision: z.number().int().min(1).optional() });

/**
 * "Usar neste curso": aplica um kit (ou voz/marca/direção) da biblioteca ao
 * rascunho. Grava uma revisão nova e NADA mais — nenhum pedido de vídeo ou voz,
 * nenhuma chamada a provedor. Os vídeos já feitos podem ficar desatualizados;
 * produzir de novo continua passando pelo orçamento e pela aprovação.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, ApplySchema);
    return library.applyTemplateToCourse(getDb(), { workspaceId: viewer.workspace.id, courseId, templateIdOrKey: body.template, userId: viewer.user.id, ...(body.expectedRevision ? { expectedRevision: body.expectedRevision } : {}) });
  });
}
