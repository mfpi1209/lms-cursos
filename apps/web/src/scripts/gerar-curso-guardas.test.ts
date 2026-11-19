import { describe, expect, it } from 'vitest';
import { maskEmail, parseArgs, refusalReasons, type GuardInput } from './gerar-curso-guardas';

const ok: GuardInput = {
  simulation: false, totalUsd: 40, maxUsd: 55, sceneErrors: 0, openJobs: 0, toProduce: 10,
  budget: { exceeded: false, limitUsd: 100, spentUsd: 0, remainingUsd: 100 },
};

describe('gerar-curso: guardas do --confirmar', () => {
  it('aceita quando tudo cabe', () => expect(refusalReasons(ok)).toEqual([]));
  it('recusa em simulação (provedores pagos não liberados)', () => expect(refusalReasons({ ...ok, simulation: true }).join()).toMatch(/simulação/));
  it('recusa quando o total passa do --max-usd', () => expect(refusalReasons({ ...ok, totalUsd: 55.01 }).join()).toMatch(/max-usd/));
  it('aceita no limite exato do --max-usd', () => expect(refusalReasons({ ...ok, totalUsd: 55 })).toEqual([]));
  it('recusa quando estoura o teto diário', () => expect(refusalReasons({ ...ok, budget: { exceeded: true, limitUsd: 50, spentUsd: 20, remainingUsd: 30 } }).join()).toMatch(/teto diário/));
  it('recusa com jobs abertos', () => expect(refusalReasons({ ...ok, openJobs: 2 }).join()).toMatch(/aberto/));
  it('recusa com erros de cena', () => expect(refusalReasons({ ...ok, sceneErrors: 1 }).join()).toMatch(/erro/));
  it('recusa quando não há o que produzir', () => expect(refusalReasons({ ...ok, toProduce: 0 }).join()).toMatch(/nenhuma cena/));
  it('acumula todos os motivos', () => expect(refusalReasons({ ...ok, simulation: true, openJobs: 1, totalUsd: 99 }).length).toBe(3));
});

describe('gerar-curso: argumentos', () => {
  it('padrão é a seco', () => expect(parseArgs(['--course', 'crs_a', '--max-usd', '55'])).toEqual({ course: 'crs_a', maxUsd: 55, confirmar: false }));
  it('--confirmar liga o modo real', () => expect(parseArgs(['--course', 'crs_a', '--max-usd', '55', '--confirmar']).confirmar).toBe(true));
  it('exige --course e --max-usd', () => {
    expect(() => parseArgs(['--max-usd', '5'])).toThrow(/course/);
    expect(() => parseArgs(['--course', 'x'])).toThrow(/max-usd/);
    expect(() => parseArgs(['--course', 'x', '--max-usd', 'abc'])).toThrow(/max-usd/);
  });
  it('recusa --seco com --confirmar e argumento desconhecido', () => {
    expect(() => parseArgs(['--course', 'x', '--max-usd', '5', '--seco', '--confirmar'])).toThrow();
    expect(() => parseArgs(['--course', 'x', '--max-usd', '5', '--foo'])).toThrow(/desconhecido/);
  });
  it('--cenas lista ids de nó (inclui reações "q01~a"), sem repetir; sem a opção, todas as pendentes', () => {
    expect(parseArgs(['--course', 'x', '--max-usd', '5', '--cenas', 'v01, v02,q01~a,v01']).cenas).toEqual(['v01', 'v02', 'q01~a']);
    expect(parseArgs(['--course', 'x', '--max-usd', '5']).cenas).toBeUndefined();
    expect(() => parseArgs(['--course', 'x', '--max-usd', '5', '--cenas'])).toThrow(/cenas/);
    expect(() => parseArgs(['--course', 'x', '--max-usd', '5', '--cenas', ' , '])).toThrow(/cenas/);
  });
  it('mascara e-mail', () => expect(maskEmail('marcelo@x.com')).toBe('ma*****@x.com'));
});
