/**
 * Tira as avaliações de fim de módulo das aulas (decisão do autor: "Tirar das aulas"; a verificação passa a ser a
 * checagem final da trilha, que dá o Selo). Quem chegava na avaliação vai direto para o fim normal da aula; o fim
 * "revisar" (só para quem errava a avaliação) e as avaliações saem. Grátis; muda a estrutura das aulas.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/remover-avaliacoes.ts [--apply] <curso>…
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
type E = { id: string; from: string; to: string; [k: string]: unknown };
type N = { id: string; type: string };

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    for (const courseId of args.filter((a) => !a.startsWith('--'))) {
      const d = (await getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      let changed = 0;
      for (const l of doc.modules.flatMap((m) => m.lessons)) {
        const g = l.graph as unknown as { startNodeId: string; nodes: N[]; edges: E[] };
        const av = new Set(g.nodes.filter((n) => n.type === 'assessment').map((n) => n.id));
        if (!av.size) continue;
        // fim normal: o fim alcançado pelas saídas das avaliações que não é o de "revisar"
        const ends = [...new Set(g.edges.filter((e) => av.has(e.from) && !av.has(e.to)).map((e) => e.to))];
        const normal = ends.find((id) => !/revisar/.test(id)) ?? ends[0];
        if (!normal) throw new Error(`${courseId}/${l.id}: fim normal não encontrado`);
        const entries = g.edges.filter((e) => !av.has(e.from) && av.has(e.to));
        for (const e of entries) e.to = normal;
        g.edges = g.edges.filter((e) => !av.has(e.from) && !av.has(e.to));
        g.nodes = g.nodes.filter((n) => !av.has(n.id));
        // nós que ficaram inalcançáveis (o fim "revisar") saem
        const reach = new Set<string>([g.startNodeId]);
        for (let grew = true; grew; ) { grew = false; for (const e of g.edges) if (reach.has(e.from) && !reach.has(e.to)) { reach.add(e.to); grew = true; } }
        const orphans = g.nodes.filter((n) => !reach.has(n.id)).map((n) => n.id);
        g.nodes = g.nodes.filter((n) => reach.has(n.id));
        g.edges = g.edges.filter((e) => reach.has(e.from) && reach.has(e.to));
        console.log(`[avaliações] ${courseId}/${l.id}: −${av.size} pergunta(s) de avaliação; ${entries.map((e) => e.from).join(',')} → ${normal}${orphans.length ? `; saem: ${orphans.join(',')}` : ''}`);
        changed++;
      }
      if (APPLY && changed) {
        const s = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `avaliações de módulo retiradas (${changed} aula(s)); a verificação é a checagem final da trilha` });
        console.log(`[avaliações] ${courseId}: rascunho ${d.revision} → ${s.revision}`);
      }
    }
  } finally { await close(); }
}
main().catch((e) => { console.error(`[avaliações] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
