import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb, integrationTokens, type schema } from '@lms/db';
import { KeyedLimiter } from '@/lib/auth-access';
import { clientIpConfigFromEnv, resolveClientIp } from '@/lib/client-ip';
import { handleError } from './http';

/*
 * Autenticação das rotas /api/integracao/v1/*: `Authorization: Bearer lms_<segredo>`.
 *
 * - O segredo nunca é guardado: compara-se o SHA-256 (em tempo constante) com o `token_hash` do token ATIVO.
 * - Token inexistente, malformado ou revogado: a mesma resposta (401, mesma mensagem). Só quem tem um token válido
 *   sem o escopo recebe 403, e isso não revela nada a quem não tem token.
 * - Limites em MEMÓRIA do processo (o web roda com 1 réplica; reiniciar zera a contagem; com mais réplicas o limite
 *   efetivo seria multiplicado): 120 chamadas por minuto por token e 30 falhas de autenticação por minuto por IP.
 * - `last_used_at` é gravado no máximo uma vez por minuto por token.
 */

export type IntegrationScope = schema.IntegrationScope;
export interface IntegrationContext {
  tokenId: string;
  tokenName: string;
  workspaceId: string;
  scopes: IntegrationScope[];
  /** quem criou o token: vira o autor (`createdBy`, `actorId`) das ações feitas pela integração */
  createdBy: string;
}

export const INTEGRATION_RATE = { perToken: { max: 120, windowMs: 60_000 }, failuresPerIp: { max: 30, windowMs: 60_000 } } as const;

let tokenLimiter = new KeyedLimiter(INTEGRATION_RATE.perToken.max, INTEGRATION_RATE.perToken.windowMs);
let failureLimiter = new KeyedLimiter(INTEGRATION_RATE.failuresPerIp.max, INTEGRATION_RATE.failuresPerIp.windowMs);
/** só para testes */
export function resetIntegrationLimits() {
  tokenLimiter = new KeyedLimiter(INTEGRATION_RATE.perToken.max, INTEGRATION_RATE.perToken.windowMs);
  failureLimiter = new KeyedLimiter(INTEGRATION_RATE.failuresPerIp.max, INTEGRATION_RATE.failuresPerIp.windowMs);
}

export class IntegrationAuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 429,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

const SECRET_RE = /^lms_[A-Za-z0-9_-]{20,100}$/;
const ipConfig = clientIpConfigFromEnv();

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

const UNAUTHORIZED = () => new IntegrationAuthError(401, 'UNAUTHORIZED', 'Token ausente, inválido ou revogado');

export async function requireIntegrationToken(req: Request, scope: IntegrationScope): Promise<IntegrationContext> {
  const ip = resolveClientIp(req.headers, ipConfig) ?? 'desconhecido';
  const secret = bearer(req);
  const fail = () => {
    if (!failureLimiter.take(ip)) return new IntegrationAuthError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um minuto.', 60);
    return UNAUTHORIZED();
  };
  if (!secret || !SECRET_RE.test(secret)) throw fail();
  const hash = integrationTokens.hashToken(secret);
  const db = getDb();
  const row = await integrationTokens.findActiveTokenByHash(db, hash);
  if (!row || !safeEqualHex(row.tokenHash, hash)) throw fail();
  if (!tokenLimiter.take(row.id)) throw new IntegrationAuthError(429, 'RATE_LIMITED', 'Limite de chamadas por minuto excedido para este token.', 60);
  if (!row.scopes.includes(scope)) throw new IntegrationAuthError(403, 'FORBIDDEN', `O token não tem o escopo ${scope}`);
  // não bloqueia a resposta: uma falha ao gravar o horário de uso não pode derrubar a chamada
  void integrationTokens.touchTokenLastUsed(db, row.id).catch(() => {});
  return { tokenId: row.id, tokenName: row.name, workspaceId: row.workspaceId, scopes: row.scopes, createdBy: row.createdBy };
}

/** Envolve um handler de integração: autentica, devolve JSON de erro padronizado e nunca coloca o token em resposta ou log. */
export async function withIntegration(req: Request, scope: IntegrationScope, fn: (ctx: IntegrationContext) => Promise<unknown>): Promise<NextResponse> {
  try {
    const ctx = await requireIntegrationToken(req, scope);
    const data = await fn(ctx);
    return NextResponse.json(data as object, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof IntegrationAuthError) {
      const headers: Record<string, string> = { 'cache-control': 'no-store' };
      if (e.status === 401) headers['www-authenticate'] = 'Bearer';
      if (e.retryAfter) headers['retry-after'] = String(e.retryAfter);
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers });
    }
    return handleError(e);
  }
}
