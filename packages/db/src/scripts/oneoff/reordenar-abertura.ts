/** Abertura fora de ordem (apresentação → boas-vindas → missão → "Hoje, vamos…"): o plano do tema passa a vir logo
 * depois da apresentação. Só a ordem dos planos muda (as falas não). [--apply] <curso>… */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const courseId of args.filter((a) => !a.startsWith('--'))) {
      const d = (await getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      const l = doc.modules[0]!.lessons[0]!;
      const node = l.graph.nodes.find((n) => (n as { direction?: unknown }).direction) as unknown as { id: string; narration?: string; direction: { shots: Array<{ id: string; line: string }> } };
      const shots = node.direction.shots;
      const tema = shots.findIndex((s) => /^Hoje, vamos /.test(s.line));
      const bv = shots.findIndex((s) => s.id === 'boasvindas');
      if (tema < 0 || bv < 0 || tema < bv) { console.log(`[ordem] ${courseId}: nada a fazer`); continue; }
      const [t] = shots.splice(tema, 1);
      shots.splice(bv, 0, t!);
      node.narration = shots.map((s) => s.line.trim()).join(' ');
      console.log(`[ordem] ${courseId} ${node.id}: ${shots.map((s) => s.id).join(' > ')}`);
      if (APPLY) {
        const s = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: 'abertura: tema logo depois da apresentação' });
        console.log(`[ordem] ${courseId}: rascunho ${d.revision} → ${s.revision}`);
      }
    }
  } finally { await close(); }
}
main().catch((e) => { console.error(`[ordem] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
