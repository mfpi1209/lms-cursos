/**
 * Marca d'água em vídeo de plano único (o clipe que o HeyGen devolve pronto, sem passar pelo
 * compositor): normaliza para 1920×1080 (o clipe direto vem em 1920×1072) e grava o logo da marca no
 * rodapé, na mesma geometria/opacidade dos vídeos montados (`renderWatermarkPng`, superfície `video`).
 * Só ffmpeg local: nenhum provedor, custo 0. O áudio é copiado sem recodificar.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeLoudnessInPlace, renderWatermarkToFile, runFfmpeg, type LoudnessResult } from '@lms/media/compose';
import type { WatermarkSpec } from '@lms/media';

export const CLIP_W = 1920;
export const CLIP_H = 1080;

/** Grava `out` = `input` em 1920×1080 com a marca d'água; false quando o preset não tem logo (nada gravado). */
export async function burnWatermarkFile(input: string, out: string, wm: WatermarkSpec, workDir: string): Promise<boolean> {
  const mark = await renderWatermarkToFile(path.join(workDir, 'watermark-clip.png'), {
    brand: wm.brand, surface: 'video', side: wm.position === 'bottom-left' ? 'left' : 'right', opacity: wm.opacity, width: CLIP_W, height: CLIP_H,
  });
  if (!mark) return false;
  await runFfmpeg([
    '-i', input, '-i', mark,
    '-filter_complex', `[0:v]scale=${CLIP_W}:${CLIP_H}:force_original_aspect_ratio=decrease,pad=${CLIP_W}:${CLIP_H}:(ow-iw)/2:(oh-ih)/2,setsar=1[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', '-y', out,
  ]);
  return true;
}

/**
 * Acabamento do vídeo de plano único: marca d'água (quando há `wm` com logo) e volume normalizado
 * (A15, −16 LUFS). null quando nada mudou (sem logo e volume já no alvo).
 */
export async function finishSingleShotBytes(bytes: Uint8Array, wm: WatermarkSpec | undefined): Promise<{ bytes: Uint8Array; loudness: LoudnessResult; watermarked: boolean } | null> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-wm-clip-'));
  try {
    const src = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.mp4');
    await writeFile(src, bytes);
    const watermarked = wm ? await burnWatermarkFile(src, out, wm, dir) : false;
    const file = watermarked ? out : src;
    const loudness = await normalizeLoudnessInPlace(file);
    if (!watermarked && !loudness.changed) return null;
    return { bytes: new Uint8Array(await readFile(file)), loudness, watermarked };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Bytes do vídeo com a marca d'água (null quando o preset não tem logo). */
export async function burnWatermarkBytes(bytes: Uint8Array, wm: WatermarkSpec): Promise<Uint8Array | null> {
  const r = await finishSingleShotBytes(bytes, wm);
  return r?.watermarked ? r.bytes : null;
}
