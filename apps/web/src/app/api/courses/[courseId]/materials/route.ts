import { DomainError, getDb } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { MATERIAL_MAX_BYTES, storeMaterialFile } from '@/server/materials';

export const runtime = 'nodejs';

/**
 * Envio do ARQUIVO de um material de apoio (multipart, campo "file"): PDF, PNG ou JPEG até 25 MB, conferido pelos
 * bytes. Só grava o arquivo e devolve `{ assetId, format, sizeBytes, originalName }`; quem liga o material ao curso é
 * o rascunho (`materials` no documento), salvo pelo estúdio como qualquer outra edição. Só a equipe que edita cursos.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MATERIAL_MAX_BYTES + 1024 * 1024) throw new DomainError('VALIDATION', 'O arquivo passa de 25 MB.');
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new DomainError('VALIDATION', 'Envie um arquivo no campo "file"');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return storeMaterialFile(getDb(), { workspaceId: viewer.workspace.id, courseId, userId: viewer.user.id, bytes, fileName: file.name });
  });
}
