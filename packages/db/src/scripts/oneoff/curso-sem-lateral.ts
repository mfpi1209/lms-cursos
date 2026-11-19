/**
 * Tira a câmera de lado (3/4) de um curso: cada plano nela passa para a câmera de FRENTE que não está nos planos
 * vizinhos (esq ↔ dir), para não fundir tomadas e manter o reaproveitamento das tomadas de frente já pagas; o avatar
 * principal (cenas de plano único, reações) passa a ser a câmera de frente da esquerda. Sem custo.
 *   tsx packages/db/src/scripts/oneoff/curso-sem-lateral.ts <curso> <cam_lateral> <cam_esq> <cam_dir> [--confirmar]
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

type Shot = { id: string; cameraId?: string | null };
async function main() {
  const [courseId, side, esq, dir] = process.argv.slice(2);
  const confirm = process.argv.includes('--confirmar');
  if (!courseId || !side || !esq || !dir) throw new Error('uso: <curso> <cam_lateral> <cam_esq> <cam_dir> [--confirmar]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId))!;
    const doc = structuredClone(draft.document) as unknown as { presentation: { avatarId?: string; cameras: Array<{ id: string; lookId: string }> }; modules: Array<{ lessons: Array<{ id: string; graph: { nodes: Array<{ id: string; direction?: { shots?: Shot[] } }> } }> }> };
    const cams = doc.presentation.cameras;
    const look = (id: string) => cams.find((c) => c.id === id)?.lookId;
    if (!look(side) || !look(esq) || !look(dir)) throw new Error('câmera não encontrada na apresentação');
    let changed = 0, conflicts = 0;
    for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
      const shots = n.direction?.shots; if (!shots?.length) continue;
      const main = (s: Shot) => s.cameraId ?? look(side) === doc.presentation.avatarId ? (s.cameraId ?? side) : s.cameraId;
      for (let i = 0; i < shots.length; i++) {
        if ((shots[i]!.cameraId ?? side) !== side) continue;
        // vizinhos efetivos (já trocados à esquerda; à direita, o primeiro que não é lateral)
        const prev = i > 0 ? shots[i - 1]!.cameraId : undefined;
        let next: string | null | undefined; for (let j = i + 1; j < shots.length; j++) if ((shots[j]!.cameraId ?? side) !== side) { next = shots[j]!.cameraId; break; }
        const used = new Set([prev, next].filter(Boolean));
        let pick = !used.has(esq) ? esq : !used.has(dir) ? dir : esq;
        if (prev === pick) pick = pick === esq ? dir : esq; // nunca repetir a câmera do plano anterior
        if (used.has(pick)) conflicts++;
        shots[i]!.cameraId = pick; changed++;
        void main;
      }
    }
    doc.presentation.avatarId = look(esq);
    console.log(`[sem-lateral] planos trocados: ${changed}; casos em que encosta numa tomada vizinha: ${conflicts}; avatar principal → ${esq}`);
    if (!confirm) { console.log('[sem-lateral] SECO: nada gravado (use --confirmar)'); return; }
    const r = await saveDraft(db, { courseId, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `sem câmera lateral (${side} → ${esq}/${dir})` });
    console.log(`[sem-lateral] revisão ${draft.revision} → ${r.revision}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
