import { buildSceneLookPrompt, HEYGEN_PROMPT_MAX, lookIdempotencyKey, type CharacterLookGenerator, type ReferenceImage, type SceneLookAngle, type SceneLookPosition } from './heygen-looks';

/**
 * Instrutor NOVO (personagem fictício só por texto + 3 câmeras dentro de um estúdio com zonas).
 * Máquina de estados PURA quanto ao armazenamento: cada `advanceInstructor` dá UM passo
 * (cria o que falta ou consulta o que está gerando) e devolve o estado novo; quem chama grava.
 * Usada pela tela "Novo instrutor" (estado no modelo de instrutor da biblioteca) e pelo script
 * `apps/worker/src/scripts/novo-instrutor.ts` (estado no rascunho do curso).
 *
 * Retomar nunca paga de novo: cada geração usa Idempotency-Key estável (workspace + origem + prompt +
 * referência) e o generationId fica gravado na câmera antes de qualquer outro passo.
 * PAGO: 1 personagem + 3 câmeras = 4 visuais no HeyGen (créditos de API). Só chame com aprovação.
 */

/** visuais gerados por instrutor novo: personagem + esquerda + direita + 3/4 */
export const NEW_INSTRUCTOR_LOOKS = 4;

export type InstructorPronoun = 'she' | 'he' | 'they';

/** Câmera no formato de `CameraSchema` (@lms/course-schema), sem depender do pacote. */
export interface InstructorCamera {
  id: string;
  name: string;
  lookId: string;
  previewUrl?: string;
  nativeFraming: 'medium';
  angle: 'front' | 'left';
  status: 'ready' | 'generating' | 'failed';
  generationId?: string;
  generationPrompt?: string;
  sourceLookId?: string;
  generationError?: string;
  placement?: 'full_frame' | 'center';
  zone?: 'left' | 'right' | 'center';
}

export interface InstructorSpec {
  /** nome no letreiro (ex.: "Helena") */
  name: string;
  pronoun: InstructorPronoun;
  /** prompt completo do personagem (veja `buildCharacterPrompt`) */
  characterPrompt: string;
  /** rótulo curto do estúdio nos nomes das câmeras (ex.: "8") */
  studioLabel: string;
  /** descrição do cenário em inglês (`studio.sceneryPrompt`) */
  sceneryPrompt: string;
  /** prefixo das câmeras (padrão: nome sem acento) */
  camPrefix?: string;
}

export interface InstructorState {
  base?: InstructorCamera;
  cameras: InstructorCamera[];
}

/** nome sem acento, minúsculo, só letras e números ("Júlia" → "julia") */
export function instructorSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** número do estúdio a partir da chave (`estudio-jovem-8` → `8`); senão a própria chave */
export function studioLabelOf(studioKey: string): string {
  return /(\d+)$/.exec(studioKey)?.[1] ?? studioKey;
}

const POSITION_TEXT: Record<'esq' | 'dir' | '34', string> = { esq: 'à esquerda', dir: 'à direita', '34': '3/4' };

/** As 3 câmeras do estúdio com zonas (ids `cam_<prefixo><estúdio>_esq|_dir|_34`, o formato que os kits remapeiam). */
export function instructorCameraSpecs(spec: Pick<InstructorSpec, 'name' | 'studioLabel' | 'camPrefix'>): Array<{ id: string; name: string; angle: SceneLookAngle; position: SceneLookPosition; zone: 'left' | 'right' | 'center' }> {
  const prefix = spec.camPrefix ?? instructorSlug(spec.name);
  const S = spec.studioLabel;
  const cam = (suf: 'esq' | 'dir' | '34') => ({ id: `cam_${prefix}${S}_${suf}`.slice(0, 40), name: `Estúdio ${S} · ${spec.name} ${POSITION_TEXT[suf]}`.slice(0, 60) });
  return [
    { ...cam('esq'), angle: 'front', position: 'left_third', zone: 'left' },
    { ...cam('dir'), angle: 'front', position: 'right_third', zone: 'right' },
    { ...cam('34'), angle: 'three_quarter', position: 'center', zone: 'center' },
  ];
}

export function instructorBaseId(name: string): string {
  return `cam_${instructorSlug(name)}_base`.slice(0, 40);
}

export const CHARACTER_DESCRIPTION_MAX = 600;

/**
 * Prompt do personagem fictício: a descrição do autor (aparência, idade, roupa) entre as regras
 * fixas de enquadramento e de segurança (pessoa fictícia, sem texto, sem logos, rosto para lip-sync).
 */
export function buildCharacterPrompt(description: string): string {
  const desc = description.replace(/\s+/g, ' ').trim().slice(0, CHARACTER_DESCRIPTION_MAX);
  if (!desc) throw new Error('Descreva o personagem (aparência, idade, roupa).');
  const prompt = [
    'Photorealistic video presenter, a fictional person (not a real or famous person):',
    desc.endsWith('.') ? desc : `${desc}.`,
    'Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible, mouth closed.',
    'Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync.',
    'No text, no logos, no other people.',
  ].join(' ');
  return prompt.slice(0, HEYGEN_PROMPT_MAX);
}

