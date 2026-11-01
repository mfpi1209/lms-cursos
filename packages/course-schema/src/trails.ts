/**
 * Reconhecimento por trilha (decisão do autor, 31/10: "Conquista por curso + Selo por trilha").
 *
 * - Conquista: cada curso concluído ("Curso concluído · <título>"), só dentro da plataforma.
 * - Selo DNA Work · <trilha>: sai quando (1) todos os cursos da trilha estão concluídos, (2) as atividades
 *   "Na prática" desses cursos estão salvas no Meu roteiro e (3) o aluno passa na checagem final da trilha.
 *
 * A checagem é conteúdo fixo (sem IA em tempo de execução): situações NOVAS, no formato das perguntas dos
 * cursos (caso, pergunta e 3 opções com retorno). Funções puras: nota da checagem e elegibilidade do selo.
 */

/** Acerto mínimo da checagem final (fração); com 6 situações = 5 acertos. */
export const TRAIL_CHECK_PASS_RATIO = 0.8;

export interface TrailCheckOption {
  id: string;
  label: string;
  /** a resposta que demonstra o que a trilha ensina */
  correct: boolean;
  /** retorno mostrado depois de enviar (por que funciona ou o que faltou) */
  feedback: string;
}

export interface TrailCheckSituation {
  id: string;
  /** pergunta que as opções respondem */
  title: string;
  /** o caso inteiro: quem é, o que aconteceu, o que está em jogo */
  situation: string;
  options: TrailCheckOption[];
}

export interface TrailCheck {
  /** nome da trilha como em `courses.trail` */
  trail: string;
  situations: TrailCheckSituation[];
}

