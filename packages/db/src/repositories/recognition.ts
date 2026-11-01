import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import {
  BADGE_CODE_ALPHABET,
  allLessons,
  badgeEligibility,
  competencyFromObjective,
  competencyNamesFor,
  trailWorkload,
  gradeTrailCheck,
  isBadgeCode,
  seriesForTrail,
  sortBySeriesOrder,
  trailCheckFor,
  trailSlug,
  type BadgeEligibility,
  type CourseDocument,
  type TrailCheckResult,
  type TrailCourseState,
} from '@lms/course-schema';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { courseAnswers } from './learning';
import { getLatestVersion } from './publishing';

/**
 * Reconhecimento: conquista por curso (curso concluído) e Selo DNA Work por trilha (cursos concluídos +
 * atividades "Na prática" salvas + checagem final aprovada). Ver course-schema/src/trails.ts.
 */

export type TrailBadge = typeof s.trailBadges.$inferSelect;

export interface TrailCourse extends TrailCourseState {
  /** chave estável do curso (ordem das partes nas trilhas em série) */
  slug: string;
  enrollmentId: string | null;
}

export interface TrailStatus {
  trail: string;
  key: string;
  courses: TrailCourse[];
  competencies: string[];
  hasCheck: boolean;
  checkPassed: boolean;
  /** quantas vezes a pessoa já enviou a checagem desta trilha (base da ordem embaralhada das opções) */
  checkAttempts: number;
  lastCheck: { correct: number; total: number; passed: boolean; createdAt: Date } | null;
  eligibility: BadgeEligibility;
  badge: TrailBadge | null;
}

