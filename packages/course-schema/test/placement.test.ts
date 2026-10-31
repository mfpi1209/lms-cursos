import { describe, expect, it } from 'vitest';
import { CameraSchema, PresentationSchema, cameraPlacementHashPart, emptyCourseDocument, looksSeated, resolveCameraPlacement, singleShotPlacementParams } from '../src';

describe('posição da apresentadora (schema)', () => {
  it('documentos antigos: centro e 92% da altura por padrão', () => {
    const p = PresentationSchema.parse({ avatarId: 'a', background: { type: 'color', value: '#F7F8FA' } });
    expect(p.presenterPlacement).toBe('center');
    expect(p.presenterScale).toBe(0.92);
    expect(emptyCourseDocument('Curso').presentation).toMatchObject({ presenterPlacement: 'center', presenterScale: 0.92 });
  });
  it('aceita direita/esquerda e tamanho entre 0,5 e 1,2', () => {
    expect(PresentationSchema.parse({ presenterPlacement: 'right', presenterScale: 1.2 })).toMatchObject({ presenterPlacement: 'right', presenterScale: 1.2 });
    expect(PresentationSchema.safeParse({ presenterPlacement: 'top' }).success).toBe(false);
    expect(PresentationSchema.safeParse({ presenterScale: 0.4 }).success).toBe(false);
    expect(PresentationSchema.safeParse({ presenterScale: 1.3 }).success).toBe(false);
  });
});

describe('posição por câmera', () => {
  const cam = (extra: Record<string, unknown> = {}) => CameraSchema.parse({ id: 'c1', name: 'Câmera', lookId: 'look_1', ...extra });

  it('câmeras antigas (sem placement/scale) continuam válidas e sem os campos', () => {
    const c = cam();
    expect(c).not.toHaveProperty('placement');
    expect(c).not.toHaveProperty('scale');
    const p = PresentationSchema.parse({ presenterPlacement: 'right', cameras: [{ id: 'a', name: 'A', lookId: 'l' }] });
    expect(p.cameras[0]).toEqual({ id: 'a', name: 'A', lookId: 'l', nativeFraming: 'medium', angle: 'front', status: 'ready' });
  });

  it('valida placement e scale', () => {
    expect(cam({ placement: 'full_frame', scale: 1 })).toMatchObject({ placement: 'full_frame', scale: 1 });
    expect(CameraSchema.safeParse({ id: 'c', name: 'c', lookId: 'l', placement: 'top' }).success).toBe(false);
    expect(CameraSchema.safeParse({ id: 'c', name: 'c', lookId: 'l', scale: 0.4 }).success).toBe(false);
    expect(CameraSchema.safeParse({ id: 'c', name: 'c', lookId: 'l', scale: 1.3 }).success).toBe(false);
  });

  it('resolveCameraPlacement: inherit usa o curso; full_frame/centro são opacos; direita/esquerda transparentes', () => {
    const right = { presenterPlacement: 'right' as const, presenterScale: 0.8 };
    expect(resolveCameraPlacement(right, undefined)).toEqual({ placement: 'right', scale: 0.8, transparent: true });
    expect(resolveCameraPlacement(right, cam())).toEqual({ placement: 'right', scale: 0.8, transparent: true });
    expect(resolveCameraPlacement(right, cam({ placement: 'inherit', scale: 1.1 }))).toEqual({ placement: 'right', scale: 1.1, transparent: true });
    expect(resolveCameraPlacement(right, cam({ placement: 'full_frame' }))).toEqual({ placement: 'full_frame', scale: 0.8, transparent: false });
    expect(resolveCameraPlacement(right, cam({ placement: 'center' }))).toMatchObject({ placement: 'center', transparent: false });
    expect(resolveCameraPlacement({ presenterPlacement: 'center' }, cam({ placement: 'left' }))).toEqual({ placement: 'left', scale: 0.92, transparent: true });
    expect(resolveCameraPlacement(undefined, undefined)).toEqual({ placement: 'center', scale: 0.92, transparent: false });
    expect(resolveCameraPlacement(PresentationSchema.parse({}), null)).toEqual({ placement: 'center', scale: 0.92, transparent: false });
  });

  it('looksSeated reconhece pedidos de visual sentado', () => {
    expect(looksSeated('Sentada à mesa de reunião, plano médio')).toBe(true);
    expect(looksSeated('Sentado, leve ângulo lateral')).toBe(true);
    expect(looksSeated('seated at a meeting table, medium shot')).toBe(true);
    expect(looksSeated('em pé, mesmo escritório, luz suave')).toBe(false);
    expect(looksSeated(undefined)).toBe(false);
  });
});

