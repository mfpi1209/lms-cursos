import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { VIDEO_REVIEW_CATEGORIES, VIDEO_REVIEW_STATUSES, type VideoReviewCategory, type VideoReviewFixKind, type VideoReviewHistoryEntry, type VideoReviewStatus } from '../schema/review';

/*
 * Marcas da revisão "Assistir e marcar" (estúdio): criar, listar, resolver/reabrir e apagar. Sempre com o workspace no
 * filtro (isolamento no backend); a rota confere o curso antes.
 */

export interface ReviewMarkView {
  id: string;
  courseId: string;
  lessonId: string;
  nodeId: string;
  sceneTimeSec: number;
  draftRevision: number;
  sceneAssetId: string;
  sceneHash: string | null;
  category: VideoReviewCategory;
  note: string;
  expected: string | null;
  status: VideoReviewStatus;
  resolution: Record<string, unknown> | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  fixKind: VideoReviewFixKind | null;
  brief: string | null;
  fix: Record<string, unknown> | null;
  proposed: Record<string, unknown> | null;
  approvalUsd: number | null;
  attempts: number;
  history: VideoReviewHistoryEntry[];
}

export function isReviewStatus(v: unknown): v is VideoReviewStatus {
  return typeof v === 'string' && (VIDEO_REVIEW_STATUSES as readonly string[]).includes(v);
}

export function isReviewCategory(v: unknown): v is VideoReviewCategory {
  return typeof v === 'string' && (VIDEO_REVIEW_CATEGORIES as readonly string[]).includes(v);
}

const cols = {
  id: s.videoReviewMarks.id,
  courseId: s.videoReviewMarks.courseId,
  lessonId: s.videoReviewMarks.lessonId,
  nodeId: s.videoReviewMarks.nodeId,
  sceneTimeSec: s.videoReviewMarks.sceneTimeSec,
  draftRevision: s.videoReviewMarks.draftRevision,
  sceneAssetId: s.videoReviewMarks.sceneAssetId,
  sceneHash: s.videoReviewMarks.sceneHash,
  category: s.videoReviewMarks.category,
  note: s.videoReviewMarks.note,
  expected: s.videoReviewMarks.expected,
  status: s.videoReviewMarks.status,
  resolution: s.videoReviewMarks.resolution,
  createdBy: s.videoReviewMarks.createdBy,
  createdByName: s.user.name,
  createdAt: s.videoReviewMarks.createdAt,
  resolvedAt: s.videoReviewMarks.resolvedAt,
  fixKind: s.videoReviewMarks.fixKind,
  brief: s.videoReviewMarks.brief,
  fix: s.videoReviewMarks.fix,
  proposed: s.videoReviewMarks.proposed,
  approvalUsd: s.videoReviewMarks.approvalUsd,
  attempts: s.videoReviewMarks.attempts,
  history: s.videoReviewMarks.history,
};

type Row = { [K in keyof typeof cols]: unknown };
function view(r: Row): ReviewMarkView {
  return {
    ...(r as unknown as ReviewMarkView),
    sceneTimeSec: Number(r.sceneTimeSec),
    createdAt: (r.createdAt as Date).toISOString(),
    resolvedAt: r.resolvedAt ? (r.resolvedAt as Date).toISOString() : null,
    approvalUsd: r.approvalUsd == null ? null : Number(r.approvalUsd),
    history: (r.history as VideoReviewHistoryEntry[] | null) ?? [],
  };
}

export async function createMark(
  db: DbOrTx,
  input: {
    workspaceId: string;
    courseId: string;
    actorId: string;
    lessonId: string;
    nodeId: string;
    sceneTimeSec: number;
    draftRevision: number;
    sceneAssetId: string;
    sceneHash?: string | null;
    category: VideoReviewCategory;
    note?: string;
    expected?: string | null;
    resolution?: Record<string, unknown> | null;
  },
): Promise<ReviewMarkView> {
  if (!isReviewCategory(input.category)) throw new DomainError('VALIDATION', 'Categoria inválida');
  if (!Number.isFinite(input.sceneTimeSec) || input.sceneTimeSec < 0) throw new DomainError('VALIDATION', 'Instante inválido');
  const id = newId('vrm');
  await db.insert(s.videoReviewMarks).values({
    id,
    workspaceId: input.workspaceId,
    courseId: input.courseId,
    lessonId: input.lessonId,
    nodeId: input.nodeId,
    sceneTimeSec: input.sceneTimeSec,
    draftRevision: input.draftRevision,
    sceneAssetId: input.sceneAssetId,
    sceneHash: input.sceneHash ?? null,
    category: input.category,
    note: (input.note ?? '').trim().slice(0, 1000),
    expected: input.expected?.trim() ? input.expected.trim().slice(0, 1000) : null,
    resolution: input.resolution ?? null,
    createdBy: input.actorId,
  });
  return (await getMark(db, { workspaceId: input.workspaceId, markId: id }))!;
}

