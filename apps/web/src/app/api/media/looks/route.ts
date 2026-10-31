import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, media } from '@lms/db';
import { buildCameraPrompt, buildSceneLookPrompt, CAMERA_ANGLES, CAMERA_EXTRA_MAX, CAMERA_FRAMINGS, HeyGenError, lookIdempotencyKey, type ReferenceImage, SCENE_LOOK_PRESETS, sceneLookAngleOf } from '@lms/media';
import { parseBody } from '@/server/http';
import { requireEditor } from '@/server/viewer';
import { errorResponse, getLooksProvider, LOOK_ID_RE, lookRateLimiter, looksError, referenceImageFromAsset, unavailable } from './_lib/looks';

const ASSET_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Duas formas de pedido:
 * - ângulo (como antes): `angle` + `framing` (+ `extra`);
 * - dentro do cenário: `sceneryAssetId` (imagem do workspace com `metadata.scenery`) + `preset`
 *   (`scene_three_quarter` | `scene_front` | `scene_close`); o cenário vai como `reference_images`.
 */
const BodySchema = z.object({
  sourceLookId: z.string().regex(LOOK_ID_RE, 'Visual de origem inválido'),
  angle: z.enum(CAMERA_ANGLES).optional(),
  framing: z.enum(CAMERA_FRAMINGS).optional(),
  extra: z.string().max(CAMERA_EXTRA_MAX).optional(),
  sceneryAssetId: z.string().regex(ASSET_ID_RE).optional(),
  preset: z.enum(SCENE_LOOK_PRESETS).optional(),
  pronoun: z.enum(['she', 'he', 'they']).optional(),
  confirm: z.boolean().default(false),
});

const ANGLE_PT: Record<(typeof CAMERA_ANGLES)[number], string> = { front: 'frontal', left: 'esquerda', right: 'direita', high: 'alto', low: 'baixo' };
const FRAMING_PT: Record<(typeof CAMERA_FRAMINGS)[number], string> = { wide: 'aberto', medium: 'médio', close: 'fechado', extreme_close: 'detalhe' };
const SCENE_PT: Record<(typeof SCENE_LOOK_PRESETS)[number], string> = { scene_three_quarter: '3/4', scene_front: 'de frente', scene_close: 'close' };

/**
 * Gera um novo visual (look) do apresentador com IA. Ação PAGA => duas etapas:
 * 1) sem `confirm: true`: devolve o prompt e a estimativa, sem chamar o provedor;
 * 2) com `confirm: true`: chama o HeyGen com Idempotency-Key (workspace + origem + prompt + referências).
 */
export async function POST(req: Request) {
  try {
    // ação paga: só quem pode editar cursos
    const viewer = await requireEditor();
    const body = await parseBody(req, BodySchema);
    const provider = getLooksProvider();
    if (provider.kind === 'unavailable') return unavailable();
    const simulated = provider.kind === 'simulated';

    let prompt: string;
    let name: string;
    let referenceImages: ReferenceImage[] = [];
    let placement: 'full_frame' | undefined;
    let sceneryName: string | undefined;
    if (body.sceneryAssetId || body.preset) {
      if (!body.sceneryAssetId || !body.preset) return errorResponse(400, 'VALIDATION', 'Informe o cenário (sceneryAssetId) e o preset (scene_three_quarter, scene_front ou scene_close).');
      const asset = await media.getAsset(getDb(), body.sceneryAssetId);
      const scenery = asset?.metadata?.scenery;
      if (!asset || asset.workspaceId !== viewer.workspace.id || asset.kind !== 'image' || !scenery) return errorResponse(404, 'NOT_FOUND', 'Cenário não encontrado neste workspace (a imagem precisa estar no grupo "Cenários").');
      sceneryName = scenery.name ?? asset.originalName ?? undefined;
      referenceImages = [await referenceImageFromAsset(asset)];
      prompt = buildSceneLookPrompt({ angle: sceneLookAngleOf(body.preset), scenery: sceneryName, pronoun: body.pronoun });
      name = `No cenário · ${SCENE_PT[body.preset]}`;
      placement = 'full_frame';
    } else {
      if (!body.angle || !body.framing) return errorResponse(400, 'VALIDATION', 'Informe o ângulo e o enquadramento, ou um cenário com preset.');
      prompt = buildCameraPrompt({ angle: body.angle, framing: body.framing, extra: body.extra });
      name = `Câmera IA (${ANGLE_PT[body.angle]}, ${FRAMING_PT[body.framing]})`;
    }

    if (body.confirm !== true) {
      return NextResponse.json({
        requiresConfirmation: true,
        simulated,
        estimate: {
          provider: 'heygen',
          note: simulated
            ? 'Modo de demonstração: nenhuma cobrança será feita.'
            : 'Custo cobrado em créditos HeyGen por geração; valor exato não documentado.',
        },
        prompt,
        ...(referenceImages.length ? { referenceImages, name, placement } : {}),
      });
    }

    const idempotencyKey = lookIdempotencyKey(viewer.workspace.id, body.sourceLookId, prompt, referenceImages);
    // o freio só vale para gerações pagas; a simulação é gratuita e determinística
    if (!simulated) {
      const slot = lookRateLimiter.take(viewer.workspace.id, idempotencyKey);
      if (!slot.ok) {
        return errorResponse(429, 'RATE_LIMIT', 'Limite de 6 novos ângulos por hora neste workspace. Tente novamente mais tarde.', { 'Retry-After': String(slot.retryAfterSeconds) }, { retryAfterSeconds: slot.retryAfterSeconds });
      }
    }
    try {
      const { generationId } = await provider.generator.generateLookFromPrompt({
        sourceLookId: body.sourceLookId,
        prompt,
        aspectRatio: '16:9',
        idempotencyKey,
        name,
        ...(referenceImages.length ? { referenceImages } : {}),
      });
      return NextResponse.json({ generationId, prompt, simulated, name, ...(placement ? { placement } : {}), ...(referenceImages.length ? { referenceImages } : {}) }, { status: 201 });
    } catch (e) {
      // recusa explícita (4xx) não é cobrada: devolve a vaga. Falha de rede/5xx: mantém (a cobrança é incerta).
      if (!simulated && e instanceof HeyGenError && e.status < 500) lookRateLimiter.release(viewer.workspace.id, idempotencyKey);
      throw e;
    }
  } catch (e) {
    return looksError(e);
  }
}
