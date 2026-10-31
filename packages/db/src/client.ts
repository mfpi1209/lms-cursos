import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Transaction;

export function createDb(url: string, opts: { max?: number } = {}) {
  // idle_timeout libera conexões ociosas; max_lifetime recicla conexões longas
  const sql = postgres(url, { max: opts.max ?? 10, idle_timeout: 30, max_lifetime: 60 * 30, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

/*
 * Pool compartilhado do processo, guardado em globalThis: em desenvolvimento o
 * hot reload reavalia este módulo e, sem isso, cada recarga abriria um pool novo
 * e o antigo ficaria preso no Postgres (esgota max_connections).
 */
const globalForDb = globalThis as unknown as { __lmsDb?: ReturnType<typeof createDb> };

/** Conexão compartilhada do processo (web/worker). Usa DATABASE_URL e DB_POOL_MAX (padrão 10). */
export function getDb(): Database {
  if (!globalForDb.__lmsDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não definida');
    globalForDb.__lmsDb = createDb(url, { max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return globalForDb.__lmsDb.db;
}

export function closeDb() {
  const s = globalForDb.__lmsDb;
  globalForDb.__lmsDb = undefined;
  return s?.close();
}
