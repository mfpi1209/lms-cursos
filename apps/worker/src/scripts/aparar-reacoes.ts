/**
 * Ajuste fino SEM CUSTO das reações às respostas: apara a interjeição de abertura repetida
 * ("Boa escolha!", "Isso mesmo!", "Exatamente!", "Quase lá.") quando ela já apareceu antes no
 * mesmo curso. A primeira vez de cada uma fica (a instrutora não perde o calor); as repetições
 * começam direto no conteúdo (`trimReactionOpener`, o mesmo do botão do estúdio). Nenhum provedor.
 *
 * Uso (raiz):
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/aparar-reacoes.ts <curso> [<curso>…] [--dry-run]
 */
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { reactionOpener } from '@lms/media';
import { AdjustError, trimReactionOpener } from '../adjust';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const COURSES = args.filter((a) => !a.startsWith('--'));

async function course(courseId: string) {
  const draft = (await authoring.getDraft(getDb(), courseId))!;
  const seen = new Set<string>();
  let n = 0;
  for (const m of (draft.document as CourseDocument).modules)
    for (const l of m.lessons)
      for (const node of l.graph.nodes) {
        if (node.type !== 'choice') continue;
        for (const o of node.options as unknown as Array<{ id: string; reaction?: { text: string; media?: { kind: string } } }>) {
          const opener = reactionOpener(o.reaction?.text);
          if (!opener || o.reaction?.media?.kind !== 'video') continue;
          if (!seen.has(opener)) { seen.add(opener); continue; }
          const key = `${l.id}/${node.id}~${o.id}`;
          try {
            const r = await trimReactionOpener({ courseId, lessonId: l.id, choiceId: node.id, optionId: o.id, dryRun: DRY });
            console.log(`[reação] ${courseId} ${key}: ${DRY ? 'tira' : 'sem'} "${r.opener}" (corta ${r.cutAt.toFixed(2)} s)`);
            n++;
          } catch (e) {
            if (!(e instanceof AdjustError)) throw e;
            console.log(`[reação] ${courseId} ${key}: ${e.message}; fica como está`);
          }
        }
      }
  console.log(`[reação] ${courseId}: ${n} ${DRY ? 'a aparar (--dry-run)' : 'aparadas'}`);
}

async function main() {
  if (!COURSES.length) throw new Error('uso: aparar-reacoes.ts <curso> [<curso>…] [--dry-run]');
  for (const c of COURSES) await course(c);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[reação] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
