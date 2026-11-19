/**
 * Capa própria de um curso: o MESMO instrutor (mesmo rosto) com OUTRA roupa e OUTRA pose, no estúdio dele, em quadro 16:9.
 * Parte PURA do script `scripts/capa-curso.ts`: argumentos, pedido (prompt), chave de idempotência, guarda de custo e
 * leitura do resultado para `--aplicar`. Nada aqui chama provedor nem banco.
 */
import { HEYGEN_PROMPT_MAX, lookIdempotencyKey, type ReferenceImage } from '@lms/media';
import { HARD_CAP_USD, USD_PER_IMAGE, checkSpend as checkRegenSpend } from './regerar-cameras';

/** trecho fixo dos pulsos: vai SEMPRE inteiro no pedido (as mãos podem segurar o objeto da pose, mas sem acessórios) */
export const COVER_WRIST_TEXT = 'Both forearms, wrists and hands fully inside the frame; bare wrists, no watch, no bracelet, no rings, no jewelry.';

export { HARD_CAP_USD, USD_PER_IMAGE };

export type CoverSide = 'esq' | 'dir';

export interface CoverArgs {
  course: string;
  roupa: string;
  pose: string;
  lado: CoverSide;
  sufixo: string;
  confirmar: boolean;
  aplicar: boolean;
  maxUsd: number | undefined;
  out: string;
  presenter?: string;
  deArquivo?: string;
}

function die(msg: string): never {
  throw new Error(msg);
}

export function parseArgs(argv: string[]): CoverArgs {
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
  const known = new Set(['--course', '--roupa', '--pose', '--lado', '--sufixo', '--max-usd', '--out', '--de-arquivo', '--presenter']);
  for (const k of vals.keys()) if (!known.has(k)) die(`opção desconhecida: ${k}`);
  if (bools.has('--seco') && bools.has('--confirmar')) die('use --seco OU --confirmar, não os dois');
  const aplicar = bools.has('--aplicar');
  if (aplicar && (bools.has('--seco') || bools.has('--confirmar'))) die('--aplicar não combina com --seco/--confirmar');
  const course = vals.get('--course') ?? '';
  if (!course) die('--course <id> é obrigatório');
  const sufixo = vals.get('--sufixo') ?? 'v1';
  if (!/^[a-z0-9]{1,6}$/.test(sufixo)) die('--sufixo: 1 a 6 letras minúsculas/números (ex.: v1)');
  const lado = (vals.get('--lado') ?? 'esq') as CoverSide;
  if (lado !== 'esq' && lado !== 'dir') die('--lado: use esq ou dir (lado em que o instrutor fica)');
  const roupa = (vals.get('--roupa') ?? '').replace(/\s+/g, ' ').trim();
  const pose = (vals.get('--pose') ?? '').replace(/\s+/g, ' ').trim();
  if (aplicar) {
    if (!vals.get('--de-arquivo')) die('--aplicar exige --course <id> e --de-arquivo <json>');
  } else {
    if (!roupa) die('--roupa "<descrição>" é obrigatório');
    if (!pose) die('--pose "<descrição>" é obrigatório');
  }
  const maxRaw = vals.get('--max-usd');
  const args: CoverArgs = {
    course,
    roupa,
    pose,
    lado,
    sufixo,
    confirmar: bools.has('--confirmar'),
    aplicar,
    maxUsd: maxRaw === undefined ? undefined : Number(maxRaw),
    out: vals.get('--out') ?? 'tmp/capas-cursos',
  };
  const presenter = vals.get('--presenter');
  if (presenter) args.presenter = presenter;
  const de = vals.get('--de-arquivo');
  if (de) args.deArquivo = de;
  return args;
}

/**
 * Pedido da capa (inglês, o provedor rende melhor). Mesma pessoa; roupa e pose novas; estúdio da imagem de referência;
 * enquadramento de capa 16:9 com o instrutor num terço e o resto livre para o título; pulsos visíveis, sem acessórios.
 * Se passar de `HEYGEN_PROMPT_MAX` encurta só o texto do estúdio (roupa, pose e pulsos nunca são cortados).
 */
