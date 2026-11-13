import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import type { Intent } from '@lms/course-engine';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, startOrResumeAttempt } from '../src/repositories/learning';
import { createAsset } from '../src/repositories/media';
import { collectUserData, eraseUser } from '../src/repositories/privacy';
import {
  TASK_UPLOAD_LIMITS,
  assertTaskUploadAllowed,
  getSubmissionForReview,
  learnerTasks,
  listSubmissions,
  pendingSubmissionCounts,
  resubmitTask,
  reviewSubmission,
  taskFileReadableBy,
  taskRecords,
  taskRequirementsMet,
} from '../src/repositories/submissions';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let reviewerId: string;
let courseId: string;
let seq = 0;

const LINK = 'https://exemplo.com/video';
const criteria = [
  { id: 'c1', label: 'Fala o nome e o curso' },
  { id: 'c2', label: 'Tem até 1 minuto' },
];
const text = (t: string) => richTextFromPlain(t);

/**
 * Aula 1: conteúdo → tarefa manual (link e arquivo, obrigatória) → fim.
 * Aula 2: conteúdo → tarefa automática (só link, obrigatória) → tarefa opcional (manual) → fim.
 */
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso com tarefa',
  modules: [
    {
      id: 'm1',
      title: 'Módulo',
      lessons: [
        {
          id: 'aula_1',
          title: 'Aula 1',
          graph: {
            schemaVersion: 1,
            startNodeId: 'n1',
            nodes: [
              { id: 'n1', type: 'content', body: text('Conteúdo') },
              { id: 't_manual', type: 'task', title: 'Missão final', instruction: 'Grave e envie o link.', deliverable: 'link_file', criteria },
              { id: 'fim1', type: 'end', summary: text('Fim') },
            ],
            edges: [
              { id: 'e1', from: 'n1', to: 't_manual' },
              { id: 'e2', from: 't_manual', to: 'fim1' },
            ],
          },
        },
        {
          id: 'aula_2',
          title: 'Aula 2',
          graph: {
            schemaVersion: 1,
            startNodeId: 'n2',
            nodes: [
              { id: 'n2', type: 'content', body: text('Conteúdo') },
              { id: 't_auto', type: 'task', title: 'Link do perfil', instruction: 'Cole o link do perfil.', deliverable: 'link', review: 'auto', criteria: [{ id: 'c1', label: 'O perfil abre' }] },
              { id: 't_opcional', type: 'task', title: 'Extra', instruction: 'Se quiser, envie mais um link.', deliverable: 'link', required: false, criteria: [{ id: 'c1', label: 'Abre' }] },
              { id: 'fim2', type: 'end', summary: text('Fim') },
            ],
            edges: [
              { id: 'e1', from: 'n2', to: 't_auto' },
              { id: 'e2', from: 't_auto', to: 't_opcional' },
              { id: 'e3', from: 't_opcional', to: 'fim2' },
            ],
          },
        },
      ],
    },
  ],
});

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  reviewerId = seeded.users['revisor@demo.local']!;
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title: 'Curso com tarefa', createdBy: authorId, document: doc });
  courseId = course.id;
  const draft = (await getDraft(db, courseId))!;
  await publishCourse(db, { courseId, userId: authorId, expectedRevision: draft.revision });
});
afterAll(async () => {
  await close();
});

