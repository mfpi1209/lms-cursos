import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clampText } from './slides';
import { matchStepCues, scheduleSteps, startsFromCues, type CueWord } from './screen-mock-schedule';
import { ZONE_GEOMETRY, ZONE_GLASS, chipsColumn, zoneColors, zoneH as h, zoneRender as render, type Zone, type ZonePaletteInput } from './zones';

/**
 * Painel DINÂMICO do "Texto na tela" (estúdio com zonas, cena dirigida sem pílulas/cartão/slide, com `topics` no nó):
 * o título (o "Texto na tela" do roteiro) fica no alto do painel de vidro marinho e os TÓPICOS entram um a um, no
 * tempo da fala. O tópico atual fica em destaque (branco, negrito, ponto laranja, fundo tingido); os anteriores
 * ficam esmaecidos; no máximo 3 aparecem — quando entra o 4º, o mais antigo sai por cima (sobe e some) e os outros
 * sobem uma linha. Entrada: desliza ~24 px da borda do lado livre + fade em ≈ 0,32 s.
 *
 * Tempo: o início de cada tópico vem da correspondência tolerante com o alinhamento por palavra da narração (o mesmo
 * das legendas; `matchStepCues`, com o `cue` explícito ou o texto do tópico); sem correspondência, interpola entre os
 * vizinhos; sem alinhamento, distribui igualmente pela janela (`startsFromCues`/`scheduleSteps`).
 *
 * Desenho: um PNG por ESTADO (tópico atual) e uma sequência curta de quadros por TRANSIÇÃO, todos do MESMO tamanho
 * e posição (a montagem só os sobrepõe com janelas de tempo, como as pílulas); nada disso entra na chave do clipe.
 */

export const SCREEN_TOPICS = {
  /** quantos tópicos ficam visíveis ao mesmo tempo */
  maxVisible: 3,
  /** duração da entrada de cada tópico (s) */
  enter: 0.32,
  /** intervalo mínimo entre dois tópicos (s; maior que a entrada: as transições não se sobrepõem) */
  minGap: 0.6,
  /** o tópico entra um instante antes da palavra (como as pílulas) */
  lead: 0.1,
  /** o último tópico entra pelo menos isto antes do fim da janela */
  tailRoom: 0.8,
  /** deslize horizontal da entrada (px a 1080p) */
  slide: 24,
} as const;

/* ------------------------------------------------------------------ */
/* Tempo                                                                 */
/* ------------------------------------------------------------------ */

export interface TopicInput {
  text: string;
  cue?: string;
}

/** Quadros da transição de entrada no fps da montagem (mínimo 3). */
export function topicEnterFrames(fps: number): number {
  return Math.max(3, Math.round(SCREEN_TOPICS.enter * fps));
}

/**
 * Início (s, tempo da cena) de cada tópico dentro da janela `win` do painel. `words` = palavras da narração com tempo
 * (tempo da cena; o alinhamento das legendas); sem elas (vazio/ausente) ou sem nenhum achado, distribui igualmente.
 * Sempre crescente, com `minGap` entre tópicos (menos se a janela for curta), o último com folga até o fim, e na
 * grade de quadros (`fps`). Devolve só os tópicos que cabem na janela (a ordem se mantém: os primeiros).
 */
