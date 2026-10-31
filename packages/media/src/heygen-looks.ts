import { createHash } from 'node:crypto';
import { HEYGEN_JSON_TIMEOUT_MS, HeyGenError, heygenTimedFetch } from './heygen';

/**
 * "Gerar novo ângulo com IA": novo visual (look) do MESMO apresentador a partir de
 * um look existente + pedido de câmera em texto. Documentação oficial consultada em 2026-10-23:
 * - https://developers.heygen.com/docs/avatar-from-prompt
 * - https://developers.heygen.com/reference/create-avatar      (POST /v3/avatars)
 * - https://developers.heygen.com/reference/get-avatar-look    (GET /v3/avatars/looks/{look_id})
 * - https://developers.heygen.com/reference/create-avatar-looks (só para a nota de cobrança, endpoint diferente)
 *
 * Fatos documentados:
 * - POST /v3/avatars, header `x-api-key`, corpo `{ type: "prompt", name, prompt (<= 1000 chars),
 *   avatar_id?, avatar_group_id?, reference_images? (<= 3), aspect_ratio? (auto|16:9|9:16|1:1|4:5|5:4) }`.
 * - Com `avatar_id` e sem `avatar_group_id`, a imagem do look é a referência visual e o resultado é
 *   salvo no MESMO personagem (grupo) do look de origem. Por isso nunca enviamos `avatar_group_id`.
 * - Resposta 200 `{ data: { avatar_item: AvatarLookItem | null, avatar_group: AvatarGroupItem | null } }`.
 *   Não existe "generation id" separado: o `avatar_item.id` JÁ é o id do look novo (ainda em `processing`).
 *   Aqui `generationId === lookId` no provedor real.
 * - Conclusão: GET /v3/avatars/looks/{id} até `status` sair de `processing`.
 *   status: processing | pending_consent | failed | completed (null em avatares públicos);
 *   `error { code, message }` quando failed; `completed` traz `preview_image_url` e `supported_api_engines`.
 * - O look gerado renderiza em POST /v3/videos (avatar_id = id do look); motores conforme
 *   `supported_api_engines` (avatar_v | avatar_iv | avatar_iii) — conferir antes de pedir avatar_iv.
 * - Idempotency-Key opcional: 1–255 chars [A-Za-z0-9_:.-]; replay da resposta original por 24h;
 *   409 `request_in_progress` se a primeira ainda está em andamento.
 * - Erros: 400 invalid_parameter (look sem imagem utilizável), 401, 404 avatar_not_found, 409, 429 (+Retry-After).
 *
 * NOT FOUND IN DOCS:
 * - custo da geração por prompt em POST /v3/avatars (o endpoint vizinho POST /v3/avatars/looks cobra
 *   "1 API credit per look" e é cobrado no aceite; tratamos como pago e exigimos confirmação explícita).
 * - qual `avatar_type` o look gerado recebe (photo_avatar?) — usamos `supported_api_engines` quando vier.
 * - se a voz/lip-sync ficam idênticos: o look fica no mesmo grupo (mesmo personagem), e a voz é escolhida
 *   por nós em cada vídeo (voice_id/áudio), então a consistência de voz não depende do look.
 * - limites de taxa específicos: tratamos 429 + Retry-After e limitamos localmente (6/h por workspace).
 */
export const HEYGEN_LOOKS_ADAPTER_VERSION = 'heygen-looks-v3.4';

/**
 * Imagens de referência (`reference_images`, até 3, documentação consultada em
 * 2026-10-29): array de OBJETOS discriminados por `type`:
 *   { type: 'url', url }            — URL pública HTTPS, sem redirecionamento;
 *   { type: 'asset_id', asset_id }  — asset enviado a POST /v3/assets;
 *   { type: 'base64', media_type, data } — imagem embutida (≤ 5 MB decodificados).
 * Usamos para gerar a pessoa apresentadora DENTRO de um cenário do workspace.
 * Preferimos `base64`: dispensa URL pública (a rota de assets exige sessão).
 */
