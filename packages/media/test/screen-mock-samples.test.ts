import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderScreenMock } from '../src/compose';
import { runFfmpeg } from '../src/compose/ffmpeg';
import { SCREEN_MOCK_SAMPLES } from './fixtures/screen-mock-samples';

/** Gera as amostras (MP4 + PNG do último quadro) quando `SCREEN_MOCK_SAMPLES_DIR` está definida; senão é ignorado. */
const dir = process.env.SCREEN_MOCK_SAMPLES_DIR;
const SUFFIX = process.env.SCREEN_MOCK_SAMPLES_DEVICE === 'desktop' ? 'desktop' : '';

describe.skipIf(!dir)('amostras da tela simulada', () => {
  for (const [model, sample] of Object.entries(SCREEN_MOCK_SAMPLES)) {
    it(`gera ${model}`, async () => {
      mkdirSync(dir!, { recursive: true });
      const mp4 = path.join(dir!, `${model}${SUFFIX ? '-' + SUFFIX : ''}.mp4`);
      const t0 = Date.now();
      const mock = { ...sample, ...(SUFFIX ? { device: 'desktop' as const } : {}) };
      await renderScreenMock(mock, { outPath: mp4, durationSec: Number(process.env.SCREEN_MOCK_SAMPLES_DURATION) || sample.durationSec });
      console.log(`[amostra] ${model}${SUFFIX}: ${((Date.now() - t0) / 1000).toFixed(1)} s para ${Number(process.env.SCREEN_MOCK_SAMPLES_DURATION) || sample.durationSec} s de vídeo`);
      await runFfmpeg(['-sseof', '-0.1', '-i', mp4, '-frames:v', '1', '-update', '1', mp4.replace(/\.mp4$/, '.png')]);
      expect(true).toBe(true);
    }, 300_000);
  }
});
