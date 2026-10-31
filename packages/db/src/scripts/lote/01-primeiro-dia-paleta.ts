/**
 * Lote 01 (Primeiro dia): aplica a paleta INVERTIDA dos vídeos ao rascunho
 * (`branding.videoPalette = { base: #FF7A08, accent: #1D1E4C }`). O importador
 * não tem opção para isso e reimportar apaga a paleta: rode de novo após cada
 * reimportação. Idempotente; não gera nem cobra nada.
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/01-primeiro-dia-paleta.ts
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE = 'crs_99hpdsc8w88osiuh';
const PALETTE = { base: '#FF7A08', accent: '#1D1E4C' };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE);
    if (!draft) throw new Error('rascunho não encontrado');
    const cur = draft.document.branding?.videoPalette;
    if (cur?.base === PALETTE.base && cur?.accent === PALETTE.accent) {
      console.log(`paleta já aplicada (revisão ${draft.revision})`);
      return;
    }
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const doc = structuredClone(draft.document);
    doc.branding = { ...doc.branding, videoPalette: PALETTE };
    const saved = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: draft.revision, userId: author!.id, origin: 'script', note: 'Lote 01: paleta invertida dos vídeos' });
    console.log(`paleta invertida aplicada: revisão ${draft.revision} → ${saved.revision}`);
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
