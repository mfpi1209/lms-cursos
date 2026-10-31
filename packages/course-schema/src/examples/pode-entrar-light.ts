import { richTextFromPlain as p } from '../richtext';
import { CourseDocumentSchema, type CourseDocument } from '../course';
import type { LessonGraph, Edge } from '../graph';
import type { AnyNode, ChoiceQuality, RecapItem } from '../nodes';
import { podeEntrar } from './pode-entrar';

/**
 * Curso: "Pode entrar Light: sua primeira entrevista em 10 minutos".
 * Versão rápida do "Pode entrar", só para quem busca o PRIMEIRO emprego ou
 * estágio: sem pergunta de perfil, sem variantes, sem reforços nem segunda
 * tentativa. Três aulas curtas, decisões com três opções, retorno de UMA frase
 * (as opções que não são a melhor dizem o movimento melhor: "melhor: …"),
 * treino em voz alta opcional (só voz) nas três perguntas da conversa e uma
 * única anotação opcional, no fim, com "Pular".
 *
 * A cena "Fale sobre você" reaproveita a fala da Q03 do "Pode entrar"
 * (`PODE_ENTRAR_LIGHT_Q03_NARRATION`, idêntica), para o vídeo já gravado dela
 * poder ser ligado sem ficar desatualizado (o script de inserção liga a mídia).
 */

export const PODE_ENTRAR_LIGHT_TITLE = 'Pode entrar Light: sua primeira entrevista em 10 minutos';
/** Frase própria do Light (rodapé e cartão em "Meus cursos"), diferente da do curso completo. */
export const PODE_ENTRAR_LIGHT_TAGLINE = 'Versão rápida: sua primeira entrevista em 10 minutos.';
export const PODE_ENTRAR_LIGHT_NOTE_ID = 'l3_nota_apresentacao';
/** Cena que recebe o vídeo da `q03_primeiro_emprego` do "Pode entrar". */
export const PODE_ENTRAR_LIGHT_VIDEO_NODE_ID = 'l2_fale_sobre_voce';
export const PODE_ENTRAR_LIGHT_Q03_NARRATION = 'Oi, que bom te ver! Obrigada por vir. Pra gente começar, me conta um pouco sobre você.';
const Q03_MOTION = 'smiles warmly and leans in slightly, welcoming';

const OBJ = {
  chegar: 'obj_light_chegar_bem',
  responder: 'obj_light_responder',
  simular: 'obj_light_simular',
} as const;

/** Treino em voz alta opcional (só voz; escrever fica desligado). */
const VOICE_PRACTICE = { enabled: true, voice: true, text: false, matchPrompt: 'Qual destas respostas se parece mais com a sua?' };

const go = (id: string, from: string, to: string, extra: Partial<Edge> = {}): Edge => ({ id, from, to, ...extra });
const opt = (id: string, from: string, optionId: string, to: string, extra: Partial<Edge> = {}): Edge => ({ id, from, to, optionId, ...extra });

function layoutRows(rows: string[][]): LessonGraph['layout'] {
  const positions: Record<string, { x: number; y: number }> = {};
  rows.forEach((row, r) => {
    const offset = ((row.length - 1) * 320) / 2;
    row.forEach((id, c) => {
      positions[id] = { x: c * 320 - offset, y: r * 180 };
    });
  });
  return { positions };
}

/** Opção: id, fala/ação em primeira pessoa, retorno e (opcional) qualidade para a revisão. */
type Option = [id: string, label: string, feedback: string, quality?: ChoiceQuality];

function decision(id: string, title: string, prompt: string, objectiveIds: string[], options: Option[], extra: Partial<Extract<AnyNode, { type: 'choice' }>> = {}): AnyNode {
  return {
    id, type: 'choice', title, objectiveIds, required: true,
    prompt: p(prompt),
    options: options.map(([oid, label, feedback, quality]) => ({ id: oid, label, feedback: p(feedback), ...(quality ? { quality } : {}) })),
    ...extra,
  };
}

/** Todas as opções seguem para a mesma cena (sem reforço nem segunda tentativa). */
function allTo(prefix: string, node: AnyNode, to: string, points?: Record<string, number>): Edge[] {
  if (node.type !== 'choice') return [];
  return node.options.map((o) => {
    const by = points?.[o.id] ?? 0;
    return opt(`${prefix}_${o.id}`, node.id, o.id, to, by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {});
  });
}

const list = (items: string[]) => ({
  type: 'doc' as const,
  content: [{ type: 'bulletList' as const, content: items.map((t) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }] })) }],
});

/* ------------------------------------------------------------------------ */
/* Aula 1 — Antes e no dia                                                    */
/* ------------------------------------------------------------------------ */

