import { z } from 'zod';
import { getDb, authoring, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    return { document: draft.document, revision: draft.revision, updatedAt: draft.updatedAt };
  });
}

const SaveSchema = z.object({ document: z.unknown(), expectedRevision: z.number().int().min(1), note: z.string().max(200).optional() });

/** Autosave: PUT com expectedRevision; 409 se outra pessoa gravou antes. */
export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, SaveSchema);
    return authoring.saveDraft(getDb(), { courseId, document: body.document, expectedRevision: body.expectedRevision, userId: viewer.user.id, note: body.note });
  });
}
