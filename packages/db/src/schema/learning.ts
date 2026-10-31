import { pgTable, text, timestamp, integer, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import type { AttemptState } from '@lms/course-engine';
import { user } from './auth';
import { courses, courseVersions } from './authoring';

export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'completed', 'canceled']);
export const attemptStatusEnum = pgEnum('attempt_status', ['in_progress', 'completed', 'abandoned']);

/** Matrícula fixa a versão publicada. Alunos em andamento permanecem nela. */
export const enrollments = pgTable(
  'enrollments',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    courseVersionId: text('course_version_id').notNull().references(() => courseVersions.id),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    createdBy: text('created_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [unique('enrollments_course_user_uq').on(t.courseId, t.userId), index('enrollments_user_idx').on(t.userId)],
);

/**
 * Tentativa de uma aula. `state` é o snapshot do motor; `revision` é usado para
 * concorrência otimista (duas abas não aplicam a mesma decisão duas vezes).
 */
export const lessonAttempts = pgTable(
  'lesson_attempts',
  {
    id: text('id').primaryKey(),
    enrollmentId: text('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: attemptStatusEnum('status').notNull().default('in_progress'),
    state: jsonb('state').$type<AttemptState>().notNull(),
    revision: integer('revision').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [unique('lesson_attempts_enrollment_lesson_n_uq').on(t.enrollmentId, t.lessonId, t.attemptNumber), index('lesson_attempts_enrollment_idx').on(t.enrollmentId)],
);

/** Eventos relevantes do aluno. `eventId` vem do cliente e garante idempotência. */
export const learnerEvents = pgTable(
  'learner_events',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id').notNull().references(() => lessonAttempts.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    nodeId: text('node_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** resultado devolvido ao cliente; repetido no replay do mesmo eventId */
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    /** revisão da tentativa após aplicar este evento */
    resultingRevision: integer('resulting_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('learner_events_attempt_event_uq').on(t.attemptId, t.eventId), index('learner_events_attempt_idx').on(t.attemptId)],
);

export const objectiveEvidence = pgTable(
  'objective_evidence',
  {
    id: text('id').primaryKey(),
    enrollmentId: text('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
    attemptId: text('attempt_id').notNull().references(() => lessonAttempts.id, { onDelete: 'cascade' }),
    objectiveId: text('objective_id').notNull(),
    nodeId: text('node_id').notNull(),
    kind: text('kind').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('objective_evidence_enrollment_idx').on(t.enrollmentId)],
);
