import { describe, expect, it } from 'vitest';
import { isCallShotId } from '@lms/course-schema';
import { carryAdjust } from '@lms/media';

/* O pacote de mídia não depende do schema: a regra "é plano de chamada" está repetida em carryAdjust. Este teste
 * garante que as duas continuam iguais. */
describe('plano de chamada: a regra do ajuste fino acompanha a do schema', () => {
  const prev = { drop: [], cut: { s1: { first: 1, last: 0 } } };
  const oldLines = { s1: 'Uma frase. Outra frase.' };
  for (const id of ['chamada', 'chamada_2', 'chamada_10', 'chamada_x', 'chamadas', 'xchamada', 's9']) {
    it(`"${id}"`, () => {
      const r = carryAdjust(prev, oldLines, [{ id: 's1', line: 'Uma frase. Outra frase.' }, { id, line: 'nova' }]);
      // plano novo que NÃO é de chamada = abertura reescrita: o corte não volta
      expect(!!r.request?.cut).toBe(isCallShotId(id));
    });
  }
});
