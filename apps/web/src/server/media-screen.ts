import { DomainError } from '@lms/db';
import { sceneUsesScreenRecording, type ScreenRecording } from '@lms/course-schema';
import { ELEVENLABS_ADAPTER_VERSION, estimateMediaCostUsd, estimateNarrationSeconds, resolveWatermark, sceneHashSync, type MediaProviderConfig } from '@lms/media';
import type { ResolvedScene, SceneEstimate, SceneProductionRequest } from './media';

/** Versão do montador de gravação de tela (entra no hash: mudar a regra de montagem refaz o vídeo). */
export const SCREEN_PIPELINE_VERSION = 'screen-1';

/**
 * Gravações da cena prontas para produzir: todas precisam de arquivo enviado (`assetId`), senão a cena não é
 * montável ("falta mídia: <arquivo>") — nunca monta parcial.
 */
export function screenRecordingsReady(recordings: readonly ScreenRecording[]): Array<{ fileName: string; assetId: string }> {
  const missing = recordings.find((r) => !r.assetId);
  if (missing) throw new DomainError('VALIDATION', `falta mídia: ${missing.fileName}`);
  return recordings.map((r) => ({ fileName: r.fileName, assetId: r.assetId! }));
}

/**
 * Plano de geração de uma cena de GRAVAÇÃO DE TELA: só a narração em voz (ElevenLabs, voz da instrutora) + montagem
 * local. NUNCA contém avatar: sem `avatarId`, sem câmera, sem direção, custo de avatar zero. Passa pela mesma
 * cotação/aprovação das outras cenas — nada é disparado daqui.
 */
export function resolveScreenScene(
  node: { id: string; title?: string; screenRecordings?: ScreenRecording[] },
  ctx: { lessonId: string; lessonTitle: string; body: SceneProductionRequest; script: string; cfg: MediaProviderConfig; env: NodeJS.ProcessEnv; watermarkBranding?: Parameters<typeof resolveWatermark>[0] },
): ResolvedScene {
  if (!sceneUsesScreenRecording(node)) throw new DomainError('VALIDATION', 'A cena não tem gravação de tela');
  const { body, script, cfg } = ctx;
  const recordings = screenRecordingsReady(node.screenRecordings!);
  if (body.voiceProvider !== 'elevenlabs') throw new DomainError('VALIDATION', 'Cena com gravação de tela precisa da voz da instrutora no ElevenLabs; troque a voz da apresentação');
  if (!body.voiceId) throw new DomainError('VALIDATION', 'Escolha a voz da instrutora antes de gerar a narração desta cena');
  const adapterVersion = `${ELEVENLABS_ADAPTER_VERSION}+${SCREEN_PIPELINE_VERSION}`;
  const watermark = resolveWatermark(ctx.watermarkBranding, ctx.env.PLATFORM_BRAND);
  const params = { elevenLabsModelId: cfg.elevenLabsModelId, elevenLabsStability: cfg.elevenLabsStability };
  const sceneHash = sceneHashSync({
    script, avatarId: '', voiceProvider: cfg.simulation ? 'simulated' : body.voiceProvider, voiceId: body.voiceId,
    params: { ...params, screen: recordings, ...(watermark ? { watermark } : {}) }, adapterVersion,
  });
  const narrationSeconds = estimateNarrationSeconds(script);
  const estimate: SceneEstimate = {
    characters: script.length,
    narrationSeconds,
    elevenLabsCredits: script.length,
    estimatedUsd: estimateMediaCostUsd({ elevenLabsChars: script.length, heygenSeconds: 0 }, undefined),
    cinematicShots: 0,
    cinematicSeconds: 0,
    note: 'Gravação de tela: só a narração em voz é cobrada (ElevenLabs); a montagem é local, com a tela cheia. Custo ESTIMADO pela tabela de preços (MEDIA_PRICES_JSON).',
  };
  return {
    lessonId: ctx.lessonId, lessonTitle: ctx.lessonTitle, nodeId: node.id, title: node.title ?? node.id, script, sceneHash, adapterVersion, estimate,
    jobInput: { kind: 'screen', script, voiceProvider: body.voiceProvider, voiceId: body.voiceId, params, screen: { recordings }, estimate, ...(watermark ? { watermark } : {}) },
  };
}
