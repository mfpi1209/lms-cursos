import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  CertificateIssuerSchema,
  allLessons,
  certificateProgramOf,
  certificateWorkloadMinutes,
  evaluateCertificateRule,
  hasCertificate,
  isBadgeCode,
  parseCertificateIssuer,
  requiredLessonIdsFor,
  type CertificateIssuer,
  type CertificateRuleResult,
} from '@lms/course-schema';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { getEnrollmentWithVersion } from './learning';
import { badgeCode } from './recognition';
import { assessmentGroupsOf, reflectionSlotsOf, summarizeAssessments, summarizeReflections } from './reports';
import { taskRequirementsMet } from './submissions';

/**
 * Certificado de conclusão por curso. Regra em `course-schema/src/certificate.ts` (`evaluateCertificateRule`); aqui
 * ficam a leitura do estado da matrícula, a emissão única (um por matrícula), a verificação pública e o emissor do
 * workspace.
 *
 * Quem chama `issueIfEligible`: a conclusão do curso, o envio de reflexão/missão e a correção de tarefa (as três
 * coisas que podem fechar a regra), além da página do curso (para matrículas que fecharam a regra antes desta função
 * existir). É idempotente e barato quando não há o que fazer.
 */

export type CourseCertificate = typeof s.courseCertificates.$inferSelect;

export interface CertificateStatus {
  /** o curso desta matrícula oferece certificado (`certificate.enabled` na versão da matrícula) */
  offered: boolean;
  rule: CertificateRuleResult;
  certificate: CourseCertificate | null;
}

/* ------------------------------------------------------------------------ */
/* Emissor                                                                   */
/* ------------------------------------------------------------------------ */

export async function getIssuer(db: DbOrTx, workspaceId: string): Promise<CertificateIssuer> {
  const [w] = await db.select({ issuer: s.workspaces.certificateIssuer }).from(s.workspaces).where(eq(s.workspaces.id, workspaceId));
  return parseCertificateIssuer(w?.issuer);
}

/** Grava o emissor (validado). Logo e assinatura precisam ser imagens deste workspace. Certificados já emitidos não mudam. */
export async function setIssuer(db: DbOrTx, input: { workspaceId: string; issuer: unknown }): Promise<CertificateIssuer> {
  const parsed = CertificateIssuerSchema.safeParse(input.issuer);
  if (!parsed.success) throw new DomainError('VALIDATION', parsed.error.issues[0]?.message ?? 'Dados do emissor inválidos');
  for (const assetId of [parsed.data.logoAssetId, parsed.data.signatureAssetId]) {
    if (!assetId) continue;
    const [a] = await db.select({ id: s.assets.id }).from(s.assets).where(and(eq(s.assets.id, assetId), eq(s.assets.workspaceId, input.workspaceId), eq(s.assets.kind, 'image')));
    if (!a) throw new DomainError('VALIDATION', 'Logo e assinatura precisam ser imagens enviadas neste workspace');
  }
  await db.update(s.workspaces).set({ certificateIssuer: parsed.data }).where(eq(s.workspaces.id, input.workspaceId));
  return parsed.data;
}

/* ------------------------------------------------------------------------ */
/* Estado e emissão                                                          */
/* ------------------------------------------------------------------------ */

async function activeForEnrollment(db: DbOrTx, enrollmentId: string): Promise<CourseCertificate | null> {
  const [c] = await db
    .select()
    .from(s.courseCertificates)
    .where(and(eq(s.courseCertificates.enrollmentId, enrollmentId), isNull(s.courseCertificates.revokedAt)));
  return c ?? null;
}

