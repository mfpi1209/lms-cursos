import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, learning, newId, runMigrations, schema as s, seed, signWebhook, verifyWebhookSignature, webhooks, type Database } from '@lms/db';
import { BlockedDestinationError, assertDestinationAllowed, checkDestination, createSender, deliverClaimed, dispatchDue, fanOutOutboxEvent, type Sender, type SendRequest } from '../src/webhooks';

/** Worker dos webhooks contra o banco de teste: entregas, assinatura, falhas isoladas, SSRF e reenvio. */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
const KEY = 'c'.repeat(64);
let db: Database;
let close: () => Promise<void>;
let workspaceId: string;
let adminId: string;
let courseId: string;
let seq = 0;

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.WEBHOOK_SECRET_KEY = KEY;
  const conn = createDb(TEST_URL, { max: 6 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  workspaceId = seeded.workspaceId;
  adminId = seeded.users['admin@demo.local']!;
  courseId = seeded.courseId;
}, 60_000);
afterAll(async () => {
  await close();
});

const mkEndpoint = (events = ['enrollment.created']) => webhooks.createEndpoint(db, { workspaceId, actorId: adminId, url: `http://localhost:4599/h${++seq}`, events });

async function newEvent() {
  const id = newId('usr');
  await db.insert(s.user).values({ id, email: `progresso-teste-wk-${++seq}-${id.slice(-6)}@demo.local`, name: 'Aluno Worker', emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId, userId: id, role: 'student', rgm: `WK${seq}` });
  const { enrollment } = await learning.enrollStudent(db, { courseId, userId: id, createdBy: adminId });
  const [ev] = (await db.select().from(s.outboxEvents)).filter((e) => e.type === 'enrollment.created' && e.payload.enrollmentId === enrollment.id);
  return ev!;
}

/** remetente falso: grava o que recebeu e responde conforme a regra por URL */
function fakeSender(rule: (req: SendRequest) => Promise<{ status: number }> | { status: number } = () => ({ status: 200 })) {
  const calls: SendRequest[] = [];
  const send: Sender = async (req) => {
    calls.push(req);
    return rule(req);
  };
  return { send, calls };
}
const pendingOf = (endpointId: string) => db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.endpointId, endpointId));

