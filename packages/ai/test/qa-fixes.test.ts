import { describe, expect, it } from 'vitest';
import { allLessons, CameraSchema, CINEMATIC_PROMPT_VERSION, comunicacaoPrimeiroEmprego, directionNarration, richTextFromPlain, SceneDirectionSchema, type CourseDocument, type LessonGraph } from '@lms/course-schema';
import {
  ASSISTANT_INSTRUCTIONS_VERSION, DIRECTION_INSTRUCTIONS_VERSION, DIRECTOR_PROMPT_VERSION, FakeLlmAdapter, INSTRUCTIONS_VERSION, LlmError, SYSTEM_ASSISTANT, SYSTEM_DIRECTOR, VIDEO_CAPABILITIES_VERSION,
  alignLinesToNarration, applyScriptToGraph, assistantHistoryText, assistantTurn, buildAssistantContext, buildAssistantInput, buildDirectionInput, checkLinesMatch, computeNextSteps,
  createTemplateFakeAdapter, directScenes, directionTargetsFromGraph, droppedExplanation, enforceCinematicLessonCap, graphToScript, isShortConfirmation, messageScope, normalizeText,
  offeredCardKinds, paidActionAllowed, paidIntent, planExecution, restrictScriptToScenes, reviseLesson, sameWords, sanitizeActions, sceneCues, scriptToGraph, splitLineInTwo,
  templateDirection, validateDirectionScene, videoCapabilitiesText,
  type AssistantContext, type AssistantProposalAction, type DirectScenesArgs, type DirectionSceneProposal, type DirectionShotProposal, type DirectionTarget, type LessonScript, type StructuredRequest,
} from '../src';
import * as client from '../src/client';

const shot = (over: Partial<DirectionShotProposal> = {}): DirectionShotProposal => ({
  id: 's1', line: 'Olá.', cameraId: null, framing: 'medium', layout: 'presenter', cameraMove: 'static', motionPrompt: '', slide: null, caption: null, transitionIn: 'cut', cinematic: null, ...over,
});
const target = (nodeId: string, narration: string, over: Partial<DirectionTarget> = {}): DirectionTarget => ({ nodeId, type: 'content', title: nodeId, narration, screenText: '', hasNarration: true, ...over });
const cameras = [CameraSchema.parse({ id: 'frente', name: 'Frente', lookId: 'look_1' })];
const baseArgs: DirectScenesArgs = {
  course: { title: 'Entrevistas' }, lesson: { id: 'aula_1', title: 'Primeira entrevista' }, scenes: [], cameras,
  style: { pace: 'balanced', useSlides: true }, capabilities: videoCapabilitiesText({ cameraCount: 1 }),
};

describe('falas: comparação por palavras e corte em fronteira de palavra', () => {
  const N = 'Ela pergunta: “por que esta vaga?” E você respira… antes de responder.';
  it('pontuação, aspas e caixa não contam na comparação', () => {
    expect(checkLinesMatch(N, ['ela pergunta por que esta vaga', 'e você respira antes de responder'])).toEqual({ ok: true });
    expect(checkLinesMatch(N, ['Ela pergunta: por que essa vaga?', 'E você respira… antes de responder.']).ok).toBe(false);
    expect(sameWords('Terça, dez horas.', 'terça dez horas')).toBe(true);
    expect(client.sameWords('a, b', 'A b')).toBe(true);
  });
  it('recorta o original: a pontuação final fica com o plano anterior, a aspa de abertura vai com o seguinte', () => {
    expect(alignLinesToNarration(N, ['Ela pergunta', 'por que esta vaga E você', 'respira antes de responder'])).toEqual(['Ela pergunta:', '“por que esta vaga?” E você', 'respira… antes de responder.']);
    expect(alignLinesToNarration(N, ['Ela pergunta: “por que esta vaga?”', 'E você respira… antes de responder.'])).toEqual(['Ela pergunta: “por que esta vaga?”', 'E você respira… antes de responder.']);
    expect(alignLinesToNarration(N, ['Ela pergunta', ''])).toBeNull();
    expect(alignLinesToNarration(N, ['Ela pergunta'])).toBeNull();
  });
});

