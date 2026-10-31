import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ffprobe, runFfmpeg, sec } from './ffmpeg';
import { BRAND_CARD_PRESETS, loadSlideFonts, pngSize, type BrandCardTokens, type SlideVariant } from './slides';
import { BUMPER_FPS, bumperLogoPath, bumperSpecHash, normalizeBumperSpec, type BumperAspect, type BumperAudio, type BumperAudioPreset, type BumperPlacement, type BumperRenderResult, type BumperSpec, type BumperStyle } from '../bumper-spec';
export * from '../bumper-spec';

/**
 * Vinheta de marca (assinatura animada + assinatura sonora), gratuita e
 * determinística: nenhum provedor é chamado.
 *
 * Quadros: um SVG por quadro (curvas ease-out) rasterizado pelo resvg; o logo
 * (PNG) entra como imagem embutida e é revelado por máscaras (não por traçado
 * de caminho — o logo não existe como vetor). Textos (marca em texto, frase)
 * são renderizados UMA vez pelo satori (Inter, mesmo pipeline dos slides) e
 * compostos como imagens, então a animação só move/mascara/esmaece.
 * Áudio: sintetizado pelo ffmpeg (aevalsrc + afade + aecho/aphaser + loudnorm),
 * ou um arquivo enviado (cortado e com fades), ou silêncio (faixa AAC sempre
 * presente para a concatenação não quebrar).
 */
/* ------------------------------------------------------------------ */
/* Curvas                                                              */
/* ------------------------------------------------------------------ */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeInOutCubic = (x: number) => { const p = clamp01(x); return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2; };
export const easeOutBack = (x: number) => { const p = clamp01(x); if (p <= 0) return 0; if (p >= 1) return 1; const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; };
/** progresso 0..1 de `t` no intervalo [a, b] (clamp), com curva opcional */
const seg = (t: number, a: number, b: number, ease: (x: number) => number = (x) => clamp01(x)) => ease(b <= a ? (t >= b ? 1 : 0) : (t - a) / (b - a));

/* ------------------------------------------------------------------ */
/* Coreografia                                                         */
/* ------------------------------------------------------------------ */

export interface BumperFrameState {
  /** opacidade das formas de marca ao fundo */
  shapes: number;
  /** logo: opacidade, revelação da esquerda para a direita (0..1) e escala */
  logo: { opacity: number; wipe: number; scale: number };
  /** barra laranja da varredura (sweep): centro em fração da largura; null = sem barra */
  bar: { x: number; opacity: number } | null;
  /** sublinhado: largura em fração da largura final (pode passar de 1 no overshoot) */
  underline: { w: number; opacity: number };
  wordmark: { opacity: number; dy: number };
  /** frase: opacidade, deslocamento vertical e fração digitada (1 = inteira) */
  tagline: { opacity: number; dy: number; typed: number };
}

/** Duração da animação de entrada (s) por estilo; o resto da vinheta é a marca parada. */
export function bumperAnimationSeconds(style: BumperStyle, durationSec: number): number {
  if (style === 'reveal') return 1.8;
  if (style === 'sweep') return 1.9;
  // pulse: a frase é digitada até 0,4 s antes do fim (no máximo 2,6 s de animação)
  return Math.min(2.6, Math.max(1.6, durationSec - 0.4));
}

