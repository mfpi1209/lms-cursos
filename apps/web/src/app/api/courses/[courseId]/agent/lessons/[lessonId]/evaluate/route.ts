import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';

const Schema = z.object({
  /** avaliar também os vídeos produzidos (quadros + ritmo da fala); padrão true */
  includeVideo: z.boolean().optional(),
});

/**
 * Enfileira a avaliação de qualidade de uma aula (tarefa `evaluate_lesson`):
 * texto (conteúdo, voz narrativa, perguntas, decisões, realismo, fala) e, com
 * `includeVideo` (padrão), os vídeos produzidos (postura, aparência, fundo,
 * voz, realismo visual). Resultado: cartão em `GET /api/courses/[courseId]/quality/[lessonId]`
 * e proposta informativa `evaluate_lesson` (nunca aplicada).
 * Corpo `{ includeVideo?: boolean }` (opcional) → `{ run }`; 409 se já houver execução aberta na aula; 422 se a aula não tiver cenas.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string; lessonId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId, lessonId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const raw = await req.text();
    const body = raw.trim() ? Schema.parse(JSON.parse(raw)) : {};
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const found = findLesson(draft.document, lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não encontrada no rascunho');
    if (agent.isPlaceholderGraph(found.lesson.graph)) throw new DomainError('VALIDATION', 'Esta aula ainda não tem cenas. Gere a aula antes de avaliar.');
    const run = await enqueueRun(viewer, { courseId, task: 'evaluate_lesson', lessonId, includeVideo: body.includeVideo !== false });
    return { run: agent.publicRun(run) };
  });
}