/** aluno descartável, matriculado no curso */
async function newLearner(prefix = 'tarefa-teste') {
  const id = newId('usr');
  const n = ++seq;
  await db.insert(s.user).values({ id, email: `${prefix}-${n}-${id.slice(-6)}@demo.local`, name: `Aluno Tarefa ${n}`, emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student' });
  const { enrollment } = await enrollStudent(db, { courseId, userId: id, createdBy: authorId });
  return { userId: id, enrollmentId: enrollment.id };
}

async function uploadFor(l: { userId: string; enrollmentId: string }, nodeId = 't_manual', mimeType = 'application/pdf', at?: Date) {
  const id = newId('k');
  const [row] = await db
    .insert(s.assets)
    .values({ id: newId('ast'), workspaceId: seeded.workspaceId, kind: 'document', source: 'upload', mimeType, sizeBytes: 1234, storageProvider: 'local', storageKey: `${seeded.workspaceId}/entregas/${l.enrollmentId}/${id}.pdf`, originalName: 'roteiro.pdf', sha256: id, createdBy: l.userId, metadata: { taskUpload: { enrollmentId: l.enrollmentId, nodeId } }, ...(at ? { createdAt: at } : {}) })
    .returning();
  return row!;
}

/** abre a aula e anda até a tarefa; devolve o envio de eventos */
async function atTask(enrollmentId: string, lessonId = 'aula_1', forceNew = false) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId, ...(forceNew ? { forceNew: true } : {}) });
  let revision = attempt.revision;
  let nodeId = attempt.state.currentNodeId;
  const send = async (intent: Intent) => {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: newId('ev'), nodeId, expectedRevision: revision, intent });
    revision = r.revision;
    nodeId = r.toNodeId;
    return r;
  };
  await send({ kind: 'advance' });
  return { attemptId: attempt.id, send, pos: () => ({ nodeId, revision }) };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return 'OK';
};
const allMet = criteria.map((c) => ({ id: c.id, met: true }));
const subOf = async (enrollmentId: string, nodeId = 't_manual') => (await db.select().from(s.taskSubmissions).where(and(eq(s.taskSubmissions.enrollmentId, enrollmentId), eq(s.taskSubmissions.nodeId, nodeId))))[0]!;

