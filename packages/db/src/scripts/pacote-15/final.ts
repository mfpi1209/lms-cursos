/**
 * Estrutura FINAL dos cursos do pacote-15, depois da decisão do dono (docs/novos-cursos/analise-fable.md, itens 2 a 4,
 * "aprovo"): cada aula tem DUAS decisões (abertura → pergunta 1 → explicação → pergunta 2 → Na prática → fim), as fusões
 * e as reorientações do item 3 estão aplicadas e os casos novos estão escritos aqui. O texto do pacote entra palavra por
 * palavra onde o caso é o do pacote; o resto é texto novo, marcado como tal no relatório (docs/novos-cursos/importacao.md).
 *
 * Cursos finais (12): o-outro-so-e-diferente, ia-como-aliada, parece-verdade-sera, seus-dados-tambem-trabalham,
 * tudo-e-urgente (+ Seu ritmo), errei-e-agora, minha-ideia-tambem-conta, discordar-sem-brigar, aprender-faz-parte
 * (reorientado), por-onde-eu-comeco, faz-sentido, onde-esta-o-problema (+ aula inicial de Travei).
 * Fundidos e arquivados: nem-toda-brincadeira (vira a aula 3 de "Liberdade e intimidade…"), seu-ritmo-tambem-importa e
 * travei-como-peco-ajuda.
 */
import { missaoFalada, nosDaAula, objetivoVoce, perguntaDe, type CursoPacote } from './construir';
import { ABERTURA_AULA_2, ATIVIDADES, FECHAMENTOS, opcoesEmOrdem, type AtividadeEditorial } from './editorial';
import { APOIO_VISUAL } from './dados';

export type Qualidade = 'strong' | 'ok' | 'weak';
/** `r` = reação falada (opcional): quando existe, vale no lugar da abertura + 1ª parte do retorno que o importador monta. */
export interface OpDec { t: string; q: Qualidade; f: string; r?: string }
export interface DecSpec {
  /** o caso inteiro, como aparece em "A situação"; a última frase é dita na chamada, as outras antes dela */
  ctx: string;
  /** título do painel e fim da chamada */
  perg: string;
  /** alternativas já na ordem de exibição */
  ops: OpDec[];
  /**
   * o que a apresentadora diz no lugar das frases do caso que antecedem a última (quando a fala e o painel diferem: uma ponte
   * como "Veja o caso do Yuri:", números por extenso). A última frase do caso é sempre a chamada.
   */
  falaAntes?: string;
}
export interface VidSpec { titulo: string; fala: string; tela: string; apoio?: { titulo: string; topicos: string[] } }
export interface PraticaSpec { enunciado: string; instrucoes: string; atividade: AtividadeEditorial }
export interface AulaSpec {
  id: string;
  titulo: string;
  /** "Você …" */
  objetivo: string;
  /** a missão como a instrutora a diz ("escreva …") */
  missao: string;
  abertura: VidSpec;
  d1: DecSpec;
  explic1: VidSpec;
  d2: DecSpec;
  /** vídeo depois da 2ª decisão e antes da atividade (só aulas de fusão) */
  explic2?: VidSpec;
  pratica: PraticaSpec;
  fechamento: string;
  /** o curso do pacote de onde a aula veio, só para o relatório */
  origem: string;
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
const baixa1 = (s: string) => s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1);
const semPonto = (s: string) => norm(s).replace(/[.\s]+$/u, '');

/** Posição estável (0 a 2) da recomendada de uma decisão nova, a partir da chave: não depende da ordem de execução. */
const POS_NOVAS: Record<string, number> = Object.fromEntries(
  ['oo1', 'oo2a', 'oo2b', 'ia1', 'ia2', 'pv1', 'pv2', 'sd1', 'sd2', 'tu1', 'er1a', 'er1b', 'er2a', 'er2b', 'mi1', 'mi2a', 'mi2', 'ds1', 'ds2', 'af1a', 'af1b', 'af2a', 'af2b', 'po1', 'po2', 'fs1', 'fs2', 'on1', 'on2', 'on3', 'np3'].map((k, i) => [k, [2, 0, 1][i % 3]!]),
);
export function posicaoEstavel(chave: string): number {
  if (chave in POS_NOVAS) return POS_NOVAS[chave]!;
  let h = 7;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h % 3;
}

const comR = (r?: string) => (r ? { r } : {});
const ok = (t: string, f: string, r?: string): OpDec => ({ t, q: 'ok', f, ...comR(r) });
const fraca = (t: string, f: string, r?: string): OpDec => ({ t, q: 'weak', f, ...comR(r) });
const forte = (t: string, f: string, r?: string): OpDec => ({ t, q: 'strong', f, ...comR(r) });

/** Decisão nova: a recomendada, e as outras duas em volta dela, na posição estável da chave. */
function dec(chave: string, ctx: string, perg: string, ...resto: [OpDec, OpDec, OpDec] | [string, OpDec, OpDec, OpDec]): DecSpec {
  const falaAntes = typeof resto[0] === 'string' ? resto[0] : undefined;
  const [s, a, b] = (typeof resto[0] === 'string' ? resto.slice(1) : resto) as [OpDec, OpDec, OpDec];
  const ops = [a, b];
  ops.splice(posicaoEstavel(chave), 0, s);
  return { ctx: norm(ctx), perg, ops, ...(falaAntes ? { falaAntes } : {}) };
}
/** "No lugar da Fernanda, o que você faz?" */
const lugar = (art: 'a' | 'o', nome: string, verbo: string) => `No lugar d${art} ${nome}, o que você ${verbo}?`;

/** Decisão do pacote (alternativas dos ajustes editoriais) */
function decPacote(curso: CursoPacote, aula: 'a01' | 'a02'): DecSpec {
  const n = nosDaAula(curso.lessons[aula === 'a01' ? 0 : 1]!);
  const chave = `${curso.slug_proposto}/${aula}`;
  return { ctx: norm(n.decisao.context), perg: perguntaDe(curso.slug_proposto, aula, n.decisao.question), ops: opcoesEmOrdem(chave).map((o) => ({ t: o.t, q: o.q, f: o.f, ...comR(o.r) })) };
}

/** Aula do pacote (vídeos, atividade e fechamento do pacote + ajustes editoriais); a 2ª decisão e os cortes vêm de `extra`. */
function aulaPacote(curso: CursoPacote, aula: 'a01' | 'a02', extra: { id: string; d2: DecSpec; abertura?: string; d1?: DecSpec; explicApoio?: { titulo: string; topicos: string[] } }): AulaSpec {
  const i = aula === 'a01' ? 0 : 1;
  const pkg = curso.lessons[i]!;
  const n = nosDaAula(pkg);
  const chave = `${curso.slug_proposto}/${aula}`;
  return {
    id: extra.id,
    titulo: pkg.title,
    objetivo: objetivoVoce(curso, pkg),
    missao: missaoFalada(curso.slug_proposto, aula, n.pratica),
    abertura: { titulo: pkg.title, fala: extra.abertura ?? (aula === 'a02' ? ABERTURA_AULA_2[chave]! : norm(n.abertura.speech)), tela: norm(n.abertura.onscreen_text) },
    d1: extra.d1 ?? decPacote(curso, aula),
    explic1: { titulo: norm(n.explicacao.title), fala: norm(n.explicacao.speech), tela: norm(n.explicacao.onscreen_text), apoio: extra.explicApoio ?? APOIO_VISUAL[chave]! },
    d2: extra.d2,
    pratica: { enunciado: norm(n.pratica.prompt), instrucoes: norm(n.pratica.instructions), atividade: ATIVIDADES[chave]! },
    fechamento: FECHAMENTOS[chave]!,
    origem: `${curso.slug_proposto}/${aula}`,
  };
}

