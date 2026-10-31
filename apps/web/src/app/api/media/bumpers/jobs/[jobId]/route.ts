import { DomainError, getDb, media } from '@lms/db';
import { isBumperJobInput, type BumperJobInput } from '@lms/media';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { publicJob } from '@/server/media';
import { publicBumper } from '@/server/bumper';

/** Situação de um job de vinheta (para o estúdio acompanhar) e, pronto, as saídas por proporção. */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { jobId } = await ctx.params;
    const db = getDb();
    const job = await media.getJob(db, jobId);
    if (!job || job.workspaceId !== viewer.workspace.id || !isBumperJobInput(job.input)) throw new DomainError('NOT_FOUND', 'Job de vinheta não encontrado');
    const outputs = (job.input as unknown as BumperJobInput).outputs ?? {};
    const assets = await Promise.all(Object.values(outputs).map((o) => media.getAsset(db, o.assetId)));
    return { job: publicJob(job), outputs: assets.filter((a): a is NonNullable<typeof a> => !!a).map(publicBumper).filter((b) => !!b) };
  });
}
