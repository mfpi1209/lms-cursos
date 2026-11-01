import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@lms/db';

/**
 * PUT /api/enrollments/[enrollmentId]/missions/[nodeId]: registrar "Já experimentei" e "O que você percebeu?" fora da aula.
 * Viewer, dono da matrícula e repositório simulados (as regras de edição estão em course-engine/test/mission.test.ts e
 * packages/db/test/mission.test.ts, contra o banco).
 */
let userId = 'usr_aluna';
let ownerId = 'usr_aluna';
const saved: Array<Record<string, unknown>> = [];
let fail: DomainError | null = null;

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return { ...actual, requireViewer: async () => ({ user: { id: userId, name: 'Aluna', email: 'aluna@x.test' }, workspace: { id: 'wsp_1', name: 'Demo', slug: 'demo', branding: {} }, role: 'student' as const }) };
});
vi.mock('@/server/learner', async () => {
  const viewer = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return {
    requireOwnEnrollment: async (v: { user: { id: string } }) => {
      if (v.user.id !== ownerId) throw new viewer.HttpError(404, 'Matrícula não encontrada');
      return {};
    },
  };
});
vi.mock('@lms/db', async () => {
  const actual = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  return {
    ...actual,
    getDb: () => ({}),
    learning: {
      ...actual.learning,
      saveMissionResponse: async (_db: unknown, input: Record<string, unknown>) => {
        if (fail) throw fail;
        saved.push(input);
        return { lessonId: 'aula_1', status: input.status, note: input.note ?? null, revision: (input.expectedRevision as number) + 1, updatedAt: new Date('2026-11-01T12:00:00Z') };
      },
    },
  };
});

const put = async (body: unknown, enrollmentId = 'enr_1', nodeId = 'missao') => {
  const { PUT } = await import('./route');
  const res = await PUT(new Request('http://test/api/x', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ enrollmentId, nodeId }) });
  return { status: res.status, json: (await res.json()) as { mission?: Record<string, unknown>; error?: { code: string; message: string } } };
};

beforeEach(() => {
  userId = 'usr_aluna';
  ownerId = 'usr_aluna';
  saved.length = 0;
  fail = null;
});

describe('PUT /api/enrollments/[enrollmentId]/missions/[nodeId]', () => {
  it('grava e devolve o registro com a revisão nova (a confirmação vem da resposta)', async () => {
    const r = await put({ status: 'done', note: 'Contei para a gerente.', expectedRevision: 2 });
    expect(r.status).toBe(200);
    expect(r.json.mission).toMatchObject({ nodeId: 'missao', status: 'done', note: 'Contei para a gerente.', revision: 3, lessonId: 'aula_1' });
    expect(saved).toEqual([{ enrollmentId: 'enr_1', nodeId: 'missao', status: 'done', note: 'Contei para a gerente.', expectedRevision: 2 }]);
  });

  it('só o dono da matrícula: outra conta recebe 404 e nada é gravado', async () => {
    userId = 'usr_outra';
    const r = await put({ status: 'done', expectedRevision: 1 });
    expect(r.status).toBe(404);
    expect(saved).toHaveLength(0);
  });

  it('dados inválidos: status desconhecido, sem revisão e texto exagerado respondem 422 sem gravar', async () => {
    expect((await put({ status: 'talvez', expectedRevision: 1 })).status).toBe(422);
    expect((await put({ status: 'done' })).status).toBe(422);
    expect((await put({ status: 'done', note: 'a'.repeat(1001), expectedRevision: 1 })).status).toBe(422);
    expect(saved).toHaveLength(0);
  });

  it('os erros do domínio chegam ao navegador com o código (conflito de revisão, texto longo)', async () => {
    fail = new DomainError('CONFLICT', 'Este registro mudou em outra aba.', { currentRevision: 5 });
    const c = await put({ status: 'done', expectedRevision: 1 });
    expect(c.status).toBe(409);
    expect(c.json.error?.code).toBe('CONFLICT');
    fail = new DomainError('VALIDATION', 'Use no máximo 500 caracteres.');
    const v = await put({ status: 'done', note: 'a'.repeat(501), expectedRevision: 1 });
    expect(v.status).toBe(422);
  });
});
