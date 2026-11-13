import { describe, expect, it } from 'vitest';
import { buildTalkDirection, sideCameraOf } from '../src/import/markdown-course';
import { MAX_TAKE_WORDS, continuousTakeGroups, type Shot } from '../src/direction';

describe('sideCameraOf: um lado por cena', () => {
  it('alterna esquerda/direita na ordem das cenas dirigidas da aula', () => {
    const z = { left: 'cam_esq', right: 'cam_dir', center: 'cam_34' };
    expect([0, 1, 2, 3].map((i) => sideCameraOf(z, i))).toEqual(['cam_esq', 'cam_dir', 'cam_esq', 'cam_dir']);
  });
  it('só um lado no kit: sempre ele', () => {
    expect([0, 1, 2].map((i) => sideCameraOf({ right: 'cam_dir' }, i))).toEqual(['cam_dir', 'cam_dir', 'cam_dir']);
  });
});

describe('buildTalkDirection: todos os planos na MESMA câmera', () => {
  const NARRATION = Array.from({ length: 12 }, (_, i) => `Frase número ${i + 1} da fala, com palavras suficientes para formar um plano inteiro sozinha aqui.`).join(' ');
  it('cena com vários planos usa uma câmera só, estática, e vira um pedido só', () => {
    const d = buildTalkDirection(NARRATION, { cameraId: 'cam_esq', framing: 'medium' })!;
    expect(d.shots.length).toBeGreaterThanOrEqual(3);
    expect(d.shots.every((s) => s.cameraId === 'cam_esq' && s.cameraMove === 'static')).toBe(true);
    expect(continuousTakeGroups(d.shots, { hasNarrationAudio: false }).length).toBe(1);
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
