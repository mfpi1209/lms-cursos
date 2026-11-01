/**
 * Ajustes de PADRÃO DO MOTOR do pacote-15 (pedido da coordenação, a partir de docs/novos-cursos/analise-fable.md, itens 2 e 5.3).
 * Só forma: nenhuma fusão, substituição de caso nem trilha nova (isso é decisão do dono). O significado de cada alternativa
 * e o caso de cada decisão são os do pacote; mudam o tamanho e a posição das alternativas, o retorno (agora em 3 partes:
 * o que resolve, o que falta, o próximo passo), a abertura da aula 2, o fechamento e a atividade (montagem por grupos).
 *
 * Chave de tudo: `<slug>/<aula>` (aula = a01 | a02).
 */

export interface OpcaoEditorial {
  /** alternativa do pacote da qual esta deriva (op1 | op2 | op3) */
  de: 'op1' | 'op2' | 'op3';
  /** texto da alternativa (1ª pessoa; mesmo sentido do pacote, tamanho equilibrado) */
  t: string;
  /** qualidade das não recomendadas: ok = tem parte do caminho; weak = não resolve (a recomendada é sempre strong) */
  q?: 'ok' | 'weak';
  /** retorno escrito: o que resolve (ou causa), o que falta, o próximo passo ("Faça assim: …") */
  f: string;
  /** reação falada (opcional): vale no lugar da abertura + 1ª parte do retorno que o importador monta */
  r?: string;
}
export interface DecisaoEditorial {
  strong: OpcaoEditorial;
  /** as duas outras, na ordem em que aparecem em volta da recomendada */
  outras: [OpcaoEditorial, OpcaoEditorial];
}

const comR = (r?: string) => (r ? { r } : {});
const S = (de: OpcaoEditorial['de'], t: string, f: string, r?: string): OpcaoEditorial => ({ de, t, f, ...comR(r) });
const OK = (de: OpcaoEditorial['de'], t: string, f: string, r?: string): OpcaoEditorial => ({ de, t, q: 'ok', f, ...comR(r) });
const W = (de: OpcaoEditorial['de'], t: string, f: string, r?: string): OpcaoEditorial => ({ de, t, q: 'weak', f, ...comR(r) });

