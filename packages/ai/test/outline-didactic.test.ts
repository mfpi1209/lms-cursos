import { describe, expect, it } from 'vitest';
import { allLessons, comunicacaoPrimeiroEmprego, SceneDirectionSchema, type AnyNode, type LessonGraph } from '@lms/course-schema';
import {
  FakeLlmAdapter, LESSON_CAPS, TAKEAWAYS_TITLE, TASK_LESSON, TASK_OUTLINE, TRAINING_OPENER,
  buildLessonInput, buildOutlineInput, courseCastFor, createTemplateFakeAdapter, currentStructureBlock, droppedAuthoredDirectionWarnings, ensureDidactic, generateLesson, graphToScript, hasTrainingOpener, proposeOutline, reviseLesson, takeawayBullets, templateOutline, validateDidactic, validateLessonRules, validateOutline,
  type LessonScene, type LessonScript, type OutlineProposal, type StructuredRequest,
} from '../src';

const scene = (over: Partial<LessonScene> & Pick<LessonScene, 'id' | 'type'>): LessonScene => ({
  title: over.id, text: '', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null, ...over,
});

const goodOutline = (): OutlineProposal => ({
  cast: [], rationale: 'ok', removedLessonIds: [],
  objectives: [{ id: 'o1', title: 'Fazer x', criterion: 'c', required: true }],
  modules: [{ id: 'm1', title: 'M', description: '', lessons: [
    { id: 'l1', title: 'L1', description: 'd', family: 'decision_consequence', familyRationale: 'r', estimatedMinutes: 3, objectiveIds: ['o1'], keyScenes: ['a', 'b', 'c'] },
    { id: 'l2', title: 'L2', description: 'd', family: 'decision_consequence', familyRationale: 'r', estimatedMinutes: 3, objectiveIds: ['o1'], keyScenes: ['a', 'b', 'c'] },
  ] }],
});

