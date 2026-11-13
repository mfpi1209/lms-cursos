import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  TASK_COMMENT_MAX,
  allLessons,
  checkTaskLink,
  migrateCourseDocument,
  requiredLessonIdsFor,
  taskAcceptedMime,
  taskDeliverableOf,
  taskInstructionOf,
  type CourseDocument,
  type Lesson,
  type TaskDeliverable,
  type TaskNode,
  type TaskStatus,
} from '@lms/course-schema';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import type { TaskCriterionResult } from '../schema/learning';

/*
 * Entregas de tarefa (nó `task`, "Missão com entrega").
 *
 * - O aluno envia DENTRO da aula (intenção `submit`, gravada na mesma transação do evento: `recordTaskFromLesson`) e
 *   reenvia FORA dela quando a entrega é devolvida (`resubmitTask`).
 * - Um avaliador da equipe aprova ou devolve com comentário (`reviewSubmission`). Com correção automática, a entrega é
 *   aprovada ao enviar.
 * - Nada aqui bloqueia a aula nem a conclusão do curso. `taskRequirementsMet` diz se as tarefas obrigatórias estão
 *   aprovadas: é a parte desta regra que o certificado por curso vai ler.
 */

export type TaskSubmission = typeof s.taskSubmissions.$inferSelect;
export type TaskSubmissionEvent = typeof s.taskSubmissionEvents.$inferSelect;

/** Limite de envios de arquivo por matrícula (janela deslizante): contado no banco, vale para todos os processos. */
export const TASK_UPLOAD_LIMITS = { perHour: 10, perDay: 30 } as const;

/** Tarefas (nós `task`) de um documento, na ordem do curso. */
export function tasksOf(document: CourseDocument): Array<{ lesson: Lesson; lessonIndex: number; node: TaskNode }> {
  const out: Array<{ lesson: Lesson; lessonIndex: number; node: TaskNode }> = [];
  allLessons(document).forEach((lesson, lessonIndex) => {
    for (const node of lesson.graph.nodes) if (node.type === 'task') out.push({ lesson, lessonIndex, node });
  });
  return out;
}

export function findTask(document: CourseDocument, nodeId: string) {
  return tasksOf(document).find((t) => t.node.id === nodeId) ?? null;
}

async function enrollmentContext(db: DbOrTx, enrollmentId: string) {
  const [row] = await db
    .select({ enrollment: s.enrollments, version: s.courseVersions, course: s.courses })
    .from(s.enrollments)
    .innerJoin(s.courseVersions, eq(s.courseVersions.id, s.enrollments.courseVersionId))
    .innerJoin(s.courses, eq(s.courses.id, s.enrollments.courseId))
    .where(eq(s.enrollments.id, enrollmentId))
    .limit(1);
  if (!row) return null;
  return { ...row, document: migrateCourseDocument(row.version.document) };
}

/* ------------------------------------------------------------------------ */
/* Arquivo da entrega                                                        */
/* ------------------------------------------------------------------------ */

/**
 * O arquivo é de uma entrega E foi enviado por este usuário? É a regra de leitura do ALUNO para assets `document`
 * (a equipe do workspace lê por outra regra). Um aluno nunca lê o arquivo de outro: vale quem enviou (`createdBy`),
 * e só para arquivos enviados pela rota de entrega (`metadata.taskUpload`).
 */
export function isOwnTaskFile(asset: { kind: string; createdBy: string | null; metadata: s.AssetMetadata | null }, userId: string): boolean {
  return asset.kind === 'document' && !!asset.metadata?.taskUpload && !!asset.createdBy && asset.createdBy === userId;
}

export async function taskFileReadableBy(db: DbOrTx, input: { assetId: string; userId: string }): Promise<boolean> {
  const [asset] = await db.select({ kind: s.assets.kind, createdBy: s.assets.createdBy, metadata: s.assets.metadata }).from(s.assets).where(eq(s.assets.id, input.assetId)).limit(1);
  return !!asset && isOwnTaskFile(asset, input.userId);
}

