import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRAIL_ORDER, TRAIL_SERIES, trailSlug } from '@lms/course-schema';
import { allArtFiles, COURSE_ART, HERO_ART, TRAIL_ART, courseArtFor, trailArtFor } from './course-art';

const PUBLIC = path.resolve(__dirname, '../../../../../public');

/** largura × altura do cabeçalho do WebP (lossy `VP8 `, lossless `VP8L` ou estendido `VP8X`). */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error(`WebP desconhecido: ${kind}`);
}

describe('artes da vitrine (public/capas)', () => {
  const files = allArtFiles();

  it('são 31 artes: 26 capas, 4 trilhas e 1 destaque, sem arquivo repetido', () => {
    expect(Object.keys(COURSE_ART)).toHaveLength(26);
    expect(Object.keys(TRAIL_ART)).toHaveLength(4);
    expect(Object.keys(HERO_ART)).toHaveLength(1);
    expect(new Set(files.map((f) => f.src)).size).toBe(31);
    expect(new Set(Object.values(COURSE_ART).map((a) => a.code))).toEqual(new Set(Array.from({ length: 26 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`)));
  });

  it.each(files)('$code: o arquivo existe e as dimensões declaradas são as do arquivo', ({ src, width, height }) => {
    const file = path.join(PUBLIC, src);
    expect(existsSync(file), src).toBe(true);
    expect(webpSize(file)).toEqual({ w: width, h: height });
  });

  it('o formato declarado de cada capa confere com as dimensões', () => {
    for (const a of Object.values(COURSE_ART)) expect(a.format).toBe(a.width > a.height ? 'landscape' : 'portrait');
  });

  it('as quatro trilhas em série têm arte, benefício e instrutor da associação aprovada', () => {
    expect(TRAIL_SERIES.map((s) => s.trail)).toEqual(['Respeito e diálogo', 'Tecnologia com critério', 'Autonomia no trabalho', 'Pensar e resolver']);
    const instrutores = { 'respeito-e-dialogo': 'Mauro', 'tecnologia-com-criterio': 'Laís', 'autonomia-no-trabalho': 'Vinícius', 'pensar-e-resolver': 'Flávia' } as const;
    for (const s of TRAIL_SERIES) {
      const a = trailArtFor(trailSlug(s.trail));
      expect(a, s.trail).toBeDefined();
      expect(a!.instructor).toBe(instrutores[trailSlug(s.trail) as keyof typeof instrutores]);
      expect(a!.benefit.length).toBeGreaterThan(10);
      // as três partes da série têm capa, e é do mesmo instrutor da trilha
      for (const slug of s.courses) expect(courseArtFor(slug)?.instructor, slug).toBe(a!.instructor);
    }
  });

  it('as trilhas de ordem de aprendizado em série são exatamente as que têm fundo de trilha', () => {
    const comArte = TRAIL_ORDER.filter((t) => trailArtFor(trailSlug(t)));
    expect(comArte).toEqual(TRAIL_SERIES.map((s) => s.trail));
  });

  it('curso sem arte devolve undefined (cai no retrato atual)', () => {
    expect(courseArtFor('curso-que-nao-existe')).toBeUndefined();
    expect(courseArtFor(null)).toBeUndefined();
  });

  it('as capas em pé têm as três posições definidas', () => {
    for (const a of Object.values(COURSE_ART)) for (const p of [a.position.portrait, a.position.landscape, a.position.wide]) expect(p).toMatch(/^\d+% \d+%$/);
  });
});