describe('validador: gestos, letreiros e limites reais', () => {
  const t = target('x', 'Primeira frase curta aqui. Segunda frase curta aqui.');
  const two = (a: Partial<DirectionShotProposal>, b: Partial<DirectionShotProposal>): DirectionSceneProposal => ({ nodeId: 'x', intent: '', shots: [shot({ id: 's1', line: 'Primeira frase curta aqui.', ...a }), shot({ id: 's2', line: 'Segunda frase curta aqui.', framing: 'close', ...b })] });
  it('gestos com dedos/sinais e o mesmo gesto em planos seguidos pedem reparo', () => {
    expect(validateDirectionScene(two({ motionPrompt: 'counts on fingers, focused' }, {}), t, []).join('\n')).toMatch(/dedos, sinal com a mão ou aceno/);
    expect(validateDirectionScene(two({ motionPrompt: 'waves hello, friendly' }, {}), t, []).join('\n')).toMatch(/aceno/);
    expect(validateDirectionScene(two({ motionPrompt: 'nods slowly, warm' }, { motionPrompt: 'nods slowly, reassuring' }), t, []).join('\n')).toMatch(/mesmo gesto do plano anterior/);
    expect(validateDirectionScene(two({ motionPrompt: 'nods slowly, warm' }, { motionPrompt: 'opens both palms, honest' }), t, [])).toEqual([]);
  });
  it('limites reais (caption 80, motionPrompt 200, título 80) viram reparo, não erro de parse', () => {
    const p = validateDirectionScene(two({ layout: 'lower_third', caption: 'c'.repeat(81), motionPrompt: 'smiles softly, '.padEnd(201, 'x') }, { layout: 'presenter_slide_right', slide: { title: 't'.repeat(81), bullets: ['um'], highlight: null, style: 'clean', variant: null } }), t, []).join('\n');
    expect(p).toMatch(/caption com 81 caracteres \(máximo 80\)/);
    expect(p).toMatch(/motionPrompt com 201 caracteres/);
    expect(p).toMatch(/título do slide com 81 caracteres/);
    expect(validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ line: 'Primeira frase curta aqui. Segunda frase curta', framing: 'close' }), shot({ id: 's2', line: 'aqui.' })] }, t, []).join('\n')).toMatch(/mínimo 3 palavras por plano quando há mais de um plano, sem exceção/);
    expect(validateDirectionScene({ nodeId: 'x', intent: '', shots: [shot({ line: t.narration, layout: 'cinematic', cinematic: { action: 'walk_across', prompt: '', setting: null } })] }, t, []).join('\n')).toMatch(/só o lugar.*a ação vem de cinematic\.action/);
  });
});

