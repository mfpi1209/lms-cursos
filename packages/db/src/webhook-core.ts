import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/*
 * Peças puras dos webhooks de saída, compartilhadas pelo web (cadastro) e pelo worker (envio):
 * tipos de evento, assinatura HMAC, espera entre tentativas, cifra do segredo e regras de endereço.
 * Contrato público em docs/integracao/api-v1.md.
 */

/** Tipos que um endereço pode assinar. */
export const WEBHOOK_EVENT_TYPES = ['enrollment.created', 'lesson.completed', 'course.completed', 'task.submitted', 'task.reviewed', 'certificate.issued'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
/** Evento do "Enviar teste": sempre entregue ao endereço escolhido, nunca assinado como tipo. */
export const WEBHOOK_PING_TYPE = 'ping';

export function isWebhookEventType(x: unknown): x is WebhookEventType {
  return typeof x === 'string' && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(x);
}

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_BACKOFF_BASE_MS = 60_000;
export const WEBHOOK_BACKOFF_FACTOR = 3;
export const WEBHOOK_BACKOFF_MAX_MS = 12 * 60 * 60_000;
export const WEBHOOK_JITTER = 0.2;
export const WEBHOOK_ERROR_MAX = 300;

/**
 * Espera antes da próxima tentativa, depois da `failedAttempt`-ésima falha (1 = a primeira).
 * 1 min, 3 min, 9 min, 27 min, 81 min, 243 min e 12 h (teto), com variação de ±20% (`rand` em [0,1)).
 */
export function backoffDelayMs(failedAttempt: number, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(failedAttempt));
  const base = Math.min(WEBHOOK_BACKOFF_BASE_MS * WEBHOOK_BACKOFF_FACTOR ** (n - 1), WEBHOOK_BACKOFF_MAX_MS);
  const jitter = 1 + (rand() * 2 - 1) * WEBHOOK_JITTER;
  return Math.min(Math.round(base * jitter), WEBHOOK_BACKOFF_MAX_MS);
}

