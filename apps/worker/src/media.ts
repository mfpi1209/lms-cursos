import { createHash } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { getDb, authoring, media, schema, newId } from '@lms/db';
import { harvestTerminalDirectedJobs, isDirectedJob, reconcileDirectedJob, startDirectedJob } from './compose-scene';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { allLessons } from '@lms/course-schema';
import { ElevenLabsError, HeyGenAdapter, HeyGenError, estimateMediaCostUsd, estimateNarrationSeconds, getStorage, isTransparentUnsupportedError, mediaConfigFromEnv, narrationPreflight, singleShotAlphaKey, sniffMime, type ElevenLabsAlignment, type HeyGenCreateInput } from '@lms/media';
import { CHROMA_KEY_COLOR, approxWords, generateStandInClip, generateStillClip, generateTestClip, generateToneMp3, renderBrandCardToFile, wordsFromAlignment } from '@lms/media/compose';
import { loadStandInVideo } from './compose-scene';
import { JobNotRunningError, PaidButNotStoredError, patchJobInput, storeCaptions, storeWithRetry, synthesizeOnce, type CaptionsRef } from './narration';
import { placeStoredClip, placementFromParams, presentationBackground, type PlacementParams } from './placement';
import { isBumperJob, processBumperJob, reconcileBumperJob } from './bumper';
import { isAdjustJob, processAdjustJob, reconcileAdjustJob } from './adjust';
import { finishSingleShotBytes } from './watermark-clip';
import type { WatermarkSpec } from '@lms/media';

const MAX_ATTEMPTS = 3;
const RUNNING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** plano único já enviado ao HeyGen (pago): depois de `reconciliation_required`, continua consultando por 24 h e anexa se ficar pronto (auditoria P1-10) */
export const SINGLE_SHOT_HARVEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Pré-checagem barata reprovada (avatar simulado, voz ausente…): falha definitiva, nada foi cobrado. */
export class PreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreflightError';
  }
}
/** plano único em `running` sem video_id: só outro processo assume depois desse tempo sem atualização */
export const SINGLE_SHOT_TAKEOVER_MS = 10 * 60 * 1000;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const SIM_WORKER_REAL_JOB = 'worker em modo simulação recebeu um job real; nada foi cobrado';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera antes de uma nova tentativa (sem dormir no laço: o agendador só pega o job quando vence). */
export function retryDueAt(job: Pick<media.MediaJobRow, 'attempts' | 'updatedAt'>): number {
  if (job.attempts < 1) return 0;
  return job.updatedAt.getTime() + Math.min(60_000, 10_000 * (job.attempts + 1));
}

/**
 * Narração já paga por outro job DO MESMO WORKSPACE: mesmo hash de cena, ou —
 * plano único — mesmo roteiro, voz, modelo e estabilidade do ElevenLabs (a
 * posição da apresentadora e o fundo mudam o hash, mas não a fala).
 */
async function findPaidNarration(job: media.MediaJobRow): Promise<{ voiceAssetId: string; alignment?: ElevenLabsAlignment } | undefined> {
  const t = schema.mediaJobs;
  const ji = job.input as { script?: string; voiceProvider?: string; voiceId?: string | null; params?: Record<string, unknown> };
  const p = ji.params ?? {};
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const sameSpeech = ji.voiceProvider === 'elevenlabs' && ji.voiceId
    ? sql`(${t.input}->'direction' is null and ${t.input}->>'voiceProvider' = 'elevenlabs' and ${t.input}->>'script' = ${String(ji.script ?? '')} and ${t.input}->>'voiceId' = ${ji.voiceId}
        and coalesce(${t.input}->'params'->>'elevenLabsModelId', '') = ${str(p.elevenLabsModelId)} and coalesce(${t.input}->'params'->>'elevenLabsStability', '') = ${str(p.elevenLabsStability)})`
    : sql`false`;
  const rows = await getDb()
    .select({ input: schema.mediaJobs.input })
    .from(schema.mediaJobs)
    .where(and(
      eq(schema.mediaJobs.workspaceId, job.workspaceId),
      sql`(${t.sceneHash} = ${job.sceneHash} or ${sameSpeech})`,
      eq(schema.mediaJobs.simulated, job.simulated),
      sql`${schema.mediaJobs.id} <> ${job.id}`,
      sql`${schema.mediaJobs.input} ? 'voiceAssetId'`,
    ))
    .orderBy(sql`(${schema.mediaJobs.input} ? 'alignment') desc`)
    .limit(1);
  const i = rows[0]?.input as { voiceAssetId?: unknown; alignment?: ElevenLabsAlignment } | undefined;
  return typeof i?.voiceAssetId === 'string' ? { voiceAssetId: i.voiceAssetId, alignment: i.alignment } : undefined;
}

/** Erro que pode ser repetido sem risco de pagar de novo (ou sem chance de dar certo na repetição). */
export function isRetryableError(e: unknown): boolean {
  if (e instanceof PreflightError) return false;
  if (e instanceof HeyGenError) return e.status >= 500 || e.status === 429;
  if (e instanceof ElevenLabsError) return e.retryable;
  if (e instanceof PaidButNotStoredError) return false;
  return true;
}

