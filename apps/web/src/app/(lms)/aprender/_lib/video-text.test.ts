import { describe, expect, it } from 'vitest';
import { videoShort, videoSpoken } from './video-text';

describe('duração do cartão (curta e por extenso)', () => {
  it('um tempo só: "4 min" e "4 minutos de vídeo"', () => {
    expect(videoShort({ minS: 200, maxS: 230 })).toBe('4 min');
    expect(videoSpoken({ minS: 200, maxS: 230 })).toBe('4 minutos de vídeo');
  });
  it('um minuto, menos de um minuto e faixa', () => {
    expect(videoSpoken({ minS: 50, maxS: 60 })).toBe('1 minuto de vídeo');
    expect(videoSpoken({ minS: 20, maxS: 40 })).toBe('menos de 1 minuto de vídeo');
    expect(videoShort({ minS: 330, maxS: 460 })).toBe('6–8 min');
    expect(videoSpoken({ minS: 330, maxS: 460 })).toBe('de 6 a 8 minutos de vídeo');
  });
  it('horas', () => {
    expect(videoSpoken({ minS: 3900, maxS: 3900 })).toBe('1 hora e 5 minutos de vídeo');
  });
  it('sem vídeo ou com duração indisponível: nada (o cartão mostra só as aulas)', () => {
    expect(videoShort({ minS: 0, maxS: 0 })).toBeNull();
    expect(videoShort({ minS: 100, maxS: 200, unavailable: true })).toBeNull();
    expect(videoSpoken({ minS: 0, maxS: 0 })).toBeNull();
  });
});
