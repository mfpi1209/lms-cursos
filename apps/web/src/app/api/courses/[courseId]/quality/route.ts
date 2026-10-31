import { getDb, agent, authoring, DomainError } from '@lms/db';
import { aggregateScorecards } from '@lms/ai/client';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { parseScorecard } from '@/server/quality';

/**
 * Qualidade do curso ("Avaliação"): uma entrada por aula do rascunho, na ordem
 * do curso, com o último cartão (ou null) e `stale` quando o rascunho mudou
 * depois da avaliação; `course` traz o agregado (nota geral e por dimensão).
 * Resposta: `{ revision, lessons: [{ lessonId, title, scorecard, stale, evaluatedAt, draftRevision }], course: { evaluated, lessons, overall, byDimension, stale } }`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const rows = await agent.courseQuality(getDb(), courseId, draft.document, draft.revision);
    const lessons = rows.map((r) => ({ ...r, scorecard: parseScorecard(r.scorecard) }));
    return { revision: draft.revision, lessons, course: aggregateScorecards(lessons) };
  });
}
