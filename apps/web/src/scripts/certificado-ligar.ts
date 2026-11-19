/**
 * Liga o certificado de conclusão no RASCUNHO dos cursos (`certificate.enabled = true`; a carga horária fica a
 * automática, salvo `--horas=N`). Não publica: para valer para as alunas, rode depois
 * `pnpm --filter @lms/db exec tsx src/scripts/publicar-e-matricular.ts <courseId>`. Sem custo. A seco por padrão.
 *
 *   tsx src/scripts/certificado-ligar.ts crs_a crs_b            # mostra o que faria
 *   tsx src/scripts/certificado-ligar.ts crs_a crs_b --gravar   # grava nos rascunhos
 */
import { getDb, authoring } from '@lms/db';
import { formatWorkload, freeCourseWorkloadMinutes } from '@lms/course-schema';

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes('--gravar');
  const horasArg = args.find((a) => a.startsWith('--horas='));
  const workloadMinutes = horasArg ? Math.round(Number(horasArg.split('=')[1]) * 60) : undefined;
  if (workloadMinutes !== undefined && !(workloadMinutes > 0)) throw new Error('--horas precisa ser um número positivo');
  const ids = args.filter((a) => !a.startsWith('--'));
  if (!ids.length) throw new Error('informe os ids dos cursos');
  const db = getDb();
  for (const id of ids) {
    const course = await authoring.getCourse(db, id);
    const draft = await authoring.getDraft(db, id);
    if (!course || !draft) throw new Error(`${id}: curso não encontrado`);
    const certificate = { enabled: true, ...(workloadMinutes ? { workloadMinutes } : {}) };
    const doc = { ...draft.document, certificate };
    const label = `${course.title} · carga ${formatWorkload(freeCourseWorkloadMinutes(doc))}`;
    if (draft.document.certificate?.enabled && !workloadMinutes) {
      console.log(`[certificado] ${label}: já ligado`);
      continue;
    }
    if (!gravar) {
      console.log(`[certificado] ${label}: ligaria (a seco; use --gravar)`);
      continue;
    }
    const r = await authoring.saveDraft(db, { courseId: id, document: doc, expectedRevision: draft.revision, userId: course.createdBy, origin: 'script', note: 'certificado de conclusão ligado' });
    console.log(`[certificado] ${label}: ligado; rascunho rev ${r.revision}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
