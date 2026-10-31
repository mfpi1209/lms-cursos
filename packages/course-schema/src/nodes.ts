import { z } from 'zod';
import { RichTextDocumentSchema } from './richtext';
import { EffectSchema, ConditionSchema } from './dsl';
import { SceneDirectionSchema } from './direction';
import { ReflectionScaffoldSchema } from './scaffold';

export const NodeIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/);
export const ObjectiveIdSchema = NodeIdSchema;

/** Legendas de um vídeo (WebVTT, asset do workspace). */
export const MediaCaptionsSchema = z.object({
  assetId: z.string().min(1).max(64),
  lang: z.string().min(2).max(20).default('pt-BR'),
  format: z.literal('vtt').default('vtt'),
  /** tempos aproximados (voz HeyGen ou distribuição proporcional, sem alinhamento palavra a palavra) */
  approx: z.boolean().optional(),
});
export type MediaCaptions = z.infer<typeof MediaCaptionsSchema>;

/** Referência opcional a um asset de mídia (upload existente). Vídeo é opcional, nunca pré-requisito. */
export const MediaRefSchema = z.object({
  assetId: z.string().min(1).max(64),
  kind: z.enum(['image', 'audio', 'video']),
  alt: z.string().max(300).optional(),
  transcript: z.string().max(20000).optional(),
  /** marcado pelo editor quando o roteiro mudou após a geração */
  stale: z.boolean().optional(),
  /** origem quando gerada por job de mídia (hash da cena permite detectar desatualização) */
  generatedFrom: z
    .object({
      jobId: z.string().max(64),
      sceneHash: z.string().max(64),
      provider: z.string().max(40),
      simulated: z.boolean().optional(),
      /** impressão da apresentação usada no vídeo (`presentationFingerprint`); ausente em mídia antiga = desconhecida, nunca desatualizada */
      presentationFingerprint: z.string().max(64).optional(),
    })
    .optional(),
  /** legendas WebVTT do vídeo (geradas do alinhamento da narração; tocadas via <track> no player) */
  captions: MediaCaptionsSchema.optional(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

const BaseNode = {
  id: NodeIdSchema,
  objectiveIds: z.array(ObjectiveIdSchema).max(10).default([]),
  /** nó obrigatório para conclusão quando estiver no caminho do aluno */
  required: z.boolean().default(true),
  title: z.string().max(120).optional(),
};

export const ScenarioNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('scenario'),
  body: RichTextDocumentSchema,
  /** roteiro falado pelo apresentador (vídeo/voz); quando ausente, usa o texto da cena */
  narration: z.string().max(5000).optional(),
  /** direção de gesto/emoção para o avatar (HeyGen motion_prompt): uma ação + uma emoção, ex.: "acena com a mão aberta, acolhedora" */
  motionPrompt: z.string().max(200).optional(),
  /** direção cinematográfica (planos); quando presente, o vídeo é montado plano a plano */
  direction: SceneDirectionSchema.optional(),
  media: MediaRefSchema.optional(),
});

export const ContentNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('content'),
  body: RichTextDocumentSchema,
  /** roteiro falado pelo apresentador (vídeo/voz); quando ausente, usa o texto da cena */
  narration: z.string().max(5000).optional(),
  /** direção de gesto/emoção para o avatar (HeyGen motion_prompt): uma ação + uma emoção, ex.: "acena com a mão aberta, acolhedora" */
  motionPrompt: z.string().max(200).optional(),
  /** direção cinematográfica (planos); quando presente, o vídeo é montado plano a plano */
  direction: SceneDirectionSchema.optional(),
  media: MediaRefSchema.optional(),
  /**
   * Revisão de respostas ("Resultado da simulação"): decisões DESTA aula que a
   * cena lista com a pergunta, a resposta escolhida, a marca ("Forte" / "Pode
   * melhorar", de `ChoiceOption.quality`) e a dica do retorno. Nada é recalculado:
   * vem das respostas da tentativa.
   */
  reviewNodeIds: z.array(NodeIdSchema).max(12).optional(),
});

