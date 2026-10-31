import { z } from 'zod';
import { getDb, media } from '@lms/db';
import { BRAND_CARD_PRESETS, BUMPER_ASPECTS, BUMPER_AUDIO_PRESETS, BUMPER_DURATION, BUMPER_JOB_LESSON_ID, BUMPER_PLACEMENTS, BUMPER_RENDERER_VERSION, BUMPER_STYLES, BUMPER_TAGLINE_MAX, BUMPER_VARIANTS, bumperJobCourseId, bumperSpecHash, type BumperAspect, type BumperJobInput, type BumperSpec } from '@lms/media';
import { getBrand } from '@/config/brand';

/**
 * Vinheta da marca (estúdio): pedido de render (gratuito), listagem dos
 * assets do workspace e resolução da vinheta padrão para o player.
 */

const ASSET_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export const BumperAudioRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('synth'), preset: z.enum(BUMPER_AUDIO_PRESETS) }),
  z.object({ kind: z.literal('file'), assetId: z.string().regex(ASSET_ID_RE) }),
  z.object({ kind: z.literal('none') }),
]);

export const BumperRequestSchema = z.object({
  style: z.enum(BUMPER_STYLES),
  variant: z.enum(BUMPER_VARIANTS),
  durationSec: z.number().min(BUMPER_DURATION.min).max(BUMPER_DURATION.max),
  tagline: z.string().max(BUMPER_TAGLINE_MAX).optional(),
  wordmark: z.string().max(24).optional(),
  audio: BumperAudioRequestSchema.default({ kind: 'synth', preset: 'warm' }),
  placement: z.enum(BUMPER_PLACEMENTS).default('outro'),
  /** proporções a produzir juntas (padrão: 16:9 e 9:16) */
  aspects: z.array(z.enum(BUMPER_ASPECTS)).min(1).default(['16:9', '9:16']),
  name: z.string().max(60).optional(),
  setDefault: z.boolean().default(false),
  force: z.boolean().default(false),
});
export type BumperRequest = z.infer<typeof BumperRequestSchema>;

/** Especificação do render a partir do pedido do estúdio (o preset de marca vem do workspace). */
export function bumperSpecFromRequest(body: BumperRequest, workspaceId?: string): BumperSpec {
  const brand = getBrand(workspaceId);
  return {
    brand: brand.id,
    style: body.style,
    variant: body.variant,
    durationSec: body.durationSec,
    ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
    ...(body.wordmark !== undefined ? { wordmark: body.wordmark } : {}),
    audio: body.audio.kind === 'file' ? { kind: 'file', assetId: body.audio.assetId } : body.audio,
    placement: body.placement,
  };
}

/** Entrada do job de vinheta + identidade (courseId sentinela do workspace, nodeId = hash 16:9). */
export function bumperJobFromRequest(body: BumperRequest, workspaceId: string): { input: BumperJobInput; courseId: string; lessonId: string; nodeId: string; sceneHash: string } {
  const spec = bumperSpecFromRequest(body, workspaceId);
  const sceneHash = bumperSpecHash({ ...spec, aspect: '16:9' });
  const input: BumperJobInput = { kind: 'bumper', spec, aspects: body.aspects, ...(body.name ? { name: body.name } : {}), ...(body.setDefault ? { setDefault: true } : {}), ...(body.force ? { force: true } : {}) };
  return { input, courseId: bumperJobCourseId(workspaceId), lessonId: BUMPER_JOB_LESSON_ID, nodeId: sceneHash.slice(0, 32), sceneHash };
}

export const BUMPER_PROVIDER = 'local-bumper';
export { BUMPER_RENDERER_VERSION };

export interface PublicBumper {
  id: string;
  url: string;
  aspect: BumperAspect;
  durationSec: number;
  hash: string;
  name?: string;
  default: boolean;
  verticalAssetId?: string;
  verticalUrl?: string;
  spec: Record<string, unknown>;
  createdAt: Date;
}

export function publicBumper(a: media.AssetRow): PublicBumper | null {
  const b = a.metadata?.bumper;
  if (!b) return null;
  return {
    id: a.id,
    url: `/api/assets/${a.id}`,
    aspect: b.aspect,
    durationSec: b.durationSec,
    hash: b.hash,
    ...(b.name ? { name: b.name } : {}),
    default: b.default === true,
    ...(b.verticalAssetId ? { verticalAssetId: b.verticalAssetId, verticalUrl: `/api/assets/${b.verticalAssetId}` } : {}),
    spec: b.spec,
    createdAt: a.createdAt,
  };
}

/** Vinheta padrão do workspace (16:9 e 9:16) para o contexto do player; null quando não há. */
export async function workspaceDefaultBumper(workspaceId: string): Promise<{ assetId: string; assetIdVertical?: string; durationSec: number } | null> {
  const db = getDb();
  const main = await media.findDefaultBumper(db, workspaceId, '16:9');
  if (!main?.metadata?.bumper) return null;
  const vertical = main.metadata.bumper.verticalAssetId ? await media.getAsset(db, main.metadata.bumper.verticalAssetId) : await media.findDefaultBumper(db, workspaceId, '9:16');
  return { assetId: main.id, ...(vertical && vertical.workspaceId === workspaceId ? { assetIdVertical: vertical.id } : {}), durationSec: main.metadata.bumper.durationSec };
}

/** Cor de fundo da vinheta pelo preset/variante gravados no asset (`metadata.bumper.spec`). */
function bumperBg(asset: media.AssetRow | null): string | undefined {
  const spec = asset?.metadata?.bumper?.spec as { brand?: string; variant?: string } | undefined;
  if (!spec) return undefined;
  const brand = spec.brand === 'lms' ? 'lms' : 'dnawork';
  return BRAND_CARD_PRESETS[brand][spec.variant === 'navy' ? 'navy' : 'light'].bg;
}

/**
 * Vinheta padrão + logos da marca, no formato que `buildPlatformContext` recebe
 * (`defaultBumper`). `courseAssetId` = vinheta própria do curso, quando houver
 * (só para conhecer a cor de fundo dela).
 */
export async function platformDefaultBumper(workspaceId: string, courseAssetId?: string) {
  const db = getDb();
  const d = await workspaceDefaultBumper(workspaceId);
  const own = courseAssetId ? await media.getAsset(db, courseAssetId) : null;
  const bg = bumperBg(own && own.workspaceId === workspaceId ? own : d ? await media.getAsset(db, d.assetId) : null);
  if (!d && !own) return null;
  const brand = getBrand(workspaceId);
  return { ...(d ?? { assetId: '' }), ...(brand.logoLight ? { logoLight: brand.logoLight } : {}), ...(brand.logoDark ? { logoDark: brand.logoDark } : {}), brandName: brand.name, ...(bg ? { bg } : {}) };
}
