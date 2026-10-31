/** Lote 03: publica a revisão atual do rascunho (sem reimportar) e matricula os alunos de teste. */
import { eq, inArray } from 'drizzle-orm';
import * as s from '../../schema';
import { createDb } from '../../client';
import { getDraft } from '../../repositories/authoring';
import { getLatestVersion, publishCourse } from '../../repositories/publishing';
import { enrollStudent } from '../../repositories/learning';

const COURSE = 'crs_hd4jnnpx3oj0xf14';
const LEARNERS = ['aluno@demo.local', 'aluna@demo.local'];

async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = await getDraft(db, COURSE);
    const [course] = await db.select({ createdBy: s.courses.createdBy }).from(s.courses).where(eq(s.courses.id, COURSE));
    const latest = await getLatestVersion(db, COURSE);
    if (latest && latest.sourceRevision === draft!.revision) console.log(`versão ${latest.versionNumber} já publicada da revisão ${draft!.revision}`);
    else {
      const pub = await publishCourse(db, { courseId: COURSE, userId: course!.createdBy, expectedRevision: draft!.revision });
      console.log(`publicado: versão ${pub.versionNumber} (${pub.versionId}) da revisão ${draft!.revision}; avisos ${pub.warnings.length}`);
      for (const w of pub.warnings as any[]) console.log('  aviso', w.code, w.message);
    }
    const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, [...LEARNERS, 'admin@demo.local']));
    const admin = users.find((u) => u.email === 'admin@demo.local')?.id ?? course!.createdBy;
    for (const email of LEARNERS) {
      const u = users.find((x) => x.email === email);
      if (!u) { console.log(`${email} não existe`); continue; }
      const { enrollment, created } = await enrollStudent(db, { courseId: COURSE, userId: u.id, createdBy: admin });
      console.log(`matrícula ${enrollment.id} (${email}) ${created ? 'criada' : 'já existia'}`);
    }
  } finally {
    await close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
