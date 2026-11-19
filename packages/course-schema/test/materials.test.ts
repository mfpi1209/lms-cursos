import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema, emptyCourseDocument } from '../src/course';
import { CourseMaterialSchema, formatBytes, materialHref, materialsForModule } from '../src/materials';

const pdf = { id: 'resumo', title: 'Resumo', category: 'resumo', assetId: 'ast_1', format: 'pdf', sizeBytes: 120_000, moduleId: 'mod_01' } as const;

describe('materiais de apoio', () => {
  it('documento antigo (sem materials) ganha lista vazia', () => {
    const { materials: _m, ...old } = emptyCourseDocument('Curso');
    expect(CourseDocumentSchema.parse(old).materials).toEqual([]);
  });

  it('arquivo OU link, nunca os dois nem nenhum', () => {
    expect(CourseMaterialSchema.safeParse(pdf).success).toBe(true);
    expect(CourseMaterialSchema.safeParse({ id: 'site', title: 'Site', url: 'https://exemplo.org', format: 'link' }).success).toBe(true);
    expect(CourseMaterialSchema.safeParse({ ...pdf, url: 'https://exemplo.org' }).success).toBe(false);
    expect(CourseMaterialSchema.safeParse({ id: 'x', title: 'X', format: 'pdf' }).success).toBe(false);
    expect(CourseMaterialSchema.safeParse({ id: 'site', title: 'Site', url: 'http://exemplo.org', format: 'link' }).success).toBe(false);
  });

  it('ids repetidos no curso são recusados', () => {
    const doc = { ...emptyCourseDocument('Curso'), materials: [pdf, { ...pdf, title: 'Outro' }] };
    expect(CourseDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('filtra por módulo, monta o endereço e formata o tamanho', () => {
    const list = [CourseMaterialSchema.parse(pdf), CourseMaterialSchema.parse({ ...pdf, id: 'geral', moduleId: undefined })];
    expect(materialsForModule(list, 'mod_01').map((m) => m.id)).toEqual(['resumo']);
    expect(materialHref(pdf)).toBe('/api/assets/ast_1');
    expect(materialHref(pdf, { download: true })).toBe('/api/assets/ast_1?download=1');
    expect(formatBytes(120_000)).toBe('117 KB');
    expect(formatBytes(2_500_000)).toBe('2,4 MB');
  });
});
