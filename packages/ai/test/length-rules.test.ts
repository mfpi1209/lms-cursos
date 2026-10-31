import { describe, expect, it } from 'vitest';
import { allLessons, compileLesson, comunicacaoPrimeiroEmprego, richTextToPlain } from '@lms/course-schema';
import {
  FakeLlmAdapter, INSTRUCTIONS_VERSION, LESSON_CAPS, REVISION_FOCUS, REVISION_FOCUS_INSTRUCTIONS, REVISION_FOCUS_LABELS, TASK_LESSON, TASK_OUTLINE,
  buildLessonInput, buildOutlineInput, createTemplateFakeAdapter, demoShortenScript, generateLesson, graphToScript, isDicaScene, outlineTargets, proposeOutline, reviseLesson, scriptToGraph,
  templateLesson, templateOutline, templateRevise, validateLessonRules, isBeginnerAudience, BEGINNER_AUDIENCE_RULES, SYSTEM_DESIGNER,
  type LessonScene, type LessonScript, type StructuredRequest,
} from '../src';
import * as client from '../src/client';

const course = comunicacaoPrimeiroEmprego;
const lesson1 = allLessons(course)[0]!;
const objectiveIds = new Set(course.objectives.map((o) => o.id));
const scene = (over: Partial<LessonScene> & Pick<LessonScene, 'id' | 'type'>): LessonScene => ({
  title: over.id, text: '', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null, ...over,
});
const words = (n: number, w = 'palavra') => Array.from({ length: n }, () => w).join(' ');

/** Aula mínima dentro das regras: situação, decisão (3), 3 consequências, Dica, fim. */
function compliantScript(): LessonScript {
  return {
    rationale: 'ok',
    scenes: [
      scene({ id: 'situacao', type: 'scenario', title: 'Situação', text: 'O que você vai treinar: negociar um prazo sem esconder o risco\n\nSua gestora pede a planilha para amanhã.', next: 'decisao' }),
      scene({ id: 'decisao', type: 'choice', title: 'O que você faz?', text: 'Você olha o que falta.', objectiveIds: ['obj_negociar_prazo'], options: [
        { id: 'aceita', label: 'Aceitar e tentar virar a noite.', feedback: 'Esconde o risco.', next: 'c_aceita', correct: false },
        { id: 'recusa', label: 'Dizer que não vai dar.', feedback: 'Sem alternativa.', next: 'c_recusa', correct: false },
        { id: 'negocia', label: 'Mostrar o que falta e propor uma entrega parcial.', feedback: 'Boa.', next: 'c_negocia', correct: false },
      ] }),
      scene({ id: 'c_aceita', type: 'consequence', text: 'Você aceitou e a planilha saiu incompleta. Não funciona porque o risco ficou escondido. Faça assim: avise cedo.', tone: 'negative', next: 'dica' }),
      scene({ id: 'c_recusa', type: 'consequence', text: 'Você recusou sem alternativa e ela resolveu sozinha. Não funciona porque faltou uma proposta. Faça assim: diga o que falta.', tone: 'neutral', next: 'dica' }),
      scene({ id: 'c_negocia', type: 'consequence', text: 'Você mostrou o que falta e propôs uma entrega parcial. Funciona porque vira um plano em dez minutos.', tone: 'positive', next: 'dica' }),
      scene({ id: 'dica', type: 'content', title: 'Dica', text: '- Avise cedo.\n- Mostre o que falta.\n- Proponha uma data.', objectiveIds: ['obj_negociar_prazo'], next: 'fim' }),
      scene({ id: 'fim', type: 'end', title: 'Fim', text: 'Você praticou negociar prazos.\n\nO que você levou:\n- Avisar cedo evita retrabalho.\n- Fatos e proposta dão autonomia.' }),
    ],
  };
}

const lessonArgs = {
  title: course.title, brief: { tema: course.brief.topic, duracao_alvo_min: 15 }, objectives: course.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion })),
  lesson: { id: lesson1.id, title: lesson1.title, description: lesson1.description, family: lesson1.family, estimatedMinutes: 3, objectiveIds: lesson1.objectiveIds },
  otherLessons: [], sourcesExcerpt: '',
};

