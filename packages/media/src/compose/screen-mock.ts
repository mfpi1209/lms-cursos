import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFfmpeg } from './ffmpeg';
import { rasterizeSvg } from './raster';
import { buildFrameSvg, MOCK_H, MOCK_W, type MockInput } from './screen-mock-draw';
import { scheduleFromStarts, scheduleSteps } from './screen-mock-schedule';
import { writeMockFonts } from './screen-mock-text';

export type { MockInput, MockStep } from './screen-mock-draw';

/**
 * Renderizador da "tela simulada" (`ScreenMock` de @lms/course-schema): gera um MP4 H.264 1920x1080, 30 fps, SEM
 * áudio, que entra no lugar de uma gravação de tela (ver `screen.ts`).
 *
 * Como: o tempo é amostrado a 15 quadros por segundo de animação; cada instante vira um SVG (função pura do
 * tempo), SVGs idênticos são rasterizados uma única vez (resvg, processo isolado) e a sequência vai ao ffmpeg
 * pelo concat demuxer com a duração de cada imagem (trechos parados custam um quadro só).
 */

export const SCREEN_MOCK_FPS = 30;
/** passo de amostragem das animações (quadros de vídeo): 2 = 15 amostras por segundo */
const ANIM_STEP = 2;

export interface RenderScreenMockOptions {
  outPath: string;
  durationSec: number;
  /** pasta de trabalho (fontes, PNG, lista do ffmpeg); padrão: pasta temporária removida ao final */
  workDir?: string;
  /** início (s) de cada passo (ver `scheduleStepsWithCues`); ausente = distribuição proporcional ao peso */
  stepStarts?: number[];
  /** com `stepStarts`: para cada `digita` ditado na fala, quanto a fala leva para dizê-lo (a digitação acompanha) */
  stepTypeSecs?: Array<number | undefined>;
}

export interface RenderScreenMockResult {
  durationSec: number;
  width: 1920;
  height: 1080;
}

export async function renderScreenMock(mock: MockInput, opts: RenderScreenMockOptions): Promise<RenderScreenMockResult> {
  if (!(opts.durationSec > 0)) throw new Error('durationSec deve ser positivo');
  if (!mock.steps.length) throw new Error('a tela simulada precisa de ao menos um passo');
  const ownDir = !opts.workDir;
  const work = opts.workDir ?? (await mkdtemp(path.join(tmpdir(), 'screen-mock-')));
  await mkdir(work, { recursive: true });
  try {
    const fontFiles = await writeMockFonts(path.join(work, 'fonts'));
    const weights = mock.steps.map((s) => s.weight);
    const sch = opts.stepStarts && opts.stepStarts.length === mock.steps.length ? scheduleFromStarts(opts.stepStarts, weights, opts.durationSec, opts.stepTypeSecs) : scheduleSteps(weights, opts.durationSec);
    const total = Math.max(1, Math.round(opts.durationSec * SCREEN_MOCK_FPS));
    // quadros únicos, em ordem de exibição, com quantos quadros de vídeo cada um dura
    const runs: Array<{ key: string; frames: number }> = [];
    const svgByKey = new Map<string, string>();
    for (let f = 0; f < total; f += ANIM_STEP) {
      const n = Math.min(ANIM_STEP, total - f);
      const svg = buildFrameSvg(mock, sch, (f + 0.001) / SCREEN_MOCK_FPS);
      const key = createHash('sha1').update(svg).digest('hex');
      if (!svgByKey.has(key)) svgByKey.set(key, svg);
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.frames += n;
      else runs.push({ key, frames: n });
    }
    const framesDir = path.join(work, 'frames');
    await mkdir(framesDir, { recursive: true });
    const keys = [...svgByKey.keys()];
    await Promise.all(
      keys.map(async (k) => {
        const r = await rasterizeSvg(svgByKey.get(k)!, { background: '#FFFFFF', fontFiles });
        await writeFile(path.join(framesDir, `${k}.png`), r.png);
      }),
    );
    const list: string[] = [];
    for (const r of runs) list.push(`file '${path.join(framesDir, `${r.key}.png`)}'`, `duration ${(r.frames / SCREEN_MOCK_FPS).toFixed(6)}`);
    list.push(`file '${path.join(framesDir, `${runs[runs.length - 1]!.key}.png`)}'`);
    const listPath = path.join(work, 'frames.txt');
    await writeFile(listPath, list.join('\n'));
    await mkdir(path.dirname(opts.outPath), { recursive: true });
    await runFfmpeg([
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', `fps=${SCREEN_MOCK_FPS},scale=${MOCK_W}:${MOCK_H}:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      '-frames:v', String(total),
      '-c:v', 'libx264', '-preset', process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '18', '-r', String(SCREEN_MOCK_FPS),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-an', '-movflags', '+faststart', opts.outPath,
    ]);
    return { durationSec: total / SCREEN_MOCK_FPS, width: 1920, height: 1080 };
  } finally {
    if (ownDir) await rm(work, { recursive: true, force: true });
  }
}