describe('estrutura: validação semântica e reparo', () => {
  it('validateOutline aponta ids repetidos, objetivo inexistente, excesso de aulas e aulas atuais sem destino', () => {
    const p = goodOutline();
    p.modules[0]!.lessons.push({ ...p.modules[0]!.lessons[0]!, id: 'l1', objectiveIds: ['nao_existe'] });
    const issues = validateOutline(p, { brief: { duracao_alvo_min: 15 }, currentLessonIds: ['l1', 'l9'] });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('DUPLICATE_ID');
    expect(codes).toContain('OBJECTIVE_UNKNOWN');
    expect(codes).toContain('LESSON_UNACCOUNTED'); // l9 nem continua nem foi removida
    expect(issues.find((i) => i.code === 'LESSON_UNACCOUNTED')!.message).toMatch(/"l9"/);
    // sete aulas para 15 min (máximo 5) estoura
    const many = goodOutline();
    many.modules[0]!.lessons = Array.from({ length: 7 }, (_, i) => ({ ...many.modules[0]!.lessons[0]!, id: `l${i}` }));
    expect(validateOutline(many, { brief: { duracao_alvo_min: 15 } }).map((i) => i.code)).toContain('TOO_MANY_LESSONS');
    // removida e presente ao mesmo tempo; removida que não existe hoje
    const odd = goodOutline();
    odd.removedLessonIds = ['l1', 'fantasma'];
    expect(validateOutline(odd, { currentLessonIds: ['l1', 'l2'] }).map((i) => i.code).sort()).toEqual(['REMOVED_BUT_PRESENT', 'REMOVED_UNKNOWN']);
    expect(validateOutline(goodOutline(), { currentLessonIds: ['l1', 'l2'] })).toEqual([]);
  });

  it('proposeOutline pede reparo (outline_repair) com os problemas e aceita a versão corrigida; esgotados os reparos, recusa', async () => {
    const bad = goodOutline();
    bad.modules[0]!.lessons[1]!.objectiveIds = ['nao_existe'];
    const fake = new FakeLlmAdapter({ outline: bad, outline_repair: goodOutline() });
    const r = await proposeOutline({ primary: fake }, { title: 't', brief: {}, sourcesExcerpt: '' });
    expect(fake.calls.map((c) => c.task)).toEqual(['outline', 'outline_repair']);
    expect(fake.calls[1]!.input).toMatch(/OBJECTIVE_UNKNOWN/);
    expect(fake.calls[1]!.input).toMatch(/<proposta_anterior>/);
    expect(r.meta.repairs).toBe(1);
    expect(r.issues).toEqual([]);
    const stubborn = new FakeLlmAdapter({ outline: bad, outline_repair: bad });
    await expect(proposeOutline({ primary: stubborn }, { title: 't', brief: {}, sourcesExcerpt: '' })).rejects.toThrow(/não passou na validação após 2 reparo/);
  });

  it('o prompt recebe a estrutura atual (ids, cenas escritas) e a proposta anterior, com a regra de manter ids', () => {
    const input = buildOutlineInput({
      title: 'T', brief: {}, sourcesExcerpt: '',
      currentStructure: { modules: [{ id: 'm1', title: 'Mod', lessons: [{ id: 'aula_a', title: 'A', hasScenes: true, sceneCount: 6 }, { id: 'aula_b', title: 'B', hasScenes: false, sceneCount: 0 }] }] },
      previousProposal: { modules: [] }, instruction: 'menos aulas',
    });
    expect(input).toMatch(/<estrutura_atual>[\s\S]*aula \[aula_a\] A — 6 cenas escritas \(manter o id\)[\s\S]*aula \[aula_b\] B — sem cenas/);
    expect(input).toMatch(/<proposta_anterior>/);
    expect(input).toMatch(/<pedido_do_autor>\nmenos aulas/);
    expect(TASK_OUTLINE).toMatch(/MANTÉM o mesmo id/);
    expect(TASK_OUTLINE).toMatch(/removedLessonIds/);
    expect(currentStructureBlock({ modules: [] })).toMatch(/nenhuma aula/);
  });

  it('modelo de demonstração: mantém os ids das aulas atuais, "menos aulas" tira a última e a declara em removedLessonIds', () => {
    const req = (instruction?: string): StructuredRequest<unknown> => ({
      task: 'outline', instructionsVersion: 'x', system: '', schema: { parse: (v: unknown) => v } as never,
      input: buildOutlineInput({
        title: 'Curso', brief: { tema: 'atendimento', duracao_alvo_min: 15 }, sourcesExcerpt: '',
        currentStructure: { modules: [{ id: 'mod_x', title: 'X', lessons: [
          { id: 'aula_x_1', title: 'Primeira', hasScenes: true, sceneCount: 6 },
          { id: 'aula_x_2', title: 'Segunda', hasScenes: false, sceneCount: 0 },
          { id: 'aula_x_3', title: 'Terceira', hasScenes: true, sceneCount: 5 },
          { id: 'aula_x_4', title: 'Quarta', hasScenes: true, sceneCount: 7 },
        ] }] },
        instruction,
      }),
    });
    const same = templateOutline(req());
    expect(same.modules[0]!.lessons.map((l) => l.id)).toEqual(['aula_x_1', 'aula_x_2', 'aula_x_3', 'aula_x_4']);
    // aulas com cenas mantêm também o título
    expect(same.modules[0]!.lessons[0]!.title).toBe('Primeira');
    expect(same.removedLessonIds).toEqual([]);
    const fewer = templateOutline(req('Quero menos aulas, por favor'));
    expect(fewer.modules[0]!.lessons.map((l) => l.id)).toEqual(['aula_x_1', 'aula_x_2', 'aula_x_3']);
    expect(fewer.removedLessonIds).toEqual(['aula_x_4']);
    expect(validateOutline(fewer, { currentLessonIds: ['aula_x_1', 'aula_x_2', 'aula_x_3', 'aula_x_4'], hasInstruction: true })).toEqual([]);
    const more = templateOutline(req('mais aulas'));
    expect(more.modules[0]!.lessons).toHaveLength(5);
  });
});