export const DECISOES: Record<string, DecisaoEditorial> = {
  'o-outro-so-e-diferente/a01': {
    strong: S('op2', 'Pergunto a Dani como ela prefere contribuir.', 'Você abre espaço para combinar uma forma de participar, sem supor intenção. Ainda falta alinhar o combinado. Faça assim: ofereça opções, como falar na reunião ou mandar por escrito.'),
    outras: [
      W('op1', 'Concordo que participar é falar na hora.', 'Você deixa de considerar as sugestões que Dani já enviou: falar pouco não prova desinteresse. Falta olhar o que ela entrega. Faça assim: observe como ela contribui e pergunte como prefere participar.'),
      W('op3', 'Peço que Dani explique por que age assim.', 'A pergunta vira cobrança por uma explicação pessoal que Dani pode não querer dar. Falta foco no trabalho. Faça assim: pergunte como ela prefere contribuir, sem pedir motivos.'),
    ],
  },
  'o-outro-so-e-diferente/a02': {
    strong: S('op3', 'Apoio o pedido para parar e busco ajuda se precisar.', 'Você reconhece o limite que ela pediu, sem exigir confronto. Falta garantir que o comportamento pare. Faça assim: diga que ela pediu para parar e que vão respeitar; se não for seguro, procure o canal adequado.'),
    outras: [
      W('op1', 'Aceito o argumento, porque cada um tem seu jeito.', 'O argumento do jeito pessoal não resolve o constrangimento que ela já comunicou. Falta ouvir o pedido. Faça assim: apoie o pedido para parar.'),
      W('op2', 'Digo a ela que é melhor aprender a levar na brincadeira.', 'A responsabilidade cai em quem foi constrangida, e o comportamento continua. Falta respeitar o limite dela. Faça assim: apoie o pedido e, se precisar, busque um canal adequado.'),
    ],
  },
  'ia-como-aliada/a01': {
    strong: S('op2', 'Crie um convite curto só com horário, local e público confirmados.', 'Você delimita a tarefa e os dados que podem entrar no texto. Ainda falta revisar o resultado. Faça assim: peça que a IA aponte o que faltar, em vez de inventar.'),
    outras: [
      W('op1', 'Escreva alguma coisa legal para o convite da oficina.', 'A ferramenta recebe pouca direção e pode devolver algo genérico. Falta dizer o resultado, o público e os dados. Faça assim: diga o que precisa e use só dados confirmados.'),
      OK('op3', 'Escreva o convite e complete sozinha tudo o que estiver faltando.', 'Você pede o convite completo, mas abre espaço para detalhes inventados parecerem confirmados. Falta limitar os dados. Faça assim: diga que ela não invente e liste o que é confirmado.'),
    ],
  },
  'ia-como-aliada/a02': {
    strong: S('op2', 'Retiro a frase sem fonte e confiro o resto com meus dados.', 'Você corrige o que ninguém confirmou e revisa outras possíveis invenções. Falta registrar o que conferiu. Faça assim: compare nomes, números e condições com a informação de origem antes de enviar.', 'É por aí. Você corrige o que ninguém confirmou e revisa outras possíveis invenções.'),
    outras: [
      OK('op3', 'Pergunto à mesma IA se ela tem certeza e aceito a resposta.', 'Você desconfia, mas outra resposta da mesma ferramenta não substitui uma fonte confiável. Falta checar na origem. Faça assim: compare a frase com o que a equipe confirmou.'),
      W('op1', 'Envio o texto como está, porque ficou profissional.', 'O texto pode criar uma expectativa que a equipe não consegue cumprir. Falta conferir o que foi dito. Faça assim: confira cada fato na fonte antes de enviar.'),
    ],
  },
  'parece-verdade-sera/a01': {
    strong: S('op2', 'Confirmo no canal oficial antes de mudar meus planos.', 'Você trata o aviso como algo a verificar, sem assumir que é verdadeiro ou falso. Falta saber se vale para a sua equipe. Faça assim: pergunte à pessoa responsável e deixe claro que ainda não foi confirmado.'),
    outras: [
      OK('op3', 'Não repasso e espero alguém confirmar no grupo.', 'Você não espalha a dúvida, mas pode perder um aviso real esperando. Falta verificar. Faça assim: procure o comunicado original ou pergunte se o aviso vale para a equipe.', 'Vamos olhar o efeito disso. Você não espalha a dúvida, mas pode perder um aviso real esperando.'),
      W('op1', 'Repasso o aviso para o grupo todo agora mesmo, com urgência.', 'Você amplia uma informação que ainda não foi confirmada. Falta conferir origem e data. Faça assim: procure o comunicado original antes de repassar.'),
    ],
  },
  'parece-verdade-sera/a02': {
    strong: S('op2', 'Não. Procuro a publicação da organização e confiro a data.', 'Você procura evidência direta e vê se o aviso corresponde à situação atual. Falta conferir requisitos e canal de inscrição. Faça assim: abra o canal oficial por um caminho que você já conhece.'),
    outras: [
      W('op1', 'Sim, porque as três publicações diferentes valem como três confirmações separadas.', 'As três podem depender do mesmo conteúdo não verificado. Falta achar a fonte original. Faça assim: procure quem publicou primeiro antes de compartilhar.'),
      W('op3', 'Sim, se o perfil que divulgou tiver muitos seguidores.', 'Popularidade não confirma a informação. Falta a publicação da organização. Faça assim: procure quem publicou primeiro e confira a data.', 'Olhe isso com calma. Popularidade não confirma a informação.'),
    ],
  },
  'seus-dados-tambem-trabalham/a01': {
    strong: S('op2', 'Recorto ou oculto o que não precisa e reviso a imagem.', 'Você reduz a exposição e confere se o arquivo final realmente removeu o que não deve aparecer. Falta usar o canal certo. Faça assim: envie só a parte necessária pelo canal autorizado.'),
    outras: [
      W('op1', 'Envio a tela inteira, para dar mais contexto a quem vai ajudar.', 'O contexto extra expõe informações que não ajudam a resolver o problema. Falta separar o que é necessário. Faça assim: recorte a imagem e deixe só a mensagem de erro.'),
      W('op3', 'Envio como está e peço que apaguem depois.', 'Depois do envio, você não controla as cópias nem quem viu. Falta preparar antes de enviar. Faça assim: oculte os dados desnecessários antes e confira a imagem exportada.'),
    ],
  },
  'seus-dados-tambem-trabalham/a02': {
    strong: S('op2', 'Confirmo os destinatários e ajusto o acesso do link.', 'Você verifica se o acesso corresponde à finalidade do envio. Falta seguir a orientação da organização. Faça assim: dê acesso só a quem precisa e confirme como a equipe quer compartilhar.'),
    outras: [
      W('op1', 'Envio agora mesmo, porque o nome do arquivo está correto.', 'O nome não controla quem consegue abrir o conteúdo. Falta olhar a permissão do link. Faça assim: confira destinatário e acesso antes de enviar.'),
      OK('op3', 'Mando o link como está e peço para ninguém repassar.', 'Você cuida da circulação, mas o link continua aberto para qualquer pessoa que o tenha. Falta ajustar a permissão. Faça assim: restrinja o acesso a quem precisa antes de enviar.', 'Olhe isso com calma. Você cuida da circulação, mas o link continua aberto para qualquer pessoa que o tenha.'),
    ],
  },
  'tudo-e-urgente/a01': {
    strong: S('op2', 'Pergunto o prazo e o impacto e aviso do meu compromisso.', 'Você reúne o que é preciso para combinar a ordem. Falta decidir a prioridade com quem pode definir. Faça assim: apresente o conflito e peça a decisão antes de trocar de tarefa.'),
    outras: [
      W('op1', 'Paro a tarefa combinada e começo o novo pedido, já que é ‘para agora’.', 'A primeira entrega pode atrasar sem que ninguém consiga se reorganizar. Falta avisar do compromisso. Faça assim: diga o que já estava combinado e pergunte o prazo do novo pedido.'),
      W('op3', 'Prometo entregar as duas coisas o mais rápido que der.', 'A promessa não aumenta o tempo e pode criar duas expectativas incompatíveis. Falta tornar o conflito visível. Faça assim: pergunte prazo e impacto e combine a ordem.'),
    ],
  },
  'tudo-e-urgente/a02': {
    strong: S('op3', 'Só consigo concluir uma delas. Qual vem primeiro e qual o prazo da outra?', 'Você mostra a limitação e pede uma decisão sobre ordem e prazo. Falta confirmar o combinado depois. Faça assim: registre a ordem escolhida e avise cedo se a estimativa mudar.'),
    outras: [
      W('op1', 'Vou dar um jeito de entregar as duas no fim desta hora, sem problema nenhum.', 'A mensagem mantém o conflito escondido. Falta dizer o que cabe no tempo. Faça assim: mostre o que dá para concluir e peça a decisão.'),
      W('op2', 'Não consigo fazer nada com esse tempo, então prefiro nem começar nenhuma.', 'Você deixa de apresentar o que é possível realizar. Falta propor uma ordem. Faça assim: diga que consegue concluir uma e pergunte qual.'),
    ],
  },
  'travei-como-peco-ajuda/a01': {
    strong: S('op2', 'Paro essa ação e confirmo com alguém responsável.', 'Você reconhece uma ação de risco e busca orientação antes de executá-la. Falta explicar o que você viu. Faça assim: descreva o botão e a pasta e pergunte se é seguro usar.'),
    outras: [
      W('op1', 'Clico no botão para descobrir o que ele faz.', 'Uma tentativa pode apagar conteúdo importante. Falta saber se dá para desfazer. Faça assim: pare antes de clicar e pergunte a quem conhece o sistema.'),
      OK('op3', 'Procuro a ajuda do sistema e, se parecer simples, tento.', 'Buscar informação ajuda, mas ‘parecer simples’ não diz se dá para desfazer. Falta confirmar o risco. Faça assim: se a ajuda não deixar claro, pergunte a quem conhece o sistema.', 'Repare no que isso provoca. Buscar informação ajuda, mas ‘parecer simples’ não diz se dá para desfazer.'),
    ],
  },
  'travei-como-peco-ajuda/a02': {
    strong: S('op2', 'Dá erro ao escolher o período no relatório. Já conferi as datas. Qual passo verifico agora?', 'O objetivo, o ponto de dificuldade e a tentativa ficam claros. Falta só o prazo, se ele estiver perto. Faça assim: diga quando precisa do relatório e confirme o próximo passo com suas palavras.'),
    outras: [
      W('op1', 'Não funciona. O relatório não exporta de jeito nenhum e eu não sei mais o que fazer.', 'Falta contexto para a pessoa entender o bloqueio. Falta dizer o que você tentou. Faça assim: conte o objetivo, o erro e o que já conferiu.'),
      OK('op3', 'Você pode fazer tudo por mim? Eu não consigo exportar o relatório.', 'Pode ser preciso apoio direto, mas o pedido não mostra onde você precisa destravar. Falta o ponto da dificuldade. Faça assim: diga onde o erro aparece e o que já verificou.'),
    ],
  },
  'errei-e-agora/a01': {
    strong: S('op2', 'Aviso qual versão enviei e indico a correta.', 'Você torna o problema visível e ajuda a interromper o uso incorreto. Falta saber o impacto. Faça assim: diga o que foi enviado, quem recebeu e que ainda vai verificar o resto.'),
    outras: [
      W('op1', 'Espero para ver se alguém percebe o erro.', 'A equipe pode continuar usando a versão errada. Falta avisar. Faça assim: diga logo qual arquivo foi enviado e qual é o correto.'),
      W('op3', 'Apago meu arquivo e finjo que não enviei.', 'Apagar a sua cópia não corrige o que já chegou às outras pessoas. Falta avisar quem recebeu. Faça assim: conte o que aconteceu e indique a versão correta.'),
    ],
  },
  'errei-e-agora/a02': {
    strong: S('op2', 'Combino um nome claro para a versão final e uma conferência.', 'Você atua sobre uma causa concreta e cria uma verificação. Falta ver se funcionou. Faça assim: confira a identificação antes dos próximos envios e avise a equipe do combinado.'),
    outras: [
      W('op1', 'Prometo a todos da equipe que nunca mais vou errar em nenhum envio.', 'A promessa não muda a condição que favoreceu a confusão. Falta uma mudança concreta. Faça assim: escolha um ajuste pequeno, como identificar a versão final.'),
      W('op3', 'Guardo todas as versões com o nome final, assim nada se perde.', 'O mesmo nome mantém a dúvida sobre qual arquivo usar. Falta distinguir as versões. Faça assim: marque só uma versão como final e confira antes de enviar.'),
    ],
  },
  'minha-ideia-tambem-conta/a01': {
    strong: S('op2', 'Notei que o formulário é difícil de achar. Existe um lugar combinado?', 'Você apresenta o que observou e procura entender o que já existe. Falta o efeito para a equipe. Faça assim: conte quantas pessoas perguntaram e o que isso atrasou.'),
    outras: [
      W('op1', 'Digo ao gestor que esse processo é ruim e que ninguém acha nada.', 'O julgamento pode desviar a conversa do problema concreto. Falta descrever o fato. Faça assim: diga o que acontece e qual é o efeito, sem criticar pessoas.'),
      W('op3', 'Mudo o formulário de pasta para facilitar, sem avisar ninguém da equipe.', 'A mudança pode quebrar acessos ou contrariar um combinado que você ainda não conhece. Falta combinar antes. Faça assim: pergunte como funciona hoje e proponha a mudança à equipe.'),
    ],
  },
  'minha-ideia-tambem-conta/a02': {
    strong: S('op2', 'Podemos testar um atalho por uma semana e ver o resultado?', 'Você delimita o teste e define um sinal para avaliar o resultado. Falta combinar quem autoriza. Faça assim: combine quem mantém o atalho e como vai ouvir a equipe.'),
    outras: [
      W('op1', 'Vamos mudar todos os sistemas da equipe hoje mesmo, para resolver de vez.', 'A mudança ampla cria trabalho sem evidência de que seja necessária. Falta um teste pequeno. Faça assim: proponha algo que dê para testar em uma semana.'),
      W('op3', 'Minha ideia vai acabar de vez com todas as dúvidas de acesso da equipe.', 'A promessa vai além do que a ideia consegue garantir. Falta um jeito de avaliar. Faça assim: diga o que vai observar para saber se ajudou.'),
    ],
  },
  'discordar-sem-brigar/a01': {
    strong: S('op2', 'Também quero entregar hoje. Falta confirmar um dado; podemos verificar antes?', 'Você liga a preocupação ao objetivo comum e propõe uma ação. Falta ouvir a resposta do colega. Faça assim: pergunte o que ele já sabe sobre o dado e combine como conferir.'),
    outras: [
      W('op1', 'Você sempre faz tudo correndo e depois dá problema.', 'O comentário generaliza o comportamento e aumenta a tensão. Falta falar do dado. Faça assim: fale do que está faltando e proponha uma verificação.'),
      OK('op3', 'Fico em silêncio, mesmo achando que o dado pode estar errado.', 'Você evita o conflito, mas o risco continua sem que a equipe possa avaliá-lo. Falta dizer a preocupação. Faça assim: comece pelo objetivo comum e peça para conferir o dado.'),
    ],
  },
  'discordar-sem-brigar/a02': {
    strong: S('op2', 'Comparo clareza e prazo e, se preciso, pergunto a quem vai usar.', 'Você aproxima a decisão da finalidade do trabalho. Falta registrar o combinado. Faça assim: defina o critério antes de defender o formato e anote o que ficou decidido.'),
    outras: [
      W('op1', 'Continuo discutindo o formato até um de nós desistir de vez.', 'A discussão consome tempo sem criar um critério de escolha. Falta um critério. Faça assim: proponha comparar clareza e prazo.', 'Veja o que essa escolha muda. A discussão consome tempo sem criar um critério de escolha.'),
      W('op3', 'Escolho o meu formato e entrego o relatório sem avisar o colega.', 'A escolha de um lado só pode gerar retrabalho e desgaste. Falta combinar com o colega. Faça assim: mostre as opções e pergunte a quem vai usar.'),
    ],
  },
  'nem-toda-brincadeira/a01': {
    strong: S('op2', 'Paro de usar o apelido e reconheço o pedido, sem cobrar justificativa.', 'Você muda o comportamento e não coloca a pessoa em julgamento. Falta garantir que o grupo pare também. Faça assim: diga que entendeu e, se continuar, procure um canal adequado.'),
    outras: [
      W('op1', 'Digo que era só brincadeira e que ninguém ali quis ofender ninguém.', 'A intenção de brincar não elimina o efeito nem o pedido para parar. Falta reconhecer o pedido. Faça assim: diga que entendeu e que não vai repetir.'),
      W('op3', 'Peço que ele explique para o grupo todo por que se incomodou.', 'A exigência pode ampliar a exposição e o constrangimento. Falta respeitar o pedido. Faça assim: pare de usar o apelido sem pedir explicação.'),
    ],
  },
  'nem-toda-brincadeira/a02': {
    strong: S('op2', 'Pergunto como ela quer ser apoiada e ajudo a achar um canal.', 'Você oferece apoio e informação, respeitando a segurança e a vontade dela. Falta cuidar do que você promete. Faça assim: não prometa sigilo nem solução imediata; ofereça ir junto, se ela quiser.'),
    outras: [
      W('op1', 'Publico o relato dela no grupo para pressionar a equipe a agir.', 'Você pode ampliar a exposição sem o consentimento dela. Falta respeitar a vontade dela. Faça assim: pergunte como ela quer ser apoiada.'),
      W('op3', 'Digo que é melhor aguentar quieta para não criar problema.', 'A resposta desestimula a busca de ajuda e normaliza o problema. Falta acolher. Faça assim: ouça em particular e ajude a achar um canal de confiança.'),
    ],
  },
  'seu-ritmo-tambem-importa/a01': {
    strong: S('op2', 'Listo as demandas, os prazos e o que está bloqueado.', 'Você transforma uma sensação geral em informações que orientam uma decisão. Falta levar isso a quem pode ajustar. Faça assim: apresente a lista como estimativas e proponha uma ordem.'),
    outras: [
      W('op1', 'Vou fazendo o que dá e só aviso se alguma entrega atrasar.', 'O conflito fica invisível até virar atraso. Falta tornar a situação visível. Faça assim: liste as tarefas e converse antes de o prazo estourar.'),
      W('op3', 'Concluo que eu simplesmente não sirvo para este trabalho.', 'Sobrecarga não define a sua capacidade nem o seu valor. Falta separar o que cabe. Faça assim: anote o que precisa ser feito e o tempo disponível.'),
    ],
  },
  'seu-ritmo-tambem-importa/a02': {
    strong: S('op2', 'Para concluir A preciso de uma autorização; avanço em B. Podemos rever o prazo?', 'Você apresenta o bloqueio, uma alternativa e um pedido específico. Falta confirmar o combinado. Faça assim: registre o que ficou decidido e quando será revisto.'),
    outras: [
      OK('op1', 'Estou com muita coisa e não vou conseguir entregar tudo no prazo.', 'A mensagem mostra desconforto, mas não explica qual ajuste ajudaria. Falta dizer o bloqueio. Faça assim: cite o que depende de outra pessoa e proponha uma ordem.'),
      W('op3', 'Prometo compensar: vou trabalhar sem parar, inclusive fora do horário, até entregar tudo hoje.', 'A promessa pode ampliar o desgaste e não resolve a dependência. Falta pedir o ajuste. Faça assim: proponha mudar a ordem ou rever o prazo.'),
    ],
  },
  'aprender-faz-parte/a01': {
    strong: S('op2', 'Pergunto o que costuma faltar e escolho uma melhoria para praticar.', 'Você procura evidência e define algo que pode ser praticado. Falta escolher uma situação simples. Faça assim: peça um exemplo, escolha um ponto e pratique no próximo recado.'),
    outras: [
      W('op1', 'Decido que sou ruim de comunicação e não tem mais o que fazer.', 'Você transforma um comportamento específico em um rótulo sobre si. Falta olhar o fato. Faça assim: pergunte quais informações costumam faltar.'),
      W('op3', 'Tento mudar toda a minha personalidade a partir de hoje.', 'A tarefa é ampla e não responde ao ponto observado. Falta escolher um foco. Faça assim: escolha uma melhoria pequena para praticar.'),
    ],
  },
  'aprender-faz-parte/a02': {
    strong: S('op2', 'Nos próximos três recados, confiro o prazo e peço retorno.', 'O plano delimita a prática e uma forma de receber retorno. Falta o momento de revisar. Faça assim: marque quando vai comparar os recados e ajustar o próximo passo.'),
    outras: [
      OK('op1', 'Vou me comunicar melhor com todo mundo a partir da próxima semana.', 'A intenção é válida, mas falta uma ação que dê para observar. Falta o como. Faça assim: diga o que vai fazer nos próximos recados.'),
      W('op3', 'Nunca mais vou mandar um recado incompleto para ninguém na vida.', 'A promessa absoluta não oferece um método para aprender. Falta uma prática pequena. Faça assim: escolha três recados para acompanhar.'),
    ],
  },
  'por-onde-eu-comeco/a01': {
    strong: S('op2', 'Confirmo a duração e a disponibilidade antes de fechar sala e horário.', 'Você busca as informações de que as próximas decisões dependem. Falta confirmar com todos. Faça assim: pergunte duração e disponibilidade e só então reserve a sala.'),
    outras: [
      OK('op1', 'Reservo logo a sala no primeiro horário livre, antes que ela acabe.', 'Você age rápido, mas a sala pode estar livre num horário em que as pessoas não podem. Falta a disponibilidade. Faça assim: confirme duração e horários antes de reservar.'),
      W('op3', 'Envio o convite para todos com um horário que eu escolhi.', 'O convite transforma uma suposição em compromisso ainda não combinado. Falta combinar. Faça assim: pergunte a disponibilidade antes de convidar.', 'Repare no que isso provoca. O convite transforma uma suposição em compromisso ainda não combinado.'),
    ],
  },
  'por-onde-eu-comeco/a02': {
    strong: S('op2', 'Confirmo o conteúdo, confiro quantidades, separo materiais e verifico os kits.', 'Cada etapa usa informações da anterior e termina com uma conferência. Falta marcar o que ainda depende de confirmação. Faça assim: confirme o conteúdo antes de separar e compare o resultado com o pedido.'),
    outras: [
      W('op1', 'Embalo qualquer material disponível agora e depois pergunto o conteúdo.', 'Os kits podem ficar diferentes do necessário e precisar ser refeitos. Falta confirmar o conteúdo. Faça assim: pergunte o que cada kit leva antes de embalar.'),
      W('op3', 'Compro os materiais antes de conferir o que já existe no estoque.', 'Você pode comprar itens desnecessários e deixar faltar o que importa. Falta olhar o estoque. Faça assim: confira o que já existe antes de pedir reposição.'),
    ],
  },
  'faz-sentido/a01': {
    strong: S('op2', 'Que a minha mensagem ainda não recebeu resposta.', 'Você identifica o dado disponível sem transformar uma hipótese em certeza. Falta pensar no que pode explicar isso. Faça assim: liste duas explicações possíveis e, se houver prazo, retome com contexto.'),
    outras: [
      W('op1', 'Que ele não gostou nada do meu trabalho.', 'Isso é uma interpretação sobre o motivo, não um fato observado. Falta separar o que se viu. Faça assim: anote o fato e trate o resto como hipótese.'),
      OK('op3', 'Que ele viu a mensagem e ainda não respondeu.', 'Quase: ‘ainda não respondeu’ é fato, mas ‘viu a mensagem’ você não confirmou. Falta separar os dois. Faça assim: guarde só o que foi observado e trate o resto como hipótese.', 'Quase lá. ‘Ainda não respondeu’ é fato, mas ‘viu a mensagem’ você não confirmou.'),
    ],
  },
  'faz-sentido/a02': {
    strong: S('op2', 'Verifico outros fatores e outras entregas antes de culpar a ferramenta.', 'Você considera a hipótese e busca evidências para avaliá-la. Falta olhar os registros. Faça assim: compare o que mudou naquele dia e diga que ainda não sabe a causa.'),
    outras: [
      W('op1', 'Aceito: aconteceu junto, então a ferramenta foi a causa do atraso.', 'Dois acontecimentos juntos não demonstram, sozinhos, causa e efeito. Falta comparar com outros casos. Faça assim: procure outras entregas e veja se as condições eram parecidas.'),
      OK('op3', 'Peço para voltar à ferramenta antiga até termos certeza.', 'É prudente, mas decide sem investigar: a causa pode ser outra, e a equipe perde a ferramenta nova. Falta verificar. Faça assim: compare o que mudou naquele dia antes de trocar de novo.', 'Olhe isso com calma. É prudente, mas decide sem investigar, e a causa pode ser outra.'),
    ],
  },
  'onde-esta-o-problema/a01': {
    strong: S('op2', 'Confiro a confirmação de envio e o endereço de destino.', 'Você verifica pontos do caminho que têm relação direta com o resultado esperado. Falta registrar o que observou. Faça assim: teste uma hipótese de cada vez e anote o resultado.'),
    outras: [
      W('op1', 'Refaço o formulário do zero, para garantir que vai funcionar.', 'Se voltar a funcionar, você não saberá qual era a causa, e pode criar outros problemas. Falta isolar uma hipótese. Faça assim: mude uma coisa por vez, com autorização.', 'Veja o que essa escolha muda. Se voltar a funcionar, você não saberá qual era a causa, e pode criar outros problemas.'),
      OK('op3', 'Acho que é a internet e espero a conexão melhorar.', 'É uma hipótese possível, mas tratada como causa antes de ser testada. Falta testar. Faça assim: verifique a conexão e os pontos do envio, um de cada vez.'),
    ],
  },
  'onde-esta-o-problema/a02': {
    strong: S('op2', 'Faço um envio de teste fictício e confirmo no destino.', 'Você verifica o resultado final e não apenas um sinal intermediário. Falta registrar a limitação. Faça assim: anote o que foi verificado e lembre que funcionar em teste não prova todos os casos.'),
    outras: [
      W('op1', 'Aviso que está resolvido: a tela já mostra ‘enviado’.', 'A mensagem confirma uma etapa, mas não necessariamente o recebimento esperado. Falta olhar o destino. Faça assim: confirme no destino que o teste chegou.'),
      OK('op3', 'Peço a um colega que também faça um envio de teste.', 'Mais um teste ajuda, mas sem conferir se chegou ao destino, nada está provado. Falta o critério de sucesso. Faça assim: defina o que precisa chegar e onde, e confira.', 'Repare no que isso provoca. Mais um teste ajuda, mas sem conferir o destino, nada está provado.'),
    ],
  },
};

