import { describe, expect, it } from 'vitest';
import { joinsAfterRemoval } from '../src/adjust';

const base = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];

describe('emendas do ajuste fino em fusão', () => {
  it('plano tirado entre dois: a emenda é fusão', () => {
    const kept = [{ id: 's1' }, { id: 's3' }, { id: 's4' }];
    expect(joinsAfterRemoval(base, kept, 1, { drop: ['s2'], cut: {} })).toBe(true);
    expect(joinsAfterRemoval(base, kept, 2, { drop: ['s2'], cut: {} })).toBe(false);
  });
  it('última frase do anterior, primeira frase ou começo aparado deste: fusão', () => {
    expect(joinsAfterRemoval(base, base, 1, { drop: [], cut: { s1: { first: 0, last: 1 } } })).toBe(true);
    expect(joinsAfterRemoval(base, base, 2, { drop: [], cut: { s3: { first: 1, last: 0 } } })).toBe(true);
    expect(joinsAfterRemoval(base, base, 3, { drop: [], cut: { s4: { first: 0, last: 0, lead: 4 } } })).toBe(true);
  });
  it('nada tirado na junção: segue como era', () => {
    expect(joinsAfterRemoval(base, base, 1, { drop: [], cut: { s2: { first: 0, last: 1 } } })).toBe(false);
    expect(joinsAfterRemoval(base, base, 0, { drop: [], cut: {} })).toBe(false);
  });
});
