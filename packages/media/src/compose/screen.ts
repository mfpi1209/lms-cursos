import { ffprobe, runFfmpeg, sec } from './ffmpeg';

/**
 * Cena de GRAVAÇÃO DE TELA PRÓPRIA: os MP4 do autor em tela cheia (1920x1080, 30 fps), na ordem, + a narração
 * em áudio (voz da instrutora). Sem avatar, sem picture-in-picture, áudio original das gravações descartado.
 *
 * REGRA DE DURAÇÃO — a narração (N) SEMPRE manda no tempo da cena; R = soma das gravações:
 *  - R <= N: o último quadro é congelado até completar (tpad clone). Faltou até 3 s = `ok`; mais que isso = `short`
 *    (monta mesmo assim, para prévia; o autor deve regravar);
 *  - R > N: primeiro acelera os TRECHOS PARADOS (freezedetect) até no máximo 1,5x, o suficiente para caber (`ok`);
 *    se ainda sobrar, corta o FIM (`trimmed`). Trechos com movimento nunca são acelerados.
 */
export const SCREEN_W = 1920;
export const SCREEN_H = 1080;
export const SCREEN_FPS = 30;
/** faltou até isto de mídia (congelando o último quadro) e ainda é `ok` */
export const SCREEN_SHORT_TOLERANCE_SEC = 3;
/** velocidade máxima aplicada aos trechos parados */
export const SCREEN_MAX_SPEEDUP = 1.5;
/** corte do fim de até isto (≈ 3 quadros) não vira o aviso "mídia cortada": diferença de arredondamento, não conteúdo perdido */
export const SCREEN_TRIM_TOLERANCE_SEC = 0.1;
/**
 * Trecho parado = `freezedetect` com ruído -60 dB (diferença média entre quadros abaixo de 0,1% — o padrão do
 * filtro; absorve o ruído do H.264 e o cursor parado, mas qualquer janela/rolagem/digitação quebra o trecho)
 * durante pelo menos 0,5 s (pausas menores não valem a aceleração e deixariam o vídeo nervoso).
 */
export const FREEZE_NOISE_DB = -60;
export const FREEZE_MIN_SEC = 0.5;

export type ScreenFit = 'ok' | 'short' | 'trimmed';

export interface StillRange {
  start: number;
  end: number;
}

export interface ScreenSegment {
  /** índice da gravação */
  recording: number;
  /** trecho da gravação (segundos de origem) */
  start: number;
  end: number;
  /** 1 = velocidade normal; > 1 = trecho parado acelerado */
  speed: number;
}

export interface ScreenTimingPlan {
  /** trechos na ordem de exibição (já sem o que foi cortado no fim) */
  segments: ScreenSegment[];
  fit: ScreenFit;
  /** segundos de último quadro congelado no fim (R < N) */
  freezeSec: number;
  /** segundos de saída cortados do fim (R > N depois da aceleração máxima) */
  trimmedSec: number;
  /** velocidade aplicada aos trechos parados (1 = nenhuma) */
  speedup: number;
}

const EPS = 1e-6;

function normalizeStills(stills: StillRange[] | undefined, duration: number): StillRange[] {
  const sorted = (stills ?? [])
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(duration, s.end) }))
    .filter((s) => s.end - s.start > 0.05)
    .sort((a, b) => a.start - b.start);
  const out: StillRange[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + EPS) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Função PURA: como encaixar as gravações na narração (ver o cabeçalho do arquivo). */
