import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './client';

export async function runMigrations(databaseUrl: string) {
  const { db, close } = createDb(databaseUrl, { max: 1 });
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log('Migrations aplicadas'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
