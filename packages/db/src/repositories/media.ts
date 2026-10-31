import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';

export type AssetKind = 'image' | 'audio' | 'video' | 'document' | 'captions';
export type AssetRow = typeof s.assets.$inferSelect;

export async function createAsset(
  db: DbOrTx,
  input: {
    workspaceId: string;
    kind: AssetKind;
    source?: 'upload' | 'generated';
    mimeType: string;
    sizeBytes: number;
    storageProvider: string;
    storageKey: string;
    originalName?: string;
    sha256: string;
    durationSeconds?: number;
    transcript?: string;
    createdBy?: string;
    metadata?: s.AssetMetadata;
  },
) {
  const id = newId('ast');
  const [row] = await db.insert(s.assets).values({ id, ...input }).returning();
  return row!;
}

export async function getAsset(db: DbOrTx, assetId: string) {
  const [row] = await db.select().from(s.assets).where(eq(s.assets.id, assetId)).limit(1);
  return row ?? null;
}

/** Substitui os metadados do asset (ex.: marcar a vinheta padrão). */
export async function setAssetMetadata(db: DbOrTx, assetId: string, metadata: s.AssetMetadata | null) {
  const [row] = await db.update(s.assets).set({ metadata }).where(eq(s.assets.id, assetId)).returning();
  return row ?? null;
}

/** Vinhetas de marca do workspace (vídeos com `metadata.bumper`), mais recentes primeiro. */
export async function listBumperAssets(db: DbOrTx, workspaceId: string) {
  return db
    .select()
    .from(s.assets)
    .where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.kind, 'video'), sql`${s.assets.metadata}->'bumper' is not null`))
    .orderBy(desc(s.assets.createdAt))
    .limit(100);
}

/** Vinheta padrão do workspace na proporção (asset com `metadata.bumper.default = true`), ou null. */
export async function findDefaultBumper(db: DbOrTx, workspaceId: string, aspect: '16:9' | '9:16' = '16:9') {
  const [row] = await db
    .select()
    .from(s.assets)
    .where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.kind, 'video'), sql`(${s.assets.metadata}->'bumper'->>'default')::boolean = true`, sql`${s.assets.metadata}->'bumper'->>'aspect' = ${aspect}`))
    .orderBy(desc(s.assets.createdAt))
    .limit(1);
  return row ?? null;
}

