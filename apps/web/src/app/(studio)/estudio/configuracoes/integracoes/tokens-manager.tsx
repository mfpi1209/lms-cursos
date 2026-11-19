'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, Badge } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/input';

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const SCOPES: Array<{ id: string; label: string; hint: string }> = [
  { id: 'students:write', label: 'Cadastrar alunos', hint: 'students:write — POST /api/integracao/v1/alunos e GET /cursos' },
  { id: 'progress:read', label: 'Ler progresso', hint: 'progress:read — GET /api/integracao/v1/progresso' },
  { id: 'webhooks:manage', label: 'Gerenciar webhooks', hint: 'webhooks:manage — GET, POST e DELETE /api/integracao/v1/webhooks' },
];

export function TokensManager({ initial }: { initial: TokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['students:write']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: { secret: string; name: string } }>('/api/workspace/integration-tokens', { json: { name, scopes } });
      setSecret({ name: res.token.name, value: res.token.secret });
      setCopied(null);
      setName('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o token');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: TokenRow) {
    if (!window.confirm(`Revogar o token "${t.name}"? Quem o usa perde o acesso na hora e isso não pode ser desfeito.`)) return;
    setError(null);
    try {
      await api(`/api/workspace/integration-tokens/${t.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível revogar');
    }
  }

  return (
    <div className="space-y-8">
      {secret && (
        <Card accent className="space-y-3" role="status" data-testid="token-segredo">
          <h2 className="text-xl">Token “{secret.name}” criado</h2>
          <p className="text-sm text-fg-muted">Copie agora. Por segurança, este segredo não será mostrado de novo.</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-fg/5 px-4 py-3 text-sm" data-testid="token-valor">{secret.value}</code>
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
              data-testid="token-copiar"
            >
              {copied === 'ok' ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          {copied === 'fail' && <p role="alert" className="text-sm text-danger">Não foi possível copiar automaticamente. Selecione o texto e copie.</p>}
          <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>Já guardei, fechar</Button>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-xl">Novo token</h2>
        <form onSubmit={create} className="space-y-4">
          <div className="max-w-md">
            <Field label="Nome" htmlFor="token-nome" required hint="Para você reconhecer na lista, por exemplo: DNA produção.">
              <Input id="token-nome" value={name} maxLength={80} required aria-required="true" onChange={(e) => setName(e.target.value)} data-testid="token-nome" />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Escopos</legend>
            {SCOPES.map((s) => (
              <label key={s.id} className="flex min-h-11 items-start gap-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={scopes.includes(s.id)}
                  onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                  data-testid={`escopo-${s.id}`}
                />
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="block text-fg-muted">{s.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || !name.trim() || scopes.length === 0} data-testid="token-criar">{busy ? 'Criando…' : 'Criar token'}</Button>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      </Card>

      <section className="space-y-3" aria-labelledby="tokens-title">
        <h2 id="tokens-title" className="text-xl">Tokens</h2>
        {initial.length === 0 ? (
          <Card className="px-6 py-8 text-center text-fg-muted">Nenhum token criado.</Card>
        ) : (
          <ul className="space-y-3" data-testid="token-lista">
            {initial.map((t) => (
              <li key={t.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {t.name} <code className="ml-2 text-sm font-normal text-fg-muted">{t.prefix}…</code>
                  </p>
                  <p className="text-sm text-fg-muted">
                    {t.scopes.join(', ')} · criado em {formatDate(t.createdAt)} · {t.lastUsedAt ? `último uso em ${formatDate(t.lastUsedAt)}` : 'nunca usado'}
                  </p>
                </div>
                {t.revokedAt ? (
                  <Badge tone="danger">Revogado em {formatDate(t.revokedAt)}</Badge>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => void revoke(t)} data-testid="token-revogar">Revogar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