export function planScreenTiming(input: { recordings: Array<{ durationSec: number; stills?: StillRange[] }>; narrationSec: number }): ScreenTimingPlan {
  const N = input.narrationSec;
  const recs = input.recordings.map((r) => ({ dur: Math.max(0, r.durationSec), stills: normalizeStills(r.stills, r.durationSec) }));
  const R = recs.reduce((a, r) => a + r.dur, 0);
  const stillTotal = recs.reduce((a, r) => a + r.stills.reduce((b, s) => b + (s.end - s.start), 0), 0);

  let speedup = 1;
  let trimmedSec = 0;
  let freezeSec = 0;
  let fit: ScreenFit = 'ok';
  if (R <= N + EPS) {
    freezeSec = Math.max(0, N - R);
    if (N - R > SCREEN_SHORT_TOLERANCE_SEC + EPS) fit = 'short';
  } else {
    const excess = R - N;
    const maxSave = stillTotal * (1 - 1 / SCREEN_MAX_SPEEDUP);
    if (excess <= maxSave + EPS) {
      speedup = stillTotal - excess > EPS ? stillTotal / (stillTotal - excess) : SCREEN_MAX_SPEEDUP;
      speedup = Math.min(SCREEN_MAX_SPEEDUP, Math.max(1, speedup));
    } else {
      speedup = stillTotal > EPS ? SCREEN_MAX_SPEEDUP : 1;
      trimmedSec = excess - (stillTotal > EPS ? maxSave : 0);
      if (trimmedSec > SCREEN_TRIM_TOLERANCE_SEC) fit = 'trimmed';
    }
  }

  const segments: ScreenSegment[] = [];
  recs.forEach((r, recording) => {
    let cursor = 0;
    const push = (start: number, end: number, speed: number) => {
      if (end - start > 0.01) segments.push({ recording, start, end, speed });
    };
    for (const s of r.stills) {
      push(cursor, s.start, 1);
      push(s.start, s.end, speedup);
      cursor = s.end;
    }
    push(cursor, r.dur, 1);
  });

  // corta o FIM (tempo de saída): o último trecho perde primeiro
  let rest = trimmedSec;
  while (rest > EPS && segments.length) {
    const last = segments[segments.length - 1]!;
    const outDur = (last.end - last.start) / last.speed;
    if (outDur <= rest + EPS) {
      segments.pop();
      rest -= outDur;
    } else {
      last.end -= rest * last.speed;
      rest = 0;
    }
  }
  return { segments, fit, freezeSec, trimmedSec, speedup };
}

/**
 * Grafo de filtros: cada gravação -> 30 fps, 1920x1080 com a proporção preservada (scale + pad preto, nunca corta);
 * trechos (trim + setpts) -> concat -> congela o fim se faltar -> exatamente N s. O áudio é só a narração
 * (entrada `narrationIndex`); o áudio das gravações nem é mapeado.
 */
export function buildScreenFilter(plan: ScreenTimingPlan, recordingCount: number, narrationIndex: number, narrationSec: number): string {
  const parts: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < recordingCount; i++) {
    const segs = plan.segments.filter((s) => s.recording === i);
    if (!segs.length) continue;
    const norm = `fps=${SCREEN_FPS},scale=${SCREEN_W}:${SCREEN_H}:force_original_aspect_ratio=decrease,pad=${SCREEN_W}:${SCREEN_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`;
    if (segs.length === 1) parts.push(`[${i}:v]${norm}[r${i}_0]`);
    else parts.push(`[${i}:v]${norm},split=${segs.length}${segs.map((_, j) => `[r${i}_${j}]`).join('')}`);
    segs.forEach((s, j) => {
      const label = `v${labels.length}`;
      parts.push(`[r${i}_${j}]trim=start=${sec(s.start)}:end=${sec(s.end)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(6)}[${label}]`);
      labels.push(label);
    });
  }
  if (!labels.length) throw new Error('nenhum trecho de vídeo para montar');
  parts.push(`${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0[cat]`);
  // sempre sobra um quadro congelado de folga; o trim fixa a duração exata da narração
  parts.push(`[cat]tpad=stop_mode=clone:stop_duration=${sec(plan.freezeSec + 2)},trim=duration=${sec(narrationSec)},setpts=PTS-STARTPTS,fps=${SCREEN_FPS}[vout]`);
  parts.push(`[${narrationIndex}:a]aresample=48000,apad,atrim=duration=${sec(narrationSec)},asetpts=PTS-STARTPTS[aout]`);
  return parts.join(';');
}

/** Trechos parados de um vídeo (`freezedetect`; ver FREEZE_NOISE_DB / FREEZE_MIN_SEC). */
export function parseFreezeDetect(stderr: string, duration: number): StillRange[] {
  const out: StillRange[] = [];
  let open: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /freeze_start:\s*(-?[\d.]+)/.exec(line);
    const e = /freeze_end:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    else if (e && open !== null) {
      out.push({ start: open, end: Number(e[1]) });
      open = null;
    }
  }
  // parado até o fim do arquivo: o filtro não emite freeze_end
  if (open !== null) out.push({ start: open, end: duration });
  return out;
}

export async function detectStillRanges(file: string, duration: number): Promise<StillRange[]> {
  const { stderr } = await runFfmpeg(['-i', file, '-map', '0:v:0', '-an', '-vf', `freezedetect=n=${FREEZE_NOISE_DB}dB:d=${FREEZE_MIN_SEC}`, '-f', 'null', '-'], { loglevel: 'info' });
  return parseFreezeDetect(stderr, duration);
}

/** tempo mínimo de uma tela gerada quando a narração já está toda ocupada por gravações enviadas */
export const MOCK_MIN_SEC = 2;

