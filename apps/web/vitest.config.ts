import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Testes unitários das rotas e helpers da web (os e2e ficam no Playwright). */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30000 },
});
