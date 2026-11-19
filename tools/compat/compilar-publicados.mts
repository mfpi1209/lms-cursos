/**
 * Checker somente leitura: compila a ÚLTIMA versão publicada de cada curso não arquivado
 * com o compilador do @lms/course-schema (compileCourse) e imprime uma linha por curso.
 *
 * Uso (na raiz do monorepo; DATABASE_URL vem do .env da raiz, sem ser impressa):
 *   ./packages/db/node_modules/.bin/tsx tools/compat/compilar-publicados.mts
 *
 * Sai com código 1 se algum curso tiver erros (ou se a leitura/compilação falhar).
 * Nunca escreve no banco: a conexão é `default_transaction_read_only=on` e só há SELECT.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileCourse } from '../../packages/course-schema/src/compile.ts';
import { migrateCourseDocument } from '../../packages/course-schema/src/migrate.ts';
import type { CourseDocument } from '../../packages/course-schema/src/course.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// process.loadEnvFile carrega o .env sem imprimir valores
process.loadEnvFile(path.join(ROOT, '.env'));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida no .env da raiz');
  process.exit(2);
}

// o driver `postgres` é dependência de @lms/db; resolvido a partir dele (tools/ não tem node_modules)
const dbRequire = createRequire(path.join(ROOT, 'packages/db/package.json'));
const postgresModule = await import(pathToFileURL(dbRequire.resolve('postgres')).href);
const postgres = postgresModule.default as (url: string, opts?: Record<string, unknown>) => any;

const sql = postgres(url, {
  max: 1,
  connection: { default_transaction_read_only: 'on' },
});

interface Row {
  course_id: string;
  title: string;
  version_number: number;
  document: CourseDocument;
}

let failed = false;
try {
  // última versão publicada de cada curso não arquivado (somente SELECT)
  const rows: Row[] = await sql`
    SELECT DISTINCT ON (c.id) c.id AS course_id, c.title, v.version_number, v.document
    FROM courses c
    JOIN course_versions v ON v.course_id = c.id
    WHERE c.archived_at IS NULL
    ORDER BY c.id, v.version_number DESC
  `;
  rows.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

  if (rows.length === 0) console.log('nenhum curso publicado e não arquivado');
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const row of rows) {
    try {
      // como o app lê uma versão publicada (learning.ts / publishing.ts): migra o schema antes de compilar
      const result = compileCourse(migrateCourseDocument(row.document));
      // erros e avisos já vêm agregados do curso (inclui os das aulas)
      const errors = result.errors.length;
      const warnings = result.warnings.length;
      totalErrors += errors;
      totalWarnings += warnings;
      if (errors > 0) failed = true;
      console.log(`${row.title} (v${row.version_number}) | erros: ${errors} | avisos: ${warnings}`);
    } catch (e) {
      failed = true;
      console.log(`${row.title} (v${row.version_number}) | FALHOU AO COMPILAR: ${(e as Error).message}`);
    }
  }
  console.log(`total: ${rows.length} curso(s) | erros: ${totalErrors} | avisos: ${totalWarnings}`);
} catch (e) {
  failed = true;
  console.error(`falha ao ler o banco: ${(e as Error).message}`);
} finally {
  await sql.end();
}

process.exit(failed ? 1 : 0);
