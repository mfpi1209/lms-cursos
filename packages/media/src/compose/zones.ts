import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import { rasterizeSvg } from './raster';
import { clampText, loadSlideFonts } from './slides';
import { iconNode } from './panel';

/**
 * Estúdio com zonas (layout `presenter_chips`, pergunta a seguir e letreiro
 * com o nome; modelo aprovado: `docs/brand/cartoes/zona-esquerda.html` sobre o
 * cenário `docs/brand/cenario/estudio-zonas-1920.png`).
 *
 * A câmera de zona já deixa a parede livre do lado oposto à apresentadora
 * (`Camera.zone`): o vídeo entra em tela cheia SEM transformação nenhuma e,
 * por cima, na COLUNA da parede livre, vai um painel de VIDRO MARINHO (navy
 * `#1D1E4C` a 84%, borda branca a 14%, sombra suave) com a linha de cima
 * laranja ("Aula N · título"), o título em branco e as pílulas: fundo branco,
 * texto marinho em negrito, ícone de linha num círculo laranja. Decisão de
 * leitura sobre a parede CLARA: o painel é marinho (e não vidro branco com
 * texto marinho) porque as pílulas são brancas — sobre vidro branco elas
 * sumiriam; o marinho a 84% sobre a parede bege dá ≈ 10:1 para o título
 * branco e mantém o contraste das pílulas (marinho sobre branco ≈ 14:1) a
 * 375 px de largura. Sem desfoque de fundo: atrás do painel só há parede lisa
 * (o desfoque não aparece a 84% e custaria um recorte+desfoque por quadro).
 *
 * Pílulas: cada uma SURGE quando a palavra-chave é dita (os mesmos tempos do
 * painel, `panelRevealTimes`): escala 0,8 → 1,06 → 1,0 em ≈ 0,24 s com leve
 * giro (−4° → 0°) e um halo laranja que fica na pílula ATUAL até a próxima
 * surgir; as anteriores ficam, sem halo. Desenho: PNG pequeno por pílula
 * (sprite) — uma sequência curta de quadros do "pop", o estado com halo e o
 * estado assentado — sobreposto com janelas de tempo (ffmpeg), sem PNG de
 * quadro inteiro por estado (barato de decodificar).
 */
