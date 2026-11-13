/**
 * Refazer as câmeras de um instrutor já gerado (pulsos dentro do quadro, sem relógio nem pulseira).
 * Parte PURA do script `scripts/regerar-cameras-instrutor.ts`: argumentos, pedido de cada câmera, guarda de custo e
 * troca de câmeras no rascunho. Nada aqui chama provedor nem banco.
 */
import { buildSceneLookPrompt, HEYGEN_PROMPT_MAX, instructorCameraSpecs, instructorSlug, lookIdempotencyKey, type ReferenceImage, type SceneLookAngle, type SceneLookPosition } from '@lms/media';
import type { Camera, CourseDocument } from '@lms/course-schema';

/** custo combinado por imagem gerada (US$) e teto de uma rodada (US$ 5: 3 câmeras + até 2 refações) */
export const USD_PER_IMAGE = 1;
export const HARD_CAP_USD = 5;

/** trecho fixo dos pulsos: vai SEMPRE inteiro no pedido; se faltar espaço, encurta-se o texto do estúdio */
export const WRIST_TEXT = 'Medium-wide shot from mid-thigh up so both forearms, wrists and hands are fully inside the frame; bare forearms and bare wrists, no watch, no bracelet, no rings, no jewelry, nothing in the hands; hands loosely together in front of the waist.';

export const CAMERA_KEYS = ['esq', 'dir', '34'] as const;
export type CameraKey = (typeof CAMERA_KEYS)[number];

export interface RegenArgs {
  presenter: string;
  cameras: CameraKey[];
  sufixo: string;
  confirmar: boolean;
  aplicar: boolean;
  maxUsd: number | undefined;
  out: string;
  course?: string;
  deArquivo?: string;
  kit?: string;
  workspace?: string;
}

function die(msg: string): never {
  throw new Error(msg);
}

