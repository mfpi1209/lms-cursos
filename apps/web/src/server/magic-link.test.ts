import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, runMigrations, schema, seed, SEED_PASSWORD, type Database } from '@lms/db';
import { clearSentEmails, getSentEmails } from '@lms/email';

/**
 * Fluxos de acesso por e-mail contra o Better Auth real e o banco de teste: link mágico (envio, uso único, validade,
 * e-mail desconhecido), o auxiliar que devolve a URL sem enviar e a recuperação de senha de ponta a ponta.
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
const BASE = 'http://localhost:3000';
const EMAIL = 'aluna@demo.local';

let db: Database;
let close: () => Promise<void>;
let auth: typeof import('@/lib/auth')['auth'];
let createMagicLinkUrl: typeof import('./magic-link')['createMagicLinkUrl'];
let confirmMagicLink: typeof import('./magic-link-confirm')['confirmMagicLink'];

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  auth.handler(new Request(`${BASE}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': '203.0.113.9', ...headers }, body: JSON.stringify(body) }));
const get = (url: string, headers: Record<string, string> = {}) => auth.handler(new Request(url, { headers: { 'x-forwarded-for': '203.0.113.9', ...headers } }));
/** o "Continuar" da página de confirmação: POST com os parâmetros do link */
const confirm = (url: string) => {
  const fd = new FormData();
  for (const [k, v] of new URL(url).searchParams) fd.set(k, v);
  return confirmMagicLink(new Request(`${BASE}/api/entrar/confirmar`, { method: 'POST', body: fd, headers: { 'x-forwarded-for': '203.0.113.9' } }));
};
const lastEmail = () => getSentEmails().at(-1)!;
const urlIn = (text: string) => text.match(/https?:\/\/\S+/)![0];

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.BETTER_AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-xxxxxxxx';
  process.env.BETTER_AUTH_URL = BASE;
  delete process.env.MAGIC_LINK_TTL_HOURS;
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  await seed(conn.db);
  db = conn.db;
  close = conn.close;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  auth = (await import('@/lib/auth')).auth;
  createMagicLinkUrl = (await import('./magic-link')).createMagicLinkUrl;
  confirmMagicLink = (await import('./magic-link-confirm')).confirmMagicLink;
});
afterAll(async () => {
  await close();
});
beforeEach(() => clearSentEmails());