export function scheduleScreenTopics(topics: ReadonlyArray<TopicInput>, words: ReadonlyArray<CueWord> | undefined, win: { from: number; to: number }, fps: number): number[] {
  const n = topics.length;
  if (!n) return [];
  const span = Math.max(0.1, win.to - win.from);
  const steps = topics.map((t) => ({ kind: 'highlight', text: t.text, ...(t.cue ? { cue: t.cue } : {}) }));
  const cues = words?.length ? matchStepCues(steps, words).times : [];
  let raw: number[];
  if (cues.some((t) => t !== undefined)) {
    raw = startsFromCues(cues.map((t) => (t === undefined ? undefined : Math.max(0, t - SCREEN_TOPICS.lead - win.from))), topics.map(() => 1), span).map((t) => t + win.from);
  } else {
    raw = scheduleSteps(topics.map(() => 1), span).windows.map((w) => w.start + win.from);
  }
  const last = Math.max(win.from, win.to - SCREEN_TOPICS.tailRoom);
  const minStep = 1.02 * topicEnterFrames(fps) / fps;
  const fit = Math.max(1, Math.min(n, Math.floor((last - win.from) / minStep) + 1));
  const gap = Math.max(minStep, Math.min(SCREEN_TOPICS.minGap, fit > 1 ? (last - win.from) / (fit - 1) : SCREEN_TOPICS.minGap));
  const out = raw.slice(0, fit).map((t) => Math.min(Math.max(t, win.from), last));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! + gap);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i]!, i === out.length - 1 ? last : out[i + 1]! - gap);
  // grade de quadros, sempre crescente
  const snap = (t: number) => Number((Math.round(t * fps) / fps).toFixed(3));
  const snapped = out.map(snap);
  for (let i = 1; i < snapped.length; i++) if (snapped[i]! <= snapped[i - 1]!) snapped[i] = Number((snapped[i - 1]! + Math.ceil(minStep * fps) / fps).toFixed(3));
  return snapped;
}

/* ------------------------------------------------------------------ */
/* Estado visual de cada quadro (função pura)                            */
/* ------------------------------------------------------------------ */

const easeOutCubic = (p: number) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Índices dos tópicos visíveis quando o atual é `cur` (-1 = só o título): os `maxVisible` mais recentes. */
export function visibleTopics(cur: number, max: number = SCREEN_TOPICS.maxVisible): number[] {
  if (cur < 0) return [];
  const out: number[] = [];
  for (let i = Math.max(0, cur - max + 1); i <= cur; i++) out.push(i);
  return out;
}

export interface TopicRow {
  /** índice do tópico */
  index: number;
  /** topo da linha dentro da área dos tópicos (px) */
  y: number;
  /** deslocamento horizontal da entrada (px; 0 = assentada) */
  dx: number;
  opacity: number;
  /** 0 = esmaecido (anterior) … 1 = destaque (atual) */
  emphasis: number;
}

export interface TopicsFrame {
  rows: TopicRow[];
  /** altura da área dos tópicos (px) */
  areaHeight: number;
  /** opacidade do cartão de vidro (< 1 só quando ele próprio está entrando, sem título para segurá-lo) */
  cardOpacity: number;
}

const stack = (idx: number[], heights: number[], gap: number) => idx.reduce((s, i, k) => s + heights[i]! + (k ? gap : 0), 0);
const positions = (idx: number[], heights: number[], gap: number) => {
  const m = new Map<number, number>();
  let y = 0;
  for (const i of idx) {
    m.set(i, y);
    y += heights[i]! + gap;
  }
  return m;
};

/**
 * Estado do painel com `cur` como tópico atual (-1 = só o título) e a entrada desse tópico no progresso `p` (0..1;
 * 1 = assentado). Na entrada: o tópico novo desliza e aparece; o anterior perde o destaque; se já havia
 * `maxVisible`, o mais antigo sobe e some e os demais sobem uma linha. `heights` = altura de cada linha (px).
 */
export function topicsFrame(heights: number[], cur: number, p: number, o: { gap: number; slide?: number; fadeCard?: boolean }): TopicsFrame {
  const e = easeOutCubic(p);
  const steady = p >= 1;
  const next = visibleTopics(cur);
  const prev = steady || cur < 0 ? next : visibleTopics(cur - 1);
  const yNew = positions(next, heights, o.gap);
  const yPrev = positions(prev, heights, o.gap);
  const all = [...new Set([...prev, ...next])].sort((a, b) => a - b);
  const slide = o.slide ?? 0;
  const rows: TopicRow[] = all.map((i) => {
    const inNew = next.includes(i);
    const inPrev = prev.includes(i);
    const emphasis = steady ? (i === cur ? 1 : 0) : i === cur ? e : i === cur - 1 ? 1 - e : 0;
    if (inNew && inPrev) return { index: i, y: lerp(yPrev.get(i)!, yNew.get(i)!, steady ? 1 : e), dx: 0, opacity: 1, emphasis };
    if (inNew) return { index: i, y: yNew.get(i)!, dx: Math.round((1 - e) * slide), opacity: Number(e.toFixed(3)), emphasis };
    // o mais antigo: sobe a própria altura e some
    return { index: i, y: yPrev.get(i)! - e * (heights[i]! + o.gap), dx: 0, opacity: Number((1 - e).toFixed(3)), emphasis };
  });
  return {
    rows,
    areaHeight: Math.round(steady ? stack(next, heights, o.gap) : lerp(stack(prev, heights, o.gap), stack(next, heights, o.gap), e)),
    cardOpacity: o.fadeCard && !steady ? Number(e.toFixed(3)) : 1,
  };
}

