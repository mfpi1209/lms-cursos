import { createHash } from 'node:crypto';

export interface SceneProductionInput {
  script: string;
  avatarId: string;
  voiceProvider: 'heygen' | 'elevenlabs' | 'simulated';
  voiceId: string | null;
  params: Record<string, unknown>;
  adapterVersion: string;
}

/** Hash de cena: roteiro + voz/avatar + parâmetros + versão do adapter. Mesmo hash => reaproveita a saída. */
export function sceneHashSync(input: SceneProductionInput): string {
  const canonical = JSON.stringify({ s: input.script.trim(), a: input.avatarId, vp: input.voiceProvider, v: input.voiceId, p: input.params, av: input.adapterVersion });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Chave do vídeo TRANSPARENTE de plano único: tudo que muda a pessoa e a fala
 * (roteiro, visual, voz, motor, gesto…), sem fundo nem posição — trocar
 * direita/esquerda, o tamanho, a posição livre ou o fundo reaproveita o vídeo
 * pago e só monta de novo (worker) ou permite a remontagem sem custo (rota).
 */
export function singleShotAlphaKey(job: { adapterVersion: string; simulated: number | boolean }, input: { script?: string; avatarId?: string; voiceProvider?: string; voiceId?: string | null; params?: Record<string, any> }): string {
  const p = input.params ?? {};
  return createHash('sha256').update(JSON.stringify({
    k: 'single-alpha', s: String(input.script ?? '').trim(), a: input.avatarId, vp: input.voiceProvider, v: input.voiceId ?? null,
    ar: p.aspectRatio ?? null, r: p.resolution ?? '1080p', en: p.engine ?? null, ex: p.expressiveness ?? null, mp: p.motionPrompt ?? null,
    elm: p.elevenLabsModelId ?? null, els: p.elevenLabsStability ?? null, av: job.adapterVersion, sim: typeof job.simulated === 'boolean' ? (job.simulated ? 1 : 0) : job.simulated,
  })).digest('hex');
}

export interface MediaProviderConfig {
  heygenApiKey?: string;
  heygenWebhookSecret?: string;
  heygenCallbackUrl?: string;
  elevenLabsApiKey?: string;
  elevenLabsModelId: string;
  /** estabilidade da voz: menor = mais expressiva (docs ElevenLabs); padrão 0.35 */
  elevenLabsStability: number;
  /** true quando não há credenciais, MEDIA_SIMULATION=1 ou a trava de gasto está fechada: jobs são simulados e marcados como tal */
  simulation: boolean;
  /** `ALLOW_PAID_PROVIDERS=1`: provedores pagos liberados neste processo */
  paidAllowed: boolean;
  /** demo = nada é cobrado neste processo; real = HeyGen/ElevenLabs reais */
  mode: 'demo' | 'real';
  /** por que a simulação foi forçada (pt-BR, sem segredos) */
  simulationReason?: string;
}

/**
 * Trava de gasto (auditoria P0-1): HeyGen/ElevenLabs reais só com
 * `ALLOW_PAID_PROVIDERS=1` (ou `true`), inclusive em produção. Sem a variável
 * a mídia é simulada mesmo com as chaves definidas.
 */
export function paidProvidersAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ALLOW_PAID_PROVIDERS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export const MEDIA_PAID_GUARD_REASON = 'ALLOW_PAID_PROVIDERS não está definido como 1: HeyGen e ElevenLabs bloqueados neste processo (mídia simulada).';

export function mediaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MediaProviderConfig {
  const heygenApiKey = env.HEYGEN_API_KEY || undefined;
  const elevenLabsApiKey = env.ELEVENLABS_API_KEY || undefined;
  const forced = env.MEDIA_SIMULATION === '1' || env.MEDIA_SIMULATION === 'true';
  const paidAllowed = paidProvidersAllowed(env);
  const simulationReason = forced ? 'MEDIA_SIMULATION=1' : !heygenApiKey ? 'HEYGEN_API_KEY ausente' : !paidAllowed ? MEDIA_PAID_GUARD_REASON : undefined;
  const simulation = forced || !heygenApiKey || !paidAllowed;
  return {
    heygenApiKey,
    heygenWebhookSecret: env.HEYGEN_WEBHOOK_SECRET || undefined,
    heygenCallbackUrl: env.HEYGEN_CALLBACK_URL || undefined,
    elevenLabsApiKey,
    elevenLabsModelId: env.ELEVENLABS_MODEL_ID || 'eleven_v4',
    elevenLabsStability: Number(env.ELEVENLABS_STABILITY ?? 0.35),
    simulation,
    paidAllowed,
    mode: simulation ? 'demo' : 'real',
    simulationReason,
  };
}

/** Resumo do modo para logs (nomes, nunca chaves). */
export function describeMediaMode(cfg: MediaProviderConfig = mediaConfigFromEnv()): string {
  const base = `Mídia: modo ${cfg.mode} · HeyGen ${cfg.heygenApiKey ? 'configurado' : 'sem chave'} · ElevenLabs ${cfg.elevenLabsApiKey ? 'configurado' : 'sem chave'} · ALLOW_PAID_PROVIDERS=${cfg.paidAllowed ? '1' : 'não'}`;
  return cfg.simulationReason ? `${base} · simulação (${cfg.simulationReason})` : base;
}

/** Pré-checagem barata antes de pagar a narração: avatar simulado ou voz ausente no ElevenLabs nunca chegam ao provedor. */
export function narrationPreflight(input: { avatarId?: string | null; voiceProvider?: string | null; voiceId?: string | null }): { ok: true } | { ok: false; reason: string } {
  const avatar = String(input.avatarId ?? '');
  if (!avatar) return { ok: false, reason: 'avatar não definido; escolha um apresentador antes de gerar' };
  if (/^sim_/i.test(avatar)) return { ok: false, reason: `avatar "${avatar}" é do catálogo simulado; escolha um apresentador real antes de gerar vídeo pago` };
  if (input.voiceProvider === 'elevenlabs' && !input.voiceId) return { ok: false, reason: 'voz do ElevenLabs não definida (voiceId nulo); escolha uma voz antes de gerar' };
  if (input.voiceId && /^sim_/i.test(input.voiceId)) return { ok: false, reason: `voz "${input.voiceId}" é do catálogo simulado; escolha uma voz real antes de gerar vídeo pago` };
  return { ok: true };
}

/**
 * Versão da MONTAGEM do vídeo dirigido (ffmpeg: transições, layouts, legendas).
 * Entra no hash de cena dos vídeos dirigidos: suba sempre que a saída da
 * montagem mudar (vídeos antigos deixam de ser reaproveitados como "iguais").
 * - compose-2: transições sobre o quadro congelado do plano que sai (a fala nunca é encoberta).
 */
export const COMPOSE_PIPELINE_VERSION = 'compose-2';

/** Palavras faladas (minúsculas, NFC), sem pontuação: base da comparação entre falas. */
export function spokenWords(text: string): string[] {
  return Array.from(text.normalize('NFC').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu), (m) => m[0]);
}

/**
 * As falas dos planos reproduzem a fala da cena? Compara as sequências de
 * palavras (minúsculas, sem pontuação). Também recusa plano sem nenhuma palavra.
 */
export function directionLinesMatchSpoken(lines: readonly string[], spoken: string): { ok: true } | { ok: false; reason: 'empty_line' | 'mismatch'; index?: number } {
  const empty = lines.findIndex((l) => spokenWords(l).length === 0);
  if (empty >= 0) return { ok: false, reason: 'empty_line', index: empty };
  const a = lines.flatMap(spokenWords);
  const b = spokenWords(spoken);
  if (a.length !== b.length || a.some((w, i) => w !== b[i])) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}