export async function readAsset(storageKey: string): Promise<Uint8Array> {
  const storage = await getStorage();
  const chunks: Buffer[] = [];
  for await (const c of storage.getStream(storageKey)) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Disjuntor: se o mesmo erro do provedor se repetir em vários jobs do curso em
 * poucos minutos, a fila do curso é pausada (jobs na fila viram "canceled") para
 * não continuar gastando créditos num caminho quebrado.
 */
const BREAKER_THRESHOLD = 3;
const BREAKER_WINDOW_MS = 10 * 60 * 1000;
async function tripBreakerIfNeeded(job: media.MediaJobRow, error: string) {
  const db = getDb();
  const since = new Date(Date.now() - BREAKER_WINDOW_MS);
  const recent = await db
    .select({ id: schema.mediaJobs.id })
    .from(schema.mediaJobs)
    .where(and(eq(schema.mediaJobs.courseId, job.courseId), eq(schema.mediaJobs.status, 'failed'), eq(schema.mediaJobs.lastError, error), gt(schema.mediaJobs.updatedAt, since)));
  if (recent.length < BREAKER_THRESHOLD) return;
  const paused = await db
    .update(schema.mediaJobs)
    .set({ status: 'canceled', phase: 'canceled', finishedAt: new Date(), updatedAt: new Date(), lastError: `pausado automaticamente: ${recent.length} falhas seguidas com "${error.slice(0, 160)}"` })
    .where(and(eq(schema.mediaJobs.courseId, job.courseId), eq(schema.mediaJobs.status, 'queued')))
    .returning({ id: schema.mediaJobs.id });
  if (paused.length) console.error(`[media] disjuntor: ${paused.length} job(s) do curso ${job.courseId} pausados após falhas repetidas`);
}

const EXT: Record<string, string> = { 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/json': 'json', 'text/vtt': 'vtt' };

export async function storeGeneratedAsset(input: { workspaceId: string; kind: 'audio' | 'video' | 'image' | 'document' | 'captions'; mime: string; bytes: Uint8Array; durationSeconds?: number; transcript?: string; createdBy: string; metadata?: schema.AssetMetadata }) {
  const storage = await getStorage();
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const ext = EXT[input.mime] ?? 'mp4';
  const key = `${input.workspaceId}/${input.kind}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
  await storage.putObject(key, input.bytes, input.mime);
  return media.createAsset(getDb(), { workspaceId: input.workspaceId, kind: input.kind, source: 'generated', mimeType: input.mime, sizeBytes: input.bytes.byteLength, storageProvider: storage.provider, storageKey: key, sha256, durationSeconds: input.durationSeconds, transcript: input.transcript, createdBy: input.createdBy, ...(input.metadata ? { metadata: input.metadata } : {}) });
}

/** Baixa o vídeo pronto do provedor (limite de tamanho); o tipo vem da assinatura (MP4 ou WebM com alfa). */
export async function downloadVideo(url: string): Promise<{ bytes: Uint8Array; mime: 'video/mp4' | 'video/webm' }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!res.ok) throw new Error(`download do vídeo falhou: ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_VIDEO_BYTES) throw new Error(`vídeo acima do limite (${Math.round(declared / 1048576)} MB)`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error('vídeo acima do limite');
  return { bytes, mime: sniffMime(bytes.subarray(0, 16)) === 'video/webm' ? 'video/webm' : 'video/mp4' };
}

/**
 * Legendas garantidas no anexo: a referência passada, a já gravada no job ou,
 * faltando as duas, geradas agora (exatas pelo alinhamento da ElevenLabs;
 * aproximadas pelo texto e pela duração do vídeo). Nenhum caminho de anexo
 * (plano único, posicionado, dirigido, reconciliação, saída pronta) fica sem
 * WebVTT. Melhor esforço: falha aqui nunca impede o anexo do vídeo.
 */
async function ensureCaptions(job: media.MediaJobRow, assetId: string, captions?: CaptionsRef): Promise<CaptionsRef | undefined> {
  const input = job.input as { script?: string; alignment?: ElevenLabsAlignment; captions?: CaptionsRef };
  if (captions?.assetId) return captions;
  if (input.captions?.assetId) return input.captions;
  try {
    const exact = input.alignment?.characters?.length ? wordsFromAlignment(input.alignment) : undefined;
    let words = exact;
    if (!words?.length) {
      const asset = await media.getAsset(getDb(), assetId);
      const seconds = asset?.durationSeconds ?? estimateNarrationSeconds(String(input.script ?? ''));
      words = approxWords(String(input.script ?? ''), 0, Math.max(0.5, seconds));
    }
    const ref = await storeCaptions(job, words, !exact);
    if (ref) await patchJobInput(job.id, { captions: ref });
    return ref;
  } catch (e) {
    console.warn(`[media] job ${job.id}: legendas não geradas no anexo: ${String(e instanceof Error ? e.message : e)}`);
    return undefined;
  }
}

export async function attachToNode(job: media.MediaJobRow, assetId: string | null, simulated: boolean, transcript?: string, captions?: CaptionsRef) {
  if (!assetId) return;
  const input = job.input as { script: string; captions?: CaptionsRef; presentationFingerprint?: unknown };
  const cap = await ensureCaptions(job, assetId, captions);
  // impressão da apresentação do pedido (auditoria P1-1): o estúdio compara com a apresentação atual
  const presentationFingerprint = typeof input.presentationFingerprint === 'string' && input.presentationFingerprint ? { presentationFingerprint: input.presentationFingerprint } : {};
  await authoring.setNodeMedia(getDb(), {
    courseId: job.courseId, lessonId: job.lessonId, nodeId: job.nodeId, userId: job.createdBy, note: `Vídeo gerado pelo job ${job.id}`,
    media: {
      assetId, kind: 'video', transcript: (transcript ?? input.script)?.slice(0, 20000), stale: false, generatedFrom: { jobId: job.id, sceneHash: job.sceneHash, provider: job.provider, simulated, ...presentationFingerprint },
      // legendas WebVTT (WCAG 1.2.2); `approx` = tempos estimados sem alinhamento
      ...(cap?.assetId ? { captions: { assetId: cap.assetId, lang: cap.lang ?? 'pt-BR', format: 'vtt', ...(cap.approx ? { approx: true } : {}) } } : {}),
    },
  });
}

/** Legendas do vídeo de plano único: do alinhamento da narração (ElevenLabs) ou aproximadas pelo texto (voz do HeyGen). Melhor esforço. */
async function singleShotCaptions(job: media.MediaJobRow, durationSeconds: number | undefined): Promise<CaptionsRef | undefined> {
  const input = job.input as { script?: string; alignment?: ElevenLabsAlignment; captions?: CaptionsRef };
  if (input.captions?.assetId) return input.captions;
  try {
    const exact = input.alignment?.characters?.length ? wordsFromAlignment(input.alignment) : undefined;
    const words = exact ?? approxWords(String(input.script ?? ''), 0, durationSeconds ?? estimateNarrationSeconds(String(input.script ?? '')));
    const ref = await storeCaptions(job, words, !exact);
    if (ref) await patchJobInput(job.id, { captions: ref });
    return ref;
  } catch (e) {
    console.warn(`[media] job ${job.id}: legendas não geradas: ${String(e instanceof Error ? e.message : e)}`);
    return undefined;
  }
}

/**
 * Falha (ou reenfileira) um job EM EXECUÇÃO. Nunca sobrescreve um cancelamento
 * concorrente (só age sobre `running`).
 */
export async function fail(job: media.MediaJobRow, error: string, retryable: boolean) {
  const db = getDb();
  const t = schema.mediaJobs;
  if (retryable && job.attempts < MAX_ATTEMPTS) {
    const [row] = await db.update(t).set({ status: 'queued', phase: 'waiting', lastError: error, updatedAt: new Date() }).where(and(eq(t.id, job.id), eq(t.status, 'running'))).returning({ id: t.id });
    if (!row) return;
    await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { jobId: job.id, retry: true } });
    console.warn(`[media] job ${job.id} falhou (tentativa ${job.attempts}); reenfileirado: ${error}`);
    return;
  }
  const [row] = await db.update(t).set({ status: 'failed', phase: 'failed', lastError: error, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(t.id, job.id), eq(t.status, 'running'))).returning({ id: t.id });
  if (!row) return;
  await tripBreakerIfNeeded(job, error);
  await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.failed', version: 1, payload: { jobId: job.id, error } });
  console.error(`[media] job ${job.id} falhou definitivamente: ${error}`);
}