/** Quantos arquivos de entrega esta matrícula enviou desde `since` (limite de envios). */
export async function countTaskUploads(db: DbOrTx, input: { userId: string; enrollmentId: string; since: Date }): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.assets)
    .where(and(eq(s.assets.createdBy, input.userId), sql`${s.assets.metadata} ? 'taskUpload'`, sql`${s.assets.metadata}->'taskUpload'->>'enrollmentId' = ${input.enrollmentId}`, gte(s.assets.createdAt, input.since)));
  return row?.n ?? 0;
}

/** Lança `VALIDATION` (com `retryAfterSeconds`) se a matrícula passou do limite de envios de arquivo. */
export async function assertTaskUploadAllowed(db: DbOrTx, input: { userId: string; enrollmentId: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const hour = await countTaskUploads(db, { ...input, since: new Date(now.getTime() - 60 * 60 * 1000) });
  if (hour >= TASK_UPLOAD_LIMITS.perHour) throw new DomainError('RATE_LIMITED', 'Você enviou muitos arquivos em pouco tempo. Espere alguns minutos e tente de novo.', { retryAfterSeconds: 600 });
  const day = await countTaskUploads(db, { ...input, since: new Date(now.getTime() - 24 * 60 * 60 * 1000) });
  if (day >= TASK_UPLOAD_LIMITS.perDay) throw new DomainError('RATE_LIMITED', 'Você chegou ao limite de arquivos enviados hoje. Tente de novo amanhã.', { retryAfterSeconds: 3600 });
}

/**
 * Confere que o arquivo pode entrar NESTA entrega: asset `document` do workspace do curso, enviado por este aluno pela
 * rota de entrega desta matrícula e desta tarefa, de um tipo que a tarefa aceita.
 */
async function assertTaskFile(tx: DbOrTx, input: { assetId: string; userId: string; enrollmentId: string; workspaceId: string; node: TaskNode }) {
  const [asset] = await tx.select().from(s.assets).where(eq(s.assets.id, input.assetId)).limit(1);
  const up = asset?.metadata?.taskUpload;
  if (!asset || asset.workspaceId !== input.workspaceId || !isOwnTaskFile(asset, input.userId) || up?.enrollmentId !== input.enrollmentId || up?.nodeId !== input.node.id)
    throw new DomainError('VALIDATION', 'Arquivo não encontrado. Envie o arquivo de novo.');
  if (!taskAcceptedMime(input.node).includes(asset.mimeType)) throw new DomainError('VALIDATION', 'Este tipo de arquivo não é aceito nesta tarefa.');
  return asset;
}

/* ------------------------------------------------------------------------ */
/* Envio                                                                     */
/* ------------------------------------------------------------------------ */

export interface TaskSubmitInput {
  link?: string | undefined;
  fileAssetId?: string | undefined;
  /** seguir com a entrega que já existe (aula refeita) */
  keep?: boolean | undefined;
}

export interface TaskSubmitContext {
  enrollmentId: string;
  userId: string;
  workspaceId: string;
  courseId: string;
  courseVersionId: string;
  lessonId: string;
  node: TaskNode;
  now?: Date;
}

export type TaskSubmitOutcome = 'created' | 'resubmitted' | 'kept';

function outboxPayload(row: TaskSubmission, extra: Record<string, unknown> = {}) {
  // sem o link, o arquivo nem o comentário: quem consome busca pelo id
  return { submissionId: row.id, enrollmentId: row.enrollmentId, courseId: row.courseId, userId: row.userId, lessonId: row.lessonId, nodeId: row.nodeId, status: row.status, revision: row.revision, ...extra };
}

/**
 * Grava um envio (primeiro envio ou reenvio depois de devolvida), na transação de quem chama.
 *  - sem entrega: cria (`submitted`, ou `approved` com correção automática);
 *  - entrega devolvida: reenvio (versão nova, volta para `submitted`; o comentário anterior fica no histórico);
 *  - entrega em correção ou aprovada: NÃO muda (um envio repetido ou de outra aba não desfaz o que já valia): `kept`;
 *  - `keep`: exige uma entrega em correção ou aprovada.
 * Eventos `task.submitted` (e `task.reviewed`, na aprovação automática) vão para o outbox.
 */
export async function saveTaskSubmission(tx: DbOrTx, ctx: TaskSubmitContext, input: TaskSubmitInput): Promise<{ submission: TaskSubmission; outcome: TaskSubmitOutcome }> {
  const now = ctx.now ?? new Date();
  const [prev] = await tx.select().from(s.taskSubmissions).where(and(eq(s.taskSubmissions.enrollmentId, ctx.enrollmentId), eq(s.taskSubmissions.nodeId, ctx.node.id))).for('update').limit(1);
  if (input.keep) {
    if (!prev) throw new DomainError('VALIDATION', 'Envie a sua entrega para continuar.');
    if (prev.status === 'returned') throw new DomainError('VALIDATION', 'Sua entrega foi devolvida. Envie de novo para continuar.');
    return { submission: prev, outcome: 'kept' };
  }
  if (prev && prev.status !== 'returned') return { submission: prev, outcome: 'kept' };

  const link = checkTaskLink(input.link);
  if (!link.ok) throw new DomainError('VALIDATION', link.message);
  let fileAssetId: string | null = null;
  if (input.fileAssetId) {
    if (taskDeliverableOf(ctx.node) !== 'link_file') throw new DomainError('VALIDATION', 'Esta tarefa recebe só o link.');
    fileAssetId = (await assertTaskFile(tx, { assetId: input.fileAssetId, userId: ctx.userId, enrollmentId: ctx.enrollmentId, workspaceId: ctx.workspaceId, node: ctx.node })).id;
  }
  const auto = ctx.node.review === 'auto';
  const status: TaskStatus = auto ? 'approved' : 'submitted';

  let row: TaskSubmission;
  let revision: number;
  if (!prev) {
    revision = 1;
    [row] = (await tx
      .insert(s.taskSubmissions)
      .values({
        id: newId('tsk'),
        workspaceId: ctx.workspaceId,
        courseId: ctx.courseId,
        enrollmentId: ctx.enrollmentId,
        userId: ctx.userId,
        lessonId: ctx.lessonId,
        nodeId: ctx.node.id,
        courseVersionId: ctx.courseVersionId,
        link: link.link,
        fileAssetId,
        status,
        submittedAt: now,
        reviewedAt: auto ? now : null,
        createdAt: now,
        updatedAt: now,
        revision,
      })
      .returning()) as [TaskSubmission];
  } else {
    revision = prev.revision + 1;
    [row] = (await tx
      .update(s.taskSubmissions)
      .set({ link: link.link, fileAssetId, status, criteriaResults: [], reviewerComment: null, reviewerId: null, submittedAt: now, reviewedAt: auto ? now : null, updatedAt: now, revision, courseVersionId: ctx.courseVersionId, lessonId: ctx.lessonId })
      .where(eq(s.taskSubmissions.id, prev.id))
      .returning()) as [TaskSubmission];
  }
  await tx.insert(s.taskSubmissionEvents).values({ id: newId('tse'), submissionId: row.id, revision, type: prev ? 'resubmitted' : 'submitted', status: 'submitted', link: link.link, fileAssetId, actorId: ctx.userId, createdAt: now });
  await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'task.submitted', version: 1, payload: outboxPayload({ ...row, status: 'submitted' }, { resubmission: !!prev }) });
  if (auto) {
    await tx.insert(s.taskSubmissionEvents).values({ id: newId('tse'), submissionId: row.id, revision, type: 'approved', status: 'approved', actorId: null, createdAt: now });
    await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'task.reviewed', version: 1, payload: outboxPayload(row, { decision: 'approved', auto: true }) });
  }
  return { submission: row, outcome: prev ? 'resubmitted' : 'created' };
}

