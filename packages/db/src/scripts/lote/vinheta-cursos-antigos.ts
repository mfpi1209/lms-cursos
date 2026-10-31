/**
 * Vinheta de assinatura DNA Work (a mesma dos 12 cursos do lote) no fim do curso, para os cursos
 * que ficaram sem: Primeira Vaga e Comece bem. Só dados, nada pago; idempotente.
 *   set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/vinheta-cursos-antigos.ts
 */
import { ilike, or } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';

const BUMPER = { playOn: ['course_end'], assetId: 'ast_17oyy1lw72w7sf0m', skippable: true, assetIdVertical: 'ast_qmrfu37duif3vaoy' };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const rows = await db.select({ id: s.courses.id, title: s.courses.title }).from(s.courses).where(or(ilike(s.courses.title, 'Primeira Vaga%'), ilike(s.courses.title, 'Comece bem%')));
    for (const c of rows) {
      const draft = (await getDraft(db, c.id))!;
      const doc = structuredClone(draft.document) as any;
      if (JSON.stringify(doc.branding?.bumper ?? null) === JSON.stringify(BUMPER)) { console.log(`${c.title}: já tem a vinheta`); continue; }
      doc.branding = { ...doc.branding, bumper: BUMPER };
      const r = await saveDraft(db, { courseId: c.id, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: 'Vinheta DNA Work no fim do curso' });
      console.log(`${c.title} (${c.id}): revisão ${draft.revision} → ${r.revision}, vinheta no fim do curso`);
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
