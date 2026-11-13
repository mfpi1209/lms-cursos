import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDocumentSchema, richTextFromPlain } from '@lms/course-schema';
import { DomainError } from '@lms/db';

/**
 * POST /api/enrollments/[enrollmentId]/tasks/[nodeId]/file: envio do arquivo de uma entrega pelo aluno.
 * Viewer, dono da matrícula, storage e gravação do asset simulados; a conferência dos bytes (`checkTaskFile`) e as regras
 * da tarefa (`taskAcceptedMime`, `findTask`) são as de verdade. As regras de leitura e do limite contra o banco estão em
 * packages/db/test/submissions.test.ts.
 */
const doc = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Curso',
  modules: [
    {
      id: 'm1',
      title: 'M',
      lessons: [
        {
          id: 'aula_1',
          title: 'Aula 1',
          graph: {
            schemaVersion: 1,
            startNodeId: 't_arquivo',
            nodes: [
              { id: 't_arquivo', type: 'task', title: 'Com arquivo', instruction: 'Envie.', deliverable: 'link_file', criteria: [{ id: 'c1', label: 'Abre' }] },
              { id: 't_pdf', type: 'task', title: 'Só PDF', instruction: 'Envie.', deliverable: 'link_file', fileKinds: ['pdf'], criteria: [{ id: 'c1', label: 'Abre' }] },
              { id: 't_link', type: 'task', title: 'Só link', instruction: 'Envie.', deliverable: 'link', criteria: [{ id: 'c1', label: 'Abre' }] },
              { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') },
            ],
            edges: [
              { id: 'e1', from: 't_arquivo', to: 't_pdf' },
              { id: 'e2', from: 't_pdf', to: 't_link' },
              { id: 'e3', from: 't_link', to: 'fim' },
            ],
          },
        },
      ],
    },
  ],
});

let userId = 'usr_aluna';
let ownerId = 'usr_aluna';
let enrollmentStatus = 'active';
let rateLimited = false;
const stored: Array<{ key: string; size: number; contentType: string }> = [];
const assets: Array<Record<string, unknown>> = [];
const limitChecks: Array<Record<string, unknown>> = [];

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return { ...actual, requireViewer: async () => ({ user: { id: userId, name: 'Aluna', email: 'aluna@x.test' }, workspace: { id: 'wsp_1', name: 'Demo', slug: 'demo', branding: {} }, role: 'student' as const }) };
});
vi.mock('@/server/learner', async () => {
  const viewer = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  return {
    requireOwnEnrollment: async (v: { user: { id: string } }) => {
      if (v.user.id !== ownerId) throw new viewer.HttpError(404, 'Matrícula não encontrada');
      return { enrollment: { id: 'enr_1', userId: ownerId, status: enrollmentStatus }, course: { id: 'crs_1', workspaceId: 'wsp_1' }, document: doc };
    },
  };
});
vi.mock('@lms/media', async () => {
  const actual = await vi.importActual<typeof import('@lms/media')>('@lms/media');
  return {
    ...actual,
    getStorage: async () => ({
      provider: 'memoria',
      putObject: async (key: string, body: Uint8Array, contentType: string) => {
        stored.push({ key, size: body.byteLength, contentType });
        return { key };
      },
    }),
  };
});
vi.mock('@lms/db', async () => {
  const actual = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  return {
    ...actual,
    getDb: () => ({}),
    media: {
      ...actual.media,
      createAsset: async (_db: unknown, input: Record<string, unknown>) => {
        assets.push(input);
        return { id: `ast_${assets.length}`, ...input };
      },
    },
    submissions: {
      ...actual.submissions,
      assertTaskUploadAllowed: async (_db: unknown, input: Record<string, unknown>) => {
        limitChecks.push(input);
        if (rateLimited) throw new actual.DomainError('RATE_LIMITED', 'Você enviou muitos arquivos em pouco tempo. Espere alguns minutos e tente de novo.');
      },
    },
  };
});

const enc = (s: string) => new TextEncoder().encode(s);
const pdfBytes = () => enc('%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');
const pngBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(0)]);

const post = async (file: { bytes: Uint8Array; name: string; type?: string } | null, nodeId = 't_arquivo', headers: Record<string, string> = {}) => {
  const { POST } = await import('./route');
  const form = new FormData();
  if (file) form.set('file', new File([file.bytes as BlobPart], file.name, { type: file.type ?? 'application/pdf' }));
  const res = await POST(new Request('http://test/api/x', { method: 'POST', body: form, headers }), { params: Promise.resolve({ enrollmentId: 'enr_1', nodeId }) });
  return { status: res.status, json: (await res.json()) as { file?: Record<string, unknown>; error?: { code: string; message: string } } };
};

beforeEach(() => {
  userId = 'usr_aluna';
  ownerId = 'usr_aluna';
  enrollmentStatus = 'active';
  rateLimited = false;
  stored.length = 0;
  assets.length = 0;
  limitChecks.length = 0;
});

