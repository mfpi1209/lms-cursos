/**
 * Planos (cortes da fala) que a revisão pré-gravação fixou à mão (docs/novos-cursos/revisao-pre-gravacao.md, seção 5), por cena.
 * O importador agrupa as frases em planos sozinho (até 26 palavras); aqui o corte é o do revisor: um plano para a missão, um plano
 * novo para apresentar o caso, etc. Chave: `<slug>/<aula>/<cena>`. `linhas` = todos os planos na ordem (o último é a chamada,
 * quando a cena leva uma; `{apresentacao}` = a frase "Oi! Eu sou …, … neste curso da DNA Work." da abertura do curso); `chips` = índice (a partir de 0) do plano que leva as pílulas. A soma das linhas tem de ser a fala da
 * cena (o importador confere e para se não for): mudou o texto da fala em final.ts/editorial.ts, atualize aqui também.
 */
export interface PlanosDaCena {
  linhas: string[];
  chips?: number;
}

export const PLANOS: Record<string, PlanosDaCena> = {
  'o-outro-so-e-diferente/aula_02/v03': {
    linhas: [
      'Agora, vamos falar de limites. Respeitar alguém não significa concordar com tudo. Uma preferência pessoal pode ser diferente da sua.',
      'No fim desta aula, tem uma missão para você: escreva um convite que a pessoa possa recusar sem se explicar.',
      'A equipe almoça junta toda sexta. O Murilo nunca vai e come em outro lugar.',
      'Um colega começa a brincar que ele se acha melhor que todo mundo. Agora, responda: o que você faz?',
    ],
  },
  'discordar-sem-brigar/aula_01/v02': {
    linhas: [
      'Quando a crítica vem para você, peça um exemplo. Quando é você quem discorda, fale da proposta, do dado ou do efeito esperado.',
      'Evite adivinhar intenções. Uma pergunta concreta pode abrir espaço para informação que você ainda não tem. Discordar também inclui ouvir uma explicação nova.',
      'O Cauê quer enviar um material hoje, mas percebeu que falta confirmar uma informação importante.',
      'O colega que cuida do envio está com pressa. Agora, responda: no lugar do Cauê, o que você faz?',
    ],
    chips: 1,
  },
  'seus-dados-tambem-trabalham/aula_01/v01': {
    linhas: [
      '{apresentacao} Hoje, vamos ver o que um print mostra sem querer e o que conferir antes de enviar um arquivo ou link.',
      'Às vezes você quer mostrar um erro na tela e acaba mostrando muito mais.',
      'Antes de capturar e enviar, observe nomes, contatos, abas abertas e informações que não são necessárias para resolver a dúvida.',
      'No fim desta aula, tem uma missão para você: liste o que removeria de um print fictício antes de pedir ajuda.',
      'Você vai mandar um print para pedir ajuda.',
      'Ao fundo aparecem telefone de um cliente e uma conversa pessoal. Agora, responda: qual é a melhor preparação?',
    ],
  },
  'seus-dados-tambem-trabalham/aula_02/v03': {
    linhas: [
      'Agora, vamos falar do envio. Um arquivo correto enviado para a pessoa errada ainda pode causar um problema.',
      'No fim desta aula, tem uma missão para você: monte um checklist de envio, com destinatário, conteúdo e acesso.',
      'Você precisa compartilhar uma planilha interna.',
      'O link está configurado para qualquer pessoa com o link. Agora, responda: como você continua?',
    ],
  },
  'seus-dados-tambem-trabalham/aula_02/v04': {
    linhas: [
      'Confira destinatário, arquivo e permissão antes de enviar.',
      'Se o nome do arquivo está certo, mas o link abre para qualquer pessoa, o problema continua: permissão também faz parte do envio.',
      'E quando o envio já saiu errado? Veja o que aconteceu com o Wesley.',
      'O Wesley enviou uma planilha interna para o grupo errado e percebeu logo depois. Agora, responda: no lugar do Wesley, o que você faz?',
    ],
    chips: 1,
  },
  'parece-verdade-sera/aula_02/v04': {
    linhas: [
      'Abra o canal conhecido da organização por um caminho confiável.',
      'Confira se o endereço do site é mesmo o da organização e não entregue dados só porque a mensagem parece urgente. Se não conseguir verificar, não apresente como certeza. Dizer ‘não consegui confirmar’ também é uma resposta responsável.',
      'O Kelvin viu em vários perfis uma vaga de jovem aprendiz.',
      'O site indicado pede um pagamento pequeno para liberar a vaga. Agora, responda: no lugar do Kelvin, o que você faz?',
    ],
    chips: 1,
  },
  'ia-como-aliada/aula_02/v04': {
    linhas: [
      'Compare a saída com a fonte, confira nomes, números e condições.',
      'A IA também não precisa de tudo o que está na sua tela para ajudar. Usar IA com critério inclui saber o que não entra no pedido, e quando não usar.',
      'O Samuel vai pedir à IA um resumo de uma planilha da equipe.',
      'Ela tem nomes e telefones de clientes. Agora, responda: no lugar do Samuel, o que você faz?',
    ],
    chips: 1,
  },
  'tudo-e-urgente/aula_02/v04': {
    linhas: [
      'Separe o que precisa ser feito, o que depende de outra pessoa e o tempo disponível.',
      'Estimativas podem mudar, então apresente como estimativa, não como promessa.',
      'Depois de listar as tarefas, você identifica que uma depende de uma autorização ainda pendente. Agora, responda: qual mensagem ajuda?',
    ],
    chips: 1,
  },
  'tudo-e-urgente/aula_02/v05': {
    linhas: [
      'Confirme o que foi combinado e quando será revisto.',
      'Se a pessoa não puder decidir, pergunte quem pode ajudar. O objetivo é que o trabalho caiba no tempo, respeitando os combinados e o que é de cada função.',
    ],
    chips: 1,
  },
  'errei-e-agora/aula_01/v02': {
    linhas: [
      'Descreva fatos: o que foi enviado, quem recebeu e o que pode estar incorreto.',
      'Se não souber o impacto, diga que ainda precisa verificar. Evite prometer que está tudo resolvido antes de confirmar.',
      'E se alguém reagir com irritação? O gestor da Gisele ficou irritado ao saber do erro no orçamento e disse que ela deveria ter conferido.',
      'A Gisele sabe que não conferiu. Agora, responda: no lugar da Gisele, o que você responde?',
    ],
    chips: 1,
  },
  'aprender-faz-parte/aula_01/v01': {
    linhas: [
      '{apresentacao} Hoje, vamos reconhecer o que você já faz sozinho e aprender uma tarefa nova observando quem já faz.',
      'No começo, muita coisa é nova ao mesmo tempo. Depois de algumas semanas, algumas tarefas já saem com menos ajuda. Perceber esse avanço também é aprender.',
      'No fim desta aula, tem uma missão para você: registre algo que você já faz com mais autonomia e o que quer aprender a seguir.',
      'Há um mês a Valentina começou como aprendiz. Hoje ela abre sozinha o cadastro dos clientes, mas ainda pede ajuda na conferência final.',
      'Na conversa de acompanhamento, ela precisa dizer como está indo. Agora, responda: no lugar da Valentina, o que você diz?',
    ],
  },
  'por-onde-eu-comeco/aula_02/v04': {
    linhas: [
      'Pergunte: do que esta etapa depende?',
      'Confirmar o conteúdo vem antes de separar. Conferir o estoque vem antes de pedir reposição. No final, compare o resultado com o pedido: conteúdo e quantidade estão corretos?',
      'Se faltar algo, ajuste antes da entrega.',
      'Veja o caso do Yuri: ele tem quatro etapas para organizar um evento.',
      'Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado. Agora, responda: no lugar do Yuri, o que você faz?',
    ],
    chips: 1,
  },
  'faz-sentido/aula_02/v04': {
    linhas: [
      'O atraso pode ter outras causas: faltou informação, treinamento ou autorização.',
      'Compare o que mudou e procure registros disponíveis. Uma conclusão provisória pode ser: ‘Ainda não sabemos a causa’. Isso orienta uma investigação sem culpar alguém antes da hora.',
      'O Jonas viu que, nos dois dias de chuva da semana, a loja vendeu menos.',
      'Um colega diz que chuva sempre derruba as vendas. Agora, responda: no lugar do Jonas, o que você faz?',
    ],
    chips: 1,
  },
  'onde-esta-o-problema/aula_02/v04': {
    linhas: [
      'Registre o sintoma e teste uma hipótese de cada vez.',
      'Se não tiver acesso ou autorização, peça apoio e descreva o que observou. Não use dados reais para experimentar nem mexa no sistema que a equipe usa de verdade só para descobrir o que acontece.',
      'A Débora sabe que o formulário de teste não chegou.',
      'Ela já conferiu o endereço de destino, que está certo. Agora, responda: no lugar da Débora, o que você faz?',
    ],
    chips: 1,
  },
  'nem-toda-brincadeira/aula_03/v04': {
    linhas: [
      'Agora, vamos falar de como apoiar quem foi alvo.',
      'No fim desta aula, tem uma missão para você: escolha, em um caso fictício, uma frase de acolhimento e uma forma de buscar apoio.',
      'Uma colega da sua equipe virou alvo de piadas sobre o jeito dela de falar.',
      'Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança. Agora, responda: o que você pode fazer?',
    ],
  },
  'nem-toda-brincadeira/aula_03/v05': {
    linhas: [
      'Não prometa sigilo que o canal não garante nem uma solução imediata.',
      'Se você é menor de idade, também pode procurar um adulto de confiança, na escola ou no trabalho. Não precisa relatar uma experiência pessoal para fazer a atividade.',
      'A Letícia ouviu colegas rirem de uma foto que alguém postou do Ravi.',
      'Ele estava no corredor e ouviu também. Agora, responda: no lugar da Letícia, o que você faz?',
    ],
    chips: 1,
  },
};
