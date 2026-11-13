import { withIntegration } from '@/server/integration-auth';
import { postStudents } from '@/server/integration-students';
import { HttpError } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** Cadastra ou atualiza alunos (idempotente pelo e-mail). Escopo: students:write. Corpo e resposta: ver server/integration-students.ts. */
export async function POST(req: Request) {
  return withIntegration(req, 'students:write', async (ctx) => {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new HttpError(400, 'Corpo da requisição inválido (esperado JSON)');
    }
    return postStudents(ctx, json);
  });
}