export const MAX_REFERENCE_IMAGES = 3;
export const MAX_REFERENCE_BASE64_BYTES = 5 * 1024 * 1024;
/** string = URL pública https; objeto = imagem embutida */
export type ReferenceImage = string | { base64: string; mediaType: string };

export const CAMERA_ANGLES = ['front', 'left', 'right', 'high', 'low'] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];
export const CAMERA_FRAMINGS = ['wide', 'medium', 'close', 'extreme_close'] as const;
export type CameraFraming = (typeof CAMERA_FRAMINGS)[number];

export const HEYGEN_PROMPT_MAX = 1000;
export const CAMERA_EXTRA_MAX = 300;
export type LookAspectRatio = 'auto' | '16:9' | '9:16' | '1:1' | '4:5' | '5:4';

export type LookGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface LookGenerationResult {
  status: LookGenerationStatus;
  lookId?: string;
  previewUrl?: string;
  error?: string;
  /** motores aceitos pelo look (quando o provedor informa) */
  supportedEngines?: string[];
}

export interface GenerateLookInput {
  sourceLookId: string;
  prompt: string;
  aspectRatio?: LookAspectRatio;
  idempotencyKey: string;
  /** nome do look no HeyGen (obrigatório na API; geramos um se ausente) */
  name?: string;
  /** imagens de referência (`reference_images`, até 3): o cenário onde a pessoa deve estar (URL pública https ou base64) */
  referenceImages?: ReferenceImage[];
}

export interface LookGenerator {
  readonly simulated: boolean;
  generateLookFromPrompt(input: GenerateLookInput): Promise<{ generationId: string }>;
  getLookGeneration(generationId: string): Promise<LookGenerationResult>;
}

/** Gerador que também cria personagem NOVO só por texto (instrutor novo). */
export interface CharacterLookGenerator extends LookGenerator {
  createCharacterFromPrompt(input: Omit<GenerateLookInput, 'sourceLookId'>): Promise<{ generationId: string }>;
}

const ANGLE_TEXT: Record<CameraAngle, string> = {
  front: 'straight-on from the front, eye level',
  left: "from the subject's left side, about 30 degrees off-axis, eye level",
  right: "from the subject's right side, about 30 degrees off-axis, eye level",
  high: 'slightly high angle, about 15 degrees above eye level, facing the subject',
  low: 'slightly low angle, about 15 degrees below eye level, facing the subject',
};

const FRAMING_TEXT: Record<CameraFraming, string> = {
  wide: 'medium-wide shot, framed from the waist up, showing more of the same setting',
  medium: 'medium shot, framed from the chest up',
  close: 'close-up, head and shoulders',
  extreme_close: 'extreme close-up, the face fills most of the frame, chin and mouth fully in frame',
};

/** Pedido de visual sentado (mesmo critério de `looksSeated` no course-schema). */
const SEATED_EXTRA_RE = /(sentad[oa]s?|seated|sitting|mesa|cadeira|\btable\b|\bdesk\b)/i;
export const SEATED_POSE_TEXT = 'Pose: seated upright on a chair at a table, forearms and hands resting on the tabletop; the tabletop and the chair back stay visible and uncropped in the frame; same office setting, the room stays in the background.';

/** Limpa o texto livre do autor: sem quebras/controle, espaços colapsados, até 300 caracteres. */
function sanitizeExtra(extra: string | undefined): string {
  if (!extra) return '';
  // eslint-disable-next-line no-control-regex
  const clean = extra.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, CAMERA_EXTRA_MAX).trim();
}

/**
 * Converte a intenção de câmera em um prompt de direção em inglês que preserva identidade,
 * figurino, cenário e luz, e mantém o rosto grande, visível e voltado à câmera (qualidade do lip-sync).
 */
