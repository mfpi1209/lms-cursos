import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Adapter HeyGen API v3 (documentação oficial consultada em 2026-10-23):
 * - auth: header `x-api-key`; base https://api.heygen.com
 * - POST /v3/videos (type "avatar") com `script`+`voice_id` OU `audio_asset_id`
 * - GET /v3/videos/{id}: pending -> processing -> completed | failed
 * - POST /v3/assets: upload de áudio (MP3/WAV, <= 32 MB)
 * - Idempotency-Key no POST /v3/videos (24h; 409 request_in_progress)
 * - webhooks: header `signature` = HMAC-SHA256 hex do corpo bruto com o secret
 * - POST /v3/videos (type "cinematic_avatar"): vídeo por prompt (movimento,
 *   câmera, cenário) a partir de 1–3 looks (`avatar_id: string[]`); `prompt`
 *   1–10.000 chars; `model` seedance_2 (padrão) | heygen_video_1; `duration`
 *   4–15 s (heygen_video_1: 5–15); `resolution` 720p|1080p (heygen_video_1 só
 *   720p); schema com additionalProperties:false — `callback_url`/`callback_id`
 *   são REJEITADOS (acompanhar por polling GET /v3/videos/{id}, mesmo formato
 *   do avatar: status + video_url + failure_message). Não aceita nosso áudio: a
 *   fala seria gerada por IA, então só usamos com o apresentador em silêncio.
 * A v2 (/v2/video/generate) é legada e será desligada em 2026-11-01: não usar.
 *
 * Vídeo com FUNDO TRANSPARENTE (consultado em 2026-10-24):
 * - https://developers.heygen.com/transparent-background-videos
 * - https://developers.heygen.com/reference/create-video
 * `output_format: "webm"` (valores: `mp4` padrão, opaco | `webm`) devolve WebM
 * com canal alfa. Com webm, qualquer `background` é REJEITADO e a remoção de
 * fundo é automática (`remove_background` é redundante, mas inofensivo — não
 * enviamos). Vale para os motores avatar_iv (padrão), avatar_v e avatar_iii;
 * não existe no cinematic_avatar. Exige avatar treinado com matting ("This video
 * avatar does not support webm output…"); a doc diz que o POST /v3/videos aceita
 * photo_avatar, mas não confirma webm para fotos. O codec (VP8/VP9) e o formato
 * de pixel não são documentados: o worker sonda o arquivo (tag ALPHA_MODE) e
 * decodifica com libvpx. Plano B (avatar sem suporte a webm): `remove_background`
 * + fundo de cor verde pura (#00FF00) em MP4, recortado no ffmpeg (colorkey + despill).
 */
export const HEYGEN_ADAPTER_VERSION = 'heygen-v3.2';

export type HeyGenVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface HeyGenCreateInput {
  title: string;
  avatarId: string;
  script?: string;
  voiceId?: string;
  audioAssetId?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '5:4' | 'auto';
  resolution?: '720p' | '1080p' | '4k';
  backgroundColor?: string;
  /** asset de imagem já enviado ao HeyGen (POST /v3/assets) */
  backgroundAssetId?: string;
  /** motor de vídeo; avatar_iv é o único com expressiveness + motion_prompt para photo avatars */
  engine?: 'avatar_iii' | 'avatar_iv' | 'avatar_v';
  /** high|medium|low — apenas photo_avatar no avatar_iv (rejeitado no avatar_v) */
  expressiveness?: 'low' | 'medium' | 'high';
  /** gesto + emoção em inglês (avatar_iv/avatar_v) */
  motionPrompt?: string;
  /** recorta o cenário do visual para aplicar o fundo escolhido */
  removeBackground?: boolean;
  /**
   * vídeo com fundo transparente (`output_format: "webm"`, sem `background`):
   * a montagem posiciona o apresentador sobre o fundo (placePresenter)
   */
  transparent?: boolean;
  /**
   * tela cheia com o fundo do PRÓPRIO look (visual sentado à mesa, por exemplo):
   * sem `background` e sem `remove_background` — o HeyGen entrega o look como foi
   * gerado, opaco (MP4), e nós não montamos nada por cima
   */
  keepLookBackground?: boolean;
  callbackUrl?: string;
  callbackId?: string;
  idempotencyKey: string;
}

/** Sufixo fixo de segurança de todo pedido de cena em movimento (o apresentador nunca fala; a narração é nossa). */
export type CinematicPronoun = 'she' | 'he' | 'they';
/** Sufixo fixo de segurança: só a pessoa apresentadora em quadro, muda, sem texto, mesma identidade. */
export function cinematicSafetySuffix(pronoun: CinematicPronoun = 'she'): string {
  const subj = pronoun === 'he' ? 'he' : pronoun === 'they' ? 'the presenter' : 'she';
  const Subj = subj === 'the presenter' ? 'The presenter' : subj === 'he' ? 'He' : 'She';
  const poss = pronoun === 'he' ? 'his' : pronoun === 'they' ? 'their' : 'her';
  return `${Subj} is the only person anywhere in the frame; no other people, even in the background; ${subj} never speaks, ${poss} lips stay closed the whole time; keep identity, face, hair, outfit and look identical to the reference image; no readable text, signs, captions or logos; realistic, natural human motion.`;
}
export const CINEMATIC_SAFETY_SUFFIX = cinematicSafetySuffix('she');

export interface HeyGenCinematicInput {
  title: string;
  /** 1–3 looks do apresentador (o primeiro é o principal) */
  lookIds: string[];
  /** ação, cenário e câmera, em inglês */
  prompt: string;
  /** 4–15 s (5–15 no heygen_video_1); valores fora são ajustados ao limite */
  durationSeconds: number;
  resolution?: '1080p' | '720p';
  model?: 'seedance_2' | 'heygen_video_1';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** gênero da pessoa apresentadora, para o sufixo de segurança */
  pronoun?: CinematicPronoun;
  idempotencyKey: string;
}

/** Duração aceita pelo cinematic_avatar (inteiro, 4–15 s; 5–15 no heygen_video_1). */
export function clampCinematicDuration(seconds: number, model: HeyGenCinematicInput['model'] = 'seedance_2'): number {
  const min = model === 'heygen_video_1' ? 5 : 4;
  const n = Number.isFinite(seconds) ? Math.ceil(seconds) : min;
  return Math.min(15, Math.max(min, n));
}

/** Prompt final enviado: pedido do autor/IA + sufixo fixo de segurança (dentro do limite de 10.000). */
export function cinematicPrompt(prompt: string, pronoun: CinematicPronoun = 'she'): string {
  const suffix = cinematicSafetySuffix(pronoun);
  const base = prompt.trim().replace(/\s+/g, ' ');
  const head = base.slice(0, 10_000 - suffix.length - 2);
  return `${head}${/[.!?]$/.test(head) ? '' : '.'} ${suffix}`;
}

export class HeyGenError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'HeyGenError';
  }
}

