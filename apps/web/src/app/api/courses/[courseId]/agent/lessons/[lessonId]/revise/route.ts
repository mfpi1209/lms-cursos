import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { RevisionFocusSchema } from '@lms/ai';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';

const Schema = z
  .object({ instruction: z.string().max(2000).optional(), focus: RevisionFocusSchema.optional() })
  .refine((b) => !!b.instruction?.trim() || !!b.focus, { message: 'Informe um pedido (instruction) ou um foco (focus)' });

/**
 * Enfileira a revisão de uma aula existente (comandos "Criar alternativas
 * plausíveis", "Expandir consequência", "Revisar dificuldade", "Variar
 * experiência" e pedidos livres). O resultado é uma proposta; nada é aplicado
 * sem aprovação do autor.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string; lessonId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId, lessonId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, Schema);
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const found = findLesson(draft.document, lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não encontrada no rascunho');
    if (agent.isPlaceholderGraph(found.lesson.graph)) throw new DomainError('VALIDATION', 'Esta aula ainda não tem cenas. Gere a aula antes de revisar.');
    const run = await enqueueRun(viewer, { courseId, task: 'revise_lesson', lessonId, instruction: body.instruction, focus: body.focus });
    return { run: agent.publicRun(run) };
  });
}
