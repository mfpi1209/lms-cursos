import { describe, expect, it } from 'vitest';
import { BACKDROP_FRAME_PRESETS, NOMINAL_CLIP, PRESENTER_GRADE_CSS, backdropCrop, computeComposition, foregroundStrip, frameAspectFix, mediumFrameFor } from '../src/compose/layout';

const F = { width: 1920, height: 1080 };

describe('computeComposition (layout puro partilhado entre prévia e montagem)', () => {
  it('reproduz a composição aprovada da recepção sem balcão: crop 1529:860:250:0, clipe −314:25 (scale 1, x 0,34, folga 6%)', () => {
    const c = computeComposition({ frame: F, backdrop: { width: 1920, height: 1080, frame: { x: 250 / 1920, y: 0, w: 1529 / 1920, h: 860 / 1080 } }, clip: { width: 1920, height: 1072 }, presenterX: 0.34, presenterScale: 1, headroom: 0.06 });
    expect(c.bgCrop).toEqual({ x: 250, y: 0, w: 1529, h: 860 });
    expect(c.bgScale).toBeCloseTo(1920 / 1529, 4);
    expect(c.clip).toEqual({ x: -314, y: 25, w: 1934, h: 1080 });
    expect(c.presenter).toEqual(c.clip);
    expect(c.centerX).toBeCloseTo(0.34, 2);
    expect(c.headTop).toBeCloseTo(0.06, 2);
    expect(c.bottom).toBeGreaterThan(1); // tronco continua para fora da borda
    expect(c.foreground).toBeUndefined();
  });

  it('recepção com balcão: imagem inteira, base na linha do tampo (0,85) e faixa a partir de 918 px', () => {
    const c = computeComposition({ frame: F, backdrop: { width: 1920, height: 1080 }, clip: { ...NOMINAL_CLIP }, presenterX: 0.375, presenterScale: 0.82, presenterBottom: 0.85, foregroundFrom: 0.85 });
    expect(c.bgCrop).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(c.foreground).toEqual({ y: 918, height: 162 });
    expect(c.clip.y + c.clip.h).toBe(918);
    expect(c.clip.h).toBe(Math.round(0.82 * 1080) - ((Math.round(0.82 * 1080)) % 2));
    expect(c.centerX).toBeCloseTo(0.375, 2);
  });

  it('nunca flutua: sem balcão a base é o fundo do quadro; com balcão, nunca acima da linha dele', () => {
    const clip = { width: 1920, height: 1072 };
    expect(computeComposition({ frame: F, clip, presenterBottom: 0.7, presenterScale: 0.8 }).bottom).toBe(1);
    expect(computeComposition({ frame: F, backdrop: { width: 1920, height: 1080 }, clip, presenterBottom: 0.7, foregroundFrom: 0.85, presenterScale: 0.8 }).bottom).toBeCloseTo(0.85, 2);
    expect(computeComposition({ frame: F, backdrop: { width: 1920, height: 1080 }, clip, presenterBottom: 0.95, foregroundFrom: 0.85, presenterScale: 0.8 }).bottom).toBeCloseTo(0.95, 2);
  });

  it('folga: escala uniforme; se o clipe pequeno deixasse a base acima do fundo, cresce (nunca estica) até encostar', () => {
    const clip = { width: 1920, height: 1072 };
    const c = computeComposition({ frame: F, clip, presenterX: 0.34, presenterScale: 0.6, headroom: 0.06 });
    expect(c.bottom).toBeCloseTo(1, 2);
    expect(c.headTop).toBeCloseTo(0.06, 2);
    expect(c.clip.w / c.clip.h).toBeCloseTo(1920 / 1072, 2);
    // folga fora da faixa é limitada (5–8%)
    expect(computeComposition({ frame: F, clip, presenterScale: 1, headroom: 0.2 }).headTop).toBeCloseTo(0.08, 2);
  });

  it('caixa da pessoa: centrada em x com margem de 3%; a escala vale para o clipe inteiro', () => {
    const c = computeComposition({ frame: F, clip: { ...NOMINAL_CLIP }, presenterX: 0.85, presenterScale: 1 });
    expect(c.presenter.x + c.presenter.w).toBeLessThanOrEqual(1920 - 58);
    expect(c.presenter.h).toBe(Math.round((NOMINAL_CLIP.box.h * 1080) / 1072 / 2) * 2);
    expect(c.clip.h).toBe(1080);
    // predefinidos sem x: 0,30 / 0,50 / 0,70
    expect(computeComposition({ frame: F, clip: { ...NOMINAL_CLIP }, placement: 'left', presenterScale: 0.92 }).centerX).toBeCloseTo(0.3, 2);
    expect(computeComposition({ frame: F, clip: { ...NOMINAL_CLIP }, placement: 'right', presenterScale: 0.92 }).centerX).toBeCloseTo(0.7, 2);
  });

  it('backdropCrop: cobertura centralizada em 16:9 (imagens largas e altas) e janela contida na imagem', () => {
    expect(backdropCrop({ width: 4000, height: 1000 }, F)).toEqual({ x: 1111, y: 0, w: 1778, h: 1000 });
    expect(backdropCrop({ width: 1000, height: 1000 }, F)).toEqual({ x: 0, y: 219, w: 1000, h: 563 });
    // janela que sai da imagem é encostada na borda; a altura sai da largura
    expect(backdropCrop({ width: 1920, height: 1080, frame: { x: 0.5, y: 0.5, w: 0.8, h: 0.3 } }, F)).toEqual({ x: 384, y: 216, w: 1536, h: 864 });
    expect(mediumFrameFor({ width: 1920, height: 1080 })).toMatchObject({ y: 0, w: 0.8, h: 0.8 });
    expect(mediumFrameFor({ width: 1920, height: 1080 }).x).toBeCloseTo(0.1, 4);
    expect(BACKDROP_FRAME_PRESETS).toEqual(['wide', 'medium']);
  });

  it('frameAspectFix e foregroundStrip', () => {
    expect(frameAspectFix({ x: 0, y: 0, w: 0.8, h: 0.8 })).toBeUndefined();
    expect(frameAspectFix({ x: 0, y: 0, w: 0.8, h: 0.5 })).toBeCloseTo(0.8, 3);
    expect(foregroundStrip(0.85, 1080)).toEqual({ y: 918, height: 162 });
    expect(foregroundStrip(undefined, 1080)).toBeUndefined();
    expect(foregroundStrip(1, 1080)).toEqual({ y: 1078, height: 2 });
    expect(PRESENTER_GRADE_CSS.none).toBe('none');
  });
});
