import path from 'node:path';
import { ffprobe, runFfmpeg, sec } from './ffmpeg';

/** Alinhamento caractere a caractere (ElevenLabs `alignment`). */
export interface CharAlignment {
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}

export interface ShotLine {
  id: string;
  line: string;
}

export interface ShotTiming {
  shotId: string;
  /** índices (inclusivos) no array de caracteres do alinhamento */
  charStart: number;
  charEnd: number;
  /** intervalo de fala detectado */
  speechStart: number;
  speechEnd: number;
  /** intervalo de corte (contíguo entre planos; cortes no silêncio entre palavras) */
  start: number;
  end: number;
  duration: number;
}

export class ShotLineNotFoundError extends Error {
  constructor(public readonly shotId: string, line: string, detail: string) {
    super(`Plano "${shotId}": a fala "${line.slice(0, 80)}${line.length > 80 ? '…' : ''}" não foi encontrada na narração (${detail}). As falas dos planos devem ser trechos exatos e em ordem da narração.`);
    this.name = 'ShotLineNotFoundError';
  }
}

const QUOTES: Record<string, string> = { '“': '"', '”': '"', '„': '"', '«': '"', '»': '"', '‘': "'", '’': "'", '‚': "'", '`': "'", '´': "'" };

/**
 * Normaliza para casar falas com o alinhamento: NFC, minúsculas, aspas curvas
 * unificadas, e toda pontuação/espaço vira um único separador. Devolve o texto
 * normalizado e, para cada caractere dele, o índice da unidade de origem.
 */
export function normalizeForMatch(units: string[] | string): { norm: string; map: number[] } {
  const arr = typeof units === 'string' ? Array.from(units) : units;
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const raw = (arr[i] ?? '').normalize('NFC').toLowerCase();
    for (const ch0 of Array.from(raw)) {
      const ch = QUOTES[ch0] ?? ch0;
      if (/[\p{L}\p{N}]/u.test(ch)) {
        norm += ch;
        map.push(i);
      } else if (norm.length > 0 && !norm.endsWith(' ')) {
        norm += ' ';
        map.push(i);
      }
    }
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

function findAtWordBoundary(hay: string, needle: string, from: number): number {
  let pos = hay.indexOf(needle, from);
  while (pos >= 0) {
    const before = pos === 0 || hay[pos - 1] === ' ';
    const after = pos + needle.length === hay.length || hay[pos + needle.length] === ' ';
    if (before && after) return pos;
    pos = hay.indexOf(needle, pos + 1);
  }
  return -1;
}

/**
 * Localiza cada fala (em ordem) no alinhamento e devolve intervalos de corte
 * contíguos: o primeiro começa em 0, o último termina em `totalDuration`, e cada
 * corte cai no meio do silêncio entre a última letra de um plano e a primeira do
 * seguinte (fronteira de palavra). Lança `ShotLineNotFoundError` se uma fala não
 * existir na narração.
 */
export function mapShotTimings(alignment: CharAlignment, shots: ShotLine[], opts: { totalDuration?: number; tailSeconds?: number } = {}): ShotTiming[] {
  const n = alignment.characters.length;
  if (n === 0 || alignment.startTimes.length !== n || alignment.endTimes.length !== n) throw new Error('alinhamento vazio ou inconsistente');
  if (shots.length === 0) return [];
  const { norm, map } = normalizeForMatch(alignment.characters);
  let cursor = 0;
  const spans: Array<{ shotId: string; charStart: number; charEnd: number }> = [];
  for (const s of shots) {
    const needle = normalizeForMatch(s.line).norm;
    if (!needle) throw new ShotLineNotFoundError(s.id, s.line, 'fala vazia');
    const pos = findAtWordBoundary(norm, needle, cursor);
    if (pos < 0) {
      const anywhere = findAtWordBoundary(norm, needle, 0);
      throw new ShotLineNotFoundError(s.id, s.line, anywhere >= 0 ? 'fora de ordem em relação ao plano anterior' : 'trecho inexistente');
    }
    spans.push({ shotId: s.id, charStart: map[pos]!, charEnd: map[pos + needle.length - 1]! });
    cursor = pos + needle.length;
  }
  const lastEnd = alignment.endTimes[n - 1]!;
  const total = Math.max(opts.totalDuration ?? lastEnd + (opts.tailSeconds ?? 0.35), lastEnd);
  const out: ShotTiming[] = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i]!;
    const speechStart = alignment.startTimes[sp.charStart]!;
    const speechEnd = alignment.endTimes[sp.charEnd]!;
    out.push({ ...sp, speechStart, speechEnd, start: 0, end: 0, duration: 0 });
  }
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]!;
    const next = out[i + 1];
    cur.start = i === 0 ? 0 : out[i - 1]!.end;
    if (next) {
      const gapA = cur.speechEnd;
      const gapB = next.speechStart;
      cur.end = gapB > gapA ? (gapA + gapB) / 2 : gapA;
    } else cur.end = total;
    cur.end = Math.max(cur.end, cur.start + 0.05);
    cur.duration = cur.end - cur.start;
  }
  return out;
}

/**
 * Alinhamento sintético (modo de demonstração): distribui `totalSeconds` pelos
 * caracteres, com espaços e pontuação mais curtos que letras.
 */
export function syntheticAlignment(text: string, totalSeconds: number): CharAlignment {
  const chars = Array.from(text);
  const weight = (c: string) => (/[\p{L}\p{N}]/u.test(c) ? 1 : /\s/.test(c) ? 0.6 : 1.4);
  const sum = chars.reduce((a, c) => a + weight(c), 0) || 1;
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  let t = 0;
  for (const c of chars) {
    const d = (weight(c) / sum) * totalSeconds;
    startTimes.push(t);
    t += d;
    endTimes.push(t);
  }
  return { characters: chars, startTimes, endTimes };
}

export interface AudioSegment {
  shotId: string;
  path: string;
  start: number;
  end: number;
  durationSeconds: number;
}

/** Corta o áudio da narração em segmentos por plano (seek preciso + recodificação). */
export async function cutAudioSegments(opts: { input: string; timings: ShotTiming[]; outDir: string; format?: 'mp3' | 'wav' }): Promise<AudioSegment[]> {
  const format = opts.format ?? 'mp3';
  const out: AudioSegment[] = [];
  for (const t of opts.timings) {
    const file = path.join(opts.outDir, `${t.shotId.replace(/[^A-Za-z0-9_-]/g, '_')}.${format}`);
    const codec = format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100'] : ['-c:a', 'pcm_s16le', '-ar', '44100'];
    await runFfmpeg(['-i', opts.input, '-ss', sec(t.start), '-to', sec(t.end), '-vn', ...codec, file]);
    const probe = await ffprobe(file);
    out.push({ shotId: t.shotId, path: file, start: t.start, end: t.end, durationSeconds: probe.durationSeconds });
  }
  return out;
}
