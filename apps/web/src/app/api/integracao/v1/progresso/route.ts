import { withIntegration } from '@/server/integration-auth';
import { getProgress } from '@/server/integration-progress';

export const dynamic = 'force-dynamic';

/** Progresso por matrícula, paginado. Escopo: progress:read. Parâmetros e resposta: docs/integracao/api-v1.md. */
export async function GET(req: Request) {
  return withIntegration(req, 'progress:read', (ctx) => getProgress(ctx, req.url));
}
