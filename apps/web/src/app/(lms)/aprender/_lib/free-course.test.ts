import { describe, expect, it } from 'vitest';
import { isFreeCourse } from '@lms/course-schema';
import { buildFreeCourseOutline, freeCourseCta, freeCourseMatches, remainingCopy } from './free-course';
import { freeCardFixture, freeCourseDocument } from './free-course-fixture';

const document = freeCourseDocument();
const done = (...ns: number[]) => Object.fromEntries(ns.map((n) => [`aula_${String(n).padStart(2, '0')}`, { kind: 'completed' as const }]));

describe('roteiro do curso livre por módulo', () => {
  it('o documento de exemplo é um curso livre: 7 módulos, 21 aulas', () => {
    expect(isFreeCourse(document)).toBe(true);
    const o = buildFreeCourseOutline({ document, lessons: {}, completed: false });
    expect(o.modules).toHaveLength(7);
    expect(o.lessonsTotal).toBe(21);
    expect(o.modules.map((m) => m.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(o.modules[1]!.lessons.map((l) => l.index)).toEqual([4, 5, 6]);
    expect(o.modules[0]!.minutes).toBe(69);
  });

  it('nada começado: a aula 1 é a próxima, o módulo 1 é o atual e falta tudo', () => {
    const o = buildFreeCourseOutline({ document, lessons: {}, completed: false });
    expect(o.next).toEqual({ lessonId: 'aula_01', lessonIndex: 1, moduleIndex: 1, title: 'Boas-vindas', inProgress: false });
    expect(o.modules[0]!.lessons.map((l) => l.state)).toEqual(['next', 'not_started', 'not_started']);
    expect(o.modules.map((m) => m.current)).toEqual([true, false, false, false, false, false, false]);
    expect(o.modules.every((m) => m.state === 'not_started')).toBe(true);
    expect(o.percent).toBe(0);
    expect(o.remaining).toEqual({ lessons: 21, assessments: 28, missions: 0 });
    expect(remainingCopy(o)).toBe('Faltam 21 aulas obrigatórias e 28 avaliações.');
  });

  it('em andamento: estados por aula, módulo concluído, módulo atual e avaliações por módulo', () => {
    const o = buildFreeCourseOutline({
      document,
      lessons: { ...done(1, 2, 3), aula_04: { kind: 'in_progress', percent: 40.4 } },
      answers: { aula_03_q1: { passed: true }, aula_03_q2: { passed: true }, aula_03_q3: { passed: true }, aula_03_q4: { passed: false } },
      completed: false,
    });
    expect(o.modules[0]!.state).toBe('completed');
    expect(o.modules[0]!.assessments).toEqual({ total: 4, done: 3, answered: 4 });
    expect(o.modules[1]!.state).toBe('in_progress');
    expect(o.modules[1]!.current).toBe(true);
    expect(o.modules[1]!.lessons.map((l) => [l.state, l.percent])).toEqual([['in_progress', 40], ['not_started', 0], ['not_started', 0]]);
    expect(o.modules[1]!.assessments).toEqual({ total: 4, done: 0, answered: 0 });
    expect(o.next).toMatchObject({ lessonId: 'aula_04', moduleIndex: 2, inProgress: true });
    expect(o.requiredDone).toBe(3);
    expect(o.percent).toBe(14);
    expect(o.assessments).toEqual({ total: 28, done: 3, answered: 4 });
    expect(o.remaining).toEqual({ lessons: 18, assessments: 25, missions: 0 });
  });

  it('sem aula em andamento, a próxima é a primeira não concluída (mesmo fora de ordem)', () => {
    const o = buildFreeCourseOutline({ document, lessons: done(1, 3), completed: false });
    expect(o.next).toMatchObject({ lessonId: 'aula_02', moduleIndex: 1, inProgress: false });
    expect(o.modules[0]!.lessons.map((l) => l.state)).toEqual(['completed', 'next', 'completed']);
    expect(o.modules[0]!.state).toBe('in_progress');
  });

  it('missão conta à parte e não entra na frase do que falta', () => {
    const withMission = freeCourseDocument({}, { mission: true });
    const o = buildFreeCourseOutline({ document: withMission, lessons: done(...Array.from({ length: 20 }, (_, i) => i + 1)), missions: {}, completed: false });
    expect(o.missions).toEqual({ total: 1, done: 0, answered: 0 });
    expect(o.remaining.missions).toBe(1);
    expect(remainingCopy(o)).toBe('Faltam 1 aula obrigatória e 28 avaliações.');
    const later = buildFreeCourseOutline({ document: withMission, lessons: {}, missions: { aula_05_m: { status: 'later' } }, completed: false });
    expect(later.missions).toEqual({ total: 1, done: 0, answered: 1 });
    const made = buildFreeCourseOutline({ document: withMission, lessons: {}, missions: { aula_05_m: { status: 'done' } }, completed: false });
    expect(made.remaining.missions).toBe(0);
  });

  it('só `completion.requiredLessonIds` conta como obrigatória', () => {
    const partial = freeCourseDocument({ completion: { requiredLessonIds: ['aula_01', 'aula_02', 'aula_03'] } });
    const o = buildFreeCourseOutline({ document: partial, lessons: done(1, 2), completed: false });
    expect(o.requiredTotal).toBe(3);
    expect(o.remaining).toEqual({ lessons: 1, assessments: 4, missions: 0 });
    expect(o.modules[1]!.lessons.every((l) => !l.required)).toBe(true);
    expect(remainingCopy({ ...o, remaining: { lessons: 1, assessments: 0, missions: 0 } })).toBe('Falta 1 aula obrigatória.');
  });

  it('concluído: 100%, nada falta, sem próxima; aula nova (opcional) não vira pendência', () => {
    const o = buildFreeCourseOutline({ document, lessons: done(...Array.from({ length: 20 }, (_, i) => i + 1)), optionalLessonIds: ['aula_21'], completed: true });
    expect(o.completed).toBe(true);
    expect(o.percent).toBe(100);
    expect(o.next).toBeUndefined();
    expect(o.requiredTotal).toBe(20);
    expect(o.requiredDone).toBe(20);
    expect(o.remaining).toEqual({ lessons: 0, assessments: 0, missions: 0 });
    expect(o.modules[6]!.lessons[2]).toMatchObject({ isNew: true, required: false, state: 'not_started' });
    expect(remainingCopy(o)).toBe('Você concluiu este curso.');
    expect(o.modules.some((m) => m.current)).toBe(false);
  });
});

describe('ação do curso livre', () => {
  it('"Começar", "Continuar módulo N" e "Rever o curso" pelo estado real', () => {
    expect(freeCourseCta({ isDone: false, started: false, nextModuleIndex: 0 })).toBe('Começar');
    expect(freeCourseCta({ isDone: false, started: true, nextModuleIndex: 0 })).toBe('Continuar módulo 1');
    expect(freeCourseCta({ isDone: false, started: true, nextModuleIndex: 3 })).toBe('Continuar módulo 4');
    expect(freeCourseCta({ isDone: false, started: true, nextModuleIndex: -1 })).toBe('Começar');
    expect(freeCourseCta({ isDone: true, started: true, nextModuleIndex: -1 })).toBe('Rever o curso');
  });
});

describe('busca (?q=)', () => {
  const c = freeCardFixture();
  it('acha pelo título, instrutor, resumo e pelo nome da seção, sem ligar para acento ou caixa', () => {
    expect(freeCourseMatches(c, undefined)).toBe(true);
    expect(freeCourseMatches(c, '  ')).toBe(true);
    expect(freeCourseMatches(c, 'ia na pratica')).toBe(true);
    expect(freeCourseMatches(c, 'THIAGO')).toBe(true);
    expect(freeCourseMatches(c, 'inteligencia artificial')).toBe(true);
    expect(freeCourseMatches(c, 'curso livre')).toBe(true);
    expect(freeCourseMatches(c, 'whatsapp')).toBe(false);
  });
});