export function buildCameraPrompt(input: { angle: CameraAngle; framing: CameraFraming; extra?: string }): string {
  const angle = ANGLE_TEXT[input.angle];
  const framing = FRAMING_TEXT[input.framing];
  if (!angle || !framing) throw new Error('Ângulo ou enquadramento inválido');
  const parts = [
    'Same person, same face and identity, same outfit, same setting and lighting.',
    `Camera: ${framing}, ${angle}.`,
    'Neutral expression, mouth closed, looking at the camera.',
    'Face clearly visible, well lit and in sharp focus, large enough in frame for lip-sync (not a tiny face); no hands or objects covering the mouth.',
    'Photorealistic, same image quality and color grading as the reference. Do not change hairstyle, makeup, accessories or background.',
  ];
  const extra = sanitizeExtra(input.extra);
  // visual sentado (pedido em pt-BR ou inglês): pose explícita em inglês, com mesa e cadeira inteiras no quadro
  // (a câmera sentada renderiza em tela cheia, com o fundo do próprio look; nada é recortado depois)
  if (SEATED_EXTRA_RE.test(extra)) parts.push(SEATED_POSE_TEXT);
  if (extra) parts.push(`Additional direction (keep everything above): ${extra}`);
  const prompt = parts.join(' ');
  return prompt.length > HEYGEN_PROMPT_MAX ? prompt.slice(0, HEYGEN_PROMPT_MAX) : prompt;
}

/** Ângulos do visual "dentro do cenário" (a câmera, não o lado do rosto). */
export const SCENE_LOOK_ANGLES = ['three_quarter', 'front', 'close'] as const;
export type SceneLookAngle = (typeof SCENE_LOOK_ANGLES)[number];
/** Presets da rota: `scene_<ângulo>`. */
export const SCENE_LOOK_PRESETS = ['scene_three_quarter', 'scene_front', 'scene_close'] as const;
export type SceneLookPreset = (typeof SCENE_LOOK_PRESETS)[number];
export function sceneLookAngleOf(preset: SceneLookPreset): SceneLookAngle {
  return preset.replace(/^scene_/, '') as SceneLookAngle;
}

const SCENE_ANGLE_TEXT: Record<SceneLookAngle, string> = {
  three_quarter: 'three-quarter view (body turned about 30 degrees, face toward the camera), medium-wide shot from the waist up',
  front: 'straight-on from the front at eye level, medium shot from the waist up',
  close: 'straight-on at eye level, medium close-up from the chest up',
};

/**
 * Pedido de visual DENTRO do cenário (imagem de referência): mesma pessoa,
 * rosto, identidade e roupa, colocada no ambiente da imagem de referência,
 * com o ângulo pedido, luz prática do ambiente, postura natural com as mãos
 * visíveis e olhando para a câmera. O resultado renderiza em tela cheia (o
 * cenário faz parte do look), por isso a câmera nasce com `placement: full_frame`.
 */
/** Posição da pessoa no quadro (estúdio com zonas): um terço livre recebe o conteúdo da aula. */
export const SCENE_LOOK_POSITIONS = ['center', 'left_third', 'right_third'] as const;
export type SceneLookPosition = (typeof SCENE_LOOK_POSITIONS)[number];
const SCENE_POSITION_TEXT: Record<SceneLookPosition, string> = {
  center: '',
  left_third: 'Composition: the presenter stands in the LEFT third of the frame; the right two thirds show the empty wall, kept clear for on-screen graphics.',
  right_third: 'Composition: the presenter stands in the RIGHT third of the frame; the left two thirds show the empty wall, kept clear for on-screen graphics.',
};