describe('SSRF', () => {
  it('em produção recusa loopback, privados, link-local e metadados de nuvem, mesmo quando o nome é público', async () => {
    const resolve = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];
    for (const ip of ['127.0.0.1', '10.0.0.8', '172.20.1.1', '192.168.0.9', '169.254.169.254', '100.64.0.1', '::1', 'fd00::5', 'fe80::1', '::ffff:10.0.0.1']) {
      await expect(assertDestinationAllowed('https://hooks.exemplo.com/x', { production: true, resolve: resolve({ 'hooks.exemplo.com': [ip] }) }), ip).rejects.toBeInstanceOf(BlockedDestinationError);
    }
    // basta UM endereço privado entre os resolvidos (troca de DNS / rebinding)
    await expect(assertDestinationAllowed('https://hooks.exemplo.com/x', { production: true, resolve: resolve({ 'hooks.exemplo.com': ['203.0.113.10'.replace('203.0.113', '93.184.216'), '10.0.0.1'] }) })).rejects.toBeInstanceOf(BlockedDestinationError);
    // IP literal
    await expect(assertDestinationAllowed('https://169.254.169.254/latest/meta-data', { production: true })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(assertDestinationAllowed('https://[::1]/x', { production: true })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(assertDestinationAllowed('http://localhost:4599/x', { production: true, resolve: resolve({ localhost: ['127.0.0.1'] }) })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(assertDestinationAllowed('https://naoexiste.exemplo.com/x', { production: true, resolve: resolve({}) })).rejects.toBeInstanceOf(BlockedDestinationError);
  });

  it('aceita nomes públicos; em desenvolvimento só localhost/loopback passa, não a rede privada', async () => {
    const pub = async () => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'];
    await expect(assertDestinationAllowed('https://hooks.exemplo.com/x', { production: true, resolve: pub })).resolves.toBeUndefined();
    expect(checkDestination('localhost', ['127.0.0.1', '::1'], false)).toBeNull();
    expect(checkDestination('127.0.0.1', ['127.0.0.1'], false)).toBeNull();
    expect(checkDestination('localhost', ['127.0.0.1'], true)).not.toBeNull();
    expect(checkDestination('intranet.exemplo.com', ['10.1.1.1'], false)).not.toBeNull();
    expect(checkDestination('localhost', ['10.1.1.1'], false)).not.toBeNull(); // nome de loopback apontando para a rede privada
    expect(checkDestination('169.254.169.254', ['169.254.169.254'], false)).not.toBeNull();
  });
});

describe('envio real por HTTP', () => {
  let server: http.Server;
  let port: number;
  const hits: Array<{ path: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ path: req.url ?? '', headers: req.headers, body });
        if (req.url === '/ok') return void res.writeHead(204).end();
        if (req.url === '/erro') return void res.writeHead(500).end('boom');
        if (req.url === '/redireciona') return void res.writeHead(302, { location: '/ok' }).end();
        if (req.url === '/lento') return; // nunca responde
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const post = (path: string, env = { NODE_ENV: 'development' }, timeoutMs = 2000, host = 'localhost') =>
    createSender(env)({ url: `http://${host}:${port}${path}`, headers: { 'content-type': 'application/json', 'x-dna-event': 'ping' }, body: '{"a":1}', timeoutMs });

  it('2xx é sucesso; 500 devolve o status; redirecionamento NÃO é seguido', async () => {
    expect((await post('/ok')).status).toBe(204);
    expect((await post('/erro')).status).toBe(500);
    const before = hits.length;
    expect((await post('/redireciona')).status).toBe(302);
    expect(hits.length - before).toBe(1); // só a chamada original; /ok não foi visitado
    const last = hits[hits.length - 1]!;
    expect(last.headers['x-dna-event']).toBe('ping');
    expect(last.headers['content-length']).toBe('7');
    expect(last.body).toBe('{"a":1}');
  });

  it('servidor que não responde estoura o tempo limite', async () => {
    const t0 = Date.now();
    await expect(post('/lento', { NODE_ENV: 'development' }, 300)).rejects.toThrow(/tempo esgotado/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('em produção recusa localhost/127.0.0.1 sem nem conectar', async () => {
    const before = hits.length;
    await expect(post('/ok', { NODE_ENV: 'production' })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(post('/ok', { NODE_ENV: 'production' }, 2000, '127.0.0.1')).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(hits.length).toBe(before);
  });
});

describe('entrega e assinatura', () => {
  it('manda o corpo do evento com os quatro cabeçalhos; a assinatura confere com o segredo mostrado na criação', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    expect(await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt })).toBeGreaterThanOrEqual(1);
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: process.env });
    const call = calls.find((c) => c.url === ep.url)!;
    expect(call).toBeTruthy();
    const body = JSON.parse(call.body);
    expect(body).toMatchObject({ id: ev.id, type: 'enrollment.created', workspace_id: workspaceId });
    expect(Object.keys(body).sort()).toEqual(['created_at', 'data', 'id', 'type', 'workspace_id']);
    expect(call.headers['x-dna-event']).toBe('enrollment.created');
    expect(call.headers['x-dna-delivery']).toMatch(/^wdl_/);
    expect(call.headers['x-dna-signature']).toBe(signWebhook(ep.secret, call.headers['x-dna-timestamp']!, call.body));
    expect(verifyWebhookSignature(ep.secret, call.headers['x-dna-signature']!, call.headers['x-dna-timestamp']!, call.body)).toBe(true);
    expect(verifyWebhookSignature('whsec_errado', call.headers['x-dna-signature']!, call.headers['x-dna-timestamp']!, call.body)).toBe(false);
    expect(call.timeoutMs).toBe(10_000);
    const [d] = await pendingOf(ep.id);
    expect(d).toMatchObject({ status: 'delivered', attempt: 1, httpStatus: 200 });
  });

  it('não há entrega duplicada: o mesmo evento processado duas vezes e dois ciclos enviam uma vez por endereço', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    const input = { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt };
    await fanOutOutboxEvent(db, input);
    await fanOutOutboxEvent(db, input);
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: process.env });
    await dispatchDue(db, { send, env: process.env });
    expect(calls.filter((c) => c.url === ep.url && JSON.parse(c.body).id === ev.id)).toHaveLength(1);
    expect(await pendingOf(ep.id)).toHaveLength(1);
  });

  it('falha (HTTP 500 ou erro de rede) agenda nova tentativa com espera crescente; 3xx também é falha', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    const t0 = new Date(Date.now() + 2000);
    const rules = [{ status: 500 }, { status: 302 }, new Error('ECONNREFUSED')];
    let i = 0;
    const { send } = fakeSender((r) => {
      if (r.url !== ep.url) return { status: 200 };
      const x = rules[i++]!;
      if (x instanceof Error) throw x;
      return x;
    });
    const waits: number[] = [];
    let now = t0;
    for (let n = 0; n < 3; n++) {
      await dispatchDue(db, { send, env: process.env, now: () => now, rand: () => 0.5 });
      const [d] = await pendingOf(ep.id);
      expect(d!.status).toBe('pending');
      expect(d!.attempt).toBe(n + 1);
      waits.push((d!.nextAttemptAt!.getTime() - now.getTime()) / 60_000);
      // antes do horário marcado, nada é reenviado
      const before = i;
      await dispatchDue(db, { send, env: process.env, now: () => new Date(now.getTime() + 30_000), rand: () => 0.5 });
      expect(i).toBe(before);
      now = d!.nextAttemptAt!;
    }
    expect(waits).toEqual([1, 3, 9]);
    const [d] = await pendingOf(ep.id);
    expect(d!.lastError).toBe('ECONNREFUSED');
  });

  it('um endereço lento ou quebrado não atrasa os outros nem o outbox', async () => {
    await db.delete(s.webhookDeliveries);
    const slow = await mkEndpoint();
    const good = await mkEndpoint();
    for (let k = 0; k < 6; k++) {
      const ev = await newEvent();
      await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    }
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { send, calls } = fakeSender(async (r) => {
      if (r.url === slow.url) {
        await gate; // trava até o fim do teste
        throw new Error('tempo esgotado');
      }
      return { status: 200 };
    });
    const cycle = dispatchDue(db, { send, env: process.env }, { perEndpoint: 2, concurrency: 4 });
    // enquanto o ciclo está preso no endereço lento, o laço do outbox segue criando entregas sem esperar
    const t0 = Date.now();
    const ev = await newEvent();
    await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    expect(Date.now() - t0).toBeLessThan(1500);
    // o endereço bom recebeu o que tinha direito (2 por ciclo) mesmo com o lento ocupando vagas
    await new Promise((r) => setTimeout(r, 200));
    const goodDone = (await pendingOf(good.id)).filter((d) => d.status === 'delivered');
    expect(goodDone).toHaveLength(2);
    expect(calls.filter((c) => c.url === slow.url)).toHaveLength(2); // no máximo perEndpoint em voo
    release();
    await cycle;
    const slowRows = await pendingOf(slow.id);
    expect(slowRows.filter((d) => d.attempt === 1 && d.status === 'pending')).toHaveLength(2);
    expect(slowRows.filter((d) => d.attempt === 0)).toHaveLength(slowRows.length - 2);
  });

  it('endereço desativado depois do evento: a entrega falha sem enviar', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    await webhooks.setEndpointActive(db, { workspaceId, actorId: adminId, endpointId: ep.id, active: false });
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: process.env });
    expect(calls.some((c) => c.url === ep.url)).toBe(false);
    expect((await pendingOf(ep.id))[0]).toMatchObject({ status: 'failed', lastError: 'webhook desativado' });
  });

  it('reenviar pela tela manda de novo o mesmo evento e o mesmo id de entrega, com assinatura nova válida', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: process.env });
    const [d] = await pendingOf(ep.id);
    expect(d!.status).toBe('delivered');
    await webhooks.resendDelivery(db, { workspaceId, actorId: adminId, deliveryId: d!.id });
    await dispatchDue(db, { send, env: process.env, now: () => new Date(Date.now() + 5000) });
    const mine = calls.filter((c) => c.url === ep.url);
    expect(mine).toHaveLength(2);
    expect(JSON.parse(mine[1]!.body).id).toBe(ev.id);
    expect(mine[1]!.headers['x-dna-delivery']).toBe(mine[0]!.headers['x-dna-delivery']);
    expect(verifyWebhookSignature(ep.secret, mine[1]!.headers['x-dna-signature']!, mine[1]!.headers['x-dna-timestamp']!, mine[1]!.body, { nowSec: Math.floor(Date.now() / 1000) + 10 })).toBe(true);
    expect((await pendingOf(ep.id))[0]).toMatchObject({ status: 'delivered', attempt: 1 });
  });

  it('"Enviar teste" entrega um ping assinado', async () => {
    const ep = await mkEndpoint(['lesson.completed']);
    await webhooks.enqueuePing(db, { workspaceId, actorId: adminId, endpointId: ep.id });
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: process.env });
    const call = calls.find((c) => c.url === ep.url)!;
    expect(call.headers['x-dna-event']).toBe('ping');
    expect(JSON.parse(call.body)).toMatchObject({ type: 'ping', workspace_id: workspaceId });
    expect(verifyWebhookSignature(ep.secret, call.headers['x-dna-signature']!, call.headers['x-dna-timestamp']!, call.body)).toBe(true);
  });

  it('sem a chave de cifra o envio falha com mensagem clara (e tenta de novo depois)', async () => {
    const ep = await mkEndpoint();
    const ev = await newEvent();
    await fanOutOutboxEvent(db, { id: ev.id, type: ev.type, payload: ev.payload, createdAt: ev.createdAt });
    const { send, calls } = fakeSender();
    await dispatchDue(db, { send, env: { NODE_ENV: 'production' } });
    expect(calls.some((c) => c.url === ep.url)).toBe(false);
    const [d] = await pendingOf(ep.id);
    expect(d!.status).toBe('pending');
    expect(d!.lastError).toMatch(/WEBHOOK_SECRET_KEY|segredo/);
    void deliverClaimed;
  });
});
