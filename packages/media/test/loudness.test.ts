import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOUDNESS_TARGET, loudnormSecondPass, measureLoudness, normalizeLoudnessInPlace, runFfmpeg } from '../src/compose';

describe('volume único (A15)', () => {
  it('2ª passada é linear e usa as medidas', () => {
    const f = loudnormSecondPass({ input_i: '-25.0', input_tp: '-8.0', input_lra: '3.0', input_thresh: '-35.0', target_offset: '0.2' });
    expect(f).toContain('linear=true');
    expect(f).toContain('measured_I=-25.0');
    expect(f).toContain(`I=${LOUDNESS_TARGET.I}`);
  });

  it('voz baixa sobe para −16 LUFS; rodar de novo não mexe; sem áudio não quebra', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-loud-'));
    const quiet = path.join(dir, 'quiet.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25:d=4', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=4', '-af', 'volume=0.03', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', quiet]);
    const before = Number((await measureLoudness(quiet))!.input_i);
    expect(before).toBeLessThan(-24);
    const r = await normalizeLoudnessInPlace(quiet);
    expect(r.changed).toBe(true);
    expect(Math.abs(r.outputI! - LOUDNESS_TARGET.I)).toBeLessThan(1);
    expect((await normalizeLoudnessInPlace(quiet)).changed).toBe(false);
    const mute = path.join(dir, 'mute.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25:d=1', '-c:v', 'libx264', mute]);
    expect((await normalizeLoudnessInPlace(mute)).changed).toBe(false);
  }, 60_000);
});
