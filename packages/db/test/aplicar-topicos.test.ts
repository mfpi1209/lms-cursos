import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importMarkdownCourse, parseSceneTopicsMarkdown, parseScreenMocksMarkdown } from '@lms/course-schema';
import { loadSceneTopics, parseArgs, siblingTopicsPath } from '../src/scripts/import-markdown-course';
import { applyTopicsToDocument, parseTopicsArgs } from '../src/scripts/aplicar-topicos';

const FALA = `**Fala para gravação**\n\n"Vou mostrar onde a inteligência artificial costuma errar. Ela erra com fatos muito recentes, porque o treino acaba numa data. Ela erra com contas mais longas, porque não calcula de verdade, e erra com fontes inventadas."\n\nTexto na tela: Onde ela erra\n`;
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

${FALA}
### V02 — Tela
Vídeo próprio: gravacao_a.mp4

${FALA}
### FIM — O que você levou

- Testar sempre.
`;
const TELAS = '## gravacao_a\nModelo: chat\nApp: App\n- digita: oi\n';
const topicsMd = `## V01\n- Fatos recentes (na fala: "fatos muito recentes")\n- Fontes\n## V02\n- Qualquer\n## V09\n- Perdido\n`;

describe('CLI: arquivo de tópicos', () => {
  it('acha o irmão telas/<roteiro>.topicos.md e o carrega só quando existe', () => {
    expect(siblingTopicsPath('docs/roteiros/c1-ia.md')).toBe(path.join('docs/roteiros', 'telas', 'c1-ia.topicos.md'));
    const args = parseArgs(['--file', 'docs/roteiros/x.md']);
    const got = loadSceneTopics(args, () => topicsMd, (f) => f === path.join('docs/roteiros', 'telas', 'x.topicos.md'));
    expect(got?.topics.size).toBe(3);
    expect(loadSceneTopics(args, () => '', () => false)).toBeUndefined();
    expect(loadSceneTopics(parseArgs(['--file', 'a.md', '--sem-topicos']), () => topicsMd, () => true)).toBeUndefined();
    expect(() => loadSceneTopics(parseArgs(['--file', 'a.md', '--topicos', 'z.md']), () => '', () => false)).toThrow(/não encontrado/);
  });

  it('o importador recebe os tópicos pelo CLI (opção sceneTopics)', () => {
    const { topics } = parseSceneTopicsMarkdown(topicsMd);
    const doc = importMarkdownCourse(md, { sceneTopics: topics }).document;
    const v01 = doc.modules[0]!.lessons[0]!.graph.nodes.find((n) => n.id === 'v01') as { topics?: unknown[] };
    expect(v01.topics).toHaveLength(2);
  });
});

describe('aplicar-topicos (parte pura)', () => {
  const base = () => {
    const { mocks } = parseScreenMocksMarkdown(TELAS);
    return importMarkdownCourse(md, { screenMocks: mocks }).document;
  };
  const topicsOf = (d: ReturnType<typeof base>, id: string) => (d.modules[0]!.lessons[0]!.graph.nodes.find((n) => n.id === id) as { topics?: unknown[] }).topics;

  it('argumentos', () => {
    expect(parseTopicsArgs(['--course', 'crs_1', '--file', 'a.topicos.md', '--seco'])).toEqual({ course: 'crs_1', file: 'a.topicos.md', seco: true });
    expect(parseTopicsArgs(['--course=crs_1', '--file=a.md'])).toMatchObject({ seco: false });
    expect(() => parseTopicsArgs(['--file', 'a.md'])).toThrow(/--course/);
    expect(() => parseTopicsArgs(['--course', 'c'])).toThrow(/--file/);
  });

  it('V01 → nó v01 ganha topics; V02 (gravação de tela) é ignorada; V09 não existe; o original não muda', () => {
    const doc = base();
    const before = JSON.stringify(doc);
    const r = applyTopicsToDocument(doc, parseSceneTopicsMarkdown(topicsMd).topics);
    expect(JSON.stringify(doc)).toBe(before);
    expect(r.updated).toEqual([{ code: 'V01', lessonId: doc.modules[0]!.lessons[0]!.id, topics: 2 }]);
    expect(r.skipped.map((x) => x.code)).toEqual(['V02']);
    expect(r.notFound).toEqual(['V09']);
    expect(topicsOf(r.document, 'v01')).toEqual([{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Fontes' }]);
    expect(topicsOf(r.document, 'v02')).toBeUndefined();
  });

  it('idempotente: aplicar de novo vira "sem mudança"; mudar o arquivo troca os tópicos', () => {
    const topics = parseSceneTopicsMarkdown(topicsMd).topics;
    const once = applyTopicsToDocument(base(), topics);
    const twice = applyTopicsToDocument(once.document, topics);
    expect(twice.updated).toEqual([]);
    expect(twice.unchanged.map((x) => x.code)).toEqual(['V01']);
    const changed = applyTopicsToDocument(once.document, parseSceneTopicsMarkdown('## V01\n- Só este\n').topics);
    expect(topicsOf(changed.document, 'v01')).toEqual([{ text: 'Só este' }]);
  });
});
