import { z } from 'zod';
import { getDb, webhooks } from '@lms/db';
import { parseBody, route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** Ativa ou desativa o webhook. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(req, z.object({ active: z.boolean() }));
    await webhooks.setEndpointActive(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, endpointId: id, active: body.active });
    return { ok: true };
  });
}

/** Apaga o webhook e as entregas dele (sem volta). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { id } = await params;
    await webhooks.deleteEndpoint(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, endpointId: id });
    return { ok: true };
  });
}
