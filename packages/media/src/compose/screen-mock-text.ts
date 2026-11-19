import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * Fonte e medição de texto da "tela simulada". A Inter (OFL) vem do `@fontsource/inter` (WOFF); o resvg só lê
 * TTF/OTF, então o WOFF é convertido para SFNT (inflate das tabelas) e gravado na pasta de trabalho. As larguras
 * vêm das tabelas `cmap`/`hmtx` da própria fonte (sem kerning: a medição erra por poucos %, para mais).
 * Alternativas, como em `slides.ts`: `SLIDE_FONT_PATH` e fontes do sistema (DejaVu/Arial).
 */

export type MockWeight = 400 | 600 | 700;

interface Metrics {
  unitsPerEm: number;
  advance(cp: number): number;
}

interface FontSource {
  /** SFNT (TTF) em memória por peso */
  sfnt: Record<MockWeight, Buffer>;
  name: string;
}

function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('latin1', 0, 4) !== 'wOFF') return woff; // já é TTF
  const flavor = woff.readUInt32BE(4);
  const n = woff.readUInt16BE(12);
  const entries: Array<{ tag: string; off: number; comp: number; orig: number; sum: number }> = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    entries.push({ tag: woff.toString('latin1', o, o + 4), off: woff.readUInt32BE(o + 4), comp: woff.readUInt32BE(o + 8), orig: woff.readUInt32BE(o + 12), sum: woff.readUInt32BE(o + 16) });
  }
  const dirEnd = 12 + n * 16;
  let size = dirEnd;
  for (const e of entries) size += (e.orig + 3) & ~3;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(n, 4);
  let sr = 1;
  let es = 0;
  while (sr * 2 <= n) {
    sr *= 2;
    es++;
  }
  out.writeUInt16BE(sr * 16, 6);
  out.writeUInt16BE(es, 8);
  out.writeUInt16BE(n * 16 - sr * 16, 10);
  let pos = dirEnd;
  entries.forEach((e, i) => {
    const o = 12 + i * 16;
    out.write(e.tag, o, 'latin1');
    out.writeUInt32BE(e.sum, o + 4);
    out.writeUInt32BE(pos, o + 8);
    out.writeUInt32BE(e.orig, o + 12);
    const raw = woff.subarray(e.off, e.off + e.comp);
    (e.comp < e.orig ? inflateSync(raw) : raw).copy(out, pos);
    pos += (e.orig + 3) & ~3;
  });
  return out;
}

function parseMetrics(ttf: Buffer): Metrics {
  const n = ttf.readUInt16BE(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < n; i++) tables.set(ttf.toString('latin1', 12 + i * 16, 16 + i * 16), ttf.readUInt32BE(20 + i * 16));
  const head = tables.get('head')!;
  const hhea = tables.get('hhea')!;
  const hmtx = tables.get('hmtx')!;
  const cmap = tables.get('cmap')!;
  const unitsPerEm = ttf.readUInt16BE(head + 18);
  const numH = ttf.readUInt16BE(hhea + 34);
  const adv = (gid: number) => ttf.readUInt16BE(hmtx + Math.min(gid, numH - 1) * 4);
  // subtabela unicode do cmap: formato 4 (BMP) ou 12
  const nt = ttf.readUInt16BE(cmap + 2);
  let sub = -1;
  for (let i = 0; i < nt; i++) {
    const plat = ttf.readUInt16BE(cmap + 4 + i * 8);
    const enc = ttf.readUInt16BE(cmap + 6 + i * 8);
    const off = cmap + ttf.readUInt32BE(cmap + 8 + i * 8);
    if ((plat === 3 && (enc === 1 || enc === 10)) || plat === 0) {
      const fmt = ttf.readUInt16BE(off);
      if (fmt === 4 || fmt === 12) {
        sub = off;
        if (fmt === 12) break;
      }
    }
  }
  if (sub < 0) throw new Error('fonte sem cmap unicode');
  const fmt = ttf.readUInt16BE(sub);
  const gidOf = (cp: number): number => {
    if (fmt === 12) {
      const ng = ttf.readUInt32BE(sub + 12);
      for (let i = 0; i < ng; i++) {
        const o = sub + 16 + i * 12;
        const s = ttf.readUInt32BE(o);
        const e = ttf.readUInt32BE(o + 4);
        if (cp >= s && cp <= e) return ttf.readUInt32BE(o + 8) + (cp - s);
      }
      return 0;
    }
    if (cp > 0xffff) return 0;
    const segX2 = ttf.readUInt16BE(sub + 6);
    const endO = sub + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let i = 0; i < segX2; i += 2) {
      if (cp <= ttf.readUInt16BE(endO + i)) {
        const s = ttf.readUInt16BE(startO + i);
        if (cp < s) return 0;
        const delta = ttf.readInt16BE(deltaO + i);
        const ro = ttf.readUInt16BE(rangeO + i);
        if (ro === 0) return (cp + delta) & 0xffff;
        const g = ttf.readUInt16BE(rangeO + i + ro + (cp - s) * 2);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
    }
    return 0;
  };
  const cache = new Map<number, number>();
  return {
    unitsPerEm,
    advance(cp: number) {
      let w = cache.get(cp);
      if (w === undefined) {
        const g = gidOf(cp);
        w = g === 0 && cp !== 0x20 ? unitsPerEm * 0.6 : adv(g);
        cache.set(cp, w);
      }
      return w;
    },
  };
}