/** Qualidade de uma opção de decisão: alimenta a revisão de respostas ("Forte" / "Pode melhorar"). Não muda o caminho. */
export const ChoiceQualitySchema = z.enum(['strong', 'ok', 'weak']);
export type ChoiceQuality = z.infer<typeof ChoiceQualitySchema>;

export const ChoiceOptionSchema = z.object({
  id: NodeIdSchema,
  label: z.string().min(1).max(300),
  feedback: RichTextDocumentSchema.optional(),
  /** opcional: 'strong' = resposta forte; 'ok'/'weak' = pode melhorar (usado só na revisão de respostas) */
  quality: ChoiceQualitySchema.optional(),
  /**
   * Reação da instrutora a ESTA resposta: fala curta (5 a 10 s) que acolhe e
   * explica em uma frase, tocada logo depois da escolha, antes de "Sua
   * escolha". O vídeo é de plano único, produzido como uma cena própria (alvo
   * `reactionTargetId(choiceId, optionId)`; ver reaction.ts). Sem vídeo, o
   * player segue como antes.
   */
  reaction: z
    .object({
      text: z.string().trim().min(1).max(400),
      media: MediaRefSchema.optional(),
    })
    .optional(),
});
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

export const ChoiceNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('choice'),
  prompt: RichTextDocumentSchema,
  /** roteiro falado pelo apresentador (vídeo/voz); quando ausente, usa o texto da cena */
  narration: z.string().max(5000).optional(),
  /** direção de gesto/emoção para o avatar (HeyGen motion_prompt): uma ação + uma emoção, ex.: "acena com a mão aberta, acolhedora" */
  motionPrompt: z.string().max(200).optional(),
  /** direção cinematográfica (planos); quando presente, o vídeo é montado plano a plano */
  direction: SceneDirectionSchema.optional(),
  media: MediaRefSchema.optional(),
  options: z.array(ChoiceOptionSchema).min(2).max(6),
  /**
   * Ponte para a pergunta. `call` = frase de CHAMADA que a instrutora diz no
   * fim do vídeo logo antes da pergunta (ou no fim do vídeo da própria
   * pergunta), ex.: "Agora é com você: o que você faria?". Entra na fala como
   * um plano final próprio (`bridge.ts`), então só esse trecho é gravado.
   */
  bridge: z
    .object({
      call: z.string().trim().min(1).max(200).optional(),
    })
    .optional(),
  /**
   * Resposta aberta: o aluno pode responder do seu jeito (falando ou escrevendo).
   * A resposta é guardada; depois ele aponta qual opção mais se parece com a dele,
   * e o caminho segue por essa opção. Nada de nota por voz, sotaque ou aparência.
   */
  openAnswer: z
    .object({
      enabled: z.boolean().default(false),
      voice: z.boolean().default(true),
      text: z.boolean().default(true),
      /** pergunta da autoavaliação depois da resposta aberta */
      matchPrompt: z.string().max(200).default('Qual destas respostas se parece mais com a sua?'),
    })
    .optional(),
});

export const ConsequenceNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('consequence'),
  body: RichTextDocumentSchema,
  /** roteiro falado pelo apresentador (vídeo/voz); quando ausente, usa o texto da cena */
  narration: z.string().max(5000).optional(),
  /** direção de gesto/emoção para o avatar (HeyGen motion_prompt): uma ação + uma emoção, ex.: "acena com a mão aberta, acolhedora" */
  motionPrompt: z.string().max(200).optional(),
  /** direção cinematográfica (planos); quando presente, o vídeo é montado plano a plano */
  direction: SceneDirectionSchema.optional(),
  media: MediaRefSchema.optional(),
  tone: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  /** orientação útil: o que fazer diferente ou por que funcionou */
  guidance: RichTextDocumentSchema.optional(),
  effects: z.array(EffectSchema).max(10).optional(),
});

