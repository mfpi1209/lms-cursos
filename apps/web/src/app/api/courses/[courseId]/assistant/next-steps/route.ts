import { compileCourse } from '@lms/course-schema';
import { computeNextSteps } from '@lms/ai';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { loadDraft, loadMediaQueue, loadQuality } from '../_lib/assistant';

/**
 * Próximos passos do curso (determinísticos, sem IA): `{ steps: NextStep[] }`,
 * no máximo 8, por severidade e ordem do curso. `?lessonId=` restringe os
 * passos por aula a essa aula (os do curso continuam). Inclui "Avaliar a aula"
 * quando não há cartão de qualidade (ou ele está desatualizado) e os achados
 * mais graves quando a nota geral é ≤ 3.
 */
export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const lessonId = new URL(req.url).searchParams.get('lessonId')?.trim() || undefined;
    const [draft, mediaQueue, quality] = await Promise.all([loadDraft(courseId), loadMediaQueue(courseId), loadQuality(courseId)]);
    const steps = computeNextSteps(draft.document, { courseId, compileResults: compileCourse(draft.document), mediaQueue, lessonId, quality, draftRevision: draft.revision });
    return { steps, revision: draft.revision };
  });
}
