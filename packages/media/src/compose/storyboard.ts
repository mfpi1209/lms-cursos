import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CaptionWord } from './captions';
import { runFfmpeg } from './ffmpeg';
import { rasterizeSvg } from './raster';
import { ellipsize, wrapText, writeMockFonts } from './screen-mock-text';

/**
 * "Storyboard" de conferência de uma cena de tela: um quadro a cada `stepSec` (só a região da tela, legível) e,
 * embaixo de cada quadro, o que a narração está dizendo naquele intervalo (palavras da legenda). Serve para conferir
 * SINCRONIA (o passo aparece quando a fala chega nele?) e COERÊNCIA (a tela mostra o que a fala descreve?) sem
 * assistir ao vídeo. Sai em PNG (páginas de poucas linhas, para ler sem zoom); o texto é desenhado em SVG + resvg
 * (o ffmpeg local não tem `drawtext`).
 */

/** `phone` = um celular no centro; `pair` = duas telas de celular lado a lado; `wide` = o quadro inteiro (computador) */
export type StoryboardKind = 'phone' | 'pair' | 'wide';

export interface StoryboardSource {
  /** arquivo de vídeo (o final da cena ou o MP4 de uma tela da prévia) */
  file: string;
  /** instante, dentro do ARQUIVO, em que este trecho começa */
  fileStartSec: number;
  /** instante, dentro da CENA (= da narração), em que este trecho começa */
  sceneStartSec: number;
  durationSec: number;
  kind: StoryboardKind;
  /** nome curto do trecho (arquivo da gravação), mostrado no primeiro quadro dele */
  label?: string;
}

/** recorte (no quadro 1920x1080), tamanho do quadro na página e quantos cabem por linha */
export const STORYBOARD_TILES: Record<StoryboardKind, { crop: { x: number; y: number; w: number; h: number }; w: number; h: number; perRow: number }> = {
  phone: { crop: { x: 708, y: 8, w: 504, h: 1064 }, w: 288, h: 608, perRow: 6 },
  pair: { crop: { x: 420, y: 0, w: 1080, h: 1080 }, w: 588, h: 588, perRow: 3 },
  wide: { crop: { x: 0, y: 0, w: 1920, h: 1080 }, w: 888, h: 500, perRow: 2 },
};
export const STORYBOARD_PAGE_W = 1812;
const GAP = 12;
const CAPTION_H = 92;
const HEADER_H = 56;

export interface StoryboardTile {
  /** início do intervalo (s) na cena */
  fromSec: number;
  toSec: number;
  /** instante do quadro (meio do intervalo) */
  atSec: number;
  kind: StoryboardKind;
  /** índice do trecho (`sources`) */
  source: number;
  /** primeiro quadro do trecho? (mostra o nome do arquivo) */
  first: boolean;
  caption: string;
}

/** Palavras cuja fala COMEÇA no intervalo `[from, to)`. */
export function captionBetween(words: ReadonlyArray<CaptionWord>, from: number, to: number): string {
  return words.filter((w) => w.start >= from && w.start < to).map((w) => w.text).join(' ');
}

/** Um quadro por intervalo de `stepSec` ao longo dos trechos; o quadro é tirado no meio do intervalo. */
export function storyboardTiles(sources: ReadonlyArray<StoryboardSource>, words: ReadonlyArray<CaptionWord>, stepSec = 1): StoryboardTile[] {
  if (!(stepSec > 0)) throw new Error('stepSec deve ser positivo');
  const total = sources.reduce((m, s) => Math.max(m, s.sceneStartSec + s.durationSec), 0);
  const tiles: StoryboardTile[] = [];
  const seen = new Set<number>();
  // um resto menor que 1/4 do passo no fim não vira quadro
  for (let from = 0; from < total - Math.min(0.25, stepSec / 4); from += stepSec) {
    const to = Math.min(total, from + stepSec);
    const at = Math.min((from + to) / 2, total - 0.2);
    let si = sources.findIndex((s) => at >= s.sceneStartSec && at < s.sceneStartSec + s.durationSec);
    if (si < 0) si = sources.length - 1;
    tiles.push({ fromSec: from, toSec: to, atSec: at, kind: sources[si]!.kind, source: si, first: !seen.has(si), caption: captionBetween(words, from, to) });
    seen.add(si);
  }
  return tiles;
}

