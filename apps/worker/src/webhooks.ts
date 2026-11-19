import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import {
  WEBHOOK_PING_TYPE,
  WEBHOOK_TIMEOUT_MS,
  WebhookKeyError,
  isLoopbackHost,
  isPrivateAddress,
  isWebhookEventType,
  revealSecret,
  signWebhook,
  webhooks,
  type Database,
} from '@lms/db';

/*
 * Envio dos webhooks de saída. Contrato e política de tentativas: docs/integracao/api-v1.md.
 *
 * - O laço do outbox só CRIA as entregas (`fanOutOutboxEvent`, barato e idempotente). O envio HTTP roda em outro laço
 *   (`startWebhookDispatcher`), que não é esperado pelo laço do outbox: um servidor lento nunca atrasa o resto.
 * - Cada ciclo reserva poucas entregas por endereço (`PER_ENDPOINT`) e as envia em paralelo limitado (`CONCURRENCY`);
 *   um endereço travado ocupa no máximo `PER_ENDPOINT` vagas por 10 s.
 * - 10 s de limite por envio, sem seguir redirecionamentos; sucesso = resposta 2xx.
 * - SSRF: o nome é resolvido NA HORA DE CONECTAR (gancho `lookup`, sem janela para troca de DNS) e o envio é recusado
 *   se algum endereço for privado, loopback, link-local etc. Em desenvolvimento, só localhost/loopback é permitido.
 */

const POLL_MS = Number(process.env.WEBHOOK_POLL_MS ?? 2000);
const BATCH = 40;
const PER_ENDPOINT = 3;
const CONCURRENCY = 10;

export class BlockedDestinationError extends Error {}

export interface WebhookEnv {
  NODE_ENV?: string;
  WEBHOOK_SECRET_KEY?: string;
}

/** Texto do motivo se o destino é proibido; `null` se pode. `addresses` são os IPs resolvidos de `hostname`. */
export function checkDestination(hostname: string, addresses: string[], production: boolean): string | null {
  if (addresses.length === 0) return 'o nome do servidor não resolve';
  const loopbackOk = !production && isLoopbackHost(hostname);
  for (const a of addresses) {
    if (!isPrivateAddress(a)) continue;
    if (loopbackOk && isLoopbackAddress(a)) continue;
    return `destino bloqueado: ${hostname} resolve para um endereço privado ou reservado (${a})`;
  }
  return null;
}

function isLoopbackAddress(a: string): boolean {
  const x = a.toLowerCase().replace(/^\[|\]$/g, '');
  return x === '::1' || /^127\./.test(x) || x === '::ffff:127.0.0.1';
}

export type Resolver = (hostname: string) => Promise<string[]>;
const systemResolver: Resolver = async (hostname) => (await dns.promises.lookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

/** Resolve e confere. Usado antes de enviar (erro claro) e nos testes; o envio real confere de novo no `lookup`. */
export async function assertDestinationAllowed(url: string, opts: { production: boolean; resolve?: Resolver }): Promise<void> {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await (opts.resolve ?? systemResolver)(host);
  const why = checkDestination(host, addresses, opts.production);
  if (why) throw new BlockedDestinationError(why);
}

export interface SendRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}
export type Sender = (req: SendRequest) => Promise<{ status: number }>;

/** Envio real por node:http(s): sem redirecionamento, limite de tempo total, descarta o corpo da resposta. */
export function createSender(env: WebhookEnv = process.env): Sender {
  const production = env.NODE_ENV === 'production';
  return ({ url, headers, body, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const host = u.hostname.replace(/^\[|\]$/g, '');
      if (isIP(host)) {
        const why = checkDestination(host, [host], production);
        if (why) return reject(new BlockedDestinationError(why));
      }
      const lookup = (hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
        dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
          if (err) return cb(err, '' as never);
          const list = addrs as dns.LookupAddress[];
          const why = checkDestination(hostname, list.map((a) => a.address), production);
          if (why) return cb(new BlockedDestinationError(why), '' as never);
          if (options.all) return cb(null, list);
          cb(null, list[0]!.address, list[0]!.family);
        });
      };
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, { method: 'POST', headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) }, lookup: lookup as never, agent: false }, (res) => {
        clearTimeout(timer);
        res.destroy(); // só o status importa
        resolve({ status: res.statusCode ?? 0 });
      });
      const timer = setTimeout(() => req.destroy(new Error(`tempo esgotado (${Math.round(timeoutMs / 1000)} s)`)), timeoutMs);
      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      req.end(body);
    });
}