describe('aula: cenas previstas, justificativa e elenco chegam ao prompt', () => {
  const base = {
    title: 'Curso', brief: { tema: 'x' }, objectives: [{ id: 'o1', title: 'Fazer x', criterion: 'c' }],
    lesson: { id: 'l1', title: 'Responder ao convite', description: 'd', family: 'decision_consequence', estimatedMinutes: 3, objectiveIds: ['o1'], keyScenes: ['Convite chega', 'Decisão com 3 opções', 'Consequências', 'Dica'], rationale: 'Decidir sob pressão exige ver a consequência.' },
    otherLessons: [], sourcesExcerpt: '',
  };
  it('keyScenes e rationale entram em <aula>; o elenco vem do curso ou da pessoa apresentadora', () => {
    const input = buildLessonInput({ ...base, cast: courseCastFor({ cast: [], branding: { presenterName: 'Marina', presenterRole: 'Sua entrevistadora' } }) });
    expect(input).toMatch(/cenas previstas \(siga esta ordem e cubra todas\): Convite chega \| Decisão com 3 opções \| Consequências \| Dica/);
    expect(input).toMatch(/por que esta dinâmica: Decidir sob pressão exige ver a consequência\./);
    expect(input).toMatch(/<elenco>\n- Marina: Sua entrevistadora\./);
    // elenco aprovado na estrutura tem prioridade
    expect(courseCastFor({ cast: [{ name: 'Carla', role: 'recrutadora', details: '' }], branding: { presenterName: 'Marina' } })).toEqual([{ name: 'Carla', role: 'recrutadora', details: '' }]);
    expect(courseCastFor({ cast: [], branding: {} })).toEqual([]);
  });

  it('a geração de demonstração usa as cenas previstas sem reparos e a aula cumpre a abertura e o fechamento didáticos', async () => {
    const set = { primary: createTemplateFakeAdapter() };
    const r = await generateLesson(set, { ...base, isLastLesson: false } as never);
    expect(r.meta.repairs).toBe(0);
    expect(r.issues.errors).toBe(0);
    expect(set.primary.calls[0]!.input).toMatch(/cenas previstas/);
    const script = graphToScript(r.graph);
    expect(hasTrainingOpener(script.scenes[0]!.text)).toBe(true);
    const end = script.scenes.find((s) => s.type === 'end')!;
    expect(takeawayBullets(end.text).length).toBeGreaterThanOrEqual(LESSON_CAPS.takeawaysMin);
    expect(TASK_LESSON).toContain(TRAINING_OPENER);
    expect(TASK_LESSON).toContain(TAKEAWAYS_TITLE);
  });
});

