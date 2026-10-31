import { pgTable, text, timestamp, pgEnum, primaryKey, index, jsonb } from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);
