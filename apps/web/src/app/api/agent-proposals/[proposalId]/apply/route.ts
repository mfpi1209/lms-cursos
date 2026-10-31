import { z } from 'zod';
import { getDb, agent, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

const Schema = z.object({
  expectedRevision: z.number().int().min(1),
  /** aplica mesmo com a aula/estrutura editada depois da proposta (conflito de revisão) */
  force: z.boolean().optional(),
  /** scene_variations: índice da variação escolhida */
  choice: z.number().int().min(0).max(9).optional(),
  /** scene_direction: sobrescreve também as cenas com direção ajustada pelo autor (padrão: elas são puladas e listadas em skippedAuthored) */
  overwriteAuthored: z.boolean().optional(),
  /** outline: confirma a perda das cenas das aulas removidas (sem isto, 409 com details.code CONTENT_LOSS e a lista) */
  confirmLoss: z.boolean().optional(),
  /** lesson/revise_lesson: aplica uma proposta que ainda tem erros de estrutura (sem isto, 409 com details.code PROPOSAL_HAS_ERRORS) */
  acceptErrors: z.boolean().optional(),
});

/**
 * Aplica uma proposta da IA ao rascunho. Respostas 409 trazem em `details`:
 * `conflict` (aula/estrutura editada depois; repita com `force`),
 * `contentLoss` + `lost[]` (estrutura remove aulas com cenas; repita com `confirmLoss`),
 * `hasErrors` + `errors[]` (proposta com erros; repita com `acceptErrors`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { proposalId } = await ctx.params;
    const p = await agent.getProposal(getDb(), proposalId);
    if (!p) throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
    await requireCourseInWorkspace(viewer, p.courseId);
    const body = await parseBody(req, Schema);
    return agent.applyProposal(getDb(), { proposalId, userId: viewer.user.id, expectedRevision: body.expectedRevision, force: body.force, choice: body.choice, overwriteAuthored: body.overwriteAuthored, confirmLoss: body.confirmLoss, acceptErrors: body.acceptErrors });
  });
}
