import { pgTable, text, timestamp, integer, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workspaces } from './identity';

/**
 * Endereço que recebe eventos do LMS (webhooks de saída). O `secret` é guardado CIFRADO (AES-256-GCM com a chave
 * `WEBHOOK_SECRET_KEY`; ver `webhook-secret.ts`) e nunca volta por nenhuma rota depois da criação: ele só serve para
 * o worker assinar cada entrega.
 */
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** segredo de assinatura, cifrado (`v1.<iv>.<tag>.<dados>`); em desenvolvimento sem chave, `plain.<segredo>` */
    secret: text('secret').notNull(),
    /** tipos de evento assinados (ver `WEBHOOK_EVENT_TYPES`) */
    events: text('events').array().notNull(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  },
  (t) => [index('webhook_endpoints_workspace_idx').on(t.workspaceId)],
);

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

/**
 * Uma entrega de um evento a um endereço. Única por (endereço, evento): o mesmo evento do outbox nunca gera duas
 * entregas para o mesmo endereço, mesmo que o worker reprocesse o evento. `payload` é o corpo JSON enviado (um retrato
 * do momento do evento: curso, e-mail e RGM do aluno etc.), para a nova tentativa mandar exatamente o mesmo.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    /** id do evento do outbox (ou `ping_…` no envio de teste); é o `id` do corpo, para quem recebe descartar repetidos */
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** tentativas já feitas */
    attempt: integer('attempt').notNull().default(0),
    status: text('status').$type<WebhookDeliveryStatus>().notNull().default('pending'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    httpStatus: integer('http_status'),
    /** último erro, truncado em 300 caracteres */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [
    unique('webhook_deliveries_endpoint_event_uq').on(t.endpointId, t.eventId),
    index('webhook_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    index('webhook_deliveries_endpoint_idx').on(t.endpointId, t.createdAt),
  ],
);
