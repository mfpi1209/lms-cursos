import { spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';

/**
 * Execução de ffmpeg/ffprobe (binários do sistema). `FFMPEG_PATH` / `FFPROBE_PATH`
 * sobrescrevem o caminho; o padrão é o PATH (Homebrew em dev, apt na imagem do worker).
 */
export function ffmpegBin() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
export function ffprobeBin() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

export class FfmpegError extends Error {
  constructor(message: string, public readonly stderrTail: string) {
    super(message);
    this.name = 'FfmpegError';
  }
}

function run(bin: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : undefined;
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(new FfmpegError(`${bin} não pôde ser executado (${e.message}); instale o ffmpeg ou defina FFMPEG_PATH/FFPROBE_PATH`, ''));
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const tail = stderr.split('\n').filter(Boolean).slice(-12).join('\n');
      reject(new FfmpegError(`${bin} terminou com ${signal ? `sinal ${signal}` : `código ${code}`}: ${tail.slice(-800)}`, tail));
    });
  });
}

export async function runFfmpeg(args: string[], opts: { timeoutMs?: number; /** padrão `error`; `info` para ler a saída de filtros de análise (ex.: cropdetect) */ loglevel?: 'error' | 'info' } = {}) {
  return run(ffmpegBin(), ['-hide_banner', '-nostdin', '-y', '-loglevel', opts.loglevel ?? 'error', ...args], { timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000 });
}

/** ffprobe com argumentos livres e saída JSON (`-of json` já incluído). */
export async function ffprobeJson<T = unknown>(path: string, args: string[]): Promise<T> {
  const { stdout } = await run(ffprobeBin(), ['-v', 'error', ...args, '-of', 'json', path], { timeoutMs: 60_000 });
  return JSON.parse(stdout) as T;
}

export interface ProbeResult {
  durationSeconds: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  /** duração do stream de vídeo/áudio, quando informada */
  videoDurationSeconds?: number;
  audioDurationSeconds?: number;
}

export async function ffprobe(path: string): Promise<ProbeResult> {
  const { stdout } = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,duration', '-of', 'json', path], { timeoutMs: 60_000 });
  const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }> };
  const v = j.streams?.find((s) => s.codec_type === 'video');
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const num = (x?: string) => (x !== undefined && x !== 'N/A' && Number.isFinite(Number(x)) ? Number(x) : undefined);
  return {
    durationSeconds: num(j.format?.duration) ?? 0,
    width: v?.width,
    height: v?.height,
    hasAudio: !!a,
    hasVideo: !!v,
    videoDurationSeconds: num(v?.duration),
    audioDurationSeconds: num(a?.duration),
  };
}

/** Formata segundos para argumentos/expressões do ffmpeg (3 casas, sem notação científica). */
export function sec(n: number): string {
  return (Math.round(Math.max(0, n) * 1000) / 1000).toFixed(3);
}

/**
 * Clipe sintético de apresentador (testsrc2 + áudio): usado no modo de
 * demonstração e nos testes. O áudio vem de `audioPath` (cortado na duração)
 * ou é um tom senoidal baixo.
 */