/**
 * Reenvio FORA da aula (página do curso), depois de a entrega ser devolvida. Exige que o aluno já tenha enviado pela
 * aula e que a entrega esteja `returned`. Não toca a tentativa da aula nem a matrícula.
 */
export async function resubmitTask(db: Database, input: { enrollmentId: string; nodeId: string; link: string; fileAssetId?: string | undefined }): Promise<TaskSubmission> {
  return db.transaction(async (tx) => {
    const enr = await enrollmentContext(tx, input.enrollmentId);
    if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
    const task = findTask(enr.document, input.nodeId);
    if (!task) throw new DomainError('NOT_FOUND', 'Esta tarefa não existe na versão do seu curso');
    const [prev] = await tx.select({ status: s.taskSubmissions.status }).from(s.taskSubmissions).where(and(eq(s.taskSubmissions.enrollmentId, input.enrollmentId), eq(s.taskSubmissions.nodeId, input.nodeId))).limit(1);
    if (!prev) throw new DomainError('CONFLICT', 'Chegue a esta tarefa na aula para enviar a primeira entrega.');
    if (prev.status !== 'returned') throw new DomainError('CONFLICT', prev.status === 'approved' ? 'Esta entrega já foi aprovada.' : 'Esta entrega já está em correção.');
    const { submission } = await saveTaskSubmission(
      tx,
      { enrollmentId: input.enrollmentId, userId: enr.enrollment.userId, workspaceId: enr.course.workspaceId, courseId: enr.course.id, courseVersionId: enr.version.id, lessonId: task.lesson.id, node: task.node },
      { link: input.link, fileAssetId: input.fileAssetId },
    );
    return submission;
  });
}

