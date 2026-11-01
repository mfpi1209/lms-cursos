import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { getDb, schema, agent } from '@lms/db';
import { aiConfigFromEnv, describeAiMode } from '@lms/ai';
import { describeMediaMode, mediaConfigFromEnv } from '@lms/media';
import { dispatchQueuedJobs, pollRunningJobs, reconcileJob } from './media';
import { processAgentRun } from './agent';
import { ingestSource } from './sources';
import { newRetentionState, runRetentionIfDue } from './retention';

/**
 * Worker do incremento 1: consumidor idempotente do outbox transacional, por
 * polling. BullMQ/Redis entram quando houver jobs de ingestão/geração/mídia
 * (fases A–C). Sem Redis o produto principal continua funcionando.
 */
const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 2000);
const MAX_ATTEMPTS = 5;

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, Handler> = {
  'course.published': async (p) => console.log('[outbox] course.published', p),
  'enrollment.created': async (p) => console.log('[outbox] enrollment.created', p),
  'lesson.completed': async (p) => console.log('[outbox] lesson.completed', p),
  'course.completed': async (p) => console.log('[outbox] course.completed', p),
  'media_job.queued': async () => void (await dispatchQueuedJobs()),
  'media_job.reconcile': async (p) => reconcileJob(String(p.jobId)),
  'media_job.succeeded': async (p) => console.log('[outbox] media_job.succeeded', p),
  'media_job.failed': async (p) => console.log('[outbox] media_job.failed', p),
  'agent_run.queued': async (p) => processAgentRun(String(p.runId)),
  'source.ingest': async (p) => ingestSource(String(p.sourceId)),
};
const MEDIA_POLL_MS = Number(process.env.MEDIA_POLL_MS ?? 15000);
const SWEEP_MS = 60_000;
const RUN_MAX_AGE_MS = Number(process.env.AGENT_RUN_MAX_AGE_MS ?? 15 * 60 * 1000);
const SOURCE_MAX_AGE_MS = 30 * 60 * 1000;

async function processBatch(): Promise<number> {
  const db = getDb();
  const pending = await db
    .select()
    .from(schema.outboxEvents)
    .where(and(isNull(schema.outboxEvents.processedAt), lt(schema.outboxEvents.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(schema.outboxEvents.createdAt))
    .limit(20);
  // Eventos lentos (chamadas a provedores) rodam em paralelo com limite; os demais em sequência.
  const SLOW = new Set(['agent_run.queued', 'media_job.queued', 'media_job.reconcile', 'source.ingest']);
  const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
  const slow: typeof pending = [];
  for (const ev of pending) {
    if (SLOW.has(ev.type)) slow.push(ev);
    else await handleOne(ev);
  }
  for (let i = 0; i < slow.length; i += CONCURRENCY) await Promise.all(slow.slice(i, i + CONCURRENCY).map(handleOne));
  return pending.length;
}

async function handleOne(ev: typeof schema.outboxEvents.$inferSelect) {
  const db = getDb();
  // reivindica o evento atomicamente: dois workers nunca processam o mesmo evento
  const claimed = await db
    .update(schema.outboxEvents)
    .set({ processedAt: new Date() })
    .where(and(eq(schema.outboxEvents.id, ev.id), isNull(schema.outboxEvents.processedAt)))
    .returning({ id: schema.outboxEvents.id });
  if (claimed.length === 0) return;
  const handler = handlers[ev.type];
  try {
    if (handler) {
      console.log(`[outbox] ${ev.type} ${ev.id}`);
      await handler(ev.payload);
    } else console.warn(`[outbox] sem handler para ${ev.type}; marcando como processado`);
  } catch (e) {
    // devolve à fila com tentativa contada
    await db
      .update(schema.outboxEvents)
      .set({ processedAt: null, attempts: sql`${schema.outboxEvents.attempts} + 1`, lastError: String(e) })
      .where(eq(schema.outboxEvents.id, ev.id));
  }
}

async function main() {
  console.log(`[worker] iniciado; polling do outbox a cada ${POLL_MS}ms`);
  // modo resolvido (demo/real), só nomes — nunca chaves
  console.log(`[worker] ${describeAiMode(aiConfigFromEnv())}`);
  console.log(`[worker] ${describeMediaMode(mediaConfigFromEnv())}`);
  let stopping = false;
  process.on('SIGTERM', () => (stopping = true));
  process.on('SIGINT', () => (stopping = true));
  let lastMediaPoll = 0;
  let lastSweep = 0;
  const retentionState = newRetentionState();
  while (!stopping) {
    try {
      if (Date.now() - lastSweep > SWEEP_MS) {
        lastSweep = Date.now();
        const db = getDb();
        const stale = await agent.sweepStaleRuns(db, RUN_MAX_AGE_MS);
        if (stale.length) console.warn(`[sweep] ${stale.length} execução(ões) do agente marcadas como falhas por tempo`);
        const srcs = await db
          .update(schema.sourceDocuments)
          .set({ status: 'failed', error: 'processamento interrompido (worker reiniciado?)', processedAt: new Date() })
          .where(and(eq(schema.sourceDocuments.status, 'processing'), lt(schema.sourceDocuments.createdAt, new Date(Date.now() - SOURCE_MAX_AGE_MS))))
          .returning({ id: schema.sourceDocuments.id });
        if (srcs.length) console.warn(`[sweep] ${srcs.length} fonte(s) marcadas como falhas por tempo`);
      }
      // retenção de dados (LGPD / Marco Civil): diária, nunca lança
      await runRetentionIfDue(retentionState);
      if (Date.now() - lastMediaPoll > MEDIA_POLL_MS) {
        lastMediaPoll = Date.now();
        await pollRunningJobs();
        await dispatchQueuedJobs();
      }
      const n = await processBatch();
      if (n === 0) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (e) {
      console.error('[worker] erro no ciclo', e);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
  console.log('[worker] encerrado');
}

main();