type Node = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return { type, props: { style, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}

export type Zone = 'left' | 'right' | 'center';

/** Geometria do estúdio com zonas (frações do quadro; px a 1080p). */
export const ZONE_GEOMETRY = {
  /** largura da coluna de conteúdo (fração da largura; 700 px a 1080p, como o modelo aprovado) */
  columnWidth: 0.365,
  /** câmera 3/4 (apresentadora ao centro): coluna mais estreita, encostada à direita, longe dos braços dela */
  centerColumnWidth: 0.3,
  /** margem da coluna até a borda do quadro do lado livre (96 px a 1080p) */
  edgeMargin: 0.05,
  /** véu marinho: da borda do lado livre até esta fração da largura (câmera de zona; 3/4 usa `centerShadeWidth`) */
  shadeWidth: 0.5,
  centerShadeWidth: 0.44,
  /** topo do conteúdo (fração da altura; 150 px a 1080p) e base máxima (acima do letreiro e da marca d'água) */
  panelTop: 0.139,
  panelMaxBottom: 0.86,
  /** respiro interno legado (cartões que ainda usam caixa) */
  panelPad: 44,
  /** altura da pílula (px a 1080p) e espaço entre pílulas (linhas e colunas) */
  chipHeight: 76,
  chipGap: 16,
  /** margem dos sprites das pílulas (giro + escala + halo + sombra) */
  spritePad: 40,
  /** margem dos sprites dos cartões de vidro (sombra de 18 + 36 px) */
  shadowPad: 64,
} as const;

/** Cores do vidro marinho (o mesmo token em painel, pergunta e letreiro). */
export const ZONE_GLASS = {
  panel: 'rgba(29,30,76,0.84)',
  /** véu do lado livre (modelo aprovado `zona-esquerda.html`): 95% na borda → 86% → 35% → 0 */
  shade: [
    [0, 'rgba(15,16,48,0.95)'],
    [0.6, 'rgba(15,16,48,0.86)'],
    [0.84, 'rgba(15,16,48,0.35)'],
    [1, 'rgba(15,16,48,0)'],
  ] as ReadonlyArray<readonly [number, string]>,
  border: 'rgba(255,255,255,0.14)',
  eyebrow: '#FFB070',
  accent: '#FF7A08',
  navy: '#1D1E4C',
} as const;

/** Coluna da parede livre para a zona da câmera (pixels inteiros). */
export function chipsColumn(o: { width: number; zone: Zone | undefined | null }): { x: number; width: number; side: 'left' | 'right' } {
  const width = Math.round(o.width * (o.zone === 'left' || o.zone === 'right' ? ZONE_GEOMETRY.columnWidth : ZONE_GEOMETRY.centerColumnWidth));
  const margin = Math.round(o.width * ZONE_GEOMETRY.edgeMargin);
  // apresentadora à direita: conteúdo à esquerda; à esquerda ou ao centro (3/4): conteúdo à direita
  if (o.zone === 'right') return { x: margin, width, side: 'left' };
  return { x: o.width - margin - width, width, side: 'right' };
}

/** Faixa do véu marinho no quadro (lado livre, altura inteira). */
export function shadeRect(o: { width: number; height: number; zone: Zone | undefined | null }): { x: number; y: number; w: number; h: number; side: 'left' | 'right' } {
  const w = Math.round(o.width * (o.zone === 'left' || o.zone === 'right' ? ZONE_GEOMETRY.shadeWidth : ZONE_GEOMETRY.centerShadeWidth));
  return o.zone === 'right' ? { x: 0, y: 0, w, h: o.height, side: 'left' } : { x: o.width - w, y: 0, w, h: o.height, side: 'right' };
}

/** Cores do curso para os gráficos do vídeo (`branding.videoPalette`): fundo + destaque. */
export interface ZonePaletteInput {
  base: string;
  accent: string;
}

/** Paleta resolvida: tudo o que os desenhos usam. */
export interface ZoneColors {
  /** cor do véu (rgb do fundo) e do vidro dos cartões */
  baseRgb: [number, number, number];
  panel: string;
  /** texto sobre o fundo (branco em fundo escuro; marinho em fundo claro) e a linha de cima */
  onBase: string;
  eyebrow: string;
  /** destaque: círculo dos ícones, barra do letreiro e halo da pílula atual */
  accent: string;
  accentRgb: [number, number, number];
  /** ícone dentro do círculo e texto da pílula (sempre legível sobre branco) */
  onAccent: string;
  chipText: string;
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = ([r, g, b]: [number, number, number]) => {
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const isDark = (rgb: [number, number, number]) => luminance(rgb) < 0.25;

/**
 * Paleta dos gráficos: sem `p`, a da marca (véu marinho, destaque laranja,
 * linha de cima laranja-clara). Com `p`, o texto vira branco ou marinho pelo
 * contraste com a base; a pílula (fundo branco) usa a mais escura das duas cores.
 */
export function zoneColors(p?: ZonePaletteInput | null): ZoneColors {
  const navy = ZONE_GLASS.navy;
  const base = hexRgb(p?.base ?? '#0F1030');
  const accent = p?.accent ?? ZONE_GLASS.accent;
  const accentRgb = hexRgb(accent);
  const dark = isDark(base);
  const chipText = !p ? navy : luminance(base) <= luminance(accentRgb) ? p.base : p.accent;
  return {
    baseRgb: base,
    panel: p ? `rgba(${base.join(',')},0.88)` : ZONE_GLASS.panel,
    onBase: dark ? '#FFFFFF' : navy,
    eyebrow: !p ? ZONE_GLASS.eyebrow : dark ? (isDark(accentRgb) ? '#FFFFFF' : accent) : navy,
    accent,
    accentRgb,
    onAccent: isDark(accentRgb) ? '#FFFFFF' : navy,
    chipText: isDark(hexRgb(chipText)) ? chipText : navy,
  };
}

/** Véu como gradiente CSS (da borda livre para o centro), na cor da base. */
function shadeGradient(side: 'left' | 'right', colors: ZoneColors = zoneColors()): string {
  const [r, g, b] = colors.baseRgb;
  const stops = ZONE_GLASS.shade.map(([at, c]) => {
    const alpha = /,([0-9.]+)\)$/.exec(c)?.[1] ?? '0';
    return `rgba(${r},${g},${b},${alpha}) ${Math.round(at * 100)}%`;
  }).join(', ');
  return `linear-gradient(${side === 'right' ? 270 : 90}deg, ${stops})`;
}

/* ------------------------------------------------------------------ */
/* Tempo                                                                 */
/* ------------------------------------------------------------------ */

/** Duração do "pop" de cada pílula (s). */
export const CHIP_POP_SECONDS = 0.24;

/** Quadros do pop no fps da montagem (mínimo 3). */
export function chipPopFrameCount(fps: number): number {
  return Math.max(3, Math.round(CHIP_POP_SECONDS * fps));
}

const lerpKeys = (keys: Array<[number, number]>, p: number) => {
  const t = Math.min(1, Math.max(0, p));
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1] = keys[i]!;
    const [p0, v0] = keys[i - 1]!;
    if (t <= p1) return v0 + ((v1 - v0) * (t - p0)) / Math.max(1e-9, p1 - p0);
  }
  return keys[keys.length - 1]![1];
};

