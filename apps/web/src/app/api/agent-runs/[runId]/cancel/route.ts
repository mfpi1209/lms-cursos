import { getDb, agent, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/** Cancela uma execução do agente presa na fila ou em andamento. */
export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { runId } = await ctx.params;
    const run = await agent.getRun(getDb(), runId);
    if (!run) throw new DomainError('NOT_FOUND', 'Execução não encontrada');
    await requireCourseInWorkspace(viewer, run.courseId);
    const canceled = await agent.cancelRun(getDb(), runId);
    if (!canceled) throw new DomainError('CONFLICT', `Execução já está em estado ${run.status}`);
    return { run: agent.publicRun(canceled) };
  });
}
