import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CourseDocumentSchema, allLessons, richTextFromPlain, type CourseDocument } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { schema as s, type Database } from '../src';
import { createCourse, getDraft, saveDraft } from '../src/repositories/authoring';
import { publishCourse, getVersion } from '../src/repositories/publishing';
import { applyLearnerEvent, courseIsComplete, enrollStudent, getEnrollmentWithVersion, startOrResumeAttempt } from '../src/repositories/learning';
import { trailStatus } from '../src/repositories/recognition';
import { moveEnrollmentToVersion } from '../src/scripts/matricula-migracao-db';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
});
afterAll(async () => {
  await close();
});

/** aula mínima: uma cena de conteúdo e o encerramento (duas intenções "advance" concluem) */
const lesson = (id: string, withReflection = false) => ({
  id,
  title: `Aula ${id}`,
  estimatedMinutes: 5,
  graph: {
    schemaVersion: 1,
    startNodeId: 'n1',
    nodes: [
      { id: 'n1', type: 'content', body: richTextFromPlain('Conteúdo') },
      ...(withReflection ? [{ id: 'pratica', type: 'reflection', prompt: richTextFromPlain('Escreva'), minLength: 0, maxLength: 200 }] : []),
      { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') },
    ],
    edges: withReflection
      ? [{ id: 'e1', from: 'n1', to: 'pratica' }, { id: 'e2', from: 'pratica', to: 'fim' }]
      : [{ id: 'e1', from: 'n1', to: 'fim' }],
  },
});
const docOf = (ids: string[], withReflectionOn?: string): CourseDocument =>
  CourseDocumentSchema.parse({ schemaVersion: 1, title: 'Curso de teste', modules: [{ id: 'm1', title: 'Módulo', lessons: ids.map((id) => lesson(id, id === withReflectionOn)) }] });

async function newCourse(title: string, ids: string[], reflectionOn?: string) {
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title, createdBy: authorId, document: docOf(ids, reflectionOn) });
  const draft = (await getDraft(db, course.id))!;
  const v1 = await publishCourse(db, { courseId: course.id, userId: authorId, expectedRevision: draft.revision });
  return { courseId: course.id, v1 };
}

async function appendLesson(courseId: string, ids: string[], reflectionOn?: string) {
  const draft = (await getDraft(db, courseId))!;
  await saveDraft(db, { courseId, userId: authorId, expectedRevision: draft.revision, origin: 'author', document: docOf(ids, reflectionOn) });
  const d2 = (await getDraft(db, courseId))!;
  return publishCourse(db, { courseId, userId: authorId, expectedRevision: d2.revision });
}

/** conclui a aula (advance até o encerramento) */
async function completeLesson(enrollmentId: string, lessonId: string) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId });
  let rev = attempt.revision;
  let node = attempt.state.currentNodeId;
  let last;
  for (let i = 0; i < 6; i++) {
    const found = (await getEnrollmentWithVersion(db, enrollmentId))!;
    const n = allLessons(found.document).find((l) => l.id === lessonId)!.graph.nodes.find((x) => x.id === node)!;
    if (n.type === 'end') break;
    const intent = n.type === 'reflection' ? ({ kind: 'reflect', text: '' } as const) : ({ kind: 'advance' } as const);
    last = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `evt-${lessonId}-${i}`, nodeId: node, expectedRevision: rev, intent });
    rev = last.revision;
    node = last.toNodeId;
  }
  return last!;
}

async function moveToLatest(courseId: string, enrollmentId: string) {
  const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollmentId));
  const [latest] = await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, courseId)).orderBy(s.courseVersions.versionNumber);
  const all = await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, courseId));
  const newest = all.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a), latest!);
  const old = (await getVersion(db, e!.courseVersionId))!;
  return moveEnrollmentToVersion(db, { id: e!.id, status: e!.status }, old.document, { id: newest.id, versionNumber: newest.versionNumber, document: newest.document }, { log: () => undefined });
}

const learner = (email: string) => seeded.users[email]!;

