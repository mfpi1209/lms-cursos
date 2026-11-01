/**
 * Depois de regravar cenas (revisão de roteiro), reaplica o ajuste fino que elas tinham (grátis):
 *  - cartão de próxima pergunta (teaser): sempre;
 *  - tirar plano / cortar frase / aparar a abertura: só nos planos cuja fala NÃO mudou (o corte é por frase/palavra).
 * Entradas: o ajuste antigo de cada cena (<ajustes.json>: "curso/aula/cena" → {drop, cut, teaser}) e as falas
 * antigas dos planos (<falas.json>: "curso/aula/cena" → {plano: fala}). Só mexe em cenas já regravadas.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/reaplicar-ajustes.ts <ajustes.json> <falas.json> [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { authoring, getDb } from '@lms/db';
import { mediaSceneOf, findLesson, type CourseDocument } from '@lms/course-schema';
import type { AdjustRequest } from '@lms/media';
import { adjustScene } from '../../adjust';

type Saved = { drop?: string[]; cut?: Record<string, { first: number; last: number; lead?: number }>; teaser?: string | null };
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const [aFile, lFile] = args.filter((a) => !a.startsWith('--'));
const saved = JSON.parse(readFileSync(aFile!, 'utf8')) as Record<string, Saved>;
const oldLines = JSON.parse(readFileSync(lFile!, 'utf8')) as Record<string, Record<string, string>>;
const same = (a?: string, b?: string) => !!a && !!b && a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

async function main() {
  const db = getDb();
  const docs = new Map<string, CourseDocument>();
  for (const [key, adj] of Object.entries(saved)) {
    const [courseId, lessonId, nodeId] = key.split('/') as [string, string, string];
    if (!docs.has(courseId)) docs.set(courseId, (await authoring.getDraft(db, courseId))!.document as CourseDocument);
    const found = findLesson(docs.get(courseId)!, lessonId);
    const node = found ? (mediaSceneOf(found.lesson.graph, nodeId) as unknown as { media?: { stale?: boolean; adjust?: unknown; generatedFrom?: { jobId?: string } }; direction?: { shots: Array<{ id: string; line: string }> } }) : null;
    if (!node?.media || node.media.stale) { console.log(`[reaplicar] ${key}: ainda não regravada; pulei`); continue; }
    if (node.media.adjust) { console.log(`[reaplicar] ${key}: já tem ajuste; pulei`); continue; }
    const now = Object.fromEntries((node.direction?.shots ?? []).map((s) => [s.id, s.line]));
    const was = oldLines[key] ?? {};
    // cena com planos novos (boas-vindas, aviso da missão, apresentação juntada): a abertura foi reescrita e os
    // cortes antigos (feitos para encurtar a abertura antiga) não valem mais; fica só o cartão
    const rewritten = Object.keys(now).some((id) => !(id in was) && !/^chamada/.test(id));
    const keep = (id: string) => !rewritten && same(now[id], was[id]);
    const req: AdjustRequest = {};
    const skipped: string[] = [];
    const drop = (adj.drop ?? []).filter((id) => (keep(id) ? true : (skipped.push(`tirar ${id}${rewritten ? ' (abertura nova)' : ''}`), false)));
    if (drop.length) req.drop = drop;
    const cut: NonNullable<AdjustRequest['cut']> = [];
    const trimLead: NonNullable<AdjustRequest['trimLead']> = [];
    for (const [id, c] of Object.entries(adj.cut ?? {})) {
      if (!keep(id)) { skipped.push(`cortar ${id}${rewritten ? ' (abertura nova)' : ''}`); continue; }
      for (let i = 0; i < c.first; i++) cut.push({ shotId: id, side: 'first' });
      for (let i = 0; i < c.last; i++) cut.push({ shotId: id, side: 'last' });
      if (c.lead) trimLead.push({ shotId: id, words: c.lead });
    }
    if (cut.length) req.cut = cut;
    if (trimLead.length) req.trimLead = trimLead;
    if (adj.teaser) req.teaser = adj.teaser;
    const desc = `${JSON.stringify(req)}${skipped.length ? ` · sem: ${skipped.join(', ')}` : ''}`;
    if (!Object.keys(req).length) { console.log(`[reaplicar] ${key}: nada a reaplicar${skipped.length ? ` (${skipped.join(', ')}: fala mudou)` : ''}`); continue; }
    if (DRY) { console.log(`[reaplicar] ${key}: ${desc}`); continue; }
    try {
      const r = await adjustScene({ courseId, lessonId, nodeId, request: req });
      console.log(`[reaplicar] ${key}: ${r.durationSeconds.toFixed(1)} s · ${desc}`);
    } catch (e) {
      console.log(`[reaplicar] ${key}: falhou (${e instanceof Error ? e.message : String(e)})`);
    }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`[reaplicar] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
