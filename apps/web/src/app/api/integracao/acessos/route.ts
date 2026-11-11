import { timingSafeEqual, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { DomainError, getDb, learning, newId, schema } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { HttpError } from '@/server/viewer';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72).optional(),
  resetPassword: z.boolean().optional(),
  // A ficha antiga ainda manda trilha. O acesso criado entra em todos os cursos publicados.
  trails: z.array(z.string()).max(20).optional(),
});

/** Cria ou reaproveita o aluno e matricula em todos os cursos publicados. Autenticação: Bearer LMS_ACCESS_TOKEN. */
export async function POST(req: Request) {
  return route(async () => {
    if (!process.env.LMS_ACCESS_TOKEN?.trim()) throw new HttpError(503, 'LMS_ACCESS_TOKEN não está definido.');
    if (!tokenConfere(req.headers.get('authorization'))) throw new HttpError(401, 'Credencial recusada.');
    const input = await parseBody(req, Body);
    const db = getDb();
    const email = input.email.toLowerCase();
    const name = input.name.trim();
    const [existente] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1);
    const contaNova = !existente;
    const definirSenha = contaNova || input.resetPassword === true || Boolean(input.password);
    const senha = definirSenha ? input.password?.trim() || senhaGerada() : null;
    const userId = existente?.id ?? newId('usr');

    if (contaNova) {
      await db.insert(schema.user).values({ id: userId, email, name, emailVerified: true });
    } else {
      await db.update(schema.user).set({ name, updatedAt: new Date() }).where(eq(schema.user.id, userId));
    }
    if (senha) {
      const hash = await hashPassword(senha);
      const [conta] = await db
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')))
        .limit(1);
      if (conta) {
        await db.update(schema.account).set({ password: hash, updatedAt: new Date() }).where(eq(schema.account.id, conta.id));
      } else {
        await db.insert(schema.account).values({ id: newId('acc'), accountId: userId, providerId: 'credential', userId, password: hash });
      }
    }

    const cursos = await db
      .select({ id: schema.courses.id, title: schema.courses.title, workspaceId: schema.courses.workspaceId })
      .from(schema.courses)
      .where(eq(schema.courses.status, 'published'));
    const workspaces = [...new Set(cursos.map((curso) => curso.workspaceId))];
    for (const workspaceId of workspaces) {
      await db.insert(schema.workspaceMemberships).values({ workspaceId, userId, role: 'student' }).onConflictDoNothing();
    }
    const matriculas: string[] = [];
    for (const curso of cursos) {
      try {
        await learning.enrollStudent(db, { courseId: curso.id, userId, createdBy: userId });
        matriculas.push(curso.title);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'VALIDATION') throw error;
      }
    }

    return {
      created: contaNova,
      name,
      email,
      ...(senha ? { password: senha } : {}),
      courses: matriculas,
    };
  });
}

function tokenConfere(header: string | null): boolean {
  const esperado = process.env.LMS_ACCESS_TOKEN?.trim() ?? '';
  const recebido = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function senhaGerada(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let senha = '';
  for (const byte of bytes) senha += alfabeto[byte % alfabeto.length];
  return senha;
}
