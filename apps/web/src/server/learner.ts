import { getDb, identity, learning, DomainError } from '@lms/db';
import { HttpError, type Viewer } from './viewer';

/** A matrícula precisa pertencer ao viewer: aluno nunca age por outro aluno. */
export async function requireOwnEnrollment(viewer: Viewer, enrollmentId: string) {
  const enr = await learning.getEnrollmentWithVersion(getDb(), enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  if (enr.enrollment.userId !== viewer.user.id) throw new HttpError(404, 'Matrícula não encontrada');
  return enr;
}

/**
 * Leitura de dados da matrícula: o próprio aluno, ou a equipe (staff) do
 * workspace do curso. Qualquer outro caso responde 404 (não revela existência).
 */
export async function requireEnrollmentReader(viewer: Viewer, enrollmentId: string) {
  const enr = await learning.getEnrollmentWithVersion(getDb(), enrollmentId);
  if (!enr) throw new DomainError('NOT_FOUND', 'Matrícula não encontrada');
  if (enr.enrollment.userId === viewer.user.id) return enr;
  if (identity.isStaff(viewer.role) && enr.course.workspaceId === viewer.workspace.id) return enr;
  throw new HttpError(404, 'Matrícula não encontrada');
}

export async function requireOwnAttempt(viewer: Viewer, attemptId: string) {
  const db = getDb();
  const { eq } = await import('drizzle-orm');
  const { schema } = await import('@lms/db');
  const [attempt] = await db.select().from(schema.lessonAttempts).where(eq(schema.lessonAttempts.id, attemptId)).limit(1);
  if (!attempt) throw new DomainError('NOT_FOUND', 'Tentativa não encontrada');
  const enr = await requireOwnEnrollment(viewer, attempt.enrollmentId);
  return { attempt, enrollment: enr };
}
