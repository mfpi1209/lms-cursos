import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema } from '../src/course';
import { FREE_COURSE_MIN_MINUTES, freeCourseWorkloadMinutes, hasCertificate, isFreeCourse, moduleIndexOfLesson, spokenWorkload } from '../src/free-course';
import { formatWorkload } from '../src/trail-credentials';
import { courseWorkloadMinutes } from '../src/length';
import { linearGraph } from './helpers';

const lesson = (id: string, estimatedMinutes = 15) => ({ id, title: `Aula ${id}`, objectiveIds: [], estimatedMinutes, graph: linearGraph() });
const doc = (extra: Record<string, unknown> = {}) =>
  CourseDocumentSchema.parse({
    schemaVersion: 1,
    title: 'Teste',
    modules: [
      { id: 'm1', title: 'Um', lessons: [lesson('a1'), lesson('a2')] },
      { id: 'vazio', title: 'Sem aulas', lessons: [] },
      { id: 'm2', title: 'Dois', lessons: [lesson('a3')] },
    ],
    ...extra,
  });

describe('isFreeCourse', () => {
  it('formato gravado decide: ead é livre, micro não é (mesmo com carga longa)', () => {
    expect(isFreeCourse(doc({ brief: { format: 'ead' } }))).toBe(true);
    expect(isFreeCourse(doc({ brief: { format: 'ead', targetMinutes: 10 } }))).toBe(true);
    expect(isFreeCourse(doc({ brief: { format: 'micro', targetMinutes: 480 } }))).toBe(false);
    expect(isFreeCourse(doc({ brief: { format: 'micro' }, certificate: { enabled: true, workloadMinutes: 480 } }))).toBe(false);
  });

  it('sem formato gravado: vale a carga DECLARADA de 4 h ou mais (meta do briefing ou certificado)', () => {
    // o 1º curso livre publicado ("IA na prática…") não tem `brief.format` no documento: só a meta de 480 min
    expect(isFreeCourse(doc({ brief: { targetMinutes: 480 } }))).toBe(true);
    expect(isFreeCourse(doc({ brief: { targetMinutes: FREE_COURSE_MIN_MINUTES } }))).toBe(true);
    expect(isFreeCourse(doc({ brief: { targetMinutes: FREE_COURSE_MIN_MINUTES - 1 } }))).toBe(false);
    expect(isFreeCourse(doc({ certificate: { enabled: false, workloadMinutes: 360 } }))).toBe(true);
  });

  it('pílulas continuam pílulas: metas de minutos e documento padrão', () => {
    expect(isFreeCourse(doc())).toBe(false);
    for (const targetMinutes of [8, 10, 30, 45, 75]) expect(isFreeCourse(doc({ brief: { targetMinutes } }))).toBe(false);
  });

  it('a soma estimada das aulas não classifica (pílula de muitas aulas com o padrão de 15 min)', () => {
    const many = doc({ modules: [{ id: 'm1', title: 'Um', lessons: Array.from({ length: 20 }, (_, i) => lesson(`a${i}`)) }] });
    expect(courseWorkloadMinutes(many)).toBeGreaterThanOrEqual(FREE_COURSE_MIN_MINUTES);
    expect(isFreeCourse(many)).toBe(false);
  });

  it('sem documento (versão não encontrada) não é livre', () => {
    expect(isFreeCourse(undefined)).toBe(false);
    expect(isFreeCourse(null)).toBe(false);
    expect(isFreeCourse({})).toBe(false);
  });
});

describe('certificado', () => {
  it('só com `certificate.enabled`', () => {
    expect(hasCertificate(doc())).toBe(false);
    expect(hasCertificate(doc({ certificate: { enabled: false, workloadMinutes: 480 } }))).toBe(false);
    expect(hasCertificate(doc({ certificate: { enabled: true } }))).toBe(true);
    expect(hasCertificate(undefined)).toBe(false);
  });
});

describe('carga horária', () => {
  it('certificado > meta de curso longo > soma das aulas', () => {
    expect(freeCourseWorkloadMinutes(doc({ brief: { targetMinutes: 480 }, certificate: { enabled: true, workloadMinutes: 360 } }))).toBe(360);
    // "IA na prática…": meta de 480 min, 21 aulas de 23 min (483): vale a meta declarada, "8 h"
    const ia = doc({ brief: { targetMinutes: 480 }, modules: [{ id: 'm1', title: 'Um', lessons: Array.from({ length: 21 }, (_, i) => lesson(`a${i}`, 23)) }] });
    expect(courseWorkloadMinutes(ia)).toBe(483);
    expect(freeCourseWorkloadMinutes(ia)).toBe(480);
    expect(formatWorkload(freeCourseWorkloadMinutes(ia))).toBe('8 h');
    // formato EaD sem meta longa: soma das aulas
    expect(freeCourseWorkloadMinutes(doc({ brief: { format: 'ead', targetMinutes: 30 } }))).toBe(45);
  });

  it('por extenso para leitor de tela', () => {
    expect(spokenWorkload(480)).toBe('8 horas');
    expect(spokenWorkload(60)).toBe('1 hora');
    expect(spokenWorkload(69)).toBe('1 hora e 9 minutos');
    expect(spokenWorkload(150)).toBe('2 horas e 30 minutos');
    expect(spokenWorkload(45)).toBe('45 minutos');
    expect(spokenWorkload(1)).toBe('1 minuto');
    expect(spokenWorkload(0)).toBe('');
    expect(spokenWorkload(Number.NaN)).toBe('');
  });
});

describe('moduleIndexOfLesson', () => {
  it('conta só módulos com aulas', () => {
    const d = doc();
    expect(moduleIndexOfLesson(d, 'a1')).toBe(0);
    expect(moduleIndexOfLesson(d, 'a2')).toBe(0);
    expect(moduleIndexOfLesson(d, 'a3')).toBe(1);
    expect(moduleIndexOfLesson(d, 'nao-existe')).toBe(-1);
  });
});