/** Vinheta já renderizada com o mesmo hash (reaproveitamento sem novo render), no workspace. */
export async function findBumperByHash(db: DbOrTx, workspaceId: string, hash: string, aspect: '16:9' | '9:16') {
  const [row] = await db
    .select()
    .from(s.assets)
    .where(and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.kind, 'video'), sql`${s.assets.metadata}->'bumper'->>'hash' = ${hash}`, sql`${s.assets.metadata}->'bumper'->>'aspect' = ${aspect}`))
    .orderBy(desc(s.assets.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listAssets(db: DbOrTx, workspaceId: string, kind?: AssetKind) {
  const where = kind ? and(eq(s.assets.workspaceId, workspaceId), eq(s.assets.kind, kind)) : eq(s.assets.workspaceId, workspaceId);
  return db.select().from(s.assets).where(where).orderBy(desc(s.assets.createdAt)).limit(200);
}

/**
 * Reaproveitamento: último job bem-sucedido com o mesmo hash de cena e provedor,
 * SÓ no mesmo workspace e no mesmo modo (simulado nunca é reaproveitado como real e vice-versa).
 */
export async function findSucceededJobByHash(db: DbOrTx, input: { workspaceId: string; sceneHash: string; provider: string; simulated: boolean }) {
  const [row] = await db
    .select()
    .from(s.mediaJobs)
    .where(and(
      eq(s.mediaJobs.workspaceId, input.workspaceId),
      eq(s.mediaJobs.sceneHash, input.sceneHash),
      eq(s.mediaJobs.provider, input.provider),
      eq(s.mediaJobs.status, 'succeeded'),
      eq(s.mediaJobs.simulated, input.simulated ? 1 : 0),
    ))
    .orderBy(desc(s.mediaJobs.finishedAt))
    .limit(1);
  return row ?? null;
}

/** Reaproveitamento em lote: para cada hash, o último job bem-sucedido do workspace no mesmo modo. */
export async function findSucceededJobsByHashes(db: DbOrTx, input: { workspaceId: string; sceneHashes: string[]; provider: string; simulated: boolean }): Promise<Map<string, MediaJobRow>> {
  const out = new Map<string, MediaJobRow>();
  const hashes = Array.from(new Set(input.sceneHashes));
  if (!hashes.length) return out;
  const rows = await db
    .select()
    .from(s.mediaJobs)
    .where(and(
      eq(s.mediaJobs.workspaceId, input.workspaceId),
      inArray(s.mediaJobs.sceneHash, hashes),
      eq(s.mediaJobs.provider, input.provider),
      eq(s.mediaJobs.status, 'succeeded'),
      eq(s.mediaJobs.simulated, input.simulated ? 1 : 0),
    ))
    .orderBy(desc(s.mediaJobs.finishedAt));
  for (const r of rows) if (!out.has(r.sceneHash)) out.set(r.sceneHash, r);
  return out;
}

/**
 * Fonte para a remontagem sem custo: por chave do vídeo transparente
 * (`input.alphaKey`), o job REAL (simulated=0) bem-sucedido mais recente do
 * workspace que guardou o vídeo transparente (`input.rawVideoAssetId`). Serve a
 * qualquer nó/curso do workspace com a mesma fala, visual e voz.
 */
export async function findRecomposeSourcesByAlphaKeys(db: DbOrTx, input: { workspaceId: string; alphaKeys: string[] }): Promise<Map<string, MediaJobRow>> {
  const out = new Map<string, MediaJobRow>();
  const keys = Array.from(new Set(input.alphaKeys));
  if (!keys.length) return out;
  const rows = await db
    .select()
    .from(s.mediaJobs)
    .where(and(
      eq(s.mediaJobs.workspaceId, input.workspaceId),
      eq(s.mediaJobs.status, 'succeeded'),
      eq(s.mediaJobs.simulated, 0),
      sql`${s.mediaJobs.input}->>'alphaKey' in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`,
      sql`${s.mediaJobs.input} ? 'rawVideoAssetId'`,
      sql`${s.mediaJobs.input}->'direction' is null`,
    ))
    .orderBy(desc(s.mediaJobs.finishedAt));
  for (const r of rows) {
    const k = (r.input as { alphaKey?: string }).alphaKey;
    if (k && !out.has(k)) out.set(k, r);
  }
  return out;
}

export async function findRecomposeSourceByAlphaKey(db: DbOrTx, input: { workspaceId: string; alphaKey: string }): Promise<MediaJobRow | null> {
  return (await findRecomposeSourcesByAlphaKeys(db, { workspaceId: input.workspaceId, alphaKeys: [input.alphaKey] })).get(input.alphaKey) ?? null;
}

/** Jobs de vinheta do workspace (courseId sentinela `ws:<workspaceId>`), mais recentes primeiro. */
export async function listBumperJobs(db: DbOrTx, workspaceId: string, limit = 20) {
  return db.select().from(s.mediaJobs).where(and(eq(s.mediaJobs.workspaceId, workspaceId), eq(s.mediaJobs.courseId, `ws:${workspaceId}`))).orderBy(desc(s.mediaJobs.createdAt)).limit(limit);
}

export async function listJobsForCourse(db: DbOrTx, courseId: string) {
  return db.select().from(s.mediaJobs).where(eq(s.mediaJobs.courseId, courseId)).orderBy(desc(s.mediaJobs.createdAt)).limit(200);
}

export type MediaJobRow = typeof s.mediaJobs.$inferSelect;

export async function createJob(
  db: DbOrTx,
  input: {
    workspaceId: string;
    courseId: string;
    lessonId: string;
    nodeId: string;
    kind: 'video' | 'voice';
    provider: string;
    adapterVersion: string;
    sceneHash: string;
    input: Record<string, unknown>;
    createdBy: string;
    simulated: boolean;
    costEstimatedUsd?: number;
    quoteId?: string;
    approvedBy?: string;
    approvedAt?: Date;
  },
) {
  const id = newId('mjb');
  let row;
  try {
    [row] = await db
      .insert(s.mediaJobs)
      .values({ id, requestId: `${id}:${input.sceneHash.slice(0, 16)}`, ...input, simulated: input.simulated ? 1 : 0 })
      .returning();
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505')
      throw new DomainError('CONFLICT', 'Já existe um job em andamento para este bloco');
    throw e;
  }
  await db.insert(s.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { jobId: id } });
  return row!;
}

export async function getJob(db: DbOrTx, jobId: string) {
  const [row] = await db.select().from(s.mediaJobs).where(eq(s.mediaJobs.id, jobId)).limit(1);
  return row ?? null;
}

export async function getJobByExternalId(db: DbOrTx, provider: string, externalId: string) {
  const [row] = await db.select().from(s.mediaJobs).where(and(eq(s.mediaJobs.provider, provider), eq(s.mediaJobs.externalId, externalId))).limit(1);
  return row ?? null;
}

export async function updateJob(db: DbOrTx, jobId: string, patch: Partial<typeof s.mediaJobs.$inferInsert>) {
  const [row] = await db.update(s.mediaJobs).set({ ...patch, updatedAt: new Date() }).where(eq(s.mediaJobs.id, jobId)).returning();
  return row ?? null;
}

/** Jobs em execução no provedor, para reconciliação por polling. */
export async function listRunningJobs(db: DbOrTx, limit = 50) {
  return db.select().from(s.mediaJobs).where(eq(s.mediaJobs.status, 'running')).orderBy(s.mediaJobs.startedAt).limit(limit);
}

/** Jobs abertos (queued/running) para um nó, evita enfileirar duplicado. */
export async function findOpenJobForNode(db: DbOrTx, courseId: string, lessonId: string, nodeId: string) {
  const rows = await db
    .select()
    .from(s.mediaJobs)
    .where(and(eq(s.mediaJobs.courseId, courseId), eq(s.mediaJobs.lessonId, lessonId), eq(s.mediaJobs.nodeId, nodeId)))
    .orderBy(desc(s.mediaJobs.createdAt))
    .limit(5);
  return rows.find((r) => r.status === 'queued' || r.status === 'running') ?? null;
}

/** Job dirigido (plano a plano)? Mesma regra do worker. */
export function isDirectedJobInput(input: unknown): boolean {
  const d = (input as { direction?: { shots?: unknown } } | null)?.direction;
  return !!d && Array.isArray(d.shots) && d.shots.length > 0;
}

export const CANCEL_DIRECTED_MESSAGE = 'Cancelado: os planos já enviados ao HeyGen serão aproveitados; nenhum novo plano será enviado.';

/**
 * Cancela um job aberto. Vídeo de plano único já enviado ao HeyGen não pode ser
 * cancelado (já foi cobrado e será anexado). Vídeo dirigido pode ser cancelado
 * em execução: o worker para de enviar planos (os já enviados ainda são
 * baixados e guardados para reaproveitamento sem nova cobrança).
 */
export async function cancelJob(db: DbOrTx, job: MediaJobRow): Promise<{ status: string; message: string }> {
  if (job.status !== 'queued' && job.status !== 'running') throw new DomainError('CONFLICT', `Job já está em estado ${job.status}`);
  const directed = isDirectedJobInput(job.input);
  if (!directed && job.externalId) throw new DomainError('CONFLICT', 'Este vídeo já está sendo renderizado no HeyGen e não pode mais ser cancelado (já foi cobrado). Ele será anexado à cena quando ficar pronto.');
  const conds = [eq(s.mediaJobs.id, job.id), inArray(s.mediaJobs.status, ['queued', 'running'])];
  // plano único: só cancela se continuar sem envio ao HeyGen (o worker pode ter enviado nesse meio-tempo)
  if (!directed) conds.push(sql`${s.mediaJobs.externalId} is null`);
  const [row] = await db
    .update(s.mediaJobs)
    .set({ status: 'canceled', phase: 'canceled', finishedAt: new Date(), updatedAt: new Date() })
    .where(and(...conds))
    .returning();
  if (!row) throw new DomainError('CONFLICT', 'O job mudou de estado e não pôde ser cancelado; atualize a página.');
  const message = directed
    ? CANCEL_DIRECTED_MESSAGE
    : job.status === 'queued' ? 'Cancelado antes de qualquer envio ao provedor.' : 'Cancelado antes do envio ao HeyGen; nenhum vídeo será cobrado.';
  return { status: row.status, message };
}

/**
 * A geração de ângulo (look) `generationId` está registrada numa câmera de algum
 * curso do workspace? (rascunhos: `presentation.cameras[].generationId`)
 */
export async function isCameraGenerationInWorkspace(db: DbOrTx, workspaceId: string, generationId: string): Promise<boolean> {
  const rows = await db
    .select({ id: s.courseDrafts.courseId })
    .from(s.courseDrafts)
    .innerJoin(s.courses, eq(s.courses.id, s.courseDrafts.courseId))
    .where(and(eq(s.courses.workspaceId, workspaceId), sql`${s.courseDrafts.document}->'presentation'->'cameras' @> ${JSON.stringify([{ generationId }])}::jsonb`))
    .limit(1);
  return rows.length > 0;
}

// ---------------- orçamento de produção (auditoria P0-2) ----------------

export type MediaQuoteRow = typeof s.mediaQuotes.$inferSelect;
export type MediaQuoteItem = s.MediaQuoteItem;
export type MediaQuoteTotals = s.MediaQuoteTotals;

/** Validade padrão de um orçamento (MEDIA_QUOTE_TTL_MIN, padrão 30 min). */
export function quoteTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const min = Number(env.MEDIA_QUOTE_TTL_MIN ?? 30);
  return (Number.isFinite(min) && min > 0 ? min : 30) * 60_000;
}

