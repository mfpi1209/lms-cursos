import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_PING_TYPE,
  WEBHOOK_TIMEOUT_MS,
  WebhookKeyError,
  backoffDelayMs,
  generateWebhookSecret,
  isWebhookEventType,
  protectSecret,
  truncateError,
  validateWebhookUrl,
  type WebhookEventType,
} from '../webhook-core';

/*
 * Webhooks de saída: cadastro (estúdio e API), entregas e o "retrato" de cada evento.
 * O envio HTTP em si fica no worker (apps/worker/src/webhooks.ts). Contrato: docs/integracao/api-v1.md.
 */

export const WEBHOOKS_PER_WORKSPACE_MAX = 20;
const isProduction = () => process.env.NODE_ENV === 'production';

/* ------------------------------ cadastro --------------------------------- */

export async function createEndpoint(db: DbOrTx, input: { workspaceId: string; actorId: string; url: string; events: string[] }) {
  const check = validateWebhookUrl(input.url, { production: isProduction() });
  if (!check.ok) throw new DomainError('VALIDATION', check.error!);
  const events = [...new Set(input.events)];
  if (events.length === 0) throw new DomainError('VALIDATION', 'Escolha ao menos um evento');
  const unknown = events.filter((e) => !isWebhookEventType(e));
  if (unknown.length) throw new DomainError('VALIDATION', `Evento desconhecido: ${unknown.join(', ')}`);
  const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(s.webhookEndpoints).where(eq(s.webhookEndpoints.workspaceId, input.workspaceId));
  if ((cnt?.n ?? 0) >= WEBHOOKS_PER_WORKSPACE_MAX) throw new DomainError('VALIDATION', `No máximo ${WEBHOOKS_PER_WORKSPACE_MAX} endereços por workspace`);
  const secret = generateWebhookSecret();
  let stored: string;
  try {
    stored = protectSecret(secret);
  } catch (e) {
    if (e instanceof WebhookKeyError) throw new DomainError('VALIDATION', e.message);
    throw e;
  }
  const id = newId('whk');
  await db.insert(s.webhookEndpoints).values({ id, workspaceId: input.workspaceId, url: check.url!, secret: stored, events, createdBy: input.actorId });
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'webhook.create', entityType: 'webhook_endpoint', entityId: id, data: { host: new URL(check.url!).host, events } });
  // o segredo vai só nesta resposta
  return { id, url: check.url!, events, active: true, secret };
}

export interface EndpointView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  /** entregas pendentes agora */
  pending: number;
}

/** Lista os endereços do workspace. NUNCA devolve o segredo. */
export async function listEndpoints(db: DbOrTx, workspaceId: string): Promise<EndpointView[]> {
  const rows = await db
    .select({
      id: s.webhookEndpoints.id,
      url: s.webhookEndpoints.url,
      events: s.webhookEndpoints.events,
      active: s.webhookEndpoints.active,
      createdAt: s.webhookEndpoints.createdAt,
      lastSuccessAt: s.webhookEndpoints.lastSuccessAt,
      lastFailureAt: s.webhookEndpoints.lastFailureAt,
      pending: sql<number>`(select count(*)::int from ${s.webhookDeliveries} d where d.endpoint_id = ${s.webhookEndpoints.id} and d.status = 'pending')`,
    })
    .from(s.webhookEndpoints)
    .where(eq(s.webhookEndpoints.workspaceId, workspaceId))
    .orderBy(s.webhookEndpoints.createdAt);
  return rows;
}

async function ownEndpoint(db: DbOrTx, workspaceId: string, endpointId: string) {
  const [row] = await db.select().from(s.webhookEndpoints).where(and(eq(s.webhookEndpoints.id, endpointId), eq(s.webhookEndpoints.workspaceId, workspaceId))).limit(1);
  if (!row) throw new DomainError('NOT_FOUND', 'Webhook não encontrado');
  return row;
}

export async function setEndpointActive(db: DbOrTx, input: { workspaceId: string; actorId: string; endpointId: string; active: boolean }) {
  await ownEndpoint(db, input.workspaceId, input.endpointId);
  await db.update(s.webhookEndpoints).set({ active: input.active }).where(eq(s.webhookEndpoints.id, input.endpointId));
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: input.active ? 'webhook.enable' : 'webhook.disable', entityType: 'webhook_endpoint', entityId: input.endpointId, data: {} });
}

export async function deleteEndpoint(db: DbOrTx, input: { workspaceId: string; actorId: string; endpointId: string }) {
  await ownEndpoint(db, input.workspaceId, input.endpointId);
  await db.delete(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, input.endpointId));
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'webhook.delete', entityType: 'webhook_endpoint', entityId: input.endpointId, data: {} });
}

