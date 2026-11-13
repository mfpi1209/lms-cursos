import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { resetDatabase } from './setup';
import { DomainError, newId, schema as s, type Database } from '../src';
import { enrollStudent } from '../src/repositories/learning';
import * as wh from '../src/repositories/webhooks';
import {
  WEBHOOK_BACKOFF_MAX_MS,
  WEBHOOK_MAX_ATTEMPTS,
  backoffDelayMs,
  generateWebhookSecret,
  isPrivateAddress,
  protectSecret,
  revealSecret,
  signWebhook,
  validateWebhookUrl,
  verifyWebhookSignature,
} from '../src/webhook-core';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let adminId: string;
let seq = 0;

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  adminId = seeded.users['admin@demo.local']!;
});
afterAll(async () => {
  await close();
});

const KEY = 'a'.repeat(64);

describe('assinatura', () => {
  it('HMAC-SHA256 de "timestamp.corpo", em hex, com o prefixo sha256=', () => {
    const sig = signWebhook('segredo', 1700000000, '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(sig).toBe(signWebhook('segredo', '1700000000', '{"a":1}'));
    expect(sig).not.toBe(signWebhook('outro', 1700000000, '{"a":1}'));
    expect(sig).not.toBe(signWebhook('segredo', 1700000001, '{"a":1}'));
    expect(sig).not.toBe(signWebhook('segredo', 1700000000, '{"a":2}'));
  });

  it('verifyWebhookSignature confere a assinatura e recusa carimbo velho', () => {
    const body = '{"id":"evt_1"}';
    const ts = '1700000000';
    const sig = signWebhook('segredo', ts, body);
    expect(verifyWebhookSignature('segredo', sig, ts, body, { nowSec: 1700000100 })).toBe(true);
    expect(verifyWebhookSignature('segredo', sig, ts, body + ' ', { nowSec: 1700000100 })).toBe(false);
    expect(verifyWebhookSignature('segredo', sig, ts, body, { nowSec: 1700000000 + 301 })).toBe(false);
    expect(verifyWebhookSignature('segredo', 'sha256=abc', ts, body, { nowSec: 1700000100 })).toBe(false);
  });
});

describe('espera entre tentativas', () => {
  it('1 min, 3, 9, 27, 81, 243 min e 12 h (teto) sem variação', () => {
    const mid = () => 0.5;
    const minutes = [1, 2, 3, 4, 5, 6, 7].map((n) => backoffDelayMs(n, mid) / 60_000);
    expect(minutes).toEqual([1, 3, 9, 27, 81, 243, 720]);
    expect(backoffDelayMs(20, mid)).toBe(WEBHOOK_BACKOFF_MAX_MS);
  });

  it('a variação fica em ±20% e nunca passa de 12 h', () => {
    expect(backoffDelayMs(1, () => 0)).toBe(48_000);
    expect(backoffDelayMs(1, () => 0.9999999)).toBeLessThanOrEqual(72_000);
    expect(backoffDelayMs(7, () => 0.9999999)).toBe(WEBHOOK_BACKOFF_MAX_MS);
    expect(backoffDelayMs(7, () => 0)).toBe(Math.round(720 * 60_000 * 0.8));
  });
});

describe('segredo e endereço', () => {
  it('cifra e decifra; muda a cada vez; chave errada não decifra', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const a = protectSecret(secret, { WEBHOOK_SECRET_KEY: KEY });
    const b = protectSecret(secret, { WEBHOOK_SECRET_KEY: KEY });
    expect(a).toMatch(/^v1\./);
    expect(a).not.toContain(secret);
    expect(a).not.toBe(b);
    expect(revealSecret(a, { WEBHOOK_SECRET_KEY: KEY })).toBe(secret);
    expect(() => revealSecret(a, { WEBHOOK_SECRET_KEY: 'b'.repeat(64) })).toThrow(/decifrar/);
    expect(() => protectSecret(secret, { WEBHOOK_SECRET_KEY: 'curta' })).toThrow(/32 bytes/);
  });

  it('sem chave: em produção recusa; fora dela guarda como "plain."', () => {
    expect(() => protectSecret('x', { NODE_ENV: 'production' })).toThrow(/WEBHOOK_SECRET_KEY/);
    expect(protectSecret('x', { NODE_ENV: 'development' })).toBe('plain.x');
    expect(revealSecret('plain.x', { NODE_ENV: 'development' })).toBe('x');
    expect(() => revealSecret('plain.x', { NODE_ENV: 'production' })).toThrow();
  });

  it('endereço: https obrigatório; http://localhost só fora de produção; sem usuário; sem rede privada', () => {
    const dev = { production: false };
    const prod = { production: true };
    expect(validateWebhookUrl('https://hooks.exemplo.com.br/dna', prod).ok).toBe(true);
    expect(validateWebhookUrl('http://hooks.exemplo.com.br/dna', dev).ok).toBe(false);
    expect(validateWebhookUrl('http://localhost:4599/hook', dev).ok).toBe(true);
    expect(validateWebhookUrl('http://127.0.0.1:4599/hook', dev).ok).toBe(true);
    expect(validateWebhookUrl('http://localhost:4599/hook', prod).ok).toBe(false);
    expect(validateWebhookUrl('https://localhost/hook', prod).ok).toBe(false);
    expect(validateWebhookUrl('https://user:pw@hooks.exemplo.com/x', prod).ok).toBe(false);
    expect(validateWebhookUrl('https://10.0.0.5/x', dev).ok).toBe(false);
    expect(validateWebhookUrl('https://169.254.169.254/latest', prod).ok).toBe(false);
    expect(validateWebhookUrl('https://servidor-interno/x', prod).ok).toBe(false);
    expect(validateWebhookUrl('ftp://x.com/a', dev).ok).toBe(false);
    expect(validateWebhookUrl('nada', dev).ok).toBe(false);
  });

  it('isPrivateAddress cobre IPv4 e IPv6 privados, loopback, link-local e mapeados', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.63.0.1', '203.1.113.5', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

async function newEndpoint(over: { events?: string[]; workspaceId?: string; url?: string } = {}) {
  return wh.createEndpoint(db, { workspaceId: over.workspaceId ?? seeded.workspaceId, actorId: adminId, url: over.url ?? `http://localhost:4599/hook-${++seq}`, events: over.events ?? ['enrollment.created', 'lesson.completed', 'course.completed'] });
}
async function newLearnerEnrollment(prefix = 'progresso-teste-wh') {
  const id = newId('usr');
  await db.insert(s.user).values({ id, email: `${prefix}-${++seq}-${id.slice(-6)}@demo.local`, name: 'Aluno Webhook', emailVerified: true });
  await db.insert(s.workspaceMemberships).values({ workspaceId: seeded.workspaceId, userId: id, role: 'student', rgm: `WH${seq}` });
  const { enrollment } = await enrollStudent(db, { courseId: seeded.courseId, userId: id, createdBy: adminId });
  const [ev] = (await db.select().from(s.outboxEvents)).filter((e) => e.type === 'enrollment.created' && e.payload.enrollmentId === enrollment.id);
  return { userId: id, enrollmentId: enrollment.id, event: ev! };
}

describe('cadastro', () => {
  it('devolve o segredo só na criação; a lista e o banco não o mostram em claro', async () => {
    const ep = await newEndpoint();
    expect(ep.secret).toMatch(/^whsec_/);
    const listed = await wh.listEndpoints(db, seeded.workspaceId);
    expect(JSON.stringify(listed)).not.toContain(ep.secret);
    expect(listed.find((e) => e.id === ep.id)).not.toHaveProperty('secret');
    const [row] = await db.select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, ep.id));
    expect(row!.secret).not.toBe(ep.secret);
    const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, ep.id));
    expect(JSON.stringify(audit)).not.toContain(ep.secret);
  });

  it('valida evento, endereço e dono do workspace', async () => {
    const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof DomainError ? e.code : 'ERRO'));
    expect(await code(wh.createEndpoint(db, { workspaceId: seeded.workspaceId, actorId: adminId, url: 'http://exemplo.com/x', events: ['lesson.completed'] }))).toBe('VALIDATION');
    expect(await code(wh.createEndpoint(db, { workspaceId: seeded.workspaceId, actorId: adminId, url: 'http://localhost:1/x', events: [] }))).toBe('VALIDATION');
    expect(await code(wh.createEndpoint(db, { workspaceId: seeded.workspaceId, actorId: adminId, url: 'http://localhost:1/x', events: ['ping'] }))).toBe('VALIDATION');
    const ep = await newEndpoint();
    expect(await code(wh.setEndpointActive(db, { workspaceId: 'wsp_outro', actorId: adminId, endpointId: ep.id, active: false }))).toBe('NOT_FOUND');
    expect(await code(wh.deleteEndpoint(db, { workspaceId: 'wsp_outro', actorId: adminId, endpointId: ep.id }))).toBe('NOT_FOUND');
  });

  it('certificate.issued já é um evento conhecido que se pode assinar', async () => {
    const ep = await newEndpoint({ events: ['certificate.issued'] });
    expect(ep.events).toEqual(['certificate.issued']);
  });
});