/** Estado dos elementos em `ta` segundos de ANIMAÇÃO (0 = antes de tudo, A = marca completa). */
export function bumperStateAt(style: BumperStyle, ta: number, durationSec: number): BumperFrameState {
  const A = bumperAnimationSeconds(style, durationSec);
  const t = Math.max(0, Math.min(A, ta));
  if (style === 'reveal') {
    const wm = seg(t, 0.4, 1.1, easeOutCubic);
    const tg = seg(t, 1.05, 1.75, easeOutCubic);
    return {
      shapes: seg(t, 0, 0.6, easeOutCubic),
      logo: { opacity: 1, wipe: seg(t, 0.05, 0.95, easeOutCubic), scale: 1 },
      bar: null,
      underline: { w: seg(t, 0.75, 1.4, easeOutCubic), opacity: seg(t, 0.75, 0.9) },
      wordmark: { opacity: wm, dy: (1 - wm) * 24 },
      tagline: { opacity: tg, dy: (1 - tg) * 16, typed: 1 },
    };
  }
  if (style === 'sweep') {
    const barX = -0.14 + 1.28 * seg(t, 0.05, 0.85, easeInOutCubic);
    const barFade = 1 - seg(t, 0.85, 1.05, easeOutCubic);
    const pop = seg(t, 0.45, 1.15, easeOutBack);
    const wm = seg(t, 0.8, 1.4, easeOutCubic);
    const tg = seg(t, 1.2, 1.9, easeOutCubic);
    return {
      shapes: seg(t, 0, 0.5, easeOutCubic),
      // o logo aparece atrás da barra (máscara acompanha o centro dela) com um pequeno overshoot de escala
      logo: { opacity: 1, wipe: -1 /* resolvido pela posição da barra */, scale: 1.06 - 0.06 * pop },
      bar: { x: barX, opacity: barFade },
      underline: { w: seg(t, 0.9, 1.5, easeOutBack), opacity: seg(t, 0.9, 1.0) },
      wordmark: { opacity: wm, dy: (1 - wm) * 20 },
      tagline: { opacity: tg, dy: (1 - tg) * 14, typed: 1 },
    };
  }
  // pulse
  const grow = 0.6 + 0.4 * easeOutBack(seg(t, 0, 0.75));
  const pulse = 1 + 0.03 * Math.sin(Math.PI * seg(t, 1.0, 1.5));
  const wm = seg(t, 0.6, 1.2, easeOutCubic);
  return {
    shapes: seg(t, 0, 0.6, easeOutCubic),
    logo: { opacity: seg(t, 0, 0.3, easeOutCubic), wipe: 1, scale: grow * pulse },
    bar: null,
    underline: { w: seg(t, 0.8, 1.25, easeOutCubic), opacity: seg(t, 0.8, 0.95) },
    wordmark: { opacity: wm, dy: (1 - wm) * 18 },
    tagline: { opacity: seg(t, 1.15, 1.3), dy: 0, typed: seg(t, 1.2, A) },
  };
}

/**
 * Tempo de animação para o tempo `t` do vídeo: `outro` toca a entrada e segura a
 * marca até o fim; `intro` segura a marca e toca a MESMA coreografia ao contrário,
 * mais rápida (×0,7), terminando no fundo limpo (entra na aula).
 */
export function bumperAnimationTime(style: BumperStyle, placement: BumperPlacement, t: number, durationSec: number): number {
  const A = bumperAnimationSeconds(style, durationSec);
  if (placement === 'outro') return t;
  const fast = A * 0.7;
  const hold = Math.max(0, durationSec - fast);
  return t <= hold ? A : A - (t - hold) / 0.7;
}

/* ------------------------------------------------------------------ */
/* Camadas de texto (satori, uma vez por vinheta)                      */
/* ------------------------------------------------------------------ */

interface TextLayer {
  dataUri: string;
  width: number;
  height: number;
  /** caixa dos pixels não transparentes (coordenadas da imagem) */
  bbox: { x: number; y: number; w: number; h: number };
  /** linhas de texto (faixas horizontais de pixels), para a digitação */
  lines: Array<{ y0: number; y1: number; x0: number; x1: number }>;
}