const INSTR_PRATICA = 'Escreva uma resposta curta. Pode usar uma situação fictícia. Não inclua nomes, contatos ou informações internas.';

/** Aula 1 e aula 2 de um curso do pacote com a 2ª decisão nova. */
function duasAulas(curso: CursoPacote, d2a: DecSpec, d2b: DecSpec): AulaSpec[] {
  return [aulaPacote(curso, 'a01', { id: 'aula_01', d2: d2a }), aulaPacote(curso, 'a02', { id: 'aula_02', d2: d2b })];
}

type Fabrica = (c: (slug: string) => CursoPacote) => AulaSpec[];

/* ------------------------------------------------------------------ */
/* Os 12 cursos                                                          */
/* ------------------------------------------------------------------ */

export const FABRICAS: Record<string, Fabrica> = {
  /* ---- O outro só é diferente: aula 2 com caso novo (diferença que não é erro), aula 2 inteira nova ---- */
  'o-outro-so-e-diferente': (c) => {
    const cur = c('o-outro-so-e-diferente');
    const a1 = aulaPacote(cur, 'a01', {
      id: 'aula_01',
      d2: dec('oo1', 'A Fernanda combinou com a equipe responder as mensagens no fim da manhã e no fim da tarde. Hoje o Otávio precisou de uma resposta urgente dela e achou que ela estava ignorando o pedido.', lugar('o', 'Otávio', 'faz'),
        forte('Pergunto à Fernanda como ela prefere ser chamada quando for urgente.', 'Você respeita o jeito dela de trabalhar e combina uma saída para o que é urgente. Falta alinhar com o resto da equipe. Faça assim: combine um canal para urgências e confirme com todos.'),
        ok('Espero até o fim da manhã e só então volto a falar com ela.', 'Você respeita o horário combinado, mas uma urgência pode ficar sem resposta. Falta combinar um canal. Faça assim: pergunte a ela como chamá-la quando for urgente.'),
        fraca('Aviso a equipe de que a Fernanda ignora os pedidos.', 'Você atribui uma intenção e expõe a colega sem ter conversado com ela. Falta ouvi-la. Faça assim: pergunte como ela prefere ser acionada.')),
    });
    const a2: AulaSpec = {
      id: 'aula_02',
      titulo: 'Respeitar diferenças também exige limites',
      objetivo: 'Você escreve um convite que a pessoa possa recusar sem se explicar.',
      missao: 'escreva um convite que a pessoa possa recusar sem se explicar',
      abertura: { titulo: 'Respeitar diferenças também exige limites', fala: ABERTURA_AULA_2['o-outro-so-e-diferente/a02']!, tela: 'Respeitar diferenças também exige limites' },
      d1: dec('oo2a', 'A equipe almoça junta toda sexta. O Murilo nunca vai e come em outro lugar. Um colega começa a brincar que ele se acha melhor que todo mundo.', 'O que você faz?',
        forte('Convido o Murilo para outro momento e deixo a escolha com ele.', 'Você mantém a porta aberta sem pressionar nem supor o motivo. Falta cortar o comentário sobre ele. Faça assim: peça ao colega que não faça piada e convide o Murilo sem cobrar presença.'),
        forte('Peço ao colega que pare com a brincadeira, sem falar com o Murilo.', 'Você interrompe o comentário na hora, e isso protege o Murilo. Falta mostrar a ele que é bem-vindo. Faça assim: depois, convide-o para um momento que funcione para ele, sem cobrar presença.', 'Isso protege o Murilo. Você interrompe o comentário na hora, sem expor ninguém.'),
        fraca('Insisto para o Murilo ir, porque almoço junto faz parte da equipe.', 'A pressão trata uma escolha pessoal como falta de interesse. Falta respeitar o motivo, que pode ser religião, saúde ou dinheiro. Faça assim: convide sem cobrar e aceite o não.')),
      explic1: {
        titulo: 'Entenda o raciocínio',
        fala: 'Você não precisa saber por que o Murilo não vai. O motivo pode ser religião, alimentação, saúde, dinheiro ou só preferência, e é dele. Convide sem cobrar, aceite o não e não faça dele assunto. Respeitar não é concordar com tudo, mas também não é pressionar.',
        tela: 'Convide sem cobrar',
        apoio: { titulo: 'Convidar sem pressionar', topicos: ['Convide **sem cobrar**', '**Aceite o não**', 'Não faça **dele assunto**'] },
      },
      d2: dec('oo2b', 'O Rodrigo trabalha com a Isadora, que é nova na equipe e tem um sotaque de outra região. Um colega imita o jeito dela todo dia, e ela só sorri sem graça.', lugar('o', 'Rodrigo', 'faz'),
        forte('Pergunto à Isadora, em particular, se isso a incomoda.', 'Você não presume nem expõe: ouve quem foi alvo e deixa a decisão com ela. Falta agir se ela se incomodar. Faça assim: apoie o que ela decidir, em particular ou com alguém de confiança.'),
        ok('Digo ao colega, na hora, que isso não tem graça.', 'Você corta a imitação, mas sem saber o que a Isadora quer, pode expô-la. Falta ouvi-la. Faça assim: depois, pergunte a ela como quer ser apoiada.'),
        fraca('Rio junto, porque ela também sorri.', 'O sorriso sem graça não prova que ela gosta. Falta ler o limite. Faça assim: observe o impacto e pergunte a ela, em particular.')),
      pratica: {
        enunciado: 'Escreva um convite que a pessoa possa recusar sem se explicar.',
        instrucoes: INSTR_PRATICA,
        atividade: {
          intro: 'Você viu que convidar não é cobrar. Agora monte um convite que a pessoa possa recusar sem se explicar.',
          molde: '{convite}? {saida}.',
          grupos: [
            { id: 'convite', q: 'Como você convida?', opcoes: ['Estamos indo almoçar. Quer vir', 'Vamos tomar um café depois do expediente. Pode ser', 'Sexta tem almoço da equipe. Quer ir com a gente'] },
            { id: 'saida', q: 'Como você deixa a escolha com a pessoa?', opcoes: ['Sem problema se não puder', 'Pode dizer não, sem explicação', 'Se preferir outro momento, a gente combina'] },
          ],
        },
      },
      fechamento: 'Respeitar diferenças é convidar sem cobrar e ouvir quando alguém diz que algo incomoda. Se você salvou, seu convite fica no Meu roteiro para adaptar quando precisar.',
      origem: 'novo (caso de diferença que não é erro, análise Fable 2.1)',
    };
    return [a1, a2];
  },

  /* ---- IA como aliada ---- */
  'ia-como-aliada': (c) =>
    duasAulas(c('ia-como-aliada'),
      dec('ia1', 'A Lorena pediu à IA um aviso curto sobre a oficina, com horário, local e público. O texto veio bom, mas longo demais para o mural da equipe.', lugar('a', 'Lorena', 'faz'),
        forte('Peço de novo e digo o formato: três linhas.', 'Você ajusta o pedido sem mudar os dados e deixa o formato claro. Falta revisar o resultado. Faça assim: confira se o texto ficou só com os dados confirmados.'),
        ok('Corto sozinha o texto até caber, sem pedir de novo.', 'Resolve o tamanho, mas você pode cortar uma informação importante. Falta orientar a ferramenta. Faça assim: diga o formato e confira o que sobrou.'),
        fraca('Peço que a IA escreva melhor, sem dizer mais nada.', 'O pedido continua sem direção e a resposta pode não mudar. Falta dizer o que está errado. Faça assim: diga o formato e o limite de tamanho.')),
      dec('ia2', 'O Samuel vai pedir à IA um resumo de uma planilha da equipe. Ela tem nomes e telefones de clientes.', lugar('o', 'Samuel', 'faz'),
        forte('Troco os nomes e telefones por dados fictícios antes de pedir.', 'Você protege as pessoas e ainda recebe o tipo de resumo que precisa. Falta saber a regra do seu trabalho. Faça assim: use dados fictícios e pergunte qual é a regra para uso de IA no seu trabalho.'),
        ok('Peço o resumo e apago a conversa logo depois, por segurança.', 'Você pensa em limpar, mas os dados já foram enviados. Falta proteger antes. Faça assim: troque os dados por exemplos antes de colar.'),
        fraca('Colo a planilha inteira, porque a IA precisa ver tudo.', 'A ferramenta não precisa de nomes e telefones para resumir, e você expõe clientes. Falta tirar o que não pode sair. Faça assim: use só dados fictícios.'))),

  /* ---- Parece verdade. Será? ---- */
  'parece-verdade-sera': (c) =>
    duasAulas(c('parece-verdade-sera'),
      dec('pv1', 'A Camille recebeu no grupo da turma um print dizendo que uma empresa tem vagas de estágio abertas até amanhã. O print não mostra link nem data.', lugar('a', 'Camille', 'faz'),
        forte('Procuro o anúncio no site da empresa antes de passar adiante.', 'Você vai à fonte e só então decide o que fazer. Falta avisar o grupo do que achou. Faça assim: conte o que encontrou e diga se ainda não conseguiu confirmar.'),
        ok('Pergunto no grupo quem publicou e espero alguém responder.', 'Você busca a origem, mas depende de quem respondeu e não olha o canal oficial. Falta ir à fonte. Faça assim: procure a vaga no site da empresa.'),
        fraca('Mando o print para as amigas, para ninguém perder a chance.', 'Você amplia um aviso sem origem nem data. Falta verificar. Faça assim: procure o anúncio oficial antes de repassar.', 'Veja o que essa escolha muda. Você amplia um aviso sem origem nem data.')),
      dec('pv2', 'O Kelvin viu em vários perfis uma vaga de jovem aprendiz. O site indicado pede um pagamento pequeno para liberar a vaga.', lugar('o', 'Kelvin', 'faz'),
        forte('Não pago e procuro a vaga na página oficial da organização.', 'Você evita entregar dinheiro a quem não confirmou e vai à fonte. Falta avisar quem compartilhou. Faça assim: conte aos colegas que a cobrança é um sinal de alerta.'),
        ok('Pergunto aos perfis se alguém já conseguiu a vaga.', 'Você busca uma prova, mas a resposta vem dos mesmos perfis que divulgaram. Falta uma fonte oficial. Faça assim: procure a organização por um caminho que você já conhece.'),
        fraca('Pago, porque o valor é baixo e a vaga parece boa.', 'Valor baixo não confirma a vaga, e você entrega dinheiro e dados. Falta verificar. Faça assim: não pague e confirme na página oficial.'))),

  /* ---- Seus dados também trabalham ---- */
  'seus-dados-tambem-trabalham': (c) =>
    duasAulas(c('seus-dados-tambem-trabalham'),
      dec('sd1', 'A Bruna precisa mandar um print do erro. O erro só aparece na tela que mostra o nome e o CPF de um cliente.', lugar('a', 'Bruna', 'faz'),
        forte('Reproduzo o erro com dados fictícios ou cubro nome e CPF.', 'Você tira o que não ajuda e confere se nada continua legível. Falta usar o canal certo. Faça assim: envie só a parte necessária pelo canal autorizado.'),
        ok('Cubro só o CPF e envio a imagem, porque o erro continua visível.', 'Você protege uma parte, mas o nome continua à mostra. Falta cobrir tudo o que identifica. Faça assim: cubra também o nome e confira a imagem exportada.'),
        fraca('Envio a imagem inteira e peço sigilo a quem receber.', 'Pedir sigilo depois não desfaz a exposição, e você não controla as cópias. Falta preparar antes. Faça assim: reproduza o erro com dados fictícios.')),
      dec('sd2', 'O Wesley enviou uma planilha interna para o grupo errado e percebeu logo depois.', lugar('o', 'Wesley', 'faz'),
        forte('Aviso a pessoa responsável e peço ajuda para conter o acesso.', 'Você comunica cedo e deixa quem sabe agir. Falta dizer o que foi enviado e para quem. Faça assim: descreva o arquivo, o grupo e a hora do envio.'),
        ok('Peço ao grupo que não abra o arquivo e aviso o responsável depois.', 'Você tenta conter, mas atrasa o aviso a quem pode agir. Falta avisar primeiro quem é responsável. Faça assim: avise a pessoa responsável e peça ajuda para conter o acesso.'),
        fraca('Apago a mensagem e não conto para ninguém.', 'Apagar sua mensagem não resolve o que já foi visto, e esconder atrasa a solução. Falta avisar. Faça assim: conte o que houve à pessoa responsável e peça ajuda para conter o acesso.'))),

  /* ---- Tudo é urgente? (+ Seu ritmo) ---- */
  'tudo-e-urgente': (c) => {
    const urg = c('tudo-e-urgente');
    const ritmo = c('seu-ritmo-tambem-importa');
    const a1 = aulaPacote(urg, 'a01', {
      id: 'aula_01',
      d2: dec('tu1', 'A Rebeca tem um relatório combinado para as 16h. Às 15h, o gestor pede uma lista "urgente" para a reunião. Ele não diz até quando ela é necessária.', lugar('a', 'Rebeca', 'faz'),
        forte('Pergunto até quando ele precisa da lista e aviso do relatório.', 'Você torna o conflito visível e deixa o gestor decidir com informação. Falta confirmar a ordem. Faça assim: registre o que ele decidir e avise o prazo novo, se mudar.'),
        ok('Começo pela lista e aviso do relatório depois, se der tempo.', 'Você atende o pedido do gestor, mas o relatório pode atrasar sem ele saber. Falta avisar do compromisso. Faça assim: diga logo que o relatório vence às 16h.'),
        fraca('Faço as duas coisas ao mesmo tempo, sem avisar ninguém.', 'Dividir a atenção sem avisar pode atrasar as duas, e ninguém sabe disso. Falta mostrar o conflito. Faça assim: pergunte o prazo e a prioridade.')),
    });
    const n = nosDaAula(ritmo.lessons[0]!);
    const n2 = nosDaAula(ritmo.lessons[1]!);
    const a2: AulaSpec = {
      id: 'aula_02',
      titulo: ritmo.lessons[0]!.title,
      objetivo: 'Você prepara um pedido de ajuste com situação, impacto e alternativa.',
      missao: missaoDe(n2.pratica.prompt),
      abertura: { titulo: ritmo.lessons[0]!.title, fala: 'Agora, vamos olhar para quando as tarefas não cabem. Ter dificuldade para dar conta de tudo não prova falta de esforço. Às vezes as demandas ultrapassam o tempo ou os recursos disponíveis.', tela: norm(n.abertura.onscreen_text) },
      d1: decPacote(ritmo, 'a01'),
      explic1: { titulo: norm(n.explicacao.title), fala: norm(n.explicacao.speech), tela: norm(n.explicacao.onscreen_text), apoio: APOIO_VISUAL['seu-ritmo-tambem-importa/a01']! },
      d2: decPacote(ritmo, 'a02'),
      explic2: { titulo: norm(n2.explicacao.title), fala: norm(n2.explicacao.speech), tela: norm(n2.explicacao.onscreen_text), apoio: APOIO_VISUAL['seu-ritmo-tambem-importa/a02']! },
      pratica: { enunciado: norm(n2.pratica.prompt), instrucoes: norm(n2.pratica.instructions), atividade: ATIVIDADES['seu-ritmo-tambem-importa/a02']! },
      fechamento: FECHAMENTOS['seu-ritmo-tambem-importa/a02']!,
      origem: 'seu-ritmo-tambem-importa/a01 + a02 (fundido; a cena de 40/50 minutos de tudo-e-urgente/a02 foi cortada)',
    };
    return [a1, a2];
  },

  /* ---- Errei. E agora? (casos novos: erro que já produziu efeito; prevenção proporcional) ---- */
  'errei-e-agora': (c) => {
    const cur = c('errei-e-agora');
    const a1 = aulaPacote(cur, 'a01', {
      id: 'aula_01',
      d1: dec('er1a', 'Você montou o orçamento de um cliente e digitou R$ 480 em vez de R$ 840. O cliente já aceitou, e uma colega do financeiro acabou de perceber a diferença.', 'O que você faz?', 'Você montou o orçamento de um cliente e digitou quatrocentos e oitenta reais em vez de oitocentos e quarenta.',
        forte('Assumo o erro, digo o valor correto e pergunto ao gestor o que fazer.', 'Você assume o fato e leva o problema a quem decide como falar com o cliente. Falta saber o impacto. Faça assim: diga o valor certo, o que o cliente já recebeu e que vai verificar o resto.'),
        ok('Peço à colega que resolva com o cliente, porque ela já percebeu o erro.', 'Ela pode ajudar, mas você fica de fora de algo que foi seu. Falta assumir. Faça assim: conte o que aconteceu ao gestor e proponha o próximo passo.'),
        fraca('Digo que deve ter sido falha do sistema.', 'Culpar o sistema não é verdade e atrasa a solução. Falta contar o que houve. Faça assim: descreva o fato e o que já foi feito.')),
      explicApoio: { titulo: 'Avisar com fatos', topicos: ['Descreva os **fatos**', 'Diga **quem recebeu**', 'Diga o **impacto**'] },
      d2: dec('er1b', 'O gestor da Gisele ficou irritado ao saber do erro no orçamento e disse que ela deveria ter conferido. A Gisele sabe que não conferiu.', lugar('a', 'Gisele', 'responde'),
        forte('Reconheço que não conferi e digo como vou corrigir com o cliente.', 'Você assume sem se defender e volta ao que será feito. Falta combinar o prazo. Faça assim: diga quando o cliente terá o valor certo e avise quando resolver.'),
        ok('Explico que estava com muito trabalho e por isso errei.', 'Você é sincera, mas a explicação vira justificativa e não resolve o cliente. Falta o próximo passo. Faça assim: reconheça o erro e diga como vai corrigir.'),
        fraca('Digo que ninguém me ensinou a conferir e que a culpa é da equipe.', 'Culpar os outros desvia da solução e piora a conversa. Falta assumir a sua parte. Faça assim: reconheça o que faltou e proponha a correção.')),
    });
    // a explicação do pacote cita "o arquivo enviado": no caso novo, o que foi enviado é um orçamento
    a1.explic1.fala = 'Descreva fatos: o que foi enviado, quem recebeu e o que pode estar incorreto. Se não souber o impacto, diga que ainda precisa verificar. Evite prometer que está tudo resolvido antes de confirmar. E se alguém reagir com irritação?';
    const a2 = aulaPacote(cur, 'a02', {
      id: 'aula_02',
      d1: dec('er2a', 'O valor errado veio de um número digitado à mão, copiado de outra planilha. Isso já aconteceu duas vezes neste mês.', 'Qual ajuste é mais útil?',
        forte('Combino conferir na planilha de origem antes de enviar.', 'Você atua sobre uma causa concreta e cria uma verificação. Falta ver se funcionou. Faça assim: confira nos próximos envios e avise a equipe do combinado.'),
        ok('Passo a digitar mais devagar e com muito mais atenção.', 'A atenção ajuda, mas sozinha não cria uma verificação. Falta uma mudança que dê para observar. Faça assim: escolha uma conferência simples antes do envio.'),
        fraca('Crio uma lista de dez conferências para todo orçamento feito.', 'Uma lista longa demais pesa e acaba não sendo usada. Falta proporção. Faça assim: escolha uma verificação que realmente ajude.', 'Olhe isso com calma. Uma lista longa demais pesa e acaba não sendo usada.')),
      d2: dec('er2b', 'A Elaine passou a conferir o valor antes de enviar. Duas semanas depois, o erro de valor não voltou, mas os envios estão demorando mais.', lugar('a', 'Elaine', 'faz'),
        forte('Mantenho a conferência só nos orçamentos de valor alto.', 'Você ajusta a verificação ao risco e mantém o que funciona. Falta combinar com a equipe. Faça assim: registre o valor combinado e reveja daqui a algumas semanas.'),
        ok('Mantenho a conferência em tudo, porque o erro não voltou.', 'O erro não voltou, mas a conferência pesa em casos de pouco risco. Falta proporção. Faça assim: veja onde a conferência é mesmo necessária.'),
        fraca('Paro de conferir, porque já estou bem mais atenta agora.', 'A atenção não substitui a verificação que estava funcionando. Falta manter o que ajudou. Faça assim: reduza só onde o risco é pequeno.')),
    });
    return [a1, a2];
  },

  /* ---- Minha ideia também conta (2ª decisão da aula 2: alternativas razoáveis no lugar das caricatas) ---- */
  'minha-ideia-tambem-conta': (c) => {
    const cur = c('minha-ideia-tambem-conta');
    return [
      aulaPacote(cur, 'a01', {
        id: 'aula_01',
        d2: dec('mi1', 'A Amanda contou ao gestor que o formulário é difícil de achar. Ele perguntou como ela sabe disso.', lugar('a', 'Amanda', 'responde'),
          forte('Conto o que vi: quantas pessoas perguntaram, sem apontar ninguém.', 'Você apoia a observação em fatos e não culpa ninguém. Falta dizer o efeito. Faça assim: conte o que isso atrasou e pergunte como a equipe quer tratar.'),
          ok('Digo que é uma impressão minha, de quem usa o formulário todo dia.', 'Você traz a observação, mas sem exemplo o gestor não consegue avaliar. Falta o fato. Faça assim: conte quantas pessoas perguntaram.', 'Pense no que acontece depois. Você traz a observação, mas sem exemplo o gestor não consegue avaliar.'),
          fraca('Digo que o processo foi mal pensado por quem fez.', 'Você troca o fato por um julgamento sobre pessoas. Falta descrever o problema. Faça assim: diga o que acontece e qual é o efeito.')),
      }),
      aulaPacote(cur, 'a02', {
        id: 'aula_02',
        d1: {
          ctx: norm(nosDaAula(cur.lessons[1]!).decisao.context),
          perg: nosDaAula(cur.lessons[1]!).decisao.question,
          ops: (() => {
            const base = opcoesEmOrdem('minha-ideia-tambem-conta/a02');
            const s = base.find((o) => o.q === 'strong')!;
            const outras: OpDec[] = [
              ok('Crio o atalho e aviso no grupo que já está lá.', 'Você age e avisa, mas sem autorização nem forma de avaliar se ajudou. Falta combinar o teste. Faça assim: proponha um prazo e diga o que vai observar.'),
              fraca('Levo o problema à liderança e espero que ela diga o que fazer.', 'A ideia pode morrer sem ser avaliada, e a liderança fica sem informação. Falta propor um teste pequeno. Faça assim: leve o problema e uma proposta.'),
            ];
            const pos = posicaoEstavel('mi2a');
            const ops: OpDec[] = [...outras];
            ops.splice(pos, 0, { t: s.t, q: 'strong', f: s.f, ...comR(s.r) });
            return ops;
          })(),
        },
        d2: dec('mi2', 'O Leandro testou o atalho por uma semana. As dúvidas sobre o acesso caíram, mas dois colegas disseram que preferem a pasta antiga.', lugar('o', 'Leandro', 'faz'),
          forte('Conto o resultado e proponho manter o atalho e a pasta.', 'Você apresenta o que o teste mostrou e inclui quem pensa diferente. Falta combinar o próximo teste. Faça assim: marque quando vai rever com a equipe.'),
          ok('Mantenho só o atalho, porque as dúvidas de acesso caíram bastante.', 'O resultado é bom, mas você ignora os colegas que preferem a pasta antiga. Falta ouvi-los. Faça assim: pergunte o que eles precisam.'),
          fraca('Encerro o teste agora, porque dois colegas reclamaram do atalho.', 'Dois descontentes não anulam o que o teste mostrou, e você decide sem avaliar. Falta olhar os dados. Faça assim: compare o que melhorou e o que piorou.')),
      }),
    ];
  },

  /* ---- Discordar sem brigar (aula 1: receber a discordância; o caso do pacote vira a 2ª decisão) ---- */
  'discordar-sem-brigar': (c) => {
    const cur = c('discordar-sem-brigar');
    const n1 = nosDaAula(cur.lessons[0]!);
    const pacoteD = decPacote(cur, 'a01');
    const a1 = aulaPacote(cur, 'a01', {
      id: 'aula_01',
      d1: dec('ds1', 'Um colega diz que o jeito como você organiza a planilha atrapalha o trabalho dele. Ele fala alto, na frente de outras pessoas.', 'Como você responde?',
        forte('Agradeço, peço um exemplo do que atrapalha e proponho conversarmos depois.', 'Você ouve sem revidar e transforma a crítica em fato. Falta combinar o que mudar. Faça assim: anote o exemplo e proponha um ajuste que sirva aos dois.'),
        ok('Não respondo e mudo a planilha sem perguntar nada a ele.', 'Você evita o conflito, mas muda sem saber o que realmente atrapalha. Falta entender. Faça assim: peça um exemplo antes de mudar.'),
        fraca('Respondo no mesmo tom, dizendo que ele também atrapalha todo mundo.', 'O tom sobe e a conversa vira disputa pessoal. Falta olhar o problema. Faça assim: respire, peça um exemplo e combine uma conversa em particular.')),
      d2: {
        ctx: `O Cauê quer enviar um material hoje, mas percebeu que falta confirmar uma informação importante. O colega que cuida do envio está com pressa.`,
        perg: lugar('o', 'Cauê', 'faz'),
        ops: pacoteD.ops.map((o) => ({ ...o })),
      },
    });
    void n1;
    const a2 = aulaPacote(cur, 'a02', {
      id: 'aula_02',
      d2: dec('ds2', 'A Maitê e o colega combinaram comparar clareza e prazo. O destinatário só responde na sexta, e o relatório vence na quarta.', lugar('a', 'Maitê', 'faz'),
        forte('Entrego o formato que cumpre o prazo e aviso que aceito ajustar.', 'Você cumpre o prazo, é transparente e deixa o ajuste aberto. Falta registrar o combinado com o colega. Faça assim: anote o que ficou decidido.'),
        fraca('Espero a resposta do destinatário, mesmo que o prazo passe de quarta.', 'Você evita decidir sozinha, mas o prazo estoura. Falta uma saída. Faça assim: entregue o que cumpre o prazo e avise.'),
        ok('Levo as duas opções ao gestor e peço que ele escolha.', 'Você busca uma decisão, mas o gestor pode não responder antes de quarta, e a escolha era de vocês. Falta aplicar o critério. Faça assim: usem o critério que combinaram, entreguem no prazo e avisem o que escolheram.', 'Vamos olhar o efeito disso. Você busca uma decisão, mas o gestor pode não responder antes de quarta.')),
    });
    return [a1, a2];
  },

  /* ---- Aprender faz parte do trabalho: REORIENTADO (progresso e aprender observando; análise Fable 2.12) ---- */
  'aprender-faz-parte': (c) => {
    const cur = c('aprender-faz-parte');
    const a1: AulaSpec = {
      id: 'aula_01',
      titulo: 'O que eu já faço com autonomia?',
      objetivo: 'Você registra algo que já faz com mais autonomia e o que quer aprender a seguir.',
      missao: 'registre algo que você já faz com mais autonomia e o que quer aprender a seguir',
      abertura: { titulo: 'O que eu já faço com autonomia?', fala: 'No começo, muita coisa é nova ao mesmo tempo. Depois de algumas semanas, algumas tarefas já saem com menos ajuda. Perceber esse avanço também é aprender.', tela: 'O que eu já faço com autonomia?' },
      d1: dec('af1a', 'Há um mês a Valentina começou como aprendiz. Hoje ela abre sozinha o cadastro dos clientes, mas ainda pede ajuda na conferência final. Na conversa de acompanhamento, ela precisa dizer como está indo.', lugar('a', 'Valentina', 'diz'),
        forte('Conto o que já faço sozinha e no que ainda quero apoio.', 'Você mostra o avanço com um fato e aponta o próximo passo. Falta combinar como vai ser acompanhada. Faça assim: peça uma tarefa para praticar e marque quando conversar de novo.'),
        ok('Falo só do que ainda não sei fazer e do que errei.', 'Você é honesta com o que falta, mas deixa de mostrar o que já avançou. Falta o outro lado. Faça assim: conte também o que já faz sozinha.'),
        fraca('Digo que não aprendi quase nada neste primeiro mês.', 'Você ignora um avanço real e fica sem um ponto de partida para o próximo passo. Falta olhar os fatos. Faça assim: liste o que já faz com menos ajuda.')),
      explic1: {
        titulo: 'Entenda o raciocínio',
        fala: 'Registre o que mudou desde o começo: o que você já faz sozinho e o que ainda faz com ajuda. Use fatos, como tarefas e exemplos, sem copiar informação interna. Mostrar o que você faz bem não é se gabar: ajuda a escolher o próximo passo.',
        tela: 'Registre o que mudou',
        apoio: { titulo: 'Seu avanço, com fatos', topicos: ['O que você já faz **sozinho**', 'O que ainda faz **com ajuda**', 'Escolha o **próximo passo**'] },
      },
      d2: dec('af1b', 'O Fábio percebeu que já domina o cadastro. Na semana que vem, ele pode pedir uma tarefa nova ou continuar fazendo só o que já sabe.', lugar('o', 'Fábio', 'faz'),
        forte('Peço uma tarefa nova e combino com o gestor quem me acompanha.', 'Você transforma o avanço em um próximo desafio com apoio. Falta marcar o momento de rever. Faça assim: combine quando vão conversar sobre como foi.'),
        ok('Continuo no que sei, para não errar nem atrasar a equipe.', 'Você garante a qualidade, mas deixa de crescer. Falta um próximo passo. Faça assim: escolha uma tarefa nova, com acompanhamento.', 'Pense no que acontece depois. Você garante a qualidade, mas deixa de crescer.'),
        fraca('Pego uma tarefa nova por conta própria, sem avisar ninguém.', 'Você assume um risco sem apoio nem combinado. Falta avisar. Faça assim: combine a tarefa e quem acompanha.', 'Veja o que essa escolha muda. Você assume um risco sem apoio nem combinado.')),
      pratica: {
        enunciado: 'Registre algo que você já faz com mais autonomia e o que quer aprender a seguir.',
        instrucoes: INSTR_PRATICA,
        atividade: {
          intro: 'Você viu que registrar o avanço ajuda a escolher o próximo passo. Agora monte o seu registro.',
          molde: 'Já faço {tarefa} {autonomia}. Quero aprender {proxima}.',
          grupos: [
            { id: 'tarefa', q: 'O que você já faz melhor?', opcoes: ['o cadastro de clientes', 'o atendimento no balcão', 'a organização dos arquivos'] },
            { id: 'autonomia', q: 'Como isso mudou?', opcoes: ['com pouca ajuda', 'sem precisar perguntar a cada passo', 'e já ajudo quem chegou depois'] },
            { id: 'proxima', q: 'O que você quer aprender a seguir?', opcoes: ['a conferência final', 'uma tarefa nova da equipe', 'a lidar com pedidos urgentes'] },
          ],
        },
      },
      fechamento: 'Registrar o que você já faz sozinho mostra o seu avanço e ajuda a escolher o próximo passo. Na próxima aula, vamos ver como aprender uma tarefa observando.',
      origem: 'novo (reorientação do curso, análise Fable 2.12); a abertura da aula 1 é do pacote reescrita',
    };
    const a2: AulaSpec = {
      id: 'aula_02',
      titulo: 'Como aprender uma tarefa observando',
      objetivo: 'Você monta um plano para aprender uma tarefa observando quem já faz.',
      missao: 'monte um plano para aprender uma tarefa observando quem já faz',
      abertura: { titulo: 'Como aprender uma tarefa observando', fala: 'Agora, vamos falar de aprender uma tarefa nova. Nem sempre alguém explica tudo, e observar quem já faz bem também ensina.', tela: 'Como aprender uma tarefa observando' },
      d1: dec('af2a', 'A Priscila vai assumir uma tarefa que o Sérgio faz todo dia. Ele tem pouco tempo para explicar e disse apenas: "Vai olhando".', lugar('a', 'Priscila', 'faz'),
        forte('Peço para acompanhar uma vez, anoto os passos e pergunto dúvidas.', 'Você aproveita o tempo curto e transforma observar em aprender. Falta praticar com alguém por perto. Faça assim: marque a primeira vez que vai fazer a tarefa com o Sérgio.'),
        ok('Observo de longe e tento fazer sozinha na semana que vem.', 'Você aprende vendo, mas sem anotar nem perguntar pode errar. Falta um apoio. Faça assim: peça que ele confira a sua primeira vez.'),
        fraca('Digo que só consigo aprender se alguém me explicar tudo de uma vez.', 'Você põe o aprendizado só na mão do outro, e o Sérgio tem pouco tempo. Falta fazer a sua parte. Faça assim: acompanhe, anote e pergunte.')),
      explic1: {
        titulo: 'Entenda o raciocínio',
        fala: 'Peça para acompanhar a tarefa do começo ao fim e anote os passos com suas palavras. Marque o que ficou em dúvida e pergunte no fim. Depois, faça uma vez com a pessoa por perto e peça que ela confira. Você não precisa decorar: a anotação ajuda a repetir.',
        tela: 'Aprender observando',
        apoio: { titulo: 'Aprender observando', topicos: ['Peça para **acompanhar**', '**Anote os passos**', 'Peça que **confira**'] },
      },
      d2: dec('af2b', 'Depois de acompanhar, a Priscila fez a tarefa e o Sérgio apontou dois passos que ela esqueceu.', lugar('a', 'Priscila', 'responde'),
        forte('Peço que ele mostre os passos de novo e anoto.', 'Você usa o retorno para melhorar a anotação e a próxima vez. Falta praticar de novo. Faça assim: combine de repetir a tarefa com ele por perto.'),
        ok('Digo que da próxima vez presto muito mais atenção nesse passo.', 'A intenção é boa, mas não muda a anotação nem o método. Falta uma ação. Faça assim: acrescente os passos esquecidos na sua lista.'),
        fraca('Explico que o jeito dele de mostrar a tarefa não ajuda.', 'Você coloca a causa no outro e perde a chance de melhorar. Falta usar o retorno. Faça assim: peça os passos de novo e anote.')),
      pratica: {
        enunciado: 'Monte um plano para aprender uma tarefa observando quem já faz.',
        instrucoes: INSTR_PRATICA,
        atividade: {
          intro: 'Você viu que observar, anotar e praticar com alguém por perto ensina. Agora monte o seu plano.',
          molde: 'Vou pedir para {observar}. Vou anotar {anotar}. Depois vou {praticar}.',
          grupos: [
            { id: 'observar', q: 'Como você observa?', opcoes: ['acompanhar a tarefa do começo ao fim', 'ver a tarefa duas vezes', 'ficar ao lado enquanto a pessoa faz'] },
            { id: 'anotar', q: 'O que você anota?', opcoes: ['os passos, com as minhas palavras', 'o que ficou em dúvida', 'o que costuma dar errado'] },
            { id: 'praticar', q: 'Como você pratica?', opcoes: ['fazer uma vez com a pessoa por perto', 'fazer e pedir que ela confira', 'repetir a tarefa e comparar com a minha anotação'] },
          ],
        },
      },
      fechamento: 'Aprender também é observar, anotar e praticar com alguém por perto. Se você salvou, seu plano fica no Meu roteiro para a próxima tarefa nova.',
      origem: 'novo (reorientação do curso, análise Fable 2.12)',
    };
    void cur;
    return [a1, a2];
  },

  /* ---- Por onde eu começo? ---- */
  'por-onde-eu-comeco': (c) =>
    duasAulas(c('por-onde-eu-comeco'),
      dec('po1', 'A Natália recebeu o pedido de montar uma apresentação para sexta. Ela já sabe o tema e o tempo de fala, mas não sabe quem vai assistir.', lugar('a', 'Natália', 'faz'),
        forte('Pergunto quem vai assistir e o que precisam levar, antes dos slides.', 'Você confirma o que falta antes de agir. Falta registrar o combinado. Faça assim: anote o público e o objetivo e só então comece.'),
        ok('Monto uma versão geral da apresentação e ajusto depois, se precisar.', 'Você avança, mas a versão geral pode ser refeita quando souber o público. Falta confirmar. Faça assim: pergunte o público antes de investir tempo.'),
        fraca('Começo pelos slides mais bonitos, para ganhar tempo no resto do trabalho.', 'Você investe tempo em algo que pode mudar quando souber o público. Falta o resultado esperado. Faça assim: descubra o que a apresentação precisa conseguir.')),
      dec('po2', 'O Yuri tem quatro etapas para organizar um evento. Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado.', lugar('o', 'Yuri', 'faz'), 'Veja o caso do Yuri: ele tem quatro etapas para organizar um evento.',
        forte('Adianto o que não depende do espaço; a etapa 3 espera a confirmação.', 'Você aproveita o tempo e respeita a dependência. Falta acompanhar a confirmação. Faça assim: marque quando vai cobrar a resposta sobre o espaço.', 'Isso ajuda. Você aproveita o tempo e respeita a dependência entre as etapas.'),
        ok('Espero a confirmação do espaço para começar qualquer etapa do evento.', 'É seguro, mas você perde tempo em etapas que não dependem do espaço. Falta aproveitar o paralelo. Faça assim: comece o que não depende da confirmação.'),
        fraca('Começo pela etapa 3 e ajusto tudo se o espaço mudar depois.', 'Você pode refazer o trabalho se o espaço não for confirmado. Falta respeitar a ordem. Faça assim: confirme o espaço antes da etapa 3.'))),

  /* ---- Faz sentido? ---- */
  'faz-sentido': (c) =>
    duasAulas(c('faz-sentido'),
      dec('fs1', 'A Aurora enviou um relatório e o colega respondeu apenas "ok". Ela pensa: "Ele achou ruim".', lugar('a', 'Aurora', 'considera confirmado'),
        forte('Que ele respondeu apenas ok e não disse mais nada.', 'Você separa o que foi dito do que você imaginou. Falta pensar no que pode explicar. Faça assim: liste duas explicações possíveis e, se precisar, pergunte.'),
        ok('Que ele respondeu com pressa e não deu mais explicações.', 'É uma explicação possível, mas não confirmada. Falta evidência. Faça assim: trate como hipótese e, se precisar, pergunte.', 'Pense no que acontece depois. É uma explicação possível, mas ainda não confirmada.'),
        fraca('Que ele achou o relatório ruim e não quis dizer.', 'Isso é uma interpretação sobre o motivo, não um fato. Falta separar o que se viu. Faça assim: anote só o que foi dito.')),
      dec('fs2', 'O Jonas viu que, nos dois dias de chuva da semana, a loja vendeu menos. Um colega diz que chuva sempre derruba as vendas.', lugar('o', 'Jonas', 'faz'),
        forte('Comparo com outros dias de chuva e outros fatores antes de concluir.', 'Você testa a explicação em vez de aceitá-la. Falta registrar. Faça assim: anote o que comparou e diga que a conclusão ainda é provisória.'),
        ok('Anoto como uma possibilidade e continuo observando as vendas dos próximos dias.', 'Você não conclui cedo, mas ainda não compara com nada. Falta um teste. Faça assim: procure outros dias parecidos.', 'Vale pensar no que fica de fora. Você não conclui cedo, mas ainda não compara com nada.'),
        fraca('Aceito a explicação, porque aconteceu duas vezes na mesma semana.', 'Dois casos não provam um padrão. Falta comparar. Faça assim: procure outros dias de chuva e veja se as vendas caíram também.'))),

  /* ---- Onde está o problema? (3 aulas: a aula inicial vem de "Travei") ---- */
  'onde-esta-o-problema': (c) => {
    const travei = c('travei-como-peco-ajuda');
    const onde = c('onde-esta-o-problema');
    const tn = nosDaAula(travei.lessons[0]!);
    const a1: AulaSpec = {
      id: 'aula_01',
      titulo: 'Antes de mexer: dá para desfazer?',
      objetivo: 'Você registra um sinal que indica quando deve parar e pedir apoio.',
      missao: missaoDe(tn.pratica.prompt),
      abertura: { titulo: 'Antes de mexer: dá para desfazer?', fala: norm(tn.abertura.speech), tela: 'Antes de mexer: dá para desfazer?' },
      d1: decPacote(travei, 'a01'),
      explic1: { titulo: norm(tn.explicacao.title), fala: norm(tn.explicacao.speech), tela: norm(tn.explicacao.onscreen_text), apoio: APOIO_VISUAL['travei-como-peco-ajuda/a01']! },
      d2: dec('on1', 'O Cleiton quer testar uma mudança na tabela de preços. O sistema tem um modo de teste, mas ele não tem certeza de que está nele.', lugar('o', 'Cleiton', 'faz'),
        forte('Confirmo que estou no modo de teste, com autorização, antes de mudar.', 'Você garante que o erro é reversível e o teste autorizado. Falta registrar o que mudou. Faça assim: anote o preço testado e o resultado.'),
        ok('Mudo um preço só, para ver se é o modo de teste.', 'Você tenta limitar o risco, mas pode alterar um preço de verdade. Falta confirmar antes. Faça assim: pergunte ou confira o modo antes de mudar.'),
        fraca('Mudo e, se der errado, volto depois.', 'Em preços reais, "voltar depois" pode já ter afetado clientes. Falta saber se dá para desfazer. Faça assim: pare e confirme o ambiente.')),
      pratica: { enunciado: norm(tn.pratica.prompt), instrucoes: norm(tn.pratica.instructions), atividade: ATIVIDADES['travei-como-peco-ajuda/a01']! },
      fechamento: 'Antes de mexer, confira se dá para desfazer e se o teste é autorizado. Na próxima aula, vamos ver como investigar o que falhou, um passo de cada vez.',
      origem: 'travei-como-peco-ajuda/a01 (a02 foi descartada: duplica C13·A2, análise Fable 2.6)',
    };
    const a2 = aulaPacote(onde, 'a01', {
      id: 'aula_02',
      abertura: 'Agora, vamos investigar o que falhou. Quando alguma coisa falha, sair mudando tudo dificulta descobrir a causa. Comece descrevendo o que deveria acontecer e o que está acontecendo.',
      d2: dec('on2', 'A Débora sabe que o formulário de teste não chegou. Ela já conferiu o endereço de destino, que está certo.', lugar('a', 'Débora', 'faz'),
        forte('Passo para a próxima hipótese e anoto o que descartei.', 'Você descarta uma causa e segue para a próxima, sem mudar tudo. Falta registrar o caminho. Faça assim: anote o que testou e o resultado de cada passo.'),
        ok('Confiro o endereço de novo, só para ter certeza de que está certo.', 'Conferir de novo não custa, mas a hipótese já foi testada. Falta avançar. Faça assim: passe para outra hipótese, uma de cada vez.'),
        fraca('Concluo que o problema está no computador do destino do envio.', 'Você escolhe uma causa sem testar. Falta evidência. Faça assim: verifique o envio e peça apoio a quem tem acesso.', 'Vamos olhar o efeito disso. Você escolhe uma causa sem testar, e a investigação para aí.')),
    });
    const a3 = aulaPacote(onde, 'a02', {
      id: 'aula_03',
      d2: dec('on3', 'O Nathan corrigiu o destino e o teste chegou. Falta saber se o formulário real também funciona para quem o usa no dia a dia.', lugar('o', 'Nathan', 'faz'),
        forte('Registro que o teste passou e peço um envio real autorizado.', 'Você separa o que foi provado do que ainda falta. Falta o envio real autorizado. Faça assim: anote a limitação e quem vai confirmar.', 'Bom caminho. Você separa o que foi provado do que ainda falta provar.'),
        ok('Aviso que está resolvido, porque o teste chegou ao destino esperado.', 'O teste mostra que o destino foi corrigido, mas não prova todos os casos. Falta a confirmação no uso real. Faça assim: diga o que foi testado.'),
        fraca('Faço vários testes seguidos até ter certeza de que nunca mais falha.', 'Repetir testes não prova que nunca falha e consome tempo. Falta um critério. Faça assim: defina o que precisa chegar e confirme uma vez no uso real.')),
    });
    return [a1, a2, a3];
  },
};

