import { describe, expect, it } from 'vitest';
import { allLessons, comunicacaoPrimeiroEmprego } from '@lms/course-schema';
import {
  EVALUATE_TEXT_TASK, EVALUATE_VIDEO_TASK, FakeLlmAdapter, MAX_VIDEOS_PER_RUN, QUALITY_DIMENSIONS, QualityScorecardSchema, SYSTEM_EVALUATOR, SYSTEM_VIDEO_EVALUATOR, TASK_EVALUATE, TEXT_DIMENSIONS, VIDEO_DIMENSIONS,
  aggregateScorecards, assistantTurn, buildScorecard, buildVideoEvaluateInput, computeNextSteps, createTemplateFakeAdapter, demoTextEvaluation, demoVideoEvaluation, evaluateLessonText, evaluateVideo, framePlan, graphToScript, pacingMetrics, parseVtt, planExecution, scorecardIsStale, voiceFromMetrics,
  type AssistantAction, type LessonScene, type LessonScript, type QualityScorecard, type TextEvaluationProposal, type VideoEvaluationProposal,
} from '../src';
import * as client from '../src/client';

const scene = (over: Partial<LessonScene> & Pick<LessonScene, 'id' | 'type'>): LessonScene => ({
  title: over.id, text: '', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null, ...over,
});

/** Aula boa: mentor falando com você, consequências como feedback. */
function goodScript(): LessonScript {
  return {
    rationale: 'ok',
    scenes: [
      scene({ id: 'situacao', type: 'scenario', title: 'Situação', text: 'Terça, dez horas: Carla, a recrutadora, pergunta por que você quer esta vaga. Você precisa decidir como responder.', narration: 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga. O que você responde?', next: 'decisao' }),
      scene({ id: 'decisao', type: 'choice', title: 'O que você responde?', text: 'O que você responde a Carla?', options: [
        { id: 'generico', label: 'Dizer que a empresa é ótima.', feedback: '', next: 'c_generico', correct: false },
        { id: 'limite', label: 'Falar de um limite real, do impacto e de uma ação.', feedback: '', next: 'c_limite', correct: false },
        { id: 'decorado', label: 'Recitar a missão da empresa.', feedback: '', next: 'c_decorado', correct: false },
      ] }),
      scene({ id: 'c_generico', type: 'consequence', title: 'Genérico', text: 'Você respondeu de forma genérica e a conversa esfriou. Não funciona porque não mostra critério. Faça assim: ligue a vaga a algo que você já fez.', narration: 'Você foi genérico. Não funciona porque qualquer pessoa diria isso. Faça assim: conte um exemplo seu.', tone: 'negative', next: 'dica' }),
      scene({ id: 'c_limite', type: 'consequence', title: 'Limite real', text: 'Você respondeu com um limite real, o impacto e uma ação concreta. Funciona porque a recrutadora vê critério. Faça assim: nomeie o limite e proponha o próximo passo.', tone: 'positive', next: 'dica' }),
      scene({ id: 'c_decorado', type: 'consequence', title: 'Decorado', text: 'Você recitou o site e soou decorado. Funciona pela metade porque mostra preparo, mas não mostra você. Prefira ligar a missão a uma experiência sua.', tone: 'neutral', next: 'dica' }),
      scene({ id: 'dica', type: 'content', title: 'Dica', text: '- Leve dois exemplos seus anotados.\n- Ligue a vaga a algo que você já fez.\n- Termine com uma pergunta sobre o dia a dia.', next: 'fim' }),
      scene({ id: 'fim', type: 'end', title: 'Fim', text: 'Você praticou responder por que quer a vaga. Antes da próxima entrevista, anote dois exemplos seus.' }),
    ],
  };
}

/** A mesma aula com a saída ruim que motivou a avaliação (narra a entrevistadora). */
function badScript(): LessonScript {
  const s = goodScript();
  s.scenes = s.scenes.map((sc) => {
    if (sc.id === 'c_limite') return { ...sc, text: 'Carla anota e segue interessada. A resposta funciona porque mostra um limite profissional.', narration: '' };
    if (sc.id === 'c_generico') return { ...sc, text: 'Carla muda de assunto. Ela olha o relógio e passa para a próxima pergunta.', narration: '' };
    if (sc.id === 'decisao') return { ...sc, text: 'Carla espera. O que dizer? E como?' };
    return sc;
  });
  return s;
}

const CAST = [{ name: 'Carla', role: 'recrutadora', details: 'entrevista por vídeo' }];
const textArgs = { courseId: 'crs_1', lessonId: 'aula_1', lessonTitle: 'Responder por que quer a vaga', cast: CAST, brief: { tema: 'entrevista' }, family: 'decision_consequence' };

const VTT = `WEBVTT

1
00:00:00.500 --> 00:00:03.000
Terça, dez horas. A recrutadora pergunta

2
00:00:03.000 --> 00:00:05.500
por que você quer esta vaga.

3
00:00:09.000 --> 00:00:11.000
O que você responde?
`;

describe('schema do cartão de qualidade (cliente)', () => {
  it('dimensões, agregado e desatualização', () => {
    expect(QUALITY_DIMENSIONS).toHaveLength(11);
    expect([...TEXT_DIMENSIONS, ...VIDEO_DIMENSIONS].sort()).toEqual([...QUALITY_DIMENSIONS].sort());
    expect(client.QUALITY_DIMENSION_LABELS.voz_narrativa.label).toBe('Voz narrativa');
    const card: QualityScorecard = QualityScorecardSchema.parse({
      lessonId: 'a', revision: 3, overall: 4, summary: 'ok', findings: [], evaluatedAt: new Date().toISOString(),
      scores: Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, VIDEO_DIMENSIONS.includes(d) ? null : 4])),
      basis: { text: true, video: [], framesPerVideo: 0 },
    });
    expect(card.basis.skippedVideo).toEqual([]);
    expect(scorecardIsStale(card, 3)).toBe(false);
    expect(scorecardIsStale(card, 4)).toBe(true);
    expect(scorecardIsStale(null, 4)).toBe(false);
    const agg = aggregateScorecards([{ scorecard: card, stale: true }, { scorecard: { ...card, overall: 2, scores: { ...card.scores, conteudo: 2 } }, stale: false }, { scorecard: null, stale: false }]);
    expect(agg).toMatchObject({ evaluated: 2, lessons: 3, overall: 3, stale: 1 });
    expect(agg.byDimension.conteudo).toBe(3);
    expect(agg.byDimension.postura).toBeNull();
    // achados com ação do assistente
    expect(() => QualityScorecardSchema.parse({ ...card, findings: [{ dimension: 'voz_narrativa', severity: 'alta', scene: 'c_limite', evidence: 'x', problem: 'y', fix: 'z', action: { kind: 'revise_lesson', cost: 'ai', label: 'l', description: 'd', params: { lessonId: 'a', focus: 'teaching', instruction: 'i' } } }] })).not.toThrow();
  });
});

