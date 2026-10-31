/**
 * Adapter ElevenLabs Text-to-Speech (documentação oficial consultada em 2026-10-23):
 * - auth: header `xi-api-key`; base https://api.elevenlabs.io
 * - POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128 -> bytes de áudio
 * - custo: 1 crédito por caractere; header `character-cost`; GET /v1/user/subscription
 * - modelos: eleven_multilingual_v2 (padrão, 10k chars), eleven_flash_v2_5 (40k), eleven_v3 (5k)
 */
export const ELEVENLABS_ADAPTER_VERSION = 'elevenlabs-v1.2';
// synthesizeWithTimestamps é aditivo: a versão do adapter (e o hash de cena do fluxo simples) não muda

export class ElevenLabsError extends Error {
  /**
   * Pode tentar de novo? Padrão: 5xx/429/timeout. Erros DEPOIS de um 200 (corpo
   * ilegível, sem áudio, alinhamento inconsistente) NUNCA são repetíveis: a
   * síntese já foi cobrada e repetir pagaria de novo.
   */
  readonly retryable: boolean;
  constructor(public readonly status: number, message: string, opts: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'ElevenLabsError';
    this.retryable = opts.retryable ?? (status >= 500 || status === 429);
  }
}

/** Tempo máximo de uma síntese (a resposta inteira, inclusive o corpo). */
export const ELEVENLABS_TTS_TIMEOUT_MS = 120_000;
const ELEVENLABS_JSON_TIMEOUT_MS = 60_000;

function isAbort(e: unknown) {
  const n = (e as { name?: string } | null)?.name;
  return n === 'AbortError' || n === 'TimeoutError';
}

/** fetch com tempo limite; timeout vira ElevenLabsError repetível (504). */
async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if (isAbort(e)) throw new ElevenLabsError(504, `ElevenLabs: sem resposta em ${Math.round(ms / 1000)} s (timeout)`, { retryable: true });
    throw e;
  }
}

/** Lê o corpo de uma resposta 200: falha aqui é PERMANENTE (a síntese já foi cobrada). */
async function readPaidBody(res: Response): Promise<Uint8Array> {
  try {
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    throw new ElevenLabsError(200, `ElevenLabs: resposta 200 interrompida ao ler o corpo (${isAbort(e) ? 'timeout' : String((e as Error)?.message ?? e)}); a síntese pode ter sido cobrada, não repetimos automaticamente`, { retryable: false });
  }
}

export interface ElevenLabsTimestampsResult {
  audio: Uint8Array;
  mime: 'audio/mpeg';
  alignment: ElevenLabsAlignment;
  normalizedAlignment?: ElevenLabsAlignment;
}

/**
 * Interpreta o corpo bruto de `/with-timestamps`. Qualquer problema é
 * ElevenLabsError NÃO repetível (o corpo veio de um 200 já cobrado). Pode ser
 * chamado de novo sobre o corpo guardado no storage sem nova cobrança.
 */
export function parseTimestampsResponse(raw: Uint8Array | string): ElevenLabsTimestampsResult {
  const bad = (m: string) => new ElevenLabsError(200, `ElevenLabs: ${m}`, { retryable: false });
  let j: any;
  try {
    j = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
  } catch {
    throw bad('resposta 200 não é JSON válido');
  }
  if (typeof j?.audio_base64 !== 'string' || !j.audio_base64) throw bad('resposta sem audio_base64');
  const parse = (a: any): ElevenLabsAlignment | undefined => {
    if (!a || !Array.isArray(a.characters)) return undefined;
    const characters = a.characters.map(String);
    const startTimes = (a.character_start_times_seconds ?? []).map(Number);
    const endTimes = (a.character_end_times_seconds ?? []).map(Number);
    if (startTimes.length !== characters.length || endTimes.length !== characters.length) throw bad('alinhamento com tamanhos inconsistentes');
    return { characters, startTimes, endTimes };
  };
  const alignment = parse(j.alignment) ?? parse(j.normalized_alignment);
  if (!alignment) throw bad('resposta sem alinhamento');
  return { audio: new Uint8Array(Buffer.from(j.audio_base64, 'base64')), mime: 'audio/mpeg', alignment, normalizedAlignment: parse(j.normalized_alignment) };
}

