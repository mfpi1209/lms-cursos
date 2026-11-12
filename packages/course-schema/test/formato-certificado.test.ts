import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema, type CourseDocument } from '../src/course';
import { compileCourse } from '../src/compile';
import { parseDurationMinutes } from '../src/duration';
import { courseLengthReport, courseWorkloadMinutes, LENGTH_PROFILES, lengthProfile, LESSON_MAX_EST_MINUTES, LESSON_MAX_SCENES, COURSE_LENGTH_TOLERANCE } from '../src/length';
import { importMarkdownCourse, parseCourseFormat, parseTargetDuration } from '../src/import/markdown-course';
import { comunicacaoPrimeiroEmprego } from '../src/examples';
import { richTextFromPlain } from '../src/richtext';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EXEMPLO = readFileSync(path.join(ROOT, 'docs/roteiros/exemplos/exemplo-cruzeiro.md'), 'utf8');

const words = (n: number) => Array.from({ length: n }, () => 'palavra').join(' ');

/** Curso de uma aula com `scenes` cenas de conteúdo, cada uma com `screen` palavras na tela. */
function courseWith(scenes: number, screen: number, brief: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): CourseDocument {
  const nodes = Array.from({ length: scenes }, (_, i) => ({ id: `n${i}`, type: 'content', title: `Cena ${i}`, objectiveIds: [], required: true, body: richTextFromPlain(words(screen)) }));
  const edges = nodes.slice(0, -1).map((n, i) => ({ id: `e${i}`, from: n.id, to: nodes[i + 1]!.id, isDefault: true, priority: 0 }));
  return CourseDocumentSchema.parse({
    schemaVersion: 1,
    title: 'Teste',
    brief: { finalSkill: 'x', audience: 'y', ...brief },
    modules: [{ id: 'm1', title: 'M', description: '', lessons: [{ id: 'a1', title: 'Aula', objectiveIds: [], estimatedMinutes: 10, graph: { schemaVersion: 1, startNodeId: 'n0', nodes, edges } }] }],
    ...extra,
  });
}

describe('perfis de extensão', () => {
  it('micro mantém os números de sempre', () => {
    expect(LENGTH_PROFILES.micro).toEqual({ lessonMaxMinutes: 6, lessonMaxScenes: 9, courseTolerance: 1.5, narrationMaxWords: 120, narrationMinWords: 60 });
    expect([LESSON_MAX_EST_MINUTES, LESSON_MAX_SCENES, COURSE_LENGTH_TOLERANCE]).toEqual([6, 9, 1.5]);
    expect(lengthProfile()).toBe(LENGTH_PROFILES.micro);
    expect(lengthProfile('ead')).toBe(LENGTH_PROFILES.ead);
    expect(LENGTH_PROFILES.ead).toMatchObject({ lessonMaxMinutes: 30, lessonMaxScenes: 40, narrationMaxWords: 300, narrationMinWords: 40 });
  });

  it('aula de 20 cenas: avisa em micro (e sem formato), não avisa em EaD', () => {
    const base = courseLengthReport(courseWith(20, 30));
    const micro = courseLengthReport(courseWith(20, 30, { format: 'micro' }));
    const ead = courseLengthReport(courseWith(20, 30, { format: 'ead' }));
    expect(base.warnings.map((w) => w.code)).toContain('LESSON_TOO_LONG');
    expect(micro.warnings).toEqual(base.warnings);
    expect(base.warnings[0]!.message).toMatch(/20 cenas \(recomendado até 9\)/);
    expect(ead.warnings).toEqual([]);
  });

  it('EaD também avisa acima de 40 cenas e de 30 min', () => {
    const cenas = courseLengthReport(courseWith(41, 10, { format: 'ead', targetMinutes: 600 }));
    expect(cenas.warnings[0]!.message).toMatch(/41 cenas \(recomendado até 40\)/);
    const minutos = courseLengthReport(courseWith(30, 300, { format: 'ead', targetMinutes: 600 }));
    expect(minutos.warnings[0]).toMatchObject({ code: 'LESSON_TOO_LONG' });
    expect(minutos.warnings[0]!.message).toMatch(/recomendado até 30\)/);
  });

  it('COURSE_TOO_LONG: micro tolera 1,5x a meta; EaD compara com a meta', () => {
    // 1 aula de ~10 min (2000 palavras de leitura) contra meta de 8 min: 10 > 8, mas 10 < 12
    const micro = courseLengthReport(courseWith(8, 250, { targetMinutes: 8 }));
    expect(micro.warnings.map((w) => w.code)).not.toContain('COURSE_TOO_LONG');
    const ead = courseLengthReport(courseWith(8, 250, { format: 'ead', targetMinutes: 8 }));
    expect(ead.warnings.map((w) => w.code)).toContain('COURSE_TOO_LONG');
  });

  it('o curso-exemplo existente (sem formato) segue com os mesmos avisos', () => {
    const r = courseLengthReport(comunicacaoPrimeiroEmprego);
    expect(r.warnings.map((w) => [w.code, w.lessonId])).toEqual([['LESSON_TOO_LONG', 'aula_negociar_prazo'], ['LESSON_TOO_LONG', 'aula_corrigir_informacao']]);
  });
});