export interface StoryboardRow {
  kind: StoryboardKind;
  tiles: number[];
}

/** Linhas (quadros do mesmo tipo, até `perRow`) agrupadas em páginas de `rowsPerPage` linhas de celular (ou altura equivalente). */
export function layoutStoryboard(tiles: ReadonlyArray<Pick<StoryboardTile, 'kind'>>, rowsPerPage = 2): StoryboardRow[][] {
  const rows: StoryboardRow[] = [];
  tiles.forEach((t, i) => {
    const last = rows[rows.length - 1];
    if (last && last.kind === t.kind && last.tiles.length < STORYBOARD_TILES[t.kind].perRow) last.tiles.push(i);
    else rows.push({ kind: t.kind, tiles: [i] });
  });
  const budget = Math.max(1, rowsPerPage) * (STORYBOARD_TILES.phone.h + CAPTION_H + GAP);
  const pages: StoryboardRow[][] = [];
  let used = Infinity;
  for (const r of rows) {
    const h = STORYBOARD_TILES[r.kind].h + CAPTION_H + GAP;
    if (used + h > budget + 1) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1]!.push(r);
    used += h;
  }
  return pages;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const storyboardClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** SVG de uma página. `images[i]` = JPEG (bytes) do quadro `i` de `tiles`, já recortado no tamanho do tipo. */
export function buildStoryboardPageSvg(o: { title: string; page: number; pages: number; rows: ReadonlyArray<StoryboardRow>; tiles: ReadonlyArray<StoryboardTile>; sources: ReadonlyArray<Pick<StoryboardSource, 'label'>>; images: ReadonlyArray<Uint8Array | undefined> }): { svg: string; width: number; height: number } {
  const parts: string[] = [];
  let y = HEADER_H;
  parts.push(`<text x="${GAP}" y="36" font-size="26" font-weight="700" fill="#0B1424">${esc(ellipsize(o.title, STORYBOARD_PAGE_W - 260, 26, 700))}</text>`);
  parts.push(`<text x="${STORYBOARD_PAGE_W - GAP}" y="36" font-size="20" fill="#475569" text-anchor="end">página ${o.page} de ${o.pages}</text>`);
  for (const row of o.rows) {
    const T = STORYBOARD_TILES[row.kind];
    row.tiles.forEach((ti, k) => {
      const t = o.tiles[ti]!;
      const x = GAP + k * (T.w + GAP);
      const img = o.images[ti];
      parts.push(`<rect x="${x}" y="${y}" width="${T.w}" height="${T.h}" fill="#CBD5E1"/>`);
      if (img) parts.push(`<image x="${x}" y="${y}" width="${T.w}" height="${T.h}" preserveAspectRatio="none" href="data:image/jpeg;base64,${Buffer.from(img).toString('base64')}"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${T.w}" height="${T.h}" fill="none" stroke="#94A3B8" stroke-width="1"/>`);
      // faixa do tempo e, no primeiro quadro de cada gravação, o nome dela
      const clock = storyboardClock(t.fromSec);
      const cy = y + T.h + 6;
      parts.push(`<rect x="${x}" y="${cy}" width="54" height="24" rx="6" fill="#0B1424"/><text x="${x + 27}" y="${cy + 18}" font-size="16" font-weight="700" fill="#FFFFFF" text-anchor="middle">${clock}</text>`);
      const label = t.first ? o.sources[t.source]?.label : undefined;
      if (label) parts.push(`<text x="${x + 62}" y="${cy + 18}" font-size="14" font-weight="600" fill="#B45309">${esc(ellipsize(label, T.w - 64, 14, 600))}</text>`);
      const lines = wrapText(t.caption || '(silêncio)', T.w - 4, 17);
      lines.slice(0, 3).forEach((ln, li) => {
        const text = li === 2 && lines.length > 3 ? ellipsize(`${ln.text} …`, T.w - 4, 17) : ln.text;
        parts.push(`<text x="${x + 2}" y="${cy + 46 + li * 20}" font-size="17" fill="${t.caption ? '#0B1424' : '#94A3B8'}" xml:space="preserve">${esc(text)}</text>`);
      });
    });
    y += T.h + CAPTION_H + GAP;
  }
  const height = Math.ceil(y);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${STORYBOARD_PAGE_W}" height="${height}" viewBox="0 0 ${STORYBOARD_PAGE_W} ${height}" font-family="Inter">${parts.join('')}</svg>`, width: STORYBOARD_PAGE_W, height };
}

