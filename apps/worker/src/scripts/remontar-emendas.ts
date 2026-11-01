/**
 * Remontagem GRÁTIS de TODAS as cenas dirigidas de um ou mais cursos com o motor de emendas novo (sem o
 * "travamento" entre as falas: bordas apertadas na fala, corte seco, enquadramento alternado na mesma câmera;
 * ver packages/media/src/compose/join.ts). Parte dos clipes JÁ pagos e do ajuste fino guardado no rascunho
 * (`media.adjust`: cortes, planos tirados, cartão), que segue valendo. Nenhum provedor é chamado.
 *
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/remontar-emendas.ts <curso>… [--so=aula/no,…] [--dry-run] [--out=<pasta>] [--log=arquivo]
 *
 *   --out=<pasta>   só PRÉVIA: grava <pasta>/<curso>_<aula>_<no>.mp4 e não toca no rascunho nem no storage
 *   --dry-run       só lista o que seria remontado
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { adjustScene } from '../adjust';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[emendas] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (a remontagem é local e grátis)');
  process.exit(1);
}
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = new Set((args.find((a) => a.startsWith('--so='))?.slice(5) ?? '').split(',').filter(Boolean));
const LOG = args.find((a) => a.startsWith('--log='))?.slice(6);
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6);
const COURSES = args.filter((a) => !a.startsWith('--'));
const log = (m: string) => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  if (LOG) appendFileSync(LOG, line + '\n');
};

type NodeLike = { id: string; direction?: { shots: unknown[] }; media?: { kind?: string; generatedFrom?: { jobId?: string } } | null };

async function course(courseId: string) {
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) throw new Error(`curso ${courseId} sem rascunho`);
  const doc = draft.document as CourseDocument;
  let ok = 0;
  let fail = 0;
  for (const m of doc.modules)
    for (const l of m.lessons)
      for (const n0 of l.graph.nodes) {
        const n = n0 as unknown as NodeLike;
        if (!n.direction?.shots?.length || n.media?.kind !== 'video' || !n.media.generatedFrom?.jobId) continue;
        if (ONLY.size && !ONLY.has(`${l.id}/${n.id}`)) continue;
        const job = await media.getJob(getDb(), n.media.generatedFrom.jobId);
        if (!job || !(job.input as { units?: unknown }).units) continue;
        if (DRY) { log(`[emendas] ${courseId} ${l.id}/${n.id}: seria remontada (job ${job.id})`); continue; }
        try {
          const out = OUT ? path.join(OUT, `${courseId}_${l.id}_${n.id}.mp4`) : undefined;
          if (OUT) mkdirSync(OUT, { recursive: true });
          const r = await adjustScene({ courseId, lessonId: l.id, nodeId: n.id, request: {}, remount: { state: (cur) => cur }, ...(out ? { out } : {}) });
          ok++;
          // com --out, o roteiro da montagem (início de cada plano e o que saiu das bordas) fica ao lado da prévia: serve à conferência das emendas
          if (out && 'timeline' in r) writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify({ timeline: r.timeline, joins: r.joins }));
          log(`[emendas] ${courseId} ${l.id}/${n.id}: ${r.durationSeconds.toFixed(1)} s, ${r.loudness?.outputI ?? '?'} LUFS${out ? ` (prévia: ${out})` : ''}`);
        } catch (e) {
          fail++;
          log(`[emendas] ${courseId} ${l.id}/${n.id}: FALHOU (${e instanceof Error ? e.message : String(e)})`);
        }
      }
  log(`[emendas] ${courseId}: ${ok} remontada(s)${fail ? `, ${fail} falha(s)` : ''}${OUT ? ' (prévia, nada gravado)' : ''}`);
}

async function main() {
  if (!COURSES.length) throw new Error('uso: remontar-emendas.ts <curso>… [--so=aula/no,…] [--dry-run] [--out=<pasta>] [--log=arquivo]');
  for (const c of COURSES) await course(c);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[emendas] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
