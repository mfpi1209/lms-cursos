import { NextResponse } from 'next/server';
import { getDb, media, newId, schema } from '@lms/db';
import { verifyHeyGenWebhookSignature } from '@lms/media';
import { getMediaConfig } from '@/server/media';

export const runtime = 'nodejs';

/**
 * Webhook HeyGen (avatar_video.success / avatar_video.fail). Verifica a
 * assinatura HMAC-SHA256 do corpo bruto com o secret do endpoint; sem secret
 * configurado, recusa (o worker reconcilia por polling de qualquer forma).
 * Idempotente: apenas enfileira uma reconciliação do job correlacionado.
 */
export async function POST(req: Request) {
  const cfg = getMediaConfig();
  const raw = await req.text();
  if (!cfg.heygenWebhookSecret || !verifyHeyGenWebhookSignature(raw, req.headers.get('signature'), cfg.heygenWebhookSecret)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'assinatura inválida' } }, { status: 401 });
  }
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST' } }, { status: 400 });
  }
  const eventType = String(payload?.event_type ?? '');
  const data = payload?.event_data ?? {};
  const db = getDb();
  let job = typeof data.callback_id === 'string' ? await media.getJob(db, data.callback_id) : null;
  if (!job && typeof data.video_id === 'string') job = await media.getJobByExternalId(db, 'heygen', data.video_id);
  if (job && (eventType === 'avatar_video.success' || eventType === 'avatar_video.fail') && (job.status === 'running' || job.status === 'queued')) {
    await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.reconcile', version: 1, payload: { jobId: job.id, eventId: payload.event_id, eventType } });
  }
  return NextResponse.json({ ok: true });
}
