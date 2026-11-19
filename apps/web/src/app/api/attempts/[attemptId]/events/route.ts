import { z } from 'zod';
import { certificates, getDb, learning } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireViewer } from '@/server/viewer';
import { requireOwnAttempt } from '@/server/learner';

const IntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('advance') }),
  z.object({ kind: z.literal('choose'), optionId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('reflect'), text: z.string().max(5000) }),
  z.object({ kind: z.literal('mission'), status: z.enum(['later', 'done']), note: z.string().max(5000).optional() }),
  // tarefa com entrega: o link (https) e, se a tarefa aceitar, o arquivo já enviado; `keep` = seguir com a entrega que já existe
  z.object({ kind: z.literal('submit'), link: z.string().max(4000).optional(), fileAssetId: z.string().min(1).max(64).optional(), keep: z.boolean().optional() }),
  z.object({ kind: z.literal('assess'), optionIds: z.array(z.string().min(1).max(64)).max(8) }),
]);

/** Navegação para trás: uma cena (`back`) ou uma cena já visitada do caminho atual (`goto`). */
export const NavigationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('back') }),
  z.object({ kind: z.literal('goto'), pathIndex: z.number().int().min(0).max(1000), nodeId: z.string().min(1).max(64).optional() }),
]);

export const EventSchema = z.object({
  eventId: z.string().min(8).max(64),
  nodeId: z.string().min(1).max(64),
  expectedRevision: z.number().int().min(1),
  intent: z.union([IntentSchema, NavigationTargetSchema]),
});

/**
 * Intenção do aluno. O servidor verifica sessão, dono da matrícula, versão,
 * nó atual, revisão e transição; mesmo eventId devolve o mesmo resultado.
 *
 * `intent.kind` `back`/`goto` volta cenas (ver `learning.navigateAttempt`):
 * só com a aula em andamento e `allowBack` ligado; registra `navigated_back`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  return route(async () => {
    const viewer = await requireViewer();
    const { attemptId } = await ctx.params;
    const { attempt } = await requireOwnAttempt(viewer, attemptId);
    const body = await parseBody(req, EventSchema);
    const { intent, ...rest } = body;
    if (intent.kind === 'back' || intent.kind === 'goto') return learning.navigateAttempt(getDb(), { attemptId, ...rest, target: intent });
    const result = await learning.applyLearnerEvent(getDb(), { attemptId, ...rest, intent });
    // fim de aula pode fechar a regra do certificado (conclusão, avaliação refeita, reflexão respondida)
    if (result.lessonCompleted) {
      const cert = await certificates.tryIssue(getDb(), attempt.enrollmentId);
      if (cert) return { ...result, certificate: { code: cert.code } };
    }
    return result;
  });
}