describe('avaliador de texto (demonstração: validadores)', () => {
  it('a aula boa tira notas altas sem achados de voz; a ruim derruba voz narrativa, conteúdo e decisões, com evidência e ação', () => {
    const good = demoTextEvaluation({ ...textArgs, script: goodScript() });
    expect(good.scores.voz_narrativa).toBe(5);
    expect(good.scores.conteudo).toBe(5);
    expect(good.scores.perguntas).toBe(5);
    expect(good.scores.decisoes).toBe(5);
    expect(good.findings.filter((f) => f.dimension === 'voz_narrativa')).toEqual([]);
    expect(good.summary).toMatch(/^\[demonstração\]/);

    const bad = demoTextEvaluation({ ...textArgs, script: badScript() });
    expect(bad.scores.voz_narrativa).toBeLessThanOrEqual(3);
    expect(bad.scores.conteudo).toBeLessThanOrEqual(3);
    expect(bad.scores.decisoes).toBeLessThanOrEqual(4);
    expect(bad.scores.perguntas).toBeLessThanOrEqual(3);
    const voice = bad.findings.find((f) => f.dimension === 'voz_narrativa' && f.scene === 'c_limite')!;
    expect(voice.severity).toBe('alta');
    expect(voice.evidence).toMatch(/Carla anota e segue interessada/);
    expect(voice.action).toMatchObject({ kind: 'revise_lesson', cost: 'ai', params: { lessonId: 'aula_1', focus: 'teaching', nodeIds: ['c_limite'] } });
    const teaching = bad.findings.find((f) => f.dimension === 'conteudo' && f.scene === 'c_generico')!;
    expect(teaching.problem).toMatch(/não ensina nada explícito/);
    expect(bad.findings.find((f) => f.dimension === 'perguntas')?.action).toMatchObject({ kind: 'revise_lesson', params: { focus: 'teaching', nodeIds: ['decisao'] } });
    // ações válidas no contrato do assistente
    for (const f of bad.findings) if (f.action) expect(client.AssistantActionSchema.safeParse(f.action).success).toBe(true);
  });

  it('evaluateLessonText em demonstração não chama o modelo; com resposta registrada, o validador limita as notas e completa os achados', async () => {
    const demo = await evaluateLessonText({ primary: createTemplateFakeAdapter() }, { ...textArgs, script: badScript() });
    expect(demo.meta.simulated).toBe(true);
    const lenient: TextEvaluationProposal = { scores: { conteudo: 5, voz_narrativa: 5, perguntas: 5, decisoes: 5, realismo: 4, fala: 4 }, summary: 'Boa aula.', findings: [{ dimension: 'realismo', severity: 'baixa', scene: 'situacao', evidence: '"Terça, dez horas"', problem: 'Falta a empresa.', fix: 'Cite a empresa da ficha.', suggestedAction: 'none' }, { dimension: 'fala', severity: 'baixa', scene: 'nao_existe', evidence: 'x', problem: 'y', fix: 'z', suggestedAction: 'revise_shorten' }] };
    const fake = new FakeLlmAdapter({ [EVALUATE_TEXT_TASK]: lenient });
    const r = await evaluateLessonText({ primary: fake }, { ...textArgs, script: badScript() });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.input).toMatch(/<validador>[\s\S]*THIRD_PERSON_NARRATION \[c_limite\]/);
    expect(fake.calls[0]!.input).toMatch(/<elenco>\n- Carla: recrutadora/);
    expect(fake.calls[0]!.input).toContain(TASK_EVALUATE);
    expect(r.meta.simulated).toBe(false);
    // o modelo deu 5, mas o validador achou terceira pessoa e cena que não ensina
    expect(r.scores.voz_narrativa).toBeLessThanOrEqual(3);
    expect(r.scores.conteudo).toBeLessThanOrEqual(3);
    expect(r.summary).toBe('Boa aula.');
    expect(r.findings.some((f) => f.dimension === 'voz_narrativa' && f.scene === 'c_limite')).toBe(true);
    // cena inexistente não entra como escopo; ação de encurtar vale para a aula
    const fala = r.findings.find((f) => f.dimension === 'fala')!;
    expect(fala.scene).toBeUndefined();
    expect(fala.action).toMatchObject({ kind: 'revise_lesson', params: { focus: 'shorten' } });
    expect(SYSTEM_EVALUATOR).toMatch(/Terceira pessoa:/);
    expect(SYSTEM_EVALUATOR).toMatch(/"Ensina\?"/);
  });
});

