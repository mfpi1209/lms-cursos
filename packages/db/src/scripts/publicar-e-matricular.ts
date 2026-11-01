/**
 * Publica o rascunho atual de um curso e matricula um aluno (sem custo). Se a versão nova tiver as MESMAS
 * aulas e cenas (ids) da anterior (só textos/vídeos mudaram), move as matrículas para ela: o progresso
 * continua valendo. Estrutura diferente: as matrículas ficam na versão antiga (avisa).
 *   pnpm --filter @lms/db exec tsx src/scripts/publicar-e-matricular.ts <courseId> [userId] [--dry-run]
 * Só saíram cenas e/ou só entraram aulas no fim (`onlyAppendedLessons`): a matrícula muda de versão (quem já CONCLUIU continua concluído; a aula nova vira conteúdo novo opcional) e a tentativa em andamento é encerrada SOMENTE se o aluno está
 * (currentNodeId) numa cena que saiu; quem apenas passou por ela continua. Troca de versão + encerramentos
 * rodam numa transação por matrícula. `--dry-run`: não publica, não grava; só diz o que faria.
 */
import { and, eq } from 'drizzle-orm';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';
import { onlyAppendedLessons, onlyRemovals, sameShape } from './matricula-migracao';
import { moveEnrollmentToVersion } from './matricula-migracao-db';


async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [courseId, learnerId] = args.filter((a) => !a.startsWith('--'));
  if (!courseId) throw new Error('uso: publicar-e-matricular.ts <courseId> [userId] [--dry-run]');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, courseId);
    if (!draft) throw new Error('rascunho não encontrado');
    const latest = await getLatestVersion(db, courseId);
    if (latest && latest.sourceRevision === draft.revision) console.log(`versão ${latest.versionNumber} já publicada desta revisão`);
    else if (dryRun) console.log(`[dry-run] publicaria o rascunho (revisão ${draft.revision}); a simulação abaixo compara as matrículas com o rascunho`);
    else {
      const pub = await publishCourse(db, { courseId, userId: draft.updatedBy, expectedRevision: draft.revision });
      console.log(`publicado: versão ${pub.versionNumber}, ${pub.warnings.length} avisos`);
    }
    // matrículas: para a versão nova quando a estrutura (aulas e cenas) é a mesma
    const published = await getLatestVersion(db, courseId);
    // dry-run sem versão nova: simula com o documento do rascunho (mesmas aulas/cenas que a publicação geraria)
    const newest = dryRun && !(published && published.sourceRevision === draft.revision)
      ? { id: '(rascunho)', versionNumber: (published?.versionNumber ?? 0) + 1, document: draft.document as unknown }
      : published!;
    const enrolled = await db.select({ id: s.enrollments.id, versionId: s.enrollments.courseVersionId, status: s.enrollments.status }).from(s.enrollments).where(eq(s.enrollments.courseId, courseId));
    for (const e of enrolled) {
      if (e.versionId === newest.id) continue;
      const [old] = await db.select({ document: s.courseVersions.document }).from(s.courseVersions).where(eq(s.courseVersions.id, e.versionId));
      if (old && sameShape(old.document, newest.document)) {
        if (dryRun) console.log(`[dry-run] matrícula ${e.id} → versão ${newest.versionNumber} (mesmas aulas e cenas)`);
        else {
          await db.update(s.enrollments).set({ courseVersionId: newest.id }).where(eq(s.enrollments.id, e.id));
          console.log(`matrícula ${e.id} → versão ${newest.versionNumber} (mesmas aulas e cenas)`);
        }
      } else if (old && (onlyRemovals(old.document, newest.document) || onlyAppendedLessons(old.document, newest.document))) {
        await moveEnrollmentToVersion(db, { id: e.id, status: e.status }, old.document, { id: newest.id, versionNumber: newest.versionNumber, document: newest.document }, { dryRun });
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
