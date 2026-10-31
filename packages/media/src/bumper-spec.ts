import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrandCardPresetId } from './brand-tokens';

/**
 * Especificação da vinheta de marca (tipos, limites, padrões por preset e o
 * hash de reaproveitamento). Sem satori/resvg/ffmpeg: o app web importa daqui;
 * o renderizador fica em `compose/bumper.ts`.
 */
/**
 * Versão do renderizador (entra no hash da vinheta).
 * - bumper-2: sem o ponto laranja no canto inferior direito.
 */
export const BUMPER_RENDERER_VERSION = 'bumper-2';

export const BUMPER_STYLES = ['reveal', 'sweep', 'pulse'] as const;
export type BumperStyle = (typeof BUMPER_STYLES)[number];
export const BUMPER_VARIANTS = ['light', 'navy'] as const;
export type BumperVariant = (typeof BUMPER_VARIANTS)[number];
export const BUMPER_AUDIO_PRESETS = ['warm', 'bright', 'minimal'] as const;
export type BumperAudioPreset = (typeof BUMPER_AUDIO_PRESETS)[number];
export const BUMPER_ASPECTS = ['16:9', '9:16'] as const;
export type BumperAspect = (typeof BUMPER_ASPECTS)[number];
export const BUMPER_PLACEMENTS = ['outro', 'intro'] as const;
export type BumperPlacement = (typeof BUMPER_PLACEMENTS)[number];
export const BUMPER_DURATION = { min: 3, max: 5, default: 4 } as const;
export const BUMPER_TAGLINE_MAX = 60;
export const BUMPER_FPS = 30;

export type BumperAudio =
  | { kind: 'synth'; preset: BumperAudioPreset }
  /** arquivo de áudio: `path` no worker (lido do storage); `assetId` identifica o arquivo no hash */
  | { kind: 'file'; path?: string; assetId?: string }
  | { kind: 'none' };

export interface BumperSpec {
  brand: BrandCardPresetId;
  style: BumperStyle;
  variant: BumperVariant;
  /** 3–5 s */
  durationSec: number;
  /** ≤ 60 caracteres; vazio = sem frase */
  tagline?: string;
  /** marca em texto: com logo, texto pequeno sob ele; sem logo (preset lms), vira a própria marca */
  wordmark?: string;
  /** caminhos dos logos (PNG); ausentes = os do preset (DNA Work empacotados no pacote) */
  logoLight?: string;
  logoDark?: string;
  audio: BumperAudio;
  placement: BumperPlacement;
  aspect?: BumperAspect;
}

export interface BumperRenderResult {
  videoPath: string;
  durationSec: number;
  hash: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
}

/* ------------------------------------------------------------------ */
/* Padrões de marca                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pasta dos logos empacotados (`packages/media/assets/brand/`), resolvida só
 * quando pedida (o worker renderiza; o app web nunca lê os arquivos). Sem
 * `new URL(..., import.meta.url)`: bundlers tratam esse padrão como asset.
 */
function brandAssetsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'brand');
}

export interface BumperBrandDefaults {
  tagline: string;
  wordmark: string;
  /** nomes dos arquivos de logo (claro/escuro) dentro da pasta de assets do preset; ausente = sem logo (marca em texto) */
  logos?: { light: string; dark: string };
}

/** Padrões por preset: frase da marca, marca em texto e logos empacotados (DNA Work). */
export const BUMPER_BRAND_DEFAULTS: Record<BrandCardPresetId, BumperBrandDefaults> = {
  dnawork: { tagline: '', /* sem slogan oficial: a vinheta assina só com o logo */ wordmark: '', logos: { light: 'dnawork/logo.png', dark: 'dnawork/logo-branco.png' } },
  lms: { tagline: 'Cursos práticos para o trabalho e o dia a dia.', wordmark: 'cursos' },
};

/** Caminho do logo (PNG) para a variante: o próprio da spec ou o empacotado do preset; undefined quando não há arquivo. */
export function bumperLogoPath(spec: Pick<BumperSpec, 'brand' | 'variant' | 'logoLight' | 'logoDark'>): string | undefined {
  const d = BUMPER_BRAND_DEFAULTS[spec.brand];
  const own = spec.variant === 'navy' ? spec.logoDark : spec.logoLight;
  const p = own ?? (d.logos ? path.join(brandAssetsDir(), spec.variant === 'navy' ? d.logos.dark : d.logos.light) : undefined);
  return p && existsSync(p) ? p : undefined;
}

