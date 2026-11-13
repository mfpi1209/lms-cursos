import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/assets/[assetId]: quem lê cada arquivo. Foco na regra nova: o arquivo de uma ENTREGA de tarefa (asset
 * `document` com `metadata.taskUpload`) é lido pela equipe do workspace e pelo aluno que o enviou; outro aluno recebe 404.
 * Viewer, banco e storage simulados; `submissions.isOwnTaskFile` é a regra de verdade.
 */
type Role = 'admin' | 'author' | 'reviewer' | 'student';
let viewer: { id: string; role: Role; workspaceId: string } | null = { id: 'usr_aluna', role: 'student', workspaceId: 'wsp_1' };

const ASSETS: Record<string, Record<string, unknown>> = {
  ast_entrega_pdf: { id: 'ast_entrega_pdf', workspaceId: 'wsp_1', kind: 'document', mimeType: 'application/pdf', storageProvider: 'memoria', storageKey: 'k1', createdBy: 'usr_aluna', metadata: { taskUpload: { enrollmentId: 'enr_1', nodeId: 't01' } } },
  ast_entrega_png: { id: 'ast_entrega_png', workspaceId: 'wsp_1', kind: 'document', mimeType: 'image/png', storageProvider: 'memoria', storageKey: 'k2', createdBy: 'usr_aluna', metadata: { taskUpload: { enrollmentId: 'enr_1', nodeId: 't01' } } },
  ast_fonte: { id: 'ast_fonte', workspaceId: 'wsp_1', kind: 'document', mimeType: 'application/pdf', storageProvider: 'memoria', storageKey: 'k3', createdBy: 'usr_autor', metadata: null },
  // documento da equipe que, por engano, tem um aluno como autor mas NÃO é de entrega
  ast_doc_sem_marca: { id: 'ast_doc_sem_marca', workspaceId: 'wsp_1', kind: 'document', mimeType: 'application/pdf', storageProvider: 'memoria', storageKey: 'k4', createdBy: 'usr_aluna', metadata: null },
  ast_legenda: { id: 'ast_legenda', workspaceId: 'wsp_1', kind: 'document', mimeType: 'text/vtt', storageProvider: 'memoria', storageKey: 'k5', createdBy: null, metadata: null },
  ast_video: { id: 'ast_video', workspaceId: 'wsp_1', kind: 'video', mimeType: 'video/mp4', storageProvider: 'memoria', storageKey: 'k6', createdBy: 'usr_autor', metadata: null },
};

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return {
    ...actual,
    requireViewer: async () => {
      if (!viewer) throw new actual.HttpError(401, 'Faça login para continuar');
      return { user: { id: viewer.id, name: 'X', email: 'x@x.test' }, workspace: { id: viewer.workspaceId, name: 'Demo', slug: 'demo', branding: {} }, role: viewer.role };
    },
  };
});
vi.mock('@lms/media', async () => {
  const actual = await vi.importActual<typeof import('@lms/media')>('@lms/media');
  return { ...actual, getStorage: async () => ({ provider: 'memoria', head: async (key: string) => ({ key, sizeBytes: 5 }), getStream: () => Readable.from([Buffer.from('bytes')]) }) };
});
vi.mock('@lms/db', async () => {
  const actual = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  return { ...actual, getDb: () => ({}), media: { ...actual.media, getAsset: async (_db: unknown, id: string) => ASSETS[id] ?? null } };
});

const get = async (assetId: string) => {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://test/api/assets/${assetId}`), { params: Promise.resolve({ assetId }) });
  return res;
};
const as = (id: string, role: Role, workspaceId = 'wsp_1') => {
  viewer = { id, role, workspaceId };
};

beforeEach(() => as('usr_aluna', 'student'));

describe('arquivo de entrega: quem lê', () => {
  it('o aluno que enviou lê o próprio arquivo; PDF sai como download, sem cache e em sandbox', async () => {
    const res = await get('ast_entrega_pdf');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="entrega-ast_entrega_pdf.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    const img = await get('ast_entrega_png');
    expect(img.status).toBe(200);
    expect(img.headers.get('content-disposition')).toMatch(/^inline/);
  });

  it('outro aluno do mesmo workspace recebe 404 (não sabe se o arquivo existe)', async () => {
    as('usr_outro_aluno', 'student');
    expect((await get('ast_entrega_pdf')).status).toBe(404);
    expect((await get('ast_entrega_png')).status).toBe(404);
    expect((await get('ast_naoexiste')).status).toBe(404);
  });

  it('a equipe do workspace (admin, autor, revisor) lê; a de outro workspace, não', async () => {
    for (const role of ['admin', 'author', 'reviewer'] as const) {
      as(`usr_${role}`, role);
      expect((await get('ast_entrega_pdf')).status, role).toBe(200);
    }
    as('usr_revisor_fora', 'reviewer', 'wsp_2');
    expect((await get('ast_entrega_pdf')).status).toBe(404);
  });

  it('sem sessão: 401', async () => {
    viewer = null;
    expect((await get('ast_entrega_pdf')).status).toBe(401);
  });

  it('as regras antigas continuam: documento da equipe só para a equipe; legenda e vídeo para qualquer membro', async () => {
    expect((await get('ast_fonte')).status).toBe(404);
    expect((await get('ast_doc_sem_marca')).status).toBe(404);
    expect((await get('ast_legenda')).status).toBe(200);
    const video = await get('ast_video');
    expect(video.status).toBe(200);
    expect(video.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(video.headers.get('content-security-policy')).toBeNull();
    as('usr_autor', 'author');
    expect((await get('ast_fonte')).status).toBe(200);
  });
});
