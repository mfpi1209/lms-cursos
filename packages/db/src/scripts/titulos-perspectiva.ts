/**
 * Perguntas com o caso em 3ª pessoa e as opções em 1ª ("Eu…"): o título passa a "No lugar da X, o que você…?"
 * (o aluno responde como a personagem; a reação da instrutora já fala com ele). Só texto de tela; a fala gravada
 * (`bridge.call`) não muda. Grátis.
 * <titulos.json>: { "curso/aula/pergunta": "novo título" }. Em conflito de revisão (outro processo gravando o rascunho), relê e tenta de novo.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/titulos-perspectiva.ts <titulos.json> [--apply]
 */
import { readFileSync } from 'node:fs';
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../client';
import { DomainError } from '../errors';
import { getDraft, saveDraft } from '../repositories/authoring';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const map = JSON.parse(readFileSync(args.find((a) => !a.startsWith('--'))!, 'utf8')) as Record<string, string>;

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const byCourse = new Map<string, Array<[string, string, string]>>();
    for (const [k, title] of Object.entries(map)) {
      const [c, l, n] = k.split('/') as [string, string, string];
      byCourse.set(c, [...(byCourse.get(c) ?? []), [l, n, title]]);
    }
    for (const [courseId, items] of byCourse) {
      // conflito de revisão (outro agente grava títulos nos mesmos rascunhos): relê e reaplica, até 6 vezes
      for (let attempt = 1; ; attempt++) {
        const d = (await getDraft(db, courseId))!;
        const doc = structuredClone(d.document) as CourseDocument;
        let n = 0;
        const lines: string[] = [];
        for (const [lessonId, nodeId, title] of items) {
          const node = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.graph.nodes.find((x) => x.id === nodeId);
          if (!node || node.type !== 'choice') { lines.push(`[perspectiva] ${courseId}/${lessonId}/${nodeId}: pergunta não encontrada`); continue; }
          if (node.title !== title) { lines.push(`[perspectiva] ${courseId}/${lessonId}/${nodeId}: "${node.title}" → "${title}"`); node.title = title; n++; }
        }
        if (attempt === 1) lines.forEach((l) => console.log(l));
        if (!APPLY || !n) break;
        try {
          const saved = await saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `perguntas no lugar da personagem: ${n} título(s)` });
          console.log(`[perspectiva] ${courseId}: rascunho ${d.revision} → ${saved.revision}`);
          break;
        } catch (e) {
          if (e instanceof DomainError && e.code === 'CONFLICT' && attempt < 6) {
            console.log(`[perspectiva] ${courseId}: conflito de revisão, relendo (tentativa ${attempt})`);
            await new Promise((r) => setTimeout(r, 800 * attempt));
            continue;
          }
          throw e;
        }
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => { console.error(`[perspectiva] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