/** Posição (0 a 2) da recomendada na decisão de número `n` (0 a 29, na ordem do catálogo): 10 de cada, sem padrão fixo. */
export const POSICAO_RECOMENDADA = [1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2] as const;

/**
 * Abertura da aula 2 que NÃO entrega a resposta da decisão ("Agora, vamos…"). Usa só frases do pacote que não resolvem o caso;
 * a frase de "Agora, vamos" abre o tema. Chave: `<slug>/a02`.
 */
export const ABERTURA_AULA_2: Record<string, string> = {
  'o-outro-so-e-diferente/a02': 'Agora, vamos falar de limites. Respeitar alguém não significa concordar com tudo. Uma preferência pessoal pode ser diferente da sua.',
  'ia-como-aliada/a02': 'Agora, vamos olhar o que a IA devolve. Uma resposta pode soar segura e ainda estar errada.',
  'parece-verdade-sera/a02': 'Agora, vamos falar de uma informação que aparece em vários lugares ao mesmo tempo.',
  'seus-dados-tambem-trabalham/a02': 'Agora, vamos falar do envio. Um arquivo correto enviado para a pessoa errada ainda pode causar um problema.',
  'tudo-e-urgente/a02': 'Agora, vamos combinar o que vem primeiro. Um prazo precisa considerar o tempo necessário e as dependências, não só a vontade de terminar rápido.',
  'travei-como-peco-ajuda/a02': 'Agora, vamos pedir ajuda. Você não precisa ter a solução pronta nem escrever uma história enorme.',
  'errei-e-agora/a02': 'Agora, vamos aprender com o erro. Depois de conter o problema, vale olhar para o processo.',
  'minha-ideia-tambem-conta/a02': 'Agora, vamos transformar a observação em proposta. Uma proposta não precisa resolver tudo de uma vez.',
  'discordar-sem-brigar/a02': 'Agora, vamos sair de um impasse. Quando duas opções continuam em disputa, repetir o argumento mais alto não resolve.',
  'nem-toda-brincadeira/a02': 'Agora, vamos falar de como apoiar quem foi alvo.',
  'seu-ritmo-tambem-importa/a02': 'Agora, vamos pedir um ajuste. Não precisa contar detalhes pessoais para justificar cada pedido.',
  'aprender-faz-parte/a02': 'Agora, vamos montar um plano de aprendizagem. Não precisa de uma meta gigante.',
  'por-onde-eu-comeco/a02': 'Agora, vamos organizar as etapas. Depois de entender o resultado, divida o caminho em ações. Algumas podem acontecer em paralelo. Outras só fazem sentido depois de uma confirmação.',
  'faz-sentido/a02': 'Agora, vamos falar de padrões. Uma experiência chama atenção, mas nem sempre representa um padrão.',
  'onde-esta-o-problema/a02': 'Agora, vamos conferir se o problema foi resolvido.',
};

