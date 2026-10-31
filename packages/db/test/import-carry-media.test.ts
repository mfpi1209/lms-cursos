import { describe, expect, it } from 'vitest';
import { importMarkdownCourse } from '@lms/course-schema';
import { carryOverMedia } from '../src/scripts/import-markdown-course';

/* Reimportar o roteiro não apaga vídeos já gerados: puro, sem banco. */
const md = (fala: string) => `# Curso teste

Ideia: Testar.
Público: Jovens.
Objetivo final: Ao final, a pessoa consegue testar.
Duração-alvo: 1 aula de 3 a 6 minutos (cerca de 5 minutos no total).

## Módulo 1 — Teste

Descrição: Teste.

### Aula 1 — Primeira

Objetivo: Ao final, você testa.

### V01 — Abertura

**Fala para gravação**

"${fala}"

### V02 — Segunda

**Fala para gravação**

"Uma segunda fala curta para o teste do importador, sem mudanças entre as duas versões do roteiro, com palavras suficientes para valer como fala de vídeo de verdade aqui."

### FIM — O que você levou

- Testar sempre.
`;
const FALA = 'Nesta aula, você vai testar o importador. Esta é a fala original do vídeo, com palavras suficientes para valer como fala de verdade num vídeo curto de teste.';
const MEDIA = { assetId: 'ast_pago', kind: 'video' as const, generatedFrom: { jobId: 'mjb_1', sceneHash: 'h', provider: 'heygen' } };

function withMedia(doc: ReturnType<typeof importMarkdownCourse>['document']) {
  const d = structuredClone(doc);
  for (const n of d.modules[0]!.lessons[0]!.graph.nodes) if (n.id === 'v01' || n.id === 'v02') (n as { media?: unknown }).media = MEDIA;
  return d;
}

describe('importador: mídia preservada ao reimportar', () => {
  it('mantém a mídia das cenas iguais e marca desatualizada só a que mudou de fala', () => {
    const before = withMedia(importMarkdownCourse(md(FALA), {}).document);
    const next = importMarkdownCourse(md(FALA.replace('original', 'revisada')), {}).document;
    const r = carryOverMedia(before, next);
    expect(r.kept).toEqual(['aula_01/v02']);
    expect(r.stale).toEqual(['aula_01/v01']);
    const nodes = r.document.modules[0]!.lessons[0]!.graph.nodes as Array<{ id: string; media?: { assetId: string; stale?: boolean } }>;
    expect(nodes.find((n) => n.id === 'v02')!.media).toEqual(MEDIA);
    expect(nodes.find((n) => n.id === 'v01')!.media).toMatchObject({ assetId: 'ast_pago', stale: true });
    // o documento de entrada não é alterado
    expect((next.modules[0]!.lessons[0]!.graph.nodes.find((n) => n.id === 'v01') as { media?: unknown }).media).toBeUndefined();
  });

  it('roteiro idêntico: nada muda além de manter a mídia', () => {
    const before = withMedia(importMarkdownCourse(md(FALA), {}).document);
    const r = carryOverMedia(before, importMarkdownCourse(md(FALA), {}).document);
    expect(r.stale).toEqual([]);
    expect(r.kept.sort()).toEqual(['aula_01/v01', 'aula_01/v02']);
  });
});