function rgbaBounds(px: Uint8Array, width: number, height: number) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const rows: boolean[] = new Array(height).fill(false);
  const colsByRow: Array<[number, number]> = new Array(height);
  for (let y = 0; y < height; y++) {
    let rx0 = width, rx1 = -1;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (px[base + x * 4 + 3]! > 10) {
        if (x < rx0) rx0 = x;
        if (x > rx1) rx1 = x;
      }
    }
    if (rx1 >= 0) {
      rows[y] = true;
      colsByRow[y] = [rx0, rx1];
      if (rx0 < minX) minX = rx0;
      if (rx1 > maxX) maxX = rx1;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bbox = maxX < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  // linhas: faixas contíguas de linhas com pixels; lacunas menores que 3 px (descendentes) não separam
  const lines: TextLayer['lines'] = [];
  let y = 0;
  while (y < height) {
    if (!rows[y]) { y++; continue; }
    const y0 = y;
    let x0 = width, x1 = -1;
    let gap = 0;
    while (y < height && (rows[y] || gap < 3)) {
      if (rows[y]) { gap = 0; const [a, b] = colsByRow[y]!; if (a < x0) x0 = a; if (b > x1) x1 = b; } else gap++;
      y++;
    }
    lines.push({ y0, y1: y - gap, x0, x1 });
  }
  return { bbox, lines };
}

