import { createDb } from '../client';
import { seed, SEED_PASSWORD, SEED_USERS } from './seed';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}
const { db, close } = createDb(url, { max: 2 });
seed(db, { log: (m) => console.log(`[seed] ${m}`) })
  .then((r) => {
    console.log('[seed] concluído');
    console.log(`[seed] curso ${r.courseId}, versão ${r.versionId}, matrícula ${r.enrollmentId}`);
    console.log(`[seed] credenciais de desenvolvimento (senha "${SEED_PASSWORD}"):`);
    for (const u of SEED_USERS) console.log(`        ${u.role.padEnd(8)} ${u.email}`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => close());
