import { withIntegration } from '@/server/integration-auth';
import { getCourses } from '@/server/integration-students';

export const dynamic = 'force-dynamic';

/** Cursos publicados (slug e título): o que pode ir em `cursos` no cadastro de alunos. Escopo: students:write. */
export async function GET(req: Request) {
  return withIntegration(req, 'students:write', getCourses);
}
