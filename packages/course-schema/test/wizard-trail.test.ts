import { describe, expect, it } from 'vitest';
import { CourseDocumentSchema, WIZARD_STEPS, WIZARD_TRAIL_VERSION, briefProfileText, emptyCourseDocument, migrateWizardState } from '../src';

describe('trilha de montagem (wizard)', () => {
  it('tem os 8 passos na ordem do autor', () => {
    expect([...WIZARD_STEPS]).toEqual(['tema', 'conteudo', 'estrutura', 'aulas', 'apresentacao', 'previa', 'producao', 'revisao']);
  });

  it('documento novo começa em tema, na trilha atual', () => {
    const doc = emptyCourseDocument('Teste');
    expect(doc.wizard).toEqual({ step: 'tema', completedSteps: [], contentMode: 'none', finished: false, trailVersion: WIZARD_TRAIL_VERSION });
  });

  it('migra rascunho antigo parado na revisão (vídeos + publicar) para a prévia', () => {
    const w = migrateWizardState({ step: 'revisao', completedSteps: ['tema', 'conteudo', 'estrutura', 'apresentacao', 'aulas'], contentMode: 'paste', finished: false });
    expect(w.step).toBe('previa');
    expect(w.completedSteps).toEqual(['tema', 'conteudo', 'estrutura', 'aulas', 'apresentacao']);
    expect(w.trailVersion).toBe(WIZARD_TRAIL_VERSION);
  });

  it('rascunho antigo já publicado ganha todos os passos como concluídos', () => {
    const w = migrateWizardState({ step: 'revisao', completedSteps: ['tema', 'conteudo'], finished: true });
    expect(w.step).toBe('revisao');
    expect(w.completedSteps).toEqual([...WIZARD_STEPS]);
    expect(w.finished).toBe(true);
  });

  it('descarta passos desconhecidos e volta ao tema quando o passo atual não existe mais', () => {
    const w = migrateWizardState({ step: 'xyz', completedSteps: ['tema', 'xyz'], contentMode: 'weird' });
    expect(w).toEqual({ step: 'tema', completedSteps: ['tema'], contentMode: 'none', finished: false, trailVersion: WIZARD_TRAIL_VERSION });
  });

  it('documento na trilha atual não é remapeado', () => {
    const w = migrateWizardState({ step: 'revisao', completedSteps: ['tema'], finished: false, trailVersion: 2 });
    expect(w.step).toBe('revisao');
  });

  it('a migração roda ao analisar o documento inteiro', () => {
    const parsed = CourseDocumentSchema.parse({ ...emptyCourseDocument('Teste'), wizard: { step: 'revisao', completedSteps: ['tema'], contentMode: 'upload', finished: false } });
    expect(parsed.wizard.step).toBe('previa');
    expect(parsed.wizard.contentMode).toBe('upload');
  });
});

describe('briefing guiado', () => {
  it('campos novos têm padrões e viram texto para a IA', () => {
    const doc = emptyCourseDocument('Teste');
    expect(doc.brief.traits).toEqual([]);
    expect(doc.brief.interaction).toEqual({ guidedChoices: true, voiceTraining: true, noWriting: true });
    expect(briefProfileText({})).toBe('');
    const text = briefProfileText({ audienceProfile: 'first_job', level: 'beginner', traits: ['shy', 'low_time'], interaction: { guidedChoices: true, voiceTraining: false, noWriting: true } });
    expect(text).toContain('primeiro emprego ou estágio');
    expect(text).toContain('iniciante');
    expect(text).toContain('tímido');
    expect(text).toContain('escolhas guiadas, sem escrita obrigatória');
  });
});
