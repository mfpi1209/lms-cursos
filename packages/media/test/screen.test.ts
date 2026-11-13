import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeScreenScene, ffprobe, ffprobeJson, parseFreezeDetect, planScreenTiming, runFfmpeg } from '../src/compose';

const outSec = (p: ReturnType<typeof planScreenTiming>) => p.segments.reduce((a, s) => a + (s.end - s.start) / s.speed, 0) + p.freezeSec;

describe('planScreenTiming (função pura)', () => {
  it('curta até 3 s: congela o último quadro, fit ok', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 8 }], narrationSec: 10 });
    expect(p.fit).toBe('ok');
    expect(p.freezeSec).toBeCloseTo(2);
    expect(p.trimmedSec).toBe(0);
    expect(p.segments).toEqual([{ recording: 0, start: 0, end: 8, speed: 1 }]);
    expect(planScreenTiming({ recordings: [{ durationSec: 7 }], narrationSec: 10 }).fit).toBe('ok'); // exatamente 3 s
  });

  it('curta mais de 3 s: monta congelando, fit short', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 5 }], narrationSec: 10 });
    expect(p.fit).toBe('short');
    expect(p.freezeSec).toBeCloseTo(5);
    expect(outSec(p)).toBeCloseTo(10);
  });

  it('longa: só acelera os trechos parados, o suficiente para caber (ok)', () => {
    // 12 s, parado em 2–8 (6 s); narração 11 s -> sobra 1 s -> parado 6 -> 5 s (1,2x)
    const p = planScreenTiming({ recordings: [{ durationSec: 12, stills: [{ start: 2, end: 8 }] }], narrationSec: 11 });
    expect(p.fit).toBe('ok');
    expect(p.trimmedSec).toBe(0);
    expect(p.speedup).toBeCloseTo(1.2, 5);
    expect(outSec(p)).toBeCloseTo(11, 5);
    expect(p.segments.map((s) => s.speed.toFixed(2))).toEqual(['1.00', '1.20', '1.00']);
  });

  it('longa: no limite exato de 1,5x ainda é ok', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 12, stills: [{ start: 2, end: 8 }] }], narrationSec: 8 }); // economia máx. = 2 s... precisa de 4
    expect(p.fit).toBe('trimmed');
    const q = planScreenTiming({ recordings: [{ durationSec: 12, stills: [{ start: 2, end: 8 }] }], narrationSec: 10 });
    expect(q.fit).toBe('ok');
    expect(q.speedup).toBeCloseTo(1.5, 5);
    expect(outSec(q)).toBeCloseTo(10, 5);
  });

  it('longa: aceleração máxima não basta -> corta o fim (trimmed); movimento nunca acelera', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 12, stills: [{ start: 2, end: 8 }] }], narrationSec: 8 });
    expect(p.speedup).toBeCloseTo(1.5);
    expect(p.fit).toBe('trimmed');
    expect(p.trimmedSec).toBeCloseTo(2, 5); // precisava de 4 s, a aceleração deu 2
    expect(outSec(p)).toBeCloseTo(8, 5);
    expect(p.segments.filter((s) => s.speed === 1)).toHaveLength(2);
    // sem trechos parados: corta direto
    const q = planScreenTiming({ recordings: [{ durationSec: 12 }], narrationSec: 9 });
    expect(q).toMatchObject({ fit: 'trimmed', speedup: 1 });
    expect(q.trimmedSec).toBeCloseTo(3);
    expect(q.segments).toEqual([{ recording: 0, start: 0, end: 9, speed: 1 }]);
  });

  it('igual: nada muda; sobra de arredondamento (<= 0,1 s) corta sem avisar', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 10 }], narrationSec: 10 });
    expect(p).toMatchObject({ fit: 'ok', freezeSec: 0, trimmedSec: 0, speedup: 1 });
    const q = planScreenTiming({ recordings: [{ durationSec: 10.05 }], narrationSec: 10 });
    expect(q.fit).toBe('ok');
    expect(outSec(q)).toBeCloseTo(10, 5);
  });

  it('várias gravações: soma na ordem; o corte do fim atravessa gravações', () => {
    const p = planScreenTiming({ recordings: [{ durationSec: 4 }, { durationSec: 3, stills: [{ start: 0, end: 3 }] }, { durationSec: 5 }], narrationSec: 9.5 });
    // R = 12, excesso 2,5; parado = 3 s -> economia máxima 1 s -> corta 1,5 s do fim
    expect(p.fit).toBe('trimmed');
    expect(p.trimmedSec).toBeCloseTo(1.5);
    expect(outSec(p)).toBeCloseTo(9.5, 5);
    expect(p.segments.map((s) => s.recording)).toEqual([0, 1, 2]);
    expect(p.segments[2]).toMatchObject({ start: 0, end: 3.5 });
    // corte maior que a última gravação
    const q = planScreenTiming({ recordings: [{ durationSec: 4 }, { durationSec: 3 }, { durationSec: 2 }], narrationSec: 5 });
    expect(q.segments).toEqual([{ recording: 0, start: 0, end: 4, speed: 1 }, { recording: 1, start: 0, end: 1, speed: 1 }]);
    // gravação curta + curta: congela só no fim da última
    const r = planScreenTiming({ recordings: [{ durationSec: 3 }, { durationSec: 4 }], narrationSec: 9 });
    expect(r).toMatchObject({ fit: 'ok', freezeSec: 2 });
  });

  it('lê a saída do freezedetect (inclusive parado até o fim)', () => {
    const log = ['[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 2.0', '[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 1.5', '[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 3.5', '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 7.25'].join('\n');
    expect(parseFreezeDetect(log, 9)).toEqual([{ start: 2, end: 3.5 }, { start: 7.25, end: 9 }]);
  });
});