/** Situação do certificado de uma matrícula: se o curso oferece, o que falta pela regra e o certificado, se já existe. */
export async function statusForEnrollment(db: DbOrTx, enrollmentId: string): Promise<CertificateStatus> {
  const ctx = await getEnrollmentWithVersion(db, enrollmentId);
  if (!ctx) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  const doc = ctx.document;
  const certificate = await activeForEnrollment(db, enrollmentId);
  const offered = hasCertificate(doc);
  const required = new Set(requiredLessonIdsFor(doc, ctx.enrollment.optionalLessonIds));
  const lessonTitle = new Map(allLessons(doc).map((l) => [l.id, l.title]));
  const attempts = await db
    .select({ lessonId: s.lessonAttempts.lessonId, attemptNumber: s.lessonAttempts.attemptNumber, status: s.lessonAttempts.status, state: s.lessonAttempts.state })
    .from(s.lessonAttempts)
    .where(eq(s.lessonAttempts.enrollmentId, enrollmentId))
    .orderBy(asc(s.lessonAttempts.attemptNumber));

  const groups = assessmentGroupsOf(doc).filter((g) => required.has(g.lessonId));
  const summaries = summarizeAssessments(groups, attempts);
  const assessments = groups.map((g, i) => {
    const sm = summaries[i]!;
    const total = g.nodeIds.length;
    return { lessonId: g.lessonId, lessonTitle: g.lessonTitle, title: g.title, correct: sm.acertos, total, passMin: Math.min(total, g.passMin !== null ? Math.max(g.passMin, 0) : total), passed: sm.aprovado };
  });
  const slots = reflectionSlotsOf(doc).filter((r) => r.required && required.has(r.lessonId));
  const missingReflections = summarizeReflections(slots, attempts)
    .filter((r) => r.resposta === null)
    .map((r) => ({ lessonId: r.aula_id, lessonTitle: r.aula, title: r.titulo }));
  const tasks = await taskRequirementsMet(db, { enrollmentId });
  const pendingTasks = tasks.pending.map((t) => ({ lessonId: t.lessonId, ...(lessonTitle.get(t.lessonId) ? { lessonTitle: lessonTitle.get(t.lessonId)! } : {}), title: t.title, status: t.status }));

  const rule = evaluateCertificateRule({ courseCompleted: ctx.enrollment.status === 'completed', assessments, missingReflections, pendingTasks });
  return { offered, rule, certificate };
}

async function codeTaken(db: DbOrTx, code: string): Promise<boolean> {
  const [a] = await db.select({ id: s.courseCertificates.id }).from(s.courseCertificates).where(eq(s.courseCertificates.code, code));
  if (a) return true;
  const [b] = await db.select({ id: s.trailBadges.id }).from(s.trailBadges).where(eq(s.trailBadges.code, code));
  return !!b;
}

/**
 * Emite o certificado se o curso oferece e a regra fechou. Idempotente: um certificado ativo por matrícula; chamar de
 * novo devolve o mesmo; depois de cancelado, não reemite. Grava nome, RGM, curso, carga, conteúdo e emissor do momento, e registra `certificate.issued`
 * no outbox (webhook). Devolve `null` quando não há certificado a emitir.
 */
