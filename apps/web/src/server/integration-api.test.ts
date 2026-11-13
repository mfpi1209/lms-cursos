import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, integrationTokens, runMigrations, schema, seed, type Database } from '@lms/db';

/** API de integração contra o banco de teste: autenticação por token, escopos, limites e o cadastro de alunos. */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
const BASE = 'http://localhost:3000';
const SLUG = 'comunicacao-no-primeiro-emprego';

let db: Database;
let close: () => Promise<void>;
let workspaceId: string;
let adminId: string;
let POST: typeof import('@/app/api/integracao/v1/alunos/route')['POST'];
let GET: typeof import('@/app/api/integracao/v1/cursos/route')['GET'];
let resetLimits: () => void;
let confirmMagicLink: typeof import('./magic-link-confirm')['confirmMagicLink'];

const mkToken = async (scopes: string[], name = 'teste') => (await integrationTokens.createIntegrationToken(db, { workspaceId, actorId: adminId, name, scopes })).secret;
const call = (handler: (r: Request) => Promise<Response>, secret: string | null, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  handler(
    new Request(`${BASE}/api/integracao/v1/x`, {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7', ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...init.headers },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
const alunos = (secret: string | null, body: unknown) => call(POST, secret, { body });

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
  adminId = seeded.users['admin@demo.local']!;
  POST = (await import('@/app/api/integracao/v1/alunos/route')).POST;
  GET = (await import('@/app/api/integracao/v1/cursos/route')).GET;
  const auth = await import('./integration-auth');
  const students = await import('./integration-students');
  resetLimits = () => {
    auth.resetIntegrationLimits();
    students.resetLinkLimit();
  };
  confirmMagicLink = (await import('./magic-link-confirm')).confirmMagicLink;
});
afterAll(async () => {
  await close();
});
beforeEach(() => resetLimits());

describe('autenticação por token', () => {
  it('sem token, malformado, desconhecido ou revogado: o mesmo 401, sem pista de que o token existiu', async () => {
    const revoked = await mkToken(['students:write'], 'revogado');
    const row = await integrationTokens.findActiveTokenByHash(db, integrationTokens.hashToken(revoked));
    await integrationTokens.revokeIntegrationToken(db, { workspaceId, actorId: adminId, tokenId: row!.id });
    const bodies: string[] = [];
    for (const secret of [null, 'abc', 'lms_naoexiste0123456789abcdefghijklmnopqrstu', revoked]) {
      const res = await alunos(secret, { alunos: [] });
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      bodies.push(JSON.stringify(await res.json()));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('token sem o escopo recebe 403; com o escopo passa', async () => {
    const only = await mkToken(['progress:read']);
    const res = await alunos(only, { alunos: [{ nome: 'A', email: 'a@x.com', rgm: '1' }] });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect((await call(GET, only, { method: 'GET' })).status).toBe(403);
    // e nada foi gravado
    expect(await db.select().from(schema.user).where(eq(schema.user.email, 'a@x.com'))).toHaveLength(0);
    const ok = await mkToken(['students:write']);
    expect((await call(GET, ok, { method: 'GET' })).status).toBe(200);
  });

  it('o esquema Bearer é aceito sem diferença de caixa, e o uso marca last_used_at', async () => {
    const secret = await mkToken(['students:write']);
    const res = await call(GET, null, { method: 'GET', headers: { authorization: `bearer   ${secret}` } });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const [row] = await db.select().from(schema.integrationTokens).where(eq(schema.integrationTokens.tokenHash, integrationTokens.hashToken(secret)));
    expect(row!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('limite por token: depois de 120 chamadas no minuto vem 429 com Retry-After; outro token não é afetado', async () => {
    const a = await mkToken(['students:write'], 'a');
    const b = await mkToken(['students:write'], 'b');
    for (let i = 0; i < 120; i++) expect((await call(GET, a, { method: 'GET' })).status).toBe(200);
    const blocked = await call(GET, a, { method: 'GET' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect((await call(GET, b, { method: 'GET' })).status).toBe(200);
  });

  it('muitas tentativas com token errado do mesmo IP também levam a 429', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await alunos('lms_errado0123456789abcdefghijklmnopqrstuvw', { alunos: [] })).status;
    expect(last).toBe(429);
  });
});

describe('POST /api/integracao/v1/alunos', () => {
  const row = (n: number, extra: Record<string, unknown> = {}) => ({ nome: `Aluno ${n}`, email: `Api.Aluno${n}@Teste.Local`, rgm: `API${n}`, ...extra });

  it('cadastra, matricula e NÃO devolve link quando não foi pedido; repetir é idempotente', async () => {
    const secret = await mkToken(['students:write']);
    const res = await alunos(secret, { alunos: [row(1, { cursos: [SLUG], telefone: '11999990000' }), row(2)] });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.resumo).toEqual({ created: 2, updated: 0, unchanged: 0, error: 0, total: 2, criado: 2, atualizado: 0, sem_mudanca: 0, erro: 0 });
    expect(body.resultados[0]).toMatchObject({ linha: 1, email: 'api.aluno1@teste.local', status: 'created', situacao: 'criado', cursosMatriculados: [SLUG] });
    expect(body.resultados[0].userId).toMatch(/^usr_/);
    for (const r of body.resultados) expect('linkAcesso' in r).toBe(false);
    expect(JSON.stringify(body)).not.toContain('/entrar/confirmar');

    const again = await (await alunos(secret, { alunos: [row(1, { cursos: [SLUG], telefone: '11999990000' }), row(2)] })).json();
    expect(again.resumo).toMatchObject({ created: 0, unchanged: 2 });
    expect(again.resultados[0]).toMatchObject({ cursosMatriculados: [], cursosJaMatriculados: [SLUG] });
  });

  it('gerarLink: devolve o link só das linhas aceitas, e ele entra uma única vez', async () => {
    const secret = await mkToken(['students:write']);
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    logs.forEach((l) => l.mockImplementation(() => {}));
    const res = await alunos(secret, { alunos: [row(10, { cursos: [SLUG] }), { nome: 'Ruim', email: 'ruim', rgm: 'R' }], gerarLink: true });
    const body = await res.json();
    expect(body.resultados[0].linkAcesso).toMatch(/\/entrar\/confirmar\?token=/);
    expect('linkAcesso' in body.resultados[1]).toBe(false);
    expect(body.resultados[1]).toMatchObject({ status: 'error', motivo: 'E-mail inválido' });
    // o link nunca vai para o log
    const token = new URL(body.resultados[0].linkAcesso).searchParams.get('token')!;
    expect(JSON.stringify(logs.flatMap((l) => l.mock.calls))).not.toContain(token);
    logs.forEach((l) => l.mockRestore());

    const fd = new FormData();
    for (const [k, v] of new URL(body.resultados[0].linkAcesso).searchParams) fd.set(k, v);
    const req = () => new Request(`${BASE}/api/entrar/confirmar`, { method: 'POST', body: fd });
    const ok = await confirmMagicLink(req());
    expect(ok.headers.get('location')).toBe(`${BASE}/aprender`);
    expect(ok.headers.get('set-cookie')).toContain('session_token');
    const second = await confirmMagicLink(req());
    expect(second.headers.get('set-cookie') ?? '').not.toContain('session_token');
  });

  it('callbackURL próprio vale; destino externo é recusado com 422', async () => {
    const secret = await mkToken(['students:write']);
    const ok = await (await alunos(secret, { alunos: [row(11)], gerarLink: true, callbackURL: '/aprender/meus-cursos' })).json();
    expect(new URL(ok.resultados[0].linkAcesso).searchParams.get('callbackURL')).toBe('/aprender/meus-cursos');
    const bad = await alunos(secret, { alunos: [row(12)], gerarLink: true, callbackURL: 'https://evil.example' });
    expect(bad.status).toBe(422);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, 'api.aluno12@teste.local'))).toHaveLength(0);
  });

  it('erros por linha não derrubam o lote: curso inexistente, RGM repetido, equipe', async () => {
    const secret = await mkToken(['students:write']);
    const body = await (
      await alunos(secret, {
        alunos: [row(20, { cursos: ['nao-existe'] }), row(21), { nome: 'Outro', email: 'outro20@teste.local', rgm: 'API21' }, { nome: 'Equipe', email: 'admin@demo.local', rgm: 'X1' }],
      })
    ).json();
    expect(body.resultados.map((r: { status: string }) => r.status)).toEqual(['error', 'created', 'error', 'error']);
    expect(body.resultados[0].motivo).toContain('nao-existe');
    expect(body.resultados[2].motivo).toMatch(/RGM/);
    expect(body.resultados[3].motivo).toMatch(/equipe/);
  });

  it('valida o corpo: vazio, mais de 500, JSON inválido; 500 passa', async () => {
    const secret = await mkToken(['students:write']);
    expect((await alunos(secret, { alunos: [] })).status).toBe(422);
    expect((await alunos(secret, {})).status).toBe(422);
    const many = Array.from({ length: 501 }, (_, i) => ({ nome: 'N', email: `m${i}@teste.local`, rgm: `M${i}` }));
    expect((await alunos(secret, { alunos: many })).status).toBe(422);
    const bad = await POST(new Request(`${BASE}/x`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: '{nao é json' }));
    expect(bad.status).toBe(400);
    const full = await alunos(secret, { alunos: many.slice(0, 500) });
    expect(full.status).toBe(200);
    expect((await full.json()).resumo.created).toBe(500);
  });

  it('o RGM numérico é aceito como texto', async () => {
    const secret = await mkToken(['students:write']);
    const body = await (await alunos(secret, { alunos: [{ nome: 'Num', email: 'num@teste.local', rgm: 123456 }] })).json();
    expect(body.resultados[0].status).toBe('created');
  });

  it('limite de links por hora: estourado, devolve 429 sem gravar nada', async () => {
    const secret = await mkToken(['students:write']);
    const mk = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ nome: 'L', email: `${p}${i}@teste.local`, rgm: `${p}${i}` }));
    for (let k = 0; k < 2; k++) expect((await alunos(secret, { alunos: mk(`lk${k}-`, 500), gerarLink: true })).status).toBe(200);
    const over = await alunos(secret, { alunos: mk('lk9-', 10), gerarLink: true });
    expect(over.status).toBe(429);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, 'lk9-0@teste.local'))).toHaveLength(0);
    // sem pedir link continua funcionando
    expect((await alunos(secret, { alunos: mk('lk9-', 2) })).status).toBe(200);
  }, 120000);
});

