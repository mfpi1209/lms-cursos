import type { SlideVariant } from './compose/slides';

/**
 * Tokens do cartão de marca (sem satori/resvg: o app web importa daqui via
 * `@lms/media`; o compositor reexporta em `@lms/media/compose`).
 * A marca do workspace vive no app web
 * (`config/brand.ts`, `getBrand()`); o worker não a carrega, então os presets
 * equivalentes ficam aqui, escolhidos por `PLATFORM_BRAND` (mesma variável do
 * web; padrão DNA Work). Trocar o preset não entra no hash da cena.
 */
export interface BrandCardTokens {
  /** fundo do cartão */
  bg: string;
  /** texto principal */
  fg: string;
  /** texto secundário (tópicos sem negrito) */
  muted: string;
  /** acento (palavras-chave, barra do título, formas) */
  accent: string;
  /** formas de marca ao fundo (traços arredondados), em rgba */
  shape: string;
  /** marca em texto do preset (os cartões não a desenham mais: assinam com o logo como marca d'água) */
  wordmark: string;
}

export type BrandCardPresetId = 'dnawork' | 'lms';

export const BRAND_CARD_PRESETS: Record<BrandCardPresetId, Record<SlideVariant, BrandCardTokens>> = {
  dnawork: {
    light: { bg: '#F4F7FA', fg: '#1D1E4C', muted: '#3F4270', accent: '#FF7A08', shape: 'rgba(29,30,76,0.07)', wordmark: 'DNA WORK' },
    navy: { bg: '#1D1E4C', fg: '#FFFFFF', muted: 'rgba(255,255,255,0.78)', accent: '#FF7A08', shape: 'rgba(255,255,255,0.08)', wordmark: 'DNA WORK' },
  },
  lms: {
    light: { bg: '#F4F6F9', fg: '#0B1424', muted: '#334155', accent: '#3F5A00', shape: 'rgba(11,20,36,0.07)', wordmark: '' },
    navy: { bg: '#0B1424', fg: '#FFFFFF', muted: 'rgba(255,255,255,0.78)', accent: '#C8F03C', shape: 'rgba(255,255,255,0.08)', wordmark: '' },
  },
};

/** Nome da marca por preset (letreiro "Marina · Sua orientadora · DNA Work"); `lms` usa NEXT_PUBLIC_BRAND_NAME (mesma variável do web). */
export function platformBrandName(preset: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return preset === 'lms' ? (env.NEXT_PUBLIC_BRAND_NAME ?? '').trim() : 'DNA Work';
}

/** Tokens do cartão para o preset (`PLATFORM_BRAND`, padrão dnawork) e a variante. */
export function brandCardTokens(preset: string | undefined | null, variant: SlideVariant): BrandCardTokens {
  const id: BrandCardPresetId = preset === 'lms' ? 'lms' : 'dnawork';
  return BRAND_CARD_PRESETS[id][variant];
}


/* ------------------------------------------------------------------ */
/* Marca d'água (logo) nos vídeos montados                              */
/* ------------------------------------------------------------------ */

/** Presets com logo empacotado (`packages/media/assets/brand/<preset>/`); sem logo = sem marca d'água. */
export const BRAND_PRESET_HAS_LOGO: Record<BrandCardPresetId, boolean> = { dnawork: true, lms: false };

export type WatermarkCorner = 'bottom-right' | 'bottom-left';

/** Marca d'água resolvida (o que vai em `job.input.watermark` e no hash da cena). */
export interface WatermarkSpec {
  brand: BrandCardPresetId;
  position: WatermarkCorner;
  /** opacidade nos planos do apresentador; cartões/slides usam +0,15 (máx. 1) */
  opacity: number;
}

export const WATERMARK_DEFAULT_OPACITY = 0.7;

/**
 * Marca d'água efetiva a partir de `branding.watermark` do curso e do preset
 * da plataforma (`PLATFORM_BRAND`, padrão dnawork). Ausente/`enabled`
 * indefinido = ligada quando o preset tem logo; preset sem logo = null.
 */
export function resolveWatermark(cfg: { enabled?: boolean | null; position?: string | null; opacity?: number | null } | null | undefined, preset: string | null | undefined): WatermarkSpec | null {
  const brand: BrandCardPresetId = preset === 'lms' ? 'lms' : 'dnawork';
  if (!BRAND_PRESET_HAS_LOGO[brand]) return null;
  if (cfg?.enabled === false) return null;
  const position: WatermarkCorner = cfg?.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';
  const o = typeof cfg?.opacity === 'number' && Number.isFinite(cfg.opacity) ? Math.min(1, Math.max(0.3, cfg.opacity)) : WATERMARK_DEFAULT_OPACITY;
  return { brand, position, opacity: Number(o.toFixed(2)) };
}