async function textLayer(text: string, o: { width: number; height: number; fontSize: number; weight: 400 | 600 | 700 | 800; color: string; letterSpacing?: number; uppercase?: boolean; accentDot?: string }): Promise<TextLayer | null> {
  if (!text) return null;
  const children: unknown[] = [o.uppercase ? text.toUpperCase() : text];
  const tree = {
    type: 'div',
    props: {
      style: { display: 'flex', width: o.width, height: o.height, fontFamily: 'Inter', justifyContent: 'center', alignItems: 'flex-start', textAlign: 'center', fontSize: o.fontSize, fontWeight: o.weight, color: o.color, lineHeight: 1.18, letterSpacing: o.letterSpacing ?? 0, flexWrap: 'wrap' },
      children: o.accentDot
        ? [
            { type: 'div', props: { style: { display: 'flex' }, children } },
            { type: 'div', props: { style: { display: 'flex', width: Math.round(o.fontSize * 0.2), height: Math.round(o.fontSize * 0.2), borderRadius: Math.round(o.fontSize * 0.1), background: o.accentDot, marginLeft: Math.round(o.fontSize * 0.08), marginTop: Math.round(o.fontSize * 0.86) } } },
          ]
        : children,
    },
  };
  const svg = await satori(tree as never, { width: o.width, height: o.height, fonts: loadSlideFonts() });
  const img = new Resvg(svg, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render();
  const png = img.asPng();
  const { bbox, lines } = rgbaBounds(new Uint8Array(img.pixels), img.width, img.height);
  if (bbox.w === 0) return null;
  return { dataUri: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, width: img.width, height: img.height, bbox, lines };
}

/* ------------------------------------------------------------------ */
/* Layout do quadro                                                    */
/* ------------------------------------------------------------------ */

interface Layout {
  W: number;
  H: number;
  k: number;
  narrow: boolean;
  tokens: BrandCardTokens;
  /** marca principal: logo (imagem) ou marca em texto grande */
  mark: { dataUri: string; x: number; y: number; w: number; h: number; cx: number; cy: number };
  underline: { cx: number; y: number; fullW: number; h: number };
  wordmark: TextLayer & { x: number; y: number } | null;
  tagline: (TextLayer & { x: number; y: number; chars: number }) | null;
}

async function buildLayout(spec: ReturnType<typeof normalizeBumperSpec>, W: number, H: number): Promise<Layout> {
  const narrow = W < H;
  const k = narrow ? W / 1080 : H / 1080;
  const px = (n: number) => Math.round(n * k);
  const tokens = BRAND_CARD_PRESETS[spec.brand][spec.variant as SlideVariant];
  const logoPath = bumperLogoPath(spec);
  // marca: logo PNG; sem logo, a marca em texto (grande, com o ponto de acento do cromo)
  let mark: { dataUri: string; w: number; h: number; bboxOffset: { x: number; y: number } };
  let wordmarkText = spec.wordmark;
  if (logoPath) {
    const bytes = await readFile(logoPath);
    const size = pngSize(new Uint8Array(bytes));
    const w = Math.round(W * (narrow ? 0.74 : 0.4));
    const h = Math.round((w * size.height) / size.width);
    mark = { dataUri: `data:image/png;base64,${bytes.toString('base64')}`, w, h, bboxOffset: { x: 0, y: 0 } };
  } else {
    const text = wordmarkText || 'cursos';
    wordmarkText = '';
    const layer = await textLayer(text, { width: W, height: px(260), fontSize: px(narrow ? 150 : 170), weight: 800, color: tokens.fg, letterSpacing: -6 * k, accentDot: tokens.accent });
    if (!layer) throw new Error('marca em texto vazia');
    mark = { dataUri: layer.dataUri, w: layer.bbox.w, h: layer.bbox.h, bboxOffset: { x: layer.bbox.x, y: layer.bbox.y } };
  }
  const wordmark = wordmarkText ? await textLayer(wordmarkText, { width: W, height: px(80), fontSize: px(30), weight: 800, color: tokens.fg, letterSpacing: 4 * k, uppercase: true }) : null;
  const tagline = spec.tagline ? await textLayer(spec.tagline, { width: Math.round(W * 0.84), height: px(narrow ? 420 : 240), fontSize: px(narrow ? 60 : 56), weight: 600, color: tokens.muted, letterSpacing: -0.5 * k }) : null;
  const gap1 = px(30), gap2 = px(26), ulH = px(12), gap3 = px(40);
  const wmH = wordmark ? wordmark.bbox.h : 0;
  const tgH = tagline ? tagline.bbox.h : 0;
  const groupH = mark.h + (wordmark ? gap1 + wmH : 0) + gap2 + ulH + (tagline ? gap3 + tgH : 0);
  const cy = narrow ? H * 0.47 : H * 0.5 - px(8);
  let y = Math.round(cy - groupH / 2);
  const markX = Math.round((W - mark.w) / 2);
  // a imagem da marca em texto é maior que a caixa visível: desloca para alinhar a caixa
  const out: Layout = {
    W, H, k, narrow, tokens,
    mark: { dataUri: mark.dataUri, x: markX - mark.bboxOffset.x, y: y - mark.bboxOffset.y, w: logoPath ? mark.w : W, h: logoPath ? mark.h : px(260), cx: W / 2, cy: y + mark.h / 2 },
    underline: { cx: W / 2, y: 0, fullW: Math.round(mark.w * 0.24), h: ulH },
    wordmark: null,
    tagline: null,
  };
  // caixa visível da marca (para a máscara de revelação)
  (out.mark as Layout['mark'] & { vis: { x: number; y: number; w: number; h: number } }).vis = { x: markX, y, w: mark.w, h: mark.h };
  y += mark.h;
  if (wordmark) {
    y += gap1;
    out.wordmark = { ...wordmark, x: Math.round(W / 2 - wordmark.width / 2), y: y - wordmark.bbox.y };
    y += wmH;
  }
  y += gap2;
  out.underline.y = y;
  y += ulH;
  if (tagline) {
    y += gap3;
    out.tagline = { ...tagline, x: Math.round(W / 2 - tagline.width / 2), y: y - tagline.bbox.y, chars: spec.tagline.length };
  }
  return out;
}

/** Formas de marca ao fundo (as mesmas curvas do cartão de marca, parcialmente fora do quadro; sem o ponto de acento no canto). */
function shapesSvg(L: Layout, opacity: number, drift: number): string {
  const { W, H, tokens } = L;
  const k = L.narrow ? W / 1080 : H / 1080;
  const sw = Math.round(96 * k);
  const r1 = Math.round(560 * k);
  const r2 = Math.round(380 * k);
  const d = Math.round(drift * 18 * k);
  return `<g opacity="${opacity.toFixed(3)}">
<path transform="translate(${d} ${-d})" d="M ${W - r1 * 0.35} ${H + sw} A ${r1} ${r1} 0 0 0 ${W + sw} ${H - r1 * 0.95}" stroke="${tokens.shape}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
<path transform="translate(${-d} ${d})" d="M ${-sw} ${r2 * 0.75} A ${r2} ${r2} 0 0 1 ${r2 * 0.6} ${-sw}" stroke="${tokens.shape}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
</g>`;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** SVG de um quadro a partir do layout e do estado dos elementos. */
export function bumperFrameSvg(L: Layout, st: BumperFrameState, drift = 0): string {
  const { W, H, tokens, mark } = L;
  const vis = (mark as Layout['mark'] & { vis: { x: number; y: number; w: number; h: number } }).vis;
  const soft = Math.round(vis.w * 0.12);
  // varredura: a revelação acompanha o centro da barra
  const wipe = st.bar ? clamp01((st.bar.x * W - vis.x + soft * 0.4) / (vis.w + soft)) : st.logo.wipe;
  const maskW = Math.max(0, (vis.w + soft * 2) * clamp01(wipe));
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs>
<linearGradient id="wg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="0.84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="wipe" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="${vis.x - soft}" y="${vis.y - 4}" width="${maskW.toFixed(1)}" height="${vis.h + 8}" fill="url(#wg)"/></mask>`);
  if (L.tagline && st.tagline.typed < 1) {
    const T = L.tagline;
    const n = Math.max(1, T.chars);
    const shown = Math.round(clamp01(st.tagline.typed) * n);
    const totalW = T.lines.reduce((a, l) => a + (l.x1 - l.x0 + 1), 0) || 1;
    let prev = 0;
    const rects: string[] = [];
    T.lines.forEach((l, i) => {
      const lw = l.x1 - l.x0 + 1;
      const lineChars = i === T.lines.length - 1 ? n - prev : Math.round((n * lw) / totalW);
      const k = Math.max(0, Math.min(lineChars, shown - prev));
      prev += lineChars;
      if (k > 0) rects.push(`<rect x="${T.x + l.x0}" y="${T.y + l.y0 - 2}" width="${((lw * k) / Math.max(1, lineChars)).toFixed(1)}" height="${l.y1 - l.y0 + 4}"/>`);
    });
    parts.push(`<clipPath id="type">${rects.join('') || '<rect x="0" y="0" width="0" height="0"/>'}</clipPath>`);
  }
  parts.push('</defs>');
  parts.push(`<rect width="${W}" height="${H}" fill="${tokens.bg}"/>`);
  parts.push(shapesSvg(L, st.shapes, drift));
  // marca (logo ou texto grande): máscara de revelação + escala em torno do centro
  const s = st.logo.scale;
  const tr = Math.abs(s - 1) > 1e-4 ? ` transform="translate(${mark.cx.toFixed(2)} ${mark.cy.toFixed(2)}) scale(${s.toFixed(4)}) translate(${(-mark.cx).toFixed(2)} ${(-mark.cy).toFixed(2)})"` : '';
  const masked = wipe < 0.999;
  parts.push(`<g opacity="${st.logo.opacity.toFixed(3)}"${tr}${masked ? ' mask="url(#wipe)"' : ''}><image x="${mark.x}" y="${mark.y}" width="${mark.w}" height="${mark.h}" href="${mark.dataUri}" preserveAspectRatio="xMidYMid meet"/></g>`);
  // barra da varredura (com rastro suave)
  if (st.bar && st.bar.opacity > 0.001) {
    const barW = Math.round(W * 0.026);
    const barH = Math.round(vis.h * 1.9);
    const bx = st.bar.x * W;
    const by = vis.y + vis.h / 2 - barH / 2;
    parts.push(`<g opacity="${st.bar.opacity.toFixed(3)}"><rect x="${(bx - barW * 3.2).toFixed(1)}" y="${by}" width="${barW * 3}" height="${barH}" rx="${barW / 2}" fill="${tokens.accent}" opacity="0.18"/><rect x="${(bx - barW / 2).toFixed(1)}" y="${by}" width="${barW}" height="${barH}" rx="${barW / 2}" fill="${tokens.accent}"/></g>`);
  }
  // sublinhado laranja
  if (st.underline.opacity > 0.001 && st.underline.w > 0.001) {
    const w = L.underline.fullW * st.underline.w;
    parts.push(`<rect x="${(L.underline.cx - w / 2).toFixed(1)}" y="${L.underline.y}" width="${w.toFixed(1)}" height="${L.underline.h}" rx="${L.underline.h / 2}" fill="${tokens.accent}" opacity="${st.underline.opacity.toFixed(3)}"/>`);
  }
  if (L.wordmark && st.wordmark.opacity > 0.001) {
    const wmk = L.wordmark;
    parts.push(`<image x="${wmk.x}" y="${(wmk.y + st.wordmark.dy * L.k).toFixed(1)}" width="${wmk.width}" height="${wmk.height}" href="${wmk.dataUri}" opacity="${(st.wordmark.opacity * 0.75).toFixed(3)}"/>`);
  }
  if (L.tagline && st.tagline.opacity > 0.001 && st.tagline.typed > 0.001) {
    const T = L.tagline;
    const clip = st.tagline.typed < 1 ? ' clip-path="url(#type)"' : '';
    parts.push(`<image${clip} x="${T.x}" y="${(T.y + st.tagline.dy * L.k).toFixed(1)}" width="${T.width}" height="${T.height}" href="${T.dataUri}" opacity="${st.tagline.opacity.toFixed(3)}"/>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

export function bumperFrameSize(aspect: BumperAspect): { width: number; height: number } {
  return aspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/* ------------------------------------------------------------------ */
/* Assinatura sonora                                                   */
/* ------------------------------------------------------------------ */

/** tom com ataque curto e decaimento longo: fundamental + 2 harmônicos que somem mais rápido */
function pluck(freq: number, decay: number, gain = 0.5): string {
  const f = freq.toFixed(2);
  return `${gain}*sin(2*PI*${f}*t)*exp(-${decay}*t)+${(gain * 0.32).toFixed(3)}*sin(2*PI*${(freq * 2).toFixed(2)}*t)*exp(-${(decay * 1.7).toFixed(2)}*t)+${(gain * 0.1).toFixed(3)}*sin(2*PI*${(freq * 3).toFixed(2)}*t)*exp(-${(decay * 2.6).toFixed(2)}*t)`;
}

interface Note { freq: number; at: number; decay: number; gain?: number }

/** Receitas: notas (Hz, início em s, decaimento), pad opcional e efeitos. */
export const BUMPER_SYNTH_RECIPES: Record<BumperAudioPreset, { notes: Note[]; pad?: { expr: string; fadeIn: number; gain: number }; fx: string; description: string }> = {
  warm: {
    // arpejo ascendente em Lá maior (A3 · C#4 · E4), 0,27 s entre notas, pad grave (A2 + E3) por baixo
    notes: [{ freq: 220, at: 0.15, decay: 2.2 }, { freq: 277.18, at: 0.42, decay: 2.2 }, { freq: 329.63, at: 0.69, decay: 1.9, gain: 0.55 }],
    pad: { expr: '0.55*sin(2*PI*110*t)+0.4*sin(2*PI*164.81*t)+0.22*sin(2*PI*220*t)', fadeIn: 0.7, gain: 0.16 },
    fx: 'aecho=0.75:0.5:140:0.22',
    description: 'arpejo ascendente de 3 notas (A3, C#4, E4) com pad suave por baixo',
  },
  bright: {
    // 2 notas mais agudas (E5 → B5), decaimento mais curto, phaser leve e eco curto
    notes: [{ freq: 659.25, at: 0.12, decay: 3.0, gain: 0.42 }, { freq: 987.77, at: 0.4, decay: 2.6, gain: 0.38 }],
    fx: 'aphaser=in_gain=0.7:out_gain=0.85:delay=2.5:decay=0.3:speed=0.6:type=t,aecho=0.7:0.45:110:0.25',
    description: 'carrilhão de 2 notas (E5, B5), mais brilhante, com phaser leve',
  },
  minimal: {
    // um único tom suave (A3 com oitava abaixo), decaimento longo
    notes: [{ freq: 220, at: 0.2, decay: 1.5, gain: 0.5 }, { freq: 110, at: 0.2, decay: 1.3, gain: 0.22 }],
    fx: 'aecho=0.7:0.4:200:0.18',
    description: 'um único tom suave (A3 + oitava grave)',
  },
};

/** Grafo de filtros do áudio sintetizado (saída `[a]`, 48 kHz estéreo, -16 LUFS, termina com o vídeo). */
export function bumperSynthFilter(preset: BumperAudioPreset, durationSec: number): string {
  const r = BUMPER_SYNTH_RECIPES[preset];
  const D = durationSec;
  const chains: string[] = [];
  const labels: string[] = [];
  r.notes.forEach((n, i) => {
    const d = Math.max(0.3, D - n.at);
    chains.push(`aevalsrc=exprs='${pluck(n.freq, n.decay, n.gain ?? 0.5)}':s=48000:d=${sec(d)},afade=t=in:st=0:d=0.012,adelay=${Math.round(n.at * 1000)}:all=1[n${i}]`);
    labels.push(`[n${i}]`);
  });
  if (r.pad) {
    chains.push(`aevalsrc=exprs='${r.pad.gain}*(${r.pad.expr})':s=48000:d=${sec(D)},afade=t=in:st=0:d=${sec(r.pad.fadeIn)},afade=t=out:st=${sec(Math.max(0, D - 1.2))}:d=1.2[pad]`);
    labels.push('[pad]');
  }
  chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,${r.fx},loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,asetpts=N/SR/TB,afade=t=out:st=${sec(Math.max(0, D - 0.35))}:d=0.35,apad=whole_dur=${sec(D)},atrim=duration=${sec(D)},aformat=sample_fmts=s16:channel_layouts=stereo[a]`);
  return chains.join(';');
}

/**
 * Gera a faixa de áudio da vinheta (WAV 48 kHz estéreo com a duração exata):
 * sintetizada, do arquivo (cortado, fades, -16 LUFS) ou silêncio.
 */
export async function generateBumperAudio(audio: BumperAudio, durationSec: number, output: string): Promise<string> {
  const D = sec(durationSec);
  const codec = ['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-t', D, output];
  if (audio.kind === 'synth') {
    await runFfmpeg(['-filter_complex', bumperSynthFilter(audio.preset, durationSec), '-map', '[a]', ...codec], { timeoutMs: 120_000 });
  } else if (audio.kind === 'file') {
    if (!audio.path) throw new Error('áudio da vinheta: arquivo sem caminho');
    const filter = `[0:a]aresample=48000,atrim=0:${D},afade=t=in:st=0:d=0.05,afade=t=out:st=${sec(Math.max(0, durationSec - 0.4))}:d=0.4,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,asetpts=N/SR/TB,apad=whole_dur=${D},atrim=duration=${D},aformat=sample_fmts=s16:channel_layouts=stereo[a]`;
    await runFfmpeg(['-i', audio.path, '-filter_complex', filter, '-map', '[a]', ...codec], { timeoutMs: 120_000 });
  } else {
    await runFfmpeg(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${D}`, ...codec], { timeoutMs: 60_000 });
  }
  return output;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export interface RenderBumperOptions {
  /** pasta de trabalho (quadros + áudio); padrão: pasta temporária ao lado da saída */
  workDir?: string;
  /** caminho do MP4 de saída; padrão `<workDir>/bumper-<hash12>.mp4` */
  output?: string;
  fps?: number;
  /** mantém os quadros PNG (depuração / amostras) */
  keepFrames?: boolean;
  /** chamado por quadro renderizado (progresso) */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Renderiza a vinheta: quadros PNG (resvg) → H.264 yuv420p + AAC, faststart,
 * 30 fps, na duração pedida (3–5 s), 1920×1080 ou 1080×1920 (`aspect: '9:16'`).
 */
export async function renderBumper(input: BumperSpec, opts: RenderBumperOptions = {}): Promise<BumperRenderResult> {
  const spec = normalizeBumperSpec(input);
  const hash = bumperSpecHash(spec);
  const fps = opts.fps ?? BUMPER_FPS;
  const { width: W, height: H } = bumperFrameSize(spec.aspect);
  const workDir = opts.workDir ?? path.join(path.dirname(opts.output ?? '.'), `bumper-${hash.slice(0, 12)}-work`);
  const output = opts.output ?? path.join(workDir, `bumper-${hash.slice(0, 12)}.mp4`);
  const framesDir = path.join(workDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  await mkdir(path.dirname(output), { recursive: true });
  const L = await buildLayout(spec, W, H);
  const frames = Math.max(1, Math.round(spec.durationSec * fps));
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const ta = bumperAnimationTime(spec.style, spec.placement, t, spec.durationSec);
    const st = bumperStateAt(spec.style, ta, spec.durationSec);
    // deriva lenta das formas ao longo da vinheta (sempre em função do tempo do vídeo)
    const svg = bumperFrameSvg(L, st, easeOutCubic(t / spec.durationSec));
    const png = new Resvg(svg, { fitTo: { mode: 'original' }, background: tokensBg(L) }).render().asPng();
    await writeFile(path.join(framesDir, `f-${String(i).padStart(4, '0')}.png`), png);
    opts.onProgress?.(i + 1, frames);
  }
  const audioPath = path.join(workDir, 'audio.wav');
  await generateBumperAudio(spec.audio, spec.durationSec, audioPath);
  await runFfmpeg([
    '-framerate', String(fps), '-i', path.join(framesDir, 'f-%04d.png'),
    '-i', audioPath,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', process.env.COMPOSE_X264_PRESET ?? 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', '-t', sec(spec.durationSec), output,
  ], { timeoutMs: 10 * 60 * 1000 });
  if (!opts.keepFrames) await rm(framesDir, { recursive: true, force: true });
  const probe = await ffprobe(output);
  return { videoPath: output, durationSec: probe.durationSeconds, hash, width: W, height: H, fps, frames };
}

function tokensBg(L: Layout) {
  return L.tokens.bg;
}

/** Quadros de amostra (PNG) em instantes escolhidos, sem gerar vídeo (prévias e QA). */
export async function renderBumperFrames(input: BumperSpec, atSeconds: number[], outDir: string, prefix = 'frame'): Promise<string[]> {
  const spec = normalizeBumperSpec(input);
  const { width: W, height: H } = bumperFrameSize(spec.aspect);
  await mkdir(outDir, { recursive: true });
  const L = await buildLayout(spec, W, H);
  const out: string[] = [];
  for (let i = 0; i < atSeconds.length; i++) {
    const t = Math.max(0, Math.min(spec.durationSec, atSeconds[i]!));
    const st = bumperStateAt(spec.style, bumperAnimationTime(spec.style, spec.placement, t, spec.durationSec), spec.durationSec);
    const png = new Resvg(bumperFrameSvg(L, st, easeOutCubic(t / spec.durationSec)), { fitTo: { mode: 'original' }, background: L.tokens.bg }).render().asPng();
    const file = path.join(outDir, `${prefix}-f${i + 1}.png`);
    await writeFile(file, png);
    out.push(file);
  }
  return out;
}

/**
 * Concatena a vinheta ao fim de um vídeo montado (`appendOutro`): os dois são
 * normalizados para o mesmo tamanho, fps e áudio (48 kHz estéreo) e unidos
 * pelo filtro `concat` com recodificação (H.264 + AAC, faststart).
 */
export async function appendBumperToVideo(opts: { video: string; bumper: string; output: string; width?: number; height?: number; fps?: number }): Promise<{ output: string; durationSeconds: number }> {
  const w = opts.width ?? 1920;
  const h = opts.height ?? 1080;
  const fps = opts.fps ?? 25;
  const norm = (i: number) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}];[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`;
  await mkdir(path.dirname(opts.output), { recursive: true });
  await runFfmpeg([
    '-i', opts.video, '-i', opts.bumper,
    '-filter_complex', `${norm(0)};${norm(1)};[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', opts.output,
  ], { timeoutMs: 10 * 60 * 1000 });
  const p = await ffprobe(opts.output);
  return { output: opts.output, durationSeconds: p.durationSeconds };
}
