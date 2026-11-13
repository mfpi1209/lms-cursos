import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDocumentSchema, richTextFromPlain, type CourseDocument } from '@lms/course-schema';
import { listScreenRecordings } from '@/lib/screen-recordings';

/**
 * POST /api/courses/[courseId]/screen-recordings: envio de UM MP4 de gravação de tela, ligado ao rascunho.
 * Viewer, banco, storage e rascunho em memória; a validação (assinatura, tipo, tamanho), o casamento por nome, o
 * controle de revisão e a permissão são os de verdade (`requireEditor`, `applyRecordingAsset`, `storeScreenRecording`).
 */
const baseDoc = (): CourseDocument =>
  CourseDocumentSchema.parse({
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
              startNodeId: 'v1',
              nodes: [
                { id: 'v1', type: 'content', title: 'Pedido', body: richTextFromPlain('x'), screenRecordings: [{ fileName: 'tela-01.mp4' }, { fileName: 'tela-02.mp4', assetId: 'ast_velho', fit: 'short', durationSec: 8 }] },
                { id: 'v2', type: 'scenario', title: 'Outra', body: richTextFromPlain('y'), screenRecordings: [{ fileName: 'Tela-01.mp4', assetId: 'ast_x', fit: 'trimmed', durationSec: 30 }] },
                { id: 'fim', type: 'end', summary: richTextFromPlain('Fim') },
              ],
              edges: [
                { id: 'e1', from: 'v1', to: 'v2' },
                { id: 'e2', from: 'v2', to: 'fim' },
              ],
            },
          },
        ],
      },
    ],
  });

type Role = 'admin' | 'author' | 'reviewer' | 'student';
let role: Role = 'author';
let workspaceId = 'wsp_1';
let draft: { document: CourseDocument; revision: number };
let interfere: (() => void) | null = null;
const stored = new Map<string, Buffer>();
const deleted: string[] = [];
const assets: Array<Record<string, unknown>> = [];
const audits: Array<Record<string, unknown>> = [];
const saves: Array<{ revision: number; origin?: string; note?: string; userId: string }> = [];

