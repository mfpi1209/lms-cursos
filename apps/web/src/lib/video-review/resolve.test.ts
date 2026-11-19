import { describe, expect, it } from 'vitest';
import { fmtTime, resolveMark, sceneDuration, shotTimings, type SceneReviewContext } from './resolve';
import { sceneContextFromNode } from './context';

const cue = (start: number, end: number, text: string) => ({ start, end, text });

function base(over: Partial<SceneReviewContext> = {}): SceneReviewContext {
  return {
    lessonId: 'aula_01',
    lessonTitle: 'Boas-vindas',
    nodeId: 'v01',
    title: 'Boas-vindas',
    assetId: 'ast_1',
    sceneHash: 'h1',
    captionsAssetId: 'ast_vtt',
    durationSec: 20,
    cues: [],
    captionsApprox: false,
    hasNarrationAudio: true,
    shots: null,
    dropped: [],
    retake: {},
    cameras: [
      { id: 'cam_esq', zone: 'left' },
      { id: 'cam_dir', zone: 'right' },
    ],
    topics: null,
    teaser: false,
    screens: null,
    ...over,
  };
}

// fala: 4 frases de 5 s cada (20 s)
const CUES = [
  cue(0, 5, 'Oi! Que bom ter você aqui hoje.'),
  cue(5, 10, 'Em oito horas você monta seu assistente.'),
  cue(10, 15, 'Agora a câmera muda de lado para explicar.'),
  cue(15, 20, 'Pega o celular que você vai usar já.'),
];

describe('fmtTime / sceneDuration', () => {
  it('formata m:ss.s', () => {
    expect(fmtTime(0)).toBe('0:00.0');
    expect(fmtTime(65.27)).toBe('1:05.3');
  });
  it('prefere a duração do player, depois a do asset, depois o fim da legenda', () => {
    expect(sceneDuration(base(), 21.5)).toBe(21.5);
    expect(sceneDuration(base())).toBe(20);
    expect(sceneDuration(base({ durationSec: null, cues: CUES }))).toBe(20);
  });
});

