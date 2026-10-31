import { z } from 'zod';
import { LessonGraphSchema, ScalarSchema } from '@lms/course-schema';
import { applyIntent, computeProgress, createInitialState, createStateAt, EngineError, navigateBack } from '@lms/course-engine';
import { DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireStaff } from '@/server/viewer';

const IntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('advance') }),
  z.object({ kind: z.literal('choose'), optionId: z.string() }),
  z.object({ kind: z.literal('reflect'), text: z.string().max(5000) }),
  z.object({ kind: z.literal('assess'), optionIds: z.array(z.string()).max(8) }),
]);

const NavigationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('back') }),
  z.object({ kind: z.literal('goto'), pathIndex: z.number().int().min(0).max(1000), nodeId: z.string().min(1).max(64).optional() }),
]);

const Schema = z.object({
  graph: LessonGraphSchema,
  /** estado anterior; ausente = iniciar */
  state: z.unknown().optional(),
  intent: IntentSchema.optional(),
  /** voltar cena (com `state`) */
  navigate: NavigationSchema.optional(),
  /** modo de teste: começar nesta cena com estas variáveis (validadas contra o grafo) */
  startAt: z.object({ nodeId: z.string().min(1).max(64), variables: z.record(z.string().max(64), ScalarSchema).optional() }).optional(),
  /** `allowBack` da aula (a prévia respeita a mesma regra do aluno) */
  allowBack: z.boolean().optional(),
});

function engine<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof EngineError) throw new DomainError('ENGINE', e.message, { engineCode: e.code });
    throw e;
  }
}

/**
 * Prévia do estúdio: executa o MESMO motor do LMS sobre o grafo do rascunho,
 * sem persistir. O estado vai e volta com o cliente.
 *
 * Escopo da prévia: uma aula por vez. Variáveis de curso (`scope: 'course'`)
 * começam com `initial` (não há tentativas anteriores para herdar) — ou com o
 * valor escolhido no modo de teste (`startAt.variables`). O "Meu roteiro"
 * mostra só as respostas da aula em prévia — itens de outras aulas aparecem
 * com `emptyText`. No LMS, o servidor herda as variáveis de curso
 * (`learning.carriedCourseVariables`) e o player resolve o roteiro com
 * `GET /api/enrollments/[enrollmentId]/answers`.
 *
 * Modo de teste: `startAt` começa numa cena qualquer; `navigate` volta cenas.
 */
export async function POST(req: Request) {
  return route(async () => {
    await requireStaff();
    const body = await parseBody(req, Schema);
    if (!body.state) {
      const state = body.startAt
        ? engine(() => createStateAt(body.graph, body.startAt!.nodeId, { variables: body.startAt!.variables }))
        : createInitialState(body.graph);
      return { state, progress: computeProgress(body.graph, state), transitioned: true, toNodeId: state.currentNodeId };
    }
    if (body.navigate) {
      const nav = engine(() => navigateBack(body.graph, body.state as never, body.navigate!, { allowBack: body.allowBack }));
      return { state: nav.state, transitioned: true, fromNodeId: nav.fromNodeId, toNodeId: nav.toNodeId, progress: computeProgress(body.graph, nav.state) };
    }
    if (!body.intent) {
      const state = createInitialState(body.graph);
      return { state, progress: computeProgress(body.graph, state), transitioned: true, toNodeId: state.currentNodeId };
    }
    const step = engine(() => applyIntent(body.graph, body.state as never, body.intent!));
    return { ...step, progress: computeProgress(body.graph, step.state) };
  });
}