describe('entregas por evento', () => {
  it('cria uma entrega por endereço ativo que assina o tipo, do mesmo workspace, uma única vez por evento', async () => {
    const ws2 = newId('wsp');
    await db.insert(s.workspaces).values({ id: ws2, slug: `wh-${ws2.slice(-6)}`, name: 'Outro' });
    const yes = await newEndpoint({ events: ['enrollment.created'] });
    const other = await newEndpoint({ events: ['course.completed'] });
    const off = await newEndpoint({ events: ['enrollment.created'] });
    await wh.setEndpointActive(db, { workspaceId: seeded.workspaceId, actorId: adminId, endpointId: off.id, active: false });
    const foreign = await wh.createEndpoint(db, { workspaceId: ws2, actorId: adminId, url: 'http://localhost:4599/foreign', events: ['enrollment.created'] });

    const l = await newLearnerEnrollment();
    const first = await wh.fanOutEvent(db, l.event);
    expect(first).toBeGreaterThanOrEqual(1);
    // reprocessar o mesmo evento não duplica
    expect(await wh.fanOutEvent(db, l.event)).toBe(0);
    const rows = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.eventId, l.event.id));
    expect(new Set(rows.map((r) => r.endpointId)).size).toBe(rows.length);
    const ids = rows.map((r) => r.endpointId);
    expect(ids).toContain(yes.id);
    const view = await wh.listEndpoints(db, seeded.workspaceId);
    expect(view.find((e) => e.id === yes.id)!.pending).toBeGreaterThanOrEqual(1);
    expect(view.find((e) => e.id === other.id)!.pending).toBe(0);
    expect(ids).not.toContain(other.id);
    expect(ids).not.toContain(off.id);
    expect(ids).not.toContain(foreign.id);
    expect(rows.every((r) => r.status === 'pending' && r.attempt === 0 && r.nextAttemptAt)).toBe(true);
  });

  it('o corpo traz só o necessário: ids, slug do curso, e-mail e RGM do aluno; sem nome, telefone nem link', async () => {
    await newEndpoint({ events: ['enrollment.created'] });
    const l = await newLearnerEnrollment();
    const env = (await wh.buildEventEnvelope(db, l.event))!;
    expect(env).toMatchObject({ id: l.event.id, type: 'enrollment.created', workspace_id: seeded.workspaceId });
    expect(Object.keys(env).sort()).toEqual(['created_at', 'data', 'id', 'type', 'workspace_id']);
    expect(env.data).toMatchObject({ matricula_id: l.enrollmentId, curso: { id: seeded.courseId, slug: 'comunicacao-no-primeiro-emprego' }, aluno: { id: l.userId, rgm: expect.stringMatching(/^WH/) } });
    const json = JSON.stringify(env);
    expect(json).not.toContain('Aluno Webhook');
    expect(json).toContain('@demo.local');
  });

  it('eventos de tarefa e de curso viram o vocabulário da API', async () => {
    const l = await newLearnerEnrollment();
    const base = { enrollmentId: l.enrollmentId, lessonId: 'aula_x', nodeId: 'tarefa_1' };
    const at = new Date();
    const submitted = await wh.buildEventEnvelope(db, { id: 'obx_a', type: 'task.submitted', payload: { ...base, status: 'submitted', resubmission: true, link: 'https://nao-deve-sair' }, createdAt: at });
    expect(submitted!.data).toMatchObject({ tarefa: { aula_id: 'aula_x', no_id: 'tarefa_1', status: 'enviada', reenvio: true } });
    expect(JSON.stringify(submitted)).not.toContain('nao-deve-sair');
    const reviewed = await wh.buildEventEnvelope(db, { id: 'obx_b', type: 'task.reviewed', payload: { ...base, status: 'returned', auto: false }, createdAt: at });
    expect(reviewed!.data).toMatchObject({ tarefa: { status: 'devolvida', automatica: false } });
    const done = await wh.buildEventEnvelope(db, { id: 'obx_c', type: 'course.completed', payload: { enrollmentId: l.enrollmentId }, createdAt: at });
    expect(done!.data).toMatchObject({ certificado_codigo: null });
    expect(await wh.buildEventEnvelope(db, { id: 'obx_d', type: 'enrollment.created', payload: { enrollmentId: 'enr_inexistente' }, createdAt: at })).toBeNull();
    expect(await wh.buildEventEnvelope(db, { id: 'obx_e', type: 'media_job.queued', payload: { enrollmentId: l.enrollmentId }, createdAt: at })).toBeNull();
  });

  it('apagar a conta do aluno apaga as entregas guardadas com o e-mail dele', async () => {
    const { eraseUser } = await import('../src/repositories/privacy');
    await newEndpoint({ events: ['enrollment.created'] });
    const l = await newLearnerEnrollment('lgpd-teste');
    await wh.fanOutEvent(db, l.event);
    const [u] = await db.select().from(s.user).where(eq(s.user.id, l.userId));
    expect((await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.eventId, l.event.id))).length).toBeGreaterThan(0);
    await eraseUser(db, { email: u!.email, apply: true, actorId: adminId });
    expect(await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.eventId, l.event.id))).toHaveLength(0);
  });
});

