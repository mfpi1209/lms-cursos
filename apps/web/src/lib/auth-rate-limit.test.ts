import { describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins/magic-link';
import { authRateLimit, emailLimits, KeyedLimiter, magicLinkTtlHours } from './auth-access';

/** Mesma configuração de limites do auth.ts, com o limitador ligado (em teste o Better Auth o desliga). */
function makeAuth() {
  return betterAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }),
    secret: 'segredo-de-teste-com-mais-de-32-caracteres-xxxxxxxx',
    baseURL: 'http://localhost:3000',
    emailAndPassword: { enabled: true, disableSignUp: true, sendResetPassword: async () => {} },
    rateLimit: { ...authRateLimit, enabled: true, storage: 'memory' },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    plugins: [magicLink({ disableSignUp: true, sendMagicLink: async () => {} })],
  });
}

const hit = (auth: ReturnType<typeof makeAuth>, path: string, ip: string, body: unknown) =>
  auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': ip }, body: JSON.stringify(body) }));

async function firstBlocked(auth: ReturnType<typeof makeAuth>, path: string, ip: string, body: (i: number) => unknown, tries: number) {
  for (let i = 1; i <= tries; i++) if ((await hit(auth, path, ip, body(i))).status === 429) return i;
  return null;
}

describe('limites por IP do Better Auth (valores documentados em auth-access.ts)', () => {
  it('declara regras explícitas, bem acima dos padrões que travariam um laboratório', () => {
    const r = authRateLimit.customRules;
    // padrões do Better Auth: sign-in 3 por 10 s; recuperação 3 por 60 s
    expect(r['/sign-in/email']).toEqual({ window: 60, max: 30 });
    expect(r['/sign-in/magic-link'].max).toBeGreaterThanOrEqual(20);
    expect(r['/magic-link/verify'].max).toBeGreaterThanOrEqual(30);
    expect(r['/request-password-reset'].max).toBeGreaterThanOrEqual(20);
    // mas nenhuma é aberta: todas têm teto por minuto
    for (const rule of Object.values(r)) {
      expect(rule.window).toBe(60);
      expect(rule.max).toBeLessThanOrEqual(60);
    }
  });

  it('uma turma de 30 alunos atrás do mesmo IP entra; o 31º pedido no mesmo minuto é barrado; outro IP segue livre', async () => {
    const auth = makeAuth();
    const blocked = await firstBlocked(auth, '/sign-in/email', '10.1.1.1', (i) => ({ email: `aluno${i}@exemplo.com`, password: 'senha-qualquer' }), 40);
    expect(blocked).toBe(31);
    expect((await hit(auth, '/sign-in/email', '10.2.2.2', { email: 'x@exemplo.com', password: 'senha-qualquer' })).status).not.toBe(429);
  });

  it('pedidos de link mágico: 20 por minuto por IP', async () => {
    const auth = makeAuth();
    expect(await firstBlocked(auth, '/sign-in/magic-link', '10.3.3.3', (i) => ({ email: `aluno${i}@exemplo.com` }), 30)).toBe(21);
  });

  it('pedidos de recuperação de senha: 20 por minuto por IP (o padrão era 3)', async () => {
    const auth = makeAuth();
    expect(await firstBlocked(auth, '/request-password-reset', '10.4.4.4', (i) => ({ email: `aluno${i}@exemplo.com`, redirectTo: '/redefinir-senha' }), 30)).toBe(21);
  });
});

describe('limites por e-mail', () => {
  it('KeyedLimiter conta por chave e reabre depois da janela', () => {
    const l = new KeyedLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => l.take('a', 0))).toEqual([true, true, true, false]);
    expect(l.take('b', 0)).toBe(true);
    expect(l.take('a', 1001)).toBe(true);
  });
  it('envio: 3 por 15 min; senha: 10 por 5 min', () => {
    const send = emailLimits.send();
    expect([1, 2, 3, 4].map(() => send.take('x@y.z', 0))).toEqual([true, true, true, false]);
    expect(send.take('x@y.z', 15 * 60 * 1000 + 1)).toBe(true);
    const pw = emailLimits.signIn();
    expect(Array.from({ length: 11 }, () => pw.take('x@y.z', 0)).filter(Boolean)).toHaveLength(10);
    expect(pw.take('x@y.z', 5 * 60 * 1000 + 1)).toBe(true);
  });
});

describe('validade do link mágico', () => {
  it('padrão 72 h; valores inválidos voltam ao padrão', () => {
    expect(magicLinkTtlHours({})).toBe(72);
    expect(magicLinkTtlHours({ MAGIC_LINK_TTL_HOURS: '24' })).toBe(24);
    expect(magicLinkTtlHours({ MAGIC_LINK_TTL_HOURS: '0' })).toBe(72);
    expect(magicLinkTtlHours({ MAGIC_LINK_TTL_HOURS: 'abc' })).toBe(72);
    expect(magicLinkTtlHours({ MAGIC_LINK_TTL_HOURS: '99999' })).toBe(72);
  });
});
