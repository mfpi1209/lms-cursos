import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ambiente ISOLADO do e2e (auditoria P1-9): servidor próprio na porta 3011,
 * banco `lms_cursos_e2e`, IA `fake`, mídia simulada, trava de gasto fechada e
 * storage próprio. Nada aqui toca o banco nem o servidor de desenvolvimento.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3011);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_e2e';
export const E2E_DIST_DIR = '.next-e2e';

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(WEB_DIR, '../..');
export const WORKER_DIR = path.join(REPO_ROOT, 'apps/worker');
export const DB_DIR = path.join(REPO_ROOT, 'packages/db');
export const STORAGE_DIR = path.join(REPO_ROOT, '.data/storage-e2e');
export const STATE_FILE = path.join(WEB_DIR, 'test-results/e2e-state.json');

/** `DATABASE_URL` do `.env` da raiz (o banco de desenvolvimento), só para a guarda recusar apagá-lo. */
export function devDatabaseUrlFromDotenv(): string | undefined {
  try {
    const text = fs.readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
    const m = text.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return m?.[1]?.replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

/** Variáveis dos três processos do e2e (web, worker e seed). Nunca chaves reais; nunca `ALLOW_PAID_PROVIDERS`. */
export function e2eEnv(): NodeJS.ProcessEnv {
  const { ALLOW_PAID_PROVIDERS: _paid, ANTHROPIC_API_KEY: _a, OPENAI_API_KEY: _o, HEYGEN_API_KEY: _h, ELEVENLABS_API_KEY: _e, ...rest } = process.env;
  void _paid; void _a; void _o; void _h; void _e;
  return {
    ...rest,
    NODE_ENV: 'development',
    DATABASE_URL: E2E_DATABASE_URL,
    TEST_DATABASE_URL: E2E_DATABASE_URL,
    AI_PROVIDER: 'fake',
    MEDIA_SIMULATION: '1',
    // vazio = trava fechada (modo de demonstração), mesmo que o .env da raiz tenha chaves
    ALLOW_PAID_PROVIDERS: '',
    ANTHROPIC_API_KEY: '',
    OPENAI_API_KEY: '',
    HEYGEN_API_KEY: '',
    ELEVENLABS_API_KEY: '',
    STORAGE_PROVIDER: 'local',
    STORAGE_DIR,
    S3_BUCKET: '',
    BETTER_AUTH_URL: E2E_BASE_URL,
    NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'e2e-secret-apenas-para-testes-com-32-caracteres',
    NEXT_DIST_DIR: E2E_DIST_DIR,
    OUTBOX_POLL_MS: '500',
    MEDIA_POLL_MS: '2000',
    E2E_GUARD_DEV_DATABASE_URL: devDatabaseUrlFromDotenv() ?? '',
  };
}

export interface E2EState {
  podeEntrarId: string;
  seedCourseId: string;
  workerPid: number | null;
}

export function readState(): E2EState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as E2EState;
  } catch {
    return null;
  }
}
