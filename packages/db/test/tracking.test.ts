import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, startOrResumeAttempt } from '../src/repositories/learning';
import { dailyActiveStudents, enrollmentActivity, latestCourseDocument, lessonReach, trackedCourses } from '../src/repositories/tracking';
import type { SeedResult } from '../src/seed/seed';

/*
 * Consultas do acompanhamento (estúdio › Acompanhamento). Curso com duas aulas simples (conteúdo → fim):
 *  - A: abriu e avançou a aula 1 (passos registrados hoje);
 *  - B: só abriu a aula 1 (tentativa sem passo);
 *  - C: matriculado, nunca abriu;
 *  - D: avançou a aula 1 e teve a matrícula cancelada (fora do diário e do alcance das aulas);
 *  - E: em OUTRO curso (fora do escopo quando o curso é filtrado).
 */
let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let courseId: string;
let otherCourseId: string;
let seq = 0;

const text = (t: string) => richTextFromPlain(t);
const simpleLesson = (id: string, title: string) => ({
  id,
  title,
  graph: { schemaVersion: 1, startNodeId: `${id}_n`, nodes: [{ id: `${id}_n`, type: 'content', body: text('Conteúdo') }, { id: `${id}_f`, type: 'end', summary: text('Fim') }], edges: [{ id: `${id}_e`, from: `${id}_n`, to: `${id}_f` }] },
});
const doc = (title: string) => CourseDocumentSchema.parse({ schemaVersion: 1, title, modules: [{ id: 'm1', title: 'Módulo', lessons: [simpleLesson('aula_1', 'Aula 1'), simpleLesson('aula_2', 'Aula 2')] }] });

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  for (const [title, slug] of [['Curso acompanhado', 'curso-acompanhado'], ['Outro curso', 'outro-curso']] as const) {
    const c = await createCourse(db, { workspaceId: seeded.workspaceId, title, createdBy: authorId, document: doc(title), slug });
    const draft = (await getDraft(db, c.id))!;
    await publishCourse(db, { courseId: c.id, userId: authorId, expectedRevision: draft.revision });
    if (slug === 'curso-acompanhado') courseId = c.id;
    else otherCourseId = c.id;
  }
});
afterAll(async () => {
  await close();
});

async function learner(cId = courseId) {
  const id = newId('usr');
  const n = ++seq;
  await db.insert(s.user).values({ id, email: `trk-teste-${n}-${id.slice(-6)}@demo.local`, name: `Aluno Trk ${n}`, emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student' });
  const { enrollment } = await enrollStudent(db, { courseId: cId, userId: id, createdBy: authorId });
  return { userId: id, enrollmentId: enrollment.id };
}
async function openLesson(enrollmentId: string, advance: boolean) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId: 'aula_1' });
  if (advance) await applyLearnerEvent(db, { attemptId: attempt.id, eventId: newId('ev'), nodeId: attempt.state.currentNodeId, expectedRevision: attempt.revision, intent: { kind: 'advance' } });
  return attempt.id;
}

describe('acompanhamento (consultas)', () => {
  let a: { enrollmentId: string };
  let b: { enrollmentId: string };
  let c: { enrollmentId: string };
  let d: { enrollmentId: string };

  beforeAll(async () => {
    a = await learner();
    b = await learner();
    c = await learner();
    d = await learner();
    const e = await learner(otherCourseId);
    await openLesson(a.enrollmentId, true);
    await openLesson(b.enrollmentId, false);
    await openLesson(d.enrollmentId, true);
    await openLesson(e.enrollmentId, true);
    await db.update(s.enrollments).set({ status: 'canceled' }).where(eq(s.enrollments.id, d.enrollmentId));
  });

  it('atividade por matrícula: só quem abriu aula, com última atividade; escopo por curso', async () => {
    const act = await enrollmentActivity(db, { workspaceId: seeded.workspaceId, courseId });
    expect(act.get(a.enrollmentId)).toMatchObject({ attempts: 1, lessonsStarted: 1 });
    expect(act.get(a.enrollmentId)!.lastActivity).toBeInstanceOf(Date);
    expect(act.get(b.enrollmentId)).toMatchObject({ attempts: 1, lessonsStarted: 1 });
    expect(act.has(c.enrollmentId)).toBe(false);
    expect(act.size).toBe(3); // a, b, d (cancelada ainda tem atividade); o aluno do outro curso fica fora
    const all = await enrollmentActivity(db, { workspaceId: seeded.workspaceId });
    expect(all.size).toBeGreaterThanOrEqual(4);
  });

  it('alcance das aulas: abertas e concluídas, sem matrícula cancelada', async () => {
    const reach = await lessonReach(db, { workspaceId: seeded.workspaceId, courseId });
    const completedA = await db
      .select({ id: s.lessonAttempts.id })
      .from(s.lessonAttempts)
      .where(and(eq(s.lessonAttempts.enrollmentId, a.enrollmentId), eq(s.lessonAttempts.status, 'completed')));
    expect(reach.get('aula_1')).toEqual({ lessonId: 'aula_1', started: 2, completed: completedA.length ? 1 : 0 });
    expect(reach.has('aula_2')).toBe(false);
  });

  it('diário: 30 dias até hoje, contando só quem registrou passo (sem cancelada)', async () => {
    const daily = await dailyActiveStudents(db, { workspaceId: seeded.workspaceId, courseId, days: 30 });
    expect(daily).toHaveLength(30);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(daily[29]).toEqual({ day: today, students: 1 });
    expect(daily.slice(0, 29).every((d) => d.students === 0)).toBe(true);
    const all = await dailyActiveStudents(db, { workspaceId: seeded.workspaceId, days: 7 });
    expect(all).toHaveLength(7);
    expect(all[6]!.students).toBeGreaterThanOrEqual(2);
  });

  it('cursos do filtro: publicados com o total de matrículas; documento da última versão', async () => {
    const courses = await trackedCourses(db, seeded.workspaceId);
    expect(courses.find((x) => x.id === courseId)).toMatchObject({ slug: 'curso-acompanhado', enrollments: 4, status: 'published' });
    expect(courses.find((x) => x.id === otherCourseId)?.enrollments).toBe(1);
    const document = (await latestCourseDocument(db, courseId)) as { modules: Array<{ lessons: Array<{ id: string }> }> };
    expect(document.modules[0]!.lessons.map((l) => l.id)).toEqual(['aula_1', 'aula_2']);
  });
});
