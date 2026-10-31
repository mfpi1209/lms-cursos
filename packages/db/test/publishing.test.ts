import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './setup';
import { DomainError, type Database } from '../src';
import { getDraft, setNodeMedia } from '../src/repositories/authoring';
import { createJob, updateJob } from '../src/repositories/media';
import { mediaWarningCounts, publishCourse, validateDraft } from '../src/repositories/publishing';
import { assertDisposableDatabaseUrl, isDisposableDatabaseUrl } from '../src/test-guard';
import type { SeedResult } from '../src/seed/seed';

let db: Database;
let close: () => Promise<void>;
let seeded: SeedResult;
let userId: string;
let courseId: string;
let lessonId: string;
let nodeIds: string[];

beforeAll(async () => {
  ({ db, close, seeded } = await resetDatabase());
  userId = seeded.users['autor@demo.local']!;
  courseId = seeded.courseId;
  const draft = (await getDraft(db, courseId))!;
  const lesson = draft.document.modules.flatMap((m) => m.lessons)[0]!;
  lessonId = lesson.id;
  nodeIds = lesson.graph.nodes.filter((n) => ['scenario', 'content', 'choice', 'consequence'].includes(n.type)).map((n) => n.id);
});
afterAll(async () => {
  await close();
});

describe('guarda do banco de teste', () => {
  it('só aceita *_test/*_e2e diferentes do DATABASE_URL', () => {
    expect(isDisposableDatabaseUrl('postgres://localhost:5432/lms_cursos_test', { DATABASE_URL: 'postgres://localhost:5432/lms_cursos' }).ok).toBe(true);
    expect(isDisposableDatabaseUrl('postgres://localhost:5432/lms_cursos_e2e', {}).ok).toBe(true);
    expect(isDisposableDatabaseUrl('postgres://localhost:5432/lms_cursos', {}).ok).toBe(false);
    expect(isDisposableDatabaseUrl('postgres://localhost:5432/lms_cursos_test', { DATABASE_URL: 'postgres://outro-host/lms_cursos_test' }).ok).toBe(false);
    expect(() => assertDisposableDatabaseUrl('postgres://localhost:5432/lms_cursos', {})).toThrow(/Recusando/);
  });
});

describe('publicação confere o estado da mídia', () => {
  it('revisão divergente -> CONFLICT; a revisão certa publica', async () => {
    const draft = (await getDraft(db, courseId))!;
    await expect(publishCourse(db, { courseId, userId, expectedRevision: draft.revision + 100 })).rejects.toMatchObject({ code: 'CONFLICT' });
    const r = await publishCourse(db, { courseId, userId, expectedRevision: draft.revision });
    expect(r.versionNumber).toBeGreaterThanOrEqual(2);
    expect(r.media).toEqual({ stale: 0, simulated: 0, missing: 0, inProgress: 0 });
  });

  it('vídeo simulado bloqueia sem aceite e passa com allowSimulatedMedia; MEDIA_MISSING só com apresentador', async () => {
    const target = nodeIds[0]!;
    await setNodeMedia(db, { courseId, lessonId, nodeId: target, userId, media: { assetId: 'ast_fake', kind: 'video', stale: false, generatedFrom: { jobId: 'job_sim', sceneHash: 'h', provider: 'heygen', simulated: true } } });
    let v = await validateDraft(db, courseId);
    expect(v.media.simulated).toBe(1);
    expect(v.media.missing).toBe(0); // sem apresentador escolhido, vídeo não é a intenção
    expect(v.warnings.some((w) => w.code === 'MEDIA_SIMULATED' && w.nodeId === target)).toBe(true);

    const err = await publishCourse(db, { courseId, userId, expectedRevision: v.revision }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('PUBLISH_BLOCKED');
    expect((err.details as { reason?: string }).reason).toBe('simulated_media');

    const ok = await publishCourse(db, { courseId, userId, expectedRevision: v.revision, allowSimulatedMedia: true });
    expect(ok.media.simulated).toBe(1);

    // com apresentador, as outras cenas narradas sem vídeo viram MEDIA_MISSING
    const draft = (await getDraft(db, courseId))!;
    const { saveDraft } = await import('../src/repositories/authoring');
    await saveDraft(db, { courseId, userId, expectedRevision: draft.revision, origin: 'author', document: { ...draft.document, presentation: { ...draft.document.presentation, avatarId: 'sim_avatar_ana', voiceId: 'sim_voice_ana' } } });
    v = await validateDraft(db, courseId);
    expect(v.media.missing).toBeGreaterThan(0);
    expect(v.warnings.some((w) => w.code === 'MEDIA_MISSING' && w.nodeId === target)).toBe(false);
  });

  it('job aberto vira MEDIA_IN_PROGRESS na validação (e some ao concluir)', async () => {
    const target = nodeIds[1]!;
    const job = await createJob(db, { workspaceId: seeded.workspaceId, courseId, lessonId, nodeId: target, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: 'hash_open', input: { script: 'x' }, createdBy: userId, simulated: true });
    let v = await validateDraft(db, courseId);
    expect(v.media.inProgress).toBe(1);
    expect(v.warnings.find((w) => w.code === 'MEDIA_IN_PROGRESS')?.nodeId).toBe(target);
    expect(v.warnings.some((w) => w.code === 'MEDIA_MISSING' && w.nodeId === target)).toBe(false);
    await updateJob(db, job.id, { status: 'canceled' });
    v = await validateDraft(db, courseId);
    expect(v.media.inProgress).toBe(0);
  });

  it('mediaWarningCounts conta por código', () => {
    expect(mediaWarningCounts([{ code: 'MEDIA_STALE', message: '' }, { code: 'MEDIA_STALE', message: '' }, { code: 'MEDIA_MISSING', message: '' }, { code: 'X', message: '' }])).toEqual({ stale: 2, simulated: 0, missing: 1, inProgress: 0 });
  });
});