export function buildSceneLookPrompt(input: { angle: SceneLookAngle; scenery?: string; pronoun?: 'she' | 'he' | 'they'; position?: SceneLookPosition }): string {
  const angle = SCENE_ANGLE_TEXT[input.angle];
  if (!angle) throw new Error('Ângulo inválido');
  const subj = input.pronoun === 'he' ? 'he' : input.pronoun === 'they' ? 'the presenter' : 'she';
  const scenery = sanitizeExtra(input.scenery) || 'the setting shown in the reference image';
  const parts = [
    'Same person, same face and identity and outfit as the source look.',
    `Placed INSIDE ${scenery === 'the setting shown in the reference image' ? scenery : `the setting shown in the reference image (${scenery})`}, standing naturally in that environment, not in front of a flat backdrop.`,
    `Camera: ${angle}, shallow depth of field with the environment softly out of focus behind ${subj === 'the presenter' ? 'the presenter' : subj}.`,
    ...(input.position && SCENE_POSITION_TEXT[input.position] ? [SCENE_POSITION_TEXT[input.position]] : []),
    "Lit by the environment's practical lights, matching the reference image's light direction and color temperature.",
    'Natural posture with hands visible and relaxed, mouth closed, looking at the camera.',
    input.position
      ? 'Face well lit, sharp and large enough for lip-sync; nothing covering the mouth.'
      : 'Face clearly visible, well lit and in sharp focus, large enough in frame for lip-sync; no hands or objects covering the mouth.',
    input.position
      ? 'Photorealistic. Keep the set as in the reference, incl. the small wall logo; no new text or people.'
      : 'Photorealistic, same image quality as the reference. Do not change hairstyle, makeup or accessories. No text, logos or other people.',
  ];
  const prompt = parts.join(' ');
  return prompt.length > HEYGEN_PROMPT_MAX ? prompt.slice(0, HEYGEN_PROMPT_MAX) : prompt;
}

/** Idempotency-Key estável (workspace + look de origem + prompt + referências): clique duplo não paga duas vezes. */
export function lookIdempotencyKey(workspaceId: string, sourceLookId: string, prompt: string, referenceImages: readonly ReferenceImage[] = []): string {
  // imagens embutidas entram na chave pelo hash do conteúdo (chave curta e estável)
  const refs = referenceImages.map((r) => (typeof r === 'string' ? r : `base64:${r.mediaType}:${createHash('sha256').update(r.base64).digest('hex')}`));
  const h = createHash('sha256').update(JSON.stringify([workspaceId, sourceLookId, prompt.trim(), ...(refs.length ? [refs] : [])])).digest('hex');
  return `lookgen:${h.slice(0, 48)}`;
}

const IDEMPOTENCY_RE = /^[A-Za-z0-9_:.-]{1,255}$/;

function mapStatus(raw: unknown, hasPreview: boolean): LookGenerationStatus {
  switch (raw) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'processing': return 'processing';
    // pending_consent: não deveria ocorrer para look derivado; fica pendente (nunca "pronto")
    case 'pending_consent': return 'pending';
    default:
      // status null é documentado para avatares públicos: só consideramos pronto se houver preview
      return raw == null && hasPreview ? 'completed' : 'pending';
  }
}

export class HeyGenLooksAdapter implements CharacterLookGenerator {
  readonly provider = 'heygen';
  readonly simulated = false;
  readonly adapterVersion = HEYGEN_LOOKS_ADAPTER_VERSION;
  constructor(private readonly apiKey: string, private readonly baseUrl = 'https://api.heygen.com', private readonly fetchImpl: typeof fetch = fetch) {}