describe('cena dirigida: tomada, plano e corte', () => {
  const shots = [
    { id: 's1', line: 'Oi! Que bom ter você aqui hoje.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
    { id: 's2', line: 'Em oito horas você monta seu assistente.', cameraId: 'cam_esq', framing: 'medium' as const, layout: 'presenter' as const },
    { id: 's3', line: 'Agora a câmera muda de lado para explicar.', cameraId: 'cam_dir', framing: 'close' as const, layout: 'presenter' as const },
    { id: 's4', line: 'Pega o celular que você vai usar já.', cameraId: 'cam_dir', framing: 'medium' as const, layout: 'presenter' as const },
  ];

  it('agrupa planos na mesma câmera numa tomada com o rótulo do refazer-tomadas', () => {
    const r = resolveMark(base({ shots, cues: CUES, retake: { s3: 2 } }), 12.3);
    expect(r.take).toMatchObject({ id: 'aula_01/v01#s3', index: 2, total: 2, firstShotId: 's3', shotIds: ['s3', 's4'], cameraId: 'cam_dir', cameraZone: 'right', variation: 2, retakeable: true });
    expect(r.take!.start).toBeCloseTo(10, 0);
    expect(r.take!.end).toBe(20);
    expect(r.shot).toMatchObject({ id: 's3', index: 3, total: 4, framing: 'close', timing: 'fala' });
    expect(r.speech).toMatchObject({ cue: 'Agora a câmera muda de lado para explicar.' });
  });

  it('com legenda, o início de cada plano vem da fala (não da proporção do texto)', () => {
    // legenda com a 2ª frase começando tarde (pausa longa): o plano s2 começa em 8 s, não em ~5 s
    const late = [cue(0, 5, 'Oi! Que bom ter você aqui hoje.'), cue(8, 10, 'Em oito horas você monta seu assistente.'), ...CUES.slice(2)];
    const { spans, timing } = shotTimings(shots, [], 20, late.flatMap((c) => c.text.split(' ').map((w, i, a) => ({ text: w, start: c.start + ((c.end - c.start) * i) / a.length, end: c.start + ((c.end - c.start) * (i + 1)) / a.length }))));
    expect(timing).toBe('fala');
    expect(spans[1]!.start).toBeCloseTo(8, 1);
    expect(spans[0]!.end).toBeCloseTo(8, 1);
  });

  it('acha o corte mais próximo e diz se troca de câmera', () => {
    const r = resolveMark(base({ shots, cues: CUES }), 10.4);
    expect(r.shot!.nearestCut).toMatchObject({ from: 's2', to: 's3', cameraChange: true });
    expect(Math.abs(r.shot!.nearestCut!.deltaSec)).toBeLessThan(1);
  });

  it('sem legenda: tempos proporcionais ao tamanho da fala (painel de pulsos) e nota de aproximação', () => {
    const r = resolveMark(base({ shots }), 1);
    expect(r.shot!.timing).toBe('proporcional');
    expect(r.notes.join(' ')).toMatch(/sem legenda/);
    expect(r.edge).toBe('início da cena');
  });

  it('plano tirado no ajuste fino não ocupa tempo no vídeo', () => {
    const r = resolveMark(base({ shots, dropped: ['s2'] }), 9);
    expect(r.shot!.id).toBe('s3');
  });

  it('plano de cartão com voz à parte não é tomada de apresentador', () => {
    const withCard = [...shots.slice(0, 2), { id: 's3', line: shots[2]!.line, framing: 'medium' as const, layout: 'card' as const, slide: { title: 'Três dicas', bullets: ['a', 'b'] } }, shots[3]!];
    const r = resolveMark(base({ shots: withCard, cues: CUES }), 12);
    expect(r.take).toMatchObject({ id: 'aula_01/v01#s3', retakeable: false });
    expect(r.shot!.slide).toEqual({ title: 'Três dicas', bullets: ['a', 'b'] });
  });

  it('cena sem direção: tomada "unico" que não se refaz sozinha', () => {
    const r = resolveMark(base({ cues: CUES }), 3);
    expect(r.take).toMatchObject({ id: 'aula_01/v01#unico', retakeable: false });
    expect(r.shot).toBeUndefined();
  });
});

describe('fala no instante', () => {
  it('legenda, palavra e as palavras dali em diante (sugestão de "na fala")', () => {
    const r = resolveMark(base({ cues: CUES }), 7.6);
    expect(r.speech!.cue).toBe('Em oito horas você monta seu assistente.');
    expect(r.speech!.word).toBe('monta');
    expect(r.speech!.fromHere).toBe('monta seu assistente');
  });
});

describe('tela simulada: gravação e passo ativo', () => {
  const screens: SceneReviewContext['screens'] = [
    {
      fileName: 'gravacao_pedido.mp4',
      durationSec: 10,
      source: 'mock',
      mock: { model: 'chat', device: 'phone', app: 'Assistente de IA', steps: [{ kind: 'type', text: 'me indique três livros', cue: 'me indique três livros' }, { kind: 'highlight', text: 'resposta inventada' }] },
    },
    {
      fileName: 'gravacao_busca.mp4',
      durationSec: 10,
      source: 'mock',
      mock: { model: 'browser', device: 'phone', app: 'Buscador', steps: [{ kind: 'type', text: 'Tempo de Sobra', cue: 'eu confiro' }, { kind: 'show', title: 'Nenhum resultado', lines: [] , cue: 'não existe' }] },
    },
  ];
  const cues = [cue(0, 4, 'Peça assim: me indique três livros.'), cue(4, 10, 'Veja a resposta inventada com tudo.'), cue(10, 15, 'Agora eu confiro cada um na busca.'), cue(15, 20, 'O terceiro não existe de jeito nenhum.')];

  it('acha a gravação (seção do .telas.md) e o passo no ritmo da fala', () => {
    const r = resolveMark(base({ screens, cues }), 16.5);
    expect(r.take).toBeUndefined();
    expect(r.screen).toMatchObject({ recordingIndex: 2, total: 2, section: 'gravacao_busca', model: 'browser/phone', generated: true, totalSteps: 2, timing: 'fala' });
    expect(r.screen!.step).toMatchObject({ index: 2, cue: 'não existe' });
    expect(r.screen!.step!.line).toBe('mostra: Nenhum resultado (na fala: "não existe")');
  });

  it('o passo da 1ª tela começa quando a fala chega no trecho', () => {
    const r = resolveMark(base({ screens, cues }), 2.5);
    expect(r.screen!.recordingIndex).toBe(1);
    expect(r.screen!.step?.index ?? r.screen!.nextStep?.index).toBe(1);
    expect(r.screen!.step?.line ?? '').toMatch(/^digita: me indique três livros/);
  });

  it('gravação enviada (sem passos): só a gravação', () => {
    const r = resolveMark(base({ screens: [{ fileName: 'tela-01.mp4', durationSec: 20, source: 'upload' }], cues }), 5);
    expect(r.screen).toMatchObject({ section: 'tela-01', generated: false, totalSteps: 0 });
    expect(r.screen!.step).toBeUndefined();
  });
});

describe('painel de tópicos', () => {
  const topics = [
    { text: 'Oito horas de curso', cue: 'Em oito horas' },
    { text: 'Câmera muda de lado', cue: 'câmera muda' },
    { text: 'Celular na mão', cue: 'Pega o celular' },
    { text: 'Quarto tópico', cue: 'usar já' },
  ];
  it('tópico aceso, os visíveis na página e o próximo', () => {
    const r = resolveMark(base({ topics, cues: CUES }), 12);
    expect(r.topic).toMatchObject({ index: 2, text: 'Câmera muda de lado', cue: 'câmera muda', page: 1, lit: 2, total: 4 });
    expect(r.topic!.visible).toEqual(['Oito horas de curso', 'Câmera muda de lado', 'Celular na mão']);
    expect(r.topic!.next).toMatchObject({ index: 3, text: 'Celular na mão' });
  });
  it('antes do primeiro tópico: nenhum aceso', () => {
    const r = resolveMark(base({ topics, cues: CUES }), 1);
    expect(r.topic).toMatchObject({ index: null, lit: 0 });
    expect(r.topic!.next!.index).toBe(1);
  });
  it('4º tópico troca a página', () => {
    const r = resolveMark(base({ topics, cues: CUES }), 19.5);
    expect(r.topic!.page).toBe(2);
    expect(r.topic!.visible).toEqual(['Quarto tópico']);
  });
});

describe('sceneContextFromNode', () => {
  it('monta o retrato a partir do nó do rascunho', () => {
    const node = {
      id: 'v02',
      type: 'content',
      title: 'Medo de IA',
      body: { type: 'doc', content: [] },
      media: { kind: 'video', assetId: 'ast_v', captions: { assetId: 'ast_c', approx: true }, generatedFrom: { jobId: 'j', sceneHash: 'hh', provider: 'heygen' }, adjust: { drop: ['s2'], cut: {}, teaser: null } },
      direction: { shots: [{ id: 's1', line: 'Oi', layout: 'presenter', framing: 'medium', cameraId: 'cam_dir' }], retake: { s1: 1 } },
      topics: [{ text: 'Medo', cue: 'medo' }],
    };
    const ctx = sceneContextFromNode({ presentation: { voiceProvider: 'elevenlabs', cameras: [{ id: 'cam_dir', zone: 'right' }] } } as never, { id: 'aula_01', title: 'A1' }, node as never, { durationSec: 12, cues: [] })!;
    expect(ctx).toMatchObject({ nodeId: 'v02', assetId: 'ast_v', sceneHash: 'hh', captionsAssetId: 'ast_c', captionsApprox: true, hasNarrationAudio: true, dropped: ['s2'], retake: { s1: 1 }, teaser: false, screens: null });
    expect(ctx.shots![0]).toMatchObject({ id: 's1', cameraId: 'cam_dir' });
    expect(sceneContextFromNode({ presentation: {} } as never, { id: 'a', title: 'a' }, { id: 'x', type: 'end' } as never, { durationSec: null, cues: [] })).toBeNull();
  });
});
