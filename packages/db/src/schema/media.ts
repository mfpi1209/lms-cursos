import { pgTable, text, timestamp, integer, jsonb, pgEnum, index, bigint, real, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';
import { workspaces } from './identity';

export const assetKindEnum = pgEnum('asset_kind', ['image', 'audio', 'video', 'document', 'captions']);
export const assetSourceEnum = pgEnum('asset_source', ['upload', 'generated']);

/**
 * Cenário de fundo (imagem do workspace marcada como cenário): enquadramento
 * sugerido (janela de recorte 16:9, frações da imagem), posição e folga da
 * apresentadora e faixa do balcão. O estúdio preenche a apresentação com isso
 * ao escolher o cenário; tudo opcional.
 */
export interface SceneryMetadata {
  /** nome curto (ex.: "Recepção DNA Work") */
  name?: string;
  frame?: { x: number; y: number; w: number; h: number };
  presenterX?: number;
  presenterScale?: number;
  presenterBottom?: number;
  headroom?: number;
  foregroundFrom?: number;
  presenterGrade?: 'none' | 'warm' | 'cool';
  /** false = imagem já tratada (sem desfoque leve na montagem) */
  blur?: boolean;
  /** nome do predefinido de enquadramento aplicado (informativo) */
  framePreset?: 'wide' | 'medium';
}

/**
 * Vinheta da marca (assinatura animada + sonora) gerada pelo worker: a
 * especificação, o hash de reaproveitamento, a proporção e a duração.
 * `default: true` marca a vinheta padrão do workspace (uma por proporção).
 */
export interface BumperMetadata {
  spec: Record<string, unknown>;
  hash: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  /** vinheta padrão do workspace (player e cursos sem vinheta própria) */
  default?: boolean;
  /** id do asset 9:16 produzido junto (só no 16:9) */
  verticalAssetId?: string;
  /** nome curto para a lista do estúdio */
  name?: string;
}

/** volume do vídeo (A15): integrado antes/depois da normalização a −16 LUFS */
export interface LoudnessMetadata {
  inputI: number | null;
  outputI: number | null;
  outputTP: number | null;
  changed: boolean;
  /** ainda abaixo de −19 LUFS depois do ajuste (QA acusa voz baixa) */
  low: boolean;
  /** asset de origem, quando este é uma cópia normalizada */
  from?: string;
}

export interface AssetMetadata {
  scenery?: SceneryMetadata;
  bumper?: BumperMetadata;
  loudness?: LoudnessMetadata;
}

/** Arquivos de mídia sob nosso controle (storage local em dev, S3 em produção). */
export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: assetKindEnum('kind').notNull(),
    source: assetSourceEnum('source').notNull().default('upload'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storageProvider: text('storage_provider').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name'),
    sha256: text('sha256').notNull(),
    durationSeconds: real('duration_seconds'),
    transcript: text('transcript'),
    /** metadados por tipo de uso (ex.: cenário de fundo: `scenery` com enquadramento e posição sugeridos) */
    metadata: jsonb('metadata').$type<AssetMetadata>(),
    createdBy: text('created_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_workspace_idx').on(t.workspaceId), index('assets_sha256_idx').on(t.sha256)],
);

export const mediaJobKindEnum = pgEnum('media_job_kind', ['video', 'voice']);
export const mediaJobStatusEnum = pgEnum('media_job_status', ['queued', 'running', 'succeeded', 'failed', 'canceled', 'reconciliation_required']);

/**
 * Jobs de produção de mídia por cena. Identidade persistida (`requestId`) e
 * `sceneHash` para deduplicação/reaproveitamento; `externalId` correlaciona
 * com o provedor; custo estimado/real quando disponível.
 */