vi.mock('@/server/viewer', async () => {
  const actual = await vi.importActual<typeof import('@/server/viewer')>('@/server/viewer');
  const db = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  // requireEditor chama o requireViewer do próprio módulo: aqui a sessão é simulada e a regra de papel é a de verdade (identity.canEdit)
  const viewer = () => ({ user: { id: 'usr_1', name: 'Autora', email: 'a@x.test' }, workspace: { id: workspaceId, name: 'Demo', slug: 'demo', branding: {} }, role });
  return {
    ...actual,
    requireEditor: async () => {
      if (!db.identity.canEdit(role)) throw new actual.HttpError(403, 'Você não tem permissão para editar cursos');
      return viewer();
    },
  };
});
vi.mock('@lms/media', async () => {
  const actual = await vi.importActual<typeof import('@lms/media')>('@lms/media');
  return {
    ...actual,
    getStorage: async () => ({
      provider: 'memoria',
      putObject: async (key: string, body: Readable | Uint8Array) => {
        const chunks: Buffer[] = [];
        if (body instanceof Uint8Array) chunks.push(Buffer.from(body));
        else for await (const c of body) chunks.push(Buffer.from(c));
        stored.set(key, Buffer.concat(chunks));
        return { key };
      },
      deleteObject: async (key: string) => {
        deleted.push(key);
        stored.delete(key);
      },
    }),
  };
});
vi.mock('@lms/db', async () => {
  const actual = await vi.importActual<typeof import('@lms/db')>('@lms/db');
  return {
    ...actual,
    getDb: () => ({ insert: () => ({ values: async (v: Record<string, unknown>) => void audits.push(v) }) }),
    authoring: {
      ...actual.authoring,
      getCourse: async () => ({ id: 'crs_1', workspaceId: 'wsp_1' }),
      getDraft: async () => ({ document: structuredClone(draft.document), revision: draft.revision }),
      saveDraft: async (_db: unknown, input: { document: CourseDocument; expectedRevision: number; userId: string; origin?: string; note?: string }) => {
        if (interfere) {
          const run = interfere;
          interfere = null;
          run();
        }
        if (input.expectedRevision !== draft.revision) throw new actual.DomainError('CONFLICT', 'conflito', { currentRevision: draft.revision });
        draft = { document: input.document, revision: draft.revision + 1 };
        saves.push({ revision: draft.revision, origin: input.origin, note: input.note, userId: input.userId });
        return { revision: draft.revision, updatedAt: new Date() };
      },
    },
    media: {
      ...actual.media,
      createAsset: async (_db: unknown, input: Record<string, unknown>) => {
        const row = { id: `ast_${assets.length + 1}`, ...input };
        assets.push(row);
        return row;
      },
    },
  };
});

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(2000, 7)]);
const call = async (fileName: string | null, body: Buffer | null = MP4, headers: Record<string, string> = { 'content-type': 'video/mp4' }) => {
  const { POST } = await import('./route');
  const url = `http://test/api/courses/crs_1/screen-recordings${fileName === null ? '' : `?fileName=${encodeURIComponent(fileName)}`}`;
  const res = await POST(new Request(url, { method: 'POST', headers, body: body as never, ...(body ? { duplex: 'half' } : {}) } as RequestInit), { params: Promise.resolve({ courseId: 'crs_1' }) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};
const recs = () => listScreenRecordings(draft.document);

beforeEach(() => {
  role = 'author';
  workspaceId = 'wsp_1';
  draft = { document: baseDoc(), revision: 4 };
  interfere = null;
  stored.clear();
  deleted.length = 0;
  assets.length = 0;
  audits.length = 0;
  saves.length = 0;
  delete process.env.SCREEN_RECORDING_MAX_MB;
});

describe('envio de gravação de tela', () => {
  it('grava o MP4, cria o asset de vídeo e liga o assetId no rascunho (nova revisão), zerando fit e duração', async () => {
    const r = await call('tela-02.MP4');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ assetId: 'ast_1', sizeBytes: MP4.byteLength, linked: 1, revision: 5 });
    expect(stored.size).toBe(1);
    const [key, bytes] = Array.from(stored.entries())[0]!;
    expect(key).toMatch(/^wsp_1\/video\/gravacoes\/arq_.+\.mp4$/);
    expect(bytes.equals(MP4)).toBe(true);
    expect(assets[0]).toMatchObject({ workspaceId: 'wsp_1', kind: 'video', source: 'upload', mimeType: 'video/mp4', sizeBytes: MP4.byteLength, storageKey: key, createdBy: 'usr_1' });
    expect(String(assets[0]!.sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(recs()[1]).toMatchObject({ fileName: 'tela-02.mp4', assetId: 'ast_1', fit: undefined, durationSec: undefined });
    expect(saves).toEqual([{ revision: 5, origin: 'screen-recording', note: 'Gravação de tela: tela-02.MP4', userId: 'usr_1' }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'screen_recording.link', entityType: 'course', entityId: 'crs_1', actorId: 'usr_1', workspaceId: 'wsp_1' });
  });

  it('o mesmo nome em duas cenas liga nas duas, mesmo com caixa diferente e sem .mp4', async () => {
    const r = await call('TELA-01');
    expect(r.json.linked).toBe(2);
    expect(recs().filter((x) => x.assetId === 'ast_1').map((x) => x.nodeId)).toEqual(['v1', 'v2']);
    expect(recs()[2]).toMatchObject({ fit: undefined, durationSec: undefined });
    expect(assets).toHaveLength(1);
  });

  it('arquivo sem par: 404 antes de ler o corpo, nada é salvo', async () => {
    const r = await call('nao-existe.mp4');
    expect(r.status).toBe(404);
    expect(r.json.error.message).toMatch(/não reconhecido/i);
    expect(stored.size + assets.length + audits.length + saves.length).toBe(0);
  });

  it('recusa tipo que não é video/mp4 (Content-Type), sem salvar', async () => {
    for (const ct of ['video/webm', 'text/html', 'application/octet-stream']) {
      const r = await call('tela-01.mp4', MP4, { 'content-type': ct });
      expect(r.status, ct).toBe(422);
    }
    expect(stored.size + assets.length).toBe(0);
  });

  it('recusa conteúdo que não é MP4 mesmo com nome e tipo certos (assinatura ftyp), e limpa o storage', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(500, ' '));
    const r = await call('tela-01.mp4', html);
    expect(r.status).toBe(422);
    expect(r.json.error.message).toMatch(/MP4 válido/);
    expect(assets).toHaveLength(0);
    expect(saves).toHaveLength(0);
    expect(stored.size).toBe(0);
    expect(deleted).toHaveLength(1);
  });

  it('recusa arquivo vazio ou minúsculo demais para ter assinatura', async () => {
    expect((await call('tela-01.mp4', Buffer.alloc(0))).status).toBe(422);
    expect((await call('tela-01.mp4', Buffer.from('ftyp'))).status).toBe(422);
    expect(assets).toHaveLength(0);
  });

  it('limite por ambiente: Content-Length acima do limite é 413 sem ler o corpo; sem Content-Length, o fluxo é cortado', async () => {
    process.env.SCREEN_RECORDING_MAX_MB = '1';
    const over = await call('tela-01.mp4', MP4, { 'content-type': 'video/mp4', 'content-length': String(2 * 1024 * 1024) });
    expect(over.status).toBe(413);
    expect(over.json.error.message).toBe('O arquivo passa de 1 MB.');
    expect(stored.size).toBe(0);

    const big = Buffer.concat([MP4, Buffer.alloc(1024 * 1024, 1)]);
    const stream = await call('tela-01.mp4', big);
    expect(stream.status).toBe(422);
    expect(stream.json.error.message).toBe('O arquivo passa de 1 MB.');
    expect(assets).toHaveLength(0);
    expect(deleted).toHaveLength(1);
    expect(saves).toHaveLength(0);
  });

  it('sem limite configurado o padrão é 1 GB (um arquivo pequeno passa)', async () => {
    expect((await call('tela-01.mp4')).status).toBe(200);
  });

  it('exige o nome em fileName', async () => {
    expect((await call(null)).status).toBe(422);
  });

  it('conflito de revisão: lê o rascunho de novo e liga sem perder a edição da outra pessoa', async () => {
    interfere = () => {
      const other = structuredClone(draft.document);
      other.title = 'Título editado por outra pessoa';
      draft = { document: other, revision: draft.revision + 1 };
    };
    const r = await call('tela-01.mp4');
    expect(r.status).toBe(200);
    expect(r.json.revision).toBe(6);
    expect(draft.document.title).toBe('Título editado por outra pessoa');
    expect(recs().filter((x) => x.assetId === 'ast_1')).toHaveLength(2);
  });

  it('se a gravação some do curso enquanto o arquivo sobe, não liga nada (409)', async () => {
    interfere = () => {
      const other = structuredClone(draft.document);
      for (const n of other.modules[0]!.lessons[0]!.graph.nodes) if ('screenRecordings' in n) delete (n as { screenRecordings?: unknown }).screenRecordings;
      draft = { document: other, revision: draft.revision + 1 };
    };
    const r = await call('tela-01.mp4');
    expect(r.status).toBe(409);
    expect(saves).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe('permissão', () => {
  it('admin e autor enviam', async () => {
    for (const r of ['admin', 'author'] as const) {
      role = r;
      expect((await call('tela-01.mp4')).status, r).toBe(200);
    }
  });

  it('revisor (só leitura) e aluno recebem 403 e nada é lido nem salvo', async () => {
    for (const r of ['reviewer', 'student'] as const) {
      role = r;
      expect((await call('tela-01.mp4')).status, r).toBe(403);
    }
    expect(stored.size + assets.length + saves.length + audits.length).toBe(0);
  });

  it('equipe de outro workspace não alcança o curso (404)', async () => {
    workspaceId = 'wsp_2';
    expect((await call('tela-01.mp4')).status).toBe(404);
    expect(stored.size + assets.length + saves.length).toBe(0);
  });
});