/** Alinhamento por caractere (tempos em segundos). */
export interface ElevenLabsAlignment {
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

export class ElevenLabsAdapter {
  readonly provider = 'elevenlabs';
  readonly adapterVersion = ELEVENLABS_ADAPTER_VERSION;
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.elevenlabs.io', private readonly fetchImpl: typeof fetch = fetch) {}

  private headers(extra: Record<string, string> = {}) {
    return { 'xi-api-key': this.apiKey, ...extra };
  }

  async synthesize(input: { text: string; voiceId: string; modelId?: string; outputFormat?: string; languageCode?: string; stability?: number; previousText?: string; nextText?: string }) {
    const modelId = input.modelId ?? 'eleven_multilingual_v2';
    const limit = modelId === 'eleven_v3' ? 5_000 : 10_000;
    if (input.text.length > limit) throw new ElevenLabsError(400, `ElevenLabs: texto acima de ${limit} caracteres para ${modelId}`, { retryable: false });
    const stability = input.stability ?? 0.5;
    // eleven_v4 e eleven_v3 aceitam só stability/similarity (docs 2026-10); v2 aceita o conjunto completo
    const voice_settings = modelId === 'eleven_v4' || modelId === 'eleven_v3'
      ? { stability, similarity_boost: 0.75 }
      : { stability, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };
    // continuidade entre cenas (não suportada no v3)
    const continuity = modelId === 'eleven_v3' ? {} : { previous_text: input.previousText, next_text: input.nextText };
    const q = new URLSearchParams({ output_format: input.outputFormat ?? 'mp3_44100_128' });
    const res = await timedFetch(this.fetchImpl, `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?${q}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', accept: 'audio/mpeg' }),
      body: JSON.stringify({ text: input.text, model_id: modelId, language_code: input.languageCode, voice_settings, ...continuity }),
    }, ELEVENLABS_TTS_TIMEOUT_MS);
    if (!res.ok) throw new ElevenLabsError(res.status, `ElevenLabs respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const bytes = await readPaidBody(res);
    if (bytes.byteLength === 0) throw new ElevenLabsError(200, 'ElevenLabs: resposta 200 sem áudio', { retryable: false });
    const cost = res.headers.get('character-cost');
    return { bytes, mime: 'audio/mpeg' as const, characterCost: cost ? Number(cost) : undefined, requestId: res.headers.get('request-id') ?? undefined, modelId };
  }

  /**
   * Síntese com marcação de tempo por caractere:
   * POST /v1/text-to-speech/{voice_id}/with-timestamps -> JSON
   * `{ audio_base64, alignment, normalized_alignment }`, cada alinhamento com
   * `characters`, `character_start_times_seconds`, `character_end_times_seconds`
   * (docs conferidas em 2026-10-23). Devolvemos `alignment` (casa com o texto
   * enviado), que é o usado para cortar o áudio por plano.
   */
  async synthesizeWithTimestamps(input: { text: string; voiceId: string; modelId?: string; stability?: number; outputFormat?: string; languageCode?: string; previousText?: string; nextText?: string }) {
    const r = await this.synthesizeWithTimestampsRaw(input);
    return { ...parseTimestampsResponse(r.raw), characterCost: r.characterCost, requestId: r.requestId, modelId: r.modelId };
  }

  /**
   * Mesma chamada, devolvendo o corpo BRUTO (sem interpretar): quem paga grava o
   * corpo no storage antes de interpretar (`parseTimestampsResponse`), então um
   * erro de leitura nunca leva a pagar a síntese de novo.
   */
  async synthesizeWithTimestampsRaw(input: { text: string; voiceId: string; modelId?: string; stability?: number; outputFormat?: string; languageCode?: string; previousText?: string; nextText?: string }) {
    const modelId = input.modelId ?? 'eleven_multilingual_v2';
    const limit = modelId === 'eleven_v3' ? 5_000 : 10_000;
    if (input.text.length > limit) throw new ElevenLabsError(400, `ElevenLabs: texto acima de ${limit} caracteres para ${modelId}`, { retryable: false });
    const stability = input.stability ?? 0.5;
    const voice_settings = modelId === 'eleven_v4' || modelId === 'eleven_v3'
      ? { stability, similarity_boost: 0.75 }
      : { stability, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };
    const continuity = modelId === 'eleven_v3' ? {} : { previous_text: input.previousText, next_text: input.nextText };
    const q = new URLSearchParams({ output_format: input.outputFormat ?? 'mp3_44100_128' });
    const res = await timedFetch(this.fetchImpl, `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?${q}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', accept: 'application/json' }),
      body: JSON.stringify({ text: input.text, model_id: modelId, language_code: input.languageCode, voice_settings, ...continuity }),
    }, ELEVENLABS_TTS_TIMEOUT_MS);
    if (!res.ok) throw new ElevenLabsError(res.status, `ElevenLabs respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
    const raw = await readPaidBody(res);
    const cost = res.headers.get('character-cost');
    return { raw, characterCost: cost ? Number(cost) : undefined, requestId: res.headers.get('request-id') ?? undefined, modelId };
  }

  async listVoices(params: { search?: string; language?: string; pageSize?: number; nextPageToken?: string } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.language) q.set('language', params.language);
    q.set('page_size', String(params.pageSize ?? 100));
    if (params.nextPageToken) q.set('next_page_token', params.nextPageToken);
    const res = await timedFetch(this.fetchImpl, `${this.baseUrl}/v2/voices?${q}`, { headers: this.headers() }, ELEVENLABS_JSON_TIMEOUT_MS);
    if (!res.ok) throw new ElevenLabsError(res.status, `ElevenLabs respondeu ${res.status}`);
    const json: any = await res.json();
    return {
      voices: (json.voices ?? []).map((v: any) => ({ id: v.voice_id as string, name: v.name as string, category: v.category as string | undefined, previewUrl: v.preview_url as string | undefined, labels: v.labels as Record<string, string> | undefined })),
      hasMore: !!json.has_more,
      nextPageToken: json.next_page_token as string | undefined,
    };
  }

  /**
   * Voz da biblioteca pública na conta: se já está, nada; senão adiciona (GRÁTIS, ocupa 1 vaga de voz).
   * Devolve o id da voz na conta (o ElevenLabs mantém o mesmo id).
   */
  async ensureLibraryVoice(input: { voiceId: string; ownerId: string; name: string }): Promise<{ voiceId: string; added: boolean }> {
    const own = await timedFetch(this.fetchImpl, `${this.baseUrl}/v1/voices/${encodeURIComponent(input.voiceId)}`, { headers: this.headers() }, ELEVENLABS_JSON_TIMEOUT_MS);
    if (own.ok) return { voiceId: input.voiceId, added: false };
    const add = await timedFetch(
      this.fetchImpl,
      `${this.baseUrl}/v1/voices/add/${encodeURIComponent(input.ownerId)}/${encodeURIComponent(input.voiceId)}`,
      { method: 'POST', headers: this.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ new_name: input.name.slice(0, 100) }) },
      ELEVENLABS_JSON_TIMEOUT_MS,
    );
    if (!add.ok) throw new ElevenLabsError(add.status, `ElevenLabs não adicionou a voz (${add.status})`);
    const j: any = await add.json().catch(() => ({}));
    return { voiceId: typeof j?.voice_id === 'string' ? j.voice_id : input.voiceId, added: true };
  }

  async getSubscription() {
    const res = await timedFetch(this.fetchImpl, `${this.baseUrl}/v1/user/subscription`, { headers: this.headers() }, ELEVENLABS_JSON_TIMEOUT_MS);
    if (!res.ok) throw new ElevenLabsError(res.status, `ElevenLabs respondeu ${res.status}`);
    const j: any = await res.json();
    return { characterCount: j.character_count as number, characterLimit: j.character_limit as number, tier: j.tier as string, nextResetUnix: j.next_character_count_reset_unix as number | undefined };
  }
}