export const mediaJobs = pgTable(
  'media_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull(),
    lessonId: text('lesson_id').notNull(),
    nodeId: text('node_id').notNull(),
    kind: mediaJobKindEnum('kind').notNull(),
    provider: text('provider').notNull(),
    adapterVersion: text('adapter_version').notNull(),
    sceneHash: text('scene_hash').notNull(),
    requestId: text('request_id').notNull().unique(),
    status: mediaJobStatusEnum('status').notNull().default('queued'),
    /** etapa visível ao autor: waiting|narrating|uploading|rendering|downloading|attaching|done|failed|canceled */
    phase: text('phase').notNull().default('waiting'),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    externalId: text('external_id'),
    outputAssetId: text('output_asset_id').references(() => assets.id),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    costEstimatedUsd: real('cost_estimated_usd'),
    costActualUsd: real('cost_actual_usd'),
    /** true quando o job foi simulado (modo demonstração), nunca cobrado */
    simulated: integer('simulated').notNull().default(0),
    /** orçamento aprovado que originou o job (lote); nulo em pedidos avulsos */
    quoteId: text('quote_id'),
    /** quem aprovou o gasto (lote ou pedido avulso com confirmPaid) e quando */
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('media_jobs_scene_idx').on(t.sceneHash, t.provider),
    index('media_jobs_node_idx').on(t.courseId, t.lessonId, t.nodeId),
    index('media_jobs_status_idx').on(t.status),
    // no máximo um job aberto por cena (dedupe no banco, não só no jobId da fila)
    uniqueIndex('media_jobs_open_node_uq').on(t.courseId, t.lessonId, t.nodeId).where(sql`status in ('queued','running')`),
  ],
);

export const mediaQuoteStatusEnum = pgEnum('media_quote_status', ['open', 'consumed', 'expired']);

export interface MediaQuoteItem {
  lessonId: string;
  nodeId: string;
  title: string;
  lessonTitle?: string;
  chars: number;
  seconds: number;
  /** cena com job bem-sucedido do mesmo hash: custo 0, mídia anexada sem novo job */
  reused: boolean;
  /** já tem job aberto (fila/produção): não entra no lote */
  open?: boolean;
  estimatedUsd: number;
  sceneHash: string;
  /** job bem-sucedido reaproveitável (quando `reused`); na remontagem, o job de origem do vídeo transparente */
  reusedJobId?: string;
  /** remontagem sem custo: o vídeo transparente já pago (de `reusedJobId`) é só montado sobre o novo fundo/posição (job real, custo 0) */
  recompose?: boolean;
  /** entrada completa do job (script, params, direção…) para o lote criar sem recalcular */
  jobInput?: Record<string, unknown>;
  adapterVersion?: string;
  cinematicShots?: number;
  /** cena dirigida refeita: planos idênticos ao vídeo já pago (`fromJobId`) saem de graça; custo só dos planos novos */
  partialReuse?: { fromJobId: string; reusedShots: number; newShots: number };
}

export interface MediaQuoteTotals {
  scenes: number;
  reused: number;
  /** das reaproveitadas, quantas são remontagens sem custo (ganham um job real de custo 0) */
  recompose?: number;
  open: number;
  toProduce: number;
  chars: number;
  seconds: number;
  estimatedUsd: number;
}

/**
 * Orçamento de produção (auditoria P0-2): calculado no servidor sobre uma
 * revisão do rascunho, com validade curta; o lote só é criado a partir de um
 * orçamento aberto, não vencido e da mesma revisão.
 */
export const mediaQuotes = pgTable(
  'media_quotes',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull(),
    draftRevision: integer('draft_revision').notNull(),
    /** impressão do documento cotado (hash) — o lote recusa se mudou */
    draftHash: text('draft_hash').notNull(),
    status: mediaQuoteStatusEnum('status').notNull().default('open'),
    simulated: integer('simulated').notNull().default(0),
    items: jsonb('items').$type<MediaQuoteItem[]>().notNull(),
    totals: jsonb('totals').$type<MediaQuoteTotals>().notNull(),
    /** parâmetros da cotação (includeStale, seleção) para auditoria */
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedBy: text('consumed_by'),
  },
  (t) => [index('media_quotes_course_idx').on(t.courseId, t.createdAt)],
);
