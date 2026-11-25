import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { DomainError, getDb, identity, learning, schema } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

const Body = z.object({ courseIds: z.array(z.string().min(1)).min(1, 'Escolha ao menos um curso').max(100) });

/** Inscreve a pessoa em vários cursos publicados de uma vez. */
export async function POST(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { userId } = await ctx.params;
    const { courseIds } = await parseBody(req, Body);
    const db = getDb();
    const membership = await identity.getMembership(db, viewer.workspace.id, userId);
    if (!membership || membership.role !== 'student') throw new DomainError('NOT_FOUND', 'Pessoa não encontrada neste workspace');
    const courses = await db
      .select({ id: schema.courses.id, title: schema.courses.title })
      .from(schema.courses)
      .where(and(eq(schema.courses.workspaceId, viewer.workspace.id), eq(schema.courses.status, 'published'), inArray(schema.courses.id, courseIds)));
    if (courses.length !== new Set(courseIds).size) throw new DomainError('VALIDATION', 'Há cursos inválidos ou não publicados na seleção');
    const enrollments = [];
    for (const c of courses) {
      const { enrollment, created } = await learning.enrollStudent(db, { courseId: c.id, userId, createdBy: viewer.user.id });
      enrollments.push({ courseId: c.id, title: c.title, enrollmentId: enrollment.id, created });
    }
    return { enrollments };
  });
}
