/**
 * Lote 12: ajustes de dados no rascunho (nada pago). Tira do elenco a entrada
 * "Helena — Personagem de exemplo (fictício)" que o importador criou a partir da linha
 * "Personagens de exemplo" (a instrutora entra pelo kit). Idempotente.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/12-ajustes.ts
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE = 'crs_5vccpfypr6fmxojb';
async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE))!;
    const doc = structuredClone(draft.document) as CourseDocument;
    const before = doc.cast.length;
    doc.cast = doc.cast.filter((c) => !(c.name === 'Helena' && c.role.startsWith('Personagem de exemplo')));
    if (doc.cast.length === before) return console.log(`[12] elenco já certo (rev ${draft.revision})`);
    const r = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'elenco: Helena não é personagem de exemplo' });
    console.log(`[12] rev ${draft.revision} → ${r.revision}: elenco ${doc.cast.map((c) => c.name).join(', ')}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
