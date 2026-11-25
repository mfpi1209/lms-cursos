import { z } from 'zod';
import { getDb, identity } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin, requireStaff } from '@/server/viewer';
import { createStudent } from '@/server/people';

export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    return { students: await identity.listWorkspaceUsers(getDb(), viewer.workspace.id, 'student') };
  });
}

const Body = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  email: z.string().trim().email('E-mail inválido').max(200),
  /** se faltar, o LMS gera uma senha inicial e devolve só nesta resposta */
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres').max(200).optional(),
});

/** Cadastro de pessoa (aluno) pelo administrador. */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireAdmin();
    const body = await parseBody(req, Body);
    return createStudent({ workspaceId: viewer.workspace.id, actorId: viewer.user.id, ...body });
  });
}
