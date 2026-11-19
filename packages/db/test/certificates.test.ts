import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { CourseDocumentSchema, isBadgeCode, richTextFromPlain, type CourseDocument } from '@lms/course-schema';
import type { Intent } from '@lms/course-engine';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, type Database } from '../src';
import { createCourse, getDraft } from '../src/repositories/authoring';
import { publishCourse } from '../src/repositories/publishing';
import { applyLearnerEvent, enrollStudent, startOrResumeAttempt } from '../src/repositories/learning';
import { getByCode, getIssuer, issueIfEligible, revoke, setIssuer, statusForEnrollment, tryIssue } from '../src/repositories/certificates';
import { progressRows } from '../src/repositories/reports';
import { collectUserData, eraseUser } from '../src/repositories/privacy';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let authorId: string;
let courseId: string;
let plainCourseId: string;
let seq = 0;

const text = (t: string) => richTextFromPlain(t);
const question = (id: string, n: number) => ({
  id,
  type: 'assessment',
  title: `Revisão · pergunta ${n} de 2`,
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

/** Uma aula: conteúdo → reflexão obrigatória → avaliação de 2 perguntas ("Aprovação: 1 de 2") → fim. */
const docWith = (certificate: CourseDocument['certificate']) =>
  CourseDocumentSchema.parse({
    schemaVersion: 1,
    title: 'Curso com certificado',
    ...(certificate ? { certificate } : {}),
    modules: [
      {
        id: 'm1',
        title: 'Começando',
        lessons: [
          {
            id: 'aula_1',
            title: 'Aula 1',
            estimatedMinutes: 40,
            graph: {
              schemaVersion: 1,
              startNodeId: 'n1',
              variables: [{ name: 'acertos', type: 'number', initial: 0, label: 'Acertos', scope: 'lesson' }],
              nodes: [
                { id: 'n1', type: 'content', body: text('Conteúdo') },
                { id: 'r1', type: 'reflection', title: 'Seu plano', prompt: text('Qual é o seu plano?'), minLength: 0 },
                question('av1_q1', 1),
                question('av1_q2', 2),
                { id: 'fim', type: 'end', summary: text('Fim') },
              ],
              edges: [
                { id: 'e0', from: 'n1', to: 'r1' },
                { id: 'e1', from: 'r1', to: 'av1_q1' },
                { id: 'e2ok', from: 'av1_q1', to: 'av1_q2', condition: { op: 'passed', nodeId: 'av1_q1' }, priority: 1, effects: inc },
                { id: 'e2', from: 'av1_q1', to: 'av1_q2', isDefault: true },
                { id: 'e3ok', from: 'av1_q2', to: 'fim', condition: { op: 'gte', var: 'acertos', value: 1 }, priority: 1 },
                { id: 'e3', from: 'av1_q2', to: 'fim', isDefault: true },
              ],
            },
          },
        ],
      },
    ],
  });

async function publish(doc: CourseDocument, title: string) {
  const course = await createCourse(db, { workspaceId: seeded.workspaceId, title, createdBy: authorId, document: doc });
  const draft = (await getDraft(db, course.id))!;
  await publishCourse(db, { courseId: course.id, userId: authorId, expectedRevision: draft.revision });
  return course.id;
}

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  authorId = seeded.users['autor@demo.local']!;
  courseId = await publish(docWith({ enabled: true }), 'Curso com certificado');
  plainCourseId = await publish(docWith(undefined), 'Curso sem certificado');
});
afterAll(async () => {
  await close();
});

