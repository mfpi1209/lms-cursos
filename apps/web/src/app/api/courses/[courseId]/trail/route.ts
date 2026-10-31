import { z } from 'zod';
import { getDb, authoring } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireEditor, requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/** Trilha do curso na vitrine do aluno + trilhas já usadas no workspace (sugestões). */
export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    const course = await requireCourseInWorkspace(viewer, courseId);
    return { trail: course.trail ?? null, options: await authoring.listWorkspaceTrails(getDb(), viewer.workspace.id) };
  });
}

const Body = z.object({ trail: z.string().max(60).nullable() });

export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireEditor();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const { trail } = await parseBody(req, Body);
    return { trail: await authoring.setCourseTrail(getDb(), courseId, trail) };
  });
}
