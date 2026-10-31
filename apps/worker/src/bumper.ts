import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, media, newId, schema } from '@lms/db';
import { BUMPER_RENDERER_VERSION, bumperJobCourseId, bumperSpecHash, getStorage, isBumperJobInput, type BumperAspect, type BumperJobInput, type BumperSpec } from '@lms/media';
import { renderBumper } from '@lms/media/compose';
import { fail, readAsset, storeGeneratedAsset } from './media';

/**
 * Job de VINHETA DE MARCA (`input.kind = 'bumper'`): renderização local
 * (resvg + ffmpeg), custo 0, nenhum provedor. Roda até num worker em modo de
 * demonstração, como a remontagem. Produz o 16:9 e, se pedido, o 9:16 juntos;
 * cada saída vira um asset do workspace com `metadata.bumper`. Vinheta com o
 * mesmo hash já guardada no workspace é reaproveitada sem novo render.
 */
export const BUMPER_JOB_NOTE = 'Vinheta renderizada localmente (resvg + ffmpeg); nenhum provedor chamado';
const MAX_ATTEMPTS = 3;
/** job de vinheta em `running` sem atualização há mais tempo que isto: o worker morreu no meio; volta para a fila */
export const BUMPER_STALE_MS = 10 * 60 * 1000;

export function isBumperJob(job: Pick<media.MediaJobRow, 'input'>): boolean {
  return isBumperJobInput(job.input);
}

/** O asset do arquivo de áudio (quando `audio.kind = 'file'`) existe no workspace, é áudio e está legível? */
export async function bumperMissingAssets(job: Pick<media.MediaJobRow, 'workspaceId' | 'input'>): Promise<string | null> {
  const input = job.input as unknown as BumperJobInput;
  if (input.spec.audio.kind !== 'file') return null;
  const id = input.spec.audio.assetId;
  const a = id ? await media.getAsset(getDb(), id) : null;
  if (!a || a.workspaceId !== job.workspaceId || a.kind !== 'audio') return `áudio ${id ?? '?'} não encontrado no workspace`;
  try {
    const storage = await getStorage();
    let bytes = 0;
    for await (const c of storage.getStream(a.storageKey, { start: 0, end: 15 })) bytes += (c as Uint8Array).byteLength;
    if (bytes === 0) return `áudio ${a.id} vazio no storage`;
  } catch (e) {
    return `áudio ${a.id} ilegível no storage: ${String(e instanceof Error ? e.message : e)}`;
  }
  return null;
}

async function storageReadable(storageKey: string): Promise<boolean> {
  try {
    const storage = await getStorage();
    const info = await storage.head(storageKey);
    return !!info && info.sizeBytes > 0;
  } catch {
    return false;
  }
}

/** Marca `assetId` como vinheta padrão da proporção (desmarca as demais do workspace). */
export async function setDefaultBumper(workspaceId: string, assetId: string, aspect: BumperAspect) {
  const db = getDb();
  const t = schema.assets;
  await db
    .update(t)
    .set({ metadata: sql`jsonb_set(${t.metadata}, '{bumper,default}', 'false'::jsonb, true)` })
    .where(and(eq(t.workspaceId, workspaceId), sql`${t.metadata}->'bumper'->>'aspect' = ${aspect}`, sql`coalesce((${t.metadata}->'bumper'->>'default')::boolean, false)`));
  await db.update(t).set({ metadata: sql`jsonb_set(${t.metadata}, '{bumper,default}', 'true'::jsonb, true)` }).where(eq(t.id, assetId));
}

/** Renderiza (ou reaproveita) a vinheta numa proporção e devolve o asset. */
async function produceAspect(job: media.MediaJobRow, spec: BumperSpec, aspect: BumperAspect, opts: { name?: string; audioPath?: string; force?: boolean }, dir: string) {
  const db = getDb();
  const full: BumperSpec = { ...spec, aspect, ...(opts.audioPath ? { audio: { kind: 'file', path: opts.audioPath, assetId: spec.audio.kind === 'file' ? spec.audio.assetId : undefined } } : {}) };
  const hash = bumperSpecHash(full);
  if (!opts.force) {
    const existing = await media.findBumperByHash(db, job.workspaceId, hash, aspect);
    if (existing && (await storageReadable(existing.storageKey))) {
      console.log(`[media] job ${job.id}: vinheta ${aspect} reaproveitada (${existing.id}, mesmo hash)`);
      return { asset: existing, reused: true };
    }
  }
  const out = path.join(dir, `bumper-${aspect.replace(':', 'x')}.mp4`);
  const r = await renderBumper(full, { output: out, workDir: path.join(dir, `work-${aspect.replace(':', 'x')}`) });
  const { logoLight: _l, logoDark: _d, ...specForMeta } = full;
  const audioMeta = full.audio.kind === 'file' ? { kind: 'file', assetId: full.audio.assetId } : full.audio;
  const asset = await storeGeneratedAsset({
    workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(out)), durationSeconds: r.durationSec, createdBy: job.createdBy,
    metadata: { bumper: { spec: { ...specForMeta, audio: audioMeta }, hash, aspect, durationSec: r.durationSec, ...(opts.name ? { name: opts.name } : {}) } },
  });
  return { asset, reused: false };
}

