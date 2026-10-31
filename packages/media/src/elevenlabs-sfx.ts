import { ElevenLabsError } from './elevenlabs';
import { mediaPriceTable, type MediaPrices } from './pricing';

/**
 * Adapter ElevenLabs Sound Effects (documentação consultada em 2026-10-29):
 * - POST /v1/sound-generation, header `xi-api-key`, JSON
 *   `{ text, duration_seconds?, prompt_influence? }` -> bytes MP3 (audio/mpeg).
 * - `duration_seconds`: 0,5–22 s (ausente = o modelo decide); `prompt_influence` 0–1 (padrão 0,3).
 * - custo: ~100 créditos (caracteres) por segundo gerado (ausente a duração, cobra pelo gerado).
 *
 * AÇÃO PAGA: só é chamado com `ALLOW_PAID_PROVIDERS=1`, chave configurada e
 * confirmação explícita (rota `POST /api/media/bumper/sound` em duas etapas).
 * Mesmo estilo do adapter de voz: fetch injetável, erros tipados, nada de
 * segredos em logs ou mensagens.
 */
export const ELEVENLABS_SFX_ADAPTER_VERSION = 'elevenlabs-sfx-v1';
export const SFX_DURATION = { min: 0.5, max: 22 } as const;
export const SFX_TEXT_MAX = 450;
const SFX_TIMEOUT_MS = 120_000;
/** créditos (caracteres) cobrados por segundo de efeito sonoro (tabela pública; estimativa) */
export const SFX_CREDITS_PER_SECOND = 100;

export interface SoundEffectInput {
  /** descrição em INGLÊS (a API responde melhor) */
  text: string;
  durationSeconds?: number;
  /** 0–1: quanto o prompt manda sobre a criatividade (padrão 0,3) */
  promptInfluence?: number;
}

export interface SoundEffectResult {
  bytes: Uint8Array;
  mime: 'audio/mpeg';
  requestId?: string;
  /** créditos cobrados (header `character-cost`, quando enviado) */
  characterCost?: number;
}

/**
 * Prompt padrão da assinatura sonora: a UI fala pt-BR, a API recebe inglês.
 * `mood` acrescenta um adjetivo (ex.: "warm and confident").
 */
export function bumperSoundPrompt(opts: { durationSeconds: number; mood?: 'warm' | 'bright' | 'minimal' } = { durationSeconds: 3 }): string {
  const mood = opts.mood === 'bright' ? 'bright and optimistic, two-note chime' : opts.mood === 'minimal' ? 'minimal and calm, a single soft tone' : 'warm and confident, two-note rise';
  return `sonic logo, ${mood}, soft synth pad, short attack and long decay, no vocals, ${Math.round(opts.durationSeconds)} seconds`;
}

/** Custo ESTIMADO em USD de um efeito sonoro (créditos por segundo × preço por 1k caracteres). */
export function estimateSoundEffectUsd(durationSeconds: number, prices: MediaPrices = mediaPriceTable()): number {
  const credits = Math.max(SFX_DURATION.min, Math.min(SFX_DURATION.max, durationSeconds)) * SFX_CREDITS_PER_SECOND;
  return Math.round(((credits / 1000) * prices.elevenLabsUsdPer1kChars) * 1_000_000) / 1_000_000;
}

function isAbort(e: unknown) {
  const n = (e as { name?: string } | null)?.name;
  return n === 'AbortError' || n === 'TimeoutError';
}

export class ElevenLabsSfxAdapter {
  readonly provider = 'elevenlabs';
  readonly adapterVersion = ELEVENLABS_SFX_ADAPTER_VERSION;
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.elevenlabs.io', private readonly fetchImpl: typeof fetch = fetch) {}

  /** Gera o efeito sonoro (PAGO). Valida antes de enviar; nunca repete sozinho após um 200. */
  async generate(input: SoundEffectInput): Promise<SoundEffectResult> {
    const text = input.text.trim();
    if (!text) throw new ElevenLabsError(400, 'ElevenLabs SFX: descrição vazia', { retryable: false });
    if (text.length > SFX_TEXT_MAX) throw new ElevenLabsError(400, `ElevenLabs SFX: descrição acima de ${SFX_TEXT_MAX} caracteres`, { retryable: false });
    const body: Record<string, unknown> = { text };
    if (input.durationSeconds !== undefined) {
      if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < SFX_DURATION.min || input.durationSeconds > SFX_DURATION.max) throw new ElevenLabsError(400, `ElevenLabs SFX: duração fora de ${SFX_DURATION.min}–${SFX_DURATION.max} s`, { retryable: false });
      body.duration_seconds = Math.round(input.durationSeconds * 100) / 100;
    }
    if (input.promptInfluence !== undefined) body.prompt_influence = Math.max(0, Math.min(1, input.promptInfluence));
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/sound-generation`, {
        method: 'POST',
        headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SFX_TIMEOUT_MS),
      });
    } catch (e) {
      if (isAbort(e)) throw new ElevenLabsError(504, `ElevenLabs SFX: sem resposta em ${Math.round(SFX_TIMEOUT_MS / 1000)} s (timeout)`, { retryable: true });
      throw e;
    }
    if (!res.ok) throw new ElevenLabsError(res.status, `ElevenLabs SFX respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      // 200 já cobrado: falha de leitura NUNCA é repetida automaticamente
      throw new ElevenLabsError(200, `ElevenLabs SFX: resposta 200 interrompida ao ler o corpo (${isAbort(e) ? 'timeout' : String((e as Error)?.message ?? e)})`, { retryable: false });
    }
    if (bytes.byteLength === 0) throw new ElevenLabsError(200, 'ElevenLabs SFX: resposta 200 sem áudio', { retryable: false });
    const cost = res.headers.get('character-cost');
    return { bytes, mime: 'audio/mpeg', requestId: res.headers.get('request-id') ?? undefined, characterCost: cost ? Number(cost) : undefined };
  }
}
