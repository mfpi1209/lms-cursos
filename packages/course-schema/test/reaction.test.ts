import { describe, expect, it } from 'vitest';
import {
  applyDefaultReactions,
  mediaSceneOf,
  parseReactionTarget,
  REACTION_GESTURE,
  REACTION_WORDS,
  reactionFromFeedback,
  reactionScenes,
  reactionStatuses,
  reactionTargetId,
  withReactionMedia,
  withReactionText,
} from '../src/reaction';
import { compileLesson } from '../src/compile';
import { allLessons } from '../src/course';
import { LessonGraphSchema } from '../src/graph';
import { markdownToCourseDocumentWithReport, parseMarkdownCourse } from '../src/import/markdown-course';
import { NodeIdSchema, type ChoiceNode } from '../src/nodes';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] });
const media = { assetId: 'ast_r1', kind: 'video' as const, generatedFrom: { jobId: 'mjb_r1', sceneHash: 'h', provider: 'heygen' } };

const graph = () =>
  LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'q01',
    nodes: [
      {
        id: 'q01', type: 'choice', prompt: doc('Isso entra no currículo?'),
        options: [
          { id: 'a', label: '“Coloco, sim.”', quality: 'strong', feedback: doc('É uma responsabilidade real. Faça assim: coloque em ‘Experiências’ e diga o que você fazia.') },
          { id: 'b', label: '“Não coloco.”', quality: 'weak', feedback: doc('Experiência não depende de salário. Faça assim: conte o que você fazia.'), reaction: { text: 'Muita gente pensa assim, mas experiência não depende de salário.' } },
        ],
      },
      { id: 'fim', type: 'end', summary: doc('Fim.') },
    ],
    edges: [
      { id: 'e1', from: 'q01', to: 'fim', optionId: 'a' },
      { id: 'e2', from: 'q01', to: 'fim', optionId: 'b' },
    ],
  });

describe('reação da instrutora a cada resposta (contrato)', () => {
  it('alvo de mídia "decisão~opção": nunca colide com um id de nó', () => {
    expect(reactionTargetId('q01', 'a')).toBe('q01~a');
    expect(parseReactionTarget('q01~a')).toEqual({ choiceId: 'q01', optionId: 'a' });
    expect(parseReactionTarget('q01')).toBeNull();
    expect(NodeIdSchema.safeParse('q01~a').success).toBe(false);
  });

  it('cena sintética de plano único: fala = texto da reação, gesto pela qualidade, mídia da opção', () => {
    const g = graph();
    expect(mediaSceneOf(g, 'q01~a')).toBeNull(); // sem texto, sem cena
    const sc = mediaSceneOf(g, 'q01~b')!;
    expect(sc).toMatchObject({ id: 'q01~b', type: 'consequence', narration: 'Muita gente pensa assim, mas experiência não depende de salário.', motionPrompt: REACTION_GESTURE.weak });
    expect('direction' in sc ? sc.direction : undefined).toBeUndefined();
    expect(mediaSceneOf(g, 'q01')?.type).toBe('choice');
    expect(reactionScenes(g).map((s) => s.id)).toEqual(['q01~b']);
  });

  it('reação padrão a partir do retorno: abertura pela qualidade + explicação + dica curta, 5 a 10 s', () => {
    const t = reactionFromFeedback(doc('É uma responsabilidade real. Faça assim: coloque em ‘Experiências’ e diga o que você fazia.'), 'strong', 0)!;
    expect(t).toBe('Boa escolha! É uma responsabilidade real. Coloque em ‘Experiências’ e diga o que você fazia.');
    const long = reactionFromFeedback('Você pode entregar por empresa quando a reunião precisava por nome, e refazer tudo em cima da hora. Faça assim: pergunte antes.', 'weak', 2)!;
    expect(long).toBe('Vamos olhar isso com calma. Você pode entregar por empresa quando a reunião precisava por nome, e refazer tudo em cima da hora.');
    for (const s of [t, long]) {
      const w = s.split(/\s+/).length;
      expect(w).toBeGreaterThanOrEqual(REACTION_WORDS.min);
      expect(w).toBeLessThanOrEqual(REACTION_WORDS.max);
    }
    expect(reactionFromFeedback(undefined, 'ok')).toBeNull();
  });

  it('aplica a padrão só onde falta; texto novo deixa o vídeo desatualizado; mídia vai para a opção', () => {
    const { graph: g, changed } = applyDefaultReactions(graph());
    expect(changed).toEqual(['q01']);
    const q = g.nodes[0] as ChoiceNode;
    expect(q.options[0]!.reaction?.text).toMatch(/^Boa escolha!/);
    expect(q.options[1]!.reaction?.text).toBe('Muita gente pensa assim, mas experiência não depende de salário.');
    expect(applyDefaultReactions(g).changed).toEqual([]);

    const withMedia = withReactionMedia(q, 'b', media)!;
    expect(withMedia.options[1]!.reaction).toMatchObject({ media: { assetId: 'ast_r1' } });
    expect(withReactionMedia(q, 'zz', media)).toBeNull();
    const edited = withReactionText(withMedia.options[1]!, 'Outra fala da instrutora sobre essa resposta.');
    expect(edited.reaction).toMatchObject({ text: 'Outra fala da instrutora sobre essa resposta.', media: { assetId: 'ast_r1', stale: true } });
    expect(withReactionText(withMedia.options[1]!, withMedia.options[1]!.reaction!.text)).toBe(withMedia.options[1]);
  });

  it('avisos: resposta sem reação; reação sem vídeo só quando a mídia é exigida', () => {
    const codes = (g: ReturnType<typeof graph>, missingMedia = false) => compileLesson(g, { missingMedia }).warnings.map((w) => w.code);
    expect(codes(graph())).toContain('REACTION_MISSING');
    const full = applyDefaultReactions(graph()).graph;
    expect(codes(full)).not.toContain('REACTION_MISSING');
    expect(compileLesson(full, { missingMedia: true }).warnings.filter((w) => w.code === 'MEDIA_MISSING' && /reaç/.test(w.message))).toHaveLength(1);
    expect(reactionStatuses(full).map((r) => [r.targetId, r.hasVideo])).toEqual([['q01~a', false], ['q01~b', false]]);
  });
});