/** Algo já foi pago neste job (narração, envio ao HeyGen ou clipe próprio)? */
function hasPaidState(input: Record<string, unknown>, externalId: string | null): boolean {
  if (externalId || input.voiceAssetId || input.elevenLabsRaw || input.heygenAudioAssetId || (input.rawVideoAssetId && !input.reusedRawFrom)) return true;
  const shots = input.shots && typeof input.shots === 'object' ? Object.values(input.shots as Record<string, { heygenVideoId?: string | null; reusedFrom?: string; clipAssetId?: string; alphaClipAssetId?: string; reusedAlphaFrom?: string }>) : [];
  return shots.some((x) => x.heygenVideoId || (x.clipAssetId && !x.reusedFrom && !x.reusedAlphaFrom) || (x.alphaClipAssetId && !x.reusedAlphaFrom));
}

/** Worker em simulação nunca simula um job REAL (o resultado seria guardado como se fosse pago): falha, sem cobrar nada. */
export function simWorkerRealJobMessage(job: Pick<media.MediaJobRow, 'input' | 'externalId'>): string {
  return hasPaidState(job.input, job.externalId)
    ? 'worker em modo simulação recebeu um job real; nada novo foi cobrado (o que já foi pago fica guardado para reaproveitamento)'
    : SIM_WORKER_REAL_JOB;
}

// ---------------- plano único com a apresentadora posicionada ----------------

/** Chave do vídeo transparente de plano único (definida em @lms/media, partilhada com a rota da remontagem sem custo). */
export { singleShotAlphaKey };

// ---------------- remontagem sem custo ("trocar o fundo sem gerar de novo") ----------------

/**
 * Job de REMONTAGEM (criado pela rota com `input.recomposeOf`): o vídeo
 * transparente já pago (`rawVideoAssetId`, de outro job) é só montado de novo
 * sobre o novo fundo/posição com ffmpeg local. Nenhum provedor é chamado, por
 * isso roda até num worker em modo de demonstração, embora seja `simulated=0`
 * (a saída é um vídeo real). Nunca é um vídeo dirigido.
 */
export function isRecomposeJob(job: Pick<media.MediaJobRow, 'input'>): boolean {
  const i = job.input as { recomposeOf?: unknown; rawVideoAssetId?: unknown; params?: Record<string, unknown> };
  return typeof i.recomposeOf === 'string' && typeof i.rawVideoAssetId === 'string' && !isDirectedJob(job) && placementFromParams(i.params) !== null;
}

/**
 * Tudo que a remontagem precisa já está no nosso storage? Confere o vídeo
 * transparente (mesmo workspace, vídeo, legível) e o fundo de imagem (se
 * houver) ANTES de reivindicar o job. Devolve o motivo da falta, ou null.
 */
export async function recomposeMissingAssets(job: Pick<media.MediaJobRow, 'workspaceId' | 'input'>): Promise<string | null> {
  const db = getDb();
  const i = job.input as { rawVideoAssetId?: string; params?: { backgroundAssetId?: unknown } };
  const raw = i.rawVideoAssetId ? await media.getAsset(db, i.rawVideoAssetId) : null;
  if (!raw || raw.workspaceId !== job.workspaceId || raw.kind !== 'video') return `vídeo transparente ${i.rawVideoAssetId ?? '?'} não encontrado no workspace`;
  try {
    const storage = await getStorage();
    let bytes = 0;
    for await (const c of storage.getStream(raw.storageKey, { start: 0, end: 15 })) bytes += (c as Uint8Array).byteLength;
    if (bytes === 0) return `vídeo transparente ${raw.id} vazio no storage`;
  } catch (e) {
    return `vídeo transparente ${raw.id} ilegível no storage: ${String(e instanceof Error ? e.message : e)}`;
  }
  const bgId = i.params?.backgroundAssetId;
  if (bgId) {
    const bg = await media.getAsset(db, String(bgId));
    if (!bg || bg.workspaceId !== job.workspaceId || bg.kind !== 'image') return `imagem de fundo ${String(bgId)} não encontrada no workspace`;
  }
  return null;
}

/** Nota gravada no job de remontagem concluído (lastError informativo, como nos simulados). */
export function recomposeNote(job: Pick<media.MediaJobRow, 'input'>): string {
  const i = job.input as { recomposeOf?: string };
  return `Fundo trocado sem custo: vídeo transparente do job ${i.recomposeOf ?? '?'} montado de novo; nenhum provedor chamado`;
}

interface PlacedInput {
  script: string;
  params?: Record<string, any>;
  alphaKey?: string;
  rawVideoAssetId?: string;
  rawVideoKind?: 'alpha' | 'chroma' | 'opaque';
  presenterKind?: 'chroma';
  placeFailures?: number;
  alignment?: ElevenLabsAlignment;
  captions?: CaptionsRef;
}

/** Vídeo transparente igual (mesma alphaKey) já baixado por outro job do workspace, no mesmo modo. */
async function findReusableAlpha(job: media.MediaJobRow, alphaKey: string): Promise<{ jobId: string; input: PlacedInput } | undefined> {
  const t = schema.mediaJobs;
  const rows = await getDb()
    .select({ id: t.id, input: t.input })
    .from(t)
    .where(and(eq(t.workspaceId, job.workspaceId), eq(t.simulated, job.simulated), sql`${t.id} <> ${job.id}`, sql`${t.input}->>'alphaKey' = ${alphaKey}`, sql`${t.input} ? 'rawVideoAssetId'`))
    .orderBy(sql`${t.createdAt} desc`)
    .limit(1);
  const r = rows[0];
  return r ? { jobId: r.id, input: r.input as unknown as PlacedInput } : undefined;
}

const MAX_PLACE_FAILURES = 3;

/**
 * Custo REAL (estimado pela tabela sobre as quantidades reais): caracteres
 * cobrados pelo ElevenLabs neste job (`elevenLabsCharacterCost`; narração
 * reaproveitada = 0) e segundos do vídeo entregue pelo HeyGen (vídeo
 * transparente reaproveitado = 0). Simulado = 0.
 */
