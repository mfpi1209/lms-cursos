/**
 * Publica o rascunho ATUAL de um curso (sem reimportar) e, com --matricular <email>, matricula essa conta de teste.
 * Valida como o estúdio (compileCourse); recusa com erros. Sem custo.
 *   tsx packages/db/src/scripts/publicar-curso.ts --course <id> [--matricular aluna@demo.local] [--seco]
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../client';
import * as s from '../schema';
import { getDraft } from '../repositories/authoring';
import { getLatestVersion, publishCourse } from '../repositories/publishing';
import { enrollStudent } from '../repositories/learning';

async function main() {
  const argv = process.argv.slice(2);
  const get = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const courseId = get('--course'); const email = get('--matricular'); const seco = argv.includes('--seco');
  if (!courseId) throw new Error('uso: --course <id> [--matricular <email>] [--seco]');
  if (email === 'aluno@demo.local') throw new Error('não use aluno@demo.local');
  const { db, close } = createDb(process.env.DATABASE_URL!, { max: 2 });
  try {
    const draft = (await getDraft(db, courseId))!;
    const [admin] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, 'admin@demo.local')).limit(1);
    const userId = admin?.id ?? draft.updatedBy;
    const latest = await getLatestVersion(db, courseId);
    console.log(`[publicar] curso ${courseId}: rascunho rev ${draft.revision}; última versão ${latest ? `${latest.versionNumber} (rev ${latest.sourceRevision})` : 'nenhuma'}`);
    if (seco) { console.log('[publicar] SECO: nada publicado'); return; }
    if (latest && latest.sourceRevision === draft.revision) console.log('[publicar] esta revisão já está publicada');
    else {
      const pub = await publishCourse(db, { courseId, userId, expectedRevision: draft.revision });
      console.log(`[publicar] publicado: versão ${pub.versionNumber}, ${pub.warnings.length} aviso(s)`);
      const counts = new Map<string, number>(); for (const w of pub.warnings as Array<{ code: string }>) counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
      if (counts.size) console.log(`[publicar] avisos: ${[...counts].map(([c, n]) => `${c}×${n}`).join(', ')}`);
    }
    if (email) {
      const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email)).limit(1);
      if (!u) throw new Error(`${email} não existe`);
      const { created } = await enrollStudent(db, { courseId, userId: u.id, createdBy: userId });
      console.log(`[publicar] matrícula de ${email}: ${created ? 'criada' : 'já existia'}`);
    }
  } finally { await close(); }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
