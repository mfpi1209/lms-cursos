/**
 * ATENÇÃO: matrícula que já existe NÃO muda de versão (o log "→ versão N" engana). Para republicar e
 * mover as matrículas, use packages/db/src/scripts/publicar-e-matricular.ts crs_5vccpfypr6fmxojb.
 * Lote 12 (Correção de postura): publica o rascunho atual (sem reimportar) e matricula os alunos de
 * teste (aluno@demo.local, aluna@demo.local) na versão mais nova. Idempotente; nada pago.
 *   ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/lote/12-publicar.ts
 */
import { eq, inArray } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { getDraft } from '../../repositories/authoring';
import { getLatestVersion, publishCourse } from '../../repositories/publishing';
import { enrollStudent } from '../../repositories/learning';

const COURSE = 'crs_5vccpfypr6fmxojb';
const LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE);
    if (!draft) throw new Error('rascunho não encontrado');
    const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
    const latest = await getLatestVersion(db, COURSE);
    if (latest && latest.sourceRevision === draft.revision) console.log(`versão ${latest.versionNumber} já publicada da revisão ${draft.revision}`);
    else {
      const pub = await publishCourse(db, { courseId: COURSE, userId: author!.id, expectedRevision: draft.revision });
      console.log(`publicado: versão ${pub.versionNumber} (${pub.versionId}) da revisão ${draft.revision}, ${pub.warnings.length} avisos${pub.warnings.length ? ': ' + pub.warnings.map((w: any) => `${w.code}${w.nodeId ? '/' + w.nodeId : ''}`).join(', ') : ''}`);
    }
    const version = (await getLatestVersion(db, COURSE))!;
    const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, [...LEARNERS, 'admin@demo.local']));
    const admin = users.find((u) => u.email === 'admin@demo.local')?.id ?? author!.id;
    for (const email of LEARNERS) {
      const u = users.find((x) => x.email === email);
      if (!u) { console.log(`${email} não existe`); continue; }
      const { enrollment, created } = await enrollStudent(db, { courseId: COURSE, userId: u.id, createdBy: admin });
      console.log(`matrícula ${enrollment.id} (${email}) ${created ? 'criada' : 'já existia'} → versão ${version.versionNumber}`);
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
