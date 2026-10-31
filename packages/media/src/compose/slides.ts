import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

/**
 * Renderizador de slides e letreiros (satori -> SVG -> resvg -> PNG).
 *
 * Fonte: Inter (OFL), empacotada via npm (`@fontsource/inter`, arquivos .woff
 * estáticos nos pesos 400/600/700/800, subconjuntos latin + latin-ext — cobre
 * todos os glifos do pt-BR, aspas curvas, travessão e reticências). Escolhida em
 * vez de baixar do GitHub google/fonts porque lá a Inter só existe como fonte
 * variável (o satori não interpola eixos) e porque um pacote fixado no lockfile
 * funciona offline, no CI e na imagem Docker sem acesso à rede.
 * Alternativas, em ordem: `SLIDE_FONT_PATH` (+ `SLIDE_FONT_BOLD_PATH`) e fontes
 * do sistema (DejaVu no Debian, Arial no macOS).
 */
export type SlideStyle = 'clean' | 'bold' | 'quote' | 'checklist';
export type SlideVariant = 'light' | 'navy';

/** Estruturalmente compatível com `Slide` de @lms/course-schema. */
export interface SlideSpec {
  title?: string;
  bullets?: string[];
  highlight?: string;
  imageAssetId?: string;
  style?: SlideStyle;
  /** cartão de marca (layout `card`): claro ou marinho */
  variant?: SlideVariant;
  /** painel (`presenter_panel`): ícone de cada tópico (null = automático) */
  icons?: Array<string | null>;
  /** painel: linha de cima ("Aula N · título") */
  eyebrow?: string;
}

export const SLIDE_LIMITS = { title: 80, bullet: 90, bullets: 4, highlight: 120, caption: 80 } as const;

/* ------------------------------------------------------------------ */
/* Cartão de marca (layout `card`)                                     */
/* ------------------------------------------------------------------ */

import { brandCardTokens, type BrandCardTokens, type WatermarkCorner } from '../brand-tokens';
import { brandLogoTrimmed, watermarkOpacity, watermarkRect } from './watermark';
export { BRAND_CARD_PRESETS, brandCardTokens, type BrandCardPresetId, type BrandCardTokens } from '../brand-tokens';

/** Variante do cartão: a pedida ou, sem ela, alternada pela posição do plano na cena (claro, marinho, claro…). */
export function cardVariantFor(slide: Pick<SlideSpec, 'variant'>, index = 0): SlideVariant {
  return slide.variant ?? (index % 2 === 0 ? 'light' : 'navy');
}

/**
 * Tom do fundo de um slide/cartão no rodapé (onde fica a marca d'água):
 * cartão = a variante (claro/marinho); slide `bold` = o acento (escuro quando
 * o texto legível sobre ele é branco); os demais estilos são claros.
 */
export function slideToneFor(layout: string | undefined, slide: Pick<SlideSpec, 'variant' | 'style'>, opts: { cardIndex?: number; accent?: string } = {}): 'light' | 'dark' {
  if (layout === 'card') return cardVariantFor(slide, opts.cardIndex ?? 0) === 'navy' ? 'dark' : 'light';
  if (slide.style === 'bold') return readableOn(opts.accent ?? '#1a66d1') === '#FFFFFF' ? 'dark' : 'light';
  return 'light';
}

