import { describe, expect, it } from 'vitest';
import { CameraSchema, SceneDirectionSchema, directionNarration, richTextFromPlain, type LessonGraph } from '@lms/course-schema';
import {
  FakeLlmAdapter,
  alignLinesToNarration,
  buildDirectionInput,
  checkLinesMatch,
  createTemplateFakeAdapter,
  demoCinematicLines,
  directScenes,
  directionGestureWarnings,
  directionPlacementWarnings,
  directionProposalToSceneDirection,
  enforceCinematicLessonCap,
  directionTargetsFromGraph,
  normalizeSpoken,
  splitSentences,
  suggestedShotCount,
  templateDirection,
  validateDirectionScene,
  videoCapabilitiesText,
  type DirectScenesArgs,
  type DirectionSceneProposal,
  type DirectionShotProposal,
  type DirectionTarget,
} from '../src';
import { TASK_DIRECTION } from '../src/prompts';

const shot = (over: Partial<DirectionShotProposal> = {}): DirectionShotProposal => ({
  id: 's1', line: 'Olá.', cameraId: null, framing: 'medium', layout: 'presenter', cameraMove: 'static', motionPrompt: '', slide: null, caption: null, transitionIn: 'cut', cinematic: null, ...over,
});

const NARRATION_A = 'Terça, dez horas. Você entra na chamada e a Carla sorri. Ela pergunta: “por que esta vaga?”';
const NARRATION_B = 'Uma boa resposta tem três partes: o que você sabe, o que já fez e o que quer aprender. Pense nisso agora.';

const targets: DirectionTarget[] = [
  { nodeId: 'situacao', type: 'scenario', title: 'A chamada', narration: NARRATION_A, screenText: 'Texto da tela A', hasNarration: true },
  { nodeId: 'explica', type: 'content', title: 'Como responder', narration: NARRATION_B, screenText: 'Texto da tela B', hasNarration: true },
];
const cameras = [CameraSchema.parse({ id: 'frente', name: 'Frente', lookId: 'look_1' }), CameraSchema.parse({ id: 'lado', name: 'Lado', lookId: 'look_2', angle: 'left' })];
const args: DirectScenesArgs = {
  course: { title: 'Entrevistas', brief: { publico: 'jovens' } },
  lesson: { id: 'aula_1', title: 'Primeira entrevista' },
  scenes: targets,
  cameras,
  // o kit alterna câmeras nestes testes: modo "várias câmeras"; gestos mínimos (os avisos de gesto têm teste próprio)
  style: { pace: 'balanced', useSlides: true, cameraMode: 'multi', gestures: 'minimal' },
  capabilities: videoCapabilitiesText({ cameraCount: 2, avatarType: 'photo_avatar', cameraMode: 'multi' }),
};

const goodScene = (t: DirectionTarget, lines: string[]): DirectionSceneProposal => ({
  nodeId: t.nodeId,
  intent: 'Situar e aproximar.',
  shots: lines.map((line, i) => shot({ id: `s${i + 1}`, line, cameraId: i % 2 ? 'lado' : 'frente', framing: (['medium', 'close'] as const)[i % 2] })),
});

describe('directionProposalToSceneDirection', () => {
  it('descarta nulos/vazios, marca source ai e valida', () => {
    const d = directionProposalToSceneDirection({
      nodeId: 'x', intent: ' intenção ',
      shots: [
        shot({ id: 's1', line: ' Primeira. ', cameraId: 'frente', motionPrompt: 'nods, warm', caption: null }),
        shot({ id: 's2', line: 'Segunda.', layout: 'presenter_slide_right', slide: { title: 'Três partes', bullets: ['saber', 'fazer'], highlight: null, style: 'checklist', variant: null }, motionPrompt: '  ' }),
        shot({ id: 's3', line: 'Terceira.', layout: 'lower_third', caption: 'Terça · dez horas' }),
      ],
    });
    expect(SceneDirectionSchema.parse(d)).toEqual(d);
    expect(d.source).toBe('ai');
    expect(d.version).toBe(1);
    expect(d.intent).toBe('intenção');
    expect(d.shots[0]).toEqual({ id: 's1', line: 'Primeira.', cameraId: 'frente', framing: 'medium', layout: 'presenter', cameraMove: 'static', motionPrompt: 'nods, warm', transitionIn: 'cut' });
    expect(d.shots[1]!.slide).toEqual({ title: 'Três partes', bullets: ['saber', 'fazer'], style: 'checklist' });
    expect(d.shots[1]).not.toHaveProperty('motionPrompt');
    expect(d.shots[1]).not.toHaveProperty('cameraId');
    expect(d.shots[2]!.caption).toBe('Terça · dez horas');
    expect(directionNarration(d)).toBe('Primeira. Segunda. Terceira.');
  });
});