/**
 * Logo empacotado do preset para o fundo: `light` = logo colorido (fundos
 * claros), `dark` = logo branco (fundos escuros/vídeo). undefined sem arquivo.
 */
export function brandLogoFile(preset: string | null | undefined, tone: 'light' | 'dark'): string | undefined {
  const d = BUMPER_BRAND_DEFAULTS[preset === 'lms' ? 'lms' : 'dnawork'];
  if (!d.logos) return undefined;
  const p = path.join(brandAssetsDir(), tone === 'dark' ? d.logos.dark : d.logos.light);
  return existsSync(p) ? p : undefined;
}

/** Normaliza a especificação (limites, padrões) — o que entra no hash e no render. */
export function normalizeBumperSpec(input: BumperSpec): Required<Omit<BumperSpec, 'logoLight' | 'logoDark'>> & Pick<BumperSpec, 'logoLight' | 'logoDark'> {
  const d = BUMPER_BRAND_DEFAULTS[input.brand] ?? BUMPER_BRAND_DEFAULTS.dnawork;
  const durationSec = Math.min(BUMPER_DURATION.max, Math.max(BUMPER_DURATION.min, Math.round((Number(input.durationSec) || BUMPER_DURATION.default) * 10) / 10));
  const tagline = (input.tagline ?? d.tagline).replace(/\s+/g, ' ').trim().slice(0, BUMPER_TAGLINE_MAX);
  const wordmark = (input.wordmark ?? d.wordmark).replace(/\s+/g, ' ').trim().slice(0, 24);
  return {
    brand: input.brand,
    style: input.style,
    variant: input.variant,
    durationSec,
    tagline,
    wordmark,
    audio: input.audio,
    placement: input.placement ?? 'outro',
    aspect: input.aspect ?? '16:9',
    ...(input.logoLight ? { logoLight: input.logoLight } : {}),
    ...(input.logoDark ? { logoDark: input.logoDark } : {}),
  };
}

/**
 * Hash da vinheta (reaproveitamento): especificação normalizada + versão do
 * renderizador. Logos do preset entram pela versão (são empacotados); logos
 * próprios entram pelo caminho; arquivo de áudio pelo `assetId` (ou nome).
 */
export function bumperSpecHash(input: BumperSpec): string {
  const s = normalizeBumperSpec(input);
  const audio = s.audio.kind === 'synth' ? { kind: 'synth', preset: s.audio.preset } : s.audio.kind === 'file' ? { kind: 'file', id: s.audio.assetId ?? (s.audio.path ? path.basename(s.audio.path) : '') } : { kind: 'none' };
  const canon = {
    v: BUMPER_RENDERER_VERSION,
    brand: s.brand, style: s.style, variant: s.variant, durationSec: s.durationSec, tagline: s.tagline, wordmark: s.wordmark,
    placement: s.placement, aspect: s.aspect, audio,
    logo: s.variant === 'navy' ? (s.logoDark ?? '') : (s.logoLight ?? ''),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}


/* ------------------------------------------------------------------ */
/* Job de vinheta (media_jobs com `input.kind = 'bumper'`)              */
/* ------------------------------------------------------------------ */

/** Entrada do job: a especificação (sem caminhos; áudio de arquivo por `assetId`), as proporções e opções. */
export interface BumperJobInput {
  kind: 'bumper';
  spec: BumperSpec;
  /** padrão: só 16:9 */
  aspects?: BumperAspect[];
  /** nome curto na lista do estúdio */
  name?: string;
  /** marcar as saídas como vinheta padrão do workspace */
  setDefault?: boolean;
  /** ignora o reaproveitamento por hash (render de novo) */
  force?: boolean;
  /** preenchido pelo worker: asset por proporção */
  outputs?: Partial<Record<BumperAspect, { assetId: string; reused: boolean }>>;
}

export function isBumperJobInput(input: unknown): input is BumperJobInput {
  const i = input as { kind?: unknown; spec?: unknown } | null;
  return !!i && i.kind === 'bumper' && !!i.spec && typeof i.spec === 'object';
}

/** A vinheta é do workspace, não de um curso: `courseId` sentinela `ws:<workspaceId>`, `lessonId` fixo e `nodeId` = hash (dedupe de jobs abertos). */
export const BUMPER_JOB_LESSON_ID = 'bumper';
export function bumperJobCourseId(workspaceId: string): string {
  return `ws:${workspaceId}`;
}
