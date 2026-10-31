import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { cardBoldSegments, clampText, loadSlideFonts, type SlideSpec } from './slides';

/**
 * Apresentadora + painel (layout `presenter_panel`, cartão padrão em câmera
 * única; modelo aprovado: `docs/brand/cartoes/opcao-a-tela-cheia.html`).
 *
 * O vídeo da apresentadora continua em TELA CHEIA (sem reduzir nem tarja),
 * só deslocado ~7,8% da largura para a direita (150 px a 1080p) — em câmera
 * `full_frame` é a ÚNICA transformação (sem zoom): o cenário, com a placa,
 * fica inteiro no quadro. A faixa exposta à esquerda fica sob a sombra marinha.
 * Este módulo desenha a camada de cima (PNG transparente do quadro): sombra
 * marinha da esquerda (0,97 → 0,92 em 30% → 0,55 em 40% → 0 em 48%) e o
 * painel (linha de cima laranja com "Aula N · título", título branco, 2–3
 * tópicos em linhas de vidro com ícone laranja). Um PNG por ESTADO: no estado
 * j, os j primeiros tópicos estão acesos e os demais esmaecidos (0,38); a
 * montagem troca de estado quando cada tópico é dito (`panelRevealTimes`).
 */
export const PANEL_SHIFT = 150 / 1920;
export const PANEL_SHADE = 'rgb(15,16,48)';
export const PANEL_DIM_OPACITY = 0.38;