/** Segmentos de um tópico com `**negrito**` (mesma regra de `boldSegments` no course-schema). */
export function cardBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(/\*\*([^*]+?)\*\*/g)) {
    const i = m.index!;
    if (i > last) out.push({ text: text.slice(last, i), bold: false });
    out.push({ text: m[1]!, bold: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.filter((s) => s.text.length > 0);
}

interface FontDef {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal';
}

let fontCache: FontDef[] | undefined;
let fontSource = '';

function fontsourceFonts(): FontDef[] | undefined {
  try {
    const req = createRequire(import.meta.url);
    const out: FontDef[] = [];
    for (const weight of [400, 600, 700, 800] as const) {
      for (const subset of ['latin', 'latin-ext']) {
        const p = req.resolve(`@fontsource/inter/files/inter-${subset}-${weight}-normal.woff`);
        out.push({ name: 'Inter', data: readFileSync(p), weight, style: 'normal' });
      }
    }
    return out;
  } catch {
    return undefined;
  }
}

function fileFonts(regular: string, bold?: string): FontDef[] {
  const r = readFileSync(regular);
  const b = bold && existsSync(bold) ? readFileSync(bold) : r;
  return [
    { name: 'Inter', data: r, weight: 400, style: 'normal' },
    { name: 'Inter', data: b, weight: 600, style: 'normal' },
    { name: 'Inter', data: b, weight: 700, style: 'normal' },
    { name: 'Inter', data: b, weight: 800, style: 'normal' },
  ];
}

const SYSTEM_FONTS: Array<[string, string]> = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
  ['/Library/Fonts/Arial Unicode.ttf', '/Library/Fonts/Arial Unicode.ttf'],
];

export function loadSlideFonts(): FontDef[] {
  if (fontCache) return fontCache;
  const envPath = process.env.SLIDE_FONT_PATH;
  if (envPath) {
    fontCache = fileFonts(envPath, process.env.SLIDE_FONT_BOLD_PATH);
    fontSource = envPath;
    return fontCache;
  }
  const fs = fontsourceFonts();
  if (fs) {
    fontCache = fs;
    fontSource = '@fontsource/inter';
    return fontCache;
  }
  for (const [r, b] of SYSTEM_FONTS) {
    if (existsSync(r)) {
      fontCache = fileFonts(r, b);
      fontSource = r;
      return fontCache;
    }
  }
  throw new Error('Nenhuma fonte disponível para os slides: instale @fontsource/inter ou defina SLIDE_FONT_PATH');
}

export function slideFontSource() {
  loadSlideFonts();
  return fontSource;
}

// ---------- utilitários de texto e cor ----------

export function clampText(s: string | undefined, max: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:–—-]+$/, '')}…`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0x1a66d1;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto legível sobre a cor: branco ou quase-preto, pelo maior contraste. */
export function readableOn(bg: string) {
  const L = luminance(bg);
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / (luminance('#0F172A') + 0.05);
  return onWhite >= onDark ? '#FFFFFF' : '#0F172A';
}

function tint(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(255 - (255 - c) * alpha);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// ---------- escala tipográfica ----------

/** Escala tipográfica (px a 1920×1080); o renderizador multiplica pelo fator do quadro. */
export const TYPE_SCALE = { display: 120, h1: 84, h2: 62, body: 50, small: 32 } as const;

function fit(base: number, text: string, softMax: number) {
  // encolhe em degraus quando o texto passa do comprimento confortável
  if (text.length <= softMax) return base;
  if (text.length <= softMax * 1.5) return Math.round(base * 0.84);
  return Math.round(base * 0.7);
}

// ---------- árvore satori ----------

type Node = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return { type, props: { style, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}

function checkIcon(size: number, color: string): Node {
  return {
    type: 'svg',
    props: {
      width: size, height: size, viewBox: '0 0 24 24',
      children: [
        { type: 'circle', props: { cx: 12, cy: 12, r: 12, fill: color } },
        { type: 'path', props: { d: 'M6.5 12.5l3.5 3.5 7.5-8', stroke: readableOn(color), 'stroke-width': 2.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
      ],
    },
  };
}

export interface RenderSlideOptions {
  width?: number;
  height?: number;
  /** cor de destaque (#rrggbb) */
  accent?: string;
  /** imagem opcional já carregada (data URI), desenhada nos estilos clean/bold */
  imageDataUri?: string;
}

function slideTree(slide: SlideSpec, o: Required<Pick<RenderSlideOptions, 'width' | 'height' | 'accent'>> & { imageDataUri?: string }): Node {
  const { width, height, accent } = o;
  const narrow = width < height * 1.2;
  const k = (height / 1080) * (narrow ? 0.9 : 1);
  const px = (n: number) => Math.round(n * k);
  const pad = px(narrow ? 88 : 120);
  // largura útil do texto: sem isso o satori não quebra linha e o título transborda
  const textMax = width - pad * 2;
  // tamanho que cabe em até `lines` linhas (Inter ≈ 0,56 em de largura média por caractere)
  const fitWidth = (size: number, text: string, lines = 2, avail = textMax) => Math.min(size, Math.floor((avail * lines) / Math.max(1, text.length * 0.56)));
  const title = clampText(slide.title, SLIDE_LIMITS.title);
  const bullets = (slide.bullets ?? []).slice(0, SLIDE_LIMITS.bullets).map((b) => clampText(b, SLIDE_LIMITS.bullet)).filter(Boolean);
  const highlight = clampText(slide.highlight, SLIDE_LIMITS.highlight);
  const style: SlideStyle = slide.style ?? 'clean';
  const longest = Math.max(0, ...bullets.map((b) => b.length));
  const bulletSize = px(fit(TYPE_SCALE.body, 'x'.repeat(longest * Math.max(1, bullets.length / 2.5)), narrow ? 40 : 70));
  const base = { display: 'flex', width, height, fontFamily: 'Inter', position: 'relative' as const };

  if (style === 'quote') {
    const text = highlight || title || bullets[0] || '';
    const bg = tint(accent, 0.08);
    return h('div', { ...base, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: bg, padding: pad },
      h('div', { display: 'flex', fontSize: px(260), lineHeight: 1, fontWeight: 800, color: accent, height: px(170), marginBottom: px(10) }, '“'),
      h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: px(fit(TYPE_SCALE.h1, text, 60)), lineHeight: 1.22, fontWeight: 700, color: '#0F172A', maxWidth: width - pad * 2 }, text),
      highlight && title ? h('div', { display: 'flex', marginTop: px(44), fontSize: px(TYPE_SCALE.small), fontWeight: 600, color: accent, letterSpacing: 1 }, title.toUpperCase()) : null,
    );
  }

  if (style === 'bold') {
    const fg = readableOn(accent);
    return h('div', { ...base, flexDirection: 'row', background: accent, padding: pad },
      h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, flexShrink: 1 },
        title ? h('div', { display: 'flex', fontSize: fitWidth(px(fit(TYPE_SCALE.display, title, narrow ? 18 : 28)), title, 3), lineHeight: 1.05, fontWeight: 800, color: fg, letterSpacing: -2, maxWidth: textMax }, title) : null,
        highlight ? h('div', { display: 'flex', marginTop: px(36), fontSize: px(fit(TYPE_SCALE.h2, highlight, 60)), lineHeight: 1.2, fontWeight: 600, color: fg, opacity: 0.92, maxWidth: textMax }, highlight) : null,
        bullets.length ? h('div', { display: 'flex', flexDirection: 'column', marginTop: px(40) }, bullets.map((b) => h('div', { display: 'flex', fontSize: bulletSize, lineHeight: 1.3, fontWeight: 600, color: fg, marginBottom: px(14), maxWidth: textMax }, `— ${b}`))) : null,
      ),
      o.imageDataUri && !narrow ? h('div', { display: 'flex', width: Math.round(width * 0.34), marginLeft: px(60), alignItems: 'center' }, { type: 'img', props: { src: o.imageDataUri, style: { width: '100%', height: Math.round(height * 0.6), objectFit: 'cover', borderRadius: px(28) } } }) : null,
    );
  }

  if (style === 'checklist') {
    return h('div', { ...base, flexDirection: 'column', justifyContent: 'center', background: '#FFFFFF', padding: pad },
      title ? h('div', { display: 'flex', fontSize: fitWidth(px(fit(TYPE_SCALE.h1, title, narrow ? 24 : 40)), title), lineHeight: 1.12, fontWeight: 800, color: '#0F172A', marginBottom: px(56), letterSpacing: -1, maxWidth: textMax }, title) : null,
      h('div', { display: 'flex', flexDirection: 'column' },
        (bullets.length ? bullets : highlight ? [highlight] : []).map((b) =>
          h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: px(30), maxWidth: textMax },
            h('div', { display: 'flex', marginRight: px(30), flexShrink: 0 }, checkIcon(px(52), accent)),
            h('div', { display: 'flex', fontSize: bulletSize, lineHeight: 1.25, fontWeight: 600, color: '#1E293B', flexShrink: 1 }, b),
          ),
        ),
      ),
    );
  }

  // clean
  const cleanMax = textMax - px(22) - (o.imageDataUri && !narrow ? Math.round(width * 0.36) : 0);
  return h('div', { ...base, flexDirection: 'row', background: '#FFFFFF' },
    h('div', { display: 'flex', width: px(22), height, background: accent }),
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, flexShrink: 1, padding: pad, paddingLeft: pad - px(22) },
      h('div', { display: 'flex', width: px(120), height: px(10), background: accent, borderRadius: px(5), marginBottom: px(40) }),
      title ? h('div', { display: 'flex', fontSize: fitWidth(px(fit(TYPE_SCALE.h1, title, narrow ? 24 : 40)), title, 2, cleanMax), lineHeight: 1.12, fontWeight: 800, color: '#0F172A', letterSpacing: -1, maxWidth: cleanMax }, title) : null,
      highlight ? h('div', { display: 'flex', marginTop: px(32), fontSize: px(fit(TYPE_SCALE.h2, highlight, narrow ? 40 : 70)), lineHeight: 1.2, fontWeight: 700, color: accent, maxWidth: cleanMax }, highlight) : null,
      bullets.length ? h('div', { display: 'flex', flexDirection: 'column', marginTop: px(48) },
        bullets.map((b) => h('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginBottom: px(22) },
          h('div', { display: 'flex', width: px(16), height: px(16), borderRadius: px(8), background: accent, marginTop: Math.round(bulletSize * 0.48), marginRight: px(28), flexShrink: 0 }),
          h('div', { display: 'flex', fontSize: bulletSize, lineHeight: 1.3, fontWeight: 400, color: '#334155', flexShrink: 1 }, b),
        )),
      ) : null,
    ),
    o.imageDataUri && !narrow ? h('div', { display: 'flex', width: Math.round(width * 0.36), alignItems: 'center', paddingRight: pad }, { type: 'img', props: { src: o.imageDataUri, style: { width: '100%', height: Math.round(height * 0.62), objectFit: 'cover', borderRadius: px(28) } } }) : null,
  );
}

async function toPng(tree: Node, width: number, height: number): Promise<Uint8Array> {
  const svg = await satori(tree as never, { width, height, fonts: loadSlideFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng();
  return new Uint8Array(png);
}

/** Renderiza um slide em PNG (padrão 1920×1080; use 960×1080 para layouts divididos). */
export async function renderSlidePng(slide: SlideSpec, opts: RenderSlideOptions = {}): Promise<Uint8Array> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  return toPng(slideTree(slide, { width, height, accent: opts.accent ?? '#1a66d1', imageDataUri: opts.imageDataUri }), width, height);
}

export interface RenderCardOptions {
  width?: number;
  height?: number;
  /** preset de marca (`PLATFORM_BRAND`): dnawork (padrão) | lms */
  brand?: string | null;
  /** variante; ausente = `slide.variant` ou alternância por `index` */
  variant?: SlideVariant;
  /** posição do plano na cena (alternância claro/marinho quando a variante não é pedida) */
  index?: number;
  /**
   * logo da marca como marca d'água no rodapé (padrão: canto inferior direito,
   * opacidade 0,85; logo colorido no claro, branco no marinho). `false` = sem
   * logo: a montagem do vídeo usa `false` porque a marca d'água GLOBAL (mesma
   * geometria, ver compose/watermark.ts) cobre o cartão — nunca duplica.
   */
  watermark?: false | { position?: WatermarkCorner; opacity?: number };
}

/**
 * Formas de marca ao fundo: dois traços arredondados grossos (ecoam as curvas
 * do monograma "DW"), parcialmente fora do quadro, em baixa opacidade.
 */
function brandShapes(width: number, height: number, color: string): Node {
  const k = height / 1080;
  const sw = Math.round(96 * k);
  const r1 = Math.round(560 * k);
  const r2 = Math.round(380 * k);
  return {
    type: 'svg',
    props: {
      width, height, viewBox: `0 0 ${width} ${height}`, style: { position: 'absolute', top: 0, left: 0 },
      children: [
        // curva grande no canto inferior direito ("D")
        { type: 'path', props: { d: `M ${width - r1 * 0.35} ${height + sw} A ${r1} ${r1} 0 0 0 ${width + sw} ${height - r1 * 0.95}`, stroke: color, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round' } },
        // curva menor no canto superior esquerdo ("W" invertido)
        { type: 'path', props: { d: `M ${-sw} ${r2 * 0.75} A ${r2} ${r2} 0 0 1 ${r2 * 0.6} ${-sw}`, stroke: color, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round' } },
        // sem o ponto de acento no canto (pedido do autor): a assinatura é só o logo (marca d'água)
      ],
    },
  };
}

/**
 * Cartão de marca em tela cheia (layout `card`): título grande (≤ 8 palavras),
 * 2–3 tópicos com `**palavras-chave**` em negrito, fundo claro ou marinho com
 * o acento da marca, formas sutis e o logo da marca como marca d'água no
 * rodapé (sem ponto de acento nem marca em texto). Margens seguras
 * de 7% (lados) e 8% (topo/base) no 16:9; tamanhos mínimos pensados para a
 * reprodução a 375 px de largura (título ≥ 80 px, tópicos ≥ 58 px a 1080p).
 */
function cardTree(slide: SlideSpec, o: { width: number; height: number; tokens: BrandCardTokens; logo: { uri: string; x: number; y: number; w: number; h: number; opacity: number } | null }): Node {
  const { width, height, tokens } = o;
  const k = height / 1080;
  const px = (n: number) => Math.round(n * k);
  const padX = Math.round(width * 0.07);
  const padY = Math.round(height * 0.08);
  const textMax = width - padX * 2;
  const title = clampText(slide.title, SLIDE_LIMITS.title);
  const bullets = (slide.bullets ?? []).slice(0, 3).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const highlight = clampText(slide.highlight, SLIDE_LIMITS.highlight);
  // título: 100 px, encolhe até 80 px se passar de duas linhas (Inter ≈ 0,56 em por caractere)
  const titleSize = Math.max(px(80), Math.min(px(100), Math.floor((textMax * 2) / Math.max(1, title.length * 0.56))));
  const longest = Math.max(0, ...bullets.map((b) => b.replace(/\*\*/g, '').length));
  const bulletSize = Math.max(px(58), Math.min(px(64), Math.floor((textMax * 2) / Math.max(1, longest * 0.58))));
  // cada palavra vira um item do flex (quebra de linha por palavra, pesos misturados); pontuação colada
  // à palavra anterior ("**antes**," ) fica no mesmo item, sem espaço no meio
  const part = (text: string, bold: boolean) => h('span', { display: 'flex', fontSize: bulletSize, lineHeight: 1.25, fontWeight: bold ? 800 : 500, color: bold ? tokens.fg : tokens.muted }, text);
  const wordItems = (segments: Array<{ text: string; bold: boolean }>) => {
    const words: Array<Array<{ text: string; bold: boolean }>> = [];
    let open = false; // a última palavra ainda não terminou (sem espaço depois dela)
    for (const seg of segments) {
      const pieces = seg.text.split(/(\s+)/);
      pieces.forEach((pc, i) => {
        if (i % 2 === 1) { open = false; return; } // espaço: fecha a palavra
        if (!pc) return;
        if (open && words.length) words[words.length - 1]!.push({ text: pc, bold: seg.bold });
        else words.push([{ text: pc, bold: seg.bold }]);
        open = true;
      });
      if (/\s$/.test(seg.text)) open = false;
    }
    return words.map((w) => h('div', { display: 'flex', flexDirection: 'row', marginRight: Math.round(bulletSize * 0.26) }, w.map((x) => part(x.text, x.bold))));
  };
  return h('div', { display: 'flex', width, height, fontFamily: 'Inter', position: 'relative', background: tokens.bg, overflow: 'hidden' },
    brandShapes(width, height, tokens.shape),
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'absolute', top: padY, left: padX, width: textMax, height: height - padY * 2 },
      title ? h('div', { display: 'flex', fontSize: titleSize, lineHeight: 1.08, fontWeight: 800, color: tokens.fg, letterSpacing: -2, maxWidth: textMax }, title) : null,
      h('div', { display: 'flex', width: px(140), height: px(12), background: tokens.accent, borderRadius: px(6), marginTop: px(title ? 34 : 0), marginBottom: px(44) }),
      highlight && !bullets.length ? h('div', { display: 'flex', fontSize: px(64), lineHeight: 1.2, fontWeight: 700, color: tokens.accent, maxWidth: textMax }, highlight) : null,
      bullets.length
        ? h('div', { display: 'flex', flexDirection: 'column' },
            bullets.map((b) =>
              h('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginBottom: px(26), maxWidth: textMax },
                h('div', { display: 'flex', width: px(18), height: px(18), borderRadius: px(5), background: tokens.accent, marginTop: Math.round(bulletSize * 0.5), marginRight: px(30), flexShrink: 0 }),
                h('div', { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, maxWidth: textMax - px(48) }, wordItems(cardBoldSegments(b))),
              ),
            ),
          )
        : null,
    ),
    o.logo
      ? { type: 'img', props: { src: o.logo.uri, width: o.logo.w, height: o.logo.h, style: { position: 'absolute', left: o.logo.x, top: o.logo.y, width: o.logo.w, height: o.logo.h, opacity: o.logo.opacity } } }
      : null,
  );
}

/** Renderiza um cartão de marca (layout `card`) em PNG (padrão 1920×1080). */
export async function renderBrandCardPng(slide: SlideSpec, opts: RenderCardOptions = {}): Promise<Uint8Array> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const variant = opts.variant ?? cardVariantFor(slide, opts.index ?? 0);
  const tokens = brandCardTokens(opts.brand, variant);
  const wm = opts.watermark === false ? null : (opts.watermark ?? {});
  const trimmed = wm ? brandLogoTrimmed(opts.brand, variant === 'navy' ? 'dark' : 'light') : null;
  const logo = wm && trimmed
    ? { uri: trimmed.trimmedUri, ...watermarkRect({ width, height, aspect: trimmed.box.w / trimmed.box.h, side: wm.position === 'bottom-left' ? 'left' : 'right' }), opacity: watermarkOpacity('light', wm.opacity ?? 0.7) }
    : null;
  return toPng(cardTree(slide, { width, height, tokens, logo }), width, height);
}

export async function renderBrandCardToFile(path: string, slide: SlideSpec, opts: RenderCardOptions = {}) {
  await writeFile(path, await renderBrandCardPng(slide, opts));
  return path;
}

/** Letreiro (lower third) em PNG transparente do tamanho do quadro. */
export async function renderCaptionPng(caption: string, opts: { width?: number; height?: number; accent?: string } = {}): Promise<Uint8Array> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const accent = opts.accent ?? '#1a66d1';
  const k = height / 1080;
  const px = (n: number) => Math.round(n * k);
  const text = clampText(caption, SLIDE_LIMITS.caption);
  const tree = h('div', { display: 'flex', width, height, fontFamily: 'Inter', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', padding: `0 0 ${px(96)}px ${px(96)}px` },
    h('div', { display: 'flex', flexDirection: 'row', alignItems: 'stretch', background: 'rgba(255,255,255,0.94)', borderRadius: px(14), maxWidth: Math.round(width * 0.62), boxShadow: '0 8px 30px rgba(15,23,42,0.25)' },
      h('div', { display: 'flex', width: px(14), background: accent, borderRadius: `${px(14)}px 0 0 ${px(14)}px` }),
      h('div', { display: 'flex', padding: `${px(24)}px ${px(40)}px ${px(26)}px ${px(32)}px`, fontSize: px(fit(TYPE_SCALE.h2 * 0.78, text, 44)), lineHeight: 1.2, fontWeight: 700, color: '#0F172A' }, text),
    ),
  );
  return toPng(tree, width, height);
}

export async function renderSlideToFile(path: string, slide: SlideSpec, opts: RenderSlideOptions = {}) {
  await writeFile(path, await renderSlidePng(slide, opts));
  return path;
}

export async function renderCaptionToFile(path: string, caption: string, opts: { width?: number; height?: number; accent?: string } = {}) {
  await writeFile(path, await renderCaptionPng(caption, opts));
  return path;
}

/** Dimensões (largura, altura) de um PNG, lidas do cabeçalho IHDR. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error('não é PNG');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/**
 * Etiqueta de canto (PNG transparente do tamanho do quadro), ex.: "cena em
 * movimento (simulada)" sobre o substituto do modo simulação.
 */
export async function renderCornerTagPng(text: string, opts: { width?: number; height?: number } = {}): Promise<Uint8Array> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const k = height / 1080;
  const px = (n: number) => Math.round(n * k);
  const tree = h('div', { display: 'flex', width, height, fontFamily: 'Inter', justifyContent: 'flex-end', alignItems: 'flex-start', padding: `${px(36)}px ${px(40)}px 0 0` },
    h('div', { display: 'flex', background: 'rgba(15,23,42,0.72)', color: '#FFFFFF', borderRadius: px(10), padding: `${px(10)}px ${px(18)}px`, fontSize: px(28), fontWeight: 700, lineHeight: 1.2 }, clampText(text, 60)),
  );
  return toPng(tree, width, height);
}

export async function renderCornerTagToFile(path: string, text: string, opts: { width?: number; height?: number } = {}) {
  await writeFile(path, await renderCornerTagPng(text, opts));
  return path;
}
