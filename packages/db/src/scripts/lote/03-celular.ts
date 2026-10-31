/**
 * Lote 12 cursos — 03 Celular no trabalho (crs_hd4jnnpx3oj0xf14).
 * `--show`: imprime instrutor, pronome, marca e falas/planos do rascunho.
 * `--palette`: grava branding.videoPalette invertida (nova revisão; não reimporta, não mexe em vídeo).
 */
import { createDb } from '../../client';
import { eq } from 'drizzle-orm';
import * as s from '../../schema';
import { getDraft, saveDraft } from '../../repositories/authoring';

const COURSE = 'crs_hd4jnnpx3oj0xf14';
const PALETTE = { base: '#FF7A08', accent: '#1D1E4C' };

async function main() {
  const args = new Set(process.argv.slice(2));
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE);
    if (!draft) throw new Error('rascunho não encontrado');
    const doc = draft.document as any;
    if (args.has('--show')) {
      const p = doc.presentation;
      console.log('rev', draft.revision, '| avatar', p.avatarName, '| pronome', p.presenterPronoun, '| voz', p.voiceName ?? p.voiceId, '| câmeras', p.cameras.map((c: any) => `${c.id}:${c.status}`).join(','));
      console.log('cast', JSON.stringify(doc.cast ?? doc.presenter ?? null));
      console.log('branding', JSON.stringify(doc.branding));
      for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) {
        console.log(`\n[${l.id}/${n.id}] ${n.type} ${n.title ?? ''}`);
        if (n.narration) console.log('  fala:', n.narration);
        if (n.bridge) console.log('  bridge:', JSON.stringify(n.bridge));
        for (const s of n.direction?.shots ?? []) console.log(`   - ${s.id} ${s.layout} ${s.cameraId ?? ''} ${s.framing ?? ''} | ${s.line ?? ''} ${s.chips ? JSON.stringify(s.chips) : ''}`);
      }
    }
    if (args.has('--palette')) {
      if (JSON.stringify(doc.branding?.videoPalette) === JSON.stringify(PALETTE)) console.log('paleta já aplicada');
      else {
        doc.branding = { ...doc.branding, videoPalette: PALETTE };
        const saved = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: draft.revision, userId: (await db.select({ u: s.courses.createdBy }).from(s.courses).where(eq(s.courses.id, COURSE)))[0]!.u, origin: 'script', note: 'Lote 03: paleta invertida (videoPalette)' });
        console.log('paleta aplicada: revisão', saved.revision);
      }
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
