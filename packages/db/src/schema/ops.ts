import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { user } from './auth';

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

export type AccessLogKind = 'login' | 'renew';

/**
 * Registro de acesso a aplicação (Marco Civil da Internet, art. 15: data e hora de uso a partir de um IP, guarda de 6 meses).
 * Separado da sessão: uma linha por login e por renovação diária da sessão. Sem rota HTTP de leitura; só o script
 * `acesso:consultar` lê (e registra cada consulta em `audit_logs`). `userId` NÃO tem chave estrangeira de propósito:
 * sobrevive à exclusão da conta (guarda obrigatória) e a rotina de retenção apaga por prazo. Sem user agent (mínimo necessário).
 */
export const accessLogs = pgTable(
  'access_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** IP do cliente, como resolvido atrás do proxy; `null` só se o servidor não conseguiu determinar (ver o aviso no log do servidor) */
    ipAddress: text('ip_address'),
    /** porta lógica de origem, quando o proxy a informa por um cabeçalho configurado (`CLIENT_PORT_HEADER`); em geral `null` */
    sourcePort: integer('source_port'),
    kind: text('kind').$type<AccessLogKind>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('access_logs_user_idx').on(t.userId, t.occurredAt), index('access_logs_ip_idx').on(t.ipAddress, t.occurredAt), index('access_logs_occurred_idx').on(t.occurredAt)],
);

export type AccountClosureReason = 'pedido_do_titular' | 'equipe' | 'inatividade';

/**
 * Conta encerrada (ainda não apagada). Preenchida por `dados:apagar <email> --encerrar --apply`. A rotina de retenção
 * do worker só apaga contas encerradas há mais de N meses se `RETENTION_CLOSED_ACCOUNTS_ENABLED=1` (desligada por
 * padrão até o advogado confirmar o prazo). Apagar a conta apaga esta linha (cascata).
 */
export const accountClosures = pgTable('account_closures', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason').$type<AccountClosureReason>().notNull(),
});
