import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { burnWatermarkFile } from '../src/watermark-clip';

/* Plano único (clipe direto do HeyGen, 1920×1072): sai em 1920×1080, com áudio, e com o logo no canto. */
describe('burnWatermarkFile', () => {
  it('normaliza para 1920×1080, mantém o áudio e grava o logo no rodapé direito', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'wm-clip-test-'));
    try {
      const src = path.join(dir, 'in.mp4');
      await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x808080:s=1920x1072:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', src]);
      const out = path.join(dir, 'out.mp4');
      const ok = await burnWatermarkFile(src, out, { brand: 'dnawork', position: 'bottom-right', opacity: 0.7 }, dir);
      expect(ok).toBe(true);
      const info = await ffprobe(out);
      expect(info.width).toBe(1920);
      expect(info.height).toBe(1080);
      expect(info.hasAudio).toBe(true);
      // canto inferior direito ≠ cinza liso (o logo branco está lá); o canto esquerdo continua cinza
      const px = async (x: number, y: number) => {
        const f = path.join(dir, `p${x}.raw`);
        await runFfmpeg(['-ss', '0.5', '-i', out, '-frames:v', '1', '-vf', `crop=200:40:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-y', f]);
        return (await import('node:fs/promises')).readFile(f).then((b) => b[0]!);
      };
      expect(Math.abs((await px(20, 1020)) - 128)).toBeLessThan(6);
      expect(await px(1700, 1015)).toBeGreaterThan(134);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
