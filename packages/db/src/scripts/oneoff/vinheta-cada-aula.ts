/** Vinheta no fim de CADA aula (pedido do autor: "ao final das aulas completas, antes do aluno responder"). Grátis.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/vinheta-cada-aula.ts <curso>… [--apply] */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
function walk(o: unknown): number {
  if (!o || typeof o !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (k === 'playOn' && Array.isArray(v) && !(v.length === 1 && v[0] === 'lesson_end')) { (o as Record<string, unknown>)[k] = ['lesson_end']; n++; }
    else n += walk(v);
  }
  return n;
}
async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const courseId of args.filter((a) => !a.startsWith('--'))) {
      const d = (await getDraft(db, courseId))!;
      const doc = structuredClone(d.document);
      const n = walk(doc);
      if (APPLY && n) {
        const s = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'vinheta no fim de cada aula' });
        console.log(`[vinheta] ${courseId}: ${n} ajuste(s); rascunho ${d.revision} → ${s.revision}`);
      } else console.log(`[vinheta] ${courseId}: ${n} ajuste(s)`);
    }
  } finally { await close(); }
}
main().catch((e) => { console.error(`[vinheta] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
