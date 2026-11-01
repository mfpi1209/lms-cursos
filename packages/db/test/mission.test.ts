import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { DomainError, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, courseAnswers, enrollStudent, missionRecords, pendingMissions, saveMissionResponse, startOrResumeAttempt } from '../src/repositories/learning';
import { trailStatus } from '../src/repositories/recognition';
import type { SeedResult } from '../src/seed/seed';
import type { Intent } from '@lms/course-engine';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let courseId: string;
const A = 'aluno@demo.local';
const B = 'aluna@demo.local';

const mission = { id: 'missao', type: 'mission', title: 'Leve para a vida real', intro: 'Para treinar de verdade.', action: 'Hoje, ofereça ajuda a um colega.', alternative: 'Se ainda não trabalha, treine com um colega de curso.', tip: 'Seja breve.' };
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso com missão',
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
            nodes: [{ id: 'n1', type: 'content', body: richTextFromPlain('Conteúdo') }, mission, { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') }],
            edges: [{ id: 'e1', from: 'n1', to: 'missao' }, { id: 'e2', from: 'missao', to: 'fim' }],
          },
        },
      ],
    },
  ],
});

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title: 'Curso com missão', createdBy: authorId, document: doc });
  courseId = course.id;
  const draft = (await getDraft(db, courseId))!;
  await publishCourse(db, { courseId, userId: authorId, expectedRevision: draft.revision });
});
afterAll(async () => {
  await close();
});

async function enroll(email: string) {
  const { enrollment } = await enrollStudent(db, { courseId, userId: seeded.users[email]!, createdBy: authorId });
  return enrollment;
}

/** abre a aula e responde a missão (advance até ela, depois a intenção `mission`) */
async function answerInLesson(enrollmentId: string, intent: Intent, opts: { fresh?: boolean; eventId?: string } = {}) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId: 'aula_1', ...(opts.fresh ? { forceNew: true } : {}) });
  let rev = attempt.revision;
  if (attempt.state.currentNodeId === 'n1') {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: `adv-${attempt.id}`, nodeId: 'n1', expectedRevision: rev, intent: { kind: 'advance' } });
    rev = r.revision;
  }
  return applyLearnerEvent(db, { attemptId: attempt.id, eventId: opts.eventId ?? `m-${attempt.id}-${rev}`, nodeId: 'missao', expectedRevision: rev, intent });
}

