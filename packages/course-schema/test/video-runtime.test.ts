import { describe, expect, it } from 'vitest';
import { courseVideoRange, formatCourseVideo, formatLessonVideo, formatMinutesCeil, isRelevantRange, lessonVideoAssetIds, lessonVideoRange, questionVideoFollows, questionVideoSkipped } from '../src/video-runtime';

const vid = (assetId: string, transcript?: string) => ({ kind: 'video', assetId, ...(transcript ? { transcript } : {}) });
const D = (o: Record<string, number>) => new Map(Object.entries(o));

describe('duração de vídeo pelo percurso', () => {
  it('curso linear: soma os vídeos das cenas', () => {
    const lesson = { graph: { startNodeId: 'a', nodes: [{ id: 'a', type: 'scenario', media: vid('A') }, { id: 'b', type: 'content', media: vid('B') }, { id: 'fim', type: 'end' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'fim' }] } };
    expect(lessonVideoRange(lesson, D({ A: 50, B: 40 }))).toEqual({ minS: 90, maxS: 90, missing: [] });
  });

  it('ramos: conta só a reação da opção escolhida (faixa mín–máx), não a soma das três', () => {
    const lesson = {
      graph: {
        startNodeId: 'v',
        nodes: [
          { id: 'v', type: 'scenario', media: vid('V') },
          { id: 'q', type: 'choice', options: [{ id: 'a', reaction: { media: vid('RA') } }, { id: 'b', reaction: { media: vid('RB') } }, { id: 'c', reaction: { media: vid('RC') } }] },
          { id: 'x', type: 'content', media: vid('X') },
          { id: 'fim', type: 'end' },
        ],
        edges: [{ from: 'v', to: 'q' }, { from: 'q', to: 'x', optionId: 'a' }, { from: 'q', to: 'x', optionId: 'b' }, { from: 'q', to: 'x', optionId: 'c' }, { from: 'x', to: 'fim' }],
      },
    };
    const r = lessonVideoRange(lesson, D({ V: 50, RA: 5, RB: 9, RC: 7, X: 40 }));
    expect(r.minS).toBe(95);
    expect(r.maxS).toBe(99);
  });

  it('reação desligada não toca e não entra na conta', () => {
    const lesson = { graph: { startNodeId: 'q', nodes: [{ id: 'q', type: 'choice', options: [{ id: 'a', reaction: { media: vid('RA'), disabled: true } }, { id: 'b', reaction: { media: vid('RB') } }] }, { id: 'fim', type: 'end' }], edges: [{ from: 'q', to: 'fim', optionId: 'a' }, { from: 'q', to: 'fim', optionId: 'b' }] } };
    expect(lessonVideoRange(lesson, D({ RA: 30, RB: 8 }))).toMatchObject({ minS: 0, maxS: 8 });
    expect(lessonVideoAssetIds(lesson)).toEqual(['RB']);
  });

  it('vídeo cortado: vale a duração do asset final (o ajuste fino gera outro arquivo)', () => {
    const lesson = { graph: { startNodeId: 'a', nodes: [{ id: 'a', type: 'scenario', media: vid('CORTADO') }, { id: 'fim', type: 'end' }], edges: [{ from: 'a', to: 'fim' }] } };
    // o arquivo original tinha 35 s; a versão cortada (00:10–00:35) tem 25 s
    expect(lessonVideoRange(lesson, D({ CORTADO: 25 })).maxS).toBe(25);
  });

  it('vídeo próprio da pergunta é pulado quando a cena anterior já falou a chamada', () => {
    const lesson = {
      graph: {
        startNodeId: 'v',
        nodes: [
          { id: 'v', type: 'scenario', media: vid('V', 'Caso. Agora, responda: o que você faz?') },
          { id: 'q', type: 'choice', media: vid('Q'), bridge: { call: 'Agora, responda: o que você faz?' }, options: [] },
          { id: 'fim', type: 'end' },
        ],
        edges: [{ from: 'v', to: 'q' }, { from: 'q', to: 'fim' }],
      },
    };
    expect(lessonVideoRange(lesson, D({ V: 40, Q: 10 })).maxS).toBe(40);
  });

  it('mídia sem duração: não vira zero silenciosamente (fica em `missing`)', () => {
    const lesson = { graph: { startNodeId: 'a', nodes: [{ id: 'a', type: 'scenario', media: vid('A') }, { id: 'b', type: 'scenario', media: vid('SEM') }, { id: 'fim', type: 'end' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'fim' }] } };
    expect(lessonVideoRange(lesson, D({ A: 30 })).missing).toEqual(['SEM']);
  });

  it('laço (refazer) não entra no tempo-base', () => {
    const lesson = { graph: { startNodeId: 'a', nodes: [{ id: 'a', type: 'scenario', media: vid('A') }, { id: 'b', type: 'content', media: vid('B') }, { id: 'fim', type: 'end' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'b', to: 'fim' }] } };
    expect(lessonVideoRange(lesson, D({ A: 30, B: 20 }))).toMatchObject({ minS: 50, maxS: 50 });
  });

  it('curso: soma as faixas das aulas', () => {
    const l = (id: string) => ({ graph: { startNodeId: 'a', nodes: [{ id: 'a', type: 'scenario', media: vid(id) }, { id: 'fim', type: 'end' }], edges: [{ from: 'a', to: 'fim' }] } });
    expect(courseVideoRange([l('A'), l('B')], D({ A: 300, B: 300 }))).toEqual({ minS: 600, maxS: 600, missing: [] });
  });

  it('limite de 10 min exato e formatação', () => {
    expect(formatCourseVideo({ minS: 600, maxS: 600 })).toBe('10 min');
    expect(formatCourseVideo({ minS: 600.4, maxS: 600.4 })).toBe('11 min');
    expect(formatCourseVideo({ minS: 20, maxS: 45 })).toBe('Menos de 1 min');
    expect(formatCourseVideo({ minS: 330, maxS: 470 })).toBe('6–8 min');
    expect(formatCourseVideo({ minS: 0, maxS: 0 })).toBeNull();
    expect(formatMinutesCeil(3900)).toBe('1 h 5 min');
    expect(isRelevantRange({ minS: 301, maxS: 359 })).toBe(false);
    expect(formatLessonVideo({ minS: 200, maxS: 200 })).toBe('3:20');
    expect(formatLessonVideo({ minS: 160, maxS: 190 })).toBe('2:40–3:10');
    expect(formatLessonVideo({ minS: 97, maxS: 99 })).toBe('1:39');
  });
});

