import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import type { Intent } from '@lms/course-engine';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, startOrResumeAttempt } from '../src/repositories/learning';
import { reviewSubmission } from '../src/repositories/submissions';
import { assessmentGroupsOf, decodeCursor, encodeCursor, progressRows, progressRowsAll, summarizeAssessments } from '../src/repositories/reports';
import type { SeedResult } from '../src/seed/seed';

/*
 * Relatório de progresso contra o banco de teste. Curso com:
 *  - aula_1: conteúdo → bloco AV (3 perguntas encadeadas, "2 de 3" para aprovar, como o importador gera) → tarefa obrigatória → fim
 *            (reprovado na revisão cai em "fim_revisar", sem a tarefa);
 *  - aula_2: conteúdo → fim.
 */
let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let reviewerId: string;
let courseId: string;
let seq = 0;

const text = (t: string) => richTextFromPlain(t);
const question = (id: string, n: number) => ({
  id,
  type: 'assessment',
  title: `Revisão · pergunta ${n} de 3`,
  prompt: text(`Pergunta ${n}?`),
  mode: 'single',
  options: [
    { id: 'a', label: 'Certa', correct: true },
    { id: 'b', label: 'Errada', correct: false },
  ],
  passing: { kind: 'all_correct' },
  maxAttempts: 1,
});
const inc = [{ op: 'inc', var: 'acertos', by: 1 }];
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso do relatório',
  completion: { requiredLessonIds: ['aula_1', 'aula_2'] },
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
            variables: [{ name: 'acertos', type: 'number', initial: 0, label: 'Acertos', scope: 'lesson' }],
            nodes: [
              { id: 'n1', type: 'content', body: text('Conteúdo') },
              question('av1_q1', 1),
              question('av1_q2', 2),
              question('av1_q3', 3),
              { id: 't_req', type: 'task', title: 'Entrega', instruction: 'Envie o link.', deliverable: 'link', criteria: [{ id: 'c1', label: 'Abre' }] },
              { id: 'fim1', type: 'end', summary: text('Fim') },
              { id: 'fim_revisar', type: 'end', summary: text('Revise') },
            ],
            edges: [
              { id: 'e0', from: 'n1', to: 'av1_q1' },
              { id: 'e1ok', from: 'av1_q1', to: 'av1_q2', condition: { op: 'passed', nodeId: 'av1_q1' }, priority: 1, effects: inc },
              { id: 'e1', from: 'av1_q1', to: 'av1_q2', isDefault: true },
              { id: 'e2ok', from: 'av1_q2', to: 'av1_q3', condition: { op: 'passed', nodeId: 'av1_q2' }, priority: 1, effects: inc },
              { id: 'e2', from: 'av1_q2', to: 'av1_q3', isDefault: true },
              { id: 'e3ok', from: 'av1_q3', to: 't_req', condition: { op: 'and', conditions: [{ op: 'gte', var: 'acertos', value: 1 }, { op: 'passed', nodeId: 'av1_q3' }] }, priority: 1, effects: inc },
              { id: 'e3ja', from: 'av1_q3', to: 't_req', condition: { op: 'gte', var: 'acertos', value: 2 }, priority: 2 },
              { id: 'e3', from: 'av1_q3', to: 'fim_revisar', isDefault: true },
              { id: 'e4', from: 't_req', to: 'fim1' },
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
              { id: 'fim2', type: 'end', summary: text('Fim') },
            ],
            edges: [{ id: 'e1', from: 'n2', to: 'fim2' }],
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
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title: 'Curso do relatório', createdBy: authorId, document: doc, slug: 'curso-relatorio' });
  courseId = course.id;
  const draft = (await getDraft(db, courseId))!;
  await publishCourse(db, { courseId, userId: authorId, expectedRevision: draft.revision });
});
afterAll(async () => {
  await close();
});

