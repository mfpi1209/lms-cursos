import { pgTable, text, timestamp, integer, jsonb, real, index } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspaces } from './identity';
import { courses } from './authoring';

export const VIDEO_REVIEW_CATEGORIES = ['cut', 'sync', 'gesture', 'wrist', 'face', 'screen', 'topics', 'speech', 'other'] as const;
export type VideoReviewCategory = (typeof VIDEO_REVIEW_CATEGORIES)[number];
/**
 * aberta → (Corrigir) aguardando correção | aguardando aprovação de gasto | em reprocessamento → pronta para conferir
 * (vídeo novo da cena) → resolvida, ou "ainda errado" (volta a aberta, mantendo o histórico).
 */
export const VIDEO_REVIEW_STATUSES = ['open', 'awaiting_fix', 'awaiting_approval', 'reprocessing', 'ready_to_check', 'resolved'] as const;
export type VideoReviewStatus = (typeof VIDEO_REVIEW_STATUSES)[number];
/** grátis e determinístico (remontar) | precisa de edição (telas/tópicos/fala) | pago (refazer tomada) | decisão manual */
export type VideoReviewFixKind = 'free' | 'edit' | 'paid' | 'manual';
export interface VideoReviewHistoryEntry {
  at: string;
  by: string | null;
  from: VideoReviewStatus;
  to: VideoReviewStatus;
  note?: string;
}

/**
 * Marca da revisão "Assistir e marcar" do estúdio: o revisor pausa o vídeo de uma cena no instante do problema e diz o
 * que viu. Guarda a cena, o instante NO VÍDEO DA CENA e a versão exata assistida (asset + hash da cena + revisão do
 * rascunho) para a marca continuar fazendo sentido depois que a cena for refeita. `resolution` = retrato do "Isso cai
 * em" calculado na hora da marca (tomada, plano, fala, passo da tela, tópico), para o plano de ações.
 */
export const videoReviewMarks = pgTable(
  'video_review_marks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    /** cena (id do nó) */
    nodeId: text('node_id').notNull(),
    /** instante no vídeo da cena (s) */
    sceneTimeSec: real('scene_time_sec').notNull(),
    /** revisão do rascunho aberta durante a marca */
    draftRevision: integer('draft_revision').notNull(),
    /** vídeo da cena assistido (asset) e o hash da cena que o gerou (`media.generatedFrom.sceneHash`) */
    sceneAssetId: text('scene_asset_id').notNull(),
    sceneHash: text('scene_hash'),
    category: text('category').$type<VideoReviewCategory>().notNull(),
    note: text('note').notNull().default(''),
    /** "deveria ficar" (opcional) */
    expected: text('expected'),
    status: text('status').$type<VideoReviewStatus>().notNull().default('open'),
    resolution: jsonb('resolution').$type<Record<string, unknown>>(),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by').references(() => user.id),
    /** tipo de conserto (definido no "Corrigir") */
    fixKind: text('fix_kind').$type<VideoReviewFixKind>(),
    /** prompt de correção fechado (pt-BR) gravado no "Corrigir" */
    brief: text('brief'),
    /** detalhes do conserto: alvo, tomadas, comandos do operador, orçamento, aprovação, vídeo no momento do pedido */
    fix: jsonb('fix').$type<Record<string, unknown>>(),
    /** edição proposta (linhas atuais × propostas e a validação dos trechos da fala) */
    proposed: jsonb('proposed').$type<Record<string, unknown>>(),
    /** gasto aprovado/pedido (US$) */
    approvalUsd: real('approval_usd'),
    /** quantas vezes voltou como "ainda errado" */
    attempts: integer('attempts').notNull().default(0),
    history: jsonb('history').$type<VideoReviewHistoryEntry[]>().notNull().default([]),
  },
  (t) => [index('video_review_marks_course_idx').on(t.courseId, t.lessonId, t.status), index('video_review_marks_workspace_idx').on(t.workspaceId)],
);
