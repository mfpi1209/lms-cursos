import { describe, expect, it } from 'vitest';
import { applyCallsToGraph, CALL_SHOT_ID, CALL_SHOT_GESTURE, callFromSituation, callHostId, callShotCamera, callStatuses, DEFAULT_CALL, hostSaysCall, withCall } from '../src/bridge';
import { compileLesson } from '../src/compile';
import { directionNarration, sameWords } from '../src/direction';
import { markdownToCourseDocumentWithReport, parseMarkdownCourse } from '../src/import/markdown-course';
import { allLessons } from '../src/course';
import { LessonGraphSchema, type LessonGraph } from '../src/graph';
import type { AnyNode, ChoiceNode } from '../src/nodes';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] });
const cams = [
  { id: 'c34', lookId: 'l34', angle: 'left' as const, status: 'ready' as const, nativeFraming: 'medium' as const },
  { id: 'cesq', lookId: 'lesq', angle: 'front' as const, status: 'ready' as const, nativeFraming: 'medium' as const },
];
const media = { assetId: 'ast_1', kind: 'video' as const, generatedFrom: { jobId: 'mjb_1', sceneHash: 'h', provider: 'heygen' } };

function graph(): LessonGraph {
  return LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'v01',
    nodes: [
      {
        id: 'v01', type: 'content', body: doc('Texto.'), narration: 'Experiência não é só carteira assinada. Nesta aula, você vai encontrar a sua.', media,
        direction: { shots: [
          { id: 's1', line: 'Experiência não é só carteira assinada.', cameraId: 'cesq', layout: 'presenter' },
          { id: 's2', line: 'Nesta aula, você vai encontrar a sua.', cameraId: 'c34', layout: 'presenter' },
        ] },
      },
      { id: 'q01', type: 'choice', prompt: doc('Isso entra no currículo?'), bridge: { call: 'Agora é com você: isso entra no seu currículo?' }, options: [{ id: 'a', label: 'Sim' }, { id: 'b', label: 'Não' }] },
      { id: 'q02', type: 'choice', prompt: doc('E agora?'), options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      { id: 'fim', type: 'end', summary: doc('Fim.') },
    ],
    edges: [
      { id: 'e1', from: 'v01', to: 'q01' },
      { id: 'e2', from: 'q01', to: 'q02', optionId: 'a' },
      { id: 'e3', from: 'q01', to: 'q02', optionId: 'b' },
      { id: 'e4', from: 'q02', to: 'fim', optionId: 'a' },
      { id: 'e5', from: 'q02', to: 'fim', optionId: 'b' },
    ],
  });
}