/* ------------------------------------------------------------------------ */
/* Correção                                                                  */
/* ------------------------------------------------------------------------ */

export interface ReviewInput {
  submissionId: string;
  /** workspace de quem corrige: entrega de outro workspace responde "não encontrada" */
  workspaceId: string;
  reviewerId: string;
  decision: 'approve' | 'return';
  /** um resultado por critério da tarefa */
  criteria: Array<{ id: string; met: boolean }>;
  comment?: string | null | undefined;
  /** a versão da entrega que o avaliador viu (o aluno pode ter reenviado; outro avaliador pode ter corrigido) */
  expectedRevision: number;
}

async function taskOfSubmission(db: DbOrTx, sub: Pick<TaskSubmission, 'courseVersionId' | 'nodeId'>) {
  const [v] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.id, sub.courseVersionId)).limit(1);
  return v ? findTask(migrateCourseDocument(v.document), sub.nodeId) : null;
}

/**
 * Correção por um avaliador da equipe: aprova (todos os critérios atendidos) ou devolve (com comentário; o aluno reenvia).
 * Só entregas em correção (`submitted`). Grava o histórico, a auditoria (`task.review`, sem o texto do comentário) e o
 * evento `task.reviewed` no outbox, tudo na mesma transação.
 */
export async function reviewSubmission(db: Database, input: ReviewInput): Promise<TaskSubmission> {
  return db.transaction(async (tx) => {
    const [prev] = await tx.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.id, input.submissionId)).for('update').limit(1);
    if (!prev || prev.workspaceId !== input.workspaceId) throw new DomainError('NOT_FOUND', 'Entrega não encontrada');
    if (prev.userId === input.reviewerId) throw new DomainError('FORBIDDEN', 'Você não pode corrigir a sua própria entrega.');
    if (prev.revision !== input.expectedRevision) throw new DomainError('CONFLICT', 'Esta entrega mudou depois que você abriu. Recarregue para ver a versão atual.', { currentRevision: prev.revision, status: prev.status });
    if (prev.status !== 'submitted') throw new DomainError('CONFLICT', prev.status === 'approved' ? 'Esta entrega já foi aprovada.' : 'Esta entrega já foi devolvida. Ela volta para a fila quando o aluno reenviar.', { status: prev.status });
    const task = await taskOfSubmission(tx, prev);
    if (!task) throw new DomainError('NOT_FOUND', 'A tarefa desta entrega não existe mais na versão do curso');

    const given = new Map(input.criteria.map((c) => [c.id, c.met]));
    const results: TaskCriterionResult[] = [];
    for (const c of task.node.criteria) {
      const met = given.get(c.id);
      if (typeof met !== 'boolean') throw new DomainError('VALIDATION', `Marque sim ou não em cada critério (falta "${c.label}").`);
      results.push({ id: c.id, label: c.label, met });
    }
    const comment = (input.comment ?? '').trim();
    if (comment.length > TASK_COMMENT_MAX) throw new DomainError('VALIDATION', `O comentário precisa ter até ${TASK_COMMENT_MAX} caracteres.`);
    if (input.decision === 'approve' && results.some((r) => !r.met)) throw new DomainError('VALIDATION', 'Para aprovar, todos os critérios precisam estar atendidos. Se algum não foi, devolva com um comentário.');
    if (input.decision === 'return' && comment.length < 3) throw new DomainError('VALIDATION', 'Para devolver, escreva um comentário dizendo o que ajustar.');

    const now = new Date();
    const status: TaskStatus = input.decision === 'approve' ? 'approved' : 'returned';
    const revision = prev.revision + 1;
    const [row] = (await tx
      .update(s.taskSubmissions)
      .set({ status, criteriaResults: results, reviewerComment: comment || null, reviewerId: input.reviewerId, reviewedAt: now, updatedAt: now, revision })
      .where(eq(s.taskSubmissions.id, prev.id))
      .returning()) as [TaskSubmission];
    await tx.insert(s.taskSubmissionEvents).values({ id: newId('tse'), submissionId: prev.id, revision, type: status === 'approved' ? 'approved' : 'returned', status, link: prev.link, fileAssetId: prev.fileAssetId, criteriaResults: results, comment: comment || null, actorId: input.reviewerId, createdAt: now });
    await tx.insert(s.auditLogs).values({
      id: newId('aud'),
      workspaceId: prev.workspaceId,
      actorId: input.reviewerId,
      action: 'task.review',
      entityType: 'task_submission',
      entityId: prev.id,
      // sem o texto do comentário nem o link: a auditoria guarda quem decidiu o quê
      data: { decision: status, userId: prev.userId, enrollmentId: prev.enrollmentId, courseId: prev.courseId, lessonId: prev.lessonId, nodeId: prev.nodeId, revision, criteriaMet: results.filter((r) => r.met).length, criteriaTotal: results.length, hasComment: !!comment },
    });
    await tx.insert(s.outboxEvents).values({ id: newId('obx'), type: 'task.reviewed', version: 1, payload: outboxPayload(row, { decision: status, auto: false, reviewerId: input.reviewerId }) });
    return row;
  });
}

