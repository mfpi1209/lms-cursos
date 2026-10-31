/**
 * Publica o rascunho atual de um curso e matricula um aluno (sem custo). Se a versão nova tiver as MESMAS
 * aulas e cenas (ids) da anterior (só textos/vídeos mudaram), move as matrículas para ela: o progresso
 * continua valendo. Estrutura diferente: as matrículas ficam na versão antiga (avisa).
 *   pnpm --filter @lms/db exec tsx src/scripts/publicar-e-matricular.ts <courseId> [userId]
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';

async function main() {
  const [courseId, learnerId] = process.argv.slice(2);
  if (!courseId) throw new Error('uso: publicar-e-matricular.ts <courseId> [userId]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, courseId);
    if (!draft) throw new Error('rascunho não encontrado');
    const latest = await getLatestVersion(db, courseId);
    if (latest && latest.sourceRevision === draft.revision) console.log(`versão ${latest.versionNumber} já publicada desta revisão`);
    else {
      const pub = await publishCourse(db, { courseId, userId: draft.updatedBy, expectedRevision: draft.revision });
      console.log(`publicado: versão ${pub.versionNumber}, ${pub.warnings.length} avisos`);
    }
    // matrículas: para a versão nova quando a estrutura (aulas e cenas) é a mesma
    const newest = (await getLatestVersion(db, courseId))!;
    const shape = (doc: unknown) => JSON.stringify((doc as { modules: Array<{ lessons: Array<{ id: string; graph: { nodes: Array<{ id: string }> } }> }> }).modules.map((m) => m.lessons.map((l) => [l.id, l.graph.nodes.map((n) => n.id)])));
    const enrolled = await db.select({ id: s.enrollments.id, versionId: s.enrollments.courseVersionId }).from(s.enrollments).where(eq(s.enrollments.courseId, courseId));
    for (const e of enrolled) {
      if (e.versionId === newest.id) continue;
      const [old] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.id, e.versionId));
      if (old && shape(old.document) === shape(newest.document)) {
        await db.update(s.enrollments).set({ courseVersionId: newest.id }).where(eq(s.enrollments.id, e.id));
        console.log(`matrícula ${e.id} → versão ${newest.versionNumber} (mesmas aulas e cenas)`);
      } else console.log(`matrícula ${e.id} fica na versão antiga: as aulas/cenas mudaram`);
    }
    if (learnerId) {
      const [admin] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'admin@demo.local'));
      const { enrollment, created } = await enrollStudent(db, { courseId, userId: learnerId, createdBy: admin?.id ?? draft.updatedBy });
      console.log(`matrícula ${enrollment.id} ${created ? 'criada' : 'já existia'}`);
    }
  } finally {
    await close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
