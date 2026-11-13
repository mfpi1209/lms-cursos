import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import type { Intent } from '@lms/course-engine';
import { resetDatabase } from './setup';
import { newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, startOrResumeAttempt } from '../src/repositories/learning';
import { progressRows, reflectionSlotsOf, summarizeReflections } from '../src/repositories/reports';
import type { SeedResult } from '../src/seed/seed';

/*
 * Respostas das cenas de reflexão no relatório de progresso. Curso com:
 *  - aula_1: conteúdo → reflexão obrigatória "missao" (link) → reflexão opcional "extra" → fim;
 *  - aula_2: conteúdo → fim (sem reflexão).
 * Curso 2 sem nenhuma reflexão.
 */
let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let courseId: string;
let plainCourseId: string;
let seq = 0;

const text = (t: string) => richTextFromPlain(t);
const lesson = (id: string, nodes: unknown[], edges: unknown[], start: string) => ({ id, title: id === 'aula_1' ? 'Aula 1' : 'Aula 2', graph: { schemaVersion: 1, startNodeId: start, nodes, edges } });
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso com reflexão',
  modules: [
    {
      id: 'm1',
      title: 'Módulo',
      lessons: [
        lesson(
          'aula_1',
          [
            { id: 'n1', type: 'content', body: text('Conteúdo') },
            { id: 'missao', type: 'reflection', title: 'Missão', prompt: text('Cole o link'), minLength: 5, maxLength: 500 },
            { id: 'extra', type: 'reflection', required: false, prompt: text('Algo mais?'), minLength: 0, maxLength: 500 },
            { id: 'fim1', type: 'end', summary: text('Fim') },
          ],
          [
            { id: 'e0', from: 'n1', to: 'missao' },
            { id: 'e1', from: 'missao', to: 'extra' },
            { id: 'e2', from: 'extra', to: 'fim1' },
          ],
          'n1',
        ),
        lesson('aula_2', [{ id: 'n2', type: 'content', body: text('Conteúdo') }, { id: 'fim2', type: 'end', summary: text('Fim') }], [{ id: 'e1', from: 'n2', to: 'fim2' }], 'n2'),
      ],
    },
  ],
});
const plainDoc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso sem reflexão',
  modules: [{ id: 'm1', title: 'M', lessons: [lesson('aula_1', [{ id: 'n1', type: 'content', body: text('x') }, { id: 'f', type: 'end', summary: text('f') }], [{ id: 'e', from: 'n1', to: 'f' }], 'n1')] }],
});

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  for (const [title, slug, document] of [['Curso com reflexão', 'curso-reflexao', doc], ['Curso sem reflexão', 'curso-sem-reflexao', plainDoc]] as const) {
    const c = await createCourse(db, { workspaceId: seeded.workspaceId, title, createdBy: authorId, document, slug });
    const draft = (await getDraft(db, c.id))!;
    await publishCourse(db, { courseId: c.id, userId: authorId, expectedRevision: draft.revision });
    if (slug === 'curso-reflexao') courseId = c.id;
    else plainCourseId = c.id;
  }
});
afterAll(async () => {
  await close();
});

async function newLearner(cId = courseId) {
  const id = newId('usr');
  const n = ++seq;
  await db.insert(s.user).values({ id, email: `refl-teste-${n}-${id.slice(-6)}@demo.local`, name: `Aluno Reflexão ${n}`, emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student' });
  const { enrollment } = await enrollStudent(db, { courseId: cId, userId: id, createdBy: authorId });
  return { userId: id, enrollmentId: enrollment.id };
}
async function open(enrollmentId: string) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId: 'aula_1' });
  let revision = attempt.revision;
  let nodeId = attempt.state.currentNodeId;
  const send = async (intent: Intent) => {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: newId('ev'), nodeId, expectedRevision: revision, intent });
    revision = r.revision;
    nodeId = r.toNodeId;
  };
  return { attemptId: attempt.id, send };
}
const rowOf = async (enrollmentId: string, cId = courseId) => (await progressRows(db, { workspaceId: seeded.workspaceId, courseId: cId, limit: 500 })).itens.find((r) => r.matricula_id === enrollmentId)!;

