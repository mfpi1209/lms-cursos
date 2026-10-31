import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allLessons } from '@lms/course-schema';
import { QualityScorecardSchema, type QualityScorecard } from '@lms/ai';
import { assertDisposableDatabaseUrl, createDb, runMigrations, seed, authoring, agent, media, type Database } from '@lms/db';
import { getStorage } from '@lms/media';
import { approxWords, buildCaptionCues, generateTestClip, toWebVtt } from '@lms/media/compose';
import { processAgentRun } from '../src/agent';
import { extractFrames, metricsFromCaptions } from '../src/evaluate';

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let courseId: string;
let workDir: string;

beforeAll(async () => {
  // guarda (auditoria P2): só apaga um banco *_test/*_e2e diferente do DATABASE_URL do ambiente
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'lms-storage-'));
  workDir = mkdtempSync(path.join(tmpdir(), 'lms-eval-test-'));
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
  courseId = seeded.courseId;
});
afterAll(async () => {
  await close();
});

/** Vídeo de teste (testsrc2 + tom, 12 s) e legendas aproximadas cobrindo só os primeiros 8 s (áudio "termina cedo"). */
async function storeVideoWithCaptions(narration: string) {
  const storage = await getStorage();
  const videoPath = path.join(workDir, 'scene.mp4');
  await generateTestClip({ output: videoPath, seconds: 12, width: 640, height: 360 });
  const bytes = await readFile(videoPath);
  await storage.putObject('eval/scene.mp4', new Uint8Array(bytes), 'video/mp4');
  const video = await media.createAsset(db, { workspaceId, kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: bytes.byteLength, storageProvider: 'local', storageKey: 'eval/scene.mp4', sha256: 'v1', durationSeconds: 12, createdBy: userId });
  const vtt = toWebVtt(buildCaptionCues(approxWords(narration, 0.5, 7.5)));
  const vttBytes = Buffer.from(vtt, 'utf8');
  await storage.putObject('eval/scene.vtt', new Uint8Array(vttBytes), 'text/vtt');
  const captions = await media.createAsset(db, { workspaceId, kind: 'captions', source: 'generated', mimeType: 'text/vtt', sizeBytes: vttBytes.byteLength, storageProvider: 'local', storageKey: 'eval/scene.vtt', sha256: 'c1', createdBy: userId });
  return { video, captions, videoPath };
}