export const ReflectionNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('reflection'),
  prompt: RichTextDocumentSchema,
  /** Reflexão registra a resposta; não presume avaliação automática. */
  minLength: z.number().int().min(0).max(2000).default(20),
  maxLength: z.number().int().min(10).max(5000).default(1500),
  placeholder: z.string().max(200).optional(),
  /**
   * Composição guiada (opcional): em vez de escrever, o aluno monta uma frase
   * tocando em blocos prontos (`template` com `{slotId}`). A frase montada é
   * enviada pela mesma intenção `reflect` e vira o texto da resposta.
   */
  scaffold: ReflectionScaffoldSchema.optional(),
});

export const AssessmentOptionSchema = z.object({
  id: NodeIdSchema,
  label: z.string().min(1).max(300),
  correct: z.boolean(),
  feedback: RichTextDocumentSchema.optional(),
});

/** Avaliação com critério determinístico e explícito. */
export const AssessmentNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('assessment'),
  prompt: RichTextDocumentSchema,
  mode: z.enum(['single', 'multiple']).default('single'),
  options: z.array(AssessmentOptionSchema).min(2).max(8),
  passing: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all_correct') }),
    z.object({ kind: z.literal('min_correct'), min: z.number().int().min(1) }),
  ]).default({ kind: 'all_correct' }),
  /** tentativas permitidas pelo motor (repetição controlada fora do grafo) */
  maxAttempts: z.number().int().min(1).max(10).default(2),
  feedbackPassed: RichTextDocumentSchema.optional(),
  feedbackFailed: RichTextDocumentSchema.optional(),
});

/**
 * Item da página "Meu roteiro" (recap): reúne o que o próprio aluno produziu
 * (respostas de reflexão, escolhas) e lembretes fixos. Nada é inventado: fonte
 * vazia mostra `emptyText`.
 */
export const RecapItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  kind: z.enum(['reflection', 'choice', 'checklist', 'text']),
  /** cena de origem (reflection: texto do aluno; choice: rótulo da opção escolhida) */
  nodeId: z.string().max(80).optional(),
  /**
   * cenas alternativas da MESMA atividade (ex.: uma variante por perfil): o item
   * mostra a resposta mais recente entre `nodeId` e estas. Mesmo tipo que `kind`.
   */
  nodeIds: z.array(z.string().min(1).max(80)).max(6).optional(),
  /**
   * cenas de COMPOSIÇÃO (reflexão com `scaffold`) da mesma atividade: a frase
   * montada pelo aluno tem prioridade sobre `nodeId`/`nodeIds` (entre elas, vale a
   * mais recente não vazia). Pulou a composição → cai na escolha.
   */
  composedNodeIds: z.array(z.string().min(1).max(80)).max(6).optional(),
  /** itens fixos (checklist) */
  items: z.array(z.string().max(160)).max(12).optional(),
  /** texto fixo (kind text) */
  text: z.string().max(600).optional(),
  emptyText: z.string().max(120).default('Completar quando quiser'),
});
export type RecapItem = z.infer<typeof RecapItemSchema>;

export const EndNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('end'),
  summary: RichTextDocumentSchema,
  /** página "Meu roteiro": o que o aluno leva (respostas próprias + checklist) */
  recap: z.array(RecapItemSchema).max(12).optional(),
  /** título da página de recap (padrão: "Meu roteiro") */
  recapTitle: z.string().max(80).optional(),
  /** frase de fechamento exibida ao final (ex.: "Você não precisa decorar sua história…") */
  closingLine: z.string().max(200).optional(),
  /** conclusão é diferente de demonstração de domínio; o resultado por objetivo vem das evidências */
  outcomeLabel: z.string().max(80).optional(),
});

/**
 * Contratos preparados, não executáveis ainda. Ficam fora do union executável
 * para que o compilador bloqueie publicação de blocos sem executor registrado.
 */