type Node = { type: string; props: Record<string, unknown> };
function h(type: string, style: Record<string, unknown>, ...children: unknown[]): Node {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return { type, props: { style, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}

/* ------------------------------------------------------------------ */
/* Ícones de linha (24×24, traço; mesmos nomes de PANEL_ICONS)         */
/* ------------------------------------------------------------------ */

type Shape = ['path', string] | ['circle', number, number, number] | ['rect', number, number, number, number, number];
const ICON_SHAPES: Record<string, Shape[]> = {
  house: [['path', 'M3 21h18M5 21V8l7-5 7 5v13'], ['path', 'M9 21v-6h6v6']],
  calendar: [['rect', 3, 4, 18, 17, 2], ['path', 'M16 2v4M8 2v4M3 10h18']],
  heart: [['path', 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z']],
  book: [['path', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20'], ['path', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z']],
  briefcase: [['rect', 2, 7, 20, 14, 2], ['path', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16']],
  users: [['path', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'], ['circle', 9, 7, 4], ['path', 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75']],
  message: [['path', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']],
  'message-circle': [['path', 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z']],
  phone: [['rect', 5, 2, 14, 20, 2], ['path', 'M12 18h.01']],
  clock: [['circle', 12, 12, 10], ['path', 'M12 6v6l4 2']],
  'map-pin': [['path', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'], ['circle', 12, 10, 3]],
  search: [['circle', 11, 11, 8], ['path', 'M21 21l-4.35-4.35']],
  star: [['path', 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z']],
  check: [['path', 'M20 6L9 17l-5-5']],
  file: [['path', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'], ['path', 'M14 2v6h6M16 13H8M16 17H8M10 9H8']],
  'user-circle': [['circle', 12, 12, 10], ['circle', 12, 10, 3], ['path', 'M7 20.66V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.66']],
};

export function iconNode(name: string, size: number, color: string): Node {
  const stroke = { stroke: color, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const children = (ICON_SHAPES[name] ?? ICON_SHAPES.check!).map((s) =>
    s[0] === 'path'
      ? { type: 'path', props: { d: s[1], ...stroke } }
      : s[0] === 'circle'
        ? { type: 'circle', props: { cx: s[1], cy: s[2], r: s[3], ...stroke } }
        : { type: 'rect', props: { x: s[1], y: s[2], width: s[3], height: s[4], rx: s[5], ...stroke } },
  );
  return { type: 'svg', props: { width: size, height: size, viewBox: '0 0 24 24', children } };
}

/* ------------------------------------------------------------------ */
/* Camada do painel                                                     */
/* ------------------------------------------------------------------ */

export interface PanelSpec {
  title: string;
  bullets: string[];
  /** ícone de cada tópico (já resolvido: explícito ou por palavra-chave) */
  icons: string[];
  /** "Aula N · título" (vazio = sem linha de cima) */
  eyebrow?: string;
}

/** Árvore satori do painel no estado `lit` (quantos tópicos acesos). */
export function panelTree(spec: PanelSpec, o: { width: number; height: number; lit: number }): Node {
  const { width, height } = o;
  const k = height / 1080;
  const px = (n: number) => Math.round(n * k);
  const panelW = px(640);
  const title = clampText(spec.title, 80);
  const titleSize = Math.max(px(52), Math.min(px(68), Math.floor((panelW * 2) / Math.max(1, title.length * 0.55))));
  const textSize = px(34);
  const textW = panelW - px(28) * 2 - px(72) - px(22) - 2;
  const wordItems = (text: string) => {
    const words: Array<Array<{ text: string; bold: boolean }>> = [];
    let open = false;
    for (const seg of cardBoldSegments(text)) {
      seg.text.split(/(\s+)/).forEach((pc, i) => {
        if (i % 2 === 1) { open = false; return; }
        if (!pc) return;
        if (open && words.length) words[words.length - 1]!.push({ text: pc, bold: seg.bold });
        else words.push([{ text: pc, bold: seg.bold }]);
        open = true;
      });
      if (/\s$/.test(seg.text)) open = false;
    }
    return words.map((w) => h('div', { display: 'flex', flexDirection: 'row', marginRight: Math.round(textSize * 0.26) },
      w.map((x) => h('span', { display: 'flex', fontSize: textSize, lineHeight: 1.15, fontWeight: x.bold ? 800 : 400, color: x.bold ? '#FFFFFF' : 'rgba(255,255,255,0.86)' }, x.text))));
  };
  const shade = `linear-gradient(90deg, rgba(15,16,48,0.97) 0%, rgba(15,16,48,0.92) 30%, rgba(15,16,48,0.55) 40%, rgba(15,16,48,0) 48%)`;
  return h('div', { display: 'flex', width, height, fontFamily: 'Inter', position: 'relative', backgroundImage: shade },
    h('div', { display: 'flex', flexDirection: 'column', position: 'absolute', left: px(96), top: px(170), width: panelW },
      spec.eyebrow
        ? h('div', { display: 'flex', flexDirection: 'row', alignItems: 'center' },
            h('div', { display: 'flex', width: px(36), height: px(4), borderRadius: px(2), background: '#FF7A08', marginRight: px(12) }),
            h('div', { display: 'flex', fontSize: px(23), fontWeight: 600, color: '#FFB070', letterSpacing: 0.5 }, clampText(spec.eyebrow, 56)))
        : null,
      h('div', { display: 'flex', fontSize: titleSize, lineHeight: 1.02, fontWeight: 800, color: '#FFFFFF', letterSpacing: -1.4 * k, marginTop: spec.eyebrow ? px(22) : 0, marginBottom: px(46), maxWidth: panelW }, title),
      h('div', { display: 'flex', flexDirection: 'column' },
        spec.bullets.map((b, i) =>
          h('div', {
            // satori soma padding e borda à largura: a linha inteira (com borda) ocupa exatamente o painel
            display: 'flex', flexDirection: 'row', alignItems: 'center', width: panelW - px(28) * 2 - Math.max(1, Math.round(k)) * 2,
            background: 'rgba(255,255,255,0.07)', border: `${Math.max(1, Math.round(k))}px solid rgba(255,255,255,0.12)`, borderRadius: px(22),
            padding: `${px(22)}px ${px(28)}px`, marginBottom: i < spec.bullets.length - 1 ? px(26) : 0,
            opacity: i < o.lit ? 1 : PANEL_DIM_OPACITY,
          },
          h('div', { display: 'flex', width: px(72), height: px(72), borderRadius: px(18), background: '#FF7A08', alignItems: 'center', justifyContent: 'center', marginRight: px(22), flexShrink: 0 }, iconNode(spec.icons[i] ?? 'check', px(40), '#1D1E4C')),
          h('div', { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', width: textW }, wordItems(b)),
          ),
        ),
      ),
    ),
  );
}

async function toPng(tree: Node, width: number, height: number): Promise<Uint8Array> {
  const svg = await satori(tree as never, { width, height, fonts: loadSlideFonts() });
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'original' }, background: 'rgba(0,0,0,0)' }).render().asPng());
}

export async function renderPanelPng(spec: PanelSpec, o: { width?: number; height?: number; lit: number }): Promise<Uint8Array> {
  const width = o.width ?? 1920;
  const height = o.height ?? 1080;
  return toPng(panelTree(spec, { width, height, lit: o.lit }), width, height);
}

/** Painel a partir do slide do plano (tópicos com `**negrito**`, ícones resolvidos por `iconFor`). */
export function panelSpecFromSlide(slide: SlideSpec & { icons?: Array<string | null> | null; eyebrow?: string }, iconFor: (bullet: string, explicit?: string | null) => string, eyebrow?: string): PanelSpec {
  const bullets = (slide.bullets ?? []).slice(0, 3).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { title: slide.title ?? '', bullets, icons: bullets.map((b, i) => iconFor(b, slide.icons?.[i] ?? null)), eyebrow: slide.eyebrow?.trim() || eyebrow };
}

/** Renderiza os estados (0..n tópicos acesos) em `dir`; devolve os caminhos na ordem. */
export async function renderPanelStatesToFiles(dir: string, safeId: string, spec: PanelSpec, o: { width?: number; height?: number } = {}): Promise<string[]> {
  const out: string[] = [];
  for (let lit = 0; lit <= spec.bullets.length; lit++) {
    const file = path.join(dir, `panel-${safeId}-${lit}.png`);
    await writeFile(file, await renderPanelPng(spec, { ...o, lit }));
    out.push(file);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tempo: cada tópico acende quando é dito                              */
/* ------------------------------------------------------------------ */

const STOP = new Set(['para', 'como', 'com', 'que', 'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas', 'pelo', 'pela', 'seu', 'sua', 'mais', 'muito', 'isso', 'esse', 'essa', 'este', 'esta', 'ele', 'ela', 'você']);
const fold = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function keysOf(bullet: string): string[] {
  const words = (t: string) => t.split(/\s+/).map(fold).filter((w) => w.length >= 3 && !STOP.has(w));
  const bold = [...bullet.matchAll(/\*\*([^*]+?)\*\*/g)].flatMap((m) => words(m[1]!));
  if (bold.length) return bold;
  return words(bullet.replace(/\*\*/g, '')).filter((w) => w.length >= 4);
}

function matches(spoken: string, key: string): boolean {
  if (!spoken) return false;
  if (spoken === key) return true;
  const stem = key.slice(0, Math.max(4, key.length - 2));
  return key.length >= 5 && spoken.length >= 5 && (spoken.startsWith(stem) || key.startsWith(spoken));
}

/**
 * Momento (s, relativo ao início do plano) em que cada tópico acende: a
 * primeira palavra-chave do tópico em negrito (ou, sem negrito, a primeira
 * palavra de conteúdo) dita no plano, em ordem (um tópico nunca acende antes
 * do anterior), 0,1 s antes da palavra. Sem palavras/tempos ou sem a palavra
 * na fala, os tópicos acendem espaçados igualmente no plano.
 */
export function panelRevealTimes(bullets: string[], words: Array<{ text: string; start: number }> | undefined, duration: number): number[] {
  const n = bullets.length;
  const even = (i: number) => (duration * (i + 1)) / (n + 1);
  const spoken = (words ?? []).filter((w) => Number.isFinite(w.start)).map((w) => ({ w: fold(w.text), t: w.start }));
  const out: number[] = [];
  let cursor = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const keys = keysOf(bullets[i]!);
    let hit = -1;
    for (let j = cursor; j < spoken.length && hit < 0; j++) if (keys.some((k) => matches(spoken[j]!.w, k))) hit = j;
    let t: number;
    if (hit >= 0) {
      t = Math.max(0, spoken[hit]!.t - 0.1);
      cursor = hit + 1;
    } else t = even(i);
    t = Math.min(Math.max(t, i > 0 ? prev + 0.6 : 0), Math.max(0, duration - 0.2));
    out.push(Number(t.toFixed(3)));
    prev = t;
  }
  return out;
}