describe('métricas de voz a partir das legendas', () => {
  it('parseVtt + pacingMetrics: palavras/s, maior silêncio, cobertura e áudio terminando cedo', () => {
    const cues = parseVtt(VTT);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toMatchObject({ start: 0.5, end: 3, text: 'Terça, dez horas. A recrutadora pergunta' });
    const expected = 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga. O que você responde?';
    const m = pacingMetrics(cues, { videoSeconds: 14, expectedWords: expected.split(' ').length, approx: true });
    expect(m.words).toBe(16);
    expect(m.speechSeconds).toBe(10.5);
    expect(m.wordsPerSecond).toBe(1.52);
    expect(m.maxSilenceSeconds).toBe(3.5);
    expect(m.maxSilenceAt).toBe(5.5);
    expect(m.coverage).toBe(1);
    expect(m.truncated).toBe(false);
    expect(m.tailSilenceSeconds).toBe(3);
    expect(m.audioEndsEarly).toBe(true);
    const v = voiceFromMetrics(m, 'situacao');
    expect(v.score).toBe(1); // lento (−2), silêncio (−1), termina cedo (−1)
    expect(v.findings.map((f) => f.dimension)).toEqual(['voz', 'voz', 'voz']);
    expect(v.findings[0]!.evidence).toMatch(/1,5 palavras\/s/);
    expect(v.findings[1]!.evidence).toMatch(/silêncio de 3,5 s aos 5,5 s/);
    // truncado: legendas cobrem menos de 90% da fala
    const t = pacingMetrics(cues.slice(0, 2), { videoSeconds: 6, expectedWords: 40 });
    expect(t.truncated).toBe(true);
    expect(voiceFromMetrics(t, 'x').findings.some((f) => /cortado/.test(f.problem))).toBe(true);
    // ritmo bom, sem silêncios: nota 5
    const ok = pacingMetrics([{ start: 0.3, end: 10.3, text: Array.from({ length: 26 }, () => 'palavra').join(' ') }], { videoSeconds: 10.8, expectedWords: 26 });
    expect(ok.wordsPerSecond).toBe(2.6);
    expect(voiceFromMetrics(ok, 'x')).toMatchObject({ score: 5, findings: [] });
    expect(voiceFromMetrics(null, 'x').score).toBeNull();
  });

  it('framePlan: 10/35/60/85% com o plano de cada quadro e um quadro extra por cena em movimento', () => {
    const direction = { shots: [{ id: 's1', line: 'Terça, dez horas, o escritório ainda está vazio.', layout: 'cinematic' as const, framing: 'medium' as const }, { id: 's2', line: Array.from({ length: 24 }, () => 'palavra').join(' '), layout: 'presenter' as const, framing: 'medium' as const }] } as never;
    const plan = framePlan(20, direction, '');
    expect(plan.map((p) => p.position)).toContain(0.1);
    expect(plan.find((p) => p.cinematic)).toMatchObject({ shotId: 's1' });
    expect(plan.filter((p) => p.shotId === 's2').length).toBeGreaterThanOrEqual(2);
    expect(framePlan(10, null, 'fala').map((p) => p.atSeconds)).toEqual([1, 3.5, 6, 8.5]);
  });
});