async function newLearner(opts: { rgm?: string } = {}) {
  const id = newId('usr');
  const n = ++seq;
  await db.insert(s.user).values({ id, email: `progresso-teste-${n}-${id.slice(-6)}@demo.local`, name: `Aluno Progresso ${n}`, emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student', ...(opts.rgm ? { rgm: opts.rgm } : {}) });
  const { enrollment } = await enrollStudent(db, { courseId, userId: id, createdBy: authorId });
  return { userId: id, enrollmentId: enrollment.id };
}

/** abre a aula e devolve o envio de eventos */
async function inLesson(enrollmentId: string, lessonId: string) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId });
  let revision = attempt.revision;
  let nodeId = attempt.state.currentNodeId;
  const send = async (intent: Intent) => {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: newId('ev'), nodeId, expectedRevision: revision, intent });
    revision = r.revision;
    nodeId = r.toNodeId;
    return r;
  };
  return { send };
}
const right: Intent = { kind: 'assess', optionIds: ['a'] };
const wrong: Intent = { kind: 'assess', optionIds: ['b'] };
/** responde as perguntas do AV na ordem (`true` = acerta); para no que faltar */
async function answerAv(enrollmentId: string, answers: boolean[]) {
  const l = await inLesson(enrollmentId, 'aula_1');
  await l.send({ kind: 'advance' });
  for (const ok of answers) await l.send(ok ? right : wrong);
  return l;
}
async function finishLesson2(enrollmentId: string) {
  const l = await inLesson(enrollmentId, 'aula_2');
  await l.send({ kind: 'advance' });
}
const rowOf = async (enrollmentId: string) => {
  const page = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 500 });
  return page.itens.find((r) => r.matricula_id === enrollmentId)!;
};

describe('grupos de avaliação', () => {
  it('junta as perguntas do bloco AV e lê o "2 de 3" da aresta de aprovação', () => {
    const groups = assessmentGroupsOf(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ lessonId: 'aula_1', groupId: 'av1', title: 'Revisão', nodeIds: ['av1_q1', 'av1_q2', 'av1_q3'], passMin: 2 });
  });

  it('avaliação solta (id sem _qN) é um grupo de uma pergunta, que exige acertar', () => {
    const solo = CourseDocumentSchema.parse({
      schemaVersion: 1,
      title: 'x',
      modules: [{ id: 'm', title: 'M', lessons: [{ id: 'l', title: 'L', graph: { schemaVersion: 1, startNodeId: 'q', nodes: [{ ...question('quiz', 1), title: 'Quiz' }, { id: 'f', type: 'end', summary: text('f') }], edges: [{ id: 'e', from: 'quiz', to: 'f' }] } }] }],
    });
    const groups = assessmentGroupsOf(solo);
    expect(groups[0]).toMatchObject({ groupId: 'quiz', nodeIds: ['quiz'], passMin: null });
    const sum = (passed: boolean) => summarizeAssessments(groups, [{ lessonId: 'l', attemptNumber: 1, status: 'completed', state: { path: [], answers: { quiz: { passed, answeredAt: 'x' } } } }]);
    expect(sum(true)[0]).toMatchObject({ acertos: 1, total: 1, aprovado: true });
    expect(sum(false)[0]).toMatchObject({ acertos: 0, total: 1, aprovado: false });
  });
});

