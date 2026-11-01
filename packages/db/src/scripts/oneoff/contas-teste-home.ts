// Cria (idempotente) contas de teste LOCAIS para ver a vitrine em cada estado, com o mesmo caminho do seed
// (usuário + conta de credencial + papel de aluno) e matrícula pelo repositório (enrollStudent, createdBy = admin@demo.local).
// A senha é a SEED_PASSWORD do seed (não é impressa). Nunca usa aluno@demo.local.
//
//   set -a; . ./.env; set +a; packages/db/node_modules/.bin/tsx packages/db/src/scripts/oneoff/contas-teste-home.ts
import { hashPassword } from 'better-auth/crypto';
import { createDb } from '../../client';
import { enrollStudent } from '../../repositories/learning';
import { SEED_PASSWORD, SEED_WORKSPACE_SLUG } from '../../seed/seed';

const CONTAS = [
  { email: 'nova@demo.local', name: 'Nova Aluna' },
  { email: 'andamento@demo.local', name: 'Ana Andamento' },
];
const url = process.env.DATABASE_URL;
if (!url) throw new Error('carregue o .env (DATABASE_URL)');
if (!url.includes('localhost') && !url.includes('127.0.0.1')) throw new Error('só em banco local');
const { db, sql, close } = createDb(url, { max: 2 });
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
try {
  const [ws] = (await sql`select id from workspaces where slug = ${SEED_WORKSPACE_SLUG}`) as Array<{ id: string }>;
  const [admin] = (await sql`select id from "user" where email = 'admin@demo.local'`) as Array<{ id: string }>;
  if (!ws || !admin) throw new Error('workspace ou admin não encontrado');
  const hash = await hashPassword(SEED_PASSWORD);
  for (const c of CONTAS) {
    let [u] = (await sql`select id from "user" where email = ${c.email}`) as Array<{ id: string }>;
    if (!u) {
      const id = rid('usr');
      await sql`insert into "user" (id, email, name, email_verified) values (${id}, ${c.email}, ${c.name}, true)`;
      await sql`insert into account (id, account_id, provider_id, user_id, password) values (${rid('acc')}, ${id}, 'credential', ${id}, ${hash})`;
      u = { id };
      console.log(`${c.email}: criada`);
    } else console.log(`${c.email}: já existia`);
    await sql`insert into workspace_memberships (workspace_id, user_id, role) values (${ws.id}, ${u.id}, 'student') on conflict do nothing`;
    let n = 0;
    const cursos = (await sql`select id from courses where status = 'published' and trail is not null order by id`) as Array<{ id: string }>;
    for (const { id: courseId } of cursos) {
      const r = await enrollStudent(db, { courseId, userId: u.id, createdBy: admin.id });
      if (r.created) n++;
    }
    console.log(`${c.email}: ${n} matrículas novas`);
  }
} finally {
  await close();
}
