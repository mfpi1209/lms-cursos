/**
 * Guarda do banco descartável (auditoria P1-9/P2): os testes de integração e o
 * e2e fazem `drop schema public cascade`. Só pode ser num banco cujo nome
 * termina em `_test` ou `_e2e` E que não seja o `DATABASE_URL` do ambiente
 * (o banco de desenvolvimento). Lança antes de qualquer destruição.
 */
export function databaseNameOf(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] ?? '');
  } catch {
    return '';
  }
}

export function isDisposableDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): { ok: true } | { ok: false; reason: string } {
  const name = databaseNameOf(url);
  if (!name) return { ok: false, reason: `URL de banco inválida: "${url}"` };
  if (!/_(test|e2e)$/.test(name)) return { ok: false, reason: `o banco "${name}" não termina em _test ou _e2e` };
  const dev = env.DATABASE_URL;
  if (dev && databaseNameOf(dev) === name) return { ok: false, reason: `o banco "${name}" é o DATABASE_URL do ambiente (banco de desenvolvimento)` };
  return { ok: true };
}

/** Lança se `url` não for um banco descartável. Chamar ANTES de `drop schema`. */
export function assertDisposableDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const r = isDisposableDatabaseUrl(url, env);
  if (!r.ok) throw new Error(`Recusando apagar o banco: ${r.reason}. Use um banco *_test ou *_e2e diferente de DATABASE_URL.`);
}