/* ------------------------------ entregas --------------------------------- */

export interface DeliveryView {
  id: string;
  endpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  attempt: number;
  status: s.WebhookDeliveryStatus;
  httpStatus: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

/** Entregas mais recentes do workspace (sem o corpo, que tem dados do aluno). */
export async function listDeliveries(db: DbOrTx, input: { workspaceId: string; endpointId?: string; limit?: number }): Promise<DeliveryView[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  return db
    .select({
      id: s.webhookDeliveries.id,
      endpointId: s.webhookDeliveries.endpointId,
      endpointUrl: s.webhookEndpoints.url,
      eventId: s.webhookDeliveries.eventId,
      eventType: s.webhookDeliveries.eventType,
      attempt: s.webhookDeliveries.attempt,
      status: s.webhookDeliveries.status,
      httpStatus: s.webhookDeliveries.httpStatus,
      lastError: s.webhookDeliveries.lastError,
      nextAttemptAt: s.webhookDeliveries.nextAttemptAt,
      createdAt: s.webhookDeliveries.createdAt,
      deliveredAt: s.webhookDeliveries.deliveredAt,
    })
    .from(s.webhookDeliveries)
    .innerJoin(s.webhookEndpoints, eq(s.webhookEndpoints.id, s.webhookDeliveries.endpointId))
    .where(and(eq(s.webhookEndpoints.workspaceId, input.workspaceId), input.endpointId ? eq(s.webhookDeliveries.endpointId, input.endpointId) : undefined))
    .orderBy(desc(s.webhookDeliveries.createdAt), desc(s.webhookDeliveries.id))
    .limit(limit);
}

/** Corpo comum de todo evento enviado. */
export interface WebhookEnvelope {
  id: string;
  type: string;
  created_at: string;
  workspace_id: string;
  data: Record<string, unknown>;
}

/** "Enviar teste": cria uma entrega `ping` para o endereço. O worker a envia em segundos. */
export async function enqueuePing(db: DbOrTx, input: { workspaceId: string; actorId: string; endpointId: string }) {
  const ep = await ownEndpoint(db, input.workspaceId, input.endpointId);
  const eventId = newId('ping');
  const envelope: WebhookEnvelope = { id: eventId, type: WEBHOOK_PING_TYPE, created_at: new Date().toISOString(), workspace_id: ep.workspaceId, data: { mensagem: 'Teste de webhook do LMS DNA Work' } };
  const id = newId('wdl');
  await db.insert(s.webhookDeliveries).values({ id, endpointId: ep.id, eventId, eventType: WEBHOOK_PING_TYPE, payload: envelope as unknown as Record<string, unknown>, nextAttemptAt: new Date() });
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'webhook.ping', entityType: 'webhook_endpoint', entityId: ep.id, data: {} });
  return { deliveryId: id };
}

/**
 * "Reenviar": recoloca a entrega na fila, com a contagem de tentativas zerada (vale mais 8 tentativas), mesmo corpo e mesmo
 * `id` de evento (quem recebe descarta repetidos por ele). Exige o endereço ativo.
 */
export async function resendDelivery(db: DbOrTx, input: { workspaceId: string; actorId: string; deliveryId: string }) {
  const [row] = await db
    .select({ d: s.webhookDeliveries, active: s.webhookEndpoints.active })
    .from(s.webhookDeliveries)
    .innerJoin(s.webhookEndpoints, eq(s.webhookEndpoints.id, s.webhookDeliveries.endpointId))
    .where(and(eq(s.webhookDeliveries.id, input.deliveryId), eq(s.webhookEndpoints.workspaceId, input.workspaceId)))
    .limit(1);
  if (!row) throw new DomainError('NOT_FOUND', 'Entrega não encontrada');
  if (!row.active) throw new DomainError('VALIDATION', 'O webhook está desativado. Ative-o para reenviar.');
  await db
    .update(s.webhookDeliveries)
    .set({ status: 'pending', attempt: 0, nextAttemptAt: new Date(), lastError: null, httpStatus: null, deliveredAt: null, updatedAt: new Date() })
    .where(eq(s.webhookDeliveries.id, input.deliveryId));
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'webhook.resend', entityType: 'webhook_delivery', entityId: input.deliveryId, data: { eventType: row.d.eventType } });
}

/* ------------------------- retrato do evento ------------------------------ */