export interface DispatchDeps {
  send: Sender;
  now?: () => Date;
  env?: WebhookEnv;
  rand?: () => number;
  log?: (msg: string) => void;
}

/** Cria as entregas de um evento do outbox. Idempotente; lança se o banco falhar (o evento volta à fila). */
export async function fanOutOutboxEvent(db: Database, ev: { id: string; type: string; payload: Record<string, unknown>; createdAt: Date }): Promise<number> {
  if (!isWebhookEventType(ev.type)) return 0;
  return webhooks.fanOutEvent(db, ev);
}

type Claimed = Awaited<ReturnType<typeof webhooks.claimDueDeliveries>>[number];

/** Envia UMA entrega já reservada e grava o resultado. Nunca lança por falha do destino. */
export async function deliverClaimed(db: Database, d: Claimed, deps: DispatchDeps): Promise<'delivered' | 'pending' | 'failed'> {
  const now = deps.now ?? (() => new Date());
  const env = deps.env ?? process.env;
  const record = (outcome: Parameters<typeof webhooks.recordDeliveryResult>[2]) => webhooks.recordDeliveryResult(db, d, outcome, { now: now(), rand: deps.rand });
  if (!d.active) return (await record({ ok: false, error: 'webhook desativado', permanent: true })).status;
  let secret: string;
  try {
    secret = revealSecret(d.secret, env);
  } catch (e) {
    return (await record({ ok: false, error: e instanceof WebhookKeyError ? e.message : e })).status;
  }
  const body = JSON.stringify(d.payload);
  const timestamp = String(Math.floor(now().getTime() / 1000));
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'DNA-LMS-Webhooks/1',
    'x-dna-event': d.eventType,
    'x-dna-delivery': d.id,
    'x-dna-timestamp': timestamp,
    'x-dna-signature': signWebhook(secret, timestamp, body),
  };
  try {
    const res = await deps.send({ url: d.url, headers, body, timeoutMs: WEBHOOK_TIMEOUT_MS });
    if (res.status >= 200 && res.status < 300) return (await record({ ok: true, httpStatus: res.status })).status;
    return (await record({ ok: false, httpStatus: res.status, error: `HTTP ${res.status}` })).status;
  } catch (e) {
    return (await record({ ok: false, error: e })).status;
  }
}

/** Um ciclo: reserva as entregas vencidas e envia em paralelo limitado. Devolve quantas processou. */
export async function dispatchDue(db: Database, deps: DispatchDeps, opts: { limit?: number; perEndpoint?: number; concurrency?: number } = {}): Promise<number> {
  const claimed = await webhooks.claimDueDeliveries(db, { limit: opts.limit ?? BATCH, perEndpoint: opts.perEndpoint ?? PER_ENDPOINT, now: (deps.now ?? (() => new Date()))() });
  if (claimed.length === 0) return 0;
  const concurrency = Math.max(1, opts.concurrency ?? CONCURRENCY);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const d = claimed[next++];
      if (!d) return;
      try {
        const status = await deliverClaimed(db, d, deps);
        if (status !== 'delivered') deps.log?.(`[webhook] ${d.eventType} ${d.id} -> ${status}`);
      } catch (e) {
        // erro inesperado (banco): a reserva vence sozinha e a entrega volta à fila
        deps.log?.(`[webhook] erro ao registrar ${d.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, claimed.length) }, worker));
  return claimed.length;
}

/** Laço próprio do envio, independente do laço do outbox. `stop()` espera o ciclo atual terminar. */
export function startWebhookDispatcher(db: Database, deps: Partial<DispatchDeps> = {}): { stop: () => Promise<void> } {
  const full: DispatchDeps = { send: deps.send ?? createSender(), log: deps.log ?? ((m) => console.log(m)), ...deps };
  let stopping = false;
  const loop = (async () => {
    while (!stopping) {
      let n = 0;
      try {
        n = await dispatchDue(db, full);
      } catch (e) {
        console.error('[webhook] erro no ciclo', e);
      }
      if (n === 0 && !stopping) await new Promise((r) => setTimeout(r, POLL_MS));
    }
  })();
  return {
    stop: async () => {
      stopping = true;
      await loop;
    },
  };
}

export { WEBHOOK_PING_TYPE };