const L1_SAIR = decision('l1_quando_sair', 'Quando você sai?', 'Entrevista às 14h, trajeto de 40 min. Quando você sai?', [OBJ.chegar], [
  ['folga', 'Saio com folga para chegar 10 minutos antes.', 'Você chega com calma e ainda absorve um atraso no trânsito.'],
  ['exato', 'Saio no tempo exato do trajeto.', 'Você fica sem margem; melhor: saia com folga para o trânsito.'],
  ['cedo', 'Saio duas horas antes, por garantia.', 'Você gasta energia esperando; melhor: uma folga de uns 15 minutos.'],
]);
const L1_ROUPA = decision('l1_o_que_vestir', 'O que vestir?', 'O que você veste para a entrevista?', [OBJ.chegar], [
  ['formal', 'Visto a roupa mais formal que eu tiver, por garantia.', 'Você pode, mas não precisa; melhor: algo limpo e confortável para o lugar.'],
  ['confortavel', 'Visto algo limpo e confortável, no estilo de quem trabalha lá.', 'Você fica à vontade e combina com o lugar, sem gastar nada.'],
  ['qualquer', 'Visto o que estiver à mão; o que importa é a conversa.', 'Você não precisa de roupa nova; melhor: algo limpo e confortável.'],
]);

const antesENoDia: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'l1_chegar_bem',
  variables: [],
  nodes: [
    {
      id: 'l1_chegar_bem', type: 'content', title: 'Antes e no dia', objectiveIds: [OBJ.chegar], required: true,
      body: p('Vaga · Horário · Caminho · Roupa'),
      narration: 'Antes da entrevista, leia a vaga e separe dois exemplos seus. No dia, saia com folga, vista algo limpo e confortável e respire. Nada disso exige gastar dinheiro. Vamos treinar duas decisões rápidas.',
      motionPrompt: 'nods slowly, warm',
    },
    L1_SAIR,
    L1_ROUPA,
    {
      id: 'l1_dica', type: 'content', title: 'Dica: no dia', objectiveIds: [OBJ.chegar], required: true,
      body: list([
        'Atrasou? Avise antes, por mensagem ou ligação.',
        'Nervoso? Respire devagar e peça: “Pode repetir a pergunta?”',
        'Online? Teste o link e o som 15 minutos antes.',
      ]),
    },
    {
      id: 'l1_fim', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você já sabe como chegar bem. Próxima aula: a conversa.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    go('l1_e1', 'l1_chegar_bem', 'l1_quando_sair'),
    ...allTo('l1_e2', L1_SAIR, 'l1_o_que_vestir'),
    ...allTo('l1_e3', L1_ROUPA, 'l1_dica'),
    go('l1_e4', 'l1_dica', 'l1_fim'),
  ],
  layout: layoutRows([['l1_chegar_bem'], ['l1_quando_sair'], ['l1_o_que_vestir'], ['l1_dica'], ['l1_fim']]),
};

/* ------------------------------------------------------------------------ */
/* Aula 2 — Na conversa                                                       */
/* ------------------------------------------------------------------------ */

const L2_FALE = decision(PODE_ENTRAR_LIGHT_VIDEO_NODE_ID, 'Fale sobre você', '“Conte um pouco sobre você.” Qual resposta funciona melhor?', [OBJ.responder], [
  ['a', '“Sou dedicado, proativo e aprendo rápido. Topo qualquer função.”', 'Você citou qualidades sem exemplo; melhor: conte uma situação que as mostre.'],
  ['c', '“Nasci em Recife, me mudei aos dez anos e estudei muito.”', 'Você se alonga demais; melhor: conte só o que liga à vaga.'],
  ['b', '“Estudo administração, organizei prazos na turma e quero começar no atendimento.”', 'Você mostrou seu momento, um exemplo e o interesse na vaga.'],
], { narration: PODE_ENTRAR_LIGHT_Q03_NARRATION, motionPrompt: Q03_MOTION, openAnswer: VOICE_PRACTICE });
const L2_FEZ = decision('l2_algo_que_fez', 'Conte algo que você fez', '“Conte algo que você fez.” Qual resposta mostra sua parte?', [OBJ.responder], [
  ['b', '“Dividi as tarefas do grupo e entregamos no prazo.”', 'Você mostrou situação, ação e resultado, com o grupo junto.'],
  ['a', '“Sou do tipo que resolve tudo e me dou bem com todos.”', 'Você fala de si sem um fato; melhor: conte a situação, sua ação e o resultado.'],
  ['c', '“O grupo era desorganizado, então fiz tudo sozinho.”', 'Você culpou os colegas; melhor: conte o que você fez de concreto.'],
], { openAnswer: VOICE_PRACTICE });
const L2_NAO_SEI = decision('l2_nao_souber', 'Quando não souber responder', 'Citam um sistema que você nunca usou. O que você diz?', [OBJ.responder], [
  ['a', '“Já usei, sim. Faz tempo, mas lembro como funciona.”', 'Você inventou uma habilidade; melhor: diga o limite e o que já sabe.'],
  ['c', '“Não conheço esse sistema, então não sei dizer.”', 'Você foi honesto; melhor: diga também o que já sabe de parecido.'],
  ['b', '“Ainda não usei, mas uso algo parecido. Qual nível esperam?”', 'Você foi honesto, mostrou o que sabe e perguntou o requisito.'],
], { openAnswer: VOICE_PRACTICE });

