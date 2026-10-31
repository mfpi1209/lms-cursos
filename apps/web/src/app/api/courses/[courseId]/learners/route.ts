import { getDb, library } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';

/**
 * Alunos de teste: cada perfil da biblioteca "faz" o rascunho do curso e dá a
 * opinião (simulação por regras, sem IA e sem custo). `?keys=aluno-diego,…`
 * limita aos perfis pedidos.
 */
export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const keys = new URL(req.url).searchParams.get('keys')?.split(',').map((k) => k.trim()).filter(Boolean);
    return library.simulateCourseLearners(getDb(), { workspaceId: viewer.workspace.id, courseId, ...(keys?.length ? { learnerKeys: keys } : {}) });
  });
}