/** `sha256=<hex>` do HMAC-SHA256 de `"<timestamp>.<corpo>"`, com o segredo do endereço. */
export function signWebhook(secret: string, timestamp: string | number, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Confere uma assinatura recebida (tempo constante) e a idade do carimbo. Espelha o exemplo da documentação. */
export function verifyWebhookSignature(secret: string, header: string, timestamp: string, body: string, opts: { toleranceSec?: number; nowSec?: number } = {}): boolean {
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;
  const expected = Buffer.from(signWebhook(secret, timestamp, body));
  const given = Buffer.from(header ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(32).toString('base64url');
}

/* ---------------------------------------------------------------------- */
/* Segredo cifrado em repouso (AES-256-GCM, chave WEBHOOK_SECRET_KEY)        */
/* ---------------------------------------------------------------------- */

export class WebhookKeyError extends Error {}

/** Chave de 32 bytes em hex (64 caracteres) ou base64/base64url. Aceita `undefined` (sem chave). */
export function parseWebhookKey(raw: string | undefined): Buffer | null {
  const v = raw?.trim();
  if (!v) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64url');
  if (buf.length !== 32) throw new WebhookKeyError('WEBHOOK_SECRET_KEY deve ter 32 bytes (64 caracteres hexadecimais ou 44 em base64)');
  return buf;
}

export interface SecretEnv {
  WEBHOOK_SECRET_KEY?: string;
  NODE_ENV?: string;
}

/**
 * Cifra o segredo para guardar. Sem chave: em produção recusa; fora dela guarda com o prefixo `plain.` (só desenvolvimento e testes).
 */
export function protectSecret(secret: string, env: SecretEnv = process.env): string {
  const key = parseWebhookKey(env.WEBHOOK_SECRET_KEY);
  if (!key) {
    if (env.NODE_ENV === 'production') throw new WebhookKeyError('WEBHOOK_SECRET_KEY não está definida: em produção não é possível cadastrar webhooks');
    return `plain.${secret}`;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function revealSecret(stored: string, env: SecretEnv = process.env): string {
  if (stored.startsWith('plain.')) {
    if (env.NODE_ENV === 'production') throw new WebhookKeyError('segredo guardado sem cifra não é aceito em produção');
    return stored.slice(6);
  }
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new WebhookKeyError('segredo guardado em formato desconhecido');
  const key = parseWebhookKey(env.WEBHOOK_SECRET_KEY);
  if (!key) throw new WebhookKeyError('WEBHOOK_SECRET_KEY não está definida: não é possível assinar as entregas');
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch {
    throw new WebhookKeyError('não foi possível decifrar o segredo (a WEBHOOK_SECRET_KEY mudou?)');
  }
}

/* ---------------------------------------------------------------------- */
/* Endereços: o que pode ser cadastrado e o que o worker pode chamar         */
/* ---------------------------------------------------------------------- */

export const WEBHOOK_URL_MAX = 500;

/** `localhost` e os endereços de loopback: só em desenvolvimento, e só para teste local. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/** IPv4 ou IPv6 que nunca é destino de webhook: privado, loopback, link-local, CGNAT, multicast, reservado, metadados de nuvem. */
export function isPrivateAddress(ip: string): boolean {
  let a = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const zone = a.indexOf('%');
  if (zone >= 0) a = a.slice(0, zone);
  const v = isIP(a);
  if (v === 4) return isPrivateV4(a);
  if (v === 6) {
    if (a === '::' || a === '::1') return true;
    // IPv4 mapeado (::ffff:a.b.c.d ou ::ffff:xxxx:xxxx) e compatível
    const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateV4(mapped[1]!);
    const hex = /^::(?:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(a.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (única local)
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 (site-local, obsoleto)
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
    return false;
  }
  return true; // não é um IP: por segurança, bloqueia
}

function isPrivateV4(a: string): boolean {
  const [p, q] = a.split('.').map(Number) as [number, number, number, number];
  if (p === 0 || p === 10 || p === 127) return true;
  if (p === 100 && q >= 64 && q <= 127) return true; // CGNAT
  if (p === 169 && q === 254) return true; // link-local e metadados de nuvem
  if (p === 172 && q >= 16 && q <= 31) return true;
  if (p === 192 && q === 168) return true;
  if (p === 192 && q === 0) return true; // 192.0.0.0/24 e 192.0.2.0/24
  if (p === 198 && (q === 18 || q === 19)) return true; // benchmark
  if (p === 198 && q === 51) return true; // documentação
  if (p === 203 && q === 0) return true; // documentação
  if (p >= 224) return true; // multicast e reservado
  return false;
}

export interface WebhookUrlCheck {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Valida o endereço no cadastro. https obrigatório; `http://localhost` (e loopback) só fora de produção.
 * Sem usuário/senha na URL. Em produção, recusa também IP literal privado e nomes de uso interno. A checagem de DNS fica no envio (worker).
 */
export function validateWebhookUrl(raw: string, opts: { production: boolean }): WebhookUrlCheck {
  const input = (raw ?? '').trim();
  if (!input || input.length > WEBHOOK_URL_MAX) return { ok: false, error: `Informe o endereço (até ${WEBHOOK_URL_MAX} caracteres)` };
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, error: 'Endereço inválido' };
  }
  if (u.username || u.password) return { ok: false, error: 'O endereço não pode ter usuário e senha' };
  if (u.hash) return { ok: false, error: 'O endereço não pode ter #fragmento' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const loopback = isLoopbackHost(host);
  if (loopback) {
    if (opts.production) return { ok: false, error: 'Em produção o endereço não pode ser localhost' };
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Use http ou https' };
    return { ok: true, url: u.toString() };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'O endereço deve começar com https://' };
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, error: 'O endereço aponta para uma rede privada' };
  if (opts.production && (!host.includes('.') || /\.(local|internal|lan|home|corp)$/i.test(host))) return { ok: false, error: 'O endereço deve ser um domínio público' };
  return { ok: true, url: u.toString() };
}

export function truncateError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, ' ').slice(0, WEBHOOK_ERROR_MAX);
}