describe('avaliação de qualidade (worker, modo demo, banco real, ffmpeg)', () => {
  it('extrai quadros (10/35/60/85%) e mede o ritmo das legendas', async () => {
    const narration = 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga. O que você responde?';
    const { video, captions, videoPath } = await storeVideoWithCaptions(narration);
    expect(video.kind).toBe('video');
    const { frames, videoSeconds } = await extractFrames(videoPath, null, narration, workDir);
    expect(Math.round(videoSeconds)).toBe(12);
    expect(frames.map((f) => f.position)).toEqual([0.1, 0.35, 0.6, 0.85]);
    expect(frames.every((f) => f.mime === 'image/jpeg' && f.base64.length > 100)).toBe(true);
    const m = await metricsFromCaptions(captions.id, videoSeconds, narration, true);
    expect(m).not.toBeNull();
    expect(m!.words).toBe(16);
    expect(m!.coverage).toBe(1);
    expect(m!.audioEndsEarly).toBe(true);
    expect(m!.tailSilenceSeconds).toBeGreaterThan(3);
    expect(m!.approx).toBe(true);
  });

  it('evaluate_lesson: texto + vídeo da cena → proposta evaluate_lesson (não aplicável) + cartão em lesson_quality', async () => {
    const d0 = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d0.document);
    const lesson = allLessons(doc)[0]!;
    const target = lesson.graph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')!;
    const narration = 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga. O que você responde?';
    (target as { narration?: string }).narration = narration;
    const { video, captions } = await storeVideoWithCaptions(narration);
    (target as { media?: unknown }).media = { assetId: video.id, kind: 'video', stale: false, captions: { assetId: captions.id, lang: 'pt-BR', format: 'vtt', approx: true } };
    const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d0.revision, userId });

    const run = await agent.createRun(db, { workspaceId, courseId, task: 'evaluate_lesson', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: { includeVideo: true }, createdBy: userId });
    await processAgentRun(run.id);
    const done = (await agent.getRun(db, run.id))!;
    expect(done.status, done.error ?? '').toBe('succeeded');
    expect(done.provider).toBe('fake');
    expect(done.output).toMatchObject({ videos: 1, skipped: 0 });

    const proposal = (await agent.getProposal(db, done.proposalId!))!;
    expect(proposal.kind).toBe('evaluate_lesson');
    expect(proposal.lessonId).toBe(lesson.id);
    expect(proposal.baseRevision).toBe(saved.revision);
    expect(proposal.status).toBe('proposed');
    const payload = proposal.payload as { kind: string; scorecard: unknown };
    expect(payload.kind).toBe('quality_scorecard');
    const card: QualityScorecard = QualityScorecardSchema.parse(payload.scorecard);
    expect(card.lessonId).toBe(lesson.id);
    expect(card.revision).toBe(saved.revision);
    expect(card.basis).toMatchObject({ text: true, video: [target.id], simulated: true, skippedVideo: [] });
    expect(card.basis.framesPerVideo).toBeGreaterThanOrEqual(4);
    // texto: a aula do curso-exemplo narra a gestora em terceira pessoa => achados de voz com ação de revisão
    expect(card.scores.voz_narrativa).toBeLessThan(5);
    expect(card.findings.some((f) => f.dimension === 'voz_narrativa' && f.action?.kind === 'revise_lesson')).toBe(true);
    // vídeo: notas de demonstração + voz pelas métricas (áudio termina cedo; ritmo lento)
    expect(card.scores.postura).toBe(4);
    expect(card.scores.voz).not.toBeNull();
    expect(card.scores.voz!).toBeLessThanOrEqual(3);
    expect(card.findings.some((f) => f.dimension === 'voz' && f.scene === target.id && /silêncio depois da fala/.test(f.problem))).toBe(true);
    expect(card.summary).toMatch(/Vídeo: 1 cena avaliada/);
    expect(proposal.summary).toMatchObject({ overall: card.overall, videos: 1, simulated: true });

    // cache por aula
    const q = await agent.getLessonQuality(db, courseId, lesson.id);
    expect(q).not.toBeNull();
    expect(q!.draftRevision).toBe(saved.revision);
    expect(q!.overall).toBe(card.overall);
    expect(q!.proposalId).toBe(proposal.id);
    const list = await agent.courseQuality(db, courseId, (await authoring.getDraft(db, courseId))!.document, saved.revision);
    expect(list.find((x) => x.lessonId === lesson.id)).toMatchObject({ stale: false });
    // aplicar o cartão é recusado
    await expect(agent.applyProposal(db, { proposalId: proposal.id, userId, expectedRevision: saved.revision })).rejects.toMatchObject({ code: 'VALIDATION' });

    // só texto: vídeos fora, dimensões de vídeo nulas, e o cache é substituído
    const run2 = await agent.createRun(db, { workspaceId, courseId, task: 'evaluate_lesson', lessonId: lesson.id, provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: { includeVideo: false }, createdBy: userId });
    await processAgentRun(run2.id);
    const done2 = (await agent.getRun(db, run2.id))!;
    expect(done2.status, done2.error ?? '').toBe('succeeded');
    const card2 = QualityScorecardSchema.parse(((await agent.getProposal(db, done2.proposalId!))!.payload as { scorecard: unknown }).scorecard);
    expect(card2.scores.postura).toBeNull();
    expect(card2.basis.video).toEqual([]);
    expect((await agent.getLessonQuality(db, courseId, lesson.id))!.proposalId).toBe(done2.proposalId);
    expect(await agent.listLessonQuality(db, courseId)).toHaveLength(1);
  });
});