/**
 * Divide o tempo da narração entre as TELAS GERADAS da cena. Gravações enviadas entram com a duração delas
 * (`uploadSec`); as telas geradas repartem o que sobra da narração (N - soma dos enviados) PROPORCIONALMENTE ao
 * total de `weight` dos passos de cada uma (passo sem peso = 1), com mínimo de MOCK_MIN_SEC cada. Se o mínimo
 * estourar a narração, a regra de duração normal (corte do fim) vale para a soma. Função pura.
 *
 * Com `cueSec` (instante, na narração, em que a fala chega no primeiro passo de cada tela gerada) em TODAS as telas
 * geradas, a divisão segue a fala: cada tela dura até o `cueSec` da próxima (a primeira começa em 0; a última vai
 * até o fim da narração). Faltando `cueSec` em alguma, vale a proporção pelo peso.
 * Devolve a duração de cada item (enviado: a dele; gerado: a calculada), na ordem.
 */
export function splitMockDurations(items: Array<{ uploadSec: number } | { mockWeight: number; cueSec?: number }>, narrationSec: number): number[] {
  const mocks = items.filter((i): i is { mockWeight: number; cueSec?: number } => 'mockWeight' in i);
  if (mocks.length && mocks.every((m) => m.cueSec !== undefined)) {
    const out: number[] = [];
    let pos = 0;
    items.forEach((it, k) => {
      if ('uploadSec' in it) {
        out.push(it.uploadSec);
        pos += it.uploadSec;
        return;
      }
      let uploadsBetween = 0;
      let next: number | undefined;
      for (let q = k + 1; q < items.length; q++) {
        const o = items[q]!;
        if ('uploadSec' in o) uploadsBetween += o.uploadSec;
        else {
          next = o.cueSec;
          break;
        }
      }
      const dur = Math.max(MOCK_MIN_SEC, (next ?? narrationSec) - uploadsBetween - pos);
      out.push(dur);
      pos += dur;
    });
    return out;
  }
  const uploaded = items.reduce((a, i) => a + ('uploadSec' in i ? i.uploadSec : 0), 0);
  const weights = items.map((i) => ('mockWeight' in i ? Math.max(i.mockWeight, 0.0001) : 0));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const rest = Math.max(0, narrationSec - uploaded);
  return items.map((i, k) => ('uploadSec' in i ? i.uploadSec : Math.max(MOCK_MIN_SEC, (rest * weights[k]!) / totalW)));
}

export class ScreenMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenMediaError';
  }
}

export interface ScreenComposeResult {
  output: string;
  /** duração da saída (= narração) */
  durationSec: number;
  /** duração medida (ffprobe) de cada gravação, na ordem da entrada */
  recordingDurations: number[];
  plan: ScreenTimingPlan;
}

/** Monta a cena de gravação de tela: `recordings` (arquivos MP4 na ordem) + `narrationFile` (áudio) -> `output`. */
export async function composeScreenScene(opts: { recordings: string[]; narrationFile: string; output: string; /** telas geradas (já na duração certa): não passam pelo freezedetect nem são aceleradas */ generated?: boolean[] }): Promise<ScreenComposeResult> {
  if (!opts.recordings.length) throw new ScreenMediaError('a cena não tem gravações de tela');
  const durations: number[] = [];
  for (const f of opts.recordings) {
    const p = await ffprobe(f);
    if (!p.hasVideo) throw new ScreenMediaError('uma das gravações não tem vídeo legível');
    durations.push(p.videoDurationSeconds ?? p.durationSeconds);
  }
  const narration = await ffprobe(opts.narrationFile);
  const N = narration.audioDurationSeconds ?? narration.durationSeconds;
  if (!(N > 0)) throw new ScreenMediaError('a narração não tem áudio legível');
  // só procura trechos parados quando sobra mídia (é o único caso em que acelerar importa)
  const R = durations.reduce((a, b) => a + b, 0);
  const stills: StillRange[][] = [];
  for (let i = 0; i < opts.recordings.length; i++) stills.push(R > N && !opts.generated?.[i] ? await detectStillRanges(opts.recordings[i]!, durations[i]!) : []);
  const plan = planScreenTiming({ recordings: durations.map((d, i) => ({ durationSec: d, stills: stills[i] })), narrationSec: N });
  const filter = buildScreenFilter(plan, opts.recordings.length, opts.recordings.length, N);
  const args: string[] = [];
  for (const f of opts.recordings) args.push('-i', f);
  args.push('-i', opts.narrationFile, '-filter_complex', filter, '-map', '[vout]', '-map', '[aout]');
  args.push('-c:v', 'libx264', '-preset', process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(SCREEN_FPS));
  args.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', sec(N), '-movflags', '+faststart', opts.output);
  await runFfmpeg(args);
  return { output: opts.output, durationSec: N, recordingDurations: durations, plan };
}
