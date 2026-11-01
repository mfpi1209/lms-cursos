import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import { createLmsDriver } from './lms-driver';

interface Call {
  path: string;
  json: unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const calls: Call[] = [];
const res = (id: string, attemptNumber: number) => ({
  attempt: { id, revision: 1, status: 'in_progress', attemptNumber, state: { currentNodeId: 'n1', path: [] } },
  created: true,
  progress: {},
});
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  apiMock.mockReset();
  // cada pedido fica pendente até o teste responder (respostas atrasadas)
  apiMock.mockImplementation((path: string, init: { json?: unknown }) => new Promise((resolve, reject) => calls.push({ path, json: init.json, resolve, reject })));
});

describe('driver do LMS: entrada "fresh" segura para chamadas repetidas de start()', () => {
  it('a 2ª chamada só sai depois que a 1ª termina, e ambas devolvem a tentativa nova', async () => {
    const driver = createLmsDriver({ enrollmentId: 'enr', lessonId: 'aula_02', fresh: true });
    const a = driver.start();
    const b = driver.start(); // Strict Mode: o efeito roda de novo
    await tick();
    expect(calls).toHaveLength(1); // só o pedido "fresh" foi enviado
    expect(calls[0]!.json).toEqual({ forceNew: true, abandonOpen: true });

    calls[0]!.resolve(res('att_nova', 2));
    await expect(a).resolves.toMatchObject({ attemptNumber: 2 });
    await tick();
    expect(calls).toHaveLength(2); // a retomada só sai depois
    expect(calls[1]!.json).toEqual({});
    calls[1]!.resolve(res('att_nova', 2)); // o servidor devolve a tentativa aberta (a nova)
    await expect(b).resolves.toMatchObject({ attemptNumber: 2, revision: 1 });
  });

  it('se o pedido "fresh" falha, a 2ª chamada ainda retoma depois (sem ficar presa)', async () => {
    const driver = createLmsDriver({ enrollmentId: 'enr', lessonId: 'aula_02', fresh: true });
    const a = driver.start();
    const aErro = a.catch((e: unknown) => e);
    const b = driver.start();
    await tick();
    expect(calls).toHaveLength(1);
    calls[0]!.reject(new Error('falhou'));
    expect(await aErro).toBeInstanceOf(Error);
    await tick();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve(res('att_x', 1));
    await expect(b).resolves.toMatchObject({ attemptNumber: 1 });
  });

  it('depois da entrada "fresh", start() volta a retomar direto; sem fresh nada é segurado', async () => {
    const driver = createLmsDriver({ enrollmentId: 'enr', lessonId: 'aula_02', fresh: true });
    const a = driver.start();
    calls[0]!.resolve(res('att_nova', 2));
    await a;
    const c = driver.start(); // ex.: ressincronização após 409
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.json).toEqual({});
    calls[1]!.resolve(res('att_nova', 2));
    await c;

    const plain = createLmsDriver({ enrollmentId: 'enr', lessonId: 'aula_02' });
    void plain.start();
    void plain.start();
    await tick();
    expect(calls).toHaveLength(4); // os dois pedidos de retomada saem juntos
  });
});