export interface OutboxEventLike {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Dados mínimos de cada evento: ids, slug do curso e quem é o aluno (e-mail e RGM, o necessário para o sistema de lá
 * reconhecer a pessoa). Sem nome, telefone, link da entrega, arquivo, comentário do avaliador nem respostas.
 * `null` se a matrícula não existe mais (aluno apagado): nada a enviar.
 */
export async function buildEventEnvelope(db: DbOrTx, ev: OutboxEventLike): Promise<WebhookEnvelope | null> {
  const enrollmentId = typeof ev.payload.enrollmentId === 'string' ? ev.payload.enrollmentId : null;
  if (!enrollmentId) return null;
  const [r] = await db
    .select({
      workspaceId: s.courses.workspaceId,
      courseId: s.courses.id,
      courseSlug: s.courses.slug,
      userId: s.user.id,
      email: s.user.email,
      rgm: s.workspaceMemberships.rgm,
      completedAt: s.enrollments.completedAt,
      createdAt: s.enrollments.createdAt,
    })
    .from(s.enrollments)
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .innerJoin(s.user, eq(s.user.id, s.enrollments.userId))
    .leftJoin(s.workspaceMemberships, and(eq(s.workspaceMemberships.workspaceId, s.courses.workspaceId), eq(s.workspaceMemberships.userId, s.enrollments.userId)))
    .where(eq(s.enrollments.id, enrollmentId))
    .limit(1);
  if (!r) return null;
  const base = {
    matricula_id: enrollmentId,
    curso: { id: r.courseId, slug: r.courseSlug },
    aluno: { id: r.userId, email: r.email, rgm: r.rgm ?? null },
  };
  const p = ev.payload;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  let data: Record<string, unknown>;
  switch (ev.type as WebhookEventType) {
    case 'enrollment.created':
      data = { ...base, matriculado_em: r.createdAt.toISOString() };
      break;
    case 'lesson.completed':
      data = { ...base, aula_id: str(p.lessonId) };
      break;
    case 'course.completed':
      data = { ...base, concluido_em: r.completedAt?.toISOString() ?? null, certificado_codigo: null };
      break;
    case 'task.submitted':
      data = { ...base, tarefa: { aula_id: str(p.lessonId), no_id: str(p.nodeId), status: 'enviada', reenvio: p.resubmission === true } };
      break;
    case 'task.reviewed':
      data = { ...base, tarefa: { aula_id: str(p.lessonId), no_id: str(p.nodeId), status: p.status === 'approved' ? 'aprovada' : p.status === 'returned' ? 'devolvida' : str(p.status), automatica: p.auto === true } };
      break;
    case 'certificate.issued':
      data = { ...base, certificado_codigo: str(p.code) ?? str(p.certificateCode) };
      break;
    default:
      return null;
  }
  return { id: ev.id, type: ev.type, created_at: ev.createdAt.toISOString(), workspace_id: r.workspaceId, data };
}

/**
 * Cria as entregas de um evento do outbox para os endereços ativos do workspace que assinam o tipo.
 * Idempotente: única por (endereço, evento); reprocessar o evento não duplica nada. Devolve quantas entregas NOVAS criou.
 */
export async function fanOutEvent(db: DbOrTx, ev: OutboxEventLike): Promise<number> {
  if (!isWebhookEventType(ev.type)) return 0;
  const envelope = await buildEventEnvelope(db, ev);
  if (!envelope) return 0;
  const endpoints = await db
    .select({ id: s.webhookEndpoints.id })
    .from(s.webhookEndpoints)
    .where(and(eq(s.webhookEndpoints.workspaceId, envelope.workspace_id), eq(s.webhookEndpoints.active, true), sql`${ev.type} = any(${s.webhookEndpoints.events})`));
  if (endpoints.length === 0) return 0;
  const inserted = await db
    .insert(s.webhookDeliveries)
    .values(endpoints.map((e) => ({ id: newId('wdl'), endpointId: e.id, eventId: ev.id, eventType: ev.type, payload: envelope as unknown as Record<string, unknown>, nextAttemptAt: new Date() })))
    .onConflictDoNothing({ target: [s.webhookDeliveries.endpointId, s.webhookDeliveries.eventId] })
    .returning({ id: s.webhookDeliveries.id });
  return inserted.length;
}

/* --------------------------- fila de envio -------------------------------- */

export interface ClaimedDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempt: number;
  url: string;
  secret: string;
  active: boolean;
}

/** Quanto tempo uma entrega fica "reservada" a um worker: o tempo limite do envio mais folga. Se o worker cair, ela volta à fila. */
export const WEBHOOK_LEASE_MS = WEBHOOK_TIMEOUT_MS + 110_000;