const naConversa: LessonGraph = {
  schemaVersion: 1,
  startNodeId: PODE_ENTRAR_LIGHT_VIDEO_NODE_ID,
  variables: [],
  nodes: [
    L2_FALE,
    L2_FEZ,
    L2_NAO_SEI,
    {
      id: 'l2_fim', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você treinou três respostas. Próxima aula: a simulação rápida.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    ...allTo('l2_e1', L2_FALE, 'l2_algo_que_fez'),
    ...allTo('l2_e2', L2_FEZ, 'l2_nao_souber'),
    ...allTo('l2_e3', L2_NAO_SEI, 'l2_fim'),
  ],
  layout: layoutRows([[PODE_ENTRAR_LIGHT_VIDEO_NODE_ID], ['l2_algo_que_fez'], ['l2_nao_souber'], ['l2_fim']]),
};

/* ------------------------------------------------------------------------ */
/* Aula 3 — Simulação rápida                                                  */
/* ------------------------------------------------------------------------ */

/** Pontos por opção: melhor 2, razoável 1, fraca 0. Máximo 8; "bom" a partir de 6. */
export const PODE_ENTRAR_LIGHT_GOOD_SCORE = 6;

const L3_VAGA = decision('l3_por_que_vaga', 'Por que esta vaga?', '“Por que você quer esta vaga?”', [OBJ.simular], [
  ['b', '“Preciso trabalhar, então qualquer emprego serve agora.”', 'Você pode precisar de renda; melhor: diga também o que atrai na vaga.', 'ok'],
  ['a', '“Quero aprender a rotina de atendimento e crescer nela.”', 'Você ligou seu interesse às tarefas da vaga.', 'strong'],
  ['c', '“Trabalhar aqui é o meu sonho desde criança.”', 'Você exagerou sem conhecer a vaga; melhor: cite uma tarefa que interessa.', 'weak'],
]);
const L3_FORTE = decision('l3_ponto_forte', 'Seu ponto forte', '“Qual é o seu ponto forte?”', [OBJ.simular], [
  ['b', '“Sou perfeccionista: gosto de tudo muito bem feito.”', 'Você citou uma qualidade solta; melhor: mostre um exemplo dela.', 'ok'],
  ['c', '“Ah, não sei dizer… acho que não tenho um.”', 'Você travou, e tudo bem; melhor: lembre algo que fez bem.', 'weak'],
  ['a', '“Sou organizado: no projeto da turma, cuidei dos prazos.”', 'Você deu uma qualidade com um exemplo real.', 'strong'],
]);
const L3_CONFUSA = decision('l3_pergunta_confusa', 'A pergunta ficou confusa', 'A pergunta ficou confusa. O que você faz?', [OBJ.simular], [
  ['a', 'Respondo qualquer coisa para não ficar em silêncio.', 'Você evitou a pausa, mas fugiu da pergunta; melhor: peça para repetir.', 'weak'],
  ['c', 'Peço um instante e respondo o que entendi.', 'Você ganhou tempo; melhor: confirme a pergunta antes de responder.', 'ok'],
  ['b', 'Peço, com calma, para a pessoa repetir a pergunta.', 'Você entendeu antes de responder, sem perder a calma.', 'strong'],
]);
const L3_PERGUNTA = decision('l3_sua_pergunta', 'Sua pergunta para a empresa', '“Você tem alguma pergunta para nós?”', [OBJ.simular], [
  ['b', '“Não, obrigado. Acho que já entendi tudo.”', 'Você foi educado; melhor: pergunte sobre a rotina ou os próximos passos.', 'weak'],
  ['a', '“Como é a rotina da equipe no dia a dia?”', 'Você usou o espaço para entender o trabalho.', 'strong'],
  ['c', '“Quando sai o resultado do processo?”', 'Você perguntou algo útil; melhor ainda: pergunte também sobre a rotina.', 'ok'],
]);

const CHECKLIST_DIA = ['Horário e trajeto conferidos', 'Folga para o trânsito', 'Contato para avisar atraso', 'Roupa separada', 'Dois exemplos para contar'];

function recap(): RecapItem[] {
  const choice = (id: string, label: string, nodeId: string, emptyText: string): RecapItem => ({ id, label, kind: 'choice', nodeId, emptyText });
  return [
    choice('minha_apresentacao', 'Minha apresentação', PODE_ENTRAR_LIGHT_VIDEO_NODE_ID, 'Escolha na aula 2'),
    choice('meu_exemplo', 'Meu exemplo', 'l2_algo_que_fez', 'Escolha na aula 2'),
    choice('quando_nao_souber', 'Quando eu não souber', 'l2_nao_souber', 'Escolha na aula 2'),
    choice('por_que_vaga', 'Por que quero a vaga', 'l3_por_que_vaga', 'Escolha na aula 3'),
    choice('ponto_forte', 'Meu ponto forte', 'l3_ponto_forte', 'Escolha na aula 3'),
    choice('minha_pergunta', 'Minha pergunta para a empresa', 'l3_sua_pergunta', 'Escolha na aula 3'),
    { id: 'dia_da_entrevista', label: 'Dia da entrevista', kind: 'checklist', items: CHECKLIST_DIA, emptyText: 'Completar quando quiser' },
    { id: 'minha_anotacao', label: 'Minha anotação', kind: 'reflection', nodeId: PODE_ENTRAR_LIGHT_NOTE_ID, emptyText: 'Se quiser, escreva depois' },
  ];
}

function endNode(id: string, summary: string, outcomeLabel: string): AnyNode {
  return {
    id, type: 'end', title: 'Meu roteiro de entrevista', objectiveIds: [], required: true,
    summary: p(summary),
    recap: recap(),
    recapTitle: 'Meu roteiro de entrevista',
    closingLine: 'Você não precisa decorar sua história. Precisa conseguir explicá-la.',
    outcomeLabel,
  };
}

const simulacaoRapida: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'l3_por_que_vaga',
  variables: [{ name: 'pontos', type: 'number', initial: 0, label: 'Pontos da simulação' }],
  nodes: [
    L3_VAGA,
    L3_FORTE,
    L3_CONFUSA,
    L3_PERGUNTA,
    {
      id: PODE_ENTRAR_LIGHT_NOTE_ID, type: 'reflection', title: 'Sua anotação (opcional)', objectiveIds: [], required: true, minLength: 0, maxLength: 600,
      prompt: p('Quer anotar sua apresentação? É opcional.'),
      placeholder: 'Hoje eu… Uma experiência minha foi…\nQuero esta vaga porque…',
    },
    endNode('l3_fim_bom', 'Você foi muito bem na simulação. Seu roteiro está logo abaixo.', 'Curso concluído'),
    endNode('l3_fim_quase', 'Você está quase lá: refaça a aula 2 e tente de novo.', 'Curso concluído'),
  ],
  edges: [
    ...allTo('l3_e1', L3_VAGA, 'l3_ponto_forte', { a: 2, b: 1 }),
    ...allTo('l3_e2', L3_FORTE, 'l3_pergunta_confusa', { a: 2, b: 1 }),
    ...allTo('l3_e3', L3_CONFUSA, 'l3_sua_pergunta', { b: 2, c: 1 }),
    ...allTo('l3_e4', L3_PERGUNTA, PODE_ENTRAR_LIGHT_NOTE_ID, { a: 2, c: 1 }),
    go('l3_e5', PODE_ENTRAR_LIGHT_NOTE_ID, 'l3_fim_bom', { condition: { op: 'gte', var: 'pontos', value: PODE_ENTRAR_LIGHT_GOOD_SCORE }, priority: 1 }),
    go('l3_e6', PODE_ENTRAR_LIGHT_NOTE_ID, 'l3_fim_quase', { isDefault: true }),
  ],
  layout: layoutRows([['l3_por_que_vaga'], ['l3_ponto_forte'], ['l3_pergunta_confusa'], ['l3_sua_pergunta'], [PODE_ENTRAR_LIGHT_NOTE_ID], ['l3_fim_bom', 'l3_fim_quase']]),
};

