import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertDisposableDatabaseUrl, agent, authoring, createDb, runMigrations, seed, type Database } from '@lms/db';

/**
 * Rota POST /api/agent-runs/[runId]/cancel (o botão "Cancelar" das barras de
 * execução): cancela só o que está na fila ou em andamento, com banco de teste
 * real e o viewer mockado (sem sessão HTTP).
 */
const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/lms_cursos_test';
let db: Database;
let close: () => Promise<void>;
let userId: string;
let workspaceId: string;
let courseId: string;

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  const viewer = () => ({ user: { id: userId, name: 'Bruno Autor', email: 'autor@demo.local' }, workspace: { id: workspaceId, name: 'Demo', slug: 'demo', branding: {} }, role: 'author' as const });
  return { ...actual, requireEditor: async () => viewer(), requireStaff: async () => viewer(), requireViewer: async () => viewer() };
});

beforeAll(async () => {
  // guarda (auditoria P2): só apaga um banco *_test/*_e2e diferente do DATABASE_URL do ambiente
  assertDisposableDatabaseUrl(TEST_URL);
  process.env.DATABASE_URL = TEST_URL;
  process.env.AI_PROVIDER = 'fake';
  const conn = createDb(TEST_URL, { max: 4 });
  await conn.sql`drop schema public cascade`;
  await conn.sql`drop schema if exists drizzle cascade`;
  await conn.sql`create schema public`;
  await runMigrations(TEST_URL);
  const seeded = await seed(conn.db);
  db = conn.db;
  close = conn.close;
  userId = seeded.users['autor@demo.local']!;
  workspaceId = seeded.workspaceId;
  courseId = (await authoring.createCourse(db, { workspaceId, title: 'Cancelar', createdBy: userId })).id;
});
afterAll(async () => {
  await close();
});

const call = async (runId: string) => {
  const { POST } = await import('./route');
  const res = await POST(new Request(`http://test/api/agent-runs/${runId}/cancel`, { method: 'POST' }), { params: Promise.resolve({ runId }) });
  return { status: res.status, body: (await res.json()) as { run?: { id: string; status: string; error?: string | null }; error?: { code: string; message: string } } };
};

describe('POST /api/agent-runs/[runId]/cancel', () => {
  it('cancela uma execução na fila: status canceled, erro "cancelada pelo autor"; o worker não a reivindica mais', async () => {
    const run = await agent.createRun(db, { workspaceId, courseId, task: 'outline', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    const r = await call(run.id);
    expect(r.status).toBe(200);
    expect(r.body.run).toMatchObject({ id: run.id, status: 'canceled', error: 'cancelada pelo autor' });
    expect((await agent.getRun(db, run.id))!.status).toBe('canceled');
    // a aula/curso fica livre para um novo pedido
    expect(await agent.findOpenRun(db, courseId, 'outline')).toBeNull();
  });

  it('cancela uma execução em andamento; já concluída ou já cancelada devolve 409', async () => {
    const running = await agent.createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'aula_x', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await agent.updateRun(db, running.id, { status: 'running', startedAt: new Date() });
    expect((await call(running.id)).body.run?.status).toBe('canceled');
    const again = await call(running.id);
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe('CONFLICT');
    const done = await agent.createRun(db, { workspaceId, courseId, task: 'lesson', lessonId: 'aula_y', provider: 'fake', model: 'fake', instructionsVersion: 'pending', input: {}, createdBy: userId });
    await agent.updateRun(db, done.id, { status: 'succeeded', finishedAt: new Date() });
    expect((await call(done.id)).status).toBe(409);
  });

  it('execução inexistente devolve 404', async () => {
    const r = await call('run_nao_existe');
    expect(r.status).toBe(404);
    expect(r.body.error?.code).toBe('NOT_FOUND');
  });
});