async function newLearner(opts: { course?: string; rgm?: string } = {}) {
  const id = newId('usr');
  const n = ++seq;
  const email = `lgpd-teste-cert-${n}-${id.slice(-6)}@demo.local`;
  await db.insert(s.user).values({ id, email, name: `Aluna Certificado ${n}`, emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student', ...(opts.rgm ? { rgm: opts.rgm } : {}) });
  const { enrollment } = await enrollStudent(db, { courseId: opts.course ?? courseId, userId: id, createdBy: authorId });
  return { userId: id, email, enrollmentId: enrollment.id };
}

/** Faz a aula inteira: reflexão (texto) e as duas perguntas (`a` certa, `b` errada). */
async function playLesson(enrollmentId: string, answers: { reflection: string; q1: 'a' | 'b'; q2: 'a' | 'b' }, forceNew = false) {
  const { attempt } = await startOrResumeAttempt(db, { enrollmentId, lessonId: 'aula_1', ...(forceNew ? { forceNew: true } : {}) });
  let revision = attempt.revision;
  let nodeId = attempt.state.currentNodeId;
  const send = async (intent: Intent) => {
    const r = await applyLearnerEvent(db, { attemptId: attempt.id, eventId: newId('ev'), nodeId, expectedRevision: revision, intent });
    revision = r.revision;
    nodeId = r.toNodeId;
    return r;
  };
  await send({ kind: 'advance' });
  await send({ kind: 'reflect', text: answers.reflection });
  await send({ kind: 'assess', optionIds: [answers.q1] });
  return send({ kind: 'assess', optionIds: [answers.q2] });
}

const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return 'OK';
};

describe('regra de emissão', () => {
  it('antes de concluir: falta concluir, responder a reflexão e a avaliação', async () => {
    const l = await newLearner();
    const st = await statusForEnrollment(db, l.enrollmentId);
    expect(st.offered).toBe(true);
    expect(st.certificate).toBeNull();
    expect(st.rule.eligible).toBe(false);
    expect(st.rule.pending.map((p) => p.kind)).toEqual(['course', 'assessment', 'reflection']);
    expect(await issueIfEligible(db, { enrollmentId: l.enrollmentId })).toBeNull();
  });

  it('reprovado na avaliação: conclui o curso sem certificado; refazer e passar emite uma vez só', async () => {
    const l = await newLearner({ rgm: 'RGM-77' });
    const done = await playLesson(l.enrollmentId, { reflection: 'Vou estudar todo dia.', q1: 'b', q2: 'b' });
    expect(done.courseCompleted).toBe(true);
    const st = await statusForEnrollment(db, l.enrollmentId);
    expect(st.rule.pending).toEqual([expect.objectContaining({ kind: 'assessment', lessonId: 'aula_1', label: expect.stringContaining('0 de 2 acertos (precisa de 1)') })]);
    expect(await tryIssue(db, l.enrollmentId)).toBeNull();

    // refaz a aula e acerta 1 de 2 (o mínimo do roteiro)
    await playLesson(l.enrollmentId, { reflection: 'Vou estudar todo dia.', q1: 'a', q2: 'b' }, true);
    expect((await statusForEnrollment(db, l.enrollmentId)).rule).toEqual({ eligible: true, pending: [] });
    const cert = (await issueIfEligible(db, { enrollmentId: l.enrollmentId }))!;
    expect(isBadgeCode(cert.code)).toBe(true);
    expect(cert).toMatchObject({
      courseId,
      userId: l.userId,
      holderName: expect.stringMatching(/^Aluna Certificado \d+$/),
      holderRgm: 'RGM-77',
      courseTitle: 'Curso com certificado',
      workloadMinutes: 40,
      program: [{ title: 'Começando', minutes: 40, lessons: ['Aula 1'] }],
      revokedAt: null,
    });
    expect(cert.completedAt).toBeInstanceOf(Date);

    // emissão única: chamar de novo devolve o mesmo
    expect((await issueIfEligible(db, { enrollmentId: l.enrollmentId }))!.id).toBe(cert.id);
    const rows = await db.select().from(s.courseCertificates).where(eq(s.courseCertificates.enrollmentId, l.enrollmentId));
    expect(rows).toHaveLength(1);
    // evento para o webhook
    const events = await db.select().from(s.outboxEvents).where(and(eq(s.outboxEvents.type, 'certificate.issued'), eq(s.outboxEvents.payload, { enrollmentId: l.enrollmentId, courseId, userId: l.userId, certificateId: cert.id, code: cert.code })));
    expect(events).toHaveLength(1);
    // relatório de progresso traz o código
    const page = await progressRows(db, { workspaceId: seeded.workspaceId, courseId, limit: 500 });
    expect(page.itens.find((r) => r.matricula_id === l.enrollmentId)?.certificado_codigo).toBe(cert.code);
  });

  it('reflexão obrigatória vazia segura o certificado', async () => {
    const l = await newLearner();
    await playLesson(l.enrollmentId, { reflection: '   ', q1: 'a', q2: 'a' });
    const st = await statusForEnrollment(db, l.enrollmentId);
    expect(st.rule.pending.map((p) => p.kind)).toEqual(['reflection']);
    expect(await issueIfEligible(db, { enrollmentId: l.enrollmentId })).toBeNull();
  });

  it('curso sem certificado ligado: nunca emite', async () => {
    const l = await newLearner({ course: plainCourseId });
    await playLesson(l.enrollmentId, { reflection: 'Plano feito.', q1: 'a', q2: 'a' });
    const st = await statusForEnrollment(db, l.enrollmentId);
    expect(st.offered).toBe(false);
    expect(st.rule.eligible).toBe(true);
    expect(await issueIfEligible(db, { enrollmentId: l.enrollmentId })).toBeNull();
  });
});

describe('verificação, cancelamento e emissor', () => {
  it('código vale em maiúsculas ou minúsculas; cancelado continua consultável e não é reemitido', async () => {
    const l = await newLearner();
    await playLesson(l.enrollmentId, { reflection: 'Plano feito.', q1: 'a', q2: 'a' });
    const cert = (await issueIfEligible(db, { enrollmentId: l.enrollmentId }))!;
    expect((await getByCode(db, cert.code.toLowerCase()))?.id).toBe(cert.id);
    expect(await getByCode(db, 'DNA-0000-0000')).toBeNull();
    expect(await getByCode(db, 'qualquer coisa')).toBeNull();

    expect(await errCode(revoke(db, { workspaceId: 'ws_outro', certificateId: cert.id, reason: 'teste' }))).toBe('NOT_FOUND');
    await revoke(db, { workspaceId: seeded.workspaceId, certificateId: cert.id, reason: 'Emitido por engano' });
    const after = (await getByCode(db, cert.code))!;
    expect(after.revokedAt).toBeInstanceOf(Date);
    expect(after.revokedReason).toBe('Emitido por engano');
    expect((await statusForEnrollment(db, l.enrollmentId)).certificate).toBeNull();
    expect(await issueIfEligible(db, { enrollmentId: l.enrollmentId })).toBeNull();
  });

  it('emissor: valida CNPJ e imagens do workspace; o certificado guarda o emissor do dia da emissão', async () => {
    expect((await getIssuer(db, seeded.workspaceId)).institution).toBe('');
    expect(await errCode(setIssuer(db, { workspaceId: seeded.workspaceId, issuer: { cnpj: '123' } }))).toBe('VALIDATION');
    expect(await errCode(setIssuer(db, { workspaceId: seeded.workspaceId, issuer: { logoAssetId: 'ast_naoexiste' } }))).toBe('VALIDATION');
    await setIssuer(db, { workspaceId: seeded.workspaceId, issuer: { institution: 'DNA Work Educação', cnpj: '12.345.678/0001-90', signerName: 'Ana Souza', signerRole: 'Diretora' } });
    expect(await getIssuer(db, seeded.workspaceId)).toMatchObject({ institution: 'DNA Work Educação', cnpj: '12.345.678/0001-90', showPlatformBrand: true });

    const l = await newLearner();
    await playLesson(l.enrollmentId, { reflection: 'Plano feito.', q1: 'a', q2: 'a' });
    const cert = (await issueIfEligible(db, { enrollmentId: l.enrollmentId }))!;
    expect(cert.issuer).toMatchObject({ institution: 'DNA Work Educação', signerName: 'Ana Souza' });
    await setIssuer(db, { workspaceId: seeded.workspaceId, issuer: { institution: 'Outra' } });
    expect((await getByCode(db, cert.code))!.issuer).toMatchObject({ institution: 'DNA Work Educação' });
  });
});

describe('privacidade', () => {
  it('exportação lista os certificados; apagar a conta cancela e tira nome e RGM', async () => {
    const l = await newLearner({ rgm: 'RGM-99' });
    await playLesson(l.enrollmentId, { reflection: 'Plano feito.', q1: 'a', q2: 'a' });
    const cert = (await issueIfEligible(db, { enrollmentId: l.enrollmentId }))!;
    const data = await collectUserData(db, l.email);
    expect(JSON.stringify(data)).toContain(cert.code);
    await eraseUser(db, { email: l.email, apply: true });
    const after = (await getByCode(db, cert.code))!;
    expect(after.revokedAt).toBeInstanceOf(Date);
    expect(after.holderRgm).toBeNull();
    expect(after.holderName).not.toMatch(/Aluna Certificado/);
  });
});