/**
 * Processa um job de vinheta: reivindica (queued -> running), renderiza as
 * proporções pedidas, guarda os assets (16:9 aponta para o 9:16 em
 * `verticalAssetId`), aplica "padrão do workspace" se pedido e marca sucesso.
 * Falha de render é definitiva (determinística; nada foi cobrado).
 */
export async function processBumperJob(jobId: string) {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job || job.status !== 'queued' || !isBumperJob(job)) return;
  const missing = await bumperMissingAssets(job);
  if (missing) {
    const [row] = await db.update(schema.mediaJobs).set({ status: 'failed', phase: 'failed', lastError: `vinheta impossível: ${missing}`, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'queued'))).returning({ id: schema.mediaJobs.id });
    if (row) await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.failed', version: 1, payload: { jobId, error: missing } });
    return;
  }
  const [running] = await db
    .update(schema.mediaJobs)
    .set({ status: 'running', attempts: job.attempts + 1, startedAt: job.startedAt ?? new Date(), phase: 'composing', updatedAt: new Date() })
    .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'queued')))
    .returning();
  if (!running) return;
  await runBumperJob(running);
}

async function runBumperJob(job: media.MediaJobRow) {
  const db = getDb();
  const input = job.input as unknown as BumperJobInput;
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-bumper-'));
  try {
    let audioPath: string | undefined;
    if (input.spec.audio.kind === 'file' && input.spec.audio.assetId) {
      const a = (await media.getAsset(db, input.spec.audio.assetId))!;
      audioPath = path.join(dir, `audio.${a.mimeType === 'audio/wav' ? 'wav' : a.mimeType === 'audio/ogg' ? 'ogg' : 'mp3'}`);
      await writeFile(audioPath, await readAsset(a.storageKey));
    }
    const aspects: BumperAspect[] = input.aspects?.length ? Array.from(new Set(input.aspects)) : ['16:9'];
    const produced: Partial<Record<BumperAspect, { asset: media.AssetRow; reused: boolean }>> = {};
    for (const aspect of aspects) {
      produced[aspect] = await produceAspect(job, input.spec, aspect, { name: input.name, audioPath, force: input.force }, dir);
      await media.updateJob(db, job.id, { phase: 'composing', lastError: `vinheta ${aspect} pronta` });
    }
    const main = produced['16:9'] ?? produced[aspects[0]!]!;
    const vertical = produced['9:16'];
    if (vertical && main.asset.id !== vertical.asset.id && main.asset.metadata?.bumper) {
      await media.setAssetMetadata(db, main.asset.id, { ...main.asset.metadata, bumper: { ...main.asset.metadata.bumper, verticalAssetId: vertical.asset.id } });
    }
    if (input.setDefault) {
      for (const aspect of aspects) {
        const p = produced[aspect];
        if (p) await setDefaultBumper(job.workspaceId, p.asset.id, aspect);
      }
    }
    const outputs = Object.fromEntries(aspects.map((a) => [a, { assetId: produced[a]!.asset.id, reused: produced[a]!.reused }]));
    await db.update(schema.mediaJobs).set({ input: sql`${schema.mediaJobs.input} || ${JSON.stringify({ outputs })}::jsonb`, updatedAt: new Date() }).where(eq(schema.mediaJobs.id, job.id));
    const [ok] = await db
      .update(schema.mediaJobs)
      .set({ status: 'succeeded', phase: 'done', outputAssetId: main.asset.id, finishedAt: new Date(), lastError: BUMPER_JOB_NOTE, costActualUsd: 0, updatedAt: new Date() })
      .where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running')))
      .returning({ id: schema.mediaJobs.id });
    if (!ok) return;
    await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.succeeded', version: 1, payload: { jobId: job.id, assetId: main.asset.id, bumper: true } });
    console.log(`[media] job ${job.id} concluído: vinheta ${aspects.join(' + ')} -> ${main.asset.id}${vertical ? ` / ${vertical.asset.id}` : ''}`);
  } catch (e) {
    await fail({ ...job, attempts: MAX_ATTEMPTS }, `vinheta falhou: ${String(e instanceof Error ? e.message : e)}`, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Reconciliação: job de vinheta parado em `running` (worker reiniciado) volta para a fila. */
export async function reconcileBumperJob(job: media.MediaJobRow) {
  if (Date.now() - job.updatedAt.getTime() < BUMPER_STALE_MS) return;
  const db = getDb();
  if (job.attempts >= MAX_ATTEMPTS) {
    await fail(job, 'vinheta interrompida repetidas vezes (worker reiniciado?)', false);
    return;
  }
  const [row] = await db.update(schema.mediaJobs).set({ status: 'queued', phase: 'waiting', updatedAt: new Date(), lastError: 'render interrompido; reenfileirado' }).where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running'))).returning({ id: schema.mediaJobs.id });
  if (row) await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { jobId: job.id, retry: true } });
}

export { BUMPER_RENDERER_VERSION, bumperJobCourseId };
