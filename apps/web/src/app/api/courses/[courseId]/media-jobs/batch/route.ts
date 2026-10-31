import { z } from 'zod';
import { getDb, authoring, media, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { draftFingerprint, getMediaConfig, publicJob, reusedMediaFor } from '@/server/media';
import { mediaBudgetCheck } from '@/server/spend';

const BatchSchema = z.object({
  quoteId: z.string().min(1).max(64),
  /** confirmação explícita de ação paga */
  confirmPaid: z.literal(true),
});

/**
 * Lote de produção a partir de um orçamento aprovado: cria todos os jobs numa
 * transação (unicidade de job aberto por cena respeitada), recusa orçamento
 * vencido/usado ou rascunho alterado (409), impõe o teto diário (402) e
 * registra quem aprovou, quando e com qual orçamento em cada job. Cenas
 * reaproveitadas recebem a mídia já paga sem novo job.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, BatchSchema);
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const cfg = getMediaConfig();
    const quote = await media.getQuote(db, body.quoteId);
    if (!quote || quote.workspaceId !== viewer.workspace.id || quote.courseId !== courseId) throw new DomainError('NOT_FOUND', 'Orçamento não encontrado');

    // teto diário do workspace antes de criar qualquer job (só gasto real)
    const budget = cfg.simulation ? null : media.assertWithinBudget(await mediaBudgetCheck(viewer.workspace.id, quote.totals.estimatedUsd));

    const result = await media.createJobsFromQuote(db, {
      quoteId: quote.id, workspaceId: viewer.workspace.id, courseId, userId: viewer.user.id,
      currentDraftRevision: draft.revision, currentDraftHash: draftFingerprint(draft.document), simulated: cfg.simulation,
    });

    // cenas reaproveitadas: anexa a mídia já paga (uma revisão do rascunho por cena; falhas não desfazem o lote)
    const reused: Array<{ lessonId: string; nodeId: string; jobId: string; error?: string }> = [];
    for (const it of result.reused) {
      const job = it.reusedJobId ? await media.getJob(db, it.reusedJobId) : null;
      if (!job?.outputAssetId) {
        reused.push({ lessonId: it.lessonId, nodeId: it.nodeId, jobId: it.reusedJobId ?? '', error: 'vídeo reaproveitável não encontrado' });
        continue;
      }
      try {
        await authoring.setNodeMedia(db, { courseId, lessonId: it.lessonId, nodeId: it.nodeId, userId: viewer.user.id, note: `Mídia reaproveitada (orçamento ${quote.id})`, media: reusedMediaFor(job, it.sceneHash, String((job.input as { script?: unknown }).script ?? '')) });
        reused.push({ lessonId: it.lessonId, nodeId: it.nodeId, jobId: job.id });
      } catch (e) {
        reused.push({ lessonId: it.lessonId, nodeId: it.nodeId, jobId: job.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return {
      quote: media.publicQuote(result.quote),
      created: result.created.map(publicJob),
      reused,
      skippedOpen: result.skippedOpen,
      budget,
      mode: cfg.mode,
    };
  });
}
