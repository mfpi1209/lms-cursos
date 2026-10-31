import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';

/** Auditoria de ações relevantes (publicação, matrícula, restauração…). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id'),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

/**
 * Outbox transacional: eventos gravados na mesma transação da mudança de
 * estado e consumidos pelo worker (consumidor idempotente, polling).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    /** formato versionado: ex. course.published, enrollment.created, lesson.completed */
    type: text('type').notNull(),
    version: integer('version').notNull().default(1),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_events_pending_idx').on(t.processedAt, t.createdAt)],
);
