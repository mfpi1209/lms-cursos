// Matricula a conta de teste nos cursos PUBLICADOS do alvo, pelo repositório (enrollStudent: versão publicada mais
// recente, auditoria e outbox), com createdBy = admin@demo.local. Não publica nada; curso em rascunho é pulado.
//
// packages/db/node_modules/.bin/tsx tools/robo-aluno/matricular.mts [--alvo novos] [--email aluna@demo.local] [--seco]
// (rodar a partir da raiz, com o .env carregado: set -a; . ./.env; set +a)
import { createDb } from '../../packages/db/src/client';
import { enrollStudent } from '../../packages/db/src/repositories/learning';
import { CURSOS, alvo } from './dados.mjs';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const EMAIL = arg('email', 'aluna@demo.local');
if (EMAIL === 'aluno@demo.local') throw new Error('aluno@demo.local é a conta do dono: não usar');
const SECO = process.argv.includes('--seco');
const codigos = [...alvo(arg('alvo', 'novos')).keys()];
const url = process.env.DATABASE_URL;
if (!url) throw new Error('carregue o .env (DATABASE_URL)');
const { db, sql, close } = createDb(url, { max: 2 });
try {
  const id = async (email: string) => ((await sql`select id from "user" where email = ${email}`) as Array<{ id: string }>)[0]?.id;
  const aluna = await id(EMAIL);
  const admin = await id('admin@demo.local');
  if (!aluna || !admin) throw new Error('conta de teste ou admin não encontrada');
  for (const cod of codigos) {
    const courseId = CURSOS[Number(cod.slice(1)) - 1];
    if (!courseId) continue;
    const [c] = (await sql`select title, status from courses where id = ${courseId}`) as Array<{ title: string; status: string }>;
    if (!c) continue;
    if (c.status !== 'published') {
      console.log(`${cod} ${c.title}: ${c.status}, pulado`);
      continue;
    }
    if (SECO) {
      const ja = ((await sql`select id from enrollments where course_id = ${courseId} and user_id = ${aluna}`) as Array<{ id: string }>)[0];
      console.log(`${cod} ${c.title}: ${ja ? 'já tem matrícula ' + ja.id : 'matricularia'}`);
      continue;
    }
    const r = await enrollStudent(db, { courseId, userId: aluna, createdBy: admin });
    console.log(`${cod} ${c.title}: ${r.created ? 'matrícula criada' : 'já tinha'} ${r.enrollment.id} (${r.enrollment.courseVersionId})`);
  }
} finally {
  await close();
}
