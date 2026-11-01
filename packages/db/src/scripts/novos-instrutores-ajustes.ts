/**
 * Pacote-15, depois de aplicar os kits dos 4 instrutores novos nos 12 cursos (só dados, nada pago; idempotente):
 *  1. devolve a vinheta a `lesson_end` (o kit `marca-dnawork` traz `course_end` e desfaria o ajuste do lote);
 *  2. troca só o NOME na abertura da aula 1 ("Oi! Eu sou a Patrícia, sua orientadora…" → "Oi! Eu sou o Mauro, seu orientador…"),
 *     nas duas ocorrências (fala do plano e narração), para o instrutor que aparece ser o que se apresenta.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/novos-instrutores-ajustes.ts
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const NEW: Record<string, { name: string; art: 'a' | 'o'; poss: 'sua' | 'seu'; role: 'orientadora' | 'orientador'; courses: string[] }> = {
  mauro: { name: 'Mauro', art: 'o', poss: 'seu', role: 'orientador', courses: ['crs_t303ykqfmhj3yb1g', 'crs_2rt2rsoii8bpydp2', 'crs_5k5upah2xphlfvi5'] },
  lais: { name: 'Laís', art: 'a', poss: 'sua', role: 'orientadora', courses: ['crs_tg9iqz8wmmf5pw77', 'crs_au1463izc386by27', 'crs_m60hsx8on6ebcyqg'] },
  vinicius: { name: 'Vinícius', art: 'o', poss: 'seu', role: 'orientador', courses: ['crs_4jh683s5h351z2db', 'crs_njtlqq7y7fyfeqcr', 'crs_gl0hjkmqfgnnur9y'] },
  flavia: { name: 'Flávia', art: 'a', poss: 'sua', role: 'orientadora', courses: ['crs_dp9s7pdro9j6e3m0', 'crs_0ua5onij460lpzs0', 'crs_d5rsi8gt36rv0qbq'] },
};
const OPENING = /Eu sou (?:a|o) [^\s,]+, s(?:ua|eu) orientad(?:ora|or)\b/g;

function swap(node: unknown, to: string, counter: { n: number }): unknown {
  if (typeof node === 'string') return node.replace(OPENING, () => { counter.n++; return to; });
  if (Array.isArray(node)) return node.map((x) => swap(x, to, counter));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v, to, counter)]));
  return node;
}

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const p of Object.values(NEW)) {
      const to = `Eu sou ${p.art} ${p.name}, ${p.poss} ${p.role}`;
      for (const courseId of p.courses) {
        const draft = (await getDraft(db, courseId))!;
        const doc = structuredClone(draft.document) as CourseDocument;
        const notes: string[] = [];
        if (doc.branding.bumper && doc.branding.bumper.playOn?.join() !== 'lesson_end') {
          doc.branding = { ...doc.branding, bumper: { ...doc.branding.bumper, playOn: ['lesson_end'] } };
          notes.push('vinheta volta a lesson_end');
        }
        const c = { n: 0 };
        doc.modules = swap(doc.modules, to, c) as CourseDocument['modules'];
        if (c.n) notes.push(`abertura: "${to}" (${c.n} ocorrências)`);
        if (!notes.length) { console.log(`[ajustes] ${courseId}: nada a mudar`); continue; }
        const r = await saveDraft(db, { courseId, document: doc, expectedRevision: draft.revision, userId: draft.updatedBy, origin: 'script', note: notes.join(' · ') });
        console.log(`[ajustes] ${courseId}: revisão ${draft.revision} → ${r.revision}: ${notes.join(' · ')}`);
      }
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(`[ajustes] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
