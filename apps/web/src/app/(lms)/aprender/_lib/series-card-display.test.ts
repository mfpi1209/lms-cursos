import { describe, expect, it } from 'vitest';
import { seriesForTrail } from '@lms/course-schema';
import { buildSeriesCard, type SeriesCourseInputWithTotal } from './series';
import { seriesCardCta } from '../_components/series-tile';

const respeito = seriesForTrail('Respeito e diálogo')!;

function course(slug: string, o: { done: boolean[]; isDone?: boolean; lessonsTotal?: number }): SeriesCourseInputWithTotal {
  const completedLessons = o.done.filter(Boolean).length;
  const i = o.done.findIndex((d) => !d);
  return {
    slug,
    trail: 'Respeito e diálogo',
    enr: { id: `enr_${slug}`, courseTitle: slug } as never,
    shortTitle: slug,
    totalLessons: o.done.length,
    completedLessons,
    isDone: !!o.isDone,
    started: completedLessons > 0 || !!o.isDone,
    startHref: `/aprender/enr_${slug}/aulas/aula_0${Math.max(0, i) + 1}`,
    cta: 'Começar',
    lastActivity: 0,
    lessons: o.done.map((_, k) => ({ title: `Aula ${k + 1}` })) as never,
    done: o.done,
    ...(i >= 0 ? { nextLessonIndex: i } : {}),
    ...(o.lessonsTotal !== undefined ? { lessonsTotal: o.lessonsTotal } : {}),
  };
}

describe('botão do cartão da trilha pelo estado real', () => {
  const novo = buildSeriesCard(respeito, respeito.courses.map((s) => course(s, { done: [false, false, false] })))!;
  const andamento = buildSeriesCard(respeito, [course(respeito.courses[0]!, { done: [true, true, true], isDone: true }), course(respeito.courses[1]!, { done: [false, false, false] }), course(respeito.courses[2]!, { done: [false, false, false] })])!;
  const feito = buildSeriesCard(respeito, respeito.courses.map((s) => course(s, { done: [true, true, true], isDone: true })))!;

  it('não começou: "Explorar trilha" abre a página da trilha', () => {
    expect(seriesCardCta(novo)).toEqual({ label: 'Explorar trilha', href: '/aprender/trilhas/respeito-e-dialogo' });
  });
  it('em andamento: mantém "Continuar parte N" direto na aula certa', () => {
    expect(seriesCardCta(andamento)).toEqual({ label: 'Continuar parte 2', href: '/aprender/enr_discordar-sem-brigar/aulas/aula_01' });
  });
  it('concluída: "Rever trilha" abre a página da trilha', () => {
    expect(seriesCardCta(feito)).toEqual({ label: 'Rever trilha', href: '/aprender/trilhas/respeito-e-dialogo' });
  });
});

describe('total de aulas mostrado no cartão', () => {
  it('conta todas as aulas das partes (inclusive as opcionais de quem concluiu); o total obrigatório segue igual', () => {
    const card = buildSeriesCard(respeito, respeito.courses.map((s) => course(s, { done: [true, true], isDone: true, lessonsTotal: 3 })))!;
    expect(card.lessons).toBe(6);
    expect(card.lessonsTotal).toBe(9);
  });
  it('sem a informação, cai no total obrigatório', () => {
    const card = buildSeriesCard(respeito, respeito.courses.map((s) => course(s, { done: [false, false] })))!;
    expect(card.lessonsTotal).toBe(card.lessons);
  });
});
