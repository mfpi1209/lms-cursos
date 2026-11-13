import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { assertDisposableDatabaseUrl, createDb, runMigrations, schema, seed, type Database } from '@lms/db';
import { clearSentEmails, getSentEmails } from '@lms/email';
import { parseStudentsCsv } from '@/lib/alunos-csv';
import type { Viewer } from './viewer';

/** Importação do CSV do estúdio (prévia, aplicação e envio opcional do link por e-mail) contra o banco de teste. */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let viewer: Viewer;
let run: typeof import('./student-import')['importStudentsFromCsv'];

const CSV = [
  '﻿nome;email;rgm;telefone;cursos',
  'Ana Álvares;ana.csv@teste.local;C1;11 9999-0001;comunicacao-no-primeiro-emprego',
  'Bruno;bruno.csv@teste.local;C2;;',
  'Sem E-mail;;C3;;',
  'Curso Ruim;ruim.csv@teste.local;C4;;nao-existe',
].join('\r\n');

beforeAll(async () => {
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.BETTER_AUTH_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-xxxxxxxx';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  viewer = { user: { id: seeded.users['admin@demo.local']!, name: 'Admin', email: 'admin@demo.local' }, workspace: { id: seeded.workspaceId, name: 'x', slug: 'x', branding: {} }, role: 'admin' };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  run = (await import('./student-import')).importStudentsFromCsv;
});
afterAll(async () => {
  await close();
});

describe('importStudentsFromCsv', () => {
  const rows = () => parseStudentsCsv(CSV).rows;

  it('a prévia mostra o erro de cada linha e não grava nem envia nada', async () => {
    clearSentEmails();
    const r = await run(viewer, { rows: rows(), dryRun: true, enviarLink: true });
    expect(r.results.map((x) => [x.linha, x.status])).toEqual([[2, 'created'], [3, 'created'], [4, 'error'], [5, 'error']]);
    expect(r.results[2]!.reason).toBe('E-mail inválido');
    expect(r.results[3]!.reason).toContain('nao-existe');
    expect(await db.select().from(schema.user).where(eq(schema.user.email, 'ana.csv@teste.local'))).toHaveLength(0);
    expect(getSentEmails()).toHaveLength(0);
    expect(r.emailState.transport).toBe('log');
    expect(r.emailState.delivers).toBe(false);
  });

  it('aplica só as linhas boas; sem enviarLink não sai e-mail; repetir não muda nada', async () => {
    clearSentEmails();
    const r = await run(viewer, { rows: rows(), dryRun: false, enviarLink: false });
    expect(r.summary).toMatchObject({ created: 2, error: 2, total: 4 });
    expect(r.email).toBeUndefined();
    expect(getSentEmails()).toHaveLength(0);
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, 'ana.csv@teste.local'));
    expect(u!.name).toBe('Ana Álvares');
    const again = await run(viewer, { rows: rows(), dryRun: false, enviarLink: false });
    expect(again.summary).toMatchObject({ created: 0, unchanged: 2, error: 2 });
  });

  it('com enviarLink manda o e-mail com a página de confirmação a quem é novo, e só uma vez', async () => {
    const csv = parseStudentsCsv('nome,email,rgm,cursos\nCarla,carla.csv@teste.local,C10,comunicacao-no-primeiro-emprego\nAna,ana.csv@teste.local,C1,').rows;
    clearSentEmails();
    const r = await run(viewer, { rows: csv, dryRun: false, enviarLink: true });
    expect(r.email).toMatchObject({ transport: 'log', sent: 1, failed: 0, skipped: 1 });
    const mails = getSentEmails();
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe('carla.csv@teste.local');
    expect(mails[0]!.text).toContain('/entrar/confirmar?token=');
    clearSentEmails();
    const again = await run(viewer, { rows: csv, dryRun: false, enviarLink: true });
    expect(again.email).toMatchObject({ sent: 0, skipped: 2 });
    expect(getSentEmails()).toHaveLength(0);
  });

  it('recusa corpo inválido e mais de 5.000 linhas', async () => {
    await expect(run(viewer, { rows: [] })).rejects.toThrow();
    const many = Array.from({ length: 5001 }, (_, i) => ({ linha: i + 2, nome: 'N', email: `n${i}@t.local`, rgm: String(i), telefone: '', cursos: [] }));
    await expect(run(viewer, { rows: many })).rejects.toThrow();
  });
});