export function quoteTotals(items: readonly MediaQuoteItem[]): MediaQuoteTotals {
  const t: MediaQuoteTotals = { scenes: items.length, reused: 0, open: 0, toProduce: 0, chars: 0, seconds: 0, estimatedUsd: 0 };
  for (const it of items) {
    if (it.reused) {
      t.reused++;
      if (it.recompose) t.recompose = (t.recompose ?? 0) + 1;
    } else if (it.open) t.open++;
    else {
      t.toProduce++;
      t.chars += it.chars;
      t.seconds += it.seconds;
      t.estimatedUsd += it.estimatedUsd;
    }
  }
  t.estimatedUsd = Math.round(t.estimatedUsd * 1_000_000) / 1_000_000;
  return t;
}

export async function createQuote(
  db: DbOrTx,
  input: { workspaceId: string; courseId: string; draftRevision: number; draftHash: string; simulated: boolean; items: MediaQuoteItem[]; params?: Record<string, unknown>; createdBy: string; ttlMs?: number },
) {
  const id = newId('mqt');
  const [row] = await db
    .insert(s.mediaQuotes)
    .values({ id, workspaceId: input.workspaceId, courseId: input.courseId, draftRevision: input.draftRevision, draftHash: input.draftHash, simulated: input.simulated ? 1 : 0, items: input.items, totals: quoteTotals(input.items), params: input.params ?? {}, expiresAt: new Date(Date.now() + (input.ttlMs ?? quoteTtlMs())), createdBy: input.createdBy })
    .returning();
  return row!;
}