describe('questionVideoSkipped: regra única do vídeo próprio da pergunta', () => {
  const CALL = 'Agora, responda: o que você faz?';
  const g = (prev: Record<string, unknown>, choice: Record<string, unknown> = {}, extraEdges: Array<{ from: string; to: string }> = [], extraNodes: Array<Record<string, unknown>> = []) => ({
    startNodeId: 'v',
    nodes: [{ id: 'v', type: 'scenario', ...prev }, { id: 'q', type: 'choice', media: vid('Q'), bridge: { call: CALL }, options: [], ...choice }, ...extraNodes],
    edges: [{ from: 'v', to: 'q' }, ...extraEdges],
  });

  it('transcrição da cena anterior termina com a chamada: pula (ignora pontuação, acento e maiúsculas)', () => {
    expect(questionVideoSkipped(g({ media: vid('V', 'Um caso. AGORA responda o que voce faz') }), 'q')).toBe(true);
  });
  it('sem transcrição, usa a narração (a divergência que fazia o aluno ficar parado)', () => {
    expect(questionVideoSkipped(g({ media: vid('V'), narration: `Um caso. ${CALL}` }), 'q')).toBe(true);
    // e a duração do percurso concorda com o palco: o vídeo da pergunta não conta
    const lesson = { graph: { ...g({ media: vid('V'), narration: `Um caso. ${CALL}` }), nodes: [...g({ media: vid('V'), narration: `Um caso. ${CALL}` }).nodes, { id: 'fim', type: 'end' }], edges: [{ from: 'v', to: 'q' }, { from: 'q', to: 'fim' }] } };
    expect(lessonVideoRange(lesson, D({ V: 40, Q: 10 })).maxS).toBe(40);
  });
  it('a transcrição manda sobre a narração (o que o vídeo realmente diz)', () => {
    expect(questionVideoSkipped(g({ media: vid('V', 'Um caso sem a chamada.'), narration: `Um caso. ${CALL}` }), 'q')).toBe(false);
  });
  it('a chamada precisa estar no FIM da fala', () => {
    expect(questionVideoSkipped(g({ media: vid('V', `${CALL} Depois disso, mais uma frase.`) }), 'q')).toBe(false);
  });
  it('não pula: sem chamada, sem vídeo na cena anterior, anterior é pergunta, várias entradas, id que não é pergunta', () => {
    const speech = { media: vid('V', `Caso. ${CALL}`) };
    expect(questionVideoSkipped(g(speech, { bridge: undefined }), 'q')).toBe(false);
    expect(questionVideoSkipped(g({ narration: `Caso. ${CALL}` }), 'q')).toBe(false);
    expect(questionVideoSkipped({ ...g({ ...speech, type: 'choice' }) }, 'q')).toBe(false);
    expect(questionVideoSkipped(g(speech, {}, [{ from: 'w', to: 'q' }], [{ id: 'w', type: 'scenario', media: vid('W', CALL) }]), 'q')).toBe(false);
    expect(questionVideoSkipped(g(speech), 'v')).toBe(false);
    expect(questionVideoSkipped(g(speech), 'nao-existe')).toBe(false);
  });
});

