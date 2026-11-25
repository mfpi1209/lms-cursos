import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { DomainError, getDb, newId, schema } from '@lms/db';

export function generatedPassword(): string {
  return `Dna-${randomBytes(9).toString('base64url')}`;
}

/**
 * Cadastra uma pessoa como aluna do workspace (ou reaproveita o cadastro existente
 * pelo e-mail). A senha só é devolvida quando foi definida nesta chamada.
 */
export async function createStudent(input: { workspaceId: string; actorId: string; name: string; email: string; password?: string }) {
  const db = getDb();
  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (existing) {
    const [membership] = await db
      .select()
      .from(schema.workspaceMemberships)
      .where(eq(schema.workspaceMemberships.userId, existing.id));
    if (membership && membership.workspaceId === input.workspaceId) throw new DomainError('CONFLICT', 'Já existe uma pessoa cadastrada com este e-mail');
    if (membership) throw new DomainError('CONFLICT', 'Este e-mail já pertence a outro espaço de trabalho');
  }
  const password = input.password ?? generatedPassword();
  const passwordHash = await hashPassword(password);
  let userId = existing?.id;
  if (!existing) {
    userId = newId('usr');
    await db.insert(schema.user).values({ id: userId, email, name: input.name, emailVerified: true });
    await db.insert(schema.account).values({ id: newId('acc'), accountId: userId, providerId: 'credential', userId, password: passwordHash });
  }
  await db.insert(schema.workspaceMemberships).values({ workspaceId: input.workspaceId, userId: userId!, role: 'student' }).onConflictDoNothing();
  await db.insert(schema.auditLogs).values({
    id: newId('aud'),
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'student.create',
    entityType: 'user',
    entityId: userId!,
    data: { email },
  });
  return { userId: userId!, email, name: input.name, password: existing ? undefined : password };
}
