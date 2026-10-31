import { NextResponse } from 'next/server';
import { getStorage, HeyGenError, HeyGenLooksAdapter, LookGenerationRateLimiter, MAX_REFERENCE_BASE64_BYTES, SimulatedHeyGenLooks, type CharacterLookGenerator, type ReferenceImage } from '@lms/media';
import { HttpError } from '@/server/viewer';
import { handleError } from '@/server/http';
import { getMediaConfig, SIMULATED_AVATARS } from '@/server/media';

/** Pasta privada (_lib): não é rota. Fábrica do gerador de looks + mapeamento de erros do HeyGen. */

export const LOOK_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

/**
 * Freio em memória: 6 gerações pagas por workspace por hora, por processo do servidor.
 * Não é compartilhado entre réplicas nem sobrevive a reinício (aceitável como proteção contra
 * cliques/loops; a cobrança real continua protegida pela Idempotency-Key do HeyGen).
 */
const globalForLooks = globalThis as unknown as { __lmsLookLimiter?: LookGenerationRateLimiter };
export const lookRateLimiter = (globalForLooks.__lmsLookLimiter ??= new LookGenerationRateLimiter(6, 60 * 60 * 1000));

// prévia simulada: a do apresentador de origem (também para visuais derivados, `<origem>__ia_<hash>`)
const simulated = new SimulatedHeyGenLooks((lookId) => SIMULATED_AVATARS.find((a) => a.id === lookId.split('__ia_')[0])?.previewImageUrl, SIMULATED_AVATARS[0]!.id);

export type LooksProvider = { kind: 'real'; generator: CharacterLookGenerator } | { kind: 'simulated'; generator: CharacterLookGenerator } | { kind: 'unavailable' };

export function getLooksProvider(): LooksProvider {
  const cfg = getMediaConfig();
  if (cfg.simulation) return { kind: 'simulated', generator: simulated };
  if (!cfg.heygenApiKey) return { kind: 'unavailable' };
  return { kind: 'real', generator: new HeyGenLooksAdapter(cfg.heygenApiKey) };
}

export function simulatedGenerator(): CharacterLookGenerator {
  return simulated;
}

export function unavailable(): NextResponse {
  return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'HeyGen não configurado: defina HEYGEN_API_KEY ou ative o modo de demonstração.' } }, { status: 503 });
}

export function errorResponse(status: number, code: string, message: string, extraHeaders: Record<string, string> = {}, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status, headers: extraHeaders });
}

/** HeyGenError -> resposta HTTP em pt-BR (nunca expõe a chave; a mensagem do provedor vai só em details). */
export function heygenErrorResponse(e: HeyGenError): NextResponse {
  const details = { provider: 'heygen', providerStatus: e.status, providerCode: e.code };
  const retry = e.retryAfterSeconds && Number.isFinite(e.retryAfterSeconds) ? { 'Retry-After': String(e.retryAfterSeconds) } : undefined;
  switch (true) {
    case e.status === 400 || e.status === 422:
      return errorResponse(422, 'PROVIDER_REJECTED', 'O HeyGen recusou o pedido: o visual de origem pode não ter uma imagem utilizável.', {}, details);
    case e.status === 401:
      return errorResponse(502, 'PROVIDER_AUTH', 'A chave do HeyGen é inválida ou expirou. Verifique a configuração.', {}, details);
    case e.status === 402:
      return errorResponse(402, 'PROVIDER_NO_CREDIT', 'Créditos HeyGen insuficientes para gerar o novo ângulo.', {}, details);
    case e.status === 403:
      return errorResponse(403, 'PROVIDER_FORBIDDEN', 'O HeyGen não permitiu esta geração para a conta configurada.', {}, details);
    case e.status === 404:
      return errorResponse(404, 'NOT_FOUND', 'Visual não encontrado no HeyGen.', {}, details);
    case e.status === 409:
      return errorResponse(409, 'IN_PROGRESS', 'Esta geração já está em andamento. Aguarde alguns instantes.', {}, details);
    case e.status === 429:
      return errorResponse(429, 'PROVIDER_RATE_LIMIT', 'O HeyGen está limitando as requisições. Tente novamente em instantes.', retry ?? {}, { ...details, retryAfterSeconds: e.retryAfterSeconds });
    default:
      return errorResponse(502, 'PROVIDER_ERROR', 'O HeyGen está indisponível no momento. Tente novamente mais tarde.', {}, details);
  }
}

export function looksError(e: unknown): NextResponse {
  if (e instanceof HeyGenError) return heygenErrorResponse(e);
  return handleError(e);
}

/**
 * Imagem de referência embutida (base64): o HeyGen aceita `{ type: 'base64', media_type, data }`
 * (≤ 5 MB decodificados, PNG/JPEG), então o cenário sai do nosso storage direto para o pedido,
 * sem precisar de URL pública. Na simulação, nada é lido além do tamanho (chave estável).
 */
export async function referenceImageFromAsset(asset: { storageKey: string; storageProvider: string; mimeType: string; sizeBytes: number | null }): Promise<ReferenceImage> {
  if (!/^image\/(png|jpeg)$/i.test(asset.mimeType)) throw new HttpError(422, 'O cenário precisa ser PNG ou JPEG para servir de referência ao HeyGen.');
  if ((asset.sizeBytes ?? 0) > MAX_REFERENCE_BASE64_BYTES) throw new HttpError(422, 'O cenário passa de 5 MB; reduza a imagem para usá-la como referência.');
  const storage = await getStorage();
  if (storage.provider !== asset.storageProvider) throw new HttpError(500, 'Storage do cenário indisponível neste ambiente');
  const chunks: Buffer[] = [];
  for await (const c of storage.getStream(asset.storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return { base64: Buffer.concat(chunks).toString('base64'), mediaType: asset.mimeType.toLowerCase() };
}

