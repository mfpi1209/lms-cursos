/**
 * Uma vez (31/10): grava em `media.adjust` o ajuste fino que o script `ajuste-fino.ts` aplicou ANTES de o
 * estado ficar guardado na mídia: cortes/planos tirados (reconstruídos do rascunho) e o cartão
 * "Pergunta a seguir" (lido do log do lote). Só dado no rascunho: nada é remontado nem republicado.
 * Sem isso, um ajuste novo pela tela voltaria ao cartão da gravação original.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/backfill-ajuste.ts docs/qa/lote/ajuste-fino.log [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { loadSceneAdjust } from '../adjust';

const [logFile] = process.argv.slice(2);
const DRY = process.argv.includes('--dry-run');

async function main() {
  const teasers = new Map<string, string>(); // "curso aula/nó" → cartão (última ocorrência)
  for (const line of readFileSync(logFile!, 'utf8').split('\n')) {
    const m = line.match(/^\[ajuste\] (\S+) (\S+\/\S+): .*cartão: "(.*)"; volume/);
    if (m) teasers.set(`${m[1]} ${m[2]}`, m[3]!);
  }
  const nodes = new Map<string, string[]>(); // curso → ["aula/nó"]
  for (const line of readFileSync(logFile!, 'utf8').split('\n')) {
    const m = line.match(/^\[ajuste\] (\S+) (\S+\/\S+): /);
    if (m && !(nodes.get(m[1]!) ?? []).includes(m[2]!)) nodes.set(m[1]!, [...(nodes.get(m[1]!) ?? []), m[2]!]);
  }
  const db = getDb();
  for (const [courseId, list] of nodes) {
    const states = new Map<string, unknown>();
    for (const where of list) {
      const [lessonId, nodeId] = where.split('/') as [string, string];
      const c = await loadSceneAdjust(courseId, lessonId, nodeId);
      if (c.node.media?.adjust) continue;
      const teaser = teasers.get(`${courseId} ${where}`);
      states.set(where, { ...c.current, ...(teaser !== undefined ? { teaser } : {}) });
    }
    console.log(`[backfill] ${courseId}: ${states.size} vídeo(s)${DRY ? ' (--dry-run)' : ''}`);
    if (DRY || !states.size) continue;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const d = (await authoring.getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      for (const m of doc.modules)
        for (const l of m.lessons)
          for (const n of l.graph.nodes) {
            const st = states.get(`${l.id}/${n.id}`);
            const md = (n as { media?: Record<string, unknown> }).media;
            if (st && md && !md.adjust) md.adjust = st;
          }
      try {
        await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `ajuste fino já aplicado registrado na mídia (${states.size})` });
        break;
      } catch (e) {
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[backfill] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
