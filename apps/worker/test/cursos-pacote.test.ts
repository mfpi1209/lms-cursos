import { describe, expect, it } from 'vitest';
import { COURSE_PACKAGE_VERSION, parseManifest } from '../src/scripts/cursos-pacote';

const sha = 'a'.repeat(64);
const ok = () => ({
  version: COURSE_PACKAGE_VERSION,
  createdAt: '2026-11-24T00:00:00Z',
  courses: [{ id: 'crs_abc123', slug: 'meu-curso', title: 'Curso', trail: null, posterAssetId: null, versionNumber: 1, document: { title: 'Curso' } }],
  assets: [{ id: 'ast_abc12345', kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: 10, storageKey: 'wsp_x/video/aa/aa.mp4', originalName: null, sha256: sha, durationSeconds: null, transcript: null, metadata: {} }],
});

describe('pacote de cursos: validação do manifesto', () => {
  it('aceita o formato da exportação', () => {
    expect(parseManifest(ok()).courses).toHaveLength(1);
  });

  it('recusa versão desconhecida, ids e slugs estranhos', () => {
    expect(() => parseManifest({ ...ok(), version: 99 })).toThrow(/formato desconhecido/);
    expect(() => parseManifest({ ...ok(), courses: [{ ...ok().courses[0], id: 'usr_x' }] })).toThrow(/id de curso/);
    expect(() => parseManifest({ ...ok(), courses: [{ ...ok().courses[0], slug: 'A B' }] })).toThrow(/slug/);
    expect(() => parseManifest({ ...ok(), assets: [{ ...ok().assets[0], id: "ast_x'; drop" }] })).toThrow(/id de mídia/);
  });

  it('recusa caminhos que saem da pasta do storage e sha256 inválido', () => {
    for (const storageKey of ['../../etc/passwd', '/etc/passwd', 'a/../../b', 'a b.mp4', 'a\\b.mp4']) {
      expect(() => parseManifest({ ...ok(), assets: [{ ...ok().assets[0], storageKey }] })).toThrow(/caminho/);
    }
    expect(() => parseManifest({ ...ok(), assets: [{ ...ok().assets[0], sha256: 'xyz' }] })).toThrow(/sha256/);
  });
});
