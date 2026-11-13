import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allLessons } from '../src/course';
import { importMarkdownCourse } from '../src/import/markdown-course';
import { parseScreenMocksMarkdown } from '../src/import/screen-mocks-markdown';
import type { AnyNode } from '../src/nodes';

const FALA = `**Fala para gravação**

"Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem é a lista e o que ela precisa. Quanto mais claro o pedido, mais útil fica a resposta. Agora olhe a tela e acompanhe cada passo, do primeiro clique até o envio da mensagem."

Texto na tela: Passo a passo
`;
const video = (code: string, extra = '') => `### ${code} — Cena ${code}\n${extra}\n${FALA}\n`;
const roteiro = (scenes: string, notes = '') => `# Curso de teste

Ideia: Testar telas.
Público: alunos.
Objetivo final: Ao final, a pessoa assiste.
Duração-alvo: 1 aula de 3 a 5 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Tela

Objetivo: Ao final, você vê a tela.

${scenes}
### FIM — O que você levou

- Primeiro tópico curto
- Segundo tópico curto
${notes}`;
const NOTES = (line: string) => `\n## Notas para a montagem\n\n${line}\n`;
const telas = (md: string) => parseScreenMocksMarkdown(md);
const mk = (name: string, model = 'chat') => `## ${name}\nModelo: ${model}\nApp: App\n- digita: oi\n\n`;

type Result = ReturnType<typeof importMarkdownCourse>;
const nodesOf = (r: Result): AnyNode[] => allLessons(r.document).flatMap((l) => l.graph.nodes as AnyNode[]);
const recs = (r: Result, id: string) => {
  const n = nodesOf(r).find((x) => x.id === id);
  return n && 'screenRecordings' in n ? n.screenRecordings : undefined;
};
const codes = (r: Result, code: string) => r.warnings.filter((w) => w.code === code);