/** Fechamento próprio de cada aula (o do pacote é o mesmo texto nas 30). */
export const FECHAMENTOS: Record<string, string> = {
  'o-outro-so-e-diferente/a01': 'Antes de supor desinteresse, pergunte como a pessoa prefere participar e ofereça mais de um caminho. Na próxima aula, vamos ver quando respeitar uma diferença também exige um limite.',
  'o-outro-so-e-diferente/a02': 'Respeitar diferenças inclui ouvir limites: quando alguém pede para parar, apoiar é respeitar o pedido. Sua frase de apoio fica no roteiro para você adaptar quando precisar.',
  'ia-como-aliada/a01': 'Um bom pedido diz o resultado, o contexto e o formato, e usa só informações que você pode compartilhar. Na próxima aula, vamos ver o que fazer antes de usar a resposta da IA.',
  'ia-como-aliada/a02': 'Antes de usar uma resposta de IA, confira os fatos e retire o que ninguém confirmou. Não cole cadastros, senhas nem documentos internos: troque por dados fictícios. Se você salvou, seu checklist fica no Meu roteiro.',
  'parece-verdade-sera/a01': 'Um print sozinho não confirma nada: procure a origem, a data e a quem o aviso vale. Na próxima aula, vamos ver por que várias publicações iguais podem ser uma só fonte.',
  'parece-verdade-sera/a02': 'Antes de repassar uma oportunidade, confirme na fonte oficial e diga com clareza o que ainda não foi confirmado. Se você salvou, sua sequência de verificações fica no Meu roteiro.',
  'seus-dados-tambem-trabalham/a01': 'Ao pedir ajuda com um print, mostre só o necessário e confira a imagem final. Na próxima aula, vamos ver o que checar antes de enviar um arquivo ou link.',
  'seus-dados-tambem-trabalham/a02': 'Antes de enviar, confira quem recebe, o que vai e quem consegue abrir. Se algo sair errado, avise logo quem pode agir: apagar a mensagem não resolve o que já foi visto. Se você salvou, seu checklist de envio fica no Meu roteiro.',
  'tudo-e-urgente/a01': 'Quando dois pedidos chegam juntos, pergunte prazo e uso antes de decidir. Na próxima aula, vamos combinar o que vem primeiro quando o tempo não dá para tudo.',
  'tudo-e-urgente/a02': 'Mostrar o que cabe no tempo e propor uma ordem ajuda mais do que prometer tudo. Sua mensagem fica no roteiro para você adaptar.',
  'travei-como-peco-ajuda/a01': 'Se a ação pode apagar ou expor algo e você não sabe como desfazer, pare e pergunte. Na próxima aula, vamos ver como pedir ajuda mostrando onde você travou.',
  'travei-como-peco-ajuda/a02': 'Um bom pedido de ajuda diz o objetivo, onde você travou e o que já verificou. Seu pedido fica no roteiro para você reaproveitar.',
  'errei-e-agora/a01': 'Quando perceber um erro, avise com fatos e diga o que ainda vai verificar. Se alguém reagir com irritação, ouça e volte ao que vai ser feito. Na próxima aula, vamos ver como mudar o processo para o erro não se repetir.',
  'errei-e-agora/a02': 'Corrigir também é olhar o processo: uma mudança pequena e uma conferência já ajudam. Se você salvou, sua escolha fica no Meu roteiro para acompanhar.',
  'minha-ideia-tambem-conta/a01': 'Uma observação com fato e efeito abre conversa sem atacar ninguém. Na próxima aula, vamos transformar a observação em uma proposta pequena para testar.',
  'minha-ideia-tambem-conta/a02': 'Uma ideia ganha força quando vira um teste combinado, com um sinal para avaliar. Se você salvou, sua proposta fica no Meu roteiro para levar à equipe.',
  'discordar-sem-brigar/a01': 'Discordar fica mais leve quando você começa pelo objetivo comum e propõe um próximo passo. Na próxima aula, vamos ver o que fazer quando a conversa trava.',
  'discordar-sem-brigar/a02': 'Quando há impasse, critérios e uma pergunta a quem vai usar ajudam mais do que insistir. Se você salvou, seus critérios ficam no Meu roteiro.',
  'nem-toda-brincadeira/a01': 'Reconhecer o pedido para parar, sem se defender, já muda a situação. Na próxima aula, vamos ver como apoiar quem foi alvo sem expor a pessoa.',
  'nem-toda-brincadeira/a02': 'Apoiar é ouvir, respeitar a vontade da pessoa e ajudar a achar um canal de confiança. Se você salvou, sua frase de acolhimento fica no Meu roteiro.',
  'seu-ritmo-tambem-importa/a01': 'Colocar demandas, prazos e dependências no papel transforma a sensação de que não cabe em informação para conversar. Na próxima aula, vamos pedir um ajuste.',
  'seu-ritmo-tambem-importa/a02': 'Pedir um ajuste é mostrar a situação, o impacto e uma alternativa, sem precisar contar a sua vida pessoal. Se a sobrecarga estiver pesando além do trabalho, procure alguém de confiança. Se você salvou, seu pedido fica no Meu roteiro.',
  'aprender-faz-parte/a01': 'Um retorno vira aprendizado quando você pergunta o que faltou e escolhe uma coisa para praticar. Na próxima aula, vamos montar um plano pequeno.',
  'aprender-faz-parte/a02': 'Um plano pequeno, com ação, apoio e momento de revisão, já mostra o seu avanço. Ele fica no roteiro para você retomar.',
  'por-onde-eu-comeco/a01': 'Antes de agir, separe o que você precisa conseguir, o que já sabe e o que falta descobrir. Na próxima aula, vamos ordenar as etapas.',
  'por-onde-eu-comeco/a02': 'Dividir em etapas e marcar o que depende de confirmação evita retrabalho. Se você salvou, seu plano fica no Meu roteiro.',
  'faz-sentido/a01': 'Observação e explicação são coisas diferentes: guarde o fato e deixe a hipótese como hipótese. Na próxima aula, vamos ver por que um caso só não explica tudo.',
  'faz-sentido/a02': 'Uma conclusão provisória e duas informações para testá-la já formam uma boa investigação. Se você salvou, ela fica no Meu roteiro.',
  'onde-esta-o-problema/a01': 'Para investigar com segurança, descreva o sintoma e teste uma hipótese de cada vez. Na próxima aula, vamos ver como saber se funcionou mesmo.',
  'onde-esta-o-problema/a02': 'Confirmar que funcionou é comparar o resultado com o objetivo e registrar o que foi verificado. Se você salvou, seu critério de sucesso fica no Meu roteiro.',
};