/** Registra na auditoria que alguém da equipe abriu uma entrega (dado pessoal do aluno). */
export async function auditSubmissionView(db: DbOrTx, input: { submission: Pick<TaskSubmission, 'id' | 'workspaceId' | 'userId' | 'enrollmentId' | 'nodeId'>; actorId: string }) {
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.submission.workspaceId, actorId: input.actorId, action: 'task.view', entityType: 'task_submission', entityId: input.submission.id, data: { userId: input.submission.userId, enrollmentId: input.submission.enrollmentId, nodeId: input.submission.nodeId } });
}

/* ------------------------------------------------------------------------ */
/* Fila de correção (equipe)                                                 */
/* ------------------------------------------------------------------------ */

export interface SubmissionListItem {
  id: string;
  status: TaskStatus;
  revision: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  nodeId: string;
  taskTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  hasFile: boolean;
  reviewerName: string | null;
}

/**
 * Entregas do workspace (ou de um curso). Em correção: as mais antigas primeiro (fila); as outras: as corrigidas há menos
 * tempo primeiro. O título da tarefa vem da versão do curso em que a entrega foi feita.
 */
export async function listSubmissions(db: DbOrTx, input: { workspaceId: string; courseId?: string | undefined; status?: TaskStatus | undefined; limit?: number }): Promise<SubmissionListItem[]> {
  const status = input.status ?? 'submitted';
  const where = and(eq(s.taskSubmissions.workspaceId, input.workspaceId), eq(s.taskSubmissions.status, status), ...(input.courseId ? [eq(s.taskSubmissions.courseId, input.courseId)] : []));
  const rows = await db
    .select({ sub: s.taskSubmissions, courseTitle: s.courses.title, studentName: s.user.name, studentEmail: s.user.email })
    .from(s.taskSubmissions)
    .innerJoin(s.courses, eq(s.courses.id, s.taskSubmissions.courseId))
    .innerJoin(s.user, eq(s.user.id, s.taskSubmissions.userId))
    .where(where)
    .orderBy(status === 'submitted' ? asc(s.taskSubmissions.submittedAt) : desc(s.taskSubmissions.reviewedAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 300));
  const versionIds = [...new Set(rows.map((r) => r.sub.courseVersionId))];
  const versions = versionIds.length ? await db.select({ id: s.courseVersions.id, document: s.courseVersions.document }).from(s.courseVersions).where(inArray(s.courseVersions.id, versionIds)) : [];
  const titles = new Map<string, string>();
  for (const v of versions) for (const t of tasksOf(migrateCourseDocument(v.document))) titles.set(`${v.id}:${t.node.id}`, t.node.title?.trim() || 'Tarefa');
  const reviewerIds = [...new Set(rows.map((r) => r.sub.reviewerId).filter((x): x is string => !!x))];
  const reviewers = reviewerIds.length ? await db.select({ id: s.user.id, name: s.user.name }).from(s.user).where(inArray(s.user.id, reviewerIds)) : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));
  return rows.map(({ sub, courseTitle, studentName, studentEmail }) => ({
    id: sub.id,
    status: sub.status,
    revision: sub.revision,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    courseId: sub.courseId,
    courseTitle,
    lessonId: sub.lessonId,
    nodeId: sub.nodeId,
    taskTitle: titles.get(`${sub.courseVersionId}:${sub.nodeId}`) ?? 'Tarefa',
    studentId: sub.userId,
    studentName,
    studentEmail,
    hasFile: !!sub.fileAssetId,
    reviewerName: sub.reviewerId ? (reviewerName.get(sub.reviewerId) ?? null) : null,
  }));
}

