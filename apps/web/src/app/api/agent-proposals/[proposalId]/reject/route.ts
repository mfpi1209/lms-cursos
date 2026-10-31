import { getDb, agent, DomainError } from '@lms/db';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function POST(_req: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { proposalId } = await ctx.params;
    const p = await agent.getProposal(getDb(), proposalId);
    if (!p) throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
    await requireCourseInWorkspace(viewer, p.courseId);
    if (p.status === 'applied') throw new DomainError('CONFLICT', 'Proposta já aplicada');
    await agent.updateProposal(getDb(), proposalId, { status: 'rejected', decidedAt: new Date() });
    return { ok: true };
  });
}