  private async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('x-api-key', this.apiKey);
    headers.set('accept', 'application/json');
    if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
    const { idempotencyKey: _ignored, ...rest } = init;
    const res = await heygenTimedFetch(this.fetchImpl, `${this.baseUrl}${path}`, { ...rest, headers }, HEYGEN_JSON_TIMEOUT_MS);
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      const err = json?.error ?? json ?? {};
      const retry = res.headers.get('retry-after');
      throw new HeyGenError(res.status, typeof err.code === 'string' ? err.code : `http_${res.status}`, typeof err.message === 'string' ? err.message : `HeyGen respondeu ${res.status}`, retry ? Number(retry) : undefined);
    }
    return json as T;
  }

  private validated(input: { prompt: string; idempotencyKey: string; referenceImages?: ReferenceImage[] }) {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error('HeyGen: prompt vazio');
    if (prompt.length > HEYGEN_PROMPT_MAX) throw new Error('HeyGen: prompt acima de 1.000 caracteres (limite documentado)');
    if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) throw new Error('HeyGen: Idempotency-Key inválida');
    const refs = (input.referenceImages ?? []).filter((r) => (typeof r === 'string' ? r.trim() : r.base64));
    if (refs.length > MAX_REFERENCE_IMAGES) throw new Error(`HeyGen: no máximo ${MAX_REFERENCE_IMAGES} imagens de referência (limite documentado)`);
    const referenceImages = refs.map((r) => {
      if (typeof r === 'string') {
        const url = r.trim();
        if (!/^https:\/\//i.test(url)) throw new Error('HeyGen: imagens de referência por URL precisam ser URLs públicas https');
        return { type: 'url', url };
      }
      const bytes = Buffer.from(r.base64, 'base64').length;
      if (bytes > MAX_REFERENCE_BASE64_BYTES) throw new Error('HeyGen: imagem de referência acima de 5 MB (limite documentado para base64)');
      if (!/^image\/(png|jpeg)$/i.test(r.mediaType)) throw new Error('HeyGen: imagem de referência precisa ser PNG ou JPEG');
      return { type: 'base64', media_type: r.mediaType, data: r.base64 };
    });
    return { prompt, referenceImages };
  }

  private async postAvatar(body: Record<string, unknown>, idempotencyKey: string): Promise<{ generationId: string }> {
    const r = await this.request<{ data?: { avatar_item?: { id?: string } | null } }>('/v3/avatars', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      idempotencyKey,
    });
    const id = r?.data?.avatar_item?.id;
    if (!id) throw new Error('HeyGen: resposta sem id do visual gerado');
    return { generationId: id };
  }

  async generateLookFromPrompt(input: GenerateLookInput): Promise<{ generationId: string }> {
    if (!input.sourceLookId) throw new Error('HeyGen: informe o look de origem');
    const { prompt, referenceImages } = this.validated(input);
    return this.postAvatar({
      type: 'prompt',
      name: (input.name ?? 'Câmera gerada por IA').slice(0, 100),
      prompt,
      avatar_id: input.sourceLookId,
      aspect_ratio: input.aspectRatio ?? '16:9',
      // cenário como referência visual (documentado: reference_images, até 3 objetos {type,...})
      ...(referenceImages.length ? { reference_images: referenceImages } : {}),
    }, input.idempotencyKey);
  }

  /**
   * Personagem NOVO (sintético) a partir só do texto: POST /v3/avatars type=prompt SEM avatar_id e
   * sem avatar_group_id (documentado: "a new character"; sem etapa de consentimento). O id devolvido
   * é o look base do personagem; as câmeras de cena derivam dele com `generateLookFromPrompt`.
   * PAGO como qualquer geração de visual.
   */
  async createCharacterFromPrompt(input: Omit<GenerateLookInput, 'sourceLookId'>): Promise<{ generationId: string }> {
    const { prompt, referenceImages } = this.validated(input);
    return this.postAvatar({
      type: 'prompt',
      name: (input.name ?? 'Apresentador gerado por IA').slice(0, 100),
      prompt,
      aspect_ratio: input.aspectRatio ?? '16:9',
      ...(referenceImages.length ? { reference_images: referenceImages } : {}),
    }, input.idempotencyKey);
  }

  async getLookGeneration(generationId: string): Promise<LookGenerationResult> {
    const r = await this.request<{ data?: any }>(`/v3/avatars/looks/${encodeURIComponent(generationId)}`);
    const d = r?.data ?? {};
    const previewUrl: string | undefined = d.preview_image_url ?? undefined;
    const status = mapStatus(d.status, !!previewUrl);
    const out: LookGenerationResult = { status };
    if (status === 'completed') out.lookId = typeof d.id === 'string' ? d.id : generationId;
    if (previewUrl) out.previewUrl = previewUrl;
    if (Array.isArray(d.supported_api_engines)) out.supportedEngines = d.supported_api_engines.filter((e: unknown) => typeof e === 'string');
    if (status === 'failed') out.error = (d.error?.message as string | undefined) ?? (d.error?.code as string | undefined) ?? 'Falha na geração do visual';
    return out;
  }
}

const SIM_PREFIX = 'sim_gen_';

/**
 * Modo de DEMONSTRAÇÃO: geração determinística e gratuita. O id `sim_gen_<hash>_<b64(origem)>`
 * carrega o look de origem para que o GET funcione mesmo após reiniciar o servidor; a geração já
 * nasce `completed` com lookId = origem + sufixo e o preview do look de origem.
 */
