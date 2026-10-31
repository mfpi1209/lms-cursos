/**
 * Lote 12 cursos: aplica um kit da biblioteca (instrutor, voz, câmeras, letreiro, elenco; direção remapeada
 * por zona) e a paleta do vídeo no RASCUNHO de um curso. Só dados, nada pago; idempotente.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/aplicar-kit.ts <curso> <kit> <classica|invertida>
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getCourse, getDraft, saveDraft } from '../../repositories/authoring';
import { documentWithTemplate, stableJson } from '../../repositories/library';

const PALETTES = {
  classica: { base: '#1D1E4C', accent: '#FF7A08' },
  invertida: { base: '#FF7A08', accent: '#1D1E4C' },
} as const;

async function main() {
  const [courseId, kit, paletteName] = process.argv.slice(2);
  const palette = PALETTES[paletteName as keyof typeof PALETTES];
  if (!courseId || !kit || !palette) throw new Error('uso: aplicar-kit.ts <curso> <kit> <classica|invertida>');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const course = await getCourse(db, courseId);
    if (!course) throw new Error(`curso ${courseId} não encontrado`);
    const draft = (await getDraft(db, courseId))!;
    const r = await documentWithTemplate(db, course.workspaceId, structuredClone(draft.document), kit);
    const doc = r.document as CourseDocument;
    const notes = [`kit ${kit}${r.changes.length ? ` (${r.changes.join('; ')})` : ''}`];
    if (stableJson(doc.branding.videoPalette ?? null) !== stableJson(palette)) {
      doc.branding = { ...doc.branding, videoPalette: { ...palette } };
      notes.push(`paleta ${paletteName}`);
    }
    if (stableJson(doc) === stableJson(draft.document)) {
      console.log(`[kit] ${courseId}: nada a mudar (revisão ${draft.revision})`);
      return;
    }
    const saved = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: notes.join(' · ') });
    console.log(`[kit] ${courseId}: revisão ${draft.revision} → ${saved.revision}: ${notes.join(' · ')}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[kit] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