export function actualCostUsd(job: Pick<media.MediaJobRow, 'input' | 'simulated'>, durationSeconds: number | undefined): number {
  if (job.simulated === 1) return 0;
  const input = job.input as { script?: string; elevenLabsCharacterCost?: unknown; reusedRawFrom?: unknown; params?: { cinematicResolution?: unknown } };
  const chars = typeof input.elevenLabsCharacterCost === 'number' ? input.elevenLabsCharacterCost : 0;
  const seconds = input.reusedRawFrom ? 0 : (durationSeconds ?? estimateNarrationSeconds(String(input.script ?? '')));
  return estimateMediaCostUsd({ elevenLabsChars: chars, heygenSeconds: seconds });
}

/** Grava a saída, gera legendas, anexa ao nó e marca sucesso (só se ainda estiver running). */
/**
 * Acabamento do vídeo de plano único (o clipe que o HeyGen devolve pronto): marca d'água quando o
 * pedido traz `input.watermark` e volume normalizado (A15). Grava um asset NOVO (o original pago
 * continua guardado); qualquer falha devolve o original, nunca bloqueia o anexo. Custo 0 (ffmpeg local).
 */
async function watermarkedSingleShot(job: media.MediaJobRow, assetId: string, durationSeconds: number | undefined): Promise<string> {
  const wm = (job.input as { watermark?: WatermarkSpec }).watermark;
  try {
    const a = await media.getAsset(getDb(), assetId);
    if (!a || a.kind !== 'video') return assetId;
    const r = await finishSingleShotBytes(await readAsset(a.storageKey), wm);
    if (!r) return assetId;
    if (r.loudness.low) console.warn(`[media] job ${job.id}: voz baixa mesmo depois de normalizar (${r.loudness.outputI} LUFS)`);
    const marked = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: r.bytes, durationSeconds, transcript: (job.input as { script?: string }).script, createdBy: job.createdBy, metadata: { loudness: { ...r.loudness, from: assetId } } });
    return marked.id;
  } catch (e) {
    console.warn(`[media] job ${job.id}: acabamento do plano único (marca d'água/volume) falhou; anexando o original: ${String(e instanceof Error ? e.message : e)}`);
    return assetId;
  }
}

async function finalizeSingleShot(job: media.MediaJobRow, assetIdIn: string, durationSeconds: number | undefined, simulated: boolean, note: string | null = null) {
  const db = getDb();
  // vídeo real: grava o logo antes de anexar (a prévia simulada já é um cartão de marca)
  const assetId = simulated ? assetIdIn : await watermarkedSingleShot(job, assetIdIn, durationSeconds);
  // anexa ANTES de marcar sucesso: se o anexo falhar, o job fica running com o asset gravado e lastError, e a reconciliação tenta de novo
  await media.updateJob(db, job.id, { outputAssetId: assetId, phase: 'attaching' });
  const captions = await singleShotCaptions((await media.getJob(db, job.id)) ?? job, durationSeconds);
  try {
    await attachToNode(job, assetId, simulated, undefined, captions);
  } catch (e) {
    await media.updateJob(db, job.id, { lastError: `vídeo pronto (${assetId}) mas não anexado: ${String(e instanceof Error ? e.message : e)}` });
    return;
  }
  // sucesso só se ainda estiver running (um cancelamento concorrente prevalece); custo real pelas quantidades reais
  const fresh = (await media.getJob(db, job.id)) ?? job;
  const costActualUsd = actualCostUsd(fresh, durationSeconds);
  const [ok] = await db.update(schema.mediaJobs).set({ status: 'succeeded', phase: 'done', finishedAt: new Date(), lastError: note, costActualUsd, updatedAt: new Date() }).where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running'))).returning({ id: schema.mediaJobs.id });
  if (!ok) return;
  await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.succeeded', version: 1, payload: { jobId: job.id, assetId, ...(simulated ? { simulated: true } : {}) } });
  console.log(`[media] job ${job.id} concluído: asset ${assetId}${simulated ? ' [SIMULADO]' : ''}`);
}

/**
 * Vídeo transparente já no nosso storage (`rawVideoAssetId`) -> montagem sobre o
 * fundo da apresentação -> MP4 final. Só ffmpeg: nenhum provedor é chamado; uma
 * falha aqui nunca refaz o vídeo pago (3 falhas = job falha, o vídeo fica guardado).
 */
async function completePlacedSingleShot(job: media.MediaJobRow, placement: PlacementParams, opts: { simulated?: boolean; note?: string } = {}) {
  const db = getDb();
  const input = job.input as unknown as PlacedInput;
  if (!input.rawVideoAssetId) throw new Error('vídeo do apresentador ainda não baixado');
  await media.updateJob(db, job.id, { phase: 'composing' });
  let placed: { assetId: string; durationSeconds: number };
  try {
    placed = await placeStoredClip({ job, clipAssetId: input.rawVideoAssetId, kind: input.rawVideoKind ?? 'alpha', placement, background: (dir) => presentationBackground(input.params, dir, job.workspaceId), transcript: input.script });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 400);
    const n = (input.placeFailures ?? 0) + 1;
    await patchJobInput(job.id, { placeFailures: n });
    // simulação não tem reconciliação de plano único: falha na hora (nada foi pago)
    if (n >= MAX_PLACE_FAILURES || opts.simulated) await fail({ ...job, attempts: MAX_ATTEMPTS }, `montagem da apresentadora sobre o fundo falhou: ${msg}`, false);
    else await media.updateJob(db, job.id, { lastError: `montagem sobre o fundo (${n}/${MAX_PLACE_FAILURES}): ${msg}` });
    return;
  }
  await finalizeSingleShot(job, placed.assetId, placed.durationSeconds, !!opts.simulated, opts.note ?? null);
}

/**
 * MODO DE DEMONSTRAÇÃO com a apresentadora posicionada: substituto local (vídeo
 * real já pago deste apresentador, ou testsrc) com um tom no lugar da fala,
 * recortado 3:4 ("alfa falso") e montado ao lado sobre o fundo. Nenhum provedor.
 */
