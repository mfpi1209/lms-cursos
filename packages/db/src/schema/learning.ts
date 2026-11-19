import { pgTable, text, timestamp, integer, jsonb, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import type { AttemptState } from '@lms/course-engine';
import { user } from './auth';
import { courses, courseVersions } from './authoring';
import { workspaces } from './identity';
import { assets } from './media';

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
    /**
     * Aulas acrescentadas DEPOIS de a pessoa concluir o curso (`publicar-e-matricular`, regra `onlyAppendedLessons`):
     * conteúdo novo disponível, NÃO obrigatório para esta matrícula. A conclusão, a data e o selo continuam valendo;
     * a aula toca e conclui normalmente, sem reabrir o curso. Vazio para quem estava em andamento (aula nova é obrigatória).
     */
    optionalLessonIds: jsonb('optional_lesson_ids').$type<string[]>().notNull().default([]),
    /** número da versão em que o curso foi concluído (a declaração de conclusão cita esta, não a versão atual da matrícula) */
    completedVersionNumber: integer('completed_version_number'),
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

export const missionStatusEnum = pgEnum('mission_status', ['later', 'done']);

/**
 * Missão "Leve para a vida real" (nó `mission`): o registro do aluno na matrícula, SEPARADO da tentativa da aula para
 * poder ser mudado depois (marcar "Já experimentei", contar "O que você percebeu?") sem reabrir a aula. Nunca bloqueia
 * a aula, o curso nem o selo. Um por matrícula e missão; `revision` dá concorrência otimista (duas abas) e cada versão
 * fica em `mission_response_events`. Pertence ao aluno da matrícula (`userId`): as consultas sempre passam pela matrícula.
 */
export const missionResponses = pgTable(
  'mission_responses',
  {
    id: text('id').primaryKey(),
    enrollmentId: text('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    nodeId: text('node_id').notNull(),
    status: missionStatusEnum('status').notNull(),
    /** "O que você percebeu?" (até 500 caracteres); só com `done` */
    note: text('note'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  (t) => [unique('mission_responses_enrollment_node_uq').on(t.enrollmentId, t.nodeId), index('mission_responses_user_idx').on(t.userId)],
);

/** Histórico (só inclusão) de cada versão de uma missão. */
export const missionResponseEvents = pgTable(
  'mission_response_events',
  {
    id: text('id').primaryKey(),
    responseId: text('response_id').notNull().references(() => missionResponses.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    status: missionStatusEnum('status').notNull(),
    note: text('note'),
    /** de onde veio a mudança: a aula (player) ou a página do curso / "Meu roteiro" */
    source: text('source').notNull().default('lesson'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mission_response_events_response_idx').on(t.responseId)],
);

export const taskSubmissionStatusEnum = pgEnum('task_submission_status', ['submitted', 'approved', 'returned']);

/** Resultado de um critério na correção: o rótulo fica gravado como estava quando o avaliador conferiu. */
export interface TaskCriterionResult {
  id: string;
  label: string;
  met: boolean;
}

export type TaskSubmissionEventType = 'submitted' | 'resubmitted' | 'approved' | 'returned';

/**
 * Entrega de uma tarefa (nó `task`): uma por matrícula e tarefa, SEPARADA da tentativa da aula, porque a correção acontece
 * depois (e o aluno reenvia quando a entrega é devolvida). Nunca bloqueia a aula nem a conclusão do curso; só alimenta a
 * regra do certificado (`submissions.taskRequirementsMet`).
 *
 * Dados pessoais: `link` e `fileAssetId` (o que o aluno enviou) e `reviewerComment` (o que o avaliador escreveu). Apagar a
 * conta do aluno apaga a entrega e o histórico (cascata); o arquivo é apagado junto (ver `privacy.eraseUser`).
 * `workspaceId` e `courseId` ficam na linha para a fila de correção não depender de junções.
 */
export const taskSubmissions = pgTable(
  'task_submissions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    courseId: text('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    enrollmentId: text('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    nodeId: text('node_id').notNull(),
    /** versão do curso em que a entrega (ou o último reenvio) foi feita */
    courseVersionId: text('course_version_id').notNull().references(() => courseVersions.id),
    /** endereço https enviado pelo aluno (até 2.000 caracteres) */
    link: text('link').notNull(),
    /** arquivo enviado (asset `document`), quando a tarefa aceita arquivo */
    fileAssetId: text('file_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    status: taskSubmissionStatusEnum('status').notNull().default('submitted'),
    /** critérios conferidos na última correção (vazio enquanto ninguém corrigiu) */
    criteriaResults: jsonb('criteria_results').$type<TaskCriterionResult[]>().notNull().default([]),
    reviewerComment: text('reviewer_comment'),
    /** quem corrigiu; `null` na aprovação automática ou se a conta do avaliador foi apagada */
    reviewerId: text('reviewer_id').references(() => user.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** concorrência otimista: o avaliador corrige a versão que viu; o reenvio do aluno cria outra */
    revision: integer('revision').notNull().default(1),
  },
  (t) => [
    unique('task_submissions_enrollment_node_uq').on(t.enrollmentId, t.nodeId),
    // fila de correção: do workspace inteiro e por curso, as mais antigas primeiro
    index('task_submissions_queue_idx').on(t.workspaceId, t.status, t.submittedAt),
    index('task_submissions_course_queue_idx').on(t.courseId, t.status, t.submittedAt),
    index('task_submissions_user_idx').on(t.userId),
    index('task_submissions_file_idx').on(t.fileAssetId),
  ],
);

/** Histórico (só inclusão) de cada envio e de cada correção de uma entrega. */
export const taskSubmissionEvents = pgTable(
  'task_submission_events',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id').notNull().references(() => taskSubmissions.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    type: text('type').$type<TaskSubmissionEventType>().notNull(),
    status: taskSubmissionStatusEnum('status').notNull(),
    /** o que valia nesta versão (o link e o arquivo de cada envio ficam no histórico) */
    link: text('link'),
    fileAssetId: text('file_asset_id'),
    criteriaResults: jsonb('criteria_results').$type<TaskCriterionResult[]>(),
    comment: text('comment'),
    /** quem fez: o aluno (envio) ou o avaliador (correção); `null` na aprovação automática. Sem chave estrangeira: é histórico. */
    actorId: text('actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_submission_events_submission_idx').on(t.submissionId)],
);