export const DialogueNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('dialogue'),
  character: z.object({ name: z.string().max(80), persona: z.string().max(2000) }),
  authorizedFacts: z.array(z.string().max(500)).max(50),
  goals: z.array(z.string().max(300)).max(10),
  rubricId: z.string().optional(),
  maxTurns: z.number().int().min(1).max(20),
  exitNodeIds: z.array(NodeIdSchema).min(1),
});
export const TaskNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('task'),
  instructions: RichTextDocumentSchema,
  deliverable: z.enum(['text', 'file']),
  rubricId: z.string().optional(),
});
export const EvidenceNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('evidence'),
  instructions: RichTextDocumentSchema,
  acceptedKinds: z.array(z.enum(['text', 'image', 'file'])),
});
export const ResourceSimulationNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('resource_simulation'),
  resources: z.array(z.object({ var: z.string(), label: z.string() })),
  actions: z.array(z.object({ id: NodeIdSchema, label: z.string(), effects: z.array(EffectSchema) })),
  stopWhen: ConditionSchema,
});
export const AiFeedbackNodeSchema = z.object({
  ...BaseNode,
  type: z.literal('ai_feedback'),
  sourceNodeId: NodeIdSchema,
  rubricId: z.string(),
});

export const ExecutableNodeSchema = z.discriminatedUnion('type', [
  ScenarioNodeSchema,
  ContentNodeSchema,
  ChoiceNodeSchema,
  ConsequenceNodeSchema,
  ReflectionNodeSchema,
  AssessmentNodeSchema,
  EndNodeSchema,
]);

export const AnyNodeSchema = z.discriminatedUnion('type', [
  ScenarioNodeSchema,
  ContentNodeSchema,
  ChoiceNodeSchema,
  ConsequenceNodeSchema,
  ReflectionNodeSchema,
  AssessmentNodeSchema,
  EndNodeSchema,
  DialogueNodeSchema,
  TaskNodeSchema,
  EvidenceNodeSchema,
  ResourceSimulationNodeSchema,
  AiFeedbackNodeSchema,
]);

export type ScenarioNode = z.infer<typeof ScenarioNodeSchema>;
export type ContentNode = z.infer<typeof ContentNodeSchema>;
export type ChoiceNode = z.infer<typeof ChoiceNodeSchema>;
export type ConsequenceNode = z.infer<typeof ConsequenceNodeSchema>;
export type ReflectionNode = z.infer<typeof ReflectionNodeSchema>;
export type AssessmentNode = z.infer<typeof AssessmentNodeSchema>;
export type EndNode = z.infer<typeof EndNodeSchema>;
export type ExecutableNode = z.infer<typeof ExecutableNodeSchema>;
export type AnyNode = z.infer<typeof AnyNodeSchema>;
export type NodeType = AnyNode['type'];

/** Tipos com executor + renderer registrados no incremento atual. */
export const EXECUTABLE_NODE_TYPES = ['scenario', 'content', 'choice', 'consequence', 'reflection', 'assessment', 'end'] as const;
export type ExecutableNodeType = (typeof EXECUTABLE_NODE_TYPES)[number];
export const PLANNED_NODE_TYPES = ['dialogue', 'task', 'evidence', 'resource_simulation', 'ai_feedback'] as const;

export function isExecutableNodeType(t: string): t is ExecutableNodeType {
  return (EXECUTABLE_NODE_TYPES as readonly string[]).includes(t);
}

/** Nós que esperam uma resposta do aluno antes de avançar. */
export function nodeRequiresAnswer(type: NodeType): boolean {
  return type === 'choice' || type === 'reflection' || type === 'assessment';
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  scenario: 'Situação',
  content: 'Conteúdo',
  choice: 'Decisão',
  consequence: 'Consequência',
  reflection: 'Reflexão',
  assessment: 'Avaliação',
  end: 'Encerramento',
  dialogue: 'Conversa (em breve)',
  task: 'Tarefa (em breve)',
  evidence: 'Evidência (em breve)',
  resource_simulation: 'Simulação de recursos (em breve)',
  ai_feedback: 'Feedback com IA (em breve)',
};
