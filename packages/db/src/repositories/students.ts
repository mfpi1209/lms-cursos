import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database, DbOrTx, Transaction } from '../client';
import { newId } from '../ids';
import * as s from '../schema';
import { enrollStudent } from './learning';

/*
 * Cadastro de alunos em massa (CSV do estúdio e API de integração).
 *
 * - Idempotente pelo RGM dentro do workspace (recomendado): RGM conhecido atualiza nome, telefone e e-mail daquela pessoa;
 *   repetir o mesmo lote não cria nada de novo nem repete efeitos. Linha SEM RGM segue a regra antiga, pelo e-mail (compatibilidade).
 * - RGM novo + e-mail de aluno que já tem OUTRO RGM: erro na linha (`EMAIL_EM_USO_POR_OUTRO_RGM`), sem trocar dono de conta.
 *   RGM novo + e-mail de membro antigo sem RGM: o RGM é atribuído a esse membro.
 * - Troca de e-mail só por RGM conhecido; grava auditoria (`student.email_changed`) e encerra as sessões abertas da pessoa.
 * - A conta nasce SEM senha (nenhuma linha em `account`): o aluno entra por link mágico ou define a senha por "esqueci".
 * - RGM é único por workspace (índice parcial no banco).
 * - Equipe (admin/autor/revisor) nunca é alterada por este caminho: a linha volta com erro.
 * - O lote roda em transações por fatia (`chunkSize`); cada linha tem seu savepoint, então uma linha ruim não derruba as outras.
 */

export interface StudentInput {
  nome: string;
  email: string;
  /** recomendado: é a chave de idempotência. Em branco = compatibilidade, identifica pelo e-mail */
  rgm?: string;
  telefone?: string | null;
  /** slugs de cursos publicados do workspace */
  cursos?: string[];
}

export type StudentRowStatus = 'created' | 'updated' | 'unchanged' | 'error';

export interface StudentRowResult {
  /** posição da linha no lote recebido (0 = primeira) */
  index: number;
  email: string;
  status: StudentRowStatus;
  /** motivo, quando `status` é `error` */
  reason?: string;
  /** código estável do erro (ex.: `EMAIL_EM_USO_POR_OUTRO_RGM`), quando `status` é `error` */
  code?: StudentErrorCode;
  /** o e-mail da conta foi (ou, na prévia, seria) trocado; `email` é o novo */
  emailChanged?: boolean;
  userId?: string;
  /** cursos em que o aluno foi matriculado agora */
  enrolled: string[];
  /** cursos em que já estava matriculado */
  alreadyEnrolled: string[];
}

export type StudentErrorCode =
  | 'EMAIL_INVALIDO'
  | 'NOME_EM_BRANCO'
  | 'RGM_LONGO'
  | 'EMAIL_REPETIDO_NO_LOTE'
  | 'RGM_REPETIDO_NO_LOTE'
  | 'CURSO_INVALIDO'
  | 'CONTA_DA_EQUIPE'
  | 'EMAIL_EM_USO_POR_OUTRO_RGM'
  | 'EMAIL_EM_USO_POR_OUTRA_CONTA'
  | 'RGM_EM_USO'
  | 'EMAIL_EM_USO'
  | 'CADASTRO_SIMULTANEO'
  | 'FALHA_AO_GRAVAR';

export interface UpsertStudentsResult {
  results: StudentRowResult[];
  summary: Record<StudentRowStatus, number> & { total: number };
}

export const STUDENT_BATCH_MAX = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/;

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}
/** RGM comparado sem espaços nas pontas e sem diferença de caixa. */
export function normalizeRgm(rgm: unknown): string {
  return typeof rgm === 'string' || typeof rgm === 'number' ? String(rgm).trim().toUpperCase() : '';
}
function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

interface Prepared {
  index: number;
  email: string;
  name: string;
  rgm: string;
  phone: string | null;
  slugs: string[];
  error?: string;
  code?: StudentErrorCode;
}