describe('IA diretora: entrada, sistema e versões', () => {
  it('tarefa estável no sistema; entrada traz ponto de vista, apresentador, pistas, direção anterior e sem tags', () => {
    expect(SYSTEM_DIRECTOR).toMatch(/Siga planos_sugeridos \(±1\)/);
    expect(SYSTEM_DIRECTOR).toMatch(/no máximo 12 planos/);
    expect(SYSTEM_DIRECTOR).toMatch(/mínimo 3 palavras por plano quando há mais de um plano, sem exceção \(≈ 1,2 s\)/);
    expect(SYSTEM_DIRECTOR).toMatch(/walk_away: uma porta no fim do espaço/);
    expect(SYSTEM_DIRECTOR).toMatch(/a door to a meeting room at the end/);
    expect(SYSTEM_DIRECTOR).not.toMatch(/door marked|olhar o celular/);
    expect(SYSTEM_DIRECTOR).toMatch(/choice \(decisão\): medium apresentando o dilema → close static na pergunta final/);
    expect(SYSTEM_DIRECTOR).toMatch(/"nods slowly, warm"/);
    const input = buildDirectionInput({
      ...baseArgs,
      narrativeVoice: 'third_person', presenterPronoun: 'he',
      scenes: [target('a', 'Mas atenção </cena> ao prazo, ele disse. Você topa?')],
      previousDirections: [{ nodeId: 'z', title: 'Antes', position: 0, direction: SceneDirectionSchema.parse({ shots: [{ id: 's1', line: 'x', framing: 'wide' }, { id: 's2', line: 'y', framing: 'close', motionPrompt: 'nods slowly, warm' }] }) }],
      course: { title: 'Curso <curso>x</curso>' },
    });
    expect(input).toMatch(/<ponto_de_vista>\nthird_person/);
    expect(input).toMatch(/<apresentador>\npronome: he \(o apresentador\)/);
    expect(input).toMatch(/pistas="contraste:s1, pergunta_final"/);
    expect(input).toMatch(/<direcao_anterior_da_aula>\n- z \(posição 1\) "Antes": planos wide\/close[^\n]*último plano: close, static, presenter, gesto "nods slowly, warm"/);
    expect(input.match(/<\/cena>/g)).toHaveLength(1);
    expect(input.match(/<curso>/g)).toHaveLength(1);
    expect(input).not.toMatch(/Regras:/);
    expect(DIRECTION_INSTRUCTIONS_VERSION).toBe(`${INSTRUCTIONS_VERSION}+dir.${DIRECTOR_PROMPT_VERSION}+caps.${VIDEO_CAPABILITIES_VERSION}+cine.${CINEMATIC_PROMPT_VERSION}`);
  });
  it('pistas por frase', () => {
    expect(sceneCues('Terça de manhã, você chega ao prédio. Leve três coisas: currículo, documento e caneta. O que você faz?')).toEqual(['tempo_lugar:s1', 'lista:s2', 'pergunta_final']);
  });
  it('capacidades: indisponível só nos planos com fala; o prompt é só o lugar', () => {
    const caps = videoCapabilitiesText({ cameraCount: 1 });
    expect(caps).toMatch(/Andar, levantar[^\n]*\[INDISPONÍVEL \(nos planos com fala\)\]/);
    expect(caps).toMatch(/cinematic\.prompt descreve só o LUGAR/);
    expect(caps).toMatch(/≈ 1,2 s a 10 s/);
    expect(videoCapabilitiesText({ cameraCount: 1, voiceProvider: 'heygen' })).toMatch(/voz do ElevenLabs/);
  });
});