/** Quantas entregas esperam correção, por curso (e o total do workspace). */
export async function pendingSubmissionCounts(db: DbOrTx, workspaceId: string): Promise<{ total: number; byCourse: Record<string, number> }> {
  const rows = await db
    .select({ courseId: s.taskSubmissions.courseId, n: sql<number>`count(*)::int` })
    .from(s.taskSubmissions)
    .where(and(eq(s.taskSubmissions.workspaceId, workspaceId), eq(s.taskSubmissions.status, 'submitted')))
    .groupBy(s.taskSubmissions.courseId);
  const byCourse = Object.fromEntries(rows.map((r) => [r.courseId, r.n]));
  return { total: rows.reduce((a, r) => a + r.n, 0), byCourse };
}

export interface TaskFileInfo {
  assetId: string;
  name: string | null;
  mimeType: string;
  sizeBytes: number;
}

async function fileInfo(db: DbOrTx, assetId: string | null): Promise<TaskFileInfo | null> {
  if (!assetId) return null;
  const [a] = await db.select({ id: s.assets.id, name: s.assets.originalName, mimeType: s.assets.mimeType, sizeBytes: s.assets.sizeBytes }).from(s.assets).where(eq(s.assets.id, assetId)).limit(1);
  return a ? { assetId: a.id, name: a.name, mimeType: a.mimeType, sizeBytes: a.sizeBytes } : null;
}