export class SimulatedHeyGenLooks implements CharacterLookGenerator {
  readonly provider = 'simulated';
  readonly simulated = true;
  private readonly registry = new Map<string, string>();
  constructor(
    private readonly previewFor: (lookId: string) => string | undefined = () => undefined,
    private readonly characterSource = 'sim_character',
  ) {}

  static isSimulatedId(id: string): boolean {
    return id.startsWith(SIM_PREFIX);
  }

  async generateLookFromPrompt(input: GenerateLookInput): Promise<{ generationId: string }> {
    if (!input.prompt.trim()) throw new Error('Simulação: prompt vazio');
    const hash = createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 12);
    const enc = Buffer.from(input.sourceLookId, 'utf8').toString('base64url');
    const generationId = enc.length <= 90 ? `${SIM_PREFIX}${hash}_${enc}` : `${SIM_PREFIX}${hash}`;
    this.registry.set(generationId, input.sourceLookId);
    return { generationId };
  }

  /** personagem novo simulado: "deriva" de `characterSource` (o 1º apresentador simulado, para ter prévia) */
  async createCharacterFromPrompt(input: Omit<GenerateLookInput, 'sourceLookId'>): Promise<{ generationId: string }> {
    return this.generateLookFromPrompt({ ...input, sourceLookId: this.characterSource });
  }

  async getLookGeneration(generationId: string): Promise<LookGenerationResult> {
    const m = /^sim_gen_([0-9a-f]{12})(?:_([A-Za-z0-9_-]+))?$/.exec(generationId);
    if (!m) return { status: 'failed', error: 'Geração simulada desconhecida' };
    const hash = m[1]!;
    let source = this.registry.get(generationId);
    if (!source && m[2]) source = Buffer.from(m[2], 'base64url').toString('utf8');
    if (!source) return { status: 'completed', lookId: `sim_look_${hash}` };
    const out: LookGenerationResult = { status: 'completed', lookId: `${source.slice(0, 100)}__ia_${hash.slice(0, 8)}` };
    const preview = this.previewFor(source);
    if (preview) out.previewUrl = preview;
    return out;
  }
}

/**
 * Limite de sanidade em MEMÓRIA (por processo): no máx. `limit` gerações pagas por workspace por janela.
 * Não é distribuído nem sobrevive a reinício — é um freio contra cliques/loops, não cota de cobrança.
 * Repetir a mesma Idempotency-Key dentro de 24h não consome vaga (o provedor reaproveita a resposta).
 */
export class LookGenerationRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly keys = new Map<string, number>();
  constructor(private readonly limit = 6, private readonly windowMs = 60 * 60 * 1000, private readonly now: () => number = Date.now, private readonly replayMs = 24 * 60 * 60 * 1000) {}

  /** Reserva uma vaga. Retorna `{ ok: false, retryAfterSeconds }` quando estourou. */
  take(workspaceId: string, idempotencyKey: string): { ok: true; replay: boolean } | { ok: false; retryAfterSeconds: number } {
    const t = this.now();
    const seen = this.keys.get(`${workspaceId}|${idempotencyKey}`);
    if (seen !== undefined && t - seen < this.replayMs) return { ok: true, replay: true };
    const list = (this.hits.get(workspaceId) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(workspaceId, list);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((list[0]! + this.windowMs - t) / 1000)) };
    }
    list.push(t);
    this.hits.set(workspaceId, list);
    this.keys.set(`${workspaceId}|${idempotencyKey}`, t);
    return { ok: true, replay: false };
  }

  /** Devolve a vaga quando a chamada ao provedor falhou (nada foi cobrado). */
  release(workspaceId: string, idempotencyKey: string): void {
    const k = `${workspaceId}|${idempotencyKey}`;
    const t = this.keys.get(k);
    if (t === undefined) return;
    this.keys.delete(k);
    const list = this.hits.get(workspaceId) ?? [];
    const i = list.lastIndexOf(t);
    if (i >= 0) list.splice(i, 1);
  }
}