/**
 * Reserva entregas vencidas. No máximo `perEndpoint` por endereço e `limit` no total: um endereço lento ou com muita fila
 * não ocupa todas as vagas. A reserva é atômica (o UPDATE reconfere a condição), então dois workers nunca pegam a mesma.
 */
export async function claimDueDeliveries(db: DbOrTx, opts: { limit: number; perEndpoint: number; now?: Date }): Promise<ClaimedDelivery[]> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const candidates = await db.execute<{ id: string }>(sql`
    select id from (
      select d.id, d.next_attempt_at, row_number() over (partition by d.endpoint_id order by d.next_attempt_at, d.id) as rn
      from webhook_deliveries d
      where d.status = 'pending' and d.next_attempt_at <= ${nowIso}::timestamptz
    ) q
    where q.rn <= ${opts.perEndpoint}
    order by q.next_attempt_at
    limit ${opts.limit}
  `);
  const ids = [...candidates].map((r) => r.id);
  if (ids.length === 0) return [];
  const lease = new Date(now.getTime() + WEBHOOK_LEASE_MS).toISOString();
  const claimed = await db.execute<{ id: string }>(sql`
    update webhook_deliveries set next_attempt_at = ${lease}::timestamptz, updated_at = ${nowIso}::timestamptz
    where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) and status = 'pending' and next_attempt_at <= ${nowIso}::timestamptz
    returning id
  `);
  const won = [...claimed].map((r) => r.id);
  if (won.length === 0) return [];
  const rows = await db
    .select({
      id: s.webhookDeliveries.id,
      endpointId: s.webhookDeliveries.endpointId,
      eventId: s.webhookDeliveries.eventId,
      eventType: s.webhookDeliveries.eventType,
      payload: s.webhookDeliveries.payload,
      attempt: s.webhookDeliveries.attempt,
      url: s.webhookEndpoints.url,
      secret: s.webhookEndpoints.secret,
      active: s.webhookEndpoints.active,
    })
    .from(s.webhookDeliveries)
    .innerJoin(s.webhookEndpoints, eq(s.webhookEndpoints.id, s.webhookDeliveries.endpointId))
    .where(sql`${s.webhookDeliveries.id} in (${sql.join(won.map((i) => sql`${i}`), sql`, `)})`);
  return rows;
}

export type DeliveryOutcome = { ok: true; httpStatus: number } | { ok: false; httpStatus?: number | null; error: unknown; permanent?: boolean };

/** Grava o resultado de uma tentativa: entregue, nova espera (com atraso crescente) ou falha definitiva (8 tentativas). */
export async function recordDeliveryResult(db: DbOrTx, d: Pick<ClaimedDelivery, 'id' | 'endpointId' | 'attempt'>, outcome: DeliveryOutcome, opts: { now?: Date; rand?: () => number } = {}) {
  const now = opts.now ?? new Date();
  const attempt = d.attempt + 1;
  if (outcome.ok) {
    await db.update(s.webhookDeliveries).set({ attempt, status: 'delivered', httpStatus: outcome.httpStatus, lastError: null, nextAttemptAt: null, deliveredAt: now, updatedAt: now }).where(eq(s.webhookDeliveries.id, d.id));
    await db.update(s.webhookEndpoints).set({ lastSuccessAt: now }).where(eq(s.webhookEndpoints.id, d.endpointId));
    return { status: 'delivered' as const, nextAttemptAt: null };
  }
  const final = outcome.permanent === true || attempt >= WEBHOOK_MAX_ATTEMPTS;
  const next = final ? null : new Date(now.getTime() + backoffDelayMs(attempt, opts.rand));
  await db
    .update(s.webhookDeliveries)
    .set({ attempt, status: final ? 'failed' : 'pending', httpStatus: outcome.httpStatus ?? null, lastError: truncateError(outcome.error), nextAttemptAt: next, updatedAt: now })
    .where(eq(s.webhookDeliveries.id, d.id));
  await db.update(s.webhookEndpoints).set({ lastFailureAt: now }).where(eq(s.webhookEndpoints.id, d.endpointId));
  return { status: final ? ('failed' as const) : ('pending' as const), nextAttemptAt: next };
}

/** Apaga entregas (com o corpo, que tem e-mail e RGM do aluno) mais velhas que `days`. Chamado pela rotina de retenção. */
export async function purgeDeliveries(db: DbOrTx, days: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.delete(s.webhookDeliveries).where(and(lt(s.webhookDeliveries.createdAt, cutoff), sql`${s.webhookDeliveries.status} <> 'pending'`)).returning({ id: s.webhookDeliveries.id });
  return rows.length;
}

export { WEBHOOK_EVENT_TYPES };