export function buildCoverPrompt(input: { roupa: string; pose: string; lado: CoverSide; scenery?: string }): { prompt: string; sceneryShortened: boolean } {
  const roupa = input.roupa.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  const pose = input.pose.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  if (!roupa || !pose) die('roupa e pose são obrigatórias');
  const third = input.lado === 'esq' ? 'LEFT' : 'RIGHT';
  const other = input.lado === 'esq' ? 'right' : 'left';
  let scenery = (input.scenery ?? '').replace(/\s+/g, ' ').trim();
  const make = () =>
    [
      `Same person, same face, identity, hairstyle and skin tone as the source look (keep glasses only if the source has them), but wearing a different outfit: ${roupa}.`,
      `Pose: ${pose}.`,
      `Placed INSIDE the setting shown in the reference image${scenery ? ` (${scenery})` : ''}, standing naturally there, studio lights as in the reference.`,
      `Cover framing 16:9, medium shot from mid-thigh up at eye level, friendly look straight at the camera, mouth closed; the presenter stands in the ${third} third and the ${other} two thirds stay empty wall for the course title.`,
      'Photorealistic. Keep the set, incl. the small wall logo; no new text, logos or people.',
      COVER_WRIST_TEXT,
    ].join(' ');
  let prompt = make();
  let shortened = false;
  while (prompt.length > HEYGEN_PROMPT_MAX) {
    const words = scenery.split(' ').filter(Boolean);
    if (words.length <= 3) die(`o pedido passa de ${HEYGEN_PROMPT_MAX} caracteres (${prompt.length}); encurte --roupa/--pose`);
    scenery = words.slice(0, -1).join(' ').replace(/[,;:\s]+$/, '');
    shortened = true;
    prompt = make();
  }
  return { prompt, sceneryShortened: shortened };
}

/** Idempotency-Key estável por (workspace, curso, look-base, prompt, referência): rodar de novo não paga de novo. */
export function coverIdempotencyKey(input: { workspaceId: string; courseId: string; sufixo: string; baseLookId: string; prompt: string; referenceImage: ReferenceImage }): string {
  return lookIdempotencyKey(input.workspaceId, `capa:${input.courseId}:${input.sufixo}:${input.baseLookId}`, input.prompt, [input.referenceImage]);
}

/** Guarda de custo e de ambiente (mesmas regras das câmeras; 1 imagem = US$ 1). */
export function checkCoverSpend(input: { images: number; maxUsd: number | undefined; confirmar: boolean; env: Record<string, string | undefined> }): { usd: number } {
  return checkRegenSpend(input);
}

/** Resultado gravado em --out (uma capa por arquivo). */
export interface CoverResultFile {
  version: 1;
  courseId: string;
  workspaceId: string;
  presenter: string;
  sufixo: string;
  baseLookId: string;
  studioKey: string;
  roupa: string;
  pose: string;
  lado: CoverSide;
  prompt: string;
  createdAt: string;
  generationId?: string;
  status: 'generating' | 'completed' | 'failed';
  error?: string;
  lookId?: string;
  previewUrl?: string;
  previewAssetId?: string;
  previewPath?: string;
}

/** `--aplicar` (puro): valida o resultado contra o curso e devolve o asset que vira `courses.poster_asset_id`. */
export function posterFromResult(result: CoverResultFile, course: { id: string; workspaceId: string }): string {
  if (!result || result.version !== 1 || typeof result.courseId !== 'string') die('arquivo de resultado inválido');
  if (result.courseId !== course.id) die(`o arquivo é do curso ${result.courseId}, não de ${course.id}`);
  if (result.workspaceId !== course.workspaceId) die('o curso é de outro workspace que o da capa');
  if (result.status !== 'completed') die(`a capa não está pronta (${result.status}); rode --confirmar de novo para continuar`);
  if (!result.previewAssetId) die('o resultado não tem a imagem guardada (previewAssetId)');
  return result.previewAssetId;
}
