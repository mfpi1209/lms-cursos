import { describe, expect, it } from 'vitest';
import { trailSealNote } from './trail-note';

const st = (done: boolean[], over: Partial<Parameters<typeof trailSealNote>[0]> = {}) => ({ trail: 'Pensar e resolver', courses: done.map((d) => ({ done: d })), badge: null, checkPassed: false, eligibility: { activitiesMissing: [] as unknown[] }, ...over });

describe('o que falta para o selo', () => {
  it('conta cursos ou partes que faltam', () => {
    expect(trailSealNote(st([true, false, false]))).toBe('Faltam 2 cursos, as atividades “Na prática” e a checagem final para o Selo DNA Work · Pensar e resolver.');
    expect(trailSealNote(st([true, true, false]), 'parte')).toBe('Falta 1 parte, as atividades “Na prática” e a checagem final para o Selo DNA Work · Pensar e resolver.');
  });
  it('depois dos cursos: atividades, checagem, pronto', () => {
    expect(trailSealNote(st([true, true, true], { eligibility: { activitiesMissing: [1] } }))).toMatch(/Faltam atividades/);
    expect(trailSealNote(st([true, true, true]))).toBe('Falta só a checagem final da trilha.');
    expect(trailSealNote(st([true, true, true], { checkPassed: true }))).toBe('Tudo pronto: abra a trilha para ver seu selo.');
    expect(trailSealNote(st([true, true, true], { badge: {} }))).toBe('Você já tem o Selo desta trilha.');
  });
});