describe('falas: comparação e alinhamento', () => {
  it('aceita igualdade exata', () => {
    expect(checkLinesMatch(NARRATION_A, ['Terça, dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: “por que esta vaga?”'])).toEqual({ ok: true });
  });
  it('aceita diferenças só de espaço, aspas e reticências', () => {
    expect(normalizeSpoken('  Ela  disse:\n“sim”… ')).toBe('Ela disse: "sim"...');
    const r = checkLinesMatch(NARRATION_A, ['Terça,  dez horas.', 'Você entra na chamada\ne a Carla sorri.', 'Ela pergunta: "por que esta vaga?"']);
    expect(r.ok).toBe(true);
    // realinha ao texto original (aspas tipográficas do autor)
    expect(alignLinesToNarration(NARRATION_A, ['Terça,  dez horas.', 'Você entra na chamada\ne a Carla sorri.', 'Ela pergunta: "por que esta vaga?"'])).toEqual(['Terça, dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: “por que esta vaga?”']);
  });
  it('rejeita reescrita e descreve onde diverge', () => {
    const r = checkLinesMatch(NARRATION_A, ['Terça, às dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: “por que esta vaga?”']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diff).toMatch(/esperado «dez horas/);
    const short = checkLinesMatch(NARRATION_A, ['Terça, dez horas.']);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.diff).toMatch(/terminam antes/);
    expect(alignLinesToNarration(NARRATION_A, ['Terça, dez horas.'])).toBeNull();
  });
});

describe('validateDirectionScene', () => {
  it('aponta ids repetidos, câmera inexistente, slide fora dos limites e layout incoerente', () => {
    const t = targets[1]!;
    const p = validateDirectionScene({
      nodeId: t.nodeId, intent: '',
      shots: [
        shot({ id: 's1', line: 'Uma boa resposta tem três partes: o que você sabe, o que já fez e o que quer aprender.', cameraId: 'drone', layout: 'presenter_slide_right', slide: { title: '', bullets: ['a', 'b', 'c', 'd', 'e'], highlight: null, style: 'clean', variant: null } }),
        shot({ id: 's1', line: 'Pense nisso agora.', layout: 'slide', slide: null }),
      ],
    }, t, cameras);
    expect(p.join('\n')).toMatch(/id repetido/);
    expect(p.join('\n')).toMatch(/cameraId "drone" não existe/);
    expect(p.join('\n')).toMatch(/5 tópicos/);
    expect(p.join('\n')).toMatch(/layout slide exige slide/);
  });
  it('rejeita tópico longo e mais de 12 planos', () => {
    const t: DirectionTarget = { ...targets[0]!, narration: Array.from({ length: 13 }, (_, i) => `Frase ${i + 1}.`).join(' ') };
    const p = validateDirectionScene({ nodeId: t.nodeId, intent: '', shots: Array.from({ length: 13 }, (_, i) => shot({ id: `s${i + 1}`, line: `Frase ${i + 1}.` })) }, t, cameras);
    expect(p.join('\n')).toMatch(/13 planos/);
    const p2 = validateDirectionScene({ nodeId: 'situacao', intent: '', shots: [shot({ line: NARRATION_A, layout: 'slide', slide: { title: 't', bullets: ['um dois três quatro cinco seis sete oito nove'], highlight: null, style: 'clean', variant: null } })] }, targets[0]!, []);
    expect(p2.join('\n')).toMatch(/9 palavras/);
  });
});

describe('limites de duração e de wide (pesquisa HeyGen)', () => {
  const long = Array.from({ length: 30 }, (_, i) => `p${i}`).join(' ') + '.';
  const t: DirectionTarget = { nodeId: 'x', type: 'content', title: 'X', narration: `${long} Ok então vamos.`, screenText: '', hasNarration: true };
  it('rejeita plano acima de 26 palavras e abaixo de 3 quando há vários planos', () => {
    const p = validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ id: 's1', line: long }), shot({ id: 's2', line: 'Ok' }), shot({ id: 's3', line: 'então vamos.' })] }, t, []);
    expect(p.join('\n')).toMatch(/30 palavras \(máximo 26/);
    expect(p.join('\n')).toMatch(/só 1 palavra/);
    // um plano único curto é aceito
    expect(validateDirectionScene({ nodeId: 'q', intent: '', shots: [shot({ line: 'Pronto?' })] }, { ...t, nodeId: 'q', narration: 'Pronto?' }, [])).toEqual([]);
  });
  it('rejeita mais de um wide e wide em fala longa', () => {
    const tt: DirectionTarget = { ...t, narration: 'Primeira frase curta aqui. Segunda frase curta aqui.' };
    const p = validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ id: 's1', line: 'Primeira frase curta aqui.', framing: 'wide' }), shot({ id: 's2', line: 'Segunda frase curta aqui.', framing: 'wide' })] }, tt, []);
    expect(p.join('\n')).toMatch(/2 planos wide/);
    const p2 = validateDirectionScene({ nodeId: 'situacao', intent: '', shots: [shot({ line: NARRATION_A, framing: 'wide' })] }, targets[0]!, []);
    expect(p2.join('\n')).toMatch(/wide numa fala longa/);
  });
  it('o modelo de demonstração respeita os limites em falas longas', () => {
    const narration = 'Antes da entrevista, vale preparar com calma o que você vai dizer sobre a sua trajetória, sobre os cursos que fez, sobre os trabalhos informais e sobre o que aprendeu cuidando da casa e dos irmãos. Depois, separe dois exemplos concretos. Ok. Treine em voz alta, de preferência com alguém que possa te dar um retorno sincero sobre o tom, a velocidade e a clareza da sua fala, porque isso faz diferença no dia.';
    const target: DirectionTarget = { nodeId: 'longa', type: 'content', title: 'Longa', narration, screenText: '', hasNarration: true };
    const out = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input: buildDirectionInput({ ...args, scenes: [target] }), schema: undefined as never });
    const sc = out.scenes[0]!;
    expect(sc.shots.length).toBeGreaterThan(3);
    expect(validateDirectionScene(sc, target, cameras)).toEqual([]);
    expect(directionNarration(directionProposalToSceneDirection(sc))).toBe(normalizeSpoken(narration));
  });
});

