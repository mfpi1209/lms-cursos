import { describe, expect, it } from 'vitest';
import { altCameraPlan, buildTalkDirection } from '../src/import/markdown-course';
import { MAX_TAKE_WORDS, continuousTakeGroups, type Shot } from '../src/direction';

const ALT_R = { cameraId: 'cam_dir', framing: 'medium' as const };
const ALT_L = { cameraId: 'cam_esq', framing: 'medium' as const };

describe('altCameraPlan: troca de câmera com propósito', () => {
  it('cenas de 1 e 2 planos, ou sem câmera alternativa, não trocam', () => {
    expect(altCameraPlan(1, [ALT_R])).toEqual([undefined]);
    expect(altCameraPlan(2, [ALT_R])).toEqual([undefined, undefined]);
    expect(altCameraPlan(8, [])).toEqual(Array(8).fill(undefined));
  });

  it('abre com 2 planos na base, troca para outra câmera por 3 planos e volta (no máximo uma troca a cada 2-3 planos)', () => {
    const plan = altCameraPlan(12, [ALT_R, ALT_L]);
    expect(plan.map((p) => p?.cameraId ?? 'base')).toEqual(['base', 'base', 'cam_dir', 'cam_dir', 'cam_dir', 'base', 'base', 'base', 'cam_esq', 'cam_esq', 'cam_esq', 'base']);
    // número de trocas (cortes de câmera) por cena
    const cams = plan.map((p) => p?.cameraId ?? 'base');
    const cuts = cams.filter((c, i) => i > 0 && c !== cams[i - 1]).length;
    expect(cuts).toBeLessThanOrEqual(Math.ceil(12 / 3) + 1);
  });

  it('3 planos: o terceiro vai para outra câmera', () => {
    expect(altCameraPlan(3, [ALT_R]).map((p) => p?.cameraId ?? 'base')).toEqual(['base', 'base', 'cam_dir']);
  });
});

describe('buildTalkDirection com alternativas: nunca corta para a mesma câmera', () => {
  const NARRATION = Array.from({ length: 12 }, (_, i) => `Frase número ${i + 1} da fala, com palavras suficientes para formar um plano inteiro sozinha aqui.`).join(' ');

  it('a base continua em todos os planos de abertura; a troca é sempre para uma câmera diferente da base', () => {
    const d = buildTalkDirection(NARRATION, { cameraId: 'cam_34', framing: 'medium' }, [{ cameraId: 'cam_34', framing: 'medium' }, ALT_R, ALT_L])!;
    expect(d.shots.length).toBeGreaterThanOrEqual(3);
    expect(d.shots[0]!.cameraId).toBe('cam_34');
    expect(d.shots[1]!.cameraId).toBe('cam_34');
    const alt = d.shots.filter((s) => s.cameraId !== 'cam_34');
    expect(alt.length).toBeGreaterThan(0);
    for (const s of alt) expect(['cam_dir', 'cam_esq']).toContain(s.cameraId);
  });

  it('sem alternativas, tudo na câmera da cena (como antes)', () => {
    const d = buildTalkDirection(NARRATION, { cameraId: 'cam_34', framing: 'medium' })!;
    expect(d.shots.every((s) => s.cameraId === 'cam_34')).toBe(true);
  });
});

describe('continuousTakeGroups: tomada contínua', () => {
  const sh = (line: string, cameraId?: string, extra: Partial<Shot> = {}) => ({ line, cameraId, layout: 'presenter' as const, ...extra });

  it('planos vizinhos na mesma câmera = 1 grupo; troca de câmera = novo grupo', () => {
    expect(continuousTakeGroups([sh('a b c', 'c1'), sh('d e f', 'c1'), sh('g h i', 'c1')], { hasNarrationAudio: true })).toEqual([[0, 1, 2]]);
    expect(continuousTakeGroups([sh('a b c', 'c1'), sh('d e f', 'c1'), sh('g h i', 'c2'), sh('j k l', 'c1')], { hasNarrationAudio: true })).toEqual([[0, 1], [2], [3]]);
  });

  it('câmera ausente = principal (mesma que vazia)', () => {
    expect(continuousTakeGroups([sh('a b c'), sh('d e f', undefined)], { hasNarrationAudio: true })).toEqual([[0, 1]]);
  });

  it('plano sem apresentador (slide/card) e cena em movimento quebram a tomada', () => {
    const slide = { line: 'x y z', cameraId: 'c1', layout: 'slide' as const, slide: { title: 't', bullets: ['a'], style: 'checklist' as const } } as Shot;
    expect(continuousTakeGroups([sh('a b', 'c1'), slide, sh('d e', 'c1')], { hasNarrationAudio: true })).toEqual([[0], [1], [2]]);
    // voz do HeyGen: o áudio mora no clipe, então o slide também precisa do apresentador
    expect(continuousTakeGroups([sh('a b', 'c1'), slide, sh('d e', 'c1')], { hasNarrationAudio: false })).toEqual([[0, 1, 2]]);
    expect(continuousTakeGroups([sh('a b', 'c1'), sh('x y', 'c1', { layout: 'cinematic' }), sh('d e', 'c1')], { hasNarrationAudio: true })).toEqual([[0], [1], [2]]);
  });

  it('tomada longa demais é cortada num limite de plano', () => {
    const words = (n: number) => Array(n).fill('p').join(' ');
    const g = continuousTakeGroups([sh(words(MAX_TAKE_WORDS - 10), 'c1'), sh(words(20), 'c1'), sh(words(5), 'c1')], { hasNarrationAudio: true });
    expect(g).toEqual([[0], [1, 2]]);
  });
});