describe('composeScreenScene (ffmpeg real, mídia sintética)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'lms-screen-test-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** cruzamentos por zero por segundo / 2 ≈ frequência do tom (decodifica 8 kHz mono) */
  async function dominantHz(file: string): Promise<number> {
    const raw = path.join(dir, 'pcm.raw');
    await runFfmpeg(['-i', file, '-t', '3', '-ac', '1', '-ar', '8000', '-f', 's16le', raw]);
    const buf = await readFile(raw);
    let crossings = 0;
    let prev = 0;
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const v = buf.readInt16LE(i);
      if (prev < -500 && v >= 500) crossings++;
      if (Math.abs(v) >= 500) prev = v;
    }
    return crossings / (buf.length / 2 / 8000);
  }

  it('2 vídeos de proporções diferentes + trecho parado + narração: 1920x1080, 30 fps, duração = narração, só o áudio da narração', async () => {
    // A: 4:3 640x480, 2 s com movimento + 2 s parado (cinza), áudio de 1000 Hz (deve ser descartado)
    const a = path.join(dir, 'a.mp4');
    await runFfmpeg([
      '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=25:duration=2', '-f', 'lavfi', '-i', 'color=c=gray:size=640x480:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100:duration=4',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', a,
    ]);
    // B: 16:9 1280x720, 3 s com movimento, áudio de 1000 Hz
    const b = path.join(dir, 'b.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', b]);
    // narração sintética: 440 Hz, 6,5 s (R = 7 s -> sobra 0,5 s; parado = 2 s acelera até 1,25x)
    const narration = path.join(dir, 'n.mp3');
    await runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=6.5', '-c:a', 'libmp3lame', '-b:a', '128k', narration]);

    const out = path.join(dir, 'out.mp4');
    const r = await composeScreenScene({ recordings: [a, b], narrationFile: narration, output: out });

    expect(r.plan.fit).toBe('ok');
    expect(r.plan.speedup).toBeGreaterThan(1.2);
    expect(r.plan.speedup).toBeLessThanOrEqual(1.5);
    expect(r.recordingDurations[0]).toBeCloseTo(4, 0);
    expect(r.recordingDurations[1]).toBeCloseTo(3, 0);

    const p = await ffprobe(out);
    expect(p.width).toBe(1920);
    expect(p.height).toBe(1080);
    expect(Math.abs(p.durationSeconds - 6.5)).toBeLessThanOrEqual(0.1);
    const meta = await runFfmpeg(['-i', out, '-f', 'null', '-'], { loglevel: 'info' });
    expect(meta.stderr).toMatch(/Video: h264.*\b30 fps/);
    const streams = await ffprobeJson<{ streams: Array<{ codec_type: string }> }>(out, ['-show_entries', 'stream=codec_type']);
    expect(streams.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
    const hz = await dominantHz(out);
    expect(Math.abs(hz - 440)).toBeLessThan(40); // narração (440 Hz), não o áudio das gravações (1000 Hz)
  }, 120_000);
});