/**
 * Correções da revisão pré-gravação (docs/novos-cursos/revisao-pre-gravacao.md) sobre falas que vêm do PACOTE (curso.json), que o
 * importador não edita. `de` tem de estar na fala (senão o importador para): assim uma mudança no pacote não passa em silêncio.
 * `aula` = posição da aula no curso (0 = primeira).
 */
export interface CorrecaoDeFala { slug: string; aula: number; cena: 'explic1' | 'explic2'; de: string; para: string; tela?: string }
export const CORRECOES_DE_FALA: CorrecaoDeFala[] = [
  { slug: 'discordar-sem-brigar', aula: 0, cena: 'explic1', de: 'Fale da proposta, do dado ou do efeito esperado.', para: 'Quando a crítica vem para você, peça um exemplo. Quando é você quem discorda, fale da proposta, do dado ou do efeito esperado.' },
  { slug: 'seus-dados-tambem-trabalham', aula: 1, cena: 'explic1', de: 'Se perceber um envio indevido, comunique pelo procedimento interno e peça ajuda para conter o acesso. Não esconda o ocorrido nem presuma que apagar sua mensagem resolve tudo.', para: 'Se o nome do arquivo está certo, mas o link abre para qualquer pessoa, o problema continua: permissão também faz parte do envio. E quando o envio já saiu errado? Veja o que aconteceu com o Wesley.' },
  { slug: 'ia-como-aliada', aula: 0, cena: 'explic1', de: 'Use somente informações permitidas e uma ferramenta autorizada no contexto do trabalho.', para: 'Use somente informações que você pode compartilhar e pergunte qual é a regra para uso de IA no seu trabalho.' },
  { slug: 'ia-como-aliada', aula: 1, cena: 'explic1', de: 'Não cole cadastros, senhas ou documentos internos para conseguir uma resposta melhor. Quando necessário, transforme o exemplo em dados fictícios. Usar IA com critério inclui saber quando não usar.', para: 'A IA também não precisa de tudo o que está na sua tela para ajudar. Usar IA com critério inclui saber o que não entra no pedido, e quando não usar.' },
  { slug: 'parece-verdade-sera', aula: 1, cena: 'explic1', de: 'Confira o domínio e evite fornecer dados só porque a mensagem parece urgente.', para: 'Confira se o endereço do site é mesmo o da organização e não entregue dados só porque a mensagem parece urgente.' },
  { slug: 'tudo-e-urgente', aula: 1, cena: 'explic1', de: 'Estimativas podem mudar; apresente-as como estimativas. Se o mal-estar persistir ou afetar sua rotina, busque apoio de confiança e atendimento adequado quando necessário.', para: 'Estimativas podem mudar, então apresente como estimativa, não como promessa.', tela: 'Separe o que precisa ser feito, o que depende de outra pessoa e o tempo disponível.' },
  { slug: 'tudo-e-urgente', aula: 1, cena: 'explic2', de: 'O objetivo é tornar a carga administrável, respeitando os combinados e os limites de cada função.', para: 'O objetivo é que o trabalho caiba no tempo, respeitando os combinados e o que é de cada função.' },
  { slug: 'faz-sentido', aula: 1, cena: 'explic1', de: 'Pode ter faltado informação, treinamento ou autorização.', para: 'O atraso pode ter outras causas: faltou informação, treinamento ou autorização.' },
  { slug: 'onde-esta-o-problema', aula: 1, cena: 'explic1', de: 'nem altere um sistema de produção só para descobrir o que acontece', para: 'nem mexa no sistema que a equipe usa de verdade só para descobrir o que acontece' },
  { slug: 'nem-toda-brincadeira', aula: 0, cena: 'explic1', de: 'um adulto de confiança ou responsável pelo programa.', para: 'um adulto de confiança, na escola ou no trabalho.' },
];

