import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { INTEGRATION_SCOPES, type IntegrationScope } from '../schema/identity';

/*
 * Tokens de integração. O segredo (`lms_` + 43 caracteres aleatórios, 256 bits) aparece uma vez, na criação; no banco fica só o
 * SHA-256. Como o segredo tem entropia alta, um hash rápido basta (não há o que adivinhar por força bruta).
 */

export const TOKEN_PREFIX = 'lms_';
/** quantos caracteres do segredo aparecem na lista para reconhecer o token */
const DISPLAY_PREFIX_LEN = 10;

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateTokenSecret(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function isIntegrationScope(x: unknown): x is IntegrationScope {
  return typeof x === 'string' && (INTEGRATION_SCOPES as readonly string[]).includes(x);
}

export async function createIntegrationToken(db: DbOrTx, input: { workspaceId: string; actorId: string; name: string; scopes: string[] }) {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) throw new DomainError('VALIDATION', 'Dê um nome ao token');
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0 || !scopes.every(isIntegrationScope)) throw new DomainError('VALIDATION', 'Escolha ao menos um escopo válido');
  const secret = generateTokenSecret();
  const id = newId('itk');
  await db.insert(s.integrationTokens).values({
    id,
    workspaceId: input.workspaceId,
    name,
    tokenHash: hashToken(secret),
    prefix: secret.slice(0, DISPLAY_PREFIX_LEN),
    scopes: scopes as IntegrationScope[],
    createdBy: input.actorId,
  });
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'integration_token.create', entityType: 'integration_token', entityId: id, data: { name, scopes } });
  return { id, secret, prefix: secret.slice(0, DISPLAY_PREFIX_LEN), name, scopes };
}

export async function revokeIntegrationToken(db: DbOrTx, input: { workspaceId: string; actorId: string; tokenId: string }) {
  const [row] = await db
    .update(s.integrationTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(s.integrationTokens.id, input.tokenId), eq(s.integrationTokens.workspaceId, input.workspaceId), isNull(s.integrationTokens.revokedAt)))
    .returning({ id: s.integrationTokens.id });
  if (!row) throw new DomainError('NOT_FOUND', 'Token não encontrado ou já revogado');
  await db.insert(s.auditLogs).values({ id: newId('aud'), workspaceId: input.workspaceId, actorId: input.actorId, action: 'integration_token.revoke', entityType: 'integration_token', entityId: input.tokenId, data: {} });
}

/** Token ativo (não revogado) pelo hash do segredo. */
export async function findActiveTokenByHash(db: DbOrTx, hash: string) {
  const [row] = await db
    .select()
    .from(s.integrationTokens)
    .where(and(eq(s.integrationTokens.tokenHash, hash), isNull(s.integrationTokens.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** Marca o uso; só grava se o último registro tiver mais de `minGapMs` (evita uma escrita por chamada). */
export async function touchTokenLastUsed(db: DbOrTx, tokenId: string, minGapMs = 60_000) {
  await db
    .update(s.integrationTokens)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(s.integrationTokens.id, tokenId), sql`(${s.integrationTokens.lastUsedAt} is null or ${s.integrationTokens.lastUsedAt} < now() - (${minGapMs} * interval '1 millisecond'))`));
}
