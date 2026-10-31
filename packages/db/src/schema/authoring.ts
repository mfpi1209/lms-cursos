import { pgTable, text, timestamp, integer, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import type { CourseDocument } from '@lms/course-schema';
import { user } from './auth';
import { workspaces } from './identity';

export const courseStatusEnum = pgEnum('course_status', ['draft', 'published', 'archived']);

export const courses = pgTable(
  'courses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    status: courseStatusEnum('status').notNull().default('draft'),
    createdBy: text('created_by').notNull().references(() => user.id),
    /** versão publicada mais recente (desnormalizado para listagens) */
    latestVersionNumber: integer('latest_version_number').notNull().default(0),
    /** trilha temática da vitrine do aluno (ex.: "Primeiro emprego"); fora do conteúdo versionado: mudar não exige republicar */
    trail: text('trail'),
    /** capa em pé da vitrine (asset de imagem 3:4, com título e marca já na arte); vazio = quadro do vídeo */
    posterAssetId: text('poster_asset_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [unique('courses_workspace_slug_uq').on(t.workspaceId, t.slug), index('courses_workspace_idx').on(t.workspaceId)],
);

/**
 * Rascunho editável: um por curso. `revision` é incrementado a cada gravação e
 * usado para controle otimista de concorrência (expectedRevision).
 */
export const courseDrafts = pgTable('course_drafts', {
  courseId: text('course_id').primaryKey().references(() => courses.id, { onDelete: 'cascade' }),
  document: jsonb('document').$type<CourseDocument>().notNull(),
  revision: integer('revision').notNull().default(1),
  updatedBy: text('updated_by').notNull().references(() => user.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Histórico de revisões do rascunho (restauração e auditoria). */
export const draftRevisions = pgTable(
  'draft_revisions',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    document: jsonb('document').$type<CourseDocument>().notNull(),
    authorId: text('author_id').notNull().references(() => user.id),
    /** origem: edição manual, proposta do agente aplicada, restauração */
    origin: text('origin').notNull().default('manual'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('draft_revisions_course_rev_uq').on(t.courseId, t.revision)],
);

/** Snapshot imutável publicado. Matrículas/tentativas apontam para cá. */
export const courseVersions = pgTable(
  'course_versions',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    document: jsonb('document').$type<CourseDocument>().notNull(),
    /** revisão do rascunho que originou a publicação */
    sourceRevision: integer('source_revision').notNull(),
    /** avisos editoriais aceitos na publicação */
    warnings: jsonb('warnings').$type<Array<{ code: string; message: string; nodeId?: string; lessonId?: string }>>().notNull().default([]),
    publishedBy: text('published_by').notNull().references(() => user.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('course_versions_course_number_uq').on(t.courseId, t.versionNumber)],
);