function aplicarCorrecoesDeFala(slug: string, aulas: AulaSpec[]): AulaSpec[] {
  for (const k of CORRECOES_DE_FALA.filter((x) => x.slug === slug)) {
    const aula = aulas[k.aula];
    const vid = aula?.[k.cena];
    if (!vid || !vid.fala.includes(k.de)) throw new Error(`${slug}/aula ${k.aula + 1}: a fala de ${k.cena} não traz o trecho a corrigir ("${k.de.slice(0, 50)}…"); o pacote mudou?`);
    vid.fala = vid.fala.replace(k.de, k.para);
    if (k.tela) vid.tela = k.tela;
  }
  return aulas;
}
for (const slug of Object.keys(FABRICAS)) {
  const original = FABRICAS[slug]!;
  FABRICAS[slug] = (c) => aplicarCorrecoesDeFala(slug, original(c));
}

function missaoDe(prompt: string): string {
  return baixa1(semPonto(prompt));
}

/** Instrutor e trilha (final) de cada curso. */
export const TRILHA_FINAL: Record<string, string> = {
  'o-outro-so-e-diferente': 'Respeito e diálogo',
  'discordar-sem-brigar': 'Respeito e diálogo',
  'minha-ideia-tambem-conta': 'Respeito e diálogo',
  'seus-dados-tambem-trabalham': 'Tecnologia com critério',
  'parece-verdade-sera': 'Tecnologia com critério',
  'ia-como-aliada': 'Tecnologia com critério',
  'tudo-e-urgente': 'Autonomia no trabalho',
  'errei-e-agora': 'Autonomia no trabalho',
  'aprender-faz-parte': 'Autonomia no trabalho',
  'por-onde-eu-comeco': 'Pensar e resolver',
  'faz-sentido': 'Pensar e resolver',
  'onde-esta-o-problema': 'Pensar e resolver',
};