describe('questionVideoFollows: o vídeo da pergunta segue direto ao fim do vídeo da cena', () => {
  const CALL = 'Agora é com você: escolha.';
  const g = (prev: Record<string, unknown>, choice: Record<string, unknown> = {}, extraEdges: Array<{ from: string; to: string }> = [], extraNodes: Array<Record<string, unknown>> = []) => ({
    startNodeId: 'v',
    nodes: [{ id: 'v', type: 'scenario', media: vid('V', 'Uma abertura sem a chamada.'), ...prev }, { id: 'q', type: 'choice', media: vid('Q'), bridge: { call: CALL }, options: [], ...choice }, ...extraNodes],
    edges: [{ from: 'v', to: 'q' }, ...extraEdges],
  });

  it('cena com vídeo -> pergunta com vídeo que NÃO é pulado: o da pergunta segue direto (caso C13)', () => {
    expect(questionVideoFollows(g({}), 'v')).toBe(true);
  });
  it('vídeo da pergunta pulado (a cena já disse a chamada): não há vídeo a seguir (a pergunta entra direto, outra regra)', () => {
    expect(questionVideoFollows(g({ media: vid('V', `Um caso. ${CALL}`) }), 'v')).toBe(false);
  });
  it('não segue: pergunta sem vídeo, cena sem vídeo, mais de um destino, destino que não é pergunta, id inválido', () => {
    expect(questionVideoFollows(g({}, { media: undefined }), 'v')).toBe(false);
    expect(questionVideoFollows(g({ media: undefined }), 'v')).toBe(false);
    expect(questionVideoFollows(g({}, {}, [{ from: 'v', to: 'x' }], [{ id: 'x', type: 'content', media: vid('X') }]), 'v')).toBe(false);
    expect(questionVideoFollows({ ...g({}), edges: [{ from: 'v', to: 'x' }], nodes: [...g({}).nodes, { id: 'x', type: 'content', media: vid('X') }] }, 'v')).toBe(false);
    expect(questionVideoFollows(g({}), 'q')).toBe(false);
    expect(questionVideoFollows(g({}), 'nao-existe')).toBe(false);
  });
});