export async function generateTestClip(opts: { output: string; seconds: number; width?: number; height?: number; fps?: number; audioPath?: string; label?: string }) {
  const w = opts.width ?? 1280;
  const h = opts.height ?? 720;
  const fps = opts.fps ?? 25;
  const d = sec(opts.seconds);
  const args = ['-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=${fps}:duration=${d}`];
  if (opts.audioPath) args.push('-i', opts.audioPath);
  else args.push('-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=48000:duration=${d}`);
  args.push(
    '-filter_complex', `[1:a]aresample=48000,volume=0.2,apad,atrim=duration=${d}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-t', d, '-movflags', '+faststart', opts.output,
  );
  await runFfmpeg(args);
  return opts.output;
}

/**
 * Clipe a partir de uma imagem parada (ex.: cartão de marca "Prévia simulada")
 * com áudio de `audioPath` (cortado/preenchido) ou silêncio. H.264 + AAC,
 * faststart, 25 fps. Usado pelo substituto do modo de demonstração.
 */
export async function generateStillClip(opts: { output: string; imagePath: string; seconds: number; audioPath?: string; fps?: number; width?: number; height?: number }) {
  const d = sec(opts.seconds);
  const fps = opts.fps ?? 25;
  const w = opts.width ?? 1920;
  const h = opts.height ?? 1080;
  const args = ['-loop', '1', '-framerate', String(fps), '-t', d, '-i', opts.imagePath];
  if (opts.audioPath) args.push('-i', opts.audioPath);
  else args.push('-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=48000:cl=stereo');
  args.push(
    '-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v];[1:a]aresample=48000,apad,atrim=duration=${d}[a]`,
    '-map', '[v]', '-map', '[a]', '-t', d,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', opts.output,
  );
  await runFfmpeg(args);
  return opts.output;
}

/**
 * Substituto do apresentador no modo simulação: repete (em loop, sem som) um
 * vídeo real já existente do mesmo apresentador e coloca o trecho de áudio do
 * plano por cima. Serve para julgar enquadramentos, slides e cortes sem pagar.
 * A boca não acompanha a fala — é só uma prévia de montagem.
 */
export async function generateStandInClip(opts: { output: string; seconds: number; sourceVideo: string; audioPath: string; startAt?: number; fps?: number; /** fundo da cena (ex.: quadro da cena em movimento): o substituto vai por cima, menor, embaixo ao centro */ backgroundImage?: string }) {
  const d = sec(opts.seconds);
  const fps = opts.fps ?? 25;
  const args = ['-stream_loop', '-1', '-ss', sec(Math.max(0, opts.startAt ?? 0)), '-i', opts.sourceVideo, '-i', opts.audioPath];
  const base = `[0:v]fps=${fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1`;
  let video = `${base}[v]`;
  if (opts.backgroundImage) {
    args.push('-loop', '1', '-framerate', String(fps), '-t', d, '-i', opts.backgroundImage);
    video = `${base},scale=1344:756[fg];[2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p[bg];[bg][fg]overlay=x=(W-w)/2:y=H-h:shortest=1,format=yuv420p[v]`;
  }
  await runFfmpeg([
    ...args,
    '-filter_complex', `${video};[1:a]aresample=48000,apad,atrim=duration=${d}[a]`,
    '-map', '[v]', '-map', '[a]', '-t', d,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', opts.output,
  ]);
  return opts.output;
}

/**
 * Fundo de continuidade da cena ("plate"): um quadro do clipe da cena em
 * movimento (0,3 s; sem quadro ali, o primeiro), em 1920×1080 (preenche e
 * recorta), com leve desfoque de profundidade (gblur) e um pouco mais escuro —
 * se a apresentadora já estiver no quadro, vira só um vulto suave ao fundo.
 * Saída JPEG (para o upload como fundo dos clipes do apresentador).
 */
export async function extractScenePlate(opts: { input: string; output: string; atSeconds?: number; width?: number; height?: number }): Promise<{ output: string; atSeconds: number }> {
  const w = opts.width ?? 1920;
  const h = opts.height ?? 1080;
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,gblur=sigma=6,eq=brightness=-0.03,format=yuvj420p`;
  const attempts = [...new Set([Math.max(0, opts.atSeconds ?? 0.3), 0])];
  let last: unknown;
  for (const at of attempts) {
    await rm(opts.output, { force: true });
    try {
      await runFfmpeg(['-ss', sec(at), '-i', opts.input, '-frames:v', '1', '-an', '-vf', vf, '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2', opts.output], { timeoutMs: 120_000 });
      if ((await stat(opts.output).catch(() => null))?.size) return { output: opts.output, atSeconds: at };
      last = new Error('nenhum quadro extraído');
    } catch (e) {
      last = e;
    }
  }
  throw new FfmpegError(`não foi possível extrair o fundo da cena: ${String(last instanceof Error ? last.message : last)}`, '');
}

/**
 * Substituto da CENA EM MOVIMENTO no modo simulação (nenhum provedor chamado):
 * o vídeo real do apresentador (ou testsrc2, sem vídeo real) com um pan lateral
 * lento + leve zoom para sugerir deslocamento, e uma etiqueta de canto opcional
 * (PNG transparente 1920×1080, ex.: "cena em movimento (simulada)"). Sem áudio:
 * na montagem a narração do plano toca por cima.
 */
export async function generateMotionStandInClip(opts: { output: string; seconds: number; sourceVideo?: string | null; tagPath?: string; startAt?: number; fps?: number }) {
  const d = sec(opts.seconds);
  const fps = opts.fps ?? 25;
  const N = Math.max(1, Math.round(opts.seconds * fps));
  const args: string[] = opts.sourceVideo
    ? ['-stream_loop', '-1', '-ss', sec(Math.max(0, opts.startAt ?? 0)), '-i', opts.sourceVideo]
    : ['-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=${fps}:duration=${d}`];
  if (opts.tagPath) args.push('-loop', '1', '-framerate', String(fps), '-t', d, '-i', opts.tagPath);
  // zoom 1,15→1,22 e pan da esquerda para a direita ao longo do plano (supersampling 2x evita tremido)
  const motion = `fps=${fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,scale=3840:2160:flags=bicubic,zoompan=z='1.15+0.07*on/${N}':x='(iw-iw/zoom)*(0.1+0.8*on/${N})':y='(ih-ih/zoom)*0.45':d=1:s=1920x1080:fps=${fps},setsar=1`;
  const filter = opts.tagPath ? `[0:v]${motion}[m];[1:v]scale=1920:1080,format=rgba[t];[m][t]overlay=0:0:format=auto,format=yuv420p[v]` : `[0:v]${motion},format=yuv420p[v]`;
  args.push('-filter_complex', filter, '-map', '[v]', '-an', '-t', d, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', opts.output);
  await runFfmpeg(args);
  return opts.output;
}

/** Áudio sintético (tom baixo) com a duração pedida, em MP3. */
export async function generateToneMp3(output: string, seconds: number) {
  await runFfmpeg(['-f', 'lavfi', '-i', `sine=frequency=180:sample_rate=44100:duration=${sec(seconds)}`, '-af', 'volume=0.15', '-c:a', 'libmp3lame', '-b:a', '128k', output]);
  return output;
}
