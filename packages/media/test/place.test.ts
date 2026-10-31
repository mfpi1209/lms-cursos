import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_BLUR_SIGMA, buildComposeCommand, buildPlacePresenterCommand, defaultPresenterBox, detectPresenterBox, ffprobe, generateAlphaTestClip, generateTestClip, parseCropdetect, placePresenter,
  placementGeometry, probePresenterAlpha, runFfmpeg, type ComposePlan, type PlacePresenterPlan,
} from '../src/compose';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'lms-place-'));

/** RGB médio de uma região do quadro em `t` segundos (rawvideo rgb24 de 1 quadro, cortado). */
async function regionRgb(file: string, t: number, box: { x: number; y: number; w: number; h: number }): Promise<[number, number, number]> {
  const dir = tmp();
  const out = path.join(dir, 'px.rgb');
  await runFfmpeg(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=${box.w}:${box.h}:${box.x}:${box.y},scale=1:1:flags=area,format=rgb24`, '-f', 'rawvideo', out]);
  const b = readFileSync(out);
  return [b[0]!, b[1]!, b[2]!];
}

describe('posição do apresentador — geometria e filtergraph (puro)', () => {
  const src = { srcWidth: 1920, srcHeight: 1080 };
  const box = { x: 760, y: 120, w: 400, h: 960 };

  it('direita: clipe com altura = scale × H (a caixa da pessoa na mesma escala), centro em ~0,70 W, base alinhada; esquerda 0,30; centro 0,50', () => {
    const r = placementGeometry({ placement: 'right', scale: 0.92, width: 1920, height: 1080, ...src, box });
    // o clipe inteiro (1080) vira 994 de altura; a caixa (960) acompanha a mesma escala: 884 (par)
    expect(r.composition.clip.h).toBe(994);
    expect(r.height).toBe(884);
    expect(r.width).toBe(368); // 400 × 0,92, par
    // base do CLIPE no fundo do quadro; a caixa começa 120 × 0,92 abaixo do topo do clipe
    expect(r.composition.clip.y).toBe(1080 - 994);
    expect(r.y).toBe(1080 - 994 + Math.round(120 * (994 / 1080)));
    expect(r.centerX).toBeCloseTo(0.7, 2);
    expect(placementGeometry({ placement: 'left', scale: 0.92, width: 1920, height: 1080, ...src, box }).centerX).toBeCloseTo(0.3, 2);
    expect(placementGeometry({ placement: 'center', scale: 0.92, width: 1920, height: 1080, ...src, box }).centerX).toBeCloseTo(0.5, 2);
  });

  it('pessoa larga: margem mínima de 3% da borda direita (e esquerda)', () => {
    const wide = { x: 200, y: 0, w: 1400, h: 1080 };
    const r = placementGeometry({ placement: 'right', scale: 1, width: 1920, height: 1080, ...src, box: wide });
    expect(r.x + r.width).toBeLessThanOrEqual(1920 - Math.round(1920 * 0.03));
    const l = placementGeometry({ placement: 'left', scale: 1, width: 1920, height: 1080, ...src, box: wide });
    expect(l.x).toBeGreaterThanOrEqual(Math.round(1920 * 0.03));
    // escala fora do intervalo é limitada a 0,5–1,2 (altura do clipe)
    expect(placementGeometry({ placement: 'right', scale: 3, width: 1920, height: 1080, ...src, box }).composition.clip.h).toBe(1296);
  });

  it('posição livre (x) e base (bottom) só com balcão: a base nunca sobe acima da linha do balcão nem flutua sem ele', () => {
    const full = { x: 560, y: 0, w: 800, h: 1080 };
    const r = placementGeometry({ placement: 'right', scale: 0.82, x: 0.375, bottom: 0.85, foregroundFrom: 0.85, width: 1920, height: 1080, ...src, box: full, backdrop: { width: 1920, height: 1080 } });
    expect(r.centerX).toBeCloseTo(0.375, 2);
    expect(r.y + r.height).toBe(Math.round(0.85 * 1080));
    expect(r.composition.foreground).toEqual({ y: 918, height: 162 });
    // base pedida acima da linha do balcão: encosta na linha (o corte fica escondido)
    expect(placementGeometry({ placement: 'right', scale: 0.82, bottom: 0.7, foregroundFrom: 0.85, width: 1920, height: 1080, ...src, box: full, backdrop: { width: 1920, height: 1080 } }).composition.bottom).toBeCloseTo(0.85, 2);
    // sem balcão, a base fica no fundo do quadro (tronco nunca cortado à mostra)
    expect(placementGeometry({ placement: 'right', scale: 0.82, bottom: 0.85, width: 1920, height: 1080, ...src, box: full }).composition.bottom).toBe(1);
    // sem x/bottom: exatamente a geometria predefinida
    const a = placementGeometry({ placement: 'left', scale: 0.92, width: 1920, height: 1080, ...src, box });
    const b = placementGeometry({ placement: 'left', scale: 0.92, x: undefined, bottom: undefined, width: 1920, height: 1080, ...src, box });
    expect(a).toEqual(b);
  });

  it('folga acima da cabeça: o clipe desce até a cabeça cair na linha (tronco para fora); cresce só se a base subisse', () => {
    const clip = { srcWidth: 1920, srcHeight: 1072 };
    const full = { x: 0, y: 0, w: 1920, h: 1072 };
    // referência aprovada: scale 1, x 0,34, folga 6% → crop 1529:860:250:0 e overlay −314:25
    const r = placementGeometry({ placement: 'right', scale: 1, x: 0.34, headroom: 0.06, width: 1920, height: 1080, ...clip, box: full, backdrop: { width: 1920, height: 1080, frame: { x: 250 / 1920, y: 0, w: 1529 / 1920, h: 860 / 1080 } } });
    expect(r.composition.bgCrop).toEqual({ x: 250, y: 0, w: 1529, h: 860 });
    expect(r.composition.clip).toEqual({ x: -314, y: 25, w: 1934, h: 1080 });
    expect(r.composition.headTop).toBeCloseTo(0.06, 2);
    expect(r.composition.bottom).toBeGreaterThan(1);
    // escala pequena com folga: a base subiria do fundo → cresce até encostar (nunca flutua)
    const g = placementGeometry({ placement: 'right', scale: 0.6, x: 0.34, headroom: 0.06, width: 1920, height: 1080, ...clip, box: full });
    expect(g.composition.bottom).toBeCloseTo(1, 2);
    expect(g.composition.headTop).toBeCloseTo(0.06, 2);
  });

  it('caixa padrão: alfa = faixa central de 50%; substituto opaco = recorte central 3:4', () => {
    expect(defaultPresenterBox('alpha', 1920, 1080)).toEqual({ x: 480, y: 0, w: 960, h: 1080 });
    expect(defaultPresenterBox('opaque', 1920, 1080)).toEqual({ x: 554, y: 0, w: 810, h: 1080 });
  });

  it('cropdetect: usa a última linha (área máxima acumulada)', () => {
    const log = '[Parsed_cropdetect_3 @ 0x1] x1:10 crop=100:200:10:20\n[Parsed_cropdetect_3 @ 0x1] x1:5 crop=120:220:6:18\n';
    expect(parseCropdetect(log)).toEqual({ x: 6, y: 18, w: 120, h: 220 });
    expect(parseCropdetect('nada')).toBeUndefined();
  });

  const plan = (over: Partial<PlacePresenterPlan> = {}): PlacePresenterPlan => ({
    presenter: { path: 'p.webm', kind: 'alpha', codec: 'vp9', width: 1920, height: 1080, hasAudio: true, durationSeconds: 4, box },
    background: { type: 'image', path: 'bg.jpg' },
    placement: 'right', scale: 0.92, width: 1920, height: 1080, fps: 25,
    ...over,
  });

  it('alfa: decodificador libvpx-vp9 antes da entrada, fundo coberto + desfoque leve, overlay na posição, áudio do clipe', () => {
    const c = buildPlacePresenterCommand(plan());
    expect(c.inputArgs.slice(0, 4)).toEqual(['-c:v', 'libvpx-vp9', '-i', 'p.webm']);
    expect(c.inputArgs).toEqual(expect.arrayContaining(['-loop', '1', '-framerate', '25', '-i', 'bg.jpg']));
    expect(c.filterComplex).toContain(`[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=25,format=yuv420p,gblur=sigma=${BACKGROUND_BLUR_SIGMA}[bg]`);
    expect(c.filterComplex).toContain('[0:v]fps=25,format=yuva420p,crop=400:960:760:120,scale=368:884:flags=lanczos');
    expect(c.filterComplex).toContain(`overlay=x=${c.geometry.x}:y=${c.geometry.y}:shortest=1:format=auto,format=yuv420p[v]`);
    expect(c.filterComplex).not.toContain('[desk]');
    expect(c.filterComplex).toContain('[0:a]aresample=48000');
    expect(c.audioLabel).toBe('[a]');
  });

  it('VP8 usa libvpx; plano B (verde) recorta com colorkey + despill; fundo de cor via lavfi sem desfoque', () => {
    expect(buildPlacePresenterCommand(plan({ presenter: { ...plan().presenter, codec: 'vp8' } })).inputArgs.slice(0, 2)).toEqual(['-c:v', 'libvpx']);
    const g = buildPlacePresenterCommand(plan({ presenter: { ...plan().presenter, path: 'p.mp4', kind: 'chroma', codec: 'h264' }, background: { type: 'color', value: '#1a2b3c' } }));
    expect(g.inputArgs.slice(0, 2)).toEqual(['-i', 'p.mp4']);
    expect(g.filterComplex).toContain('colorkey=color=0x00FF00');
    expect(g.filterComplex).toContain('despill=type=green');
    expect(g.inputArgs).toContain('color=c=0x1A2B3C:s=1920x1080:r=25');
    expect(g.filterComplex).not.toContain('gblur');
  });

  it('balcão: a faixa do próprio cenário (nítida) vai por cima da pessoa; enquadramento recorta e escala; sem desfoque quando o cenário já vem tratado; cor só na apresentadora', () => {
    const c = buildPlacePresenterCommand(plan({ x: 0.375, bottom: 0.85, scale: 0.82, background: { type: 'image', path: 'bg.png', foregroundFrom: 0.85, size: { width: 1920, height: 1080 } } }));
    expect(c.filterComplex).toContain('[1:v]crop=1920:1080:0:0,scale=1920:1080:flags=lanczos,setsar=1,fps=25,format=yuv420p[bgsrc]');
    expect(c.filterComplex).toContain('[bgsrc]split=2[bgwall][bgdesk]');
    expect(c.filterComplex).toContain(`[bgwall]gblur=sigma=${BACKGROUND_BLUR_SIGMA}[bg]`);
    expect(c.filterComplex).toContain('[bgdesk]crop=1920:162:0:918[desk]');
    expect(c.filterComplex).toContain(`[bg][fg]overlay=x=${c.geometry.x}:y=${c.geometry.y}:shortest=1:format=auto[wall]`);
    expect(c.filterComplex).toContain('[wall][desk]overlay=x=0:y=918:format=auto,format=yuv420p[v]');
    expect(c.geometry.y + c.geometry.height).toBe(918);
    // enquadramento aprovado (plano médio sem piso) + cenário já tratado (sem gblur) + harmonização quente só no [fg]
    const m = buildPlacePresenterCommand(plan({ x: 0.34, scale: 1, headroom: 0.06, grade: 'warm', presenter: { ...plan().presenter, height: 1072, box: undefined }, background: { type: 'image', path: 'bg.png', blur: false, size: { width: 1920, height: 1080 }, frame: { x: 250 / 1920, y: 0, w: 1529 / 1920, h: 860 / 1080 } } }));
    expect(m.filterComplex).toContain('[1:v]crop=1529:860:250:0,scale=1920:1080:flags=lanczos,setsar=1,fps=25,format=yuv420p[bg]');
    expect(m.filterComplex).not.toContain('gblur');
    expect(m.filterComplex).toContain('[0:v]fps=25,format=rgba,eq=saturation=1.04:brightness=0.01,format=yuva420p,');
    expect(m.filterComplex.split('[fg]')[0]).toContain('eq=');
    expect(m.filterComplex.split('[bg]')[0]).not.toContain('eq=');
    expect(m.geometry.composition.clip).toEqual({ x: -314, y: 25, w: 1934, h: 1080 });
    // plano B (verde) com balcão: o mesmo caminho
    const g = buildPlacePresenterCommand(plan({ bottom: 0.85, presenter: { ...plan().presenter, path: 'p.mp4', kind: 'chroma', codec: 'h264' }, background: { type: 'image', path: 'bg.png', foregroundFrom: 0.85 } }));
    expect(g.filterComplex).toContain('colorkey=color=0x00FF00');
    expect(g.filterComplex).toContain('[desk]');
  });

  it('montagem: com o apresentador à direita, recortes de enquadramento e da tela dividida seguem a pessoa (focusX)', () => {
    const shot = (over: Partial<ComposePlan['shots'][number]>) => ({ id: 's', layout: 'presenter' as const, framing: 'close' as const, nativeFraming: 'medium' as const, move: 'static' as const, transition: 'cut' as const, duration: 2, clip: { path: 'c.mp4', width: 1920, height: 1080, hasAudio: true }, ...over });
    const centered = buildComposeCommand({ width: 1920, height: 1080, fps: 25, background: '#000000', shots: [shot({})] });
    const right = buildComposeCommand({ width: 1920, height: 1080, fps: 25, background: '#000000', shots: [shot({ clip: { path: 'c.mp4', width: 1920, height: 1080, hasAudio: true, focusX: 0.7 } })] });
    expect(centered.filterComplex).toContain('crop=1440:810:240:');
    expect(right.filterComplex).toContain('crop=1440:810:480:'); // limitado à borda (0,7 × 1920 − 720 = 624 > 480)
    const split = buildComposeCommand({ width: 1920, height: 1080, fps: 25, background: '#000000', shots: [shot({ layout: 'presenter_slide_right', framing: 'medium', slidePath: 's.png', clip: { path: 'c.mp4', width: 1920, height: 1080, hasAudio: true, focusX: 0.7 } })] });
    expect(split.filterComplex).toContain('crop=960:1080:864:0');
  });
});

describe('posição do apresentador — ffmpeg real com clipe sintético com alfa', () => {
  it('detecta alfa (VP9 + ALPHA_MODE), acha a pessoa, monta à direita sobre a imagem; fundo visível à esquerda', async () => {
    const dir = tmp();
    const alpha = await generateAlphaTestClip({ output: path.join(dir, 'alpha.webm'), seconds: 2 });
    expect(await probePresenterAlpha(alpha)).toEqual({ codec: 'vp9', alpha: true });
    const box = await detectPresenterBox(alpha, 'alpha', 'vp9');
    // círculo de raio 119 centrado em (320, 216)
    expect(box).toBeDefined();
    expect(Math.abs(box!.x + box!.w / 2 - 320)).toBeLessThan(12);
    expect(box!.w).toBeGreaterThan(200);
    // fundo: imagem vermelha lisa
    const bg = path.join(dir, 'bg.png');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xC81E1E:s=800x600', '-frames:v', '1', bg]);
    const out = path.join(dir, 'placed.mp4');
    const r = await placePresenter({ presenterVideo: alpha, background: { type: 'image', path: bg }, placement: 'right', scale: 0.92, output: out });
    expect(r.kind).toBe('alpha');
    expect(r.geometry.centerX).toBeCloseTo(0.7, 1);
    const p = await ffprobe(out);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true, hasVideo: true });
    expect(Math.abs(p.durationSeconds - 2)).toBeLessThan(0.2);
    // à esquerda: só o fundo (vermelho); no centro da pessoa: o círculo (não vermelho)
    const left = await regionRgb(out, 1, { x: 100, y: 500, w: 40, h: 40 });
    expect(left[0]).toBeGreaterThan(150);
    expect(left[1]).toBeLessThan(80);
    const cx = Math.round(r.geometry.x + r.geometry.width / 2);
    const person = await regionRgb(out, 1, { x: cx - 20, y: Math.round(r.geometry.y + r.geometry.height / 2) - 20, w: 40, h: 40 });
    expect(Math.abs(person[0] - left[0]) + Math.abs(person[2] - left[2])).toBeGreaterThan(60);
    // codec de saída: H.264 + AAC com faststart (moov antes de mdat)
    const head = readFileSync(out).subarray(0, 4096).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1);

    // cenário com balcão: metade de baixo da imagem azul, de cima vermelha; a faixa azul (a partir de 60%) cobre o círculo
    const desk = path.join(dir, 'desk.png');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xC81E1E:s=1920x1080', '-f', 'lavfi', '-i', 'color=c=0x1E3CC8:s=1920x432', '-filter_complex', '[0:v][1:v]overlay=x=0:y=648[v]', '-map', '[v]', '-frames:v', '1', desk]);
    const out2 = path.join(dir, 'placed-desk.mp4');
    const r2 = await placePresenter({ presenterVideo: alpha, background: { type: 'image', path: desk, foregroundFrom: 0.6 }, placement: 'right', x: 0.4, bottom: 0.6, scale: 1.0, grade: 'warm', output: out2 });
    expect(r2.geometry.centerX).toBeCloseTo(0.4, 1);
    expect(r2.geometry.composition.foreground).toEqual({ y: 648, height: 432 });
    // a base do círculo fica na linha do balcão: logo abaixo dela só há a faixa azul (nunca o círculo)
    const cx2 = Math.round(r2.geometry.x + r2.geometry.width / 2);
    const below = await regionRgb(out2, 1, { x: cx2 - 20, y: 660, w: 40, h: 40 });
    expect(below[2]).toBeGreaterThan(150);
    expect(below[0]).toBeLessThan(80);
    // acima da linha, no centro do círculo, não é nem vermelho nem azul puro
    const mid = await regionRgb(out2, 1, { x: cx2 - 20, y: Math.round(r2.geometry.y + r2.geometry.height / 2) - 20, w: 40, h: 40 });
    expect(Math.abs(mid[0] - 200) + Math.abs(mid[2] - 30)).toBeGreaterThan(60);
    expect(await ffprobe(out2)).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
  }, 180_000);

  it('plano B (verde) e substituto opaco da simulação também montam', async () => {
    const dir = tmp();
    const alpha = await generateAlphaTestClip({ output: path.join(dir, 'alpha.webm'), seconds: 1.5 });
    const chroma = path.join(dir, 'chroma.mp4');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0x00FF00:s=640x360:r=25:d=1.5', '-c:v', 'libvpx-vp9', '-i', alpha, '-filter_complex', '[0:v][1:v]overlay=format=auto,format=yuv420p[v]', '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', chroma]);
    const box = await detectPresenterBox(chroma, 'chroma');
    expect(box).toBeDefined();
    expect(Math.abs(box!.x + box!.w / 2 - 320)).toBeLessThan(12);
    const r = await placePresenter({ presenterVideo: chroma, kind: 'chroma', background: { type: 'color', value: '#203040' }, placement: 'left', output: path.join(dir, 'c.mp4') });
    expect(r.geometry.centerX).toBeCloseTo(0.3, 1);
    const g = await regionRgb(r.output, 0.7, { x: 1700, y: 500, w: 40, h: 40 });
    expect(g[1]).toBeLessThan(100); // nada de verde no fundo
    const opaque = await generateTestClip({ output: path.join(dir, 'o.mp4'), seconds: 1, width: 1280, height: 720 });
    const o = await placePresenter({ presenterVideo: opaque, background: { type: 'color', value: '#203040' }, placement: 'right', scale: 0.8, output: path.join(dir, 'o-placed.mp4') });
    expect(o.kind).toBe('opaque');
    expect(o.geometry.height).toBe(864);
    expect(o.geometry.composition.clip.h).toBe(864);
    expect(await ffprobe(o.output)).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
  }, 120_000);
});