export interface RenderStoryboardOptions {
  title: string;
  sources: StoryboardSource[];
  /** palavras da narração com tempo (da legenda), relativas ao início da cena */
  words: ReadonlyArray<CaptionWord>;
  /** segundos por quadro (padrão 1) */
  stepSec?: number;
  outDir: string;
  /** prefixo dos PNG: `<baseName>-01.png`, `<baseName>-02.png`… */
  baseName: string;
  /** linhas de celular por página (padrão 2: ~12 s por página) */
  rowsPerPage?: number;
  /** extrações de quadro simultâneas (padrão 6) */
  parallel?: number;
}

export interface RenderStoryboardResult {
  /** nomes dos PNG gerados em `outDir`, em ordem */
  pages: string[];
  tiles: StoryboardTile[];
}

export async function renderStoryboard(o: RenderStoryboardOptions): Promise<RenderStoryboardResult> {
  if (!o.sources.length) throw new Error('storyboard sem nenhum trecho de vídeo');
  const tiles = storyboardTiles(o.sources, o.words, o.stepSec ?? 1);
  const work = await mkdtemp(path.join(tmpdir(), 'storyboard-'));
  try {
    await mkdir(o.outDir, { recursive: true });
    const fontFiles = await writeMockFonts(path.join(work, 'fonts'));
    const images: Array<Uint8Array | undefined> = new Array(tiles.length);
    let next = 0;
    const grab = async () => {
      for (;;) {
        const i = next++;
        const t = tiles[i];
        if (!t) return;
        const src = o.sources[t.source]!;
        const T = STORYBOARD_TILES[t.kind];
        const jpg = path.join(work, `f${i}.jpg`);
        const at = Math.max(0, src.fileStartSec + Math.min(t.atSec - src.sceneStartSec, src.durationSec - 0.2));
        try {
          await runFfmpeg(['-ss', at.toFixed(3), '-i', src.file, '-frames:v', '1', '-vf', `scale=1920:1080,crop=${T.crop.w}:${T.crop.h}:${T.crop.x}:${T.crop.y},scale=${T.w}:${T.h}:flags=lanczos`, '-q:v', '3', '-update', '1', jpg]);
          images[i] = new Uint8Array(await readFile(jpg));
        } catch {
          images[i] = undefined; // quadro além do fim do arquivo: fica o fundo cinza
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(o.parallel ?? 6, tiles.length) || 1 }, grab));
    const layout = layoutStoryboard(tiles, o.rowsPerPage ?? 2);
    const pages: string[] = [];
    for (const [p, rows] of layout.entries()) {
      const { svg } = buildStoryboardPageSvg({ title: o.title, page: p + 1, pages: layout.length, rows, tiles, sources: o.sources, images });
      const r = await rasterizeSvg(svg, { background: '#FFFFFF', fontFiles });
      const name = `${o.baseName}-${String(p + 1).padStart(2, '0')}.png`;
      await writeFile(path.join(o.outDir, name), r.png);
      pages.push(name);
    }
    return { pages, tiles };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
