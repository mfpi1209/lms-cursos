import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { NodeIdSchema, findLesson } from '@lms/course-schema';
import { directionTargetsFromGraph } from '@lms/ai';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';

const Schema = z.object({
  /** cenas-alvo; ausente ou vazio = todas as cenas com vídeo que têm fala ou texto */
  nodeIds: z.array(NodeIdSchema).max(200).optional(),
  instruction: z.string().max(2000).optional(),
});

/**
 * Enfileira a IA diretora para a aula: propõe planos (enquadramento, câmera,
 * movimento, slides, letreiros, transições, gestos) para as cenas com vídeo.
 * O resultado é uma proposta `scene_direction`; nada é aplicado sem aprovação.
 * 409 se já houver execução aberta na aula; 422 se não houver cena dirigível.
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
    const nodeIds = body.nodeIds?.length ? [...new Set(body.nodeIds)] : undefined;
    const targets = directionTargetsFromGraph(found.lesson.graph, nodeIds);
    if (!targets.length) {
      throw new DomainError('VALIDATION', nodeIds ? 'Nenhuma das cenas indicadas tem vídeo com fala ou texto para dirigir.' : 'Esta aula não tem cenas de vídeo com fala ou texto para dirigir.');
    }
    const run = await enqueueRun(viewer, { courseId, task: 'scene_direction', lessonId, instruction: body.instruction?.trim() || undefined, nodeIds: nodeIds ? targets.map((t) => t.nodeId) : undefined });
    return { run: agent.publicRun(run), targets: targets.map((t) => t.nodeId) };
  });
}