describe('directScenes: robustez', () => {
  it('fala longa demais nem vai ao modelo (erro "escreva a narration")', async () => {
    const long = Array.from({ length: 320 }, (_, i) => `w${i}`).join(' ') + '.';
    const fake = createTemplateFakeAdapter();
    const r = await directScenes({ primary: fake }, { ...baseArgs, scenes: [target('longa', long, { hasNarration: false }), target('ok', 'Uma fala curta e simples para o plano. Outra frase aqui.')] });
    expect(r.errors).toEqual([{ nodeId: 'longa', message: expect.stringMatching(/fala longa demais \(320 palavras; máximo 312.*escreva a narration/) }]);
    expect(r.scenes.map((s) => s.nodeId)).toEqual(['ok']);
    expect(fake.calls[0]!.input).not.toMatch(/<cena id="longa"/);
    expect(r.meta.instructionsVersion).toBe(DIRECTION_INSTRUCTIONS_VERSION);
  });

  it('resposta fora do schema motiva reparo; um lote que falha não derruba os outros', async () => {
    const scenes = Array.from({ length: 9 }, (_, i) => target(`c${i}`, `Fala da cena ${i}. Segunda frase da cena ${i}.`));
    let call = 0;
    const tpl = createTemplateFakeAdapter();
    const fake = new FakeLlmAdapter({
      scene_direction: (req: StructuredRequest<unknown>) => (++call === 1 ? { scenes: 'quebrado' } : call === 2 ? (() => { throw new LlmError('fake', 'server', 'caiu'); })() : tpl.generateStructured(req as never).then((r) => r.output)),
      scene_direction_repair: (req: StructuredRequest<unknown>) => templateDirection(req),
    });
    const r = await directScenes({ primary: fake }, { ...baseArgs, scenes });
    // lote 1 (8 cenas): ilegível -> reparo ok; lote 2 (1 cena): erro do provedor -> erro da cena, sem exceção
    expect(fake.calls.map((c) => c.task)).toEqual(['scene_direction', 'scene_direction_repair', 'scene_direction']);
    expect(r.scenes).toHaveLength(8);
    expect(r.errors).toEqual([{ nodeId: 'c8', message: expect.stringMatching(/falha ao chamar o modelo/) }]);
    expect(fake.calls[1]!.input).toMatch(/não validou contra o formato/);
  });

  it('orçamento de cenas em movimento é descontado entre lotes', async () => {
    const ARRIVE = 'Terça de manhã, você chega ao prédio da empresa com calma.';
    const scenes = Array.from({ length: 9 }, (_, i) => target(`c${i}`, `${ARRIVE} O que você diria primeiro?`, { type: 'scenario', position: i }));
    const fake = new FakeLlmAdapter({
      scene_direction: (req: StructuredRequest<unknown>) => ({ scenes: [...req.input.matchAll(/<cena id="([^"]+)"/g)].map((m) => ({ nodeId: m[1]!, intent: '', shots: [shot({ id: 's1', line: ARRIVE, layout: 'cinematic', cinematic: { action: 'walk_toward_camera', prompt: 'a long clear sidewalk', setting: null } }), shot({ id: 's2', line: 'O que você diria primeiro?', framing: 'close' })] })) }),
      scene_direction_repair: () => ({ scenes: [] }),
    });
    const r = await directScenes({ primary: fake }, { ...baseArgs, scenes, style: { ...baseArgs.style, maxCinematicPerLesson: 2 } });
    const cine = r.scenes.flatMap((s) => s.direction.shots).filter((s) => s.layout === 'cinematic');
    expect(cine).toHaveLength(2);
    // o segundo lote já recebe o orçamento esgotado
    expect(fake.calls[1]!.input).toMatch(/cenas em movimento: DESLIGADAS/);
  });

  it('conversão por limite: fala > 26 palavras vira dois planos válidos; nunca emite plano inválido', () => {
    const long = 'Terça de manhã, você chega ao prédio da empresa com quinze minutos de folga, ajeita a mochila no ombro e respira fundo antes de entrar pela porta principal.';
    const ask = 'O que você diria primeiro?';
    const t = target('c1', `${long} ${ask}`, { type: 'scenario' });
    const d = SceneDirectionSchema.parse({ source: 'ai', shots: [{ id: 's1', line: long, layout: 'cinematic', cinematic: { action: 'walk_across', prompt: 'x' } }, { id: 's2', line: ask, framing: 'close', motionPrompt: 'leans in slightly, curious' }] });
    const r = enforceCinematicLessonCap([{ nodeId: 'c1', direction: d }], 0, { targets: [t], cameras: [] });
    expect(r.errors).toEqual([]);
    const shots = r.scenes[0]!.direction.shots;
    expect(shots.map((s) => s.layout)).toEqual(['presenter', 'presenter', 'presenter']);
    expect(shots.map((s) => s.id)).toEqual(['s1', 's1b', 's2']);
    expect(directionNarration(r.scenes[0]!.direction)).toBe(`${long} ${ask}`);
    expect(shots[0]!.line.endsWith(',')).toBe(true);
    expect(r.warnings[0]!.message).toMatch(/convertido em apresentador \(medium \+ close\)/);
    expect(splitLineInTwo('um dois três quatro cinco seis')).toEqual(['um dois três', 'quatro cinco seis']);
  });
});

describe('roteiro: gestos com dedos e mídia desatualizada', () => {
  const lesson = allLessons(comunicacaoPrimeiroEmprego)[0]!;
  it('scriptToGraph descarta gestos com dedos/sinais', () => {
    const script = graphToScript(lesson.graph);
    script.scenes[0]!.motionPrompt = 'points at the camera, firm';
    script.scenes[1]!.motionPrompt = 'nods slowly, warm';
    const g = scriptToGraph(script);
    expect(g.nodes[0]).not.toHaveProperty('motionPrompt');
    expect((g.nodes[1] as { motionPrompt?: string }).motionPrompt).toBe('nods slowly, warm');
  });
  it('applyScriptToGraph marca a mídia como desatualizada quando a fala (ou o texto lido) muda', () => {
    const original: LessonGraph = structuredClone(lesson.graph);
    const [a, b] = directionTargetsFromGraph(original);
    for (const id of [a!.nodeId, b!.nodeId]) (original.nodes.find((n) => n.id === id) as { media?: unknown }).media = { assetId: `ast_${id}`, kind: 'video' };
    // a cena a tem direção que cobre o texto da tela (sem narration)
    (original.nodes.find((n) => n.id === a!.nodeId) as { direction?: unknown }).direction = SceneDirectionSchema.parse({ shots: [{ id: 's1', line: a!.narration }] });
    const script = graphToScript(original);
    const sb = script.scenes.find((s) => s.id === b!.nodeId)!;
    sb.text = `${sb.text} Uma frase nova.`;
    const next = applyScriptToGraph(original, script);
    const na = next.nodes.find((n) => n.id === a!.nodeId) as { media?: { stale?: boolean }; direction?: unknown };
    const nb = next.nodes.find((n) => n.id === b!.nodeId) as { media?: { stale?: boolean } };
    expect(na.media?.stale).toBeUndefined();
    expect(na.direction).toBeDefined(); // direção comparada com o texto da tela
    expect(nb.media?.stale).toBe(true);
  });
  it('revisão restrita a cenas: o resto volta idêntico', async () => {
    const script = graphToScript(lesson.graph);
    const only = script.scenes.find((s) => s.type === 'consequence')!.id;
    const fake = new FakeLlmAdapter({ revise_lesson: (req: StructuredRequest<unknown>) => {
      expect(req.input).toMatch(new RegExp(`Altere SÓ a cena "[^"]+" \\(${only}\\)`));
      return { rationale: 'x', scenes: script.scenes.map((s) => ({ ...s, title: `${s.title} (mudou)`.slice(0, 120) })) } satisfies LessonScript;
    } });
    const args = {
      title: 'C', brief: {}, objectives: comunicacaoPrimeiroEmprego.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion })),
      lesson: { id: lesson.id, title: lesson.title, description: '', family: lesson.family, estimatedMinutes: 10, objectiveIds: lesson.objectiveIds }, otherLessons: [], sourcesExcerpt: '',
    };
    const r = await reviseLesson({ primary: fake }, { ...args, graph: lesson.graph, nodeIds: [only] });
    const changed = r.script.scenes.filter((s) => s.title.endsWith('(mudou)')).map((s) => s.id);
    expect(changed).toEqual([only]);
    expect(restrictScriptToScenes(script, { rationale: '', scenes: [] }, new Set([only])).scenes).toEqual(script.scenes);
  });
});

