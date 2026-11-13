import { z } from 'zod';
import { getDb, authoring, media, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { draftFingerprint, getMediaConfig } from '@/server/media';
import { buildQuoteItems } from '@/server/media-quote';
import { mediaBudgetCheck } from '@/server/spend';

const QuoteSchema = z.object({
  /** restringe às aulas (vazio/ausente = todas) */
  lessonIds: z.array(z.string().min(1).max(64)).max(500).optional(),
  /** restringe às cenas (ids de nó; vazio/ausente = todas as elegíveis). Cenas listadas entram mesmo com vídeo atualizado. */
  nodeIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
  /** incluir cenas com vídeo desatualizado (stale) além das sem vídeo */
  includeStale: z.boolean().default(true),
});

/**
 * Orçamento de produção (auditoria P0-2): resolve cada cena elegível no
 * servidor, confere direção/fala como o pedido avulso, identifica as que
 * reaproveitam um vídeo já pago (custo 0) e devolve o total estimado com um
 * `quoteId` de validade curta. Nada é criado nem cobrado aqui.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, QuoteSchema);
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const doc = draft.document;
    const cfg = getMediaConfig();
    if (!doc.presentation.avatarId) throw new DomainError('VALIDATION', 'Escolha um apresentador no passo "Apresentação" antes de calcular o orçamento');
    if (doc.presentation.background.type !== 'color' && doc.presentation.background.assetId) {
      const bg = await media.getAsset(db, doc.presentation.background.assetId);
      if (!bg || bg.workspaceId !== viewer.workspace.id || bg.kind !== 'image') throw new DomainError('VALIDATION', 'A imagem de fundo da apresentação é inválida; escolha outra no passo "Apresentação"');
    }
    const { items, errors } = await buildQuoteItems(db, { doc, workspaceId: viewer.workspace.id, courseId, lessonIds: body.lessonIds, nodeIds: body.nodeIds, includeStale: body.includeStale, cfg });
    const quote = await media.createQuote(db, {
      workspaceId: viewer.workspace.id, courseId, draftRevision: draft.revision, draftHash: draftFingerprint(doc), simulated: cfg.simulation, items,
      params: { lessonIds: body.lessonIds ?? null, nodeIds: body.nodeIds ?? null, includeStale: body.includeStale, errors: errors.length }, createdBy: viewer.user.id,
    });
    // o teto é informado aqui e imposto no lote (nada é criado agora)
    const budget = cfg.simulation ? null : await mediaBudgetCheck(viewer.workspace.id, quote.totals.estimatedUsd);
    return { ...media.publicQuote(quote), mode: cfg.mode, errors, budget };
  });
}