describe('progressRows', () => {
  it('matriculado e sem começar: zeros, avaliação sem resultado, tarefa pendente, sem acesso', async () => {
    const l = await newLearner({ rgm: 'RGM-001' });
    const r = await rowOf(l.enrollmentId);
    expect(r).toMatchObject({
      status_matricula: 'active',
      aluno: { id: l.userId, rgm: 'RGM-001' },
      curso: { id: courseId, slug: 'curso-relatorio', titulo: 'Curso do relatório' },
      primeiro_acesso: null,
      ultimo_acesso: null,
      aulas_concluidas: 0,
      aulas_total: 2,
      tarefa: { status: 'pendente', total: 1, pendentes: 1 },
      curso_concluido: false,
      concluido_em: null,
      certificado_codigo: null,
    });
    expect(r.avaliacoes).toEqual([{ aula_id: 'aula_1', aula: 'Aula 1', grupo_id: 'av1', titulo: 'Revisão', acertos: 0, total: 3, respondidas: 0, aprovado: null }]);
    expect(r.atualizado_em).toBe(r.matriculado_em);
  });

  it('em andamento: uma pergunta certa de três ainda não tem resultado; o acesso vem da tentativa', async () => {
    const l = await newLearner();
    await answerAv(l.enrollmentId, [true]);
    const r = await rowOf(l.enrollmentId);
    expect(r.avaliacoes[0]).toMatchObject({ acertos: 1, total: 3, respondidas: 1, aprovado: null });
    expect(r.aulas_concluidas).toBe(0);
    expect(r.primeiro_acesso).not.toBeNull();
    expect(r.ultimo_acesso).not.toBeNull();
  });

  it('aprovado (2 de 3), tarefa enviada e depois aprovada, curso concluído', async () => {
    const l = await newLearner();
    const lesson = await answerAv(l.enrollmentId, [true, false, true]);
    let r = await rowOf(l.enrollmentId);
    expect(r.avaliacoes[0]).toMatchObject({ acertos: 2, total: 3, respondidas: 3, aprovado: true });
    expect(r.tarefa).toMatchObject({ status: 'pendente', total: 1, pendentes: 1 });

    await lesson.send({ kind: 'submit', link: 'https://exemplo.com/entrega' });
    r = await rowOf(l.enrollmentId);
    expect(r.aulas_concluidas).toBe(1);
    expect(r.tarefa).toMatchObject({ status: 'enviada', enviadas: 1, pendentes: 0 });
    expect(r.curso_concluido).toBe(false);

    const [sub] = await db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.enrollmentId, l.enrollmentId));
    await reviewSubmission(db, { submissionId: sub!.id, workspaceId: seeded.workspaceId, reviewerId, decision: 'return', criteria: [{ id: 'c1', met: false }], comment: 'Não abre', expectedRevision: sub!.revision });
    r = await rowOf(l.enrollmentId);
    expect(r.tarefa).toMatchObject({ status: 'devolvida', devolvidas: 1 });

    await db.update(s.taskSubmissions).set({ status: 'approved' }).where(eq(s.taskSubmissions.id, sub!.id));
    r = await rowOf(l.enrollmentId);
    expect(r.tarefa).toMatchObject({ status: 'aprovada', aprovadas: 1 });

    await finishLesson2(l.enrollmentId);
    r = await rowOf(l.enrollmentId);
    expect(r).toMatchObject({ aulas_concluidas: 2, aulas_total: 2, curso_concluido: true, status_matricula: 'completed' });
    expect(r.concluido_em).not.toBeNull();
    expect(r.certificado_codigo).toBeNull();
  });

  it('reprovado (1 de 3): a aula termina na revisão, sem a tarefa, que então não é cobrada', async () => {
    const l = await newLearner();
    await answerAv(l.enrollmentId, [false, true, false]);
    const r = await rowOf(l.enrollmentId);
    expect(r.avaliacoes[0]).toMatchObject({ acertos: 1, total: 3, respondidas: 3, aprovado: false });
    expect(r.aulas_concluidas).toBe(1);
    expect(r.tarefa).toMatchObject({ status: null, total: 0 });
  });

  it('primeiro e último acesso vêm de access_logs (e a tentativa completa quando o registro é mais novo)', async () => {
    const l = await newLearner();
    await answerAv(l.enrollmentId, [true]);
    const early = new Date(Date.now() - 3 * 24 * 3600_000);
    const late = new Date(Date.now() + 3600_000);
    await db.insert(s.accessLogs).values([
      { id: newId('acl'), userId: l.userId, kind: 'login', occurredAt: early },
      { id: newId('acl'), userId: l.userId, kind: 'renew', occurredAt: late },
    ]);
    const r = await rowOf(l.enrollmentId);
    expect(r.primeiro_acesso).toBe(early.toISOString());
    expect(r.ultimo_acesso).toBe(late.toISOString());
    expect(r.atualizado_em).toBe(late.toISOString());
  });

  it('não mistura workspaces', async () => {
    const wsId = newId('wsp');
    await db.insert(s.workspaces).values({ id: wsId, slug: `outro-${wsId.slice(-6)}`, name: 'Outro' });
    const other = await createCourse(db, { workspaceId: wsId, title: 'Outro curso', createdBy: authorId, document: doc, slug: 'curso-relatorio' });
    const draft = (await getDraft(db, other.id))!;
    await publishCourse(db, { courseId: other.id, userId: authorId, expectedRevision: draft.revision });
    const uid = newId('usr');
    await db.insert(s.user).values({ id: uid, email: `progresso-teste-outro-${uid.slice(-6)}@demo.local`, name: 'Aluno Outro', emailVerified: true });
    await enrollStudent(db, { courseId: other.id, userId: uid, createdBy: authorId });
    const mine = await progressRows(db, { workspaceId: seeded.workspaceId, limit: 500 });
    expect(mine.itens.every((r) => r.curso.id !== other.id && r.aluno.id !== uid)).toBe(true);
    const theirs = await progressRows(db, { workspaceId: wsId, limit: 500 });
    expect(theirs.itens.map((r) => r.aluno.id)).toEqual([uid]);
    // pedir o curso de outro workspace com o id dele não vaza
    expect((await progressRows(db, { workspaceId: seeded.workspaceId, courseId: other.id, limit: 10 })).itens).toEqual([]);
  });
});

