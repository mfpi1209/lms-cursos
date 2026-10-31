import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { defaultLibraryTemplates, type LibraryTemplateInput } from '@lms/course-schema';
import { resetDatabase } from './setup';
import { DomainError, schema as s, type Database } from '../src';
import { getDraft, saveDraft } from '../src/repositories/authoring';
import { applyTemplateToCourse, archiveTemplate, getTemplate, listTemplates, resolveKit, simulateCourseLearners, upsertTemplate } from '../src/repositories/library';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let userId: string;

const presenter = (cameras: unknown[]): LibraryTemplateInput => ({
  kind: 'presenter',
  key: 'instrutor-rafael',
  name: 'Rafael · Seu orientador',
  description: '',
  data: {
    name: 'Rafael',
    role: 'Seu orientador',
    pronoun: 'he',
    voice: { provider: 'elevenlabs', voiceId: 'lvkgCBi6spByiTZMPJEK', voiceName: 'Gabriel (ElevenLabs)' },
    cameraKits: [{ studioKey: 'estudio-jovem-7', cameras }],
    castDetails: 'Conduz as falas.',
  },
} as LibraryTemplateInput);

const zoneCams = [
  { id: 'cam_r7_esq', name: 'Esq', lookId: 'look_esq', placement: 'full_frame', zone: 'left' },
  { id: 'cam_r7_dir', name: 'Dir', lookId: 'look_dir', placement: 'full_frame', zone: 'right' },
  { id: 'cam_r7_34', name: '3/4', lookId: 'look_34', placement: 'full_frame', zone: 'center' },
];

async function mediaJobCount() {
  const [r] = await db.select({ n: count() }).from(s.mediaJobs);
  return Number(r!.n);
}

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  userId = Object.values(seeded.users)[0]!;
  for (const t of defaultLibraryTemplates()) await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: t, createdBy: userId });
  await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: presenter(zoneCams), createdBy: userId });
});
afterAll(async () => {
  await close();
});

