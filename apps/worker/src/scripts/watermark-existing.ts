/**
 * Marca d'água nos vídeos de plano único JÁ gerados de um curso (gerados antes de o worker gravar o
 * logo nesses clipes). Sem provedor, custo 0: baixa nada de fora, lê o vídeo guardado, grava o logo
 * (ffmpeg local, 1920×1080) num asset NOVO e troca o `assetId` da cena no rascunho (o original pago
 * continua guardado; `generatedFrom` é mantido, então o vídeo não fica desatualizado).
 * Só mexe em cenas cujo job não era montado (sem direção) e não tinha marca d'água.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/watermark-existing.ts <curso> [--dry-run]
 */
import { authoring, createDb, media } from '@lms/db';
import { allLessons, type CourseDocument } from '@lms/course-schema';
import { resolveWatermark } from '@lms/media';
import { burnWatermarkBytes } from '../watermark-clip';
import { readAsset, storeGeneratedAsset } from '../media';

const COURSE_ID = process.argv[2];
const DRY = process.argv.includes('--dry-run');
const tag = '[marca]';

async function main() {
  if (!COURSE_ID) throw new Error('uso: watermark-existing.ts <curso> [--dry-run]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await authoring.getDraft(db, COURSE_ID);
    if (!draft) throw new Error(`rascunho de ${COURSE_ID} não encontrado`);
    const doc = draft.document as CourseDocument;
    const wm = resolveWatermark(doc.branding?.watermark, process.env.PLATFORM_BRAND);
    if (!wm) {
      console.log(`${tag} curso sem marca d'água (desligada ou marca sem logo); nada a fazer`);
      return;
    }
    const swaps = new Map<string, string>(); // `${aula}/${nó}` -> asset novo
    for (const l of allLessons(doc)) {
      for (const n of l.graph.nodes) {
        const m = (n as { media?: { assetId: string; kind: string; generatedFrom?: { jobId: string; simulated?: boolean } } }).media;
        if (!m || m.kind !== 'video' || !m.generatedFrom?.jobId || m.generatedFrom.simulated) continue;
        const job = await media.getJob(db, m.generatedFrom.jobId);
        const input = (job?.input ?? {}) as { direction?: unknown; watermark?: unknown; script?: string };
        if (!job || input.direction || input.watermark) continue; // montado (já tem) ou já pedido com marca d'água
        const asset = await media.getAsset(db, m.assetId);
        if (!asset || asset.kind !== 'video') continue;
        if (DRY) {
          console.log(`${tag} ${l.id}/${n.id}: receberia a marca d'água (${asset.id})`);
          continue;
        }
        const bytes = await burnWatermarkBytes(await readAsset(asset.storageKey), wm);
        if (!bytes) continue;
        const marked = await storeGeneratedAsset({ workspaceId: asset.workspaceId, kind: 'video', mime: 'video/mp4', bytes, durationSeconds: asset.durationSeconds ?? undefined, transcript: input.script, createdBy: job.createdBy });
        swaps.set(`${l.id}/${n.id}`, marked.id);
        console.log(`${tag} ${l.id}/${n.id}: ${asset.id} → ${marked.id}`);
      }
    }
    if (DRY || !swaps.size) {
      console.log(`${tag} ${DRY ? '--dry-run: nada gravado' : 'nenhum vídeo de plano único sem marca d\'água'}`);
      return;
    }
    // grava num rascunho fresco (só troca o assetId das cenas tratadas)
    const fresh = (await authoring.getDraft(db, COURSE_ID))!;
    const next = structuredClone(fresh.document) as CourseDocument;
    for (const l of allLessons(next)) {
      for (const n of l.graph.nodes) {
        const id = swaps.get(`${l.id}/${n.id}`);
        const m = (n as { media?: { assetId: string } }).media;
        if (id && m) m.assetId = id;
      }
    }
    const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: next, expectedRevision: fresh.revision, userId: fresh.updatedBy, origin: 'script', note: `marca d'água em ${swaps.size} vídeo(s) de plano único (sem custo)` });
    console.log(`${tag} ${swaps.size} vídeo(s) com marca d'água; rascunho ${fresh.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(`${tag} erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