/**
 * Quadro-chave do pop no progresso `p` (0..1): escala 0,8 → 1,06 (a 55%) →
 * 1,0; giro −4° → −1,5° → 0°; opacidade 0,3 → 1 (a 35%); halo 0 → 1 (a 50%).
 */
export function chipPopKeyframe(p: number): { scale: number; rotate: number; opacity: number; halo: number } {
  return {
    scale: Number(lerpKeys([[0, 0.8], [0.55, 1.06], [1, 1]], p).toFixed(4)),
    rotate: Number(lerpKeys([[0, -4], [0.55, -1.5], [1, 0]], p).toFixed(3)),
    opacity: Number(lerpKeys([[0, 0.3], [0.35, 1], [1, 1]], p).toFixed(3)),
    halo: Number(lerpKeys([[0, 0], [0.5, 1], [1, 1]], p).toFixed(3)),
  };
}

/**
 * Linha do tempo das pílulas num plano de `duration` s: cada uma surge em
 * `reveal[j]` (pop até `at + pop`), fica com halo até a próxima surgir (ou o
 * fim) e depois assenta sem halo.
 */
export function chipTimeline(reveal: readonly number[], duration: number, popSeconds = CHIP_POP_SECONDS): Array<{ at: number; haloFrom: number; haloUntil: number }> {
  return reveal.map((at, j) => {
    const a = Math.max(0, Math.min(duration, at));
    const next = j + 1 < reveal.length ? Math.max(a, Math.min(duration, reveal[j + 1]!)) : duration;
    return { at: Number(a.toFixed(3)), haloFrom: Number(Math.min(next, a + popSeconds).toFixed(3)), haloUntil: Number(next.toFixed(3)) };
  });
}

/** Letreiro com o nome: 0,6 s → 4,5 s da cena, entrada/saída de 0,3 s. */
export const LOWER_THIRD_WINDOW = { from: 0.6, to: 4.5, slide: 0.3 } as const;

/** Janela do letreiro numa cena de `total` s (null quando a cena é curta demais: menos de 1,5 s visível). */
export function lowerThirdWindow(total: number): { from: number; to: number } | null {
  const to = Math.min(LOWER_THIRD_WINDOW.to, total - 0.2);
  if (to - LOWER_THIRD_WINDOW.from < 1.5) return null;
  return { from: LOWER_THIRD_WINDOW.from, to: Number(to.toFixed(3)) };
}

/** Pergunta a seguir: os últimos ≈ 3 s da cena (entrada de 0,35 s). */
export const TEASER_SECONDS = 3;
export const TEASER_FADE = 0.35;

export function teaserWindow(total: number): { from: number; to: number } {
  return { from: Number(Math.max(0, total - TEASER_SECONDS).toFixed(3)), to: Number(total.toFixed(3)) };
}

/* ------------------------------------------------------------------ */
/* Desenho                                                               */
/* ------------------------------------------------------------------ */

