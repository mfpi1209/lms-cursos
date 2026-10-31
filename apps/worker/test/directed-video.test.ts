import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CINEMATIC_MIN_SECONDS_BY_ACTION, allLessons, cinematicClipSeconds, directionNarration, type SceneDirection } from '@lms/course-schema';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, runMigrations, seed, authoring, media, schema, type Database } from '@lms/db';
import { ffprobe, generateAlphaTestClip, generateTestClip, generateToneMp3, runFfmpeg, syntheticAlignment } from '@lms/media/compose';
import { SIM_WORKER_REAL_JOB, isRecomposeJob, processQueuedJob, reconcileJob, recomposeMissingAssets, storeGeneratedAsset } from '../src/media';
import { harvestDirectedJob, harvestTerminalDirectedJobs, startDirectedJob } from '../src/compose-scene';
import { CameraNotReadyError, cinematicKey, cinematicPlanProblems, composeShotsFor, itemKey, placementKeyTag, planRenderUnits, resolveCamera, resolveUnitPlacement, shotNeedsPresenter, shotRanges, unitOffsets } from '../src/compose-plan';

const CANCEL_DIRECTED_MESSAGE = media.CANCEL_DIRECTED_MESSAGE;
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let courseId: string;
let storageDir: string;
const fixtures = mkdtempSync(path.join(tmpdir(), 'lms-directed-fx-'));

const shot = (id: string, line: string, extra: Record<string, unknown> = {}) => ({ id, line, framing: 'medium', layout: 'presenter', cameraMove: 'static', transitionIn: 'cut', ...extra });

const DIRECTION_3 = {
  version: 1, intent: 'abrir, listar, fechar', source: 'author',
  shots: [
    shot('abertura', 'Olá! Hoje você vai aprender a negociar prazos sem desgastar a relação.', { layout: 'presenter_slide_right', cameraMove: 'push_in', slide: { title: 'Negociar prazos', bullets: ['Avise cedo', 'Mostre fatos', 'Proponha alternativa'], style: 'checklist' } }),
    shot('regra', 'A regra de ouro é simples: avise antes que o atraso vire surpresa.', { layout: 'slide_with_pip', framing: 'close', transitionIn: 'crossfade', slide: { title: 'Regra de ouro', highlight: 'Avise antes da surpresa', style: 'bold' } }),
    shot('fecho', 'Vamos praticar isso agora, com um caso real do seu dia a dia.', { layout: 'lower_third', framing: 'close', cameraMove: 'drift', transitionIn: 'whip', caption: 'Marina Alves · Operações' }),
  ],
};

async function sceneNode() {
  const draft = (await authoring.getDraft(db, courseId))!;
  for (const l of allLessons(draft.document)) {
    const n = l.graph.nodes.find((x) => x.type === 'scenario' || x.type === 'content');
    if (n) return { draft, lesson: l, node: n };
  }
  throw new Error('seed sem cena');
}

async function setDirection(nodeId: string, lessonId: string, direction: unknown) {
  const draft = (await authoring.getDraft(db, courseId))!;
  const doc = structuredClone(draft.document);
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === lessonId) for (const n of l.graph.nodes) if (n.id === nodeId) (n as Record<string, unknown>).direction = direction;
  doc.presentation.cameras = [
    { id: 'frente', name: 'Frente', lookId: 'look_front', nativeFraming: 'medium', angle: 'front', status: 'ready' },
    { id: 'lado', name: 'Lado', lookId: 'look_side', nativeFraming: 'wide', angle: 'left', status: 'ready' },
  ];
  await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId, origin: 'test' });
  return (await authoring.getDraft(db, courseId))!.document;
}

async function storageFile(assetId: string) {
  const a = (await media.getAsset(db, assetId))!;
  return { asset: a, file: path.join(storageDir, a.storageKey) };
}

beforeAll(async () => {
  // guarda (auditoria P2): só apaga um banco *_test/*_e2e diferente do DATABASE_URL do ambiente
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'local';
  storageDir = mkdtempSync(path.join(tmpdir(), 'lms-storage-'));
  process.env.STORAGE_DIR = storageDir;
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
}, 60_000);
afterAll(async () => {
  await close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MEDIA_SIMULATION;
  delete process.env.HEYGEN_API_KEY;
  delete process.env.ALLOW_PAID_PROVIDERS;
  delete process.env.ELEVENLABS_API_KEY;
});

describe('planejamento de itens (puro)', () => {
  const shots = [shot('a', 'Primeira fala bem longa para o teste.'), shot('b', 'Certo.'), shot('c', 'Terceira fala também longa o bastante.')] as never[];
  const timings = [
    { shotId: 'a', charStart: 0, charEnd: 0, speechStart: 0, speechEnd: 2.9, start: 0, end: 3, duration: 3 },
    { shotId: 'b', charStart: 0, charEnd: 0, speechStart: 3.05, speechEnd: 3.5, start: 3, end: 3.6, duration: 0.6 },
    { shotId: 'c', charStart: 0, charEnd: 0, speechStart: 3.7, speechEnd: 6, start: 3.6, end: 6.2, duration: 2.6 },
  ];
  it('funde plano < 1,2 s ao vizinho mais curto e recorta o clipe nos tempos originais', () => {
    const { units, merged } = planRenderUnits(shots, { hasNarrationAudio: true });
    expect(merged).toEqual(['b']);
    expect(units.map((u) => u.shotIds)).toEqual([['a'], ['b', 'c']]);
    const offsets = unitOffsets(units[1]!, new Map(timings.map((t) => [t.shotId, t])));
    const r = shotRanges(units[1]!, shots, offsets, 3.2);
    expect(r.get('b')!.startSeconds).toBeCloseTo(0);
    expect(r.get('b')!.durationSeconds).toBeCloseTo(0.6);
    expect(r.get('c')).toEqual({ startSeconds: expect.closeTo(0.6, 5) });
  });
  it('plano "slide" vira item só de áudio (sem clipe) e não é fundido; com voz HeyGen precisa de clipe', () => {
    const s2 = [shot('a', 'Uma fala longa o bastante aqui.'), shot('s', 'Ok.', { layout: 'slide', slide: { title: 'T', bullets: [], style: 'clean' } }), shot('c', 'Outra fala longa o bastante aqui.')] as never[];
    const { units } = planRenderUnits(s2, { hasNarrationAudio: true });
    expect(units.map((u) => [u.id, u.kind])).toEqual([['a', 'clip'], ['s', 'audio'], ['c', 'clip']]);
    expect(planRenderUnits(s2, { hasNarrationAudio: false }).units.every((u) => u.kind === 'clip')).toBe(true);
    // slide sem conteúdo precisa do apresentador
    expect(shotNeedsPresenter({ layout: 'slide' } as never, true)).toBe(true);
  });
  it('câmera: ausente = avatar principal; inexistente, em geração, com falha ou sem look -> erro claro', () => {
    const cams = [
      { id: 'a', name: 'Frente', lookId: 'look_a', nativeFraming: 'close' as const, status: 'ready' },
      { id: 'b', name: 'Lado', lookId: '', nativeFraming: 'medium' as const, status: 'generating' },
      { id: 'c', name: 'Alto', lookId: 'look_c', nativeFraming: 'medium' as const, status: 'failed' },
      { id: 'd', name: 'Sem look', lookId: ' ', nativeFraming: 'medium' as const, status: 'ready' },
    ];
    expect(resolveCamera(cams, undefined, 'avatar_main')).toEqual({ lookId: 'avatar_main', nativeFraming: 'medium' });
    expect(resolveCamera(cams, undefined, 'look_a').nativeFraming).toBe('close');
    expect(resolveCamera(cams, 'a', 'x')).toMatchObject({ lookId: 'look_a', nativeFraming: 'close' });
    expect(() => resolveCamera(cams, 'b', 'x')).toThrow(/ainda não está pronta \(em geração\)/);
    expect(() => resolveCamera(cams, 'c', 'x')).toThrow(CameraNotReadyError);
    expect(() => resolveCamera(cams, 'd', 'x')).toThrow(/não tem look/);
    expect(() => resolveCamera(cams, 'zz', 'x')).toThrow(/não existe mais/);
  });
  it('cena em movimento: item próprio (nunca fundido), duração 4–15 s, chave sem o áudio, problemas antes de cobrar', () => {
    const cine = { layout: 'cinematic', cinematic: { prompt: 'Walks to the building; tracking shot.' } };
    const s3 = [shot('a', 'Uma fala longa o bastante aqui.'), shot('c', 'Você chega ao prédio da empresa numa terça de manhã, com calma.', cine), shot('b', 'Ok.')] as never[];
    const { units, merged } = planRenderUnits(s3, { hasNarrationAudio: true });
    // "Ok." (< 1,2 s) só pode ir para um vizinho de apresentador; a cena em movimento nunca recebe nem é fundida
    expect(units.map((u) => [u.id, u.kind, u.shotIds])).toEqual([['a', 'clip', ['a']], ['c', 'cinematic', ['c']], ['b', 'clip', ['b']]]);
    expect(merged).toEqual([]);
    expect(units[1]!.cinematicPrompt).toBe('Walks to the building; tracking shot.');
    // duração pedida: mínimo da ação (a fala pode ser mais curta) ou trecho + 0,5 s, até 15 s
    expect(cinematicClipSeconds(undefined, 1.1)).toBe(5);
    expect(cinematicClipSeconds('walk_in_and_sit', 1.1)).toBe(CINEMATIC_MIN_SECONDS_BY_ACTION.walk_in_and_sit);
    expect(cinematicClipSeconds('walk_across', 6.2)).toBe(7);
    expect(cinematicClipSeconds('walk_toward_camera', 14.7)).toBe(15);
    const k = { prompt: 'Walks.', lookId: 'l', durationSeconds: 7, model: 'seedance_2', resolution: '1080p', adapterVersion: 'x', simulated: false };
    expect(cinematicKey(k)).toBe(cinematicKey({ ...k, prompt: ' Walks. ' }));
    expect(cinematicKey(k)).not.toBe(cinematicKey({ ...k, durationSeconds: 8 }));
    expect(cinematicKey(k)).not.toBe(cinematicKey({ ...k, lookId: 'l2' }));
    expect(cinematicKey(k)).not.toBe(cinematicKey({ ...k, simulated: true }));
    expect(cinematicPlanProblems(s3, { hasNarrationAudio: true })).toEqual([]);
    expect(cinematicPlanProblems(s3, { hasNarrationAudio: false }).join(' ')).toMatch(/exige a narração do ElevenLabs/);
    const long = Array.from({ length: 45 }, (_, i) => `p${i}`).join(' ');
    expect(cinematicPlanProblems([shot('x', long, cine)] as never[], { hasNarrationAudio: true }).join(' ')).toMatch(/no máximo 15 s; divida a fala/);
    expect(cinematicPlanProblems([shot('x', 'Uma fala.', { layout: 'cinematic' })] as never[], { hasNarrationAudio: true }).join(' ')).toMatch(/sem pedido de câmera/);
  });
  it('posição por câmera (puro): inherit = curso; tela cheia/centro opacos; rótulo da chave só fora do centro', () => {
    const cams = [
      { id: 'principal', lookId: 'look_front' },
      { id: 'sentada', lookId: 'look_seated', placement: 'full_frame' as const },
      { id: 'grande', lookId: 'look_big', scale: 1.1 },
      { id: 'meio', lookId: 'look_mid', placement: 'center' as const },
    ];
    const right = { presenterPlacement: 'right', presenterScale: 0.92 };
    expect(resolveUnitPlacement(cams, undefined, 'look_front', right)).toEqual({ placement: 'right', scale: 0.92, transparent: true });
    expect(resolveUnitPlacement(cams, 'sentada', 'look_front', right)).toEqual({ placement: 'full_frame', scale: 0.92, transparent: false });
    expect(resolveUnitPlacement(cams, 'grande', 'look_front', right)).toEqual({ placement: 'right', scale: 1.1, transparent: true });
    expect(resolveUnitPlacement(cams, 'meio', 'look_front', right)).toEqual({ placement: 'center', scale: 0.92, transparent: false });
    expect(resolveUnitPlacement(cams, 'sentada', 'look_front', {})).toMatchObject({ placement: 'full_frame' });
    expect(resolveUnitPlacement(undefined, undefined, 'look_front', undefined)).toEqual({ placement: 'center', scale: 0.92, transparent: false });
    expect(placementKeyTag({ placement: 'right', scale: 0.92, transparent: true })).toBe('right:0.92');
    expect(placementKeyTag({ placement: 'full_frame', scale: 0.92, transparent: false })).toBe('full_frame:opaque');
    expect(placementKeyTag({ placement: 'center', scale: 0.92, transparent: false })).toBeUndefined();
  });

  it('chave do item muda com a fala/look/gesto, não com o resto da cena', () => {
    const base = { kind: 'clip' as const, text: 'Olá  mundo', voice: { provider: 'elevenlabs', voiceId: 'v' }, lookId: 'l', adapterVersion: 'x', simulated: false };
    expect(itemKey(base)).toBe(itemKey({ ...base, text: 'Olá mundo' }));
    expect(itemKey(base)).not.toBe(itemKey({ ...base, lookId: 'l2' }));
    expect(itemKey(base)).not.toBe(itemKey({ ...base, motionPrompt: 'waves' }));
    expect(itemKey(base)).not.toBe(itemKey({ ...base, simulated: true }));
    expect(itemKey({ ...base, kind: 'audio' })).toBe(itemKey({ ...base, kind: 'audio', lookId: 'outro' }));
  });
});