/* ------------------------------------------------------------------------ */
/* Documento do curso                                                         */
/* ------------------------------------------------------------------------ */

export const PODE_ENTRAR_LIGHT_LESSON_IDS = ['aula_light_antes_e_no_dia', 'aula_light_na_conversa', 'aula_light_simulacao_rapida'] as const;

export const podeEntrarLight: CourseDocument = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: PODE_ENTRAR_LIGHT_TITLE,
  description: 'Versão rápida para a primeira entrevista: chegar bem, responder às perguntas mais comuns e treinar numa simulação curta. Você só escolhe; falar em voz alta é opcional.',
  learnerSummary: 'Três aulas curtas: chegar bem, responder às perguntas mais comuns e treinar numa simulação rápida. Você só escolhe; falar em voz alta é opcional.',
  brief: {
    topic: 'Primeira entrevista de emprego ou estágio: chegar bem e responder às perguntas mais comuns.',
    audience: 'jovens buscando o primeiro emprego ou estágio no Brasil, muitos tímidos ou introvertidos',
    context: 'Versão rápida do curso "Pode entrar": três aulas curtas, só escolhas, pouco texto na tela; treino em voz alta opcional e uma anotação opcional no fim.',
    prerequisites: 'Nenhum.',
    finalSkill: 'Chegar à primeira entrevista no horário e com calma, apresentar-se com um exemplo real e saber o que dizer quando não souber.',
    tone: 'brasileiro, acolhedor, direto; apresentadora em conversa com o aluno; sem julgar',
    narrativeVoice: 'second_person',
    targetMinutes: 10,
    sourcesNote: 'Adaptado do roteiro autoral do curso "Pode entrar" (curso-entrevista-interativa.md).',
  },
  objectives: [
    { id: OBJ.chegar, title: 'Chegar à entrevista no horário, com roupa adequada e calma', criterion: 'Escolhe sair com folga e uma roupa limpa e confortável, sem gastar.', required: true },
    { id: OBJ.responder, title: 'Responder às perguntas mais comuns com um exemplo real', criterion: 'Reconhece a resposta com momento, exemplo e interesse; diz o limite quando não sabe.', required: true },
    { id: OBJ.simular, title: 'Conduzir uma entrevista curta e fazer uma pergunta à empresa', criterion: 'Escolhe respostas com exemplo, pede para repetir quando não entende e faz uma pergunta útil.', required: true },
  ],
  modules: [
    {
      id: 'mod_light', title: 'Sua primeira entrevista', description: 'Três aulas curtas: antes e no dia, na conversa e uma simulação rápida.',
      lessons: [
        { id: PODE_ENTRAR_LIGHT_LESSON_IDS[0], title: 'Antes e no dia', description: 'Quando sair, o que vestir e o que fazer se atrasar ou ficar nervoso.', estimatedMinutes: 3, family: 'decision_consequence', objectiveIds: [OBJ.chegar], graph: antesENoDia },
        { id: PODE_ENTRAR_LIGHT_LESSON_IDS[1], title: 'Na conversa', description: 'Fale sobre você, conte algo que fez e saiba o que dizer quando não souber.', estimatedMinutes: 3, family: 'decision_consequence', objectiveIds: [OBJ.responder], graph: naConversa },
        { id: PODE_ENTRAR_LIGHT_LESSON_IDS[2], title: 'Simulação rápida', description: 'Três perguntas da entrevista, uma pergunta sua para a empresa e o seu roteiro.', estimatedMinutes: 4, family: 'decision_consequence', objectiveIds: [OBJ.simular], graph: simulacaoRapida },
      ],
    },
  ],
  completion: { requiredLessonIds: [...PODE_ENTRAR_LIGHT_LESSON_IDS] },
  cast: [
    { name: 'Apresentadora', role: 'Mentora que conversa com o aluno', details: 'A mesma do curso "Pode entrar" (Marina, sua entrevistadora). Só a cena "Fale sobre você" tem vídeo.' },
    { name: 'Entrevistador', role: 'Personagem de contexto (não aparece em vídeo)', details: 'Faz as perguntas da conversa e da simulação rápida, para uma vaga de entrada em atendimento.' },
  ],
  branding: {
    theme: 'immersive',
    wordmark: 'pode entrar',
    subtitle: 'Versão rápida',
    tagline: PODE_ENTRAR_LIGHT_TAGLINE,
    presenterName: 'Marina',
    presenterRole: 'Sua entrevistadora',
  },
  /* Mesma apresentadora e voz do "Pode entrar"; o script de inserção copia a apresentação do rascunho dele (fundo, posição, escala). */
  presentation: { ...podeEntrar.presentation, presenterPlacement: 'right', presenterScale: 0.92 },
  wizard: { step: 'revisao', completedSteps: ['tema', 'conteudo', 'estrutura', 'apresentacao', 'aulas', 'revisao'], contentMode: 'paste', finished: true },
});