describe('POST /api/integracao/v1/alunos: idempotência pelo RGM', () => {
  it('RGM conhecido troca o e-mail (situacao atualizado, emailAlterado) e repetir dá sem_mudanca; conflito vira erro com codigo', async () => {
    const secret = await mkToken(['students:write']);
    const base = { nome: 'Rgm Um', rgm: 'IDEM1', cursos: [SLUG] };
    const first = await (await alunos(secret, { alunos: [{ ...base, email: 'idem1@teste.local' }, { nome: 'Rgm Dois', rgm: 'IDEM2', email: 'idem2@teste.local' }] })).json();
    expect(first.resultados.map((r: { situacao: string }) => r.situacao)).toEqual(['criado', 'criado']);

    const moved = await (await alunos(secret, { alunos: [{ ...base, email: 'idem1.novo@teste.local' }], gerarLink: true })).json();
    expect(moved.resultados[0]).toMatchObject({ status: 'updated', situacao: 'atualizado', emailAlterado: true, email: 'idem1.novo@teste.local' });
    expect(moved.resultados[0].linkAcesso).toContain('/entrar/confirmar?token=');
    expect(moved.resumo).toMatchObject({ atualizado: 1, erro: 0 });

    const same = await (await alunos(secret, { alunos: [{ ...base, email: 'idem1.novo@teste.local' }] })).json();
    expect(same.resultados[0]).toMatchObject({ status: 'unchanged', situacao: 'sem_mudanca', cursosJaMatriculados: [SLUG] });
    expect('emailAlterado' in same.resultados[0]).toBe(false);

    const clash = await (await alunos(secret, { alunos: [{ ...base, email: 'idem2@teste.local' }, { nome: 'Novo', rgm: 'IDEM3', email: 'idem2@teste.local' }] })).json();
    expect(clash.resultados.map((r: { codigo: string }) => r.codigo)).toEqual(['EMAIL_EM_USO_POR_OUTRO_RGM', 'EMAIL_REPETIDO_NO_LOTE']);
    const clash2 = await (await alunos(secret, { alunos: [{ nome: 'Novo', rgm: 'IDEM3', email: 'idem2@teste.local' }] })).json();
    expect(clash2.resultados[0]).toMatchObject({ situacao: 'erro', codigo: 'EMAIL_EM_USO_POR_OUTRO_RGM' });
    expect(clash.resultados[0]).toMatchObject({ status: 'error', situacao: 'erro' });
    expect(clash.resumo).toMatchObject({ erro: 2 });
  });

  it('linha sem RGM: erro RGM_EM_BRANCO só nessa linha', async () => {
    const secret = await mkToken(['students:write']);
    const body = await (await alunos(secret, { alunos: [{ nome: 'Legado', email: 'legado@teste.local' }, { nome: 'Ok', email: 'ok60@teste.local', rgm: 'API60' }] })).json();
    expect(body.resultados[0]).toMatchObject({ situacao: 'erro', codigo: 'RGM_EM_BRANCO', motivo: 'RGM em branco' });
    expect(body.resultados[1]).toMatchObject({ situacao: 'criado' });
  });
});

describe('GET /api/integracao/v1/cursos', () => {
  it('lista os cursos publicados com slug e título', async () => {
    const secret = await mkToken(['students:write']);
    const body = await (await call(GET, secret, { method: 'GET' })).json();
    expect(body.cursos).toEqual(expect.arrayContaining([expect.objectContaining({ slug: SLUG, title: expect.any(String) })]));
  });
});
