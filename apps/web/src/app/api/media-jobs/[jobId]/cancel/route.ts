import { getDb, media, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/**
 * Cancela um job aberto.
 * - Na fila: cancela sem custo.
 * - Plano único já enviado ao HeyGen: não cancela (já foi cobrado; será anexado à cena).
 * - Dirigido em execução: cancela; o worker não envia mais nenhum plano, e os
 *   planos já enviados ainda são baixados e guardados para reaproveitamento.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { jobId } = await ctx.params;
    const job = await media.getJob(getDb(), jobId);
    if (!job) throw new DomainError('NOT_FOUND', 'Job não encontrado');
    await requireCourseInWorkspace(viewer, job.courseId);
    return media.cancelJob(getDb(), job);
  });
}
