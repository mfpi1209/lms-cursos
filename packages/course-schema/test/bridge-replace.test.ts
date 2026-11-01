import { describe, expect, it } from 'vitest';
import { applyCallsToGraph, isCallShotId, withCall } from '../src/bridge';
import { directionNarration, sameWords, syncNarrationFromShots } from '../src/direction';
import { LessonGraphSchema, type LessonGraph } from '../src/graph';
import type { AnyNode, ChoiceNode } from '../src/nodes';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }] });
const cams = [{ id: 'cesq', lookId: 'lesq', angle: 'front' as const, status: 'ready' as const, nativeFraming: 'medium' as const }];
const media = { assetId: 'ast_1', kind: 'video' as const, generatedFrom: { jobId: 'mjb_1', sceneHash: 'h', provider: 'heygen' } };
const OLD = 'Agora é com você: o que a Luana ainda precisa confirmar?';
const NEW = 'A mensagem não diz horário, entrada nem quem procurar. Agora, responda: o que a Luana ainda precisa confirmar?';
type Content = Extract<AnyNode, { type: 'content' }>;

function lesson(shots: Array<{ id: string; line: string }>, narration?: string): LessonGraph {
  return LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'v00',
    nodes: [
      { id: 'v00', type: 'content', body: doc('Texto.'), narration: narration ?? shots.map((s) => s.line).join(' '), media, direction: { shots: shots.map((s) => ({ ...s, cameraId: 'cesq', layout: 'presenter' })) } },
      { id: 'q01', type: 'choice', prompt: doc('O que falta?'), bridge: { call: NEW }, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      { id: 'fim', type: 'end', summary: doc('Fim.') },
    ],
    edges: [
      { id: 'e1', from: 'v00', to: 'q01' },
      { id: 'e2', from: 'q01', to: 'fim', optionId: 'a' },
      { id: 'e3', from: 'q01', to: 'fim', optionId: 'b' },
    ],
  });
}

describe('chamada substitui a anterior', () => {
  it('com direção: troca a fala do plano "chamada" sem criar chamada_2, e a fala da cena acompanha', () => {
    const g = lesson([{ id: 's1', line: 'Vamos acompanhar a Luana.' }, { id: 'chamada', line: OLD }]);
    const { graph, changed } = applyCallsToGraph(g, cams);
    expect(changed).toEqual(['v00']);
    const v = graph.nodes[0] as Content;
    expect(v.direction!.shots.map((s) => s.id)).toEqual(['s1', 'chamada']);
    expect(v.direction!.shots[1]!.line).toBe(NEW);
    expect(v.narration).toBe(`Vamos acompanhar a Luana. ${NEW}`);
    expect(sameWords(directionNarration(v.direction!), v.narration!)).toBe(true);
    expect(v.media?.stale).toBe(true);
    // idempotente: aplicar de novo não muda nada
    const again = applyCallsToGraph(graph, cams);
    expect(again.changed).toEqual([]);
    expect(again.graph.nodes[0]).toBe(graph.nodes[0]);
  });

  it('conserta cena legada com chamada_2: fica um só plano de chamada, com a fala nova', () => {
    const g = lesson([{ id: 's1', line: 'Vamos acompanhar a Luana.' }, { id: 'chamada', line: OLD }, { id: 'chamada_2', line: NEW }], `Vamos acompanhar a Luana. ${OLD} ${NEW}`);
    const v = applyCallsToGraph(g, cams).graph.nodes[0] as Content;
    expect(v.direction!.shots.filter((s) => isCallShotId(s.id)).map((s) => [s.id, s.line])).toEqual([['chamada', NEW]]);
    expect(v.narration).toBe(`Vamos acompanhar a Luana. ${NEW}`);
  });

  it('mesma chamada já no plano: nada muda (mídia não fica desatualizada)', () => {
    const g = lesson([{ id: 's1', line: 'Oi.' }, { id: 'chamada', line: NEW }]);
    const v = g.nodes[0] as Content;
    expect(withCall(v, NEW, cams)).toBe(v);
  });

  it('sem plano de chamada: entra um plano final novo (como antes)', () => {
    const g = lesson([{ id: 's1', line: 'Vamos acompanhar a Luana.' }]);
    const v = withCall(g.nodes[0] as Content, NEW, cams);
    expect(v.direction!.shots.map((s) => s.id)).toEqual(['s1', 'chamada']);
    expect(v.media?.stale).toBe(true);
  });

  it('sem direção: troca a chamada anterior conhecida no fim da fala', () => {
    const q: ChoiceNode = { id: 'q09', type: 'choice', objectiveIds: [], required: true, prompt: doc('x'), narration: `Primeiro dia na loja. ${OLD}`, media, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    const out = withCall(q, NEW, [], OLD);
    expect(out.narration).toBe(`Primeiro dia na loja. ${NEW}`);
    expect(out.media?.stale).toBe(true);
    expect(withCall(out, NEW, [], OLD)).toBe(out);
  });

  it('sem direção e sem a anterior conhecida: tira a frase final "Agora é com você…" em vez de acumular', () => {
    const q: ChoiceNode = { id: 'q09', type: 'choice', objectiveIds: [], required: true, prompt: doc('x'), narration: `Primeiro dia na loja. ${OLD}`, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    expect(withCall(q, 'Agora, responda: o que você faz?').narration).toBe('Primeiro dia na loja. Agora, responda: o que você faz?');
  });

  it('sem direção e sem chamada anterior: a chamada entra no fim (como antes)', () => {
    const q: ChoiceNode = { id: 'q09', type: 'choice', objectiveIds: [], required: true, prompt: doc('Primeiro dia. O que você faz?'), options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
    expect(withCall(q, NEW).narration).toBe(`Primeiro dia. O que você faz? ${NEW}`);
  });
});

describe('syncNarrationFromShots', () => {
  it('fala da cena = planos juntos; mesmo nó quando já bate', () => {
    const n = { id: 'v', narration: 'Velha.', direction: { shots: [{ line: 'Uma frase.' }, { line: ' Outra.' }] } };
    const out = syncNarrationFromShots(n);
    expect(out.narration).toBe('Uma frase. Outra.');
    expect(syncNarrationFromShots(out)).toBe(out);
    const noShots = { id: 'v', narration: 'Fala.' };
    expect(syncNarrationFromShots(noShots)).toBe(noShots);
  });
});