/** Cursos do pacote que deixam de existir como curso (decisão do dono): vão para o arquivo; o conteúdo útil foi levado para outro curso. */
export const FUNDIDOS: Record<string, string> = {
  'nem-toda-brincadeira': 'aula 3 do curso existente "Liberdade e intimidade são coisas diferentes" (crs_b8zeh4b2gguseghq); a aula 1 foi descartada (duplica "Brincadeiras têm limite")',
  'seu-ritmo-tambem-importa': 'aula 2 de "Tudo é urgente?"',
  'travei-como-peco-ajuda': 'aula 1 de "Onde está o problema?"; a aula 2 foi descartada (duplica "Comecei a trabalhar")',
};

/** Aula 3 do curso existente "Liberdade e intimidade…" (veio de nem-toda-brincadeira/a02). */
export const CURSO_EXISTENTE_AULA3 = 'crs_b8zeh4b2gguseghq';
export function aula3Patricia(c: (slug: string) => CursoPacote): AulaSpec {
  const cur = c('nem-toda-brincadeira');
  const a = aulaPacote(cur, 'a02', {
    id: 'aula_03',
    // o caso é apresentado por inteiro (revisão pré-gravação): quem é o alvo e o que aconteceu, e só depois o que ela diz
    d1: { ...decPacote(cur, 'a02'), ctx: 'Uma colega da sua equipe virou alvo de piadas sobre o jeito dela de falar. Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança.' },
    d2: dec('np3', 'A Letícia ouviu colegas rirem de uma foto que alguém postou do Ravi. Ele estava no corredor e ouviu também.', lugar('a', 'Letícia', 'faz'),
      forte('Procuro o Ravi em particular, pergunto como ele está e como posso ajudar.', 'Você acolhe sem expor e deixa a decisão com ele. Falta oferecer um caminho. Faça assim: se ele quiser, ajude a achar uma pessoa ou canal de confiança.'),
      ok('Peço aos colegas que apaguem a foto, sem falar com o Ravi.', 'Você interrompe a circulação, mas o Ravi segue sem saber que alguém o apoia. Falta falar com ele. Faça assim: depois, procure-o em particular.'),
      fraca('Finjo que não vi, porque o Ravi não disse nada.', 'O silêncio dele não prova que está tudo bem. Falta acolher. Faça assim: pergunte a ele, em particular, como está.', 'Veja o que essa escolha muda. O silêncio dele não prova que está tudo bem.')),
  });
  a.titulo = 'Quando o alvo é outra pessoa';
  a.origem = 'nem-toda-brincadeira/a02 (fusão; a aula 1 foi descartada, análise Fable 2.10)';
  return aplicarCorrecoesDeFala('nem-toda-brincadeira', [a])[0]!;
}
