import { getDb, agent, authoring, DomainError } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { scorecardIsStale } from '@lms/ai/client';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { parseScorecard } from '@/server/quality';

/**
 * Último cartão de qualidade de uma aula:
 * `{ revision, lessonId, title, scorecard: QualityScorecard | null, stale, evaluatedAt, draftRevision }`.
 * 404 se a aula não existir no rascunho; `scorecard: null` quando ainda não foi avaliada.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string; lessonId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId, lessonId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const found = findLesson(draft.document, lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não encontrada no rascunho');
    const row = await agent.getLessonQuality(getDb(), courseId, lessonId);
    const scorecard = row ? parseScorecard(row.scorecard) : null;
    return { revision: draft.revision, lessonId, title: found.lesson.title, scorecard, stale: scorecardIsStale(scorecard, draft.revision), evaluatedAt: row?.createdAt ?? null, draftRevision: row?.draftRevision ?? null };
  });
}