async function simulatePlacedSingleShot(job: media.MediaJobRow, placement: PlacementParams) {
  const input = job.input as unknown as PlacedInput;
  try {
    if (!input.rawVideoAssetId) {
      const seconds = Math.min(30, Math.max(1, estimateNarrationSeconds(input.script)));
      const dir = await mkdtemp(path.join(tmpdir(), 'lms-sim-placed-'));
      try {
        const tone = await generateToneMp3(path.join(dir, 'n.mp3'), seconds);
        const standIn = (await loadStandInVideo(job, dir)) ?? (await generateTestClip({ output: path.join(dir, 'testsrc.mp4'), seconds: 6, width: 1280, height: 720, fps: 25 }));
        const clip = await generateStandInClip({ output: path.join(dir, 'placed-source.mp4'), seconds, sourceVideo: standIn, audioPath: tone });
        const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(clip)), durationSeconds: seconds, transcript: input.script, createdBy: job.createdBy });
        await patchJobInput(job.id, { rawVideoAssetId: a.id, rawVideoKind: 'opaque', alphaKey: singleShotAlphaKey(job, job.input as never) });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    const fresh = (await media.getJob(getDb(), job.id))!;
    await completePlacedSingleShot(fresh, placement, { simulated: true, note: `SIMULADO: apresentadora substituta posicionada (${placement.placement}); nenhum provedor chamado` });
  } catch (e) {
    await fail({ ...job, attempts: MAX_ATTEMPTS }, `simulação da apresentadora posicionada falhou: ${String(e instanceof Error ? e.message : e)}`, false);
  }
}

/** Duração do substituto simulado de plano único (s): 6–10, pela fala. */
export const STAND_IN_SECONDS = { min: 6, max: 10 } as const;

