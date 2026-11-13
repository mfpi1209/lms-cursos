import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importMarkdownCourse, parseScreenMocksMarkdown } from '@lms/course-schema';
import { carryOverMedia, loadScreenMocks, parseArgs, siblingScreensPath } from '../src/scripts/import-markdown-course';

const TELAS = (txt: string) => `## gravacao_a\nModelo: chat\nApp: App\n- digita: ${txt}\n`;
const FALA = `**Fala para gravação**\n\n"Vou mostrar na tela como se faz o pedido. Repare que o pedido diz para quem é a lista e o que ela precisa. Quanto mais claro o pedido, mais útil fica a resposta. Agora olhe a tela e acompanhe cada passo, do primeiro clique até o envio da mensagem."\n\nTexto na tela: Passo a passo\n`;
const md = `# Curso teste

Ideia: Testar.
Público: Jovens.
Objetivo final: Ao final, a pessoa consegue testar.
Duração-alvo: 1 aula de 3 a 6 minutos (cerca de 5 minutos no total).

## Módulo 1 — Teste

Descrição: Teste.

### Aula 1 — Primeira

Objetivo: Ao final, você testa.

### V01 — Abertura
Vídeo próprio: gravacao_a.mp4
Vídeo próprio: gravacao_b.mp4

${FALA}
### FIM — O que você levou

- Testar sempre.
`;
const load = (txt: string) => {
  const { mocks } = parseScreenMocksMarkdown(TELAS(txt) + `\n## gravacao_b\nModelo: browser\nApp: Site\n- digita: fixo\n`);
  return importMarkdownCourse(md, { screenMocks: mocks }).document;
};
const recsOf = (d: ReturnType<typeof load>) => (d.modules[0]!.lessons[0]!.graph.nodes.find((n) => n.id === 'v01') as { screenRecordings: Array<Record<string, unknown>> }).screenRecordings;

describe('CLI: arquivo de telas', () => {
  it('acha o irmão telas/<roteiro>.telas.md', () => {
    expect(siblingScreensPath('docs/roteiros/c1-ia.md')).toBe(path.join('docs/roteiros', 'telas', 'c1-ia.telas.md'));
  });

  it('carrega o irmão quando existe; sem ele, undefined', () => {
    const args = parseArgs(['--file', 'docs/roteiros/x.md']);
    const seen: string[] = [];
    const got = loadScreenMocks(args, (f) => (seen.push(f), TELAS('oi')), (f) => f === path.join('docs/roteiros', 'telas', 'x.telas.md'));
    expect(got?.mocks.size).toBe(1);
    expect(seen).toEqual([path.join('docs/roteiros', 'telas', 'x.telas.md')]);
    expect(loadScreenMocks(args, () => '', () => false)).toBeUndefined();
  });

  it('--telas troca o caminho (e precisa existir); --sem-telas desliga', () => {
    const a = parseArgs(['--file', 'x.md', '--telas', 'outro/t.md']);
    expect(a.telas).toBe('outro/t.md');
    expect(loadScreenMocks(a, () => TELAS('a'), () => true)?.file).toBe('outro/t.md');
    expect(() => loadScreenMocks(a, () => '', () => false)).toThrow(/não encontrado/);
    const off = parseArgs(['--file', 'x.md', '--sem-telas']);
    expect(off.semTelas).toBe(true);
    expect(loadScreenMocks(off, () => TELAS('a'), () => true)).toBeUndefined();
    expect(parseArgs(['--file', 'x.md']).semTelas).toBe(false);
  });
});

describe('reimportação com telas simuladas', () => {
  const generated = (d: ReturnType<typeof load>) => {
    const c = structuredClone(d);
    for (const r of recsOf(c)) Object.assign(r, { assetId: `ast_${String(r.fileName)}`, fit: 'ok', durationSec: 12, source: 'mock' });
    return c;
  };

  it('mock igual mantém assetId/fit/durationSec/source', () => {
    const r = carryOverMedia(generated(load('oi')), load('oi'));
    expect(r.screensKept).toHaveLength(2);
    expect(r.screensReset).toEqual([]);
    expect(recsOf(r.document)[0]).toMatchObject({ assetId: 'ast_gravacao_a.mp4', fit: 'ok', durationSec: 12, source: 'mock' });
  });

  it('mock mudado perde o asset (só a gravação que mudou)', () => {
    const r = carryOverMedia(generated(load('oi')), load('tchau'));
    expect(r.screensReset).toEqual(['aula_01/v01:gravacao_a.mp4']);
    expect(r.screensKept).toEqual(['aula_01/v01:gravacao_b.mp4']);
    const [a, b] = recsOf(r.document);
    expect(a!.assetId).toBeUndefined();
    expect(a!.fit).toBeUndefined();
    expect(a!.durationSec).toBeUndefined();
    expect(a!.source).toBe('mock');
    expect(b!.assetId).toBe('ast_gravacao_b.mp4');
  });

  it('envio manual (upload) sobre a tela é mantido se a tela não mudou', () => {
    const prev = generated(load('oi'));
    for (const r of recsOf(prev)) r.source = 'upload';
    const r = carryOverMedia(prev, load('oi'));
    expect(recsOf(r.document)[0]).toMatchObject({ assetId: 'ast_gravacao_a.mp4', source: 'upload' });
  });
});
