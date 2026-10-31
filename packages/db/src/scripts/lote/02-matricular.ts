/** Lote 02: matricula os alunos de teste (aluno@/aluna@demo.local) no curso publicado. Sem custo. */
import { eq, inArray } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { enrollStudent } from '../../repositories/learning';

const COURSE_ID = 'crs_arbeohlw3xp5v3zx';
const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
try {
  const [author] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'autor@demo.local')).limit(1);
  const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.email, ['aluno@demo.local', 'aluna@demo.local']));
  for (const u of users) {
    const { enrollment, created } = await enrollStudent(db, { courseId: COURSE_ID, userId: u.id, createdBy: author!.id });
    console.log(`[lote02] ${u.email}: ${created ? 'matriculado' : 'já matriculado'} (${enrollment.id})`);
  }
} finally {
  await close();
}
