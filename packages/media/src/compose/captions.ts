import type { CharAlignment } from './audio';

/**
 * Legendas WebVTT (WCAG 1.2.2) a partir do alinhamento da narração.
 *
 * - `wordsFromAlignment`: palavras com início/fim (s) a partir do alinhamento
 *   caractere a caractere (ElevenLabs ou sintético);
 * - `approxWords`: sem alinhamento (voz do HeyGen), distribui o texto pela
 *   duração proporcionalmente ao número de caracteres;
 * - `mapWordsToTimeline`: leva as palavras de cada plano (tempo relativo ao
 *   trecho de áudio do item) para a linha do tempo FINAL da montagem (mesma
 *   conta do compositor: início do plano + respiro da cena em movimento);
 * - `buildCaptionCues`: agrupa em legendas por frase (quebra em `.?!;…`; em
 *   vírgula quando passaria de 2 linhas × 42 caracteres ou de ~5 s); funde
 *   legendas muito curtas (< 0,8 s) ao vizinho;
 * - `toWebVtt`: serializa (quebra em 2 linhas perto do meio).
 */
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export const CAPTION_LINE_CHARS = 42;
export const CAPTION_MAX_CHARS = CAPTION_LINE_CHARS * 2;
export const CAPTION_MAX_SECONDS = 5;
export const CAPTION_MIN_SECONDS = 0.8;

/** Palavras (tokens separados por espaço, com a pontuação junto) e seus tempos. */
export function wordsFromAlignment(alignment: CharAlignment, range?: { from?: number; to?: number }): CaptionWord[] {
  const out: CaptionWord[] = [];
  let text = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    if (text.trim()) out.push({ text: text.trim(), start, end });
    text = '';
  };
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      flush();
      return;
    }
    if (!text) start = alignment.startTimes[i] ?? 0;
    text += ch;
    end = alignment.endTimes[i] ?? start;
  });
  flush();
  const from = range?.from ?? -Infinity;
  const to = range?.to ?? Infinity;
  return out.filter((w) => w.start >= from - 1e-6 && w.start < to);
}

/** Sem alinhamento: palavras espalhadas pela duração, proporcionais aos caracteres. */
export function approxWords(text: string, start: number, duration: number): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const total = tokens.reduce((a, t) => a + t.length + 1, 0) || 1;
  let t = start;
  return tokens.map((tok) => {
    const d = ((tok.length + 1) / total) * Math.max(0, duration);
    const w = { text: tok, start: t, end: t + d * 0.92 };
    t += d;
    return w;
  });
}

export interface TimelineShotWords {
  /** palavras no tempo do trecho de áudio do item (0 = início do trecho) */
  words: CaptionWord[];
  /** início, no trecho do item, da parte usada por este plano (planos fundidos) */
  sourceStart: number;
  /** início do plano na cena montada */
  timelineStart: number;
  duration: number;
  /** atraso do áudio dentro do plano (respiro da cena em movimento) */
  audioDelay?: number;
}

