import { describe, expect, it } from 'vitest';
import { CourseBriefSchema, CourseDocumentSchema, DEFAULT_TARGET_MINUTES } from '../src/course';
import { compileCourse } from '../src/compile';
import { comunicacaoPrimeiroEmprego } from '../src/examples';
import { courseLengthReport, estimateMinutes, lessonLengthReport } from '../src/length';
import { richTextFromPlain, richTextToPlain } from '../src/richtext';

describe('duração alvo', () => {
  it('padrão de 15 min; rascunhos antigos com 45 continuam válidos', () => {
    expect(DEFAULT_TARGET_MINUTES).toBe(15);
    expect(CourseBriefSchema.parse({}).targetMinutes).toBe(15);
    expect(CourseBriefSchema.parse({ targetMinutes: 45 }).targetMinutes).toBe(45);
    expect(CourseDocumentSchema.parse({ schemaVersion: 1, title: 'x' }).brief.targetMinutes).toBe(15);
  });
});

describe('courseLengthReport', () => {
  it('estima leitura, fala e decisões por aula', () => {
    expect(estimateMinutes({ screenWords: 200, spokenWords: 156, decisions: 1 })).toBeCloseTo(1 + 1 + 0.5, 5);
    const l1 = lessonLengthReport(comunicacaoPrimeiroEmprego.modules[0]!.lessons[0]!);
    expect(l1).toMatchObject({ lessonId: 'aula_negociar_prazo', scenes: 11, decisions: 2, spokenWords: 0 });
    expect(l1.screenWords).toBeGreaterThan(500);
    expect(l1.estMinutes).toBeGreaterThan(3);
  });

  it('no curso-exemplo as duas aulas são longas (LESSON_TOO_LONG) e o total cabe na meta', () => {
    const r = courseLengthReport(comunicacaoPrimeiroEmprego);
    expect(r.lessons.map((l) => [l.lessonId, l.scenes])).toEqual([['aula_negociar_prazo', 11], ['aula_corrigir_informacao', 12]]);
    expect(r.totals.scenes).toBe(23);
    expect(r.totals.estMinutes).toBeCloseTo(r.lessons.reduce((a, l) => a + l.estMinutes, 0), 1);
    expect(r.warnings.map((w) => [w.code, w.lessonId])).toEqual([['LESSON_TOO_LONG', 'aula_negociar_prazo'], ['LESSON_TOO_LONG', 'aula_corrigir_informacao']]);
    expect(r.warnings[0]!.message).toMatch(/"Negociar um prazo" está longa: 11 cenas \(recomendado até 9\)/);
    expect(r.warnings[1]!.message).toMatch(/12 cenas \(recomendado até 9\)/);
    // avisos aparecem na compilação do curso, sem bloquear
    const c = compileCourse(comunicacaoPrimeiroEmprego);
    expect(c.ok).toBe(true);
    expect(c.warnings.filter((w) => w.code === 'LESSON_TOO_LONG')).toHaveLength(2);
  });

  it('COURSE_TOO_LONG quando o total estimado passa de 1,5 × a meta', () => {
    const doc = structuredClone(comunicacaoPrimeiroEmprego);
    doc.brief.targetMinutes = 5;
    const r = courseLengthReport(doc);
    const course = r.warnings.find((w) => w.code === 'COURSE_TOO_LONG')!;
    expect(course).toBeDefined();
    expect(course.lessonId).toBeUndefined();
    expect(course.message).toMatch(/meta de 5 min \(limite 7,5\)/);
    expect(compileCourse(doc).warnings.some((w) => w.code === 'COURSE_TOO_LONG')).toBe(true);
    expect(compileCourse(doc).ok).toBe(true);
  });
});

describe('richTextFromPlain com tópicos', () => {
  it('linhas seguidas com "- " viram lista; intro continua parágrafo; hífen isolado é texto', () => {
    const doc = richTextFromPlain('Na próxima vez:\n- Levante os fatos.\n- Proponha um caminho.\n- Alinhe com quem decide.\n\nFim.');
    expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'bulletList', 'paragraph']);
    expect(richTextToPlain(doc)).toBe('Na próxima vez:\nLevante os fatos.\nProponha um caminho.\nAlinhe com quem decide.\nFim.');
    expect(richTextFromPlain('1. Um\n2. Dois').content[0]!.type).toBe('orderedList');
    expect(richTextFromPlain('- só uma linha').content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '- só uma linha' }] }]);
    expect(richTextFromPlain('a\nb')).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a b' }] }] });
  });
});