describe('importador: telas simuladas', () => {
  it('linha "Vídeo próprio:" com tela: mock + source, sem SCREEN_MEDIA_MISSING, com PENDING', () => {
    const { mocks } = telas(mk('gravacao_a') + mk('gravacao_b', 'browser'));
    const r = importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: gravacao_a.mp4\nVideo proprio: Gravacao_B.MP4')), { screenMocks: mocks });
    const list = recs(r, 'v01')!;
    expect(list.map((x) => x.fileName)).toEqual(['gravacao_a.mp4', 'Gravacao_B.MP4']);
    expect(list.every((x) => x.source === 'mock' && x.mock && !x.assetId)).toBe(true);
    expect(list[1]!.mock!.model).toBe('browser');
    expect(codes(r, 'SCREEN_MEDIA_MISSING')).toHaveLength(0);
    expect(codes(r, 'SCREEN_MOCK_MISSING')).toHaveLength(0);
    expect(codes(r, 'SCREEN_MOCK_PENDING').map((w) => w.message)).toEqual(['2 telas simuladas a gerar']);
    expect(codes(r, 'SCREEN_MOCK_UNUSED')).toHaveLength(0);
  });

  it('fallback: cena listada nas notas sem "Vídeo próprio:" ganha as gravações na ordem, sem LIST_MISMATCH', () => {
    const { mocks } = telas(mk('gravacao_b') + mk('gravacao_a'));
    const r = importMarkdownCourse(roteiro(video('V01') + video('V02'), NOTES('Cenas com gravação de tela (anexar o MP4 na cena): V01 (gravacao_a, gravacao_b)')), { screenMocks: mocks });
    expect(recs(r, 'v01')!.map((x) => `${x.fileName}:${x.source}`)).toEqual(['gravacao_a.mp4:mock', 'gravacao_b.mp4:mock']);
    expect(recs(r, 'v02')).toBeUndefined();
    expect(codes(r, 'SCREEN_LIST_MISMATCH')).toHaveLength(0);
    expect(codes(r, 'SCREEN_MOCK_PENDING')[0]!.message).toBe('2 telas simuladas a gerar');
    // sem direção de avatar, como nas gravações de tela
    expect((nodesOf(r).find((x) => x.id === 'v01') as { direction?: unknown }).direction).toBeUndefined();
  });

  it('fallback não vale sem nenhum mock da lista; o aviso de conferência continua', () => {
    const { mocks } = telas(mk('outra'));
    const r = importMarkdownCourse(roteiro(video('V01'), NOTES('Cenas com gravação de tela: V01 (gravacao_a)')), { screenMocks: mocks });
    expect(recs(r, 'v01')).toBeUndefined();
    expect(codes(r, 'SCREEN_LIST_MISMATCH')).toHaveLength(1);
    expect(codes(r, 'SCREEN_MOCK_UNUSED').map((w) => w.message)).toEqual(['a tela simulada "outra" não é usada por nenhuma cena']);
  });

  it('gravação sem mock e sem asset: SCREEN_MOCK_MISSING (no lugar de MEDIA_MISSING); tela sem uso: UNUSED', () => {
    const { mocks } = telas(mk('gravacao_a') + mk('sobra'));
    const r = importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: gravacao_a.mp4\nVídeo próprio: gravacao_z.mp4')), { screenMocks: mocks });
    const list = recs(r, 'v01')!;
    expect(list[0]!.mock).toBeDefined();
    expect(list[1]).toEqual({ fileName: 'gravacao_z.mp4' });
    expect(codes(r, 'SCREEN_MOCK_MISSING')[0]!.message).toContain('gravacao_z.mp4');
    expect(codes(r, 'SCREEN_MEDIA_MISSING')).toHaveLength(0);
    expect(codes(r, 'SCREEN_MOCK_UNUSED').map((w) => w.message)).toEqual(['a tela simulada "sobra" não é usada por nenhuma cena']);
    expect(codes(r, 'SCREEN_MOCK_PENDING')[0]!.message).toBe('1 telas simuladas a gerar');
  });

  it('problemas do arquivo de telas viram SCREEN_MOCK_INVALID com chave e linha', () => {
    const t = telas('## ruim\nModelo: chat\nApp: X\n- voa: x\n');
    const r = importMarkdownCourse(roteiro(video('V01')), { screenMocks: t.mocks, screenMockIssues: t.issues });
    const w = codes(r, 'SCREEN_MOCK_INVALID');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toMatch(/ruim.*linha 4/);
  });

  it('seção qualificada vale só para a cena e tem precedência; UNUSED considera as qualificadas', () => {
    const t = telas(mk('gravacao_p') + `## gravacao_p (V02)\nModelo: notes\nApp: Notas\n- digita: só da V02\n\n## gravacao_p (V09)\nModelo: notes\nApp: Notas\n- digita: ninguém usa\n`);
    const r = importMarkdownCourse(roteiro(video('V01', 'Vídeo próprio: gravacao_p.mp4') + video('V02', 'Vídeo próprio: gravacao_p.mp4')), { screenMocks: t.mocks });
    expect(recs(r, 'v01')![0]!.mock!.model).toBe('chat');
    expect(recs(r, 'v02')![0]!.mock!.model).toBe('notes');
    expect(codes(r, 'SCREEN_MOCK_UNUSED').map((w) => w.message)).toEqual(['a tela simulada "gravacao_p@V09" não é usada por nenhuma cena']);
  });

  it('sem screenMocks: saída idêntica à de antes', () => {
    const md = roteiro(video('V01', 'Vídeo próprio: gravacao_a.mp4'), NOTES('Cenas com gravação de tela: V01 (gravacao_a)'));
    const a = importMarkdownCourse(md, {});
    expect(recs(a, 'v01')).toEqual([{ fileName: 'gravacao_a.mp4' }]);
    expect(codes(a, 'SCREEN_MEDIA_MISSING')).toHaveLength(1);
    expect(a.warnings.some((w) => w.code.startsWith('SCREEN_MOCK'))).toBe(false);
  });
});

describe('exemplo em docs/roteiros/exemplos', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/roteiros/exemplos');
  it('o arquivo de telas irmão cobre as gravações do exemplo, com 3 modelos, sem avisos de telas', () => {
    const t = parseScreenMocksMarkdown(readFileSync(path.join(dir, 'telas/exemplo-video-proprio.telas.md'), 'utf8'));
    expect(t.issues).toEqual([]);
    expect(new Set([...t.mocks.values()].map((m) => m.model)).size).toBeGreaterThanOrEqual(3);
    const r = importMarkdownCourse(readFileSync(path.join(dir, 'exemplo-video-proprio.md'), 'utf8'), { screenMocks: t.mocks, screenMockIssues: t.issues });
    expect(r.warnings.filter((w) => ['SCREEN_MOCK_MISSING', 'SCREEN_MOCK_UNUSED', 'SCREEN_MOCK_INVALID', 'SCREEN_MEDIA_MISSING', 'SCREEN_LIST_MISMATCH'].includes(w.code))).toEqual([]);
    expect(r.warnings.find((w) => w.code === 'SCREEN_MOCK_PENDING')?.message).toBe('3 telas simuladas a gerar');
  });
});
