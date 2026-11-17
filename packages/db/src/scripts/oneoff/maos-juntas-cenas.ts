/** Mãos juntas (sem gesticular) em todos os planos das cenas dadas — contra acessório inventado pelo HeyGen ao abrir as mãos.
 *  Só muda `motionPrompt` dos planos dessas cenas (as demais cenas ficam iguais). Sem custo; a geração vem depois.
 *  tsx …/maos-juntas-cenas.ts <curso> <cena,cena> [câmera: troca a câmera da cena inteira, um lado por cena] */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
const CLASPED = 'keeps both hands loosely clasped together in front of the waist the whole time, no hand gestures, nods slightly, warm smile';
async function main() {
  const [courseId, list, cameraId] = process.argv.slice(2);
  const ids = new Set((list ?? '').split(',').filter(Boolean));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId!))!;
    const doc = structuredClone(draft.document) as unknown as { modules: Array<{ lessons: Array<{ graph: { nodes: Array<{ id: string; direction?: { shots?: Array<{ motionPrompt?: string }> } }> } }> }> };
    let n = 0;
    for (const m of doc.modules) for (const l of m.lessons) for (const node of l.graph.nodes) {
      if (!ids.has(node.id)) continue;
      for (const s of node.direction?.shots ?? []) { s.motionPrompt = CLASPED; if (cameraId) (s as { cameraId?: string }).cameraId = cameraId; n++; }
    }
    if (!n) throw new Error('nenhum plano encontrado');
    const r = await saveDraft(db, { courseId: courseId!, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `mãos juntas: ${[...ids].join(',')}` });
    console.log(`[mãos juntas] ${n} planos em ${[...ids].join(',')}; revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