describe('reflexoes no progresso', () => {
  it('as cenas de reflexão saem na ordem do curso, com título (ou id) e obrigatoriedade', () => {
    expect(reflectionSlotsOf(doc)).toEqual([
      { lessonId: 'aula_1', lessonTitle: 'Aula 1', nodeId: 'missao', title: 'Missão', required: true },
      { lessonId: 'aula_1', lessonTitle: 'Aula 1', nodeId: 'extra', title: 'extra', required: false },
    ]);
    expect(reflectionSlotsOf(plainDoc)).toEqual([]);
  });

  it('aluno sem resposta: todas as cenas com resposta e data nulas', async () => {
    const l = await newLearner();
    const r = await rowOf(l.enrollmentId);
    expect(r.reflexoes).toEqual([
      { aula_id: 'aula_1', aula: 'Aula 1', cena: 'missao', titulo: 'Missão', obrigatoria: true, resposta: null, respondida_em: null },
      { aula_id: 'aula_1', aula: 'Aula 1', cena: 'extra', titulo: 'extra', obrigatoria: false, resposta: null, respondida_em: null },
    ]);
  });

  it('aluno com resposta: texto e data da resposta; cena não respondida segue nula', async () => {
    const l = await newLearner();
    const a = await open(l.enrollmentId);
    await a.send({ kind: 'advance' });
    await a.send({ kind: 'reflect', text: 'https://exemplo.com/minha-entrega' });
    const r = await rowOf(l.enrollmentId);
    expect(r.reflexoes[0]).toMatchObject({ cena: 'missao', resposta: 'https://exemplo.com/minha-entrega' });
    expect(Number.isNaN(Date.parse(r.reflexoes[0]!.respondida_em!))).toBe(false);
    expect(r.reflexoes[1]).toMatchObject({ cena: 'extra', resposta: null, respondida_em: null });
  });

  it('várias respostas (tentativas): vale a mais recente', async () => {
    const l = await newLearner();
    const first = await open(l.enrollmentId);
    await first.send({ kind: 'advance' });
    await first.send({ kind: 'reflect', text: 'resposta antiga' });
    // segunda tentativa com resposta mais nova, gravada direto no estado (sem depender do relógio)
    const [row] = await db.select().from(s.lessonAttempts).where(eq(s.lessonAttempts.id, first.attemptId));
    await db.insert(s.lessonAttempts).values({
      ...row!,
      id: newId('att'),
      attemptNumber: row!.attemptNumber + 1,
      status: 'in_progress',
      state: { ...row!.state, answers: { missao: { text: 'resposta nova', answeredAt: new Date(Date.now() + 60_000).toISOString() } } },
    });
    const r = await rowOf(l.enrollmentId);
    expect(r.reflexoes[0]).toMatchObject({ resposta: 'resposta nova' });
  });

  it('summarizeReflections: empate de horário fica com a tentativa de maior número; resposta vazia não conta', () => {
    const slots = reflectionSlotsOf(doc);
    const at = '2026-03-10T12:00:00.000Z';
    const att = (attemptNumber: number, answers: Record<string, { text?: string; answeredAt: string }>) => ({ lessonId: 'aula_1', attemptNumber, status: 'completed' as const, state: { path: [], answers } });
    const out = summarizeReflections(slots, [att(1, { missao: { text: 'um', answeredAt: at } }), att(2, { missao: { text: 'dois', answeredAt: at }, extra: { text: '   ', answeredAt: at } })]);
    expect(out[0]).toMatchObject({ resposta: 'dois', respondida_em: at });
    expect(out[1]).toMatchObject({ resposta: null, respondida_em: null });
  });

  it('curso sem reflexão: lista vazia', async () => {
    const l = await newLearner(plainCourseId);
    expect((await rowOf(l.enrollmentId, plainCourseId)).reflexoes).toEqual([]);
  });
});
