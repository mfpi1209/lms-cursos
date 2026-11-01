import { describe, expect, it } from 'vitest';
import type { PlatformSeries } from '../types';
import { seriesEndChip, seriesEndsTrail, seriesHeaderLabel, seriesNextButton } from './series';

const base: PlatformSeries = { trail: 'Respeito e diálogo', trailHref: '/aprender/trilhas/respeito-e-dialogo', part: 1, total: 3, othersDone: false, next: { n: 2, title: 'Discordar sem brigar', href: '/aprender/enr_2/aulas/aula_01', started: false } };

describe('trilha em série no player', () => {
  it('cabeçalho: trilha e parte', () => {
    expect(seriesHeaderLabel(base)).toBe('Respeito e diálogo · Parte 1 de 3');
    expect(seriesHeaderLabel({ ...base, part: 3 })).toBe('Respeito e diálogo · Parte 3 de 3');
  });
  it('fim da parte 1 e 2: chip "Parte N concluída" e botão para a próxima parte', () => {
    expect(seriesEndChip(base)).toBe('Parte 1 concluída');
    expect(seriesNextButton(base)).toEqual({ label: 'Ir para a Parte 2: Discordar sem brigar', href: '/aprender/enr_2/aulas/aula_01' });
    expect(seriesEndsTrail(base)).toBe(false);
    expect(seriesEndChip({ ...base, part: 2 })).toBe('Parte 2 concluída');
  });
  it('fim da última parte: trilha concluída, sem botão de próxima parte', () => {
    const last: PlatformSeries = { ...base, part: 3, othersDone: true, next: undefined };
    expect(seriesEndChip(last)).toBe('Trilha concluída');
    expect(seriesNextButton(last)).toBeNull();
    expect(seriesEndsTrail(last)).toBe(true);
  });
  it('próxima parte ainda não liberada: sem botão (o fim segue com o selo)', () => {
    expect(seriesNextButton({ ...base, next: undefined })).toBeNull();
  });
  it('curso comum: tudo como antes', () => {
    expect(seriesEndChip(undefined)).toBe('Curso concluído');
    expect(seriesNextButton(undefined)).toBeNull();
    expect(seriesEndsTrail(undefined)).toBe(false);
  });
});