describe('directScenes', () => {
  it('aceita direção válida na primeira tentativa e realinha as falas', async () => {
    const fake = new FakeLlmAdapter({
      scene_direction: { scenes: [goodScene(targets[0]!, ['Terça, dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: "por que esta vaga?"']), goodScene(targets[1]!, ['Uma boa resposta tem três partes: o que você sabe, o que já fez e o que quer aprender.', 'Pense nisso agora.'])] },
    });
    const r = await directScenes({ primary: fake }, args);
    expect(r.errors).toEqual([]);
    expect(r.meta.repairs).toBe(0);
    expect(r.scenes.map((s) => s.nodeId)).toEqual(['situacao', 'explica']);
    expect(directionNarration(r.scenes[0]!.direction)).toBe(NARRATION_A);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.input).toMatch(/<cameras>[\s\S]*id: frente[\s\S]*<\/cameras>/);
    expect(fake.calls[0]!.input).toMatch(/<capacidades>[\s\S]*INDISPONÍVEL/);
  });

  it('pede reparo só da cena com fala divergente, com o diff exato', async () => {
    const fake = new FakeLlmAdapter({
      scene_direction: { scenes: [goodScene(targets[0]!, ['Terça, às dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: “por que esta vaga?”']), goodScene(targets[1]!, [NARRATION_B])] },
      scene_direction_repair: { scenes: [goodScene(targets[0]!, ['Terça, dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: “por que esta vaga?”'])] },
    });
    const r = await directScenes({ primary: fake }, args);
    expect(r.errors).toEqual([]);
    expect(r.meta.repairs).toBe(1);
    expect(r.scenes).toHaveLength(2);
    expect(fake.calls.map((c) => c.task)).toEqual(['scene_direction', 'scene_direction_repair']);
    const repairInput = fake.calls[1]!.input;
    expect(repairInput).toMatch(/falhou na validação/);
    expect(repairInput).toMatch(/esperado «dez horas/);
    expect(repairInput).toMatch(/<cena id="situacao"/);
    expect(repairInput).not.toMatch(/<cena id="explica"/);
  });

  it('descarta a cena que continua inválida após 2 reparos e relata o erro', async () => {
    const bad = goodScene(targets[0]!, ['Outra fala.']);
    const fake = new FakeLlmAdapter({ scene_direction: { scenes: [bad, goodScene(targets[1]!, [NARRATION_B])] }, scene_direction_repair: { scenes: [bad] } });
    const r = await directScenes({ primary: fake }, args);
    expect(r.scenes.map((s) => s.nodeId)).toEqual(['explica']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.nodeId).toBe('situacao');
    expect(r.meta.repairs).toBe(2);
    expect(fake.calls).toHaveLength(3);
  });

  it('cena ausente na resposta motiva reparo', async () => {
    const fake = new FakeLlmAdapter({ scene_direction: { scenes: [goodScene(targets[1]!, [NARRATION_B])] }, scene_direction_repair: { scenes: [goodScene(targets[0]!, [NARRATION_A])] } });
    const r = await directScenes({ primary: fake }, args);
    expect(r.errors).toEqual([]);
    expect(fake.calls[1]!.input).toMatch(/ausente na resposta/);
  });

  it('divide em lotes de até 8 cenas', async () => {
    const many: DirectionTarget[] = Array.from({ length: 10 }, (_, i) => ({ nodeId: `c${i}`, type: 'content', title: `C${i}`, narration: `Fala da cena ${i}. Segunda frase da cena ${i}.`, screenText: '', hasNarration: true }));
    const fake = createTemplateFakeAdapter();
    const r = await directScenes({ primary: fake }, { ...args, scenes: many });
    expect(r.errors).toEqual([]);
    expect(r.scenes).toHaveLength(10);
    expect(fake.calls.map((c) => c.task)).toEqual(['scene_direction', 'scene_direction']);
  });
});