/** Uma entrega para a tela de correção: a tarefa (instrução e critérios), o aluno, o arquivo e o histórico. Só do workspace informado. */
export async function getSubmissionForReview(db: DbOrTx, input: { submissionId: string; workspaceId: string }) {
  const [row] = await db
    .select({ sub: s.taskSubmissions, courseTitle: s.courses.title, studentName: s.user.name, studentEmail: s.user.email })
    .from(s.taskSubmissions)
    .innerJoin(s.courses, eq(s.courses.id, s.taskSubmissions.courseId))
    .innerJoin(s.user, eq(s.user.id, s.taskSubmissions.userId))
    .where(and(eq(s.taskSubmissions.id, input.submissionId), eq(s.taskSubmissions.workspaceId, input.workspaceId)))
    .limit(1);
  if (!row) return null;
  const task = await taskOfSubmission(db, row.sub);
  const events = await db.select().from(s.taskSubmissionEvents).where(eq(s.taskSubmissionEvents.submissionId, row.sub.id)).orderBy(asc(s.taskSubmissionEvents.createdAt), asc(s.taskSubmissionEvents.revision));
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await db.select({ id: s.user.id, name: s.user.name }).from(s.user).where(inArray(s.user.id, actorIds)) : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));
  return {
    submission: row.sub,
    course: { id: row.sub.courseId, title: row.courseTitle },
    student: { id: row.sub.userId, name: row.studentName, email: row.studentEmail },
    task: task
      ? { nodeId: task.node.id, title: task.node.title?.trim() || 'Tarefa', lessonTitle: task.lesson.title, instruction: taskInstructionOf(task.node), criteria: task.node.criteria, review: task.node.review, deliverable: taskDeliverableOf(task.node) }
      : null,
    file: await fileInfo(db, row.sub.fileAssetId),
    events: events.map((e) => ({ id: e.id, type: e.type, status: e.status, revision: e.revision, comment: e.comment, link: e.link, at: e.createdAt, actorName: e.actorId ? (actorName.get(e.actorId) ?? null) : null, byStudent: e.actorId === row.sub.userId })),
  };
}

/* ------------------------------------------------------------------------ */
/* Visão do aluno                                                            */
/* ------------------------------------------------------------------------ */

export interface TaskRecord {
  nodeId: string;
  lessonId: string;
  status: TaskStatus;
  link: string;
  file: TaskFileInfo | null;
  /** comentário do avaliador (na devolução; opcional na aprovação) */
  comment: string | null;
  criteria: TaskCriterionResult[];
  revision: number;
  submittedAt: string;
  reviewedAt: string | null;
}

async function toRecord(db: DbOrTx, r: TaskSubmission): Promise<TaskRecord> {
  return { nodeId: r.nodeId, lessonId: r.lessonId, status: r.status, link: r.link, file: await fileInfo(db, r.fileAssetId), comment: r.reviewerComment, criteria: r.criteriaResults, revision: r.revision, submittedAt: r.submittedAt.toISOString(), reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null };
}

export async function taskRecordOf(db: DbOrTx, row: TaskSubmission): Promise<TaskRecord> {
  return toRecord(db, row);
}

/** Entregas da matrícula por tarefa, só das tarefas que existem na versão fixada. */
export async function taskRecords(db: DbOrTx, input: { enrollmentId: string }): Promise<Record<string, TaskRecord>> {
  const enr = await enrollmentContext(db, input.enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const alive = new Set(tasksOf(enr.document).map((t) => t.node.id));
  const rows = await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, input.enrollmentId));
  const out: Record<string, TaskRecord> = {};
  for (const r of rows) if (alive.has(r.nodeId)) out[r.nodeId] = await toRecord(db, r);
  return out;
}

export interface LearnerTask {
  nodeId: string;
  lessonId: string;
  lessonTitle: string;
  lessonIndex: number;
  title: string;
  instruction: string;
  deliverable: TaskDeliverable;
  acceptedMime: string[];
  criteria: Array<{ id: string; label: string }>;
  required: boolean;
  review: 'manual' | 'auto';
  record: TaskRecord | null;
}

