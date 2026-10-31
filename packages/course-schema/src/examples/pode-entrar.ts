import { richTextFromPlain as p } from '../richtext';
import { CourseDocumentSchema, type CourseDocument } from '../course';
import type { LessonGraph, Edge } from '../graph';
import type { AnyNode, ChoiceQuality, RecapItem } from '../nodes';
import type { Effect } from '../dsl';

/**
 * Curso: "Pode entrar: sua próxima entrevista começa aqui".
 * Montado deterministicamente a partir do roteiro da autora (sem IA). As falas
 * (`narration`) vêm do "Fala para gravação" do roteiro (as dos reforços R01–R04
 * foram encurtadas para até 45 palavras); o texto na tela traz só palavras-chave.
 *
 * Público: jovens buscando o PRIMEIRO estágio ou emprego, muitas vezes tímidos ou
 * introvertidos. Por isso: pouco texto na tela, atividades como escolhas guiadas
 * (sem escrita obrigatória), treino em voz alta opcional nas perguntas de
 * entrevista e uma única anotação opcional, no fim (com "Pular").
 *
 * Escolhas difíceis de adivinhar: TODAS as opções são falas ou ações em primeira
 * pessoa, de tamanho parecido (≤ 14 palavras); a melhor não é a única entre
 * aspas nem a mais longa, e muda de posição. Nas segundas tentativas, a melhor
 * opção diz o mesmo com outras palavras.
 *
 * Composição guiada (opcional): depois das escolhas "Seu começo" (aula 3) e
 * "Seu exemplo" (aula 4), o aluno MONTA a própria frase tocando em blocos
 * prontos (reflexão com `scaffold`, "Pular" sempre disponível). O roteiro final
 * prefere a frase montada e cai na escolha quando ele pulou.
 *
 * Adaptação por perfil: `perfil` é uma variável de CURSO (`scope: 'course'`).
 * Só a Q01 (aula 1) a grava; as aulas que ramificam por perfil (2 e 4) a declaram
 * e recebem o valor da tentativa mais recente da matrícula. Sem valor anterior
 * (aluno que pulou a aula 1), o fallback é o caminho de primeiro emprego.
 */

export const PODE_ENTRAR_TITLE = 'Pode entrar: sua próxima entrevista começa aqui';
/** Frase do rodapé e do cartão na lista "Meus cursos" (o script de migração grava em `branding.tagline`). */
export const PODE_ENTRAR_TAGLINE = 'O curso completo, no seu ritmo.';

const OBJ = {
  apresentacao: 'obj_apresentacao',
  exemplo: 'obj_exemplo',
  dificeis: 'obj_perguntas_dificeis',
  remuneracao: 'obj_remuneracao_perguntas',
  dia: 'obj_dia_da_entrevista',
} as const;

const PERFIS = ['primeiro_emprego', 'experiencia', 'transicao'] as const;
type Perfil = (typeof PERFIS)[number];
const perfilVar = { name: 'perfil', type: 'string', initial: 'primeiro_emprego', label: 'Perfil do aluno', scope: 'course' } as const;
const setPerfil = (perfil: Perfil): Effect[] => [{ op: 'set', var: 'perfil', value: perfil }];

/** Aresta simples (sem opção). */
const go = (id: string, from: string, to: string, extra: Partial<Edge> = {}): Edge => ({ id, from, to, ...extra });
/** Aresta de opção de uma decisão. */
const opt = (id: string, from: string, optionId: string, to: string, extra: Partial<Edge> = {}): Edge => ({ id, from, to, optionId, ...extra });

/** Posições do editor em colunas (linha = y, coluna = x); nunca afetam a execução. */
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

/** Ramificação por perfil a partir de um nó: experiência e transição condicionais, primeiro emprego como fallback. */
function perfilBranchEdges(prefix: string, from: string, to: Record<Perfil, string>): Edge[] {
  return [
    go(`${prefix}1`, from, to.experiencia, { condition: { op: 'eq', var: 'perfil', value: 'experiencia' }, priority: 1 }),
    go(`${prefix}2`, from, to.transicao, { condition: { op: 'eq', var: 'perfil', value: 'transicao' }, priority: 2 }),
    go(`${prefix}3`, from, to.primeiro_emprego, { isDefault: true }),
  ];
}

/* ------------------------------------------------------------------------ */
/* Formato para quem está começando (primeiro emprego/estágio, muitas vezes   */
/* tímido ou introvertido): pouco texto, nada de escrita obrigatória.         */
/*  - cenas com fala: na tela só palavras-chave; a fala carrega o conteúdo;   */
/*  - atividades são escolhas guiadas (exemplos prontos), não redações;       */
/*  - treinar em voz alta é opcional (só voz, nunca texto) nas perguntas de   */
/*    entrevista; a escolha é sempre o caminho principal;                     */
/*  - uma única anotação opcional, no fim da simulação (pode pular).          */
/* ------------------------------------------------------------------------ */

/** Treino em voz alta opcional (só voz; escrever fica desligado). */
const VOICE_PRACTICE = { enabled: true, voice: true, text: false, matchPrompt: 'Qual destas respostas se parece mais com a sua?' };

type PickOption = [id: string, label: string, feedback: string];

/** Atividade guiada: o aluno escolhe um exemplo pronto em vez de escrever. */
function pick(id: string, title: string, prompt: string, objectiveIds: string[], options: PickOption[]): AnyNode {
  return {
    id, type: 'choice', title, objectiveIds, required: true,
    prompt: p(prompt),
    options: options.map(([oid, label, feedback]) => ({ id: oid, label, feedback: p(feedback) })),
  };
}

/** Todas as opções de uma atividade guiada seguem para a mesma cena. */
function pickEdges(prefix: string, node: AnyNode, to: string): Edge[] {
  if (node.type !== 'choice') return [];
  return node.options.map((o) => opt(`${prefix}_${o.id}`, node.id, o.id, to));
}

type Slot = [id: string, label: string, options: string[]];

/**
 * Composição guiada (opcional): o aluno monta a própria frase tocando em blocos
 * prontos (ou escreve uma parte curta em "Outro…"). Pode pular.
 */
function compose(id: string, title: string, prompt: string, objectiveIds: string[], template: string, slots: Slot[]): AnyNode {
  return {
    id, type: 'reflection', title, objectiveIds, required: true, minLength: 0, maxLength: 300,
    prompt: p(prompt),
    scaffold: { template, slots: slots.map(([sid, label, options]) => ({ id: sid, label, options, allowCustom: true, customMaxLength: 60 })) },
  };
}

/** Opção de decisão com qualidade (revisão de respostas: "Forte" / "Pode melhorar"). */
const o = (id: string, label: string, feedback: string, quality: ChoiceQuality) => ({ id, label, feedback: p(feedback), quality });

/* ------------------------------------------------------------------------ */
/* Aula 1 — Abertura e preparação                                            */
/* ------------------------------------------------------------------------ */

const AT01_PRIMEIRO_EMPREGO = pick('at01_situacao_primeiro_emprego', 'Sua história', 'O que sua história vai mostrar?', [OBJ.exemplo], [
  ['aprender', 'Que eu aprendo rápido quando preciso.', 'Boa escolha: mostra que você se adapta.'],
  ['colaborar', 'Que eu colaboro bem com as pessoas.', 'Boa escolha: mostra que você soma ao grupo.'],
  ['responsabilidade', 'Que eu assumo responsabilidades.', 'Boa escolha: mostra que contam com você.'],
]);
const AT01_EXPERIENCIA = pick('at01_entrega_experiencia', 'Sua entrega', 'Que entrega você vai destacar?', [OBJ.exemplo], [
  ['problema', 'Resolvi um problema de um cliente.', 'Boa escolha: mostra iniciativa.'],
  ['rotina', 'Organizei uma rotina da equipe.', 'Boa escolha: mostra organização.'],
  ['atendimento', 'Atendi bem pessoas com pressa.', 'Boa escolha: mostra calma e cuidado.'],
]);
const AT01_TRANSICAO = pick('at01_ponte_transicao', 'Sua ponte', 'Qual ponte você vai construir?', [OBJ.exemplo], [
  ['escuta', 'Escuta e organização, que já uso no atendimento.', 'Boa escolha: liga o que você já faz à nova área.'],
  ['prazos', 'Trabalho com prazos, que já faço hoje.', 'Boa escolha: é uma habilidade que serve em toda área.'],
  ['curso', 'Um curso prático que estou fazendo na nova área.', 'Boa escolha: mostra que você já está se preparando.'],
]);