describe('ponte vídeo → pergunta (chamada)', () => {
  it('anfitrião: o vídeo logo antes; decisão depois de decisão não tem; decisão com vídeo próprio chama no próprio vídeo', () => {
    const g = graph();
    expect(callHostId(g, 'v01')).toBeNull();
    expect(callHostId(g, 'q01')).toBe('v01');
    expect(callHostId(g, 'q02')).toBeNull();
    const withVideo = { ...g, nodes: g.nodes.map((n) => (n.id === 'q02' ? { ...n, media } : n)) as AnyNode[] };
    expect(callHostId(withVideo, 'q02')).toBe('q02');
    // vídeo que leva a dois lugares não chama por nenhuma das decisões
    const branching = { ...g, edges: [...g.edges, { id: 'e6', from: 'v01', to: 'q02' }] };
    expect(callHostId(branching, 'q01')).toBeNull();
  });

  it('com direção: a chamada vira um plano FINAL próprio, olho no olho, e a fala continua batendo com os planos', () => {
    const g = graph();
    const v01 = g.nodes[0]! as Extract<AnyNode, { type: 'content' }>;
    const out = withCall(v01, 'Agora é com você: isso entra no seu currículo?', cams);
    const shots = out.direction!.shots;
    expect(shots).toHaveLength(3);
    // os planos já pagos ficam idênticos (o worker os reaproveita pela chave)
    expect(shots.slice(0, 2)).toEqual(v01.direction!.shots);
    // último plano estava na 3/4 (de lado): a chamada vai para a câmera frontal
    expect(shots[2]).toMatchObject({ id: CALL_SHOT_ID, line: 'Agora é com você: isso entra no seu currículo?', cameraId: 'cesq', layout: 'presenter', cameraMove: 'static', motionPrompt: CALL_SHOT_GESTURE });
    expect(sameWords(directionNarration(out.direction!), out.narration!)).toBe(true);
    expect(out.narration!.endsWith('Nesta aula, você vai encontrar a sua. Agora é com você: isso entra no seu currículo?')).toBe(true);
    // o vídeo pronto ainda é o antigo: fica desatualizado até gravar o trecho novo
    expect(out.media).toMatchObject({ assetId: 'ast_1', stale: true });
    // idempotente
    expect(withCall(out, 'Agora é com você: isso entra no seu currículo?', cams)).toBe(out);
    expect(hostSaysCall(out, 'agora é com você — isso entra no seu currículo')).toBe(true);
  });

  it('sem direção: a fala da pergunta ganha a chamada no fim (vídeo de plano único é regravado inteiro)', () => {
    const q: ChoiceNode = { id: 'q09', type: 'choice', objectiveIds: [], required: true, prompt: doc('Primeiro dia. O que você faz?'), media, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    const out = withCall(q, DEFAULT_CALL);
    expect(out.narration).toBe(`Primeiro dia. O que você faz? ${DEFAULT_CALL}`);
    expect(out.media?.stale).toBe(true);
  });

  it('câmera do plano: mantém a do último plano quando é frontal', () => {
    expect(callShotCamera([{ cameraId: 'cesq', layout: 'presenter' }], cams)).toBe('cesq');
    expect(callShotCamera([{ cameraId: 'c34', layout: 'presenter' }, { cameraId: 'c34', layout: 'card' }], cams)).toBe('cesq');
  });

  it('avisos do compilador: pergunta sem chamada e chamada ainda fora da fala', () => {
    const g = graph();
    const before = compileLesson(g).warnings.filter((w) => w.code === 'CHOICE_NO_CALL' || w.code === 'CALL_NOT_SPOKEN');
    expect(before).toEqual([expect.objectContaining({ code: 'CALL_NOT_SPOKEN', nodeId: 'q01' })]);
    const { graph: applied, changed } = applyCallsToGraph(g, cams);
    expect(changed).toEqual(['v01']);
    expect(compileLesson(applied).warnings.filter((w) => w.code === 'CHOICE_NO_CALL' || w.code === 'CALL_NOT_SPOKEN')).toEqual([]);
    expect(callStatuses(applied).find((s) => s.choiceId === 'q01')).toMatchObject({ hostId: 'v01', spoken: true, needsRecording: true });
    const noCall = { ...g, nodes: g.nodes.map((n) => (n.id === 'q01' && n.type === 'choice' ? { ...n, bridge: undefined } : n)) as AnyNode[] };
    expect(compileLesson(noCall).warnings.map((w) => w.code)).toContain('CHOICE_NO_CALL');
  });
});

describe('importador: "Chamada:" da decisão', () => {
  const md = `# Curso

Ideia: Testar a chamada.
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
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "Sim." | forte | Você acertou. Faça assim: coloque. | V02 |
| "Não." | fraca | Você perdeu. Faça assim: coloque. | V02 |

### V02 — Depois
**Fala para gravação**
"Seja qual for a sua resposta, repara: o que conta é o que você fazia lá."
Texto na tela: O que eu fazia

### Q02 — E agora?
Situação: Outra situação.
| Escolha | Qualidade | Feedback | Destino |
|---|---|---|---|
| "A." | forte | Você… Faça assim: a. | FIM |
| "B." | fraca | Você… Faça assim: b. | FIM |

### FIM — O que você levou
- Uma coisa.
Meu roteiro: nada
`;

  it('a fala do vídeo anterior termina com a chamada; sem "Chamada:" monta do enunciado e avisa', () => {
    const { document, warnings } = markdownToCourseDocumentWithReport(parseMarkdownCourse(md));
    const g = allLessons(document)[0]!.graph;
    const v01 = g.nodes.find((n) => n.id === 'v01')!;
    const v02 = g.nodes.find((n) => n.id === 'v02')!;
    expect('narration' in v01 && v01.narration?.endsWith('Agora é com você: isso entra no currículo?')).toBe(true);
    expect('narration' in v02 && v02.narration?.endsWith('Outra situação. E agora?')).toBe(true);
    const q02 = g.nodes.find((n) => n.id === 'q02');
    expect(q02?.type === 'choice' && q02.bridge?.call).toBe('Outra situação. E agora?');
    expect(warnings.map((w) => w.code)).toContain('CALL_DEFAULT');
    expect(callStatuses(g).every((s) => s.spoken)).toBe(true);
  });
});

describe('callFromSituation (chamada com o fato e a mesma pergunta do bloco)', () => {
  it('fato da situação + pergunta, pulando a reformulação genérica em 2ª pessoa', () => {
    expect(callFromSituation('Henrique salvou a lista na pasta indicada. Ao conferir, percebeu dois campos que dependem de uma confirmação externa. Você terminou a lista.', 'Como você entrega a lista?'))
      .toBe('Ao conferir, percebeu dois campos que dependem de uma confirmação externa. Como você entrega a lista?');
  });
  it('sem pergunta: chamada padrão; fato longo demais: só a pergunta', () => {
    expect(callFromSituation('Nada a perguntar aqui.')).toBe(DEFAULT_CALL);
    expect(callFromSituation('Uma frase muito longa com muitas e muitas palavras que não cabem de jeito nenhum numa chamada curta de oito segundos de fala.', 'O que você faz?')).toBe('O que você faz?');
  });
});
