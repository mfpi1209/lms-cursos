import { getDb, library, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';

/** Um modelo (id `tpl_…` ou chave). Kits vêm com o resumo das peças. */
export async function GET(_req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { templateId } = await ctx.params;
    const db = getDb();
    const row = await library.getTemplate(db, viewer.workspace.id, templateId);
    if (!row) throw new DomainError('NOT_FOUND', 'Modelo não encontrado');
    let summary: string[] | undefined;
    if (row.kind === 'kit') {
      const { kitSummary } = await import('@lms/course-schema');
      summary = await library.resolveKit(db, viewer.workspace.id, row.id).then(kitSummary).catch((e: unknown) => [`Kit incompleto: ${e instanceof Error ? e.message : String(e)}`]);
    }
    return { template: library.publicTemplate(row), ...(summary ? { summary } : {}) };
  });
}

/** Arquiva o modelo (some da biblioteca; nada é apagado). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ templateId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { templateId } = await ctx.params;
    const row = await library.archiveTemplate(getDb(), viewer.workspace.id, templateId);
    return { template: library.publicTemplate(row) };
  });
}