describe('didática: "O que você vai treinar" e "O que você levou"', () => {
  const script = (): LessonScript => ({
    rationale: 'ok',
    scenes: [
      scene({ id: 'situacao', type: 'scenario', text: 'Sua gestora pede a planilha para amanhã.', next: 'fim' }),
      scene({ id: 'fim', type: 'end', text: 'Você praticou negociar prazos.' }),
    ],
  });
  it('validateDidactic aponta a falta da abertura e dos tópicos; ensureDidactic (demo) corrige dentro dos limites', () => {
    expect(validateDidactic(script()).map((i) => i.code).sort()).toEqual(['MISSING_TAKEAWAYS', 'MISSING_TRAINING_OPENER']);
    const fixed = ensureDidactic(script(), 'Negociar um prazo');
    expect(validateDidactic(fixed)).toEqual([]);
    expect(fixed.scenes[0]!.text).toMatch(/^O que você vai treinar: /);
    expect(takeawayBullets(fixed.scenes[1]!.text)).toHaveLength(3);
    // abertura longa demais e tópico longo demais
    const long = ensureDidactic(script(), 'x');
    long.scenes[0]!.text = `${TRAINING_OPENER}: ${Array.from({ length: 16 }, () => 'palavra').join(' ')}\n\nSituação.`;
    long.scenes[1]!.text = `${TAKEAWAYS_TITLE}:\n- ${Array.from({ length: 13 }, () => 'palavra').join(' ')}\n- ok`;
    expect(validateDidactic(long).map((i) => i.code).sort()).toEqual(['OPENER_TOO_LONG', 'TAKEAWAY_TOO_LONG']);
  });

  it('na geração a falta é erro de reparo; na revisão é só aviso (aulas antigas não quebram)', async () => {
    const missing = script();
    const issuesEnforce = validateLessonRules(missing, { didactic: 'enforce', voice: false });
    expect(issuesEnforce.filter((i) => i.code === 'MISSING_TRAINING_OPENER' && !i.severity)).toHaveLength(1);
    const issuesWarn = validateLessonRules(missing, { didactic: 'warn', voice: false });
    expect(issuesWarn.filter((i) => i.code === 'MISSING_TRAINING_OPENER').map((i) => i.severity)).toEqual(['warning']);
    expect(validateLessonRules(missing, { voice: false }).some((i) => i.code.startsWith('MISSING_T'))).toBe(false);
    // a linha de abertura não conta como texto competindo com a fala
    const withNarration: LessonScript = { rationale: '', scenes: [scene({ id: 's', type: 'scenario', text: `${TRAINING_OPENER}: decidir rápido\n\n${Array.from({ length: 20 }, () => 'p').join(' ')}`, narration: 'Fala.', next: 'fim' }), scene({ id: 'fim', type: 'end', text: `x\n\n${TAKEAWAYS_TITLE}:\n- a\n- b` })] };
    expect(validateLessonRules(withNarration, { voice: false, didactic: 'enforce' }).some((i) => i.code === 'TOO_MUCH_SCREEN_TEXT_WITH_NARRATION')).toBe(false);
  });
});

describe('revisão: direção ajustada pelo autor que deixa de valer', () => {
  it('droppedAuthoredDirectionWarnings lista as cenas com direção do autor cuja fala mudou; reviseLesson as devolve em conversionWarnings', async () => {
    const lesson = allLessons(comunicacaoPrimeiroEmprego)[0]!;
    const spokenNode = lesson.graph.nodes.find((n) => n.type === 'scenario' || n.type === 'content')!;
    const line = ('narration' in spokenNode && spokenNode.narration) || 'Fala da cena.';
    const authored = SceneDirectionSchema.parse({ source: 'author', shots: [{ id: 's1', line, framing: 'medium' }] });
    const before: LessonGraph = { ...lesson.graph, nodes: lesson.graph.nodes.map((n): AnyNode => (n.id === spokenNode.id ? ({ ...n, narration: line, direction: authored } as AnyNode) : n)) };
    const after: LessonGraph = { ...before, nodes: before.nodes.map((n): AnyNode => (n.id === spokenNode.id ? ({ ...n, narration: `${line} E mais uma frase.`, direction: undefined } as AnyNode) : n)) };
    const warnings = droppedAuthoredDirectionWarnings(before, after);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/direção ajustada por você/);
    expect(droppedAuthoredDirectionWarnings(before, before)).toEqual([]);

    // revisão de demonstração com instrução livre: títulos marcados, a fala não muda -> a direção do autor sobrevive (sem aviso)
    const set = { primary: createTemplateFakeAdapter() };
    const r = await reviseLesson(set, {
      title: comunicacaoPrimeiroEmprego.title, brief: {}, objectives: comunicacaoPrimeiroEmprego.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion })),
      lesson: { id: lesson.id, title: lesson.title, description: lesson.description, family: lesson.family, estimatedMinutes: 3, objectiveIds: lesson.objectiveIds },
      otherLessons: [], sourcesExcerpt: '', instruction: 'melhore', graph: before,
    });
    expect(r.conversionWarnings.some((w) => /direção ajustada por você/.test(w))).toBe(false);
    expect(r.issueList.errors).toEqual([]);
    expect(r.issueList.warnings.length).toBe(r.issues.warnings);
  });
});
