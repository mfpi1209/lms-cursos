import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAIL_CHECKS } from '@lms/course-schema';

/**
 * GET /api/trilhas/[trail]/checagem: a checagem final da PRÓXIMA tentativa, com as opções embaralhadas de forma estável por aluno
 * e tentativa e sem gabarito. Viewer e repositório simulados (a regra de embaralhar é pura e está testada em course-schema).
 */
let userId = 'usr_aluna';
let tentativas = 0;
let trilha: string | null = 'Respeito e diálogo';

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return { ...actual, requireViewer: async () => ({ user: { id: userId, name: 'Aluna', email: 'aluna@x.test' }, workspace: { id: 'wsp_1', name: 'Demo', slug: 'demo', branding: {} }, role: 'learner' as const }) };
});
vi.mock('@lms/db', async () => {
  const actual = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  return { ...actual, getDb: () => ({}), recognition: { ...actual.recognition, trailByKey: async () => trilha, trailCheckAttemptCount: async () => tentativas } };
});

type Corpo = { check?: { trail: string; situations: Array<{ id: string; options: Array<{ id: string; label: string }> }> }; attempt?: number; error?: { code: string } };
const get = async () => {
  const { GET } = await import('./route');
  const res = await GET(new Request('http://test/api/trilhas/respeito-e-dialogo/checagem'), { params: Promise.resolve({ trail: 'respeito-e-dialogo' }) });
  return { status: res.status, texto: await res.text() };
};
const corpo = (t: string) => JSON.parse(t) as Corpo;
const ordem = (c: Corpo) => c.check!.situations.map((s) => s.options.map((o) => o.id).join('')).join(' ');

beforeEach(() => {
  userId = 'usr_aluna';
  tentativas = 0;
  trilha = 'Respeito e diálogo';
});

describe('GET /api/trilhas/[trail]/checagem', () => {
  it('devolve as 6 situações com as 3 opções e o número da tentativa', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const c = corpo(r.texto);
    expect(c.attempt).toBe(0);
    expect(c.check!.trail).toBe('Respeito e diálogo');
    expect(c.check!.situations).toHaveLength(6);
    for (const s of c.check!.situations) expect(s.options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('não manda o gabarito ao navegador: nem a marca de correta nem o retorno', async () => {
    const { texto } = await get();
    expect(texto).not.toMatch(/correct|feedback/);
    for (const s of TRAIL_CHECKS['respeito-e-dialogo']!.situations) for (const o of s.options) expect(texto).not.toContain(o.feedback);
  });

  it('mesmo aluno e mesma tentativa: mesma ordem; depois de enviar, outra; outro aluno, outra', async () => {
    const primeira = ordem(corpo((await get()).texto));
    expect(ordem(corpo((await get()).texto))).toBe(primeira);
    tentativas = 1;
    const depois = corpo((await get()).texto);
    expect(depois.attempt).toBe(1);
    expect(ordem(depois)).not.toBe(primeira);
    tentativas = 0;
    userId = 'usr_outro';
    expect(ordem(corpo((await get()).texto))).not.toBe(primeira);
  });

  it('é a mesma ordem que a página entrega (mesma semente), então o que a pessoa vê não muda ao recarregar', async () => {
    const { publicTrailCheck, trailCheckSeed } = await import('@lms/course-schema');
    const daPagina = publicTrailCheck(TRAIL_CHECKS['respeito-e-dialogo']!, trailCheckSeed({ userId, trailKey: 'respeito-e-dialogo', attempt: 0 }));
    expect(corpo((await get()).texto).check).toEqual(daPagina);
  });

  it('trilha desconhecida: 404', async () => {
    trilha = null;
    const r = await get();
    expect(r.status).toBe(404);
    expect(corpo(r.texto).error?.code).toBe('NOT_FOUND');
  });

  it('trilha sem checagem final: 404', async () => {
    trilha = 'Trilha sem checagem';
    expect((await get()).status).toBe(404);
  });
});
