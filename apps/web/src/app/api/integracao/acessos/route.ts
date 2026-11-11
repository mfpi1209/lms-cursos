import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { trailSlug } from '@lms/course-schema';
import { DomainError, getDb, learning, newId, schema } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { HttpError } from '@/server/viewer';

const Body = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(120),
  /** senha inicial; se faltar, o LMS gera e devolve só nesta resposta */
  password: z.string().min(8).max(200).optional(),
  /** troca a senha de quem já tem acesso; a nova senha volta na resposta */
  resetPassword: z.boolean().optional(),
  /**
   * Trilhas para matricular agora (nome ou chave, ex.: "primeiro-emprego").
   * "*" matricula em todos os cursos publicados. Sem este campo, só cria o acesso:
   * a pessoa se inscreve na vitrine.
   */
  trails: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const [kind, token] = header.split(' ');
  if (kind !== 'Bearer' || !token) return null;
  return token;
}

function generatedPassword(): string {
  return `Dna-${randomBytes(9).toString('base64url')}`;
}

/**
 * Criação de acesso para o sistema de recrutamento (sistema-dna-v1).
 * Não usa sessão: o chamador manda `Authorization: Bearer <LMS_ACCESS_TOKEN>`.
 * Idempotente por e-mail. A senha só volta quando foi definida nesta chamada.
 */
export async function POST(req: Request) {
  return route(async () => {
    const secret = process.env.LMS_ACCESS_TOKEN;
    if (!secret) throw new HttpError(503, 'Integração de acesso não configurada.');
    const token = bearer(req.headers.get('authorization'));
    if (!token || !sameSecret(token, secret)) throw new HttpError(401, 'Credencial inválida.');

    const body = await parseBody(req, Body);
    const email = body.email.toLowerCase();
    const db = getDb();
    const slug = process.env.LMS_WORKSPACE_SLUG || 'operacao';
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.slug, slug)).limit(1);
    if (!ws) throw new HttpError(503, 'Workspace da integração não encontrado.');

    const published = await db
      .select({ id: schema.courses.id, title: schema.courses.title, trail: schema.courses.trail })
      .from(schema.courses)
      .where(and(eq(schema.courses.workspaceId, ws.id), eq(schema.courses.status, 'published')));
    const requested = body.trails ?? [];
    const unknown = requested.filter((r) => r !== '*' && !published.some((c) => c.trail && trailSlug(c.trail) === trailSlug(r)));
    if (unknown.length) throw new DomainError('VALIDATION', 'Trilha desconhecida.', { trails: unknown });
    const chosen = requested.length === 0
      ? []
      : published.filter((c) => c.trail && (requested.includes('*') || requested.some((r) => trailSlug(r) === trailSlug(c.trail!))));

    const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
    let userId = existing?.id;
    let created = false;
    let password: string | undefined;
    const setPassword = !existing || body.resetPassword === true;
    if (setPassword) password = body.password ?? generatedPassword();
    const passwordHash = password ? await hashPassword(password) : null;

    if (!existing) {
      userId = newId('usr');
      created = true;
      await db.insert(schema.user).values({ id: userId, email, name: body.name, emailVerified: true });
      await db.insert(schema.account).values({ id: newId('acc'), accountId: userId, providerId: 'credential', userId, password: passwordHash });
    } else if (existing.name !== body.name) {
      await db.update(schema.user).set({ name: body.name, updatedAt: new Date() }).where(eq(schema.user.id, existing.id));
    }
    if (existing && passwordHash) {
      const [account] = await db.select({ id: schema.account.id }).from(schema.account).where(and(eq(schema.account.userId, existing.id), eq(schema.account.providerId, 'credential'))).limit(1);
      if (account) await db.update(schema.account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(schema.account.id, account.id));
      else await db.insert(schema.account).values({ id: newId('acc'), accountId: existing.id, providerId: 'credential', userId: existing.id, password: passwordHash });
    }

    await db.insert(schema.workspaceMemberships).values({ workspaceId: ws.id, userId: userId!, role: 'student' }).onConflictDoNothing();
    await db.insert(schema.auditLogs).values({
      id: newId('aud'),
      workspaceId: ws.id,
      actorId: userId!,
      action: 'access.provision',
      entityType: 'user',
      entityId: userId!,
      data: { email, created, trails: requested },
    });

    const enrollments = [];
    for (const course of chosen) {
      const { enrollment, created: enrolled } = await learning.enrollStudent(db, { courseId: course.id, userId: userId!, createdBy: userId! });
      enrollments.push({ courseId: course.id, title: course.title, trail: course.trail, enrollmentId: enrollment.id, created: enrolled });
    }

    const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    return {
      created,
      userId,
      email,
      name: body.name,
      loginUrl: `${base}/login`,
      ...(password ? { password } : {}),
      enrollments,
    };
  });
}
