import { createHash } from 'node:crypto';
import { z } from 'zod';
import { findLesson, reactionTargetId, SceneDirectionSchema, type CourseDocument, type SceneDirection } from '@lms/course-schema';
import { ADJUST_PROVIDER, ADJUST_VERSION, adjustOptions, deriveAdjustState, reactionOpener, validateAdjust, type AdjustJobInput, type AdjustState, type AdjustUnit, type TimedWord } from '@lms/media';

/**
 * Ajuste fino SEM REGRAVAR pelo estúdio (A17): validação do pedido e montagem do job de mídia
 * `input.kind = 'adjust'` (custo 0, só ffmpeg no worker). Funções puras — a rota faz as leituras.
 */
export { ADJUST_PROVIDER, ADJUST_VERSION };

const Id = z.string().min(1).max(64);
export const AdjustRequestSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('scene'),
    lessonId: Id,
    nodeId: Id,
    drop: z.array(z.string().min(1).max(40)).max(12).default([]),
    cut: z.array(z.object({ shotId: z.string().min(1).max(40), side: z.enum(['first', 'last']) })).max(24).default([]),
    /** texto do cartão; `null` = sem cartão; ausente = mantém */
    teaser: z.string().max(300).nullable().optional(),
  }),
  z.object({ target: z.literal('reaction'), lessonId: Id, choiceId: Id, optionId: Id }),
]);
export type AdjustBody = z.infer<typeof AdjustRequestSchema>;

/** Pedaço do job de origem que o ajuste usa (input do job dirigido). */
export interface SourceJobInput {
  direction?: unknown;
  units?: AdjustUnit[];
  shots?: Record<string, { words?: Array<[string, number, number]> }>;
  nextQuestion?: string;
  appendOutro?: boolean;
}

type NodeLike = { id: string; type: string; direction?: SceneDirection; media?: { kind?: string; generatedFrom?: { jobId?: string }; adjust?: AdjustState }; options?: Array<{ id: string; reaction?: { text: string; media?: { kind?: string } } }> };

function nodeOf(doc: CourseDocument, lessonId: string, nodeId: string): NodeLike | undefined {
  return findLesson(doc, lessonId)?.lesson.graph.nodes.find((n) => n.id === nodeId) as unknown as NodeLike | undefined;
}

/** Job de origem do vídeo da cena (o que o ajuste remonta) ou o motivo de não haver ajuste. */
export function sceneSourceJobId(doc: CourseDocument, lessonId: string, nodeId: string): { jobId: string } | { reason: string } {
  const node = nodeOf(doc, lessonId, nodeId);
  if (!node) return { reason: 'Bloco não encontrado' };
  if (node.media?.kind !== 'video') return { reason: 'Esta cena não tem vídeo' };
  const jobId = node.media.generatedFrom?.jobId;
  return jobId ? { jobId } : { reason: 'O vídeo desta cena não foi gerado pela plataforma' };
}

/**
 * Contexto do ajuste da cena: planos da gravação original, itens, palavras e o estado já aplicado
 * (`media.adjust` ou reconstruído do rascunho). `reason` quando a cena não aceita ajuste fino.
 */
export function sceneAdjustContext(doc: CourseDocument, lessonId: string, nodeId: string, source: { id: string; input: unknown }) {
  const node = nodeOf(doc, lessonId, nodeId);
  const input = source.input as SourceJobInput;
  if (!node || !input?.direction || !input.units?.length || !input.shots) return { reason: 'O ajuste fino só vale para vídeos dirigidos (com planos)' } as const;
  if (input.appendOutro) return { reason: 'Cena com a vinheta emendada no fim: o ajuste fino ainda não cobre esse caso' } as const;
  const base = SceneDirectionSchema.parse(input.direction);
  const wordsByUnit = new Map<string, TimedWord[]>();
  const wordsByShot = new Map<string, TimedWord[]>();
  for (const u of input.units) {
    const packed = input.shots[u.id]?.words;
    if (!Array.isArray(packed) || !packed.length) continue;
    const ws = packed.map(([text, start, end]) => ({ text, start, end }));
    wordsByUnit.set(u.id, ws);
    if (u.shotIds.length === 1) wordsByShot.set(u.shotIds[0]!, ws);
  }
  const stored = node.media?.adjust;
  const current: AdjustState = stored ? { drop: stored.drop ?? [], cut: stored.cut ?? {}, ...(stored.teaser !== undefined ? { teaser: stored.teaser } : {}) } : deriveAdjustState(base.shots, node.direction?.shots ?? base.shots, wordsByShot);
  return {
    base,
    units: input.units,
    wordsByUnit,
    current,
    options: adjustOptions(base.shots, input.units, wordsByUnit, current),
    teaser: current.teaser !== undefined ? current.teaser : (input.nextQuestion ?? null),
  } as const;
}

/** Monta o job de ajuste da cena (ou o erro para o autor). */
export function sceneAdjustJob(body: Extract<AdjustBody, { target: 'scene' }>, doc: CourseDocument, source: { id: string; input: unknown }): { error: string } | { nodeId: string; sceneHash: string; input: AdjustJobInput } {
  const ctx = sceneAdjustContext(doc, body.lessonId, body.nodeId, source);
  if ('reason' in ctx) return { error: ctx.reason! };
  const request = { drop: body.drop, cut: body.cut, ...(body.teaser !== undefined ? { teaser: body.teaser } : {}) };
  // cartão igual ao atual não conta como mudança
  if (request.teaser !== undefined && (request.teaser ?? null) === (ctx.teaser ?? null)) delete (request as { teaser?: unknown }).teaser;
  const err = validateAdjust(ctx.base.shots, ctx.units, ctx.wordsByUnit, ctx.current, request);
  if (err) return { error: err };
  const input: AdjustJobInput = { kind: 'adjust', target: 'scene', adjustOf: source.id, request };
  return { nodeId: body.nodeId, sceneHash: adjustHash(input, ctx.current), input };
}

/** Monta o job de "começar direto no conteúdo" de uma reação (ou o erro para o autor). */
export function reactionAdjustJob(body: Extract<AdjustBody, { target: 'reaction' }>, doc: CourseDocument): { error: string } | { nodeId: string; sceneHash: string; input: AdjustJobInput } {
  const node = nodeOf(doc, body.lessonId, body.choiceId);
  if (!node || node.type !== 'choice') return { error: 'Decisão não encontrada' };
  const opt = node.options?.find((o) => o.id === body.optionId);
  if (!opt?.reaction || opt.reaction.media?.kind !== 'video') return { error: 'Esta resposta não tem reação em vídeo' };
  if (!reactionOpener(opt.reaction.text)) return { error: 'A reação já começa direto no conteúdo' };
  const input: AdjustJobInput = { kind: 'adjust', target: 'reaction', choiceId: body.choiceId, optionId: body.optionId };
  return { nodeId: reactionTargetId(body.choiceId, body.optionId), sceneHash: adjustHash(input, opt.reaction.text), input };
}

function adjustHash(input: unknown, state: unknown): string {
  return createHash('sha256').update(JSON.stringify({ v: ADJUST_VERSION, input, state })).digest('hex');
}