describe('posição por câmera: hash de cena e plano único', () => {
  const right = { presenterPlacement: 'right' as const, presenterScale: 0.92 };
  it('câmera inherit (ou tamanho sem efeito) não muda o hash; posição própria muda', () => {
    expect(cameraPlacementHashPart(right, undefined)).toBeUndefined();
    expect(cameraPlacementHashPart(right, {})).toBeUndefined();
    expect(cameraPlacementHashPart(right, { placement: 'inherit' })).toBeUndefined();
    expect(cameraPlacementHashPart(right, { placement: 'right', scale: 0.92 })).toBeUndefined();
    expect(cameraPlacementHashPart({ presenterPlacement: 'center' }, { scale: 1.1 })).toBeUndefined();
    expect(cameraPlacementHashPart(right, { placement: 'full_frame' })).toEqual({ placement: 'full_frame' });
    expect(cameraPlacementHashPart(right, { scale: 1.1 })).toEqual({ placement: 'right', scale: 1.1 });
    expect(cameraPlacementHashPart(right, { placement: 'center' })).toEqual({ placement: 'center' });
  });
  it('plano único: params iguais aos de antes para câmera principal inherit', () => {
    expect(singleShotPlacementParams(right, undefined)).toEqual({ presenterPlacement: 'right', presenterScale: 0.92 });
    expect(singleShotPlacementParams(right, { placement: 'inherit' })).toEqual({ presenterPlacement: 'right', presenterScale: 0.92 });
    expect(singleShotPlacementParams({ presenterPlacement: 'center', presenterScale: 0.92 }, undefined)).toEqual({});
    expect(singleShotPlacementParams(right, { placement: 'full_frame' })).toEqual({ presenterPlacement: 'full_frame' });
    expect(singleShotPlacementParams(right, { placement: 'center' })).toEqual({});
    expect(singleShotPlacementParams(right, { placement: 'left', scale: 1 })).toEqual({ presenterPlacement: 'left', presenterScale: 1 });
  });
});