describe('modelo de demonstração (templateDirection)', () => {
  it('divide por frases em até 3 planos wide/medium/close e põe slide na lista do meio', async () => {
    // cenas em movimento desligadas: a abertura "Terça, dez horas…" fica no apresentador
    const input = buildDirectionInput({ ...args, style: { ...args.style, maxCinematicPerLesson: 0 } });
    const out = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input, schema: undefined as never });
    expect(out.scenes.map((s) => s.nodeId)).toEqual(['situacao', 'explica']);
    const a = out.scenes[0]!;
    expect(a.shots.map((s) => s.framing)).toEqual(['wide', 'medium', 'close']);
    expect(a.shots.map((s) => s.cameraId)).toEqual(['frente', 'lado', 'frente']);
    for (const sc of out.scenes) {
      const t = targets.find((x) => x.nodeId === sc.nodeId)!;
      expect(validateDirectionScene(sc, t, cameras)).toEqual([]);
      const d = directionProposalToSceneDirection(sc);
      expect(SceneDirectionSchema.safeParse(d).success).toBe(true);
      expect(normalizeSpoken(directionNarration(d))).toBe(normalizeSpoken(t.narration));
    }
    // lista com vírgulas no plano do meio vira slide
    const listTarget: DirectionTarget = { nodeId: 'lista', type: 'content', title: 'Lista', narration: 'Vamos ver como responder. Leve três coisas: currículo, documento e caneta. Agora é com você.', screenText: '', hasNarration: true };
    const out2 = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input: buildDirectionInput({ ...args, scenes: [listTarget] }), schema: undefined as never });
    const mid = out2.scenes[0]!.shots[1]!;
    expect(mid.layout).toBe('presenter_slide_right');
    expect(mid.slide?.bullets).toEqual(['currículo', 'documento', 'caneta']);
    expect(validateDirectionScene(out2.scenes[0]!, listTarget, cameras)).toEqual([]);
  });

  it('câmera única (padrão): só a câmera principal, a lista vira a apresentadora com o painel (presenter_panel) com **negrito** e todo plano com apresentador tem gesto', () => {
    const single: DirectScenesArgs = { ...args, style: { pace: 'balanced', useSlides: true }, capabilities: videoCapabilitiesText({ cameraCount: 2, cameraMode: 'single' }) };
    const listTarget: DirectionTarget = { nodeId: 'lista', type: 'content', title: 'O que levar', narration: 'Vamos ver como responder com calma. Então leve três coisas no dia: o currículo impresso, um documento com foto e uma caneta que funcione. Agora é com você, combinado?', screenText: '', hasNarration: true };
    const input = buildDirectionInput({ ...single, scenes: [listTarget] });
    expect(input).toMatch(/câmera: única/);
    expect(input).toMatch(/cartões por minuto: ≈ 2/);
    expect(input).toMatch(/gestos: naturais/);
    expect(input).toMatch(/Modo de câmera ÚNICA/);
    const out = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input, schema: undefined as never });
    const sc = out.scenes[0]!;
    const card = sc.shots.find((s) => s.layout === 'presenter_panel')!;
    expect(card).toBeTruthy();
    expect(sc.shots.some((s) => s.layout === 'card')).toBe(false);
    expect(card.slide?.variant).toBeNull();
    expect(card.slide?.bullets).toEqual(['o **currículo impresso**', 'um **documento com foto**', 'uma **caneta que funcione**']);
    expect(card.slide?.title).toBe('Então leve três coisas no dia');
    // o painel mostra a apresentadora: câmera principal e gesto
    expect(card.motionPrompt).not.toBe('');
    expect(card.cameraId).toBe('frente');
    for (const s of sc.shots.filter((x) => x.layout === 'presenter')) {
      expect(s.cameraId).toBe('frente');
      expect(s.motionPrompt).not.toBe('');
    }
    expect(validateDirectionScene(sc, listTarget, cameras, { cameraMode: 'single' })).toEqual([]);
    expect(SceneDirectionSchema.safeParse(directionProposalToSceneDirection(sc)).success).toBe(true);
    // a mesma fala sem cartões: tudo presenter na câmera principal
    const off = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input: buildDirectionInput({ ...single, style: { ...single.style, cardsPerMinute: 0 }, scenes: [listTarget] }), schema: undefined as never });
    expect(off.scenes[0]!.shots.every((s) => s.layout === 'presenter' && s.cameraId === 'frente')).toBe(true);
  });

  it('validador em câmera única: troca de câmera, PiP, cartão curto/longo, dois cartões seguidos e limites do cartão', () => {
    const t: DirectionTarget = { nodeId: 'x', type: 'content', title: 'X', narration: 'Primeira frase curta aqui. Segunda frase curta aqui. Terceira frase curta aqui.', screenText: '', hasNarration: true };
    const cardSlide = { title: 'Três coisas para levar', bullets: ['**currículo** impresso', '**documento** com foto'], highlight: null, style: 'checklist' as const, variant: 'navy' as const };
    const p = validateDirectionScene({ nodeId: 'x', intent: '', shots: [
      shot({ id: 's1', line: 'Primeira frase curta aqui.', cameraId: 'lado' }),
      shot({ id: 's2', line: 'Segunda frase curta aqui.', layout: 'card', slide: cardSlide }),
      shot({ id: 's3', line: 'Terceira frase curta aqui.', layout: 'card', slide: { ...cardSlide, title: 'um dois três quatro cinco seis sete oito nove', bullets: ['a', 'b', 'c', 'd'] } }),
    ] }, t, cameras, { cameraMode: 'single' });
    const msgs = p.join('\n');
    expect(msgs).toMatch(/CAMERA_SWITCH_IN_SINGLE_MODE: .*cameraId "lado".*use "frente" \(principal\)/);
    expect(msgs).toMatch(/CARD_TOO_SHORT: .*plano 2 .*só 4 palavras \(mínimo 13/);
    expect(msgs).toMatch(/CONSECUTIVE_CARDS: .*plano 3/);
    expect(msgs).toMatch(/CARD_TITLE_TOO_LONG: .*9 palavras \(máximo 8\)/);
    expect(msgs).toMatch(/CARD_TOO_MANY_BULLETS: .*4 tópicos \(máximo 3\)/);
    const pip = validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ line: t.narration, layout: 'slide_with_pip', slide: cardSlide })] }, t, cameras, { cameraMode: 'single' });
    expect(pip.join('\n')).toMatch(/PIP_IN_SINGLE_MODE/);
    const long = Array.from({ length: 40 }, (_, i) => `p${i}`).join(' ') + '.';
    const tl: DirectionTarget = { ...t, narration: `${long} Fim da fala aqui.` };
    const pl = validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ id: 's1', line: long, layout: 'card', slide: cardSlide }), shot({ id: 's2', line: 'Fim da fala aqui.' })] }, tl, [], { cameraMode: 'single' });
    expect(pl.join('\n')).toMatch(/CARD_TOO_LONG: .*40 palavras \(máximo 39/);
    // tópico com **negrito**: as marcas não contam como palavras; 12 palavras passam
    const tOk: DirectionTarget = { ...t, narration: 'Primeira frase com várias palavras para caber num cartão de cinco segundos pelo menos. Terceira frase curta aqui.' };
    const ok = validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ id: 's1', line: 'Primeira frase com várias palavras para caber num cartão de cinco segundos pelo menos.', layout: 'card', slide: { ...cardSlide, bullets: ['**um dois** três quatro cinco seis sete oito nove dez onze doze', '**b** c'] } }), shot({ id: 's2', line: 'Terceira frase curta aqui.', motionPrompt: 'nods slowly, warm' })] }, tOk, cameras, { cameraMode: 'single' });
    expect(ok).toEqual([]);
    // em "várias câmeras" a troca é permitida
    expect(validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ line: t.narration, cameraId: 'lado' })] }, t, cameras, { cameraMode: 'multi' })).toEqual([]);
  });

  it('aviso MISSING_GESTURE: plano com apresentador sem gesto (cartões e slides não contam); directScenes devolve com gestos naturais', async () => {
    expect(directionGestureWarnings([{ id: 's1', layout: 'presenter', motionPrompt: '' }, { id: 's2', layout: 'card', motionPrompt: '' }, { id: 's3', layout: 'lower_third', motionPrompt: 'nods slowly, warm' }])).toEqual([{ shotId: 's1', message: expect.stringMatching(/^MISSING_GESTURE: plano "s1"/) }]);
    const fake = new FakeLlmAdapter({ scene_direction: { scenes: [goodScene(targets[1]!, ['Uma boa resposta tem três partes: o que você sabe, o que já fez e o que quer aprender.', 'Pense nisso agora.'])] } });
    const r = await directScenes({ primary: fake }, { ...args, style: { pace: 'balanced', useSlides: true, cameraMode: 'multi', gestures: 'natural' }, scenes: [targets[1]!] });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.shotId)).toEqual(['s1', 's2']);
    expect(r.warnings[0]!.message).toMatch(/MISSING_GESTURE/);
  });

  it('frases sem pontuação final e números com ponto não quebram', () => {
    expect(splitSentences('Custa R$ 1.000 por mês. E agora')).toEqual(['Custa R$ 1.000 por mês.', 'E agora']);
  });

  it('sugere planos conforme o ritmo', () => {
    const text = Array.from({ length: 40 }, () => 'palavra').join(' ');
    expect(suggestedShotCount(text, 'calm')).toBe(2);
    expect(suggestedShotCount(text, 'dynamic')).toBeGreaterThan(suggestedShotCount(text, 'balanced'));
    expect(suggestedShotCount('Oi.', 'balanced')).toBe(1);
  });
});

