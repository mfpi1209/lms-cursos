import { z } from 'zod';
import { getDb, library } from '@lms/db';
import { LibraryTemplateInputSchema, TemplateKindSchema } from '@lms/course-schema';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';

/** Biblioteca de modelos do workspace (`?kind=kit|studio|presenter|voice|branding|direction|knowledge|learner`). */
export async function GET(req: Request) {
  return route(async () => {
    const viewer = await requireStaff();
    const kindParam = new URL(req.url).searchParams.get('kind');
    const kind = kindParam ? TemplateKindSchema.parse(kindParam) : undefined;
    const rows = await library.listTemplates(getDb(), viewer.workspace.id, { ...(kind ? { kind } : {}) });
    return { templates: rows.map(library.publicTemplate) };
  });
}

const UpsertSchema = z.object({ template: LibraryTemplateInputSchema, previewAssetId: z.string().max(64).nullable().optional() });

/** Cria ou atualiza um modelo pela chave. Só dados: nada é gerado. */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireEditor();
    const body = await parseBody(req, UpsertSchema);
    const r = await library.upsertTemplate(getDb(), { workspaceId: viewer.workspace.id, template: body.template, createdBy: viewer.user.id, ...(body.previewAssetId !== undefined ? { previewAssetId: body.previewAssetId } : {}) });
    return { template: library.publicTemplate(r.row), created: r.created, changed: r.changed };
  });
}
