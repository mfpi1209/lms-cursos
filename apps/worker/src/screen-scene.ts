import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb, media, newId, schema } from '@lms/db';
import { estimateNarrationSeconds, mediaConfigFromEnv, type ElevenLabsAlignment, type WatermarkSpec } from '@lms/media';
import { approxWords, composeScreenScene, ffprobe, generateToneMp3, renderScreenMock, splitMockDurations, type MockInput, normalizeLoudnessInPlace, syntheticAlignment, wordsFromAlignment, type ScreenFit } from '@lms/media/compose';
import { PreflightError, attachToNode, fail, findPaidNarration, isRetryableError, readAsset, storeGeneratedAsset } from './media';
import { JobNotRunningError, patchJobInput, storeCaptions, storeWithRetry, synthesizeOnce, type CaptionsRef } from './narration';
import { burnWatermarkFile } from './watermark-clip';

/**
 * Job de CENA DE GRAVAÇÃO DE TELA (`input.kind = 'screen'`): tela cheia com os MP4 do autor + narração em voz
 * (ElevenLabs, voz da instrutora) + legenda da narração. NUNCA chama o HeyGen (sem avatar). Fluxo:
 *  1. todas as gravações precisam ter arquivo (`falta mídia: <arquivo>`), senão a cena não monta (falha definitiva);
 *  2. narração: reaproveita a já paga (neste job ou no workspace) ou sintetiza UMA vez (o corpo bruto é guardado
 *     antes de interpretar; um retry nunca paga de novo); em modo de demonstração, tom sintético;
 *  3. montagem local (ffmpeg, `composeScreenScene`) + marca d'água + volume;
 *  4. legendas pelo alinhamento, anexo ao nó e gravação de `durationSec`/`fit` em cada `screenRecordings[i]`
 *     (mesma revisão da mídia, `authoring.setNodeMedia`). O `fit` também fica em `input.screenResult` do job.
 */
export const SCREEN_JOB_NOTE_SIM = 'SIMULADO: narração sintética (nenhum provedor chamado); gravações de tela montadas de verdade';
export const SCREEN_STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export interface ScreenJobRecording {
  fileName: string;
  assetId?: string;
  /** `mock` = tela simulada gerada aqui (depois da narração); `upload` ou ausente = MP4 enviado */
  source?: 'upload' | 'mock';
  mock?: MockInput & { steps: Array<{ weight?: number }> };
}

/** A gravação é uma tela simulada a gerar (tem `mock` e nunca teve MP4 enviado)? */
export const isGeneratedRecording = (r: Pick<ScreenJobRecording, 'assetId' | 'source' | 'mock'>): boolean => !!r.mock && (r.source === 'mock' || !r.assetId);

/** Peso total dos passos da tela (passo sem peso = 1): a parte dela no tempo da narração. */
export const mockTotalWeight = (m: { steps: Array<{ weight?: number }> }): number => m.steps.reduce((a, s) => a + (s.weight ?? 1), 0);

export interface ScreenJobInput {
  kind: 'screen';
  script: string;
  voiceProvider: 'elevenlabs' | 'heygen';
  voiceId: string | null;
  params?: { elevenLabsModelId?: string; elevenLabsStability?: number };
  screen: { recordings: ScreenJobRecording[] };
  watermark?: WatermarkSpec;
  voiceAssetId?: string;
  alignment?: ElevenLabsAlignment;
  captions?: CaptionsRef;
  /** telas geradas neste job (por arquivo), guardadas antes da montagem */
  mockAssets?: Record<string, { assetId: string; durationSec: number }>;
}

export function isScreenJob(job: Pick<media.MediaJobRow, 'input'>): boolean {
  const i = job.input as { kind?: unknown; screen?: { recordings?: unknown } } | null;
  return i?.kind === 'screen' && Array.isArray(i.screen?.recordings);
}

/** Primeira gravação sem arquivo: mensagem "falta mídia: <arquivo>" (nunca monta parcial). */
export function firstMissingScreenMedia(recordings: ReadonlyArray<{ fileName: string; assetId?: string | null; source?: string; mock?: unknown }>): string | null {
  const m = recordings.find((r) => !r.assetId && !r.mock);
  return m ? `falta mídia: ${m.fileName}` : null;
}