describe('directionTargetsFromGraph', () => {
  it('pega cenas com vídeo que têm fala ou texto, respeitando nodeIds', () => {
    const graph: LessonGraph = {
      schemaVersion: 1, startNodeId: 'a', variables: [], layout: { positions: {} },
      nodes: [
        { id: 'a', type: 'scenario', objectiveIds: [], required: true, title: 'A', body: richTextFromPlain('Texto A'), narration: 'Fala A.' },
        { id: 'b', type: 'content', objectiveIds: [], required: true, title: 'B', body: richTextFromPlain('Texto B') },
        { id: 'c', type: 'content', objectiveIds: [], required: true, body: richTextFromPlain('') },
        { id: 'r', type: 'reflection', objectiveIds: [], required: true, prompt: richTextFromPlain('Pense'), minLength: 20, maxLength: 1500 },
        { id: 'fim', type: 'end', objectiveIds: [], required: true, summary: richTextFromPlain('Fim') },
      ],
      edges: [],
    };
    const all = directionTargetsFromGraph(graph);
    expect(all.map((t) => [t.nodeId, t.narration, t.hasNarration])).toEqual([['a', 'Fala A.', true], ['b', 'Texto B', false]]);
    expect(directionTargetsFromGraph(graph, ['b', 'zzz']).map((t) => t.nodeId)).toEqual(['b']);
    // a posição na aula ignora o filtro (a primeira cena continua sendo a primeira)
    expect(directionTargetsFromGraph(graph, ['b']).map((t) => t.position)).toEqual([1]);
  });
});