describe('parseDurationMinutes', () => {
  it.each([
    ['8 h', 480],
    ['8h', 480],
    ['6h30', 390],
    ['8h30min', 510],
    ['8 horas e 30 minutos', 510],
    ['1,5 h', 90],
    ['360 min', 360],
    ['45 minutos', 45],
    ['Cerca de 6 h.', 360],
    ['  2H15  ', 135],
  ])('%s → %i', (text, minutes) => {
    expect(parseDurationMinutes(text)).toBe(minutes);
  });

  it.each(['', 'muito tempo', '0 h', '12 aulas de 5 a 7 minutos (cerca de 1h15 no total)', 'h30'])('recusa "%s"', (text) => {
    expect(parseDurationMinutes(text)).toBeUndefined();
  });

  it('Duração-alvo usa o parser; o texto livre antigo segue igual', () => {
    expect(parseTargetDuration('6 h', 3)).toEqual({ targetMinutes: 360 });
    expect(parseTargetDuration('6h30', 3)).toEqual({ targetMinutes: 390 });
    expect(parseTargetDuration('360 min', 3)).toEqual({ targetMinutes: 360 });
    expect(parseTargetDuration('12 aulas de 5 a 7 minutos (cerca de 1h15 no total).', 12)).toEqual({ lessonMinutes: 6, targetMinutes: 75 });
    expect(parseTargetDuration('2 aulas de 3 a 6 minutos (cerca de 10 minutos no total).', 2)).toEqual({ lessonMinutes: 5, targetMinutes: 10 });
  });
});

describe('Formato no roteiro', () => {
  it('lê EaD e micro sem caixa nem acento', () => {
    expect(parseCourseFormat('EaD')).toBe('ead');
    expect(parseCourseFormat('ead')).toBe('ead');
    expect(parseCourseFormat('Ensino a Distância')).toBe('ead');
    expect(parseCourseFormat('Micro')).toBe('micro');
    expect(parseCourseFormat('')).toBeUndefined();
    expect(parseCourseFormat('presencial')).toBeUndefined();
  });

  it('sem a linha, o documento não ganha brief.format nem certificate', () => {
    const md = EXEMPLO.replace(/^(Formato|Certificado|Carga horária):.*\n\n/gm, '');
    const r = importMarkdownCourse(md);
    expect(r.document.brief.format).toBeUndefined();
    expect(r.document.certificate).toBeUndefined();
    // vale o perfil micro: os mesmos avisos de "Formato: micro"
    const micro = importMarkdownCourse(EXEMPLO.replace('Formato: EaD', 'Formato: micro').replace(/^(Certificado|Carga horária):.*\n\n/gm, ''));
    expect(micro.document.brief.format).toBe('micro');
    expect(micro.allWarnings.map((w) => w.code)).toEqual(r.allWarnings.map((w) => w.code));
  });

  it('formato desconhecido avisa e vale micro', () => {
    const r = importMarkdownCourse(EXEMPLO.replace('Formato: EaD', 'Formato: presencial'));
    expect(r.document.brief.format).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toContain('FORMAT_UNKNOWN');
  });
});

