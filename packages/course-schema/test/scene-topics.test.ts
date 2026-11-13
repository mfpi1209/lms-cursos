import { describe, expect, it } from 'vitest';
import { allLessons } from '../src/course';
import { importMarkdownCourse } from '../src/import/markdown-course';
import { parseSceneTopicsMarkdown, SCENE_TOPICS_MAX } from '../src/import/scene-topics-markdown';
import type { AnyNode } from '../src/nodes';

describe('parseSceneTopicsMarkdown', () => {
  it('lê seções, tópicos e "na fala"; tolera caixa, acento, aspas curvas e negrito', () => {
    const { topics, issues } = parseSceneTopicsMarkdown(`# Tópicos do painel — C1

texto livre ignorado

## V07
- Fatos recentes (na fala: "fatos muito recentes")
* **Contas** longas (NA FALA: “contas mais longas”)
- Fontes

## cena v08
- Só um
`);
    expect(issues).toEqual([]);
    expect([...topics.keys()]).toEqual(['V07', 'V08']);
    expect(topics.get('V07')).toEqual([
      { text: 'Fatos recentes', cue: 'fatos muito recentes' },
      { text: 'Contas longas', cue: 'contas mais longas' },
      { text: 'Fontes' },
    ]);
    expect(topics.get('V08')).toEqual([{ text: 'Só um' }]);
  });

  it('problemas viram issues com a linha: tópico longo, excesso, duplicada, vazia, sintaxe', () => {
    const many = Array.from({ length: SCENE_TOPICS_MAX + 2 }, (_, i) => `- Tópico ${i + 1}`).join('\n');
    const { topics, issues } = parseSceneTopicsMarkdown(`## V01
- ${'x'.repeat(61)}
- ok
linha solta
## V02
${many}
## V01
- repetida
## V03
## sem codigo
- a
`);
    const by = (c: string) => issues.filter((i) => i.code === c);
    expect(by('SCENE_TOPICS_TOO_LONG')).toMatchObject([{ scene: 'V01', line: 2 }]);
    expect(by('SCENE_TOPICS_SYNTAX').map((i) => i.line)).toEqual([4, 5 + SCENE_TOPICS_MAX + 6]);
    expect(by('SCENE_TOPICS_TOO_MANY')).toMatchObject([{ scene: 'V02', line: 5 + SCENE_TOPICS_MAX + 1 }]);
    expect(by('SCENE_TOPICS_DUPLICATE')).toMatchObject([{ scene: 'V01', line: 5 + SCENE_TOPICS_MAX + 3 }]);
    expect(by('SCENE_TOPICS_EMPTY')).toMatchObject([{ scene: 'V03' }]);
    expect(topics.get('V01')).toEqual([{ text: 'ok' }]);
    expect(topics.get('V02')).toHaveLength(SCENE_TOPICS_MAX);
    expect(topics.has('V03')).toBe(false);
  });

  it('60 caracteres cabem', () => {
    expect(parseSceneTopicsMarkdown(`## V01\n- ${'y'.repeat(60)}\n`).topics.get('V01')).toHaveLength(1);
  });
});

const FALA = `**Fala para gravação**

"Vou mostrar onde a inteligência artificial costuma errar. Ela erra com fatos muito recentes, porque o treino acaba numa data. Ela erra com contas mais longas, porque não calcula de verdade, e erra com fontes inventadas."

Texto na tela: Onde ela erra
`;
const roteiro = (scenes: string) => `# Curso de teste

Ideia: Testar tópicos.
Público: alunos.
Objetivo final: Ao final, a pessoa vê o painel.
Duração-alvo: 1 aula de 3 a 5 minutos.

## Módulo 1 — Único

Descrição: Um módulo.

### Aula 1 — Painel

Objetivo: Ao final, você vê os tópicos.

${scenes}
### FIM — O que você levou

- Primeiro tópico curto
- Segundo tópico curto
`;
type Result = ReturnType<typeof importMarkdownCourse>;
const nodeOf = (r: Result, id: string) => allLessons(r.document).flatMap((l) => l.graph.nodes as AnyNode[]).find((n) => n.id === id) as (AnyNode & { topics?: unknown }) | undefined;
const codes = (r: Result, code: string) => r.warnings.filter((w) => w.code === code);

describe('importador: tópicos do painel', () => {
  const scenes = `### V01 — Onde erra\n\n${FALA}\n### V02 — Outra\n\n${FALA}\n`;

  it('preenche `topics` pelo código da cena (V07 → v07) e só nela', () => {
    const { topics } = parseSceneTopicsMarkdown('## V01\n- Fatos recentes (na fala: "fatos muito recentes")\n- Fontes\n');
    const r = importMarkdownCourse(roteiro(scenes), { sceneTopics: topics });
    expect(nodeOf(r, 'v01')!.topics).toEqual([{ text: 'Fatos recentes', cue: 'fatos muito recentes' }, { text: 'Fontes' }]);
    expect(nodeOf(r, 'v02')!.topics).toBeUndefined();
    expect(codes(r, 'SCENE_TOPICS_UNUSED')).toHaveLength(0);
    // o resultado compila com o esquema (campo opcional do nó)
    expect(r.compile.errors).toEqual([]);
  });

  it('sem a opção nada muda; código sem cena e problemas do arquivo viram avisos', () => {
    const plain = importMarkdownCourse(roteiro(scenes));
    expect(nodeOf(plain, 'v01')!.topics).toBeUndefined();
    const parsed = parseSceneTopicsMarkdown('## V99\n- Algo\n## V01\n- ' + 'z'.repeat(70) + '\n- ok\n');
    const r = importMarkdownCourse(roteiro(scenes), { sceneTopics: parsed.topics, sceneTopicIssues: parsed.issues });
    expect(codes(r, 'SCENE_TOPICS_UNUSED').map((w) => w.message)).toEqual([expect.stringContaining('V99')]);
    expect(codes(r, 'SCENE_TOPICS_INVALID')).toHaveLength(1);
    expect(codes(r, 'SCENE_TOPICS_INVALID')[0]!.message).toContain('linha 4');
  });
});