const aberturaPreparacao: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'v01_entrevista_comeca',
  variables: [perfilVar],
  nodes: [
    {
      id: 'v01_entrevista_comeca', type: 'scenario', title: 'A entrevista começa agora', objectiveIds: [], required: true,
      body: p('“Conte um pouco sobre você.” · Preparar · Experimentar · Ajustar'),
      narration: 'Chegou o convite. Você abre a chamada, escuta ‘conte um pouco sobre você’ e pensa: por onde eu começo? Aqui você vai praticar esse momento e vários outros. Vai escolher respostas, perceber o que elas comunicam e tentar de novo quando precisar. No final, você vai montar um roteiro com suas próprias experiências. Para começar: você está buscando o primeiro emprego, já trabalhou ou quer mudar de área?',
      motionPrompt: 'acena com a mão aberta, acolhedora',
    },
    {
      id: 'q01_perfil', type: 'choice', title: 'Qual caminho combina com seu momento?', objectiveIds: [OBJ.apresentacao], required: true,
      prompt: p('Qual caminho combina com seu momento?'),
      options: [
        { id: 'primeiro_emprego', label: 'Busco meu primeiro emprego ou estágio.', feedback: p('Você vai ver exemplos de estudos e projetos.') },
        { id: 'experiencia', label: 'Já trabalhei e busco uma nova vaga.', feedback: p('Você vai ver exemplos do dia a dia de trabalho.') },
        { id: 'transicao', label: 'Quero mudar de área e começar em outra.', feedback: p('Você vai ver como levar o que já sabe.') },
      ],
    },
    {
      id: 'p01_primeiro_emprego', type: 'content', title: 'Primeiro emprego: você tem por onde começar', objectiveIds: [OBJ.exemplo], required: true,
      body: p('Trabalho em grupo · Negócio da família · Projeto'),
      narration: 'Ainda não ter um emprego anterior não significa começar sem nenhuma experiência. Você pode ter organizado um trabalho em grupo, ajudado em um negócio da família ou participado de um projeto. O importante é explicar o contexto e o que você fez, sem apresentar isso como emprego formal. Escolha uma situação em que você precisou aprender, colaborar ou assumir uma responsabilidade. Vamos usar essa história durante o curso.',
    },
    {
      id: 'p02_experiencia', type: 'content', title: 'Já trabalhou? Escolha o que merece destaque', objectiveIds: [OBJ.exemplo], required: true,
      body: p('Uma situação · Sua parte · O que aconteceu'),
      narration: 'Seu currículo pode ter muita coisa, mas você não precisa contar tudo de uma vez. Pense em uma situação que mostre algo relevante para a vaga: resolver um problema, organizar uma rotina ou atender alguém. Qual era sua responsabilidade? O que você fez? O que aconteceu depois? Escolha um exemplo que consiga explicar com clareza, sem inventar números nem revelar informações confidenciais.',
    },
    {
      id: 'p03_transicao', type: 'content', title: 'Mudança de área: construa a ponte', objectiveIds: [OBJ.exemplo], required: true,
      body: p('O que você já faz → A nova área'),
      narration: 'Mudar de área pode trazer uma pergunta: como sua experiência ajuda nesse novo trabalho? Vamos construir essa ponte. Se você vem do atendimento, por exemplo, pode ter prática em escuta e organização de demandas. Isso não substitui o conhecimento técnico que a vaga exige, mas pode contribuir. Escolha uma habilidade que você já usa e uma ação concreta que está fazendo para aprender sobre a nova área.',
    },
    AT01_PRIMEIRO_EMPREGO,
    AT01_EXPERIENCIA,
    AT01_TRANSICAO,
    {
      id: 'v02_o_que_preparar', type: 'content', title: 'O que preparar antes da entrevista', objectiveIds: [OBJ.remuneracao], required: true,
      body: p('Vaga · Empresa · Encontro'),
      narration: 'Antes da entrevista, olhe três coisas: a vaga, a empresa e o encontro. Na vaga, identifique as atividades principais. Sobre a empresa, procure entender o que ela faz e o que você quer perguntar. O encontro, com horário, caminho e roupa, fica para a próxima aula. Preparação ajuda você a dedicar atenção à conversa.',
    },
    {
      id: 'q02_convite_amanha', type: 'choice', title: 'O convite chegou para amanhã', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('O convite é para amanhã. Qual plano ajuda mais?'),
      options: [
        o('c', 'Pesquiso a história da empresa, desde a fundação até hoje.', 'Você conhece a empresa, mas esquece a vaga e você.', 'ok'),
        o('a', 'Ensaio uma resposta bonita que sirva para qualquer vaga.', 'Você ganha segurança, mas a resposta fica genérica.', 'ok'),
        o('b', 'Leio a vaga e separo dois exemplos meus para contar.', 'Você liga seus exemplos ao que a vaga pede.', 'strong'),
      ],
    },
    {
      id: 'r01_prepare_o_que_vai_usar', type: 'content', title: 'Prepare o que você vai usar', objectiveIds: [OBJ.remuneracao], required: true,
      body: p('Atividades · Dois exemplos · Uma dúvida'),
      narration: 'Se o tempo está curto, comece pelo essencial. Leia as atividades e separe dois exemplos seus. Depois, anote uma dúvida sobre o trabalho. Você não precisa decorar a história da empresa. Precisa entender a vaga para conversar sobre ela.',
    },
    {
      id: 'q02_bis_quinze_minutos', type: 'choice', title: 'Nova tentativa: quinze minutos', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('Você tem quinze minutos. O que faz primeiro?'),
      options: [
        o('memorizar', 'Leio o “quem somos” do site da empresa até decorar.', 'Você gasta o tempo que usaria com a vaga.', 'weak'),
        o('revisar', 'Releio o que a vaga pede e escolho as histórias que vou contar.', 'Você prepara o que vai usar na conversa.', 'strong'),
      ],
    },
    {
      id: 'c02_exemplo_checklist', type: 'consequence', title: 'Exemplo de checklist', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Você decorou, mas texto institucional não vira conversa. Faça assim:'),
      guidance: {
        type: 'doc',
        content: [
          { type: 'bulletList', content: [
            'Atividades da vaga',
            'Dois exemplos seus',
            'Uma dúvida para perguntar',
          ].map((t) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }] })) },
        ],
      },
    },
    {
      id: 'fim_abertura', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você escolheu seu caminho e o que preparar. Próxima aula: o dia da entrevista.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    go('a1_1', 'v01_entrevista_comeca', 'q01_perfil'),
    opt('a1_2', 'q01_perfil', 'primeiro_emprego', 'p01_primeiro_emprego', { effects: setPerfil('primeiro_emprego') }),
    opt('a1_3', 'q01_perfil', 'experiencia', 'p02_experiencia', { effects: setPerfil('experiencia') }),
    opt('a1_4', 'q01_perfil', 'transicao', 'p03_transicao', { effects: setPerfil('transicao') }),
    go('a1_5', 'p01_primeiro_emprego', 'at01_situacao_primeiro_emprego'),
    go('a1_6', 'p02_experiencia', 'at01_entrega_experiencia'),
    go('a1_7', 'p03_transicao', 'at01_ponte_transicao'),
    ...pickEdges('a1_8', AT01_PRIMEIRO_EMPREGO, 'v02_o_que_preparar'),
    ...pickEdges('a1_9', AT01_EXPERIENCIA, 'v02_o_que_preparar'),
    ...pickEdges('a1_10', AT01_TRANSICAO, 'v02_o_que_preparar'),
    go('a1_11', 'v02_o_que_preparar', 'q02_convite_amanha'),
    opt('a1_12', 'q02_convite_amanha', 'a', 'r01_prepare_o_que_vai_usar'),
    opt('a1_13', 'q02_convite_amanha', 'b', 'fim_abertura'),
    opt('a1_14', 'q02_convite_amanha', 'c', 'r01_prepare_o_que_vai_usar'),
    go('a1_15', 'r01_prepare_o_que_vai_usar', 'q02_bis_quinze_minutos'),
    opt('a1_16', 'q02_bis_quinze_minutos', 'revisar', 'fim_abertura'),
    opt('a1_17', 'q02_bis_quinze_minutos', 'memorizar', 'c02_exemplo_checklist'),
    go('a1_18', 'c02_exemplo_checklist', 'fim_abertura'),
  ],
  layout: layoutRows([
    ['v01_entrevista_comeca'],
    ['q01_perfil'],
    ['p01_primeiro_emprego', 'p02_experiencia', 'p03_transicao'],
    ['at01_situacao_primeiro_emprego', 'at01_entrega_experiencia', 'at01_ponte_transicao'],
    ['v02_o_que_preparar'],
    ['q02_convite_amanha'],
    ['r01_prepare_o_que_vai_usar'],
    ['q02_bis_quinze_minutos'],
    ['c02_exemplo_checklist'],
    ['fim_abertura'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 2 — No dia: chegar bem e com calma                                    */
/* ------------------------------------------------------------------------ */

const TRAJETO_DICA = 'Faça assim: confira o trajeto na véspera, num app ou fazendo o caminho uma vez, e conte com folga para o trânsito.';

const diaDaEntrevista: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'd01_chegar_bem',
  variables: [],
  nodes: [
    {
      id: 'd01_chegar_bem', type: 'content', title: 'No dia: chegar bem e com calma', objectiveIds: [OBJ.dia], required: true,
      body: p('Horário · Caminho · Roupa · Calma · 3 pontos: apresentação, exemplo, pergunta'),
      narration: 'No dia da entrevista, quatro coisas ajudam muito: sair no horário certo, conhecer o caminho, vestir algo confortável e cuidar da calma. Nada disso exige gastar dinheiro. E leve três pontos na cabeça: sua apresentação, um exemplo real e uma pergunta para fazer. Vamos treinar cada momento com situações rápidas. Você escolhe, e eu comento.',
      motionPrompt: 'nods slowly, warm',
    },
    {
      id: 'd02_quando_sair', type: 'choice', title: 'Quando você sai?', objectiveIds: [OBJ.dia], required: true,
      prompt: p('Sua entrevista é às 14h e o trajeto leva 40 min. Quando você sai?'),
      options: [
        o('exato', 'Saio às 13h20, que é o tempo exato do trajeto.', 'Você fica sem margem para atrasos. Saia com folga.', 'weak'),
        o('folga', 'Saio com folga para chegar 10 a 15 minutos antes.', `Você chega com calma. ${TRAJETO_DICA}`, 'strong'),
        o('cedo', 'Saio bem cedo para chegar uma hora antes, por garantia.', 'Você chega com tempo. Espere por perto e entre 10 minutos antes.', 'ok'),
      ],
    },
    {
      id: 'd03_onibus_atrasou', type: 'choice', title: 'O ônibus atrasou', objectiveIds: [OBJ.dia], required: true,
      prompt: p('O ônibus atrasou. Você vai chegar 15 min depois. O que faz?'),
      options: [
        o('explicar', 'Chego o quanto antes e explico pessoalmente o que aconteceu.', 'A pessoa esperou sem saber. Faça assim: avise antes, com nova previsão.', 'ok'),
        o('desistir', 'Desisto, porque chegar atrasado já pega mal de qualquer jeito.', 'Você perde a chance. Avise antes: muitos lugares remarcam.', 'weak'),
        o('avisar', 'Aviso antes do horário, por mensagem, com a nova previsão.', 'Você mostra responsabilidade. Avisar antes ajuda: muitos lugares esperam ou remarcam.', 'strong'),
      ],
    },
    {
      id: 'd04_o_que_vestir', type: 'choice', title: 'O que vestir?', objectiveIds: [OBJ.dia], required: true,
      prompt: p('O que vestir?'),
      options: [
        o('formal', 'Visto a roupa mais formal que eu tiver, para garantir.', 'Pode, mas não precisa. Na dúvida, veja fotos da empresa.', 'ok'),
        o('confortavel', 'Visto algo limpo e confortável, no estilo de quem trabalha lá.', 'Você fica à vontade. Na dúvida, veja fotos ou redes sociais da empresa.', 'strong'),
        o('qualquer', 'Visto o que estiver à mão; o que importa é a conversa.', 'Não precisa ser nova nem cara: limpa e confortável basta.', 'weak'),
      ],
    },
    {
      id: 'd05_coracao_acelera', type: 'choice', title: 'Seu coração acelera', objectiveIds: [OBJ.dia], required: true,
      prompt: p('Na recepção, seu coração acelera. O que você faz?'),
      options: [
        o('ensaiar', 'Repasso todas as respostas na cabeça, do começo ao fim.', 'A tensão cresce. Respire e lembre só os 3 pontos: apresentação, exemplo e pergunta.', 'ok'),
        o('celular', 'Fico no celular para me distrair até chamarem meu nome.', 'A tensão volta. Respire e, se precisar, diga: “Posso pensar um instante?”', 'weak'),
        o('respirar', 'Respiro devagar algumas vezes e repasso meus 3 pontos.', 'Ficar nervoso é normal. Apresentação, exemplo e pergunta bastam. Se travar: “Pode repetir a pergunta?”', 'strong'),
      ],
    },
    {
      id: 'd06_dica_online', type: 'content', title: 'Dica: entrevista online', objectiveIds: [OBJ.dia], required: true,
      body: {
        type: 'doc',
        content: [
          { type: 'bulletList', content: [
            'Teste o link e o som 15 minutos antes.',
            'Tenha um contato reserva se a conexão cair.',
            'Um lugar simples e quieto basta.',
            'Celular serve: sem webcam nem cenário perfeito.',
          ].map((t) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }] })) },
        ],
      },
    },
    {
      id: 'fim_dia_da_entrevista', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você treinou o dia: horário, atraso, roupa e calma. Próxima aula: sua apresentação.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    go('d_1', 'd01_chegar_bem', 'd02_quando_sair'),
    ...['folga', 'exato', 'cedo'].map((o) => opt(`d_2_${o}`, 'd02_quando_sair', o, 'd03_onibus_atrasou')),
    ...['avisar', 'explicar', 'desistir'].map((o) => opt(`d_3_${o}`, 'd03_onibus_atrasou', o, 'd04_o_que_vestir')),
    ...['confortavel', 'formal', 'qualquer'].map((o) => opt(`d_4_${o}`, 'd04_o_que_vestir', o, 'd05_coracao_acelera')),
    ...['respirar', 'ensaiar', 'celular'].map((o) => opt(`d_5_${o}`, 'd05_coracao_acelera', o, 'd06_dica_online')),
    go('d_6', 'd06_dica_online', 'fim_dia_da_entrevista'),
  ],
  layout: layoutRows([
    ['d01_chegar_bem'],
    ['d02_quando_sair'],
    ['d03_onibus_atrasou'],
    ['d04_o_que_vestir'],
    ['d05_coracao_acelera'],
    ['d06_dica_online'],
    ['fim_dia_da_entrevista'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 3 — Conte um pouco sobre você                                         */
/* ------------------------------------------------------------------------ */

const Q03_A = o('a', '“Sou dedicado, proativo e aprendo rápido. Topo qualquer função que precisarem.”', 'Você citou qualidades, mas sem uma situação que as mostre.', 'ok');
const Q03_C = o('c', '“Nasci em Recife, me mudei aos dez anos e estudei em três escolas.”', 'Você vai longe demais. Conte só o que liga à vaga.', 'weak');
/** Fala da cena Q03 (vídeo gravado na cena de primeiro emprego; a mesma pergunta nas três variantes). */
const Q03_NARRATION = 'Oi, que bom te ver! Obrigada por vir. Pra gente começar, me conta um pouco sobre você.';
const Q03_MOTION = 'smiles warmly and leans in slightly, welcoming';

/** A melhor resposta muda de posição entre as variantes (`at`: índice da B). */
function q03Node(id: string, bLabel: string, at: 0 | 1 | 2): AnyNode {
  const options = [Q03_A, Q03_C];
  options.splice(at, 0, o('b', bLabel, 'Você mostrou seu momento, um exemplo e o interesse na vaga.', 'strong'));
  return {
    id, type: 'choice', title: 'Qual resposta ajuda a conhecer o candidato?', objectiveIds: [OBJ.apresentacao], required: true,
    prompt: p('“Conte um pouco sobre você.” Qual resposta funciona melhor?'),
    narration: Q03_NARRATION,
    motionPrompt: Q03_MOTION,
    options,
    openAnswer: VOICE_PRACTICE,
  };
}

const AT03_PRIMEIRO_EMPREGO = pick('at03_primeiro_emprego', 'Seu começo', 'Qual começo combina com você?', [OBJ.apresentacao], [
  ['ensino_medio', '“Estou terminando o ensino médio e quero começar a trabalhar.”', 'Boa escolha: mostra seu momento com clareza.'],
  ['faculdade', '“Estou na faculdade e já organizei projetos da turma.”', 'Boa escolha: já traz um exemplo seu.'],
  ['curso', '“Fiz um curso técnico e quero usar o que aprendi.”', 'Boa escolha: liga o que você aprendeu à vaga.'],
]);
const AT03_EXPERIENCIA = pick('at03_experiencia', 'Seu começo', 'Qual começo combina com você?', [OBJ.apresentacao], [
  ['onde', '“Trabalhei dois anos no atendimento de uma loja.”', 'Boa escolha: diz onde você atuou.'],
  ['o_que', '“Cuidei de pedidos e prazos no meu último trabalho.”', 'Boa escolha: mostra o que você fazia.'],
  ['proximo', '“Atendi clientes e quero crescer nesta área.”', 'Boa escolha: já aponta seu próximo passo.'],
]);
const AT03_TRANSICAO = pick('at03_transicao', 'Seu começo', 'Qual começo combina com você?', [OBJ.apresentacao], [
  ['estudo', '“Venho do comércio e estou estudando suporte técnico.”', 'Boa escolha: mostra de onde vem e para onde vai.'],
  ['curso', '“Trabalho com vendas e faço um curso na nova área.”', 'Boa escolha: mostra que você já está se preparando.'],
  ['habilidade', '“Atendi pessoas por anos e quero levar isso ao suporte.”', 'Boa escolha: leva uma habilidade para a nova área.'],
]);

const MONTE_PROMPT = 'Toque em cada parte e escolha. Se quiser, escreva a sua.';
const MT03_PRIMEIRO_EMPREGO = compose('mt03_primeiro_emprego', 'Monte sua apresentação', MONTE_PROMPT, [OBJ.apresentacao], 'Estou {momento}. {experiencia}. Quero começar em {area} porque {motivo}.', [
  ['momento', 'seu momento', ['terminando o ensino médio', 'no 1º ano de Administração', 'fazendo um curso técnico']],
  ['experiencia', 'algo que você fez', ['Ajudei no negócio da minha família', 'Organizei um trabalho em grupo', 'Fiz trabalho voluntário']],
  ['area', 'a área', ['atendimento', 'administração', 'vendas']],
  ['motivo', 'o motivo', ['gosto de ajudar as pessoas', 'quero aprender uma rotina de trabalho', 'sou organizado com prazos']],
]);
const MT03_EXPERIENCIA = compose('mt03_experiencia', 'Monte sua apresentação', MONTE_PROMPT, [OBJ.apresentacao], 'Trabalhei {tempo} com {area}. {entrega}. Quero {proximo}.', [
  ['tempo', 'quanto tempo', ['seis meses', 'um ano', 'dois anos']],
  ['area', 'com o quê', ['atendimento', 'vendas', 'estoque e pedidos']],
  ['entrega', 'algo que você fez', ['Resolvi problemas de clientes com pressa', 'Organizei a rotina da equipe', 'Cuidei de pedidos e prazos']],
  ['proximo', 'seu próximo passo', ['levar essa prática para esta equipe', 'crescer nesta área', 'assumir novas responsabilidades']],
]);
const MT03_TRANSICAO = compose('mt03_transicao', 'Monte sua apresentação', MONTE_PROMPT, [OBJ.apresentacao], 'Venho {origem} e estou {preparo}. Quero levar {habilidade} para {area}.', [
  ['origem', 'de onde você vem', ['do comércio', 'do atendimento', 'de vendas']],
  ['preparo', 'como se prepara', ['fazendo um curso na nova área', 'estudando por conta própria', 'praticando em projetos pessoais']],
  ['habilidade', 'o que você leva', ['minha escuta com clientes', 'minha organização com prazos', 'meu jeito de resolver problemas']],
  ['area', 'a nova área', ['o suporte técnico', 'a área administrativa', 'a área de dados']],
]);

const conteSobreVoce: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'v03_apresentacao',
  variables: [perfilVar],
  nodes: [
    {
      id: 'v03_apresentacao', type: 'content', title: 'Uma apresentação com começo, meio e direção', objectiveIds: [OBJ.apresentacao], required: true,
      body: p('Seu momento → Uma experiência → Seu interesse'),
      narration: 'Quando pedirem para você se apresentar, organize a resposta em três partes: seu momento profissional, uma experiência que ajuda a entender suas habilidades e o motivo do interesse pela vaga. Se for seu primeiro emprego, use estudos ou projetos reais. Se já trabalhou, selecione uma experiência relevante. Se estiver mudando de área, explique a ligação com seu próximo passo. Agora vamos construir sua versão.',
    },
    q03Node('q03_primeiro_emprego', '“Estudo administração. Num projeto da turma, organizei os prazos. Quero começar no atendimento.”', 2),
    q03Node('q03_experiencia', '“Trabalhei com atendimento e pedidos. Quero levar essa prática para esta equipe.”', 0),
    q03Node('q03_transicao', '“Venho do atendimento e estudo suporte. Já pratico resolver problemas no curso.”', 1),
    {
      id: 'r02_situacao_por_tras_da_qualidade', type: 'content', title: 'Mostre uma situação por trás da qualidade', objectiveIds: [OBJ.apresentacao], required: true,
      body: p('“Sou organizado” → Como você organizou algo'),
      narration: 'Dizer ‘sou organizado’ é um começo. Contar como você organizou uma tarefa torna isso concreto. Pense em algo pequeno e verdadeiro: acompanhar um prazo, dividir atividades ou conferir pedidos. Depois, ligue esse exemplo ao trabalho que você quer fazer.',
    },
    AT03_PRIMEIRO_EMPREGO,
    AT03_EXPERIENCIA,
    AT03_TRANSICAO,
    MT03_PRIMEIRO_EMPREGO,
    MT03_EXPERIENCIA,
    MT03_TRANSICAO,
    {
      id: 'fim_apresentacao', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Sua apresentação foi para o seu roteiro. Próxima aula: um exemplo real.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    ...perfilBranchEdges('a2_v', 'v03_apresentacao', { primeiro_emprego: 'q03_primeiro_emprego', experiencia: 'q03_experiencia', transicao: 'q03_transicao' }),
    ...(['primeiro_emprego', 'experiencia', 'transicao'] as const).flatMap((perfil, i) => [
      opt(`a2_q${i}a`, `q03_${perfil}`, 'a', 'r02_situacao_por_tras_da_qualidade'),
      opt(`a2_q${i}b`, `q03_${perfil}`, 'b', `at03_${perfil}`),
      opt(`a2_q${i}c`, `q03_${perfil}`, 'c', 'r02_situacao_por_tras_da_qualidade'),
    ]),
    ...perfilBranchEdges('a2_r', 'r02_situacao_por_tras_da_qualidade', { primeiro_emprego: 'at03_primeiro_emprego', experiencia: 'at03_experiencia', transicao: 'at03_transicao' }),
    ...pickEdges('a2_mt0', AT03_PRIMEIRO_EMPREGO, 'mt03_primeiro_emprego'),
    ...pickEdges('a2_mt1', AT03_EXPERIENCIA, 'mt03_experiencia'),
    ...pickEdges('a2_mt2', AT03_TRANSICAO, 'mt03_transicao'),
    go('a2_fim0', 'mt03_primeiro_emprego', 'fim_apresentacao'),
    go('a2_fim1', 'mt03_experiencia', 'fim_apresentacao'),
    go('a2_fim2', 'mt03_transicao', 'fim_apresentacao'),
  ],
  layout: layoutRows([
    ['v03_apresentacao'],
    ['q03_primeiro_emprego', 'q03_experiencia', 'q03_transicao'],
    ['r02_situacao_por_tras_da_qualidade'],
    ['at03_primeiro_emprego', 'at03_experiencia', 'at03_transicao'],
    ['mt03_primeiro_emprego', 'mt03_experiencia', 'mt03_transicao'],
    ['fim_apresentacao'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 4 — Conte o que você fez                                              */
/* ------------------------------------------------------------------------ */

const AT04_EXEMPLO = pick('at04_exemplo_real', 'Seu exemplo', 'Qual situação você poderia contar?', [OBJ.exemplo], [
  ['grupo', 'Um trabalho em grupo em que ajudei a organizar.', 'Boa escolha: mostra como você colabora.'],
  ['familia', 'Uma ajuda em casa ou no negócio da família.', 'Boa escolha: mostra responsabilidade de verdade.'],
  ['curso', 'Um curso, projeto ou trabalho voluntário.', 'Boa escolha: mostra que você aprende fazendo.'],
]);

const MT04_EXEMPLO = compose('mt04_meu_exemplo', 'Monte seu exemplo', MONTE_PROMPT, [OBJ.exemplo], '{situacao}, eu {acao}. {resultado}.', [
  ['situacao', 'a situação', ['Num trabalho em grupo da escola', 'No negócio da minha família', 'Num curso ou trabalho voluntário']],
  ['acao', 'o que você fez', ['dividi as tarefas e acompanhei os prazos', 'atendi clientes e anotei os pedidos', 'ajudei a organizar as atividades']],
  ['resultado', 'o que aconteceu', ['Entregamos no prazo', 'Aprendi a lidar com pressa e com gente', 'Aprendi a pedir ajuda cedo']],
]);

const conteOQueFez: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'v04_conte_o_que_fez',
  variables: [],
  nodes: [
    {
      id: 'v04_conte_o_que_fez', type: 'content', title: 'Conte o que você fez', objectiveIds: [OBJ.exemplo], required: true,
      body: p('Situação → Sua ação → Resultado ou aprendizado'),
      narration: 'Você pode ouvir: ‘conte uma situação em que precisou resolver um problema’. Organize sua resposta em três partes: qual era a situação, o que você fez e o que aconteceu ou aprendeu. Se outras pessoas participaram, reconheça isso e explique sua parte. Não precisa ser uma história grandiosa. O objetivo é ajudar o entrevistador a entender como você agiu em uma situação real.',
    },
    {
      id: 'q04_entrega_atrasando', type: 'choice', title: 'Uma entrega do grupo estava atrasando', objectiveIds: [OBJ.exemplo], required: true,
      prompt: p('A entrega do grupo atrasou. Qual resposta mostra sua parte?'),
      options: [
        o('a', '“Sou do tipo que resolve tudo. Me dou bem com qualquer pessoa.”', 'Você fala de si, mas sem um fato concreto.', 'ok'),
        o('c', '“O pessoal era desorganizado, então acabei fazendo o trabalho todo sozinho.”', 'Você culpou os colegas e não contou o que fez.', 'weak'),
        o('b', '“Dividi o que faltava com o grupo e entregamos no prazo.”', 'Você mostrou situação, ação e resultado, com o grupo junto.', 'strong'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 'r03_complete_a_historia', type: 'content', title: 'Complete a história', objectiveIds: [OBJ.exemplo], required: true,
      body: p('O que acontecia · O que você fez · O que aprendeu'),
      narration: 'Vamos organizar seu exemplo. Primeiro, diga o que estava acontecendo. Depois, uma ação sua: você conversou, conferiu ou propôs o quê? Por último, o resultado ou o aprendizado. Sem número para mostrar, tudo bem. Só não aumente sua parte.',
    },
    AT04_EXEMPLO,
    MT04_EXEMPLO,
    {
      id: 'fim_exemplo', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Seu exemplo foi para o seu roteiro. Próxima aula: explicar uma mudança.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    go('a3_1', 'v04_conte_o_que_fez', 'q04_entrega_atrasando'),
    opt('a3_2', 'q04_entrega_atrasando', 'a', 'r03_complete_a_historia'),
    opt('a3_3', 'q04_entrega_atrasando', 'b', 'at04_exemplo_real'),
    opt('a3_4', 'q04_entrega_atrasando', 'c', 'r03_complete_a_historia'),
    go('a3_5', 'r03_complete_a_historia', 'at04_exemplo_real'),
    ...pickEdges('a3_6', AT04_EXEMPLO, 'mt04_meu_exemplo'),
    go('a3_7', 'mt04_meu_exemplo', 'fim_exemplo'),
  ],
  layout: layoutRows([
    ['v04_conte_o_que_fez'],
    ['q04_entrega_atrasando'],
    ['r03_complete_a_historia'],
    ['at04_exemplo_real'],
    ['mt04_meu_exemplo'],
    ['fim_exemplo'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 5 — Como explicar uma mudança                                         */
/* ------------------------------------------------------------------------ */

const AT05_MOTIVACAO = pick('at05_minha_resposta', 'Sua frase', 'Qual frase combina com seu momento?', [OBJ.dificeis], [
  ['comecar', '“Quero aprender esta rotina e crescer com ela.”', 'Boa escolha: mostra vontade ligada à vaga.'],
  ['usar', '“Quero usar o que já fiz numa equipe nova.”', 'Boa escolha: mostra o que você já traz.'],
  ['mudar', '“Estou me preparando para esta área e quero começar.”', 'Boa escolha: mostra direção e preparo.'],
]);

const explicarMudanca: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'v05_como_explicar_uma_mudanca',
  variables: [perfilVar],
  nodes: [
    {
      id: 'v05_como_explicar_uma_mudanca', type: 'content', title: 'Como explicar uma mudança', objectiveIds: [OBJ.dificeis], required: true,
      body: p('Verdade · Contexto · Próximo passo'),
      narration: 'Perguntas sobre saída de emprego ou mudança de área podem ser delicadas. Prepare uma resposta verdadeira, objetiva e ligada ao seu momento atual. Se houve um desligamento, você pode dizer isso sem transformar a resposta numa defesa longa. Se houve um conflito, explique o contexto necessário com respeito. Se busca o primeiro emprego, sua pergunta será outra: por que quer começar nesta função?',
    },
    {
      id: 'q05_experiencia', type: 'choice', title: 'Por que você saiu do trabalho anterior?', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('Seu contrato não foi renovado. Perguntam: “Por que você saiu do trabalho anterior?”'),
      options: [
        o('c', '“Eu que pedi para sair, porque queria buscar novos desafios.”', 'Você mudou um fato, e isso tira sua credibilidade.', 'weak'),
        o('b', '“O contrato terminou. Agora quero usar minha prática com atendimento.”', 'Você foi breve, verdadeiro e mostrou para onde vai.', 'strong'),
        o('a', '“Meu chefe era péssimo e a equipe não sabia trabalhar direito.”', 'Você atacou pessoas. Fale de fatos e do seu próximo passo.', 'weak'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 'q05_primeiro_emprego', type: 'choice', title: 'Por que quer começar nesta função?', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('“Por que quer começar nesta função?”'),
      options: [
        o('c', '“Trabalhar aqui sempre foi o meu sonho, desde criança.”', 'Você afirmou algo que não conhece. Leia a vaga antes.', 'weak'),
        o('a', '“Preciso trabalhar, então qualquer emprego serve para mim agora.”', 'Você pode precisar de renda. Diga também o que atrai na função.', 'ok'),
        o('b', '“Quero aprender a rotina de atendimento e a organizar as demandas.”', 'Você ligou seu interesse às tarefas da vaga.', 'strong'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 'q05_transicao', type: 'choice', title: 'Por que quer mudar?', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('Você nunca trabalhou com suporte. Perguntam: “Por que quer mudar de área?”'),
      options: [
        o('b', '“Quero atuar com suporte e já faço um curso prático na área.”', 'Você mostrou direção e preparo reais.', 'strong'),
        o('c', '“Já trabalhei bastante com suporte, só não está no meu currículo.”', 'Você inventou algo. Conte o que já sabe e o que aprende.', 'weak'),
        o('a', '“Não aguento mais minha área e preciso sair de lá logo.”', 'Você falou do que deixa. Diga o que quer construir.', 'weak'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 'r04_verdade_contexto_proximo_passo', type: 'content', title: 'Verdade, contexto e próximo passo', objectiveIds: [OBJ.dificeis], required: true,
      body: p('Sem inventar: contexto + o que você busca agora'),
      narration: 'Você pode precisar de renda, ter vivido um conflito ou buscar uma mudança. Não precisa inventar nada. Escolha o contexto que explica sua decisão e diga o que busca agora. Se ainda não entende a vaga, volte à descrição.',
    },
    AT05_MOTIVACAO,
    {
      id: 'fim_motivacao', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Sua frase foi para o seu roteiro. Próxima aula: dúvidas, salário e despedida.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    ...perfilBranchEdges('a4_v', 'v05_como_explicar_uma_mudanca', { primeiro_emprego: 'q05_primeiro_emprego', experiencia: 'q05_experiencia', transicao: 'q05_transicao' }),
    ...(['q05_primeiro_emprego', 'q05_experiencia', 'q05_transicao'] as const).flatMap((q, i) => [
      opt(`a4_q${i}a`, q, 'a', 'r04_verdade_contexto_proximo_passo'),
      opt(`a4_q${i}b`, q, 'b', 'at05_minha_resposta'),
      opt(`a4_q${i}c`, q, 'c', 'r04_verdade_contexto_proximo_passo'),
    ]),
    go('a4_r', 'r04_verdade_contexto_proximo_passo', 'at05_minha_resposta'),
    ...pickEdges('a4_fim', AT05_MOTIVACAO, 'fim_motivacao'),
  ],
  layout: layoutRows([
    ['v05_como_explicar_uma_mudanca'],
    ['q05_primeiro_emprego', 'q05_experiencia', 'q05_transicao'],
    ['r04_verdade_contexto_proximo_passo'],
    ['at05_minha_resposta'],
    ['fim_motivacao'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 6 — Quando não souber, remuneração e encerramento                     */
/* ------------------------------------------------------------------------ */

const Q06_MODELO = '“Ainda não usei. Uso outra ferramenta de cadastro. Qual nível vocês esperam?”';
const Q07_MODELO = '“Qual é a faixa prevista? Minha expectativa considera a jornada.”';

const AT06_APOIO = pick('at06_quando_nao_souber', 'Sua frase de apoio', 'Qual frase você usaria?', [OBJ.dificeis], [
  ['limite', '“Ainda não usei, mas uso algo parecido.”', 'Boa escolha: é honesta e mostra o que você sabe.'],
  ['exemplo', '“Pode me dar um exemplo do que espera?”', 'Boa escolha: você entende antes de responder.'],
  ['pausa', '“Posso pensar um instante antes de responder?”', 'Boa escolha: uma pausa ajuda a responder melhor.'],
]);
const AT08_PERGUNTAS = pick('at08_minhas_duas_perguntas', 'Minhas duas perguntas', 'Quais duas perguntas você levaria?', [OBJ.remuneracao], [
  ['rotina_meses', 'Como é a rotina + o que esperam nos primeiros meses', 'Boa dupla: você entende o dia a dia e as cobranças.'],
  ['treino_passos', 'Como é o treinamento + quais são os próximos passos', 'Boa dupla: você sabe como vai aprender e o que vem.'],
  ['rotina_passos', 'Como é a rotina + quais são os próximos passos', 'Boa dupla: você entende o trabalho e o processo.'],
]);

const naoSouberRemuneracaoEncerramento: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'v06_pedir_esclarecimento',
  variables: [],
  nodes: [
    {
      id: 'v06_pedir_esclarecimento', type: 'content', title: 'Você pode pedir esclarecimento', objectiveIds: [OBJ.dificeis], required: true,
      body: p('Peça um exemplo · Faça uma pausa · Diga o que sabe'),
      narration: 'Se uma pergunta não ficou clara, peça um exemplo ou uma explicação. Se precisar pensar, você pode fazer uma pausa. E, se não conhece uma ferramenta, diga o que já sabe e o que ainda precisa aprender. Por exemplo: ‘Ainda não usei esse sistema. Tenho prática com outra ferramenta de cadastro e gostaria de entender o nível de conhecimento necessário aqui’. Isso permite conversar sobre a exigência real.',
    },
    {
      id: 'q06_sistema_nunca_usou', type: 'choice', title: 'Você nunca usou o sistema citado', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('Citam um sistema que você nunca usou. O que você diz?'),
      options: [
        o('a', '“Já usei, sim. Faz tempo, mas lembro bem como funciona.”', 'Você inventou uma habilidade e criou uma expectativa difícil.', 'weak'),
        o('c', '“Não conheço esse sistema, então não sei dizer.”', 'Você foi honesto. Diga também o que sabe de parecido.', 'ok'),
        o('b', Q06_MODELO, 'Você disse seu limite, o que já sabe e perguntou o requisito.', 'strong'),
      ],
    },
    {
      id: 'r06_refazer_com_apoio', type: 'consequence', title: 'Vamos refazer com apoio', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Você pode dizer só o que conhece de verdade. Faça assim: “Ainda não usei ___. Uso ___. Qual nível vocês esperam?”'),
    },
    {
      id: 'q06_bis_segunda_tentativa', type: 'choice', title: 'Nova tentativa: o sistema que você nunca usou', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('Nova tentativa: “E esse sistema, você domina?”'),
      options: [
        o('b', '“Esse não, mas cadastro clientes em outro. Que nível vocês precisam?”', 'Você disse o limite, o que sabe e perguntou.', 'strong'),
        o('a', '“Domino, sim. Aprendo rápido e logo pego o jeito.”', 'Você afirmou um domínio que não tem.', 'weak'),
        o('c', '“Não domino. Esse sistema eu nunca usei na vida.”', 'Você foi honesto, mas não contou o que já faz.', 'ok'),
      ],
    },
    {
      id: 'c06_exemplo_comentado', type: 'consequence', title: 'Exemplo comentado', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Faça assim: “Ainda não usei. Uso outra ferramenta. Qual nível vocês esperam?”'),
      guidance: p('Funciona porque você diz o limite, o que já faz e pergunta.'),
    },
    AT06_APOIO,
    {
      id: 'v07_o_que_precisa_saber', type: 'content', title: 'Fale sobre o que você precisa saber', objectiveIds: [OBJ.remuneracao], required: true,
      body: p('Salário · Benefícios · Jornada · Local'),
      narration: 'A entrevista também serve para você entender a oportunidade. Quando surgir a conversa sobre remuneração, considere salário, benefícios, jornada, local e responsabilidades. Você pode perguntar a faixa prevista para a vaga ou apresentar uma expectativa que tenha pesquisado. Se uma condição é essencial para você, vale esclarecer. Aceitar sem entender pode criar um problema depois. Vamos praticar uma forma de abrir essa conversa.',
    },
    {
      id: 'q07_pretensao_salarial', type: 'choice', title: 'Qual sua pretensão salarial?', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('“Qual sua pretensão salarial?”'),
      options: [
        o('c', '“Quero dois mil e quinhentos. Abaixo disso, não dá para mim.”', 'Você tem limites, e tudo bem. Conheça a proposta antes.', 'ok'),
        o('b', Q07_MODELO, 'Você pediu informação e deu base à sua expectativa.', 'strong'),
        o('a', '“Qualquer valor está bom para mim, o importante é começar.”', 'Você aceita sem saber as condições. Peça a faixa.', 'weak'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 'r07_tente_pedir_a_faixa', type: 'consequence', title: 'Tente pedir a faixa', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Você pode conhecer a proposta antes de aceitar ou exigir. Faça assim: “Qual é a faixa prevista e o que inclui?”'),
    },
    {
      id: 'q07_bis_segunda_tentativa', type: 'choice', title: 'Nova tentativa: pretensão salarial', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('Nova tentativa: “Então, qual é a sua pretensão?”'),
      options: [
        o('a', '“O que vocês oferecerem está ótimo, não quero atrapalhar.”', 'Você aceitou sem entender a proposta.', 'weak'),
        o('c', '“Tenho um valor fechado na cabeça. Abaixo dele, nem converso.”', 'Você fechou a conversa sem conhecer a proposta.', 'weak'),
        o('b', '“Antes, posso saber a faixa e a jornada? Aí digo minha expectativa.”', 'Você pediu a faixa e ligou sua expectativa à jornada.', 'strong'),
      ],
    },
    {
      id: 'c07_exemplo_comentado', type: 'consequence', title: 'Exemplo comentado', tone: 'neutral', objectiveIds: [], required: true,
      body: p(`Faça assim: ${Q07_MODELO}`),
      guidance: p('Funciona porque você pede o que falta e mostra a base do seu valor.'),
    },
    {
      id: 'v08_perguntas_que_ajudam_a_decidir', type: 'content', title: 'Faça perguntas que ajudam você a decidir', objectiveIds: [OBJ.remuneracao], required: true,
      body: p('Rotina · Primeiros meses · Treinamento · Próximos passos'),
      narration: 'Quando vier ‘você tem alguma pergunta?’, use o espaço para esclarecer algo importante. Como é a rotina? O que esperam da pessoa nos primeiros meses? Como funciona o treinamento? Se tudo já foi explicado, você pode dizer isso e confirmar os próximos passos. Ao terminar, agradeça a conversa. Depois, registre o que ficou claro e o que ainda precisa avaliar antes de aceitar uma proposta.',
    },
    {
      id: 'q08_como_encerraria', type: 'choice', title: 'Como você encerraria?', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('“Você tem alguma pergunta?” O que você responde?'),
      options: [
        o('a', '“Como é a rotina da equipe no dia a dia?”', 'Você usou o espaço para entender o trabalho.', 'strong'),
        o('b', '“Não, obrigado. Acho que já entendi tudo.”', 'Você foi educado, mas perdeu a chance de esclarecer algo.', 'weak'),
        o('c', '“Quais são os próximos passos do processo?”', 'Você esclareceu o que acontece depois.', 'strong'),
      ],
    },
    {
      id: 'q08_bis_pergunta_util', type: 'choice', title: 'Escolha uma pergunta útil', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('Mesmo com pouco tempo, qual pergunta você faz?'),
      options: [
        { id: 'rotina', label: '“Como é a rotina no dia a dia?”', feedback: p('Você entende o trabalho real.') },
        { id: 'primeiros_meses', label: '“O que esperam nos primeiros meses?”', feedback: p('Você sabe o que será cobrado.') },
        { id: 'proximos_passos', label: '“Quais são os próximos passos?”', feedback: p('Você sabe quando esperar retorno.') },
      ],
    },
    AT08_PERGUNTAS,
    {
      id: 'fim_encerramento', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você praticou dúvidas, salário e perguntas. Próxima aula: a simulação final.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    go('a5_1', 'v06_pedir_esclarecimento', 'q06_sistema_nunca_usou'),
    opt('a5_2', 'q06_sistema_nunca_usou', 'a', 'r06_refazer_com_apoio'),
    opt('a5_3', 'q06_sistema_nunca_usou', 'b', 'at06_quando_nao_souber'),
    opt('a5_4', 'q06_sistema_nunca_usou', 'c', 'r06_refazer_com_apoio'),
    go('a5_5', 'r06_refazer_com_apoio', 'q06_bis_segunda_tentativa'),
    opt('a5_6', 'q06_bis_segunda_tentativa', 'a', 'c06_exemplo_comentado'),
    opt('a5_7', 'q06_bis_segunda_tentativa', 'b', 'at06_quando_nao_souber'),
    opt('a5_8', 'q06_bis_segunda_tentativa', 'c', 'c06_exemplo_comentado'),
    go('a5_9', 'c06_exemplo_comentado', 'at06_quando_nao_souber'),
    ...pickEdges('a5_10', AT06_APOIO, 'v07_o_que_precisa_saber'),
    go('a5_11', 'v07_o_que_precisa_saber', 'q07_pretensao_salarial'),
    opt('a5_12', 'q07_pretensao_salarial', 'a', 'r07_tente_pedir_a_faixa'),
    opt('a5_13', 'q07_pretensao_salarial', 'b', 'v08_perguntas_que_ajudam_a_decidir'),
    opt('a5_14', 'q07_pretensao_salarial', 'c', 'r07_tente_pedir_a_faixa'),
    go('a5_15', 'r07_tente_pedir_a_faixa', 'q07_bis_segunda_tentativa'),
    opt('a5_16', 'q07_bis_segunda_tentativa', 'a', 'c07_exemplo_comentado'),
    opt('a5_17', 'q07_bis_segunda_tentativa', 'b', 'v08_perguntas_que_ajudam_a_decidir'),
    opt('a5_18', 'q07_bis_segunda_tentativa', 'c', 'c07_exemplo_comentado'),
    go('a5_19', 'c07_exemplo_comentado', 'v08_perguntas_que_ajudam_a_decidir'),
    go('a5_20', 'v08_perguntas_que_ajudam_a_decidir', 'q08_como_encerraria'),
    opt('a5_21', 'q08_como_encerraria', 'a', 'at08_minhas_duas_perguntas'),
    opt('a5_22', 'q08_como_encerraria', 'b', 'q08_bis_pergunta_util'),
    opt('a5_23', 'q08_como_encerraria', 'c', 'at08_minhas_duas_perguntas'),
    opt('a5_24', 'q08_bis_pergunta_util', 'rotina', 'at08_minhas_duas_perguntas'),
    opt('a5_25', 'q08_bis_pergunta_util', 'primeiros_meses', 'at08_minhas_duas_perguntas'),
    opt('a5_26', 'q08_bis_pergunta_util', 'proximos_passos', 'at08_minhas_duas_perguntas'),
    ...pickEdges('a5_27', AT08_PERGUNTAS, 'fim_encerramento'),
  ],
  layout: layoutRows([
    ['v06_pedir_esclarecimento'],
    ['q06_sistema_nunca_usou'],
    ['r06_refazer_com_apoio'],
    ['q06_bis_segunda_tentativa'],
    ['c06_exemplo_comentado'],
    ['at06_quando_nao_souber'],
    ['v07_o_que_precisa_saber'],
    ['q07_pretensao_salarial'],
    ['r07_tente_pedir_a_faixa'],
    ['q07_bis_segunda_tentativa'],
    ['c07_exemplo_comentado'],
    ['v08_perguntas_que_ajudam_a_decidir'],
    ['q08_como_encerraria'],
    ['q08_bis_pergunta_util'],
    ['at08_minhas_duas_perguntas'],
    ['fim_encerramento'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Aula 7 — Simulação final                                                   */
/* ------------------------------------------------------------------------ */

const CHECKLIST_SAIDA = ['Revisar a vaga', 'Separar exemplos', 'Anotar dúvidas'];

/** Lembretes da aula "No dia: chegar bem e com calma". */
const CHECKLIST_DIA = ['Horário e trajeto conferidos', 'Folga para o trânsito', 'Contato para avisar atraso', 'Roupa separada', '3 pontos para lembrar: apresentação, um exemplo real e uma pergunta para fazer'];

const ESCLARECER = ['Remuneração: faixa prevista e pacote', 'Jornada e local', 'Outras condições que você precisa esclarecer'];

/** Única anotação do curso: opcional (minLength 0), com "Pular" no player. */
export const PODE_ENTRAR_NOTE_ID = 'nota_minha_apresentacao';

/**
 * Página "Meu roteiro de entrevista": montada com o que o aluno produziu — a
 * frase que ele MONTOU (apresentação, exemplo) ou, se pulou, a opção escolhida
 * na atividade guiada —, a anotação opcional e lembretes fixos. Nenhum item
 * depende de escrever.
 */
function recapFor(proximoTreino: string): RecapItem[] {
  const choice = (id: string, label: string, nodeId: string, emptyText: string, nodeIds?: string[]): RecapItem => ({ id, label, kind: 'choice', nodeId, ...(nodeIds ? { nodeIds } : {}), emptyText });
  return [
    { ...choice('minha_apresentacao', 'Minha apresentação', 'at03_primeiro_emprego', 'Monte na aula 3', ['at03_experiencia', 'at03_transicao']), composedNodeIds: ['mt03_primeiro_emprego', 'mt03_experiencia', 'mt03_transicao'] },
    choice('meu_destaque', 'O que minha história mostra', 'at01_situacao_primeiro_emprego', 'Escolha na aula 1', ['at01_entrega_experiencia', 'at01_ponte_transicao']),
    { ...choice('meu_exemplo', 'Meu exemplo', 'at04_exemplo_real', 'Monte na aula 4'), composedNodeIds: ['mt04_meu_exemplo'] },
    choice('minha_motivacao', 'Minha motivação', 'at05_minha_resposta', 'Escolha na aula 5'),
    choice('quando_nao_souber', 'Quando eu não souber', 'at06_quando_nao_souber', 'Escolha na aula 6'),
    { id: 'preciso_esclarecer', label: 'O que preciso esclarecer', kind: 'checklist', items: ESCLARECER, emptyText: 'Completar quando quiser' },
    choice('minhas_duas_perguntas', 'Minhas duas perguntas', 'at08_minhas_duas_perguntas', 'Escolha na aula 6'),
    { id: 'minha_anotacao', label: 'Minha anotação', kind: 'reflection', nodeId: PODE_ENTRAR_NOTE_ID, emptyText: 'Se quiser, escreva depois' },
    { id: 'meu_proximo_treino', label: 'Meu próximo treino', kind: 'text', text: proximoTreino, emptyText: 'Completar quando quiser' },
    { id: 'dia_da_entrevista', label: 'Dia da entrevista', kind: 'checklist', items: CHECKLIST_DIA, emptyText: 'Completar quando quiser' },
    { id: 'checklist', label: 'Checklist', kind: 'checklist', items: CHECKLIST_SAIDA, emptyText: 'Completar quando quiser' },
  ];
}

const CLOSING_LINE = 'Você não precisa decorar sua história. Precisa conseguir explicá-la.';
const RECAP_TITLE = 'Meu roteiro de entrevista';

const pts = (by: number): Partial<Edge> => (by > 0 ? { effects: [{ op: 'inc', var: 'pontos', by }] } : {});

function endNode(id: string, summary: string, proximoTreino: string): AnyNode {
  return {
    id, type: 'end', title: 'Meu roteiro de entrevista', objectiveIds: [], required: true,
    summary: p(summary),
    recap: recapFor(proximoTreino),
    recapTitle: RECAP_TITLE,
    closingLine: CLOSING_LINE,
    outcomeLabel: 'Curso concluído',
  };
}

const simulacaoFinal: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'intro_simulacao',
  variables: [{ name: 'pontos', type: 'number', initial: 0, label: 'Pontos da simulação' }],
  nodes: [
    {
      id: 'intro_simulacao', type: 'scenario', title: 'Entrevista para assistente de atendimento', objectiveIds: [], required: true,
      body: p('Sua vez: escolha a resposta que conduz melhor a conversa. Vaga: assistente de atendimento, com treinamento e sem exigir experiência.'),
    },
    {
      id: 's01_perfil_combina', type: 'choice', title: 'Por que seu perfil combina com a função?', objectiveIds: [OBJ.apresentacao], required: true,
      prompt: p('Você nunca trabalhou com atendimento. “Por que seu perfil combina com a função?”'),
      options: [
        o('a', '“Sou muito esforçado e me adapto a qualquer vaga que aparecer.”', 'Você mostrou esforço, mas não ligou à vaga; cite um exemplo seu.', 'ok'),
        o('c', '“Já trabalhei com atendimento antes, então sei como funciona.”', 'Você inventou uma experiência; conte o que fez de verdade, mesmo fora de um emprego.', 'weak'),
        o('b', '“Num projeto da escola, organizei os pedidos. Posso contar como foi?”', 'Você ligou uma experiência real ao trabalho e abriu a conversa.', 'strong'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 's02_algo_deu_errado', type: 'choice', title: 'Conte uma situação em que algo deu errado', objectiveIds: [OBJ.exemplo], required: true,
      prompt: p('“Conte uma situação em que algo deu errado.”'),
      options: [
        o('b', '“Já passei por várias dificuldades e aprendi muito com todas elas.”', 'Você foi vago; conte uma situação, o que fez e o que aprendeu.', 'ok'),
        o('a', '“Uma tarefa atrasou. Avisei o grupo e aprendi a acompanhar etapas.”', 'Você mostrou o problema, sua ação e o que aprendeu.', 'strong'),
        o('c', '“Sinceramente, não lembro de nada que tenha dado errado comigo.”', 'Você ficou sem exemplo; todo mundo erra, e contar como resolveu mostra maturidade.', 'weak'),
      ],
      openAnswer: VOICE_PRACTICE,
    },
    {
      id: 's03_pergunta_confusa', type: 'choice', title: 'A pergunta ficou confusa', objectiveIds: [OBJ.dificeis], required: true,
      prompt: p('Você não entendeu bem a pergunta. O que faz?'),
      options: [
        o('b', 'Peço para a pessoa explicar a pergunta de outro jeito.', 'Você esclareceu antes de responder, e isso mostra cuidado.', 'strong'),
        o('a', 'Respondo o que acho que é, para não ficar em silêncio.', 'Você evitou a pausa, mas pode ter respondido outra coisa; peça para explicar.', 'weak'),
        o('c', 'Peço um tempinho para pensar e tento adivinhar o sentido.', 'Você ganhou tempo, mas faltou esclarecer; pergunte o que a pessoa quis dizer.', 'ok'),
      ],
    },
    {
      id: 's04_sem_informacao_jornada', type: 'choice', title: 'A entrevista termina sem informação sobre jornada', objectiveIds: [OBJ.remuneracao], required: true,
      prompt: p('A conversa está acabando e ninguém falou da jornada. O que você faz?'),
      options: [
        o('c', 'Digo que topo qualquer horário, para mostrar interesse.', 'Você assumiu um compromisso sem saber se consegue; pergunte a jornada primeiro.', 'weak'),
        o('a', 'Agradeço a conversa e espero falarem da jornada depois.', 'Você foi gentil, mas saiu sem saber a jornada; pergunte antes de terminar.', 'ok'),
        o('b', 'Pergunto sobre a jornada e quais são os próximos passos.', 'Você esclareceu as condições e o que vem depois.', 'strong'),
      ],
    },
    {
      id: 'resultado_simulacao', type: 'content', title: 'Resultado da simulação', objectiveIds: [], required: true,
      body: p('Veja cada resposta e a dica. O resultado mede só estas escolhas, não você.'),
      reviewNodeIds: ['s01_perfil_combina', 's02_algo_deu_errado', 's03_pergunta_confusa', 's04_sem_informacao_jornada'],
    },
    {
      id: 'e01_leve_a_pratica', type: 'content', title: 'Agora leve a prática para a conversa', objectiveIds: [], required: true,
      body: p('Revise · Leia em voz alta · Converse'),
      narration: 'Nesta simulação, você fez escolhas que ajudaram a explicar experiências, esclarecer dúvidas e entender a oportunidade. Agora revise sua apresentação e seu exemplo real. Leia em voz alta se isso ajudar, mas deixe espaço para conversar. Uma entrevista depende de vários fatores. Seu próximo passo é chegar com informações e respostas que você consegue sustentar com tranquilidade.',
    },
    {
      id: 'e02_base_para_ajustar', type: 'content', title: 'Você já tem uma base para ajustar', objectiveIds: [], required: true,
      body: p('Escolha um ponto · Ajuste · Tente de novo'),
      narration: 'Você encontrou boas respostas e deixou alguns pontos para desenvolver. Vamos olhar onde faltou um exemplo ou uma informação. Escolha uma resposta, ajuste e tente de novo. A ideia é perceber o que ajuda a explicar melhor sua experiência e o que você precisa perguntar. Seu roteiro final vai mostrar os pontos que já preparou e o que ainda quer praticar.',
    },
    {
      id: 'e03_vamos_por_partes', type: 'content', title: 'Vamos por partes', objectiveIds: [], required: true,
      body: p('Um passo de cada vez · Comece pela apresentação'),
      narration: 'Algumas situações desta simulação ainda precisam de prática, e você pode trabalhar uma de cada vez. Vamos começar pela apresentação: seu momento, um exemplo verdadeiro e seu interesse na vaga. Depois, você pode revisar as perguntas que trouxeram dúvida. Use os exemplos como apoio e responda do seu jeito. O objetivo aqui é sair com um próximo passo que você consiga realizar.',
    },
    {
      id: PODE_ENTRAR_NOTE_ID, type: 'reflection', title: 'Sua anotação (opcional)', objectiveIds: [], required: true, minLength: 0, maxLength: 600,
      prompt: p('Quer anotar sua apresentação do seu jeito? É opcional.'),
      placeholder: 'Hoje eu… Uma experiência que mostra isso foi…\nTenho interesse nesta vaga porque…',
    },
    endNode(
      'fim_e01',
      'Você concluiu a simulação com respostas fortes na maior parte. Seu roteiro está logo abaixo.',
      'Ler em voz alta sua apresentação e seu exemplo, deixando espaço para conversar.',
    ),
    endNode(
      'fim_e02',
      'Você concluiu a simulação e já tem uma base. Seu roteiro está logo abaixo.',
      'Rever um ou dois pontos: apresentação (aula 3), exemplo (aula 4) ou dúvidas e salário (aula 6). Refazer a aula escolhida uma vez.',
    ),
    endNode(
      'fim_e03',
      'Você concluiu a simulação. Vamos praticar por partes. Seu roteiro está logo abaixo.',
      'Refazer a aula 3 (apresentação) e depois a aula 4 (exemplo). Voltar à simulação em seguida.',
    ),
  ],
  edges: [
    go('a6_1', 'intro_simulacao', 's01_perfil_combina'),
    opt('a6_2', 's01_perfil_combina', 'a', 's02_algo_deu_errado', pts(1)),
    opt('a6_3', 's01_perfil_combina', 'b', 's02_algo_deu_errado', pts(2)),
    opt('a6_4', 's01_perfil_combina', 'c', 's02_algo_deu_errado', pts(0)),
    opt('a6_5', 's02_algo_deu_errado', 'a', 's03_pergunta_confusa', pts(2)),
    opt('a6_6', 's02_algo_deu_errado', 'b', 's03_pergunta_confusa', pts(1)),
    opt('a6_7', 's02_algo_deu_errado', 'c', 's03_pergunta_confusa', pts(0)),
    opt('a6_8', 's03_pergunta_confusa', 'a', 's04_sem_informacao_jornada', pts(0)),
    opt('a6_9', 's03_pergunta_confusa', 'b', 's04_sem_informacao_jornada', pts(2)),
    opt('a6_10', 's03_pergunta_confusa', 'c', 's04_sem_informacao_jornada', pts(1)),
    opt('a6_11', 's04_sem_informacao_jornada', 'a', 'resultado_simulacao', pts(1)),
    opt('a6_12', 's04_sem_informacao_jornada', 'b', 'resultado_simulacao', pts(2)),
    opt('a6_13', 's04_sem_informacao_jornada', 'c', 'resultado_simulacao', pts(0)),
    go('a6_14', 'resultado_simulacao', 'e01_leve_a_pratica', { condition: { op: 'gte', var: 'pontos', value: 7 }, priority: 1 }),
    go('a6_15', 'resultado_simulacao', 'e03_vamos_por_partes', { condition: { op: 'lte', var: 'pontos', value: 3 }, priority: 2 }),
    go('a6_16', 'resultado_simulacao', 'e02_base_para_ajustar', { isDefault: true }),
    // os três encerramentos passam pela anotação opcional e voltam à sua faixa
    go('a6_17', 'e01_leve_a_pratica', PODE_ENTRAR_NOTE_ID),
    go('a6_18', 'e02_base_para_ajustar', PODE_ENTRAR_NOTE_ID),
    go('a6_19', 'e03_vamos_por_partes', PODE_ENTRAR_NOTE_ID),
    go('a6_20', PODE_ENTRAR_NOTE_ID, 'fim_e01', { condition: { op: 'gte', var: 'pontos', value: 7 }, priority: 1 }),
    go('a6_21', PODE_ENTRAR_NOTE_ID, 'fim_e03', { condition: { op: 'lte', var: 'pontos', value: 3 }, priority: 2 }),
    go('a6_22', PODE_ENTRAR_NOTE_ID, 'fim_e02', { isDefault: true }),
  ],
  layout: layoutRows([
    ['intro_simulacao'],
    ['s01_perfil_combina'],
    ['s02_algo_deu_errado'],
    ['s03_pergunta_confusa'],
    ['s04_sem_informacao_jornada'],
    ['resultado_simulacao'],
    ['e01_leve_a_pratica', 'e02_base_para_ajustar', 'e03_vamos_por_partes'],
    [PODE_ENTRAR_NOTE_ID],
    ['fim_e01', 'fim_e02', 'fim_e03'],
  ]),
};

/* ------------------------------------------------------------------------ */
/* Documento do curso                                                         */
/* ------------------------------------------------------------------------ */

export const PODE_ENTRAR_LESSON_IDS = [
  'aula_abertura_preparacao',
  'aula_dia_da_entrevista',
  'aula_conte_sobre_voce',
  'aula_conte_o_que_fez',
  'aula_explicar_mudanca',
  'aula_nao_souber_remuneracao_encerramento',
  'aula_simulacao_final',
] as const;

export const podeEntrar: CourseDocument = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: PODE_ENTRAR_TITLE,
  description: 'O aluno vive uma entrevista, escolhe respostas, vê o efeito e tenta de novo. Ao final, leva um roteiro montado com as próprias escolhas: apresentação, exemplo real, motivação, frase para quando não souber, perguntas para avaliar a oportunidade e o checklist do dia.',
  learnerSummary: 'Você treina uma entrevista de verdade: escolhe respostas, vê o efeito e tenta de novo. No fim, sai com o seu roteiro: apresentação, um exemplo real, suas perguntas e o checklist do dia.',
  brief: {
    topic: 'Como se preparar para uma entrevista de emprego e conduzir a conversa com respostas verdadeiras e específicas.',
    audience: 'jovens buscando o primeiro estágio ou emprego no Brasil (muitos tímidos ou introvertidos), e também quem já trabalhou ou quer mudar de área',
    context: 'Entrevistas presenciais ou por videochamada para vagas de entrada e de nível operacional; três perfis: primeiro emprego, experiência profissional e mudança de área. Pouco texto na tela, escolhas guiadas em vez de respostas abertas; falar em voz alta é treino opcional.',
    prerequisites: 'Nenhum.',
    finalSkill: 'Chegar à próxima entrevista com uma apresentação pessoal preparada, exemplos reais das próprias habilidades, formas de lidar com perguntas difíceis e perguntas para avaliar a oportunidade.',
    tone: 'brasileiro, acolhedor, direto e adulto; apresentadora em conversa com o aluno; sem linguagem de palestra, respostas decoradas ou promessas de contratação',
    narrativeVoice: 'second_person',
    targetMinutes: 30,
    sourcesNote: 'Roteiro autoral da curadora do curso (curso-entrevista-interativa.md, versão 1). Sem fontes externas que exijam validação.',
  },
  objectives: [
    { id: OBJ.apresentacao, title: 'Preparar uma apresentação de 30–60 segundos conectada à vaga', criterion: 'Reconhece a resposta com momento, exemplo e interesse (Q03) e escolhe o começo da própria apresentação (AT03).', required: true },
    { id: OBJ.exemplo, title: 'Selecionar um exemplo verdadeiro e explicar sua participação', criterion: 'Reconhece a resposta com situação, ação e resultado (Q04) e escolhe a situação real que vai contar (AT04).', required: true },
    { id: OBJ.dificeis, title: 'Responder a perguntas difíceis com clareza e honestidade', criterion: 'Escolhe respostas verdadeiras e com contexto para saída, mudança ou desconhecimento de um requisito; escolhe sua frase de motivação e de apoio (AT05, AT06).', required: true },
    { id: OBJ.remuneracao, title: 'Conversar sobre remuneração e fazer perguntas sobre a oportunidade', criterion: 'Abre a conversa sobre faixa e condições sem aceitar nem exigir às cegas; escolhe duas perguntas que faria ao final (Q07, Q08).', required: true },
    { id: OBJ.dia, title: 'Chegar à entrevista no horário, avisando imprevistos e com calma', criterion: 'Escolhe sair com folga, avisar um atraso antes do horário, vestir algo adequado sem gastar e se acalmar na recepção (D02–D05).', required: true },
  ],
  modules: [
    {
      id: 'mod_entrevista', title: 'Sua próxima entrevista', description: 'Da abertura à simulação final: cada aula pratica um momento da entrevista e guarda uma escolha sua para o roteiro.',
      lessons: [
        { id: PODE_ENTRAR_LESSON_IDS[0], title: 'Abertura e preparação', description: 'Escolha seu caminho (primeiro emprego, experiência ou mudança de área), o que sua história mostra e o que preparar quando o convite chega para amanhã.', estimatedMinutes: 5, family: 'decision_consequence', objectiveIds: [OBJ.apresentacao, OBJ.exemplo, OBJ.remuneracao], graph: aberturaPreparacao },
        { id: PODE_ENTRAR_LESSON_IDS[1], title: 'No dia: chegar bem e com calma', description: 'Horário, atraso, roupa e nervosismo: quatro decisões rápidas e uma dica para a entrevista online.', estimatedMinutes: 4, family: 'decision_consequence', objectiveIds: [OBJ.dia], graph: diaDaEntrevista },
        { id: PODE_ENTRAR_LESSON_IDS[2], title: 'Conte um pouco sobre você', description: 'Uma apresentação com começo, meio e direção, adaptada ao seu perfil. No fim, você monta a sua, tocando nas partes.', estimatedMinutes: 4, family: 'production_review', objectiveIds: [OBJ.apresentacao], graph: conteSobreVoce },
        { id: PODE_ENTRAR_LESSON_IDS[3], title: 'Conte o que você fez', description: 'Situação, o que você fez e o que aprendeu. No fim, você monta o seu exemplo real.', estimatedMinutes: 4, family: 'production_review', objectiveIds: [OBJ.exemplo], graph: conteOQueFez },
        { id: PODE_ENTRAR_LESSON_IDS[4], title: 'Como explicar uma mudança', description: 'Saída do trabalho anterior, começo na função ou mudança de área: verdade, contexto e próximo passo.', estimatedMinutes: 4, family: 'decision_consequence', objectiveIds: [OBJ.dificeis], graph: explicarMudanca },
        { id: PODE_ENTRAR_LESSON_IDS[5], title: 'Quando não souber, remuneração e encerramento', description: 'O que dizer quando não conhece algo, como abrir a conversa sobre remuneração e como encerrar com perguntas suas.', estimatedMinutes: 6, family: 'decision_consequence', objectiveIds: [OBJ.dificeis, OBJ.remuneracao], graph: naoSouberRemuneracaoEncerramento },
        { id: PODE_ENTRAR_LESSON_IDS[6], title: 'Simulação final', description: 'Uma entrevista para assistente de atendimento: quatro perguntas, o resultado de cada resposta e o seu roteiro de entrevista.', estimatedMinutes: 5, family: 'decision_consequence', objectiveIds: [OBJ.apresentacao, OBJ.exemplo, OBJ.dificeis, OBJ.remuneracao], graph: simulacaoFinal },
      ],
    },
  ],
  completion: { requiredLessonIds: [...PODE_ENTRAR_LESSON_IDS] },
  cast: [
    { name: 'Apresentadora', role: 'Mentora que conversa com o aluno', details: 'Conduz todos os vídeos (V01–V08, D01, P01–P03, R01–R04, E01–E03) em plano médio, como uma conversa por videochamada. Tom acolhedor, direto e adulto; nunca rotula o aluno.' },
    { name: 'Entrevistador', role: 'Personagem de contexto (não aparece em vídeo)', details: 'Faz as perguntas das situações e da simulação final. Vaga fictícia da simulação: assistente de atendimento (atendimento inicial, registro de solicitações, organização de pendências, trabalho em equipe; treinamento no sistema interno; sem exigência de experiência anterior).' },
  ],
  /* Mesma apresentadora, voz e fundo do curso "Primeira entrevista de emprego" (crs_xqkyc0g025q85as8), para produzir os vídeos depois. */
  presentation: {
    avatarId: '6ac78d9347a6b062051f6f0e9230e68b',
    avatarName: 'professora-1-teal',
    presenterPronoun: 'she',
    voiceProvider: 'elevenlabs',
    voiceId: 'MZxV5lN3cv7hi1376O0m',
    voiceName: 'Ana Dias',
    background: { type: 'color', value: '#EFE6D8', name: 'Areia' },
    aspectRatio: '16:9',
    expressiveness: 'high',
    removeBackground: true,
    cameras: [],
    directionStyle: { pace: 'balanced', useSlides: true, slideAccent: '#1a66d1', matchCinematicSetting: true, maxCinematicPerLesson: 2 },
  },
  wizard: { step: 'revisao', completedSteps: ['tema', 'conteudo', 'estrutura', 'apresentacao', 'aulas', 'revisao'], contentMode: 'paste', finished: true },
});
