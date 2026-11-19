import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { TAKE_PERCENTS, buildIndexHtml, buildTakesText, cropExpr, frameTime, handsRegion, parseArgs, planTakes } from '../src/scripts/painel-pulsos';

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

  it('tomadas: grupos na mesma câmera, tempo proporcional à fala, 2 recortes (40% e 75%) por tomada', () => {
    const sh = (id: string, n: number, cameraId?: string, extra: Record<string, unknown> = {}) => ({ id, line: 'x'.repeat(n), cameraId, framing: 'medium' as const, layout: 'presenter' as const, ...extra });
    // s1+s2 na câmera A (40+40 = 80 de 100), s3 na câmera B (20)
    const takes = planTakes([sh('s1', 40, 'a'), sh('s2', 40, 'a'), sh('s3', 20, 'b')], { hasNarrationAudio: true, durationSeconds: 10 });
    expect(TAKE_PERCENTS).toEqual([40, 75]);
    expect(takes.map((t) => [t.firstShotId, t.shotIds, t.cameraId, t.start, t.end])).toEqual([['s1', ['s1', 's2'], 'a', 0, 8], ['s3', ['s3'], 'b', 8, 10]]);
    // 40% de 0-8 s = 3,2 s (plano s1); 75% = 6 s (plano s2)
    expect(takes[0]!.frames.map((f) => [f.percent, f.time, f.shot!.id])).toEqual([[40, 3.2, 's1'], [75, 6, 's2']]);
    expect(takes[1]!.frames.map((f) => f.time)).toEqual([8.8, 9.5]);
    // plano tirado no ajuste fino não conta; plano sem apresentador (slide com narração própria) e cena em movimento ficam de fora
    expect(planTakes([sh('s1', 40, 'a'), sh('s2', 40, 'a'), sh('s3', 20, 'b')], { hasNarrationAudio: true, durationSeconds: 6, dropped: ['s2'] }).map((t) => [t.firstShotId, t.start, t.end])).toEqual([['s1', 0, 4], ['s3', 4, 6]]);
    const slide = sh('s2', 40, undefined, { layout: 'slide', slide: { title: 't', bullets: [] } });
    expect(planTakes([sh('s1', 10, 'a'), slide, sh('s3', 10, 'a', { layout: 'cinematic' })], { hasNarrationAudio: true, durationSeconds: 5 }).map((t) => t.firstShotId)).toEqual(['s1']);
    expect(planTakes([], { hasNarrationAudio: true, durationSeconds: 5 })).toEqual([]);
    expect(frameTime(20, 75)).toBe(15);
  });

  it('index.html rotula aula/cena#plano, câmera e tempo, leva os 2 recortes e o vídeo na tomada; escapa texto', () => {
    const row = { label: 'aula_01/v09#s3', title: 'A & B', camera: 'cam_34', start: 4, end: 12.5, video: 'videos/a.mp4', frames: ['quadros/1.png', 'quadros/2.png'], notes: ['center / medium', 'left / medium'], firstImage: 3 };
    const html = buildIndexHtml('Curso <X>', [row], ['painel.png']);
    expect(html).toContain('aula_01/v09#s3');
    expect(html).toContain('cam_34');
    expect(html).toContain('4.0s-12.5s');
    expect(html).toContain('src="videos/a.mp4#t=4,12.5"');
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).toContain('#3 · 40%');
    expect(html).toContain('#4 · 75%');
    expect(html).toContain('Curso &lt;X&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('href="painel.png"');
    expect(html).toContain('href="tomadas.txt"');
  });

  it('tomadas.txt: uma linha por recorte, índice da imagem -> aula/cena#plano · câmera · tempo', () => {
    const rows = [
      { label: 'aula_01/v09#s3', title: 'x', camera: 'cam_34', start: 4, end: 12.5, video: 'v', frames: ['a', 'b'], notes: [], firstImage: 1 },
      { label: 'aula_01/v09#s5', title: 'x', camera: 'principal', start: 12.5, end: 20, video: 'v', frames: ['c', 'd'], notes: [], firstImage: 3 },
    ];
    expect(buildTakesText(rows).trim().split('\n')).toEqual([
      '1 -> aula_01/v09#s3 · cam_34 · 4.0s-12.5s (40%)',
      '2 -> aula_01/v09#s3 · cam_34 · 4.0s-12.5s (75%)',
      '3 -> aula_01/v09#s5 · principal · 12.5s-20.0s (40%)',
      '4 -> aula_01/v09#s5 · principal · 12.5s-20.0s (75%)',
    ]);
  });
});

describe('painel-pulsos: recorte e grade com ffmpeg real (sem drawtext)', () => {
  let dir = '';
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('recorta 960x540 de um vídeo 1920x1080 e monta a grade 2 x N', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pulsos-'));
    const video = path.join(dir, 'v.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=10:duration=2', '-pix_fmt', 'yuv420p', video]);
    const frames: string[] = [];
    for (let i = 0; i < 6; i++) {
      const crop = path.join(dir, `c${i}.png`);
      await runFfmpeg(['-ss', String(frameTime(2, TAKE_PERCENTS[i % 2]!)), '-i', video, '-frames:v', '1', '-vf', `crop=${cropExpr(handsRegion('right', 'medium'))}`, crop]);
      const tile = path.join(dir, `f${String(i + 1).padStart(5, '0')}.png`);
      await runFfmpeg(['-i', crop, '-vf', 'scale=640:360', tile]);
      frames.push(crop);
    }
    expect(await ffprobe(frames[0]!)).toMatchObject({ width: 960, height: 540 });
    const painel = path.join(dir, 'painel.png');
    await runFfmpeg(['-framerate', '1', '-i', path.join(dir, 'f%05d.png'), '-vf', 'tile=2x3', '-frames:v', '1', painel]);
    expect(await ffprobe(painel)).toMatchObject({ width: 1280, height: 1080 });
    expect((await readdir(dir)).includes('painel.png')).toBe(true);
  });
});
