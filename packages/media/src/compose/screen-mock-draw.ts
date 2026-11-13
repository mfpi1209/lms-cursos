import { brandCardTokens } from '../brand-tokens';
import { scheduleSteps, type StepSchedule } from './screen-mock-schedule';
import { ellipsize, textWidth, wrapText, type MockWeight, type WrappedLine } from './screen-mock-text';

/**
 * Desenho (SVG 1920x1080) de cada modelo da tela simulada, como função PURA do tempo: `buildFrameSvg(mock, sch, t)`.
 * Nenhum logotipo de marca real: só o texto `app` no topo e ícones genéricos (formas simples).
 */

/* ---------------- contrato (espelha `ScreenMock` de @lms/course-schema, sem depender do pacote) ---------------- */

export type MockStep =
  | { kind: 'type'; text: string; weight?: number }
  | { kind: 'message'; from: 'user' | 'ai' | 'other'; text: string; weight?: number }
  | { kind: 'show'; title?: string; lines?: string[]; weight?: number }
  | { kind: 'toggle'; label: string; on: boolean; weight?: number }
  | { kind: 'tap'; label: string; weight?: number }
  | { kind: 'cell'; ref: string; value: string; weight?: number }
  | { kind: 'event'; title: string; day: string; time: string; color?: string; weight?: number }
  | { kind: 'highlight'; text: string; weight?: number };

export interface MockInput {
  model: 'chat' | 'browser' | 'form' | 'settings' | 'calendar' | 'sheet' | 'notes';
  device?: 'phone' | 'desktop';
  app: string;
  steps: MockStep[];
}

export const MOCK_W = 1920;
export const MOCK_H = 1080;

/* ---------------- cores (tokens neutros do preset `lms`) ---------------- */

const LIGHT = brandCardTokens('lms', 'light');
const NAVY = brandCardTokens('lms', 'navy');
const C = {
  ink: LIGHT.fg, // #0B1424
  muted: '#475569',
  faint: '#94A3B8',
  line: '#D5DBE5',
  screen: LIGHT.bg,
  white: '#FFFFFF',
  navy: NAVY.bg,
  lime: NAVY.accent,
  hl: '#FFE066',
  link: '#1D4ED8',
  card: '#FFFFFF',
  chip: '#E2E8F0',
};

const EVENT_COLORS: Record<string, string> = {
  azul: '#2563EB',
  verde: '#15803D',
  laranja: '#C2410C',
  roxo: '#7C3AED',
  vermelho: '#B91C1C',
  amarelo: '#A16207',
  rosa: '#BE185D',
  cinza: '#475569',
  'azul-claro': '#0369A1',
};

/* ---------------- utilitários ---------------- */

const ez = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (t: number, a: number, b: number) => (b <= a ? (t >= a ? 1 : 0) : clamp01((t - a) / (b - a)));
const num = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 10) / 10) : '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Target {
  norm: string;
  x: number;
  y: number;
  w: number;
  h: number;
  px?: number;
  py?: number;
}

interface Hl {
  needle: string;
  p: number;
  matched: boolean;
  step: number;
}

interface F {
  t: number;
  mock: MockInput;
  steps: MockStep[];
  sch: StepSchedule;
  phone: boolean;
  hls: Hl[];
  targets: Target[];
  defs: string[];
  /** quadro de fundo da área de conteúdo (cor do corpo) */
  pad: number;
  /** altura fixa embaixo (barra de digitação, botões) que as faixas não podem cobrir */
  inset: number;
  col: { x: number; w: number };
}

const S = { body: 34, lh: 48, small: 28, slh: 38, label: 30, head: 38 };

const rect = (r: Rect, rx: number, fill: string, extra = '') => `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(Math.max(0, r.w))}" height="${num(Math.max(0, r.h))}" rx="${rx}" fill="${fill}" ${extra}/>`;

interface TextOpts {
  x: number;
  y: number;
  w: number;
  size?: number;
  weight?: MockWeight;
  fill?: string;
  lh?: number;
  align?: 'left' | 'center' | 'right';
  caret?: boolean;
  maxLines?: number;
}

/** Bloco de texto com quebra por largura, realces (`highlight`) e cursor opcional. */
function textBlock(f: F, text: string, o: TextOpts): { svg: string; h: number; lines: WrappedLine[]; maxW: number } {
  const size = o.size ?? S.body;
  const weight = o.weight ?? 400;
  const lh = o.lh ?? Math.round(size * 1.4);
  let lines = wrapText(text, Math.max(40, o.w - (o.caret ? 14 : 0)), size, weight);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    const last = lines[o.maxLines - 1]!;
    lines[o.maxLines - 1] = { ...last, text: ellipsize(last.text + ' …', o.w, size, weight) };
  }
  const low = text.toLowerCase();
  const parts: string[] = [];
  // realces antes do texto
  for (const h of f.hls) {
    const k = low.indexOf(h.needle);
    if (k < 0) continue;
    h.matched = true;
    const ke = k + h.needle.length;
    lines.forEach((ln, i) => {
      const a = Math.max(k, ln.start);
      const b = Math.min(ke, ln.end);
      if (b <= a) return;
      const off = textWidth(text.slice(ln.start, a), size, weight);
      const wd = textWidth(text.slice(a, b), size, weight);
      const lx = o.align === 'center' ? o.x + (o.w - ln.width) / 2 : o.align === 'right' ? o.x + o.w - ln.width : o.x;
      parts.push(`<rect x="${num(lx + off - 4)}" y="${num(o.y + i * lh + (lh - size * 1.25) / 2)}" width="${num((wd + 8) * ez(h.p))}" height="${num(size * 1.25)}" rx="6" fill="${C.hl}"/>`);
    });
  }
  lines.forEach((ln, i) => {
    const lx = o.align === 'center' ? o.x + o.w / 2 : o.align === 'right' ? o.x + o.w : o.x;
    const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
    const by = o.y + i * lh + lh / 2 + size * 0.34;
    const caret = o.caret && i === lines.length - 1 ? `<tspan fill="${C.ink}" font-weight="400">|</tspan>` : '';
    parts.push(`<text x="${num(lx)}" y="${num(by)}" font-size="${size}" font-weight="${weight}" fill="${o.fill ?? C.ink}" text-anchor="${anchor}" xml:space="preserve">${esc(ln.text)}${caret}</text>`);
  });
  return { svg: parts.join(''), h: lines.length * lh, lines, maxW: lines.reduce((m, l) => Math.max(m, l.width), 0) };
}

/** Texto de uma linha só, mostrando o FINAL se não couber (campos de digitação). */
function fieldText(text: string, w: number, size: number): string {
  if (textWidth(text, size) <= w) return text;
  let t = text;
  while (t.length > 1 && textWidth(`…${t}`, size) > w) t = t.slice(1);
  return `…${t}`;
}