/** Tarefas do curso para o aluno (na ordem do curso), com a entrega de cada uma, se houver. */
export async function learnerTasks(db: DbOrTx, input: { enrollmentId: string }): Promise<LearnerTask[]> {
  const enr = await enrollmentContext(db, input.enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const records = await taskRecords(db, input);
  return tasksOf(enr.document).map(({ lesson, lessonIndex, node }) => ({
    nodeId: node.id,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonIndex,
    title: node.title?.trim() || 'Tarefa',
    instruction: taskInstructionOf(node),
    deliverable: taskDeliverableOf(node),
    acceptedMime: taskAcceptedMime(node),
    criteria: node.criteria,
    required: node.required,
    review: node.review,
    record: records[node.id] ?? null,
  }));
}

/* ------------------------------------------------------------------------ */
/* Regra para o certificado                                                  */
/* ------------------------------------------------------------------------ */

export interface TaskRequirement {
  nodeId: string;
  lessonId: string;
  title: string;
  /** `missing` = ainda não enviou */
  status: TaskStatus | 'missing';
  approved: boolean;
}

export interface TaskRequirements {
  /** todas as tarefas obrigatórias desta matrícula estão aprovadas (verdadeiro também quando não há nenhuma) */
  met: boolean;
  required: TaskRequirement[];
  /** as obrigatórias que ainda não estão aprovadas */
  pending: TaskRequirement[];
}

/**
 * As tarefas OBRIGATÓRIAS desta matrícula estão aprovadas? É a parte de tarefas da regra do certificado por curso
 * (a conclusão do curso NÃO depende disto).
 *
 * Contam as tarefas com `required` das aulas obrigatórias da matrícula (`requiredLessonIdsFor`: as aulas acrescentadas
 * depois da conclusão ficam de fora). Numa aula com caminhos diferentes, uma tarefa que ficou FORA do caminho da última
 * tentativa concluída (e que o aluno nunca enviou) não é cobrada; enquanto a aula não foi concluída, todas contam.
 */
export async function taskRequirementsMet(db: DbOrTx, input: { enrollmentId: string }): Promise<TaskRequirements> {
  const enr = await enrollmentContext(db, input.enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const requiredLessons = new Set(requiredLessonIdsFor(enr.document, enr.enrollment.optionalLessonIds));
  const candidates = tasksOf(enr.document).filter((t) => t.node.required && requiredLessons.has(t.lesson.id));
  if (!candidates.length) return { met: true, required: [], pending: [] };
  const rows = await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, input.enrollmentId));
  const byNode = new Map(rows.map((r) => [r.nodeId, r]));
  const attempts = await db
    .select({ lessonId: s.lessonAttempts.lessonId, state: s.lessonAttempts.state })
    .from(s.lessonAttempts)
    .where(and(eq(s.lessonAttempts.enrollmentId, input.enrollmentId), eq(s.lessonAttempts.status, 'completed')))
    .orderBy(desc(s.lessonAttempts.completedAt), desc(s.lessonAttempts.attemptNumber));
  const lastPath = new Map<string, Set<string>>();
  for (const a of attempts) if (!lastPath.has(a.lessonId)) lastPath.set(a.lessonId, new Set(a.state.path.map((p) => p.nodeId)));
  const required: TaskRequirement[] = [];
  for (const t of candidates) {
    const row = byNode.get(t.node.id);
    const path = lastPath.get(t.lesson.id);
    if (!row && path && !path.has(t.node.id)) continue; // fora do caminho que o aluno fez
    const status = row?.status ?? 'missing';
    required.push({ nodeId: t.node.id, lessonId: t.lesson.id, title: t.node.title?.trim() || 'Tarefa', status, approved: status === 'approved' });
  }
  const pending = required.filter((r) => !r.approved);
  return { met: pending.length === 0, required, pending };
}