let source: FontSource | undefined;
const metricsCache = new Map<MockWeight, Metrics>();

function loadSource(): FontSource {
  if (source) return source;
  const envPath = process.env.SLIDE_FONT_PATH;
  if (envPath && existsSync(envPath)) {
    const r = readFileSync(envPath);
    const bp = process.env.SLIDE_FONT_BOLD_PATH;
    const b = bp && existsSync(bp) ? readFileSync(bp) : r;
    return (source = { sfnt: { 400: r, 600: b, 700: b }, name: envPath });
  }
  try {
    const req = createRequire(import.meta.url);
    const get = (w: number) => woffToSfnt(readFileSync(req.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff`)));
    return (source = { sfnt: { 400: get(400), 600: get(600), 700: get(700) }, name: '@fontsource/inter' });
  } catch {
    /* tenta as fontes do sistema */
  }
  for (const [r, b] of [
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
    ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
  ] as const) {
    if (existsSync(r)) {
      const rb = readFileSync(r);
      const bb = existsSync(b) ? readFileSync(b) : rb;
      return (source = { sfnt: { 400: rb, 600: bb, 700: bb }, name: r });
    }
  }
  throw new Error('Nenhuma fonte disponível para a tela simulada: instale @fontsource/inter ou defina SLIDE_FONT_PATH');
}

function metricsFor(weight: MockWeight): Metrics {
  let m = metricsCache.get(weight);
  if (!m) {
    m = parseMetrics(loadSource().sfnt[weight]);
    metricsCache.set(weight, m);
  }
  return m;
}

/** Grava as fontes TTF na pasta de trabalho e devolve os caminhos (para `rasterizeSvg({ fontFiles })`). */
export async function writeMockFonts(dir: string): Promise<string[]> {
  const src = loadSource();
  await mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const w of [400, 600, 700] as const) {
    const p = path.join(dir, `inter-${w}.ttf`);
    await writeFile(p, src.sfnt[w]);
    out.push(p);
  }
  return out;
}

const widthCache = new Map<string, number>();

/** Largura aproximada (px) de `text` em `size` px. */
export function textWidth(text: string, size: number, weight: MockWeight = 400): number {
  const key = `${weight}|${size}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const m = metricsFor(weight);
  let units = 0;
  for (const ch of text) units += m.advance(ch.codePointAt(0)!);
  // 2% de folga: a medição não tem kerning e o rasterizador pode arredondar diferente
  const w = (units / m.unitsPerEm) * size * 1.02;
  if (widthCache.size > 50_000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

export interface WrappedLine {
  text: string;
  /** posição da linha no texto original (para realces) */
  start: number;
  end: number;
  width: number;
}

const wrapCache = new Map<string, WrappedLine[]>();

/**
 * Quebra `text` em linhas de no máximo `maxWidth` px (guloso, por palavras; palavra maior que a linha é cortada
 * por caractere). `\n` força quebra. Nunca devolve linha mais larga que `maxWidth` (salvo um único caractere
 * maior que a própria largura).
 */
export function wrapText(text: string, maxWidth: number, size: number, weight: MockWeight = 400): WrappedLine[] {
  const key = `${weight}|${size}|${Math.round(maxWidth)}|${text}`;
  const hit = wrapCache.get(key);
  if (hit) return hit;
  const lines: WrappedLine[] = [];
  let base = 0;
  for (const para of text.split('\n')) {
    const words: Array<{ s: number; e: number }> = [];
    const re = /\S+/g;
    for (let m = re.exec(para); m; m = re.exec(para)) words.push({ s: m.index, e: m.index + m[0].length });
    if (!words.length) lines.push({ text: '', start: base, end: base, width: 0 });
    let cur: { s: number; e: number } | null = null;
    const flush = () => {
      if (!cur) return;
      const t = para.slice(cur.s, cur.e);
      lines.push({ text: t, start: base + cur.s, end: base + cur.e, width: textWidth(t, size, weight) });
      cur = null;
    };
    for (const w of words) {
      let s = w.s;
      const full = para.slice(w.s, w.e);
      if (textWidth(full, size, weight) > maxWidth) {
        // palavra gigante: fecha a linha e corta por caractere
        flush();
        let piece = '';
        let ps = s;
        let idx = s;
        for (const ch of full) {
          if (piece && textWidth(piece + ch, size, weight) > maxWidth) {
            lines.push({ text: piece, start: base + ps, end: base + idx, width: textWidth(piece, size, weight) });
            piece = '';
            ps = idx;
          }
          piece += ch;
          idx += ch.length;
        }
        cur = { s: ps, e: idx };
        continue;
      }
      if (!cur) {
        cur = { s: w.s, e: w.e };
        continue;
      }
      const cand = para.slice(cur.s, w.e);
      if (textWidth(cand, size, weight) <= maxWidth) cur.e = w.e;
      else {
        flush();
        cur = { s: w.s, e: w.e };
      }
    }
    flush();
    base += para.length + 1;
  }
  if (wrapCache.size > 20_000) wrapCache.clear();
  wrapCache.set(key, lines);
  return lines;
}

/** Corta com reticências para caber em `maxWidth` (células, rótulos). */
export function ellipsize(text: string, maxWidth: number, size: number, weight: MockWeight = 400): string {
  if (textWidth(text, size, weight) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}…`, size, weight) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