export async function getQuote(db: DbOrTx, quoteId: string) {
  const [row] = await db.select().from(s.mediaQuotes).where(eq(s.mediaQuotes.id, quoteId)).limit(1);
  return row ?? null;
}

/** Resposta pública do orçamento (sem a entrada completa dos jobs). */
export function publicQuote(q: MediaQuoteRow) {
  return {
    quoteId: q.id,
    courseId: q.courseId,
    draftRevision: q.draftRevision,
    status: q.status,
    simulated: q.simulated === 1,
    items: q.items.map((it) => ({ lessonId: it.lessonId, nodeId: it.nodeId, title: it.title, lessonTitle: it.lessonTitle, chars: it.chars, seconds: it.seconds, reused: it.reused, open: it.open === true, estimatedUsd: it.estimatedUsd, cinematicShots: it.cinematicShots ?? 0, ...(it.recompose ? { recompose: true } : {}), ...(it.partialReuse ? { partialReuse: it.partialReuse } : {}) })),
    totals: q.totals,
    expiresAt: q.expiresAt,
    createdAt: q.createdAt,
  };
}

export interface BatchFromQuoteInput {
  quoteId: string;
  workspaceId: string;
  courseId: string;
  userId: string;
  /** revisão e impressão ATUAIS do rascunho: o lote recusa se diferem do orçamento */
  currentDraftRevision: number;
  currentDraftHash: string;
  /** modo do processo que cria o lote: tem de ser o mesmo do orçamento */
  simulated: boolean;
  now?: Date;
}

