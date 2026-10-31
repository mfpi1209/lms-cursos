/**
 * Lote 09 (Redes sociais): ajustes no RASCUNHO sem reimportar (preserva vídeos).
 *  --paleta   branding.videoPalette invertida (véu laranja, destaque marinho)
 *  --kit      aplica o kit estudio8-enzo (estúdio 8, Enzo, voz Matheus, direção) ao rascunho
 *  --rotulos  rótulos das partes das missões com acento (o importador usa o id: "conteudo", "autorizacao")
 *  --elenco   tira o Enzo repetido como "Personagem de exemplo" (veio da linha de personagens do roteiro)
 * Uso: set -a; . ./.env; set +a; ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/09-ajustes.ts --paleta [--kit]
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';
import { applyTemplateToCourse } from '../../repositories/library';

const COURSE = 'crs_gjn468p3y6hwua4f';
const WS = 'wsp_eogwtp01f358wyof';

async function main() {
  const argv = process.argv.slice(2);
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    if (argv.includes('--kit')) {
      const d = await getDraft(db, COURSE);
      const r = await applyTemplateToCourse(db, { workspaceId: WS, courseId: COURSE, templateIdOrKey: 'estudio8-enzo', userId: d!.updatedBy, expectedRevision: d!.revision });
      console.log('[09] kit estudio8-enzo aplicado:', JSON.stringify(r).slice(0, 300));
    }
    if (argv.includes('--rotulos')) {
      const LABELS: Record<string, string> = { conteudo: 'conteúdo', autorizacao: 'autorização', cuidado: 'cuidado', problema: 'problema', procedimento: 'procedimento' };
      const d = await getDraft(db, COURSE);
      const doc = structuredClone(d!.document) as CourseDocument;
      let n = 0;
      for (const m of doc.modules) for (const l of m.lessons) for (const node of l.graph.nodes) {
        const sc = (node as { scaffold?: { slots?: { id: string; label?: string }[] } }).scaffold;
        for (const s of sc?.slots ?? []) if (LABELS[s.id] && s.label !== LABELS[s.id]) { s.label = LABELS[s.id]; n++; }
      }
      if (!n) console.log('[09] rótulos: nada a mudar');
      else {
        const r = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: d!.revision, userId: d!.updatedBy, origin: 'script', note: 'Rótulos das missões com acento (lote 09)' });
        console.log(`[09] rótulos: ${n} trocados; revisão ${d!.revision} → ${r.revision}`);
      }
    }
    if (argv.includes('--elenco')) {
      const d = await getDraft(db, COURSE);
      const doc = structuredClone(d!.document) as CourseDocument;
      const before = doc.cast?.length ?? 0;
      doc.cast = (doc.cast ?? []).filter((c) => !(c.name === 'Enzo' && /exemplo/i.test(c.role ?? '')));
      if (doc.cast.length === before) console.log('[09] elenco: nada a tirar');
      else {
        const r = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: d!.revision, userId: d!.updatedBy, origin: 'script', note: 'Elenco: Enzo só como orientador (lote 09)' });
        console.log(`[09] elenco: revisão ${d!.revision} → ${r.revision}`);
      }
    }
    if (argv.includes('--paleta')) {
      const d = await getDraft(db, COURSE);
      const doc = structuredClone(d!.document) as CourseDocument;
      doc.branding = { ...doc.branding, videoPalette: { base: '#FF7A08', accent: '#1D1E4C' } };
      const r = await saveDraft(db, { courseId: COURSE, document: doc, expectedRevision: d!.revision, userId: d!.updatedBy, origin: 'script', note: 'Paleta invertida (lote 09)' });
      console.log(`[09] paleta: revisão ${d!.revision} → ${r.revision}`);
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
