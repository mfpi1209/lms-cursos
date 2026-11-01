import { describe, expect, it } from 'vitest';
import { orderInTrail, trailProgressCopy } from './trail-order';

const c = (title: string, done = false, started = false) => ({ title, done, started });

describe('orderInTrail', () => {
  it('em andamento, depois novos, depois concluídos; por título dentro de cada grupo', () => {
    const out = orderInTrail([c('D', true), c('B'), c('C', false, true), c('A'), c('E', true, true)], (x) => x);
    expect(out.map((x) => x.title)).toEqual(['C', 'A', 'B', 'D', 'E']);
  });
  it('não altera a lista original', () => {
    const list = [c('B'), c('A')];
    orderInTrail(list, (x) => x);
    expect(list.map((x) => x.title)).toEqual(['B', 'A']);
  });

  it('linha de progresso da trilha', () => {
    expect(trailProgressCopy(1, 3)).toBe('1 de 3 concluídos');
    expect(trailProgressCopy(0, 3)).toBe('0 de 3 concluídos');
    expect(trailProgressCopy(1, 3, 'partes')).toBe('1 de 3 partes concluídas');
    expect(trailProgressCopy(1, 1, 'partes')).toBe('1 de 1 parte concluída');
  });
});