export interface BatchFromQuoteResult {
  quote: MediaQuoteRow;
  created: MediaJobRow[];
  /** cenas reaproveitadas (job bem-sucedido com o mesmo hash): o chamador anexa a mídia */
  reused: MediaQuoteItem[];
  /** cenas que ganharam um job aberto entre o orçamento e o lote */
  skippedOpen: Array<{ lessonId: string; nodeId: string; jobId: string }>;
}

/**
 * Cria TODOS os jobs de um orçamento numa transação. Recusa (409) quando o
 * orçamento venceu, já foi usado, é de outro curso/modo, ou o rascunho mudou
 * desde a cotação. Respeita a unicidade de job aberto por cena (cenas com job
 * aberto são puladas, não falham o lote). Registra a aprovação em cada job.
 */
export async function createJobsFromQuote(db: Database, input: BatchFromQuoteInput): Promise<BatchFromQuoteResult> {
  const now = input.now ?? new Date();
  // vencimento marcado FORA da transação (um erro dentro dela desfaria a marca)
  const pre = await getQuote(db, input.quoteId);
  if (pre && pre.status === 'open' && pre.expiresAt.getTime() <= now.getTime()) await db.update(s.mediaQuotes).set({ status: 'expired' }).where(and(eq(s.mediaQuotes.id, pre.id), eq(s.mediaQuotes.status, 'open')));
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(s.mediaQuotes).where(eq(s.mediaQuotes.id, input.quoteId)).for('update').limit(1);
    if (!quote || quote.workspaceId !== input.workspaceId) throw new DomainError('NOT_FOUND', 'Orçamento não encontrado');
    if (quote.courseId !== input.courseId) throw new DomainError('CONFLICT', 'O orçamento é de outro curso', { reason: 'other_course' });
    if (quote.status === 'consumed') throw new DomainError('CONFLICT', 'Este orçamento já foi usado para criar um lote; calcule um novo.', { reason: 'consumed', consumedAt: quote.consumedAt });
    if (quote.status === 'expired' || quote.expiresAt.getTime() <= now.getTime()) {
      throw new DomainError('CONFLICT', 'O orçamento venceu; calcule um novo antes de aprovar.', { reason: 'expired', expiresAt: quote.expiresAt });
    }
    if (quote.draftRevision !== input.currentDraftRevision || quote.draftHash !== input.currentDraftHash) {
      throw new DomainError('CONFLICT', `O rascunho mudou desde o orçamento (revisão ${input.currentDraftRevision}, orçamento na ${quote.draftRevision}); calcule um novo.`, { reason: 'revision_changed', quotedRevision: quote.draftRevision, currentRevision: input.currentDraftRevision });
    }
    if ((quote.simulated === 1) !== input.simulated) throw new DomainError('CONFLICT', 'O modo (simulado/real) mudou desde o orçamento; calcule um novo.', { reason: 'mode_changed' });

    const created: MediaJobRow[] = [];
    const reused: MediaQuoteItem[] = [];
    const skippedOpen: BatchFromQuoteResult['skippedOpen'] = [];
    for (const it of quote.items) {
      if (it.reused && !it.recompose) {
        reused.push(it);
        continue;
      }
      if (it.open) continue;
      const open = await findOpenJobForNode(tx, input.courseId, it.lessonId, it.nodeId);
      if (open) {
        skippedOpen.push({ lessonId: it.lessonId, nodeId: it.nodeId, jobId: open.id });
        continue;
      }
      if (!it.jobInput || !it.adapterVersion) throw new DomainError('VALIDATION', `O orçamento não tem a entrada da cena ${it.nodeId}; calcule um novo.`);
      const id = newId('mjb');
      let row: MediaJobRow | undefined;
      try {
        [row] = await tx
          .insert(s.mediaJobs)
          .values({
            id, requestId: `${id}:${it.sceneHash.slice(0, 16)}`, workspaceId: input.workspaceId, courseId: input.courseId, lessonId: it.lessonId, nodeId: it.nodeId, kind: 'video', provider: 'heygen',
            adapterVersion: it.adapterVersion, sceneHash: it.sceneHash, input: it.jobInput, createdBy: input.userId,
            // remontagem sem custo: job REAL (a saída é um vídeo real) e custo 0, mesmo num lote em modo de demonstração
            simulated: it.recompose ? 0 : input.simulated ? 1 : 0,
            costEstimatedUsd: it.recompose ? 0 : it.estimatedUsd, quoteId: quote.id, approvedBy: input.userId, approvedAt: now,
          })
          .returning();
      } catch (e) {
        // corrida com outro pedido para a mesma cena: pula, não falha o lote
        if ((e as { code?: string; cause?: { code?: string } })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505') {
          const other = await findOpenJobForNode(tx, input.courseId, it.lessonId, it.nodeId);
          skippedOpen.push({ lessonId: it.lessonId, nodeId: it.nodeId, jobId: other?.id ?? 'desconhecido' });
          continue;
        }
        throw e;
      }
      created.push(row!);
    }
    if (created.length) await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { quoteId: quote.id, jobs: created.length } });
    const [consumed] = await tx.update(s.mediaQuotes).set({ status: 'consumed', consumedAt: now, consumedBy: input.userId }).where(eq(s.mediaQuotes.id, quote.id)).returning();
    return { quote: consumed!, created, reused, skippedOpen };
  });
}

