import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, integrationTokens, learning, newId, runMigrations, schema as s, seed, signWebhook, type Database } from '@lms/db';

/** Progresso, webhooks e exportação pela web, contra o banco de teste. */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
const BASE = 'http://localhost:3000';

const viewerMock = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'author', workspaceId: '', userId: '' }));
vi.mock('./viewer', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./viewer')>();
  return {
    ...orig,
    requireAdmin: async () => {
      if (viewerMock.role !== 'admin') throw new orig.HttpError(403, 'Apenas administradores');
      return { user: { id: viewerMock.userId }, workspace: { id: viewerMock.workspaceId }, role: 'admin' };
    },
  };
});

let db: Database;
let close: () => Promise<void>;
let workspaceId: string;
let adminId: string;
let courseId: string;
let GET_PROGRESS: typeof import('@/app/api/integracao/v1/progresso/route')['GET'];
let WEBHOOKS: typeof import('@/app/api/integracao/v1/webhooks/route');
let WEBHOOK_ONE: typeof import('@/app/api/integracao/v1/webhooks/[id]/route');
let EXPORT: typeof import('@/app/api/workspace/reports/progress/route')['GET'];
let resetLimits: () => void;

const mkToken = async (scopes: string[], ws = workspaceId) => (await integrationTokens.createIntegrationToken(db, { workspaceId: ws, actorId: adminId, name: 'teste', scopes })).secret;
const req = (url: string, secret: string | null, init: { method?: string; body?: unknown } = {}) =>
  new Request(`${BASE}${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const progress = (secret: string | null, query = '') => GET_PROGRESS(req(`/api/integracao/v1/progresso${query}`, secret));

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.BETTER_AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-xxxxxxxx';
  process.env.BETTER_AUTH_URL = BASE;
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  workspaceId = seeded.workspaceId;
  courseId = seeded.courseId;
  adminId = seeded.users['admin@demo.local']!;
  viewerMock.workspaceId = workspaceId;
  viewerMock.userId = adminId;
  // segunda matrícula, para paginar
  await learning.enrollStudent(db, { courseId, userId: seeded.users['aluna@demo.local']!, createdBy: adminId });
  GET_PROGRESS = (await import('@/app/api/integracao/v1/progresso/route')).GET;
  WEBHOOKS = await import('@/app/api/integracao/v1/webhooks/route');
  WEBHOOK_ONE = await import('@/app/api/integracao/v1/webhooks/[id]/route');
  EXPORT = (await import('@/app/api/workspace/reports/progress/route')).GET;
  const auth = await import('./integration-auth');
  resetLimits = auth.resetIntegrationLimits;
});
afterAll(async () => {
  await close();
});
beforeEach(() => {
  resetLimits();
  viewerMock.role = 'admin';
});

describe('GET /progresso: autenticação e escopo', () => {
  it('sem token, malformado ou revogado: 401 igual para todos', async () => {
    const revoked = await mkToken(['progress:read']);
    const row = await integrationTokens.findActiveTokenByHash(db, integrationTokens.hashToken(revoked));
    await integrationTokens.revokeIntegrationToken(db, { workspaceId, actorId: adminId, tokenId: row!.id });
    const bodies: string[] = [];
    for (const secret of [null, 'abc', 'lms_naoexiste0123456789abcdefghijklmnopqrstu', revoked]) {
      const res = await progress(secret);
      expect(res.status).toBe(401);
      bodies.push(JSON.stringify(await res.json()));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('token sem progress:read recebe 403, em /progresso e em /webhooks', async () => {
    const only = await mkToken(['students:write']);
    const res = await progress(only);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect((await WEBHOOKS.GET(req('/api/integracao/v1/webhooks', only))).status).toBe(403);
    const withProgressOnly = await mkToken(['progress:read']);
    expect((await WEBHOOKS.GET(req('/api/integracao/v1/webhooks', withProgressOnly))).status).toBe(403);
    expect((await WEBHOOKS.POST(req('/api/integracao/v1/webhooks', withProgressOnly, { method: 'POST', body: { url: 'http://localhost:1/x', eventos: ['ping'] } }))).status).toBe(403);
  });
});

describe('GET /progresso: parâmetros e conteúdo', () => {
  it('devolve { itens, proximoCursor } com o contrato documentado', async () => {
    const secret = await mkToken(['progress:read']);
    const res = await progress(secret);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['itens', 'proximoCursor']);
    expect(body.proximoCursor).toBeNull();
    expect(body.itens.length).toBeGreaterThanOrEqual(2);
    const item = body.itens[0];
    expect(Object.keys(item).sort()).toEqual(
      ['atualizado_em', 'aluno', 'aulas_concluidas', 'aulas_total', 'avaliacoes', 'certificado_codigo', 'concluido_em', 'curso', 'curso_concluido', 'matricula_id', 'matriculado_em', 'primeiro_acesso', 'status_matricula', 'tarefa', 'ultimo_acesso'].sort(),
    );
    expect(item.certificado_codigo).toBeNull();
    expect(item.curso.slug).toBe('comunicacao-no-primeiro-emprego');
    expect(item.tarefa).toEqual({ status: null, total: 0, pendentes: 0, enviadas: 0, aprovadas: 0, devolvidas: 0 });
  });

  it('pagina com limite e cursor; filtra por curso; curso desconhecido é 404', async () => {
    const secret = await mkToken(['progress:read']);
    const p1 = await (await progress(secret, '?limite=1')).json();
    expect(p1.itens).toHaveLength(1);
    expect(p1.proximoCursor).toBeTruthy();
    const p2 = await (await progress(secret, `?limite=1&cursor=${encodeURIComponent(p1.proximoCursor)}`)).json();
    expect(p2.itens).toHaveLength(1);
    expect(p2.itens[0].matricula_id).not.toBe(p1.itens[0].matricula_id);
    const byCourse = await (await progress(secret, '?curso=comunicacao-no-primeiro-emprego')).json();
    expect(byCourse.itens.length).toBeGreaterThanOrEqual(2);
    const missing = await progress(secret, '?curso=nao-existe');
    expect(missing.status).toBe(404);
  });

  it('valida limite, desde e cursor com 422', async () => {
    const secret = await mkToken(['progress:read']);
    for (const q of ['?limite=0', '?limite=501', '?limite=abc', '?limite=-1', '?desde=ontem', '?desde=2026-13-45', '?cursor=lixo']) {
      const res = await progress(secret, q);
      expect(res.status, q).toBe(422);
      expect((await res.json()).error.message).toBeTruthy();
    }
    expect((await progress(secret, '?limite=500')).status).toBe(200);
  });

  it('desde filtra pela atividade: no futuro não vem nada; só a data vale 00:00 UTC', async () => {
    const secret = await mkToken(['progress:read']);
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect((await (await progress(secret, `?desde=${encodeURIComponent(future)}`)).json()).itens).toEqual([]);
    const past = (await (await progress(secret, '?desde=2000-01-01')).json()).itens;
    expect(past.length).toBeGreaterThanOrEqual(2);
    const sinceFirst = past[0].atualizado_em;
    const after = (await (await progress(secret, `?desde=${encodeURIComponent(new Date(new Date(sinceFirst).getTime() - 1).toISOString())}`)).json()).itens;
    expect(after.map((r: { matricula_id: string }) => r.matricula_id)).toContain(past[0].matricula_id);
    // sem fuso vale UTC
    expect((await progress(secret, '?desde=2000-01-01T00:00:00')).status).toBe(200);
  });

  it('um token de outro workspace não vê nada deste', async () => {
    const ws2 = newId('wsp');
    await db.insert(s.workspaces).values({ id: ws2, slug: `outro-${ws2.slice(-6)}`, name: 'Outro' });
    const other = await mkToken(['progress:read'], ws2);
    expect(await (await progress(other)).json()).toEqual({ itens: [], proximoCursor: null });
    // pedir o slug de um curso deste workspace com o token do outro: 404, sem confirmar que existe
    expect((await progress(other, '?curso=comunicacao-no-primeiro-emprego')).status).toBe(404);
  });
});

describe('/webhooks pela API', () => {
  it('cria (segredo só na resposta), lista sem segredo, valida e apaga', async () => {
    const secret = await mkToken(['webhooks:manage']);
    const created = await WEBHOOKS.POST(req('/api/integracao/v1/webhooks', secret, { method: 'POST', body: { url: 'http://localhost:4599/dna', eventos: ['enrollment.created', 'certificate.issued'] } }));
    expect(created.status).toBe(200);
    const { webhook } = await created.json();
    expect(webhook.segredo).toMatch(/^whsec_/);
    expect(webhook).toMatchObject({ ativo: true, eventos: ['enrollment.created', 'certificate.issued'] });

    const list = await WEBHOOKS.GET(req('/api/integracao/v1/webhooks', secret));
    const text = await list.text();
    expect(text).not.toContain(webhook.segredo);
    expect(JSON.parse(text).webhooks.map((w: { id: string }) => w.id)).toContain(webhook.id);
    expect(JSON.parse(text).eventosDisponiveis).toContain('certificate.issued');

    const bad = await WEBHOOKS.POST(req('/api/integracao/v1/webhooks', secret, { method: 'POST', body: { url: 'http://exemplo.com/x', eventos: ['enrollment.created'] } }));
    expect(bad.status).toBe(422);
    expect((await WEBHOOKS.POST(req('/api/integracao/v1/webhooks', secret, { method: 'POST', body: { url: 'http://localhost:1/x', eventos: ['nao.existe'] } }))).status).toBe(422);
    expect((await WEBHOOKS.POST(req('/api/integracao/v1/webhooks', secret, { method: 'POST', body: { url: 'http://localhost:1/x', eventos: [] } }))).status).toBe(422);

    // outro workspace não apaga
    const ws2 = newId('wsp');
    await db.insert(s.workspaces).values({ id: ws2, slug: `outro-${ws2.slice(-6)}`, name: 'Outro' });
    const other = await mkToken(['webhooks:manage'], ws2);
    expect((await WEBHOOK_ONE.DELETE(req(`/api/integracao/v1/webhooks/${webhook.id}`, other, { method: 'DELETE' }), { params: Promise.resolve({ id: webhook.id }) })).status).toBe(404);
    expect((await WEBHOOK_ONE.DELETE(req(`/api/integracao/v1/webhooks/${webhook.id}`, secret, { method: 'DELETE' }), { params: Promise.resolve({ id: webhook.id }) })).status).toBe(200);
    expect(await db.select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, webhook.id))).toHaveLength(0);
    expect((await WEBHOOK_ONE.DELETE(req('/api/integracao/v1/webhooks/xx', secret, { method: 'DELETE' }), { params: Promise.resolve({ id: 'xx' }) })).status).toBe(404);
  });
});

describe('exportação CSV do estúdio', () => {
  const run = (query = '') => EXPORT(new Request(`${BASE}/api/workspace/reports/progress${query}`));

  it('só a administração baixa', async () => {
    viewerMock.role = 'author';
    const res = await run();
    expect(res.status).toBe(403);
  });

  it('devolve CSV com BOM, anexo e nome do arquivo, e grava UMA auditoria só com contagens', async () => {
    const before = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'report.export_progress'));
    const res = await run('?curso=comunicacao-no-primeiro-emprego');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="progresso-comunicacao-no-primeiro-emprego-\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 (res.text() o descartaria)
    const text = bytes.toString('utf8').slice(1);
    expect(text.startsWith('Nome;E-mail;RGM;Curso;')).toBe(true);
    const logs = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'report.export_progress'))).filter((l) => !before.some((b) => b.id === l.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ workspaceId, actorId: adminId, data: { formato: 'csv', curso: 'comunicacao-no-primeiro-emprego' } });
    expect(typeof logs[0]!.data.linhas).toBe('number');
    expect(text.trim().split('\r\n').length - 1).toBe(logs[0]!.data.linhas);
    // nenhum dado pessoal na auditoria
    expect(JSON.stringify(logs[0])).not.toMatch(/@demo\.local|Diego|Elisa/);
  });

  it('curso desconhecido: 404 e nenhuma auditoria nova', async () => {
    const before = (await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'report.export_progress'))).length;
    expect((await run('?curso=nao-existe')).status).toBe(404);
    expect((await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, 'report.export_progress'))).length).toBe(before);
  });
});

describe('exemplo de verificação da documentação', () => {
  it('o código Node do documento confere a assinatura que o worker gera (e recusa adulteração)', () => {
    const doc = readFileSync(path.resolve(__dirname, '../../../../docs/integracao/api-v1.md'), 'utf8');
    const section = doc.split('#### Verificar a assinatura (Node.js)')[1]!;
    const code = /```js\n([\s\S]*?)```/.exec(section)![1]!;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const verificar = new Function('require', `${code}\nreturn verificarAssinatura;`)((m: string) => require(m)) as (segredo: string, headers: Record<string, string>, corpo: string) => boolean;
    const segredo = 'whsec_exemplo';
    const corpo = JSON.stringify({ id: 'obx_1', type: 'ping', created_at: '2026-03-12T14:03:22.000Z', workspace_id: 'wsp_1', data: { mensagem: 'olá, ação' } });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = { 'x-dna-timestamp': ts, 'x-dna-signature': signWebhook(segredo, ts, corpo) };
    expect(verificar(segredo, headers, corpo)).toBe(true);
    expect(verificar(segredo, headers, corpo.replace('olá', 'oi'))).toBe(false);
    expect(verificar('whsec_outro', headers, corpo)).toBe(false);
    expect(verificar(segredo, { ...headers, 'x-dna-timestamp': String(Number(ts) - 600) }, corpo)).toBe(false);
    expect(verificar(segredo, { 'x-dna-timestamp': ts }, corpo)).toBe(false);
  });

  it('o documento descreve os mesmos eventos e o mesmo teto de tentativas do código', async () => {
    const { WEBHOOK_EVENT_TYPES, WEBHOOK_MAX_ATTEMPTS } = await import('@lms/db');
    const doc = readFileSync(path.resolve(__dirname, '../../../../docs/integracao/api-v1.md'), 'utf8');
    for (const t of WEBHOOK_EVENT_TYPES) expect(doc).toContain(`\`${t}\``);
    expect(doc).toContain(`Até **${WEBHOOK_MAX_ATTEMPTS} tentativas**`);
  });
});