describe('biblioteca de modelos (banco)', () => {
  it('grava pela chave, é idempotente e valida o tipo', async () => {
    const all = await listTemplates(db, seeded.workspaceId);
    expect(all.length).toBe(defaultLibraryTemplates().length + 1);
    const again = await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: defaultLibraryTemplates()[0]!, createdBy: userId });
    expect(again).toMatchObject({ created: false, changed: false });
    await expect(upsertTemplate(db, { workspaceId: seeded.workspaceId, template: { ...defaultLibraryTemplates()[0]!, kind: 'voice' }, createdBy: userId })).rejects.toBeInstanceOf(DomainError);
    await expect(upsertTemplate(db, { workspaceId: seeded.workspaceId, template: { kind: 'voice', key: 'voz-x', name: 'X', data: { provider: 'elevenlabs' } }, createdBy: userId })).rejects.toMatchObject({ code: 'VALIDATION' });
    const learners = await listTemplates(db, seeded.workspaceId, { kind: 'learner' });
    expect(learners.map((l) => l.key)).toContain('aluno-ana-clara');
  });

  it('resolve o kit com todas as peças', async () => {
    const k = await resolveKit(db, seeded.workspaceId, 'estudio7-rafael');
    expect(k.studio.key).toBe('estudio-jovem-7');
    expect(k.presenter.data.name).toBe('Rafael');
    expect(k.voice?.data.voiceId).toBe('lvkgCBi6spByiTZMPJEK');
    expect(k.knowledge.length).toBe(8);
    expect(k.learners.length).toBe(5);
    // a Marina não está na biblioteca deste teste: kit dela não resolve
    await expect(resolveKit(db, seeded.workspaceId, 'estudio7-marina')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('"usar neste curso": nova revisão, sem pedido de mídia; de novo não grava', async () => {
    const before = (await getDraft(db, seeded.courseId))!;
    const jobs = await mediaJobCount();
    const r = await applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'estudio7-rafael', userId, expectedRevision: before.revision });
    expect(r.changed).toBe(true);
    expect(r.revision).toBe(before.revision + 1);
    expect(r.changes.join('\n')).toMatch(/Rafael/);
    const after = (await getDraft(db, seeded.courseId))!;
    expect(after.document.presentation.cameras.map((c) => c.id)).toEqual(['cam_r7_34', 'cam_r7_esq', 'cam_r7_dir']);
    expect(after.document.presentation.presenterPronoun).toBe('he');
    expect(after.document.branding.presenterName).toBe('Rafael');
    expect(after.document.branding.watermark).toEqual({ enabled: true, position: 'bottom-right', opacity: 0.7 });
    expect(await mediaJobCount()).toBe(jobs);
    const [rev] = await db.select().from(s.draftRevisions).where(eq(s.draftRevisions.revision, r.revision));
    expect(rev?.origin).toBe('template');
    const again = await applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'estudio7-rafael', userId });
    expect(again).toMatchObject({ changed: false, revision: r.revision });
  });

  it('revisão antiga = conflito; outro workspace = não encontrado', async () => {
    await expect(applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'voz-ana-dias', userId, expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(applyTemplateToCourse(db, { workspaceId: 'wsp_outro', courseId: seeded.courseId, templateIdOrKey: 'voz-ana-dias', userId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('peça avulsa (voz) e peças só de consulta', async () => {
    const r = await applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'voz-ana-dias', userId });
    expect(r.changed).toBe(true);
    expect((await getDraft(db, seeded.courseId))!.document.presentation.voiceId).toBe('MZxV5lN3cv7hi1376O0m');
    await expect(applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'regras-marca', userId })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'instrutor-rafael', userId })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('kit com câmera ainda gerando é recusado sem mexer no rascunho', async () => {
    await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: presenter([{ ...zoneCams[0], status: 'generating' }, zoneCams[1], zoneCams[2]]), createdBy: userId });
    const before = (await getDraft(db, seeded.courseId))!;
    await expect(applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'estudio7-rafael', userId })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/não estão prontas/) });
    expect((await getDraft(db, seeded.courseId))!.revision).toBe(before.revision);
    await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: presenter(zoneCams), createdBy: userId });
  });

  it('alunos de teste opinam sobre o rascunho', async () => {
    const r = await simulateCourseLearners(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId });
    expect(r.opinions).toHaveLength(5);
    expect(r.summary.total).toBe(5);
    for (const o of r.opinions) expect(o.quote).toMatch(/^Sou /);
    const one = await simulateCourseLearners(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, learnerKeys: ['aluno-diego'] });
    expect(one.opinions.map((o) => o.name)).toEqual(['Diego']);
  });

  it('arquivar esconde e o kit deixa de resolver; gravar de novo reativa', async () => {
    await archiveTemplate(db, seeded.workspaceId, 'direcao-estudio-zonas');
    expect((await listTemplates(db, seeded.workspaceId, { kind: 'direction' })).map((t) => t.key)).toEqual(['direcao-camera-unica']);
    await expect(resolveKit(db, seeded.workspaceId, 'estudio7-rafael')).rejects.toMatchObject({ code: 'VALIDATION' });
    const def = defaultLibraryTemplates().find((t) => t.key === 'direcao-estudio-zonas')!;
    const r = await upsertTemplate(db, { workspaceId: seeded.workspaceId, template: def, createdBy: userId });
    expect(r.changed).toBe(true);
    expect((await getTemplate(db, seeded.workspaceId, 'direcao-estudio-zonas'))!.archivedAt).toBeNull();
  });

  it('a edição manual depois do kit continua valendo (o kit não é reaplicado sozinho)', async () => {
    const d = (await getDraft(db, seeded.courseId))!;
    const doc = structuredClone(d.document);
    doc.branding.tagline = 'frase do autor';
    await saveDraft(db, { courseId: seeded.courseId, document: doc, expectedRevision: d.revision, userId });
    const r = await applyTemplateToCourse(db, { workspaceId: seeded.workspaceId, courseId: seeded.courseId, templateIdOrKey: 'estudio7-rafael', userId });
    expect((await getDraft(db, seeded.courseId))!.document.branding.tagline).toBe('frase do autor');
    expect(r.changes.join('\n')).toMatch(/voz/);
  });
});