describe('regras da aula curta (validateLessonRules)', () => {
  it('aceita a aula dentro dos limites', () => {
    expect(validateLessonRules(compliantScript(), { family: 'decision_consequence' })).toEqual([]);
  });

  it('aponta cada estouro com os números exatos, em pt-BR', () => {
    const s = compliantScript();
    const long = { ...s, scenes: s.scenes.map((sc) => {
      if (sc.id === 'situacao') return { ...sc, text: words(46), narration: words(121) };
      if (sc.id === 'decisao') return { ...sc, options: [...sc.options!, { id: 'quarta', label: words(13, 'opção'), feedback: '', next: 'c_aceita', correct: false }] };
      if (sc.id === 'c_aceita') return { ...sc, text: words(41), narration: words(91) };
      if (sc.id === 'dica') return { ...sc, title: 'Como negociar', text: words(61) };
      return sc;
    }) };
    long.scenes.splice(6, 0, scene({ id: 'r1', type: 'reflection', text: words(31), next: 'r2' }), scene({ id: 'r2', type: 'reflection', text: 'x', next: 'av' }), scene({ id: 'av', type: 'assessment', text: words(21), options: [{ id: 'a', label: 'a', feedback: '', next: null, correct: true }, { id: 'b', label: 'b', feedback: '', next: null, correct: false }], next: 'dica' }));
    const msgs = validateLessonRules(long, { family: 'decision_consequence' }).map((i) => `${i.code}: ${i.message}`).join('\n');
    expect(msgs).toMatch(/TOO_MANY_SCENES: a aula tem 9 cenas sem contar o encerramento \(máximo 7\)/);
    expect(msgs).toMatch(/SCREEN_TOO_LONG: cena "Situação" \(situacao\): texto da tela com 46 palavras \(máximo 45\)/);
    expect(msgs).toMatch(/NARRATION_TOO_LONG: cena "Situação" \(situacao\): fala com 121 palavras \(máximo 120\)/);
    expect(msgs).toMatch(/CHOICE_OPTIONS: .*decisão com 4 opções \(use exatamente 3/);
    expect(msgs).toMatch(/OPTION_TOO_LONG: .*opção "quarta": rótulo com 13 palavras \(máximo 12\)/);
    expect(msgs).toMatch(/CONSEQUENCE_TOO_LONG: .*consequência com 41 palavras na tela \(máximo 40\)/);
    expect(msgs).toMatch(/NARRATION_TOO_LONG: cena "c_aceita" \(c_aceita\): fala com 91 palavras \(máximo 90 em consequências\)/);
    expect(msgs).toMatch(/SCREEN_TOO_LONG: cena "Como negociar" \(dica\): texto da tela com 61 palavras \(máximo 60 em cenas de conteúdo\)/);
    expect(msgs).toMatch(/REFLECTION_TOO_LONG: .*31 palavras \(máximo 30\)/);
    expect(msgs).toMatch(/TOO_MANY_REFLECTIONS: a aula tem 2 reflexões \(máximo 1\)/);
    expect(msgs).toMatch(/ASSESSMENT_NOT_ALLOWED: a aula tem 1 verificação, mas verificação só entra na última aula/);
    expect(msgs).toMatch(/ASSESSMENT_TOO_LONG: .*21 palavras \(máximo 20\)/);
    expect(msgs).toMatch(/ASSESSMENT_OPTIONS: .*verificação com 2 opções \(use exatamente 3\)/);
    expect(msgs).toMatch(/MISSING_DICA: falta a cena "Dica"/);
    // na última aula a verificação é permitida
    expect(validateLessonRules(long, { allowAssessment: true }).map((i) => i.code)).not.toContain('ASSESSMENT_NOT_ALLOWED');
  });

  it('famílias de diálogo e simulação têm teto de 9 cenas; "Na prática" também vale como Dica', () => {
    const s = compliantScript();
    s.scenes.splice(6, 0, scene({ id: 'x1', type: 'scenario', text: 'a', next: 'x2' }), scene({ id: 'x2', type: 'scenario', text: 'b', next: 'dica' }));
    expect(validateLessonRules(s, { family: 'dialogue' })).toEqual([]);
    expect(validateLessonRules(s, { family: 'decision_consequence' }).map((i) => i.code)).toEqual(['TOO_MANY_SCENES']);
    expect(isDicaScene({ type: 'content', title: 'Na PRÁTICA: o que fazer' })).toBe(true);
    expect(isDicaScene({ type: 'content', title: 'Dicas para a entrevista' })).toBe(true);
    expect(isDicaScene({ type: 'scenario', title: 'Dica' })).toBe(false);
  });
});

describe('geração: estouro de limite pede reparo ao modelo', () => {
  it('roteiro longo demais (estruturalmente válido) volta ao modelo com os números; o reparo é aceito', async () => {
    const s = compliantScript();
    const tooLong = { ...s, scenes: s.scenes.map((sc) => (sc.id === 'situacao' ? { ...sc, text: words(80) } : sc)) };
    const fake = new FakeLlmAdapter({ lesson: tooLong, lesson_repair: compliantScript() });
    const r = await generateLesson({ primary: fake }, lessonArgs);
    expect(compileLesson(scriptToGraph(tooLong), { objectiveIds }).errors).toEqual([]); // sem as regras de extensão, passaria
    expect(fake.calls.map((c) => c.task)).toEqual(['lesson', 'lesson_repair']);
    expect(fake.calls[1]!.input).toMatch(/SCREEN_TOO_LONG: cena "Situação" \(situacao\): texto da tela com 80 palavras \(máximo 45\)/);
    expect(r.meta.repairs).toBe(1);
    expect(r.issues.errors).toBe(0);
  });

  it('verificação fora da última aula e decisão com 4 opções também pedem reparo', async () => {
    const s = compliantScript();
    const bad = { ...s, scenes: [...s.scenes.slice(0, 6), scene({ id: 'av', type: 'assessment', text: 'Qual a melhor ação?', next: 'fim', options: [{ id: 'a', label: 'a', feedback: '', next: null, correct: true }, { id: 'b', label: 'b', feedback: '', next: null, correct: false }, { id: 'c', label: 'c', feedback: '', next: null, correct: false }] }), ...s.scenes.slice(6)].map((sc) => (sc.id === 'dica' ? { ...sc, next: 'av' } : sc)) };
    const fake = new FakeLlmAdapter({ lesson: bad, lesson_repair: bad });
    const r = await generateLesson({ primary: fake }, lessonArgs, { maxRepairs: 1 });
    expect(fake.calls[1]!.input).toMatch(/ASSESSMENT_NOT_ALLOWED/);
    expect(r.issues.errors).toBeGreaterThan(0);
    // na última aula, a mesma proposta passa
    const ok = await generateLesson({ primary: new FakeLlmAdapter({ lesson: bad }) }, { ...lessonArgs, lesson: { ...lessonArgs.lesson, isLastLesson: true } });
    expect(ok.issues.errors).toBe(0);
    expect(ok.meta.repairs).toBe(0);
  });
});

describe('prompts: limites e alvo de aulas', () => {
  it('TASK_LESSON traz a estrutura e os limites; a entrada diz se a verificação é permitida', () => {
    expect(INSTRUCTIONS_VERSION).toBe('2026-10-29.2');
    expect(TASK_LESSON).toMatch(/exatamente 3 opções, cada uma com até 12 palavras/);
    expect(TASK_LESSON).toMatch(/Uma consequence por opção \(3 cenas\): até 40 palavras na tela e até 90 faladas/);
    expect(TASK_LESSON).toMatch(/Dica \(1 cena content com título "Dica" ou "Na prática"\): 3 tópicos de até 10 palavras/);
    expect(TASK_LESSON).toMatch(/Até 7 cenas sem contar o encerramento \(até 9 só nas famílias dialogue e resource_simulation\)/);
    expect(TASK_LESSON).toMatch(/Texto da tela: até 45 palavras por cena; cenas content \(inclusive a Dica, com os tópicos\) até 60; o encerramento/);
    expect(TASK_LESSON).toMatch(/Fala \(narration\): até 120 palavras por cena \(consequências até 90\); procure ficar entre 60 e 120/);
    // fala contínua e conversada; palavras-chave ficam nos cartões/tela, nunca lidas como lista
    expect(SYSTEM_DESIGNER).toMatch(/Fala CONTÍNUA e conversada[\s\S]*"a gente"[\s\S]*"vamos por partes"/);
    expect(SYSTEM_DESIGNER).toMatch(/nunca os lê como lista/);
    expect(TASK_LESSON).toMatch(/assessment SOMENTE quando <aula> indicar "verificação permitida: sim"/);
    expect(TASK_LESSON).not.toMatch(/80 palavras|No máximo 4 consequences|2–6 opções/);
    const input = buildLessonInput({ ...lessonArgs, lesson: { ...lessonArgs.lesson, isLastLesson: true } });
    expect(input).toMatch(/última aula do curso: sim\nverificação permitida: sim/);
    expect(buildLessonInput(lessonArgs)).toMatch(/última aula do curso: não\nverificação permitida: não/);
    expect(buildLessonInput({ ...lessonArgs, lesson: { ...lessonArgs.lesson, allowAssessment: true } })).toMatch(/verificação permitida: sim/);
  });

  it('outlineTargets deriva as aulas da duração (≈ 3 min por aula) e TASK_OUTLINE recebe <alvo>', () => {
    expect([10, 15, 20, 30, 45].map((m) => { const t = outlineTargets(m); return [t.lessonsMin, t.lessonsMax]; })).toEqual([[3, 4], [4, 5], [6, 7], [8, 10], [12, 15]]);
    expect(outlineTargets(undefined)).toMatchObject({ lessonsMin: 4, lessonsMax: 5, minutesPerLessonMin: 2, minutesPerLessonMax: 4, scenesMin: 4, scenesMax: 7 });
    expect(TASK_OUTLINE).toMatch(/10 min → 3–4 aulas; 15 → 4–5; 20 → 6–7; 30 → 8–10; 45 → 12–15/);
    expect(TASK_OUTLINE).toMatch(/Cada aula tem de 4 a 7 cenas/);
    expect(TASK_OUTLINE).toMatch(/estimatedMinutes por aula: de 2 a 4/);
    expect(buildOutlineInput({ title: 'x', brief: { duracao_alvo_min: 30 }, sourcesExcerpt: '' })).toMatch(/<alvo>\nduracao_total_min: 30\naulas_alvo: 8 a 10\nmin_por_aula: 2 a 4 \(cerca de 3\)\ncenas_por_aula: 4 a 7\n<\/alvo>/);
    expect(buildOutlineInput({ title: 'x', brief: {}, sourcesExcerpt: '' })).toMatch(/aulas_alvo: 4 a 5/);
    expect(client.outlineTargets).toBe(outlineTargets);
    expect(client.LESSON_CAPS).toBe(LESSON_CAPS);
  });

  it('focos: "practical" existe e "shorten" exige os limites', () => {
    expect(REVISION_FOCUS).toContain('practical');
    expect(REVISION_FOCUS_LABELS.practical).toBe('Mais prático: dicas e orientação direta');
    expect(REVISION_FOCUS_INSTRUCTIONS.shorten).toMatch(/no máximo 7 cenas sem contar o encerramento/);
    expect(REVISION_FOCUS_INSTRUCTIONS.shorten).toMatch(/exatamente 3 opções/);
    expect(REVISION_FOCUS_INSTRUCTIONS.shorten).toMatch(/acrescente a cena "Dica"/);
    expect(REVISION_FOCUS_INSTRUCTIONS.shorten).toMatch(/MESMO id/);
    expect(REVISION_FOCUS_INSTRUCTIONS.practical).toMatch(/Leve duas perguntas anotadas/);
    expect(client.REVISION_FOCUS).toBe(REVISION_FOCUS);
  });
});

describe('modelos de demonstração respeitam os limites', () => {
  const req = (input: string, task = 'lesson') => ({ task, input } as unknown as StructuredRequest<unknown>);

  it('aula de demonstração: 7 cenas + encerramento, Dica, reflexão fora da última aula e verificação na última', () => {
    const normal = templateLesson(req('<aula>\ntítulo: Aula\nobjetivos: obj_x\nverificação permitida: não\n</aula>'));
    expect(validateLessonRules(normal, {})).toEqual([]);
    expect(normal.scenes.filter((s) => s.type !== 'end')).toHaveLength(7);
    expect(normal.scenes.map((s) => s.type)).toEqual(['scenario', 'choice', 'consequence', 'consequence', 'consequence', 'content', 'reflection', 'end']);
    expect(compileLesson(scriptToGraph(normal), { objectiveIds: new Set(['obj_x']) }).errors).toEqual([]);
    const last = templateLesson(req('<aula>\ntítulo: Aula\nobjetivos: obj_x\nverificação permitida: sim\n</aula>'));
    expect(validateLessonRules(last, { allowAssessment: true })).toEqual([]);
    expect(last.scenes.map((s) => s.type)).toContain('assessment');
    expect(last.scenes.map((s) => s.type)).not.toContain('reflection');
    // a Dica vira lista no grafo
    const dica = scriptToGraph(normal).nodes.find((n) => n.id === 'dica')!;
    expect(dica.type === 'content' && dica.body.content.some((b) => b.type === 'bulletList' && b.content.length === 3)).toBe(true);
  });

  it('estrutura de demonstração segue aulas_alvo (10 → 3, 45 → 12) e 3 min por aula', async () => {
    for (const [minutes, lessons] of [[10, 3], [15, 4], [20, 6], [30, 8], [45, 12]] as const) {
      const o = await proposeOutline({ primary: createTemplateFakeAdapter() }, { title: 'Entrevista', brief: { tema: 'entrevista de emprego', duracao_alvo_min: minutes }, sourcesExcerpt: '' });
      const all = o.proposal.modules.flatMap((m) => m.lessons);
      expect(all, `${minutes} min`).toHaveLength(lessons);
      expect(all.every((l) => l.estimatedMinutes === 3 && l.keyScenes.length <= 5)).toBe(true);
    }
    expect(templateOutline(req('Título: Curso', 'outline')).modules[0]!.lessons).toHaveLength(4);
  });

  it('revisão de demonstração com foco shorten encurta a aula do curso-exemplo dentro dos limites, mantendo ids', () => {
    const script = graphToScript(lesson1.graph);
    expect(validateLessonRules(script, { family: lesson1.family }).length).toBeGreaterThan(0);
    const input = `<aula>\nfamília: ${lesson1.family}\nverificação permitida: não\n</aula>\n\n<roteiro_atual>\n${JSON.stringify(script)}\n</roteiro_atual>\n\n<foco>\nshorten\nx\n</foco>`;
    const short = templateRevise(req(input, 'revise_lesson'));
    expect(validateLessonRules(short, { family: lesson1.family })).toEqual([]);
    const ids = short.scenes.map((s) => s.id);
    expect(ids).toEqual(['decisao_prazo', 'cons_aceita', 'cons_recusa', 'cons_negocia', 'dica', 'reflexao_prazo', 'fim_prazo']);
    expect(compileLesson(scriptToGraph(short), { objectiveIds }).errors).toEqual([]);
    // sem foco de encurtar: estrutura intacta
    const same = templateRevise(req(input.replace('shorten', 'tone'), 'revise_lesson'));
    expect(same.scenes.map((s) => s.id)).toEqual(script.scenes.map((s) => s.id));
    // última aula: a verificação fica, cortada para 3 opções
    const lastShort = demoShortenScript(script, { allowAssessment: true });
    expect(lastShort.scenes.find((s) => s.type === 'assessment')!.options).toHaveLength(3);
    // o encurtamento é estrutural; a voz de ensino entra em demoTeachingVoice (templateRevise aplica os dois)
    expect(validateLessonRules(lastShort, { allowAssessment: true, voice: false })).toEqual([]);
  });
});

describe('reviseLesson com foco shorten (adapter de demonstração)', () => {
  it('cenas mantidas conservam id e mídia; cenas removidas somem com as arestas; o grafo compila', async () => {
    const original = structuredClone(lesson1.graph);
    (original.nodes.find((n) => n.id === 'decisao_prazo') as { media?: unknown }).media = { assetId: 'ast_1', kind: 'video' };
    (original.nodes.find((n) => n.id === 'decisao_urgencia') as { media?: unknown }).media = { assetId: 'ast_2', kind: 'video' };
    const set = { primary: createTemplateFakeAdapter() };
    const r = await reviseLesson(set, { ...lessonArgs, graph: original, focus: 'shorten' });
    expect(r.issues.errors).toBe(0);
    expect(r.meta.repairs).toBe(0);
    expect(r.graph.nodes.filter((n) => n.type !== 'end').length).toBeLessThanOrEqual(LESSON_CAPS.maxScenes);
    expect(r.graph.nodes.map((n) => n.id)).not.toContain('decisao_urgencia');
    expect(r.graph.nodes.map((n) => n.id)).not.toContain('conteudo_negociar');
    expect((r.graph.nodes.find((n) => n.id === 'decisao_prazo') as { media?: { assetId: string } }).media).toMatchObject({ assetId: 'ast_1' });
    expect(r.graph.edges.every((e) => r.graph.nodes.some((n) => n.id === e.from) && r.graph.nodes.some((n) => n.id === e.to))).toBe(true);
    expect(r.graph.variables).toEqual(original.variables);
    const dica = r.graph.nodes.find((n) => n.id === 'dica')!;
    expect(dica.type === 'content' && richTextToPlain(dica.body)).toMatch(/Levante os fatos/);
    expect(r.rationale).toMatch(/encurtada/);
  });

  it('com foco que não é de encurtar, os estouros viram avisos (não reparo)', async () => {
    const set = { primary: createTemplateFakeAdapter() };
    const r = await reviseLesson(set, { ...lessonArgs, graph: lesson1.graph, focus: 'tone' });
    expect(r.meta.repairs).toBe(0);
    expect(r.issues.errors).toBe(0);
    expect(r.issues.warnings).toBeGreaterThan(0);
  });

  it('revisão restrita a algumas cenas não exige os limites (não dá para remover as outras)', async () => {
    const set = { primary: createTemplateFakeAdapter() };
    const r = await reviseLesson(set, { ...lessonArgs, graph: lesson1.graph, focus: 'shorten', nodeIds: ['conteudo_negociar'] });
    expect(r.meta.repairs).toBe(0);
    expect(r.issues.errors).toBe(0);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(lesson1.graph.nodes.map((n) => n.id));
  });
});

describe('público iniciante ou tímido: pouco texto e nada de escrita obrigatória', () => {
  it('isBeginnerAudience reconhece primeiro emprego, estágio e timidez/introversão (sem acento e sem caixa)', () => {
    expect(isBeginnerAudience({ audience: 'jovens buscando o primeiro emprego' })).toBe(true);
    expect(isBeginnerAudience({ publico: 'Estudantes atrás de ESTÁGIO' })).toBe(true);
    expect(isBeginnerAudience('pessoas tímidas ou introvertidas')).toBe(true);
    expect(isBeginnerAudience({ audience: 'gestores experientes' })).toBe(false);
    expect(isBeginnerAudience(undefined)).toBe(false);
  });

  it('TOO_MUCH_SCREEN_TEXT_WITH_NARRATION: aviso reparável em situação/conteúdo com fala e mais de 25 palavras na tela', () => {
    const s = compliantScript();
    s.scenes = s.scenes.map((sc) => (sc.id === 'situacao' ? { ...sc, text: words(26), narration: 'Você recebe um pedido urgente.' } : sc));
    const issues = validateLessonRules(s, { family: 'decision_consequence' });
    expect(issues.map((i) => i.code)).toEqual(['TOO_MUCH_SCREEN_TEXT_WITH_NARRATION']);
    expect(issues[0]).toMatchObject({ sceneId: 'situacao', severity: 'warning' });
    expect(issues[0]!.message).toMatch(/26 palavras na tela.*máximo 25/);
    // sem fala, o texto da tela pode ser maior (até o limite geral)
    s.scenes = s.scenes.map((sc) => (sc.id === 'situacao' ? { ...sc, narration: '' } : sc));
    expect(validateLessonRules(s, { family: 'decision_consequence' })).toEqual([]);
  });

  it('OPEN_ANSWER_HEAVY: mais de uma escrita obrigatória para iniciantes; anotação opcional (minLength 0) não conta', () => {
    const s = compliantScript();
    const refl = (id: string, minLength: number, next: string) => scene({ id, type: 'reflection', text: 'Sua vez.', next, reflection: { minLength, maxLength: 600, placeholder: '' } });
    s.scenes = s.scenes.map((sc) => (sc.id === 'dica' ? { ...sc, next: 'r1' } : sc));
    s.scenes.splice(6, 0, refl('r1', 30, 'r2'), refl('r2', 20, 'fim'));
    const heavy = validateLessonRules(s, { family: 'decision_consequence', beginnerAudience: true }).filter((i) => i.code === 'OPEN_ANSWER_HEAVY');
    expect(heavy).toHaveLength(1);
    expect(heavy[0]!.severity).toBe('warning');
    // público geral: não avisa
    expect(validateLessonRules(s, { family: 'decision_consequence' }).some((i) => i.code === 'OPEN_ANSWER_HEAVY')).toBe(false);
    // uma obrigatória + uma opcional: não avisa
    s.scenes = s.scenes.map((sc) => (sc.id === 'r2' ? { ...sc, reflection: { minLength: 0, maxLength: 600, placeholder: '' } } : sc));
    expect(validateLessonRules(s, { family: 'decision_consequence', beginnerAudience: true }).some((i) => i.code === 'OPEN_ANSWER_HEAVY')).toBe(false);
  });

  it('avisos reparáveis não forçam reparo na geração (a aula é aceita na primeira rodada)', async () => {
    const script = compliantScript();
    script.scenes = script.scenes.map((sc) => (sc.id === 'situacao' ? { ...sc, text: `O que você vai treinar: negociar um prazo\n\n${words(30)}`, narration: 'Você recebe um pedido urgente.' } : sc));
    const fake = new FakeLlmAdapter({ lesson: () => script });
    const r = await generateLesson({ primary: fake }, { ...lessonArgs, brief: { ...lessonArgs.brief, publico: 'primeiro emprego' } });
    expect(r.meta.repairs).toBe(0);
    expect(r.issues.errors).toBe(0);
    expect(r.issues.warnings).toBeGreaterThan(0);
  });

  it('prompts trazem as regras para iniciantes; a versão das instruções subiu', () => {
    expect(SYSTEM_DESIGNER).toContain('Nada de resposta aberta obrigatória');
    expect(SYSTEM_DESIGNER).toContain('No máximo UMA anotação opcional');
    expect(TASK_LESSON).toContain('NÃO use reflection obrigatória');
    expect(TASK_LESSON).toContain('opções com até 14 palavras');
    expect(TASK_OUTLINE).toContain('no máximo uma anotação opcional no curso');
    expect(BEGINNER_AUDIENCE_RULES).toContain('Treinar em voz alta é opcional');
  });

  it('modelos de demonstração cumprem as regras (sem estes avisos)', () => {
    const input = buildLessonInput({ ...lessonArgs, brief: { publico: 'primeiro emprego, pessoas tímidas' } });
    const lesson = templateLesson({ task: 'lesson', input } as StructuredRequest<unknown>);
    const codes = validateLessonRules(lesson, { family: 'decision_consequence', beginnerAudience: true }).map((i) => i.code);
    expect(codes).not.toContain('TOO_MUCH_SCREEN_TEXT_WITH_NARRATION');
    expect(codes).not.toContain('OPEN_ANSWER_HEAVY');
    // para iniciantes, a aula de demonstração não pede escrita
    expect(lesson.scenes.some((s) => s.type === 'reflection')).toBe(false);
    expect(compileLesson(scriptToGraph(lesson), { objectiveIds: new Set(lessonArgs.objectives.map((o) => o.id)) }).errors).toEqual([]);
  });
});