describe('avaliador de vídeo', () => {
  const frames = [0.1, 0.35, 0.6, 0.85].map((p) => ({ mime: 'image/jpeg' as const, base64: 'AAAA', atSeconds: p * 12, position: p, shotId: p < 0.5 ? 's1' : 's2' }));
  const videoArgs = { courseId: 'crs_1', lessonId: 'aula_1', nodeId: 'situacao', title: 'Situação', type: 'scenario', narration: 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga.', direction: { shots: [{ id: 's1', line: 'Terça, dez horas.', framing: 'wide', layout: 'presenter' }, { id: 's2', line: 'A recrutadora pergunta por que você quer esta vaga.', framing: 'close', layout: 'presenter' }] } as never, frames, metrics: pacingMetrics(parseVtt(VTT), { videoSeconds: 14, expectedWords: 16 }), voice: { provider: 'elevenlabs', model: 'eleven_v4', stability: 0.35 } };

  it('demonstração: notas 4 com aviso, voz pelas métricas; nenhuma chamada', async () => {
    const d = demoVideoEvaluation(videoArgs);
    expect(d.scores).toMatchObject({ postura: 4, aparencia: 4, fundo: 4, realismo_visual: 4 });
    expect(d.scores.voz).toBeLessThanOrEqual(2);
    expect(d.findings.some((f) => f.dimension === 'realismo_visual' && /Demonstração/.test(f.problem))).toBe(true);
    const r = await evaluateVideo({ primary: createTemplateFakeAdapter() }, videoArgs);
    expect(r.meta.simulated).toBe(true);
    expect(r.frames).toBe(4);
  });

  it('com modelo: envia os quadros como imagens rotuladas e liga achados a planos e ações', async () => {
    const proposal: VideoEvaluationProposal = { scores: { postura: 3, aparencia: 5, fundo: 4, voz: 5, realismo_visual: 2 }, summary: 'Mão deformada no quadro 3.', findings: [
      { dimension: 'realismo_visual', severity: 'alta', frame: 3, shot: null, evidence: 'dedos fundidos na mão direita', problem: 'Artefato na mão.', fix: 'Gerar o vídeo de novo.', suggestedAction: 'regenerate_video' },
      { dimension: 'postura', severity: 'média', frame: null, shot: 's1', evidence: 'quadro 1/4, 10%, plano s1: mesmo gesto do quadro 2', problem: 'Gesto repetido.', fix: 'Variar o gesto por plano.', suggestedAction: 'redirect_scene' },
      { dimension: 'fundo', severity: 'baixa', frame: null, shot: null, evidence: 'estante ao fundo', problem: 'Fundo carregado.', fix: 'Trocar o fundo da apresentação.', suggestedAction: 'update_style' },
    ] };
    const fake = new FakeLlmAdapter({ [EVALUATE_VIDEO_TASK]: proposal });
    const r = await evaluateVideo({ primary: fake }, videoArgs);
    expect(fake.calls[0]).toMatchObject({ task: EVALUATE_VIDEO_TASK, images: 4 });
    const input = fake.calls[0]!.input;
    expect(input).toMatch(/<metricas>[\s\S]*1,5 palavras\/s/);
    expect(input).toMatch(/- quadro 3\/4 · 7,2 s · 60% · plano s2/);
    expect(input).toMatch(/voz: elevenlabs \(eleven_v4\), estabilidade 0.35/);
    expect(buildVideoEvaluateInput(videoArgs)).toContain('<direcao>');
    expect(SYSTEM_VIDEO_EVALUATOR).toMatch(/postura:/);
    const art = r.findings.find((f) => f.dimension === 'realismo_visual')!;
    expect(art.shot).toBe('s2');
    expect(art.evidence).toMatch(/^quadro 3\/4 · 7,2 s · 60% · plano s2: dedos fundidos/);
    expect(art.action).toMatchObject({ kind: 'generate_videos', cost: 'paid', params: { lessonId: 'aula_1', nodeIds: ['situacao'] } });
    expect(r.findings.find((f) => f.dimension === 'postura')!.action).toMatchObject({ kind: 'direct_lesson', params: { nodeIds: ['situacao'] } });
    expect(r.findings.find((f) => f.dimension === 'fundo')!.action).toMatchObject({ kind: 'open', params: { href: '/estudio/cursos/crs_1/montar?passo=apresentacao' } });
    // a voz vem das métricas: o modelo deu 5, as métricas dizem 1
    expect(r.scores.voz).toBe(1);
    expect(r.findings.filter((f) => f.dimension === 'voz').length).toBeGreaterThanOrEqual(2);
  });

  it('provedor sem visão recebe erro claro', async () => {
    const noVision = new FakeLlmAdapter({ [EVALUATE_VIDEO_TASK]: {} });
    (noVision as { capabilities: { vision?: boolean } }).capabilities = { ...noVision.capabilities, vision: false };
    await expect(evaluateVideo({ primary: noVision }, videoArgs)).rejects.toThrow(/não aceita imagens/);
  });
});

describe('cartão final', () => {
  it('buildScorecard funde texto e vídeos; sem vídeos, dimensões de vídeo nulas; limite por execução', async () => {
    const text = await evaluateLessonText({ primary: createTemplateFakeAdapter() }, { ...textArgs, script: badScript() });
    const noVideo = buildScorecard({ lessonId: 'aula_1', revision: 7, text, videos: [], videoDisabled: true });
    expect(noVideo.scores.postura).toBeNull();
    expect(noVideo.basis).toMatchObject({ text: true, video: [], framesPerVideo: 0, simulated: true });
    expect(noVideo.summary).toMatch(/Vídeos não avaliados nesta execução\.$/);
    expect(noVideo.revision).toBe(7);
    const video = await evaluateVideo({ primary: createTemplateFakeAdapter() }, { courseId: 'crs_1', lessonId: 'aula_1', nodeId: 'situacao', title: 'S', type: 'scenario', narration: 'x', frames: [{ mime: 'image/jpeg', base64: 'AA', atSeconds: 1, position: 0.1 }], metrics: null });
    const card = buildScorecard({ lessonId: 'aula_1', revision: 7, text, videos: [video], skippedVideo: [{ nodeId: 'decisao', reason: 'limite' }] });
    expect(card.scores.postura).toBe(4);
    expect(card.scores.voz).toBe(4);
    expect(card.basis.video).toEqual(['situacao']);
    expect(card.basis.skippedVideo).toEqual(['decisao']);
    expect(card.summary).toMatch(/Vídeo: 1 cena avaliada \(1 quadros cada\); 1 fora do limite/);
    expect(card.findings.length).toBeLessThanOrEqual(20);
    expect(card.findings[0]!.severity).toBe('alta');
    expect(card.overall).toBeGreaterThanOrEqual(1);
    expect(MAX_VIDEOS_PER_RUN).toBe(8);
  });
});

describe('assistente e próximos passos', () => {
  const doc = comunicacaoPrimeiroEmprego;
  const L1 = allLessons(doc)[0]!.id;
  it('"avalie a aula" => cartão evaluate_lesson; planExecution enfileira evaluate_lesson', async () => {
    const r = await assistantTurn({ primary: createTemplateFakeAdapter() }, { doc, courseId: 'crs_1', context: { screen: 'storyboard', lessonId: L1 }, message: 'Avalie a qualidade desta aula' });
    expect(r.reply.actions).toHaveLength(1);
    expect(r.reply.actions[0]).toMatchObject({ kind: 'evaluate_lesson', cost: 'ai', params: { lessonId: L1 } });
    expect(planExecution(r.reply.actions[0]!, doc)).toEqual({ kind: 'enqueue', task: 'evaluate_lesson', lessonId: L1, includeVideo: true });
    const onlyText = await assistantTurn({ primary: createTemplateFakeAdapter() }, { doc, courseId: 'crs_1', context: { screen: 'storyboard', lessonId: L1 }, message: 'Qual a nota desta aula, só o texto?' });
    expect(onlyText.reply.actions[0]).toMatchObject({ kind: 'evaluate_lesson', params: { lessonId: L1, includeVideo: false } });
    const noLesson = await assistantTurn({ primary: createTemplateFakeAdapter() }, { doc, courseId: 'crs_1', context: { screen: 'course' }, message: 'avalia o curso' });
    expect(noLesson.reply.actions[0]).toMatchObject({ kind: 'open' });
    const action: AssistantAction = { kind: 'evaluate_lesson', cost: 'ai', label: 'x', description: 'y', params: { lessonId: 'nao_existe' } };
    expect(planExecution(action, doc)).toMatchObject({ kind: 'reject', status: 404 });
  });

  it('próximos passos: "Avaliar a aula" sem cartão ou desatualizado; achados viram passos com nota ≤ 3', () => {
    const base = { courseId: 'crs_1', draftRevision: 5 };
    const none = computeNextSteps(doc, { ...base, quality: {} });
    expect(none.find((s) => s.id === `evaluate-${L1}`)).toMatchObject({ severity: 'recommended', action: { kind: 'evaluate_lesson', params: { lessonId: L1 } } });
    // sem a opção quality, nada muda
    expect(computeNextSteps(doc, { courseId: 'crs_1' }).some((s) => s.id.startsWith('evaluate-'))).toBe(false);
    const finding = { dimension: 'voz_narrativa' as const, severity: 'alta' as const, scene: 'cons_aceita', evidence: '"Renata responde"', problem: 'Narra a gestora.', fix: 'Fale com você.', action: { kind: 'revise_lesson' as const, cost: 'ai' as const, label: 'Corrigir', description: 'd', params: { lessonId: L1, focus: 'teaching', instruction: 'i', nodeIds: ['cons_aceita'] } } };
    const card: QualityScorecard = QualityScorecardSchema.parse({ lessonId: L1, revision: 5, overall: 2, summary: 's', findings: [finding], evaluatedAt: new Date().toISOString(), scores: Object.fromEntries(QUALITY_DIMENSIONS.map((d) => [d, VIDEO_DIMENSIONS.includes(d) ? null : 2])), basis: { text: true, video: [], framesPerVideo: 0 } });
    const low = computeNextSteps(doc, { ...base, quality: { [L1]: card }, lessonId: L1 });
    expect(low.find((s) => s.id === `quality-${L1}-0`)).toMatchObject({ severity: 'recommended', title: expect.stringMatching(/^Qualidade 2\/5 em /), action: finding.action });
    expect(low.some((s) => s.id === `evaluate-${L1}`)).toBe(false);
    const stale = computeNextSteps(doc, { ...base, draftRevision: 6, quality: { [L1]: card }, lessonId: L1 });
    expect(stale.find((s) => s.id === `evaluate-${L1}`)?.detail).toMatch(/mudou depois da última avaliação/);
    const good = computeNextSteps(doc, { ...base, quality: { [L1]: { ...card, overall: 5 } }, lessonId: L1 });
    expect(good.some((s) => s.id.startsWith('quality-') || s.id === `evaluate-${L1}`)).toBe(false);
  });

  it('a revisão demo da aula do curso-exemplo em voz de ensino sobe a nota de voz narrativa', () => {
    const l = allLessons(doc)[0]!;
    const before = demoTextEvaluation({ ...textArgs, lessonId: l.id, cast: doc.cast, script: graphToScript(l.graph) });
    expect(before.scores.voz_narrativa).toBeLessThan(5);
    expect(before.findings.some((f) => f.action?.kind === 'revise_lesson' && (f.action.params as { focus?: string }).focus === 'teaching')).toBe(true);
  });
});