describe('entrega dentro da aula', () => {
  it('envio com link e arquivo cria a entrega em correção, conclui a aula e grava histórico e outbox', async () => {
    const l = await newLearner();
    const file = await uploadFor(l);
    const t = await atTask(l.enrollmentId);
    const r = await t.send({ kind: 'submit', link: ` ${LINK} `, fileAssetId: file.id });
    expect(r.lessonCompleted).toBe(true);
    expect(r.courseCompleted).toBe(false);
    expect(r.task).toMatchObject({ outcome: 'created', record: { nodeId: 't_manual', status: 'submitted', link: LINK, file: { assetId: file.id, name: 'roteiro.pdf', mimeType: 'application/pdf' }, revision: 1, comment: null } });
    const sub = await subOf(l.enrollmentId);
    expect(sub).toMatchObject({ workspaceId: seeded.workspaceId, courseId, userId: l.userId, lessonId: 'aula_1', link: LINK, fileAssetId: file.id, status: 'submitted', reviewerId: null, reviewedAt: null, criteriaResults: [], revision: 1 });
    const events = await db.select().from(s.taskSubmissionEvents).where(eq(s.taskSubmissionEvents.submissionId, sub.id));
    expect(events.map((e) => [e.type, e.revision, e.actorId])).toEqual([['submitted', 1, l.userId]]);
    const outbox = (await db.select().from(s.outboxEvents)).filter((o) => o.payload.submissionId === sub.id);
    expect(outbox.map((o) => o.type)).toEqual(['task.submitted']);
    expect(JSON.stringify(outbox)).not.toContain(LINK);
    // o evento e o estado da aula não guardam o link nem o arquivo
    const learnerEvents = await db.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, t.attemptId));
    const [attempt] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, t.attemptId));
    expect(JSON.stringify(learnerEvents)).not.toContain(LINK);
    expect(JSON.stringify(learnerEvents)).not.toContain(file.id);
    expect(JSON.stringify(attempt!.state)).not.toContain(LINK);
    expect(learnerEvents.find((e) => e.type === 'submit')?.payload).toEqual({ kind: 'submit', hasFile: true });
  });

  it('o mesmo eventId devolve o mesmo resultado sem criar outra entrega', async () => {
    const l = await newLearner();
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: l.enrollmentId, lessonId: 'aula_1' });
    const a = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: 'ev-avanca-1', nodeId: 'n1', expectedRevision: attempt.revision, intent: { kind: 'advance' } });
    const input = { attemptId: attempt.id, eventId: 'ev-envia-1', nodeId: 't_manual', expectedRevision: a.revision, intent: { kind: 'submit', link: LINK } as Intent };
    const first = await applyLearnerEvent(db, input);
    const again = await applyLearnerEvent(db, input);
    expect(again.replayed).toBe(true);
    expect(again.revision).toBe(first.revision);
    expect(await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, l.enrollmentId))).toHaveLength(1);
  });

  it('recusa envio sem link, link sem https e arquivo em tarefa só de link, sem gravar nada e sem sair da tarefa', async () => {
    const l = await newLearner();
    const t = await atTask(l.enrollmentId);
    expect(await code(t.send({ kind: 'submit' }))).toBe('ENGINE');
    expect(await code(t.send({ kind: 'submit', link: 'http://exemplo.com/v' }))).toBe('ENGINE');
    expect(await code(t.send({ kind: 'advance' }))).toBe('ENGINE');
    expect(await code(t.send({ kind: 'submit', keep: true }))).toBe('VALIDATION');
    expect(t.pos().nodeId).toBe('t_manual');
    expect(await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, l.enrollmentId))).toHaveLength(0);
    const t2 = await atTask(l.enrollmentId, 'aula_2');
    const file = await uploadFor(l, 't_auto');
    expect(await code(t2.send({ kind: 'submit', link: LINK, fileAssetId: file.id }))).toBe('ENGINE');
    expect(await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, l.enrollmentId))).toHaveLength(0);
  });

  it('recusa arquivo de outro aluno, de outra tarefa, de tipo não aceito e arquivo que não é de entrega', async () => {
    const a = await newLearner();
    const b = await newLearner();
    const t = await atTask(a.enrollmentId);
    const fromB = await uploadFor(b);
    const otherTask = await uploadFor(a, 't_outra');
    const wrongType = await uploadFor(a, 't_manual', 'video/mp4');
    const staffDoc = await createAsset(db, { workspaceId: seeded.workspaceId, kind: 'document', mimeType: 'application/pdf', sizeBytes: 10, storageProvider: 'local', storageKey: 'x/fonte.pdf', sha256: 'abc', createdBy: authorId });
    for (const id of [fromB.id, otherTask.id, wrongType.id, staffDoc.id, 'ast_naoexiste']) expect(await code(t.send({ kind: 'submit', link: LINK, fileAssetId: id })), id).toBe('VALIDATION');
    expect(t.pos().nodeId).toBe('t_manual');
    expect(await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, a.enrollmentId))).toHaveLength(0);
    // a tentativa não avançou (a transação inteira foi desfeita)
    const [attempt] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, t.attemptId));
    expect(attempt!.state.currentNodeId).toBe('t_manual');
  });

  it('correção automática aprova ao enviar, com dois eventos no outbox', async () => {
    const l = await newLearner();
    const t = await atTask(l.enrollmentId, 'aula_2');
    const r = await t.send({ kind: 'submit', link: LINK });
    expect(r.toNodeId).toBe('t_opcional');
    expect(r.task).toMatchObject({ outcome: 'created', record: { status: 'approved' } });
    const sub = await subOf(l.enrollmentId, 't_auto');
    expect(sub).toMatchObject({ status: 'approved', reviewerId: null, revision: 1 });
    expect(sub.reviewedAt).toBeInstanceOf(Date);
    const events = await db.select().from(s.taskSubmissionEvents).where(eq(s.taskSubmissionEvents.submissionId, sub.id));
    expect(events.map((e) => [e.type, e.actorId]).sort()).toEqual([['approved', null], ['submitted', l.userId]]);
    const outbox = (await db.select().from(s.outboxEvents)).filter((o) => o.payload.submissionId === sub.id);
    expect(outbox.map((o) => o.type).sort()).toEqual(['task.reviewed', 'task.submitted']);
    expect(outbox.find((o) => o.type === 'task.reviewed')!.payload).toMatchObject({ decision: 'approved', auto: true });
    // aprovada automaticamente não entra na fila nem pode ser corrigida
    expect((await listSubmissions(db, { workspaceId: seeded.workspaceId })).some((x) => x.id === sub.id)).toBe(false);
    expect(await code(reviewSubmission(db, { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId, decision: 'return', criteria: [{ id: 'c1', met: false }], comment: 'Refaça', expectedRevision: 1 }))).toBe('CONFLICT');
  });

  it('aula refeita: com entrega em correção, "seguir com a entrega" avança e um envio novo não a substitui', async () => {
    const l = await newLearner();
    const first = await atTask(l.enrollmentId);
    await first.send({ kind: 'submit', link: LINK });
    const again = await atTask(l.enrollmentId, 'aula_1', true);
    const kept = await again.send({ kind: 'submit', keep: true });
    expect(kept.lessonCompleted).toBe(true);
    expect(kept.task).toMatchObject({ outcome: 'kept', record: { status: 'submitted', link: LINK, revision: 1 } });
    const third = await atTask(l.enrollmentId, 'aula_1', true);
    const dup = await third.send({ kind: 'submit', link: 'https://exemplo.com/outro' });
    expect(dup.task).toMatchObject({ outcome: 'kept', record: { link: LINK, revision: 1 } });
    expect((await subOf(l.enrollmentId)).link).toBe(LINK);
  });
});

