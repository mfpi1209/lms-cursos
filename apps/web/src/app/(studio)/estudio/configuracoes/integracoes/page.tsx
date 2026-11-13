import { getDb, integrationTokens } from '@lms/db';
import { requireViewer } from '@/server/viewer';
import { TokensManager } from './tokens-manager';

export const metadata = { title: 'Tokens de integração' };
export const dynamic = 'force-dynamic';

export default async function IntegracoesPage() {
  const viewer = await requireViewer();
  const rows = await integrationTokens.listIntegrationTokens(getDb(), viewer.workspace.id);
  const tokens = rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null }));
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4">
        <h1>Tokens de integração</h1>
        <p className="text-lg text-fg-muted">
          Sistemas externos (como o DNA) usam um token para cadastrar alunos pela API. O segredo aparece uma única vez, na criação: guarde-o em local seguro. Quem o tiver age como a administração dentro do escopo escolhido.
        </p>
      </section>
      <TokensManager initial={tokens} />
    </div>
  );
}
