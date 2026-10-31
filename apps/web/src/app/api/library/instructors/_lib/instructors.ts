import { NextResponse } from 'next/server';
import type { DbOrTx } from '@lms/db';
import { getMediaConfig } from '@/server/media';
import { studioAsset } from '@/server/new-instructor';
import { lookRateLimiter, looksError, referenceImageFromAsset, type LooksProvider } from '../../../media/looks/_lib/looks';

/** Pasta privada (_lib): não é rota. Dependências do passo de geração do instrutor novo. */
export function instructorDeps(db: DbOrTx, workspaceId: string, provider: Exclude<LooksProvider, { kind: 'unavailable' }>, brakeKey: string) {
  const simulated = provider.kind === 'simulated';
  return {
    generator: provider.generator,
    simulated,
    referenceImageFor: async (assetId: string) => referenceImageFromAsset(await studioAsset(db, workspaceId, assetId)),
    // freio por processo (6 pedidos pagos/h por workspace), como os novos ângulos; a cobrança é protegida pela Idempotency-Key
    wouldSpend: (phase: string) => {
      if (simulated) return;
      const slot = lookRateLimiter.take(workspaceId, `instructor:${brakeKey}:${phase}`);
      if (!slot.ok) throw new RateLimited(slot.retryAfterSeconds);
    },
    elevenLabsKey: getMediaConfig().elevenLabsApiKey ?? null,
  };
}

export class RateLimited extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate');
  }
}

export function instructorError(e: unknown): NextResponse {
  if (e instanceof RateLimited) {
    return NextResponse.json({ error: { code: 'RATE_LIMIT', message: 'Limite de gerações por hora neste workspace. Tente de novo mais tarde; nada foi pedido.' } }, { status: 429, headers: { 'Retry-After': String(e.retryAfterSeconds) } });
  }
  return looksError(e);
}