function icon(kind: 'search' | 'back' | 'dots' | 'send' | 'lock' | 'spark' | 'plus' | 'check', cx: number, cy: number, s: number, color: string): string {
  const k = s / 2;
  switch (kind) {
    case 'search':
      return `<circle cx="${num(cx - k * 0.15)}" cy="${num(cy - k * 0.15)}" r="${num(k * 0.6)}" fill="none" stroke="${color}" stroke-width="${num(s * 0.12)}"/><path d="M${num(cx + k * 0.3)} ${num(cy + k * 0.3)} L${num(cx + k * 0.85)} ${num(cy + k * 0.85)}" stroke="${color}" stroke-width="${num(s * 0.12)}" stroke-linecap="round"/>`;
    case 'back':
      return `<path d="M${num(cx + k * 0.3)} ${num(cy - k * 0.7)} L${num(cx - k * 0.4)} ${num(cy)} L${num(cx + k * 0.3)} ${num(cy + k * 0.7)}" fill="none" stroke="${color}" stroke-width="${num(s * 0.12)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'dots':
      return [-1, 0, 1].map((i) => `<circle cx="${num(cx + i * k * 0.7)}" cy="${num(cy)}" r="${num(s * 0.07)}" fill="${color}"/>`).join('');
    case 'send':
      return `<path d="M${num(cx - k * 0.5)} ${num(cy + k * 0.45)} L${num(cx + k * 0.6)} ${num(cy)} L${num(cx - k * 0.5)} ${num(cy - k * 0.45)} L${num(cx - k * 0.25)} ${num(cy)} Z" fill="${color}"/>`;
    case 'lock':
      return `<rect x="${num(cx - k * 0.5)}" y="${num(cy - k * 0.1)}" width="${num(k)}" height="${num(k * 0.8)}" rx="4" fill="${color}"/><path d="M${num(cx - k * 0.3)} ${num(cy - k * 0.1)} v${num(-k * 0.3)} a${num(k * 0.3)} ${num(k * 0.3)} 0 0 1 ${num(k * 0.6)} 0 v${num(k * 0.3)}" fill="none" stroke="${color}" stroke-width="${num(s * 0.1)}"/>`;
    case 'spark':
      return `<path d="M${num(cx)} ${num(cy - k)} Q${num(cx)} ${num(cy)} ${num(cx + k)} ${num(cy)} Q${num(cx)} ${num(cy)} ${num(cx)} ${num(cy + k)} Q${num(cx)} ${num(cy)} ${num(cx - k)} ${num(cy)} Q${num(cx)} ${num(cy)} ${num(cx)} ${num(cy - k)} Z" fill="${color}"/>`;
    case 'plus':
      return `<path d="M${num(cx - k * 0.6)} ${num(cy)} H${num(cx + k * 0.6)} M${num(cx)} ${num(cy - k * 0.6)} V${num(cy + k * 0.6)}" stroke="${color}" stroke-width="${num(s * 0.14)}" stroke-linecap="round"/>`;
    case 'check':
      return `<path d="M${num(cx - k * 0.5)} ${num(cy)} L${num(cx - k * 0.1)} ${num(cy + k * 0.4)} L${num(cx + k * 0.55)} ${num(cy - k * 0.4)}" fill="none" stroke="${color}" stroke-width="${num(s * 0.14)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

/* ---------------- itens de fluxo (rolagem automática) ---------------- */

interface Item {
  h: number;
  /** progresso de entrada 0..1 */
  p: number;
  gap?: number;
  draw: (y: number) => string;
}

function flow(f: F, items: Item[], view: Rect, o: { padTop?: number; padBottom?: number; fade?: string } = {}): string {
  const padTop = o.padTop ?? 16;
  const padBottom = o.padBottom ?? 24;
  const placed: Array<{ it: Item; y: number; e: number }> = [];
  let y = padTop;
  for (const it of items) {
    if (it.p <= 0) continue;
    const e = ez(it.p);
    placed.push({ it, y, e });
    y += it.h * e + (it.gap ?? 16) * e;
  }
  const total = y + padBottom;
  const scroll = Math.max(0, total - view.h);
  const id = `cv${f.defs.length}`;
  f.defs.push(`<clipPath id="${id}"><rect x="${num(view.x)}" y="${num(view.y)}" width="${num(view.w)}" height="${num(view.h)}"/></clipPath>`);
  const parts = placed.map(({ it, y: iy, e }) => {
    const ay = view.y + iy - scroll + (1 - e) * 26;
    const svg = it.draw(ay); // desenha sempre (registra realces e alvos de toque)...
    // ...mas só emite o que cruza a área visível: elemento inteiro fora do clipPath derruba o resvg (geom.rs unwrap)
    if (ay + it.h * e < view.y - 4 || ay > view.y + view.h + 4) return '';
    return `<g opacity="${num(e)}">${svg}</g>`;
  });
  // degradê sob a barra do topo: o que rola não aparece com uma linha cortada de repente
  const fid = `fd${f.defs.length}`;
  const fh = Math.min(44, view.h / 4);
  const fc = o.fade ?? C.screen;
  f.defs.push(`<linearGradient id="${fid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fc}" stop-opacity="1"/><stop offset="1" stop-color="${fc}" stop-opacity="0"/></linearGradient>`);
  const fade = scroll > 0 ? `<rect x="${num(view.x)}" y="${num(view.y)}" width="${num(view.w)}" height="${num(fh)}" fill="url(#${fid})"/>` : '';
  return `<g clip-path="url(#${id})">${parts.join('')}${fade}</g>`;
}

function addTarget(f: F, label: string, r: Rect, tap?: { x: number; y: number }) {
  const n = norm(label);
  if (n.length >= 2) f.targets.push({ norm: n, ...r, ...(tap ? { px: tap.x, py: tap.y } : {}) });
}

/* ---------------- tempo dos passos ---------------- */

function typeDur(w: number, len: number) {
  return Math.min(w * 0.8, Math.max(0.4, len / 16));
}
function typedText(text: string, t: number, s: number, e: number): string {
  const p = prog(t, s, s + typeDur(e - s, text.length));
  return text.slice(0, Math.floor(p * text.length + 1e-9));
}
function sentAt(s: number, e: number, len: number) {
  return s + Math.min((e - s) * 0.92, typeDur(e - s, len) + 0.3);
}
const blink = (t: number) => Math.floor(t * 2.2) % 2 === 0;

/* ---------------- chrome do aparelho ---------------- */

interface Chrome {
  svg: string;
  body: Rect;
  screen: Rect;
  pillCenterX: number;
}

function drawChrome(f: F, bodyBg: string): Chrome {
  const app = f.mock.app;
  if (f.phone) {
    const fr = { x: 720, y: 20, w: 480, h: 1040 };
    const sc = { x: 732, y: 32, w: 456, h: 1016 };
    const titleSize = [34, 30, 27, 24].find((z) => textWidth(app, z, 700) <= 304) ?? 24;
    const bodyY = sc.y + 130;
    const body = { x: sc.x, y: bodyY, w: sc.w, h: sc.y + sc.h - 30 - bodyY };
    const svg = [
      rect({ x: fr.x + 6, y: fr.y + 10, w: fr.w, h: fr.h }, 68, 'rgba(11,20,36,0.18)'),
      rect(fr, 66, '#0B1424'),
      rect(sc, 52, bodyBg),
      // barra de estado e cabeçalho do app
      `<text x="${sc.x + 36}" y="${sc.y + 38}" font-size="26" font-weight="700" fill="${C.ink}">9:41</text>`,
      rect({ x: sc.x + sc.w / 2 - 60, y: sc.y + 12, w: 120, h: 30 }, 15, '#0B1424'),
      [0, 1, 2, 3].map((i) => rect({ x: sc.x + sc.w - 120 + i * 10, y: sc.y + 38 - (i + 1) * 5, w: 7, h: (i + 1) * 5 }, 2, C.ink)).join(''),
      rect({ x: sc.x + sc.w - 70, y: sc.y + 20, w: 38, h: 20 }, 6, 'none', `stroke="${C.ink}" stroke-width="2.5"`),
      rect({ x: sc.x + sc.w - 66, y: sc.y + 24, w: 26, h: 12 }, 3, C.ink),
      rect({ x: sc.x, y: sc.y + 50, w: sc.w, h: 80 }, 0, C.white),
      `<path d="M${sc.x} ${sc.y + 130} H${sc.x + sc.w}" stroke="${C.line}" stroke-width="2"/>`,
      icon('back', sc.x + 40, sc.y + 90, 36, C.ink),
      `<text x="${sc.x + sc.w / 2}" y="${sc.y + 100}" font-size="${titleSize}" font-weight="700" fill="${C.ink}" text-anchor="middle">${esc(ellipsize(app, 304, titleSize, 700))}</text>`,
      icon('dots', sc.x + sc.w - 44, sc.y + 90, 36, C.ink),
      rect({ x: sc.x + sc.w / 2 - 75, y: sc.y + sc.h - 18, w: 150, h: 7 }, 4, C.ink, 'opacity="0.85"'),
    ].join('');
    return { svg, body, screen: sc, pillCenterX: sc.x + sc.w / 2 };
  }
  const win = { x: 48, y: 36, w: 1824, h: 1008 };
  const body = { x: win.x, y: win.y + 64, w: win.w, h: win.h - 64 };
  const svg = [
    rect({ x: win.x + 6, y: win.y + 12, w: win.w, h: win.h }, 22, 'rgba(11,20,36,0.18)'),
    rect(win, 20, bodyBg),
    rect({ x: win.x, y: win.y, w: win.w, h: 64 }, 20, '#E7EBF1'),
    rect({ x: win.x, y: win.y + 40, w: win.w, h: 24 }, 0, '#E7EBF1'),
    `<circle cx="${win.x + 36}" cy="${win.y + 32}" r="9" fill="#EF6B5F"/><circle cx="${win.x + 66}" cy="${win.y + 32}" r="9" fill="#F4BF4F"/><circle cx="${win.x + 96}" cy="${win.y + 32}" r="9" fill="#61C554"/>`,
    `<text x="${win.x + win.w / 2}" y="${win.y + 42}" font-size="30" font-weight="600" fill="${C.ink}" text-anchor="middle">${esc(ellipsize(app, 900, 30, 600))}</text>`,
  ].join('');
  return { svg, body, screen: win, pillCenterX: win.x + win.w / 2 };
}

/* ---------------- balões (chat) ---------------- */

function bubbleItem(f: F, kind: 'user' | 'ai' | 'other', text: string, p: number, view: Rect, fullText = text): Item {
  const maxW = f.phone ? view.w - 2 * f.pad - 20 : Math.min(f.col.w * 0.72, 860);
  const padX = 22;
  const padY = 16;
  const inner = maxW - 2 * padX;
  const fullLines = wrapText(fullText, inner, S.body);
  const shownLines = wrapText(text, inner, S.body);
  const fullW = fullLines.reduce((m, l) => Math.max(m, l.width), 0);
  const w = Math.min(maxW, Math.ceil((kind === 'ai' || fullText !== text ? fullW : shownLines.reduce((m, l) => Math.max(m, l.width), 0)) + 2 * padX + 4));
  const h = shownLines.length * S.lh + 2 * padY;
  return {
    h,
    p,
    gap: 18,
    draw: (y) => {
      const x = kind === 'user' ? f.col.x + f.col.w - w : f.col.x;
      const fill = kind === 'user' ? C.navy : kind === 'ai' ? C.white : C.chip;
      const stroke = kind === 'ai' ? `stroke="${C.line}" stroke-width="2"` : '';
      const tx = textBlock(f, text, { x: x + padX, y: y + padY, w: inner, fill: kind === 'user' ? C.white : C.ink });
      return `${rect({ x, y, w, h }, 28, fill, stroke)}${tx.svg}`;
    },
  };
}

function dotsItem(f: F, t: number): Item {
  return {
    h: 76,
    p: 1,
    gap: 18,
    draw: (y) =>
      `${rect({ x: f.col.x, y, w: 132, h: 76 }, 28, C.white, `stroke="${C.line}" stroke-width="2"`)}` +
      [0, 1, 2].map((i) => `<circle cx="${f.col.x + 38 + i * 28}" cy="${y + 38}" r="9" fill="${C.faint}" opacity="${num(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 9 - i * 1.2)))}"/>`).join(''),
  };
}

function cardItem(f: F, title: string | undefined, lines: string[], p: number, o: { w?: number; link?: boolean; register?: boolean } = {}): Item {
  const w = o.w ?? f.col.w;
  const padX = 26;
  const inner = w - 2 * padX;
  const tl = title ? wrapText(title, inner, 36, 700) : [];
  const bodyLines = lines.map((l, i) => wrapText(l, inner, S.body));
  const h = 22 + tl.length * 50 + (tl.length && bodyLines.length ? 6 : 0) + bodyLines.reduce((a, b) => a + b.length * S.lh + 6, 0) + 16;
  return {
    h,
    p,
    gap: 20,
    draw: (y) => {
      const x = f.col.x;
      let cy = y + 22;
      const out: string[] = [rect({ x, y, w, h }, 24, C.white, `stroke="${C.line}" stroke-width="2"`)];
      if (title) {
        const tb = textBlock(f, title, { x: x + padX, y: cy, w: inner, size: 36, weight: 700, lh: 50, fill: o.link ? C.link : C.ink });
        out.push(tb.svg);
        if (o.register) addTarget(f, title, { x: x + padX, y: cy, w: inner, h: tb.h }, { x: x + padX + Math.min(tb.maxW / 2, 200), y: cy + tb.h / 2 });
        cy += tb.h + 6;
      }
      lines.forEach((l, i) => {
        const tb = textBlock(f, l, { x: x + padX, y: cy, w: inner, fill: i === 0 && !title ? C.ink : C.muted });
        out.push(tb.svg);
        if (o.register) addTarget(f, l, { x: x + padX, y: cy, w: inner, h: tb.h }, { x: x + padX + Math.min(tb.maxW / 2, 200), y: cy + tb.h / 2 });
        cy += tb.h + 6;
      });
      return out.join('');
    },
  };
}

/* ---------------- modelos ---------------- */

function windowOf(f: F, i: number) {
  const w = f.sch.windows[i]!;
  return { s: w.start, e: w.end };
}

function drawChat(f: F, ch: Chrome): string {
  const { t } = f;
  const barH = f.phone ? 112 : 124;
  const view = { x: ch.body.x, y: ch.body.y, w: ch.body.w, h: ch.body.h - barH };
  const items: Item[] = [];
  let typingNow = null as { text: string; done: boolean } | null;
  f.steps.forEach((st, i) => {
    const { s, e } = windowOf(f, i);
    if (st.kind === 'type') {
      const sa = sentAt(s, e, st.text.length);
      if (t >= s && t < sa) typingNow = { text: typedText(st.text, t, s, e), done: t >= s + typeDur(e - s, st.text.length) };
      if (t >= sa) items.push(bubbleItem(f, 'user', st.text, prog(t, sa, sa + 0.3), view));
    } else if (st.kind === 'message') {
      if (t < s) return;
      if (st.from === 'ai') {
        const dots = Math.min(0.6, (e - s) * 0.25);
        if (t < s + dots) {
          items.push(dotsItem(f, t));
          return;
        }
        const words = [...st.text.matchAll(/\S+/g)];
        const chunks = Math.max(1, Math.ceil(words.length / 3));
        const rev = Math.max(0.3, Math.min((e - s) * 0.9 - dots, chunks * 0.2));
        const k = Math.max(1, Math.ceil(prog(t, s + dots, s + dots + rev) * chunks - 1e-9));
        const cut = k >= chunks ? st.text.length : words[Math.min(words.length - 1, k * 3 - 1)]!.index! + words[Math.min(words.length - 1, k * 3 - 1)]![0].length;
        items.push(bubbleItem(f, 'ai', st.text.slice(0, cut), prog(t, s + dots, s + dots + 0.25), view, st.text));
      } else items.push(bubbleItem(f, st.from, st.text, prog(t, s, s + 0.3), view));
    } else if (st.kind === 'show') {
      if (t >= s) items.push(cardItem(f, st.title, st.lines ?? [], prog(t, s, s + 0.35), { w: f.phone ? view.w - 2 * f.pad : f.col.w, register: true }));
    }
  });
  const parts: string[] = [];
  parts.push(flow(f, items, view, { padTop: 20, padBottom: 20 }));
  // barra de digitação
  const by = ch.body.y + ch.body.h - barH;
  parts.push(rect({ x: ch.body.x, y: by, w: ch.body.w, h: barH }, 0, C.white), `<path d="M${ch.body.x} ${by} H${ch.body.x + ch.body.w}" stroke="${C.line}" stroke-width="2"/>`);
  const fx = f.col.x;
  const fw = f.col.w - 84;
  const fy = by + (barH - 76) / 2;
  const ty = typingNow;
  parts.push(rect({ x: fx, y: fy, w: fw, h: 76 }, 38, C.screen, `stroke="${ty ? C.ink : C.line}" stroke-width="2"`));
  if (ty) {
    const tt = ty.text;
    parts.push(`<text x="${fx + 28}" y="${fy + 38 + S.body * 0.34}" font-size="${S.body}" fill="${C.ink}" xml:space="preserve">${esc(fieldText(tt, fw - 70, S.body))}<tspan font-weight="400">|</tspan></text>`);
  } else parts.push(`<text x="${fx + 28}" y="${fy + 38 + S.body * 0.34}" font-size="${S.body}" fill="${C.faint}">${esc(ellipsize('Mensagem', fw - 70, S.body))}</text>`);
  const sx = fx + fw + 42;
  parts.push(`<circle cx="${sx}" cy="${fy + 38}" r="38" fill="${ty ? C.navy : C.chip}"/>${icon('send', sx, fy + 38, 40, ty ? C.lime : C.faint)}`);
  addTarget(f, 'enviar', { x: sx - 38, y: fy, w: 76, h: 76 });
  return parts.join('');
}

function drawBrowser(f: F, ch: Chrome): string {
  const { t } = f;
  const parts: string[] = [];
  const barH = f.phone ? 104 : 92;
  // barra de endereço/busca
  const bar = { x: ch.body.x, y: ch.body.y, w: ch.body.w, h: barH };
  parts.push(rect(bar, 0, C.white), `<path d="M${bar.x} ${bar.y + barH} H${bar.x + bar.w}" stroke="${C.line}" stroke-width="2"/>`);
  const fieldW = f.phone ? bar.w - 2 * f.pad : Math.min(1300, bar.w - 360);
  const fx = f.phone ? bar.x + f.pad : bar.x + (bar.w - fieldW) / 2;
  const fy = bar.y + (barH - 68) / 2;
  let text = '';
  let active = false;
  let hasType = false;
  f.steps.forEach((st, i) => {
    if (st.kind !== 'type') return;
    const { s, e } = windowOf(f, i);
    if (t >= s) {
      hasType = true;
      text = typedText(st.text, t, s, e);
      active = t < s + typeDur(e - s, st.text.length) + 0.3;
    }
  });
  if (!f.phone) {
    parts.push(icon('back', bar.x + 56, fy + 34, 38, C.muted), icon('back', bar.x + 112, fy + 34, 38, C.faint).replace(/<path /, '<path transform="' + `rotate(180 ${bar.x + 112} ${fy + 34})` + '" '));
  }
  parts.push(rect({ x: fx, y: fy, w: fieldW, h: 68 }, 34, C.screen, `stroke="${active ? C.ink : C.line}" stroke-width="2"`), icon(hasType ? 'search' : 'lock', fx + 38, fy + 34, 34, C.muted));
  const avail = fieldW - 100;
  parts.push(`<text x="${fx + 76}" y="${fy + 34 + S.body * 0.34}" font-size="${S.body}" fill="${hasType ? C.ink : C.faint}" xml:space="preserve">${esc(hasType ? fieldText(text, avail, S.body) : ellipsize('Pesquise ou digite um endereço', avail, S.body))}${active ? '<tspan>|</tspan>' : ''}</text>`);
  const view = { x: ch.body.x, y: ch.body.y + barH, w: ch.body.w, h: ch.body.h - barH };
  const items: Item[] = [
    { h: 130, p: 1, gap: 6, draw: (y) => `<text x="${f.col.x + f.col.w / 2}" y="${y + 86}" font-size="48" font-weight="700" fill="${C.faint}" text-anchor="middle">${esc(ellipsize(f.mock.app, f.col.w, 48, 700))}</text>` },
  ];
  f.steps.forEach((st, i) => {
    if (st.kind === 'show' && t >= windowOf(f, i).s) items.push(cardItem(f, st.title, st.lines ?? [], prog(t, windowOf(f, i).s, windowOf(f, i).s + 0.35), { link: true, register: true, w: f.col.w }));
  });
  parts.push(flow(f, items, view, { padTop: 16 }));
  return parts.join('');
}

function drawForm(f: F, ch: Chrome): string {
  const { t } = f;
  const taps: string[] = [];
  f.steps.forEach((st) => {
    if (st.kind === 'tap' && !taps.some((x) => norm(x) === norm(st.label))) taps.push(st.label);
  });
  const btnH = taps.length ? (f.phone ? 150 : 140) : 0;
  const view = { x: ch.body.x, y: ch.body.y, w: ch.body.w, h: ch.body.h - btnH };
  const items: Item[] = [];
  // cabeçalho do perfil (decoração genérica: avatar e barras cinzas)
  items.push({
    h: 150,
    p: 1,
    gap: 20,
    draw: (y) => `<circle cx="${f.col.x + 64}" cy="${y + 75}" r="56" fill="${C.chip}"/><circle cx="${f.col.x + 64}" cy="${y + 62}" r="20" fill="${C.faint}"/><path d="M${f.col.x + 24} ${y + 118} a40 34 0 0 1 80 0 Z" fill="${C.faint}"/>${rect({ x: f.col.x + 150, y: y + 48, w: Math.min(260, f.col.w - 170), h: 22 }, 11, C.chip)}${rect({ x: f.col.x + 150, y: y + 86, w: Math.min(180, f.col.w - 170), h: 18 }, 9, C.line)}`,
  });
  const fieldItem = (label: string | undefined, hint: string[], getText: () => string, focused: boolean, p: number): Item => {
    const inner = f.col.w - 2 * 22;
    const lab = label ? wrapText(label, f.col.w, S.label + 2, 700) : [];
    const hl = hint.map((x) => wrapText(x, f.col.w, S.small));
    const boxLines = () => Math.max(1, wrapText(getText() || ' ', inner - 8, S.body).length);
    const boxH = boxLines() * S.lh + 36;
    const h = lab.length * 42 + hl.reduce((a, b) => a + b.length * S.slh, 0) + boxH + 8;
    return {
      h,
      p,
      gap: 22,
      draw: (y) => {
        let cy = y;
        const out: string[] = [];
        if (label) {
          const tb = textBlock(f, label, { x: f.col.x, y: cy, w: f.col.w, size: S.label + 2, weight: 700, lh: 42 });
          out.push(tb.svg);
          cy += tb.h;
        }
        hint.forEach((x) => {
          const tb = textBlock(f, x, { x: f.col.x, y: cy, w: f.col.w, size: S.small, lh: S.slh, fill: C.muted });
          out.push(tb.svg);
          cy += tb.h;
        });
        cy += 8;
        out.push(rect({ x: f.col.x, y: cy, w: f.col.w, h: boxH }, 20, C.white, `stroke="${focused ? C.ink : C.line}" stroke-width="${focused ? 4 : 2}"`));
        const tb = textBlock(f, getText(), { x: f.col.x + 22, y: cy + 18, w: inner, caret: focused });
        out.push(tb.svg);
        if (label) addTarget(f, label, { x: f.col.x, y: cy, w: f.col.w, h: boxH });
        return out.join('');
      },
    };
  };
  for (let i = 0; i < f.steps.length; i++) {
    const st = f.steps[i]!;
    const { s, e } = windowOf(f, i);
    if (st.kind === 'show') {
      const nxt = f.steps[i + 1];
      if (nxt && nxt.kind === 'type') {
        const nw = windowOf(f, i + 1);
        if (t < s) continue;
        const ntext = nxt.text;
        const typed = () => (t >= nw.s ? typedText(ntext, t, nw.s, nw.e) : '');
        const focused = t >= nw.s && t < nw.s + typeDur(nw.e - nw.s, ntext.length) + 0.5 || (t >= s && t < nw.s);
        items.push(fieldItem(st.title, st.lines ?? [], typed, focused && t < nw.e + 0.4, prog(t, s, s + 0.35)));
        i++; // o `type` seguinte já foi consumido
      } else if (t >= s) items.push(cardItem(f, st.title, st.lines ?? [], prog(t, s, s + 0.35), { register: true }));
    } else if (st.kind === 'type') {
      if (t < s) continue;
      const typed = () => typedText(st.text, t, s, e);
      items.push(fieldItem(undefined, [], typed, t < s + typeDur(e - s, st.text.length) + 0.5, prog(t, s, s + 0.3)));
    }
  }
  const parts = [flow(f, items, view, { padTop: 24 })];
  if (taps.length) {
    const by = ch.body.y + ch.body.h - btnH;
    parts.push(rect({ x: ch.body.x, y: by, w: ch.body.w, h: btnH }, 0, C.white), `<path d="M${ch.body.x} ${by} H${ch.body.x + ch.body.w}" stroke="${C.line}" stroke-width="2"/>`);
    const n = taps.length;
    const gap = 20;
    const totalW = f.phone ? f.col.w : Math.min(f.col.w, n * 420 + (n - 1) * gap);
    const bw = (totalW - (n - 1) * gap) / n;
    const x0 = f.phone ? f.col.x : f.col.x + f.col.w - totalW;
    taps.forEach((lab, k) => {
      const x = x0 + k * (bw + gap);
      const y = by + (btnH - 92) / 2;
      const primary = k === 0;
      parts.push(rect({ x, y, w: bw, h: 92 }, 46, primary ? C.navy : C.white, primary ? '' : `stroke="${C.ink}" stroke-width="3"`));
      parts.push(`<text x="${num(x + bw / 2)}" y="${num(y + 46 + S.body * 0.34)}" font-size="${S.body - 2}" font-weight="700" fill="${primary ? C.white : C.ink}" text-anchor="middle">${esc(ellipsize(lab, bw - 32, S.body - 2, 700))}</text>`);
      addTarget(f, lab, { x, y, w: bw, h: 92 });
    });
  }
  return parts.join('');
}

function drawSettings(f: F, ch: Chrome): string {
  const { t } = f;
  const view = ch.body;
  // estado de cada interruptor: 0 = desligado ... 1 = ligado
  const order: string[] = [];
  const state = new Map<string, { prev: number; target: number; start: number }>();
  const labels = new Map<string, string>();
  f.steps.forEach((st, i) => {
    if (st.kind !== 'toggle') return;
    const k = norm(st.label);
    const { s } = windowOf(f, i);
    if (!state.has(k)) {
      order.push(k);
      labels.set(k, st.label);
      state.set(k, { prev: st.on ? 0 : 1, target: st.on ? 1 : 0, start: s });
      return;
    }
    const cur = state.get(k)!;
    const val = cur.prev + (cur.target - cur.prev) * ez(prog(t, cur.start + 0.1, cur.start + 0.55));
    if (t >= s) state.set(k, { prev: cur.target, target: st.on ? 1 : 0, start: s });
    else void val;
  });
  const sw = (k: string) => {
    const st = state.get(k)!;
    return st.prev + (st.target - st.prev) * ez(prog(t, st.start + 0.1, st.start + 0.55));
  };
  const items: Item[] = [];
  if (order.length) {
    const rows = order.map((k) => {
      const lines = wrapText(labels.get(k)!, f.col.w - 44 - 140, S.body);
      return { k, lines, h: Math.max(116, lines.length * S.lh + 48) };
    });
    const gh = rows.reduce((a, r) => a + r.h, 0);
    items.push({
      h: gh,
      p: 1,
      gap: 24,
      draw: (y) => {
        const out = [rect({ x: f.col.x, y, w: f.col.w, h: gh }, 28, C.white, `stroke="${C.line}" stroke-width="2"`)];
        let cy = y;
        rows.forEach((r, idx) => {
          const tb = textBlock(f, labels.get(r.k)!, { x: f.col.x + 28, y: cy + (r.h - r.lines.length * S.lh) / 2, w: f.col.w - 44 - 140 });
          out.push(tb.svg);
          const v = sw(r.k);
          const sx = f.col.x + f.col.w - 28 - 104;
          const sy = cy + r.h / 2 - 31;
          const track = v > 0.5 ? C.navy : '#CBD5E1';
          out.push(rect({ x: sx, y: sy, w: 104, h: 62 }, 31, track));
          out.push(`<circle cx="${num(sx + 31 + v * 42)}" cy="${num(sy + 31)}" r="25" fill="${v > 0.5 ? C.lime : C.white}"/>`);
          if (idx < rows.length - 1) out.push(`<path d="M${f.col.x + 28} ${cy + r.h} H${f.col.x + f.col.w}" stroke="${C.line}" stroke-width="2"/>`);
          addTarget(f, labels.get(r.k)!, { x: f.col.x, y: cy, w: f.col.w, h: r.h }, { x: sx + 52, y: sy + 31 });
          cy += r.h;
        });
        return out.join('');
      },
    });
  }
  f.steps.forEach((st, i) => {
    if (st.kind === 'show' && t >= windowOf(f, i).s) items.push(cardItem(f, st.title, st.lines ?? [], prog(t, windowOf(f, i).s, windowOf(f, i).s + 0.35), { register: true }));
  });
  return flow(f, items, view, { padTop: 28 });
}

/* ---- agenda ---- */

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function parseDay(s: string): number {
  const n = norm(s);
  const map: Array<[string, number]> = [['seg', 0], ['ter', 1], ['qua', 2], ['qui', 3], ['sex', 4], ['sab', 5], ['dom', 6]];
  for (const [p, i] of map) if (n.startsWith(p) || n.split(' ').some((w) => w.startsWith(p))) return i;
  return 0;
}

export function parseTime(s: string): { start: number; end: number } {
  const ms = [...s.matchAll(/(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?/g)].filter((m) => m[0].trim().length > 0 && Number(m[1]) <= 24);
  if (!ms.length) return { start: 9, end: 10 };
  const h = (m: RegExpMatchArray) => Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
  const start = h(ms[0]!);
  const end = ms[1] ? h(ms[1]) : start + 1;
  return { start, end: end > start ? end : start + 1 };
}

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

interface Banner {
  title?: string;
  lines: string[];
  p: number;
}

function banner(f: F, ch: Chrome, b: Banner): string {
  const w = f.phone ? ch.body.w - 2 * f.pad : Math.min(1100, ch.body.w - 2 * f.pad);
  const x = ch.body.x + (ch.body.w - w) / 2;
  const inner = w - 56;
  const tl = b.title ? wrapText(b.title, inner, S.body, 700) : [];
  const bl = b.lines.flatMap((l) => wrapText(l, inner, S.body));
  const lines = [...tl.map((l) => ({ ...l, bold: true })), ...bl.map((l) => ({ ...l, bold: false }))].slice(0, 6);
  const h = lines.length * S.lh + 36;
  const e = ez(b.p);
  const y = ch.body.y + ch.body.h - f.inset - h - 26 + (1 - e) * 40;
  const backdrop = f.phone ? rect({ x: ch.body.x, y: y - 14, w: ch.body.w, h: ch.body.y + ch.body.h - f.inset - y + 14 }, 0, C.screen, `stroke="${C.line}" stroke-width="2"`) : '';
  const out = [`<g opacity="${num(e)}">${backdrop}`, rect({ x: x + 4, y: y + 8, w, h }, 26, 'rgba(11,20,36,0.18)'), rect({ x, y, w, h }, 26, '#FFF6CC', `stroke="${C.hl}" stroke-width="3"`)];
  let cy = y + 18;
  const full = lines.map((l) => l.text).join(' ');
  void full;
  lines.forEach((l) => {
    out.push(`<text x="${num(x + 28)}" y="${num(cy + S.lh / 2 + S.body * 0.34)}" font-size="${S.body}" font-weight="${l.bold ? 700 : 400}" fill="${C.ink}" xml:space="preserve">${esc(l.text)}</text>`);
    cy += S.lh;
  });
  out.push('</g>');
  return out.join('');
}

function drawCalendar(f: F, ch: Chrome): string {
  const { t } = f;
  interface Ev {
    title: string;
    day: number;
    start: number;
    end: number;
    color: string;
    s: number;
    e: number;
  }
  const evs: Ev[] = [];
  f.steps.forEach((st, i) => {
    if (st.kind !== 'event') return;
    const { s, e } = windowOf(f, i);
    const tm = parseTime(st.time);
    evs.push({ title: st.title, day: parseDay(st.day), start: tm.start, end: tm.end, color: EVENT_COLORS[norm(st.color ?? '').replace(/ /g, '-')] ?? EVENT_COLORS.azul!, s, e });
  });
  const parts: string[] = [];
  const first = evs[0];
  const startedNow = [...evs].filter((x) => t >= x.s);
  const sel = (startedNow.length ? startedNow[startedNow.length - 1]! : first)?.day ?? 0;
  const hours0 = 6;
  const hours1 = 23;
  const rh = f.phone ? 110 : 118;
  const headH = f.phone ? 150 : 104;
  const gridView = { x: ch.body.x, y: ch.body.y + headH, w: ch.body.w, h: ch.body.h - headH };
  const labelW = f.phone ? 96 : 110;
  const focus = first ? first.start : 9;
  const total = (hours1 - hours0 + 1) * rh;
  const scrollY = Math.max(0, Math.min(Math.ceil((total + 56 - gridView.h) / rh) * rh, Math.round(((focus - hours0) * rh - gridView.h * 0.3) / rh) * rh));
  // cabeçalho dos dias
  parts.push(rect({ x: ch.body.x, y: ch.body.y, w: ch.body.w, h: headH }, 0, C.white), `<path d="M${ch.body.x} ${ch.body.y + headH} H${ch.body.x + ch.body.w}" stroke="${C.line}" stroke-width="2"/>`);
  const colW = f.phone ? (ch.body.w - 2 * f.pad) / 7 : (ch.body.w - labelW - 40) / 7;
  const gx0 = f.phone ? ch.body.x + f.pad : ch.body.x + labelW;
  DAYS.forEach((d, i) => {
    const cx = gx0 + (f.phone ? colW * i + colW / 2 : colW * i + colW / 2);
    const isSel = i === sel;
    if (f.phone) {
      parts.push(`<text x="${num(cx)}" y="${num(ch.body.y + 44)}" font-size="26" font-weight="600" fill="${C.muted}" text-anchor="middle">${esc(d)}</text>`);
      if (isSel) parts.push(`<circle cx="${num(cx)}" cy="${num(ch.body.y + 94)}" r="30" fill="${C.navy}"/>`);
      parts.push(`<text x="${num(cx)}" y="${num(ch.body.y + 94 + 11)}" font-size="30" font-weight="700" fill="${isSel ? C.white : C.ink}" text-anchor="middle">${i + 1}</text>`);
      if (evs.some((x) => x.day === i && t >= x.s)) parts.push(`<circle cx="${num(cx)}" cy="${num(ch.body.y + 136)}" r="6" fill="${C.link}"/>`);
    } else {
      parts.push(`<text x="${num(cx)}" y="${num(ch.body.y + 62)}" font-size="${S.body}" font-weight="${isSel ? 700 : 600}" fill="${isSel ? C.ink : C.muted}" text-anchor="middle">${esc(d)}</text>`);
      if (isSel) parts.push(rect({ x: cx - colW / 2 + 10, y: ch.body.y + headH - 8, w: colW - 20, h: 6 }, 3, C.navy));
    }
  });
  if (f.phone) parts.push(`<text x="${ch.body.x + f.pad}" y="${ch.body.y + 18}" font-size="1" fill="none"> </text>`);
  // grade de horas
  const id = `cg${f.defs.length}`;
  f.defs.push(`<clipPath id="${id}"><rect x="${num(gridView.x)}" y="${num(gridView.y)}" width="${num(gridView.w)}" height="${num(gridView.h)}"/></clipPath>`);
  const g: string[] = [];
  for (let h = hours0; h <= hours1; h++) {
    const y = gridView.y + 28 + (h - hours0) * rh - scrollY;
    if (y < gridView.y + 14 || y > gridView.y + gridView.h + 14) continue;
    g.push(`<path d="M${num(ch.body.x + (f.phone ? labelW : labelW - 10))} ${num(y)} H${num(ch.body.x + ch.body.w - (f.phone ? f.pad : 40))}" stroke="${C.line}" stroke-width="2"/>`);
    g.push(`<text x="${num(ch.body.x + (f.phone ? labelW - 14 : labelW - 22))}" y="${num(y + 12)}" font-size="26" fill="${C.muted}" text-anchor="end">${String(h).padStart(2, '0')}:00</text>`);
  }
  if (!f.phone) {
    for (let i = 0; i <= 7; i++) {
      const x = gx0 + i * colW;
      g.push(`<path d="M${num(x)} ${num(gridView.y)} V${num(gridView.y + gridView.h)}" stroke="${C.line}" stroke-width="2"/>`);
    }
  }
  const evX = (day: number) => (f.phone ? ch.body.x + labelW + 10 : gx0 + day * colW + 6);
  const evW = f.phone ? ch.body.w - labelW - 10 - f.pad : colW - 12;
  for (const ev of evs) {
    if (!f.phone ? false : ev.day !== sel) continue;
    const slotY = gridView.y + 28 + (ev.start - hours0) * rh - scrollY;
    const eh = Math.max(rh, (ev.end - ev.start) * rh) - 6;
    const x = evX(ev.day);
    if (t >= ev.s - 0.0 && t < ev.e + 0.0) {
      // espaço reservado (tracejado) enquanto o bloco cai
      const pg = prog(t, ev.s, ev.s + 0.35);
      if (pg < 1 && t < ev.s + 0.5) g.push(rect({ x, y: slotY + 3, w: evW, h: eh }, 12, 'none', `stroke="${ev.color}" stroke-width="3" stroke-dasharray="14 10" opacity="${num(0.5 * pg)}"`));
    }
    if (t < ev.s + 0.2) continue;
    const dp = prog(t, ev.s + 0.2, ev.s + 0.2 + Math.min(0.7, (ev.e - ev.s) * 0.6));
    const e = ez(dp);
    const y = slotY + 3 - (1 - e) * 180;
    const lines = wrapText(ev.title, evW - 28, f.phone ? S.body : 30, 700).slice(0, 2);
    g.push(`<g opacity="${num(e)}">${rect({ x, y, w: evW, h: eh }, 14, ev.color)}`);
    const tb = textBlock(f, ev.title, { x: x + 16, y: y + 10, w: evW - 28, size: f.phone ? S.body : 30, weight: 700, fill: C.white, lh: f.phone ? 46 : 38, maxLines: 2 });
    g.push(tb.svg);
    g.push(`<text x="${num(x + 16)}" y="${num(y + 10 + lines.length * (f.phone ? 46 : 38) + 18)}" font-size="26" fill="${C.white}" opacity="0.92">${fmtHour(ev.start)} – ${fmtHour(ev.end)}</text></g>`);
    addTarget(f, ev.title, { x, y, w: evW, h: eh });
  }
  parts.push(`<g clip-path="url(#${id})">${g.join('')}</g>`);
  // novo evento (digitação do título)
  f.steps.forEach((st, i) => {
    if (st.kind !== 'type') return;
    const { s, e } = windowOf(f, i);
    if (t < s || t >= e + 0.05) return;
    const w = f.phone ? ch.body.w - 2 * f.pad : 760;
    const x = f.phone ? ch.body.x + f.pad : ch.body.x + (ch.body.w - w) / 2;
    const h = 210;
    const y = f.phone ? ch.body.y + ch.body.h - h - 30 : ch.body.y + 150;
    const e1 = ez(prog(t, s, s + 0.3));
    parts.push(`<g opacity="${num(e1)}">${rect({ x: x + 4, y: y + 8, w, h }, 28, 'rgba(11,20,36,0.2)')}${rect({ x, y, w, h }, 28, C.white, `stroke="${C.line}" stroke-width="2"`)}<text x="${x + 28}" y="${y + 52}" font-size="${S.small}" font-weight="600" fill="${C.muted}">Novo evento</text>${rect({ x: x + 24, y: y + 78, w: w - 48, h: 96 }, 20, C.screen, `stroke="${C.ink}" stroke-width="3"`)}<text x="${x + 46}" y="${y + 126 + S.body * 0.34}" font-size="${S.body}" fill="${C.ink}" xml:space="preserve">${esc(fieldText(typedText(st.text, t, s, e), w - 100, S.body))}<tspan>|</tspan></text></g>`);
  });
  return parts.join('');
}

/* ---- planilha ---- */

function parseNumber(raw: string): number | null {
  let s = raw.replace(/R\$|\s/g, '');
  if (!/^-?[\d.,]+%?$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/%$/, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(n: number, money: boolean): string {
  const dec = money || !Number.isInteger(n) ? 2 : 0;
  const [i, d] = Math.abs(n).toFixed(dec).split('.');
  const body = i!.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? `,${d}` : '');
  return `${n < 0 ? '-' : ''}${money ? 'R$ ' : ''}${body}`;
}

const colIndex = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Valor exibido de uma célula: fórmulas simples (SOMA/MÉDIA/MÁXIMO/MÍNIMO de intervalo, + e -) são calculadas; senão mostra o texto. */
export function evalCell(raw: string, cells: Map<string, string>): string {
  if (!raw.startsWith('=')) return raw;
  const get = (ref: string) => {
    const v = cells.get(ref.toUpperCase());
    return v === undefined ? null : parseNumber(v);
  };
  const money = [...cells.values()].some((v) => /R\$/.test(v));
  const m = /^=\s*(SOMA|SUM|M[EÉ]DIA|AVERAGE|M[AÁ]XIMO|MAX|M[IÍ]NIMO|MIN)\s*\(\s*([A-Z]{1,2})(\d+)\s*[:;]\s*([A-Z]{1,2})(\d+)\s*\)\s*$/i.exec(raw);
  if (m) {
    const vals: number[] = [];
    for (let c = Math.min(colIndex(m[2]!.toUpperCase()), colIndex(m[4]!.toUpperCase())); c <= Math.max(colIndex(m[2]!.toUpperCase()), colIndex(m[4]!.toUpperCase())); c++)
      for (let r = Math.min(Number(m[3]), Number(m[5])); r <= Math.max(Number(m[3]), Number(m[5])); r++) {
        const v = get(`${String.fromCharCode(65 + c)}${r}`);
        if (v !== null) vals.push(v);
      }
    if (!vals.length) return raw;
    const fn = norm(m[1]!);
    const out = fn === 'soma' || fn === 'sum' ? vals.reduce((a, b) => a + b, 0) : fn === 'media' || fn === 'average' ? vals.reduce((a, b) => a + b, 0) / vals.length : fn === 'maximo' || fn === 'max' ? Math.max(...vals) : Math.min(...vals);
    return fmtNumber(out, money);
  }
  const terms = raw.slice(1).split(/([+-])/).map((x) => x.trim());
  if (terms.length >= 3 || terms.length === 1) {
    let acc = 0;
    let sign = 1;
    for (const tm of terms) {
      if (tm === '+') sign = 1;
      else if (tm === '-') sign = -1;
      else {
        const v = /^[A-Za-z]{1,2}\d+$/.test(tm) ? get(tm) : parseNumber(tm);
        if (v === null) return raw;
        acc += sign * v;
      }
    }
    return fmtNumber(acc, money);
  }
  return raw;
}

function drawSheet(f: F, ch: Chrome): string {
  const { t } = f;
  const parts: string[] = [];
  const colW = f.phone ? 200 : 290;
  const rowH = f.phone ? 68 : 72;
  const hdrH = 56;
  const rhW = f.phone ? 56 : 84;
  const size = f.phone ? 27 : 32;
  const fbH = 88;
  const NC = 6;
  interface Cs {
    ref: string;
    col: number;
    row: number;
    raw: string;
    s: number;
    e: number;
  }
  const cs: Cs[] = [];
  f.steps.forEach((st, i) => {
    if (st.kind !== 'cell') return;
    const { s, e } = windowOf(f, i);
    const m = /^([A-Z]{1,2})(\d+)$/.exec(st.ref)!;
    cs.push({ ref: st.ref, col: Math.min(NC - 1, colIndex(m[1]!)), row: Number(m[2]) - 1, raw: st.value, s, e });
  });
  const maxRow = cs.reduce((m, c) => Math.max(m, c.row), 0);
  const view = { x: ch.body.x, y: ch.body.y + fbH + hdrH, w: ch.body.w, h: ch.body.h - fbH - hdrH };
  const nRows = Math.max(maxRow + 4, Math.ceil(view.h / rowH) + 1, 12);
  const gridW = view.w - rhW;
  // estado atual: células confirmadas (valor em tela) e a selecionada
  const cells = new Map<string, string>();
  const shown = new Map<string, { text: string; p: number }>();
  let sel: Cs | undefined;
  let prevSel: Cs | undefined;
  let bar = '';
  let barActive = false;
  for (const c of cs) {
    if (t < c.s) break;
    const commit = c.s + (c.e - c.s) * 0.62;
    prevSel = sel;
    sel = c;
    const typeEnd = c.s + Math.min((c.e - c.s) * 0.55, Math.max(0.4, c.raw.length / 16));
    if (t < commit) {
      bar = typedText(c.raw, t, c.s + 0.1, typeEnd + 0.1);
      barActive = true;
    } else {
      bar = c.raw;
      barActive = false;
      cells.set(c.ref, c.raw);
      const disp = evalCell(c.raw, cells);
      cells.set(c.ref, disp);
      shown.set(c.ref, { text: disp, p: prog(t, commit, commit + 0.25) });
    }
  }
  // rolagem (acompanha a célula selecionada, com transição suave)
  const scrollFor = (c?: Cs) => ({
    x: c ? Math.max(0, (c.col + 1) * colW - gridW) : 0,
    y: c ? Math.max(0, (c.row + 1) * rowH + 8 - view.h) : 0,
  });
  const a = scrollFor(prevSel);
  const b = scrollFor(sel);
  const k = sel ? ez(prog(t, sel.s, sel.s + 0.4)) : 1;
  const sx = a.x + (b.x - a.x) * k;
  const sy = a.y + (b.y - a.y) * k;
  // barra de fórmulas
  parts.push(rect({ x: ch.body.x, y: ch.body.y, w: ch.body.w, h: fbH }, 0, C.white), `<path d="M${ch.body.x} ${ch.body.y + fbH} H${ch.body.x + ch.body.w}" stroke="${C.line}" stroke-width="2"/>`);
  parts.push(rect({ x: ch.body.x + 16, y: ch.body.y + 14, w: f.phone ? 100 : 130, h: fbH - 28 }, 14, C.screen), `<text x="${ch.body.x + 16 + (f.phone ? 50 : 65)}" y="${ch.body.y + fbH / 2 + 10}" font-size="30" font-weight="700" fill="${C.ink}" text-anchor="middle">${esc(sel?.ref ?? '')}</text>`);
  const fxX = ch.body.x + 16 + (f.phone ? 116 : 146);
  parts.push(`<text x="${fxX + 8}" y="${ch.body.y + fbH / 2 + 10}" font-size="30" font-weight="700" fill="${C.faint}" font-style="italic">fx</text>`);
  const bt = textBlock(f, bar, { x: fxX + 64, y: ch.body.y + (fbH - 48) / 2, w: ch.body.x + ch.body.w - (fxX + 64) - 16, lh: 48, size: f.phone ? 28 : S.body, caret: barActive, maxLines: 1 });
  parts.push(bt.svg);
  // grade
  const id = `cg${f.defs.length}`;
  f.defs.push(`<clipPath id="${id}"><rect x="${num(view.x)}" y="${num(ch.body.y + fbH)}" width="${num(view.w)}" height="${num(view.h + hdrH)}"/></clipPath>`);
  const g: string[] = [rect({ x: view.x, y: ch.body.y + fbH, w: view.w, h: view.h + hdrH }, 0, C.white)];
  const gx = view.x + rhW - sx;
  const gy = view.y - sy;
  for (let r = 0; r < nRows; r++) {
    const y = gy + r * rowH;
    if (y + rowH < view.y || y > view.y + view.h) continue;
    if (sel && sel.row === r) g.push(rect({ x: view.x, y, w: view.w, h: rowH }, 0, '#F1F5C8', 'opacity="0.55"'));
    g.push(`<path d="M${view.x} ${num(y + rowH)} H${view.x + view.w}" stroke="${C.line}" stroke-width="2"/>`);
  }
  for (let c = 0; c <= NC; c++) g.push(`<path d="M${num(gx + c * colW)} ${num(view.y - hdrH)} V${view.y + view.h}" stroke="${C.line}" stroke-width="2"/>`);
  for (const c of cs) {
    const sh = shown.get(c.ref);
    if (!sh) continue;
    const x = gx + c.col * colW;
    const y = gy + c.row * rowH;
    if (y + rowH < view.y || y > view.y + view.h) continue;
    const isNum = parseNumber(sh.text) !== null;
    const tx = ellipsize(sh.text, colW - 24, size, isNum ? 600 : 400);
    const hl = f.hls.find((h) => sh.text.toLowerCase().includes(h.needle));
    if (hl) {
      hl.matched = true;
      g.push(rect({ x: x + 4, y: y + 6, w: (colW - 8) * ez(hl.p), h: rowH - 12 }, 8, C.hl));
    }
    g.push(`<g opacity="${num(sh.p)}"><text x="${num(isNum ? x + colW - 14 : x + 14)}" y="${num(y + rowH / 2 + size * 0.34)}" font-size="${size}" font-weight="${isNum ? 600 : 400}" fill="${C.ink}" text-anchor="${isNum ? 'end' : 'start'}" xml:space="preserve">${esc(tx)}</text></g>`);
    addTarget(f, c.raw, { x, y, w: colW, h: rowH });
  }
  if (sel) {
    const x = gx + sel.col * colW;
    const y = gy + sel.row * rowH;
    g.push(rect({ x, y, w: colW, h: rowH }, 0, 'none', `stroke="${C.navy}" stroke-width="5"`));
  }
  // cabeçalhos fixos (colunas A–F e números das linhas)
  g.push(rect({ x: view.x, y: ch.body.y + fbH, w: view.w, h: hdrH }, 0, '#E7EBF1'));
  for (let c = 0; c < NC; c++) {
    const x = gx + c * colW;
    const on = sel?.col === c;
    if (on) g.push(rect({ x, y: ch.body.y + fbH, w: colW, h: hdrH }, 0, '#CBD5E1'));
    g.push(`<text x="${num(x + colW / 2)}" y="${num(ch.body.y + fbH + hdrH / 2 + 10)}" font-size="28" font-weight="700" fill="${C.ink}" text-anchor="middle">${String.fromCharCode(65 + c)}</text>`);
  }
  g.push(rect({ x: view.x, y: view.y, w: rhW, h: view.h }, 0, '#E7EBF1'));
  for (let r = 0; r < nRows; r++) {
    const y = gy + r * rowH;
    if (y + rowH < view.y || y > view.y + view.h) continue;
    if (sel?.row === r) g.push(rect({ x: view.x, y, w: rhW, h: rowH }, 0, '#CBD5E1'));
    g.push(`<text x="${view.x + rhW / 2}" y="${num(y + rowH / 2 + 10)}" font-size="26" font-weight="600" fill="${C.ink}" text-anchor="middle">${r + 1}</text>`);
  }
  g.push(rect({ x: view.x, y: ch.body.y + fbH, w: rhW, h: hdrH }, 0, '#D5DBE5'));
  parts.push(`<g clip-path="url(#${id})">${g.join('')}</g>`);
  return parts.join('');
}

/* ---- anotações ---- */

function drawNotes(f: F, ch: Chrome): string {
  const { t } = f;
  const parts: string[] = [];
  let view: Rect;
  let col = f.col;
  const innerPad = f.phone ? 0 : 56;
  if (f.phone) view = ch.body;
  else {
    const pw = 1180;
    const px = ch.body.x + (ch.body.w - pw) / 2;
    parts.push(rect({ x: px + 4, y: ch.body.y + 28, w: pw, h: ch.body.h }, 14, 'rgba(11,20,36,0.12)'), rect({ x: px, y: ch.body.y + 24, w: pw, h: ch.body.h }, 14, C.white, `stroke="${C.line}" stroke-width="2"`));
    view = { x: px, y: ch.body.y + 24, w: pw, h: ch.body.h - 24 };
    col = { x: px + innerPad, w: pw - 2 * innerPad };
  }
  const saved = f.col;
  f.col = col;
  const items: Item[] = [];
  f.steps.forEach((st, i) => {
    const { s, e } = windowOf(f, i);
    if (t < s) return;
    if (st.kind === 'type') {
      const done = t >= s + typeDur(e - s, st.text.length);
      const text = typedText(st.text, t, s, e);
      const lines = wrapText(text || ' ', col.w - 14, S.body);
      items.push({
        h: lines.length * S.lh,
        p: prog(t, s, s + 0.2),
        gap: 18,
        draw: (y) => textBlock(f, text, { x: col.x, y, w: col.w, caret: !done || (blink(t) && i === lastType(f.steps)) }).svg,
      });
    } else if (st.kind === 'show') {
      const lines = st.lines ?? [];
      const th = st.title ? wrapText(st.title, col.w, 40, 700).length * 56 + 6 : 0;
      const ls = lines.map((l) => wrapText(l.replace(/^\s*[-•*]\s*/, ''), col.w - 44, S.body));
      const h = th + ls.reduce((a, b) => a + b.length * S.lh + 6, 0);
      items.push({
        h,
        p: prog(t, s, s + 0.35),
        gap: 22,
        draw: (y) => {
          let cy = y;
          const out: string[] = [];
          if (st.title) {
            const tb = textBlock(f, st.title, { x: col.x, y: cy, w: col.w, size: 40, weight: 700, lh: 56 });
            out.push(tb.svg);
            cy += tb.h + 6;
          }
          lines.forEach((l, k) => {
            out.push(`<circle cx="${col.x + 12}" cy="${num(cy + S.lh / 2)}" r="7" fill="${C.ink}"/>`);
            const tb = textBlock(f, l.replace(/^\s*[-•*]\s*/, ''), { x: col.x + 40, y: cy, w: col.w - 44 });
            out.push(tb.svg);
            addTarget(f, l, { x: col.x, y: cy, w: col.w, h: tb.h });
            cy += tb.h + 6;
          });
          return out.join('');
        },
      });
    }
  });
  parts.push(flow(f, items, { ...view, x: view.x, w: view.w }, { padTop: f.phone ? 28 : 40, fade: C.white }));
  f.col = saved;
  return parts.join('');
}

function lastType(steps: MockStep[]) {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i]!.kind === 'type') return i;
  return -1;
}

/* ---------------- quadro completo ---------------- */

function drawTap(f: F, ch: Chrome, stepIdx: number, st: Extract<MockStep, { kind: 'tap' }>): string {
  const { t } = f;
  const { s, e } = windowOf(f, stepIdx);
  const dur = Math.min(0.9, Math.max(0.4, (e - s) * 0.9));
  const lbl = norm(st.label);
  let tg = f.targets.find((x) => x.norm === lbl) ?? f.targets.find((x) => x.norm.length >= 3 && lbl.length >= 3 && (x.norm.includes(lbl) || lbl.includes(x.norm)));
  const out: string[] = [];
  const inView = (x: Target) => x.y + x.h > ch.body.y && x.y < ch.body.y + ch.body.h;
  if (tg && !inView(tg)) tg = undefined;
  const a = prog(t, s, s + dur);
  if (!tg) {
    // sem alvo na tela: botão genérico com o rótulo
    const w = Math.min(ch.body.w - 2 * f.pad, textWidth(st.label, S.body, 700) + 90);
    const x = ch.body.x + (ch.body.w - w) / 2;
    const y = ch.body.y + ch.body.h - 130;
    const vis = ez(prog(t, s, s + 0.2)) * (1 - prog(t, s + dur + 0.5, s + dur + 0.9));
    tg = { norm: lbl, x, y, w, h: 84, px: x + w / 2, py: y + 42 };
    if (vis <= 0) return '';
    out.push(`<g opacity="${num(vis)}">${rect({ x: x + 3, y: y + 8, w, h: 84 }, 42, 'rgba(11,20,36,0.2)')}${rect({ x, y, w, h: 84 }, 42, C.navy)}<text x="${num(x + w / 2)}" y="${num(y + 42 + S.body * 0.34)}" font-size="${S.body}" font-weight="700" fill="${C.white}" text-anchor="middle">${esc(ellipsize(st.label, w - 40, S.body, 700))}</text>`);
    out.push('</g>');
  }
  if (t < s || t > s + dur + 0.6) return out.join('');
  const px = tg.px ?? tg.x + Math.min(tg.w / 2, 260);
  const py = tg.py ?? tg.y + tg.h / 2;
  const press = Math.sin(Math.PI * clamp01(a * 1.6)) ;
  out.push(`<rect x="${num(tg.x)}" y="${num(tg.y)}" width="${num(tg.w)}" height="${num(tg.h)}" rx="18" fill="${C.ink}" opacity="${num(0.14 * press)}"/>`);
  const ringP = prog(t, s + 0.12, s + 0.12 + 0.55);
  if (ringP > 0 && ringP < 1) out.push(`<circle cx="${num(px)}" cy="${num(py)}" r="${num(40 + 50 * ez(ringP))}" fill="none" stroke="${C.ink}" stroke-width="5" opacity="${num(0.6 * (1 - ringP))}"/>`);
  const fin = ez(prog(t, s, s + 0.15)) * (1 - prog(t, s + dur, s + dur + 0.5));
  out.push(`<circle cx="${num(px)}" cy="${num(py)}" r="${num(46 - 8 * press)}" fill="rgba(11,20,36,0.28)" stroke="${C.ink}" stroke-width="4" opacity="${num(fin)}"/><circle cx="${num(px)}" cy="${num(py)}" r="10" fill="${C.lime}" stroke="${C.ink}" stroke-width="3" opacity="${num(fin)}"/>`);
  return out.join('');
}

export function buildFrameSvg(mock: MockInput, sch: StepSchedule, t: number): string {
  const phone = (mock.device ?? 'phone') === 'phone';
  const steps = mock.steps;
  const f: F = {
    t,
    mock,
    steps,
    sch,
    phone,
    hls: [],
    targets: [],
    defs: [],
    pad: phone ? 22 : 56,
    inset: mock.model === "chat" ? (phone ? 112 : 124) : mock.model === "form" && mock.steps.some((s) => s.kind === "tap") ? (phone ? 150 : 140) : 0,
    col: { x: 0, w: 0 },
  };
  // realces ativos
  steps.forEach((st, i) => {
    if (st.kind !== 'highlight') return;
    const s = sch.windows[i]!.start;
    if (t >= s) f.hls.push({ needle: st.text.toLowerCase().trim(), p: prog(t, s + 0.05, s + 0.6), matched: false, step: i });
  });
  const bodyBg = mock.model === 'notes' && phone ? C.white : C.screen;
  const ch = drawChrome(f, bodyBg);
  const maxCol = mock.model === 'chat' || mock.model === 'browser' ? 1240 : mock.model === 'settings' || mock.model === 'form' ? 1100 : 1400;
  f.col = phone ? { x: ch.body.x + f.pad, w: ch.body.w - 2 * f.pad } : { x: ch.body.x + (ch.body.w - Math.min(maxCol, ch.body.w - 2 * f.pad)) / 2, w: Math.min(maxCol, ch.body.w - 2 * f.pad) };
  let content = '';
  switch (mock.model) {
    case 'chat': content = drawChat(f, ch); break;
    case 'browser': content = drawBrowser(f, ch); break;
    case 'form': content = drawForm(f, ch); break;
    case 'settings': content = drawSettings(f, ch); break;
    case 'calendar': content = drawCalendar(f, ch); break;
    case 'sheet': content = drawSheet(f, ch); break;
    case 'notes': content = drawNotes(f, ch); break;
  }
  // sobreposições: último cartão `show`/realce sem texto correspondente (modelos de grade) e toques
  const over: string[] = [];
  const bannerModels = mock.model === 'calendar' || mock.model === 'sheet';
  let latest: { i: number; b: Banner } | undefined;
  steps.forEach((st, i) => {
    const w = sch.windows[i]!;
    if (t < w.start) return;
    if (bannerModels && st.kind === 'show') latest = { i, b: { title: st.title, lines: st.lines ?? [], p: prog(t, w.start, w.start + 0.35) } };
  });
  for (const h of f.hls) {
    if (h.matched) continue;
    const st = steps[h.step] as Extract<MockStep, { kind: 'highlight' }>;
    if (!latest || h.step > latest.i) latest = { i: h.step, b: { lines: [st.text], p: prog(t, sch.windows[h.step]!.start, sch.windows[h.step]!.start + 0.35) } };
  }
  const fresh = latest as { i: number; b: Banner } | undefined;
  if (fresh) over.push(banner(f, ch, fresh.b));
  steps.forEach((st, i) => {
    if (st.kind === 'tap' && t >= sch.windows[i]!.start) over.push(drawTap(f, ch, i, st));
  });
  const clipId = 'screenclip';
  const clipRect = phone ? `<rect x="${ch.screen.x}" y="${ch.screen.y}" width="${ch.screen.w}" height="${ch.screen.h}" rx="52"/>` : `<rect x="${ch.screen.x}" y="${ch.screen.y}" width="${ch.screen.w}" height="${ch.screen.h}" rx="20"/>`;
  const bg = phone
    ? `<defs><linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9EDF3"/><stop offset="1" stop-color="#C9D2DF"/></linearGradient></defs><rect width="${MOCK_W}" height="${MOCK_H}" fill="url(#bgg)"/>`
    : `<defs><linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9EDF3"/><stop offset="1" stop-color="#C9D2DF"/></linearGradient></defs><rect width="${MOCK_W}" height="${MOCK_H}" fill="url(#bgg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MOCK_W}" height="${MOCK_H}" viewBox="0 0 ${MOCK_W} ${MOCK_H}" font-family="Inter">${bg}<defs><clipPath id="${clipId}">${clipRect}</clipPath>${f.defs.join('')}</defs>${ch.svg}<g clip-path="url(#${clipId})">${content}${over.join('')}</g></svg>`;
}

export { scheduleSteps };