describe('cena em movimento (layout cinematic)', () => {
  const ARRIVE = 'Terça de manhã, você chega ao prédio da empresa com quinze minutos de folga e respira fundo antes de entrar.';
  const ASK = 'O que você diria primeiro?';
  const target: DirectionTarget = { nodeId: 'chegada', type: 'scenario', title: 'Chegada', narration: `${ARRIVE} ${ASK}`, screenText: '', hasNarration: true, position: 0 };
  const cine = (over: Partial<DirectionShotProposal> = {}) => shot({ id: 's1', line: ARRIVE, layout: 'cinematic', cinematic: { action: 'walk_across', prompt: 'The presenter arrives at a modern office building; slow tracking shot from the side, eye level.', setting: 'Chegando ao prédio' }, ...over });
  const closeAsk = shot({ id: 's2', line: ASK, framing: 'close' });

  it('aceita uma cena em movimento com pedido, 4–38 palavras e sem slide; até 38 palavras vale (acima do limite de 26 do apresentador)', () => {
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine(), closeAsk] }, target, [])).toEqual([]);
    const long = Array.from({ length: 34 }, (_, i) => `w${i}`).join(' ') + '.';
    const t2 = { ...target, narration: `${long} ${ASK}` };
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ line: long }), closeAsk] }, t2, [])).toEqual([]);
  });

  it('exige pedido, respeita 4–38 palavras, sem slide, 1 por cena e o desligamento', () => {
    const noPrompt = validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ cinematic: null }), closeAsk] }, target, []).join('\n');
    expect(noPrompt).toMatch(/exige cinematic.prompt/);
    const withSlide = validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ slide: { title: 'x', bullets: [], highlight: null, style: 'clean', variant: null } }), closeAsk] }, target, []).join('\n');
    expect(withSlide).toMatch(/não tem slide/);
    const tooLong = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ') + '.';
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ line: tooLong }), closeAsk] }, { ...target, narration: `${tooLong} ${ASK}` }, []).join('\n')).toMatch(/40 palavras \(máximo 38/);
    const tShort = { ...target, narration: `Você chega cedo. ${ASK}` };
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ line: 'Você chega cedo.' }), closeAsk] }, tShort, []).join('\n')).toMatch(/só 3 palavras \(mínimo 4, ≈ 1,5 s/);
    // fala curta (4 palavras, ≈ 1,5 s) vale: a imagem dura o mínimo da ação e a fala entra por cima
    const tFour = { ...target, narration: `Você chega bem cedo. ${ASK}` };
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine({ line: 'Você chega bem cedo.' }), closeAsk] }, tFour, [])).toEqual([]);
    const two = validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine(), cine({ id: 's2', line: ASK })] }, target, []).join('\n');
    expect(two).toMatch(/2 planos cinematic \(máximo 1 por cena\)/);
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [cine(), closeAsk] }, target, [], { maxCinematic: 0 }).join('\n')).toMatch(/desligadas neste curso/);
    expect(validateDirectionScene({ nodeId: 'chegada', intent: '', shots: [shot({ id: 's1', line: ARRIVE, cinematic: { action: 'walk_across', prompt: 'x', setting: null } }), closeAsk] }, target, []).join('\n')).toMatch(/cinematic preenchido com layout presenter/);
  });

  it('converte para o contrato com cinematic {prompt, setting} e descarta nos outros layouts', () => {
    const d = directionProposalToSceneDirection({ nodeId: 'chegada', intent: '', shots: [cine(), shot({ id: 's2', line: ASK, cinematic: { action: 'walk_across', prompt: 'ignored', setting: null } })] });
    expect(d.shots[0]!.cinematic).toEqual({ action: 'walk_across', prompt: 'The presenter arrives at a modern office building; slow tracking shot from the side, eye level.', setting: 'Chegando ao prédio' });
    expect(d.shots[1]).not.toHaveProperty('cinematic');
  });

  it('limite por aula: mantém as primeiras N (ordem das cenas) e converte o resto em presenter/medium, sem reparo', async () => {
    const mk = (id: string, i: number): DirectionTarget => ({ ...target, nodeId: id, position: i });
    const scenes3 = ['c1', 'c2', 'c3'].map(mk);
    const fake = new FakeLlmAdapter({ scene_direction: { scenes: scenes3.map((t) => ({ nodeId: t.nodeId, intent: '', shots: [cine(), closeAsk] })) } });
    const r = await directScenes({ primary: fake }, { ...args, scenes: scenes3, style: { ...args.style, maxCinematicPerLesson: 2 } });
    expect(fake.calls).toHaveLength(1);
    expect(r.errors).toEqual([]);
    expect(r.scenes.map((s) => s.direction.shots[0]!.layout)).toEqual(['cinematic', 'cinematic', 'presenter']);
    expect(r.scenes[2]!.direction.shots[0]).toMatchObject({ layout: 'presenter', framing: 'medium' });
    expect(r.scenes[2]!.direction.shots[0]).not.toHaveProperty('cinematic');
    expect(r.warnings).toEqual([{ nodeId: 'c3', shotId: 's1', message: expect.stringMatching(/acima do limite da aula/) }]);
    expect(fake.calls[0]!.input).toMatch(/cenas em movimento: até 2 por aula/);
    // cenas já dirigidas fora deste pedido contam no limite
    const again = { scenes: [{ nodeId: 'c1', intent: '', shots: [cine(), closeAsk] }] };
    const fake2 = new FakeLlmAdapter({ scene_direction: again, scene_direction_repair: again });
    const r2 = await directScenes({ primary: fake2 }, { ...args, scenes: [scenes3[0]!], style: { ...args.style, maxCinematicPerLesson: 1 }, existingCinematicShots: 1 });
    // orçamento 0: o validador pede reparo (desligada); a resposta repetida é descartada após os reparos
    expect(fake2.calls[0]!.input).toMatch(/cenas em movimento: DESLIGADAS/);
    expect(r2.scenes).toHaveLength(0);
    expect(r2.errors[0]!.message).toMatch(/desligadas/);
    expect(enforceCinematicLessonCap(r.scenes, 0).scenes.every((s) => s.direction.shots.every((x) => x.layout !== 'cinematic'))).toBe(true);
  });

  it('capacidades: desligada com voz HeyGen ou limite 0', () => {
    expect(videoCapabilitiesText({ cameraCount: 1 })).toMatch(/Cena em movimento \(layout cinematic\) \[limitado\]: Cena em movimento: o apresentador caminha\/age sem falar/);
    expect(videoCapabilitiesText({ cameraCount: 1, voiceProvider: 'heygen' })).toMatch(/Cena em movimento \(layout cinematic\) \[INDISPONÍVEL\]: desligada neste curso \(a voz do HeyGen/);
    expect(videoCapabilitiesText({ cameraCount: 1, maxCinematicPerLesson: 0 })).toMatch(/limite por aula = 0/);
    expect(videoCapabilitiesText({ cameraCount: 1 })).toMatch(/fala de 4 a 38 palavras \(≈ 1,5–15 s\); a imagem dura pelo menos o mínimo da ação \(walk_in_and_sit 8 s, walk_toward_camera 6 s, walk_away 6 s, walk_across 5 s, walk_and_look_around 5 s\)/);
  });

  it('regra 12 do diretor: fala pode ser mais curta que o movimento; mínimo de imagem por ação; lugar vira fundo', () => {
    expect(TASK_DIRECTION).toMatch(/A fala do plano tem de 4 a 38 palavras \(≈ 1,5–15 s/);
    expect(TASK_DIRECTION).toMatch(/A fala PODE ser mais curta que o movimento: a imagem dura pelo menos o mínimo da ação \(walk_in_and_sit 8 s, walk_toward_camera 6 s/);
    expect(TASK_DIRECTION).toMatch(/vira o fundo dos outros planos da mesma cena/);
  });

  it('demonstração: primeira cena da aula que narra uma situação abre em movimento; senão, nenhuma', () => {
    const run = (scenes: DirectionTarget[], max?: number) => templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input: buildDirectionInput({ ...args, scenes, style: { ...args.style, maxCinematicPerLesson: max } }), schema: undefined as never });
    const out = run([target, { ...targets[1]!, position: 1 }]);
    const first = out.scenes[0]!;
    expect(first.shots[0]).toMatchObject({ layout: 'cinematic', line: ARRIVE, slide: null, motionPrompt: '' });
    expect(first.shots[0]!.cinematic!.prompt).toMatch(/office building/);
    expect(first.shots[0]!.cinematic!.setting).toBe('Chegando ao prédio da empresa');
    expect(validateDirectionScene(first, target, cameras)).toEqual([]);
    expect(out.scenes[1]!.shots.every((s) => s.layout !== 'cinematic')).toBe(true);
    // não é a primeira da aula (posição 2), estilo desligado, ou primeira frase sem tempo/lugar
    expect(run([{ ...target, position: 1 }]).scenes[0]!.shots.some((s) => s.layout === 'cinematic')).toBe(false);
    expect(run([target], 0).scenes[0]!.shots.some((s) => s.layout === 'cinematic')).toBe(false);
    expect(run([{ ...targets[1]!, position: 0 }]).scenes[0]!.shots.some((s) => s.layout === 'cinematic')).toBe(false);
    // NARRATION_A: "Terça, dez horas." (3 palavras) + a frase seguinte formam a abertura em movimento (vídeo chamada)
    const a = run([{ ...targets[0]!, position: 0 }]).scenes[0]!;
    expect(a.shots[0]).toMatchObject({ layout: 'cinematic', line: 'Terça, dez horas. Você entra na chamada e a Carla sorri.' });
    expect(a.shots[0]!.cinematic).toMatchObject({ action: 'walk_in_and_sit' });
    expect(a.shots[0]!.cinematic!.prompt).toMatch(/laptop/);
    expect(validateDirectionScene(a, targets[0]!, cameras)).toEqual([]);
    expect(demoCinematicLines('Qual é a sua dúvida hoje de manhã?', ['Qual é a sua dúvida hoje de manhã?'])).toBeNull();
  });
});

