import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, e2eEnv } from './e2e/env';

/**
 * E2E ISOLADO (auditoria P1-9): sobe o próprio servidor na porta 3011 contra o
 * banco `lms_cursos_e2e` (criado, migrado e semeado no globalSetup), com IA
 * `fake`, mídia simulada e a trava de gasto fechada; um worker próprio roda
 * junto. `pnpm test:e2e` nunca toca `lms_cursos` nem o dev server da 3000/3010.
 *
 * `E2E_BASE_URL` aponta para um servidor já de pé (ex.: CI); fora disso o
 * Playwright sobe e derruba o servidor sozinho.
 */
const baseURL = process.env.E2E_BASE_URL ?? E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(learner|mobile)\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next dev --port ${E2E_PORT}`,
        url: `${E2E_BASE_URL}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: e2eEnv() as Record<string, string>,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