// ---------------- gasto e teto diário ----------------

export interface BudgetCheck {
  kind: 'media' | 'ai';
  /** null = sem teto */
  limitUsd: number | null;
  /** já comprometido na janela (real quando conhecido, senão estimado; jobs abertos contam pelo estimado) */
  spentUsd: number;
  /** o que o pedido atual acrescentaria */
  addUsd: number;
  remainingUsd: number | null;
  exceeded: boolean;
}

/**
 * Valor do teto vindo do ambiente/configuração: vazio = padrão; `-1` (ou
 * `unlimited`) = sem teto; número ≥ 0 = teto em USD (0 bloqueia qualquer gasto).
 */
export function parseBudgetUsd(raw: string | number | null | undefined, fallback: number | null): number | null {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'number') return Number.isFinite(raw) ? (raw < 0 ? null : raw) : fallback;
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (v === 'unlimited' || v === 'inf' || v === 'none') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? null : n;
}

export function checkBudget(input: { kind: 'media' | 'ai'; limitUsd: number | null; spentUsd: number; addUsd: number }): BudgetCheck {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const spentUsd = r2(input.spentUsd);
  const addUsd = r2(input.addUsd);
  if (input.limitUsd === null) return { kind: input.kind, limitUsd: null, spentUsd, addUsd, remainingUsd: null, exceeded: false };
  const remainingUsd = r2(input.limitUsd - spentUsd);
  return { kind: input.kind, limitUsd: input.limitUsd, spentUsd, addUsd, remainingUsd, exceeded: spentUsd + addUsd > input.limitUsd + 1e-9 };
}

