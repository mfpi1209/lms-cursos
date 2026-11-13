import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDisposableDatabaseUrl, authoring, createDb, runMigrations, seed, media, type Database } from '@lms/db';
import { allLessons, markdownToCourseDocument, parseMarkdownCourse, type CourseDocument } from '@lms/course-schema';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { processQueuedJob, storeGeneratedAsset } from '../src/media';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let storageDir: string;
let tmp: string;

const FALA = 'Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem e o que ele precisa. Agora olhe a tela.';
const MD = `# Curso tela

Ideia: Testar telas geradas.
Público: alunos.
Objetivo final: Ao final, a pessoa assiste.
Duração-alvo: 1 aula de 3 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Tela
Objetivo: Ao final, você vê a tela.

### V01 — Passo a passo
**Fala para gravação**
"${FALA}"
Texto na tela: Passo a passo

### FIM — O que você levou
- Primeiro tópico curto
- Segundo tópico curto
`;

const MOCK = { model: 'chat' as const, device: 'phone' as const, app: 'Assistente', steps: [{ kind: 'type' as const, text: 'me explica' }, { kind: 'message' as const, from: 'ai' as const, text: 'Claro, vamos por partes.' }] };

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'local';
  storageDir = mkdtempSync(path.join(tmpdir(), 'lms-storage-'));
  tmp = mkdtempSync(path.join(tmpdir(), 'lms-screen-mock-'));
  process.env.STORAGE_DIR = storageDir;
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
  rmSync(tmp, { recursive: true, force: true });
});

async function makeCourse(recordings: unknown[]) {
  const doc = markdownToCourseDocument(parseMarkdownCourse(MD), { presentation: { avatarId: 'look1', voiceProvider: 'elevenlabs', voiceId: 'v1' } }) as CourseDocument;
  for (const l of allLessons(doc)) for (const n of l.graph.nodes) if (n.id === 'v01') (n as { screenRecordings?: unknown }).screenRecordings = recordings;
  const created = await authoring.createCourse(db, { workspaceId, title: `Tela ${Math.random()}`, createdBy: userId, document: doc });
  const lesson = allLessons(doc).find((l) => l.graph.nodes.some((n) => n.id === 'v01'))!;
  return { courseId: created.id, lessonId: lesson.id };
}

async function uploadAsset(seconds: number) {
  const f = path.join(tmp, `up-${seconds}.mp4`);
  await runFfmpeg(['-f', 'lavfi', '-i', `testsrc2=size=640x480:rate=25:duration=${seconds}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]);
  return storeGeneratedAsset({ workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(f)), durationSeconds: seconds, createdBy: userId });
}

async function run(courseId: string, lessonId: string, recordings: unknown[]) {
  const job = await media.createJob(db, {
    workspaceId, courseId, lessonId, nodeId: 'v01', kind: 'video', provider: 'heygen', adapterVersion: 'test+screen-1', sceneHash: `h${Math.random()}`,
    input: { kind: 'screen', script: FALA, voiceProvider: 'elevenlabs', voiceId: 'v1', params: {}, screen: { recordings } }, createdBy: userId, simulated: true, costEstimatedUsd: 0,
  });
  await processQueuedJob(job.id);
  return (await media.getJob(db, job.id))!;
}

const nodeOf = async (courseId: string) => {
  const d = (await authoring.getDraft(db, courseId))!;
  return allLessons(d.document).flatMap((l) => l.graph.nodes).find((n) => n.id === 'v01') as unknown as { media?: { assetId?: string }; screenRecordings: Array<{ fileName: string; assetId?: string; source?: string; durationSec?: number; fit?: string }> };
};

describe('job de tela com telas simuladas (modo de demonstração, narração e storage locais, ffmpeg real)', () => {
  it('só telas geradas: gera o MP4, guarda o asset e grava assetId/source/durationSec/fit no rascunho', async () => {
    const recs = [{ fileName: 'a.mp4', mock: MOCK }];
    const { courseId, lessonId } = await makeCourse(recs);
    const job = await run(courseId, lessonId, [{ fileName: 'a.mp4', source: 'mock', mock: MOCK }]);
    expect(job.status).toBe('succeeded');
    const n = await nodeOf(courseId);
    const r = n.screenRecordings[0]!;
    expect(r).toMatchObject({ fileName: 'a.mp4', source: 'mock', fit: 'ok' });
    expect(r.assetId).toBeTruthy();
    const gen = (await media.getAsset(db, r.assetId!))!;
    expect(gen.kind).toBe('video');
    const total = (await media.getAsset(db, n.media!.assetId!))!;
    expect(r.durationSec!).toBeCloseTo(total.durationSeconds!, 0);
    const p = await ffprobe(path.join(storageDir, total.storageKey));
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
  }, 180_000);

  it('mistura upload + tela gerada: o enviado entra com a duração dele e a gerada preenche o resto da narração', async () => {
    const up = await uploadAsset(3);
    const recs = [{ fileName: 'enviada.mp4', assetId: up.id, source: 'upload', mock: MOCK }, { fileName: 'gerada.mp4', mock: MOCK }];
    const { courseId, lessonId } = await makeCourse(recs);
    const job = await run(courseId, lessonId, [{ fileName: 'enviada.mp4', assetId: up.id, source: 'upload', mock: MOCK }, { fileName: 'gerada.mp4', source: 'mock', mock: MOCK }]);
    expect(job.status).toBe('succeeded');
    const n = await nodeOf(courseId);
    const [a, b] = n.screenRecordings;
    expect(a).toMatchObject({ fileName: 'enviada.mp4', assetId: up.id, source: 'upload' });
    expect(a!.durationSec).toBeCloseTo(3, 0);
    expect(b).toMatchObject({ fileName: 'gerada.mp4', source: 'mock', fit: 'ok' });
    expect(b!.assetId).toBeTruthy();
    expect(b!.assetId).not.toBe(up.id);
    const total = (await media.getAsset(db, n.media!.assetId!))!;
    expect(a!.durationSec! + b!.durationSec!).toBeCloseTo(total.durationSeconds!, 0);
  }, 180_000);
});