/** Pergunta de cada grupo da montagem, as opções (2 a 5, uma por grupo escolhida) e a ponte de cada atividade. */
export interface GrupoAtividade {
  id: string;
  q: string;
  opcoes: string[];
}
export interface AtividadeEditorial {
  /** ponte no topo ("Você viu que X. Agora monte Y.") */
  intro: string;
  /** título do cartão "Na prática" quando não é o enunciado da prática (que o roteiro também diz como missão) */
  titulo?: string;
  /** molde com `{grupo}` */
  molde: string;
  grupos: GrupoAtividade[];
}
const G = (id: string, q: string, ...opcoes: string[]): GrupoAtividade => ({ id, q, opcoes });

export const ATIVIDADES: Record<string, AtividadeEditorial> = {
  'o-outro-so-e-diferente/a01': { intro: 'Você viu que perguntar é melhor do que supor. Agora monte uma pergunta que ofereça mais de um jeito de participar.', molde: 'Como você prefere contribuir: {forma1} ou {forma2}?', grupos: [G('forma1', 'Qual é a primeira forma de participar?', 'falando na reunião', 'falando comigo em particular', 'em um encontro curto antes da reunião'), G('forma2', 'Qual é a outra forma?', 'enviando por escrito depois', 'enviando por escrito antes', 'mandando um áudio')] },
  'o-outro-so-e-diferente/a02': { intro: 'Você viu que respeitar inclui ouvir o limite. Agora monte uma frase de apoio para quem pediu para parar.', molde: '{reconhece}. {apoio}?', grupos: [G('reconhece', 'Como você reconhece o pedido?', 'Você pediu para parar e isso deve ser respeitado', 'Seu limite importa e deve ser respeitado', 'Sinto muito que isso tenha acontecido'), G('apoio', 'Que apoio você oferece?', 'Quer apoio para procurar alguém de confiança', 'Quer que eu vá com você falar com alguém', 'Como posso ajudar agora')] },
  'ia-como-aliada/a01': { intro: 'Você viu que um bom pedido tem objetivo, contexto e formato. Agora monte o seu para uma tarefa fictícia.', molde: '{objetivo}. {contexto}. {formato}.', grupos: [G('objetivo', 'O que você precisa que a IA faça?', 'Organize uma lista de preparação para uma oficina fictícia', 'Escreva um aviso curto para uma reunião fictícia', 'Monte um roteiro simples para uma visita fictícia'), G('contexto', 'Que informações a IA pode usar?', 'Use apenas: sala confirmada, materiais a conferir e convite a enviar', 'Use apenas: horário e local confirmados', 'Use apenas os dados fictícios que informei'), G('formato', 'Em que formato quer a resposta?', 'Responda em até cinco etapas e indique o que falta confirmar', 'Responda em três frases curtas', 'Responda em uma lista e avise se faltar informação')] },
  'ia-como-aliada/a02': { intro: 'Você viu que a IA pode soar segura e errar. Agora monte um checklist de três verificações para usar antes de enviar.', molde: '{v1}; {v2}; {v3}.', grupos: [G('v1', 'Qual é a primeira verificação?', 'Conferir os fatos na fonte', 'Conferir nomes, números e datas', 'Comparar com as informações de origem'), G('v2', 'Qual é a segunda?', 'retirar informações inventadas', 'retirar o que ninguém confirmou', 'perguntar a quem sabe quando eu tiver dúvida'), G('v3', 'Qual é a terceira?', 'verificar se há dados que não podem ser compartilhados', 'trocar dados reais por dados fictícios', 'perguntar qual é a regra para uso de IA no meu trabalho')] },
  'parece-verdade-sera/a01': { intro: 'Você viu que um print não conta a história toda. Agora monte uma mensagem curta para verificar um aviso incompleto.', molde: 'Recebi {aviso}. {pergunta}?', grupos: [G('aviso', 'O que você recebeu?', 'um print sobre mudança de horário', 'um aviso sem data', 'uma mensagem sem dizer quem publicou'), G('pergunta', 'O que você pergunta?', 'Você pode confirmar se o aviso vale para nossa equipe e para qual data', 'A mudança está confirmada para a nossa equipe', 'Qual é o canal oficial onde esse aviso foi publicado')] },
  'parece-verdade-sera/a02': { intro: 'Você viu que várias publicações podem repetir uma só fonte. Agora monte uma sequência de três verificações antes de compartilhar.', molde: '{v1}; {v2}; {v3}.', grupos: [G('v1', 'O que você faz primeiro?', 'Localizar a publicação original', 'Procurar o canal oficial da organização', 'Ver quem publicou primeiro'), G('v2', 'O que você confere depois?', 'conferir data e público', 'conferir requisitos e prazo', 'conferir se o endereço do site é mesmo o da organização'), G('v3', 'Como você fecha a conferência?', 'confirmar o canal de inscrição pela organização', 'perguntar a quem é responsável', 'avisar que ainda não foi confirmado, se não achar')] },
  'seus-dados-tambem-trabalham/a01': { intro: 'Você viu que um print mostra mais do que o necessário. Agora liste o que tiraria de um print fictício antes de pedir ajuda.', molde: 'Retirar {a}, {b} e {c}. Manter apenas {d}.', grupos: [G('a', 'O que sai primeiro?', 'telefone do cliente', 'nome do cliente', 'e-mail de contato'), G('b', 'O que mais sai?', 'conversa pessoal', 'mensagens de outras pessoas', 'notificações abertas'), G('c', 'O que mais pode sair?', 'abas desnecessárias', 'dados de outros arquivos', 'a barra de favoritos'), G('d', 'O que você mantém?', 'a mensagem de erro', 'a parte da tela com o problema', 'o passo que mostra o erro')] },
  'seus-dados-tambem-trabalham/a02': { intro: 'Você viu que destinatário, conteúdo e acesso fazem parte do envio. Agora monte o seu checklist de envio.', molde: 'Conferir {a}; revisar {b}; verificar {c}.', grupos: [G('a', 'O que você confere sobre o destinatário?', 'quem recebe', 'se cada pessoa precisa mesmo receber', 'o nome de quem vai receber'), G('b', 'O que você revisa no conteúdo?', 'o conteúdo e os anexos', 'se há dados que não deveriam sair', 'se o arquivo é a versão certa'), G('c', 'O que você verifica no acesso?', 'quem consegue acessar o link', 'se o link só abre para quem precisa', 'se o acesso tem prazo')] },
  'tudo-e-urgente/a01': { intro: 'Você viu que urgência precisa de contexto. Agora escreva uma pergunta para entender o prazo e o uso de um pedido.', molde: '{prazo} e {uso}?', grupos: [G('prazo', 'O que você pergunta sobre o prazo?', 'Para quando você precisa', 'Até que horas isso precisa ficar pronto', 'Qual é o prazo desse pedido'), G('uso', 'O que você pergunta sobre o uso?', 'em qual atividade vai usar esta entrega', 'o que acontece se eu entregar mais tarde', 'quem vai usar esta entrega')] },
  'tudo-e-urgente/a02': { intro: 'Você viu que mostrar o que cabe no tempo ajuda a decidir. Agora monte uma mensagem com duas demandas e uma proposta de ordem.', molde: 'Tenho {demandas} e {capacidade}. {proposta}?', grupos: [G('demandas', 'O que chegou?', 'A e B para a mesma hora', 'duas entregas para o fim desta hora', 'dois pedidos com o mesmo prazo'), G('capacidade', 'O que cabe no seu tempo?', 'consigo concluir uma', 'só consigo fazer uma bem feita', 'tenho uma hora disponível'), G('proposta', 'O que você propõe?', 'Qual priorizamos e que prazo combinamos para a outra', 'Qual deve vir primeiro', 'Podemos combinar a ordem e um novo prazo para a outra')] },
  'travei-como-peco-ajuda/a01': { intro: 'Você viu que há ações que não se testam sozinho. Agora registre o sinal que indica a hora de parar e pedir apoio.', molde: 'Parar quando {risco} e {limite}.', grupos: [G('risco', 'Qual é o risco?', 'a ação pode apagar conteúdo da equipe', 'a ação pode expor dados de outras pessoas', 'a ação pode alterar algo importante'), G('limite', 'O que você não sabe?', 'não sei como desfazê-la', 'ninguém autorizou o teste', 'não tenho certeza do que ela faz')] },
  'travei-como-peco-ajuda/a02': { intro: 'Você viu que um bom pedido mostra onde você travou. Agora prepare o seu, com objetivo, dificuldade e uma pergunta específica.', molde: 'Preciso {objetivo}. {dificuldade}. {pergunta}?', grupos: [G('objetivo', 'O que você quer fazer?', 'exportar o relatório', 'enviar o arquivo à equipe', 'abrir o cadastro do cliente'), G('dificuldade', 'Onde você travou?', 'O erro aparece ao escolher o período', 'A tela trava ao salvar', 'A opção que eu preciso não aparece'), G('pergunta', 'O que você pergunta?', 'Pode me orientar sobre o próximo passo', 'Que passo devo verificar agora', 'Com quem eu confirmo isso')] },
  'errei-e-agora/a01': { intro: 'Você viu que avisar com fatos reduz o impacto. Agora monte um aviso de erro com fato, possível impacto e próximo passo.', molde: '{fato}. {impacto}. {passo}.', grupos: [G('fato', 'O que aconteceu?', 'Enviei a versão anterior do arquivo', 'Digitei um valor errado no orçamento do cliente', 'Mandei o arquivo para a pessoa errada'), G('impacto', 'Qual pode ser o impacto?', 'O cliente pode ter recebido uma informação errada', 'Ainda não sei o impacto e vou verificar', 'Isso pode atrapalhar quem já começou a usar'), G('passo', 'Qual é o próximo passo?', 'Vou avisar quem recebeu e mandar a correção', 'Vou avisar o gestor e propor a correção', 'Vou conferir quem já usou e te aviso em seguida')] },
  'errei-e-agora/a02': { intro: 'Você viu que uma mudança pequena ajuda a evitar o mesmo erro. Agora escolha a sua e diga como vai saber se funcionou.', molde: '{mudanca} e {verificacao}.', grupos: [G('mudanca', 'Qual mudança você escolhe?', 'Identificar a versão final com o padrão da equipe', 'Conferir o destinatário antes de enviar', 'Pedir uma segunda olhada em envios importantes'), G('verificacao', 'Como você verifica se funcionou?', 'conferir, nos próximos envios, se o erro voltou a acontecer', 'anotar quantos erros aparecem nas próximas semanas', 'perguntar à equipe, daqui a duas semanas, se a confusão diminuiu')] },
  'minha-ideia-tambem-conta/a01': { intro: 'Você viu que uma boa observação descreve o que acontece e o efeito. Agora descreva uma dificuldade fictícia, sem atacar ninguém.', molde: '{fato}. {efeito}.', grupos: [G('fato', 'O que você observou?', 'Três pessoas perguntaram onde está o formulário nesta semana', 'Duas pessoas ficaram sem acesso à pasta nesta semana', 'Vários pedidos chegaram incompletos nesta semana'), G('efeito', 'Qual foi o efeito?', 'Isso atrasou o início das solicitações', 'Isso fez a equipe repetir o trabalho', 'Isso gerou várias mensagens de dúvida')] },
  'minha-ideia-tambem-conta/a02': { intro: 'Você viu que um teste pequeno mostra se a ideia ajuda. Agora monte uma proposta com problema, teste e sinal de resultado.', molde: 'Para {problema}, podemos testar {teste} e observar {sinal}.', grupos: [G('problema', 'Qual problema você quer resolver?', 'as dúvidas de acesso ao formulário', 'o atraso nos pedidos', 'os erros no preenchimento'), G('teste', 'Qual teste pequeno você propõe?', 'um atalho autorizado por uma semana', 'um aviso fixo no canal da equipe por duas semanas', 'um modelo preenchido como exemplo'), G('sinal', 'O que você observa para saber se ajudou?', 'se o problema diminui nas próximas semanas', 'o que a equipe diz sobre o teste', 'quantas vezes o problema aparece')] },
  'discordar-sem-brigar/a01': { intro: 'Você viu que dá para discordar sem disputa. Agora escreva uma discordância com objetivo comum, preocupação e proposta.', molde: '{comum}. {preocupacao}. {proposta}?', grupos: [G('comum', 'Qual é o objetivo comum?', 'Também quero entregar hoje', 'Também quero que isso dê certo', 'Concordo que precisamos terminar logo'), G('preocupacao', 'Qual é a sua preocupação?', 'Este dado ainda não foi confirmado', 'Eu não tenho certeza deste número', 'Falta conferir uma informação importante'), G('proposta', 'Qual é a sua proposta?', 'Podemos verificar isso antes do envio', 'Podemos conferir juntos antes de seguir', 'Podemos confirmar com quem sabe antes de enviar')] },
  'discordar-sem-brigar/a02': { intro: 'Você viu que critério vem antes de defender o formato. Agora defina dois critérios e uma pergunta para sair de um impasse.', molde: 'Comparar {c1} e {c2}. Perguntar {pergunta}.', grupos: [G('c1', 'Qual é o primeiro critério?', 'clareza', 'prazo', 'custo'), G('c2', 'Qual é o segundo?', 'tempo de preparação', 'facilidade de leitura', 'uso esperado'), G('pergunta', 'O que você pergunta, e a quem?', 'ao destinatário qual formato atende melhor ao uso esperado', 'a quem vai usar qual formato é mais fácil de ler', 'a quem decide qual critério pesa mais')] },
  'nem-toda-brincadeira/a01': { intro: 'Você viu que reconhecer o pedido já muda a situação. Agora monte uma resposta breve que reconheça o limite sem se justificar.', molde: '{reconhece}. {compromisso}.', grupos: [G('reconhece', 'Como você reconhece o pedido?', 'Entendi seu pedido', 'Entendi que isso te incomodou', 'Obrigado por me avisar'), G('compromisso', 'O que você se compromete a fazer?', 'Não vou repetir o apelido', 'Não vou mais usar esse apelido', 'Vou parar com isso')] },
  'nem-toda-brincadeira/a02': { intro: 'Você viu que apoiar não é expor nem confrontar. Agora escolha, em um caso fictício, uma frase de acolhimento e uma forma de buscar apoio.', molde: '{acolhe}. {apoio}?', grupos: [G('acolhe', 'Como você acolhe?', 'Sinto muito que isso esteja acontecendo', 'Que bom que você me contou', 'Eu acredito em você'), G('apoio', 'Que apoio você oferece?', 'Como você quer que eu te apoie? Podemos procurar quem acompanha o seu trabalho', 'Como você quer que eu te apoie? Podemos procurar um adulto de confiança', 'Quer que eu te ajude a achar um canal seguro')] },
  'seu-ritmo-tambem-importa/a01': { intro: 'Você viu que colocar as demandas no papel ajuda a conversar. Agora organize três demandas fictícias por prazo, esforço e dependência.', molde: 'A: {a}. B: {b}. C: {c}.', grupos: [G('a', 'Como fica a tarefa A?', 'hoje, cerca de quarenta minutos, sem bloqueio', 'hoje, uma hora, depende de autorização', 'amanhã, trinta minutos, material disponível'), G('b', 'Como fica a tarefa B?', 'amanhã, uma hora, depende de autorização', 'sexta, duas horas, sem bloqueio', 'hoje, vinte minutos, material disponível'), G('c', 'Como fica a tarefa C?', 'sexta, trinta minutos, material disponível', 'amanhã, quarenta minutos, depende de outra pessoa', 'sexta, uma hora, sem bloqueio')] },
  'seu-ritmo-tambem-importa/a02': { intro: 'Você viu que pedir ajuste é mostrar a situação e uma alternativa. Agora prepare o seu pedido, com situação, impacto e alternativa.', molde: '{situacao}, e por isso {impacto}. {alternativa}. Podemos {pedido}?', grupos: [G('situacao', 'Qual é a situação?', 'A depende de autorização', 'A está esperando uma resposta', 'A precisa de material que ainda não chegou'), G('impacto', 'Qual é o impacto?', 'não consigo concluir no prazo', 'o prazo fica em risco', 'a entrega pode atrasar'), G('alternativa', 'Qual é a alternativa?', 'Enquanto isso posso avançar em B', 'Enquanto isso posso adiantar outra tarefa', 'Enquanto isso posso preparar o que for possível'), G('pedido', 'O que você pede?', 'confirmar essa ordem e rever o prazo de A', 'combinar uma nova ordem das tarefas', 'dividir a tarefa e rever o prazo')] },
  'aprender-faz-parte/a01': { intro: 'Você viu que escolher um foco ajuda mais do que melhorar em tudo. Agora escolha uma habilidade e um comportamento que dê para observar.', molde: 'Quero {acao} {detalhe}.', grupos: [G('acao', 'O que você quer fazer melhor?', 'enviar recados', 'responder mensagens', 'registrar tarefas'), G('detalhe', 'Como isso vai aparecer na prática?', 'que informem claramente o prazo esperado', 'com todas as informações importantes', 'sem deixar pendências escondidas')] },
  'aprender-faz-parte/a02': { intro: 'Você viu que uma prática pequena gera informação para o próximo ajuste. Agora monte um plano com habilidade, ação, apoio e revisão.', molde: 'Quero melhorar {habilidade}. {acao}. {apoio}. {revisao}.', grupos: [G('habilidade', 'O que você quer melhorar?', 'a clareza dos meus recados', 'a organização das minhas tarefas', 'a forma como peço ajuda'), G('acao', 'Qual é a sua ação?', 'Nos próximos três recados vou conferir o prazo', 'Nesta semana vou revisar cada mensagem antes de enviar', 'Por duas semanas vou anotar o que ficou confuso'), G('apoio', 'Que apoio você pede?', 'Vou pedir retorno à pessoa que recebe', 'Vou pedir uma opinião a alguém da equipe', 'Vou pedir um exemplo a quem faz bem'), G('revisao', 'Quando você revisa?', 'Depois vou revisar o que ainda ficou confuso', 'Daqui a duas semanas vou comparar com o começo', 'Na sexta vou ver o que funcionou')] },
  'por-onde-eu-comeco/a01': { intro: 'Você viu que entender o resultado vem antes de agir. Agora complete as quatro partes: o que precisa conseguir, o que já sabe, o que falta e o primeiro passo.', molde: 'Preciso {a}. Sei {b}. Faltam {c}. Vou {d}.', grupos: [G('a', 'O que você precisa conseguir?', 'organizar uma reunião viável', 'preparar os kits da oficina', 'entregar o relatório no prazo'), G('b', 'O que você já sabe?', 'que serão seis pessoas', 'a quantidade combinada', 'o que já foi confirmado'), G('c', 'O que falta descobrir?', 'duração e disponibilidade', 'o conteúdo e o prazo', 'o horário e o local'), G('d', 'Qual é o seu primeiro passo?', 'confirmar essas informações', 'perguntar a quem pediu', 'conferir o que falta antes de começar')] },
  'por-onde-eu-comeco/a02': { intro: 'Você viu que algumas etapas dependem de uma confirmação. Agora monte um plano de quatro etapas, da primeira à última.', titulo: 'Monte um plano de quatro etapas, da primeira à última', molde: '1) {e1}; 2) {e2}; 3) {e3}; 4) {e4}.', grupos: [G('e1', 'O que vem primeiro?', 'Confirmar o conteúdo do kit', 'Confirmar o prazo de entrega', 'Confirmar com quem pediu'), G('e2', 'E depois?', 'conferir estoque e quantidades', 'conferir o que já existe', 'contar os participantes'), G('e3', 'Em seguida?', 'separar materiais', 'montar cada kit', 'embalar os materiais'), G('e4', 'Para fechar?', 'verificar conteúdo e quantidade antes de entregar', 'comparar com o pedido antes de entregar', 'avisar o que faltou antes de entregar')] },
  'faz-sentido/a01': { intro: 'Você viu que um fato pode ter várias explicações. Agora separe uma observação fictícia de duas explicações possíveis.', molde: 'Observação: {obs}. Hipóteses: {h1} ou {h2}.', grupos: [G('obs', 'O que foi observado?', 'ainda não houve resposta', 'a resposta demorou mais que o esperado', 'a mensagem não teve retorno hoje'), G('h1', 'Qual é uma explicação possível?', 'a pessoa está em reunião', 'a pessoa não viu a mensagem', 'a pessoa está sem tempo'), G('h2', 'Qual é outra?', 'precisa verificar a informação', 'está esperando outra resposta', 'vai responder mais tarde')] },
  'faz-sentido/a02': { intro: 'Você viu que um caso só não explica tudo. Agora escreva uma conclusão provisória e duas informações para testá-la.', molde: 'Ainda não sabemos {a}. Vou verificar {b} e {c}.', grupos: [G('a', 'O que você ainda não sabe?', 'o motivo do atraso', 'a causa do erro', 'por que isso aconteceu'), G('b', 'O que você verifica primeiro?', 'quando a autorização chegou', 'o que mudou naquele dia', 'se outras entregas também atrasaram'), G('c', 'E o que mais?', 'se houve dificuldade no uso da ferramenta', 'se alguém precisava de treinamento', 'o que os registros mostram')] },
  'onde-esta-o-problema/a01': { intro: 'Você viu que investigar é testar uma hipótese de cada vez. Agora monte uma investigação com sintoma, hipótese e uma verificação segura.', molde: 'Sintoma: {s}. Hipótese: {h}. Verificação: {v}.', grupos: [G('s', 'Qual é o sintoma?', 'o formulário de teste não chegou', 'a mensagem de teste não apareceu', 'o pedido de teste não chegou ao setor'), G('h', 'Qual é a sua hipótese?', 'destino incorreto', 'falha no envio', 'configuração diferente'), G('v', 'Qual verificação segura você faz?', 'conferir o endereço configurado com quem tem acesso autorizado', 'enviar um novo teste com dados fictícios', 'pedir apoio a quem tem acesso e descrever o que observei')] },
  'onde-esta-o-problema/a02': { intro: 'Você viu que a mensagem de sucesso não basta. Agora defina um critério de sucesso e o que registraria depois de um teste.', molde: 'Sucesso: {c}. Registrar {r}, sem expor dados pessoais.', grupos: [G('c', 'Qual é o critério de sucesso?', 'um envio de teste chega ao destino esperado', 'a mensagem aparece no lugar certo', 'o pedido de teste chega ao setor'), G('r', 'O que você registra?', 'ambiente, alteração feita e resultado', 'o que foi testado e o que apareceu', 'o que mudou e o que ainda falta verificar')] },
};