describe('link mágico por e-mail', () => {
  it('envia o link a quem tem conta e ele entra uma única vez, indo para /aprender', async () => {
    const r = await post('/sign-in/magic-link', { email: EMAIL, callbackURL: '/aprender', errorCallbackURL: '/login?erro=link' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: true });
    expect(getSentEmails()).toHaveLength(1);
    const mail = lastEmail();
    expect(mail.to).toBe(EMAIL);
    expect(mail.text).toContain('3 dias');
    const url = urlIn(mail.text);

    const ok = await confirm(url);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`${BASE}/aprender`);
    expect(ok.headers.get('set-cookie')).toContain('session_token');

    const again = await confirm(url);
    expect(again.status).toBe(303);
    const loc = new URL(again.headers.get('location')!, BASE);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(again.headers.get('set-cookie') ?? '').not.toContain('session_token');
  });

  it('link vencido é recusado', async () => {
    await post('/sign-in/magic-link', { email: EMAIL, callbackURL: '/aprender', errorCallbackURL: '/login?erro=link' });
    const url = urlIn(lastEmail().text);
    const token = new URL(url).searchParams.get('token')!;
    await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `magic-link:${token}`));
    const res = await confirm(url);
    expect(new URL(res.headers.get('location')!, BASE).searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(res.headers.get('set-cookie') ?? '').not.toContain('session_token');
  });

  it('e-mail desconhecido: mesma resposta, nenhum e-mail enviado, nenhuma conta criada', async () => {
    const known = await post('/sign-in/magic-link', { email: EMAIL, callbackURL: '/aprender' });
    clearSentEmails();
    const unknown = await post('/sign-in/magic-link', { email: 'ninguem-aqui@exemplo.com', callbackURL: '/aprender' });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual({ status: true });
    expect(getSentEmails()).toHaveLength(0);
    const rows = await db.select().from(schema.user).where(eq(schema.user.email, 'ninguem-aqui@exemplo.com'));
    expect(rows).toHaveLength(0);
  });

  it('token de e-mail sem conta nunca cria cadastro (disableSignUp)', async () => {
    // simula um token emitido para um e-mail sem conta (o plugin grava a linha mesmo assim)
    const token = 'tokenSemConta0123456789abcdefghij';
    await db.insert(schema.verification).values({
      id: 'vrf_sem_conta',
      identifier: `magic-link:${token}`,
      value: JSON.stringify({ type: 'magic-link', email: 'fantasma@exemplo.com' }),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await get(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=%2Faprender&errorCallbackURL=%2Flogin%3Ferro%3Dlink`);
    expect(new URL(res.headers.get('location')!, BASE).searchParams.get('error')).toBe('new_user_signup_disabled');
    expect(await db.select().from(schema.user).where(eq(schema.user.email, 'fantasma@exemplo.com'))).toHaveLength(0);
  });

  it('limite por e-mail: depois de 3 pedidos em 15 min não sai mais e-mail, e a resposta continua a mesma', async () => {
    const email = 'aluno@demo.local';
    for (let i = 0; i < 5; i++) {
      const r = await post('/sign-in/magic-link', { email, callbackURL: '/aprender' });
      expect(await r.json()).toEqual({ status: true });
    }
    expect(getSentEmails().filter((m) => m.to === email)).toHaveLength(3);
  });
});

describe('auxiliar createMagicLinkUrl (sem envio)', () => {
  it('devolve a URL do plugin, não envia e-mail, vale uma vez e dura 72 h', async () => {
    const url = await createMagicLinkUrl('Autor@Demo.Local');
    expect(url).toBeTruthy();
    expect(getSentEmails()).toHaveLength(0);
    const u = new URL(url!);
    expect(u.pathname).toBe('/entrar/confirmar');
    expect(u.searchParams.get('callbackURL')).toBe('/aprender');
    const [row] = await db.select().from(schema.verification).where(eq(schema.verification.identifier, `magic-link:${u.searchParams.get('token')}`));
    const hours = (row!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);

    const ok = await confirm(url!);
    expect(ok.headers.get('location')).toBe(`${BASE}/aprender`);
    expect(ok.headers.get('set-cookie')).toContain('session_token');
    const again = await confirm(url!);
    expect(new URL(again.headers.get('location')!, BASE).searchParams.get('error')).toBe('INVALID_TOKEN');
  });

  it('e-mail sem conta devolve null e não deixa token pendente', async () => {
    const before = await db.select().from(schema.verification).where(like(schema.verification.identifier, 'magic-link:%'));
    expect(await createMagicLinkUrl('ninguem@exemplo.com')).toBeNull();
    const after = await db.select().from(schema.verification).where(like(schema.verification.identifier, 'magic-link:%'));
    expect(after.length).toBe(before.length);
  });

  it('o contexto de captura não vaza: um pedido normal depois do auxiliar ainda envia o e-mail', async () => {
    await createMagicLinkUrl(EMAIL);
    expect(getSentEmails()).toHaveLength(0);
    await post('/sign-in/magic-link', { email: 'revisor@demo.local', callbackURL: '/aprender' });
    expect(getSentEmails()).toHaveLength(1);
  });
});

describe('página de confirmação do link (scanners de e-mail não queimam o token)', () => {
  const rowOf = async (url: string) => {
    const token = new URL(url).searchParams.get('token')!;
    return db.select().from(schema.verification).where(eq(schema.verification.identifier, `magic-link:${token}`));
  };

  it('o e-mail e o auxiliar entregam o endereço da página de confirmação, com os mesmos parâmetros', async () => {
    await post('/sign-in/magic-link', { email: 'autor@demo.local', callbackURL: '/aprender', errorCallbackURL: '/login?erro=link' });
    const u = new URL(urlIn(lastEmail().text));
    expect(u.pathname).toBe('/entrar/confirmar');
    expect(u.searchParams.get('token')).toBeTruthy();
    expect(u.searchParams.get('callbackURL')).toBe('/aprender');
    expect(u.searchParams.get('errorCallbackURL')).toBe('/login?erro=link');
    expect(new URL((await createMagicLinkUrl(EMAIL))!).pathname).toBe('/entrar/confirmar');
  });

  it('abrir a página (GET, quantas vezes for) não consome o token; "Continuar" entra uma única vez', async () => {
    const url = (await createMagicLinkUrl(EMAIL, { callbackURL: '/aprender' }))!;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const Page = (await import('@/app/entrar/confirmar/page')).default;
    const q = Object.fromEntries(new URL(url).searchParams);
    for (let i = 0; i < 3; i++) {
      const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(q) }));
      expect(html).toContain('Continuar');
      expect(html).toContain('method="post"');
      expect(html).toContain('action="/api/entrar/confirmar"');
      expect(html).toContain(`value="${q.token}"`);
    }
    expect(await rowOf(url)).toHaveLength(1);

    const ok = await confirm(url);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`${BASE}/aprender`);
    expect(ok.headers.get('set-cookie')).toContain('session_token');
    expect(await rowOf(url)).toHaveLength(0);

    const again = await confirm(url);
    expect(new URL(again.headers.get('location')!, BASE).searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(again.headers.get('set-cookie') ?? '').not.toContain('session_token');
  });

  it('a rota só aceita POST e recusa token malformado e destino externo', async () => {
    const route = await import('@/app/api/entrar/confirmar/route');
    expect((route as Record<string, unknown>).GET).toBeUndefined();
    const fd = new FormData();
    fd.set('token', 'x');
    fd.set('callbackURL', 'https://evil.example/');
    fd.set('errorCallbackURL', '//evil.example');
    const res = await confirmMagicLink(new Request(`${BASE}/api/entrar/confirmar`, { method: 'POST', body: fd }));
    expect(res.headers.get('location')).toBe('/login?erro=link');
    // destino externo é trocado pelo padrão mesmo com token válido
    const url = (await createMagicLinkUrl(EMAIL))!;
    const fd2 = new FormData();
    fd2.set('token', new URL(url).searchParams.get('token')!);
    fd2.set('callbackURL', 'https://evil.example/');
    const ok = await confirmMagicLink(new Request(`${BASE}/api/entrar/confirmar`, { method: 'POST', body: fd2 }));
    expect(ok.headers.get('location')).toBe(`${BASE}/aprender`);
  });
});

describe('recuperação de senha', () => {
  const who = 'admin@demo.local';

  it('de ponta a ponta: pede, recebe, define a nova senha, token vale uma vez e as sessões antigas caem', async () => {
    // sessão aberta antes da troca
    const login = await post('/sign-in/email', { email: who, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const [user] = await db.select().from(schema.user).where(eq(schema.user.email, who));
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, user!.id))).not.toHaveLength(0);

    const req = await post('/request-password-reset', { email: who, redirectTo: '/redefinir-senha' });
    expect(req.status).toBe(200);
    const mail = lastEmail();
    expect(mail.to).toBe(who);
    expect(mail.text).toContain('60 minutos');

    const cb = await get(urlIn(mail.text));
    expect(cb.status).toBe(302);
    const dest = new URL(cb.headers.get('location')!, BASE);
    expect(dest.pathname).toBe('/redefinir-senha');
    const token = dest.searchParams.get('token')!;
    expect(token).toBeTruthy();

    const short = await post('/reset-password', { newPassword: '123', token });
    expect(short.status).toBe(400);

    const done = await post('/reset-password', { newPassword: 'outra-senha-forte-9', token });
    expect(done.status).toBe(200);

    expect((await post('/sign-in/email', { email: who, password: SEED_PASSWORD })).status).toBe(401);
    expect((await post('/sign-in/email', { email: who, password: 'outra-senha-forte-9' })).status).toBe(200);
    expect((await post('/reset-password', { newPassword: 'mais-uma-senha-9', token })).status).toBe(400);
  });

  it('sessões abertas antes da troca de senha são revogadas', async () => {
    const email = 'revisor@demo.local';
    await post('/sign-in/email', { email, password: SEED_PASSWORD });
    const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    const before = await db.select().from(schema.session).where(eq(schema.session.userId, user!.id));
    expect(before.length).toBeGreaterThan(0);
    clearSentEmails();
    await post('/request-password-reset', { email, redirectTo: '/redefinir-senha' });
    const cb = await get(urlIn(lastEmail().text));
    const token = new URL(cb.headers.get('location')!, BASE).searchParams.get('token')!;
    await post('/reset-password', { newPassword: 'senha-nova-abc-123', token });
    const after = await db.select().from(schema.session).where(eq(schema.session.userId, user!.id));
    expect(after.map((s) => s.id)).not.toEqual(expect.arrayContaining(before.map((s) => s.id)));
  });

  it('e-mail desconhecido: resposta idêntica e nenhum e-mail', async () => {
    clearSentEmails();
    const a = await post('/request-password-reset', { email: 'ninguem@exemplo.com', redirectTo: '/redefinir-senha' });
    const b = await post('/request-password-reset', { email: 'autor@demo.local', redirectTo: '/redefinir-senha' });
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
    expect(getSentEmails().map((m) => m.to)).toEqual(['autor@demo.local']);
  });

  it('token vencido ou inventado é recusado', async () => {
    expect((await post('/reset-password', { newPassword: 'qualquer-senha-9', token: 'inventado' })).status).toBe(400);
    await post('/request-password-reset', { email: 'aluno@demo.local', redirectTo: '/redefinir-senha' });
    const url = urlIn(lastEmail().text);
    const token = url.split('/reset-password/')[1]!.split('?')[0]!;
    await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `reset-password:${token}`));
    expect((await post('/reset-password', { newPassword: 'qualquer-senha-9', token })).status).toBe(400);
    const cb = await get(url);
    expect(new URL(cb.headers.get('location')!, BASE).searchParams.get('error')).toBe('INVALID_TOKEN');
  });
});

describe('limite de senhas por e-mail (força bruta distribuída)', () => {
  it('depois de 10 tentativas em 5 min a conta recusa até com IPs diferentes; outra conta segue livre', async () => {
    const email = 'aluno@demo.local';
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await post('/sign-in/email', { email, password: 'errada-errada' }, { 'x-forwarded-for': `198.51.100.${i + 1}` })).status;
    expect(last).toBe(429);
    expect((await post('/sign-in/email', { email: 'autor@demo.local', password: SEED_PASSWORD })).status).toBe(200);
  });
});
