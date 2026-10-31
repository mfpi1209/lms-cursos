import { describe, expect, it } from 'vitest';
import { compileLesson } from '@lms/course-schema';
import { FakeLlmAdapter, LlmError, aiConfigFromEnv, createTemplateFakeAdapter, generateLesson, generateWithFallback, proposeOutline, scriptToGraph, type LessonScript } from '../src';

const goodScript: LessonScript = {
  rationale: 'Exemplo fictício de negociação de prazo.',
  scenes: [
    { id: 'decisao', type: 'choice', title: 'O pedido', text: 'O que você vai treinar: negociar um prazo sem esconder o risco\n\nSua gestora pede a planilha para amanhã. O que você faz?', narration: '', motionPrompt: '', objectiveIds: ['obj_prazo'], next: null, tone: null, guidance: null, assessment: null, reflection: null, options: [
      { id: 'aceita', label: 'Aceitar', feedback: 'Você escondeu o risco.', next: 'c_aceita', correct: false },
      { id: 'recusa', label: 'Recusar', feedback: 'Sem alternativa.', next: 'c_recusa', correct: false },
      { id: 'negocia', label: 'Negociar', feedback: 'Boa.', next: 'c_negocia', correct: false },
    ] },
    { id: 'c_aceita', type: 'consequence', title: 'Manhã seguinte', text: 'Você aceitou e a planilha saiu incompleta. Não funciona porque o risco ficou escondido. Faça assim: avise cedo.', narration: '', motionPrompt: '', objectiveIds: [], next: 'explica', options: null, tone: 'negative', guidance: 'Avise cedo.', assessment: null, reflection: null },
    { id: 'c_recusa', type: 'consequence', title: 'Silêncio', text: 'Você recusou sem alternativa e ela resolveu sozinha. Funciona pela metade porque faltou uma proposta. Faça assim: diga o que falta.', narration: '', motionPrompt: '', objectiveIds: [], next: 'explica', options: null, tone: 'neutral', guidance: null, assessment: null, reflection: null },
    { id: 'c_negocia', type: 'consequence', title: 'Acordo', text: 'Você propôs uma entrega parcial e combinou o resto. Funciona porque mostra critério. Faça assim sempre que o prazo apertar.', narration: '', motionPrompt: '', objectiveIds: [], next: 'explica', options: null, tone: 'positive', guidance: 'Isso funciona.', assessment: null, reflection: null },
    { id: 'explica', type: 'content', title: 'Dica: como negociar', text: 'Na prática:\n- Avise cedo.\n- Mostre o que falta.\n- Proponha uma alternativa com data.', narration: '', motionPrompt: '', objectiveIds: ['obj_prazo'], next: 'reflete', options: null, tone: null, guidance: null, assessment: null, reflection: null },
    { id: 'reflete', type: 'reflection', title: 'Sua vez', text: 'Conte uma situação sua.', narration: '', motionPrompt: '', objectiveIds: ['obj_prazo'], next: 'verifica', options: null, tone: null, guidance: null, assessment: null, reflection: { minLength: 30, maxLength: 800, placeholder: 'Escreva…' } },
    { id: 'verifica', type: 'assessment', title: 'Verificação', text: 'Qual a melhor primeira ação?', narration: '', motionPrompt: '', objectiveIds: ['obj_prazo'], next: 'fim', tone: null, guidance: null, reflection: null, assessment: { mode: 'single', passing: 'all_correct', minCorrect: null, maxAttempts: 2, feedbackPassed: 'Isso.', feedbackFailed: 'Releia.' }, options: [
      { id: 'a', label: 'Avisar agora', feedback: '', next: null, correct: true },
      { id: 'b', label: 'Avisar depois', feedback: '', next: null, correct: false },
      { id: 'c', label: 'Não avisar', feedback: '', next: null, correct: false },
    ] },
    { id: 'fim', type: 'end', title: 'Fim', text: 'Você praticou negociar prazos.\n\nO que você levou:\n- Avisar cedo evita retrabalho.\n- Fatos e proposta dão autonomia.', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null },
  ],
};