describe('aula acrescentada no fim: matrícula concluída é preservada', () => {
  it('quem concluiu continua concluído (status, data, % e versão de conclusão); a aula nova é opcional e jogável', async () => {
    const { courseId } = await newCourse('Concluído preservado', ['a1', 'a2']);
    const { enrollment } = await enrollStudent(db, { courseId, userId: learner('aluno@demo.local'), createdBy: authorId });
    await completeLesson(enrollment.id, 'a1');
    const fim = await completeLesson(enrollment.id, 'a2');
    expect(fim.courseCompleted).toBe(true);
    const [before] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(before!.status).toBe('completed');
    expect(before!.completedVersionNumber).toBe(1);

    await appendLesson(courseId, ['a1', 'a2', 'a3']);
    const r = await moveToLatest(courseId, enrollment.id);
    expect(r).toMatchObject({ appended: true, keptCompleted: true, optionalLessonIds: ['a3'], newRequired: [] });

    const [after] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(after!.status).toBe('completed');
    expect(after!.completedAt?.getTime()).toBe(before!.completedAt?.getTime());
    expect(after!.completedVersionNumber).toBe(1);
    expect(after!.courseVersionId).not.toBe(before!.courseVersionId);
    expect(after!.optionalLessonIds).toEqual(['a3']);
    // o evento course.completed não é emitido de novo e nada voltou a "em andamento"
    const enr = (await getEnrollmentWithVersion(db, enrollment.id))!;
    expect(courseIsComplete(enr.document, new Set(['a1', 'a2']), after!.optionalLessonIds)).toBe(true);
    expect(courseIsComplete(enr.document, new Set(['a1', 'a2']))).toBe(false); // sem a regra, reabriria

    // a aula nova toca e conclui normalmente, sem mexer na matrícula
    const outbox0 = await db.select().from(s.outboxEvents);
    const novo = await completeLesson(enrollment.id, 'a3');
    expect(novo.lessonCompleted).toBe(true);
    expect(novo.courseCompleted).toBe(false);
    const [done] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(done!.status).toBe('completed');
    expect(done!.completedAt?.getTime()).toBe(before!.completedAt?.getTime());
    const attempts = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.enrollmentId, enrollment.id));
    expect(attempts.filter((a) => a.status === 'completed').map((a) => a.lessonId).sort()).toEqual(['a1', 'a2', 'a3']);
    expect(attempts.some((a) => a.status === 'in_progress')).toBe(false);
    const outbox1 = await db.select().from(s.outboxEvents);
    expect(outbox1.filter((e) => e.type === 'course.completed').length).toBe(outbox0.filter((e) => e.type === 'course.completed').length);
    expect(outbox1.filter((e) => e.type === 'lesson.completed').length).toBe(outbox0.filter((e) => e.type === 'lesson.completed').length + 1);
  });

  it('migrar duas vezes não duplica nem reabre; uma segunda aula acumula como opcional', async () => {
    const { courseId } = await newCourse('Duas levas', ['b1']);
    const { enrollment } = await enrollStudent(db, { courseId, userId: learner('aluno@demo.local'), createdBy: authorId });
    await completeLesson(enrollment.id, 'b1');
    await appendLesson(courseId, ['b1', 'b2']);
    await moveToLatest(courseId, enrollment.id);
    await appendLesson(courseId, ['b1', 'b2', 'b3']);
    const r = await moveToLatest(courseId, enrollment.id);
    expect(r.optionalLessonIds).toEqual(['b2', 'b3']);
    const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(e!.status).toBe('completed');
    expect(e!.completedVersionNumber).toBe(1);
  });

  it('quem está em andamento recebe a aula nova como obrigatória e conclui o curso só com ela', async () => {
    const { courseId } = await newCourse('Em andamento', ['c1', 'c2']);
    const { enrollment } = await enrollStudent(db, { courseId, userId: learner('aluna@demo.local'), createdBy: authorId });
    await completeLesson(enrollment.id, 'c1');
    await appendLesson(courseId, ['c1', 'c2', 'c3']);
    const r = await moveToLatest(courseId, enrollment.id);
    expect(r).toMatchObject({ keptCompleted: false, optionalLessonIds: [], newRequired: ['c3'] });
    await completeLesson(enrollment.id, 'c2');
    let [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(e!.status).toBe('active'); // c3 é obrigatória
    const fim = await completeLesson(enrollment.id, 'c3');
    expect(fim.courseCompleted).toBe(true);
    [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(e!.status).toBe('completed');
    expect(e!.completedVersionNumber).toBe(2);
    expect(e!.optionalLessonIds).toEqual([]);
  });

  it('matrícula nova depois da aula acrescentada: tudo obrigatório', async () => {
    const { courseId } = await newCourse('Nova matrícula', ['d1']);
    await appendLesson(courseId, ['d1', 'd2']);
    const { enrollment } = await enrollStudent(db, { courseId, userId: learner('aluna@demo.local'), createdBy: authorId });
    expect(enrollment.optionalLessonIds).toEqual([]);
    await completeLesson(enrollment.id, 'd1');
    const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(e!.status).toBe('active');
    const fim = await completeLesson(enrollment.id, 'd2');
    expect(fim.courseCompleted).toBe(true);
  });

  it('selo da trilha: a atividade "Na prática" da aula nova não tira a elegibilidade de quem já concluiu', async () => {
    const { courseId } = await newCourse('Trilha preservada', ['t1']);
    await db.update(s.courses).set({ trail: 'Convivência' }).where(eq(s.courses.id, courseId));
    const userId = learner('aluno@demo.local');
    const { enrollment } = await enrollStudent(db, { courseId, userId, createdBy: authorId });
    await completeLesson(enrollment.id, 't1');
    const base = { workspaceId: seeded.workspaceId, userId, trail: 'Convivência' };
    const antes = (await trailStatus(db, base)).courses.find((c) => c.courseId === courseId)!;
    expect(antes).toMatchObject({ done: true, missingActivities: [] });
    await appendLesson(courseId, ['t1', 't2'], 't2');
    await moveToLatest(courseId, enrollment.id);
    const depois = (await trailStatus(db, base)).courses.find((c) => c.courseId === courseId)!;
    expect(depois).toMatchObject({ done: true, missingActivities: [] });
    // quem se matricula só agora faz a atividade da aula 2 normalmente (é cobrada)
    const outra = learner('aluna@demo.local');
    const novo = await enrollStudent(db, { courseId, userId: outra, createdBy: authorId });
    await completeLesson(novo.enrollment.id, 't1');
    await completeLesson(novo.enrollment.id, 't2');
    const st = (await trailStatus(db, { ...base, userId: outra })).courses.find((c) => c.courseId === courseId)!;
    expect(st.done).toBe(true);
    expect(st.missingActivities).toEqual(['pratica']); // reflexão pulada (texto vazio) segue cobrada para quem não era concluído
  });

  it('dry-run não grava', async () => {
    const { courseId } = await newCourse('Dry run', ['e1']);
    const { enrollment } = await enrollStudent(db, { courseId, userId: learner('aluno@demo.local'), createdBy: authorId });
    await completeLesson(enrollment.id, 'e1');
    await appendLesson(courseId, ['e1', 'e2']);
    const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    const all = await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, courseId));
    const newest = all.reduce((a, b) => (b.versionNumber > a.versionNumber ? b : a));
    const old = (await getVersion(db, e!.courseVersionId))!;
    const r = await moveEnrollmentToVersion(db, { id: e!.id, status: e!.status }, old.document, { id: newest.id, versionNumber: newest.versionNumber, document: newest.document }, { dryRun: true, log: () => undefined });
    expect(r.optionalLessonIds).toEqual(['e2']);
    const [after] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrollment.id));
    expect(after!.courseVersionId).toBe(e!.courseVersionId);
    expect(after!.optionalLessonIds).toEqual([]);
  });
});