function prepare(rows: StudentInput[], extraSlugs: string[]): Prepared[] {
  const seenEmail = new Map<string, number>();
  const seenRgm = new Map<string, number>();
  return rows.map((r, index) => {
    const email = normalizeEmail(r?.email);
    const name = cleanText(r?.nome, 200);
    const rgm = normalizeRgm(r?.rgm);
    const phone = cleanText(r?.telefone, 40) || null;
    const slugs = [...new Set([...(Array.isArray(r?.cursos) ? r.cursos : []), ...extraSlugs].map((x) => String(x).trim()).filter(Boolean))];
    const base = { index, email, name, rgm, phone, slugs };
    if (!isValidEmail(email)) return { ...base, error: 'E-mail inválido', code: 'EMAIL_INVALIDO' as const };
    if (!name) return { ...base, error: 'Nome em branco', code: 'NOME_EM_BRANCO' as const };
    if (rgm.length > 40) return { ...base, error: 'RGM longo demais', code: 'RGM_LONGO' as const };
    const prevEmail = seenEmail.get(email);
    if (prevEmail !== undefined) return { ...base, error: `E-mail repetido no lote (linha ${prevEmail + 1})`, code: 'EMAIL_REPETIDO_NO_LOTE' as const };
    seenEmail.set(email, index);
    if (rgm) {
      const prevRgm = seenRgm.get(rgm);
      if (prevRgm !== undefined) return { ...base, error: `RGM repetido no lote (linha ${prevRgm + 1})`, code: 'RGM_REPETIDO_NO_LOTE' as const };
      seenRgm.set(rgm, index);
    }
    return base;
  });
}

type CourseInfo = { id: string; published: boolean };

async function loadCourses(db: DbOrTx, workspaceId: string, slugs: string[]): Promise<Map<string, CourseInfo>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({ id: s.courses.id, slug: s.courses.slug, status: s.courses.status, archivedAt: s.courses.archivedAt, latest: s.courses.latestVersionNumber })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, workspaceId), inArray(s.courses.slug, slugs)));
  return new Map(rows.map((c) => [c.slug, { id: c.id, published: c.status === 'published' && !c.archivedAt && c.latest > 0 }]));
}

interface Planned {
  p: Prepared;
  plan: 'create' | 'update';
  existingUserId?: string;
  existingMember: boolean;
  patch: Partial<{ rgm: string; phone: string | null }>;
  nameChanged: boolean;
  /** troca de e-mail de uma conta existente (só por RGM conhecido) */
  emailChange?: { from: string; to: string };
}

/**
 * Aplica (ou, com `dryRun`, só confere) um lote de alunos. `enrollCourseSlugs` vale para todas as linhas, somado ao `cursos` de cada uma.
 * Linha ruim não lança: o motivo vem no resultado.
 */
