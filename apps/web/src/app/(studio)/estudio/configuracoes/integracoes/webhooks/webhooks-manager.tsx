'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card, type BadgeTone } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/input';

interface EndpointRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  pending: number;
}
interface DeliveryRow {
  id: string;
  endpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  attempt: number;
  status: 'pending' | 'delivered' | 'failed';
  httpStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  'enrollment.created': 'Matrícula criada',
  'lesson.completed': 'Aula concluída',
  'course.completed': 'Curso concluído',
  'task.submitted': 'Tarefa enviada',
  'task.reviewed': 'Tarefa corrigida',
  'certificate.issued': 'Certificado emitido',
  ping: 'Teste',
};
const STATUS: Record<DeliveryRow['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Na fila', tone: 'warning' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
};

export function WebhooksManager({ endpoints, deliveries, eventTypes, production, keyMissing }: { endpoints: EndpointRow[]; deliveries: DeliveryRow[]; eventTypes: string[]; production: boolean; keyMissing: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['enrollment.created', 'lesson.completed', 'course.completed']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ url: string; value: string } | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const hasPending = deliveries.some((d) => d.status === 'pending');
  // enquanto houver entrega na fila, a lista se atualiza sozinha
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [hasPending, router]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir');
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ webhook: { url: string; secret: string } }>('/api/workspace/webhooks', { json: { url, events } });
      setSecret({ url: res.webhook.url, value: res.webhook.secret });
      setCopied(null);
      setUrl('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o webhook');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {keyMissing && (
        <Card role="alert" className="border-danger/40 text-sm" data-testid="webhook-sem-chave">
          A variável <code>WEBHOOK_SECRET_KEY</code> não está definida neste ambiente. Sem ela, não é possível cadastrar webhooks nem assinar entregas.
        </Card>
      )}

      {secret && (
        <Card accent className="space-y-3" role="status" data-testid="webhook-segredo">
          <h2 className="text-xl">Webhook criado</h2>
          <p className="text-sm text-fg-muted">
            Copie o segredo de assinatura agora para <span className="break-all">{secret.url}</span>. Por segurança, ele não será mostrado de novo. Quem receber os avisos usa este segredo para conferir a assinatura de cada um.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-fg/5 px-4 py-3 text-sm" data-testid="webhook-segredo-valor">{secret.value}</code>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await copyToClipboard(secret.value);
                  setCopied('ok');
                } catch {
                  setCopied('fail');
                }
              }}
              data-testid="webhook-copiar"
            >
              {copied === 'ok' ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          {copied === 'fail' && <p role="alert" className="text-sm text-danger">Não foi possível copiar automaticamente. Selecione o texto e copie.</p>}
          <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>Já guardei, fechar</Button>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-xl">Novo webhook</h2>
        <form onSubmit={create} className="space-y-4">
          <div className="max-w-xl">
            <Field label="Endereço (URL)" htmlFor="webhook-url" required hint={production ? 'Deve começar com https:// e ser um endereço público.' : 'Deve começar com https://. Em desenvolvimento, http://localhost também vale.'}>
              <Input id="webhook-url" type="url" value={url} maxLength={500} required aria-required="true" placeholder="https://exemplo.com.br/webhooks/lms" onChange={(e) => setUrl(e.target.value)} data-testid="webhook-url" />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Eventos</legend>
            {eventTypes.map((t) => (
              <label key={t} className="flex min-h-11 items-start gap-3 text-sm">
                <Checkbox className="mt-0.5" checked={events.includes(t)} onChange={(e) => setEvents((cur) => (e.target.checked ? [...cur, t] : cur.filter((x) => x !== t)))} data-testid={`evento-${t}`} />
                <span>
                  <span className="font-medium">{EVENT_LABEL[t] ?? t}</span>
                  <span className="block text-fg-muted"><code>{t}</code></span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || keyMissing || !url.trim() || events.length === 0} data-testid="webhook-criar">{busy ? 'Criando…' : 'Criar webhook'}</Button>
        </form>
      </Card>

      {error && <p role="alert" className="text-sm text-danger" data-testid="webhook-erro">{error}</p>}
      {notice && <p role="status" className="text-sm text-fg-muted" data-testid="webhook-aviso">{notice}</p>}

      <section className="space-y-3" aria-labelledby="webhooks-title">
        <h2 id="webhooks-title" className="text-xl">Webhooks cadastrados</h2>
        {endpoints.length === 0 ? (
          <Card className="px-6 py-8 text-center text-fg-muted">Nenhum webhook cadastrado.</Card>
        ) : (
          <ul className="space-y-3" data-testid="webhook-lista">
            {endpoints.map((e) => (
              <li key={e.id} className="panel space-y-3 p-5" data-testid="webhook-item">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-medium">{e.url}</p>
                    <p className="text-sm text-fg-muted">
                      {e.events.map((t) => EVENT_LABEL[t] ?? t).join(', ')}
                    </p>
                    <p className="text-sm text-fg-muted">
                      Criado em {formatDate(e.createdAt)} · último sucesso: {formatDate(e.lastSuccessAt)} · última falha: {formatDate(e.lastFailureAt)}
                    </p>
                  </div>
                  <Badge tone={e.active ? 'success' : 'neutral'}>{e.active ? 'Ativo' : 'Desativado'}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled={!e.active} onClick={() => void run(() => api(`/api/workspace/webhooks/${e.id}/ping`, { method: 'POST' }), 'Teste enviado para a fila. O resultado aparece em “Entregas recentes”.')} data-testid="webhook-teste">
                    Enviar teste
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void run(() => api(`/api/workspace/webhooks/${e.id}`, { method: 'PATCH', json: { active: !e.active } }))} data-testid="webhook-alternar">
                    {e.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Excluir o webhook para ${e.url}? As entregas dele também serão apagadas. Isso não pode ser desfeito.`)) void run(() => api(`/api/workspace/webhooks/${e.id}`, { method: 'DELETE' }));
                    }}
                    data-testid="webhook-excluir"
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="entregas-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="entregas-title" className="text-xl">Entregas recentes</h2>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>Atualizar</Button>
        </div>
        {deliveries.length === 0 ? (
          <Card className="px-6 py-8 text-center text-fg-muted">Nenhuma entrega ainda.</Card>
        ) : (
          <ul className="space-y-3" data-testid="entrega-lista">
            {deliveries.map((d) => (
              <li key={d.id} className="panel flex flex-wrap items-center justify-between gap-4 p-4" data-testid="entrega-item" data-status={d.status}>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {EVENT_LABEL[d.eventType] ?? d.eventType} <code className="ml-1 text-sm font-normal text-fg-muted">{d.eventType}</code>
                  </p>
                  <p className="break-all text-sm text-fg-muted">{d.endpointUrl}</p>
                  <p className="text-sm text-fg-muted">
                    {formatDate(d.createdAt)} · {d.attempt} {d.attempt === 1 ? 'tentativa' : 'tentativas'}
                    {d.httpStatus ? ` · HTTP ${d.httpStatus}` : ''}
                    {d.status === 'pending' && d.nextAttemptAt ? ` · próxima: ${formatDate(d.nextAttemptAt)}` : ''}
                  </p>
                  {d.lastError && d.status !== 'delivered' && <p className="break-words text-sm text-danger">{d.lastError}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => void run(() => api(`/api/workspace/webhook-deliveries/${d.id}/resend`, { method: 'POST' }), 'Entrega recolocada na fila.')} data-testid="entrega-reenviar">
                    Reenviar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
