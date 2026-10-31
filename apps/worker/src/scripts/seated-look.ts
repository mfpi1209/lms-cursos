/**
 * Teste APROVADO pelo autor (2026-10-24): gera o visual "sentada à mesa" da Marina
 * no HeyGen real (1 geração paga) e grava a câmera no rascunho do Pode entrar.
 * Idempotente: Idempotency-Key estável; se a câmera já existe, só consulta o status.
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/seated-look.ts
 */
import { createDb, authoring } from '@lms/db';
import { buildCameraPrompt, HeyGenLooksAdapter, lookIdempotencyKey } from '@lms/media';
import type { CourseDocument } from '@lms/course-schema';

const COURSE_ID = 'crs_7vbrb49jkq23ibiw';
const WORKSPACE_ID = 'wsp_eogwtp01f358wyof';
const SEATED_ID = 'cam_sentada';
const EXTRA = 'Sentada à mesa de reunião, plano médio, de frente, mãos sobre a mesa, mesmo escritório';

async function main() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY ausente');
  if (process.env.MEDIA_SIMULATION === '1') throw new Error('MEDIA_SIMULATION=1: este script é só para a geração real aprovada');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const gen = new HeyGenLooksAdapter(key);
  try {
    const save = async (mut: (d: CourseDocument) => void, note: string) => {
      const draft = await authoring.getDraft(db, COURSE_ID);
      if (!draft) throw new Error('rascunho não encontrado');
      const doc = structuredClone(draft.document) as CourseDocument;
      mut(doc);
      const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note });
      console.log(`[sentada] rascunho ${draft.revision} → ${r.revision}`);
      return doc;
    };
    let draft = (await authoring.getDraft(db, COURSE_ID))!;
    const pres = draft.document.presentation!;
    const mainLook = pres.avatarId!;
    let cam = pres.cameras?.find((c) => c.id === SEATED_ID);
    if (!cam) {
      const prompt = buildCameraPrompt({ angle: 'front', framing: 'medium', extra: EXTRA });
      const idem = lookIdempotencyKey(WORKSPACE_ID, mainLook, prompt);
      const { generationId } = await gen.generateLookFromPrompt({ sourceLookId: mainLook, prompt, aspectRatio: '16:9', idempotencyKey: idem, name: 'Câmera IA (sentada à mesa)' });
      console.log(`[sentada] geração criada: ${generationId}`);
      await save((d) => {
        const p = d.presentation!;
        const cams = p.cameras ?? [];
        // a principal (primeira) continua sendo o visual em pé atual, com a posição do curso
        if (!cams.some((c) => c.lookId === mainLook)) cams.unshift({ id: 'cam_principal', name: 'Câmera principal', lookId: mainLook, previewUrl: p.avatarPreviewUrl, nativeFraming: 'medium', angle: 'front', status: 'ready' } as any);
        cams.push({ id: SEATED_ID, name: 'Sentada à mesa', lookId: generationId, nativeFraming: 'medium', angle: 'front', status: 'generating', generationId, generationPrompt: EXTRA, sourceLookId: mainLook, placement: 'full_frame' } as any);
        p.cameras = cams;
      }, 'câmera "Sentada à mesa" (geração HeyGen aprovada)');
      draft = (await authoring.getDraft(db, COURSE_ID))!;
      cam = draft.document.presentation!.cameras!.find((c) => c.id === SEATED_ID)!;
    }
    if (cam.status === 'ready') { console.log(`[sentada] já pronta: ${cam.lookId}`); return; }
    const generationId = cam.generationId!;
    for (let i = 0; i < 120; i++) {
      const r = await gen.getLookGeneration(generationId);
      if (r.status === 'completed') {
        await save((d) => {
          const c = d.presentation!.cameras!.find((x) => x.id === SEATED_ID)!;
          c.status = 'ready'; c.lookId = r.lookId ?? generationId; if (r.previewUrl) c.previewUrl = r.previewUrl;
        }, 'câmera "Sentada à mesa" pronta');
        console.log(`[sentada] pronta: look ${r.lookId}; motores: ${(r.supportedEngines ?? []).join(',') || '—'}`);
        console.log(`[sentada] preview: ${r.previewUrl ?? '—'}`);
        return;
      }
      if (r.status === 'failed') {
        await save((d) => { const c = d.presentation!.cameras!.find((x) => x.id === SEATED_ID)!; c.status = 'failed'; c.generationError = (r.error ?? 'falha').slice(0, 500); }, 'câmera "Sentada à mesa" falhou');
        throw new Error(`geração falhou: ${r.error}`);
      }
      if (i % 6 === 0) console.log(`[sentada] status: ${r.status}…`);
      await new Promise((res) => setTimeout(res, 5000));
    }
    console.log('[sentada] ainda processando após 10 min; rode de novo para continuar consultando');
  } finally { await close(); }
}
main().catch((e) => { console.error(`[sentada] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
