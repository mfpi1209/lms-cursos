import { assertDisposableDatabaseUrl, createDb, runMigrations, type Database } from '../src';
import { seed, type SeedResult } from '../src/seed/seed';

export const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';

export async function resetDatabase(): Promise<{ db: Database; close: () => Promise<void>; seeded: SeedResult }> {
  // guarda (auditoria P2): só apaga um banco *_test/*_e2e que não seja o DATABASE_URL do ambiente
  assertDisposableDatabaseUrl(TEST_URL);
  const { db, sql, close } = createDb(TEST_URL, { max: 8 });
  await sql`drop schema public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(db);
  return { db, close, seeded };
}
