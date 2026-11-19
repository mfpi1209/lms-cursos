import { getDb, webhooks } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { WebhooksManager } from './webhooks-manager';

export const metadata = { title: 'Webhooks' };
export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const [endpoints, deliveries] = await Promise.all([webhooks.listEndpoints(db, viewer.workspace.id), webhooks.listDeliveries(db, { workspaceId: viewer.workspace.id, limit: 30 })]);
  const production = process.env.NODE_ENV === 'production';
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <h1>Webhooks</h1>
        <p className="text-lg text-fg-muted">
          O LMS avisa um sistema externo (como o DNA) quando algo acontece: matrícula, aula concluída, curso concluído, tarefa enviada ou corrigida. Cada aviso é um POST com JSON, assinado com o segredo do webhook.
        </p>
        <p className="text-sm text-fg-muted">
          Quem recebe deve responder com 2xx em até 10 segundos. Se falhar, o LMS tenta de novo até 8 vezes, com espera crescente de 1 minuto a 12 horas. Formato, assinatura e exemplos: <code>docs/integracao/api-v1.md</code>.
        </p>
      </section>
      <WebhooksManager
        production={production}
        keyMissing={production && !process.env.WEBHOOK_SECRET_KEY}
        endpoints={endpoints.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), lastSuccessAt: e.lastSuccessAt?.toISOString() ?? null, lastFailureAt: e.lastFailureAt?.toISOString() ?? null }))}
        deliveries={deliveries.map((d) => ({ ...d, nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(), deliveredAt: d.deliveredAt?.toISOString() ?? null }))}
        eventTypes={[...webhooks.WEBHOOK_EVENT_TYPES]}
      />
    </div>
  );
}
