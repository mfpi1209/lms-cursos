import { describe, expect, it } from 'vitest';
import { allLessons, comunicacaoPrimeiroEmprego } from '@lms/course-schema';
import {
  FakeLlmAdapter, IMPERATIVE_VERBS, REVISION_FOCUS, REVISION_FOCUS_INSTRUCTIONS, REVISION_FOCUS_LABELS, SYSTEM_DESIGNER, TASK_LESSON, TASK_REVISE, TEACHING_VOICE_RULES, VOICE_REVISION_FOCUS,
  createTemplateFakeAdapter, demoTeachingVoice, generateLesson, graphToScript, hasTeachingCue, isSecondPersonSentence, isThirdPersonSentence, reviseLesson, templateLesson, validateLessonRules, validateTeachingVoice,
  type LessonScene, type LessonScript, type StructuredRequest,
} from '../src';
import * as client from '../src/client';

const scene = (over: Partial<LessonScene> & Pick<LessonScene, 'id' | 'type'>): LessonScene => ({
  title: over.id, text: '', narration: '', motionPrompt: '', objectiveIds: [], next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null, ...over,
});
const CAST = ['Carla', 'Renata'];

/** Aula na voz de ensino: mentor falando com você; consequências como feedback. */
function goodScript(): LessonScript {
  return {
    rationale: 'ok',
    scenes: [
      scene({ id: 'situacao', type: 'scenario', title: 'Situação', text: 'O que você vai treinar: dizer por que quer a vaga\n\nTerça, dez horas: Carla, a recrutadora, pergunta por que você quer esta vaga. Você precisa decidir como responder.', narration: 'Terça, dez horas. A recrutadora pergunta por que você quer esta vaga. O que você responde?', next: 'decisao' }),
      scene({ id: 'decisao', type: 'choice', title: 'O que você responde?', text: 'O que você responde a Carla?', objectiveIds: [], options: [
        { id: 'generico', label: 'Dizer que a empresa é ótima e você precisa trabalhar.', feedback: '', next: 'c_generico', correct: false },
        { id: 'limite', label: 'Falar de um limite real, do impacto e de uma ação.', feedback: '', next: 'c_limite', correct: false },
        { id: 'decorado', label: 'Recitar a missão da empresa que você leu no site.', feedback: '', next: 'c_decorado', correct: false },
      ] }),
      scene({ id: 'c_generico', type: 'consequence', title: 'Genérico', text: 'Você respondeu de forma genérica e a conversa esfriou. Não funciona porque não mostra critério. Faça assim: ligue a vaga a algo que você já fez.', narration: 'Você foi genérico. Não funciona porque qualquer pessoa diria isso. Faça assim: conte um exemplo seu.', tone: 'negative', next: 'dica' }),
      scene({ id: 'c_limite', type: 'consequence', title: 'Limite real', text: 'Você respondeu com um limite real, o impacto e uma ação concreta. Funciona porque a recrutadora vê critério, não desculpa. Faça assim: nomeie o limite, diga o efeito e proponha o próximo passo.', tone: 'positive', guidance: 'Limite, impacto e ação: a fórmula que mostra maturidade.', next: 'dica' }),
      scene({ id: 'c_decorado', type: 'consequence', title: 'Decorado', text: 'Você recitou o site e soou decorado. Funciona pela metade porque mostra preparo, mas não mostra você. Prefira ligar a missão a uma experiência sua.', tone: 'neutral', next: 'dica' }),
      scene({ id: 'dica', type: 'content', title: 'Dica', text: '- Leve dois exemplos seus anotados.\n- Ligue a vaga a algo que você já fez.\n- Termine com uma pergunta sobre o dia a dia.', next: 'fim' }),
      scene({ id: 'fim', type: 'end', title: 'Fim', text: 'Você praticou responder por que quer a vaga. Antes da próxima entrevista, anote dois exemplos seus.\n\nO que você levou:\n- Um exemplo seu vale mais que elogio.\n- Limite, impacto e ação mostram critério.' }),
    ],
  };
}

/** A saída ruim que motivou as regras: narra a entrevistadora em vez de ensinar. */
const BAD_CONSEQUENCE = 'Carla anota e segue interessada. A resposta funciona porque mostra um limite profissional e um plano.';