export async function upsertStudents(
  db: Database,
  input: { workspaceId: string; actorId: string; rows: StudentInput[]; enrollCourseSlugs?: string[]; dryRun?: boolean; chunkSize?: number; source?: string },
): Promise<UpsertStudentsResult> {
  const { workspaceId, actorId } = input;
  const dryRun = input.dryRun ?? false;
  const prepared = prepare(input.rows, (input.enrollCourseSlugs ?? []).map((x) => String(x).trim()).filter(Boolean));
  const courses = await loadCourses(db, workspaceId, [...new Set(prepared.flatMap((p) => p.slugs))]);

  const valid = prepared.filter((p) => !p.error);
  const emails = valid.map((p) => p.email);
  const rgms = valid.map((p) => p.rgm).filter(Boolean);
  const existingUsers = emails.length ? await db.select().from(s.user).where(inArray(s.user.email, emails)) : [];
  const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const memberships = existingUsers.length
    ? await db
        .select()
        .from(s.workspaceMemberships)
        .where(and(eq(s.workspaceMemberships.workspaceId, workspaceId), inArray(s.workspaceMemberships.userId, existingUsers.map((u) => u.id))))
    : [];
  const memberByUser = new Map(memberships.map((m) => [m.userId, m]));
  const owners = rgms.length
    ? await db
        .select()
        .from(s.workspaceMemberships)
        .where(and(eq(s.workspaceMemberships.workspaceId, workspaceId), isNotNull(s.workspaceMemberships.rgm), inArray(sql`upper(${s.workspaceMemberships.rgm})`, rgms)))
    : [];
  const ownerOfRgm = new Map(owners.map((o) => [normalizeRgm(o.rgm), o]));
  const ownerUsers = owners.length ? await db.select().from(s.user).where(inArray(s.user.id, owners.map((o) => o.userId))) : [];
  const ownerUserById = new Map(ownerUsers.map((u) => [u.id, u]));

  const results: StudentRowResult[] = [];
  const todo: Planned[] = [];

  for (const p of prepared) {
    const res: StudentRowResult = { index: p.index, email: p.email, status: 'error', enrolled: [], alreadyEnrolled: [] };
    results.push(res);
    const fail = (code: StudentErrorCode, reason: string) => {
      res.code = code;
      res.reason = reason;
    };
    if (p.error) {
      fail(p.code!, p.error);
      continue;
    }
    const unknown = p.slugs.filter((slug) => !courses.get(slug)?.published);
    if (unknown.length) {
      fail('CURSO_INVALIDO', `Curso inexistente ou não publicado: ${unknown.join(', ')}`);
      continue;
    }
    const u = userByEmail.get(p.email);
    const uMember = u ? memberByUser.get(u.id) : undefined;
    const STAFF = 'Conta da equipe: não pode ser alterada por importação';
    if (uMember && uMember.role !== 'student') {
      fail('CONTA_DA_EQUIPE', STAFF);
      continue;
    }
    const phonePatch = (m: { phone: string | null } | undefined) => (p.phone && m?.phone !== p.phone ? { phone: p.phone } : {});
    const owner = p.rgm ? ownerOfRgm.get(p.rgm) : undefined;
    if (owner) {
      // RGM conhecido: é a mesma pessoa, mesmo que o e-mail seja outro
      if (owner.role !== 'student') {
        fail('CONTA_DA_EQUIPE', STAFF);
        continue;
      }
      const ownerUser = ownerUserById.get(owner.userId);
      if (!ownerUser) {
        fail('FALHA_AO_GRAVAR', 'Falha ao gravar esta linha');
        continue;
      }
      if (u && u.id !== owner.userId) {
        if (uMember?.rgm) fail('EMAIL_EM_USO_POR_OUTRO_RGM', 'E-mail já pertence a outro RGM neste workspace');
        else fail('EMAIL_EM_USO_POR_OUTRA_CONTA', 'E-mail já pertence a outra conta; a troca de e-mail não foi feita');
        continue;
      }
      res.status = 'unchanged';
      todo.push({
        p,
        plan: 'update',
        existingUserId: owner.userId,
        existingMember: true,
        patch: phonePatch(owner),
        nameChanged: ownerUser.name !== p.name,
        emailChange: u ? undefined : { from: ownerUser.email, to: p.email },
      });
      continue;
    }
    if (!u) {
      res.status = 'unchanged';
      todo.push({ p, plan: 'create', existingMember: false, patch: {}, nameChanged: false });
    } else if (!uMember) {
      res.status = 'unchanged';
      todo.push({ p, plan: 'update', existingUserId: u.id, existingMember: false, patch: { rgm: p.rgm || undefined, phone: p.phone }, nameChanged: u.name !== p.name });
    } else if (p.rgm && uMember.rgm) {
      // RGM novo, mas o e-mail já é de outro RGM: não troca dono de conta
      fail('EMAIL_EM_USO_POR_OUTRO_RGM', 'E-mail já pertence a outro RGM neste workspace');
    } else {
      // membro antigo sem RGM ganha o RGM; linha sem RGM só atualiza nome e telefone
      res.status = 'unchanged';
      todo.push({ p, plan: 'update', existingUserId: u.id, existingMember: true, patch: { ...(p.rgm ? { rgm: p.rgm } : {}), ...phonePatch(uMember) }, nameChanged: u.name !== p.name });
    }
  }
  const byIndex = new Map(results.map((r) => [r.index, r]));

  if (dryRun) {
    // matrículas já existentes, para a prévia dizer o que mudaria
    const existingIds = todo.map((t) => t.existingUserId).filter((x): x is string => !!x);
    const courseIds = [...new Set(todo.flatMap((t) => t.p.slugs.map((slug) => courses.get(slug)!.id)))];
    const enrolledRows =
      existingIds.length && courseIds.length
        ? await db.select({ userId: s.enrollments.userId, courseId: s.enrollments.courseId }).from(s.enrollments).where(and(inArray(s.enrollments.userId, existingIds), inArray(s.enrollments.courseId, courseIds)))
        : [];
    const enrolledSet = new Set(enrolledRows.map((e) => `${e.userId}:${e.courseId}`));
    for (const t of todo) {
      const r = byIndex.get(t.p.index)!;
      r.userId = t.existingUserId;
      for (const slug of t.p.slugs) {
        const cid = courses.get(slug)!.id;
        (t.existingUserId && enrolledSet.has(`${t.existingUserId}:${cid}`) ? r.alreadyEnrolled : r.enrolled).push(slug);
      }
      r.emailChanged = t.emailChange ? true : undefined;
      const changed = !t.existingMember || !!t.emailChange || t.nameChanged || Object.keys(t.patch).length > 0 || r.enrolled.length > 0;
      r.status = t.plan === 'create' ? 'created' : changed ? 'updated' : 'unchanged';
    }
    return finish(results);
  }

  const size = Math.max(1, input.chunkSize ?? 100);
  for (let i = 0; i < todo.length; i += size) {
    const chunk = todo.slice(i, i + size);
    await db.transaction(async (tx) => {
      for (const t of chunk) {
        const r = byIndex.get(t.p.index)!;
        try {
          await tx.transaction(async (sp) => applyRow(sp, { workspaceId, actorId, source: input.source ?? 'api', t, r, courses }));
        } catch (e) {
          r.status = 'error';
          const ex = explain(e);
          r.code = ex.code;
          r.reason = ex.reason;
          r.emailChanged = undefined;
          r.userId = undefined;
          r.enrolled = [];
          r.alreadyEnrolled = [];
        }
      }
    });
  }

  const out = finish(results);
  await db.insert(s.auditLogs).values({
    id: newId('aud'),
    workspaceId,
    actorId,
    action: 'students.upsert',
    entityType: 'workspace',
    entityId: workspaceId,
    data: { source: input.source ?? 'api', ...out.summary, courses: [...courses.keys()] },
  });
  return out;
}