export function parseArgs(argv: string[]): RegenArgs {
  const flags = new Set(['--seco', '--confirmar', '--aplicar']);
  const vals = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (flags.has(a)) { bools.add(a); continue; }
    if (!a.startsWith('--')) die(`argumento inesperado: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) die(`faltou o valor de ${a}`);
    vals.set(a, v);
  }
  const known = new Set(['--presenter', '--cameras', '--sufixo', '--max-usd', '--out', '--course', '--de-arquivo', '--kit', '--workspace']);
  for (const k of vals.keys()) if (!known.has(k)) die(`opção desconhecida: ${k}`);
  if (bools.has('--seco') && bools.has('--confirmar')) die('use --seco OU --confirmar, não os dois');
  const sufixo = vals.get('--sufixo') ?? '';
  if (!/^[a-z0-9]{1,6}$/.test(sufixo)) die('--sufixo é obrigatório: 1 a 6 letras minúsculas/números (ex.: v2)');
  const camsRaw = (vals.get('--cameras') ?? 'esq,dir,34').split(',').map((s) => s.trim()).filter(Boolean);
  const cameras = [...new Set(camsRaw)] as CameraKey[];
  if (!cameras.length || cameras.some((c) => !(CAMERA_KEYS as readonly string[]).includes(c))) die(`--cameras: use ${CAMERA_KEYS.join(',')}`);
  const maxRaw = vals.get('--max-usd');
  const maxUsd = maxRaw === undefined ? undefined : Number(maxRaw);
  const presenter = vals.get('--presenter') ?? '';
  const aplicar = bools.has('--aplicar');
  if (!aplicar && !presenter) die('--presenter é obrigatório (ex.: instrutor-thiago)');
  if (aplicar && (!vals.get('--course') || !vals.get('--de-arquivo'))) die('--aplicar exige --course <id> e --de-arquivo <json>');
  const args: RegenArgs = {
    presenter,
    cameras,
    sufixo,
    confirmar: bools.has('--confirmar'),
    aplicar,
    maxUsd,
    out: vals.get('--out') ?? 'tmp/regerar-cameras',
  };
  for (const [k, f] of [['--course', 'course'], ['--de-arquivo', 'deArquivo'], ['--kit', 'kit'], ['--workspace', 'workspace']] as const) {
    const v = vals.get(k);
    if (v) (args as unknown as Record<string, unknown>)[f] = v;
  }
  return args;
}

/** Plano das câmeras: id antigo (`cam_thiago8_esq`) e novo (`cam_thiago8v2_esq`), mesma zona/ângulo/posição. */
export interface CameraPlanItem {
  key: CameraKey;
  oldId: string;
  id: string;
  name: string;
  zone: 'left' | 'right' | 'center';
  angle: SceneLookAngle;
  position: SceneLookPosition;
}

export function planCameras(input: { name: string; studioLabel: string; sufixo: string; cameras: readonly CameraKey[]; camPrefix?: string }): CameraPlanItem[] {
  const prefix = input.camPrefix ?? instructorSlug(input.name);
  const oldSpecs = instructorCameraSpecs({ name: input.name, studioLabel: input.studioLabel, camPrefix: prefix });
  const newSpecs = instructorCameraSpecs({ name: input.name, studioLabel: `${input.studioLabel}${input.sufixo}`, camPrefix: prefix });
  return CAMERA_KEYS.flatMap((key, i) => {
    if (!input.cameras.includes(key)) return [];
    const o = oldSpecs[i]!;
    const n = newSpecs[i]!;
    return [{ key, oldId: o.id, id: n.id, name: n.name, zone: n.zone, angle: n.angle, position: n.position }];
  });
}

/**
 * Compactações do pedido de `buildSceneLookPrompt`, aplicadas em ordem só até caber: o pedido-base sozinho já tem
 * 850-960 caracteres e o trecho dos pulsos tem ~250 (limite 1.000). Mantêm identidade, estúdio, posição, luz,
 * rosto para o lip-sync e a regra do logo; o que sai é redundante.
 */
const COMPACTIONS: ReadonlyArray<readonly [string, string]> = [
  [", standing naturally in that environment, not in front of a flat backdrop.", ', not in front of a flat backdrop.'],
  ["Lit by the environment's practical lights, matching the reference image's light direction and color temperature.", "Lit by the set's practical lights, as in the reference image."],
  ['the presenter stands in the LEFT third of the frame; the right two thirds show the empty wall, kept clear for on-screen graphics.', 'the presenter stands in the LEFT third; the right two thirds stay empty wall for on-screen graphics.'],
  ['the presenter stands in the RIGHT third of the frame; the left two thirds show the empty wall, kept clear for on-screen graphics.', 'the presenter stands in the RIGHT third; the left two thirds stay empty wall for on-screen graphics.'],
  [', shallow depth of field with the environment softly out of focus behind', ', environment softly out of focus behind'],
];

/**
 * Pedido de uma câmera: o MESMO de `buildSceneLookPrompt` (ângulo, posição, estúdio) + o trecho dos pulsos.
 * Ajustes obrigatórios para não contradizer o trecho dos pulsos: o enquadramento "medium shot from the waist up" sai (o
 * trecho dos pulsos já diz "from mid-thigh up") e a frase "hands visible and relaxed" sai (as mãos ficam "loosely together in front of the waist").
 * Se passar de `HEYGEN_PROMPT_MAX`: compacta frases redundantes (`COMPACTIONS`) e depois encurta o texto do estúdio;
 * o trecho dos pulsos nunca é cortado.
 */
export function buildRegenPrompt(input: { angle: SceneLookAngle; position: SceneLookPosition; scenery: string; pronoun: 'she' | 'he' | 'they' }): { prompt: string; scenery: string; sceneryShortened: boolean; compacted: number } {
  const base = (scenery: string) =>
    buildSceneLookPrompt({ angle: input.angle, position: input.position, pronoun: input.pronoun, scenery })
      .replace(/, medium(?:-wide)? shot from the waist up/, '')
      .replace(/behind (he|she)\./, (_m, w: string) => `behind ${w === 'he' ? 'him' : 'her'}.`)
      .replace('Natural posture with hands visible and relaxed, mouth closed, looking at the camera.', 'Mouth closed, looking at the camera.');
  let scenery = input.scenery.replace(/\s+/g, ' ').trim();
  let compacted = 0;
  const make = () => {
    let b = base(scenery);
    let n = 0;
    for (const [from, to] of COMPACTIONS) {
      if (`${b} ${WRIST_TEXT}`.length <= HEYGEN_PROMPT_MAX) break;
      if (b.includes(from)) { b = b.replace(from, to); n++; }
    }
    compacted = n;
    return `${b} ${WRIST_TEXT}`;
  };
  let prompt = make();
  let shortened = false;
  while (prompt.length > HEYGEN_PROMPT_MAX) {
    const words = scenery.split(' ');
    if (words.length <= 3) die(`o pedido passa de ${HEYGEN_PROMPT_MAX} caracteres mesmo com o estúdio reduzido a 3 palavras (${prompt.length})`);
    scenery = words.slice(0, -1).join(' ').replace(/[,;:\s]+$/, '');
    shortened = true;
    prompt = make();
  }
  if (!prompt.endsWith(WRIST_TEXT)) die('o trecho dos pulsos não coube no pedido');
  return { prompt, scenery, sceneryShortened: shortened, compacted };
}

/** Idempotency-Key estável por (workspace, presenter, câmera, look-base, prompt, referência): rodar de novo não paga de novo. */
export function regenIdempotencyKey(input: { workspaceId: string; presenterKey: string; cameraId: string; baseLookId: string; prompt: string; referenceImage: ReferenceImage }): string {
  return lookIdempotencyKey(input.workspaceId, `regen:${input.presenterKey}:${input.cameraId}:${input.baseLookId}`, input.prompt, [input.referenceImage]);
}

/** Guarda de custo e de ambiente. Lança em português; nunca chama nada. */
export function checkSpend(input: { images: number; maxUsd: number | undefined; confirmar: boolean; env: Record<string, string | undefined> }): { usd: number } {
  const { images, maxUsd, confirmar, env } = input;
  if (maxUsd === undefined || !Number.isFinite(maxUsd) || maxUsd <= 0) die('--max-usd é obrigatório (número maior que zero)');
  if (maxUsd > HARD_CAP_USD) die(`--max-usd ${maxUsd} passa do teto aprovado de US$ ${HARD_CAP_USD}`);
  const usd = images * USD_PER_IMAGE;
  if (usd > maxUsd) die(`${images} imagem(ns) × US$ ${USD_PER_IMAGE} = US$ ${usd} passa do teto --max-usd ${maxUsd}; nada foi pedido`);
  if (confirmar && images > 0) {
    if (env.ALLOW_PAID_PROVIDERS !== '1') die('--confirmar exige ALLOW_PAID_PROVIDERS=1; nada foi pedido');
    if (!env.HEYGEN_API_KEY) die('--confirmar exige HEYGEN_API_KEY; nada foi pedido');
  }
  return { usd };
}

/** Resultado gravado em --out (uma entrada por câmera). */
export interface RegenCameraResult {
  key: CameraKey;
  id: string;
  oldId: string;
  name: string;
  zone: 'left' | 'right' | 'center';
  angle: SceneLookAngle;
  prompt: string;
  generationId?: string;
  lookId?: string;
  status: 'generating' | 'completed' | 'failed';
  error?: string;
  previewUrl?: string;
  previewAssetId?: string;
  previewPath?: string;
}
export interface RegenResultFile {
  version: 1;
  presenter: string;
  workspaceId: string;
  sufixo: string;
  baseLookId: string;
  studioKey: string;
  createdAt: string;
  cameras: RegenCameraResult[];
}

/** Câmera do rascunho/biblioteca (formato de `CameraSchema`) a partir do resultado pronto. */
export function cameraFromResult(r: RegenCameraResult, baseLookId: string): Camera {
  if (r.status !== 'completed' || !r.lookId) die(`a câmera ${r.id} não está pronta (${r.status})`);
  return {
    id: r.id,
    name: r.name,
    lookId: r.lookId,
    ...(r.previewUrl ? { previewUrl: r.previewUrl } : {}),
    nativeFraming: 'medium',
    angle: r.angle === 'three_quarter' ? 'left' : 'front',
    status: 'ready',
    ...(r.generationId ? { generationId: r.generationId } : {}),
    generationPrompt: `Dentro do estúdio, ${r.name} (pulsos no quadro, imagem de referência)`,
    sourceLookId: baseLookId,
    placement: 'full_frame',
    zone: r.zone,
  } as Camera;
}

const ZONE_ORDER = { center: 0, left: 1, right: 2 } as const;

/**
 * Troca nos planos da direção cada câmera antiga pela nova (mapa id → id; a mesma zona porque o par vem do mesmo
 * `key`). Devolve quantos planos mudaram. Pura sobre o documento recebido (mexe nele).
 */
export function swapDirectionCameras(doc: CourseDocument, map: ReadonlyMap<string, string>): number {
  let n = 0;
  for (const m of doc.modules) {
    for (const l of m.lessons) {
      for (const node of l.graph.nodes) {
        const shots = (node as { direction?: { shots?: Array<{ cameraId?: string }> } }).direction?.shots;
        if (!shots) continue;
        for (const s of shots) {
          const to = s.cameraId ? map.get(s.cameraId) : undefined;
          if (to) { s.cameraId = to; n++; }
        }
      }
    }
  }
  return n;
}

/**
 * Aplica o resultado ao rascunho (pura): câmeras novas prontas entram ANTES das antigas (a primeira de cada zona
 * vence nas zonas; as antigas ficam como volta atrás), a direção troca antigo → novo e, havendo a 3/4 nova, ela
 * vira o avatar principal. Câmeras ainda não prontas são ignoradas (listadas em `skipped`).
 */
export function applyResultToDocument(doc: CourseDocument, result: RegenResultFile): { document: CourseDocument; changes: string[]; skipped: string[] } {
  const next = structuredClone(doc) as CourseDocument;
  const pres = next.presentation!;
  const ready = result.cameras.filter((c) => c.status === 'completed' && c.lookId);
  const skipped = result.cameras.filter((c) => !(c.status === 'completed' && c.lookId)).map((c) => `${c.id} (${c.status})`);
  const changes: string[] = [];
  if (!ready.length) return { document: next, changes, skipped };
  const novas = ready.map((r) => cameraFromResult(r, result.baseLookId)).sort((a, b) => ZONE_ORDER[a.zone!] - ZONE_ORDER[b.zone!]);
  const ids = new Set(novas.map((c) => c.id));
  pres.cameras = [...novas, ...(pres.cameras ?? []).filter((c) => !ids.has(c.id))];
  changes.push(`câmeras novas: ${novas.map((c) => c.id).join(', ')}`);
  const map = new Map(ready.map((r) => [r.oldId, r.id]));
  const swapped = swapDirectionCameras(next, map);
  if (swapped) changes.push(`direção: ${swapped} plano(s) trocados para as câmeras novas (mesma zona)`);
  const main = novas.find((c) => c.zone === 'center');
  if (main) {
    pres.avatarId = main.lookId;
    if (main.previewUrl) pres.avatarPreviewUrl = main.previewUrl;
    changes.push(`avatar principal: ${main.id}`);
  }
  return { document: next, changes, skipped };
}

/** Câmeras do kit do instrutor na biblioteca: as novas entram no lugar das antigas da MESMA zona (as demais ficam). */
export function replaceKitCameras(current: readonly Camera[], novas: readonly Camera[]): Camera[] {
  const zones = new Set(novas.map((c) => c.zone));
  const ids = new Set(novas.map((c) => c.id));
  const kept = current.filter((c) => !ids.has(c.id) && !(c.zone && zones.has(c.zone)));
  return [...novas, ...kept].sort((a, b) => ZONE_ORDER[a.zone ?? 'center'] - ZONE_ORDER[b.zone ?? 'center']);
}
