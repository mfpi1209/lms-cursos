/** Onda 1, SÓ LEITURA: matrículas em andamento (active) depois da publicação: a aula nova é obrigatória? (courseIsComplete do repositório) */
import { and, eq, inArray } from 'drizzle-orm';
import { createDb } from '../../client';
import * as s from '../../schema';
import { courseIsComplete } from '../../repositories/learning';
// @ts-ignore script de QA lê a lista de cursos do robô (.mjs sem tipos)
import { CURSOS } from '../../../../../tools/robo-aluno/dados.mjs';

const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
try {
  const rows = await db.select({ id: s.enrollments.id, status: s.enrollments.status, course: s.enrollments.courseId, ver: s.enrollments.courseVersionId, opt: s.enrollments.optionalLessonIds, user: s.enrollments.userId }).from(s.enrollments).where(and(inArray(s.enrollments.courseId, CURSOS.slice(0, 11)), eq(s.enrollments.status, 'active')));
  for (const e of rows) {
    const [v] = await db.select({ doc: s.courseVersions.document, n: s.courseVersions.versionNumber }).from(s.courseVersions).where(eq(s.courseVersions.id, e.ver));
    const doc: any = v!.doc;
    const todas: string[] = doc.modules.flatMap((m: any) => m.lessons.map((l: any) => l.id));
    const feitas = new Set((await db.select({ l: s.lessonAttempts.lessonId }).from(s.lessonAttempts).where(and(eq(s.lessonAttempts.enrollmentId, e.id), eq(s.lessonAttempts.status, 'completed')))).map((x) => x.l));
    const faltam = todas.filter((l) => !feitas.has(l) && !(e.opt ?? []).includes(l));
    const semNova = new Set(todas); // todas feitas
    const ultimas = todas.filter((l) => !feitas.has(l));
    const completaSemAsNovas = courseIsComplete(doc, new Set(todas.filter((l) => !ultimas.includes(l) || false)), e.opt ?? []);
    console.log(`${e.id} C${CURSOS.indexOf(e.course) + 1} v${v!.n} opcionais=${JSON.stringify(e.opt)} aulas=${todas.length} feitas=${[...feitas].join(',')} obrigatórias que faltam=${faltam.join(',')} courseIsComplete(com o que fez)=${courseIsComplete(doc, feitas, e.opt ?? [])} courseIsComplete(todas menos a última)=${courseIsComplete(doc, new Set(todas.slice(0, -1)), [])} courseIsComplete(todas)=${courseIsComplete(doc, semNova, [])}`);
  }
} finally { await close(); }
