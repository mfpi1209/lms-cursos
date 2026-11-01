/**
 * Título de cada grupo nas atividades "Na prática" (campo opcional `question` da lacuna): sem ele, o player
 * mostra "Escolha a parte N". Só texto, grátis, nada a regravar. Entrada: "curso/aula/nó" → { lacuna: pergunta }.
 *
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/perguntas-grupos.ts <perguntas.json> [--apply]
 */
import { readFileSync } from 'node:fs';
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { getDraft, saveDraft } from '../repositories/authoring';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const map = JSON.parse(readFileSync(args.find((a) => !a.startsWith('--'))!, 'utf8')) as Record<string, Record<string, string>>;

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const byCourse = new Map<string, Array<[string, string, Record<string, string>]>>();
    for (const [k, v] of Object.entries(map)) {
      const [c, l, n] = k.split('/') as [string, string, string];
      byCourse.set(c, [...(byCourse.get(c) ?? []), [l, n, v]]);
    }
    for (const [courseId, items] of byCourse) {
      const d = (await getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      let n = 0;
      for (const [lessonId, nodeId, qs] of items) {
        const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
        const node = lesson?.graph.nodes.find((x) => x.id === nodeId) as { scaffold?: { slots: Array<{ id: string; question?: string }> } } | undefined;
        if (!node?.scaffold) { console.log(`[grupos] ${courseId}/${lessonId}/${nodeId}: sem atividade; pulei`); continue; }
        for (const s of node.scaffold.slots) {
          const q = qs[s.id];
          if (q && s.question !== q) { s.question = q; n++; }
        }
      }
      if (APPLY && n) {
        const saved = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `títulos dos grupos nas atividades: ${n}` });
        console.log(`[grupos] ${courseId}: ${n} título(s); rascunho ${d.revision} → ${saved.revision}`);
      } else console.log(`[grupos] ${courseId}: ${n} título(s)${APPLY ? '' : ' (só a lista)'}`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[grupos] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
