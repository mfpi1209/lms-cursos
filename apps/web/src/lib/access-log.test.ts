import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, access, createDb, runMigrations, schema, seed, SEED_PASSWORD, type Database } from '@lms/db';
import { createAccessLogHooks } from './access-log';
import { clientIpConfigFromEnv } from './client-ip';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
const cfg = clientIpConfigFromEnv({});

describe('ganchos do registro de acesso (unidade)', () => {
  it('login e renovação gravam usuário, IP e tipo', async () => {
    const calls: Array<{ userId: string; ipAddress: string | null; kind: string }> = [];
    const hooks = createAccessLogHooks({ config: cfg, record: async (i) => (calls.push(i), true) });
    await hooks.session.create.after({ userId: 'u1' }, { headers: new Headers({ 'x-forwarded-for': '203.0.113.5' }) });
    await hooks.session.update.after({ userId: 'u1' }, { request: { headers: new Headers({ 'x-forwarded-for': '203.0.113.6' }) } });
    expect(calls).toMatchObject([
      { userId: 'u1', ipAddress: '203.0.113.5', kind: 'login' },
      { userId: 'u1', ipAddress: '203.0.113.6', kind: 'renew' },
    ]);
  });

  it('se gravar falhar (lança, rejeita ou o banco quebrou), o gancho resolve normalmente: o login segue', async () => {
    const warn = vi.fn();
    const throwing = createAccessLogHooks({ config: cfg, record: () => { throw new Error('x'); }, warn });
    const rejecting = createAccessLogHooks({ config: cfg, record: () => Promise.reject(new Error('y')), warn });
    await expect(throwing.session.create.after({ userId: 'u1' }, null)).resolves.toBeUndefined();
    await expect(rejecting.session.create.after({ userId: 'u1' }, undefined)).resolves.toBeUndefined();
    // banco sem a tabela de verdade: o wrapper seguro do repositório devolve false e o gancho também resolve
    const broken = { insert: () => ({ values: () => Promise.reject(new Error('relation "access_logs" does not exist')) }) } as never;
    const real = createAccessLogHooks({ config: cfg, record: (i) => access.recordAccessLogSafe(broken, i, { onError: warn }), warn });
    await expect(real.session.update.after({ userId: 'u1' }, null)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    // sem usuário no registro de sessão: não grava nada e não quebra
    await expect(throwing.session.create.after({}, null)).resolves.toBeUndefined();
  });
});

/**
 * Fluxo real do Better Auth contra o banco de teste: o login grava a linha com o IP do cabeçalho do proxy, a renovação
 * grava `renew`, e se a tabela `access_logs` não existir o login continua funcionando.
 */
describe('registro de acesso no fluxo de login (Better Auth + banco de teste)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let auth: typeof import('./auth')['auth'];
  const EMAIL = 'aluna@demo.local';

  beforeAll(async () => {
    assertDisposableDatabaseUrl(TEST_URL);
    process.env.DATABASE_URL = TEST_URL;
    process.env.BETTER_AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-xxxxxxxx';
    process.env.TRUSTED_PROXIES = '172.18.0.5';
    const conn = createDb(TEST_URL, { max: 4 });
    await conn.sql`drop schema public cascade`;
    await conn.sql`drop schema if exists drizzle cascade`;
    await conn.sql`create schema public`;
    await runMigrations(TEST_URL);
    await seed(conn.db);
    db = conn.db;
    close = conn.close;
    auth = (await import('./auth')).auth;
  });
  afterAll(async () => {
    await close();
  });

  const signIn = (xff: string) =>
    auth.api.signInEmail({ body: { email: EMAIL, password: SEED_PASSWORD }, headers: new Headers({ 'x-forwarded-for': xff, 'user-agent': 'teste' }), returnHeaders: true });

  it('login grava uma linha `login` com o IP real (cadeia do proxy) e a mesma regra vale para session.ip_address', async () => {
    const r = await signIn('9.9.9.9, 198.51.100.7, 172.18.0.5');
    const userId = r.response.user.id;
    const rows = await db.select().from(schema.accessLogs).where(eq(schema.accessLogs.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'login', ipAddress: '198.51.100.7' });
    const [sess] = await db.select().from(schema.session).where(eq(schema.session.userId, userId));
    expect(sess!.ipAddress).toBe('198.51.100.7');
  });

  it('renovação diária da sessão grava `renew`', async () => {
    const r = await signIn('198.51.100.8');
    const userId = r.response.user.id;
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    // a sessão foi renovada pela última vez há mais de um dia: o próximo getSession renova
    await db.update(schema.session).set({ expiresAt: new Date(Date.now() + 10 * 86_400_000) }).where(eq(schema.session.userId, userId));
    await auth.api.getSession({ headers: new Headers({ cookie, 'x-forwarded-for': '198.51.100.9' }) });
    const rows = await db.select().from(schema.accessLogs).where(eq(schema.accessLogs.userId, userId));
    const renew = rows.filter((x) => x.kind === 'renew');
    expect(renew.length).toBeGreaterThanOrEqual(1);
    expect(renew.at(-1)!.ipAddress).toBe('198.51.100.9');
  });

  it('se a tabela access_logs não existir, o login continua funcionando', async () => {
    await db.execute(sql`drop table access_logs`);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await signIn('198.51.100.10');
    expect(r.response.user.email).toBe(EMAIL);
    expect(r.response.token).toBeTruthy();
    const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, r.response.user.id));
    expect(sessions.some((x) => x.ipAddress === '198.51.100.10')).toBe(true);
    expect(errors.mock.calls.flat().join(' ')).toContain('[access-log] falha ao gravar');
    errors.mockRestore();
  });
});