async function render(tree: Node, width: number, height: number): Promise<{ png: Uint8Array; pixels: Uint8Array; width: number; height: number }> {
  const svg = await satori(tree as never, { width, height, fonts: loadSlideFonts() });
  const r = await rasterizeSvg(svg, { pixels: true });
  return { png: r.png, pixels: r.pixels!, width: r.width, height: r.height };
}

/** Caixa dos pixels com alfa acima de `threshold` (null = vazio). */
export function alphaBBox(pixels: Uint8Array, w: number, hgt: number, threshold = 10): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = hgt, x1 = -1, y1 = -1;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3]! > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const words = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
const clipWordsTo = (s: string, n: number) => {
  const w = words(s);
  return w.length <= n ? w.join(' ') : `${w.slice(0, n).join(' ').replace(/[,;:]+$/, '')}…`;
};

export interface ChipsSpec {
  title: string;
  /** rótulos das pílulas (já curtos: ≤ 4 palavras, ver `chipLabel` no course-schema) */
  chips: string[];
  /** ícone de cada pílula (já resolvido) */
  icons: string[];
  /** "Aula N · título" (vazio = sem linha de cima) */
  eyebrow?: string;
}

export interface ChipSprite {
  /** canto do sprite no quadro */
  x: number;
  y: number;
  /** quadros do pop (padrão `-i` do ffmpeg com %02d) e quantos são */
  popPattern: string;
  popFrames: string[];
  /** pílula ainda não dita (apagada, 35%), com halo (atual) e assentada (anterior) */
  wait?: string;
  halo: string;
  settled: string;
}

export interface ChipsGraphics {
  side: 'left' | 'right';
  /**
   * véu marinho do lado livre com a linha de cima e o título (sprite de altura
   * inteira). `panels[j]` = o estado com j pílulas acesas — hoje o mesmo
   * desenho em todos (as pílulas é que mudam), mantido por estado para o plano.
   */
  panels: PlacedSprite[];
  chips: ChipSprite[];
  /** base do conteúdo (título + pílulas) no quadro: a pergunta a seguir entra abaixo */
  contentBottom?: number;
}

/** Título (branco, 800) na largura útil; o tamanho é escolhido em `renderChipsGraphics` (64 → 48 px, até 2 linhas). */
function titleTree(title: string, size: number, width: number, k: number, color = '#FFFFFF'): Node {
  return h('div', { display: 'flex', width, fontFamily: 'Inter', fontSize: size, lineHeight: 1.04, fontWeight: 800, color, letterSpacing: -0.02 * size }, title);
}

/** Tamanho do texto da pílula (32 px a 1080p; encolhe até 26 se o rótulo for longo para a coluna). */
function chipFontSize(label: string, maxWidth: number, k: number): number {
  const px = (n: number) => Math.round(n * k);
  const room = maxWidth - px(48) - px(14) - px(14) - px(26);
  return Math.max(px(26), Math.min(px(32), Math.floor(room / Math.max(1, label.length * 0.6))));
}

/**
 * Pílula (modelo aprovado): fundo branco, ícone de linha num círculo laranja de 48 px, texto marinho 700 a 32 px.
 * Estados: `wait` (ainda não dita: 35%), pop (escala/giro), atual (halo laranja) e assentada.
 */