describe('paginação e filtro desde', () => {
  it('percorre todas as páginas sem repetir nem pular, e o cursor aceita só o que o servidor gerou', async () => {
    for (let i = 0; i < 4; i++) await newLearner();
    const all = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 500 });
    expect(all.itens.length).toBeGreaterThanOrEqual(7);
    expect(all.proximoCursor).toBeNull();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const p = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 3, cursor });
      expect(p.itens.length).toBeLessThanOrEqual(3);
      seen.push(...p.itens.map((r) => r.matricula_id));
      cursor = p.proximoCursor;
      pages++;
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(all.itens.map((r) => r.matricula_id));
    expect(new Set(seen).size).toBe(seen.length);
    // uma matrícula nova durante a leitura não desloca as páginas já lidas
    const first = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 3 });
    const fresh = await newLearner();
    const rest = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 500, cursor: first.proximoCursor });
    expect(rest.itens.some((r) => first.itens.some((f) => f.matricula_id === r.matricula_id))).toBe(false);
    expect(rest.itens.map((r) => r.matricula_id)).toContain(fresh.enrollmentId);
    expect(() => decodeCursor('lixo')).toThrow(DomainError);
    expect(decodeCursor(encodeCursor('enr_x'))).toBe('enr_x');
    const streamed: string[] = [];
    for await (const chunk of progressRowsAll(db, { workspaceId: seeded.workspaceId, courseId, pageSize: 2 })) streamed.push(...chunk.map((r) => r.matricula_id));
    expect(streamed.length).toBeGreaterThanOrEqual(all.itens.length + 1);
  });

  it('desde: só entra quem teve matrícula, aula, entrega ou acesso depois do instante', async () => {
    const old = await newLearner();
    const active = await newLearner();
    const logged = await newLearner();
    const past = new Date(Date.now() - 10 * 24 * 3600_000);
    // envelhece tudo da matrícula "old" e "logged"
    for (const l of [old, logged, active]) await db.update(s.enrollments).set({ createdAt: past }).where(eq(s.enrollments.id, l.enrollmentId));
    const cut = new Date(Date.now() - 3600_000);
    const ids = async () => (await progressRows(db, { workspaceId: seeded.workspaceId, courseId, since: cut, limit: 500 })).itens.map((r) => r.matricula_id);
    let got = await ids();
    expect(got).not.toContain(old.enrollmentId);
    expect(got).not.toContain(active.enrollmentId);

    await answerAv(active.enrollmentId, [true]); // atividade de aula agora
    await db.insert(s.accessLogs).values({ id: newId('acl'), userId: logged.userId, kind: 'login', occurredAt: new Date() });
    got = await ids();
    expect(got).toContain(active.enrollmentId);
    expect(got).toContain(logged.enrollmentId);
    expect(got).not.toContain(old.enrollmentId);
    // toda linha devolvida tem atualizado_em depois do corte
    const rows = (await progressRows(db, { workspaceId: seeded.workspaceId, courseId, since: cut, limit: 500 })).itens;
    expect(rows.every((r) => new Date(r.atualizado_em) > cut)).toBe(true);
  });
});