/** Lança 402 (BUDGET_EXCEEDED) com os valores quando o pedido ultrapassaria o teto diário. */
export function assertWithinBudget(check: BudgetCheck): BudgetCheck {
  if (!check.exceeded) return check;
  const what = check.kind === 'media' ? 'de produção de vídeo' : 'de IA';
  throw new DomainError(
    'BUDGET_EXCEEDED',
    `Teto diário ${what} do workspace seria ultrapassado: US$ ${check.spentUsd.toFixed(2)} já comprometidos nas últimas 24 h + US$ ${check.addUsd.toFixed(2)} deste pedido > teto de US$ ${(check.limitUsd ?? 0).toFixed(2)}. Ajuste MEDIA_DAILY_BUDGET_USD/AI_DAILY_BUDGET_USD ou o limite do workspace, ou espere a janela passar.`,
    check,
  );
}

export interface SpendTotals {
  /** custo real somado (jobs/execuções concluídos com valor conhecido) */
  actualUsd: number;
  /** custo estimado somado (todos os itens não cancelados, inclusive abertos) */
  estimatedUsd: number;
  /** estimado dos itens ainda abertos (fila/execução) */
  openEstimatedUsd: number;
  /** comprometido: real quando conhecido, senão estimado (base do teto) */
  committedUsd: number;
  items: number;
  openItems: number;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Gasto de mídia (jobs REAIS, não cancelados) de um workspace desde `since`, opcionalmente só de um curso. */
export async function mediaSpendSince(db: DbOrTx, input: { workspaceId: string; courseId?: string; since: Date }): Promise<SpendTotals> {
  const t = s.mediaJobs;
  const conds = [eq(t.workspaceId, input.workspaceId), eq(t.simulated, 0), gte(t.createdAt, input.since), sql`${t.status} <> 'canceled'`];
  if (input.courseId) conds.push(eq(t.courseId, input.courseId));
  const [row] = await db
    .select({
      actual: sql<number>`coalesce(sum(${t.costActualUsd}), 0)`,
      estimated: sql<number>`coalesce(sum(${t.costEstimatedUsd}), 0)`,
      openEstimated: sql<number>`coalesce(sum(case when ${t.status} in ('queued','running') then ${t.costEstimatedUsd} else 0 end), 0)`,
      committed: sql<number>`coalesce(sum(coalesce(${t.costActualUsd}, ${t.costEstimatedUsd}, 0)), 0)`,
      items: sql<number>`count(*)`,
      openItems: sql<number>`count(*) filter (where ${t.status} in ('queued','running'))`,
    })
    .from(t)
    .where(and(...conds));
  return { actualUsd: num(row?.actual), estimatedUsd: num(row?.estimated), openEstimatedUsd: num(row?.openEstimated), committedUsd: num(row?.committed), items: num(row?.items), openItems: num(row?.openItems) };
}

/**
 * Gasto de IA (execuções com provedor ≠ fake, não canceladas) desde `since`.
 * Execuções abertas (fila/execução) ainda não têm custo: contam `openRunEstimateUsd` cada (AI_RUN_ESTIMATE_USD).
 */
export async function aiSpendSince(db: DbOrTx, input: { workspaceId: string; courseId?: string; since: Date; openRunEstimateUsd: number }): Promise<SpendTotals> {
  const t = s.agentRuns;
  const conds = [eq(t.workspaceId, input.workspaceId), sql`${t.provider} <> 'fake'`, gte(t.createdAt, input.since), sql`${t.status} <> 'canceled'`];
  if (input.courseId) conds.push(eq(t.courseId, input.courseId));
  const [row] = await db
    .select({
      actual: sql<number>`coalesce(sum(${t.costUsd}), 0)`,
      items: sql<number>`count(*)`,
      openItems: sql<number>`count(*) filter (where ${t.status} in ('queued','running'))`,
    })
    .from(t)
    .where(and(...conds));
  const openItems = num(row?.openItems);
  const openEstimatedUsd = openItems * input.openRunEstimateUsd;
  const actualUsd = num(row?.actual);
  return { actualUsd, estimatedUsd: actualUsd + openEstimatedUsd, openEstimatedUsd, committedUsd: actualUsd + openEstimatedUsd, items: num(row?.items), openItems };
}
