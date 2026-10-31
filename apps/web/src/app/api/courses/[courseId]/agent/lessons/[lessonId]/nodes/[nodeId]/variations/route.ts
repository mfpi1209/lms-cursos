import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { findLesson, NODE_TYPE_LABELS } from '@lms/course-schema';
import { VARIATION_SCENE_TYPES } from '@lms/ai';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';

const Schema = z.object({ instruction: z.string().max(2000).optional() }).default({});

/**
 * Enfileira "Criar alternativas plausíveis" para uma cena (decisão ou
 * consequência). A proposta traz 2–3 variações; o autor escolhe uma ao aplicar
 * (`choice`). Nada é aplicado automaticamente.
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string; lessonId: string; nodeId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId, lessonId, nodeId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = req.headers.get('content-type')?.includes('json') ? await parseBody(req, Schema) : {};
    const draft = await authoring.getDraft(getDb(), courseId);
    if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
    const found = findLesson(draft.document, lessonId);
    if (!found) throw new DomainError('NOT_FOUND', 'Aula não encontrada no rascunho');
    const node = found.lesson.graph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new DomainError('NOT_FOUND', 'Cena não encontrada na aula');
    if (!(VARIATION_SCENE_TYPES as readonly string[]).includes(node.type)) {
      throw new DomainError('VALIDATION', `Variações só se aplicam a decisões e consequências (esta cena é "${NODE_TYPE_LABELS[node.type]}")`);
    }
    const run = await enqueueRun(viewer, { courseId, task: 'scene_variations', lessonId, nodeId, instruction: body.instruction });
    return { run: agent.publicRun(run) };
  });
}