describe('câmera em tela cheia na montagem (puro)', () => {
  it('itens numa câmera full_frame: enquadramento nativo e static (sem zoom digital); demais intactos', () => {
    const shots = [
      { id: 's1', line: 'a b c', framing: 'medium', layout: 'presenter', cameraMove: 'static', transitionIn: 'cut', cameraId: 'cena' },
      { id: 's2', line: 'd e f', framing: 'medium', layout: 'card', cameraMove: 'static', transitionIn: 'cut', slide: { title: 't', bullets: [], style: 'checklist' } },
      { id: 's3', line: 'g h i', framing: 'close', layout: 'presenter', cameraMove: 'push_in', transitionIn: 'cut', cameraId: 'cena' },
      { id: 's4', line: 'j k l', framing: 'close', layout: 'presenter', cameraMove: 'push_in', transitionIn: 'cut', cameraId: 'direita' },
    ] as never[];
    const units = [{ kind: 'clip' as const, shotIds: ['s1'] }, { kind: 'audio' as const, shotIds: ['s2'] }, { kind: 'clip' as const, shotIds: ['s3'] }, { kind: 'clip' as const, shotIds: ['s4'] }];
    const r = composeShotsFor(shots, units, (u) => (u.shotIds[0] === 's4' ? null : 'medium'));
    expect(r.adjusted).toEqual(['s3']);
    expect(r.shots[2]).toMatchObject({ framing: 'medium', cameraMove: 'static' });
    expect(r.shots[0]).toBe(shots[0]);
    expect(r.shots[3]).toBe(shots[3]);
  });
});

describe('vídeo dirigido — modo de demonstração (banco real, ffmpeg real)', () => {
  it('3 planos: narração+alinhamento, clipes sintéticos, slides, montagem e anexo ao nó', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const { lesson, node } = await sceneNode();
    const doc = await setDirection(node.id, lesson.id, DIRECTION_3);
    const narration = directionNarration(DIRECTION_3 as SceneDirection);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: lesson.id, nodeId: node.id, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: 'sim-directed-1',
      input: { script: narration, avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { backgroundColor: '#F7F8FA', engine: 'avatar_iv', removeBackground: true }, direction: DIRECTION_3, cameras: doc.presentation.cameras, directionStyle: { slideAccent: '#e4572e' } },
      createdBy: userId, simulated: true,
    });
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.lastError).toMatch(/SIMULADO/);
    expect(done.status).toBe('succeeded');
    expect(done.phase).toBe('done');
    expect(done.outputAssetId).toBeTruthy();
    const input = done.input as any;
    expect(input.voiceAssetId).toBeTruthy();
    expect(input.alignment.characters.join('')).toBe(narration);
    expect(Object.keys(input.shots).sort()).toEqual(['abertura', 'fecho', 'regra']);
    expect(Object.values(input.shots).every((s: any) => s.clipAssetId)).toBe(true);
    expect(input.leaseUntil).toBeUndefined();
    const { asset, file } = await storageFile(done.outputAssetId!);
    expect(asset.kind).toBe('video');
    const probe = await ffprobe(file);
    expect(probe).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    // duração ≈ narração inteira: as transições (crossfade, whip) não encobrem a fala
    expect(Math.abs(probe.durationSeconds - input.narrationSeconds)).toBeLessThan(0.5);
    const after = await sceneNode();
    const attached = (after.node as any).media;
    expect(attached).toMatchObject({ assetId: done.outputAssetId, kind: 'video', generatedFrom: { jobId: job.id, simulated: true } });
    expect(attached.transcript).toBe(narration);
    // legendas WebVTT do alinhamento sintético, na linha do tempo final, anexadas ao nó
    expect(input.captions).toEqual({ assetId: expect.any(String), lang: 'pt-BR', format: 'vtt' });
    expect(attached.captions).toMatchObject({ assetId: input.captions.assetId, lang: 'pt-BR', format: 'vtt' });
    const cap = await storageFile(input.captions.assetId);
    expect(cap.asset).toMatchObject({ kind: 'captions', mimeType: 'text/vtt' });
    const vtt = readFileSync(cap.file, 'utf8');
    expect(vtt.startsWith('WEBVTT\n\n1\n00:00:00')).toBe(true);
    const ends = [...vtt.matchAll(/--> (\d\d):(\d\d):(\d\d)\.(\d{3})/g)].map((m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000);
    expect(ends.length).toBeGreaterThanOrEqual(3);
    // nenhuma legenda curta demais ("Olá!" foi fundido à frase seguinte)
    expect(vtt).not.toMatch(/\nOlá!\n/);
    expect(Math.max(...ends)).toBeLessThanOrEqual(probe.durationSeconds + 0.3);
    // todas as palavras da narração, na ordem
    const cueText = vtt.split('\n\n').slice(1).map((b) => b.split('\n').slice(2).join(' ')).join(' ').trim();
    expect(cueText).toBe(narration);
  }, 180_000);
});

describe('vídeo dirigido — cena em movimento simulada (banco real, ffmpeg real)', () => {
  it('um plano cinematic: substituto local + narração por cima; fundo de continuidade nos outros planos; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const fetchSpy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na simulação: ${String(u)}`); });
    vi.stubGlobal('fetch', fetchSpy);
    const { lesson, node } = await sceneNode();
    const dir = {
      version: 1, intent: 'chegada e pergunta', source: 'author',
      shots: [
        shot('chegada', 'Terça de manhã, você chega ao prédio da empresa com quinze minutos de folga e respira fundo.', { layout: 'cinematic', cameraId: 'lado', caption: 'Terça, nove e meia', cinematic: { prompt: 'The presenter arrives at a modern office building; slow tracking shot from the side, eye level.', setting: 'Chegando ao prédio' } }),
        shot('pergunta', 'O que você faz nesses minutos antes de entrar?', { framing: 'close' }),
      ],
    };
    const doc = await setDirection(node.id, lesson.id, dir);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: lesson.id, nodeId: node.id, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: 'sim-cinematic-1',
      input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { backgroundColor: '#F7F8FA', engine: 'avatar_iv', cinematicResolution: '1080p' }, direction: dir, cameras: doc.presentation.cameras, directionStyle: { slideAccent: '#e4572e' } },
      createdBy: userId, simulated: true,
    });
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.status).toBe('succeeded');
    expect(fetchSpy).not.toHaveBeenCalled();
    const input = done.input as any;
    expect(input.units.map((u: any) => [u.id, u.kind])).toEqual([['chegada', 'cinematic'], ['pergunta', 'clip']]);
    const c = input.shots.chegada;
    expect(c).toMatchObject({ kind: 'cinematic', segmentAssetId: expect.any(String), clipAssetId: expect.any(String), videoKey: expect.any(String) });
    expect(c.cinematicSeconds).toBe(cinematicClipSeconds(undefined, c.segmentSeconds));
    expect(c.heygenVideoId).toBeUndefined();
    // clipe simulado: mudo, com o mínimo da ação (walk_across: 5 s)
    const clip = await ffprobe((await storageFile(c.clipAssetId)).file);
    expect(clip.hasAudio).toBe(false);
    expect(clip.durationSeconds).toBeGreaterThanOrEqual(4.9);
    // continuidade: fundo extraído do substituto da cena em movimento (asset de imagem, sem upload) e usado no plano do apresentador
    expect(input.scenePlateSource).toBe('chegada');
    expect(input.scenePlate).toEqual({ assetId: expect.any(String), fromKey: c.videoKey });
    const plate = await storageFile(input.scenePlate.assetId);
    expect(plate.asset).toMatchObject({ kind: 'image', mimeType: 'image/jpeg' });
    expect(await ffprobe(plate.file)).toMatchObject({ width: 1920, height: 1080 });
    expect(input.shots.pergunta).toMatchObject({ plateBackground: true, clipAssetId: expect.any(String), key: expect.any(String) });
    const out = await ffprobe((await storageFile(done.outputAssetId!)).file);
    expect(out).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    // o plano em movimento dura o maior entre a fala e o clipe; depois vem a pergunta
    const expected = Math.max(c.segmentSeconds, clip.durationSeconds) + input.shots.pergunta.segmentSeconds;
    expect(Math.abs(out.durationSeconds - expected)).toBeLessThan(0.5);
  }, 180_000);
});

