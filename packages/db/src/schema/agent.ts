import { pgTable, text, timestamp, integer, jsonb, pgEnum, index, real, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspaces } from './identity';
import { courses } from './authoring';
import { assets } from './media';

export const sourceKindEnum = pgEnum('source_kind', ['paste', 'txt', 'md', 'pdf']);
export const sourceStatusEnum = pgEnum('source_status', ['processing', 'ready', 'needs_ocr', 'failed']);

/** Fontes: arquivo original (asset), hash, origem declarada, texto extraído. Dados não confiáveis para o agente. */
export const sourceDocuments = pgTable(
  'source_documents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: sourceKindEnum('kind').notNull(),
    status: sourceStatusEnum('status').notNull().default('processing'),
    assetId: text('asset_id').references(() => assets.id),
    originalName: text('original_name'),
    sha256: text('sha256'),
    declaredOrigin: text('declared_origin'),
    text: text('text'),
    chars: integer('chars').notNull().default(0),
    pages: integer('pages'),
    excerpt: text('excerpt'),
    error: text('error'),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('source_documents_course_idx').on(t.courseId)],
);

export const sourceChunks = pgTable(
  'source_chunks',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull().references(() => sourceDocuments.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    page: integer('page'),
    text: text('text').notNull(),
  },
  (t) => [index('source_chunks_source_idx').on(t.sourceId, t.index)],
);

/**
 * Tarefas do agente: outline/lesson geram; revise_lesson e scene_variations revisam uma aula existente; scene_direction propõe a direção de vídeo (planos) das cenas (sempre como proposta);
 * evaluate_lesson avalia a qualidade de uma aula (texto + vídeos) e produz um cartão de notas (proposta informativa, sem aplicação).
 */
export const agentTaskEnum = pgEnum('agent_task', ['outline', 'lesson', 'revise_lesson', 'scene_variations', 'scene_direction', 'evaluate_lesson']);
export const agentRunStatusEnum = pgEnum('agent_run_status', ['queued', 'running', 'succeeded', 'failed', 'canceled']);
export const proposalStatusEnum = pgEnum('proposal_status', ['proposed', 'applied', 'rejected', 'conflict']);

/** Execuções do agente: provedor, modelo efetivo, versão das instruções, latência, consumo e custo. */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    task: agentTaskEnum('task').notNull(),
    lessonId: text('lesson_id'),
    status: agentRunStatusEnum('status').notNull().default('queued'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    instructionsVersion: text('instructions_version').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    latencyMs: integer('latency_ms'),
    usage: jsonb('usage').$type<{ inputTokens: number; outputTokens: number }>(),
    costUsd: real('cost_usd'),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    repairs: integer('repairs').notNull().default(0),
    error: text('error'),
    proposalId: text('proposal_id'),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('agent_runs_course_idx').on(t.courseId, t.createdAt), index('agent_runs_status_idx').on(t.status)],
);

/** Propostas estruturadas e auditáveis; aplicadas pelo backend como nova revisão do rascunho. */
export const agentProposals = pgTable(
  'agent_proposals',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    kind: agentTaskEnum('kind').notNull(),
    lessonId: text('lesson_id'),
    baseRevision: integer('base_revision').notNull(),
    status: proposalStatusEnum('status').notNull().default('proposed'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    rationale: text('rationale').notNull().default(''),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    appliedRevision: integer('applied_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('agent_proposals_course_idx').on(t.courseId, t.createdAt)],
);

/**
 * Último cartão de qualidade por aula ("Avaliação"): cache do resultado da
 * tarefa evaluate_lesson para a UI ler sem percorrer propostas. `draftRevision`
 * é a revisão do rascunho avaliada: diferente da atual = avaliação desatualizada.
 */
export const lessonQuality = pgTable(
  'lesson_quality',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    draftRevision: integer('draft_revision').notNull(),
    runId: text('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    proposalId: text('proposal_id').references(() => agentProposals.id, { onDelete: 'set null' }),
    /** QualityScorecard (ver @lms/ai/client) */
    scorecard: jsonb('scorecard').$type<Record<string, unknown>>().notNull(),
    overall: integer('overall').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('lesson_quality_lesson_uq').on(t.courseId, t.lessonId), index('lesson_quality_course_idx').on(t.courseId)],
);