/** Nomes das trilhas com cursos publicados no workspace (como em `courses.trail`). */
export async function listTrails(db: DbOrTx, workspaceId: string): Promise<string[]> {
  const rows = await db.select({ trail: s.courses.trail }).from(s.courses).where(and(eq(s.courses.workspaceId, workspaceId), eq(s.courses.status, 'published')));
  return [...new Set(rows.map((r) => r.trail).filter((t): t is string => !!t?.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** A trilha cujo `trailSlug` é `key` (null se não existe no workspace). */
export async function trailByKey(db: DbOrTx, workspaceId: string, key: string): Promise<string | null> {
  return (await listTrails(db, workspaceId)).find((t) => trailSlug(t) === key) ?? null;
}

/**
 * Atividades "Na prática" (reflexão) da versão: id e título. `optionalLessonIds` (aulas acrescentadas depois de a pessoa
 * concluir o curso) ficam de fora: conteúdo novo não pode tirar o selo de quem já cumpriu a trilha.
 * (A missão "Leve para a vida real" é outro tipo de bloco e nunca entra aqui: não bloqueia o selo.)
 */
function activitiesOf(doc: CourseDocument, optionalLessonIds: readonly string[] = []): Array<{ id: string; title: string }> {
  const optional = new Set(optionalLessonIds);
  return allLessons(doc).filter((l) => !optional.has(l.id)).flatMap((l) => l.graph.nodes.filter((n) => n.type === 'reflection').map((n) => ({ id: n.id, title: (n.title ?? n.id).replace(/^miss[aã]o\s*:\s*/i, '').trim() })));
}

export async function trailStatus(db: DbOrTx, input: { workspaceId: string; userId: string; trail: string }): Promise<TrailStatus> {
  const key = trailSlug(input.trail);
  const rows = await db
    .select({ id: s.courses.id, title: s.courses.title, slug: s.courses.slug })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, input.workspaceId), eq(s.courses.status, 'published'), eq(s.courses.trail, input.trail)))
    .orderBy(asc(s.courses.title));
  // trilha em série: as partes na ordem do currículo (as outras, por título)
  const series = seriesForTrail(input.trail);
  const courses = series ? sortBySeriesOrder(series, rows, (c) => c.slug) : rows;
  const out: TrailCourse[] = [];
  const competencies: string[] = [];
  for (const c of courses) {
    const [enr] = await db.select().from(s.enrollments).where(and(eq(s.enrollments.courseId, c.id), eq(s.enrollments.userId, input.userId)));
    let doc: CourseDocument | undefined;
    if (enr) {
      const [v] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.id, enr.courseVersionId));
      doc = v?.document;
    } else {
      doc = (await getLatestVersion(db, c.id))?.document;
    }
    for (const o of doc?.objectives ?? []) {
      const comp = competencyFromObjective(o.title);
      if (!competencies.includes(comp)) competencies.push(comp);
    }
    let missingActivities: string[] = [];
    if (enr && doc) {
      const answers = await courseAnswers(db, { enrollmentId: enr.id });
      missingActivities = activitiesOf(doc, enr.optionalLessonIds).filter((a) => !answers[a.id]?.text?.trim()).map((a) => a.title);
    }
    out.push({ courseId: c.id, title: c.title, slug: c.slug, enrolled: !!enr, done: enr?.status === 'completed', enrollmentId: enr?.id ?? null, missingActivities });
  }
  const check = trailCheckFor(input.trail);
  const attempts = await db
    .select()
    .from(s.trailCheckAttempts)
    .where(and(eq(s.trailCheckAttempts.userId, input.userId), eq(s.trailCheckAttempts.trailKey, key)))
    .orderBy(desc(s.trailCheckAttempts.createdAt));
  const checkPassed = attempts.some((a) => a.passed);
  const last = attempts[0];
  const [badge] = await db.select().from(s.trailBadges).where(and(eq(s.trailBadges.userId, input.userId), eq(s.trailBadges.trailKey, key)));
  return {
    trail: input.trail,
    key,
    courses: out,
    // conteúdo curado da trilha, quando existe; senão os derivados dos objetivos dos cursos
    competencies: competencyNamesFor(input.trail, competencies),
    hasCheck: !!check,
    checkPassed,
    checkAttempts: attempts.length,
    lastCheck: last ? { correct: last.correct, total: last.total, passed: last.passed, createdAt: last.createdAt } : null,
    eligibility: badgeEligibility({ courses: out, checkPassed, hasCheck: !!check }),
    badge: badge && !badge.revokedAt ? badge : null,
  };
}

/** Quantas vezes a pessoa já enviou a checagem final desta trilha (a próxima tentativa embaralha as opções com este número). */
export async function trailCheckAttemptCount(db: DbOrTx, input: { userId: string; trail: string }): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(s.trailCheckAttempts)
    .where(and(eq(s.trailCheckAttempts.userId, input.userId), eq(s.trailCheckAttempts.trailKey, trailSlug(input.trail))));
  return row?.n ?? 0;
}

/**
 * Carga horária da trilha (minutos): aulas da versão publicada mais recente de cada curso publicado da trilha
 * + o tempo fixo da checagem final (ver `trailWorkload`).
 */
export async function trailWorkloadMinutes(db: DbOrTx, input: { workspaceId: string; trail: string }): Promise<number> {
  const courses = await db
    .select({ id: s.courses.id })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, input.workspaceId), eq(s.courses.status, 'published'), eq(s.courses.trail, input.trail)));
  const docs: CourseDocument[] = [];
  for (const c of courses) {
    const doc = (await getLatestVersion(db, c.id))?.document;
    if (doc) docs.push(doc);
  }
  return trailWorkload(docs);
}

/** Carga horária do selo: a gravada na emissão; em selos anteriores a essa coluna, recalculada das versões publicadas. */
export async function badgeWorkloadMinutes(db: DbOrTx, badge: Pick<TrailBadge, 'workspaceId' | 'trailName' | 'workloadMinutes'>): Promise<number> {
  return badge.workloadMinutes ?? (await trailWorkloadMinutes(db, { workspaceId: badge.workspaceId, trail: badge.trailName }));
}