describe('cenário: posição livre, base, folga, balcão e enquadramento (aditivos)', () => {
  const cam = (extra: Record<string, unknown> = {}) => CameraSchema.parse({ id: 'c1', name: 'Câmera', lookId: 'look_1', ...extra });
  it('schema: campos opcionais com limites; documentos antigos não ganham chaves', () => {
    const p = PresentationSchema.parse({ presenterPlacement: 'right', presenterX: 0.375, presenterBottom: 0.85, presenterHeadroom: 0.06, presenterGrade: 'warm', background: { type: 'image', assetId: 'ast_1', foregroundFrom: 0.85, frame: { x: 0.13, y: 0, w: 0.796, h: 0.796 }, blur: false } });
    expect(p).toMatchObject({ presenterX: 0.375, presenterBottom: 0.85, presenterHeadroom: 0.06, presenterGrade: 'warm', background: { foregroundFrom: 0.85, blur: false } });
    expect(PresentationSchema.safeParse({ presenterX: 0.1 }).success).toBe(false);
    expect(PresentationSchema.safeParse({ presenterX: 0.9 }).success).toBe(false);
    expect(PresentationSchema.safeParse({ presenterBottom: 0.4 }).success).toBe(false);
    expect(PresentationSchema.safeParse({ presenterHeadroom: 0.1 }).success).toBe(false);
    expect(PresentationSchema.safeParse({ background: { type: 'image', assetId: 'a', foregroundFrom: 0.3 } }).success).toBe(false);
    expect(PresentationSchema.safeParse({ background: { type: 'image', assetId: 'a', frame: { x: 0, y: 0, w: 0.05, h: 1 } } }).success).toBe(false);
    const old = PresentationSchema.parse({ presenterPlacement: 'right', background: { type: 'image', assetId: 'ast_1' } });
    expect(old).not.toHaveProperty('presenterX');
    expect(old).not.toHaveProperty('presenterBottom');
    expect(old).not.toHaveProperty('presenterHeadroom');
    expect(old.background).not.toHaveProperty('foregroundFrom');
    expect(cam({ x: 0.4, bottom: 0.9 })).toMatchObject({ x: 0.4, bottom: 0.9 });
    expect(CameraSchema.safeParse({ id: 'c', name: 'c', lookId: 'l', x: 0.05 }).success).toBe(false);
  });

  it('resolveCameraPlacement devolve x/bottom/headroom só quando definidos e só na montagem nossa (direita/esquerda)', () => {
    const right = { presenterPlacement: 'right' as const, presenterScale: 0.82, presenterX: 0.375, presenterBottom: 0.85, presenterHeadroom: 0.06 };
    expect(resolveCameraPlacement(right, null)).toEqual({ placement: 'right', scale: 0.82, transparent: true, x: 0.375, bottom: 0.85, headroom: 0.06 });
    // a câmera sobrepõe x/bottom; folga é do curso
    expect(resolveCameraPlacement(right, cam({ x: 0.6, bottom: 1 }))).toEqual({ placement: 'right', scale: 0.82, transparent: true, x: 0.6, bottom: 1, headroom: 0.06 });
    // tela cheia e centro: nada de posição livre
    expect(resolveCameraPlacement(right, cam({ placement: 'full_frame' }))).toEqual({ placement: 'full_frame', scale: 0.82, transparent: false });
    expect(resolveCameraPlacement({ presenterPlacement: 'center', presenterX: 0.4 }, null)).toEqual({ placement: 'center', scale: 0.92, transparent: false });
    // sem os campos: exatamente como antes
    expect(resolveCameraPlacement({ presenterPlacement: 'right', presenterScale: 0.8 }, cam())).toEqual({ placement: 'right', scale: 0.8, transparent: true });
  });

  it('hash: câmera igual ao curso continua sem parte; x/bottom próprios entram; plano único leva presenterX/Bottom/Headroom só quando definidos', () => {
    const right = { presenterPlacement: 'right' as const, presenterScale: 0.92 };
    const scenery = { ...right, presenterX: 0.375, presenterBottom: 0.85, presenterHeadroom: 0.06 };
    expect(cameraPlacementHashPart(scenery, cam())).toBeUndefined();
    expect(cameraPlacementHashPart(scenery, cam({ x: 0.375, bottom: 0.85 }))).toBeUndefined();
    expect(cameraPlacementHashPart(scenery, cam({ x: 0.6 }))).toEqual({ placement: 'right', scale: 0.92, x: 0.6, bottom: 0.85 });
    expect(cameraPlacementHashPart(right, cam({ bottom: 0.9 }))).toEqual({ placement: 'right', scale: 0.92, bottom: 0.9 });
    // plano único: sem os campos, exatamente os params de antes (hash inalterado)
    expect(singleShotPlacementParams(right, undefined)).toEqual({ presenterPlacement: 'right', presenterScale: 0.92 });
    expect(singleShotPlacementParams(scenery, undefined)).toEqual({ presenterPlacement: 'right', presenterScale: 0.92, presenterX: 0.375, presenterBottom: 0.85, presenterHeadroom: 0.06 });
    expect(singleShotPlacementParams({ presenterPlacement: 'center', presenterX: 0.375 }, undefined)).toEqual({});
  });
});
