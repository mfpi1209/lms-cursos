import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { brandLogoFile } from '../bumper-spec';
import type { WatermarkCorner } from '../brand-tokens';

/**
 * Marca d'água do logo nos vídeos montados (e no cartão de marca avulso).
 *
 * Desenho (UMA regra para tudo): logo da marca recortado à sua caixa visível
 * (os PNGs têm margem transparente), altura de 26 px a 1080p (≈ 40 px contando
 * a margem do arquivo, como no modelo aprovado `docs/brand/cartoes/opcao-a-tela-cheia`;
 * ≈ 160 px de largura no DNA Work), no canto inferior (direito por padrão) com
 * margem segura de 3% da largura e 4,5% da altura.
 * - planos com vídeo (apresentador, letreiro, cena em movimento): logo BRANCO,
 *   opacidade configurável (padrão 0,7) e sombra muito suave para ler sobre
 *   fundos claros/movimentados;
 * - cartões/slides: logo colorido no fundo claro e branco no marinho, opacidade
 *   +0,15 (padrão 0,85), sem sombra.
 * Na montagem a marca d'água é aplicada POR PLANO (antes das transições), então
 * o cartão de marca é renderizado SEM o próprio logo (`watermark: false`) e a
 * marca d'água global cobre os dois — nunca duplica. Slide com PiP: o PiP
 * ocupa o canto direito; a marca d'água vai para o canto esquerdo nesse plano.
 */
export const WATERMARK_GEOMETRY = {
  /** altura do logo visível (px a 1080p) */
  logoHeight: 26,
  /** margem lateral (fração da largura) */
  marginX: 0.03,
  /** margem inferior (fração da altura) */
  marginY: 0.045,
  /** acréscimo de opacidade em cartões/slides (fundos lisos) */
  flatBoost: 0.15,
} as const;

export type WatermarkSurface = 'video' | 'light' | 'dark';
export type WatermarkSide = 'left' | 'right';

interface TrimmedLogo {
  dataUri: string;
  /** PNG recortado (caixa visível), em data URI */
  trimmedUri: string;
  iw: number;
  ih: number;
  box: { x: number; y: number; w: number; h: number };
}

const logoCache = new Map<string, TrimmedLogo | null>();

function alphaBox(pixels: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number } {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3]! > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Logo do preset para o tom (`light` = colorido, `dark` = branco), recortado à caixa visível; null sem logo. */
export function brandLogoTrimmed(brand: string | null | undefined, tone: 'light' | 'dark'): TrimmedLogo | null {
  const key = `${brand ?? 'dnawork'}:${tone}`;
  if (logoCache.has(key)) return logoCache.get(key)!;
  const file = brandLogoFile(brand, tone);
  if (!file) {
    logoCache.set(key, null);
    return null;
  }
  const bytes = readFileSync(file);
  const iw = bytes.readUInt32BE(16);
  const ih = bytes.readUInt32BE(20);
  const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;
  const full = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${iw}" height="${ih}"><image href="${dataUri}" width="${iw}" height="${ih}"/></svg>`, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render();
  const box = alphaBox(new Uint8Array(full.pixels), full.width, full.height);
  const trimmed = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><image href="${dataUri}" width="${iw}" height="${ih}"/></svg>`, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng();
  const out: TrimmedLogo = { dataUri, trimmedUri: `data:image/png;base64,${Buffer.from(trimmed).toString('base64')}`, iw, ih, box };
  logoCache.set(key, out);
  return out;
}

/** Retângulo do logo no quadro (pixels inteiros), para a proporção `aspect` (largura/altura do logo visível). */
export function watermarkRect(o: { width: number; height: number; aspect: number; side: WatermarkSide }): { x: number; y: number; w: number; h: number } {
  const k = Math.min(o.width, o.height) / 1080;
  const h = Math.round(WATERMARK_GEOMETRY.logoHeight * k);
  const w = Math.round(h * o.aspect);
  const mx = Math.round(o.width * WATERMARK_GEOMETRY.marginX);
  const my = Math.round(o.height * WATERMARK_GEOMETRY.marginY);
  return { x: o.side === 'right' ? o.width - mx - w : mx, y: o.height - my - h, w, h };
}

/** Opacidade efetiva: vídeo = a configurada; cartões/slides = +0,15 (máx. 1). */
export function watermarkOpacity(surface: WatermarkSurface, opacity: number): number {
  return surface === 'video' ? opacity : Math.min(1, opacity + WATERMARK_GEOMETRY.flatBoost);
}

/**
 * Superfície e lado da marca d'água num plano, pelo layout EFETIVO (o que a
 * montagem usa) e pelo tom do slide/cartão (`slideTone`, onde houver):
 * apresentador/letreiro/cena em movimento = vídeo; cartão/slide = o tom dele;
 * tela dividida = a metade que cai no canto; slide com PiP no canto direito =
 * vai para o esquerdo.
 */
export function watermarkPlacementFor(layout: string, slideTone: 'light' | 'dark' | undefined, position: WatermarkCorner): { surface: WatermarkSurface; side: WatermarkSide } {
  const side: WatermarkSide = position === 'bottom-left' ? 'left' : 'right';
  const flat: WatermarkSurface = slideTone ?? 'light';
  switch (layout) {
    case 'card':
    case 'slide':
      return { surface: flat, side };
    case 'slide_with_pip':
      return { surface: flat, side: 'left' };
    case 'presenter_slide_right':
      // apresentador à esquerda, slide à direita
      return { surface: side === 'right' ? flat : 'video', side };
    case 'presenter_slide_left':
      return { surface: side === 'left' ? flat : 'video', side };
    case 'presenter_panel':
      // painel marinho à esquerda; à direita, o vídeo
      return { surface: side === 'left' ? 'dark' : 'video', side };
    default:
      return { surface: 'video', side };
  }
}

/**
 * PNG transparente do tamanho do quadro com o logo na posição (null quando o
 * preset não tem logo). Vídeo: logo branco + sombra muito suave.
 */
export async function renderWatermarkPng(o: { brand: string | null | undefined; surface: WatermarkSurface; side: WatermarkSide; opacity: number; width?: number; height?: number }): Promise<Uint8Array | null> {
  const width = o.width ?? 1920;
  const height = o.height ?? 1080;
  const logo = brandLogoTrimmed(o.brand, o.surface === 'light' ? 'light' : 'dark');
  if (!logo) return null;
  const r = watermarkRect({ width, height, aspect: logo.box.w / logo.box.h, side: o.side });
  const k = Math.min(width, height) / 1080;
  const alpha = watermarkOpacity(o.surface, o.opacity);
  const shadow = o.surface === 'video'
    ? `<defs><filter id="s" x="-20%" y="-60%" width="140%" height="220%"><feDropShadow dx="0" dy="${(1 * k).toFixed(2)}" stdDeviation="${(2.5 * k).toFixed(2)}" flood-color="#000" flood-opacity="0.35"/></filter></defs>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shadow}`
    + `<g opacity="${alpha.toFixed(3)}"${shadow ? ' filter="url(#s)"' : ''}>`
    + `<image href="${logo.trimmedUri}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`
    + '</g></svg>';
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng());
}

export async function renderWatermarkToFile(path: string, o: Parameters<typeof renderWatermarkPng>[0]): Promise<string | null> {
  const png = await renderWatermarkPng(o);
  if (!png) return null;
  await writeFile(path, png);
  return path;
}
