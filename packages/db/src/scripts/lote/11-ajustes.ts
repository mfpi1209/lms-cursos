/**
 * Lote 12 cursos · curso 11: ajustes no RASCUNHO (sem reimportar, sem custo; idempotente).
 *  - paleta invertida do vídeo (`branding.videoPalette`);
 *  - `--kit estudio6-renato`: aplica o kit do Renato (estúdio 6, câmeras, voz, letreiro, elenco) quando pronto.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/11-ajustes.ts [--kit estudio6-renato]
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getCourse, getDraft, saveDraft } from '../../repositories/authoring';
import { documentWithTemplate, stableJson } from '../../repositories/library';

const COURSE_ID = 'crs_u4nfw88a4n2n0ubv';
const PALETTE = { base: '#FF7A08', accent: '#1D1E4C' };

async function main() {
  const argv = process.argv.slice(2);
  const kit = argv.includes('--kit') ? argv[argv.indexOf('--kit') + 1] : undefined;
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const course = await getCourse(db, COURSE_ID);
    if (!course) throw new Error('curso não encontrado');
    const draft = (await getDraft(db, COURSE_ID))!;
    let doc = structuredClone(draft.document) as CourseDocument;
    const notes: string[] = [];
    if (kit) {
      const r = await documentWithTemplate(db, course.workspaceId, doc, kit);
      doc = r.document as CourseDocument;
      notes.push(`kit ${kit}${r.changes.length ? ` (${r.changes.join('; ')})` : ''}`);
    }
    if (stableJson(doc.branding.videoPalette ?? null) !== stableJson(PALETTE)) {
      doc.branding = { ...doc.branding, videoPalette: PALETTE };
      notes.push('paleta invertida');
    }
    if (stableJson(doc) === stableJson(draft.document)) {
      console.log(`[ajustes] nada a mudar (revisão ${draft.revision})`);
      return;
    }
    const saved = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: notes.join(' · ') || 'ajustes' });
    console.log(`[ajustes] revisão ${draft.revision} → ${saved.revision}: ${notes.join(' · ')}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[ajustes] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
