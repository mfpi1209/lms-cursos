import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDb, media } from '@lms/db';
import { FOREGROUND_FROM_RANGE, HEADROOM_RANGE, PRESENTER_BOTTOM_RANGE, PRESENTER_GRADES, PRESENTER_X_RANGE, clampFraction, normalizeLoudnessInPlace, placePresenter, type BackdropFrame, type PlaceBackground, type PresenterGrade, type PresenterKind } from '@lms/media/compose';
import { readAsset, storeGeneratedAsset } from './media';

/**
 * Apresentadora à direita/esquerda do quadro: o HeyGen entrega o vídeo com fundo
 * transparente (WebM com alfa; plano B: fundo verde) e nós o montamos sobre o
 * fundo da apresentação (imagem ou cor) — ou, na cena dirigida, sobre o fundo de
 * continuidade da cena em movimento. `center` (ou ausente) = fluxo antigo.
 */
export interface PlacementParams {
  placement: 'right' | 'left';
  scale: number;
  /** centro horizontal livre (fração da largura); ausente = predefinido da posição */
  x?: number;
  /** base do recorte (fração da altura); ausente = base do quadro */
  bottom?: number;
  /** folga acima da cabeça (deriva o tamanho) */
  headroom?: number;
  /** harmonização de cor da apresentadora */
  grade?: PresenterGrade;
}

/** Posição pedida pela rota (só existe em `params` fora do centro). Posição livre, base, folga e cor só quando definidas. */
export function placementFromParams(params: Record<string, unknown> | undefined): PlacementParams | null {
  const p = params?.presenterPlacement;
  if (p !== 'right' && p !== 'left') return null;
  const n = Number(params?.presenterScale);
  const x = clampFraction(params?.presenterX, PRESENTER_X_RANGE);
  const bottom = clampFraction(params?.presenterBottom, PRESENTER_BOTTOM_RANGE);
  const headroom = clampFraction(params?.presenterHeadroom, HEADROOM_RANGE);
  const grade = gradeFromParams(params);
  return {
    placement: p, scale: Number.isFinite(n) ? Math.min(1.2, Math.max(0.5, n)) : 0.92,
    ...(x !== undefined ? { x } : {}), ...(bottom !== undefined ? { bottom } : {}), ...(headroom !== undefined ? { headroom } : {}), ...(grade ? { grade } : {}),
  };
}

/** Harmonização de cor pedida (`params.presenterGrade`); `none`/ausente = nenhuma. */
export function gradeFromParams(params: Record<string, unknown> | undefined): PresenterGrade | undefined {
  const g = params?.presenterGrade;
  return typeof g === 'string' && g !== 'none' && (PRESENTER_GRADES as readonly string[]).includes(g) ? (g as PresenterGrade) : undefined;
}

/** Rótulo da posição nas chaves de reaproveitamento (`right:0.92`; com posição livre/base/folga/cor: `right:0.92:x0.375:b0.85:h0.06:warm`). */
export function placementTag(p: PlacementParams): string {
  return `${p.placement}:${p.scale}${p.x !== undefined ? `:x${p.x}` : ''}${p.bottom !== undefined ? `:b${p.bottom}` : ''}${p.headroom !== undefined ? `:h${p.headroom}` : ''}${p.grade ? `:${p.grade}` : ''}`;
}

/** Faixa do balcão pedida pela rota (`params.foregroundFrom`), só válida com imagem de fundo. */
export function foregroundFromParams(params: Record<string, unknown> | undefined): number | undefined {
  return params?.backgroundAssetId ? clampFraction(params?.foregroundFrom, FOREGROUND_FROM_RANGE) : undefined;
}

/** Janela de enquadramento do cenário pedida pela rota (`params.backgroundFrame`), só com imagem de fundo. */
export function backgroundFrameFromParams(params: Record<string, unknown> | undefined): BackdropFrame | undefined {
  const f = params?.backgroundFrame as Partial<BackdropFrame> | undefined;
  if (!params?.backgroundAssetId || !f || typeof f !== 'object') return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const x = n(f.x), y = n(f.y), w = n(f.w), h = n(f.h);
  return x !== undefined && y !== undefined && w !== undefined && h !== undefined && w > 0 && h > 0 ? { x, y, w, h } : undefined;
}