function chipNode(label: string, icon: string, o: { k: number; scale?: number; rotate?: number; opacity?: number; halo?: number; maxWidth: number; shadow?: boolean; fontSize?: number; colors?: ZoneColors }): Node {
  const col = o.colors ?? zoneColors();
  const [ar, ag, ab] = col.accentRgb;
  const { k } = o;
  const px = (n: number) => Math.round(n * k);
  const size = o.fontSize ?? chipFontSize(label, o.maxWidth, k);
  const halo = o.halo ?? 0;
  const opacity = o.opacity ?? 1;
  const rotate = o.rotate ?? 0;
  // O resvg 2.6.2 dá pânico nativo (derruba o processo) com sombra desfocada + giro + opacidade < 1 numa
  // pílula larga (o ícone vira <image clip-path>): ver `raster.ts`. Nos quadros do pop (giro e opacidade
  // parcial) a sombra fica de fora: dura 2-3 quadros e a 30-60% de opacidade quase não aparece.
  const popping = rotate !== 0 && opacity < 1;
  const shadow = o.shadow === false || popping ? undefined : `0 ${px(10)}px ${px(30)}px rgba(0,0,0,0.25)`;
  // sem sombra o `boxShadow` é omitido: o satori transforma `'none'` em filtro com NaN
  const haloShadow = halo > 0 ? `0 0 0 ${px(6)}px rgba(${ar},${ag},${ab},${(0.35 + 0.25 * halo).toFixed(3)}), 0 0 ${px(22)}px ${px(4)}px rgba(${ar},${ag},${ab},${(0.3 * halo).toFixed(3)})` : undefined;
  const boxShadow = [haloShadow, shadow].filter(Boolean).join(', ');
  return h('div', {
    display: 'flex', flexDirection: 'row', alignItems: 'center', height: px(ZONE_GEOMETRY.chipHeight), maxWidth: o.maxWidth,
    padding: `0 ${px(26)}px 0 ${px(14)}px`, borderRadius: 999, background: '#FFFFFF',
    ...(boxShadow ? { boxShadow } : {}),
    opacity,
    transform: `scale(${o.scale ?? 1}) rotate(${rotate}deg)`,
  },
  h('div', { display: 'flex', width: px(48), height: px(48), borderRadius: 999, background: col.accent, alignItems: 'center', justifyContent: 'center', marginRight: px(14), flexShrink: 0 }, iconNode(icon, px(26), col.onAccent)),
  h('div', { display: 'flex', fontSize: size, fontWeight: 700, color: col.chipText, whiteSpace: 'nowrap', letterSpacing: -0.2 * k }, label),
  );
}

/** Largura medida da pílula (sem sombra nem halo). */
async function measureChip(label: string, icon: string, k: number, maxWidth: number): Promise<number> {
  const hh = Math.round(ZONE_GEOMETRY.chipHeight * k);
  const r = await render(h('div', { display: 'flex', width: maxWidth, height: hh, fontFamily: 'Inter', alignItems: 'center' }, chipNode(label, icon, { k, maxWidth, shadow: false })), maxWidth, hh);
  const box = alphaBBox(r.pixels, r.width, r.height);
  return Math.min(maxWidth, box ? box.x + box.w : maxWidth);
}

async function chipSprite(file: string, label: string, icon: string, o: { k: number; chipW: number; fontSize: number; colors?: ZoneColors; frame: { scale?: number; rotate?: number; opacity?: number; halo?: number } }): Promise<void> {
  const sp = Math.round(ZONE_GEOMETRY.spritePad * o.k);
  const w = o.chipW + sp * 2;
  const hh = Math.round(ZONE_GEOMETRY.chipHeight * o.k) + sp * 2;
  // satori soma o padding à largura (content-box): só a margem esquerda; a pílula fica centrada na altura do sprite
  const tree = h('div', { display: 'flex', width: w - sp, height: hh, paddingLeft: sp, fontFamily: 'Inter', alignItems: 'center' }, chipNode(label, icon, { k: o.k, maxWidth: o.chipW, fontSize: o.fontSize, colors: o.colors, ...o.frame }));
  await writeFile(file, (await render(tree, w, hh)).png);
}

/** Pílulas em linhas (como `flex-wrap` com 16 px de espaço): posição de cada uma relativa ao topo-esquerdo da área. */
export function flowChips(widths: readonly number[], maxWidth: number, chipH: number, gap: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  for (const w of widths) {
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      y += chipH + gap;
    }
    out.push({ x, y });
    x += w + gap;
  }
  return out;
}

/**
 * Desenha o painel de pílulas de um plano em `dir` (modelo aprovado
 * `docs/brand/cartoes/zona-esquerda.html`): o VÉU marinho do lado livre, com a
 * linha de cima ("Aula N · título") e o título grande, num sprite de altura
 * inteira; e, por pílula, o estado "a seguir" (apagado), os quadros do pop, o
 * estado com halo e o assentado. As pílulas fluem em linhas na coluna de
 * conteúdo. `fps` define quantos quadros tem o pop.
 */