/** Título da cena do job no rascunho atual (para o cartão do substituto); vazio se não encontrada. */
async function sceneTitleOf(job: Pick<media.MediaJobRow, 'courseId' | 'lessonId' | 'nodeId'>): Promise<string> {
  try {
    const draft = await authoring.getDraft(getDb(), job.courseId);
    if (!draft) return '';
    const lesson = allLessons(draft.document).find((l) => l.id === job.lessonId);
    const node = lesson?.graph.nodes.find((n) => n.id === job.nodeId);
    return (node?.title ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * MODO DE DEMONSTRAÇÃO, plano único centralizado: o job termina com um
 * vídeo SUBSTITUTO (6–10 s) anexado à cena, para que a etapa "Vídeos" do
 * estúdio e o player tenham mídia: o cartão de marca (variante marinho) com o
 * título da cena, "Prévia simulada" e as primeiras palavras da fala, com áudio
 * em silêncio; legendas aproximadas pela fala. `generatedFrom.simulated = true`
 * e `lastError` informativo com "SIMULADO". Nenhum provedor é chamado.
 */
async function simulateSingleShotStandIn(job: media.MediaJobRow) {
  const input = job.input as { script: string };
  const script = String(input.script ?? '').replace(/\s+/g, ' ').trim();
  const seconds = Math.min(STAND_IN_SECONDS.max, Math.max(STAND_IN_SECONDS.min, Math.round(estimateNarrationSeconds(script))));
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-sim-standin-'));
  try {
    const title = (await sceneTitleOf(job)) || 'Cena';
    const words = script.split(' ').filter(Boolean);
    const opening = words.slice(0, 12).join(' ') + (words.length > 12 ? '…' : '');
    const card = await renderBrandCardToFile(path.join(dir, 'card.png'), {
      title,
      bullets: ['**Prévia simulada**: nenhum provedor chamado', ...(opening ? [`“${opening}”`] : [])],
      variant: 'navy',
    }, { brand: process.env.PLATFORM_BRAND });
    const clip = await generateStillClip({ output: path.join(dir, 'stand-in.mp4'), imagePath: card, seconds });
    const a = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(clip)), durationSeconds: seconds, transcript: script, createdBy: job.createdBy });
    await finalizeSingleShot(job, a.id, seconds, true, 'SIMULADO: nenhum provedor configurado; prévia substituta (cartão de marca) anexada à cena');
  } catch (e) {
    await fail({ ...job, attempts: MAX_ATTEMPTS }, `simulação do plano único falhou: ${String(e instanceof Error ? e.message : e)}`, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Inicia o job: voz (ElevenLabs) -> asset HeyGen -> pedido de vídeo. Nunca mantém transação aberta durante chamadas externas. */
export async function processQueuedJob(jobId: string) {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job || job.status !== 'queued') return;
  // nova tentativa: o agendador volta quando a espera vencer (nada de dormir dentro do laço de polling)
  if (Date.now() < retryDueAt(job)) return;
  // vinheta de marca: render local (resvg + ffmpeg), custo 0, nenhum provedor — roda até em modo de demonstração
  if (isBumperJob(job)) return processBumperJob(jobId);
  // ajuste fino sem regravar: remontagem local dos clipes já pagos, custo 0, nenhum provedor
  if (isAdjustJob(job)) return processAdjustJob(jobId);
  // remontagem sem custo: tudo precisa já existir no nosso storage ANTES de reivindicar (nunca chama provedor)
  const recompose = isRecomposeJob(job);
  if (recompose) {
    const missing = await recomposeMissingAssets(job);
    if (missing) {
      const [row] = await db.update(schema.mediaJobs).set({ status: 'failed', phase: 'failed', lastError: `remontagem sem custo impossível: ${missing}`, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'queued'))).returning({ id: schema.mediaJobs.id });
      if (row) {
        await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.failed', version: 1, payload: { jobId, error: missing } });
        console.error(`[media] job ${jobId}: remontagem sem custo recusada: ${missing}`);
      }
      return;
    }
  }
  const attempts = job.attempts + 1;
  // reivindica o job: só um processo o inicia
  const [running] = await db
    .update(schema.mediaJobs)
    .set({ status: 'running', attempts, startedAt: job.startedAt ?? new Date(), phase: recompose ? 'composing' : 'narrating', updatedAt: new Date() })
    .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'queued')))
    .returning();
  if (!running) return;
  const cfg = mediaConfigFromEnv();
  // a remontagem não chama provedor: passa pela trava (é real, mas só ffmpeg local)
  if (running.simulated === 0 && cfg.simulation && !recompose) {
    await fail(running, simWorkerRealJobMessage(running), false);
    return;
  }
  // cena dirigida (plano a plano): pipeline próprio, inclusive no modo de demonstração
  if (isDirectedJob(job)) return startDirectedJob(jobId);
  const input = job.input as { script: string; avatarId: string; voiceProvider: 'heygen' | 'elevenlabs'; voiceId: string | null; params: Record<string, any> };

  const placement = placementFromParams(input.params);
  if (recompose && placement) {
    console.log(`[media] job ${jobId}: remontagem sem custo a partir de ${String((input as { recomposeOf?: unknown }).recomposeOf)} (só ffmpeg)`);
    return completePlacedSingleShot(running, placement, { note: recomposeNote(running) });
  }
  if (job.simulated === 1) {
    // apresentadora à direita/esquerda: prévia local da montagem (substituto + fundo)
    if (placement) return simulatePlacedSingleShot(running, placement);
    // MODO DE DEMONSTRAÇÃO: nenhum provedor é chamado; um substituto local (cartão de marca) é anexado à cena
    await sleep(1500);
    return simulateSingleShotStandIn(running);
  }

  try {
    if (placement) {
      const persisted = job.input as unknown as PlacedInput;
      const alphaKey = persisted.alphaKey ?? singleShotAlphaKey(job, input);
      if (!persisted.alphaKey) await patchJobInput(jobId, { alphaKey });
      // vídeo transparente igual já pago (outra posição, tamanho ou fundo): só monta de novo, nenhum provedor
      const reuse = !job.externalId && !persisted.rawVideoAssetId ? await findReusableAlpha(running, alphaKey) : undefined;
      if (reuse?.input.rawVideoAssetId) {
        await patchJobInput(jobId, {
          rawVideoAssetId: reuse.input.rawVideoAssetId, rawVideoKind: reuse.input.rawVideoKind ?? 'alpha', reusedRawFrom: reuse.jobId,
          ...(reuse.input.alignment ? { alignment: reuse.input.alignment } : {}), ...(reuse.input.captions ? { captions: reuse.input.captions } : {}),
        });
        console.log(`[media] job ${jobId}: vídeo transparente reaproveitado de ${reuse.jobId} (sem nova cobrança); montando sobre o fundo`);
        return completePlacedSingleShot((await media.getJob(db, jobId))!, placement);
      }
      if (persisted.rawVideoAssetId) return completePlacedSingleShot((await media.getJob(db, jobId))!, placement);
    }
    // pré-checagem barata ANTES de qualquer chamada paga: avatar simulado ou voz ausente nunca chegam ao ElevenLabs/HeyGen
    const pre = narrationPreflight(input);
    if (!pre.ok) throw new PreflightError(`pré-checagem: ${pre.reason}`);
    const heygen = new HeyGenAdapter(cfg.heygenApiKey!);
    let audioAssetId: string | undefined;
    const persisted = job.input as { heygenAudioAssetId?: string; voiceAssetId?: string; presenterKind?: 'chroma' };
    if (persisted.heygenAudioAssetId) {
      // retry/reconciliação: nunca sintetiza nem envia o áudio de novo (sem nova cobrança)
      audioAssetId = persisted.heygenAudioAssetId;
    } else if (input.voiceProvider === 'elevenlabs') {
      let voiceBytes: Uint8Array;
      const paid = persisted.voiceAssetId ? { voiceAssetId: persisted.voiceAssetId } : await findPaidNarration(job);
      const existing = paid ? await media.getAsset(db, paid.voiceAssetId) : null;
      if (existing) {
        // narração já paga (tentativa anterior ou outro job do workspace): relê do nosso storage
        voiceBytes = await readAsset(existing.storageKey);
        if (!persisted.voiceAssetId) await patchJobInput(jobId, { voiceAssetId: existing.id, ...(paid?.alignment ? { alignment: paid.alignment } : {}) });
      } else {
        if (!cfg.elevenLabsApiKey) throw new PreflightError('ELEVENLABS_API_KEY ausente');
        if (!input.voiceId) throw new PreflightError('voiceId do ElevenLabs ausente');
        // com marcação de tempo (legendas); paga no máximo uma vez (corpo bruto guardado antes de interpretar)
        const voice = await synthesizeOnce(jobId, { text: input.script, voiceId: input.voiceId, modelId: input.params.elevenLabsModelId ?? cfg.elevenLabsModelId, stability: input.params.elevenLabsStability ?? cfg.elevenLabsStability }, cfg.elevenLabsApiKey);
        // a resposta paga já está guardada: falha de storage aqui é repetível sem nova cobrança
        const a = await storeWithRetry({ workspaceId: job.workspaceId, kind: 'audio', mime: 'audio/mpeg', bytes: voice.audio, transcript: input.script, createdBy: job.createdBy });
        voiceBytes = voice.audio;
        // grava ANTES do upload: se o upload falhar, o retry não paga a narração de novo
        await patchJobInput(jobId, { voiceAssetId: a.id, alignment: voice.alignment, ...(voice.characterCost !== undefined ? { elevenLabsCharacterCost: voice.characterCost } : {}) });
      }
      await media.updateJob(db, jobId, { phase: 'uploading' });
      const up = await heygen.uploadAsset(voiceBytes, 'audio/mpeg');
      audioAssetId = up.assetId;
      await patchJobInput(jobId, { heygenAudioAssetId: audioAssetId });
    }
    let backgroundAssetId: string | undefined;
    // câmera principal em tela cheia: o look com o PRÓPRIO fundo (sem fundo da apresentação, sem recorte, sem alfa)
    const fullFrame = input.params.presenterPlacement === 'full_frame';
    // posicionada: o HeyGen não recebe fundo (vídeo transparente; o fundo entra na nossa montagem)
    if (input.params.backgroundAssetId && !placement && !fullFrame) {
      const bg = await media.getAsset(db, String(input.params.backgroundAssetId));
      if (bg && bg.kind === 'image') {
        const up = await heygen.uploadAsset(await readAsset(bg.storageKey), bg.mimeType as 'image/png' | 'image/jpeg' | 'image/webp');
        backgroundAssetId = up.assetId;
      }
    }
    // cancelamento concorrente prevalece: nenhum vídeo é pedido depois dele
    if ((await media.getJob(db, jobId))?.status !== 'running') return;
    const baseKey = job.requestId.replace(/[^A-Za-z0-9_:.-]/g, '-').slice(0, 248);
    const request: HeyGenCreateInput = {
      title: `${job.courseId}/${job.lessonId}/${job.nodeId}`,
      avatarId: input.avatarId,
      script: audioAssetId ? undefined : input.script,
      voiceId: audioAssetId ? undefined : (input.voiceId ?? undefined),
      audioAssetId,
      aspectRatio: audioAssetId ? 'auto' : input.params.aspectRatio,
      resolution: input.params.resolution ?? '1080p',
      backgroundColor: input.params.backgroundColor,
      backgroundAssetId,
      engine: input.params.engine,
      expressiveness: input.params.expressiveness,
      motionPrompt: input.params.motionPrompt,
      removeBackground: input.params.removeBackground,
      ...(fullFrame ? { keepLookBackground: true } : {}),
      callbackUrl: cfg.heygenCallbackUrl,
      callbackId: job.id,
      idempotencyKey: job.requestId.replace(/[^A-Za-z0-9_:.-]/g, '-').slice(0, 255),
    };
    /** plano B: fundo verde puro em MP4 (recortado na montagem); chave própria (`:chroma`) */
    const chromaRequest = (): HeyGenCreateInput => ({ ...request, backgroundColor: CHROMA_KEY_COLOR, backgroundAssetId: undefined, removeBackground: true, transparent: false, idempotencyKey: `${baseKey}:chroma` });
    let created: { videoId: string };
    if (!placement) created = await heygen.createAvatarVideo(request);
    else if (persisted.presenterKind === 'chroma') created = await heygen.createAvatarVideo(chromaRequest());
    else {
      try {
        created = await heygen.createAvatarVideo({ ...request, transparent: true });
      } catch (e) {
        if (!isTransparentUnsupportedError(e)) throw e;
        // avatar sem matting: grava a escolha ANTES do novo pedido (retries usam a mesma chave `:chroma`)
        console.warn(`[media] job ${jobId}: HeyGen recusou o vídeo transparente (${e.message}); usando fundo verde para recorte`);
        await patchJobInput(jobId, { presenterKind: 'chroma' });
        if ((await media.getJob(db, jobId))?.status !== 'running') return;
        created = await heygen.createAvatarVideo(chromaRequest());
      }
    }
    await media.updateJob(db, jobId, { externalId: created.videoId, phase: 'rendering' });
    console.log(`[media] job ${jobId} enviado ao HeyGen: ${created.videoId}`);
  } catch (e) {
    if (e instanceof JobNotRunningError) return;
    if (e instanceof HeyGenError && e.status === 409) {
      // request_in_progress com a mesma Idempotency-Key: o pedido anterior ainda está em voo; reconciliar depois
      await media.updateJob(db, jobId, { lastError: 'HeyGen: pedido anterior ainda em processamento (409); aguardando reconciliação' });
      return;
    }
    await fail({ ...job, attempts }, String(e instanceof Error ? e.message : e), isRetryableError(e));
  }
}