export async function getMark(db: DbOrTx, input: { workspaceId: string; markId: string }): Promise<ReviewMarkView | null> {
  const rows = await db
    .select(cols)
    .from(s.videoReviewMarks)
    .leftJoin(s.user, eq(s.user.id, s.videoReviewMarks.createdBy))
    .where(and(eq(s.videoReviewMarks.workspaceId, input.workspaceId), eq(s.videoReviewMarks.id, input.markId)));
  return rows[0] ? view(rows[0]) : null;
}

/** Marcas do curso (opcionalmente de uma aula e/ou de um status), na ordem da aula: cena e instante. */
export async function listMarks(db: DbOrTx, input: { workspaceId: string; courseId: string; lessonId?: string; status?: VideoReviewStatus | VideoReviewStatus[] }): Promise<ReviewMarkView[]> {
  const where = [eq(s.videoReviewMarks.workspaceId, input.workspaceId), eq(s.videoReviewMarks.courseId, input.courseId)];
  if (input.lessonId) where.push(eq(s.videoReviewMarks.lessonId, input.lessonId));
  if (input.status) where.push(Array.isArray(input.status) ? inArray(s.videoReviewMarks.status, input.status) : eq(s.videoReviewMarks.status, input.status));
  const rows = await db
    .select(cols)
    .from(s.videoReviewMarks)
    .leftJoin(s.user, eq(s.user.id, s.videoReviewMarks.createdBy))
    .where(and(...where))
    .orderBy(asc(s.videoReviewMarks.lessonId), asc(s.videoReviewMarks.createdAt));
  return rows.map(view);
}

export interface MarkPatch {
  status?: VideoReviewStatus;
  fixKind?: VideoReviewFixKind | null;
  brief?: string | null;
  fix?: Record<string, unknown> | null;
  proposed?: Record<string, unknown> | null;
  approvalUsd?: number | null;
  attempts?: number;
  /** "ainda errado": a marca passa a apontar para o vídeo novo da cena */
  sceneAssetId?: string;
  sceneHash?: string | null;
  draftRevision?: number;
  resolution?: Record<string, unknown> | null;
}

/**
 * Atualiza a marca (status, conserto, aprovação…). Mudança de status entra no histórico (`note` opcional); resolver
 * grava quem e quando, sair de "resolvida" limpa. A validação da transição fica no chamador (`transition`).
 */
export async function updateMark(db: DbOrTx, input: { workspaceId: string; markId: string; actorId: string | null; patch: MarkPatch; note?: string }): Promise<ReviewMarkView> {
  const cur = await getMark(db, input);
  if (!cur) throw new DomainError('NOT_FOUND', 'Marca não encontrada');
  const p = input.patch;
  if (p.status && !isReviewStatus(p.status)) throw new DomainError('VALIDATION', 'Status inválido');
  const changed = !!p.status && p.status !== cur.status;
  const history = changed || input.note ? [...cur.history, { at: new Date().toISOString(), by: input.actorId, from: cur.status, to: p.status ?? cur.status, ...(input.note ? { note: input.note.slice(0, 300) } : {}) }] : undefined;
  await db
    .update(s.videoReviewMarks)
    .set({
      ...p,
      ...(changed ? (p.status === 'resolved' ? { resolvedAt: new Date(), resolvedBy: input.actorId } : { resolvedAt: null, resolvedBy: null }) : {}),
      ...(history ? { history } : {}),
    })
    .where(and(eq(s.videoReviewMarks.workspaceId, input.workspaceId), eq(s.videoReviewMarks.id, input.markId)));
  return (await getMark(db, input))!;
}

/** Atalho: resolver/reabrir. */
export async function setMarkStatus(db: DbOrTx, input: { workspaceId: string; markId: string; actorId: string; status: VideoReviewStatus }): Promise<ReviewMarkView> {
  return updateMark(db, { workspaceId: input.workspaceId, markId: input.markId, actorId: input.actorId, patch: { status: input.status } });
}

export async function deleteMark(db: DbOrTx, input: { workspaceId: string; markId: string }): Promise<void> {
  const r = await db
    .delete(s.videoReviewMarks)
    .where(and(eq(s.videoReviewMarks.workspaceId, input.workspaceId), eq(s.videoReviewMarks.id, input.markId)))
    .returning({ id: s.videoReviewMarks.id });
  if (!r.length) throw new DomainError('NOT_FOUND', 'Marca não encontrada');
}