describe('envio do arquivo da entrega', () => {
  it('PDF válido: grava como documento do aluno, marcado com a matrícula e a tarefa, em chave própria', async () => {
    const r = await post({ bytes: pdfBytes(), name: 'meu roteiro.pdf' });
    expect(r.status).toBe(200);
    expect(r.json.file).toMatchObject({ assetId: 'ast_1', name: 'meu roteiro.pdf', mimeType: 'application/pdf' });
    expect(assets[0]).toMatchObject({ workspaceId: 'wsp_1', kind: 'document', source: 'upload', mimeType: 'application/pdf', createdBy: 'usr_aluna', storageProvider: 'memoria', metadata: { taskUpload: { enrollmentId: 'enr_1', nodeId: 't_arquivo' } } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.key).toMatch(/^wsp_1\/entregas\/enr_1\/arq_[a-z0-9]+\.pdf$/);
    expect(stored[0]!.contentType).toBe('application/pdf');
    expect(limitChecks).toEqual([{ userId: 'usr_aluna', enrollmentId: 'enr_1' }]);
  });

  it('imagem PNG válida também entra; o tipo vem dos bytes, não do nome nem do Content-Type', async () => {
    const r = await post({ bytes: pngBytes(), name: 'foto.pdf', type: 'application/pdf' });
    expect(r.status).toBe(200);
    expect(assets[0]).toMatchObject({ mimeType: 'image/png' });
    expect(stored[0]!.key).toMatch(/\.png$/);
  });

  it('executável disfarçado de PDF é recusado e nada é gravado', async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...new Array(300).fill(0)]);
    const r = await post({ bytes: exe, name: 'trabalho.pdf', type: 'application/pdf' });
    expect(r.status).toBe(422);
    expect(r.json.error?.message).toMatch(/Tipo de arquivo não aceito/);
    const fake = new Uint8Array([...enc('%PDF-1.4\n'), 0x4d, 0x5a, ...new Array(4000).fill(0)]);
    expect((await post({ bytes: fake, name: 'trabalho.pdf' })).status).toBe(422);
    const html = await post({ bytes: enc('<html><script>alert(1)</script></html>'), name: 'pagina.pdf' });
    expect(html.status).toBe(422);
    expect(stored).toHaveLength(0);
    expect(assets).toHaveLength(0);
  });

  it('arquivo de 11 MB é recusado (pelo tamanho declarado e pelo tamanho real)', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set(pdfBytes().subarray(0, 12));
    big.set(enc('%%EOF\n'), big.byteLength - 6);
    const real = await post({ bytes: big, name: 'grande.pdf' });
    expect(real.status).toBe(422);
    expect(real.json.error?.message).toBe('O arquivo passa de 10 MB.');
    const declared = await post({ bytes: pdfBytes(), name: 'ok.pdf' }, 't_arquivo', { 'content-length': String(12 * 1024 * 1024) });
    expect(declared.status).toBe(422);
    expect(stored).toHaveLength(0);
  });

  it('respeita os tipos da tarefa: PNG em tarefa só de PDF é recusado; tarefa só de link não recebe arquivo', async () => {
    const png = await post({ bytes: pngBytes(), name: 'foto.png', type: 'image/png' }, 't_pdf');
    expect(png.status).toBe(422);
    expect(png.json.error?.message).toBe('Tipo de arquivo não aceito. Envie PDF.');
    expect((await post({ bytes: pdfBytes(), name: 'a.pdf' }, 't_pdf')).status).toBe(200);
    const link = await post({ bytes: pdfBytes(), name: 'a.pdf' }, 't_link');
    expect(link.status).toBe(422);
    expect(link.json.error?.message).toBe('Esta tarefa recebe só o link.');
  });

  it('só o dono da matrícula envia; tarefa inexistente e matrícula cancelada são recusadas', async () => {
    userId = 'usr_outro';
    expect((await post({ bytes: pdfBytes(), name: 'a.pdf' })).status).toBe(404);
    userId = 'usr_aluna';
    expect((await post({ bytes: pdfBytes(), name: 'a.pdf' }, 't_naoexiste')).status).toBe(404);
    expect((await post({ bytes: pdfBytes(), name: 'a.pdf' }, 'fim')).status).toBe(404);
    enrollmentStatus = 'canceled';
    expect((await post({ bytes: pdfBytes(), name: 'a.pdf' })).status).toBe(403);
    expect(stored).toHaveLength(0);
  });

  it('acima do limite de envios responde 429 antes de gravar', async () => {
    rateLimited = true;
    const r = await post({ bytes: pdfBytes(), name: 'a.pdf' });
    expect(r.status).toBe(429);
    expect(r.json.error?.code).toBe('RATE_LIMITED');
    expect(stored).toHaveLength(0);
    expect(assets).toHaveLength(0);
  });

  it('sem o campo "file" responde 422; o nome do arquivo é limpo', async () => {
    expect((await post(null)).status).toBe(422);
    await post({ bytes: pdfBytes(), name: '../../etc/pass<wd>.pdf' });
    expect(assets[0]!.originalName).toBe('passwd.pdf');
    expect(new DomainError('RATE_LIMITED', 'x').code).toBe('RATE_LIMITED');
  });
});
