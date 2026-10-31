import { describe, expect, it } from 'vitest';
import { DEFAULT_CALL, type LessonGraph } from '@lms/course-schema';
import { applyScriptToGraph, scriptToGraph, type LessonScene, type LessonScript } from '../src/schemas';

const scene = (s: Partial<LessonScene> & Pick<LessonScene, 'id' | 'type'>): LessonScene => ({
  title: s.id, text: 'Texto.', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null, ...s,
});

const script: LessonScript = {
  rationale: 'teste',
  scenes: [
    scene({ id: 'situacao', type: 'scenario', narration: 'Você recebe um pedido sem prazo.', next: 'decisao' }),
    scene({ id: 'decisao', type: 'choice', text: 'O que você faz?', options: [
      { id: 'a', label: 'Pergunto o prazo.', feedback: 'Você confirma.', next: 'fim', correct: false },
      { id: 'b', label: 'Começo já.', feedback: 'Você arrisca.', next: 'fim', correct: false },
    ] }),
    scene({ id: 'fim', type: 'end', text: 'Fim.' }),
  ],
};

describe('agente de IA: chamada para a pergunta', () => {
  it('aula nova: a decisão ganha a chamada padrão e a cena anterior termina com ela', () => {
    const g = scriptToGraph(script);
    const q = g.nodes.find((n) => n.id === 'decisao');
    expect(q?.type === 'choice' && q.bridge?.call).toBe(DEFAULT_CALL);
    const s = g.nodes.find((n) => n.id === 'situacao');
    expect(s && 'narration' in s ? s.narration : '').toBe(`Você recebe um pedido sem prazo. ${DEFAULT_CALL}`);
  });

  it('revisão de aula antiga sem chamada: a fala não muda sozinha; aula com chamada continua com ela, sem duplicar', () => {
    const old: LessonGraph = scriptToGraph(script, { calls: false });
    const revised = applyScriptToGraph(old, script);
    const s = revised.nodes.find((n) => n.id === 'situacao');
    expect(s && 'narration' in s ? s.narration : '').toBe('Você recebe um pedido sem prazo.');

    const withCall = scriptToGraph(script);
    const narrated = { ...script, scenes: script.scenes.map((x) => (x.id === 'situacao' ? { ...x, narration: `Você recebe um pedido sem prazo. ${DEFAULT_CALL}` } : x)) };
    const again = applyScriptToGraph(withCall, narrated);
    const s2 = again.nodes.find((n) => n.id === 'situacao');
    expect(s2 && 'narration' in s2 ? s2.narration : '').toBe(`Você recebe um pedido sem prazo. ${DEFAULT_CALL}`);
    const q2 = again.nodes.find((n) => n.id === 'decisao');
    expect(q2?.type === 'choice' && q2.bridge?.call).toBe(DEFAULT_CALL);
  });
});
