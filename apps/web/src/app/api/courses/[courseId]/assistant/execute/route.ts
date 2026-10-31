import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, agent, authoring, DomainError } from '@lms/db';
import { findLesson } from '@lms/course-schema';
import { AssistantActionSchema, planExecution } from '@lms/ai';
import { handleError, parseBody } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { enqueueRun } from '@/server/agent';
import { loadDraft } from '../_lib/assistant';

const BodySchema = z.object({
  action: AssistantActionSchema,
  /** revisão do rascunho que a tela tem (update_direction_style); diferente da atual => 409 */
  expectedRevision: z.number().int().min(1).optional(),
});

/**
 * Executa no servidor uma ação do assistente, revalidada contra o rascunho:
 * - revise_lesson / direct_lesson / scene_variations / evaluate_lesson: enfileiram a
 *   execução do agente (mesmas regras das rotas do agente) => `{ run }` (+ `targets` na direção);
 * - update_direction_style: grava `presentation.directionStyle` com controle
 *   otimista => `{ revision, directionStyle }` (409 em conflito);
 * - open / preview_animatic: 400 `CLIENT_SIDE_ACTION` (a tela executa);
 * - generate_videos / generate_angle: 400 `CLIENT_CONFIRMATION_REQUIRED` (a tela
 *   confirma em dois cliques e chama os endpoints pagos existentes).
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, BodySchema);
    const draft = await loadDraft(courseId);
    const plan = planExecution(body.action, draft.document);

    if (plan.kind === 'reject') {
      if (plan.code === 'NOT_FOUND') throw new DomainError('NOT_FOUND', plan.message);
      if (plan.code === 'VALIDATION') throw new DomainError('VALIDATION', plan.message);
      return NextResponse.json({ error: { code: plan.code, message: plan.message } }, { status: plan.status });
    }

    if (plan.kind === 'patch_direction_style') {
      const saved = await authoring.saveDraft(getDb(), {
        courseId,
        document: plan.document,
        expectedRevision: body.expectedRevision ?? draft.revision,
        userId: viewer.user.id,
        origin: 'assistant',
        note: 'Estilo de direção alterado pelo assistente',
      });
      return NextResponse.json({ revision: saved.revision, directionStyle: plan.directionStyle });
    }

    if (plan.task === 'revise_lesson') {
      const found = findLesson(draft.document, plan.lessonId);
      if (found && agent.isPlaceholderGraph(found.lesson.graph)) throw new DomainError('VALIDATION', 'Esta aula ainda não tem cenas. Gere a aula antes de revisar.');
      const run = await enqueueRun(viewer, { courseId, task: 'revise_lesson', lessonId: plan.lessonId, instruction: plan.instruction, focus: plan.focus, nodeIds: plan.nodeIds ?? undefined });
      return NextResponse.json({ run: agent.publicRun(run) });
    }
    if (plan.task === 'scene_direction') {
      const run = await enqueueRun(viewer, { courseId, task: 'scene_direction', lessonId: plan.lessonId, instruction: plan.instruction, nodeIds: plan.nodeIds });
      return NextResponse.json({ run: agent.publicRun(run), targets: plan.targets });
    }
    if (plan.task === 'evaluate_lesson') {
      const run = await enqueueRun(viewer, { courseId, task: 'evaluate_lesson', lessonId: plan.lessonId, includeVideo: plan.includeVideo });
      return NextResponse.json({ run: agent.publicRun(run) });
    }
    const run = await enqueueRun(viewer, { courseId, task: 'scene_variations', lessonId: plan.lessonId, nodeId: plan.nodeId });
    return NextResponse.json({ run: agent.publicRun(run) });
  } catch (e) {
    return handleError(e);
  }
}