describe('missão "Leve para a vida real" (banco real)', () => {
  let enrA: Awaited<ReturnType<typeof enroll>>;
  let enrB: Awaited<ReturnType<typeof enroll>>;

  it('"Vou fazer depois" conclui a aula e o curso (não bloqueia) e fica pendente', async () => {
    enrA = await enroll(A);
    const r = await answerInLesson(enrA.id, { kind: 'mission', status: 'later' });
    expect(r.lessonCompleted).toBe(true);
    expect(r.courseCompleted).toBe(true);
    // o resultado do passo traz o que ficou valendo (o player confirma com este status)
    expect(r.mission).toEqual({ status: 'later', note: null });
    const [row] = await db.select().from(s.missionResponses).where(eq(s.missionResponses.enrollmentId, enrA.id));
    expect(row).toMatchObject({ status: 'later', note: null, revision: 1, nodeId: 'missao', lessonId: 'aula_1', userId: seeded.users[A] });
    const pend = await pendingMissions(db, { enrollmentId: enrA.id });
    expect(pend).toHaveLength(1);
    expect(pend[0]).toMatchObject({ nodeId: 'missao', lessonId: 'aula_1', title: 'Leve para a vida real', revision: 1 });
    const [e] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, enrA.id));
    expect(e!.status).toBe('completed');
  });

  it('o mesmo eventId não duplica o registro nem a versão', async () => {
    const { attempt } = await startOrResumeAttempt(db, { enrollmentId: enrA.id, lessonId: 'aula_1' });
    const ev = await db.select().from(s.learnerEvents).where(eq(s.learnerEvents.attemptId, attempt.id));
    const mEvent = ev.find((x) => x.type === 'mission')!;
    const again = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: mEvent.eventId, nodeId: 'missao', expectedRevision: 1, intent: { kind: 'mission', status: 'done', note: 'não deveria aplicar' } });
    expect(again.replayed).toBe(true);
    const rows = await db.select().from(s.missionResponses).where(eq(s.missionResponses.enrollmentId, enrA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('later');
  });

  it('depois da aula: "Já experimentei" + "O que você percebeu?" (versão nova, histórico, sai de "para depois")', async () => {
    const saved = await saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: '  Foi mais fácil do que eu pensava.  ', expectedRevision: 1 });
    expect(saved).toMatchObject({ status: 'done', note: 'Foi mais fácil do que eu pensava.', revision: 2 });
    expect(saved.doneAt).toBeTruthy();
    expect(await pendingMissions(db, { enrollmentId: enrA.id })).toHaveLength(0);
    const hist = await db.select().from(s.missionResponseEvents).where(eq(s.missionResponseEvents.responseId, saved.id));
    expect(hist.map((h) => [h.revision, h.status, h.source]).sort()).toEqual([[1, 'later', 'lesson'], [2, 'done', 'course']]);
    // editar o texto depois; apagar com texto vazio
    const edited = await saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: 'Agora com outro exemplo.', expectedRevision: 2 });
    expect(edited).toMatchObject({ revision: 3, note: 'Agora com outro exemplo.' });
    const cleared = await saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: '   ', expectedRevision: 3 });
    expect(cleared).toMatchObject({ revision: 4, note: null, status: 'done' });
    // gravar o mesmo conteúdo de novo não cria versão
    const same = await saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: null, expectedRevision: 4 });
    expect(same.revision).toBe(4);
  });

  it('regras: versão velha (outra aba), texto longo, voltar para "depois" e missão inexistente', async () => {
    await expect(saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: 'x', expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: 'a'.repeat(501), expectedRevision: 4 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'later', expectedRevision: 4 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'n1', status: 'done', expectedRevision: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'nao_existe', status: 'done', expectedRevision: 1 })).rejects.toBeInstanceOf(DomainError);
    const [row] = await db.select().from(s.missionResponses).where(eq(s.missionResponses.enrollmentId, enrA.id));
    expect(row!.revision).toBe(4); // nada disso gravou
  });

  it('refazer a aula e escolher "Vou fazer depois" não desfaz o "Já experimentei" já registrado', async () => {
    await saveMissionResponse(db, { enrollmentId: enrA.id, nodeId: 'missao', status: 'done', note: 'Contei para uma colega.', expectedRevision: 4 });
    const refeita = await answerInLesson(enrA.id, { kind: 'mission', status: 'later' }, { fresh: true });
    // o servidor devolve o status que ficou valendo, não o que foi tocado: a confirmação do player lê este
    expect(refeita.mission).toEqual({ status: 'done', note: 'Contei para uma colega.' });
    const [row] = await db.select().from(s.missionResponses).where(eq(s.missionResponses.enrollmentId, enrA.id));
    expect(row).toMatchObject({ status: 'done', note: 'Contei para uma colega.', revision: 5 });
  });

  it('cada conta enxerga e muda só o seu registro', async () => {
    enrB = await enroll(B);
    expect(await missionRecords(db, { enrollmentId: enrB.id })).toEqual({});
    // B ainda não chegou à missão: não dá para registrar "como foi" por fora
    await expect(saveMissionResponse(db, { enrollmentId: enrB.id, nodeId: 'missao', status: 'done', expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await answerInLesson(enrB.id, { kind: 'mission', status: 'done', note: 'Testei com minha tia.' });
    const recA = await missionRecords(db, { enrollmentId: enrA.id });
    const recB = await missionRecords(db, { enrollmentId: enrB.id });
    expect(recA.missao).toMatchObject({ status: 'done', note: 'Contei para uma colega.' });
    expect(recB.missao).toMatchObject({ status: 'done', note: 'Testei com minha tia.', revision: 1 });
    const all = await db.select().from(s.missionResponses);
    expect(new Set(all.map((r) => r.userId))).toEqual(new Set([seeded.users[A], seeded.users[B]]));
    expect(all.every((r) => (r.enrollmentId === enrA.id ? r.userId === seeded.users[A] : r.userId === seeded.users[B]))).toBe(true);
  });

  it('o motor recusa nota longa e nota junto de "depois"; nada é gravado', async () => {
    const enr = await enroll('revisor@demo.local');
    await expect(answerInLesson(enr.id, { kind: 'mission', status: 'done', note: 'a'.repeat(501) })).rejects.toMatchObject({ code: 'ENGINE' });
    await expect(answerInLesson(enr.id, { kind: 'mission', status: 'later', note: 'não faz sentido' }, { eventId: 'm-outro-evento' })).rejects.toMatchObject({ code: 'ENGINE' });
    expect(await db.select().from(s.missionResponses).where(eq(s.missionResponses.enrollmentId, enr.id))).toHaveLength(0);
  });

  it('a missão não entra nas respostas "Na prática" nem na conta do selo da trilha', async () => {
    const ans = await courseAnswers(db, { enrollmentId: enrA.id });
    expect(ans.missao).toBeUndefined();
    await db.update(s.courses).set({ trail: 'Convivência' }).where(eq(s.courses.id, courseId));
    const st = await trailStatus(db, { workspaceId: seeded.workspaceId, userId: seeded.users[A]!, trail: 'Convivência' });
    const c = st.courses.find((x) => x.courseId === courseId)!;
    expect(c.done).toBe(true);
    expect(c.missingActivities).toEqual([]);
  });
});
