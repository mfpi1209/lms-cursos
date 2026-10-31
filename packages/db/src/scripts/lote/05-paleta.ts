/**
 * Curso 05 "Horário é combinado": paleta invertida nos vídeos (branding.videoPalette). Só dados, nada pago.
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/05-paleta.ts
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE_ID = 'crs_4tj8a3q3g9gudgb7';
const PALETTE = { base: '#FF7A08', accent: '#1D1E4C' };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE_ID))!;
    const doc = structuredClone(draft.document);
    if (JSON.stringify(doc.branding.videoPalette ?? null) === JSON.stringify(PALETTE)) return console.log('paleta já aplicada; nada gravado');
    doc.branding = { ...doc.branding, videoPalette: PALETTE };
    const r = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Paleta invertida nos vídeos (lote 05)' });
    console.log(`paleta invertida: revisão ${draft.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