/* ------------------------------------------------------------------ */
/* Assistente                                                           */
/* ------------------------------------------------------------------ */

const COURSE = 'crs_1';
const L1 = 'aula_negociar_prazo';
const clone = (): CourseDocument => structuredClone(comunicacaoPrimeiroEmprego);
const pa = (over: Partial<AssistantProposalAction>): AssistantProposalAction => ({
  kind: 'revise_lesson', label: 'x', description: 'y', lessonId: null, nodeId: null, nodeIds: null, includeVideo: null, focus: null, instruction: null, pace: null, useSlides: null, maxCinematicPerLesson: null, href: null, angle: null, framing: null, extra: null, ...over,
});
const lessonCtx: AssistantContext = { screen: 'storyboard', lessonId: L1 };
async function demo(message: string, context: AssistantContext, doc: CourseDocument = comunicacaoPrimeiroEmprego, history?: Array<{ role: 'user' | 'assistant'; text: string }>) {
  return (await assistantTurn({ primary: createTemplateFakeAdapter() }, { doc, courseId: COURSE, context, message, history })).reply;
}

describe('assistente: guarda das ações pagas', () => {
  it('exige verbo de geração + objeto; rejeita negação e "criar"', () => {
    expect(paidIntent('Gere os vídeos desta aula')).toEqual({ videos: true, angle: false });
    expect(paidIntent('pode regerar o vídeo?')).toEqual({ videos: true, angle: false });
    expect(paidIntent('Atualize os vídeos')).toEqual({ videos: true, angle: false });
    expect(paidIntent('Refaça a câmera de perfil')).toEqual({ videos: false, angle: true });
    expect(paidIntent('não gere os vídeos ainda')).toEqual({ videos: false, angle: false });
    expect(paidIntent('sem gerar vídeos por enquanto')).toEqual({ videos: false, angle: false });
    expect(paidIntent('crie os vídeos')).toEqual({ videos: false, angle: false });
    expect(paidIntent('o plano geral do vídeo está bom')).toEqual({ videos: false, angle: false });
    expect(paidIntent('o vídeo está atualizado?')).toEqual({ videos: false, angle: false });
    expect(paidIntent('gere os vídeos').angle).toBe(false);
  });
  it('confirmação curta só vale se o cartão pago foi oferecido no turno anterior', () => {
    const offered = assistantHistoryText('Posso gerar 3 vídeos. É pago.', [{ kind: 'generate_videos', params: { lessonId: L1, nodeIds: ['a', 'b', 'c'] } }]);
    expect(offered).toMatch(/\[cartões: generate_videos\(3 cenas\)\]$/);
    expect(offeredCardKinds(offered)).toEqual(['generate_videos']);
    const history = [{ role: 'user' as const, text: 'quero vídeos' }, { role: 'assistant' as const, text: offered }];
    expect(isShortConfirmation('Sim')).toBe(true);
    expect(isShortConfirmation('não')).toBe(false);
    expect(paidActionAllowed('generate_videos', 'sim', history)).toBe(true);
    expect(paidActionAllowed('generate_videos', 'pode gerar', history)).toBe(true);
    expect(paidActionAllowed('generate_angle', 'sim', history)).toBe(false);
    expect(paidActionAllowed('generate_videos', 'sim', [])).toBe(false);
    const action = { kind: 'generate_videos', cost: 'paid', label: 'x', description: 'y', params: { lessonId: L1, nodeIds: ['decisao_prazo'] } };
    expect(sanitizeActions([action], comunicacaoPrimeiroEmprego, { message: 'confirmo', history }).actions).toHaveLength(1);
    expect(sanitizeActions([action], comunicacaoPrimeiroEmprego, { message: 'confirmo' }).dropped[0]!.reason).toMatch(/pedido explícito/);
  });
  it('demonstração: "sim" depois do cartão repete o cartão pago; cenas gerando ficam de fora', async () => {
    const first = await demo('Gere os vídeos desatualizados', lessonCtx);
    expect(first.actions[0]!.kind).toBe('generate_videos');
    const history = [{ role: 'user' as const, text: 'Gere os vídeos desatualizados' }, { role: 'assistant' as const, text: assistantHistoryText(first.reply, first.actions) }];
    const again = await demo('sim', lessonCtx, comunicacaoPrimeiroEmprego, history);
    expect(again.actions[0]).toMatchObject({ kind: 'generate_videos', params: { lessonId: L1 } });
    const ids = (first.actions[0]!.kind === 'generate_videos' && first.actions[0]!.params.nodeIds) || [];
    const r = await assistantTurn({ primary: createTemplateFakeAdapter() }, { doc: comunicacaoPrimeiroEmprego, courseId: COURSE, context: lessonCtx, message: 'gere os vídeos', mediaQueue: [{ lessonId: L1, nodeId: ids[0]!, status: 'running' }] });
    expect(r.reply.actions[0]!.kind === 'generate_videos' && r.reply.actions[0]!.params.nodeIds).not.toContain(ids[0]);
    expect((await demo('não gere os vídeos', lessonCtx)).actions.every((a) => a.cost !== 'paid')).toBe(true);
  });
});

