import { getDb, agent, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { runId } = await ctx.params;
    const run = await agent.getRun(getDb(), runId);
    if (!run) throw new DomainError('NOT_FOUND', 'Execução não encontrada');
    await requireCourseInWorkspace(viewer, run.courseId);
    return { run: agent.publicRun(run) };
  });
}