describe('importador: coluna "Reação"', () => {
  const md = (table: string) => `# Curso

Ideia: Testar a reação.
Público: jovens.
Objetivo final: Ao final, a pessoa responde.
Duração-alvo: 1 aula de 3 minutos.

## Módulo 1 — Um

Descrição: Um.

### Aula 1 — Uma
Objetivo: Ao final, você responde.

### V01 — Abertura
**Fala para gravação**
"Nesta aula, você vai decidir uma coisa simples. Pense no que você já fez na escola e em casa."
Texto na tela: Escola · Casa

### Q01 — Entra?
Situação: Você ajuda na lanchonete.
Chamada: "Agora é com você: isso entra no currículo?"
${table}

### FIM — O que você levou
- Uma coisa.
Meu roteiro: nada
`;

  it('lê a reação de cada opção pelo cabeçalho (a coluna pode vir em qualquer posição)', () => {
    const { document, warnings } = markdownToCourseDocumentWithReport(parseMarkdownCourse(md(`| Escolha | Qualidade | Reação | Feedback | Destino |
|---|---|---|---|---|
| "Sim." | forte | "Isso mesmo! Ajudar na lanchonete mostra atendimento e responsabilidade." | Você acertou. Faça assim: coloque. | FIM |
| "Não." | fraca | "Muita gente pensa assim, mas experiência não depende de salário." | Você perdeu. Faça assim: coloque. | FIM |`)));
    const q = allLessons(document)[0]!.graph.nodes.find((n) => n.id === 'q01') as ChoiceNode;
    expect(q.options.map((o) => o.reaction?.text)).toEqual(['Isso mesmo! Ajudar na lanchonete mostra atendimento e responsabilidade.', 'Muita gente pensa assim, mas experiência não depende de salário.']);
    expect(q.options[0]!.feedback).toBeDefined();
    expect(warnings.map((w) => w.code)).not.toContain('REACTION_DEFAULT');
  });

  it('sem a coluna: reação padrão derivada do retorno, com aviso', () => {
    const { document, warnings } = markdownToCourseDocumentWithReport(parseMarkdownCourse(md(`| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Sim." | forte | Você acertou em cheio. Faça assim: coloque no currículo. | FIM |
| "Não." | fraca | Você deixou passar uma experiência real. Faça assim: coloque. | FIM |`)));
    const q = allLessons(document)[0]!.graph.nodes.find((n) => n.id === 'q01') as ChoiceNode;
    expect(q.options[0]!.reaction?.text).toMatch(/^(Boa escolha|Isso mesmo|Mandou bem|Exatamente)!/);
    expect(q.options[1]!.reaction?.text).toContain('Você deixou passar uma experiência real.');
    expect(warnings.map((w) => w.code)).toContain('REACTION_DEFAULT');
  });
});
