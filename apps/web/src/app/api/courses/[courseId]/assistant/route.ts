import { compileCourse } from '@lms/course-schema';
import { AssistantRequestSchema, assistantTurn, buildAssistantContext, computeNextSteps, createAdaptersFromEnv } from '@lms/ai';
import { parseBody, route } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { requireAiConfigured } from '@/server/agent';
import { llmHttpError, loadDraft, loadMediaQueue, loadQuality, takeAssistantTurn } from './_lib/assistant';

/**
 * Um turno do Assistente do estúdio. Corpo `AssistantRequest`; resposta
 * `AssistantReply` + `meta: { provider, simulated }`. Nunca executa nada:
 * devolve cartões de ação (ids validados contra o rascunho). Com
 * AI_PROVIDER=fake usa o roteador determinístico ("[demonstração]").
 * Limite: 30 turnos por usuário a cada 10 minutos (em memória; 429).
 */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const body = await parseBody(req, AssistantRequestSchema);
    requireAiConfigured();
    takeAssistantTurn(viewer.user.id);
    const [draft, mediaQueue, quality] = await Promise.all([loadDraft(courseId), loadMediaQueue(courseId), loadQuality(courseId)]);
    // próximos passos com a qualidade (avaliações pendentes/desatualizadas e achados) entram no resumo que o assistente lê
    const compile = compileCourse(draft.document);
    const nextSteps = computeNextSteps(draft.document, { courseId, compileResults: compile, mediaQueue, quality, draftRevision: draft.revision });
    const summary = buildAssistantContext(draft.document, body.context, { courseId, compile, mediaQueue, nextSteps });
    try {
      const r = await assistantTurn(createAdaptersFromEnv(), {
        doc: draft.document,
        courseId,
        context: body.context,
        message: body.message,
        history: body.history,
        summary,
        mediaQueue,
        log: (m) => console.log(m),
      });
      return { reply: r.reply.reply, actions: r.reply.actions, meta: { provider: r.meta.provider, simulated: r.meta.simulated } };
    } catch (e) {
      throw llmHttpError(e);
    }
  });
}
