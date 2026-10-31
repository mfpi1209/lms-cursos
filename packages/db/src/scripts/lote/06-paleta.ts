/**
 * Curso 06 "Liberdade e intimidade": paleta clássica nos vídeos (branding.videoPalette). Só dados, nada pago.
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/06-paleta.ts
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE_ID = 'crs_b8zeh4b2gguseghq';
const PALETTE = { base: '#1D1E4C', accent: '#FF7A08' };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE_ID))!;
    const doc = structuredClone(draft.document);
    if (JSON.stringify(doc.branding.videoPalette ?? null) === JSON.stringify(PALETTE)) return console.log('paleta já aplicada; nada gravado');
    doc.branding = { ...doc.branding, videoPalette: PALETTE };
    const r = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Paleta clássica nos vídeos (lote 06)' });
    console.log(`paleta clássica: revisão ${draft.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
