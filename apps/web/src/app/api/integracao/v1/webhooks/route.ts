import { withIntegration } from '@/server/integration-auth';
import { createWebhook, listWebhooks } from '@/server/integration-webhooks';
import { HttpError } from '@/server/viewer';

export const dynamic = 'force-dynamic';

/** Lista os webhooks do workspace (sem o segredo). Escopo: webhooks:manage. */
export async function GET(req: Request) {
  return withIntegration(req, 'webhooks:manage', listWebhooks);
}

/** Cadastra um webhook. O segredo de assinatura vem só nesta resposta. Escopo: webhooks:manage. */
export async function POST(req: Request) {
  return withIntegration(req, 'webhooks:manage', async (ctx) => {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new HttpError(400, 'Corpo da requisição inválido (esperado JSON)');
    }
    return createWebhook(ctx, json);
  });
}
