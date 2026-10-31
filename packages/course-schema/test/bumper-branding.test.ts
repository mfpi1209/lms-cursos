import { describe, expect, it } from 'vitest';
import { BrandingSchema, BumperBrandingSchema, CourseDocumentSchema, emptyCourseDocument } from '../src';

describe('BrandingSchema.bumper (vinheta da marca)', () => {
  it('é aditivo: documentos antigos continuam válidos sem o campo', () => {
    const doc = emptyCourseDocument('Curso');
    expect(doc.branding.bumper).toBeUndefined();
    expect(CourseDocumentSchema.parse({ ...doc, branding: { theme: 'immersive' } }).branding.bumper).toBeUndefined();
  });
  it('aplica padrões: toca só no fim do curso e pode pular', () => {
    expect(BumperBrandingSchema.parse({})).toEqual({ playOn: ['course_end'], skippable: true });
    const b = BrandingSchema.parse({ bumper: { assetId: 'ast_1', assetIdVertical: 'ast_2', playOn: ['lesson_end', 'course_end'], skippable: false } }).bumper!;
    expect(b).toEqual({ assetId: 'ast_1', assetIdVertical: 'ast_2', playOn: ['lesson_end', 'course_end'], skippable: false });
  });
  it('rejeita momentos desconhecidos e ids longos demais', () => {
    expect(BumperBrandingSchema.safeParse({ playOn: ['always'] }).success).toBe(false);
    expect(BumperBrandingSchema.safeParse({ assetId: 'x'.repeat(65) }).success).toBe(false);
  });
});