const lessonArgs = {
  title: 'Curso', brief: { audience: 'jovens' }, objectives: [{ id: 'obj_prazo', title: 'Negociar prazo', criterion: 'avisa cedo' }],
  // última aula: a verificação é permitida
  lesson: { id: 'aula_1', title: 'Negociar um prazo', description: '', family: 'decision_consequence', estimatedMinutes: 3, objectiveIds: ['obj_prazo'], isLastLesson: true },
  otherLessons: [], sourcesExcerpt: '',
};

describe('scriptToGraph', () => {
  it('converte roteiro em grafo válido com arestas por opção', () => {
    const g = scriptToGraph(goodScript);
    const c = compileLesson(g, { objectiveIds: new Set(['obj_prazo']) });
    expect(c.errors).toEqual([]);
    expect(g.edges.filter((e) => e.from === 'decisao').map((e) => e.optionId).sort()).toEqual(['aceita', 'negocia', 'recusa']);
    expect(g.nodes.find((n) => n.id === 'verifica')).toMatchObject({ type: 'assessment', passing: { kind: 'all_correct' } });
  });
});

describe('generateLesson', () => {
  it('aceita roteiro válido na primeira tentativa', async () => {
    const fake = new FakeLlmAdapter({ lesson: goodScript });
    const r = await generateLesson({ primary: fake }, lessonArgs);
    expect(r.issues.errors).toBe(0);
    expect(r.meta.repairs).toBe(0);
    expect(fake.calls.map((c) => c.task)).toEqual(['lesson']);
  });

  it('pede reparo quando a validação falha e devolve o reparado', async () => {
    const broken: LessonScript = { ...goodScript, scenes: goodScript.scenes.map((s) => (s.id === 'c_recusa' ? { ...s, next: 'nao_existe' } : s)) };
    const fake = new FakeLlmAdapter({ lesson: broken, lesson_repair: goodScript });
    const r = await generateLesson({ primary: fake }, lessonArgs);
    expect(r.issues.errors).toBe(0);
    expect(r.meta.repairs).toBe(1);
    expect(fake.calls[1]!.input).toMatch(/falhou na validação/);
    expect(fake.calls[1]!.input).toMatch(/nao_existe|NO_EXIT|DEAD_END/);
  });

  it('após o limite de reparos devolve a proposta marcada com erros', async () => {
    const broken: LessonScript = { ...goodScript, scenes: goodScript.scenes.map((s) => (s.id === 'c_recusa' ? { ...s, next: 'nao_existe' } : s)) };
    const fake = new FakeLlmAdapter({ lesson: broken, lesson_repair: broken });
    const r = await generateLesson({ primary: fake }, lessonArgs, { maxRepairs: 1 });
    expect(r.issues.errors).toBeGreaterThan(0);
    expect(r.meta.repairs).toBe(1);
  });
});

describe('fallback entre provedores', () => {
  const flaky = { provider: 'anthropic', model: 'x', capabilities: { structuredOutput: true, tools: true, streaming: true, maxInputTokens: 1, maxOutputTokens: 1 }, generateStructured: async () => { throw new LlmError('anthropic', 'server', 'boom', 503); } };
  const refusing = { ...flaky, generateStructured: async () => { throw new LlmError('anthropic', 'refusal', 'não'); } };
  it('usa o fallback em erro transitório e registra', async () => {
    const fb = new FakeLlmAdapter({ outline: { cast: [], rationale: 'ok', removedLessonIds: [], objectives: [{ id: 'o1', title: 'Fazer x', criterion: 'c', required: true }], modules: [{ id: 'm1', title: 'M', description: '', lessons: [{ id: 'l1', title: 'L', description: 'd', family: 'decision_consequence', familyRationale: 'r', estimatedMinutes: 10, objectiveIds: ['o1'], keyScenes: ['a', 'b'] }] }] } });
    const r = await proposeOutline({ primary: flaky, fallback: fb }, { title: 't', brief: {}, sourcesExcerpt: '' });
    expect(r.meta.fallbackUsed).toBe(true);
    expect(r.proposal.modules[0]!.lessons[0]!.family).toBe('decision_consequence');
  });
  it('não usa fallback em recusa', async () => {
    const fb = new FakeLlmAdapter({ outline: {} });
    await expect(generateWithFallback({ primary: refusing, fallback: fb }, { task: 'outline', instructionsVersion: 'v', system: '', input: '', schema: (await import('zod')).z.object({}) })).rejects.toMatchObject({ kind: 'refusal' });
  });
});

