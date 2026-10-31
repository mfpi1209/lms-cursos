import { z } from 'zod';
import { getDb, learning, identity, DomainError } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    return { enrollments: await learning.listEnrollmentsForCourse(getDb(), courseId) };
  });
}

const Schema = z.object({ userId: z.string().min(1) });

/** Matrícula por administrador; o aluno precisa ser membro (student) do workspace. */
export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const { userId } = await parseBody(req, Schema);
    const membership = await identity.getMembership(getDb(), viewer.workspace.id, userId);
    if (!membership || membership.role !== 'student') throw new DomainError('VALIDATION', 'O usuário precisa ser aluno deste workspace');
    return learning.enrollStudent(getDb(), { courseId, userId, createdBy: viewer.user.id });
  });
}
