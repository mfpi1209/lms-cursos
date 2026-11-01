/**
 * Defeitos de imagem do avatar (folha fantasma, relógio nos dois pulsos, objeto na mão): troca o gesto SÓ dos planos e
 * reações afetados por um gesto contido; a regravação (paga, aprovada pelo autor: "aprovo") pega só esses planos.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/oneoff/gestos-defeitos.ts [--apply]
 */
import type { CourseDocument } from '@lms/course-schema';
import { createDb } from '../../client';
import { getDraft, saveDraft } from '../../repositories/authoring';

const CALM = 'hands relaxed at the waist, calm, small nods';
const SHOTS: Array<{ course: string; lesson: string; node: string; shot: string; why: string }> = [
  { course: 'crs_4z17p0m6d43qxmmo', lesson: 'aula_01', node: 'v00', shot: 'boasvindas', why: '#1 folha no lugar da mão (Thiago)' },
  { course: 'crs_hd4jnnpx3oj0xf14', lesson: 'aula_01', node: 'v00', shot: 'boasvindas', why: '#2 folhas soltas no ar (Rafael)' },
  { course: 'crs_4z17p0m6d43qxmmo', lesson: 'aula_01', node: 'v01', shot: 's3', why: '#5 relógio nos dois pulsos' },
  { course: 'crs_4z17p0m6d43qxmmo', lesson: 'aula_02', node: 'v03', shot: 's3', why: '#6 relógio nos dois pulsos' },
];
const REACTIONS: Array<{ course: string; lesson: string; node: string; option: string; why: string }> = [
  { course: 'crs_4z17p0m6d43qxmmo', lesson: 'aula_01', node: 'q01', option: 'a', why: '#3 objeto verde na mão (Thiago)' },
  { course: 'crs_8g0csi2hflfztfge', lesson: 'aula_01', node: 'q01', option: 'a', why: '#4 objeto na mão (Aline)' },
];
const APPLY = process.argv.includes('--apply');

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  const targets: Record<string, string[]> = {};
  try {
    for (const course of [...new Set([...SHOTS, ...REACTIONS].map((x) => x.course))]) {
      const d = (await getDraft(db, course))!;
      const doc = structuredClone(d.document) as CourseDocument;
      const lesson = (id: string) => doc.modules.flatMap((m) => m.lessons).find((l) => l.id === id)!;
      let n = 0;
      for (const s of SHOTS.filter((x) => x.course === course)) {
        const node = lesson(s.lesson).graph.nodes.find((x) => x.id === s.node) as unknown as { direction?: { shots: Array<{ id: string; motionPrompt?: string }> } };
        const shot = node.direction?.shots.find((x) => x.id === s.shot);
        if (!shot) throw new Error(`plano não encontrado: ${course} ${s.lesson}/${s.node}/${s.shot}`);
        console.log(`[gestos] ${course} ${s.lesson}/${s.node}/${s.shot} (${s.why}): "${shot.motionPrompt}" → "${CALM}"`);
        if (shot.motionPrompt !== CALM) { shot.motionPrompt = CALM; n++; }
        (targets[course] ??= []).push(s.node);
      }
      for (const r of REACTIONS.filter((x) => x.course === course)) {
        const node = lesson(r.lesson).graph.nodes.find((x) => x.id === r.node) as unknown as { options: Array<{ id: string; reaction?: { motionPrompt?: string; disabled?: boolean } }> };
        const opt = node.options.find((o) => o.id === r.option);
        if (!opt?.reaction || opt.reaction.disabled) throw new Error(`reação ausente ou desligada: ${course} ${r.lesson}/${r.node}~${r.option}`);
        console.log(`[gestos] ${course} ${r.lesson}/${r.node}~${r.option} (${r.why}): reação → "${CALM}"`);
        if (opt.reaction.motionPrompt !== CALM) { opt.reaction.motionPrompt = CALM; n++; }
        (targets[course] ??= []).push(`${r.node}~${r.option}`);
      }
      if (APPLY && n) {
        const saved = await saveDraft(db, { courseId: course, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `gesto contido em ${n} trecho(s) com defeito de imagem` });
        console.log(`[gestos] ${course}: rascunho ${d.revision} → ${saved.revision}`);
      }
    }
    console.log(`[gestos] alvos do orçamento: ${JSON.stringify(targets)}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(`[gestos] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