/* ------------------------------------------------------------------ */
/* Plano de segmentos (o que a montagem sobrepõe, e quando)              */
/* ------------------------------------------------------------------ */

export interface TopicsSegment {
  from: number;
  to: number;
  /** imagem parada do estado `state` (-1 = só o título) */
  still?: { state: number };
  /** sequência de quadros da entrada do tópico `transition` */
  seq?: { transition: number; frames: number };
  /** primeiro segmento com título: entra com fade e deslize do painel inteiro (feito pela montagem) */
  intro?: boolean;
}

/**
 * Segmentos consecutivos do painel na janela `win`: com título e o 1º tópico bem depois do início, o título fica
 * sozinho primeiro (`intro`); depois, para cada tópico, a sequência de entrada e a imagem parada até o próximo.
 */
export function planTopicsSegments(starts: ReadonlyArray<number>, win: { from: number; to: number }, fps: number, hasTitle: boolean): TopicsSegment[] {
  const out: TopicsSegment[] = [];
  if (!starts.length) return out;
  const frames = topicEnterFrames(fps);
  const enter = frames / fps;
  if (hasTitle && starts[0]! - win.from >= 0.5) out.push({ from: win.from, to: starts[0]!, still: { state: -1 }, intro: true });
  starts.forEach((t, i) => {
    out.push({ from: t, to: Number((t + enter).toFixed(3)), seq: { transition: i, frames } });
    const end = i + 1 < starts.length ? starts[i + 1]! : win.to;
    const from = Number((t + enter).toFixed(3));
    if (end - from > 0.02) out.push({ from, to: end, still: { state: i } });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Desenho                                                               */
/* ------------------------------------------------------------------ */

export interface TopicsLayout {
  /** tamanho do texto dos tópicos (px já na escala do quadro) e da linha */
  size: number;
  lineHeight: number;
  /** texto (cortado em até 2 linhas) e nº de linhas de cada tópico */
  texts: string[];
  lines: number[];
  /** altura de cada linha de tópico (px) */
  heights: number[];
}

const ROW_PAD_Y = 8;
const ROW_PAD_X = 14;
const DOT = 14;
const DOT_GAP = 16;
const MAX_TOPIC_LINES = 2;

const wrapLines = (text: string, perLine: number): number => {
  let lines = 1;
  let cur = 0;
  for (const w of text.split(' ')) {
    const add = (cur ? 1 : 0) + w.length;
    if (cur + add > perLine && cur) {
      lines++;
      cur = w.length;
    } else cur += add;
  }
  return lines;
};

/**
 * Tamanho único para todos os tópicos (o maior de 38/34/30 px a 1080p em que todos cabem em 2 linhas; o que ainda
 * não couber é cortado com "…") e altura de cada linha. `textWidth` = largura útil do texto (px do quadro).
 */
export function layoutTopics(topics: ReadonlyArray<string>, textWidth: number, k: number): TopicsLayout {
  const clean = topics.map((t) => t.replace(/\s+/g, ' ').trim());
  const perLine = (size: number) => Math.max(8, Math.floor(textWidth / (size * 0.58 * k)));
  const size = [38, 34, 30].find((s) => clean.every((t) => wrapLines(t, perLine(s)) <= MAX_TOPIC_LINES)) ?? 30;
  const per = perLine(size);
  const texts = clean.map((t) => (wrapLines(t, per) <= MAX_TOPIC_LINES ? t : clampText(t, per * MAX_TOPIC_LINES - 4)));
  const lines = texts.map((t) => Math.min(MAX_TOPIC_LINES, wrapLines(t, per)));
  const lineHeight = Math.round(size * 1.2 * k);
  return { size: Math.round(size * k), lineHeight, texts, lines, heights: lines.map((l) => l * lineHeight + 2 * Math.round(ROW_PAD_Y * k)) };
}

export interface ScreenTopicsSpec {
  title?: string;
  topics: string[];
}

export interface TopicsSprite {
  path: string;
}

export interface ScreenTopicsPlan {
  /** posição e tamanho (todos os quadros são iguais) no quadro montado */
  x: number;
  y: number;
  w: number;
  h: number;
  /** lado da coluna no quadro (de onde o painel desliza) */
  side: 'left' | 'right';
  /** segmentos consecutivos, em tempo de cena; `still`/`seq` apontam para os arquivos */
  segments: Array<{ from: number; to: number; still?: string; seq?: { pattern: string; frames: number }; intro?: boolean }>;
  /** instante em que o painel aparece (início do primeiro segmento) */
  panelFrom: number;
}

/**
 * Desenha todos os estados e transições do painel e devolve o plano de segmentos com os arquivos. `starts` = início
 * de cada tópico (`scheduleScreenTopics`), `win` = janela do painel na cena. Pasta `dir` recebe os PNGs.
 */
export async function renderScreenTopicsPlan(dir: string, spec: ScreenTopicsSpec, starts: ReadonlyArray<number>, win: { from: number; to: number }, o: { width?: number; height?: number; fps?: number; zone?: Zone | null; palette?: ZonePaletteInput | null } = {}): Promise<ScreenTopicsPlan> {
  const colors = zoneColors(o.palette);
  const W = o.width ?? 1920;
  const H = o.height ?? 1080;
  const fps = o.fps ?? 25;
  const k = H / 1080;
  const px = (n: number) => Math.round(n * k);
  const col = chipsColumn({ width: W, zone: o.zone });
  const sp = px(ZONE_GEOMETRY.shadowPad);
  const border = Math.max(1, Math.round(k));
  const padX = px(34);
  const padY = px(28);
  const barW = px(8);
  const barGap = px(22);
  const cardInner = col.width - padX * 2 - border * 2;
  const inner = cardInner - barW - barGap;
  const slidePx = px(SCREEN_TOPICS.slide);
  const rowGap = px(10);
  const titleGap = px(16);
  const textWidth = inner - px(2 * ROW_PAD_X) - px(DOT + DOT_GAP);
  const lay = layoutTopics(spec.topics.slice(0, starts.length), textWidth, k);
  const n = lay.texts.length;
  const title = spec.title ? clampText(spec.title, 70) : '';
  const titleSize = px(40);
  const titleLineH = Math.round(titleSize * 1.15);
  const titleLines = title ? Math.min(2, wrapLines(title, Math.max(8, Math.floor(inner / (titleSize * 0.58))))) : 0;
  const titleH = titleLines * titleLineH;
  const side = col.side;

  const card = (f: ReturnType<typeof topicsFrame>) => {
    const areaH = f.areaHeight;
    const contentH = Math.max(px(40), titleH + (title && areaH > 0 ? Math.round(titleGap * Math.min(1, areaH / px(40))) : 0) + areaH);
    const bar = h('div', { display: 'flex', width: barW, height: contentH, borderRadius: Math.round(barW / 2), background: colors.accent, marginRight: barGap, flexShrink: 0 });
    const rows = f.rows.map((r) => {
      const e = r.emphasis;
      const dim = 0.55 + 0.45 * e;
      return h('div', {
        display: 'flex', flexDirection: 'row', alignItems: 'flex-start', position: 'absolute', left: (side === 'right' ? 1 : -1) * r.dx, top: Math.round(r.y), width: inner - px(2 * ROW_PAD_X),
        padding: `${px(ROW_PAD_Y)}px ${px(ROW_PAD_X)}px`, borderRadius: px(14), opacity: Number((r.opacity * dim).toFixed(3)),
        background: `rgba(${colors.accentRgb.join(',')},${(0.18 * e).toFixed(3)})`,
      },
      h('div', { display: 'flex', width: px(DOT), height: px(DOT), borderRadius: 999, background: colors.accent, marginRight: px(DOT_GAP), marginTop: Math.round((lay.lineHeight - px(DOT)) / 2), flexShrink: 0 }),
      h('div', { display: 'flex', width: textWidth, height: lay.lines[r.index]! * lay.lineHeight, overflow: 'hidden', fontSize: lay.size, lineHeight: `${lay.lineHeight}px`, fontWeight: e >= 0.5 ? 700 : 400, color: colors.onBase }, lay.texts[r.index]!));
    });
    const right = h('div', { display: 'flex', flexDirection: 'column', width: inner, height: contentH, flexShrink: 0 },
      title ? h('div', { display: 'flex', width: inner, height: titleH, overflow: 'hidden', fontSize: titleSize, lineHeight: `${titleLineH}px`, fontWeight: 700, color: colors.eyebrow }, title) : null,
      areaH > 0 ? h('div', { display: 'flex', position: 'relative', width: inner + slidePx, height: areaH, marginTop: title ? Math.round(titleGap * Math.min(1, areaH / px(40))) : 0, overflow: 'hidden', flexShrink: 0 }, ...rows) : null);
    return h('div', {
      display: 'flex', flexDirection: 'row', width: cardInner, height: contentH, padding: `${padY}px ${padX}px`, borderRadius: px(24), opacity: f.cardOpacity,
      background: colors.panel, border: `${border}px solid ${ZONE_GLASS.border}`, boxShadow: `0 ${px(18)}px ${px(36)}px rgba(15,16,48,0.30)`,
    }, bar, right);
  };

  // canvas único: o maior estado (título + janela mais alta de tópicos) + a sombra
  let maxArea = 0;
  for (let c = 0; c < n; c++) maxArea = Math.max(maxArea, stack(visibleTopics(c), lay.heights, rowGap));
  const maxContent = Math.max(px(40), titleH + (title && maxArea > 0 ? titleGap : 0) + maxArea);
  const cw = col.width + sp * 2;
  const ch = maxContent + padY * 2 + border * 2 + sp * 2 + px(8);
  const top = Math.round(H * ZONE_GEOMETRY.panelTop);
  const draw = async (file: string, f: ReturnType<typeof topicsFrame>) => {
    const r = await render(h('div', { display: 'flex', width: cw, height: ch, padding: sp, fontFamily: 'Inter', alignItems: 'flex-start' }, card(f)), cw, ch);
    await writeFile(file, r.png);
  };

  await mkdir(dir, { recursive: true });
  const segments = planTopicsSegments(starts, win, fps, !!title);
  const frames = topicEnterFrames(fps);
  const introStill = segments.some((s) => s.intro);
  const stateFile = (state: number) => (state < 0 ? path.join(dir, 'topics-title.png') : path.join(dir, `topics-t${state}-f${String(frames - 1).padStart(2, '0')}.png`));
  const opts = { gap: rowGap, slide: slidePx };
  if (introStill) await draw(stateFile(-1), topicsFrame(lay.heights, -1, 1, opts));
  for (let i = 0; i < n; i++) {
    // sem título/estado anterior parado, o próprio cartão entra com fade (nos primeiros quadros do 1º tópico)
    const fadeCard = i === 0 && !introStill;
    for (let j = 0; j < frames; j++) await draw(path.join(dir, `topics-t${i}-f${String(j).padStart(2, '0')}.png`), topicsFrame(lay.heights, i, (j + 1) / frames, { ...opts, fadeCard }));
  }
  return {
    x: col.x - sp, y: top - sp, w: cw, h: ch, side,
    panelFrom: segments[0]?.from ?? win.from,
    segments: segments.map((s) => ({
      from: s.from, to: s.to, ...(s.intro ? { intro: true } : {}),
      ...(s.still ? { still: stateFile(s.still.state) } : {}),
      ...(s.seq ? { seq: { pattern: path.join(dir, `topics-t${s.seq.transition}-f%02d.png`), frames: s.seq.frames } } : {}),
    })),
  };
}
