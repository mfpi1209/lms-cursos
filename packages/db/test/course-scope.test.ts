import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { podeEntrar, PODE_ENTRAR_LESSON_IDS } from '@lms/course-schema';
import type { Intent } from '@lms/course-engine';
import { resetDatabase } from './setup';
import { schema as s, type Database } from '../src';
import { createCourse } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { answeredNodeSummaries, applyLearnerEvent, courseAnswers, enrollStudent, getEnrollmentWithVersion, startOrResumeAttempt } from '../src/repositories/learning';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let enrollmentId: string;

// a aula do dia (índice 1) não usa o perfil: L2 = apresentação, L3 = exemplo, L4 = mudança
const [L1, , L2, L3, L4] = PODE_ENTRAR_LESSON_IDS;
const advance: Intent = { kind: 'advance' };
const choose = (optionId: string): Intent => ({ kind: 'choose', optionId });

/** Aplica intenções a partir do nó atual da tentativa. */
async function play(attemptId: string, intents: Intent[], tag: string) {
  const [row] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, attemptId));
  let revision = row!.revision;
  let nodeId = row!.state.currentNodeId;
  let last;
  for (const [i, intent] of intents.entries()) {
    last = await applyLearnerEvent(db, { attemptId, eventId: `${tag}-${i}-${attemptId}`, nodeId, expectedRevision: revision, intent });
    revision = last.revision;
    nodeId = last.state.currentNodeId;
  }
  return last!;
}

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  const author = seeded.users['autor@demo.local']!;
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title: podeEntrar.title, createdBy: author, document: podeEntrar });
  await publishCourse(db, { courseId: course.id, userId: author });
  const { enrollment } = await enrollStudent(db, { courseId: course.id, userId: seeded.users['aluno@demo.local']!, createdBy: seeded.users['admin@demo.local']! });
  enrollmentId = enrollment.id;
});
afterAll(async () => {
  await close();
});

describe('variáveis de curso entre aulas (banco real)', () => {
  it('aula 4 aberta antes da aula 1: começa com o valor inicial (fallback)', async () => {
    const { attempt, created } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L4 });
    expect(created).toBe(true);
    expect(attempt.state.currentNodeId).toBe('v05_como_explicar_uma_mudanca');
    expect(attempt.state.variables.perfil).toBe('primeiro_emprego');
  });

  it('perfil respondido na aula 1 chega à aula 2 (nova) e à aula 4 (intocada, atualizada ao retomar)', async () => {
    const { attempt: a1 } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L1 });
    const r = await play(a1.id, [advance, choose('experiencia')], 'l1');
    expect(r.state.variables.perfil).toBe('experiencia');

    const { attempt: a2, created } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L2 });
    expect(created).toBe(true);
    expect(a2.state.variables.perfil).toBe('experiencia');
    expect((await play(a2.id, [advance], 'l2')).toNodeId).toBe('q03_experiencia');

    const { attempt: a4, created: c4 } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L4 });
    expect(c4).toBe(false);
    expect(a4.revision).toBe(1);
    expect(a4.state.variables.perfil).toBe('experiencia');
    expect((await play(a4.id, [advance], 'l4')).toNodeId).toBe('q05_experiencia');
  });

  it('refazer a aula 1 sem chegar à pergunta não apaga o perfil: vale a tentativa que de fato gravou', async () => {
    const { attempt: a1 } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L1 });
    // conclui a primeira tentativa da aula 1
    await play(a1.id, [advance, choose('problema'), advance, choose('b')], 'l1-end');
    const again = await startOrResumeAttempt(db, { enrollmentId, lessonId: L1, forceNew: true });
    expect(again.created).toBe(true);
    expect(again.attempt.state.variables.perfil).toBe('experiencia');
    // a nova tentativa da aula 1 é a mais recente, mas ainda não gravou nada
    await db.update(s.lessonAttempts).set({ state: { ...again.attempt.state, variables: { perfil: 'primeiro_emprego' } }, updatedAt: new Date() }).where(eq(s.lessonAttempts.id, again.attempt.id));
    const enr = (await getEnrollmentWithVersion(db, enrollmentId))!;
    const { carriedCourseVariables } = await import('../src/repositories/learning');
    const graph = enr.document.modules.flatMap((m) => m.lessons).find((l) => l.id === L2)!.graph;
    expect(await carriedCourseVariables(db, { enrollmentId, document: enr.document, graph })).toEqual({ perfil: 'experiencia' });
  });
});

describe('respostas do curso (courseAnswers)', () => {
  it('junta respostas de várias aulas, a mais recente por nó, com resumo dos nós', async () => {
    const { attempt: a2 } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L2 });
    await play(a2.id, [choose('b'), choose('o_que')], 'l2b');
    const { attempt: a3 } = await startOrResumeAttempt(db, { enrollmentId, lessonId: L3 });
    // depois da escolha vem "Monte seu exemplo" (composição guiada, opcional): pular conclui a aula
    await play(a3.id, [advance, choose('b'), choose('grupo'), { kind: 'reflect', text: '' }], 'l3');

    const answers = await courseAnswers(db, { enrollmentId });
    expect(answers.at03_experiencia).toMatchObject({ lessonId: L2, kind: 'choice', optionIds: ['o_que'] });
    expect(answers.at04_exemplo_real).toMatchObject({ lessonId: L3, kind: 'choice', optionIds: ['grupo'] });
    expect(answers.q04_entrega_atrasando).toMatchObject({ lessonId: L3, kind: 'choice', optionIds: ['b'] });
    expect(answers.q01_perfil).toMatchObject({ lessonId: L1, kind: 'choice', optionIds: ['experiencia'] });
    expect(typeof answers.q01_perfil!.answeredAt).toBe('string');

    const enr = (await getEnrollmentWithVersion(db, enrollmentId))!;
    const nodes = answeredNodeSummaries(enr.document, answers);
    expect(Object.keys(nodes).sort()).toEqual(Object.keys(answers).sort());
    expect(nodes.q04_entrega_atrasando?.type).toBe('choice');
    expect(nodes.q04_entrega_atrasando?.options?.find((o) => o.id === 'b')?.label).toBeTruthy();
    expect(nodes.at03_experiencia).toMatchObject({ title: 'Seu começo', type: 'choice' });
  });

  it('nova tentativa da mesma aula: a resposta mais recente vence', async () => {
    const again = await startOrResumeAttempt(db, { enrollmentId, lessonId: L3, forceNew: true });
    await play(again.attempt.id, [advance, choose('b'), choose('curso'), { kind: 'reflect', text: '' }], 'l3b');
    const answers = await courseAnswers(db, { enrollmentId });
    expect(answers.at04_exemplo_real?.optionIds).toEqual(['curso']);
  });
});