describe('correção', () => {
  it('devolver exige comentário; o aluno vê o comentário, reenvia e a entrega volta para a fila', async () => {
    const l = await newLearner();
    const t = await atTask(l.enrollmentId);
    await t.send({ kind: 'submit', link: LINK });
    const sub = await subOf(l.enrollmentId);
    const base = { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId, expectedRevision: 1 };
    expect(await code(reviewSubmission(db, { ...base, decision: 'return', criteria: [{ id: 'c1', met: true }, { id: 'c2', met: false }], comment: '  ' }))).toBe('VALIDATION');
    expect(await code(reviewSubmission(db, { ...base, decision: 'return', criteria: [{ id: 'c1', met: true }], comment: 'Falta um critério' }))).toBe('VALIDATION');
    expect(await code(reviewSubmission(db, { ...base, decision: 'approve', criteria: [{ id: 'c1', met: true }, { id: 'c2', met: false }] }))).toBe('VALIDATION');
    const returned = await reviewSubmission(db, { ...base, decision: 'return', criteria: [{ id: 'c1', met: true }, { id: 'c2', met: false }], comment: ' O vídeo tem 3 minutos. Corte para 1. ' });
    expect(returned).toMatchObject({ status: 'returned', reviewerId, reviewerComment: 'O vídeo tem 3 minutos. Corte para 1.', revision: 2 });
    expect(returned.criteriaResults).toEqual([{ id: 'c1', label: 'Fala o nome e o curso', met: true }, { id: 'c2', label: 'Tem até 1 minuto', met: false }]);

    const rec = (await taskRecords(db, { enrollmentId: l.enrollmentId })).t_manual!;
    expect(rec).toMatchObject({ status: 'returned', comment: 'O vídeo tem 3 minutos. Corte para 1.', revision: 2 });
    expect((await listSubmissions(db, { workspaceId: seeded.workspaceId })).some((x) => x.id === sub.id)).toBe(false);
    expect((await listSubmissions(db, { workspaceId: seeded.workspaceId, status: 'returned' })).find((x) => x.id === sub.id)).toMatchObject({ reviewerName: 'Carla Revisora', taskTitle: 'Missão final' });

    // devolvida: não dá para corrigir de novo antes do reenvio
    expect(await code(reviewSubmission(db, { ...base, expectedRevision: 2, decision: 'approve', criteria: allMet }))).toBe('CONFLICT');

    // reenvio fora da aula
    expect(await code(resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_manual', link: 'http://sem-https.com' }))).toBe('VALIDATION');
    const file = await uploadFor(l);
    const re = await resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_manual', link: 'https://exemplo.com/video-curto', fileAssetId: file.id });
    expect(re).toMatchObject({ status: 'submitted', link: 'https://exemplo.com/video-curto', fileAssetId: file.id, reviewerComment: null, reviewerId: null, reviewedAt: null, criteriaResults: [], revision: 3 });
    expect((await listSubmissions(db, { workspaceId: seeded.workspaceId, courseId })).some((x) => x.id === sub.id)).toBe(true);
    // em correção: o aluno não reenvia de novo
    expect(await code(resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_manual', link: LINK }))).toBe('CONFLICT');

    // o avaliador com a versão antiga aberta recebe conflito; com a atual, aprova
    expect(await code(reviewSubmission(db, { ...base, expectedRevision: 2, decision: 'approve', criteria: allMet }))).toBe('CONFLICT');
    const approved = await reviewSubmission(db, { ...base, expectedRevision: 3, decision: 'approve', criteria: allMet });
    expect(approved).toMatchObject({ status: 'approved', revision: 4, reviewerComment: null });
    expect(await code(resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_manual', link: LINK }))).toBe('CONFLICT');

    const detail = (await getSubmissionForReview(db, { submissionId: sub.id, workspaceId: seeded.workspaceId }))!;
    expect(detail.events.map((e) => [e.type, e.revision, e.byStudent])).toEqual([['submitted', 1, true], ['returned', 2, false], ['resubmitted', 3, true], ['approved', 4, false]]);
    expect(detail.events[1]).toMatchObject({ comment: 'O vídeo tem 3 minutos. Corte para 1.', actorName: 'Carla Revisora' });
    expect(detail.task).toMatchObject({ title: 'Missão final', lessonTitle: 'Aula 1', criteria, deliverable: 'link_file' });
    expect(detail.file).toMatchObject({ assetId: file.id });

    const audit = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityType, 'task_submission'), eq(s.auditLogs.entityId, sub.id)));
    expect(audit.map((a) => [a.action, a.actorId, a.data.decision])).toEqual([['task.review', reviewerId, 'returned'], ['task.review', reviewerId, 'approved']]);
    expect(JSON.stringify(audit)).not.toContain('3 minutos');
    expect(audit[0]!.workspaceId).toBe(seeded.workspaceId);
    const outbox = (await db.select().from(s.outboxEvents)).filter((o) => o.payload.submissionId === sub.id);
    expect(outbox.map((o) => o.type)).toEqual(['task.submitted', 'task.reviewed', 'task.submitted', 'task.reviewed']);
    expect(outbox[2]!.payload).toMatchObject({ resubmission: true });
    expect(JSON.stringify(outbox)).not.toContain('3 minutos');
  });

  it('reenvio pela aula (refeita) depois de devolvida também vale', async () => {
    const l = await newLearner();
    const t = await atTask(l.enrollmentId);
    await t.send({ kind: 'submit', link: LINK });
    const sub = await subOf(l.enrollmentId);
    await reviewSubmission(db, { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId, decision: 'return', criteria: allMet.map((c) => ({ ...c, met: false })), comment: 'O link não abre.', expectedRevision: 1 });
    const again = await atTask(l.enrollmentId, 'aula_1', true);
    expect(await code(again.send({ kind: 'submit', keep: true }))).toBe('VALIDATION');
    const r = await again.send({ kind: 'submit', link: 'https://exemplo.com/novo' });
    expect(r.task).toMatchObject({ outcome: 'resubmitted', record: { status: 'submitted', link: 'https://exemplo.com/novo', revision: 3, comment: null } });
  });

  it('só a equipe do mesmo workspace corrige; ninguém corrige a própria entrega', async () => {
    const l = await newLearner();
    const t = await atTask(l.enrollmentId);
    await t.send({ kind: 'submit', link: LINK });
    const sub = await subOf(l.enrollmentId);
    expect(await code(reviewSubmission(db, { submissionId: sub.id, workspaceId: 'ws_outro', reviewerId, decision: 'approve', criteria: allMet, expectedRevision: 1 }))).toBe('NOT_FOUND');
    expect(await getSubmissionForReview(db, { submissionId: sub.id, workspaceId: 'ws_outro' })).toBeNull();
    expect(await code(reviewSubmission(db, { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId: l.userId, decision: 'approve', criteria: allMet, expectedRevision: 1 }))).toBe('FORBIDDEN');
    expect(await code(reviewSubmission(db, { submissionId: 'tsk_naoexiste', workspaceId: seeded.workspaceId, reviewerId, decision: 'approve', criteria: allMet, expectedRevision: 1 }))).toBe('NOT_FOUND');
    expect((await subOf(l.enrollmentId)).status).toBe('submitted');
    expect(await code(resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_naoexiste', link: LINK }))).toBe('NOT_FOUND');
    expect(await code(resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_auto', link: LINK }))).toBe('CONFLICT');
  });

  it('a fila lista as mais antigas primeiro e conta as pendentes por curso', async () => {
    const before = await pendingSubmissionCounts(db, seeded.workspaceId);
    const a = await newLearner();
    const b = await newLearner();
    await (await atTask(a.enrollmentId)).send({ kind: 'submit', link: LINK });
    await (await atTask(b.enrollmentId)).send({ kind: 'submit', link: LINK });
    const after = await pendingSubmissionCounts(db, seeded.workspaceId);
    expect(after.total).toBe(before.total + 2);
    expect(after.byCourse[courseId]).toBe((before.byCourse[courseId] ?? 0) + 2);
    const queue = await listSubmissions(db, { workspaceId: seeded.workspaceId, courseId });
    const times = queue.map((q) => q.submittedAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(queue.every((q) => q.status === 'submitted' && q.courseId === courseId)).toBe(true);
    expect(queue.find((q) => q.studentId === a.userId)).toMatchObject({ taskTitle: 'Missão final', courseTitle: 'Curso com tarefa', hasFile: false });
    expect(await listSubmissions(db, { workspaceId: 'ws_outro' })).toEqual([]);
    expect(await listSubmissions(db, { workspaceId: seeded.workspaceId, courseId: 'crs_outro' })).toEqual([]);
  });
});

describe('taskRequirementsMet (regra para o certificado)', () => {
  it('só fica cumprida com todas as obrigatórias aprovadas; a opcional não conta; o curso conclui antes disso', async () => {
    const l = await newLearner();
    const req = async () => taskRequirementsMet(db, { enrollmentId: l.enrollmentId });
    expect(await req()).toMatchObject({ met: false, pending: [{ nodeId: 't_manual', status: 'missing' }, { nodeId: 't_auto', status: 'missing' }] });
    expect((await req()).required.map((r) => r.nodeId)).toEqual(['t_manual', 't_auto']);

    await (await atTask(l.enrollmentId)).send({ kind: 'submit', link: LINK });
    expect((await req()).pending.map((p) => [p.nodeId, p.status])).toEqual([['t_manual', 'submitted'], ['t_auto', 'missing']]);

    const t2 = await atTask(l.enrollmentId, 'aula_2');
    await t2.send({ kind: 'submit', link: LINK });
    const done = await t2.send({ kind: 'submit', link: LINK });
    // a tarefa nunca bloqueia: o curso conclui com a entrega ainda em correção
    expect(done.courseCompleted).toBe(true);
    const [enr] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, l.enrollmentId));
    expect(enr!.status).toBe('completed');
    expect(await req()).toMatchObject({ met: false, pending: [{ nodeId: 't_manual', status: 'submitted', approved: false }] });

    const sub = await subOf(l.enrollmentId);
    await reviewSubmission(db, { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId, decision: 'return', criteria: allMet.map((c) => ({ ...c, met: false })), comment: 'Refaça, por favor.', expectedRevision: 1 });
    expect((await req()).pending.map((p) => [p.nodeId, p.status])).toEqual([['t_manual', 'returned']]);
    await resubmitTask(db, { enrollmentId: l.enrollmentId, nodeId: 't_manual', link: LINK });
    await reviewSubmission(db, { submissionId: sub.id, workspaceId: seeded.workspaceId, reviewerId, decision: 'approve', criteria: allMet, expectedRevision: 3 });
    // a opcional segue em correção e não impede
    expect((await subOf(l.enrollmentId, 't_opcional')).status).toBe('submitted');
    expect(await req()).toMatchObject({ met: true, pending: [] });
    expect((await req()).required.map((r) => [r.nodeId, r.approved])).toEqual([['t_manual', true], ['t_auto', true]]);

    const tasks = await learnerTasks(db, { enrollmentId: l.enrollmentId });
    expect(tasks.map((t) => [t.nodeId, t.required, t.record?.status ?? null])).toEqual([['t_manual', true, 'approved'], ['t_auto', true, 'approved'], ['t_opcional', false, 'submitted']]);
    expect(tasks[0]).toMatchObject({ lessonTitle: 'Aula 1', deliverable: 'link_file', acceptedMime: ['application/pdf', 'image/png', 'image/jpeg'] });
  });

  it('curso sem tarefa: cumprida', async () => {
    const r = await taskRequirementsMet(db, { enrollmentId: seeded.enrollmentId });
    expect(r).toEqual({ met: true, required: [], pending: [] });
  });
});

describe('arquivo da entrega: quem lê e limite de envios', () => {
  it('um aluno não lê o arquivo de outro; arquivo da equipe não é de entrega', async () => {
    const a = await newLearner();
    const b = await newLearner();
    const fileA = await uploadFor(a);
    expect(await taskFileReadableBy(db, { assetId: fileA.id, userId: a.userId })).toBe(true);
    expect(await taskFileReadableBy(db, { assetId: fileA.id, userId: b.userId })).toBe(false);
    expect(await taskFileReadableBy(db, { assetId: 'ast_naoexiste', userId: a.userId })).toBe(false);
    const staffDoc = await createAsset(db, { workspaceId: seeded.workspaceId, kind: 'document', mimeType: 'application/pdf', sizeBytes: 10, storageProvider: 'local', storageKey: 'x/fonte2.pdf', sha256: 'abcd', createdBy: authorId });
    expect(await taskFileReadableBy(db, { assetId: staffDoc.id, userId: authorId })).toBe(false);
    expect(await taskFileReadableBy(db, { assetId: staffDoc.id, userId: a.userId })).toBe(false);
    // mesmo depois de entregue, continua só de quem enviou
    await (await atTask(a.enrollmentId)).send({ kind: 'submit', link: LINK, fileAssetId: fileA.id });
    expect(await taskFileReadableBy(db, { assetId: fileA.id, userId: b.userId })).toBe(false);
    expect((await taskRecords(db, { enrollmentId: b.enrollmentId })).t_manual).toBeUndefined();
  });

  it('limite por matrícula: por hora e por dia', async () => {
    const l = await newLearner();
    const other = await newLearner();
    const now = new Date();
    for (let i = 0; i < TASK_UPLOAD_LIMITS.perHour - 1; i++) await uploadFor(l);
    await expect(assertTaskUploadAllowed(db, { ...l, now })).resolves.toBeUndefined();
    await uploadFor(l);
    expect(await code(assertTaskUploadAllowed(db, { ...l, now }))).toBe('RATE_LIMITED');
    // outra matrícula não é afetada
    await expect(assertTaskUploadAllowed(db, { ...other, now })).resolves.toBeUndefined();
    // uma hora depois, a janela da hora passou
    await expect(assertTaskUploadAllowed(db, { ...l, now: new Date(now.getTime() + 61 * 60 * 1000) })).resolves.toBeUndefined();
    const hoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    for (let i = 0; i < TASK_UPLOAD_LIMITS.perDay; i++) await uploadFor(other, 't_manual', 'application/pdf', hoursAgo);
    expect(await code(assertTaskUploadAllowed(db, { ...other, now }))).toBe('RATE_LIMITED');
  });
});

describe('privacidade: exportar e apagar', () => {
  it('a exportação traz as entregas; apagar a conta leva entregas, histórico e arquivos, e devolve as chaves do storage', async () => {
    // a exclusão só aceita contas descartáveis `lgpd-teste-*`
    const l = await newLearner('lgpd-teste');
    const [u] = await db.select().from(s.user).where(eq(s.user.id, l.userId));
    const file = await uploadFor(l);
    await (await atTask(l.enrollmentId)).send({ kind: 'submit', link: LINK, fileAssetId: file.id });
    const sub = await subOf(l.enrollmentId);
    const data = (await collectUserData(db, u!.email))!;
    expect(data.entregas).toHaveLength(1);
    expect(data.historicoDeEntregas).toHaveLength(1);
    expect(data.arquivosDeEntrega).toEqual([expect.objectContaining({ id: file.id, nome: 'roteiro.pdf', entrega: { enrollmentId: l.enrollmentId, nodeId: 't_manual' } })]);

    const dry = await eraseUser(db, { email: u!.email, apply: false });
    expect(dry.counts).toMatchObject({ entregas: 1, arquivosDeEntrega: 1 });
    expect(dry.taskFiles).toEqual([{ storageProvider: 'local', storageKey: file.storageKey }]);
    const done = await eraseUser(db, { email: u!.email, apply: true });
    expect(done.applied).toBe(true);
    expect(await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.id, sub.id))).toHaveLength(0);
    expect(await db.select().from(s.taskSubmissionEvents).where(eq(s.taskSubmissionEvents.submissionId, sub.id))).toHaveLength(0);
    expect(await db.select().from(s.assets).where(eq(s.assets.id, file.id))).toHaveLength(0);
    expect((await db.select().from(s.outboxEvents)).filter((o) => o.payload.submissionId === sub.id)).toHaveLength(0);
  });
});