/** Rótulo do fundo nas chaves (`image:<id>` + `:fg0.85` + `:frame0.13,0,0.8,0.8` só quando definidos; cor como antes). */
export function backgroundKeyTag(params: Record<string, unknown> | undefined): string {
  const p = params ?? {};
  if (!p.backgroundAssetId) return `color:${String(p.backgroundColor ?? '#ffffff')}`;
  const fg = foregroundFromParams(p);
  const fr = backgroundFrameFromParams(p);
  return `image:${String(p.backgroundAssetId)}${fg !== undefined ? `:fg${fg}` : ''}${fr ? `:frame${fr.x},${fr.y},${fr.w},${fr.h}` : ''}${p.backgroundBlur === false ? ':noblur' : ''}`;
}

/** Fundo da apresentação como arquivo/cor para a montagem (imagem ausente cai na cor). */
export async function presentationBackground(params: Record<string, unknown> | undefined, dir: string, workspaceId: string): Promise<PlaceBackground> {
  const color = typeof params?.backgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(params.backgroundColor) ? params.backgroundColor : '#ffffff';
  if (params?.backgroundAssetId) {
    const a = await media.getAsset(getDb(), String(params.backgroundAssetId));
    if (a && a.kind === 'image' && a.workspaceId === workspaceId) {
      const file = path.join(dir, `bg.${a.mimeType === 'image/png' ? 'png' : a.mimeType === 'image/webp' ? 'webp' : 'jpg'}`);
      await writeFile(file, await readAsset(a.storageKey));
      const foregroundFrom = foregroundFromParams(params);
      const frame = backgroundFrameFromParams(params);
      return { type: 'image', path: file, ...(foregroundFrom !== undefined ? { foregroundFrom } : {}), ...(frame ? { frame } : {}), ...(params?.backgroundBlur === false ? { blur: false } : {}) };
    }
    console.warn(`[media] fundo ${String(params.backgroundAssetId)} indisponível; apresentadora montada sobre a cor ${color}`);
  }
  return { type: 'color', value: color };
}

/** Fundo a partir de um asset de imagem nosso (fundo de continuidade). */
export async function imageBackground(assetId: string, dir: string): Promise<PlaceBackground> {
  const a = await media.getAsset(getDb(), assetId);
  if (!a) throw new Error(`fundo ${assetId} não encontrado no storage`);
  const file = path.join(dir, `plate.${a.mimeType === 'image/png' ? 'png' : 'jpg'}`);
  await writeFile(file, await readAsset(a.storageKey));
  return { type: 'image', path: file };
}

/**
 * Monta um clipe guardado (alfa/verde/substituto) sobre o fundo e guarda o MP4
 * final. Só ffmpeg local: nenhum provedor é chamado.
 */
export async function placeStoredClip(opts: {
  job: Pick<media.MediaJobRow, 'workspaceId' | 'createdBy'>;
  clipAssetId: string;
  kind: PresenterKind;
  placement: PlacementParams;
  /** fundo: carregado dentro do diretório temporário da montagem */
  background: (dir: string) => Promise<PlaceBackground>;
  transcript?: string;
}): Promise<{ assetId: string; durationSeconds: number; focusX: number }> {
  const src = await media.getAsset(getDb(), opts.clipAssetId);
  if (!src) throw new Error(`vídeo do apresentador ${opts.clipAssetId} não encontrado no storage`);
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-place-'));
  try {
    const input = path.join(dir, `presenter.${src.mimeType === 'video/webm' ? 'webm' : 'mp4'}`);
    await writeFile(input, await readAsset(src.storageKey));
    const output = path.join(dir, 'placed.mp4');
    const r = await placePresenter({ presenterVideo: input, kind: opts.kind, background: await opts.background(dir), placement: opts.placement.placement, scale: opts.placement.scale, x: opts.placement.x, bottom: opts.placement.bottom, headroom: opts.placement.headroom, grade: opts.placement.grade, output });
    // volume único (A15): −16 LUFS, igual às cenas montadas
    const loudness = await normalizeLoudnessInPlace(output);
    const a = await storeGeneratedAsset({ workspaceId: opts.job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(output)), durationSeconds: r.durationSeconds, transcript: opts.transcript, createdBy: opts.job.createdBy, metadata: { loudness } });
    return { assetId: a.id, durationSeconds: r.durationSeconds, focusX: r.geometry.centerX };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
