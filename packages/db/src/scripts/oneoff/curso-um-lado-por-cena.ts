/**
 * Um lado por cena: todos os planos de cada cena dirigida ficam na MESMA câmera (uma tomada contínua, sem corte);
 * as cenas alternam esquerda/direita na ordem da aula. Sem custo.
 *   tsx …/curso-um-lado-por-cena.ts <curso> <cam_esq> <cam_dir> [--confirmar]
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
async function main() {
  const [courseId, esq, dir] = process.argv.slice(2);
  const confirm = process.argv.includes('--confirmar');
  if (!courseId || !esq || !dir) throw new Error('uso: <curso> <cam_esq> <cam_dir> [--confirmar]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId))!;
    const doc = structuredClone(draft.document) as unknown as { modules: Array<{ lessons: Array<{ id: string; graph: { nodes: Array<{ id: string; direction?: { shots?: Array<{ cameraId?: string | null; transitionIn?: string }> } }> } }> }> };
    let scenes = 0, shots = 0;
    for (const m of doc.modules) for (const l of m.lessons) {
      let side = 0;
      for (const n of l.graph.nodes) {
        const s = n.direction?.shots; if (!s?.length) continue;
        const cam = side % 2 === 0 ? esq : dir; side++;
        for (const sh of s) { sh.cameraId = cam; sh.transitionIn = 'cut'; shots++; }
        scenes++;
      }
    }
    console.log(`[um-lado] ${scenes} cenas dirigidas, ${shots} planos; alternando ${esq} / ${dir} por cena`);
    if (!confirm) { console.log('[um-lado] SECO: nada gravado'); return; }
    const r = await saveDraft(db, { courseId, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'um lado por cena (tomada contínua), alternando por cena' });
    console.log(`[um-lado] revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
