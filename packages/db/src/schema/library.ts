import { pgTable, text, timestamp, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import { TEMPLATE_KINDS } from '@lms/course-schema';
import { user } from './auth';
import { workspaces } from './identity';
import { assets } from './media';

export const libraryTemplateKindEnum = pgEnum('library_template_kind', TEMPLATE_KINDS);

/**
 * Biblioteca de modelos do workspace (ver `@lms/course-schema` › library):
 * estúdios, instrutores (com o kit de câmeras por estúdio), vozes, marca,
 * direção visual, base de conhecimento e kits. `key` é a chave legível e
 * estável (ex.: `estudio7-marina`), única no workspace; `data` é validado
 * pelo esquema do tipo antes de gravar. Arquivar esconde sem apagar.
 */
export const libraryTemplates = pgTable(
  'library_templates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: libraryTemplateKindEnum('kind').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    /** imagem ou áudio de prévia no workspace (cenário, amostra de voz) */
    previewAssetId: text('preview_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [unique('library_templates_workspace_key_uq').on(t.workspaceId, t.key), index('library_templates_workspace_kind_idx').on(t.workspaceId, t.kind)],
);