describe('assistente: rotas, nodeIds nulos e explicação', () => {
  it('rotas reais em <curso>; generate_videos com nodeIds null vira desatualizados + sem vídeo', async () => {
    const summary = buildAssistantContext(comunicacaoPrimeiroEmprego, lessonCtx, { courseId: COURSE });
    const input = buildAssistantInput({ summary, context: lessonCtx, message: 'oi', capabilities: 'cap' });
    expect(input).toContain(`rotas (use exatamente estes href em open):`);
    expect(input).toContain(`/estudio/cursos/${COURSE}/aulas/${L1}`);
    expect(input).toContain(`/estudio/cursos/${COURSE}/montar?passo=apresentacao`);
    expect(input).toContain(`/estudio/cursos/${COURSE}/producao`);
    const fake = new FakeLlmAdapter({ assistant_turn: { reply: 'Preparei.', actions: [pa({ kind: 'generate_videos', lessonId: L1, nodeIds: null })] } });
    const r = await assistantTurn({ primary: fake }, { doc: comunicacaoPrimeiroEmprego, courseId: COURSE, context: lessonCtx, message: 'gere os vídeos desatualizados' });
    expect(r.reply.actions[0]!.kind === 'generate_videos' && r.reply.actions[0]!.params.nodeIds).toHaveLength(9);
  });
  it('quando todas as ações caem, a resposta explica por quê', async () => {
    const fake = new FakeLlmAdapter({ assistant_turn: { reply: 'Preparei o cartão.', actions: [pa({ kind: 'generate_videos', lessonId: L1, nodeIds: ['decisao_prazo'] })] } });
    const r = await assistantTurn({ primary: fake }, { doc: comunicacaoPrimeiroEmprego, courseId: COURSE, context: lessonCtx, message: 'que tal os vídeos?' });
    expect(r.reply.actions).toEqual([]);
    expect(r.reply.reply).toMatch(/^Preparei o cartão\. Não deixei o cartão pago: ações pagas só saem com um pedido explícito/);
    expect(droppedExplanation([{ kind: 'x', reason: 'aula inexistente' }])).toMatch(/Não encontrei a aula/);
  });
  it('regras do sistema: escopo, HeyGen x ElevenLabs, 0 a 6, sem "cria"', () => {
    expect(ASSISTANT_INSTRUCTIONS_VERSION).toBe('2026-10-25.1');
    expect(SYSTEM_ASSISTANT).toMatch(/de 0 a 6/);
    expect(SYSTEM_ASSISTANT).toMatch(/voz for do HeyGen[^\n]*ElevenLabs/);
    expect(SYSTEM_ASSISTANT).toMatch(/"esta fala", "esta cena"/);
    expect(SYSTEM_ASSISTANT).toMatch(/Abra com uma cena em movimento/);
  });
});

