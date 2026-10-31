/** Lote 12: opinião dos 5 alunos de teste (simulação por regras, sem custo). */
import { createDb } from '../../client';
import { simulateCourseLearners } from '../../repositories/library';
const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
simulateCourseLearners(db, { workspaceId: 'wsp_eogwtp01f358wyof', courseId: 'crs_5vccpfypr6fmxojb' })
  .then((r) => console.log(JSON.stringify(r, null, 1)))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => close());
