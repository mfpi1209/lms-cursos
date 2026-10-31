import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { comunicacaoPrimeiroEmprego } from '@lms/course-schema';
import type { Database } from '../client';
import { newId } from '../ids';
import * as s from '../schema';
import type { WorkspaceRole } from '../schema/identity';
import { createCourse, getDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';

export const SEED_WORKSPACE_SLUG = 'operacao';
export const SEED_PASSWORD = 'senha-dev-123';

export const SEED_USERS: Array<{ email: string; name: string; role: WorkspaceRole }> = [
  { email: 'admin@demo.local', name: 'Ana Admin', role: 'admin' },
  { email: 'autor@demo.local', name: 'Bruno Autor', role: 'author' },
  { email: 'revisor@demo.local', name: 'Carla Revisora', role: 'reviewer' },
  { email: 'aluno@demo.local', name: 'Diego Aluno', role: 'student' },
  { email: 'aluna@demo.local', name: 'Elisa Aluna', role: 'student' },
];

export interface SeedResult {
  workspaceId: string;
  users: Record<string, string>;
  courseId: string;
  versionId: string;
  enrollmentId: string;
}

async function upsertUser(db: Database, u: { email: string; name: string }, passwordHash: string): Promise<string> {
  const [existing] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, u.email)).limit(1);
  if (existing) return existing.id;
  const id = newId('usr');
  await db.insert(s.user).values({ id, email: u.email, name: u.name, emailVerified: true });
  await db.insert(s.account).values({ id: newId('acc'), accountId: id, providerId: 'credential', userId: id, password: passwordHash });
  return id;
}

/** Seed idempotente: pode rodar várias vezes sem duplicar nada. */
export async function seed(db: Database, opts: { log?: (m: string) => void } = {}): Promise<SeedResult> {
  const log = opts.log ?? (() => {});
  let [ws] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, SEED_WORKSPACE_SLUG)).limit(1);
  if (!ws) {
    [ws] = await db.insert(s.workspaces).values({ id: newId('wsp'), slug: SEED_WORKSPACE_SLUG, name: 'Nossa operação', branding: { name: 'Rede de Polos', primaryColor: '#1d4ed8' } }).returning();
    log(`workspace criado: ${ws!.id}`);
  }
  const workspaceId = ws!.id;

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const users: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const id = await upsertUser(db, u, passwordHash);
    users[u.email] = id;
    await db.insert(s.workspaceMemberships).values({ workspaceId, userId: id, role: u.role }).onConflictDoNothing();
  }
  log(`usuários: ${Object.keys(users).length}`);

  const adminId = users['admin@demo.local']!;
  const authorId = users['autor@demo.local']!;
  const studentId = users['aluno@demo.local']!;

  const slug = 'comunicacao-no-primeiro-emprego';
  let [course] = await db.select().from(s.courses).where(eq(s.courses.slug, slug)).limit(1);
  if (!course) {
    const created = await createCourse(db, { workspaceId, title: comunicacaoPrimeiroEmprego.title, createdBy: authorId, document: comunicacaoPrimeiroEmprego, slug });
    [course] = await db.select().from(s.courses).where(eq(s.courses.id, created.id)).limit(1);
    log(`curso criado: ${created.id}`);
  }
  const courseId = course!.id;
  if (!(await getDraft(db, courseId))) throw new Error('rascunho ausente após seed');

  let version = await getLatestVersion(db, courseId);
  if (!version) {
    const published = await publishCourse(db, { courseId, userId: authorId });
    version = await getLatestVersion(db, courseId);
    log(`curso publicado: v${published.versionNumber} (${published.warnings.length} avisos)`);
  }

  const { enrollment, created } = await enrollStudent(db, { courseId, userId: studentId, createdBy: adminId });
  if (created) log(`matrícula criada: ${enrollment.id}`);

  return { workspaceId, users, courseId, versionId: version!.id, enrollmentId: enrollment.id };
}
