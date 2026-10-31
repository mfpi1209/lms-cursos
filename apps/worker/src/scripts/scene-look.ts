/**
 * Teste APROVADO pelo autor (2026-10-29): gera o visual da Marina DENTRO da recepção DNA Work
 * (imagem de referência pública no Drive), ângulo 3/4, e grava a câmera `cam_cenario_34`
 * (full_frame) no rascunho do Pode entrar. 1 geração paga; idempotente.
 */
import { createDb, authoring } from '@lms/db';
import { buildSceneLookPrompt, HeyGenLooksAdapter, lookIdempotencyKey } from '@lms/media';
import type { CourseDocument } from '@lms/course-schema';

const COURSE_ID = 'crs_7vbrb49jkq23ibiw';
const WORKSPACE_ID = 'wsp_eogwtp01f358wyof';
const ANGLE = (process.argv[2] ?? 'three_quarter') as 'three_quarter' | 'front' | 'close';
const CAM_ID = process.argv[3] ?? 'cam_cenario_34';
const CAM_NAME = process.argv[4] ?? 'No cenário · 3/4';
const POSITION = (process.argv[5] ?? 'center') as 'center' | 'left_third' | 'right_third';
const REF_FILE = process.argv[6] ?? '/Users/marcelopinheiro/Documents/lms-cursos/docs/brand/cenario/recepcao-dnawork-sem-balcao.png';
const SCENERY_TEXT = process.argv[7];
import { readFileSync } from 'node:fs';
// imagem embutida (base64, PNG 2,2 MB): dispensa URL pública
const REF = { base64: readFileSync(REF_FILE).toString('base64'), mediaType: 'image/png' };
const SCENERY = 'DNA Work reception: light textured wall with an embossed DNA WORK sign, vertical wooden slats with warm LED strips, a large green plant, wooden shelves with books';

async function main() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY ausente');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const gen = new HeyGenLooksAdapter(key);
  try {
    const save = async (mut: (d: CourseDocument) => void, note: string) => {
      const draft = (await authoring.getDraft(db, COURSE_ID))!;
      const doc = structuredClone(draft.document) as CourseDocument;
      mut(doc);
      const r = await authoring.saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note });
      console.log(`[cenario] rascunho ${draft.revision} → ${r.revision}`);
    };
    let draft = (await authoring.getDraft(db, COURSE_ID))!;
    const pres = draft.document.presentation!;
    const mainLook = pres.avatarId!;
    let cam = pres.cameras?.find((c) => c.id === CAM_ID);
    if (!cam) {
      const prompt = buildSceneLookPrompt({ angle: ANGLE, scenery: SCENERY_TEXT ?? SCENERY, pronoun: 'she', position: POSITION });
      const idem = lookIdempotencyKey(WORKSPACE_ID, mainLook, prompt, [REF]);
      console.log(`[cenario] prompt (${prompt.length} chars): ${prompt}`);
      const { generationId } = await gen.generateLookFromPrompt({ sourceLookId: mainLook, prompt, aspectRatio: '16:9', idempotencyKey: idem, name: `${CAM_NAME} (recepção DNA Work)`, referenceImages: [REF] });
      console.log(`[cenario] geração criada: ${generationId}`);
      await save((d) => {
        const p = d.presentation!;
        p.cameras = [...(p.cameras ?? []), { id: CAM_ID, name: CAM_NAME, lookId: generationId, nativeFraming: ANGLE === 'close' ? 'close' : 'medium', angle: ANGLE === 'three_quarter' ? 'left' : 'front', status: 'generating', generationId, generationPrompt: `Dentro da recepção DNA Work, ${CAM_NAME} (imagem de referência)`, sourceLookId: mainLook, placement: 'full_frame' } as any];
      }, `câmera "${CAM_NAME}" (geração HeyGen aprovada, imagem de referência)`);
      draft = (await authoring.getDraft(db, COURSE_ID))!;
      cam = draft.document.presentation!.cameras!.find((c) => c.id === CAM_ID)!;
    }
    if (cam.status === 'ready') { console.log(`[cenario] já pronta: ${cam.lookId}`); return; }
    const generationId = cam.generationId!;
    for (let i = 0; i < 120; i++) {
      const r = await gen.getLookGeneration(generationId);
      if (r.status === 'completed') {
        await save((d) => { const c = d.presentation!.cameras!.find((x) => x.id === CAM_ID)!; c.status = 'ready'; c.lookId = r.lookId ?? generationId; if (r.previewUrl) c.previewUrl = r.previewUrl; }, `câmera "${CAM_NAME}" pronta`);
        console.log(`[cenario] pronta: look ${r.lookId}; motores: ${(r.supportedEngines ?? []).join(',') || '—'}`);
        console.log(`[cenario] preview: ${(r.previewUrl ?? '—').replace(/(Signature|Key-Pair-Id)=[^&]*/g, '$1=…')}`);
        return;
      }
      if (r.status === 'failed') {
        await save((d) => { const c = d.presentation!.cameras!.find((x) => x.id === CAM_ID)!; c.status = 'failed'; c.generationError = (r.error ?? 'falha').slice(0, 500); }, `câmera "${CAM_NAME}" falhou`);
        throw new Error(`geração falhou: ${r.error}`);
      }
      if (i % 6 === 0) console.log(`[cenario] status: ${r.status}…`);
      await new Promise((res) => setTimeout(res, 5000));
    }
    console.log('[cenario] ainda processando após 10 min; rode de novo para continuar');
  } finally { await close(); }
}
main().catch((e) => { console.error(`[cenario] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
