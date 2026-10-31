import { getDb, learning } from '@lms/db';
import { route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireEnrollmentReader } from '@/server/learner';

/**
 * Respostas do aluno no CURSO inteiro (todas as aulas da matrícula): a mais
 * recente por nó. Alimenta a página "Meu roteiro" com respostas de outras aulas.
 *
 * Resposta:
 * {
 *   answers: Record<nodeId, { lessonId, kind: 'choice'|'reflection'|'assessment', optionIds?, text?, passed?, answeredAt }>,
 *   nodes:   Record<nodeId, { title, type, options?: { id, label }[] }>   // só os nós citados em `answers`
 * }
 *
 * Uso no player: `resolveRecap(graph, endNode, state, { answers, lookupNode: (id) => nodes[id] })`
 * (a tentativa atual vence; ver `mergeAnswers`).
 *
 * Acesso: o aluno dono da matrícula ou a equipe do workspace do curso.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ enrollmentId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { enrollmentId } = await ctx.params;
    const enr = await requireEnrollmentReader(viewer, enrollmentId);
    const answers = await learning.courseAnswers(getDb(), { enrollmentId });
    return { answers, nodes: learning.answeredNodeSummaries(enr.document, answers) };
  });
}
