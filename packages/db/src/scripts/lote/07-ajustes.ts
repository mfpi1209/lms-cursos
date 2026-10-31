/**
 * Lote 12 cursos · curso 07: ajustes no rascunho (só dados, nada pago).
 *
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/07-ajustes.ts paleta
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/07-ajustes.ts kit
 *
 * `paleta`: branding.videoPalette invertida (véu laranja, título e ícones roxo-marinho).
 * `kit`: aplica o kit `estudio7-gustavo` (instrutor, voz, câmeras, letreiro, elenco).
 * `rotulos`: acentua os rótulos das lacunas da missão 2 (mudança, decisão), que o aluno vê.
 */
import { eq } from 'drizzle-orm';
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { applyTemplateToCourse } from '../../repositories/library';

export const COURSE_ID = 'crs_bmf11akamtxoti28';
const WORKSPACE = 'wsp_eogwtp01f358wyof';
const PALETTE = { base: '#FF7A08', accent: '#1D1E4C' };

async function main() {
  const mode = process.argv[2];
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const userId = author!.id;
    const draft = (await getDraft(db, COURSE_ID))!;
    if (mode === 'paleta') {
      const doc = structuredClone(draft.document) as CourseDocument;
      if (JSON.stringify(doc.branding.videoPalette) === JSON.stringify(PALETTE)) return console.log('[07] paleta já aplicada');
      doc.branding.videoPalette = PALETTE;
      const r = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId, origin: 'script', note: 'Paleta invertida (lote 07)' });
      console.log(`[07] paleta invertida: revisão ${draft.revision} → ${r.revision}`);
    } else if (mode === 'kit') {
      const r = await applyTemplateToCourse(db, { workspaceId: WORKSPACE, courseId: COURSE_ID, templateIdOrKey: 'estudio7-gustavo', userId, expectedRevision: draft.revision });
      console.log('[07] kit aplicado:', JSON.stringify(r, null, 1).slice(0, 1500));
    } else if (mode === 'rotulos') {
      // O player mostra o rótulo da lacuna ("Escolha mudanca:"); o importador usa o nome do marcador, sem acento.
      const FIX: Record<string, string> = { mudanca: 'mudança', decisao: 'decisão' };
      const doc = structuredClone(draft.document) as CourseDocument;
      const changes: string[] = [];
      for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
        if (n.type !== 'reflection' || !n.scaffold) continue;
        for (const slot of n.scaffold.slots) if (FIX[slot.label]) { changes.push(`${n.id}: ${slot.label} → ${FIX[slot.label]}`); slot.label = FIX[slot.label]!; }
      }
      if (!changes.length) return console.log('[07] rótulos já corrigidos');
      const r = await saveDraft(db, { courseId: COURSE_ID, document: doc, expectedRevision: draft.revision, userId, origin: 'script', note: 'Rótulos das lacunas com acento (lote 07)' });
      console.log(`[07] ${changes.join('; ')} · revisão ${draft.revision} → ${r.revision}`);
    } else throw new Error('modo: paleta | kit | rotulos');
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
