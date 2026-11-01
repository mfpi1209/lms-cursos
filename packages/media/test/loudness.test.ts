import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOUDNESS_TARGET, VOICE_CLEANUP_FILTER, VOICE_CLEANUP_VERSION, loudnormSecondPass, measureLoudness, normalizeLoudnessInPlace, runFfmpeg } from '../src/compose';

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
    expect(r.voiceClean).toBe(VOICE_CLEANUP_VERSION);
    // já limpo e no alvo: sem a limpeza de novo, não mexe
    expect((await normalizeLoudnessInPlace(quiet, undefined, { clean: false })).changed).toBe(false);
    const mute = path.join(dir, 'mute.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25:d=1', '-c:v', 'libx264', mute]);
    expect((await normalizeLoudnessInPlace(mute)).changed).toBe(false);
  }, 60_000);

  it('limpeza de voz: o chiado nas pausas cai em relação à mesma gravação sem limpeza', async () => {
    expect(VOICE_CLEANUP_FILTER).toMatch(/afftdn/);
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-clean-'));
    const src = path.join(dir, 'src.mp4');
    // "fala" (tom de 300 Hz em rajadas de 1 s) com chiado rosa constante por baixo (semente fixa: resultado estável)
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=25:d=6', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=6', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.006:sample_rate=48000:duration=6:seed=7',
      '-filter_complex', "[1:a]volume='if(lt(mod(t,2),1),0.3,0)':eval=frame[s];[s][2:a]amix=inputs=2:normalize=0[a]", '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
    const floor = async (f: string) => {
      const { stderr } = await runFfmpeg(['-i', f, '-af', 'astats=measure_overall=Noise_floor:measure_perchannel=none', '-f', 'null', '-'], { loglevel: 'info' });
      return Number(/Noise floor dB: (-?[\d.]+)/.exec(stderr)![1]);
    };
    const plain = path.join(dir, 'plain.mp4');
    const clean = path.join(dir, 'clean.mp4');
    await runFfmpeg(['-i', src, '-c', 'copy', plain]);
    await runFfmpeg(['-i', src, '-c', 'copy', clean]);
    await normalizeLoudnessInPlace(plain, undefined, { clean: false });
    const r = await normalizeLoudnessInPlace(clean);
    expect(r.changed).toBe(true);
    expect(r.voiceClean).toBe(VOICE_CLEANUP_VERSION);
    expect(await floor(clean)).toBeLessThan((await floor(plain)) - 6);
  }, 60_000);
});
