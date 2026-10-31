import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DB_DIR, E2E_DATABASE_URL, STATE_FILE, STORAGE_DIR, WORKER_DIR, e2eEnv, devDatabaseUrlFromDotenv, type E2EState } from './env';

function dbName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/** Cria o banco do e2e se não existir (`createdb`), sem tocar em nenhum outro. */
function ensureDatabase() {
  const name = dbName(E2E_DATABASE_URL);
  if (!/_e2e$/.test(name)) throw new Error(`O banco do e2e precisa terminar em _e2e (recebido "${name}")`);
  const dev = devDatabaseUrlFromDotenv();
  if (dev && dbName(dev) === name) throw new Error(`O banco do e2e ("${name}") é o DATABASE_URL do .env; use outro`);
  const u = new URL(E2E_DATABASE_URL);
  const admin = new URL(E2E_DATABASE_URL);
  admin.pathname = '/postgres';
  const exists = spawnSync('psql', [admin.toString(), '-tAc', `select 1 from pg_database where datname = '${name.replace(/'/g, "''")}'`], { encoding: 'utf8' });
  if (exists.status !== 0) throw new Error(`psql falhou ao consultar o Postgres: ${exists.stderr || exists.stdout}`);
  if (exists.stdout.trim() === '1') return;
  const args = ['-h', u.hostname, '-p', u.port || '5432'];
  if (u.username) args.push('-U', decodeURIComponent(u.username));
  const created = spawnSync('createdb', [...args, name], { encoding: 'utf8', env: { ...process.env, ...(u.password ? { PGPASSWORD: decodeURIComponent(u.password) } : {}) } });
  if (created.status !== 0) throw new Error(`createdb ${name} falhou: ${created.stderr || created.stdout}`);
  console.log(`[e2e] banco ${name} criado`);
}

/** Zera o schema, migra e roda o seed base + o seed do e2e (processo próprio, com o ambiente do e2e). */
function migrateAndSeed(env: NodeJS.ProcessEnv): { courseId: string; podeEntrarId: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/seed/e2e.ts'], { cwd: DB_DIR, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`seed do e2e falhou:\n${r.stderr}\n${r.stdout}`);
  const last = r.stdout.trim().split('\n').pop() ?? '';
  const parsed = JSON.parse(last) as { courseId: string; podeEntrarId: string };
  console.log(`[e2e] banco migrado e semeado (seed ${parsed.courseId}, Pode entrar ${parsed.podeEntrarId})`);
  return parsed;
}

/** Worker do e2e (IA fake, mídia simulada), no mesmo banco; o teardown o encerra. */
function startWorker(env: NodeJS.ProcessEnv): number | null {
  const logDir = path.dirname(STATE_FILE);
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, 'e2e-worker.log'), 'w');
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: WORKER_DIR, env, stdio: ['ignore', out, out], detached: false });
  child.unref();
  console.log(`[e2e] worker iniciado (pid ${child.pid}); log em ${path.join(logDir, 'e2e-worker.log')}`);
  return child.pid ?? null;
}

export default async function globalSetup() {
  const env = e2eEnv();
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  ensureDatabase();
  const seeded = migrateAndSeed(env);
  const workerPid = startWorker(env);
  const state: E2EState = { podeEntrarId: seeded.podeEntrarId, seedCourseId: seeded.courseId, workerPid };
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