describe('posição por câmera na direção', () => {
  const seated = [CameraSchema.parse({ id: 'frente', name: 'Em pé', lookId: 'look_1' }), CameraSchema.parse({ id: 'lado', name: 'Sentada', lookId: 'look_2', placement: 'full_frame' })];
  const right = { presenterPlacement: 'right', presenterScale: 0.92 };

  it('o diretor sabe das posições e da regra de no máximo uma mudança por cena', () => {
    expect(TASK_DIRECTION).toMatch(/posicao/);
    expect(TASK_DIRECTION).toMatch(/não alterne a posição a cada plano/);
    const input = buildDirectionInput({ ...args, cameras: seated, placement: right, scenes: [targets[0]!] });
    expect(input).toMatch(/- id: frente \| Em pé \| [^\n]*posicao em pé à direita \| principal/);
    expect(input).toMatch(/- id: lado \| Sentada \| [^\n]*posicao tela cheia \(fundo do próprio visual\)/);
  });

  it('aviso suave quando a cena alterna a posição mais de uma vez (slide e cena em movimento não contam)', () => {
    const s = (id: string, cameraId: string | null, layout = 'presenter') => ({ id, cameraId, layout });
    expect(directionPlacementWarnings([s('s1', 'frente'), s('s2', 'lado'), s('s3', 'lado')], seated, right)).toEqual([]);
    expect(directionPlacementWarnings([s('s1', null), s('s2', 'lado'), s('s3', 'frente', 'slide'), s('s4', 'lado')], seated, right)).toEqual([]);
    const w = directionPlacementWarnings([s('s1', 'frente'), s('s2', 'lado'), s('s3', 'frente')], seated, right);
    expect(w).toEqual([{ shotId: 's3', message: expect.stringMatching(/muda 2 vezes na cena \(right → full_frame → right\)/) }]);
    // sem posição própria nas câmeras: nunca avisa
    expect(directionPlacementWarnings([s('s1', 'frente'), s('s2', 'lado'), s('s3', 'frente')], cameras, right)).toEqual([]);
  });

  it('directScenes devolve o aviso sem descartar a cena', async () => {
    const fake = new FakeLlmAdapter({
      scene_direction: { scenes: [goodScene(targets[0]!, ['Terça, dez horas.', 'Você entra na chamada e a Carla sorri.', 'Ela pergunta: "por que esta vaga?"'])] },
    });
    const r = await directScenes({ primary: fake }, { ...args, cameras: seated, placement: right, scenes: [targets[0]!] });
    expect(r.errors).toEqual([]);
    expect(r.scenes).toHaveLength(1);
    expect(r.warnings).toEqual([
      // s2 está na câmera em tela cheia (sentada) com close: corrigido para o enquadramento nativo (sem zoom digital)
      { nodeId: 'situacao', shotId: 's2', message: expect.stringMatching(/^ZOOM_ON_FULL_FRAME: plano "s2".*close\/static.*medium\/static/) },
      { nodeId: 'situacao', shotId: 's3', message: expect.stringMatching(/posição do apresentador muda 2 vezes/) },
    ]);
    expect(r.scenes[0]!.direction.shots[1]).toMatchObject({ cameraId: 'lado', framing: 'medium', cameraMove: 'static' });
  });

  it('câmera em tela cheia: validador não exige variar o enquadramento nem conta wide; o template usa o nativo + static', () => {
    const ffCams = [CameraSchema.parse({ id: 'cena', name: 'No cenário', lookId: 'look_3', placement: 'full_frame', nativeFraming: 'medium' })];
    const t3: DirectionTarget = { nodeId: 'x', type: 'content', title: 'x', narration: 'Primeira frase curta aqui. Segunda frase curta aqui. Terceira frase curta aqui.', screenText: '', hasNarration: true };
    const same = { nodeId: 'x', intent: '', shots: ['Primeira frase curta aqui.', 'Segunda frase curta aqui.', 'Terceira frase curta aqui.'].map((line, i) => shot({ id: `s${i + 1}`, line, cameraId: 'cena', framing: 'medium', motionPrompt: ['nods slowly, warm', 'opens both palms, honest', 'smiles softly, welcoming'][i]! })) };
    expect(validateDirectionScene(same, t3, ffCams, { placement: right })).toEqual([]);
    expect(validateDirectionScene(same, t3, ffCams.map((c) => ({ ...c, placement: undefined })), { placement: right }).join('\n')).toMatch(/mesmo enquadramento/);
    const input = buildDirectionInput({ ...args, cameras: ffCams, placement: right, scenes: [t3] });
    expect(input).toMatch(/posicao tela cheia/);
    const out = templateDirection({ task: 'scene_direction', instructionsVersion: 'x', system: '', input, schema: undefined as never });
    for (const s of out.scenes[0]!.shots) expect([s.framing, s.cameraMove]).toEqual(['medium', 'static']);
  });
});