describe('configuração por ambiente', () => {
  // provedores pagos só valem com a trava liberada (ALLOW_PAID_PROVIDERS=1); sem ela, caem para fake (ver spend-guard.test.ts)
  const paid = (env: Record<string, string>) => ({ ALLOW_PAID_PROVIDERS: '1', ...env }) as NodeJS.ProcessEnv;
  it('sem chaves => não configurado; com ANTHROPIC_API_KEY (e a trava liberada) => anthropic; fallback só se disponível', () => {
    expect(aiConfigFromEnv({} as NodeJS.ProcessEnv)).toMatchObject({ configured: false, provider: 'fake' });
    expect(aiConfigFromEnv(paid({ ANTHROPIC_API_KEY: 'k' }))).toMatchObject({ configured: true, provider: 'anthropic', model: 'claude-opus-5-5', fallbackProvider: undefined });
    expect(aiConfigFromEnv(paid({ ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o', OPENAI_MODEL: 'm', AI_FALLBACK_PROVIDER: 'openai' }))).toMatchObject({ provider: 'anthropic', fallbackProvider: 'openai', fallbackModel: 'm' });
    expect(aiConfigFromEnv(paid({ OPENAI_API_KEY: 'o' }))).toMatchObject({ configured: false });
    // sem ALLOW_PAID_PROVIDERS a chave não basta: modo de demonstração
    expect(aiConfigFromEnv({ ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv)).toMatchObject({ provider: 'fake', blockedProvider: 'anthropic' });
  });
});

describe('modelos de demonstração', () => {
  it('AI_PROVIDER=fake explícito fica configurado e gera estrutura + aula válidas', async () => {
    expect(aiConfigFromEnv({ AI_PROVIDER: 'fake' } as NodeJS.ProcessEnv)).toMatchObject({ configured: true, provider: 'fake' });
    const set = { primary: createTemplateFakeAdapter() };
    const o = await proposeOutline(set, { title: 'Atendimento ao cliente', brief: { tema: 'atendimento ao cliente', habilidade_final: 'responder reclamações' }, sourcesExcerpt: '' });
    // duração alvo padrão (15 min) => 4 aulas curtas de ~3 min
    expect(o.proposal.modules[0]!.lessons).toHaveLength(4);
    expect(o.proposal.modules[0]!.lessons.every((l) => l.estimatedMinutes >= 2 && l.estimatedMinutes <= 4 && l.keyScenes.length >= 3 && l.keyScenes.length <= 5)).toBe(true);
    const l = await generateLesson(set, { ...lessonArgs, objectives: o.proposal.objectives.map((x) => ({ id: x.id, title: x.title, criterion: x.criterion })), lesson: { ...o.proposal.modules[0]!.lessons[0]!, description: '' } });
    expect(l.issues.errors).toBe(0);
    expect(l.meta.repairs).toBe(0);
    expect(l.graph.nodes.filter((n) => n.type === 'choice')).toHaveLength(1);
    expect(l.graph.nodes.filter((n) => n.type !== 'end').length).toBeLessThanOrEqual(7);
    expect(l.graph.nodes.some((n) => n.type === 'content' && /^Dica/.test(n.title ?? ''))).toBe(true);
  });
});
