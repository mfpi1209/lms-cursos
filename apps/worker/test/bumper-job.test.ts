import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, runMigrations, seed, media, schema, type Database } from '@lms/db';
import { BUMPER_JOB_LESSON_ID, BUMPER_RENDERER_VERSION, bumperJobCourseId, bumperSpecHash, type BumperJobInput } from '@lms/media';
import { ffprobe } from '@lms/media/compose';
import { dispatchQueuedJobs, processQueuedJob } from '../src/media';
import { isBumperJob, BUMPER_JOB_NOTE } from '../src/bumper';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let storageDir: string;

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'local';
  storageDir = mkdtempSync(path.join(tmpdir(), 'lms-storage-'));
  process.env.STORAGE_DIR = storageDir;
  // modo de demonstração: nenhuma chave, trava de gasto fechada
  delete process.env.HEYGEN_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ALLOW_PAID_PROVIDERS;
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  userId = seeded.users['autor@demo.local']!;
  workspaceId = seeded.workspaceId;
}, 60_000);
afterAll(async () => {
  await close();
});

async function createBumperJob(input: BumperJobInput) {
  const sceneHash = bumperSpecHash({ ...input.spec, aspect: '16:9' });
  return media.createJob(db, {
    workspaceId, courseId: bumperJobCourseId(workspaceId), lessonId: BUMPER_JOB_LESSON_ID, nodeId: sceneHash.slice(0, 32), kind: 'video', provider: 'local-bumper', adapterVersion: BUMPER_RENDERER_VERSION,
    sceneHash, input: input as unknown as Record<string, unknown>, createdBy: userId, simulated: false, costEstimatedUsd: 0,
  });
}

describe('job de vinheta (worker em modo de demonstração, ffmpeg real)', () => {
  it('renderiza 16:9 + 9:16, guarda os assets com metadata.bumper, marca o padrão e custo 0 — sem provedor', async () => {
    const input: BumperJobInput = {
      kind: 'bumper', aspects: ['16:9', '9:16'], name: 'Teste', setDefault: true,
      spec: { brand: 'dnawork', style: 'reveal', variant: 'light', durationSec: 3, tagline: 'Frase de teste da vinheta.', audio: { kind: 'synth', preset: 'minimal' }, placement: 'outro' },
    };
    const job = await createBumperJob(input);
    expect(isBumperJob(job)).toBe(true);
    expect(job.simulated).toBe(0);
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.status).toBe('succeeded');
    expect(done.costActualUsd).toBe(0);
    expect(done.lastError).toBe(BUMPER_JOB_NOTE);
    expect(done.outputAssetId).toBeTruthy();
    const main = (await media.getAsset(db, done.outputAssetId!))!;
    expect(main.kind).toBe('video');
    expect(main.metadata?.bumper).toMatchObject({ aspect: '16:9', default: true, name: 'Teste', hash: bumperSpecHash({ ...input.spec, aspect: '16:9' }) });
    expect(main.metadata!.bumper!.durationSec).toBeCloseTo(3, 1);
    const vertical = (await media.getAsset(db, main.metadata!.bumper!.verticalAssetId!))!;
    expect(vertical.metadata?.bumper).toMatchObject({ aspect: '9:16', default: true });
    const file = path.join(storageDir, main.storageKey);
    expect(existsSync(file)).toBe(true);
    const p = await ffprobe(file);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    expect((await ffprobe(path.join(storageDir, vertical.storageKey))).width).toBe(1080);
    // padrão do workspace por proporção
    expect((await media.findDefaultBumper(db, workspaceId, '16:9'))!.id).toBe(main.id);
    expect((await media.findDefaultBumper(db, workspaceId, '9:16'))!.id).toBe(vertical.id);
    expect((await media.listBumperAssets(db, workspaceId)).map((a) => a.id).sort()).toEqual([main.id, vertical.id].sort());
    const outputs = ((await media.getJob(db, job.id))!.input as unknown as BumperJobInput).outputs!;
    expect(outputs['16:9']).toEqual({ assetId: main.id, reused: false });
  }, 180_000);

  it('mesma especificação de novo: reaproveita por hash (sem novo render) e o novo padrão desmarca o anterior', async () => {
    const spec = { brand: 'dnawork' as const, style: 'reveal' as const, variant: 'light' as const, durationSec: 3, tagline: 'Frase de teste da vinheta.', audio: { kind: 'synth' as const, preset: 'minimal' as const }, placement: 'outro' as const };
    const before = await media.findDefaultBumper(db, workspaceId, '16:9');
    // mesma spec, só 16:9 → reaproveita o asset existente
    const job = await createBumperJob({ kind: 'bumper', spec, aspects: ['16:9'], name: 'Repetida' });
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.status).toBe('succeeded');
    expect(done.outputAssetId).toBe(before!.id);
    expect(((done.input as unknown as BumperJobInput).outputs!['16:9'])).toEqual({ assetId: before!.id, reused: true });
    // spec diferente marcada como padrão: a anterior deixa de ser padrão
    const job2 = await createBumperJob({ kind: 'bumper', spec: { ...spec, style: 'pulse', audio: { kind: 'none' } }, aspects: ['16:9'], setDefault: true });
    await dispatchQueuedJobs();
    const done2 = (await media.getJob(db, job2.id))!;
    expect(done2.status).toBe('succeeded');
    expect((await media.findDefaultBumper(db, workspaceId, '16:9'))!.id).toBe(done2.outputAssetId);
    const old = (await media.getAsset(db, before!.id))!;
    expect(old.metadata?.bumper?.default).toBe(false);
  }, 180_000);

  it('áudio de arquivo inexistente: falha definitiva antes de reivindicar, nada renderizado', async () => {
    const job = await createBumperJob({ kind: 'bumper', spec: { brand: 'dnawork', style: 'sweep', variant: 'navy', durationSec: 3, audio: { kind: 'file', assetId: 'ast_nao_existe' }, placement: 'outro' } });
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.status).toBe('failed');
    expect(done.lastError).toMatch(/áudio ast_nao_existe não encontrado/);
    const [ev] = await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.type, 'media_job.failed'));
    expect(ev).toBeTruthy();
  }, 60_000);
});
