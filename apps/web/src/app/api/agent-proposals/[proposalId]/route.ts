import { getDb, agent, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { proposalId } = await ctx.params;
    const p = await agent.getProposal(getDb(), proposalId);
    if (!p) throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
    await requireCourseInWorkspace(viewer, p.courseId);
    return { proposal: agent.publicProposal(p) };
  });
}