/** Gravações com asset de vídeo do workspace e legível no storage; devolve a mensagem de erro ou null. */
async function missingMedia(job: Pick<media.MediaJobRow, 'workspaceId'>, recordings: ScreenJobInput['screen']['recordings']): Promise<string | null> {
  const first = firstMissingScreenMedia(recordings);
  if (first) return first;
  for (const r of recordings) {
    if (isGeneratedRecording(r)) continue;
    const a = await media.getAsset(getDb(), r.assetId!);
    if (!a || a.workspaceId !== job.workspaceId || a.kind !== 'video') return `falta mídia: ${r.fileName}`;
  }
  return null;
}

export async function processScreenJob(jobId: string) {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job || job.status !== 'running' || !isScreenJob(job)) return;
  const input = job.input as unknown as ScreenJobInput;
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-screen-'));
  try {
    const missing = await missingMedia(job, input.screen.recordings);
    if (missing) throw new PreflightError(missing);

    // ---- narração (voz da instrutora) ----
    const sim = job.simulated === 1;
    let voiceAssetId = input.voiceAssetId;
    let alignment = input.alignment;
    if (!voiceAssetId) {
      const paid = await findPaidNarration(job);
      const existing = paid ? await media.getAsset(db, paid.voiceAssetId) : null;
      if (existing && paid) {
        voiceAssetId = existing.id;
        alignment = paid.alignment;
      } else if (sim) {
        const seconds = Math.max(1, estimateNarrationSeconds(input.script));
        const tone = await generateToneMp3(path.join(dir, 'sim.mp3'), seconds + 0.35);
        const a = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'audio', mime: 'audio/mpeg', bytes: new Uint8Array(await readFile(tone)), transcript: input.script, createdBy: job.createdBy });
        voiceAssetId = a.id;
        alignment = syntheticAlignment(input.script, seconds);
      } else {
        const cfg = mediaConfigFromEnv();
        if (input.voiceProvider !== 'elevenlabs') throw new PreflightError('cena com gravação de tela precisa da voz do ElevenLabs');
        if (!cfg.elevenLabsApiKey) throw new PreflightError('ELEVENLABS_API_KEY ausente');
        if (!input.voiceId) throw new PreflightError('voiceId do ElevenLabs ausente');
        // paga no máximo uma vez: o corpo bruto fica guardado antes de ser interpretado
        const r = await synthesizeOnce(jobId, { text: input.script, voiceId: input.voiceId, modelId: input.params?.elevenLabsModelId ?? cfg.elevenLabsModelId, stability: input.params?.elevenLabsStability ?? cfg.elevenLabsStability }, cfg.elevenLabsApiKey);
        const a = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'audio', mime: 'audio/mpeg', bytes: r.audio, transcript: input.script, createdBy: job.createdBy });
        voiceAssetId = a.id;
        alignment = r.alignment;
        if (r.characterCost !== undefined) await patchJobInput(jobId, { elevenLabsCharacterCost: r.characterCost });
      }
      await patchJobInput(jobId, { voiceAssetId, ...(alignment ? { alignment } : {}) });
    }
    const voice = await media.getAsset(db, voiceAssetId!);
    if (!voice) throw new Error(`narração ${voiceAssetId} não encontrada no storage`);

    // ---- montagem ----
    await media.updateJob(db, jobId, { phase: 'composing' });
    const narrationFile = path.join(dir, 'narration.mp3');
    await writeFile(narrationFile, await readAsset(voice.storageKey));
    const narrationSec = (await ffprobe(narrationFile)).audioDurationSeconds ?? 0;
    const recs = input.screen.recordings;
    // enviadas: baixa e mede; geradas: duração = fatia da narração (splitMockDurations) e MP4 gerado AQUI, já no tempo certo
    const uploadSec = new Map<number, number>();
    const files: string[] = new Array(recs.length);
    for (const [i, r] of recs.entries()) {
      if (isGeneratedRecording(r)) continue;
      const a = (await media.getAsset(db, r.assetId!))!;
      const f = path.join(dir, `rec-${i}.mp4`);
      await writeFile(f, await readAsset(a.storageKey));
      files[i] = f;
      uploadSec.set(i, (await ffprobe(f)).durationSeconds);
    }
    const durations = splitMockDurations(recs.map((r, i) => (isGeneratedRecording(r) ? { mockWeight: mockTotalWeight(r.mock!) } : { uploadSec: uploadSec.get(i)! })), narrationSec);
    const generated: Record<string, { assetId: string; durationSec: number }> = { ...input.mockAssets };
    for (const [i, r] of recs.entries()) {
      if (!isGeneratedRecording(r)) continue;
      const f = path.join(dir, `rec-${i}.mp4`);
      const done = generated[r.fileName];
      const asset = done ? await media.getAsset(db, done.assetId) : null;
      if (asset) {
        await writeFile(f, await readAsset(asset.storageKey));
      } else {
        const dur = durations[i]!;
        await renderScreenMock(r.mock!, { outPath: f, durationSec: dur, workDir: path.join(dir, `mock-${i}`) });
        const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(f)), durationSeconds: dur, createdBy: job.createdBy });
        generated[r.fileName] = { assetId: a.id, durationSec: dur };
        // guardado antes da montagem: um retry não gera de novo
        await patchJobInput(jobId, { mockAssets: generated });
      }
      files[i] = f;
    }
    const composed = await composeScreenScene({ recordings: files, narrationFile, output: path.join(dir, 'scene.mp4'), generated: recs.map((r) => isGeneratedRecording(r)) });
    let output = composed.output;
    if (input.watermark) {
      const marked = path.join(dir, 'scene-wm.mp4');
      if (await burnWatermarkFile(output, marked, input.watermark, dir)) output = marked;
    }
    const loudness = await normalizeLoudnessInPlace(output);
    const durationSeconds = (await ffprobe(output)).durationSeconds;
    const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(output)), durationSeconds, transcript: input.script, createdBy: job.createdBy, metadata: { loudness } });

    // ---- legenda da narração (como nas outras cenas) ----
    const exact = alignment?.characters?.length ? wordsFromAlignment(alignment) : undefined;
    const words = exact?.length ? exact : approxWords(input.script, 0, composed.durationSec);
    let captions = input.captions;
    if (!captions?.assetId) {
      captions = await storeCaptions(job, words, !exact?.length);
      if (captions) await patchJobInput(jobId, { captions });
    }

    // ---- resultado: fit + duração de cada gravação ----
    const screenResult = { fit: composed.plan.fit as ScreenFit, freezeSec: round3(composed.plan.freezeSec), trimmedSec: round3(composed.plan.trimmedSec), speedup: round3(composed.plan.speedup), narrationSec: round3(composed.durationSec), recordings: input.screen.recordings.map((r, i) => ({ fileName: r.fileName, durationSec: round3(composed.recordingDurations[i]!), ...(isGeneratedRecording(r) ? { assetId: generated[r.fileName]!.assetId, source: 'mock' as const } : {}) })) };
    await patchJobInput(jobId, { screenResult });
    await media.updateJob(db, jobId, { outputAssetId: asset.id, phase: 'attaching' });
    const fresh = (await media.getJob(db, jobId))!;
    await attachToNode(fresh, asset.id, sim, input.script, captions, { fit: screenResult.fit, recordings: screenResult.recordings });
    const [ok] = await db
      .update(schema.mediaJobs)
      .set({ status: 'succeeded', phase: 'done', finishedAt: new Date(), lastError: sim ? SCREEN_JOB_NOTE_SIM : null, updatedAt: new Date() })
      .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'running')))
      .returning({ id: schema.mediaJobs.id });
    if (ok) {
      await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.succeeded', version: 1, payload: { jobId, assetId: asset.id, screen: true, fit: screenResult.fit, simulated: sim } });
      console.log(`[media] job ${jobId} (gravação de tela) concluído: asset ${asset.id}, fit=${screenResult.fit}${sim ? ' [SIMULADO]' : ''}`);
    }
  } catch (e) {
    if (e instanceof JobNotRunningError) return;
    await fail(job, String(e instanceof Error ? e.message : e), isRetryableError(e));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Job de tela em `running` há tempo demais: o worker morreu no meio; volta para a fila (a narração paga fica guardada). */
export async function reconcileScreenJob(job: media.MediaJobRow) {
  if (Date.now() - job.updatedAt.getTime() < SCREEN_STALE_MS) return;
  const db = getDb();
  if (job.attempts >= MAX_ATTEMPTS) {
    await fail(job, 'montagem da gravação de tela interrompida repetidas vezes (worker reiniciado?)', false);
    return;
  }
  const [row] = await db.update(schema.mediaJobs).set({ status: 'queued', phase: 'waiting', updatedAt: new Date(), lastError: 'montagem interrompida; reenfileirada' }).where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running'))).returning({ id: schema.mediaJobs.id });
  if (row) await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { jobId: job.id, retry: true } });
}