describe('heurísticas de voz', () => {
  it('reconhece frases em segunda pessoa (você, sua, imperativo) e em terceira (ele/ela, papel, nome do elenco)', () => {
    expect(isSecondPersonSentence('Você respondeu com um limite real.')).toBe(true);
    expect(isSecondPersonSentence('Leve duas perguntas anotadas.')).toBe(true);
    expect(isSecondPersonSentence('Sua resposta mostrou critério.')).toBe(true);
    expect(isSecondPersonSentence('Carla anota e segue interessada.')).toBe(false);
    expect(isThirdPersonSentence('Carla anota e segue interessada.', CAST)).toBe(true);
    expect(isThirdPersonSentence('Ela sorri e muda de assunto.')).toBe(true);
    expect(isThirdPersonSentence('O gestor pergunta por que você não avisou.')).toBe(true);
    expect(isThirdPersonSentence('E então a recrutadora anota alguma coisa.')).toBe(true);
    // nome + verbo no meio da frase, sem marca de segunda pessoa
    expect(isThirdPersonSentence('Depois disso Renata franze a testa.', CAST)).toBe(true);
    // com "você" na frase, o elenco é contexto, não sujeito da narração
    expect(isThirdPersonSentence('Você respondeu com um limite real e Carla anotou.', CAST)).toBe(false);
    expect(isThirdPersonSentence('A resposta funciona porque mostra um limite.', CAST)).toBe(false);
    expect(isThirdPersonSentence('Carla, a recrutadora, está do outro lado da chamada.', [])).toBe(false);
    expect(IMPERATIVE_VERBS.length).toBeGreaterThanOrEqual(40);
  });

  it('pistas de ensino: porquê, regra ou movimento melhor no imperativo', () => {
    expect(hasTeachingCue('Funciona porque mostra critério.')).toBe(true);
    expect(hasTeachingCue('Faça assim: nomeie o limite.')).toBe(true);
    expect(hasTeachingCue('Leve dois exemplos anotados.')).toBe(true);
    expect(hasTeachingCue('Carla anota e segue interessada.')).toBe(false);
    expect(hasTeachingCue('Ela vai até o Compras e termina a planilha às 20h.')).toBe(false);
  });
});

