import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { PERCENTS, buildIndexHtml, cropExpr, frameTime, handsRegion, parseArgs, shotAtPercent } from '../src/scripts/painel-pulsos';

describe('painel-pulsos (puro)', () => {
  it('argumentos: --course e --out obrigatórios; --cenas opcional', () => {
    expect(parseArgs(['--course', 'crs_a', '--out', '/tmp/x'])).toEqual({ course: 'crs_a', out: '/tmp/x' });
    expect(parseArgs(['--course', 'crs_a', '--out', '/tmp/x', '--cenas', 'v01, v02,q01~a,v01']).cenas).toEqual(['v01', 'v02', 'q01~a']);
    expect(() => parseArgs(['--out', '/tmp/x'])).toThrow(/course/);
    expect(() => parseArgs(['--course', 'a'])).toThrow(/out/);
    expect(() => parseArgs(['--course', 'a', '--out', 'x', '--cenas', ' '])).toThrow(/cenas/);
  });

  it('região das mãos: metade de baixo, na zona da câmera; 1920x1080 -> 960x540', () => {
    for (const zone of ['left', 'center', 'right'] as const) {
      const r = handsRegion(zone, 'medium');
      expect(r.y).toBe(0.5);
      expect(r.x + r.w).toBeLessThanOrEqual(1);
      expect(r.w * 1920).toBe(960);
      expect(r.h * 1080).toBe(540);
    }
    expect(handsRegion('left', 'medium').x).toBeLessThan(handsRegion('center', 'medium').x);
    expect(handsRegion('right', 'medium').x).toBeGreaterThan(handsRegion('center', 'medium').x);
    expect(handsRegion('center', 'wide').y).toBeLessThan(handsRegion('center', 'close').y);
    expect(cropExpr(handsRegion('center', 'medium'))).toBe('iw*0.5:ih*0.5:iw*0.25:ih*0.5');
  });

  it('plano e instante dos quadros (25/50/75%)', () => {
    const shots = [{ line: 'a'.repeat(40) }, { line: 'b'.repeat(40) }, { line: 'c'.repeat(20) }];
    expect(PERCENTS).toEqual([25, 50, 75]);
    expect(PERCENTS.map((p) => shotAtPercent(shots, p)!.line[0])).toEqual(['a', 'b', 'b']);
    expect(shotAtPercent([], 50)).toBeUndefined();
    expect(frameTime(20, 25)).toBe(5);
    expect(frameTime(20, 75)).toBe(15);
  });

  it('index.html leva o rótulo aula/cena, os 3 quadros e o vídeo, e escapa texto', () => {
    const html = buildIndexHtml('Curso <X>', [{ label: 'aula_01/v01', title: 'A & B', video: 'videos/a.mp4', frames: ['quadros/1.png', 'quadros/2.png', 'quadros/3.png'], notes: ['center / medium', 'left / medium', 'right / close'] }], ['painel.png']);
    expect(html).toContain('aula_01/v01');
    expect(html).toContain('src="videos/a.mp4"');
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain('Curso &lt;X&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('href="painel.png"');
  });
});

describe('painel-pulsos: recorte e grade com ffmpeg real (sem drawtext)', () => {
  let dir = '';
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('recorta 960x540 de um vídeo 1920x1080 e monta a grade 3 x N', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pulsos-'));
    const video = path.join(dir, 'v.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=10:duration=2', '-pix_fmt', 'yuv420p', video]);
    const frames: string[] = [];
    for (let i = 0; i < 6; i++) {
      const crop = path.join(dir, `c${i}.png`);
      await runFfmpeg(['-ss', String(frameTime(2, PERCENTS[i % 3]!)), '-i', video, '-frames:v', '1', '-vf', `crop=${cropExpr(handsRegion('right', 'medium'))}`, crop]);
      const tile = path.join(dir, `f${String(i + 1).padStart(5, '0')}.png`);
      await runFfmpeg(['-i', crop, '-vf', 'scale=640:360', tile]);
      frames.push(crop);
    }
    expect(await ffprobe(frames[0]!)).toMatchObject({ width: 960, height: 540 });
    const painel = path.join(dir, 'painel.png');
    await runFfmpeg(['-framerate', '1', '-i', path.join(dir, 'f%05d.png'), '-vf', 'tile=3x2', '-frames:v', '1', painel]);
    expect(await ffprobe(painel)).toMatchObject({ width: 1920, height: 720 });
    expect((await readdir(dir)).includes('painel.png')).toBe(true);
  });
});