/** Perguntas do pacote em 3ª pessoa passam para a 2ª (o aluno responde como ele agiria). */
export const PERGUNTA_VOCE: Record<string, string> = {
  'parece-verdade-sera/a01': 'O que você faz?',
  'minha-ideia-tambem-conta/a01': 'Como você apresenta a observação?',
  'discordar-sem-brigar/a01': 'Como você começa a conversa?',
  'aprender-faz-parte/a01': 'Como você transforma isso em um foco de aprendizagem?',
  'por-onde-eu-comeco/a01': 'O que você faz primeiro?',
  'onde-esta-o-problema/a02': 'Como você confirma a solução?',
};

/** Opções da decisão na ordem de exibição: a recomendada na posição `POSICAO_RECOMENDADA[n]`, as outras em volta. */
export type OpcaoOrdenada = Omit<OpcaoEditorial, 'q'> & { q: 'strong' | 'ok' | 'weak' };
export function opcoesEmOrdem(chave: string): OpcaoOrdenada[] {
  const n = Object.keys(DECISOES).indexOf(chave);
  const d = DECISOES[chave];
  if (n < 0 || !d) throw new Error(`decisão ${chave} sem ajustes editoriais`);
  const pos = POSICAO_RECOMENDADA[n]!;
  const lista: OpcaoOrdenada[] = d.outras.map((o) => ({ ...o, q: o.q ?? 'weak' }));
  lista.splice(pos, 0, { ...d.strong, q: 'strong' });
  return lista;
}
