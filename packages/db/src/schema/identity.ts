import { pgTable, text, timestamp, pgEnum, primaryKey, index, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth';

export const roleEnum = pgEnum('workspace_role', ['admin', 'author', 'reviewer', 'student']);
export type WorkspaceRole = (typeof roleEnum.enumValues)[number];

/** Um workspace da nossa operação; sem billing/multiempresa comercial. */
export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** identidade visual configurável: nome, cor primária, logo (assetId) */
  branding: jsonb('branding').$type<{ name?: string; primaryColor?: string; logoAssetId?: string }>().notNull().default({}),
  /** teto diário de gasto (USD) por workspace; ausente = padrão do ambiente (MEDIA_DAILY_BUDGET_USD / AI_DAILY_BUDGET_USD) */
  spendLimits: jsonb('spend_limits').$type<{ mediaDailyUsd?: number; aiDailyUsd?: number }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    /** matrícula acadêmica (RGM) da instituição; único por workspace quando preenchido */
    rgm: text('rgm'),
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
    uniqueIndex('memberships_workspace_rgm_uq').on(t.workspaceId, t.rgm).where(sql`${t.rgm} is not null`),
  ],
);

export type IntegrationScope = 'students:write' | 'progress:read' | 'webhooks:manage';
export const INTEGRATION_SCOPES: readonly IntegrationScope[] = ['students:write', 'progress:read', 'webhooks:manage'];

/** Tokens de integração (sistemas externos, ex.: o DNA). Só o hash SHA-256 fica guardado; o segredo aparece uma vez. */
export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SHA-256 (hex) do segredo completo */
    tokenHash: text('token_hash').notNull().unique(),
    /** primeiros caracteres do segredo, só para reconhecer o token na lista */
    prefix: text('prefix').notNull(),
    scopes: text('scopes').array().$type<IntegrationScope[]>().notNull(),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('integration_tokens_workspace_idx').on(t.workspaceId)],
);