describe('vídeo dirigido — provedores falsos (sem chamadas pagas reais)', () => {
  type Calls = { tts: string[]; uploads: number; images: number; rejected: number; videos: Array<{ key: string; avatar: string; body: any }>; attempts: string[]; gets: number };
  function installFakes(opts: { rejectWebm?: boolean; failVideo?: string; uploadFailures?: number; rejectPlate?: boolean; ttsBody?: string; timeoutBgOnce?: boolean; onVideoPost?: (n: number) => Promise<void>; pending?: boolean }) {
    const calls: Calls = { tts: [], uploads: 0, images: 0, rejected: 0, videos: [], attempts: [], gets: 0 };
    let bgTimeouts = opts.timeoutBgOnce ? 1 : 0;
    let failOnce = opts.failVideo ?? '';
    let uploadFailures = opts.uploadFailures ?? 0;
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      const u = String(url);
      if (u.includes('api.elevenlabs.io') && u.includes('/with-timestamps')) {
        const text = JSON.parse(String(init.body)).text as string;
        calls.tts.push(text);
        if (opts.ttsBody !== undefined) return new Response(opts.ttsBody, { status: 200, headers: { 'content-type': 'application/json' } });
        const speech = Math.max(1, text.split(/\s+/).length / 2.5);
        const mp3 = await generateToneMp3(path.join(fixtures, `el-${calls.tts.length}-${Date.now()}.mp3`), speech + 0.3);
        const al = syntheticAlignment(text, speech);
        return json({ audio_base64: readFileSync(mp3).toString('base64'), alignment: { characters: al.characters, character_start_times_seconds: al.startTimes, character_end_times_seconds: al.endTimes } });
      }
      if (u === 'https://api.heygen.com/v3/assets') {
        if (uploadFailures-- > 0) return json({ error: { code: 'internal', message: 'boom' } }, 500);
        const file = (init.body as FormData).get('file') as Blob;
        if (file.type.startsWith('image/')) {
          calls.images++;
          return json({ data: { id: `img_${calls.images}` } });
        }
        calls.uploads++;
        return json({ data: { id: `aud_${calls.uploads}` } });
      }
      if (u === 'https://api.heygen.com/v3/videos' && init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const key = new Headers(init.headers).get('Idempotency-Key')!;
        calls.attempts.push(key);
        if (bgTimeouts > 0 && key.endsWith(':bg')) {
          bgTimeouts--;
          throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
        }
        if (opts.rejectPlate && String(body.background?.asset_id ?? '').startsWith('img_')) {
          calls.rejected++;
          return json({ error: { code: 'invalid_parameter', message: 'background asset not supported' } }, 400);
        }
        if (opts.rejectWebm && body.output_format === 'webm') {
          calls.rejected++;
          return json({ error: { code: 'invalid_parameter', message: 'This video avatar does not support webm output. The avatar must be trained with matting enabled.' } }, 400);
        }
        calls.videos.push({ key, avatar: body.avatar_id, body });
        const id = `vid_${calls.videos.length}`;
        await opts.onVideoPost?.(calls.videos.length);
        return json({ data: { video_id: id, status: 'waiting' } });
      }
      const m = /\/v3\/videos\/(vid_\d+)$/.exec(u);
      if (m) {
        calls.gets++;
        if (opts.pending) return json({ data: { status: 'processing' } });
        if (m[1] === failOnce) {
          failOnce = '';
          return json({ data: { status: 'failed', failure_code: 'render_error', failure_message: 'tente de novo' } });
        }
        const webm = calls.videos[Number(m[1]!.slice(4)) - 1]?.body.output_format === 'webm';
        return json({ data: { status: 'completed', video_url: `https://files.heygen.test/${m[1]}.${webm ? 'webm' : 'mp4'}`, duration: 3.5 } });
      }
      if (u.startsWith('https://files.heygen.test/')) {
        const webm = u.endsWith('.webm');
        const bytes = readFileSync(path.join(fixtures, webm ? 'hg-alpha.webm' : 'hg.mp4'));
        return new Response(bytes, { status: 200, headers: { 'content-type': webm ? 'video/webm' : 'video/mp4', 'content-length': String(bytes.byteLength) } });
      }
      throw new Error(`chamada inesperada: ${u}`);
    }));
    return calls;
  }

  const direction = {
    version: 1, intent: '', source: 'author',
    shots: [
      shot('p1', 'Quando o prazo aperta, a primeira reação é esconder o problema.', { cameraId: 'frente' }),
      shot('p2', 'Certo.', { cameraId: 'frente', transitionIn: 'crossfade' }),
      shot('p3', 'Só que esconder custa caro, para você e para o time inteiro.', { cameraId: 'lado', framing: 'close' }),
      shot('p4', 'Então vamos ver como avisar cedo, com fatos e uma proposta na mão.', { layout: 'slide', slide: { title: 'Avise cedo', bullets: ['Fatos', 'Proposta'], style: 'clean' } }),
      shot('p5', 'Primeiro, conte o que aconteceu, sem rodeios e sem culpados.', { cameraId: 'frente', layout: 'lower_third', caption: 'Passo 1' }),
      shot('p6', 'E no final você vai treinar isso numa conversa difícil de verdade.', { cameraId: 'lado', transitionIn: 'dip_to_color' }),
    ],
  };
  let nodes: Array<{ lessonId: string; nodeId: string }> = [];
  let cameras: unknown[] = [];
  const mkJob = (t: { lessonId: string; nodeId: string }, dir: unknown = direction, cams: unknown = cameras, style: Record<string, unknown> = { slideAccent: '#1a66d1' }) => media.createJob(db, {
    workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `real-${Math.random()}`,
    input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { backgroundColor: '#F7F8FA', engine: 'avatar_iv', expressiveness: 'high', removeBackground: true }, direction: dir, cameras: cams, directionStyle: style },
    createdBy: userId, simulated: false,
  });

  beforeAll(async () => {
    await generateTestClip({ output: path.join(fixtures, 'hg.mp4'), seconds: 3.5, width: 1920, height: 1072 });
    await generateAlphaTestClip({ output: path.join(fixtures, 'hg-alpha.webm'), seconds: 3.5, width: 1280, height: 720 });
    const draft = (await authoring.getDraft(db, courseId))!;
    nodes = allLessons(draft.document).flatMap((l) => l.graph.nodes.filter((n) => n.type === 'scenario' || n.type === 'content' || n.type === 'choice').map((n) => ({ lessonId: l.id, nodeId: n.id })));
    cameras = draft.document.presentation.cameras;
  }, 60_000);

  it('narração paga uma vez; slide sem clipe; janela de 3; falha reenvia só o plano; retry não paga de novo; edição refaz só o plano editado', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const calls = installFakes({ failVideo: 'vid_2', uploadFailures: 1 });
    const target = nodes[1]!;

    // 1ª tentativa: narração paga, mas o upload ao HeyGen falha (500) -> reenfileirado
    const job = await mkJob(target);
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('queued');
    expect(calls.tts).toHaveLength(1);
    expect(calls.tts[0]).toBe(directionNarration(direction as SceneDirection));
    expect((j.input as any).voiceAssetId).toBeTruthy();
    expect((j.input as any).alignment).toBeTruthy();
    // retomada (sem a espera de backoff): reaproveita a narração paga
    await media.updateJob(db, job.id, { status: 'running' });
    await startDirectedJob(job.id);
    expect(calls.tts).toHaveLength(1);
    j = (await media.getJob(db, job.id))!;
    const input = j.input as any;
    expect(input.mergedShots).toEqual(['p2']);
    expect(input.units.map((u: any) => [u.shotIds, u.kind])).toEqual([[['p1', 'p2'], 'clip'], [['p3'], 'clip'], [['p4'], 'audio'], [['p5'], 'clip'], [['p6'], 'clip']]);
    // 4 itens de apresentador enviados; o slide (p4) ficou no nosso storage, sem clipe
    expect(calls.uploads).toBe(4);
    expect(input.shots.p4.segmentAssetId).toBeTruthy();
    expect(input.shots.p4.heygenVideoId).toBeUndefined();
    expect(j.status).toBe('running');
    expect(j.phase).toBe('rendering');
    expect(calls.videos).toHaveLength(3);
    expect(calls.videos.map((v) => v.avatar)).toEqual(['look_front', 'look_side', 'look_front']);
    expect(calls.videos[0]!.body).toMatchObject({ resolution: '1080p', aspect_ratio: '16:9', remove_background: true, audio_asset_id: 'aud_1', callback_id: job.id });

    // reconciliação 1: vid_2 (p3) falha -> reenviado com nova chave; p6 entra na janela
    await reconcileJob(job.id);
    expect(calls.videos.map((v) => v.key.split(':').slice(-2).join(':'))).toEqual(['p1:0', 'p3:0', 'p5:0', 'p3:1', 'p6:0']);
    expect((await media.getJob(db, job.id))!.status).toBe('running');

    // reconciliação 2: tudo pronto -> montagem -> anexo
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.lastError).toBeNull();
    expect(j.status).toBe('succeeded');
    expect(calls.tts).toHaveLength(1);
    expect(calls.videos).toHaveLength(5);
    const p = await ffprobe((await storageFile(j.outputAssetId!)).file);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    expect(p.durationSeconds).toBeGreaterThan(10);
    const nodeOf = async (t: { lessonId: string; nodeId: string }) => allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === t.lessonId)!.graph.nodes.find((n) => n.id === t.nodeId) as any;
    expect((await nodeOf(target)).media.assetId).toBe(j.outputAssetId);

    // mesmo bloco, um plano editado (p5): só ele é narrado, enviado e renderizado de novo
    const edited = structuredClone(direction);
    edited.shots[4]!.line = 'Primeiro, conte o que aconteceu, com fatos e sem culpados.';
    const job3 = await mkJob(target, edited);
    await processQueuedJob(job3.id);
    expect(calls.tts).toHaveLength(2);
    expect(calls.tts[1]).toBe(edited.shots[4]!.line);
    expect(calls.videos).toHaveLength(6);
    expect(calls.uploads).toBe(5);
    await reconcileJob(job3.id);
    const j3 = (await media.getJob(db, job3.id))!;
    expect(j3.status).toBe('succeeded');
    const s3 = (j3.input as any).shots;
    expect(['p1', 'p3', 'p4', 'p6'].every((id) => s3[id].reusedFrom === job.id)).toBe(true);
    expect(s3.p5.reusedFrom).toBeUndefined();
    expect((await nodeOf(target)).media.assetId).toBe(j3.outputAssetId);

    // outro bloco com a mesma cena: nenhuma cobrança nova
    const job2 = await mkJob(nodes[2]!);
    await processQueuedJob(job2.id);
    expect((await media.getJob(db, job2.id))!.status).toBe('succeeded');
    expect(calls.tts).toHaveLength(2);
    expect(calls.videos).toHaveLength(6);
  }, 240_000);

  // o clipe da cena em movimento não depende da fala (só do pedido, look e duração): a etiqueta no pedido evita reaproveitamento entre os testes
  const cineDir = (tag: string) => ({
    version: 1, intent: '', source: 'author',
    shots: [
      shot('m1', `Na quinta à tarde, você entra no escritório da agência ${tag} e procura a sala da conversa.`, { layout: 'cinematic', cameraId: 'lado', cinematic: { action: 'walk_in_and_sit', prompt: `a bright corridor that opens into a small meeting room with a desk and a laptop; soft afternoon light (${tag})` } }),
      shot('m2', `Antes de bater na porta, lembre do que você combinou consigo mesma ${tag}.`, { cameraId: 'frente', framing: 'close' }),
      shot('m3', `Respire fundo, olhe para a pessoa e comece pelo que importa ${tag}.`, { cameraId: 'lado' }),
    ],
  });

  it('continuidade: cena em movimento enviada primeiro; clipes esperam; fundo extraído e enviado UMA vez; clipes sobre esse fundo; retry e outro job sem nova cobrança', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const calls = installFakes({ failVideo: 'vid_2' });
    const dir = cineDir('principal');
    const job = await mkJob(nodes[0]!, dir);
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('running');
    expect(j.phase).toBe('rendering');
    expect(calls.tts).toHaveLength(1);
    expect(calls.uploads).toBe(2); // áudio dos planos do apresentador (m2, m3); a cena em movimento não leva áudio ao HeyGen
    // só a cena em movimento foi enviada: os clipes do apresentador esperam o fundo
    expect(calls.videos.map((v) => v.body.type)).toEqual(['cinematic_avatar']);
    expect(calls.images).toBe(0);
    let input = j.input as any;
    expect(input.scenePlateSource).toBe('m1');
    expect(input.scenePlate).toBeUndefined();
    const st = input.shots.m1;
    expect(calls.videos[0]!.body).toEqual({
      type: 'cinematic_avatar', title: expect.stringContaining('#m1'), avatar_id: ['look_side'], model: 'seedance_2', aspect_ratio: '16:9', resolution: '1080p',
      duration: st.cinematicSeconds, prompt: expect.stringMatching(/^MAIN ACTION \(the whole \d+ seconds\): the presenter WALKS INTO THE FRAME[\s\S]*The shot opens on the EMPTY (?:room|setting)[\s\S]*Setting: a bright corridor[\s\S]*She is the only person anywhere in the frame[\s\S]*she never speaks, her lips stay closed/),
    });
    // imagem: o maior entre o mínimo de "entra e se senta" (7 s) e a fala + 0,5 s
    expect(st.cinematicSeconds).toBe(cinematicClipSeconds('walk_in_and_sit', st.segmentSeconds));
    expect(st.cinematicSeconds).toBeGreaterThanOrEqual(7);
    expect(calls.videos[0]!.key).toBe(`${job.requestId}:m1:0`.replace(/[^A-Za-z0-9_:.-]/g, '-'));
    // as chaves dos clipes já descrevem o fundo de continuidade (determinísticas antes de o fundo existir)
    expect(input.shots.m2.key).toEqual(expect.any(String));
    expect(input.shots.m2.heygenVideoId).toBeUndefined();

    // reconciliação 1: cena em movimento pronta -> fundo extraído, enviado uma vez; m2 e m3 enviados sobre ele
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    input = j.input as any;
    expect(calls.images).toBe(1);
    expect(input.scenePlate).toEqual({ assetId: expect.any(String), heygenAssetId: 'img_1', fromKey: st.videoKey });
    const plate = await storageFile(input.scenePlate.assetId);
    expect(plate.asset).toMatchObject({ kind: 'image', mimeType: 'image/jpeg' });
    expect(await ffprobe(plate.file)).toMatchObject({ width: 1920, height: 1080 });
    const avatarCalls = () => calls.videos.filter((v) => v.body.type === 'avatar');
    expect(avatarCalls()).toHaveLength(2);
    for (const v of avatarCalls()) expect(v.body).toMatchObject({ background: { type: 'image', asset_id: 'img_1' }, remove_background: true });
    expect(avatarCalls().map((v) => v.avatar)).toEqual(['look_front', 'look_side']);
    expect(input.shots.m2.plateBackground).toBe(true);

    // reconciliação 2: o clipe de m2 (vid_2) falha -> reenviado com o MESMO fundo, sem novo upload
    await reconcileJob(job.id);
    expect(calls.images).toBe(1);
    expect(avatarCalls()).toHaveLength(3);
    expect(avatarCalls()[2]!.body).toMatchObject({ background: { type: 'image', asset_id: 'img_1' }, remove_background: true });
    expect(avatarCalls()[2]!.key).toBe(`${job.requestId}:m2:1`.replace(/[^A-Za-z0-9_:.-]/g, '-'));

    // reconciliação 3: tudo pronto -> montagem
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.lastError).toBeNull();
    expect(j.status).toBe('succeeded');
    const out = await ffprobe((await storageFile(j.outputAssetId!)).file);
    expect(out).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    const paid = { tts: calls.tts.length, uploads: calls.uploads, images: calls.images, videos: calls.videos.length };
    expect(paid).toEqual({ tts: 1, uploads: 2, images: 1, videos: 4 });

    // outro bloco, mesma direção (só o letreiro mudou): nenhuma narração, upload, fundo ou vídeo novo
    const edited = structuredClone(dir);
    (edited.shots[1] as any).caption = 'Lembrete';
    (edited.shots[2] as any).transitionIn = 'crossfade';
    const job2 = await mkJob(nodes[1]!, edited);
    await processQueuedJob(job2.id);
    const j2 = (await media.getJob(db, job2.id))!;
    expect(j2.status).toBe('succeeded');
    expect({ tts: calls.tts.length, uploads: calls.uploads, images: calls.images, videos: calls.videos.length }).toEqual(paid);
    const s1 = (j.input as any).shots;
    const s2 = (j2.input as any).shots;
    expect(s2.m1).toMatchObject({ reusedFrom: job.id, videoKey: s1.m1.videoKey, clipAssetId: s1.m1.clipAssetId, segmentAssetId: s1.m1.segmentAssetId });
    expect(s2.m2).toMatchObject({ reusedFrom: job.id, key: s1.m2.key, clipAssetId: s1.m2.clipAssetId, plateBackground: true });
    expect(s2.m3).toMatchObject({ reusedFrom: job.id, key: s1.m3.key });
    expect((j2.input as any).scenePlate).toBeUndefined(); // nada esperava o fundo: nem foi preciso
  }, 240_000);

  it('continuidade desligada: clipes enviados junto com a cena em movimento, com o fundo da apresentação', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const calls = installFakes({});
    const job = await mkJob(nodes[2] ?? nodes[0]!, cineDir('sem continuidade'), cameras, { slideAccent: '#1a66d1', matchCinematicSetting: false });
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    expect((j.input as any).scenePlateSource).toBeUndefined();
    // como antes: tudo na mesma janela (cena em movimento + os dois clipes)
    expect(calls.videos.map((v) => v.body.type)).toEqual(['cinematic_avatar', 'avatar', 'avatar']);
    for (const v of calls.videos.filter((x) => x.body.type === 'avatar')) expect(v.body).toMatchObject({ background: { type: 'color', value: '#F7F8FA' }, remove_background: true });
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(calls.images).toBe(0);
    expect(calls.videos).toHaveLength(3);
  }, 240_000);

  it('continuidade: HeyGen recusa o fundo (4xx) -> uma queda para o fundo da apresentação, sem novas tentativas', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const calls = installFakes({ rejectPlate: true });
    const job = await mkJob(nodes[3] ?? nodes[0]!, cineDir('fundo recusado'));
    await processQueuedJob(job.id);
    expect(calls.videos.map((v) => v.body.type)).toEqual(['cinematic_avatar']);
    await reconcileJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    const input = j.input as any;
    expect(j.status).toBe('running');
    expect(calls.images).toBe(1);
    expect(calls.rejected).toBe(1);
    expect(input.scenePlate).toMatchObject({ heygenAssetId: 'img_1', rejected: true, rejectedReason: expect.stringMatching(/400 invalid_parameter/) });
    const avatar = calls.videos.filter((v) => v.body.type === 'avatar');
    expect(avatar).toHaveLength(2);
    for (const v of avatar) expect(v.body.background).toEqual({ type: 'color', value: '#F7F8FA' });
    expect(avatar[0]!.key).toMatch(/:m2:0:bg$/);
    expect(input.shots.m2).toMatchObject({ plateFallback: true });
    expect(input.shots.m2.plateBackground).toBeUndefined();
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(calls.rejected).toBe(1);
    expect(calls.images).toBe(1);
  }, 240_000);

  it('cena em movimento com voz do HeyGen: falha com erro claro antes de qualquer cobrança', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    const calls = installFakes({});
    const dir = { version: 1, intent: '', source: 'author', shots: [shot('m1', 'Na quinta à tarde, você entra no escritório da agência com calma.', { layout: 'cinematic', cinematic: { prompt: 'Walks in.' } })] };
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: nodes[0]!.lessonId, nodeId: nodes[0]!.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `hg-${Math.random()}`,
      input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'heygen', voiceId: 'hv1', params: {}, direction: dir, cameras },
      createdBy: userId, simulated: false,
    });
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('failed');
    expect(j.lastError).toMatch(/exige a narração do ElevenLabs/);
    expect(calls.videos).toHaveLength(0);
  }, 60_000);

  it('câmera não pronta: falha com erro claro antes de qualquer cobrança', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const calls = installFakes({});
    const cams = [...(cameras as any[]), { id: 'gerando', name: 'Plano alto', lookId: '', nativeFraming: 'medium', angle: 'high', status: 'generating' }];
    const dir = { ...direction, shots: [shot('x1', 'Uma fala qualquer, longa o bastante para um plano.', { cameraId: 'gerando' })] };
    const job = await mkJob(nodes[3] ?? nodes[0]!, dir, cams);
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('failed');
    expect(j.lastError).toMatch(/câmera "Plano alto" ainda não está pronta/);
    expect(calls.tts).toHaveLength(0);
    expect(calls.videos).toHaveLength(0);
  }, 60_000);
  // ---------------- segurança de cobrança ----------------

  const presenterDir = (tag: string, n = 2) => ({
    version: 1, intent: '', source: 'author',
    shots: Array.from({ length: n }, (_, i) => shot(`q${i + 1}`, `Esta é a fala número ${i + 1} do teste ${tag}, longa o bastante para um plano inteiro.`, { cameraId: i % 2 ? 'lado' : 'frente' })),
  });
  const nodeAt = (i: number) => nodes[i % nodes.length]!;
  const realKeys = () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.ALLOW_PAID_PROVIDERS = '1'; // trava de gasto: os provedores aqui são falsos (fetch simulado), nada é cobrado
    process.env.ELEVENLABS_API_KEY = 'test-key';
  };

  it('fundo recusado + timeout no reenvio com o fundo da apresentação: a chave `:bg` é a mesma no passo seguinte (nenhum pedido duplicado)', async () => {
    realKeys();
    const calls = installFakes({ rejectPlate: true, timeoutBgOnce: true });
    const job = await mkJob(nodeAt(4), cineDir('chave estavel'));
    await processQueuedJob(job.id);
    await reconcileJob(job.id); // cena pronta -> fundo enviado -> recusado -> reenvio :bg (timeout)
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('running');
    expect((j.input as any).shots.m2).toMatchObject({ plateFallback: true });
    expect((j.input as any).shots.m3).toMatchObject({ plateFallback: true });
    await reconcileJob(job.id); // próximo passo: reenvia com a MESMA chave gravada
    const m2 = calls.attempts.filter((k) => /:m2:/.test(k));
    expect(m2.filter((k) => k.endsWith(':bg'))).toEqual([`${job.requestId}:m2:0:bg`.replace(/[^A-Za-z0-9_:.-]/g, '-'), `${job.requestId}:m2:0:bg`.replace(/[^A-Za-z0-9_:.-]/g, '-')]);
    expect(calls.videos.filter((v) => v.body.type === 'avatar').map((v) => v.key.split(':').slice(-3).join(':'))).toEqual(['m2:0:bg', 'm3:0:bg']);
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    // nenhum clipe refeito no fundo da apresentação ficou marcado como "sobre o fundo da cena"
    expect((j.input as any).shots.m2.plateBackground).toBeUndefined();
    expect((j.input as any).shots.m3.plateBackground).toBeUndefined();
  }, 240_000);

  it('worker em simulação recebe job REAL: falha com erro claro, nada é chamado nem simulado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const directed = await mkJob(nodeAt(5), presenterDir('sim real'));
    await processQueuedJob(directed.id);
    const single = await media.createJob(db, {
      workspaceId, courseId, lessonId: nodeAt(6).lessonId, nodeId: nodeAt(6).nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `single-${Math.random()}`,
      input: { script: 'Uma fala qualquer.', avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: {} }, createdBy: userId, simulated: false,
    });
    await processQueuedJob(single.id);
    for (const id of [directed.id, single.id]) {
      const j = (await media.getJob(db, id))!;
      expect(j.status).toBe('failed');
      expect(j.lastError).toBe(SIM_WORKER_REAL_JOB);
      expect(j.outputAssetId).toBeNull();
      expect((j.input as any).voiceAssetId).toBeUndefined();
    }
    expect(spy).not.toHaveBeenCalled();
  }, 60_000);

  it('job encerrado com clipes já enviados: colheita baixa os clipes; um novo envio da mesma direção reaproveita sem NENHUM vídeo novo', async () => {
    realKeys();
    const calls = installFakes({});
    const dir = presenterDir('colheita');
    const job = await mkJob(nodeAt(7), dir);
    await processQueuedJob(job.id);
    expect(calls.videos).toHaveLength(2);
    // o job falha por outro motivo (ex.: montagem) com os 2 clipes pagos ainda no HeyGen
    await media.updateJob(db, job.id, { status: 'failed', phase: 'failed', lastError: 'falha simulada', finishedAt: new Date() });
    expect(await reconcileJob(job.id)).toBeUndefined(); // reconciliação normal ignora jobs encerrados
    expect(await harvestTerminalDirectedJobs()).toBeGreaterThanOrEqual(2);
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('failed');
    expect(Object.values((j.input as any).shots).every((s: any) => s.clipAssetId && s.key)).toBe(true);
    expect((j.input as any).leaseUntil).toBeUndefined();
    // colheita idempotente: nada mais a baixar
    expect(await harvestDirectedJob(job.id)).toBe(0);
    const before = { tts: calls.tts.length, videos: calls.videos.length, uploads: calls.uploads };
    const again = await mkJob(nodeAt(7), dir);
    await processQueuedJob(again.id);
    j = (await media.getJob(db, again.id))!;
    expect(j.status).toBe('succeeded');
    expect({ tts: calls.tts.length, videos: calls.videos.length, uploads: calls.uploads }).toEqual(before);
    expect(Object.values((j.input as any).shots).every((s: any) => s.reusedFrom === job.id)).toBe(true);
  }, 240_000);

  it('cancelar job dirigido em execução: nenhum plano novo é enviado depois; os já enviados são colhidos', async () => {
    realKeys();
    let jobId = '';
    const calls = installFakes({
      // o autor cancela logo depois do 1º envio, no meio da janela
      onVideoPost: async (n) => {
        if (n === 1) {
          const r = await media.cancelJob(db, (await media.getJob(db, jobId))!);
          expect(r.message).toBe(CANCEL_DIRECTED_MESSAGE);
        }
      },
    });
    const job = await mkJob(nodeAt(8), presenterDir('cancelado', 5));
    jobId = job.id;
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('canceled');
    expect(calls.videos).toHaveLength(1);
    await reconcileJob(job.id);
    await startDirectedJob(job.id);
    expect(calls.videos).toHaveLength(1);
    await harvestTerminalDirectedJobs();
    j = (await media.getJob(db, job.id))!;
    const shots = Object.values((j.input as any).shots) as any[];
    expect(shots.filter((s) => s.clipAssetId)).toHaveLength(1);
    expect(shots.filter((s) => s.heygenVideoId)).toHaveLength(1);
    expect(j.status).toBe('canceled');
    expect(calls.videos).toHaveLength(1);
    // plano único já enviado ao HeyGen não pode ser cancelado (já foi cobrado)
    const single = await media.createJob(db, {
      workspaceId, courseId, lessonId: nodeAt(9).lessonId, nodeId: nodeAt(9).nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `single-${Math.random()}`,
      input: { script: 'x', avatarId: 'a', voiceProvider: 'heygen', voiceId: 'v', params: {} }, createdBy: userId, simulated: false,
    });
    const running = (await media.updateJob(db, single.id, { status: 'running', externalId: 'vid_x' }))!;
    await expect(media.cancelJob(db, running)).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/já foi cobrado/) });
    await media.updateJob(db, single.id, { status: 'failed' });
  }, 240_000);

  it('ElevenLabs responde 200 com corpo ilegível: falha definitiva (sem nova síntese), corpo bruto guardado', async () => {
    realKeys();
    const calls = installFakes({ ttsBody: '{"audio_base64": 12' });
    const job = await mkJob(nodeAt(10), presenterDir('corpo ilegivel'));
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('failed');
    expect(j.lastError).toMatch(/ElevenLabs: resposta 200 não é JSON válido/);
    expect(calls.tts).toHaveLength(1);
    expect(calls.videos).toHaveLength(0);
    const raw = (j.input as any).elevenLabsRaw;
    expect(raw).toMatchObject({ assetId: expect.any(String), reqKey: expect.any(String) });
    expect((await storageFile(raw.assetId)).asset).toMatchObject({ kind: 'document', mimeType: 'application/json' });
    // uma retomada manual relê o corpo guardado: nenhuma síntese nova
    await media.updateJob(db, job.id, { status: 'running' });
    await startDirectedJob(job.id);
    expect(calls.tts).toHaveLength(1);
    expect((await media.getJob(db, job.id))!.status).toBe('failed');
  }, 60_000);

  it('plano único com ElevenLabs: síntese com marcação de tempo paga uma vez, alinhamento gravado antes do upload, legendas anexadas', async () => {
    realKeys();
    const calls = installFakes({});
    const t = nodeAt(11);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `single-el-${Math.random()}`,
      input: { script: 'Olá! Esta é uma cena de plano único. Ela também precisa de legendas.', avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { aspectRatio: '16:9', backgroundColor: '#ffffff' } }, createdBy: userId, simulated: false,
    });
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    expect(calls.tts).toHaveLength(1);
    expect((j.input as any)).toMatchObject({ voiceAssetId: expect.any(String), heygenAudioAssetId: 'aud_1', alignment: { characters: expect.any(Array) } });
    expect(j.externalId).toBe('vid_1');
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    const cap = (j.input as any).captions;
    expect(cap).toEqual({ assetId: expect.any(String), lang: 'pt-BR', format: 'vtt' });
    expect(readFileSync((await storageFile(cap.assetId)).file, 'utf8')).toMatch(/^WEBVTT\n\n1\n00:00:00\.\d{3} --> /);
    const node = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === t.lessonId)!.graph.nodes.find((n) => n.id === t.nodeId) as any;
    expect(node.media).toMatchObject({ assetId: j.outputAssetId, captions: { assetId: cap.assetId, format: 'vtt' } });
    expect(calls.tts).toHaveLength(1);
  }, 60_000);

  it('plano único com voz do HeyGen: legendas aproximadas (approx)', async () => {
    realKeys();
    installFakes({});
    const t = nodeAt(12);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `single-hg-${Math.random()}`,
      input: { script: 'Fala gerada pela voz do HeyGen. Sem alinhamento.', avatarId: 'look_front', voiceProvider: 'heygen', voiceId: 'hv1', params: {} }, createdBy: userId, simulated: false,
    });
    await processQueuedJob(job.id);
    await reconcileJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect((j.input as any).captions).toMatchObject({ approx: true, format: 'vtt' });
  }, 60_000);

  it('plano único em execução sem video_id: não é assumido antes de 10 min sem atualização; depois, reenviado com a MESMA chave (sem dormir no laço)', async () => {
    realKeys();
    const calls = installFakes({});
    const t = nodeAt(13);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `single-stale-${Math.random()}`,
      input: { script: 'Fala do apresentador.', avatarId: 'look_front', voiceProvider: 'heygen', voiceId: 'hv1', params: {} }, createdBy: userId, simulated: false,
    });
    await media.updateJob(db, job.id, { status: 'running', attempts: 1, startedAt: new Date() });
    const t0 = Date.now();
    await reconcileJob(job.id);
    expect((await media.getJob(db, job.id))!.status).toBe('running'); // outro processo pode estar no meio do início
    expect(calls.videos).toHaveLength(0);
    await db.update(schema.mediaJobs).set({ updatedAt: new Date(Date.now() - 11 * 60 * 1000) }).where(eq(schema.mediaJobs.id, job.id));
    await reconcileJob(job.id);
    expect(Date.now() - t0).toBeLessThan(5000); // nenhuma espera de backoff dentro do laço
    let j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('queued'); // assumido; a nova tentativa espera o backoff vencer
    expect(calls.videos).toHaveLength(0);
    await db.update(schema.mediaJobs).set({ updatedAt: new Date(Date.now() - 2 * 60 * 1000) }).where(eq(schema.mediaJobs.id, job.id));
    await processQueuedJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.externalId).toBe(`vid_${calls.videos.length}`);
    expect(calls.videos.map((v) => v.key)).toEqual([job.requestId.replace(/[^A-Za-z0-9_:.-]/g, '-')]);
    await media.updateJob(db, job.id, { status: 'failed' });
  }, 60_000);

  it('isolamento entre workspaces: nada é reaproveitado de outro workspace nem de outro modo', async () => {
    const other = `wsp_outro_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(schema.workspaces).values({ id: other, slug: other, name: 'Outro' });
    // vídeo pronto (hash X) no workspace do seed
    const ok = await media.createJob(db, {
      workspaceId, courseId, lessonId: nodeAt(14).lessonId, nodeId: nodeAt(14).nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: 'hash-isolamento',
      input: { script: 'x' }, createdBy: userId, simulated: false,
    });
    await media.updateJob(db, ok.id, { status: 'succeeded', finishedAt: new Date() });
    expect((await media.findSucceededJobByHash(db, { workspaceId, sceneHash: 'hash-isolamento', provider: 'heygen', simulated: false }))?.id).toBe(ok.id);
    expect(await media.findSucceededJobByHash(db, { workspaceId: other, sceneHash: 'hash-isolamento', provider: 'heygen', simulated: false })).toBeNull();
    expect(await media.findSucceededJobByHash(db, { workspaceId, sceneHash: 'hash-isolamento', provider: 'heygen', simulated: true })).toBeNull();

    // vídeo dirigido (simulação): a mesma direção no outro workspace refaz tudo (nenhum item, narração ou fundo de lá)
    process.env.MEDIA_SIMULATION = '1';
    const dir = presenterDir('isolamento');
    const mk = (ws: string, t: { lessonId: string; nodeId: string }) => media.createJob(db, {
      workspaceId: ws, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `sim-iso-${Math.random()}`,
      input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { backgroundColor: '#F7F8FA' }, direction: dir, cameras },
      createdBy: userId, simulated: true,
    });
    const a = await mk(workspaceId, nodeAt(15));
    await processQueuedJob(a.id);
    const ja = (await media.getJob(db, a.id))!;
    expect(ja.status).toBe('succeeded');
    const b = await mk(other, nodeAt(16));
    await processQueuedJob(b.id);
    const jb = (await media.getJob(db, b.id))!;
    expect(jb.status).toBe('succeeded');
    expect(Object.values((jb.input as any).shots).some((s: any) => s.reusedFrom)).toBe(false);
    expect((jb.input as any).voiceAssetId).not.toBe((ja.input as any).voiceAssetId);
    for (const s of Object.values((jb.input as any).shots) as any[]) expect((await media.getAsset(db, s.clipAssetId))!.workspaceId).toBe(other);
    // controle: no MESMO workspace, tudo é reaproveitado
    const c = await mk(workspaceId, nodeAt(17));
    await processQueuedJob(c.id);
    expect(Object.values(((await media.getJob(db, c.id))!.input as any).shots).every((s: any) => s.reusedFrom === a.id)).toBe(true);
  }, 240_000);

  // ---------------- apresentadora posicionada (direita/esquerda) ----------------

  const PLACED = { aspectRatio: '16:9', backgroundColor: '#203040', engine: 'avatar_iv', expressiveness: 'high', removeBackground: true, presenterPlacement: 'right', presenterScale: 0.92 };
  const singleJob = (t: { lessonId: string; nodeId: string }, script: string, params: Record<string, unknown>, simulated = false) => media.createJob(db, {
    workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `placed-${Math.random()}`,
    input: { script, avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params }, createdBy: userId, simulated,
  });

  it('plano único à direita: pedido transparente (webm, sem fundo), montagem sobre o fundo; esquerda reaproveita o vídeo pago; centro reaproveita só a narração', async () => {
    realKeys();
    const calls = installFakes({});
    const script = 'Olá! Hoje eu fico à direita do quadro, com o fundo da apresentação atrás de mim.';
    const job = await singleJob(nodeAt(18), script, PLACED);
    await processQueuedJob(job.id);
    expect(calls.tts).toHaveLength(1);
    expect(calls.images).toBe(0); // o fundo nunca vai ao HeyGen
    const body = calls.videos[0]!.body;
    expect(body.output_format).toBe('webm');
    expect(body).not.toHaveProperty('background');
    expect(body).not.toHaveProperty('remove_background');
    await reconcileJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    const ji = j.input as any;
    expect((await media.getAsset(db, ji.rawVideoAssetId))!.mimeType).toBe('video/webm');
    expect(ji.rawVideoKind).toBe('alpha');
    const out = await ffprobe((await storageFile(j.outputAssetId!)).file);
    expect(out).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    expect(Math.abs(out.durationSeconds - 3.5)).toBeLessThan(0.3);
    expect(ji.captions).toMatchObject({ format: 'vtt' });
    const node = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === nodeAt(18).lessonId)!.graph.nodes.find((n) => n.id === nodeAt(18).nodeId) as any;
    expect(node.media).toMatchObject({ assetId: j.outputAssetId });

    // esquerda, mesma fala: o vídeo transparente pago é reaproveitado (nenhuma síntese, nenhum vídeo novo)
    const left = await singleJob(nodeAt(19), script, { ...PLACED, presenterPlacement: 'left', presenterScale: 0.8 });
    await processQueuedJob(left.id);
    const jl = (await media.getJob(db, left.id))!;
    expect(jl.status).toBe('succeeded');
    expect((jl.input as any).reusedRawFrom).toBe(job.id);
    expect(jl.outputAssetId).not.toBe(j.outputAssetId);
    expect(calls.videos).toHaveLength(1);
    expect(calls.tts).toHaveLength(1);

    // centro (sem posição): mesma fala/voz -> narração reaproveitada (sem ElevenLabs); o HeyGen faz um vídeo novo com fundo (mp4)
    const { presenterPlacement: _p, presenterScale: _s, ...center } = PLACED;
    const c = await singleJob(nodeAt(20), script, center);
    await processQueuedJob(c.id);
    expect(calls.tts).toHaveLength(1);
    expect(calls.videos).toHaveLength(2);
    expect(calls.videos[1]!.body).toMatchObject({ output_format: 'mp4', background: { type: 'color', value: '#203040' }, remove_background: true });
    await reconcileJob(c.id);
    expect((await media.getJob(db, c.id))!.status).toBe('succeeded');
  }, 120_000);

  it('plano único: HeyGen recusa webm (avatar sem matting) -> plano B com fundo verde e chave própria, recortado na montagem', async () => {
    realKeys();
    const calls = installFakes({ rejectWebm: true });
    const job = await singleJob(nodeAt(21), 'Fala do plano B, com fundo verde para recorte.', PLACED);
    await processQueuedJob(job.id);
    expect(calls.rejected).toBe(1);
    expect(calls.videos).toHaveLength(1);
    expect(calls.videos[0]!.body).toMatchObject({ output_format: 'mp4', background: { type: 'color', value: '#00FF00' }, remove_background: true });
    expect(calls.videos[0]!.key.endsWith(':chroma')).toBe(true);
    expect((await media.getJob(db, job.id))!.input).toMatchObject({ presenterKind: 'chroma' });
    await reconcileJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect((j.input as any).rawVideoKind).toBe('chroma');
  }, 120_000);

  it('simulação, plano único à direita: substituto montado ao lado sobre o fundo; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na simulação: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const job = await singleJob(nodeAt(22), 'Prévia da apresentadora à direita, sem custo.', PLACED, true);
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(j.lastError).toMatch(/SIMULADO/);
    expect(spy).not.toHaveBeenCalled();
    expect((j.input as any).rawVideoKind).toBe('opaque');
    expect(await ffprobe((await storageFile(j.outputAssetId!)).file)).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
  }, 120_000);

  it('simulação, plano único centralizado: substituto (cartão de marca, 6–10 s) ANEXADO à cena com legendas e generatedFrom.simulated; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na simulação: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const t = nodeAt(23);
    const job = await singleJob(t, 'Hoje a gente vai falar sobre o dia da entrevista. Então vamos por partes, começando por você.', { aspectRatio: '16:9', backgroundColor: '#F7F8FA' }, true);
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(j.lastError).toMatch(/SIMULADO.*prévia substituta/);
    expect(j.outputAssetId).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    const probe = await ffprobe((await storageFile(j.outputAssetId!)).file);
    expect(probe).toMatchObject({ width: 1920, height: 1080, hasAudio: true, hasVideo: true });
    expect(probe.durationSeconds).toBeGreaterThanOrEqual(5.5);
    expect(probe.durationSeconds).toBeLessThanOrEqual(10.5);
    const node = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === t.lessonId)!.graph.nodes.find((n) => n.id === t.nodeId) as any;
    expect(node.media).toMatchObject({ assetId: j.outputAssetId, kind: 'video', generatedFrom: { jobId: job.id, simulated: true }, captions: { format: 'vtt', approx: true } });
  }, 120_000);

  it('remontagem sem custo: worker em demonstração monta o vídeo transparente já pago sobre o novo cenário (balcão) sem chamar provedor; falta de asset falha antes de reivindicar', async () => {
    // 1) vídeo pago de verdade (chaves reais + provedores falsos), à direita
    realKeys();
    const calls = installFakes({});
    const script = 'Esta fala ganha um cenário novo sem gerar de novo.';
    const src = await singleJob(nodeAt(28), script, PLACED);
    await processQueuedJob(src.id);
    await reconcileJob(src.id);
    const paid = (await media.getJob(db, src.id))!;
    expect(paid.status).toBe('succeeded');
    const pi = paid.input as any;
    expect(pi.rawVideoAssetId).toBeTruthy();
    expect(pi.alphaKey).toBeTruthy();
    expect(calls.videos).toHaveLength(1);

    // 2) cenário com balcão (imagem do workspace): metade de baixo azul
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-recompose-'));
    const desk = path.join(dir, 'desk.png');
    await runFfmpeg(['-f', 'lavfi', '-i', 'color=c=0xC81E1E:s=1920x1080', '-f', 'lavfi', '-i', 'color=c=0x1E3CC8:s=1920x432', '-filter_complex', '[0:v][1:v]overlay=x=0:y=648[v]', '-map', '[v]', '-frames:v', '1', desk]);
    const bg = await storeGeneratedAsset({ workspaceId, kind: 'image', mime: 'image/png', bytes: new Uint8Array(readFileSync(desk)), createdBy: userId });

    // 3) worker em DEMONSTRAÇÃO: um job real comum falharia; a remontagem passa (nenhum provedor)
    delete process.env.HEYGEN_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na remontagem: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const target = nodeAt(29);
    const recompose = await media.createJob(db, {
      workspaceId, courseId, lessonId: target.lessonId, nodeId: target.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `recompose-${Math.random()}`,
      input: {
        script, avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1',
        params: { ...PLACED, presenterPlacement: 'left', presenterX: 0.375, presenterBottom: 0.85, foregroundFrom: 0.85, backgroundAssetId: bg.id, presenterGrade: 'warm' },
        recomposeOf: paid.id, reusedRawFrom: paid.id, rawVideoAssetId: pi.rawVideoAssetId, rawVideoKind: pi.rawVideoKind, alphaKey: pi.alphaKey, ...(pi.captions ? { captions: pi.captions } : {}),
      },
      createdBy: userId, simulated: false, costEstimatedUsd: 0,
    });
    expect(isRecomposeJob(recompose)).toBe(true);
    await processQueuedJob(recompose.id);
    const done = (await media.getJob(db, recompose.id))!;
    expect(done.status).toBe('succeeded');
    expect(done.simulated).toBe(0);
    expect(done.costActualUsd).toBe(0);
    expect(done.lastError).toMatch(/sem custo/);
    expect(done.outputAssetId).toBeTruthy();
    expect(done.outputAssetId).not.toBe(paid.outputAssetId);
    expect(spy).not.toHaveBeenCalled();
    expect(calls.videos).toHaveLength(1);
    expect(calls.tts).toHaveLength(1);
    const out = await ffprobe((await storageFile(done.outputAssetId!)).file);
    expect(out).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    // legendas copiadas do job de origem; mídia anexada ao nó, atualizada, como vídeo real
    expect((done.input as any).captions?.assetId).toBe(pi.captions?.assetId);
    const node = allLessons((await authoring.getDraft(db, courseId))!.document).find((l) => l.id === target.lessonId)!.graph.nodes.find((n) => n.id === target.nodeId) as any;
    expect(node.media).toMatchObject({ assetId: done.outputAssetId, stale: false, generatedFrom: { jobId: done.id, simulated: false } });

    // 4) asset ausente: recusa ANTES de reivindicar (fica failed direto, sem tentativa), nada chamado
    const broken = await media.createJob(db, {
      workspaceId, courseId, lessonId: nodeAt(30).lessonId, nodeId: nodeAt(30).nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `recompose-x-${Math.random()}`,
      input: { script, avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { ...PLACED, backgroundAssetId: bg.id }, recomposeOf: paid.id, reusedRawFrom: paid.id, rawVideoAssetId: 'ast_nao_existe', rawVideoKind: 'alpha', alphaKey: pi.alphaKey },
      createdBy: userId, simulated: false, costEstimatedUsd: 0,
    });
    expect(await recomposeMissingAssets(broken)).toMatch(/não encontrado/);
    await processQueuedJob(broken.id);
    const b = (await media.getJob(db, broken.id))!;
    expect(b.status).toBe('failed');
    expect(b.attempts).toBe(0);
    expect(b.lastError).toMatch(/remontagem sem custo impossível/);
    expect(spy).not.toHaveBeenCalled();
  }, 180_000);

  const placedDirected = (t: { lessonId: string; nodeId: string }, dir: unknown, params: Record<string, unknown>, simulated: boolean) => media.createJob(db, {
    workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `placed-dir-${Math.random()}`,
    input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params, direction: dir, cameras, directionStyle: { slideAccent: '#1a66d1' } },
    createdBy: userId, simulated,
  });

  it('dirigido à direita: clipes transparentes (sem fundo), montados sobre o fundo e seguidos pelo enquadramento; esquerda reaproveita os vídeos pagos', async () => {
    realKeys();
    const calls = installFakes({});
    const dir = presenterDir('direita dirigida');
    const job = await placedDirected(nodeAt(23), dir, PLACED, false);
    await processQueuedJob(job.id);
    expect(calls.tts).toHaveLength(1);
    expect(calls.images).toBe(0);
    expect(calls.videos).toHaveLength(2);
    for (const v of calls.videos) {
      expect(v.body.output_format).toBe('webm');
      expect(v.body).not.toHaveProperty('background');
    }
    await reconcileJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    const shots = (j.input as any).shots;
    for (const id of ['q1', 'q2']) {
      expect(shots[id]).toMatchObject({ placementRequest: 'alpha', alphaKind: 'alpha', alphaClipAssetId: expect.any(String), clipAssetId: expect.any(String), alphaKey: expect.any(String), key: expect.any(String) });
      expect(shots[id].focusX).toBeGreaterThan(0.6);
      expect((await media.getAsset(db, shots[id].alphaClipAssetId))!.mimeType).toBe('video/webm');
    }
    expect(await ffprobe((await storageFile(j.outputAssetId!)).file)).toMatchObject({ width: 1920, height: 1080, hasAudio: true });

    // mesma direção à esquerda: nenhuma síntese nem vídeo novo — só a montagem é refeita
    const left = await placedDirected(nodeAt(24), dir, { ...PLACED, presenterPlacement: 'left' }, false);
    await processQueuedJob(left.id);
    const jl = (await media.getJob(db, left.id))!;
    expect(jl.status).toBe('succeeded');
    expect(calls.videos).toHaveLength(2);
    expect(calls.tts).toHaveLength(1);
    const ls = (jl.input as any).shots;
    for (const id of ['q1', 'q2']) {
      expect(ls[id].reusedAlphaFrom).toBe(job.id);
      expect(ls[id].key).not.toBe(shots[id].key);
      expect(ls[id].focusX).toBeLessThan(0.4);
    }
  }, 180_000);

  it('dirigido: mudar do centro para a direita reaproveita a narração paga e o slide; só os clipes do apresentador são refeitos (transparentes)', async () => {
    realKeys();
    const calls = installFakes({});
    const dir = {
      version: 1, intent: '', source: 'author',
      shots: [
        shot('r1', 'Primeiro, a apresentadora abre o assunto com calma e clareza.', { cameraId: 'frente' }),
        shot('r2', 'Depois, um slide resume os três pontos principais da conversa.', { layout: 'slide', slide: { title: 'Três pontos', bullets: ['Um', 'Dois', 'Três'], style: 'clean' } }),
        shot('r3', 'Por fim, ela fecha com uma pergunta para você pensar sozinho.', { cameraId: 'lado' }),
      ],
    };
    const { presenterPlacement: _p, presenterScale: _s, ...center } = PLACED;
    const c = await placedDirected(nodeAt(26), dir, center, false);
    await processQueuedJob(c.id);
    await reconcileJob(c.id);
    expect((await media.getJob(db, c.id))!.status).toBe('succeeded');
    expect(calls.tts).toHaveLength(1);
    expect(calls.videos).toHaveLength(2);
    const r = await placedDirected(nodeAt(27), dir, PLACED, false);
    await processQueuedJob(r.id);
    expect(calls.tts).toHaveLength(1); // nenhuma síntese nova
    expect(calls.videos).toHaveLength(4); // só os 2 clipes do apresentador, agora transparentes
    expect(calls.videos.slice(2).every((v) => v.body.output_format === 'webm')).toBe(true);
    await reconcileJob(r.id);
    const jr = (await media.getJob(db, r.id))!;
    expect(jr.status).toBe('succeeded');
    expect((jr.input as any).shots.r2.reusedFrom).toBe(c.id);
    expect((jr.input as any).voiceAssetId).toBe(((await media.getJob(db, c.id))!.input as any).voiceAssetId);
  }, 180_000);

  // ---------------- posição por câmera (tela cheia para visuais sentados) ----------------

  const seatedCams = (placement?: 'full_frame' | 'inherit') => [
    { id: 'frente', name: 'Frente', lookId: 'look_front', nativeFraming: 'medium', angle: 'front', status: 'ready' },
    { id: 'sentada', name: 'Sentada à mesa', lookId: 'look_seated', nativeFraming: 'medium', angle: 'front', status: 'ready', ...(placement ? { placement } : {}) },
  ];
  const seatedDir = (tag: string) => ({
    version: 1, intent: '', source: 'author',
    shots: [
      shot('e1', `Em pé, à direita do quadro, ela abre a conversa do teste ${tag} com calma e clareza.`, { cameraId: 'frente' }),
      shot('e2', `Agora sentada à mesa, ela continua o assunto do teste ${tag} sem cortar a cadeira.`, { cameraId: 'sentada' }),
    ],
  });
  const camJob = (t: { lessonId: string; nodeId: string }, dir: unknown, params: Record<string, unknown>, cams: unknown, simulated: boolean, style: Record<string, unknown> = { slideAccent: '#1a66d1' }) => media.createJob(db, {
    workspaceId, courseId, lessonId: t.lessonId, nodeId: t.nodeId, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: `cam-${Math.random()}`,
    input: { script: directionNarration(dir as SceneDirection), avatarId: 'look_front', voiceProvider: 'elevenlabs', voiceId: 'v1', params, direction: dir, cameras: cams, directionStyle: style },
    createdBy: userId, simulated,
  });

  it('posição por câmera: curso à direita, câmera sentada em tela cheia -> MP4 sem fundo nem recorte (chave `:ff`); mudar a câmera para "igual ao curso" nunca reaproveita o clipe de tela cheia', async () => {
    realKeys();
    const calls = installFakes({});
    const dir = seatedDir('tela cheia');
    const job = await camJob(nodeAt(28), dir, PLACED, seatedCams('full_frame'), false);
    await processQueuedJob(job.id);
    expect(calls.tts).toHaveLength(1);
    expect(calls.images).toBe(0);
    const byLook = (look: string) => calls.videos.filter((v) => v.avatar === look);
    expect(byLook('look_front')).toHaveLength(1);
    expect(byLook('look_front')[0]!.body.output_format).toBe('webm');
    const seated = byLook('look_seated');
    expect(seated).toHaveLength(1);
    expect(seated[0]!.body.output_format).toBe('mp4');
    expect(seated[0]!.body).not.toHaveProperty('background');
    expect(seated[0]!.body).not.toHaveProperty('remove_background');
    expect(seated[0]!.key.endsWith(':e2:0:ff')).toBe(true);
    await reconcileJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    const sh = (j.input as any).shots;
    expect(sh.e1).toMatchObject({ placementRequest: 'alpha', alphaClipAssetId: expect.any(String), clipAssetId: expect.any(String), alphaKey: expect.any(String) });
    expect(sh.e1.focusX).toBeGreaterThan(0.6);
    expect(sh.e2).toMatchObject({ clipAssetId: expect.any(String), key: expect.any(String) });
    expect(sh.e2.alphaClipAssetId).toBeUndefined();
    expect(sh.e2.alphaKey).toBeUndefined();
    expect(sh.e2.placementRequest).toBeUndefined();
    expect(sh.e2.focusX).toBeUndefined();
    expect((await media.getAsset(db, sh.e2.clipAssetId))!.mimeType).toBe('video/mp4');

    // mesma direção, câmera sentada "igual ao curso" (direita): a câmera em pé é reaproveitada (mesma chave);
    // a sentada é refeita como vídeo transparente — o clipe de tela cheia nunca é reaproveitado no outro modo
    const job2 = await camJob(nodeAt(29), dir, PLACED, seatedCams('inherit'), false);
    await processQueuedJob(job2.id);
    const s2 = ((await media.getJob(db, job2.id))!.input as any).shots;
    expect(s2.e1).toMatchObject({ reusedFrom: job.id, key: sh.e1.key });
    expect(s2.e2.key).not.toBe(sh.e2.key);
    expect(s2.e2.reusedFrom).toBeUndefined();
    expect(byLook('look_seated')).toHaveLength(2);
    expect(byLook('look_seated')[1]!.body.output_format).toBe('webm');
    expect(calls.tts).toHaveLength(1);

    // câmera "igual ao curso" (sem o campo) gera exatamente as chaves de antes da posição por câmera
    const job3 = await camJob(nodeAt(30), dir, PLACED, seatedCams(), false);
    await processQueuedJob(job3.id);
    const s3 = ((await media.getJob(db, job3.id))!.input as any).shots;
    expect(s3.e1.key).toBe(sh.e1.key);
    expect(s3.e2.alphaKey).toBe(s2.e2.alphaKey);
  }, 240_000);

  it('posição por câmera + continuidade: o clipe em tela cheia não espera nem usa o fundo da cena em movimento', async () => {
    realKeys();
    const calls = installFakes({});
    const tag = 'mesa e corredor';
    const dir = {
      version: 1, intent: '', source: 'author',
      shots: [
        shot('k1', `Na quinta à tarde, você entra no escritório ${tag} e procura a sala da conversa.`, { layout: 'cinematic', cameraId: 'frente', cinematic: { action: 'walk_in_and_sit', prompt: `a bright corridor that opens into a small meeting room (${tag})` } }),
        shot('k2', `Antes de bater na porta, lembre do que você combinou consigo mesma ${tag}.`, { cameraId: 'frente', framing: 'close' }),
        shot('k3', `Sentada à mesa, ela comenta o primeiro minuto da conversa ${tag} com calma.`, { cameraId: 'sentada' }),
      ],
    };
    const { presenterPlacement: _p, presenterScale: _s, ...center } = PLACED;
    const job = await camJob(nodeAt(31), dir, center, seatedCams('full_frame'), false);
    await processQueuedJob(job.id);
    let j = (await media.getJob(db, job.id))!;
    let input = j.input as any;
    expect(input.scenePlateSource).toBe('k1');
    // a cena em movimento e o clipe em tela cheia saem juntos; o clipe ao centro espera o fundo de continuidade
    expect(calls.videos.map((v) => v.body.type)).toEqual(['cinematic_avatar', 'avatar']);
    expect(calls.videos[1]!.avatar).toBe('look_seated');
    expect(calls.videos[1]!.body).not.toHaveProperty('background');
    expect(input.shots.k2.heygenVideoId).toBeUndefined();
    await reconcileJob(job.id);
    input = (await media.getJob(db, job.id))!.input as any;
    expect(calls.images).toBe(1);
    const front = calls.videos.filter((v) => v.avatar === 'look_front');
    expect(front).toHaveLength(1);
    expect(front[0]!.body).toMatchObject({ background: { type: 'image', asset_id: 'img_1' }, remove_background: true });
    await reconcileJob(job.id);
    j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    input = j.input as any;
    expect(input.shots.k2.plateBackground).toBe(true);
    expect(input.shots.k3.plateBackground).toBeUndefined();
    expect(input.shots.k3.plateFallback).toBeUndefined();
  }, 240_000);

  it('simulação: curso à direita + câmera sentada em tela cheia -> substituto opaco sem alfa nem recorte; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na simulação: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const job = await camJob(nodeAt(32), seatedDir('simulada'), PLACED, seatedCams('full_frame'), true);
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(spy).not.toHaveBeenCalled();
    const sh = (j.input as any).shots;
    expect(sh.e1).toMatchObject({ alphaKind: 'opaque', alphaClipAssetId: expect.any(String), clipAssetId: expect.any(String) });
    expect(sh.e1.focusX).toBeGreaterThan(0.6);
    expect(sh.e2).toMatchObject({ clipAssetId: expect.any(String) });
    expect(sh.e2.alphaClipAssetId).toBeUndefined();
    expect(sh.e2.alphaKind).toBeUndefined();
    expect(sh.e2.focusX).toBeUndefined();
  }, 180_000);

  it('simulação dirigida à direita: substitutos (alfa falso) montados ao lado; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    const spy = vi.fn(async (u: unknown) => { throw new Error(`provedor chamado na simulação: ${String(u)}`); });
    vi.stubGlobal('fetch', spy);
    const job = await placedDirected(nodeAt(25), presenterDir('simulada direita'), PLACED, true);
    await processQueuedJob(job.id);
    const j = (await media.getJob(db, job.id))!;
    expect(j.status).toBe('succeeded');
    expect(spy).not.toHaveBeenCalled();
    for (const s of Object.values((j.input as any).shots) as any[]) {
      expect(s).toMatchObject({ alphaKind: 'opaque', alphaClipAssetId: expect.any(String), clipAssetId: expect.any(String) });
      expect(s.focusX).toBeGreaterThan(0.6);
    }
  }, 180_000);
});

describe('estúdio com zonas — demonstração (banco real, ffmpeg real)', () => {
  it('pílulas na câmera de zona, letreiro com o nome na abertura e pergunta a seguir no fim; nenhum provedor chamado', async () => {
    process.env.MEDIA_SIMULATION = '1';
    // outro bloco narrado (os testes anteriores deixam jobs no primeiro): o último scenario/content do rascunho
    const draft = (await authoring.getDraft(db, courseId))!;
    const candidates = allLessons(draft.document).flatMap((l) => l.graph.nodes.filter((x) => x.type === 'scenario' || x.type === 'content').map((n) => ({ lesson: l, node: n })));
    const { lesson, node } = candidates[candidates.length - 1]!;
    const zoneCams = [
      { id: 'cam_estudio_34', name: '3/4', lookId: 'look_34', nativeFraming: 'medium', angle: 'left', status: 'ready', placement: 'full_frame', zone: 'center' },
      { id: 'cam_estudio_esq', name: 'Esq', lookId: 'look_esq', nativeFraming: 'medium', angle: 'front', status: 'ready', placement: 'full_frame', zone: 'left' },
    ] as const;
    const direction = {
      version: 1, intent: 'zonas', source: 'author',
      shots: [
        shot('abre', 'Oi! Hoje a gente vai falar de experiência, que você já tem.', { cameraId: 'cam_estudio_34', motionPrompt: 'smiles softly, welcoming' }),
        shot('lista', 'Ajudar no negócio da família, organizar eventos da escola e cuidar do time do bairro contam.', { cameraId: 'cam_estudio_esq', layout: 'presenter_chips', slide: { title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos da escola**', 'Cuidar do **time do bairro**'], style: 'checklist' } }),
        shot('fecha', 'Agora pense: onde você já assumiu uma responsabilidade de verdade?', { cameraId: 'cam_estudio_34', motionPrompt: 'tilts the head slightly, inviting' }),
      ],
    };
    const narration = directionNarration(direction as SceneDirection);
    const job = await media.createJob(db, {
      workspaceId, courseId, lessonId: lesson.id, nodeId: node.id, kind: 'video', provider: 'heygen', adapterVersion: 'test', sceneHash: 'sim-zones-1',
      input: {
        script: narration, avatarId: 'look_34', voiceProvider: 'elevenlabs', voiceId: 'v1', params: { backgroundColor: '#F7F8FA', engine: 'avatar_iv' },
        direction, cameras: zoneCams, directionStyle: { slideAccent: '#e4572e' },
        nextQuestion: 'Isso entra no seu currículo?', lowerThird: { name: 'Marina', role: 'Sua orientadora', brand: 'DNA Work' },
        watermark: { brand: 'dnawork', position: 'bottom-right', opacity: 0.7 },
      },
      createdBy: userId, simulated: true,
    });
    await processQueuedJob(job.id);
    const done = (await media.getJob(db, job.id))!;
    expect(done.status).toBe('succeeded');
    const input = done.input as any;
    const { file } = await storageFile(done.outputAssetId!);
    const probe = await ffprobe(file);
    expect(probe).toMatchObject({ width: 1920, height: 1080, hasAudio: true });
    expect(Math.abs(probe.durationSeconds - input.narrationSeconds)).toBeLessThan(0.5);
    // pixel no centro do cartão "A seguir" (último plano na 3/4: coluna à direita, 47% da altura) = vidro marinho
    const raw = path.join(fixtures, 'zones-last.rgb');
    await runFfmpeg(['-ss', (probe.durationSeconds - 0.6).toFixed(2), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', raw]);
    const px = readFileSync(raw);
    const at = (x: number, y: number) => [...px.subarray((y * 1920 + x) * 3, (y * 1920 + x) * 3 + 3)] as [number, number, number];
    const [r, g, b] = at(1152 + 20, Math.round(1080 * 0.47));
    expect(b).toBeGreaterThan(r);
    expect(r).toBeLessThan(110);
    expect(g).toBeLessThan(110);
  }, 180_000);
});