/** Tempos limite das chamadas ao HeyGen (downloads de vídeo têm limite próprio, no worker). */
export const HEYGEN_JSON_TIMEOUT_MS = 60_000;
export const HEYGEN_UPLOAD_TIMEOUT_MS = 120_000;

/**
 * fetch com tempo limite; timeout/abort vira HeyGenError 504 `timeout`
 * (repetível — os POST de vídeo levam Idempotency-Key, então repetir não cobra de novo).
 */
export async function heygenTimedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    const n = (e as { name?: string } | null)?.name;
    if (n === 'AbortError' || n === 'TimeoutError') throw new HeyGenError(504, 'timeout', `HeyGen: sem resposta em ${Math.round(ms / 1000)} s (timeout)`);
    throw e;
  }
}

export class HeyGenAdapter {
  readonly provider = 'heygen';
  readonly adapterVersion = HEYGEN_ADAPTER_VERSION;
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.heygen.com', private readonly fetchImpl: typeof fetch = fetch) {}

  private async request<T>(path: string, init: RequestInit & { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('x-api-key', this.apiKey);
    headers.set('accept', 'application/json');
    if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
    const { idempotencyKey: _k, timeoutMs, ...rest } = init;
    const res = await heygenTimedFetch(this.fetchImpl, `${this.baseUrl}${path}`, { ...rest, headers }, timeoutMs ?? HEYGEN_JSON_TIMEOUT_MS);
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      const n = (e as { name?: string } | null)?.name;
      if (n === 'AbortError' || n === 'TimeoutError') throw new HeyGenError(504, 'timeout', 'HeyGen: resposta interrompida (timeout)');
      throw e;
    }
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      const err = json?.error ?? {};
      const retry = res.headers.get('retry-after');
      throw new HeyGenError(res.status, err.code ?? `http_${res.status}`, err.message ?? `HeyGen respondeu ${res.status}`, retry ? Number(retry) : undefined);
    }
    return json as T;
  }

  async createAvatarVideo(input: HeyGenCreateInput): Promise<{ videoId: string; status: string }> {
    if (!input.script && !input.audioAssetId) throw new Error('HeyGen: informe script+voiceId ou audioAssetId');
    if (input.script && input.script.length > 5000) throw new Error('HeyGen: roteiro acima de 5.000 caracteres (limite documentado)');
    const body: Record<string, unknown> = {
      type: 'avatar',
      title: input.title.slice(0, 200),
      avatar_id: input.avatarId,
      aspect_ratio: input.aspectRatio ?? (input.audioAssetId ? 'auto' : '16:9'),
      resolution: input.resolution ?? '1080p',
      // webm (alfa): a API rejeita `background` e remove o fundo sozinha
      // tela cheia com o fundo do look: nenhum `background` (o cenário do visual fica como está)
      ...(input.transparent || input.keepLookBackground ? {} : { background: input.backgroundAssetId ? { type: 'image', asset_id: input.backgroundAssetId } : { type: 'color', value: input.backgroundColor ?? '#ffffff' } }),
      output_format: input.transparent ? 'webm' : 'mp4',
    };
    if (input.engine) body.engine = { type: input.engine };
    if (input.expressiveness && input.engine !== 'avatar_v') body.expressiveness = input.expressiveness;
    if (input.motionPrompt?.trim()) body.motion_prompt = input.motionPrompt.trim().slice(0, 300);
    if (input.removeBackground && !input.transparent && !input.keepLookBackground) body.remove_background = true;
    if (input.audioAssetId) body.audio_asset_id = input.audioAssetId;
    else {
      body.script = input.script;
      if (input.voiceId) body.voice_id = input.voiceId;
    }
    if (input.callbackUrl) body.callback_url = input.callbackUrl;
    if (input.callbackId) body.callback_id = input.callbackId;
    const r = await this.request<{ data: { video_id: string; status: string } }>('/v3/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      idempotencyKey: input.idempotencyKey,
    });
    return { videoId: r.data.video_id, status: r.data.status };
  }

  /**
   * Cena em movimento (POST /v3/videos type "cinematic_avatar"). Sem callback
   * (rejeitado pela API): o status vem do polling (`getVideo`, mesmo formato).
   */
  async createCinematicVideo(input: HeyGenCinematicInput): Promise<{ videoId: string; status: string }> {
    const lookIds = [...new Set(input.lookIds.map((l) => l.trim()).filter(Boolean))].slice(0, 3);
    if (!lookIds.length) throw new Error('HeyGen: cena em movimento sem look do apresentador');
    if (!input.prompt.trim()) throw new Error('HeyGen: cena em movimento sem pedido de câmera (prompt)');
    const model = input.model ?? 'seedance_2';
    const body: Record<string, unknown> = {
      type: 'cinematic_avatar',
      title: input.title.slice(0, 200),
      prompt: cinematicPrompt(input.prompt, input.pronoun),
      avatar_id: lookIds,
      model,
      aspect_ratio: input.aspectRatio ?? '16:9',
      resolution: model === 'heygen_video_1' ? '720p' : (input.resolution ?? '1080p'),
      duration: clampCinematicDuration(input.durationSeconds, model),
    };
    const r = await this.request<{ data: { video_id: string; status: string } }>('/v3/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      idempotencyKey: input.idempotencyKey,
    });
    return { videoId: r.data.video_id, status: r.data.status };
  }

  async getVideo(videoId: string): Promise<{ status: HeyGenVideoStatus; videoUrl?: string; durationSeconds?: number; failureCode?: string; failureMessage?: string }> {
    const r = await this.request<{ data: any }>(`/v3/videos/${encodeURIComponent(videoId)}`);
    const d = r.data ?? {};
    return { status: d.status, videoUrl: d.video_url ?? undefined, durationSeconds: typeof d.duration === 'number' ? d.duration : undefined, failureCode: d.failure_code ?? undefined, failureMessage: d.failure_message ?? undefined };
  }

  /** Upload de asset (áudio para trilha ou imagem de fundo). Limite documentado: 32 MB. */
  async uploadAsset(bytes: Uint8Array, mime: 'audio/mpeg' | 'audio/wav' | 'image/png' | 'image/jpeg' | 'image/webp'): Promise<{ assetId: string }> {
    if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('HeyGen: asset acima de 32 MB');
    // a API exige multipart/form-data com o campo "file" (o content-type com boundary é definido pelo fetch)
    const ext = mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/wav' ? 'wav' : mime.split('/')[1];
    const form = new FormData();
    form.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: mime }), `asset.${ext}`);
    const r = await this.request<{ data: any }>('/v3/assets', { method: 'POST', body: form, timeoutMs: HEYGEN_UPLOAD_TIMEOUT_MS });
    const id = r.data?.id ?? r.data?.asset_id;
    if (!id) throw new Error('HeyGen: resposta de upload sem id de asset');
    return { assetId: id };
  }

  /** @deprecated use uploadAsset */
  uploadAudioAsset(bytes: Uint8Array, mime: 'audio/mpeg' | 'audio/wav') {
    return this.uploadAsset(bytes, mime);
  }

  async listAvatarLooks(params: { groupId?: string; limit?: number; token?: string } = {}) {
    const q = new URLSearchParams();
    if (params.groupId) q.set('group_id', params.groupId);
    q.set('limit', String(params.limit ?? 50));
    if (params.token) q.set('token', params.token);
    const r = await this.request<{ data: any[]; has_more?: boolean; next_token?: string }>(`/v3/avatars/looks?${q}`);
    return {
      looks: (r.data ?? []).map((a) => ({ id: a.id as string, name: a.name as string, avatarType: a.avatar_type as string, previewImageUrl: a.preview_image_url as string | undefined, previewVideoUrl: a.preview_video_url as string | undefined, gender: a.gender as string | undefined, defaultVoiceId: a.default_voice_id as string | undefined, groupId: (a.group_id ?? a.avatar_group_id) as string | undefined })),
      hasMore: !!r.has_more,
      nextToken: r.next_token,
    };
  }

  async listVoices(params: { language?: string; limit?: number; token?: string } = {}) {
    const q = new URLSearchParams();
    if (params.language) q.set('language', params.language);
    q.set('limit', String(params.limit ?? 100));
    if (params.token) q.set('token', params.token);
    const r = await this.request<{ data: any[]; has_more?: boolean; next_token?: string }>(`/v3/voices?${q}`);
    return {
      voices: (r.data ?? []).map((v) => ({ id: v.voice_id as string, name: v.name as string, language: v.language as string | undefined, gender: v.gender as string | undefined, previewAudioUrl: v.preview_audio_url as string | undefined })),
      hasMore: !!r.has_more,
      nextToken: r.next_token,
    };
  }

  async getAccount() {
    const r = await this.request<{ data: any }>('/v3/users/me');
    return r.data;
  }
}

/**
 * O HeyGen recusou o WebM com alfa para este avatar (sem matting): 4xx cuja
 * mensagem cita webm/matting/transparência. Só então caímos no plano B (verde).
 */
export function isTransparentUnsupportedError(e: unknown): e is HeyGenError {
  if (!(e instanceof HeyGenError) || e.status < 400 || e.status >= 500 || e.status === 409 || e.status === 429) return false;
  return /webm|matting|transparen|alpha|output_format/i.test(`${e.code} ${e.message}`);
}

/** Verifica a assinatura do webhook (HMAC-SHA256 hex do corpo bruto) em tempo constante. */
export function verifyHeyGenWebhookSignature(rawBody: string | Uint8Array, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given) || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}
