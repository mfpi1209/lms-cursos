import { SAFE_GESTURES, gestureKey, nextChipsCamera, zoneTalkCamera, type CinematicAction, type GestureMood, type ZoneCameraSet } from '@lms/course-schema';
import type { StructuredRequest } from './adapter';
import { CARD_MAX_WORDS, CARD_MIN_WORDS, CINEMATIC_MAX_WORDS, CINEMATIC_MIN_WORDS, MAX_SHOT_WORDS, MIN_SHOT_WORDS } from './capabilities';
import { FakeLlmAdapter } from './fake';
import { splitSentences } from './sentences';
import { LessonScriptSchema, type DirectionShotProposal, type LessonScene, type LessonScript, type OutlineProposal, type SceneDirectionProposal, type SceneVariations } from './schemas';
import { CAPPED_REVISION_FOCUS, VOICE_REVISION_FOCUS } from './schemas';
import { LESSON_CAPS, TAKEAWAYS_TITLE, TRAINING_OPENER, VOICE_SCENE_TYPES, hasTeachingCue, hasTrainingOpener, isBeginnerAudience, isDicaScene, isSecondPersonSentence, isThirdPersonSentence, maxScenesFor, outlineTargets, takeawayBullets } from './lesson-rules';

/**
 * Propostas-modelo determinísticas para o modo de DEMONSTRAÇÃO (AI_PROVIDER=fake).
 * Servem para testar o fluxo do assistente sem provedor real. O conteúdo é
 * genérico e marcado como modelo; não substitui a geração com IA.
 */
function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
}

function field(input: string, name: string): string {
  const m = new RegExp(`^${name}: (.*)$`, 'm').exec(input);
  return m?.[1]?.trim() ?? '';
}

/** Modelos de aula da demonstração (ciclados conforme a quantidade de aulas alvo). */
const DEMO_LESSONS: Array<{ slug: string; title: (topic: string) => string; description: string; family: OutlineProposal['modules'][number]['lessons'][number]['family']; familyRationale: string; keyScenes: string[] }> = [
  { slug: 'decidir', title: (t) => `Uma decisão difícil em ${t}`, description: 'Um pedido inesperado exige resposta hoje; você decide, vê a consequência e sai com três dicas.', family: 'decision_consequence', familyRationale: 'O objetivo é decidir; a prática começa pela decisão.', keyScenes: ['Pedido inesperado', 'Decisão com 3 opções', 'Consequências', 'Dica'] },
  { slug: 'corrigir', title: (t) => `Corrigir um erro em ${t}`, description: 'Uma informação saiu errada; você escolhe como corrigir e vê o efeito em quem foi afetado.', family: 'production_review', familyRationale: 'Corrigir exige produzir uma resposta curta e revisá-la.', keyScenes: ['Mensagem com erro', 'Como corrigir', 'Consequências', 'Na prática'] },
  { slug: 'pedir_ajuda', title: (t) => `Pedir ajuda sem travar em ${t}`, description: 'Você empaca numa tarefa; decide quando e como pedir ajuda e vê como a equipe reage.', family: 'decision_consequence', familyRationale: 'Pedir ajuda é uma decisão de momento e forma.', keyScenes: ['Tarefa travada', 'Pedir ou insistir?', 'Consequências', 'Dica'] },
  { slug: 'combinar_prazo', title: (t) => `Combinar um prazo realista em ${t}`, description: 'Um prazo não fecha; você escolhe como avisar e propõe um caminho.', family: 'procedure', familyRationale: 'Avisar cedo com fatos é um procedimento que se aprende aplicando.', keyScenes: ['Prazo apertado', 'O que você diz', 'Consequências', 'Dica'] },
  { slug: 'receber_feedback', title: (t) => `Receber um retorno difícil em ${t}`, description: 'Seu gestor aponta um erro na frente de outros; você decide como reagir.', family: 'dialogue', familyRationale: 'A reação acontece em diálogo, turno a turno.', keyScenes: ['O comentário', 'Como responder', 'Consequências', 'Na prática'] },
];

/** Aulas de <estrutura_atual> (id, título, se tem cenas), na ordem; vazio sem o bloco. */
export function currentLessonsFromInput(input: string): Array<{ id: string; title: string; hasScenes: boolean }> {
  const block = /<estrutura_atual>\n([\s\S]*?)\n<\/estrutura_atual>/.exec(input)?.[1] ?? '';
  return [...block.matchAll(/^\s+- aula \[([^\]]+)\] (.*?) — (\d+ cenas escritas|sem cenas)/gm)].map((m) => ({ id: m[1]!, title: m[2]!.trim(), hasScenes: m[3]!.startsWith('sem') === false }));
}

/**
 * Estrutura de demonstração: a quantidade de aulas vem de <alvo> (aulas_alvo,
 * mínimo da faixa; 15 min → 4 aulas), cada uma com cerca de 3 minutos e 4 a 5
 * cenas principais. Com <estrutura_atual>, as aulas que continuam mantêm o id
 * (e as que já têm cenas mantêm também o título); <pedido_do_autor> com "menos
 * aulas" tira uma aula (a última), "mais aulas" acrescenta uma; as removidas
 * vão em removedLessonIds.
 */
