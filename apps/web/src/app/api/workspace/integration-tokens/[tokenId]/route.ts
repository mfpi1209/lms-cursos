import { getDb, integrationTokens } from '@lms/db';
import { route } from '@/server/http';
import { requireAdmin } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** Revoga o token (vale na hora; não há como desfazer). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  return route(async () => {
    const viewer = await requireAdmin();
    const { tokenId } = await params;
    await integrationTokens.revokeIntegrationToken(getDb(), { workspaceId: viewer.workspace.id, actorId: viewer.user.id, tokenId });
    return { ok: true };
  });
}