describe('validateTeachingVoice', () => {
  it('aceita a aula na voz de ensino', () => {
    expect(validateTeachingVoice(goodScript(), { castNames: CAST })).toEqual([]);
    expect(validateLessonRules(goodScript(), { castNames: CAST })).toEqual([]);
  });

  it('a consequência que narra a entrevistadora volta com THIRD_PERSON_NARRATION e cita a frase', () => {
    const s = goodScript();
    s.scenes = s.scenes.map((sc) => (sc.id === 'c_limite' ? { ...sc, text: BAD_CONSEQUENCE, guidance: null } : sc));
    const issues = validateTeachingVoice(s, { castNames: CAST });
    expect(issues.map((i) => i.code)).toEqual(['THIRD_PERSON_NARRATION']);
    expect(issues[0]!.sceneId).toBe('c_limite');
    // 1 de 2 frases narra o elenco (50% > 40%): a mensagem cita a frase e pede o feedback ao aluno
    expect(issues[0]!.message).toMatch(/cena "Limite real" \(c_limite\): 1 de 2 frases narram o elenco em terceira pessoa \(ex\.: "Carla anota e segue interessada\."\)/);
    expect(issues[0]!.message).toMatch(/comece pelo que você fez/);
    // sem o elenco informado a primeira frase não é reconhecida como narração do elenco, mas a falta de "você" nas duas primeiras frases continua a valer
    const noCast = validateTeachingVoice(s);
    expect(noCast.map((i) => i.code)).toEqual(['THIRD_PERSON_NARRATION']);
    expect(noCast[0]!.message).toMatch(/a consequência não fala com o aluno nas primeiras frases da tela \("Carla anota e segue interessada\./);
    expect(noCast[0]!.message).toMatch(/comece pelo que VOCÊ fez/);
  });

  it('mais de 40% das frases narrando o elenco (tela ou fala) devolve a cena; consequência sem porquê é NOT_TEACHING', () => {
    const s = goodScript();
    s.scenes = s.scenes.map((sc) => {
      if (sc.id === 'situacao') return { ...sc, text: 'Carla abre a chamada. Ela sorri e olha a ficha. Renata entra na sala. Você precisa decidir o que dizer.', narration: '' };
      if (sc.id === 'c_generico') return { ...sc, text: 'Você respondeu de forma genérica. A conversa esfriou e a recrutadora passou para a próxima pergunta.', narration: '', guidance: null };
      if (sc.id === 'c_decorado') return { ...sc, narration: 'Ela anota. Ela sorri. Ela muda de assunto. Você percebe que soou decorado.' };
      return sc;
    });
    const issues = validateTeachingVoice(s, { castNames: CAST });
    const byScene = Object.fromEntries(issues.map((i) => [`${i.sceneId}:${i.code}`, i.message]));
    expect(byScene['situacao:THIRD_PERSON_NARRATION']).toMatch(/3 de 4 frases narram o elenco em terceira pessoa \(ex\.: "Carla abre a chamada\."\)/);
    expect(byScene['c_generico:NOT_TEACHING']).toMatch(/não ensina nada explícito/);
    expect(byScene['c_decorado:THIRD_PERSON_NARRATION']).toMatch(/3 de 7 frases narram o elenco/);
    expect(issues.some((i) => i.sceneId === 'c_limite')).toBe(false);
  });

  it('cenas de conteúdo expositivas sem regra nem instrução são NOT_TEACHING; a Dica em imperativo passa', () => {
    const s = goodScript();
    s.scenes.splice(6, 0, scene({ id: 'historia', type: 'content', title: 'O que aconteceu', text: 'A entrevista durou vinte minutos. Depois a equipe se reuniu para decidir.', next: 'fim' }));
    const issues = validateTeachingVoice(s, { castNames: CAST });
    expect(issues).toEqual([{ code: 'NOT_TEACHING', sceneId: 'historia', message: expect.stringMatching(/a cena de conteúdo não ensina nada explícito/) }]);
  });

  it('a verificação, a reflexão e o encerramento não entram nas regras de voz', () => {
    const s = goodScript();
    s.scenes = s.scenes.map((sc) => (sc.type === 'end' ? { ...sc, text: 'Carla encerra a entrevista. Ela agradece.' } : sc));
    expect(validateTeachingVoice(s, { castNames: CAST })).toEqual([]);
  });
});

describe('geração e revisão exigem a voz de ensino', () => {
  const lessonArgs = {
    title: 'Curso', brief: { tema: 'entrevista' }, objectives: [{ id: 'obj', title: 'Responder', criterion: 'x' }],
    lesson: { id: 'aula_1', title: 'Responder por que quer a vaga', description: '', family: 'decision_consequence', estimatedMinutes: 3, objectiveIds: ['obj'] },
    otherLessons: [], sourcesExcerpt: '', cast: [{ name: 'Carla', role: 'recrutadora', details: 'entrevista por vídeo' }],
  };

  it('generateLesson devolve a consequência narrada ao modelo com o erro de voz e aceita o reparo', async () => {
    const bad = goodScript();
    bad.scenes = bad.scenes.map((sc) => (sc.id === 'c_limite' ? { ...sc, text: BAD_CONSEQUENCE, guidance: null } : sc));
    const fake = new FakeLlmAdapter({ lesson: bad, lesson_repair: goodScript() });
    const r = await generateLesson({ primary: fake }, lessonArgs);
    expect(fake.calls.map((c) => c.task)).toEqual(['lesson', 'lesson_repair']);
    expect(fake.calls[1]!.input).toMatch(/THIRD_PERSON_NARRATION: cena "Limite real" \(c_limite\)/);
    expect(r.issues.errors).toBe(0);
    expect(r.meta.repairs).toBe(1);
  });

  it('revisão com foco teaching exige a voz (erro); com foco tone a voz vira aviso', async () => {
    const bad = goodScript();
    bad.scenes = bad.scenes.map((sc) => (sc.id === 'c_limite' ? { ...sc, text: BAD_CONSEQUENCE, guidance: null } : sc));
    const graph = (await import('../src')).scriptToGraph(goodScript());
    const fake = new FakeLlmAdapter({ revise_lesson: bad, revise_lesson_repair: bad });
    const teaching = await reviseLesson({ primary: fake }, { ...lessonArgs, graph, focus: 'teaching' }, { maxRepairs: 1 });
    expect(teaching.meta.repairs).toBe(1);
    expect(teaching.issues.errors).toBe(1);
    const tone = await reviseLesson({ primary: new FakeLlmAdapter({ revise_lesson: bad }) }, { ...lessonArgs, graph, focus: 'tone' });
    expect(tone.meta.repairs).toBe(0);
    expect(tone.issues.errors).toBe(0);
    expect(tone.issues.warnings).toBeGreaterThan(0);
    // revisão restrita a uma cena: só erros dessa cena contam
    const scoped = await reviseLesson({ primary: new FakeLlmAdapter({ revise_lesson: bad }) }, { ...lessonArgs, graph, focus: 'teaching', nodeIds: ['c_generico'] });
    expect(scoped.issues.errors).toBe(0);
  });

  it('a revisão de demonstração com foco teaching passa a aula do curso-exemplo para a voz de ensino, sem mudar ids', async () => {
    const lesson1 = allLessons(comunicacaoPrimeiroEmprego)[0]!;
    const before = graphToScript(lesson1.graph);
    expect(validateTeachingVoice(before, { castNames: comunicacaoPrimeiroEmprego.cast.map((c) => c.name) }).length).toBeGreaterThan(0);
    const objectives = comunicacaoPrimeiroEmprego.objectives.map((o) => ({ id: o.id, title: o.title, criterion: o.criterion }));
    const r = await reviseLesson({ primary: createTemplateFakeAdapter() }, { ...lessonArgs, objectives, lesson: { ...lessonArgs.lesson, id: lesson1.id, family: lesson1.family, objectiveIds: lesson1.objectiveIds }, cast: comunicacaoPrimeiroEmprego.cast, graph: lesson1.graph, focus: 'teaching' });
    expect(r.issues.errors).toBe(0);
    expect(r.meta.repairs).toBe(0);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(lesson1.graph.nodes.map((n) => n.id));
    expect(r.rationale).toMatch(/Voz de ensino/);
    const after = graphToScript(r.graph);
    const cons = after.scenes.find((s) => s.id === 'cons_recusa')!;
    expect(cons.text).toMatch(/^Você escolheu: /);
  });

  it('demoTeachingVoice e templateLesson produzem roteiros que passam nas regras', () => {
    const req = { task: 'lesson', input: '<aula>\ntítulo: Aula\nobjetivos: obj_x\nverificação permitida: não\n</aula>\n\n<elenco>\n- Carla: recrutadora. ficha\n</elenco>' } as unknown as StructuredRequest<unknown>;
    expect(validateLessonRules(templateLesson(req), { castNames: ['Carla'] })).toEqual([]);
    const bad = goodScript();
    bad.scenes = bad.scenes.map((sc) => (sc.id === 'c_limite' ? { ...sc, text: BAD_CONSEQUENCE, narration: BAD_CONSEQUENCE, guidance: null } : sc));
    const fixed = demoTeachingVoice(bad, CAST);
    expect(validateTeachingVoice(fixed, { castNames: CAST })).toEqual([]);
    expect(fixed.scenes.find((s) => s.id === 'c_limite')!.text).toMatch(/^Você escolheu: Falar de um limite real/);
  });
});

describe('prompts e focos', () => {
  it('as regras de voz de ensino estão no sistema, na tarefa de aula e na revisão, com exemplo bom e ruim', () => {
    expect(SYSTEM_DESIGNER).toContain(TEACHING_VOICE_RULES);
    expect(TEACHING_VOICE_RULES).toMatch(/1\. A pessoa apresentadora é mentora/);
    expect(TEACHING_VOICE_RULES).toMatch(/Exemplo ruim \(consequência\): "Carla anota e segue interessada/);
    expect(TEACHING_VOICE_RULES).toMatch(/Exemplo bom: "Você respondeu com um limite real/);
    expect(TASK_LESSON).toMatch(/É feedback direto ao aluno: começa pelo que VOCÊ fez/);
    expect(TASK_LESSON).toMatch(/em até duas frases, terminando com o que você precisa decidir/);
    expect(TASK_REVISE).toMatch(/Nos focos "teaching", "shorten" e "practical" as regras de voz de ensino também são verificadas/);
    expect(REVISION_FOCUS).toContain('teaching');
    expect(REVISION_FOCUS_LABELS.teaching).toBe('Voz de ensino: mentor falando com você');
    expect(REVISION_FOCUS_INSTRUCTIONS.teaching).toMatch(/VOZ DE ENSINO/);
    expect(VOICE_REVISION_FOCUS).toEqual(['teaching', 'shorten', 'practical']);
    expect(client.REVISION_FOCUS_LABELS.teaching).toBeDefined();
    expect(client.VOICE_REVISION_FOCUS).toEqual(VOICE_REVISION_FOCUS);
  });
});
