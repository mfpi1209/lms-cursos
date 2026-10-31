import { z } from 'zod';

/**
 * Contrato do Assistente do estúdio (compartilhado entre API, IA e UI; seguro
 * para o navegador — só zod). O assistente NUNCA executa às cegas: devolve
 * cartões de ação; ações de IA viram propostas revisáveis, ações pagas exigem
 * confirmação em dois cliques no cliente.
 */
export const ASSISTANT_SCREENS = ['course', 'wizard', 'storyboard', 'production', 'review'] as const;

export const AssistantContextSchema = z.object({
  screen: z.enum(ASSISTANT_SCREENS),
  /** passo do wizard (tema, conteudo, estrutura, apresentacao, aulas, revisao) */
  step: z.string().max(40).optional(),
  lessonId: z.string().max(120).optional(),
  nodeId: z.string().max(120).optional(),
});
export type AssistantContext = z.infer<typeof AssistantContextSchema>;

/** free = sem custo; ai = usa o modelo de IA (barato, gera proposta); paid = HeyGen/ElevenLabs */
export const ACTION_COST = ['free', 'ai', 'paid'] as const;

const base = { label: z.string().max(80), description: z.string().max(300) };

export const AssistantActionSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('revise_lesson'), cost: z.literal('ai'), params: z.object({ lessonId: z.string(), focus: z.string().max(40).optional(), instruction: z.string().max(2000), /** limita a reescrita a estas cenas (o resto volta idêntico) */ nodeIds: z.array(z.string()).max(200).optional() }) }),
  z.object({ ...base, kind: z.literal('direct_lesson'), cost: z.literal('ai'), params: z.object({ lessonId: z.string(), nodeIds: z.array(z.string()).max(200).optional(), instruction: z.string().max(2000).optional() }) }),
  z.object({ ...base, kind: z.literal('scene_variations'), cost: z.literal('ai'), params: z.object({ lessonId: z.string(), nodeId: z.string() }) }),
  /**
   * Avalia a aula (texto) e, por padrão, os vídeos produzidos; resultado = cartão de qualidade (proposta sem aplicação).
   * Custo efetivo: 'ai' (fixado por ACTION_COSTS em sanitizeActions). O tipo do custo fica largo de propósito para que
   * `Extract<AssistantAction, { cost: 'ai' }>` nos clientes existentes (revise/direct/vary) não passe a incluir este cartão
   * sem que eles o tratem; a tela executa este cartão via POST …/assistant/execute ou …/agent/lessons/[lessonId]/evaluate.
   */
  z.object({ ...base, kind: z.literal('evaluate_lesson'), cost: z.literal('ai'), params: z.object({ lessonId: z.string(), includeVideo: z.boolean().optional() }) }),
  z.object({ ...base, kind: z.literal('update_direction_style'), cost: z.literal('free'), params: z.object({ pace: z.enum(['calm', 'balanced', 'dynamic']).optional(), useSlides: z.boolean().optional(), maxCinematicPerLesson: z.number().int().min(0).max(6).optional() }) }),
  z.object({ ...base, kind: z.literal('preview_animatic'), cost: z.literal('free'), params: z.object({ lessonId: z.string(), nodeId: z.string() }) }),
  z.object({ ...base, kind: z.literal('open'), cost: z.literal('free'), params: z.object({ href: z.string().max(300).regex(/^\/estudio\//) }) }),
  z.object({ ...base, kind: z.literal('generate_videos'), cost: z.literal('paid'), params: z.object({ lessonId: z.string(), nodeIds: z.array(z.string()).min(1).max(200) }) }),
  z.object({ ...base, kind: z.literal('generate_angle'), cost: z.literal('paid'), params: z.object({ angle: z.enum(['front', 'left', 'right', 'high', 'low']), framing: z.enum(['wide', 'medium', 'close', 'extreme_close']), extra: z.string().max(300).optional() }) }),
]);
export type AssistantAction = z.infer<typeof AssistantActionSchema>;
export type AssistantActionKind = AssistantAction['kind'];

export const AssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: AssistantContextSchema,
  /** últimas trocas da conversa (só texto), para continuidade */
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).max(10).default([]),
  /* respostas do assistente no histórico podem terminar com "[cartões: …]" (ver assistantHistoryText) */
});
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

export const AssistantReplySchema = z.object({
  reply: z.string().max(2000),
  actions: z.array(AssistantActionSchema).max(4),
});
export type AssistantReply = z.infer<typeof AssistantReplySchema>;

/** Próximo passo calculado do estado do curso (determinístico, sem IA). */
export const NextStepSchema = z.object({
  id: z.string(),
  severity: z.enum(['blocker', 'recommended', 'optional']),
  title: z.string().max(120),
  detail: z.string().max(300),
  action: AssistantActionSchema.optional(),
});
export type NextStep = z.infer<typeof NextStepSchema>;

/** Sugestão de prompt (atalho clicável) para um contexto. */
export interface PromptSuggestion {
  id: string;
  label: string;
  /** texto enviado ao assistente quando clicado */
  prompt: string;
}

/* ------------------------------------------------------------------ */
/* Cartões na conversa (para confirmar ações pagas com "sim")          */
/* ------------------------------------------------------------------ */

/** Resumo curto de um cartão: "generate_videos(3 cenas)", "generate_angle(left)", "revise_lesson". */
export function cardSummary(a: Pick<AssistantAction, 'kind' | 'params'>): string {
  if (a.kind === 'generate_videos') {
    const n = (a.params as { nodeIds?: string[] }).nodeIds?.length ?? 0;
    return `generate_videos(${n} ${n === 1 ? 'cena' : 'cenas'})`;
  }
  if (a.kind === 'generate_angle') return `generate_angle(${(a.params as { angle?: string }).angle ?? 'front'})`;
  return a.kind;
}

const CARDS_RE = /\s*\[cartões: ([^\]]*)\]\s*$/;

/**
 * Texto de uma resposta do assistente para o histórico enviado de volta
 * (`history`): a resposta + "[cartões: …]" com os cartões oferecidos, para que
 * um "sim" na mensagem seguinte confirme o mesmo cartão pago.
 */
export function assistantHistoryText(text: string, actions: ReadonlyArray<Pick<AssistantAction, 'kind' | 'params'>> = [], max = 2000): string {
  const base = text.replace(CARDS_RE, '');
  if (!actions.length) return base.slice(0, max);
  const suffix = ` [cartões: ${actions.map(cardSummary).join(', ')}]`;
  return `${base.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

/** Tipos de cartão anunciados no texto do histórico ("[cartões: …]"). */
export function offeredCardKinds(historyText: string): AssistantActionKind[] {
  const m = CARDS_RE.exec(historyText);
  if (!m) return [];
  return m[1]!.split(',').map((x) => x.trim().replace(/\(.*$/, '')).filter(Boolean) as AssistantActionKind[];
}
