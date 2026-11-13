import { getDb, webhooks } from '@lms/db';
import { route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** "Enviar teste": cria uma entrega `ping`, que o worker envia em segundos. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { id } = await params;
    return webhooks.enqueuePing(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, endpointId: id });
  });
}