export function templateOutline(req: StructuredRequest<unknown>): OutlineProposal {
  const title = field(req.input, 'Título') || 'Curso';
  const topic = field(req.input, 'tema') || title;
  const skill = field(req.input, 'habilidade_final') || `aplicar ${topic} em situações reais`;
  const base = slug(topic);
  const alvo = /aulas_alvo: (\d+)/.exec(req.input)?.[1];
  const current = currentLessonsFromInput(req.input);
  const request = (/<pedido_do_autor>\n([\s\S]*?)\n<\/pedido_do_autor>/.exec(req.input)?.[1] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fewer = /\bmenos aulas?\b|\bmais curto\b|\breduz/.test(request);
  const more = /\bmais aulas?\b|\bmais longo\b|\bacrescent/.test(request);
  const baseCount = current.length || (alvo ? Number(alvo) : outlineTargets(Number(field(req.input, 'duracao_alvo_min')) || undefined).lessonsMin);
  const count = Math.max(1, Math.min(12, baseCount + (fewer ? -1 : 0) + (more ? 1 : 0)));
  const objectives = [
    { id: `obj_${base}_decidir`, title: `Decidir com critério em uma situação de ${topic}`.slice(0, 200), criterion: 'Escolhe a alternativa que avisa cedo, mostra fatos e propõe um caminho.', required: true },
    { id: `obj_${base}_aplicar`, title: `Aplicar ${skill}`.slice(0, 200), criterion: 'Produz uma resposta própria com os elementos essenciais.', required: true },
  ];
  const usedIds = new Set<string>();
  const lessons = Array.from({ length: count }, (_, i) => {
    const d = DEMO_LESSONS[i % DEMO_LESSONS.length]!;
    const round = Math.floor(i / DEMO_LESSONS.length);
    const kept = current[i];
    let id = kept?.id ?? `aula_${base}_${i + 1}`.slice(0, 64);
    while (usedIds.has(id)) id = `${id}_n`.slice(0, 64);
    usedIds.add(id);
    return {
      id,
      title: kept?.hasScenes ? kept.title : `${d.title(topic)}${round ? ` (${round + 1})` : ''}`.slice(0, 160),
      description: d.description,
      family: d.family,
      familyRationale: d.familyRationale,
      estimatedMinutes: LESSON_CAPS.minutesPerLesson,
      objectiveIds: [objectives[i % 2]!.id],
      keyScenes: d.keyScenes,
    };
  });
  const removedLessonIds = current.filter((c) => !usedIds.has(c.id)).map((c) => c.id);
  return {
    cast: [{ name: 'Carla', role: 'recrutadora da empresa fictícia', details: 'Conduz a primeira conversa, por vídeo, numa terça às dez horas.' }],
    rationale: `[MODELO DE DEMONSTRAÇÃO] ${count} ${count === 1 ? 'aula curta' : 'aulas curtas'} (cerca de ${LESSON_CAPS.minutesPerLesson} min cada): situação, uma decisão com três opções, consequências e uma dica prática.${current.length ? ` Aulas que continuam mantêm o identificador${removedLessonIds.length ? `; ${removedLessonIds.length} ${removedLessonIds.length === 1 ? 'aula removida' : 'aulas removidas'} a pedido` : ''}.` : ''} Substitua ou gere com um provedor real para conteúdo específico sobre "${topic}".`,
    removedLessonIds,
    objectives,
    modules: [{ id: `mod_${base}`, title: `Situações de ${topic}`.slice(0, 160), description: `${count} ${count === 1 ? 'aula curta' : 'aulas curtas'}, cada uma com uma decisão real e dicas práticas.`, lessons }],
  };
}

const sceneBase = { narration: '', motionPrompt: '', next: null, options: null, tone: null, guidance: null, assessment: null, reflection: null } as const;

/** Cena "Dica" da demonstração (content, 3 tópicos em imperativo, um por linha). */
export function demoDicaScene(next: string, objectiveIds: string[]): LessonScene {
  return { ...sceneBase, id: 'dica', type: 'content', title: 'Dica', text: 'Na próxima vez que surgir um pedido assim:\n- Levante os fatos antes de responder.\n- Proponha um caminho concreto, com data.\n- Alinhe com quem decide e confirme por mensagem.', objectiveIds, next };
}

/**
 * Aula de demonstração, dentro dos limites: situação → decisão com 3 opções →
 * uma consequência por opção → Dica → (reflexão, ou verificação na última
 * aula) → encerramento. 7 cenas sem contar o encerramento.
 */
export function templateLesson(req: StructuredRequest<unknown>): LessonScript {
  const lessonTitle = field(req.input, 'título') || 'Aula';
  const lessonObjectives = (field(req.input, 'objetivos') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const objectives = (/<objetivos>\n([\s\S]*?)\n<\/objetivos>/.exec(req.input)?.[1] ?? '').split('\n').map((l) => /- ([^:]+):/.exec(l)?.[1]).filter((x): x is string => !!x);
  const obj = (lessonObjectives.length ? lessonObjectives : objectives).slice(0, 1);
  const isRepair = req.task === 'lesson_repair';
  const allowAssessment = field(req.input, 'verificação permitida') === 'sim';
  // público iniciante/tímido: nada de escrita obrigatória — sem reflexão, a Dica leva ao encerramento
  const beginner = isBeginnerAudience(/<briefing>\n([\s\S]*?)\n<\/briefing>/.exec(req.input)?.[1] ?? '');
  const afterDica = allowAssessment ? 'verificacao' : beginner ? 'fim' : 'reflexao';
  const closing: LessonScene = allowAssessment
    ? { ...sceneBase, id: 'verificacao', type: 'assessment', title: 'Verificação', text: 'Diante de um pedido que não dá para atender como foi feito, qual é a melhor primeira ação?', objectiveIds: obj, next: 'fim', options: [
        { id: 'a', label: 'Aceitar e tentar dar conta.', feedback: 'Esconde o risco.', next: null, correct: false },
        { id: 'b', label: 'Levantar os fatos e propor uma alternativa a quem decide.', feedback: '', next: null, correct: true },
        { id: 'c', label: 'Recusar sem explicar.', feedback: 'Fecha portas.', next: null, correct: false },
      ], assessment: { mode: 'single', passing: 'all_correct', minCorrect: null, maxAttempts: 2, feedbackPassed: 'Exato: fatos, proposta e alinhamento.', feedbackFailed: 'Releia a dica.' } }
    : { ...sceneBase, id: 'reflexao', type: 'reflection', title: 'Sua situação', text: 'Lembre de um pedido parecido que você recebeu. O que faria diferente com essas três dicas?', objectiveIds: obj, next: 'fim', reflection: { minLength: 40, maxLength: 1200, placeholder: 'Descreva a situação e o que faria…' } };
  return {
    rationale: `[MODELO DE DEMONSTRAÇÃO${isRepair ? ' — reparo' : ''}] Roteiro curto para "${lessonTitle}": situação, decisão com três opções plausíveis, uma consequência por opção, dica prática${allowAssessment ? ' e verificação' : beginner ? ' (público iniciante: sem escrita obrigatória; a decisão serve para treinar em voz alta, opcional)' : ' e reflexão'}. Todo o conteúdo é exemplo fictício.`,
    scenes: [
      { ...sceneBase, id: 'situacao', type: 'scenario', title: 'A situação', text: `${demoOpener(lessonTitle)}\n\nPrimeiro mês de trabalho: uma situação ligada a "${clipWords(lessonTitle, 6)}" exige resposta sua ainda hoje. Você precisa decidir como responder.`.slice(0, 4000), narration: DEMO_NARRATION.situacao(lessonTitle), motionPrompt: 'smiles softly, welcoming', objectiveIds: [], next: 'decisao' },
      { ...sceneBase, id: 'decisao', type: 'choice', title: 'O que você faz?', text: 'Pense no que está em jogo para você, para a equipe e para quem depende do resultado. O que você faz?', narration: DEMO_NARRATION.decisao, motionPrompt: 'leans in slightly, curious', objectiveIds: obj, options: [
        { id: 'adiar', label: 'Adiar a resposta e ver se se resolve sozinho.', feedback: 'Ganhar tempo parece seguro, mas transfere o problema para depois.', next: 'cons_adiar', correct: false },
        { id: 'responder_so', label: 'Responder do seu jeito, sem consultar ninguém.', feedback: 'Iniciativa é boa; sem alinhamento pode custar caro.', next: 'cons_so', correct: false },
        { id: 'alinhar', label: 'Levantar os fatos, propor um caminho e alinhar.', feedback: 'Fatos, proposta e alinhamento tornam uma resposta confiável.', next: 'cons_alinhar', correct: false },
      ] },
      { ...sceneBase, id: 'cons_adiar', type: 'consequence', title: 'No dia seguinte', text: 'Você adiou e o problema cresceu. Não funciona porque notícia ruim não melhora com o tempo. Faça assim: avise no mesmo dia, com os fatos.', narration: DEMO_NARRATION.cons_adiar, motionPrompt: 'shakes the head slightly, concerned', objectiveIds: [], next: 'dica', tone: 'negative', guidance: 'Avise cedo: quem sabe antes ainda pode agir.' },
      { ...sceneBase, id: 'cons_so', type: 'consequence', title: 'Resolvido, mas…', text: 'Você agiu rápido, mas sem alinhar, e parte do acordo teve de ser refeita. Funciona pela metade porque faltou combinar. Faça assim: proponha e confirme antes de executar.', objectiveIds: [], next: 'dica', tone: 'neutral', guidance: 'Agir é melhor que esperar; agir alinhado é melhor ainda.' },
      { ...sceneBase, id: 'cons_alinhar', type: 'consequence', title: 'Caminho combinado', text: 'Você trouxe os fatos e uma proposta, e em dez minutos o plano ficou fechado. Funciona porque quem decide ganha clareza e você ganha autonomia. Faça assim sempre que o prazo apertar.', objectiveIds: [], next: 'dica', tone: 'positive', guidance: 'Fatos mais proposta: é assim que você ganha autonomia.' },
      demoDicaScene(afterDica, obj),
      ...(beginner && !allowAssessment ? [] : [closing]),
      { ...sceneBase, id: 'fim', type: 'end', title: 'Encerramento', text: `Você praticou decidir com critério em "${lessonTitle}". Leve as três dicas para a próxima situação.\n\n${DEMO_TAKEAWAYS}`.slice(0, 4000), objectiveIds: [] },
    ],
  };
}

/**
 * Falas da demonstração: contínuas e conversadas ("a gente", "então", "vamos
 * por partes"), 60–120 palavras nas cenas principais; as palavras-chave ficam
 * na tela e nos cartões, nunca lidas como lista.
 */
const DEMO_NARRATION = {
  situacao: (lessonTitle: string) =>
    `Oi, que bom ter você aqui. Hoje a gente vai falar sobre ${clipWords(lessonTitle.replace(/^uma?\s+/i, '').toLowerCase(), 6)}, e eu quero começar por uma situação bem real. Imagina que você está no primeiro mês de trabalho, ainda conhecendo a equipe, e chega um pedido que precisa de resposta ainda hoje. Então vamos por partes. Começando por você: o que passa pela sua cabeça nessa hora? Dá vontade de resolver rápido, eu sei, mas a resposta que você dá agora diz muito sobre como as pessoas vão confiar em você daqui para a frente. Olha a situação com calma, porque daqui a pouco é você quem decide.`,
  decisao:
    'Então agora é com você. Pensa no que está em jogo: para você, para a equipe e para quem depende do resultado. Não existe resposta mágica, existe a resposta que mostra critério. A gente vai ver três caminhos possíveis, todos bem comuns no dia a dia, e cada um leva a um lugar diferente. Escolhe o que você faria de verdade, não o que parece bonito, porque é assim que o treino funciona.',
  cons_adiar:
    'Você escolheu adiar, e eu entendo, porque ganhar tempo parece seguro. Só que no dia seguinte o problema cresceu, e agora você precisa explicar duas coisas: o que aconteceu e por que ninguém soube antes. Então faça assim: avise no mesmo dia, com os fatos na mão, e proponha um próximo passo. Notícia ruim não melhora com o tempo.',
} as const;

/** Linha de abertura da demonstração: o objetivo em palavras do aluno (até 14 palavras). */
function demoOpener(lessonTitle: string): string {
  const what = clipWords(lessonTitle.replace(/^uma?\s+/i, '').toLowerCase(), 5);
  return `${TRAINING_OPENER}: decidir com critério em ${what}`;
}

/** Bloco "O que você levou" da demonstração (3 tópicos derivados das três consequências). */
const DEMO_TAKEAWAYS = `${TAKEAWAYS_TITLE}:\n- Adiar não resolve: notícia ruim não melhora com o tempo.\n- Agir sem alinhar custa retrabalho.\n- Fatos mais proposta é o que dá autonomia.`;

/** Garante a abertura "O que você vai treinar" e o bloco "O que você levou" num roteiro (demonstração). */
export function ensureDidactic(script: LessonScript, lessonTitle = 'esta situação'): LessonScript {
  return {
    ...script,
    scenes: script.scenes.map((s, i) => {
      if (i === 0 && !hasTrainingOpener(s.text)) {
        const opener = demoOpener(lessonTitle);
        const cap = s.type === 'content' ? LESSON_CAPS.maxContentWords : s.type === 'consequence' ? LESSON_CAPS.maxConsequenceWords : LESSON_CAPS.maxScreenWords;
        return { ...s, text: `${opener}\n\n${clipWords(s.text, Math.max(6, cap - wc(opener)))}`.slice(0, 4000) };
      }
      if (s.type === 'end' && takeawayBullets(s.text).length < LESSON_CAPS.takeawaysMin) return { ...s, text: `${clipWords(s.text, Math.max(6, LESSON_CAPS.maxEndWords - 24))}\n\n${DEMO_TAKEAWAYS}`.slice(0, 4000) };
      return s;
    }),
  };
}

/** Lê o roteiro atual enviado no bloco <roteiro_atual> (entrada da revisão e das variações). */
function currentScript(input: string): LessonScript {
  const raw = /<roteiro_atual>\n([\s\S]*?)\n<\/roteiro_atual>/.exec(input)?.[1];
  if (!raw) throw new Error('modelo de demonstração: entrada sem <roteiro_atual>');
  return LessonScriptSchema.parse(JSON.parse(raw));
}

const REVISED = ' (revisado)';
function markRevised(title: string): string {
  return title.endsWith(REVISED) ? title : `${title.slice(0, 120 - REVISED.length)}${REVISED}`;
}

/** Corta um texto em N palavras (demonstração), fechando com reticências quando cortar. */
function clipWords(t: string, max: number): string {
  const w = t.trim().split(/\s+/).filter(Boolean);
  return w.length <= max ? t.trim() : `${w.slice(0, max - 1).join(' ')}…`;
}

/**
 * Encurtamento de demonstração (focos shorten/practical): mantém, com os MESMOS
 * ids, a primeira situação (se houver), a primeira decisão com 3 opções, uma
 * consequência por opção e o encerramento; acrescenta a cena "Dica" se faltar;
 * corta textos acima dos limites. Cenas descartadas somem; destinos são religados.
 */
export function demoShortenScript(script: LessonScript, opts: { family?: string; allowAssessment?: boolean } = {}): LessonScript {
  const scenes = script.scenes;
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const end = scenes.find((s) => s.type === 'end') ?? { ...sceneBase, id: 'fim', type: 'end' as const, title: 'Encerramento', text: 'Você praticou decidir com critério. Leve as dicas para a próxima situação.', objectiveIds: [] };
  const choice = scenes.find((s) => s.type === 'choice');
  const situation = scenes.find((s) => s.type === 'scenario' && s.id !== choice?.id);
  const dica = scenes.find(isDicaScene) ?? demoDicaScene(end.id, choice?.objectiveIds ?? []);
  const clipScene = (s: LessonScene): LessonScene => ({
    ...s,
    text: clipWords(s.text, s.type === 'content' ? LESSON_CAPS.maxContentWords : s.type === 'consequence' ? LESSON_CAPS.maxConsequenceWords : s.type === 'reflection' ? LESSON_CAPS.maxReflectionWords : s.type === 'assessment' ? LESSON_CAPS.maxAssessmentWords : LESSON_CAPS.maxScreenWords),
    narration: clipWords(s.narration, s.type === 'consequence' ? LESSON_CAPS.maxConsequenceNarrationWords : LESSON_CAPS.maxNarrationWords),
  });
  const out: LessonScene[] = [];
  if (situation) out.push(clipScene({ ...situation, next: choice ? choice.id : dica.id }));
  if (choice) {
    const options = (choice.options ?? []).slice(0, LESSON_CAPS.choiceOptions).map((o) => ({ ...o, label: clipWords(o.label, LESSON_CAPS.maxOptionWords) }));
    while (options.length < LESSON_CAPS.choiceOptions) options.push({ id: `opcao_${options.length + 1}`, label: 'Pedir um tempo para levantar os fatos.', feedback: 'Ganhar clareza antes de agir ajuda, se for rápido.', next: null, correct: false });
    const consequences = options.map((o, i) => {
      const existing = o.next ? byId.get(o.next) : undefined;
      const base: LessonScene = existing?.type === 'consequence' ? existing : { ...sceneBase, id: `cons_${o.id}`.slice(0, 64), type: 'consequence', title: `Depois de ${['adiar', 'agir só', 'alinhar'][i] ?? 'decidir'}`, text: 'Você escolheu esse caminho e o efeito aparece no dia seguinte. Funciona só se você avisar cedo. Faça assim: diga o que falta e proponha uma data.', objectiveIds: [], tone: 'neutral', guidance: 'O que levar disso: avise cedo e proponha.' };
      return clipScene({ ...base, next: dica.id });
    });
    // duas opções com o mesmo destino: a segunda ganha a própria consequência
    const seen = new Set<string>();
    const fixedOptions = options.map((o, i) => {
      let c = consequences[i]!;
      if (seen.has(c.id)) c = { ...c, id: `${c.id}_${i + 1}`.slice(0, 64) };
      seen.add(c.id);
      consequences[i] = c;
      return { ...o, next: c.id };
    });
    out.push(clipScene({ ...choice, options: fixedOptions }), ...consequences);
  }
  const extras: LessonScene[] = [];
  const reflection = scenes.find((s) => s.type === 'reflection');
  const assessment = opts.allowAssessment ? scenes.find((s) => s.type === 'assessment') : undefined;
  const room = maxScenesFor(opts.family) - (out.length + 1);
  if (assessment && extras.length < room) extras.push(clipScene({ ...assessment, options: (assessment.options ?? []).slice(0, LESSON_CAPS.assessmentOptions) }));
  if (reflection && extras.length < room) extras.push(clipScene(reflection));
  const chain = [dica, ...extras];
  chain.forEach((s, i) => out.push({ ...s, next: chain[i + 1]?.id ?? end.id }));
  out.push(clipScene(end));
  return ensureDidactic({ rationale: script.rationale, scenes: out }, choice?.title ?? situation?.title);
}

/** Nomes do bloco <elenco> da entrada ("- Nome: papel. ficha"). */
function castNamesFromInput(input: string): string[] {
  const block = /<elenco>\n([\s\S]*?)\n<\/elenco>/.exec(input)?.[1] ?? '';
  return [...block.matchAll(/^- ([^:\n]+):/gm)].map((m) => m[1]!.trim()).filter(Boolean);
}

const LOWERCASE_FIRST = new Set(['ele', 'ela', 'eles', 'elas', 'o', 'a', 'os', 'as', 'e', 'mas', 'entao', 'depois', 'ai', 'ja', 'logo', 'enquanto', 'quando', 'no', 'na', 'em']);

/** Frase narrada em terceira pessoa vira observação dirigida ao aluno ("Repare: Renata responde…", "Repare: ela sorri…"). */
function addressLearner(sentence: string): string {
  const t = sentence.trim();
  const first = slug(t.split(/\s+/)[0] ?? '').replace(/_/g, '');
  return `Repare: ${LOWERCASE_FIRST.has(first) ? t.charAt(0).toLowerCase() : t.charAt(0)}${t.slice(1)}`;
}

/** Reescreve um texto frase a frase, dirigindo ao aluno as frases que narram o elenco. */
function teachingText(text: string, castNames: readonly string[]): string {
  return splitSentences(text).map((x) => (isThirdPersonSentence(x, castNames) ? addressLearner(x) : x)).join(' ');
}

/**
 * Voz de ensino de demonstração (focos teaching, shorten e practical): nas
 * cenas de situação, conteúdo, decisão e consequência, frases que narram o
 * elenco viram observações dirigidas ao aluno ("Repare: …"); consequências que
 * não falam com o aluno ganham a abertura "Você escolheu: <opção>." e fecham
 * com "Faça assim: …" (o primeiro tópico da Dica) quando não ensinam nada.
 * Determinístico; ids e destinos intactos; limites de palavras respeitados.
 */
export function demoTeachingVoice(script: LessonScript, castNames: readonly string[] = []): LessonScript {
  const choice = script.scenes.find((s) => s.type === 'choice');
  const labelFor = new Map<string, string>();
  for (const o of choice?.options ?? []) if (o.next) labelFor.set(o.next, o.label.replace(/[.!?]+$/, ''));
  const dica = script.scenes.find(isDicaScene);
  const firstTip = (dica?.text.split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).find((l) => l && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(l)) ?? 'avise cedo, mostre os fatos e proponha um caminho').replace(/[.!?]+$/, '');
  const fix = `Faça assim: ${firstTip.charAt(0).toLowerCase()}${firstTip.slice(1)}.`;
  const bullets = (t: string) => /^\s*-\s+/m.test(t);
  return {
    ...script,
    scenes: script.scenes.map((s): LessonScene => {
      if (!VOICE_SCENE_TYPES.includes(s.type) || isDicaScene(s)) return s;
      // a abertura "Você escolheu…" depende do texto ORIGINAL (antes de dirigir as frases ao aluno)
      const needsOpening = (t: string) => !splitSentences(t).slice(0, 2).some(isSecondPersonSentence);
      const openText = s.type === 'consequence' && needsOpening(s.text);
      const openNarration = s.type === 'consequence' && !!s.narration.trim() && needsOpening(s.narration);
      let text = bullets(s.text) ? s.text : teachingText(s.text, castNames);
      let narration = s.narration.trim() ? teachingText(s.narration, castNames) : s.narration;
      const guidance = s.guidance ? teachingText(s.guidance, castNames) : s.guidance;
      if (s.type === 'consequence') {
        const opening = `Você escolheu: ${clipWords(labelFor.get(s.id) ?? 'esse caminho', LESSON_CAPS.maxOptionWords)}.`;
        // abertura e fechamento entram inteiros; o texto original é cortado para caber no limite; o fechamento só entra se faltar uma pista de ensino
        const feedback = (t: string, max: number, open: boolean, ensureCue: boolean) => {
          const head = open ? opening : '';
          let body = clipWords(t, Math.max(6, max - wc(head)));
          if (!ensureCue || [`${head} ${body}`, guidance ?? ''].some(hasTeachingCue)) return [head, body].filter(Boolean).join(' ');
          body = clipWords(t, Math.max(6, max - wc(head) - wc(fix)));
          return [head, body, fix].filter(Boolean).join(' ');
        };
        text = feedback(text, LESSON_CAPS.maxConsequenceWords, openText, true);
        if (narration.trim()) narration = feedback(narration, LESSON_CAPS.maxConsequenceNarrationWords, openNarration, false);
      } else if (s.type === 'content' && ![text, narration].some(hasTeachingCue)) {
        text = `${clipWords(text, Math.max(6, LESSON_CAPS.maxContentWords - wc(fix)))} ${fix}`;
      }
      return { ...s, text, narration, guidance: guidance ?? null };
    }),
  };
}

/**
 * Revisão de demonstração: nos focos de encurtar/praticar, devolve a aula
 * compactada dentro dos limites (ids das cenas mantidas preservados) e na voz
 * de ensino; no foco teaching, a mesma aula na voz de ensino. Nos demais,
 * devolve o mesmo roteiro com os títulos marcados e o texto da primeira cena
 * com uma frase a mais, para que a diferença seja visível mas a estrutura
 * (ids, destinos) fique intacta.
 */
export function templateRevise(req: StructuredRequest<unknown>): LessonScript {
  const script = currentScript(req.input);
  const focusName = /<foco>\n(\w+)/.exec(req.input)?.[1];
  const isRepair = req.task === 'revise_lesson_repair';
  const cast = castNamesFromInput(req.input);
  if (focusName && (CAPPED_REVISION_FOCUS as readonly string[]).includes(focusName)) {
    const short = demoTeachingVoice(demoShortenScript(script, { family: field(req.input, 'família') || undefined, allowAssessment: field(req.input, 'verificação permitida') === 'sim' }), cast);
    return {
      ...short,
      rationale: `[MODELO DE DEMONSTRAÇÃO${isRepair ? ' — reparo' : ''}] Aula ${focusName === 'practical' ? 'mais prática' : 'encurtada'}, na voz de ensino: ${short.scenes.length - 1} cenas (situação, decisão com três opções, consequências, dica${short.scenes.some((s) => s.type === 'assessment') ? ', verificação' : short.scenes.some((s) => s.type === 'reflection') ? ', reflexão' : ''}); cenas mantidas conservam o id. Com um provedor real, o texto seria reescrito conforme o pedido.`,
    };
  }
  if (focusName && (VOICE_REVISION_FOCUS as readonly string[]).includes(focusName)) {
    return {
      ...demoTeachingVoice(script, cast),
      rationale: `[MODELO DE DEMONSTRAÇÃO${isRepair ? ' — reparo' : ''}] Voz de ensino: frases que narravam o elenco foram dirigidas ao aluno e as consequências viraram feedback ("Você escolheu…", "Faça assim…"); estrutura e ids intactos. Com um provedor real, o texto seria reescrito de verdade.`,
    };
  }
  return {
    rationale: `[MODELO DE DEMONSTRAÇÃO${isRepair ? ' — reparo' : ''}] Revisão genérica${focusName ? ` com foco "${focusName}"` : ''}: títulos marcados como revisados e estrutura preservada. Com um provedor real, o texto seria reescrito conforme o pedido.`,
    scenes: script.scenes.map((sc, i): LessonScene => ({
      ...sc,
      title: markRevised(sc.title),
      text: i === 0 && !sc.text.includes('[revisão de demonstração]') ? `${sc.text}\n\n[revisão de demonstração] Esta cena foi marcada pelo modo de demonstração.`.slice(0, 4000) : sc.text,
    })),
  };
}

/**
 * Variações de demonstração: duas versões da cena-alvo com rótulos e textos
 * reescritos de forma determinística; ids e destinos das opções não mudam.
 */
export function templateVariations(req: StructuredRequest<unknown>): SceneVariations {
  const script = currentScript(req.input);
  const sceneId = /<cena_alvo>\nid: ([^\n]+)/.exec(req.input)?.[1]?.trim();
  const target = script.scenes.find((s) => s.id === sceneId);
  if (!target) throw new Error(`modelo de demonstração: cena-alvo "${sceneId}" não encontrada`);
  const variant = (suffix: string, prefix: string, toneShift?: LessonScene['tone']): LessonScene => ({
    ...target,
    title: `${target.title.slice(0, 120 - suffix.length)}${suffix}`,
    text: `${prefix} ${target.text}`.slice(0, 4000),
    options: target.options ? target.options.map((o) => ({ ...o, label: `${prefix} ${o.label}`.slice(0, 300) })) : null,
    tone: target.type === 'consequence' ? (toneShift ?? target.tone) : target.tone,
    guidance: target.type === 'consequence' && target.guidance ? `${prefix} ${target.guidance}`.slice(0, 800) : target.guidance,
  });
  return {
    rationale: '[MODELO DE DEMONSTRAÇÃO] Duas variações genéricas da cena: uma mais direta e outra com mais contexto. Com um provedor real, as alternativas seriam reescritas de verdade.',
    variations: [
      { label: 'Mais direta (demonstração)', scene: variant(' — direta', 'Em poucas palavras:') },
      { label: 'Com mais contexto (demonstração)', scene: variant(' — com contexto', 'Para situar melhor:', target.tone === 'negative' ? 'neutral' : target.tone) },
    ],
  };
}

export { splitSentences };

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Quebra uma frase acima do limite de palavras: primeiro nas vírgulas, senão em blocos iguais de palavras. */
function splitLong(sentence: string): string[] {
  if (wc(sentence) <= MAX_SHOT_WORDS) return [sentence];
  const byComma = sentence.split(/(?<=,)\s+/);
  if (byComma.length > 1 && byComma.every((p) => wc(p) <= MAX_SHOT_WORDS)) return byComma;
  const words = sentence.split(/\s+/).filter(Boolean);
  const n = Math.ceil(words.length / 20);
  const per = Math.ceil(words.length / n);
  return Array.from({ length: n }, (_, i) => words.slice(i * per, (i + 1) * per).join(' ')).filter(Boolean);
}

/**
 * Agrupa as frases em planos: até 3 quando cabem, mais quando a fala é longa
 * (nenhum plano acima de MAX_SHOT_WORDS); planos com menos de MIN_SHOT_WORDS
 * são fundidos ao vizinho.
 */
export function groupSentences(sentences: string[], max = 3): string[] {
  const pieces = sentences.flatMap(splitLong);
  const total = pieces.reduce((a, p) => a + wc(p), 0);
  const target = Math.max(Math.min(max, pieces.length), Math.ceil(total / MAX_SHOT_WORDS));
  const budget = Math.min(MAX_SHOT_WORDS, Math.max(Math.ceil(total / target), ...pieces.map(wc)));
  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && wc(cur) + wc(p) > budget) {
      chunks.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) chunks.push(cur);
  for (let i = 0; i < chunks.length && chunks.length > 1; ) {
    if (wc(chunks[i]!) >= MIN_SHOT_WORDS) { i++; continue; }
    const prev = i > 0 ? chunks[i - 1]! : null;
    const next = i + 1 < chunks.length ? chunks[i + 1]! : null;
    if (prev !== null && wc(prev) + wc(chunks[i]!) <= MAX_SHOT_WORDS) { chunks.splice(i - 1, 2, `${prev} ${chunks[i]}`); continue; }
    if (next !== null && wc(next) + wc(chunks[i]!) <= MAX_SHOT_WORDS) { chunks.splice(i, 2, `${chunks[i]} ${next}`); continue; }
    i++;
  }
  return chunks;
}

