import { z } from 'zod';
import { TASK_LINK_MAX } from '@lms/course-schema';
import { getDb, submissions } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';

const Body = z.object({
  link: z.string().max(TASK_LINK_MAX * 2),
  fileAssetId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

/**
 * Reenvio de uma entrega DEVOLVIDA, fora da aula (página do curso). Só o aluno dono da matrícula; só quando a entrega
 * está devolvida (ver `submissions.resubmitTask`). O primeiro envio acontece na aula, pela intenção `submit`.
 * Não mexe na aula nem no curso concluído. Resposta: a entrega como ficou (de volta para a correção).
 */
export async function PUT(req: Request, ctx: { params: Promise<{ enrollmentId: string; nodeId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId, nodeId } = await ctx.params;
    await requireOwnEnrollment(viewer, enrollmentId);
    const body = await parseBody(req, Body);
    const db = getDb();
    const row = await submissions.resubmitTask(db, { enrollmentId, nodeId, link: body.link, fileAssetId: body.fileAssetId });
    return { task: await submissions.taskRecordOf(db, row) };
  });
}
