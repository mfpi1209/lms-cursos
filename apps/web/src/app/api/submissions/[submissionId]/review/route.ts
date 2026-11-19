import { z } from 'zod';
import { TASK_COMMENT_MAX, TASK_CRITERIA_MAX } from '@lms/course-schema';
import { getDb, certificates, submissions } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

const Body = z.object({
  decision: z.enum(['approve', 'return']),
  criteria: z.array(z.object({ id: z.string().min(1).max(64), met: z.boolean() })).max(TASK_CRITERIA_MAX),
  comment: z.string().max(TASK_COMMENT_MAX * 2).nullish(),
  /** a versão da entrega que o avaliador estava vendo */
  expectedRevision: z.number().int().min(1),
});

/**
 * Correção de uma entrega: aprovar (todos os critérios atendidos) ou devolver com comentário. Só a equipe (admin, autor
 * ou revisor) do workspace da entrega; entrega de outro workspace responde 404. As regras e a auditoria estão em
 * `submissions.reviewSubmission`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ submissionId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { submissionId } = await ctx.params;
    const body = await parseBody(req, Body);
    const row = await submissions.reviewSubmission(getDb(), {
      submissionId,
      workspaceId: viewer.workspace.id,
      reviewerId: viewer.user.id,
      decision: body.decision,
      criteria: body.criteria,
      comment: body.comment ?? null,
      expectedRevision: body.expectedRevision,
    });
    // tarefa aprovada pode fechar a regra do certificado
    if (row.status === 'approved' && row.enrollmentId) await certificates.tryIssue(getDb(), row.enrollmentId);
    return { submission: { id: row.id, status: row.status, revision: row.revision, reviewedAt: row.reviewedAt?.toISOString() ?? null } };
  });
}