/** Itens de uma enumeração com vírgulas ("a, b e c"), ou null se não houver lista. */
function commaList(line: string): string[] | null {
  const body = line.replace(/[.!?…]+["'”’»)]*$/, '');
  const commas = (body.match(/,/g) ?? []).length;
  if (commas < 2 && !(commas === 1 && / e /.test(body.slice(body.indexOf(','))))) return null;
  const segs = body.split(/,| e (?=[^,]*$)/).map((x) => x.trim()).filter(Boolean);
  // o primeiro segmento costuma trazer a introdução ("São três passos: ouvir")
  const items = segs.map((x, i) => (i === 0 && x.includes(':') ? x.slice(x.lastIndexOf(':') + 1).trim() : x)).filter(Boolean);
  if (items.length < 2) return null;
  return items.slice(0, 4).map((x) => x.split(/\s+/).slice(0, 8).join(' '));
}

const DEMO_MOVES: DirectionShotProposal['cameraMove'][] = ['static', 'static', 'push_in'];
const gesture = (mood: GestureMood, n = 0) => {
  const list = SAFE_GESTURES.filter((g) => g.mood === mood);
  return list[n % list.length]!.prompt;
};

/** Gestos da demonstração por tipo de cena (vocabulário seguro), na ordem dos planos. */
const DEMO_GESTURES_BY_TYPE: Record<string, string[]> = {
  scenario: [gesture('welcoming'), gesture('explaining', 1), gesture('question')],
  content: [gesture('explaining'), gesture('explaining', 2), gesture('serious', 1)],
  choice: [gesture('explaining'), gesture('question'), gesture('question', 1)],
  consequence: [gesture('serious'), gesture('reassuring'), gesture('reassuring', 1)],
};

/** Gesto do plano i sem repetir o do plano anterior. */
function demoGesture(type: string, i: number, previous: string | undefined): string {
  const list = DEMO_GESTURES_BY_TYPE[type] ?? DEMO_GESTURES_BY_TYPE.content!;
  let g = list[i % list.length]!;
  if (previous && gestureKey(g) === gestureKey(previous)) g = SAFE_GESTURES.find((x) => gestureKey(x.prompt) !== gestureKey(previous) && x.mood === 'explaining')!.prompt;
  return g;
}

/** Palavras de tempo/lugar que indicam que a frase narra uma situação (não ensina nem pergunta). */
const SITUATION_RE = /(?<!\p{L})(chega|chegar|chegou|chegando|entra|entrar|entrou|entrando|segunda|terça|quarta|quinta|sexta|manhã|tarde|noite|sala|prédio|escritório|vídeo ?chamada|videochamada)(?!\p{L})/iu;

/** Pedido de câmera da demonstração, conforme o tipo de situação narrada. */
export function demoCinematicFor(sentence: string): { action: CinematicAction; prompt: string; setting: string } {
  const t = sentence.toLowerCase();
  if (/chamada|celular|notebook|computador/.test(t)) {
    return { action: 'walk_in_and_sit', prompt: 'a tidy home office with a wooden desk, an open laptop and a plant; soft morning daylight from a window', setting: 'Entrando e sentando para a vídeo chamada' };
  }
  const room = { action: 'walk_away' as const, prompt: 'a bright modern office corridor with glass walls and plants; a door to a meeting room at the end; morning light', setting: 'Caminhando até a sala da entrevista' };
  if (/(?<!\p{L})sala(?!\p{L})/iu.test(t)) return room;
  if (/pr[ée]dio|escrit[óo]rio|chega|chegar|chegou|chegando/.test(t)) {
    return { action: 'walk_toward_camera', prompt: 'a long, clear sidewalk in front of a modern glass office building in a Brazilian city; trees and morning sunlight', setting: 'Chegando ao prédio da empresa' };
  }
  if (/(?<!\p{L})(entra|entrar|entrou|entrando)(?!\p{L})/iu.test(t)) return room;
  return { action: 'walk_across', prompt: 'a bright open-plan modern office with a long clear aisle between desks and plants; morning light', setting: 'Caminhando pelo escritório' };
}

/**
 * Plano de abertura em movimento da demonstração: só na PRIMEIRA cena da aula,
 * quando a primeira frase narra uma situação (tempo/lugar) e cabe em 4–38
 * palavras (sozinha ou somada ao grupo seguinte). Devolve as falas reagrupadas
 * (a primeira é a da cena em movimento) ou null.
 */
export function demoCinematicLines(narration: string, lines: string[]): string[] | null {
  const first = splitSentences(narration)[0] ?? '';
  if (!SITUATION_RE.test(first) || lines.length === 0) return null;
  if (/\?\s*$/.test(first)) return null; // pergunta direta ao aluno: nunca em movimento
  const fits = (l: string) => wc(l) >= CINEMATIC_MIN_WORDS && wc(l) <= CINEMATIC_MAX_WORDS;
  if (fits(lines[0]!)) return lines;
  if (lines.length > 1 && fits(`${lines[0]} ${lines[1]}`)) return [`${lines[0]} ${lines[1]}`, ...lines.slice(2)];
  return null;
}

const CARD_STOPWORDS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'que', 'e', 'ou', 'com', 'sem', 'para', 'pra', 'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'ao', 'à', 'se', 'seu', 'sua']);

/**
 * Tópico de cartão com a palavra-chave em negrito: as duas primeiras palavras
 * de conteúdo (pulando artigos e preposições), com o que houver entre elas
 * ("um documento com foto" → "um **documento com foto**"; "currículo" → "**currículo**").
 */
export function cardBullet(item: string): string {
  const w = item.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (w.length === 0) return '';
  const content = w.map((x, i) => (CARD_STOPWORDS.has(x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) ? -1 : i)).filter((i) => i >= 0);
  if (content.length === 0) return `**${w.join(' ')}**`;
  const from = content[0]!;
  const to = content[Math.min(1, content.length - 1)]!;
  const bold = `**${w.slice(from, to + 1).join(' ')}**`;
  return [w.slice(0, from).join(' '), bold, w.slice(to + 1).join(' ')].filter(Boolean).join(' ');
}

/** Título do cartão: o que vem antes dos dois-pontos na fala (até 8 palavras) ou o título da cena. */
function cardTitle(line: string, sceneTitle: string): string {
  const head = line.includes(':') ? line.slice(0, line.indexOf(':')).trim() : '';
  const base = head && head.split(/\s+/).length <= 8 ? head : sceneTitle;
  return clipWords(base, 8).replace(/[.…]+$/, '');
}

/**
 * Direção de demonstração: a fala de cada cena é dividida por frases em até 3
 * planos (wide → medium → close; mais planos, alternando medium/close, quando
 * a fala passa do limite de palavras por plano); wide só no primeiro plano e
 * se a fala dele for curta. Em <estilo> "câmera: única" (padrão) todos os planos
 * com apresentador usam a câmera principal e o plano do meio vira a
 * apresentadora com o PAINEL de tópicos (layout presenter_panel, 13–39
 * palavras, tópicos com **negrito**) quando enumera itens com vírgulas; numa
 * câmera em tela cheia, enquadramento nativo e static (sem zoom digital); em "câmera: várias" as câmeras alternam e
 * a lista vira presenter_slide_right. Todo plano com apresentador tem um gesto
 * do vocabulário seguro. Na primeira cena da aula, se a primeira frase narra
 * uma situação, o plano 1 vira cena em movimento (a menos que <estilo> desligue).
 * Estúdio com zonas (<cameras> com o atributo zona): a fala de cada cena fica
 * na câmera de fala da cena (`zoneTalkCamera`: 3/4 nas cenas pares, laterais
 * alternando nas ímpares) e a lista do plano do meio vira presenter_chips
 * numa câmera lateral que alterna o lado a cada plano de pílulas (inclusive
 * em relação à cena anterior), só quando o corte cai entre frases.
 */
export function templateDirection(req: StructuredRequest<unknown>): SceneDirectionProposal {
  const cameraLines = [...(/<cameras>\n([\s\S]*?)\n<\/cameras>/.exec(req.input)?.[1] ?? '').matchAll(/^- id: ([^ |]+)(.*)$/gm)];
  const cameras = cameraLines.map((m) => m[1]!);
  // câmera em tela cheia: sempre o enquadramento nativo e static (sem zoom digital; o cenário do visual é o plano)
  const fullFrameNative = new Map(cameraLines.filter((m) => /posicao tela cheia/.test(m[2]!)).map((m) => [m[1]!, (/enquadramento nativo (\w+)/.exec(m[2]!)?.[1] ?? 'medium') as DirectionShotProposal['framing']]));
  const scenes = [...req.input.matchAll(/<cena id="([^"]+)"([^>]*)>\n<fala>\n([\s\S]*?)\n<\/fala>/g)].map((m) => ({ nodeId: m[1]!, position: /posicao="(\d+)"/.exec(m[2]!)?.[1], type: /tipo="([^"]+)"/.exec(m[2]!)?.[1] ?? 'content', title: /titulo="([^"]*)"/.exec(m[2]!)?.[1] ?? '', narration: m[3]! }));
  const slidesOff = /slides: DESLIGADOS/.test(req.input);
  const cinematicOff = /cenas em movimento: DESLIGADAS/.test(req.input) || !/cenas em movimento: até/.test(req.input);
  // câmera única (padrão): só a principal nos planos com apresentador; o ritmo vem dos cartões
  const multi = /câmera: várias/.test(req.input);
  const cardsOff = slidesOff || /cartões por minuto: 0/.test(req.input);
  // estúdio com zonas: câmeras com zona (a primeira de cada) e o lado das últimas pílulas da aula
  const zoneSet: ZoneCameraSet = {};
  for (const m of cameraLines) {
    const z = /\| zona (left|right|center)\b/.exec(m[2]!)?.[1] as 'left' | 'right' | 'center' | undefined;
    if (z && !zoneSet[z]) zoneSet[z] = m[1]!;
  }
  const zones = (zoneSet.left || zoneSet.right) && !multi ? zoneSet : null;
  let chipsSide = [...(/<direcao_anterior_da_aula>\n([\s\S]*?)\n<\/direcao_anterior_da_aula>/.exec(req.input)?.[1] ?? '').matchAll(/últimas pílulas: zona (left|right)/g)].pop()?.[1] as 'left' | 'right' | undefined;
  const sentenceEnd = (t: string | undefined) => t === undefined || /[.!?…]["'”’»)]*$/.test(t.trim());
  return {
    scenes: scenes.map(({ nodeId, narration, position, type, title }, sceneIndex) => {
      const firstOfLesson = position !== undefined ? position === '1' : sceneIndex === 0;
      const grouped = groupSentences(splitSentences(narration), 3);
      const cineLines = !cinematicOff && firstOfLesson ? demoCinematicLines(narration, grouped) : null;
      const lines = cineLines ?? grouped;
      const n = lines.length;
      const opensWide = !cineLines && n > 1 && wc(lines[0]!) <= 16;
      let prevGesture: string | undefined;
      // estúdio com zonas: câmera de fala da cena (posição na aula, senão a ordem do pedido)
      const talkCamera = zones ? zoneTalkCamera(zones, position !== undefined ? Number(position) - 1 : sceneIndex) : undefined;
      const shots = lines.map((line, i): DirectionShotProposal => {
        if (cineLines && i === 0) {
          const c = demoCinematicFor(line);
          return { id: 's1', line, cameraId: cameras.length ? cameras[0]! : null, framing: 'medium', layout: 'cinematic', cameraMove: 'static', motionPrompt: '', slide: null, caption: null, transitionIn: 'cut', cinematic: { action: c.action, prompt: c.prompt, setting: c.setting } };
        }
        const framing: DirectionShotProposal['framing'] = n === 1 ? 'medium' : i === 0 && opensWide ? 'wide' : (i - (opensWide ? 1 : 0)) % 2 === 0 ? 'medium' : 'close';
        const middle = n >= 3 && i === Math.floor(n / 2);
        const list = middle && !slidesOff ? commaList(line) : null;
        // câmera única: o plano do meio com lista vira a apresentadora com o painel de tópicos (13–39 palavras; nunca dois seguidos)
        const card = !multi && !cardsOff && list && wc(line) >= CARD_MIN_WORDS && wc(line) <= CARD_MAX_WORDS ? list.slice(0, 3).map(cardBullet) : null;
        if (zones && list && !cardsOff && wc(line) >= CARD_MIN_WORDS && wc(line) <= CARD_MAX_WORDS && sentenceEnd(lines[i - 1]) && sentenceEnd(line)) {
          // pílulas numa câmera lateral, do lado oposto às anteriores (o corte cai entre frases)
          const pick = nextChipsCamera(zones, chipsSide);
          chipsSide = pick.zone;
          return { id: `s${i + 1}`, line, cameraId: pick.cameraId, framing: fullFrameNative.get(pick.cameraId) ?? 'medium', layout: 'presenter_chips', cameraMove: 'static', motionPrompt: (prevGesture = demoGesture(type, i, prevGesture)), slide: { title: cardTitle(line, title), bullets: list.slice(0, 4).map(cardBullet), highlight: null, style: 'checklist', variant: null }, caption: null, transitionIn: 'cut', cinematic: null };
        }
        const cameraId = talkCamera ?? (cameras.length ? (multi ? cameras[i % cameras.length]! : cameras[0]!) : null);
        const native = cameraId ? fullFrameNative.get(cameraId) : undefined;
        if (card && !zones) {
          return { id: `s${i + 1}`, line, cameraId, framing: native ?? 'medium', layout: 'presenter_panel', cameraMove: 'static', motionPrompt: (prevGesture = demoGesture(type, i, prevGesture)), slide: { title: cardTitle(line, title), bullets: card, highlight: null, style: 'checklist', variant: null }, caption: null, transitionIn: 'cut', cinematic: null };
        }
        return {
          id: `s${i + 1}`,
          line,
          cameraId,
          framing: native ?? framing,
          layout: multi && list ? 'presenter_slide_right' : 'presenter',
          cameraMove: native ? 'static' : (DEMO_MOVES[i] ?? 'static'),
          motionPrompt: (prevGesture = demoGesture(type, i, prevGesture)),
          slide: multi && list ? { title: '', bullets: list, highlight: null, style: 'checklist', variant: null } : null,
          caption: null,
          transitionIn: 'cut',
          cinematic: null,
        };
      });
      return { nodeId, intent: zones ? '[MODELO DE DEMONSTRAÇÃO] Estúdio com zonas: a fala fica na câmera da cena; a lista vira pílulas na parede livre de uma câmera lateral, alternando o lado.' : multi ? '[MODELO DE DEMONSTRAÇÃO] Abre situando, explica no plano médio e fecha próximo do aluno.' : '[MODELO DE DEMONSTRAÇÃO] Uma câmera constante; a lista vira o painel de tópicos ao lado da apresentadora e a fala volta a ela.', shots };
    }),
  };
}

export function createTemplateFakeAdapter(): FakeLlmAdapter {
  return new FakeLlmAdapter({
    outline: templateOutline,
    outline_repair: templateOutline,
    lesson: templateLesson,
    lesson_repair: templateLesson,
    revise_lesson: templateRevise,
    revise_lesson_repair: templateRevise,
    scene_variations: templateVariations,
    scene_variations_repair: templateVariations,
    scene_direction: templateDirection,
    scene_direction_repair: templateDirection,
  });
}
