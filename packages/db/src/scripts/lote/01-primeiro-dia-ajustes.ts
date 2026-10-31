/**
 * Lote 01 (Primeiro dia): ajustes de texto no rascunho SEM reimportar (os vídeos pagos ficam):
 *  - Q03: a pergunta não repete "O transporte parou." depois da situação;
 *  - M02: rótulo da lacuna "previsao" → "previsão".
 * Só mexe em cenas sem vídeo. Idempotente; não gera nem cobra nada.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/01-primeiro-dia-ajustes.ts
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE = 'crs_99hpdsc8w88osiuh';

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE);
    if (!draft) throw new Error('rascunho não encontrado');
    const doc = structuredClone(draft.document) as any;
    const changes: string[] = [];
    for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
      if (n.id === 'q03') {
        for (const p of n.prompt.content) for (const t of p.content ?? []) if (t.text === 'O transporte parou. Como você avisa?') { t.text = 'Como você avisa?'; changes.push('q03 pergunta'); }
      }
      if (n.id === 'm02') for (const slot of n.scaffold?.slots ?? []) if (slot.label === 'previsao') { slot.label = 'previsão'; changes.push('m02 rótulo'); }
    }
    if (!changes.length) { console.log(`nada a ajustar (revisão ${draft.revision})`); return; }
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const saved = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: draft.revision, userId: author!.id, origin: 'script', note: `Lote 01: ajustes de texto (${changes.join(', ')})` });
    console.log(`ajustes ${changes.join(', ')}: revisão ${draft.revision} → ${saved.revision}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
