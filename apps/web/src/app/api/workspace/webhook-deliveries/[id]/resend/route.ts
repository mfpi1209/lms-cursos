import { getDb, webhooks } from '@lms/db';
import { route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** "Reenviar": recoloca a entrega na fila (mesmo evento, mesmo corpo). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { id } = await params;
    await webhooks.resendDelivery(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, deliveryId: id });
    return { ok: true };
  });
}