describe('fila de envio', () => {
  it('reserva só entregas vencidas, no máximo N por endereço, e não entrega a mesma duas vezes', async () => {
    await db.delete(s.webhookDeliveries);
    const a = await newEndpoint({ events: ['enrollment.created'] });
    const b = await newEndpoint({ events: ['enrollment.created'] });
    const now = new Date();
    const mk = async (endpointId: string, n: number, at: Date) => {
      for (let i = 0; i < n; i++) await db.insert(s.webhookDeliveries).values({ id: newId('wdl'), endpointId, eventId: newId('obx'), eventType: 'enrollment.created', payload: { id: 'x' }, nextAttemptAt: at });
    };
    await mk(a.id, 5, new Date(now.getTime() - 1000));
    await mk(b.id, 1, new Date(now.getTime() - 500));
    await mk(b.id, 1, new Date(now.getTime() + 60_000)); // ainda não venceu
    const first = await wh.claimDueDeliveries(db, { limit: 10, perEndpoint: 2, now });
    expect(first).toHaveLength(3); // 2 de "a" + 1 de "b": a fila grande de "a" não tira a vaga de "b"
    expect(first.filter((d) => d.endpointId === a.id)).toHaveLength(2);
    expect(first.every((d) => d.url.startsWith('http://localhost') && d.secret.length > 5)).toBe(true);
    const again = await wh.claimDueDeliveries(db, { limit: 10, perEndpoint: 2, now });
    expect(again.map((d) => d.id).filter((id) => first.some((f) => f.id === id))).toHaveLength(0);
    expect(again.filter((d) => d.endpointId === a.id)).toHaveLength(2);
  });

  it('sucesso marca entregue; falhas seguem a espera crescente e a oitava é definitiva', async () => {
    const ep = await newEndpoint({ events: ['enrollment.created'] });
    const id = newId('wdl');
    await db.insert(s.webhookDeliveries).values({ id, endpointId: ep.id, eventId: newId('obx'), eventType: 'enrollment.created', payload: { id: 'x' }, nextAttemptAt: new Date() });
    const now = new Date('2026-01-01T00:00:00Z');
    const mid = () => 0.5;
    const expected = [1, 3, 9, 27, 81, 243, 720];
    for (let n = 0; n < 7; n++) {
      const r = await wh.recordDeliveryResult(db, { id, endpointId: ep.id, attempt: n }, { ok: false, httpStatus: 500, error: new Error('HTTP 500') }, { now, rand: mid });
      expect(r.status).toBe('pending');
      expect(r.nextAttemptAt!.getTime() - now.getTime()).toBe(expected[n]! * 60_000);
    }
    const last = await wh.recordDeliveryResult(db, { id, endpointId: ep.id, attempt: WEBHOOK_MAX_ATTEMPTS - 1 }, { ok: false, httpStatus: 503, error: 'x'.repeat(1000) }, { now, rand: mid });
    expect(last.status).toBe('failed');
    const [row] = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.id, id));
    expect(row).toMatchObject({ status: 'failed', attempt: 8, httpStatus: 503, nextAttemptAt: null });
    expect(row!.lastError!.length).toBe(300);
    const [e] = await db.select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, ep.id));
    expect(e!.lastFailureAt).not.toBeNull();

    await wh.resendDelivery(db, { workspaceId: seeded.workspaceId, actorId: adminId, deliveryId: id });
    const [again] = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.id, id));
    expect(again).toMatchObject({ status: 'pending', attempt: 0, httpStatus: null, lastError: null });
    expect(again!.eventId).toBe(row!.eventId);
    await wh.recordDeliveryResult(db, { id, endpointId: ep.id, attempt: 0 }, { ok: true, httpStatus: 204 });
    const [ok] = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.id, id));
    expect(ok).toMatchObject({ status: 'delivered', httpStatus: 204, attempt: 1, lastError: null });
    expect(ok!.deliveredAt).not.toBeNull();
    expect((await db.select().from(s.webhookEndpoints).where(eq(s.webhookEndpoints.id, ep.id)))[0]!.lastSuccessAt).not.toBeNull();
  });

  it('reenviar exige o webhook ativo e do próprio workspace; o teste cria um ping', async () => {
    const ep = await newEndpoint();
    const { deliveryId } = await wh.enqueuePing(db, { workspaceId: seeded.workspaceId, actorId: adminId, endpointId: ep.id });
    const [ping] = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.id, deliveryId));
    expect(ping).toMatchObject({ eventType: 'ping', status: 'pending' });
    expect(ping!.payload).toMatchObject({ type: 'ping', id: ping!.eventId, workspace_id: seeded.workspaceId });
    const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof DomainError ? e.code : 'ERRO'));
    expect(await code(wh.resendDelivery(db, { workspaceId: 'wsp_outro', actorId: adminId, deliveryId }))).toBe('NOT_FOUND');
    await wh.setEndpointActive(db, { workspaceId: seeded.workspaceId, actorId: adminId, endpointId: ep.id, active: false });
    expect(await code(wh.resendDelivery(db, { workspaceId: seeded.workspaceId, actorId: adminId, deliveryId }))).toBe('VALIDATION');
    const listed = await wh.listDeliveries(db, { workspaceId: seeded.workspaceId, endpointId: ep.id });
    expect(listed.map((d) => d.id)).toContain(deliveryId);
    expect(JSON.stringify(listed)).not.toContain('payload');
    expect(await wh.listDeliveries(db, { workspaceId: 'wsp_outro' })).toEqual([]);
  });

  it('apagar o endereço apaga as entregas; a limpeza remove as antigas já resolvidas e mantém as pendentes', async () => {
    const ep = await newEndpoint();
    const old = new Date(Date.now() - 40 * 86_400_000);
    const mk = (status: 'pending' | 'delivered') => db.insert(s.webhookDeliveries).values({ id: newId('wdl'), endpointId: ep.id, eventId: newId('obx'), eventType: 'ping', payload: {}, status, createdAt: old });
    await mk('pending');
    await mk('delivered');
    expect(await wh.purgeDeliveries(db, 30)).toBeGreaterThanOrEqual(1);
    const left = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.endpointId, ep.id));
    expect(left.map((d) => d.status)).toEqual(['pending']);
    await wh.deleteEndpoint(db, { workspaceId: seeded.workspaceId, actorId: adminId, endpointId: ep.id });
    expect(await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.endpointId, ep.id))).toHaveLength(0);
  });
});
