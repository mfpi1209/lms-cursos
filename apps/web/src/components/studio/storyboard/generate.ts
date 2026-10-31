import type { Presentation } from '@lms/course-schema';
import { api } from '@/lib/api';
import { humanName, presenterDisplayName } from '@/components/studio/wizard/wizard-state';
import type { MediaJob } from './use-media-jobs';

export const SCRIPT_MAX = 5000;

export interface GenerateResult {
  reused: boolean;
  job: MediaJob;
  /** remontagem sem custo (trocar o fundo sem gerar de novo) */
  recompose?: boolean;
}

/** Disponibilidade de "Trocar o fundo sem custo" para uma cena (GET …/media-jobs/recompose). */
export interface RecomposeAvailability {
  available: boolean;
  upToDate?: boolean;
  sourceJobId?: string;
  reason?: string;
}

/** O que falta na apresentação do curso para gerar vídeo; null quando está tudo pronto. */
export function presentationBlocker(p: Presentation): string | null {
  if (!p.avatarId) return 'Escolha um apresentador em Apresentação para gerar vídeos.';
  return null;
}

/** Descrição curta das escolhas da apresentação, para a confirmação. */
export function presentationSummary(p: Presentation): string {
  // nome legível (nunca o id técnico do provedor)
  const parts = [p.avatarName ? `Apresentador: ${presenterDisplayName(p)}` : 'Apresentador escolhido'];
  if (p.voiceName) parts.push(`Voz: ${humanName(p.voiceName).label}`);
  else parts.push(p.voiceProvider === 'elevenlabs' ? 'Voz do ElevenLabs' : 'Voz padrão do apresentador');
  parts.push(`Formato ${p.aspectRatio}`);
  return parts.join(' · ');
}

/**
 * Enfileira (ou reaproveita) a geração de vídeo de UMA cena usando os padrões da
 * apresentação do curso. Ação paga: só chamar após confirmação explícita.
 *
 * `narration` é a fala escrita para o apresentador e vai como `script`. Sem
 * fala, `script` é omitido e o servidor usa o texto da cena salvo no rascunho.
 * `script` (legado) força um roteiro explícito quando não há `narration`.
 */
export async function requestSceneVideo(args: { courseId: string; lessonId: string; nodeId: string; narration?: string; script?: string; presentation: Presentation }): Promise<GenerateResult> {
  const p = args.presentation;
  const narration = (args.narration?.trim() || args.script?.trim()) ?? '';
  const body: Record<string, unknown> = {
    lessonId: args.lessonId,
    nodeId: args.nodeId,
    avatarId: p.avatarId,
    voiceProvider: p.voiceProvider ?? 'heygen',
    voiceId: p.voiceId ?? null,
    aspectRatio: p.aspectRatio,
    confirmPaid: true,
  };
  if (narration) body.script = narration.slice(0, SCRIPT_MAX);
  Object.assign(body, backgroundBody(p));
  return api<GenerateResult>(`/api/courses/${args.courseId}/media-jobs`, { json: body });
}

/** Fundo e cenário da apresentação como campos do pedido (faixa do balcão, enquadramento, desfoque, cor da apresentadora). */
export function backgroundBody(p: Presentation): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (p.background.type === 'color') body.backgroundColor = p.background.value;
  else {
    body.backgroundAssetId = p.background.assetId;
    if (p.background.foregroundFrom !== undefined) body.foregroundFrom = p.background.foregroundFrom;
    if (p.background.frame) body.backgroundFrame = p.background.frame;
    if (p.background.blur === false) body.backgroundBlur = false;
  }
  if (p.presenterGrade && p.presenterGrade !== 'none') body.presenterGrade = p.presenterGrade;
  return body;
}

/**
 * "Trocar o fundo sem gerar de novo": remonta o vídeo transparente já pago desta
 * fala sobre o fundo/posição ATUAIS da apresentação. Nenhum provedor, custo 0 —
 * por isso não é ação paga (sem `confirmPaid`).
 */
export async function requestSceneRecompose(args: { courseId: string; lessonId: string; nodeId: string; narration?: string; script?: string; presentation: Presentation }): Promise<GenerateResult> {
  const p = args.presentation;
  const narration = (args.narration?.trim() || args.script?.trim()) ?? '';
  const body: Record<string, unknown> = {
    lessonId: args.lessonId, nodeId: args.nodeId, avatarId: p.avatarId, voiceProvider: p.voiceProvider ?? 'heygen', voiceId: p.voiceId ?? null, aspectRatio: p.aspectRatio,
    recompose: true,
    ...backgroundBody(p),
  };
  if (narration) body.script = narration.slice(0, SCRIPT_MAX);
  return api<GenerateResult>(`/api/courses/${args.courseId}/media-jobs`, { json: body });
}

export async function fetchRecomposeAvailability(courseId: string, lessonId: string, nodeId: string): Promise<RecomposeAvailability> {
  return api<RecomposeAvailability>(`/api/courses/${courseId}/media-jobs/recompose?lessonId=${encodeURIComponent(lessonId)}&nodeId=${encodeURIComponent(nodeId)}`);
}