export type AdvanceResult = {
  state: InstructorState;
  /** algo mudou e precisa ser gravado */
  changed: boolean;
  /** as 3 câmeras do estúdio estão prontas */
  done: boolean;
  /** passo atual, para mostrar na tela */
  step: 'character' | 'cameras' | 'done' | 'failed';
  error?: string;
  /** gerações pedidas ao provedor NESTE passo (as pagas) */
  started: string[];
  notes: string[];
};

/**
 * Um passo. Ordem: personagem (criar → esperar) → 3 câmeras do estúdio (criar todas → esperar).
 * Falha numa geração para o fluxo (`step: 'failed'`); `retryFailed` apaga a câmera que falhou para
 * pedir de novo (nova cobrança só se o provedor tiver recusado antes de cobrar; peça aprovação).
 */
export async function advanceInstructor(
  input: { spec: InstructorSpec; state: InstructorState; workspaceId: string; referenceImage: ReferenceImage; retryFailed?: boolean },
  gen: CharacterLookGenerator,
): Promise<AdvanceResult> {
  const { spec, workspaceId } = input;
  const state: InstructorState = structuredClone(input.state);
  const notes: string[] = [];
  const started: string[] = [];
  let changed = false;
  const out = (step: AdvanceResult['step'], error?: string): AdvanceResult => ({ state, changed, done: step === 'done', step, ...(error ? { error } : {}), started, notes });

  if (input.retryFailed) {
    if (state.base?.status === 'failed') { delete state.base; changed = true; }
    const before = state.cameras.length;
    state.cameras = state.cameras.filter((c) => c.status !== 'failed');
    if (state.cameras.length !== before) changed = true;
  }

  /** consulta uma câmera gerando; grava pronta/falha */
  const poll = async (cam: InstructorCamera): Promise<InstructorCamera> => {
    if (cam.status !== 'generating' || !cam.generationId) return cam;
    const r = await gen.getLookGeneration(cam.generationId);
    if (r.status === 'completed') {
      changed = true;
      if (r.supportedEngines?.length && !r.supportedEngines.includes('avatar_iv')) notes.push(`${cam.id}: o visual não aceita o motor avatar_iv (${r.supportedEngines.join(', ')})`);
      return { ...cam, status: 'ready', lookId: r.lookId ?? cam.generationId, ...(r.previewUrl ? { previewUrl: r.previewUrl } : {}) };
    }
    if (r.status === 'failed') {
      changed = true;
      return { ...cam, status: 'failed', generationError: (r.error ?? 'falha na geração').slice(0, 500) };
    }
    return cam;
  };

  // 1. personagem
  if (!state.base) {
    const baseName = `${spec.name} · base`.slice(0, 60);
    const idempotencyKey = lookIdempotencyKey(workspaceId, `novo_personagem:${spec.name}`, spec.characterPrompt);
    const { generationId } = await gen.createCharacterFromPrompt({ prompt: spec.characterPrompt, name: baseName, aspectRatio: '16:9', idempotencyKey });
    state.base = { id: instructorBaseId(spec.name), name: baseName, lookId: generationId, generationId, status: 'generating', nativeFraming: 'medium', angle: 'front', placement: 'center', generationPrompt: `Personagem novo (${spec.name}), só texto` };
    changed = true;
    started.push(generationId);
    return out('character');
  }
  state.base = await poll(state.base);
  if (state.base.status === 'failed') return out('failed', `Personagem: ${state.base.generationError ?? 'falha'}`);
  if (state.base.status !== 'ready') return out('character');

  // 2. câmeras no estúdio (todas pedidas de uma vez, a partir do personagem pronto)
  const base = state.base;
  for (const sc of instructorCameraSpecs(spec)) {
    if (state.cameras.some((c) => c.id === sc.id)) continue;
    const prompt = buildSceneLookPrompt({ angle: sc.angle, scenery: spec.sceneryPrompt, pronoun: spec.pronoun, position: sc.position });
    const idempotencyKey = lookIdempotencyKey(workspaceId, base.lookId, prompt, [input.referenceImage]);
    const { generationId } = await gen.generateLookFromPrompt({ sourceLookId: base.lookId, prompt, aspectRatio: '16:9', idempotencyKey, name: sc.name, referenceImages: [input.referenceImage] });
    state.cameras.push({ id: sc.id, name: sc.name, lookId: generationId, generationId, status: 'generating', zone: sc.zone, nativeFraming: 'medium', angle: sc.angle === 'three_quarter' ? 'left' : 'front', placement: 'full_frame', sourceLookId: base.lookId, generationPrompt: `Dentro do estúdio ${spec.studioLabel}, ${sc.name} (imagem de referência)` });
    changed = true;
    started.push(generationId);
  }
  if (started.length) return out('cameras');
  for (let i = 0; i < state.cameras.length; i++) state.cameras[i] = await poll(state.cameras[i]!);
  const failed = state.cameras.find((c) => c.status === 'failed');
  if (failed) return out('failed', `${failed.name}: ${failed.generationError ?? 'falha'}`);
  return out(state.cameras.every((c) => c.status === 'ready') && state.cameras.length === 3 ? 'done' : 'cameras');
}
