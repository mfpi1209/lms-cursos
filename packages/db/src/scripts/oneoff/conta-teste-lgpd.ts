// Cria (só em banco local) UMA conta descartável `lgpd-teste-*@demo.local`, a única conta @demo.local em que `dados:apagar --apply`
// e `dados:apagar-nota --apply` são permitidos. Papel de aluno, matriculada em um curso publicado, com UMA missão "Já experimentei" e nota
// (inserida direto, para testar "Apagar minha nota" e a exclusão sem percorrer a aula). A senha é gerada ao acaso e gravada num arquivo
// (modo 600) indicado em --senha-em; nunca é impressa. Não usa a SEED_PASSWORD e nunca toca aluno@demo.local.
//
//   set -a; . ./.env; set +a; packages/db/node_modules/.bin/tsx packages/db/src/scripts/oneoff/conta-teste-lgpd.ts --senha-em /caminho/senha.txt [--sem-nota]
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import { allLessons } from '@lms/course-schema';
import { createDb } from '../../client';
import { newId } from '../../ids';
import { enrollStudent, getEnrollmentWithVersion } from '../../repositories/learning';
import { SEED_WORKSPACE_SLUG } from '../../seed/seed';
import * as s from '../../schema';
import { eq } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('carregue o .env (DATABASE_URL)');
if (!url.includes('localhost') && !url.includes('127.0.0.1')) throw new Error('só em banco local');
const args = process.argv.slice(2);
const out = args[args.indexOf('--senha-em') + 1];
if (!args.includes('--senha-em') || !out || out.startsWith('--')) throw new Error('uso: --senha-em <arquivo> [--sem-nota]');
const withNote = !args.includes('--sem-nota');

const { db, sql, close } = createDb(url, { max: 2 });
try {
  const [ws] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, SEED_WORKSPACE_SLUG));
  const [admin] = await db.select().from(s.user).where(eq(s.user.email, 'admin@demo.local'));
  if (!ws || !admin) throw new Error('workspace ou admin não encontrado');
  const password = randomBytes(18).toString('base64url');
  const id = newId('usr');
  const email = `lgpd-teste-${randomBytes(3).toString('hex')}@demo.local`;
  await db.insert(s.user).values({ id, email, name: 'Conta de Teste LGPD', emailVerified: true });
  await db.insert(s.account).values({ id: newId('acc'), accountId: id, providerId: 'credential', userId: id, password: await hashPassword(password) });
  await db.insert(s.workspaceMemberships).values({ workspaceId: ws.id, userId: id, role: 'student' });
  writeFileSync(out, `${email}\n${password}\n`, { mode: 0o600 });

  // um curso publicado que tenha missão
  const courses = await db.select({ id: s.courses.id }).from(s.courses).where(eq(s.courses.status, 'published'));
  let done = false;
  for (const c of courses) {
    const r = await enrollStudent(db, { courseId: c.id, userId: id, createdBy: admin.id });
    const enr = await getEnrollmentWithVersion(db, r.enrollment.id);
    const found = enr && allLessons(enr.document).map((l) => ({ l, m: l.graph.nodes.find((n) => n.type === 'mission') })).find((x) => x.m);
    if (found && withNote && !done) {
      await db.insert(s.missionResponses).values({ id: newId('mis'), enrollmentId: r.enrollment.id, userId: id, lessonId: found.l.id, nodeId: found.m!.id, status: 'done', note: 'Nota de teste: conversei com a Marta sobre o assunto.', revision: 2, doneAt: new Date() });
      const [resp] = await db.select().from(s.missionResponses).where(eq(s.missionResponses.userId, id));
      await db.insert(s.missionResponseEvents).values([
        { id: newId('mie'), responseId: resp!.id, revision: 1, status: 'later', note: null, source: 'lesson' },
        { id: newId('mie'), responseId: resp!.id, revision: 2, status: 'done', note: 'Nota de teste: conversei com a Marta sobre o assunto.', source: 'course' },
      ]);
      console.log(`matrícula ${r.enrollment.id}, aula ${found.l.id}, missão ${found.m!.id}`);
      done = true;
      break;
    }
  }
  console.log(`conta criada: ${email} (senha gravada em ${out})`);
  if (withNote && !done) console.log('aviso: nenhum curso publicado com missão');
} finally {
  await close();
}
