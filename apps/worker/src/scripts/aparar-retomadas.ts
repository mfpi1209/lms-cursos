/**
 * Continuidade (grátis, sem regravar): os vídeos que vêm depois de uma pergunta começavam com
 * "Seja qual for a sua escolha, …" / "Qualquer que tenha sido a sua escolha, …". Agora que cada resposta
 * tem a reação da instrutora em vídeo, essa oração fica redundante e quebra o fluxo. Este script apara só
 * essas palavras (corte no começo do clipe, boca sincronizada), mantendo os ajustes anteriores da cena
 * (cartões, cortes), refaz as legendas e grava no rascunho. Depois: republicar.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/aparar-retomadas.ts <curso> [<curso>…] [--dry-run]
 */
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { adjustScene } from '../adjust';

const LEAD = /^((seja qual for|qualquer que tenha sido|independentemente de qual tenha sido|independente de) (a )?(sua|tua) (escolha|resposta)),\s*/i;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');

async function main() {
  const db = getDb();
  for (const courseId of args.filter((a) => !a.startsWith('--'))) {
    const draft = (await authoring.getDraft(db, courseId))!;
    for (const m of (draft.document as CourseDocument).modules)
      for (const l of m.lessons)
        for (const n of l.graph.nodes) {
          const shots = (n as { direction?: { shots: Array<{ id: string; line: string }> } }).direction?.shots ?? [];
          for (const s of shots) {
            const hit = s.line.match(LEAD);
            if (!hit) continue;
            const words = hit[1]!.trim().split(/\s+/).length;
            if (DRY) { console.log(`[retomada] ${courseId} ${l.id}/${n.id} ${s.id}: tira "${hit[1]}," (${words} palavras)`); continue; }
            try {
              const r = await adjustScene({ courseId, lessonId: l.id, nodeId: n.id, request: { trimLead: [{ shotId: s.id, words }] } });
              console.log(`[retomada] ${courseId} ${l.id}/${n.id}: ${r.durationSeconds.toFixed(1)} s, sem "${hit[1]}"`);
            } catch (e) {
              console.log(`[retomada] ${courseId} ${l.id}/${n.id} ${s.id}: não aparado (${e instanceof Error ? e.message : String(e)})`);
            }
          }
        }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[retomada] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