/** Saída já gravada mas não anexada (falha anterior no anexo): anexa e marca sucesso (só se ainda running). */
async function attachReadyOutput(job: media.MediaJobRow, note: string | null = null) {
  const db = getDb();
  try {
    await attachToNode(job, job.outputAssetId!, false);
    const asset = await media.getAsset(db, job.outputAssetId!);
    await db.update(schema.mediaJobs).set({ status: 'succeeded', phase: 'done', finishedAt: new Date(), lastError: note, costActualUsd: job.costActualUsd ?? actualCostUsd(job, asset?.durationSeconds ?? undefined), updatedAt: new Date() }).where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running')));
  } catch (e) {
    await media.updateJob(db, job.id, { lastError: `vídeo pronto (${job.outputAssetId}) mas não anexado: ${String(e instanceof Error ? e.message : e)}` });
  }
}

/** Consulta o estado remoto e finaliza o job (download para nosso storage + anexar ao nó). */
export async function reconcileJob(jobId: string) {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job || job.status !== 'running') return;
  // multi-clipe: fica running/rendering até todos os planos ficarem prontos, depois composing
  if (isDirectedJob(job)) return reconcileDirectedJob(jobId);
  // vinheta: render local síncrono; só volta para a fila se o worker morreu no meio
  if (isBumperJob(job)) return reconcileBumperJob(job);
  if (isAdjustJob(job)) return reconcileAdjustJob(job);
  const cfg = mediaConfigFromEnv();
  // remontagem sem custo: só ffmpeg local — termina (ou anexa) sem precisar de chave nem de provedor
  if (isRecomposeJob(job)) {
    if (job.outputAssetId) return attachReadyOutput(job, recomposeNote(job));
    const pl = placementFromParams((job.input as { params?: Record<string, unknown> }).params);
    if (pl) return completePlacedSingleShot(job, pl, { note: recomposeNote(job) });
    return;
  }
  if (!cfg.heygenApiKey) return;
  const heygen = new HeyGenAdapter(cfg.heygenApiKey);
  if (job.outputAssetId) return attachReadyOutput(job);
  const placement = placementFromParams((job.input as { params?: Record<string, unknown> }).params);
  // posicionada com o vídeo transparente já guardado: só falta (re)montar sobre o fundo
  if (placement && (job.input as unknown as PlacedInput).rawVideoAssetId) return completePlacedSingleShot(job, placement);
  if (!job.externalId) {
    // outro processo pode estar no meio do início (narração/upload): só assume um job parado há mais de 10 min
    if (Date.now() - job.updatedAt.getTime() < SINGLE_SHOT_TAKEOVER_MS) return;
    // timeout após envio sem video_id conhecido: repetir o POST com a mesma Idempotency-Key devolve o mesmo vídeo (24h)
    const [taken] = await db
      .update(schema.mediaJobs)
      .set({ status: 'queued', phase: 'waiting', updatedAt: new Date() })
      .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'running'), sql`${schema.mediaJobs.externalId} is null`, lt(schema.mediaJobs.updatedAt, new Date(Date.now() - SINGLE_SHOT_TAKEOVER_MS))))
      .returning({ id: schema.mediaJobs.id });
    if (!taken) return;
    console.warn(`[media] job ${jobId}: em execução sem video_id há mais de ${SINGLE_SHOT_TAKEOVER_MS / 60000} min; reenfileirado (mesma Idempotency-Key)`);
    await processQueuedJob(jobId);
    return;
  }
  try {
    const v = await heygen.getVideo(job.externalId);
    if (v.status === 'completed' && v.videoUrl) {
      await media.updateJob(db, jobId, { phase: 'downloading' });
      const { bytes, mime } = await downloadVideo(v.videoUrl);
      const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: placement ? mime : 'video/mp4', bytes, durationSeconds: v.durationSeconds, transcript: (job.input as any).script, createdBy: job.createdBy });
      if (placement) {
        // vídeo pago guardado ANTES da montagem: uma falha no ffmpeg nunca baixa nem paga de novo
        const kind = (job.input as unknown as PlacedInput).presenterKind === 'chroma' ? 'chroma' : 'alpha';
        await patchJobInput(jobId, { rawVideoAssetId: asset.id, rawVideoKind: kind });
        return completePlacedSingleShot((await media.getJob(db, jobId))!, placement);
      }
      await finalizeSingleShot(job, asset.id, v.durationSeconds, false);
    } else if (v.status === 'failed') {
      await fail(job, `${v.failureCode ?? 'failed'}: ${v.failureMessage ?? 'sem detalhes'}`, false);
    } else if (job.startedAt && Date.now() - job.startedAt.getTime() > RUNNING_MAX_AGE_MS) {
      // libera a vaga da fila, mas o vídeo já foi pago: a colheita continua consultando por 24 h (harvestUntil) e anexa se ficar pronto
      const harvestUntil = new Date(job.startedAt.getTime() + SINGLE_SHOT_HARVEST_WINDOW_MS).toISOString();
      await patchJobInput(jobId, { harvestUntil });
      await media.updateJob(db, jobId, { status: 'reconciliation_required', lastError: `sem conclusão após ${RUNNING_MAX_AGE_MS / 60000} min (status remoto: ${v.status}); o vídeo pago continua sendo consultado por 24 h` });
    }
  } catch (e) {
    console.warn(`[media] reconciliação de ${jobId} falhou: ${String(e)}`);
    await media.updateJob(db, jobId, { lastError: `reconciliação: ${String(e instanceof Error ? e.message : e)}` });
  }
}

