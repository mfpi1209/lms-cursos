import { z } from 'zod';
import { getDb, webhooks } from '@lms/db';
import { HttpError } from './viewer';
import type { IntegrationContext } from './integration-auth';

/* `GET`/`POST /api/integracao/v1/webhooks` e `DELETE …/{id}` (escopo webhooks:manage). O segredo vem só na criação. */

const createBody = z.object({ url: z.string().max(600), eventos: z.array(z.string().max(60)).min(1, 'Informe ao menos um evento').max(20) });

const present = (e: { id: string; url: string; events: string[]; active: boolean; createdAt: Date; lastSuccessAt: Date | null; lastFailureAt: Date | null }) => ({
  id: e.id,
  url: e.url,
  eventos: e.events,
  ativo: e.active,
  criadoEm: e.createdAt.toISOString(),
  ultimoSucessoEm: e.lastSuccessAt?.toISOString() ?? null,
  ultimaFalhaEm: e.lastFailureAt?.toISOString() ?? null,
});

export async function listWebhooks(ctx: IntegrationContext) {
  const rows = await webhooks.listEndpoints(getDb(), ctx.workspaceId);
  return { webhooks: rows.map(present), eventosDisponiveis: webhooks.WEBHOOK_EVENT_TYPES };
}

export async function createWebhook(ctx: IntegrationContext, raw: unknown) {
  const body = createBody.parse(raw);
  const ep = await webhooks.createEndpoint(getDb(), { workspaceId: ctx.workspaceId, actorId: ctx.createdBy, url: body.url, events: body.eventos });
  return { webhook: { id: ep.id, url: ep.url, eventos: ep.events, ativo: true, segredo: ep.secret } };
}

export async function deleteWebhook(ctx: IntegrationContext, id: string) {
  if (!/^whk_[a-z0-9]{16}$/.test(id)) throw new HttpError(404, 'Webhook não encontrado');
  await webhooks.deleteEndpoint(getDb(), { workspaceId: ctx.workspaceId, actorId: ctx.createdBy, endpointId: id });
  return { ok: true };
}