/** Palavras na linha do tempo final (cada plano só leva as palavras do seu trecho). */
export function mapWordsToTimeline(shots: TimelineShotWords[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  for (const s of shots) {
    const shift = s.timelineStart + (s.audioDelay ?? 0) - s.sourceStart;
    const endOfShot = s.timelineStart + s.duration;
    for (const w of s.words) {
      if (w.start < s.sourceStart - 1e-6 || w.start >= s.sourceStart + s.duration - (s.audioDelay ?? 0)) continue;
      const start = w.start + shift;
      if (start >= endOfShot) continue;
      out.push({ text: w.text, start, end: Math.min(endOfShot, w.end + shift) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const joinText = (ws: CaptionWord[]) => ws.map((w) => w.text).join(' ');
const sentenceEnd = (t: string) => /[.?!;…]["'”»)]*$/.test(t);
const commaEnd = (t: string) => /[,:—–]["'”»)]*$/.test(t);

/** Divide uma frase longa em pedaços que cabem (prefere a última vírgula do pedaço). */
function splitLong(words: CaptionWord[], maxChars: number, maxSeconds: number): CaptionWord[][] {
  const chunks: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    const next = [...cur, w];
    const tooLong = joinText(next).length > maxChars || (cur.length > 0 && w.end - cur[0]!.start > maxSeconds);
    if (tooLong && cur.length) {
      // corta na última vírgula do pedaço, se ela deixar pelo menos metade do pedaço
      let cut = -1;
      for (let i = cur.length - 1; i >= Math.ceil(cur.length / 2) - 1 && i >= 0; i--) if (commaEnd(cur[i]!.text)) { cut = i; break; }
      if (cut >= 0 && cut < cur.length - 1) {
        chunks.push(cur.slice(0, cut + 1));
        cur = [...cur.slice(cut + 1), w];
      } else {
        chunks.push(cur);
        cur = [w];
      }
    } else cur = next;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function buildCaptionCues(words: CaptionWord[], opts: { maxChars?: number; maxSeconds?: number; minSeconds?: number } = {}): CaptionCue[] {
  const maxChars = opts.maxChars ?? CAPTION_MAX_CHARS;
  const maxSeconds = opts.maxSeconds ?? CAPTION_MAX_SECONDS;
  const minSeconds = opts.minSeconds ?? CAPTION_MIN_SECONDS;
  // 1) frases
  const sentences: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (sentenceEnd(w.text)) {
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);
  // 2) frases longas -> pedaços
  const groups = sentences.flatMap((s) => splitLong(s, maxChars, maxSeconds));
  // 3) funde legendas curtas ao vizinho (se couber)
  // só funde vizinhos próximos (pausa < 1 s) e se o resultado ainda couber em chars e (com 20% de folga) em segundos
  const fits = (a: CaptionWord[], b: CaptionWord[]) =>
    b[0]!.start - a[a.length - 1]!.end < 1 && b[b.length - 1]!.end - a[0]!.start <= maxSeconds * 1.2 && joinText([...a, ...b]).length <= maxChars;
  const merged: CaptionWord[][] = [];
  for (const g of groups) {
    const dur = g[g.length - 1]!.end - g[0]!.start;
    const prev = merged[merged.length - 1];
    if (prev && dur < minSeconds && fits(prev, g)) prev.push(...g);
    else merged.push([...g]);
  }
  for (let i = 0; i < merged.length - 1; i++) {
    const g = merged[i]!;
    const dur = g[g.length - 1]!.end - g[0]!.start;
    if (dur < minSeconds && fits(g, merged[i + 1]!)) {
      merged[i + 1] = [...g, ...merged[i + 1]!];
      merged.splice(i, 1);
      i--;
    }
  }
  // 4) tempos: legenda curta é estendida até o mínimo, sem invadir a seguinte
  const cues = merged.map((g) => ({ start: g[0]!.start, end: g[g.length - 1]!.end, text: joinText(g) }));
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    const nextStart = cues[i + 1]?.start ?? Infinity;
    if (c.end - c.start < minSeconds) c.end = Math.min(c.start + minSeconds, nextStart);
    c.end = Math.max(c.end, c.start + 0.05);
    if (c.end > nextStart) c.end = nextStart;
  }
  return cues.map((c) => ({ start: round3(c.start), end: round3(c.end), text: c.text }));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Quebra em até 2 linhas, no espaço mais perto do meio. */
export function wrapCaption(text: string, lineChars = CAPTION_LINE_CHARS): string {
  if (text.length <= lineChars) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

export function vttTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(r, 3)}`;
}

export function toWebVtt(cues: CaptionCue[]): string {
  const body = cues
    .filter((c) => c.text.trim() && c.end > c.start)
    // "-->" no texto quebraria o arquivo
    .map((c, i) => `${i + 1}\n${vttTimestamp(c.start)} --> ${vttTimestamp(c.end)}\n${wrapCaption(c.text.replace(/-->/g, '→'))}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}${body ? '\n' : ''}`;
}
