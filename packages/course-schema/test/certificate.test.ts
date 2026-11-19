import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema, emptyCourseDocument } from '../src/course';
import { richTextFromPlain } from '../src';
import { certificateProgramOf, certificateWorkloadMinutes, evaluateCertificateRule, formatCnpj, parseCertificateIssuer } from '../src/certificate';

const base = { courseCompleted: true, assessments: [], missingReflections: [], pendingTasks: [] };

describe('regra do certificado (pura)', () => {
  it('tudo cumprido: elegível', () => {
    expect(evaluateCertificateRule({ ...base, assessments: [{ lessonId: 'a1', lessonTitle: 'Aula 1', title: 'Revisão', correct: 2, total: 3, passMin: 2, passed: true }] })).toEqual({ eligible: true, pending: [] });
  });

  it('cada pendência isolada', () => {
    expect(evaluateCertificateRule({ ...base, courseCompleted: false }).pending.map((p) => p.kind)).toEqual(['course']);
    const failed = evaluateCertificateRule({ ...base, assessments: [{ lessonId: 'a1', lessonTitle: 'Aula 1', title: 'Revisão', correct: 1, total: 3, passMin: 2, passed: false }] });
    expect(failed.pending).toEqual([{ kind: 'assessment', lessonId: 'a1', lessonTitle: 'Aula 1', label: 'Revisão: 1 de 3 acertos (precisa de 2). Refaça a avaliação.' }]);
    const notYet = evaluateCertificateRule({ ...base, assessments: [{ lessonId: 'a1', lessonTitle: 'Aula 1', title: 'Revisão', correct: 0, total: 3, passMin: 2, passed: null }] });
    expect(notYet.pending[0]!.label).toBe('Revisão: responder a avaliação (precisa de 2 de 3 acertos)');
    expect(evaluateCertificateRule({ ...base, missingReflections: [{ lessonId: 'a2', lessonTitle: 'Aula 2', title: 'Seu plano' }] }).pending).toEqual([{ kind: 'reflection', lessonId: 'a2', lessonTitle: 'Aula 2', label: 'Responder a reflexão "Seu plano"' }]);
    const task = evaluateCertificateRule({ ...base, pendingTasks: [{ lessonId: 'a3', title: 'Vídeo', status: 'returned' }, { lessonId: 'a3', title: 'Link', status: 'approved' }] });
    expect(task.pending).toEqual([{ kind: 'task', lessonId: 'a3', label: 'Tarefa "Vídeo": devolvida para ajuste' }]);
  });
});

describe('dados gravados no certificado', () => {
  const doc = CourseDocumentSchema.parse({
    ...emptyCourseDocument('Curso'),
    modules: [
      { id: 'm1', title: 'Módulo 1', lessons: [{ id: 'l1', title: 'Aula 1', estimatedMinutes: 30, graph: { schemaVersion: 1, startNodeId: 'f', nodes: [{ id: 'f', type: 'end', summary: richTextFromPlain('Fim') }], edges: [] } }, { id: 'l2', title: 'Aula 2', estimatedMinutes: 20, graph: { schemaVersion: 1, startNodeId: 'f', nodes: [{ id: 'f', type: 'end', summary: richTextFromPlain('Fim') }], edges: [] } }] },
      { id: 'm2', title: 'Módulo 2', lessons: [{ id: 'l3', title: 'Aula 3', estimatedMinutes: 15, graph: { schemaVersion: 1, startNodeId: 'f', nodes: [{ id: 'f', type: 'end', summary: richTextFromPlain('Fim') }], edges: [] } }] },
    ],
  });

  it('conteúdo programático por módulo, sem as aulas opcionais da matrícula', () => {
    expect(certificateProgramOf(doc)).toEqual([
      { title: 'Módulo 1', minutes: 50, lessons: ['Aula 1', 'Aula 2'] },
      { title: 'Módulo 2', minutes: 15, lessons: ['Aula 3'] },
    ]);
    expect(certificateProgramOf(doc, ['l3']).map((m) => m.title)).toEqual(['Módulo 1']);
  });

  it('carga horária: a declarada no certificado vence a soma das aulas', () => {
    expect(certificateWorkloadMinutes({ ...doc, certificate: { enabled: true, workloadMinutes: 600 } })).toBe(600);
  });

  it('emissor: dados antigos ou inválidos viram o emissor vazio; CNPJ com máscara', () => {
    expect(parseCertificateIssuer(null)).toMatchObject({ institution: '', cnpj: '', showPlatformBrand: true });
    expect(parseCertificateIssuer({ cnpj: 'abc' })).toMatchObject({ cnpj: '' });
    expect(formatCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatCnpj('1234')).toBe('12.34');
  });
});