export async function renderChipsGraphics(dir: string, safeId: string, spec: ChipsSpec, o: { width?: number; height?: number; fps?: number; zone?: Zone | null; palette?: ZonePaletteInput | null } = {}): Promise<ChipsGraphics> {
  const colors = zoneColors(o.palette);
  const W = o.width ?? 1920;
  const H = o.height ?? 1080;
  const fps = o.fps ?? 25;
  const k = H / 1080;
  const px = (n: number) => Math.round(n * k);
  const col = chipsColumn({ width: W, zone: o.zone });
  const shade = shadeRect({ width: W, height: H, zone: o.zone });
  const innerW = col.width;
  const chips = spec.chips.slice(0, 4).map((c) => clampText(c, 40)).filter(Boolean);
  const icons = chips.map((_, j) => spec.icons[j] ?? 'check');
  const title = clampText(spec.title, 80);
  const eyebrow = spec.eyebrow?.trim() ? clampText(spec.eyebrow.trim(), 60) : '';

  // título: o maior tamanho (64 → 48 px a 1080p) que cabe em 2 linhas; a altura medida posiciona as pílulas
  let titleSize = px(64);
  let titleBottom = 0;
  if (title) {
    for (;;) {
      const m = await render(titleTree(title, titleSize, innerW, k, colors.onBase), innerW, px(460));
      const box = alphaBBox(m.pixels, m.width, m.height);
      titleBottom = box ? box.y + box.h : 0;
      if (titleBottom <= titleSize * 1.04 * 2 + px(6) || titleSize <= px(48)) break;
      titleSize = Math.max(px(48), titleSize - px(4));
    }
  }
  const eyebrowH = eyebrow ? px(30) : 0;
  const titleTop = eyebrow ? eyebrowH + px(18) : 0;
  const chipsTop = titleTop + (title ? titleBottom + px(34) : 0);
  const chipH = px(ZONE_GEOMETRY.chipHeight);
  const gap = px(ZONE_GEOMETRY.chipGap);
  const widths = await Promise.all(chips.map((c, j) => measureChip(c, icons[j]!, k, innerW)));
  const flow = flowChips(widths, innerW, chipH, gap);
  const chipsH = flow.length ? flow[flow.length - 1]!.y + chipH : 0;
  const contentH = chipsTop + chipsH;
  const top = Math.max(Math.round(H * 0.06), Math.min(Math.round(H * ZONE_GEOMETRY.panelTop), Math.round(H * ZONE_GEOMETRY.panelMaxBottom) - contentH));

  // véu + linha de cima + título (o mesmo sprite em todos os estados: o véu não muda quando as pílulas surgem)
  const cx = col.x - shade.x;
  const panelTree = h('div', { display: 'flex', width: shade.w, height: shade.h, fontFamily: 'Inter', position: 'relative', backgroundImage: shadeGradient(shade.side, colors) },
    eyebrow
      ? h('div', { display: 'flex', position: 'absolute', left: cx, top, width: innerW, height: eyebrowH, flexDirection: 'row', alignItems: 'center' },
          h('div', { display: 'flex', width: px(36), height: px(4), borderRadius: px(2), background: colors.accent, marginRight: px(12), flexShrink: 0 }),
          h('div', { display: 'block', maxWidth: innerW - px(48), fontSize: px(23), fontWeight: 600, color: colors.eyebrow, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, eyebrow))
      : null,
    title ? h('div', { display: 'flex', position: 'absolute', left: cx, top: top + titleTop }, titleTree(title, titleSize, innerW, k, colors.onBase)) : null,
  );
  const panelFile = path.join(dir, `chips-${safeId}-panel.png`);
  await writeFile(panelFile, (await render(panelTree, shade.w, shade.h)).png);
  const panels: PlacedSprite[] = Array.from({ length: chips.length + 1 }, () => ({ path: panelFile, x: shade.x, y: shade.y, w: shade.w, h: shade.h }));

  const n = chipPopFrameCount(fps);
  const sp = px(ZONE_GEOMETRY.spritePad);
  const sprites: ChipSprite[] = [];
  for (let j = 0; j < chips.length; j++) {
    const label = chips[j]!;
    const icon = icons[j]!;
    const chipW = widths[j]!;
    // o mesmo tamanho de texto da medição (calculado na largura da coluna)
    const fontSize = chipFontSize(label, innerW, k);
    const base = path.join(dir, `chips-${safeId}-${j}`);
    const popFrames: string[] = [];
    for (let f = 0; f < n; f++) {
      const file = `${base}-pop-${String(f).padStart(2, '0')}.png`;
      await chipSprite(file, label, icon, { k, chipW, fontSize, colors, frame: chipPopKeyframe(f / (n - 1)) });
      popFrames.push(file);
    }
    const wait = `${base}-wait.png`;
    const halo = `${base}-halo.png`;
    const settled = `${base}-settled.png`;
    await chipSprite(wait, label, icon, { k, chipW, fontSize, colors, frame: { opacity: 0.35 } });
    await chipSprite(halo, label, icon, { k, chipW, fontSize, colors, frame: { halo: 1 } });
    await chipSprite(settled, label, icon, { k, chipW, fontSize, colors, frame: {} });
    sprites.push({ x: col.x + flow[j]!.x - sp, y: top + chipsTop + flow[j]!.y - sp, popPattern: `${base}-pop-%02d.png`, popFrames, wait, halo, settled });
  }
  return { side: col.side, panels, chips: sprites, contentBottom: top + contentH };
}

/** Sprite posicionado no quadro (pergunta a seguir, letreiro). */
export interface PlacedSprite {
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pergunta para o cartão "A seguir": fato da situação + pergunta, até 22 palavras (o resto vira "…"). */
export function teaserQuestion(text: string): string {
  return clipWordsTo(text.replace(/\s+/g, ' ').trim(), 22);
}

/**
 * Pergunta a seguir (modelo aprovado): "Pergunta que vem a seguir:" + a
 * pergunta em laranja-claro, numa caixa de vidro na coluna de conteúdo.
 * `below` = base do conteúdo do último plano (véu + pílulas): a caixa entra
 * 44 px abaixo, translúcida como no modelo. Sem véu no último plano, a caixa
 * é de vidro marinho (legível sobre a parede clara) e fica em ≈ 47% da altura.
 */
export async function renderTeaserSprite(file: string, question: string, o: { width?: number; height?: number; zone?: Zone | null; below?: number | null; palette?: ZonePaletteInput | null } = {}): Promise<PlacedSprite> {
  const colors = zoneColors(o.palette);
  const W = o.width ?? 1920;
  const H = o.height ?? 1080;
  const k = H / 1080;
  const px = (n: number) => Math.round(n * k);
  const col = chipsColumn({ width: W, zone: o.zone });
  const sp = px(ZONE_GEOMETRY.shadowPad);
  const onShade = typeof o.below === 'number';
  const border = Math.max(1, Math.round(k));
  const q = teaserQuestion(question);
  const size = q.length > 90 ? px(25) : q.length > 60 ? px(27) : px(30);
  const card = h('div', {
    // satori soma padding e borda à largura: o cartão inteiro ocupa a coluna
    display: 'flex', width: col.width - px(30) * 2 - border * 2, padding: `${px(26)}px ${px(30)}px`, borderRadius: px(24),
    background: onShade ? (colors.onBase === '#FFFFFF' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)') : colors.panel, border: `${border}px solid ${colors.onBase === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(29,30,76,0.18)'}`,
    ...(onShade ? {} : { boxShadow: `0 ${px(18)}px ${px(36)}px rgba(15,16,48,0.30)` }),
  },
  h('div', { display: 'block', fontSize: size, lineHeight: 1.3, fontWeight: 500, color: colors.onBase },
    'Pergunta que vem a seguir: ',
    h('span', { fontWeight: 800, color: colors.eyebrow }, `"${q}"`)),
  );
  const cw = col.width + sp * 2;
  const ch = px(420);
  const r = await render(h('div', { display: 'flex', width: cw, height: ch, padding: sp, fontFamily: 'Inter', alignItems: 'flex-start' }, card), cw, ch);
  const box = alphaBBox(r.pixels, r.width, r.height, onShade ? 8 : 200) ?? { x: sp, y: sp, w: col.width, h: px(160) };
  // recorta o sprite à altura do cartão + margem da sombra
  const sh = Math.min(ch, box.y + box.h + sp);
  const cropped = (await rasterizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${sh}" viewBox="0 0 ${cw} ${sh}"><image href="data:image/png;base64,${Buffer.from(r.png).toString('base64')}" width="${cw}" height="${ch}"/></svg>`)).png;
  await writeFile(file, cropped);
  // abaixo das pílulas (sem passar da base segura) ou centrado em 47% da altura
  const maxTop = Math.round(H * ZONE_GEOMETRY.panelMaxBottom) - box.h;
  const topY = onShade ? Math.min(maxTop, o.below! + px(44)) : Math.round(H * 0.47 - box.h / 2);
  return { path: file, x: col.x - box.x, y: topY - box.y, w: cw, h: sh };
}

/** Retângulo do letreiro (cartão visível) no quadro: canto inferior esquerdo, acima da marca d'água quando ela também está à esquerda. */
export function lowerThirdRect(o: { width: number; height: number; w: number; h: number; watermarkSide?: 'left' | 'right' | null }): { x: number; y: number; w: number; h: number } {
  const k = o.height / 1080;
  const x = Math.round(o.width * 0.045);
  let y = o.height - Math.round(o.height * 0.11) - o.h;
  // marca d'água no canto inferior ESQUERDO: sobe o letreiro acima dela (altura do logo + margem segura)
  if (o.watermarkSide === 'left') y -= Math.round(26 * k + o.height * 0.03);
  return { x, y, w: o.w, h: o.h };
}

/**
 * Letreiro com o nome (vidro marinho com barra laranja): "Marina" em
 * destaque e "Sua orientadora · DNA Work" embaixo. Devolve o sprite e a
 * posição (canto inferior esquerdo; nunca sobre a marca d'água).
 */
export async function renderLowerThirdSprite(file: string, who: { name: string; role?: string; brand?: string }, o: { width?: number; height?: number; watermarkSide?: 'left' | 'right' | null; palette?: ZonePaletteInput | null } = {}): Promise<PlacedSprite> {
  const colors = zoneColors(o.palette);
  const [br, bg, bb] = colors.baseRgb;
  const W = o.width ?? 1920;
  const H = o.height ?? 1080;
  const k = H / 1080;
  const px = (n: number) => Math.round(n * k);
  const sp = px(40);
  const sub = [who.role?.trim(), who.brand?.trim()].filter(Boolean).join(' · ');
  const card = h('div', {
    display: 'flex', flexDirection: 'row', alignItems: 'center', padding: `${px(14)}px ${px(26)}px ${px(14)}px ${px(18)}px`, borderRadius: px(16),
    background: `rgba(${br},${bg},${bb},0.88)`, border: `${Math.max(1, Math.round(k))}px solid ${ZONE_GLASS.border}`, boxShadow: `0 ${px(10)}px ${px(24)}px rgba(15,16,48,0.28)`,
  },
  h('div', { display: 'flex', width: px(6), height: px(54), borderRadius: px(3), background: colors.accent, marginRight: px(16) }),
  h('div', { display: 'flex', flexDirection: 'column' },
    h('div', { display: 'flex', fontSize: px(30), fontWeight: 800, color: colors.onBase, lineHeight: 1.15 }, clampText(who.name, 40)),
    sub ? h('div', { display: 'flex', fontSize: px(21), fontWeight: 500, color: colors.onBase, opacity: 0.85, lineHeight: 1.25 }, clampText(sub, 70)) : null),
  );
  const cw = Math.round(W * 0.5);
  const ch = px(200);
  const r = await render(h('div', { display: 'flex', width: cw, height: ch, padding: sp, fontFamily: 'Inter', alignItems: 'flex-start' }, card), cw, ch);
  const box = alphaBBox(r.pixels, r.width, r.height, 200) ?? { x: sp, y: sp, w: px(420), h: px(84) };
  const sw = Math.min(cw, box.x + box.w + sp);
  const sh = Math.min(ch, box.y + box.h + sp);
  const cropped = (await rasterizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}"><image href="data:image/png;base64,${Buffer.from(r.png).toString('base64')}" width="${cw}" height="${ch}"/></svg>`)).png;
  await writeFile(file, cropped);
  const rect = lowerThirdRect({ width: W, height: H, w: box.w, h: box.h, watermarkSide: o.watermarkSide });
  return { path: file, x: rect.x - box.x, y: rect.y - box.y, w: sw, h: sh };
}
