import { getDb, submissions } from '@lms/db';
import { route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnEnrollment } from '@/server/learner';

/**
 * Entregas de tarefa da matrícula, por tarefa: situação (em correção, aprovada, devolvida), o link, o arquivo, o
 * comentário do avaliador e os critérios conferidos. Só o aluno dono da matrícula (a equipe usa a tela de correção).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ enrollmentId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId } = await ctx.params;
    await requireOwnEnrollment(viewer, enrollmentId);
    return { tasks: await submissions.taskRecords(getDb(), { enrollmentId }) };
  });
}