describe('assistente (demonstração): escopo e novas intenções', () => {
  const lesson = allLessons(comunicacaoPrimeiroEmprego).find((l) => l.id === L1)!;
  const first = directionTargetsFromGraph(lesson.graph)[0]!;
  it('escopo pelas palavras', () => {
    expect(messageScope(normalizeText('Reescreva esta fala mais curta'))).toBe('scene');
    expect(messageScope(normalizeText('Deixe a aula mais dinâmica'))).toBe('lesson');
    expect(messageScope(normalizeText('Use close nas perguntas'))).toBeNull();
  });
  it('cena em foco + "a aula" => aula inteira; "esta fala" => só a cena (nodeIds)', async () => {
    const ctx = { ...lessonCtx, nodeId: 'decisao_prazo' };
    const dyn = await demo('Deixe a aula mais dinâmica', ctx);
    expect(dyn.actions[0]).toMatchObject({ kind: 'direct_lesson', params: { lessonId: L1 } });
    expect(dyn.actions[0]!.kind === 'direct_lesson' && dyn.actions[0]!.params.nodeIds).toBeUndefined();
    const rev = await demo('Reescreva esta fala mais curta', ctx);
    expect(rev.actions[0]).toMatchObject({ kind: 'revise_lesson', params: { lessonId: L1, focus: 'shorten', nodeIds: ['decisao_prazo'] } });
    expect(rev.actions[0]!.kind === 'revise_lesson' && rev.actions[0]!.params.instruction).toMatch(/Altere SÓ a cena .*\(decisao_prazo\)/);
    const plan = planExecution(rev.actions[0]!, comunicacaoPrimeiroEmprego);
    expect(plan).toMatchObject({ kind: 'enqueue', task: 'revise_lesson', nodeIds: ['decisao_prazo'] });
    // gerar vídeos com cena em foco: aula toda, salvo "esta cena"
    const all = await demo('Gere os vídeos desatualizados', ctx);
    expect(all.actions[0]!.kind === 'generate_videos' && all.actions[0]!.params.nodeIds.length).toBeGreaterThan(1);
    const one = await demo('Gere o vídeo desta cena', ctx);
    expect(one.actions[0]).toMatchObject({ kind: 'generate_videos', params: { nodeIds: ['decisao_prazo'] } });
  });
  it('"faz ela andar na abertura" => direct_lesson da primeira cena (e liga a cena em movimento se estiver em 0)', async () => {
    const r = await demo('faz ela andar na abertura', lessonCtx);
    expect(r.actions).toEqual([expect.objectContaining({ kind: 'direct_lesson', params: { lessonId: L1, nodeIds: [first.nodeId], instruction: expect.stringMatching(/^Abra com uma cena em movimento/) } })]);
    const off = clone();
    off.presentation.directionStyle.maxCinematicPerLesson = 0;
    const r2 = await demo('coloca uma cena em movimento', lessonCtx, off);
    expect(r2.actions.map((a) => a.kind)).toEqual(['update_direction_style', 'direct_lesson']);
    expect(r2.actions[0]).toMatchObject({ params: { maxCinematicPerLesson: 1 } });
    const heygen = clone();
    heygen.presentation.voiceProvider = 'heygen';
    const r3 = await demo('faz ela andar na abertura', lessonCtx, heygen);
    expect(r3.reply).toMatch(/ElevenLabs/);
    expect(r3.actions.map((a) => a.kind)).toEqual(['open']);
  });
  it('"dirija a cena <título>" acha a cena pelo título (sem acentos/caixa)', async () => {
    const scene = lesson.graph.nodes.find((n) => n.id === 'decisao_prazo')!;
    const title = (scene.title ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const r = await demo(`dirija a cena ${title}`, lessonCtx);
    expect(r.actions[0]).toMatchObject({ kind: 'direct_lesson', params: { lessonId: L1, nodeIds: ['decisao_prazo'] } });
    expect((await demo('dirija a cena que não existe xyz', lessonCtx)).actions).toEqual([]);
  });
});

describe('próximos passos: falas conforme o ponto de vista', () => {
  it('presenter => falas na voz de quem apresenta', () => {
    const doc = clone();
    doc.brief.narrativeVoice = 'presenter';
    const step = computeNextSteps(doc, { courseId: COURSE }).find((s) => s.id === `narration-${L1}`)!;
    expect(step.action!.kind === 'revise_lesson' && step.action!.params.instruction).toMatch(/1ª pessoa/);
    expect(step.action!.kind === 'revise_lesson' && step.action!.params.instruction).not.toMatch(/2ª pessoa/);
  });
});

describe('schema dos gráficos com texto rico', () => {
  it('richTextFromPlain continua importável (sanidade)', () => {
    expect(richTextFromPlain('a').type).toBe('doc');
  });
});