function finish(results: StudentRowResult[]): UpsertStudentsResult {
  const summary = { created: 0, updated: 0, unchanged: 0, error: 0, total: results.length };
  for (const r of results) summary[r.status] += 1;
  return { results, summary };
}

function explain(e: unknown): { code: StudentErrorCode; reason: string } {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const code = err?.code ?? err?.cause?.code;
  const constraint = String(err?.constraint_name ?? err?.cause?.constraint_name ?? '');
  if (code === '23505' && constraint.includes('rgm')) return { code: 'RGM_EM_USO', reason: 'RGM já pertence a outro aluno do workspace' };
  if (code === '23505' && constraint.includes('email')) return { code: 'EMAIL_EM_USO', reason: 'E-mail já pertence a outra conta' };
  if (code === '23505') return { code: 'CADASTRO_SIMULTANEO', reason: 'Cadastro simultâneo do mesmo aluno: tente de novo' };
  if (e instanceof Error && e.name === 'DomainError') return { code: 'FALHA_AO_GRAVAR', reason: e.message };
  return { code: 'FALHA_AO_GRAVAR', reason: 'Falha ao gravar esta linha' };
}

async function applyRow(tx: Transaction, a: { workspaceId: string; actorId: string; source: string; t: Planned; r: StudentRowResult; courses: Map<string, CourseInfo> }) {
  const { t, r } = a;
  let userId = t.existingUserId;
  let changed = false;
  if (t.plan === 'create') {
    userId = newId('usr');
    await tx.insert(s.user).values({ id: userId, email: t.p.email, name: t.p.name, emailVerified: false });
    await tx.insert(s.workspaceMemberships).values({ workspaceId: a.workspaceId, userId, role: 'student', rgm: t.p.rgm || null, phone: t.p.phone });
    changed = true;
  } else {
    userId = t.existingUserId!;
    if (!t.existingMember) {
      await tx.insert(s.workspaceMemberships).values({ workspaceId: a.workspaceId, userId, role: 'student', rgm: t.p.rgm || null, phone: t.p.phone });
      changed = true;
    } else if (Object.keys(t.patch).length > 0) {
      await tx
        .update(s.workspaceMemberships)
        .set(t.patch)
        .where(and(eq(s.workspaceMemberships.workspaceId, a.workspaceId), eq(s.workspaceMemberships.userId, userId), eq(s.workspaceMemberships.role, 'student')));
      changed = true;
    }
    if (t.emailChange) {
      // o e-mail novo ainda não foi confirmado pela pessoa; as sessões abertas caem e ela entra de novo pelo e-mail novo
      await tx.update(s.user).set({ email: t.emailChange.to, emailVerified: false, updatedAt: new Date() }).where(eq(s.user.id, userId));
      await tx.delete(s.session).where(eq(s.session.userId, userId));
      await tx.insert(s.auditLogs).values({
        id: newId('aud'),
        workspaceId: a.workspaceId,
        actorId: a.actorId,
        action: 'student.email_changed',
        entityType: 'user',
        entityId: userId,
        data: { from: t.emailChange.from, to: t.emailChange.to, source: a.source, sessionsEnded: true },
      });
      r.emailChanged = true;
      changed = true;
    }
    if (t.nameChanged) {
      await tx.update(s.user).set({ name: t.p.name, updatedAt: new Date() }).where(eq(s.user.id, userId));
      changed = true;
    }
  }
  r.userId = userId;
  r.enrolled = [];
  r.alreadyEnrolled = [];
  for (const slug of t.p.slugs) {
    const { created } = await enrollStudent(tx, { courseId: a.courses.get(slug)!.id, userId, createdBy: a.actorId });
    (created ? r.enrolled : r.alreadyEnrolled).push(slug);
    if (created) changed = true;
  }
  r.status = t.plan === 'create' ? 'created' : changed ? 'updated' : 'unchanged';
}

/** Cursos publicados do workspace (o que um integrador pode enviar em `cursos`). */
export async function listPublishedCourseSlugs(db: DbOrTx, workspaceId: string) {
  return db
    .select({ slug: s.courses.slug, title: s.courses.title })
    .from(s.courses)
    .where(and(eq(s.courses.workspaceId, workspaceId), eq(s.courses.status, 'published'), isNull(s.courses.archivedAt)))
    .orderBy(s.courses.title);
}
