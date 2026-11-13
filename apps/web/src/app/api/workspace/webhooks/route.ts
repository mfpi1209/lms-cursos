import { z } from 'zod';
import { getDb, webhooks } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

const createBody = z.object({ url: z.string().max(600), events: z.array(z.string().max(60)).min(1).max(20) });

/** Cadastra um webhook (só administração). O segredo de assinatura vem só nesta resposta. */
export async function POST(req: Request) {
  return route(async () => {
    const viewer = await requireAdmin();
    const body = await parseBody(req, createBody);
    const ep = await webhooks.createEndpoint(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, url: body.url, events: body.events });
    return { webhook: ep };
  });
}