/** Chave estável da trilha para URLs e registros (ex.: "Rotina e combinados" → "rotina-e-combinados"). */
export function trailSlug(trail: string): string {
  return trail
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ordem de aprendizado das trilhas (vitrine do aluno e "Minhas trilhas"), a mesma de `TRAIL_CHECKS` e da tabela de
 * importação dos cursos novos (docs/novos-cursos/importacao.md): começa pelo primeiro emprego e vai da rotina ao
 * convívio, ao diálogo, à tecnologia, à autonomia e ao raciocínio. Um só lugar: troque aqui para mudar em todas as telas.
 */
export const TRAIL_ORDER: readonly string[] = [
  'Primeiro emprego',
  'Rotina e combinados',
  'Imagem e postura',
  'Convivência',
  'Respeito e diálogo',
  'Tecnologia com critério',
  'Autonomia no trabalho',
  'Pensar e resolver',
];

/** Ordena nomes de trilha pela `TRAIL_ORDER`; as que não estão nela vêm depois, em ordem alfabética. Não altera a entrada. */
export function sortTrails(trails: readonly string[]): string[] {
  const rank = new Map(TRAIL_ORDER.map((t, i) => [trailSlug(t), i] as const));
  const at = (t: string) => rank.get(trailSlug(t)) ?? Number.POSITIVE_INFINITY;
  return [...trails].sort((a, b) => at(a) - at(b) || a.localeCompare(b, 'pt-BR'));
}

/**
 * Trilhas que a vitrine do aluno mostra como UM curso em partes ("série"): um só cartão que abre as partes, em vez de
 * um cartão por curso. É só apresentação: os cursos, as matrículas, as conquistas e o selo continuam como estão no banco.
 * `courses` são os `slug`s (estáveis entre ambientes; o id muda) na ordem das partes, a mesma de docs/novos-cursos/expansao/indice.md
 * (C15–C26). Para incluir outra trilha, acrescente aqui; nada mais no código cita um curso.
 */
export interface TrailSeries {
  /** nome da trilha como em `courses.trail` */
  trail: string;
  /** slugs dos cursos, da Parte 1 em diante */
  courses: readonly string[];
}

export const TRAIL_SERIES: readonly TrailSeries[] = [
  { trail: 'Respeito e diálogo', courses: ['o-outro-so-e-diferente', 'discordar-sem-brigar', 'minha-ideia-tambem-conta'] },
  { trail: 'Tecnologia com critério', courses: ['seus-dados-tambem-trabalham', 'parece-verdade-sera', 'ia-como-aliada'] },
  { trail: 'Autonomia no trabalho', courses: ['tudo-e-urgente', 'errei-e-agora', 'aprender-faz-parte'] },
  { trail: 'Pensar e resolver', courses: ['por-onde-eu-comeco', 'faz-sentido', 'onde-esta-o-problema'] },
];

/** A série da trilha (pelo nome ou pela chave de URL), ou null se a trilha mostra um cartão por curso. */
export function seriesForTrail(trail: string | null | undefined): TrailSeries | null {
  if (!trail) return null;
  const key = trailSlug(trail);
  return TRAIL_SERIES.find((s) => trailSlug(s.trail) === key) ?? null;
}

/** Em qual série e parte está o curso (Parte 1 = 1), ou null se não faz parte de nenhuma. Confere a trilha quando informada. */
export function seriesPartOf(courseSlug: string | null | undefined, trail?: string | null): { series: TrailSeries; part: number; total: number } | null {
  if (!courseSlug) return null;
  const series = trail ? seriesForTrail(trail) : TRAIL_SERIES.find((s) => s.courses.includes(courseSlug));
  const i = series ? series.courses.indexOf(courseSlug) : -1;
  return series && i >= 0 ? { series, part: i + 1, total: series.courses.length } : null;
}

/** Ordena itens de uma série pela ordem das partes (quem não está na lista vai ao fim, na ordem de entrada). Não altera a entrada. */
export function sortBySeriesOrder<T>(series: TrailSeries, items: readonly T[], slugOf: (item: T) => string | null | undefined): T[] {
  const at = (t: T) => {
    const i = series.courses.indexOf(slugOf(t) ?? '');
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return items.map((t, k) => ({ t, k })).sort((a, b) => at(a.t) - at(b.t) || a.k - b.k).map((x) => x.t);
}

/** "Você pede um exemplo…" → "Pede um exemplo…" (competência na 3ª pessoa, para o selo e a verificação pública). */
export function competencyFromObjective(title: string): string {
  const t = title.trim().replace(/^você\s+/i, '');
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

const opt = (id: string, label: string, correct: boolean, feedback: string): TrailCheckOption => ({ id, label, correct, feedback });

/** Checagens finais das trilhas atuais. Trilha sem checagem aqui = selo indisponível (a página explica). */
export const TRAIL_CHECKS: Record<string, TrailCheck> = {
  'primeiro-emprego': {
    trail: 'Primeiro emprego',
    situations: [
      {
        id: 'pe1',
        title: 'O que o Kaio faz antes de sair para o primeiro dia?',
        situation: 'O Kaio começa amanhã como aprendiz numa loja. O e-mail de boas-vindas traz o endereço, mas não diz a que horas chegar nem por qual entrada.',
        options: [
          opt('a', '“Chego cedo e pergunto na porta a alguém que estiver passando.”', false, 'Chegar cedo ajuda, mas ele pode esperar na entrada errada. Faça assim: confirme antes o horário, a entrada e quem procurar.'),
          opt('b', '“Confirmo por e-mail horário, entrada e quem procurar.”', true, 'Isso: você resolve a dúvida antes e chega sabendo para onde ir.'),
          opt('c', '“Vou no horário comercial, que deve ser o normal.”', false, 'Supor o horário é arriscado no primeiro dia. Confirme o combinado por escrito.'),
        ],
      },
      {
        id: 'pe2',
        title: 'Como a Lívia avisa que pode atrasar?',
        situation: 'No primeiro dia, o metrô da Lívia parou entre duas estações e ainda não há previsão. Ela tem o contato da pessoa que vai recebê-la.',
        options: [
          opt('a', '“Aviso agora o que aconteceu e mando outra mensagem quando tiver previsão.”', true, 'Isso: o aviso cedo dá tempo para a equipe se organizar.'),
          opt('b', '“Espero chegar para explicar pessoalmente.”', false, 'Sem aviso, a equipe fica sem saber de você. Avise assim que perceber o atraso.'),
          opt('c', '“Mando só ‘vou atrasar’ e desligo o celular para economizar bateria.”', false, 'Um aviso sem contexto e sem retorno deixa dúvidas. Diga o que houve e atualize quando souber mais.'),
        ],
      },
      {
        id: 'pe3',
        title: 'O que o Gabriel confirma ao receber a tarefa?',
        situation: 'O Gabriel ouviu “organiza essas fichas pra mim” no meio de uma conversa corrida. Ele não sabe em que ordem organizar nem para quando é.',
        options: [
          opt('a', '“Faço em ordem alfabética, que é o mais comum.”', false, 'Pode não ser o que precisavam. Antes de começar, confirme o critério e o prazo.'),
          opt('b', '“Pergunto o critério, o prazo e a quem levo dúvidas.”', true, 'Isso: com entrega, prazo e referência claros, você começa sem adivinhar.'),
          opt('c', '“Espero alguém me explicar melhor depois.”', false, 'Esperar pode atrasar a tarefa. Pergunte na hora, de forma curta.'),
        ],
      },
      {
        id: 'pe4',
        title: 'Como a Bianca pede ajuda?',
        situation: 'A Bianca está há vinte minutos tentando cadastrar um cliente e o sistema recusa o CPF. Ela já conferiu os números e consultou o guia da equipe.',
        options: [
          opt('a', '“Digo que o sistema não funciona e espero alguém consertar.”', false, 'Sem contexto, quem ajuda precisa começar do zero. Conte o que fez e onde travou.'),
          opt('b', '“Continuo tentando até dar certo, sem incomodar ninguém.”', false, 'Insistir sozinha atrasa o atendimento. Pedir ajuda com contexto é parte do trabalho.'),
          opt('c', '“Conto o que fiz, o que já tentei e o erro que aparece.”', true, 'Isso: contexto, tentativa e dúvida deixam a ajuda rápida.'),
        ],
      },
      {
        id: 'pe5',
        title: 'O que o João faz ao perceber o erro?',
        situation: 'O João enviou uma lista para outra equipe e depois viu que duas datas estavam erradas. Ninguém percebeu ainda.',
        options: [
          opt('a', '“Aviso quem recebeu o que está errado e mando a versão corrigida.”', true, 'Isso: fatos e um próximo passo seguro evitam que o erro se espalhe.'),
          opt('b', '“Corrijo só no meu arquivo e espero alguém perguntar pela lista.”', false, 'A outra equipe continua com a versão errada. Avise e combine a correção.'),
          opt('c', '“Peço desculpas várias vezes e espero alguém resolver.”', false, 'Desculpa sem proposta não resolve. Diga o erro e o que você pode fazer.'),
        ],
      },
      {
        id: 'pe6',
        title: 'A Tainá deve se candidatar?',
        situation: 'A Tainá encontrou uma vaga de estágio em administração. A vaga pede ensino médio em curso e coloca “Excel avançado” como desejável. Ela sabe o básico de planilhas.',
        options: [
          opt('a', '“Não, porque não sei Excel avançado.”', false, 'Desejável não é exigência. Ela cumpre o que a vaga exige.'),
          opt('b', '“Sim, e conto no currículo o que já sei fazer em planilhas.”', true, 'Isso: separar exigido de desejável abre portas sem exagerar no que você sabe.'),
          opt('c', '“Sim, e coloco ‘Excel avançado’ para garantir.”', false, 'Afirmar o que não sabe pode te colocar em situação difícil. Descreva o que você realmente faz.'),
        ],
      },
    ],
  },
  'rotina-e-combinados': {
    trail: 'Rotina e combinados',
    situations: [
      {
        id: 'rc1',
        title: 'Como o Mateus avisa que terminou?',
        situation: 'O Mateus terminou de conferir os cadastros que pediram para ele e salvou o arquivo na pasta da equipe.',
        options: [
          opt('a', '“Aviso que terminei, onde está e o que ficou pendente.”', true, 'Isso: quem pediu encontra a entrega e sabe o que falta.'),
          opt('b', '“Não aviso: quem precisar vai achar o arquivo na pasta.”', false, 'A entrega pode passar despercebida. Avise onde está.'),
          opt('c', '“Mando só ‘feito!’ no grupo e volto para outra tarefa.”', false, 'Falta dizer onde está e se há pendência. Seja específico.'),
        ],
      },
      {
        id: 'rc2',
        title: 'O que a Larissa faz para entender a regra?',
        situation: 'Disseram para a Larissa “usar o celular com bom senso”. Ela trabalha no balcão e não sabe se pode consultar mensagens entre um atendimento e outro.',
        options: [
          opt('a', '“Faço como os colegas fazem, porque eles já conhecem a regra.”', false, 'Cada função pode ter uma regra diferente. Pergunte o que vale para você.'),
          opt('b', '“Peço um exemplo do que pode e do que não pode no balcão.”', true, 'Isso: um exemplo concreto transforma uma regra vaga em algo que você consegue seguir.'),
          opt('c', '“Não uso o celular nunca no trabalho, para não errar.”', false, 'Pode atrapalhar se o celular for parte do trabalho. Esclareça a regra.'),
        ],
      },
      {
        id: 'rc3',
        title: 'Como o Heitor resolve as orientações diferentes?',
        situation: 'Uma colega disse ao Heitor que o relatório vai por e-mail. Outra disse que vai pelo sistema. O prazo é hoje.',
        options: [
          opt('a', '“Envio pelos dois caminhos, por garantia, e não pergunto nada.”', false, 'Duplicar pode gerar confusão. Confirme qual vale.'),
          opt('b', '“Escolho o caminho que achar mais fácil e envio logo.”', false, 'Sem confirmação, você pode usar o canal errado.'),
          opt('c', '“Mostro as duas orientações a quem me orienta e pergunto qual vale.”', true, 'Isso: você apresenta os fatos e confirma com quem pode definir.'),
        ],
      },
      {
        id: 'rc4',
        title: 'O que a Sofia faz com o recado da família?',
        situation: 'A Sofia espera uma ligação importante da família durante o expediente e trabalha numa área onde o celular fica guardado.',
        options: [
          opt('a', '“Combino antes com quem me orienta como posso receber esse recado.”', true, 'Isso: combinar antes evita interrupções e mostra cuidado com o trabalho.'),
          opt('b', '“Deixo o celular no bolso, no silencioso, e atendo se tocar.”', false, 'Atender sem combinar pode quebrar a regra da área. Combine antes.'),
          opt('c', '“Não espero nenhum recado: a família espera até o fim do dia.”', false, 'Se é importante, há um jeito de combinar. Pergunte qual é.'),
        ],
      },
      {
        id: 'rc5',
        title: 'Como o Davi avisa a mudança de horário?',
        situation: 'O Davi tem consulta médica na quinta de manhã e vai precisar chegar mais tarde.',
        options: [
          opt('a', '“Aviso na quinta, quando chegar.”', false, 'Avisar em cima da hora dificulta a organização. Avise antes.'),
          opt('b', '“Aviso com antecedência e pergunto como devo registrar a ausência.”', true, 'Isso: você comunica cedo e confirma o procedimento, sem supor que está autorizado.'),
          opt('c', '“Chego mais tarde e compenso ficando depois, sem falar nada.”', false, 'Mudar o horário por conta própria não é combinado. Converse antes.'),
        ],
      },
      {
        id: 'rc6',
        title: 'Qual mensagem a Ana envia?',
        situation: 'A Ana precisa pedir ao setor de compras o acesso a uma planilha. Ela nunca falou com a pessoa que cuida disso.',
        options: [
          opt('a', '“Oi! Me libera a planilha?”', false, 'Sem identificação e contexto, a pessoa não sabe quem você é nem qual planilha.'),
          opt('b', '“Oi, sou a Ana, aprendiz do atendimento. Preciso acessar a planilha de pedidos para conferir as entregas de hoje. Você pode me liberar?”', true, 'Isso: identificação, contexto e pedido claro facilitam a resposta.'),
          opt('c', 'Um áudio de dois minutos explicando tudo.', false, 'Um texto curto e organizado é mais fácil de ler e responder.'),
        ],
      },
    ],
  },
  'imagem-e-postura': {
    trail: 'Imagem e postura',
    situations: [
      {
        id: 'ip1',
        title: 'O que o Pedro faz sobre a roupa?',
        situation: 'O Pedro vai começar no estoque de uma empresa. Ninguém falou sobre roupa, e ele não sabe se pode usar tênis.',
        options: [
          opt('a', '“Vou com a roupa que uso no dia a dia, que deve servir.”', false, 'Algumas áreas têm regras de segurança. Pergunte antes.'),
          opt('b', '“Compro roupa social para garantir.”', false, 'Pode não ser o adequado para o estoque e gera gasto sem necessidade. Confirme.'),
          opt('c', '“Pergunto se há orientação de roupa e calçado.”', true, 'Isso: você descobre o combinado antes e chega adequado.'),
        ],
      },
      {
        id: 'ip2',
        title: 'Como a Júlia resolve a falta da peça?',
        situation: 'Pediram camiseta preta para o evento de sábado. A Júlia só tem uma camiseta cinza-escura.',
        options: [
          opt('a', '“Aviso que só tenho a cinza-escura e pergunto se serve.”', true, 'Isso: você comunica a dificuldade e combina uma solução.'),
          opt('b', '“Vou com a cinza-escura e não comento nada com ninguém.”', false, 'Pode haver uma razão para o preto. Pergunte antes.'),
          opt('c', '“Falto no sábado para não aparecer com a roupa errada.”', false, 'Faltar não resolve. Converse e busque uma alternativa.'),
        ],
      },
      {
        id: 'ip3',
        title: 'Como o Lucas responde à correção?',
        situation: 'Disseram ao Lucas que ele precisa “melhorar a postura no atendimento”. Ele não entendeu o que fazer diferente.',
        options: [
          opt('a', '“Digo que vou melhorar e tento mudar um pouco de tudo.”', false, 'Sem saber o ponto, a mudança fica no chute. Peça um exemplo.'),
          opt('b', '“Pergunto em qual situação foi e o que esperam que eu faça.”', true, 'Isso: um exemplo concreto mostra o que mudar.'),
          opt('c', '“Digo que sempre fui assim e que isso não vai mudar.”', false, 'Encerrar a conversa impede entender a orientação. Pergunte antes.'),
        ],
      },
      {
        id: 'ip4',
        title: 'O que a Carol faz diante do comentário?',
        situation: 'Durante uma correção, uma pessoa fez um comentário ofensivo sobre o jeito de falar da Carol, na frente de outros colegas.',
        options: [
          opt('a', '“Respondo no mesmo tom, na frente de todo mundo.”', false, 'Revidar pode piorar a situação. Proteja-se e busque apoio.'),
          opt('b', '“Finjo que não ouvi e deixo pra lá, para não criar clima.”', false, 'Correção não precisa vir com desrespeito. Você pode buscar apoio.'),
          opt('c', '“Digo que falo sobre a tarefa, não sobre esse comentário, e procuro apoio.”', true, 'Isso: você coloca um limite e procura apoio pelo caminho certo.'),
        ],
      },
      {
        id: 'ip5',
        title: 'A Bia pode postar a foto?',
        situation: 'A Bia tirou uma foto da equipe no primeiro dia para postar. No fundo aparece uma tela com dados de clientes.',
        options: [
          opt('a', '“Posto, porque a foto ficou boa e é só um registro.”', false, 'A tela expõe dados de clientes. Confira o que aparece antes.'),
          opt('b', '“Não posto essa e tiro outra, com autorização de quem aparece.”', true, 'Isso: você confere o que aparece e consulta antes de publicar.'),
          opt('c', '“Posto só para os amigos próximos, que não vão espalhar.”', false, 'Mesmo um público pequeno pode compartilhar. O dado continua exposto.'),
        ],
      },
      {
        id: 'ip6',
        title: 'O que o Rafael faz depois de perceber?',
        situation: 'O Rafael postou um vídeo da festa da empresa e depois percebeu que um colega aparece e não queria ser filmado.',
        options: [
          opt('a', '“Apago o vídeo, aviso o colega e sigo a orientação da empresa.”', true, 'Isso: você age rápido e trata a exposição com cuidado.'),
          opt('b', '“Deixo no ar, porque já tem muitas visualizações e ficou bom.”', false, 'A exposição continua. Retire e avise.'),
          opt('c', '“Corto o colega e posto de novo sem falar com ele.”', false, 'Ele precisa saber e concordar. Converse antes de publicar de novo.'),
        ],
      },
    ],
  },
  convivencia: {
    trail: 'Convivência',
    situations: [
      {
        id: 'cv1',
        title: 'Como o Ícaro pede atenção?',
        situation: 'O Ícaro precisa de uma resposta sobre um pedido que vence hoje. A pessoa que pode ajudar está concentrada num relatório.',
        options: [
          opt('a', '“Interrompo na hora e falo tudo de uma vez, sem avisar.”', false, 'Interromper sem aviso atrapalha. Peça um momento e diga a urgência.'),
          opt('b', '“Peço um minuto, digo o assunto e que o prazo é hoje.”', true, 'Isso: assunto e urgência real ajudam a pessoa a decidir quando te atender.'),
          opt('c', '“Espero ela terminar, mesmo que o prazo passe.”', false, 'Esperar demais pode estourar o prazo. Peça atenção de forma respeitosa.'),
        ],
      },
      {
        id: 'cv2',
        title: 'Como a Elisa apresenta a diferença?',
        situation: 'A Elisa entendeu que a entrega era na sexta. Uma colega está cobrando para hoje.',
        options: [
          opt('a', '“Digo que ela está errada e que o prazo sempre foi sexta.”', false, 'Atacar a pessoa não resolve a diferença. Apresente o que você entendeu.'),
          opt('b', '“Faço correndo, sem comentar a diferença com ninguém.”', false, 'A diferença continua e pode se repetir. Converse.'),
          opt('c', '“Digo que entendi sexta e pergunto como alinhar o prazo.”', true, 'Isso: você mostra seu entendimento sem acusar e busca um acordo.'),
        ],
      },
      {
        id: 'cv3',
        title: 'O que o Luan faz depois de usar a copa?',
        situation: 'O Luan esquentou o almoço no micro-ondas da copa e respingou molho dentro.',
        options: [
          opt('a', '“Limpo o que sujei e deixo a copa como encontrei.”', true, 'Isso: cuidar do espaço coletivo é parte da convivência.'),
          opt('b', '“Deixo: a limpeza passa depois.”', false, 'O próximo a usar encontra sujeira. Cuide do que você usou.'),
          opt('c', '“Aviso no grupo que alguém sujou o micro-ondas.”', false, 'Foi você quem sujou: limpe e siga em frente, sem precisar levar isso ao grupo.'),
        ],
      },
      {
        id: 'cv4',
        title: 'O que a Malu faz com o problema?',
        situation: 'A Malu percebeu que a tomada da sala de reunião está soltando faíscas.',
        options: [
          opt('a', '“Tento consertar com fita isolante.”', false, 'Improvisar com eletricidade é perigoso. Não mexa e avise.'),
          opt('b', '“Não uso a tomada e aviso quem cuida da manutenção.”', true, 'Isso: você sinaliza o problema sem improvisar uma solução arriscada.'),
          opt('c', '“Não falo nada: alguém já deve ter visto.”', false, 'Pode ser que ninguém tenha visto. Avise.'),
        ],
      },
      {
        id: 'cv5',
        title: 'Como a Nina chama o colega?',
        situation: 'A Nina ouviu alguns colegas chamando o Roberto por um apelido sobre a altura dele. Ela acabou de conhecê-lo.',
        options: [
          opt('a', '“Uso o apelido, porque todo mundo usa.”', false, 'Você ainda não sabe se ele gosta. Use o nome.'),
          opt('b', '“Chamo pelo nome que ele usou para se apresentar.”', true, 'Isso: intimidade se constrói; o nome é o caminho seguro.'),
          opt('c', '“Pergunto aos colegas se ele se importa.”', false, 'Quem sabe é ele. Use o nome ou pergunte a ele, se fizer sentido.'),
        ],
      },
      {
        id: 'cv6',
        title: 'Como o Bruno coloca o limite?',
        situation: 'Um colega insiste em comentar a roupa do Bruno de um jeito que o incomoda, mesmo depois de uma primeira cara feia.',
        options: [
          opt('a', '“Peço com calma que ele pare e, se continuar, procuro a pessoa de referência.”', true, 'Isso: um limite claro e o apoio certo, se precisar.'),
          opt('b', '“Rio junto para não criar clima e deixo passar mais uma vez.”', false, 'Rir pode passar a ideia de que está tudo bem. Diga o seu limite.'),
          opt('c', '“Faço um comentário sobre a roupa dele também, para ele sentir.”', false, 'Devolver aumenta o problema. Diga o limite com calma.'),
        ],
      },
    ],
  },
  'respeito-e-dialogo': {
    trail: 'Respeito e diálogo',
    situations: [
      {
        id: 'rd1',
        title: 'O que a Heloísa faz?',
        situation: 'A Heloísa percebeu que o colega Moacir quase não fala nas reuniões, mas manda ótimas ideias por escrito no dia seguinte. Hoje, outro colega comentou que o Moacir “não participa”.',
        options: [
          opt('a', '“Concordo com ele, porque participar é falar na hora.”', false, 'Falar pouco não prova desinteresse. Olhe o que ele entrega e pergunte como prefere participar.'),
          opt('b', '“Digo que ele contribui por escrito e pergunto como prefere participar.”', true, 'Isso: você corrige a impressão com um fato e deixa a escolha com ele.'),
          opt('c', '“Peço que o Moacir explique por que não fala nas reuniões.”', false, 'A cobrança pede uma explicação pessoal que ele pode não querer dar. Pergunte como prefere contribuir.'),
        ],
      },
      {
        id: 'rd2',
        title: 'O que o Evandro faz?',
        situation: 'Uma colega do Evandro não come carne e não vai ao churrasco da equipe. Um colega começa a insistir e a fazer piada, dizendo que ela está fazendo drama.',
        options: [
          opt('a', '“Rio junto com o colega, para não criar clima.”', false, 'O riso reforça a piada. Respeitar uma diferença não pede concordar, só não pressionar.'),
          opt('b', '“Digo a ela que deveria ir ao churrasco, para a equipe ficar unida.”', false, 'A pressão trata uma escolha pessoal como falta. Convide sem cobrar e aceite o não.'),
          opt('c', '“Peço que ele pare e convido a colega para outro momento, sem cobrar.”', true, 'Isso: você corta a pressão e mantém o convite aberto, sem exigir explicação.'),
        ],
      },
      {
        id: 'rd3',
        title: 'Como a Noemi discorda?',
        situation: 'A Noemi acha que o prazo combinado com um colega não é suficiente para a última etapa, mas ele está animado para entregar na sexta.',
        options: [
          opt('a', '“Também quero entregar na sexta. Me preocupa a última etapa; podemos conferir juntos?”', true, 'Isso: você liga a preocupação ao objetivo comum e propõe uma ação.'),
          opt('b', '“Você sempre subestima o tempo das coisas, e isso atrasa a equipe toda.”', false, 'A generalização aumenta a tensão. Fale do prazo e da etapa, não da pessoa.'),
          opt('c', '“Fico quieta e deixo o prazo como está, para não criar clima.”', false, 'O risco continua sem que ele possa avaliar. Diga a preocupação de forma concreta.'),
        ],
      },
      {
        id: 'rd4',
        title: 'O que a Tamires responde?',
        situation: 'A Tamires ouviu de um colega que o jeito como ela escreve as mensagens deixa o grupo confuso. Ele falou num tom mais seco do que ela gostaria.',
        options: [
          opt('a', '“Respondo no mesmo tom, dizendo que ele também escreve mal.”', false, 'O tom sobe e a conversa vira disputa. Peça um exemplo e foque na mensagem.'),
          opt('b', '“Agradeço, peço um exemplo de mensagem confusa e combino ajustes.”', true, 'Isso: você ouve sem revidar e transforma a crítica em fato.'),
          opt('c', '“Passo a mandar menos mensagens, sem falar nada.”', false, 'Você muda sem entender o que atrapalha. Pergunte antes de mudar.'),
        ],
      },
      {
        id: 'rd5',
        title: 'O que o Ulisses propõe?',
        situation: 'O Ulisses e uma colega querem organizar a fila de atendimento de formas diferentes. Os dois têm bons argumentos, e a discussão já passou de dez minutos.',
        options: [
          opt('a', '“Insisto na minha ordem e repito os argumentos até ela finalmente aceitar.”', false, 'Repetir o argumento mais alto não cria critério. Compare o que cada ordem pede.'),
          opt('b', '“Aceito a ordem dela sem discutir, só para encerrar logo a conversa.”', false, 'Ceder sem critério deixa a dúvida aberta. Proponha comparar e confirmar com quem decide.'),
          opt('c', '“Proponho compararmos o que cada ordem exige e perguntarmos a quem decide.”', true, 'Isso: um critério e uma pergunta a quem decide destravam o impasse.'),
        ],
      },
      {
        id: 'rd6',
        title: 'Como o Gael apresenta a ideia?',
        situation: 'O Gael percebeu que os pedidos de material chegam sem data e vários atrasam. Ele quer propor uma melhoria, mas ainda é novo na equipe.',
        options: [
          opt('a', '“Mostro exemplos e proponho testar um modelo de pedido por duas semanas.”', true, 'Isso: fato, efeito e um teste pequeno com sinal de resultado.'),
          opt('b', '“Mudo o formulário por conta própria, para resolver logo o problema da equipe.”', false, 'A mudança sem combinar pode quebrar acordos que você ainda não conhece.'),
          opt('c', '“Guardo a ideia para mim, porque ainda sou novo na equipe.”', false, 'Quem está começando também percebe coisas úteis. Apresente a observação e pergunte como funciona hoje.'),
        ],
      },
    ],
  },
  'tecnologia-com-criterio': {
    trail: 'Tecnologia com critério',
    situations: [
      {
        id: 'tc1',
        title: 'O que a Cecília faz com o print?',
        situation: 'A Cecília precisa pedir ajuda com um erro. No print, aparecem o nome e o telefone de uma cliente, além de uma conversa de outra pessoa.',
        options: [
          opt('a', '“Envio o print inteiro, porque o contexto ajuda quem vai me responder.”', false, 'O contexto extra expõe dados que não ajudam. Recorte a imagem.'),
          opt('b', '“Envio o print como está e peço que apaguem depois da resposta.”', false, 'Depois do envio você não controla as cópias. Prepare antes de enviar.'),
          opt('c', '“Cubro nome, telefone e conversa, confiro a imagem e envio só o erro.”', true, 'Isso: você mostra só o necessário e confere a imagem final.'),
        ],
      },
      {
        id: 'tc2',
        title: 'O que o Ismael faz com o link?',
        situation: 'O Ismael vai compartilhar uma planilha de horários com a equipe. O link está configurado para qualquer pessoa que o tenha.',
        options: [
          opt('a', '“Mudo o acesso para quem precisa e envio só à equipe.”', true, 'Isso: você confere permissão e destinatários antes de enviar.'),
          opt('b', '“Envio assim mesmo, porque o nome do arquivo está certo.”', false, 'O nome não controla quem consegue abrir. Ajuste o acesso.'),
          opt('c', '“Posto o link num grupo grande da empresa, para alguém repassar.”', false, 'Quanto mais gente, mais circulação sem controle. Envie só a quem precisa.'),
        ],
      },
      {
        id: 'tc3',
        title: 'O que a Abigail faz com o aviso?',
        situation: 'A Abigail recebeu num grupo a mensagem: “a entrada de amanhã mudou para as 7h”. Não há data nem quem avisou.',
        options: [
          opt('a', '“Passo adiante, porque pode ser importante.”', false, 'Você amplia algo não confirmado. Verifique antes.'),
          opt('b', '“Pergunto à pessoa responsável se o aviso vale para nós.”', true, 'Isso: você trata o aviso como algo a verificar.'),
          opt('c', '“Pergunto no próprio grupo quem mandou e espero alguém responder.”', false, 'Perguntar no grupo é um começo, mas quem confirma é a pessoa responsável. Verifique com ela antes de mudar seus planos.'),
        ],
      },
      {
        id: 'tc4',
        title: 'O que o Tales faz com a vaga?',
        situation: 'O Tales recebeu por mensagem uma vaga de estágio com um link de “cadastro rápido”, que pede CPF e foto do documento antes de qualquer entrevista.',
        options: [
          opt('a', '“Envio, porque toda empresa pede documento em algum momento.”', false, 'Documento se entrega a quem você confirmou que é a empresa, e no momento certo. Verifique na página oficial.'),
          opt('b', '“Pergunto no grupo se alguém já se cadastrou e, se sim, envio.”', false, 'Outra pessoa ter enviado não confirma a vaga. Vá à fonte antes de entregar dados.'),
          opt('c', '“Não envio nada e procuro a vaga na página oficial da empresa.”', true, 'Isso: você vai à fonte e evita entregar dados a quem não confirmou.'),
        ],
      },
      {
        id: 'tc5',
        title: 'O que a Marisa faz com o texto da IA?',
        situation: 'A Marisa pediu à IA um texto de boas-vindas para novos colegas. A IA incluiu que “todos recebem um kit de brinde”, mas ela não sabe se isso é verdade.',
        options: [
          opt('a', '“Envio, porque o texto ficou ótimo.”', false, 'O texto pode criar uma expectativa que a equipe não cumpre. Confira os fatos.'),
          opt('b', '“Retiro a frase e confiro o resto com a equipe.”', true, 'Isso: você corrige o que ninguém confirmou e revisa o restante.'),
          opt('c', '“Pergunto à IA se ela tem certeza e envio se ela disser que sim.”', false, 'Outra resposta da mesma ferramenta não é uma fonte. Confirme com a equipe.'),
        ],
      },
      {
        id: 'tc6',
        title: 'O que o Benício faz antes de pedir?',
        situation: 'O Benício quer pedir à IA um resumo de uma lista de clientes da empresa, com nomes e telefones.',
        options: [
          opt('a', '“Troco os dados por exemplos fictícios antes de pedir o resumo.”', true, 'Isso: a IA não precisa de dados reais para resumir.'),
          opt('b', '“Colo a lista inteira, porque a IA precisa ver tudo para resumir.”', false, 'Você expõe clientes sem necessidade. Use dados fictícios.'),
          opt('c', '“Colo a lista e depois apago a conversa.”', false, 'Apagar depois não desfaz o envio. Proteja antes.'),
        ],
      },
    ],
  },
  'autonomia-no-trabalho': {
    trail: 'Autonomia no trabalho',
    situations: [
      {
        id: 'au1',
        title: 'O que o Odilon faz primeiro?',
        situation: 'O Odilon tem um relatório combinado para as 14h. Às 13h, a coordenadora pede uma lista “urgente” e não diz até quando precisa dela.',
        options: [
          opt('a', '“Faço a lista e deixo o relatório atrasar sem avisar.”', false, 'O relatório pode atrasar sem que ninguém se organize. Avise do compromisso.'),
          opt('b', '“Pergunto até quando ela precisa e aviso do relatório das 14h.”', true, 'Isso: o conflito fica visível e ela decide com informação.'),
          opt('c', '“Entrego o relatório às 14h e só depois pergunto da lista.”', false, 'Você protege o relatório, mas a lista pode ser mais urgente, e ela não sabe do conflito. Pergunte o prazo antes de decidir.'),
        ],
      },
      {
        id: 'au2',
        title: 'O que a Raíssa faz?',
        situation: 'A Raíssa percebeu que, de manhã, enviou a um cliente o preço de ontem. O cliente já respondeu aceitando.',
        options: [
          opt('a', '“Aviso o gestor, digo o preço correto e pergunto como falar com o cliente.”', true, 'Isso: você assume o fato e leva o problema a quem decide.'),
          opt('b', '“Espero o cliente reclamar antes de contar ao gestor.”', false, 'O erro cresce enquanto ninguém sabe. Avise logo.'),
          opt('c', '“Mando outra mensagem ao cliente, sem explicar nada, só com o preço novo de hoje.”', false, 'Sem explicação e sem avisar o gestor, a confusão aumenta. Combine antes.'),
        ],
      },
      {
        id: 'au3',
        title: 'Qual mudança o Moisés escolhe?',
        situation: 'Depois de enviar um preço errado, o Moisés quer mudar algo no jeito de trabalhar para o erro não se repetir.',
        options: [
          opt('a', '“Prometo a todos que nunca mais vou errar em nenhum envio.”', false, 'A promessa não muda a condição que favoreceu o erro.'),
          opt('b', '“Crio uma lista de vinte conferências para fazer em todo envio de preço.”', false, 'Uma lista longa demais pesa e acaba sendo ignorada. Escolha uma verificação que ajude.'),
          opt('c', '“Passo a conferir o preço na tabela do dia antes de enviar.”', true, 'Isso: uma verificação concreta e proporcional ao erro.'),
        ],
      },
      {
        id: 'au4',
        title: 'O que a Iolanda diz ao gestor?',
        situation: 'A Iolanda está há dois meses na equipe. Já faz sozinha o atendimento do balcão, mas ainda pede ajuda no fechamento do caixa. O gestor pergunta o que ela quer aprender agora.',
        options: [
          opt('a', '“Digo que ainda preciso de ajuda em tudo, para não parecer convencida.”', false, 'Você apaga o que já faz sozinha. Diga o que já domina e o que vem a seguir.'),
          opt('b', '“Digo o que faço sozinha e peço apoio para aprender o caixa.”', true, 'Isso: avanço com fatos e um próximo passo com apoio.'),
          opt('c', '“Peço para aprender várias coisas de uma vez: caixa, estoque e pedidos.”', false, 'Muitos focos ao mesmo tempo dificultam aprender. Escolha um e peça apoio.'),
        ],
      },
      {
        id: 'au5',
        title: 'O que o Ronaldo faz?',
        situation: 'O Ronaldo tem três entregas para hoje e percebe que só consegue concluir duas. O gestor está em reunião.',
        options: [
          opt('a', '“Faço as três pela metade, para entregar algo de cada uma.”', false, 'Nenhuma fica pronta, e ninguém sabe. Mostre o que cabe.'),
          opt('b', '“Entrego só as duas mais fáceis e não aviso o gestor sobre a terceira entrega.”', false, 'A terceira atrasa sem aviso. Diga o que não cabe.'),
          opt('c', '“Listo o que falta nas três e peço ao gestor que escolha a ordem.”', true, 'Isso: você mostra a limitação e pede uma decisão.'),
        ],
      },
      {
        id: 'au6',
        title: 'O que a Lia faz?',
        situation: 'A Lia vai assumir uma tarefa que um colega faz todo dia. Ele diz: “É fácil, você vai pegando”.',
        options: [
          opt('a', '“Peço para acompanhar uma vez, anoto os passos e tiro as dúvidas.”', true, 'Isso: você transforma observar em aprender.'),
          opt('b', '“Espero ele ter tempo para me explicar tudo com calma, antes de começar.”', false, 'Você deixa o aprendizado na mão do outro. Faça a sua parte.'),
          opt('c', '“Tento sozinha e peço desculpas se errar.”', false, 'Sem ver como se faz, o erro é provável. Acompanhe antes.'),
        ],
      },
    ],
  },
  'pensar-e-resolver': {
    trail: 'Pensar e resolver',
    situations: [
      {
        id: 'pr1',
        title: 'O que o Sidnei faz primeiro?',
        situation: 'O Sidnei recebeu o pedido: “prepara a sala para o treinamento”. Ele não sabe quantas pessoas virão nem o horário.',
        options: [
          opt('a', '“Preparo uma sala para dez pessoas e ajusto depois.”', false, 'Pode ser retrabalho. Confirme o que falta.'),
          opt('b', '“Preparo a sala do jeito do último treinamento.”', false, 'O último treinamento pode não ter o mesmo tamanho nem horário. Confirme o que falta.'),
          opt('c', '“Pergunto quantas pessoas e o horário antes de preparar.”', true, 'Isso: você busca o que falta antes de agir.'),
        ],
      },
      {
        id: 'pr2',
        title: 'Qual sequência a Clarice segue?',
        situation: 'A Clarice vai organizar a entrega de uniformes. Ela já tem a lista de nomes, mas ainda não sabe os tamanhos.',
        options: [
          opt('a', '“Separo peças de tamanho médio e depois pergunto.”', false, 'Os kits podem precisar de troca. Confirme antes.'),
          opt('b', '“Confirmo os tamanhos, separo as peças e confiro a entrega.”', true, 'Isso: cada etapa usa a anterior e termina com uma conferência.'),
          opt('c', '“Pergunto o tamanho a cada pessoa na hora da entrega.”', false, 'Funciona para poucas pessoas, mas sem separar antes a entrega trava e pode faltar tamanho. Confirme antes.'),
        ],
      },
      {
        id: 'pr3',
        title: 'O que o Hugo tem de confirmado?',
        situation: 'O Hugo mandou uma pergunta ao gestor às 9h. São 11h, o gestor passou duas vezes pela sala e não respondeu. Ele pensa: “Está com raiva de mim”.',
        options: [
          opt('a', '“Que ainda não houve resposta; o resto é suposição.”', true, 'Isso: você separa o fato da interpretação.'),
          opt('b', '“Que ele está com raiva de mim.”', false, 'É uma interpretação, não um fato.'),
          opt('c', '“Que ele viu a pergunta e preferiu não responder.”', false, '“Viu” e “preferiu” não foram confirmados. Guarde só o que foi observado.'),
        ],
      },
      {
        id: 'pr4',
        title: 'O que a Mirela faz?',
        situation: 'Na semana em que a loja trocou de balança, as filas ficaram maiores. Um colega diz que a balança nova é a culpada.',
        options: [
          opt('a', '“Concordo, porque aconteceu junto.”', false, 'Dois fatos juntos não provam causa e efeito.'),
          opt('b', '“Peço para voltar à balança antiga até ter certeza.”', false, 'É prudente, mas decide sem investigar. Compare os dias antes de trocar de novo.'),
          opt('c', '“Comparo com outros dias antes de culpar a balança.”', true, 'Isso: você testa a explicação em vez de aceitá-la.'),
        ],
      },
      {
        id: 'pr5',
        title: 'O que o Ezequiel faz?',
        situation: 'O Ezequiel quer testar uma mudança no cadastro dos clientes. Ele não sabe se dá para desfazer.',
        options: [
          opt('a', '“Mudo um cadastro para ver o que acontece no sistema e depois avalio.”', false, 'Pode ser irreversível. Confirme antes.'),
          opt('b', '“Confirmo com o responsável se existe modo de teste antes de mudar.”', true, 'Isso: você garante que o teste é reversível e autorizado.'),
          opt('c', '“Mudo só um cadastro antigo, que ninguém usa mais.”', false, 'Cadastro antigo também é dado real, e o sistema pode não deixar desfazer. Confirme se existe modo de teste.'),
        ],
      },
      {
        id: 'pr6',
        title: 'Como a Selma confirma a solução?',
        situation: 'A Selma corrigiu o endereço para onde os pedidos da loja são enviados e a tela mostrou “enviado”. O gerente pergunta se já pode avisar a equipe que está resolvido.',
        options: [
          opt('a', '“Faço um pedido de teste autorizado e confirmo que chegou ao setor.”', true, 'Isso: você verifica o resultado final.'),
          opt('b', '“Digo que sim, porque apareceu ‘enviado’.”', false, 'A mensagem confirma uma etapa, não o recebimento.'),
          opt('c', '“Peço a um colega que também faça um pedido de teste.”', false, 'Mais um teste ajuda, mas sem conferir se chegou ao setor nada está provado.'),
        ],
      },
    ],
  },
};

export function trailCheckFor(trail: string): TrailCheck | null {
  return TRAIL_CHECKS[trailSlug(trail)] ?? null;
}

/** O que o navegador recebe de uma checagem: sem a marca de correta e sem retorno. */
export interface PublicTrailCheck {
  trail: string;
  situations: Array<{ id: string; title: string; situation: string; options: Array<{ id: string; label: string }> }>;
}

/**
 * Semente da ordem das opções: por pessoa, trilha e tentativa. `attempt` = quantas tentativas a pessoa já enviou (a 1ª
 * checagem é a 0). A mesma pessoa vê a mesma ordem ao recarregar a página e outra ordem depois de cada envio.
 */
export function trailCheckSeed(input: { userId: string; trailKey: string; attempt: number }): string {
  return `${input.userId}|${input.trailKey}|${Math.max(0, Math.floor(input.attempt))}`;
}

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32) a partir de um texto (xmur3). Não é criptografia: só ordem de exibição. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (() => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  })();
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralhamento de Fisher-Yates com semente: mesma semente, mesma ordem; não altera a lista de entrada. */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Situações sem a marca de correta (o que vai para o navegador antes do envio). Com `seed`, as opções de cada situação saem em
 * ordem embaralhada (a ordem do arquivo não diz qual é a correta); a nota continua pelo id da opção, então a ordem não a afeta.
 */
export function publicTrailCheck(check: TrailCheck, seed?: string): PublicTrailCheck {
  return {
    trail: check.trail,
    situations: check.situations.map((s) => {
      const options = s.options.map((o) => ({ id: o.id, label: o.label }));
      return { id: s.id, title: s.title, situation: s.situation, options: seed === undefined ? options : shuffleWithSeed(options, `${seed}|${s.id}`) };
    }),
  };
}

export interface TrailCheckResult {
  total: number;
  correct: number;
  /** acertos mínimos para passar */
  needed: number;
  passed: boolean;
  /** retorno de cada situação respondida (para rever antes de refazer) */
  results: Array<{ id: string; chosen: string | null; correct: boolean; feedback: string }>;
}

/** Nota da checagem: situação sem resposta ou com opção inexistente conta como erro. */
export function gradeTrailCheck(check: TrailCheck, answers: Record<string, string | undefined>): TrailCheckResult {
  const results = check.situations.map((s) => {
    const chosen = answers[s.id] ?? null;
    const o = chosen ? s.options.find((x) => x.id === chosen) : undefined;
    return { id: s.id, chosen: o ? o.id : null, correct: !!o?.correct, feedback: o ? o.feedback : 'Você não respondeu esta situação.' };
  });
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const needed = Math.ceil(total * TRAIL_CHECK_PASS_RATIO);
  return { total, correct, needed, passed: total > 0 && correct >= needed, results };
}

export interface TrailCourseState {
  courseId: string;
  title: string;
  /** matriculado e com o curso concluído */
  done: boolean;
  /** matriculado no curso */
  enrolled: boolean;
  /** títulos das atividades "Na prática" sem resposta salva */
  missingActivities: string[];
}

export interface BadgeEligibility {
  eligible: boolean;
  /** cursos que faltam concluir */
  coursesMissing: Array<{ courseId: string; title: string }>;
  /** atividades a salvar, por curso */
  activitiesMissing: Array<{ courseId: string; title: string; activities: string[] }>;
  /** checagem final ainda não aprovada */
  checkMissing: boolean;
  /** a trilha tem checagem definida */
  hasCheck: boolean;
}

/** O selo sai só com tudo: cursos concluídos, atividades salvas e checagem aprovada. */
export function badgeEligibility(input: { courses: TrailCourseState[]; checkPassed: boolean; hasCheck: boolean }): BadgeEligibility {
  const coursesMissing = input.courses.filter((c) => !c.done).map((c) => ({ courseId: c.courseId, title: c.title }));
  const activitiesMissing = input.courses.filter((c) => c.missingActivities.length > 0).map((c) => ({ courseId: c.courseId, title: c.title, activities: c.missingActivities }));
  const checkMissing = !input.checkPassed;
  return {
    eligible: input.hasCheck && input.courses.length > 0 && coursesMissing.length === 0 && activitiesMissing.length === 0 && !checkMissing,
    coursesMissing,
    activitiesMissing,
    checkMissing,
    hasCheck: input.hasCheck,
  };
}

/** Código do selo legível e sem caracteres ambíguos (DNA-XXXX-XXXX). */
export const BADGE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function isBadgeCode(code: string): boolean {
  return /^DNA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code);
}