export async function issueIfEligible(db: Database, input: { enrollmentId: string }): Promise<CourseCertificate | null> {
  // um por matrícula: ativo devolve o mesmo; cancelado pela equipe não volta sozinho (o cancelamento é decisão final)
  const [existing] = await db.select().from(s.courseCertificates).where(eq(s.courseCertificates.enrollmentId, input.enrollmentId));
  if (existing) return existing.revokedAt ? null : existing;
  const st = await statusForEnrollment(db, input.enrollmentId);
  if (!st.offered || !st.rule.eligible) return null;
  const ctx = (await getEnrollmentWithVersion(db, input.enrollmentId))!;
  const { enrollment, course, document: doc } = ctx;
  const [u] = await db.select({ name: s.user.name }).from(s.user).where(eq(s.user.id, enrollment.userId));
  const [m] = await db
    .select({ rgm: s.workspaceMemberships.rgm })
    .from(s.workspaceMemberships)
    .where(and(eq(s.workspaceMemberships.workspaceId, course.workspaceId), eq(s.workspaceMemberships.userId, enrollment.userId)));
  const issuer = await getIssuer(db, course.workspaceId);

  for (let i = 0; i < 5; i++) {
    const code = badgeCode();
    if (await codeTaken(db, code)) continue;
    const row = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(s.courseCertificates)
        .values({
          id: newId('cert'),
          code,
          workspaceId: course.workspaceId,
          courseId: course.id,
          courseVersionId: enrollment.courseVersionId,
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          holderName: u?.name?.trim() || 'Participante',
          holderRgm: m?.rgm ?? null,
          courseTitle: doc.title?.trim() || course.title,
          workloadMinutes: certificateWorkloadMinutes(doc),
          program: certificateProgramOf(doc, enrollment.optionalLessonIds),
          issuer,
          completedAt: enrollment.completedAt,
        })
        .onConflictDoNothing()
        .returning();
      const created = rows[0];
      if (created) {
        await tx.insert(s.outboxEvents).values({
          id: newId('obx'),
          type: 'certificate.issued',
          version: 1,
          payload: { enrollmentId: enrollment.id, courseId: course.id, userId: enrollment.userId, certificateId: created.id, code: created.code },
        });
      }
      return created ?? null;
    });
    if (row) return row;
    // conflito: emitido em paralelo para esta matrícula (devolve esse) ou código repetido (tenta outro)
    const again = await activeForEnrollment(db, input.enrollmentId);
    if (again) return again;
  }
  throw new DomainError('CONFLICT', 'Não foi possível gerar o código do certificado; tente de novo');
}

/** Emite, sem deixar o erro derrubar quem chamou (conclusão de aula, correção de tarefa): o certificado sai na próxima vez. */
export async function tryIssue(db: Database, enrollmentId: string): Promise<CourseCertificate | null> {
  try {
    return await issueIfEligible(db, { enrollmentId });
  } catch (e) {
    console.error('[certificado] falha ao emitir', enrollmentId, e instanceof Error ? e.message : e);
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Leitura                                                                   */
/* ------------------------------------------------------------------------ */

/** Verificação pública por código (inclui cancelados, para a página dizer que foi cancelado). */
export async function getByCode(db: DbOrTx, code: string): Promise<CourseCertificate | null> {
  const c = code.trim().toUpperCase();
  if (!isBadgeCode(c)) return null;
  const [row] = await db.select().from(s.courseCertificates).where(eq(s.courseCertificates.code, c));
  return row ?? null;
}

/** Código do certificado ativo por matrícula (relatório de progresso, API e webhook). */
export async function codesForEnrollments(db: DbOrTx, enrollmentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!enrollmentIds.length) return out;
  const rows = await db
    .select({ enrollmentId: s.courseCertificates.enrollmentId, code: s.courseCertificates.code })
    .from(s.courseCertificates)
    .where(and(inArray(s.courseCertificates.enrollmentId, enrollmentIds), isNull(s.courseCertificates.revokedAt)));
  for (const r of rows) if (r.enrollmentId) out.set(r.enrollmentId, r.code);
  return out;
}

export async function listForUser(db: DbOrTx, userId: string): Promise<CourseCertificate[]> {
  return db.select().from(s.courseCertificates).where(eq(s.courseCertificates.userId, userId)).orderBy(desc(s.courseCertificates.issuedAt));
}

/** Cancela um certificado (equipe). O código continua consultável e a página diz que foi cancelado. */
export async function revoke(db: DbOrTx, input: { workspaceId: string; certificateId: string; reason: string }): Promise<CourseCertificate> {
  const [row] = await db
    .update(s.courseCertificates)
    .set({ revokedAt: new Date(), revokedReason: input.reason.trim().slice(0, 300) || null })
    .where(and(eq(s.courseCertificates.id, input.certificateId), eq(s.courseCertificates.workspaceId, input.workspaceId), isNull(s.courseCertificates.revokedAt)))
    .returning();
  if (!row) throw new DomainError('NOT_FOUND', 'Certificado não encontrado ou já cancelado');
  return row;
}
