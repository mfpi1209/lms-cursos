import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Testes unitários das rotas e helpers da web (os e2e ficam no Playwright). */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // componentes (.tsx) renderizados no servidor nos testes: o tsconfig usa `jsx: preserve` (Next compila), aqui o runtime automático
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['src/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30000 },
});
