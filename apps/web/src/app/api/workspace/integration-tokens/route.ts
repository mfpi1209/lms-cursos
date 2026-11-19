import { z } from 'zod';
import { getDb, integrationTokens } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

const createBody = z.object({ name: z.string().min(1).max(200), scopes: z.array(z.string()).min(1).max(10) });

/** Cria um token de integração. O segredo vem só nesta resposta; depois só o prefixo fica visível. */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireAdmin();
    const body = await parseBody(req, createBody);
    const t = await integrationTokens.createIntegrationToken(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, name: body.name, scopes: body.scopes });
    return { token: t };
  });
}
