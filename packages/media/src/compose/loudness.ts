/**
 * Volume único em todos os vídeos (A15): loudnorm do ffmpeg em 2 passadas, ganho LINEAR
 * (a voz não "bombeia": só sobe/desce o nível inteiro), vídeo copiado sem recodificar.
 *
 * Alvo −16 LUFS / pico −1,5 dBTP: o mesmo da vinheta (`bumper.ts`) e o padrão de fala em
 * celular/web. Voz que chega muito abaixo (ex.: −30 LUFS) sobe até onde o pico deixa —
 * o loudnorm linear limita pelo pico — e `low` acusa no QA.
 */
import { rename, rm } from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg';

export const LOUDNESS_TARGET = { I: -16, TP: -1.5, LRA: 11 } as const;

/**
 * Limpeza leve da voz, antes do volume: corta o ronco grave (< 70 Hz) e reduz o chiado de fundo com um
 * redutor espectral moderado (afftdn, 14 dB, piso −50 dB, rastreando o ruído). Calibrado em 6 vídeos de
 * 5 instrutores: o chiado da Helena (−53 dB nas pausas) cai para ≈ −63 dB; a banda da voz (300–3400 Hz)
 * não muda (±0,01 dB). Sem gate: não corta final de palavra nem respiração.
 */
export const VOICE_CLEANUP_FILTER = 'highpass=f=70,afftdn=nr=14:nf=-50:tn=1';
/** versão da limpeza gravada em `metadata.loudness.voiceClean` (o lote não limpa duas vezes) */
export const VOICE_CLEANUP_VERSION = 'v1';
/** já dentro dessa margem do alvo: não recodifica */
export const LOUDNESS_TOLERANCE_LU = 0.5;
/** abaixo disso depois da normalização: voz baixa demais (o QA acusa) */
export const LOUDNESS_LOW_LUFS = -19;

export interface LoudnessMeasure {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

export interface LoudnessResult {
  /** integrado antes/depois (LUFS); null quando não há áudio ou é silêncio */
  inputI: number | null;
  outputI: number | null;
  outputTP: number | null;
  /** true quando o arquivo foi reescrito */
  changed: boolean;
  /** ainda abaixo de `LOUDNESS_LOW_LUFS` depois do ajuste */
  low: boolean;
  /** limpeza de voz aplicada nesta passada (`VOICE_CLEANUP_VERSION`) */
  voiceClean?: string;
}

export interface LoudnessOptions {
  /** limpa a voz antes do volume (padrão true; false quando o áudio já foi limpo, para não limpar duas vezes) */
  clean?: boolean;
}

function parseLoudnormJson(stderr: string): LoudnessMeasure | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(stderr.slice(start, end + 1)) as LoudnessMeasure;
  } catch {
    return null;
  }
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Mede o arquivo (1ª passada). null quando não tem faixa de áudio. */
export async function measureLoudness(file: string, target = LOUDNESS_TARGET, pre = ''): Promise<LoudnessMeasure | null> {
  try {
    const { stderr } = await runFfmpeg(['-i', file, '-map', '0:a:0?', '-af', `${pre ? `${pre},` : ''}loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:print_format=json`, '-vn', '-f', 'null', '-'], { loglevel: 'info', timeoutMs: 10 * 60 * 1000 });
    return parseLoudnormJson(stderr);
  } catch {
    return null;
  }
}

/** Filtro da 2ª passada (função pura): ganho linear a partir da medida. */
export function loudnormSecondPass(m: LoudnessMeasure, target = LOUDNESS_TARGET): string {
  return `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json`;
}

/**
 * Normaliza `file` NO LUGAR (grava ao lado e troca), com a limpeza de voz antes (padrão). Sem áudio ou silêncio:
 * não mexe. Sem limpeza e já no alvo: não mexe. Nunca lança por causa do volume: em erro devolve
 * `changed: false` e o arquivo original fica.
 */
export async function normalizeLoudnessInPlace(file: string, target = LOUDNESS_TARGET, opts: LoudnessOptions = {}): Promise<LoudnessResult> {
  const clean = opts.clean !== false;
  const pre = clean ? VOICE_CLEANUP_FILTER : '';
  const m1 = await measureLoudness(file, target, pre);
  const inputI = num(m1?.input_i);
  if (!m1 || inputI === null || inputI < -70) return { inputI, outputI: inputI, outputTP: num(m1?.input_tp), changed: false, low: false };
  if (!clean && Math.abs(inputI - target.I) <= LOUDNESS_TOLERANCE_LU && (num(m1.input_tp) ?? 0) <= target.TP + 0.5) {
    return { inputI, outputI: inputI, outputTP: num(m1.input_tp), changed: false, low: inputI < LOUDNESS_LOW_LUFS };
  }
  const tmp = file.replace(/(\.[a-z0-9]+)?$/i, '.loudnorm$1');
  try {
    await runFfmpeg([
      '-i', file, '-map', '0:v?', '-map', '0:a:0', '-c:v', 'copy',
      '-af', `${pre ? `${pre},` : ''}${loudnormSecondPass(m1, target)},aresample=48000`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
      '-movflags', '+faststart', tmp,
    ], { timeoutMs: 10 * 60 * 1000 });
    const m2 = await measureLoudness(tmp, target);
    await rename(tmp, file);
    const outputI = num(m2?.input_i);
    return { inputI, outputI, outputTP: num(m2?.input_tp), changed: true, low: outputI !== null && outputI < LOUDNESS_LOW_LUFS, ...(clean ? { voiceClean: VOICE_CLEANUP_VERSION } : {}) };
  } catch (e) {
    await rm(tmp, { force: true });
    console.warn(`[media] volume não normalizado (${file}): ${String(e instanceof Error ? e.message : e).slice(0, 200)}`);
    return { inputI, outputI: inputI, outputTP: num(m1.input_tp), changed: false, low: inputI < LOUDNESS_LOW_LUFS };
  }
}
