/**
 * Diferença de pose entre dois quadros (tronco e braços do apresentador, no centro do quadro): média da
 * diferença absoluta de luminância (0–255) numa área central (50% da largura, 75% de baixo da altura),
 * em escala reduzida. Serve para escolher a emenda: com a pose muito diferente, uma fusão longa mostra
 * "braços fantasma" (as duas posições sobrepostas); aí a emenda é curta ou em corte seco.
 *
 * Referência medida (vídeos dos cursos, 25 qps): quadros vizinhos ≈ 2–5; movimento natural da fala em 0,6 s
 * ≈ 13–24; a emenda com braços fantasma do C05 ≈ 25.
 */
import { runFfmpeg } from './ffmpeg';

/** até aqui: mesma pose (fusão normal) */
export const POSE_SAME_MAX = 8;
/** acima disso: pose muito diferente (corte seco); entre os dois: fusão curta */
export const POSE_FAR_MIN = 16;
/** fusão curta entre poses próximas (s) */
export const SHORT_CROSSFADE = 0.12;

/** Fusão a usar numa emenda pela diferença de pose: null = mantém a padrão; 0 = corte seco; senão a duração (s). Pura. */
export function crossfadeForPose(diff: number | null): number | null {
  if (diff === null || !Number.isFinite(diff)) return null;
  if (diff <= POSE_SAME_MAX) return null;
  if (diff >= POSE_FAR_MIN) return 0;
  return SHORT_CROSSFADE;
}

/** Diferença de pose entre o quadro `ta` de `a` e o quadro `tb` de `b`. null quando não dá para medir. */
export async function poseDifference(a: string, ta: number, b: string, tb: number): Promise<number | null> {
  const prep = 'trim=end_frame=1,scale=320:180,format=gray,crop=160:135:80:45';
  try {
    const { stderr } = await runFfmpeg([
      '-ss', Math.max(0, ta).toFixed(3), '-i', a, '-ss', Math.max(0, tb).toFixed(3), '-i', b,
      '-filter_complex', `[0:v]${prep}[pa];[1:v]${prep}[pb];[pa][pb]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
      '-frames:v', '1', '-f', 'null', '-',
    ], { loglevel: 'info', timeoutMs: 60_000 });
    const m = /YAVG=([\d.]+)/.exec(stderr);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
