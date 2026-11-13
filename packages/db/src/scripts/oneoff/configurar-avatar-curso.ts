/**
 * Ajusta o motor/expressividade/mãos paradas da apresentação de UM curso (rascunho), sem custo.
 *   tsx packages/db/src/scripts/oneoff/configurar-avatar-curso.ts <curso> <avatar_iv|avatar_iii> <low|medium|high> <maos-paradas:sim|nao>
 */
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

async function main() {
  const [courseId, engine, expr, still] = process.argv.slice(2);
  if (!courseId || !['avatar_iv', 'avatar_iii'].includes(engine ?? '') || !['low', 'medium', 'high'].includes(expr ?? '') || !['sim', 'nao'].includes(still ?? '')) throw new Error('uso: <curso> <avatar_iv|avatar_iii> <low|medium|high> <sim|nao>');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId))!;
    const doc = structuredClone(draft.document) as typeof draft.document & { presentation: Record<string, unknown> };
    doc.presentation = { ...doc.presentation, avatarEngine: engine as 'avatar_iii' | 'avatar_iv', expressiveness: expr as 'low' | 'medium' | 'high', handsStill: still === 'sim' };
    const r = await saveDraft(db, { courseId, document: doc as never, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: `avatar: ${engine}, ${expr}, mãos paradas ${still}` });
    console.log(`[avatar] ${courseId} revisão ${draft.revision} → ${r.revision}: ${engine}, ${expr}, mãos paradas ${still}`);
  } finally { await close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
