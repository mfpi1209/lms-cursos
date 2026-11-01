// Faz login da conta de teste (aluna@demo.local) pela API e devolve os cookies para o Playwright.
// A senha é lida de packages/db/src/seed/seed.ts (SEED_PASSWORD) em tempo de execução; nunca é impressa.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EMAIL = 'aluna@demo.local';
export async function login(base = 'http://localhost:3010') {
  const seed = readFileSync(resolve(raiz, 'packages/db/src/seed/seed.ts'), 'utf8');
  const senha = seed.match(/SEED_PASSWORD\s*=\s*['"`]([^'"`]+)['"`]/)?.[1];
  if (!senha) throw new Error('SEED_PASSWORD não encontrada');
  const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email: EMAIL, password: senha }) });
  if (!r.ok) throw new Error(`login falhou: ${r.status}`);
  const set = r.headers.getSetCookie();
  const cookies = set.map((c) => { const [nv] = c.split(';'); const i = nv.indexOf('='); return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: 'localhost', path: '/' }; });
  if (!cookies.length) throw new Error('sem cookie de sessão');
  return cookies;
}