function badgeCode(): string {
  const b = randomBytes(8);
  const ch = (i: number) => BADGE_CODE_ALPHABET[b[i]! % BADGE_CODE_ALPHABET.length];
  return `DNA-${ch(0)}${ch(1)}${ch(2)}${ch(3)}-${ch(4)}${ch(5)}${ch(6)}${ch(7)}`;
}

/** Emite o selo se a pessoa cumpriu tudo (idempotente: um selo por pessoa e trilha). */
export async function issueBadgeIfEligible(db: Database, input: { workspaceId: string; userId: string; holderName: string; trail: string; checkAttemptId?: string }): Promise<TrailBadge | null> {
  const st = await trailStatus(db, input);
  if (st.badge) return st.badge;
  if (!st.eligibility.eligible) return null;
  for (let i = 0; i < 5; i++) {
    const rows = await db
      .insert(s.trailBadges)
      .values({
        id: newId('bdg'),
        code: badgeCode(),
        workspaceId: input.workspaceId,
        userId: input.userId,
        trailKey: st.key,
        trailName: st.trail,
        holderName: input.holderName.trim() || 'Participante',
        competencies: st.competencies,
        workloadMinutes: await trailWorkloadMinutes(db, input),
        courses: st.courses.map((c) => ({ courseId: c.courseId, title: c.title })),
        ...(input.checkAttemptId ? { checkAttemptId: input.checkAttemptId } : {}),
      })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return rows[0];
    // conflito: já emitido em paralelo (mesma pessoa e trilha) ou código repetido (tenta outro)
    const [existing] = await db.select().from(s.trailBadges).where(and(eq(s.trailBadges.userId, input.userId), eq(s.trailBadges.trailKey, st.key)));
    if (existing) return existing;
  }
  throw new DomainError('CONFLICT', 'Não foi possível gerar o código do selo; tente de novo');
}

/** Envio da checagem final: registra a tentativa, devolve o retorno e emite o selo se agora estiver tudo pronto. */
export async function submitTrailCheck(
  db: Database,
  input: { workspaceId: string; userId: string; holderName: string; trail: string; answers: Record<string, string> },
): Promise<{ result: TrailCheckResult; badge: TrailBadge | null; status: TrailStatus }> {
  const check = trailCheckFor(input.trail);
  if (!check) throw new DomainError('NOT_FOUND', 'Esta trilha ainda não tem checagem final');
  const result = gradeTrailCheck(check, input.answers);
  const answers = Object.fromEntries(Object.entries(input.answers).filter(([k, v]) => typeof v === 'string' && check.situations.some((x) => x.id === k)));
  const [attempt] = await db
    .insert(s.trailCheckAttempts)
    .values({ id: newId('tck'), workspaceId: input.workspaceId, userId: input.userId, trailKey: trailSlug(input.trail), trailName: check.trail, answers, correct: result.correct, total: result.total, passed: result.passed })
    .returning();
  const badge = result.passed ? await issueBadgeIfEligible(db, { ...input, ...(attempt ? { checkAttemptId: attempt.id } : {}) }) : null;
  const status = await trailStatus(db, input);
  return { result, badge: badge ?? status.badge, status };
}

/** Verificação pública: só os dados do selo (nome, trilha, competências, datas); null se o código não existe. */
export async function getBadgeByCode(db: DbOrTx, code: string): Promise<TrailBadge | null> {
  const c = code.trim().toUpperCase();
  if (!isBadgeCode(c)) return null;
  const [b] = await db.select().from(s.trailBadges).where(eq(s.trailBadges.code, c));
  return b ?? null;
}

export async function listBadgesForUser(db: DbOrTx, userId: string): Promise<TrailBadge[]> {
  return db.select().from(s.trailBadges).where(eq(s.trailBadges.userId, userId)).orderBy(asc(s.trailBadges.issuedAt));
}