describe('certificado', () => {
  it('campos opcionais: ausente = como hoje; presente guarda enabled e workloadMinutes', () => {
    expect(CourseDocumentSchema.parse({ schemaVersion: 1, title: 'x' }).certificate).toBeUndefined();
    expect(CourseDocumentSchema.parse({ schemaVersion: 1, title: 'x', certificate: {} }).certificate).toEqual({ enabled: false });
    expect(CourseDocumentSchema.parse({ schemaVersion: 1, title: 'x', certificate: { enabled: true, workloadMinutes: 480 } }).certificate).toEqual({ enabled: true, workloadMinutes: 480 });
  });

  it('importa Certificado e Carga horária', () => {
    const r = importMarkdownCourse(EXEMPLO.replace('Carga horária: 6 h', 'Carga horária: 8h30'));
    expect(r.document.certificate).toEqual({ enabled: true, workloadMinutes: 510 });
    expect(r.document.brief.format).toBe('ead');
    expect(r.document.brief.targetMinutes).toBe(360);
    const nao = importMarkdownCourse(EXEMPLO.replace('Certificado: sim', 'Certificado: não'));
    expect(nao.document.certificate).toEqual({ enabled: false, workloadMinutes: 360 });
  });

  it('Certificado: sim sem Carga horária avisa e usa a soma das aulas', () => {
    const r = importMarkdownCourse(EXEMPLO.replace(/^Carga horária:.*\n\n/m, ''));
    expect(r.document.certificate).toEqual({ enabled: true });
    expect(r.compile.warnings.map((w) => w.code)).toContain('CERTIFICATE_NO_WORKLOAD');
    const soma = r.document.modules.flatMap((m) => m.lessons).reduce((a, l) => a + l.estimatedMinutes, 0);
    expect(courseWorkloadMinutes(r.document)).toBe(soma);
    expect(soma).toBe(360); // EaD reparte a meta de 6 h entre as aulas
  });

  it('sem o aviso quando a carga horária é declarada ou o certificado está desligado', () => {
    expect(compileCourse(importMarkdownCourse(EXEMPLO).document).warnings.map((w) => w.code)).not.toContain('CERTIFICATE_NO_WORKLOAD');
    const off = courseWith(2, 10, {}, { certificate: { enabled: false } });
    expect(compileCourse(off).warnings.map((w) => w.code)).not.toContain('CERTIFICATE_NO_WORKLOAD');
  });

  it('courseWorkloadMinutes: o declarado vence a soma', () => {
    expect(courseWorkloadMinutes(courseWith(2, 10))).toBe(10);
    expect(courseWorkloadMinutes(courseWith(2, 10, {}, { certificate: { enabled: true, workloadMinutes: 480 } }))).toBe(480);
  });

  it('Carga horária ilegível avisa', () => {
    const r = importMarkdownCourse(EXEMPLO.replace('Carga horária: 6 h', 'Carga horária: bastante'));
    expect(r.warnings.map((w) => w.code)).toContain('WORKLOAD_UNREADABLE');
    expect(r.document.certificate).toEqual({ enabled: true });
  });
});

describe('roteiro de exemplo da Cruzeiro', () => {
  it('importa sem erros e sem avisos de tamanho', () => {
    const r = importMarkdownCourse(EXEMPLO);
    expect(r.compile.errors).toEqual([]);
    expect(r.compile.ok).toBe(true);
    const codes = r.allWarnings.map((w) => w.code);
    expect(codes).not.toContain('LESSON_TOO_LONG');
    expect(codes).not.toContain('COURSE_TOO_LONG');
    expect(codes).not.toContain('NARRATION_TOO_LONG');
    expect(codes).not.toContain('NARRATION_SHORT');
    expect(codes).not.toContain('CERTIFICATE_NO_WORKLOAD');
    expect(r.document.modules).toHaveLength(2);
    expect(r.document.brief).toMatchObject({ format: 'ead', targetMinutes: 360 });
    expect(r.document.certificate).toEqual({ enabled: true, workloadMinutes: 360 });
    const nodes = r.document.modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes));
    expect(nodes.some((n) => n.type === 'choice')).toBe(true);
    expect(nodes.some((n) => n.type === 'assessment')).toBe(true);
  });
});
