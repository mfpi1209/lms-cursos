import { z } from 'zod';
import { getDb, agent, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

const Schema = z.object({
  proposalIds: z.array(z.string().max(64)).min(1).max(40),
  expectedRevision: z.number().int().min(1),
  force: z.boolean().optional(),
  /** aplica também propostas de aula que ainda têm erros de estrutura (409 PROPOSAL_HAS_ERRORS sem isto) */
  acceptErrors: z.boolean().optional(),
  /** outline: confirma a perda de cenas de aulas removidas */
  confirmLoss: z.boolean().optional(),
});

/** Aprovação editorial em lote: aplica várias propostas em sequência (tudo ou nada). */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, Schema);
    for (const id of body.proposalIds) {
      const p = await agent.getProposal(getDb(), id);
      if (!p || p.courseId !== courseId) throw new DomainError('NOT_FOUND', `Proposta ${id} não pertence a este curso`);
    }
    return agent.applyProposalsBatch(getDb(), { proposalIds: body.proposalIds, userId: viewer.user.id, expectedRevision: body.expectedRevision, force: body.force, acceptErrors: body.acceptErrors, confirmLoss: body.confirmLoss });
  });
}