const MAX_RUNNING_PER_COURSE = Number(process.env.MEDIA_MAX_RUNNING_PER_COURSE ?? process.env.MEDIA_MAX_OPEN_PER_COURSE ?? 3);
const MAX_RUNNING_GLOBAL = Number(process.env.MEDIA_MAX_RUNNING ?? 5);

/**
 * Agendador da fila: inicia jobs em ordem de chegada respeitando o limite de
 * vídeos em produção por curso e no total (o HeyGen tem limite de workflows
 * simultâneos). Os demais esperam em `queued` com fase `waiting`; novas
 * tentativas só entram quando a espera (backoff) vence.
 */
export async function dispatchQueuedJobs() {
  const db = getDb();
  const running = await db.select({ courseId: schema.mediaJobs.courseId }).from(schema.mediaJobs).where(eq(schema.mediaJobs.status, 'running'));
  let globalFree = MAX_RUNNING_GLOBAL - running.length;
  if (globalFree <= 0) return 0;
  const perCourse = new Map<string, number>();
  for (const r of running) perCourse.set(r.courseId, (perCourse.get(r.courseId) ?? 0) + 1);
  const waiting = await db.select().from(schema.mediaJobs).where(eq(schema.mediaJobs.status, 'queued')).orderBy(schema.mediaJobs.createdAt).limit(200);
  const toStart: string[] = [];
  const now = Date.now();
  for (const j of waiting) {
    if (globalFree <= 0) break;
    if (now < retryDueAt(j)) continue;
    const n = perCourse.get(j.courseId) ?? 0;
    if (n >= MAX_RUNNING_PER_COURSE) continue;
    perCourse.set(j.courseId, n + 1);
    globalFree--;
    toStart.push(j.id);
  }
  await Promise.all(toStart.map((id) => processQueuedJob(id).catch((e) => console.error(`[media] falha ao iniciar ${id}:`, e))));
  return toStart.length;
}

/**
 * Colheita de plano único (auditoria P1-10): jobs REAIS em `reconciliation_required`
 * com `externalId` (vídeo pago no HeyGen) e sem saída, dentro da janela de 24 h
 * desde o início. Se o HeyGen terminou, o job volta a `running` e a reconciliação
 * normal baixa e anexa o vídeo — sem novo envio nem nova cobrança. Falha remota
 * ou janela vencida encerram a colheita (`harvestDone`).
 */
export async function harvestSingleShotJobs(limit = 10): Promise<number> {
  const cfg = mediaConfigFromEnv();
  if (!cfg.heygenApiKey || cfg.simulation) return 0;
  const db = getDb();
  const t = schema.mediaJobs;
  const rows = await db
    .select()
    .from(t)
    .where(and(
      eq(t.status, 'reconciliation_required'), eq(t.simulated, 0), sql`${t.externalId} is not null`, sql`${t.outputAssetId} is null`,
      sql`jsonb_typeof(${t.input}->'direction'->'shots') is distinct from 'array'`,
      sql`not coalesce((${t.input}->>'harvestDone')::boolean, false)`,
    ))
    .orderBy(t.updatedAt)
    .limit(limit);
  const heygen = new HeyGenAdapter(cfg.heygenApiKey);
  let harvested = 0;
  for (const job of rows) {
    const input = job.input as { harvestUntil?: string };
    const until = input.harvestUntil ? Date.parse(input.harvestUntil) : (job.startedAt ?? job.createdAt).getTime() + SINGLE_SHOT_HARVEST_WINDOW_MS;
    try {
      if (Date.now() > until) {
        await patchJobInput(job.id, { harvestDone: true });
        console.warn(`[media] job ${job.id}: colheita encerrada após 24 h sem o vídeo ${job.externalId}`);
        continue;
      }
      const v = await heygen.getVideo(job.externalId!);
      if (v.status === 'completed' && v.videoUrl) {
        // reivindica de volta: só um processo finaliza; a reconciliação normal baixa, anexa e marca sucesso
        const [claimed] = await db.update(t).set({ status: 'running', phase: 'downloading', lastError: 'vídeo pronto no HeyGen após o prazo; baixando (sem nova cobrança)', updatedAt: new Date() }).where(and(eq(t.id, job.id), eq(t.status, 'reconciliation_required'))).returning({ id: t.id });
        if (!claimed) continue;
        await reconcileJob(job.id);
        harvested++;
        console.log(`[media] job ${job.id}: vídeo pago ${job.externalId} colhido após o prazo`);
      } else if (v.status === 'failed') {
        await patchJobInput(job.id, { harvestDone: true });
        await media.updateJob(db, job.id, { lastError: `HeyGen falhou após o prazo: ${v.failureCode ?? 'failed'}: ${v.failureMessage ?? 'sem detalhes'}` });
      }
    } catch (e) {
      console.warn(`[media] colheita do job ${job.id} falhou (tenta no próximo ciclo): ${String(e instanceof Error ? e.message : e)}`);
    }
  }
  return harvested;
}

/** Varredura periódica de jobs em execução (fallback aos webhooks) + colheita de clipes já pagos de jobs encerrados. */
export async function pollRunningJobs() {
  const jobs = await media.listRunningJobs(getDb(), 20);
  for (const j of jobs) await reconcileJob(j.id);
  await harvestTerminalDirectedJobs().catch((e) => console.warn(`[media] colheita de clipes falhou: ${String(e)}`));
  await harvestSingleShotJobs().catch((e) => console.warn(`[media] colheita de plano único falhou: ${String(e)}`));
  return jobs.length;
}
