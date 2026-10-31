import { z } from 'zod';
import { AnyNodeSchema, NodeIdSchema, ObjectiveIdSchema } from './nodes';
import { ConditionSchema, EffectSchema, VariableDeclarationSchema } from './dsl';

export const SCHEMA_VERSION = 1 as const;

/**
 * Aresta: única fonte de verdade para destinos. A interface pode mostrar o
 * destino dentro da opção, mas a relação só é armazenada aqui.
 */
export const EdgeSchema = z.object({
  id: NodeIdSchema,
  from: NodeIdSchema,
  to: NodeIdSchema,
  /** obrigatória quando `from` é um nó de decisão */
  optionId: NodeIdSchema.optional(),
  condition: ConditionSchema.optional(),
  effects: z.array(EffectSchema).max(10).optional(),
  /** menor número = avaliada antes; empate é erro de compilação */
  priority: z.number().int().min(0).max(1000).optional(),
  /** fallback quando nenhuma condição é satisfeita (no máximo uma por origem) */
  isDefault: z.boolean().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

/** Layout do editor: separado do domínio; posição nunca determina execução. */
export const EditorLayoutSchema = z.object({
  positions: z.record(NodeIdSchema, z.object({ x: z.number(), y: z.number() })).default({}),
});
export type EditorLayout = z.infer<typeof EditorLayoutSchema>;

export const LessonGraphSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  startNodeId: NodeIdSchema,
  variables: z.array(VariableDeclarationSchema).max(30).default([]),
  nodes: z.array(AnyNodeSchema).min(1).max(200),
  edges: z.array(EdgeSchema).max(600).default([]),
  layout: EditorLayoutSchema.prefault({}),
});
export type LessonGraph = z.infer<typeof LessonGraphSchema>;

export const ObjectiveSchema = z.object({
  id: ObjectiveIdSchema,
  title: z.string().min(1).max(200),
  /** critério observável para reconhecer que houve aprendizado */
  criterion: z.string().max(500).default(''),
  required: z.boolean().default(true),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const EXPERIENCE_FAMILIES = [
  'decision_consequence',
  'investigation',
  'dialogue',
  'procedure',
  'production_review',
  'resource_simulation',
] as const;
export const ExperienceFamilySchema = z.enum(EXPERIENCE_FAMILIES);
export type ExperienceFamily = z.infer<typeof ExperienceFamilySchema>;
export const EXPERIENCE_FAMILY_LABELS: Record<ExperienceFamily, string> = {
  decision_consequence: 'Situação com decisões e consequências',
  investigation: 'Investigação com pistas e diagnóstico',
  dialogue: 'Conversa simulada com personagem',
  procedure: 'Execução de procedimento com identificação de erros',
  production_review: 'Produção e revisão de algo útil',
  resource_simulation: 'Simulação com recursos limitados',
};
