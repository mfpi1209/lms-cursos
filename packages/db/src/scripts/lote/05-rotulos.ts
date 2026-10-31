/**
 * Curso 05 "Horário é combinado": rótulos das lacunas das missões com acento (o importador usa o id da
 * lacuna como rótulo: "Escolha horario:"). Só texto das missões (sem vídeo); nada pago.
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/05-rotulos.ts
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE_ID = 'crs_4tj8a3q3g9gudgb7';
const LABELS: Record<string, string> = { horario: 'horário', periodo: 'período' };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, COURSE_ID))!;
    const doc = structuredClone(draft.document);
    const changed: string[] = [];
    for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
      if (n.type !== 'reflection' || !n.scaffold) continue;
      for (const s of n.scaffold.slots) if (LABELS[s.id] && s.label !== LABELS[s.id]) { s.label = LABELS[s.id]!; changed.push(`${n.id}/${s.id}`); }
    }
    if (!changed.length) return console.log('rótulos já corrigidos; nada gravado');
    const r = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Rótulos das lacunas com acento (lote 05)' });
    console.log(`rótulos: ${changed.join(', ')}; revisão ${draft.revision} → ${r.revision}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
