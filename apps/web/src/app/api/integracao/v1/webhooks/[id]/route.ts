import { withIntegration } from '@/server/integration-auth';
import { deleteWebhook } from '@/server/integration-webhooks';

export const dynamic = 'force-dynamic';

/** Apaga um webhook e as entregas dele. Escopo: webhooks:manage. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withIntegration(req, 'webhooks:manage', (ctx) => deleteWebhook(ctx, id));
}
