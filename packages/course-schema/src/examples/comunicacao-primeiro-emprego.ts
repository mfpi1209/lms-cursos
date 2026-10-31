import { richTextFromPlain as p } from '../richtext';
import { CourseDocumentSchema, type CourseDocument } from '../course';
import type { LessonGraph } from '../graph';

/**
 * Curso seed: "Comunicação no primeiro emprego".
 * Conteúdo manual revisável, sem IA. Duas aulas curtas com dinâmicas distintas:
 *  1. "Negociar um prazo" — começa com decisão.
 *  2. "Corrigir uma informação enviada errada" — começa com análise de um exemplo.
 */

const negociarPrazo: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'decisao_prazo',
  variables: [{ name: 'confianca', type: 'number', initial: 0, label: 'Confiança do gestor' }],
  nodes: [
    {
      id: 'decisao_prazo', type: 'choice', title: 'O pedido da gestora', objectiveIds: ['obj_negociar_prazo'], required: true,
      prompt: p(`É sua segunda semana no estágio. Às 16h, Renata, sua gestora, passa pela sua mesa: "Preciso da planilha de fornecedores atualizada até amanhã às 9h, pode ser?"

Você olha a planilha: são 140 linhas, metade com dados faltando que dependem de outro setor. Você sabe que não dá para terminar hoje com qualidade.

O que você faz?`),
      options: [
        { id: 'aceita', label: 'Dizer "pode deixar" e tentar virar a noite.', feedback: p('Aceitar sem avisar protege o momento, mas transfere o problema para amanhã de manhã — quando será pior.') },
        { id: 'recusa', label: 'Dizer "não vai dar" e explicar que o outro setor não mandou os dados.', feedback: p('Você foi honesto, mas deixou Renata sem saída. Quem recebe um "não" sem alternativa precisa resolver sozinho.') },
        { id: 'negocia', label: 'Mostrar o que falta e propor: parte hoje, o restante assim que o outro setor responder.', feedback: p('Você deu visibilidade do problema e uma alternativa concreta. É isso que torna um prazo negociável.') },
      ],
    },
    {
      id: 'cons_aceita', type: 'consequence', title: 'Manhã seguinte', tone: 'negative', objectiveIds: [], required: true,
      body: p(`Você entrega às 9h10 uma planilha com 70 linhas preenchidas e 70 marcadas como "pendente". Renata abre, franze a testa: "Por que você não me avisou ontem? Eu teria pedido os dados para o Compras."

Ela não está brava com a planilha incompleta. Está brava por ter sido surpreendida.`),
      guidance: p('Quem recebe uma notícia ruim cedo pode agir. Quem recebe tarde só pode reclamar.'),
      effects: [{ op: 'inc', var: 'confianca', by: -1 }],
    },
    {
      id: 'cons_recusa', type: 'consequence', title: 'A conversa trava', tone: 'neutral', objectiveIds: [], required: true,
      body: p(`Renata responde: "Tá, mas e aí? O diretor vai me cobrar isso às 9h." Fica um silêncio. Ela vai até o Compras pessoalmente, consegue os dados e termina a planilha ela mesma, às 20h.

No dia seguinte ela comenta com um colega: "O estagiário é sincero, mas eu tive que resolver tudo."`),
      guidance: p('Apontar o obstáculo é metade do caminho. A outra metade é oferecer o que você consegue fazer apesar dele.'),
      effects: [{ op: 'set', var: 'confianca', value: 0 }],
    },
    {
      id: 'cons_negocia', type: 'consequence', title: 'Acordo fechado', tone: 'positive', objectiveIds: [], required: true,
      body: p(`Renata olha a lista do que falta: "Entendi. Manda o que tiver até as 9h e me copia no e-mail para o Compras pedindo o resto." Você envia o pedido ao Compras às 16h20, copiando Renata.

Às 9h a planilha vai com 70 linhas completas, as pendentes sinalizadas e a previsão de conclusão. O diretor recebe um status claro em vez de uma desculpa.`),
      guidance: p('Prazo negociado cedo, com o que falta explicitado e uma proposta concreta, vira um plano — não um problema.'),
      effects: [{ op: 'inc', var: 'confianca', by: 1 }],
    },
    {
      id: 'conteudo_negociar', type: 'content', title: 'Como negociar um prazo', objectiveIds: ['obj_negociar_prazo'], required: true,
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Quatro passos que funcionam' }] },
          { type: 'orderedList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Avise cedo. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Quanto antes o gestor souber, mais opções ele tem.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mostre o que falta. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Fatos concretos ("70 linhas dependem do Compras"), não impressões ("é muita coisa").' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Proponha uma alternativa. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Uma entrega parcial, uma data realista ou uma ajuda específica.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Registre o combinado. ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'Uma mensagem curta confirmando o novo prazo evita mal-entendidos.' }] }] },
          ] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Negociar prazo não é pedir favor. É dar ao gestor a informação que ele precisa para decidir.' }] },
        ],
      },
    },
    {
      id: 'decisao_urgencia', type: 'choice', title: 'Nova demanda no meio do caminho', objectiveIds: ['obj_negociar_prazo', 'obj_comunicar_limites'], required: true,
      prompt: p(`Uma semana depois. Você está terminando um relatório que Renata pediu para sexta. Na quarta à tarde, Carlos, de outro setor, aparece: "Me ajuda a montar uma apresentação pra amanhã? É rapidinho, umas 3 horas."

Se você aceitar, o relatório de Renata atrasa. O que você diz a Carlos?`),
      options: [
        { id: 'aceita_tudo', label: '"Claro, deixa comigo" — e tenta dar conta dos dois.', feedback: p('Você agradou Carlos na hora, mas assumiu um compromisso que afeta outro já combinado — sem avisar quem combinou.') },
        { id: 'manda_gestora', label: '"Posso ajudar, mas preciso checar com a Renata, porque tenho uma entrega pra sexta. Te respondo em 15 minutos."', feedback: p('Você não disse não, mas também não comprometeu o que já estava combinado. Quem decide prioridades entre setores é o gestor.') },
        { id: 'recusa_seco', label: '"Não posso, estou cheio de coisa."', feedback: p('Direto, mas fecha a porta. Carlos não sabe se é falta de vontade ou conflito real de prioridades.') },
      ],
    },
    {
      id: 'cons_aceita_tudo', type: 'consequence', title: 'Dois pratos, uma mão', tone: 'negative', objectiveIds: [], required: true,
      body: p('Quinta de manhã a apresentação de Carlos sai com erros de última hora. Sexta o relatório de Renata chega incompleto. Dois gestores insatisfeitos, e nenhum sabia que você estava sobrecarregado.'),
      guidance: p('Dizer sim a tudo parece colaboração, mas sem combinar prioridades vira risco para os dois lados.'),
      effects: [{ op: 'inc', var: 'confianca', by: -1 }],
    },
    {
      id: 'cons_manda_gestora', type: 'consequence', title: 'Prioridade combinada', tone: 'positive', objectiveIds: [], required: true,
      body: p('Renata responde em cinco minutos: "Ajuda o Carlos por 2 horas e me entrega o relatório sexta às 14h em vez de 9h." Você avisa Carlos, ajuda no essencial e entrega o relatório no novo horário. Ninguém foi surpreendido.'),
      guidance: p('Levar o conflito de prioridades para quem decide é sinal de maturidade, não de insegurança.'),
      effects: [{ op: 'inc', var: 'confianca', by: 1 }],
    },
    {
      id: 'cons_recusa_seco', type: 'consequence', title: 'Porta fechada', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Carlos resolve com outra pessoa. O relatório de Renata sai no prazo. Mas na próxima vez que você precisar de algo do setor dele, a resposta demora. Limites são importantes — a forma de comunicá-los também.'),
      guidance: p('Um "não" com contexto ("tenho entrega sexta, posso ajudar depois?") preserva a relação.'),
    },
    {
      id: 'reflexao_prazo', type: 'reflection', title: 'Sua situação', objectiveIds: ['obj_negociar_prazo'], required: true, minLength: 40, maxLength: 1200,
      prompt: p('Pense em uma situação sua (escola, trabalho, casa) em que você aceitou um prazo que sabia ser impossível. O que você diria hoje, usando os quatro passos?'),
      placeholder: 'Descreva a situação e como você negociaria o prazo…',
    },
    {
      id: 'avaliacao_prazo', type: 'assessment', title: 'Verificação', objectiveIds: ['obj_negociar_prazo'], required: true, mode: 'single', maxAttempts: 2,
      passing: { kind: 'all_correct' },
      prompt: p('Seu gestor pede uma tarefa para amanhã. Você percebe que depende de dados que ainda não chegaram. Qual é a melhor primeira ação?'),
      options: [
        { id: 'a', label: 'Começar e avisar só se não conseguir terminar.', correct: false, feedback: p('Avisar depois tira do gestor a chance de agir.') },
        { id: 'b', label: 'Avisar agora o que falta e propor uma entrega parcial com previsão para o resto.', correct: true },
        { id: 'c', label: 'Pedir para outra pessoa assumir a tarefa.', correct: false },
        { id: 'd', label: 'Entregar o que der e não comentar o que faltou.', correct: false },
      ],
      feedbackPassed: p('Exato: aviso cedo + fato concreto + alternativa.'),
      feedbackFailed: p('Releia os quatro passos: o aviso precisa vir antes do prazo, com o que falta e uma proposta.'),
    },
    {
      id: 'fim_prazo', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você praticou negociar prazos em duas situações diferentes. Na próxima aula, você vai lidar com um erro que já foi enviado — e aprender a corrigir sem perder credibilidade.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    { id: 'e1', from: 'decisao_prazo', to: 'cons_aceita', optionId: 'aceita' },
    { id: 'e2', from: 'decisao_prazo', to: 'cons_recusa', optionId: 'recusa' },
    { id: 'e3', from: 'decisao_prazo', to: 'cons_negocia', optionId: 'negocia' },
    { id: 'e4', from: 'cons_aceita', to: 'conteudo_negociar' },
    { id: 'e5', from: 'cons_recusa', to: 'conteudo_negociar' },
    { id: 'e6', from: 'cons_negocia', to: 'conteudo_negociar' },
    { id: 'e7', from: 'conteudo_negociar', to: 'decisao_urgencia' },
    { id: 'e8', from: 'decisao_urgencia', to: 'cons_aceita_tudo', optionId: 'aceita_tudo' },
    { id: 'e9', from: 'decisao_urgencia', to: 'cons_manda_gestora', optionId: 'manda_gestora' },
    { id: 'e10', from: 'decisao_urgencia', to: 'cons_recusa_seco', optionId: 'recusa_seco' },
    { id: 'e11', from: 'cons_aceita_tudo', to: 'reflexao_prazo' },
    { id: 'e12', from: 'cons_manda_gestora', to: 'reflexao_prazo' },
    { id: 'e13', from: 'cons_recusa_seco', to: 'reflexao_prazo' },
    { id: 'e14', from: 'reflexao_prazo', to: 'avaliacao_prazo' },
    { id: 'e15', from: 'avaliacao_prazo', to: 'fim_prazo' },
  ],
  layout: { positions: {
    decisao_prazo: { x: 0, y: 0 }, cons_aceita: { x: -320, y: 180 }, cons_recusa: { x: 0, y: 180 }, cons_negocia: { x: 320, y: 180 },
    conteudo_negociar: { x: 0, y: 360 }, decisao_urgencia: { x: 0, y: 540 }, cons_aceita_tudo: { x: -320, y: 720 }, cons_manda_gestora: { x: 0, y: 720 },
    cons_recusa_seco: { x: 320, y: 720 }, reflexao_prazo: { x: 0, y: 900 }, avaliacao_prazo: { x: 0, y: 1080 }, fim_prazo: { x: 0, y: 1260 },
  } },
};

const corrigirInformacao: LessonGraph = {
  schemaVersion: 1,
  startNodeId: 'exemplo_mensagem',
  variables: [],
  nodes: [
    {
      id: 'exemplo_mensagem', type: 'content', title: 'Analise este caso', objectiveIds: ['obj_corrigir_erro'], required: true,
      body: p(`Antes de decidir, leia uma situação real (nomes alterados).

Júlia, assistente comercial, enviou na terça um e-mail ao cliente Mercado Boa Vista com o orçamento de 30 caixas a R$ 42,00 cada. Na quarta ela percebe: o preço certo era R$ 48,00. O cliente já respondeu "fechado, pode faturar".

Na quinta, Júlia manda: "Oi, desculpa, teve um errinho aí no valor, o certo é 48. Abraço."

O cliente responde furioso: "Vocês fecharam um preço e agora mudam? Vou cancelar."`),
    },
    {
      id: 'analise_problema', type: 'choice', title: 'O que deu errado?', objectiveIds: ['obj_corrigir_erro'], required: true,
      prompt: p('Na sua leitura, qual foi o principal problema na forma como Júlia corrigiu o erro?'),
      options: [
        { id: 'demorou', label: 'Ela demorou dois dias para avisar e minimizou ("errinho") sem explicar nem oferecer solução.', feedback: p('É isso. O atraso deixou o cliente planejar com o valor errado, e a mensagem curta e informal pareceu descaso.') },
        { id: 'nao_devia', label: 'Ela não devia ter avisado: o preço fechado tinha que ser mantido.', feedback: p('Manter um preço errado pode custar caro à empresa e ao próprio cargo de Júlia. O erro precisa ser corrigido — a questão é como.') },
        { id: 'so_tom', label: 'O único problema foi o tom informal ("Abraço").', feedback: p('O tom pesou, mas o problema maior foi o conteúdo: sem explicação, sem pedido de desculpas claro e sem alternativa para o cliente.') },
      ],
    },
    {
      id: 'cons_demorou', type: 'consequence', title: 'Diagnóstico certo', tone: 'positive', objectiveIds: [], required: true,
      body: p('Você identificou os três ingredientes que faltaram: rapidez, clareza e uma saída para quem foi afetado. Agora você vai colocá-los em prática.'),
    },
    {
      id: 'cons_nao_devia', type: 'consequence', title: 'Esconder não resolve', tone: 'negative', objectiveIds: [], required: true,
      body: p('Imagine que Júlia faturasse a R$ 42,00 sem avisar ninguém. A diferença de R$ 180,00 apareceria no fechamento do mês, e a pergunta seria "por que ninguém avisou?". Erro escondido vira erro dobrado.'),
      guidance: p('Corrigir rápido custa menos do que explicar depois por que não corrigiu.'),
    },
    {
      id: 'cons_so_tom', type: 'consequence', title: 'Mais que o tom', tone: 'neutral', objectiveIds: [], required: true,
      body: p('Se Júlia tivesse escrito a mesma mensagem com "Atenciosamente" no fim, o cliente continuaria sem entender o que aconteceu nem o que pode fazer. A forma importa, mas o conteúdo decide.'),
      guidance: p('Uma correção precisa dizer: o que estava errado, o que é o certo, por que aconteceu e o que você propõe.'),
    },
    {
      id: 'situacao_voce', type: 'scenario', title: 'Agora é com você', objectiveIds: [], required: true,
      body: p(`Você trabalha no atendimento de uma loja de materiais de construção. Ontem você confirmou por WhatsApp a um cliente que a entrega dos pisos seria sexta-feira. Hoje de manhã o estoque avisa: o lote só chega na terça da semana que vem.

O cliente já contratou o pedreiro para sábado.`),
    },
    {
      id: 'decisao_correcao', type: 'choice', title: 'Como corrigir?', objectiveIds: ['obj_corrigir_erro', 'obj_transparencia'], required: true,
      prompt: p('O que você faz agora?'),
      options: [
        { id: 'espera', label: 'Esperar até sexta para ver se o lote chega antes; se não chegar, avisar na hora.', feedback: p('Esperar transfere o risco para o cliente, que vai descobrir no pior momento possível — com o pedreiro na porta.') },
        { id: 'avisa_chefe', label: 'Avisar seu supervisor e deixar que ele fale com o cliente, já que o erro foi do estoque.', feedback: p('Envolver o supervisor é correto, mas quem combinou com o cliente foi você. Passar a bola sem falar com ele soa como fuga.') },
        { id: 'corrige_claro', label: 'Ligar agora para o cliente: explicar o que mudou, pedir desculpas, oferecer alternativas (entrega parcial ou reagendar o pedreiro) e avisar o supervisor.', feedback: p('Você assumiu a comunicação, deu tempo ao cliente para reorganizar e manteve o supervisor informado.') },
      ],
    },
    {
      id: 'cons_espera', type: 'consequence', title: 'Sábado de manhã', tone: 'negative', objectiveIds: [], required: true,
      body: p('O lote não chegou. Sábado às 8h o cliente liga com o pedreiro ao lado. Além do atraso, ele pagou uma diária à toa. Ele exige desconto e avisa que vai reclamar na internet. O supervisor pergunta por que você não avisou na quinta.'),
      guidance: p('Notícia ruim não melhora com o tempo. Ela só perde a chance de ser resolvida.'),
    },
    {
      id: 'cons_avisa_chefe', type: 'consequence', title: 'Ligação fria', tone: 'neutral', objectiveIds: [], required: true,
      body: p('O supervisor liga para o cliente, mas não sabe os detalhes do que foi combinado. O cliente pergunta "e o atendente que me prometeu sexta?". O problema se resolve, mas você perdeu a chance de mostrar que assume o que combina.'),
      guidance: p('Avisar o supervisor é parte da solução — mas a correção com o cliente começa por quem fez o combinado.'),
    },
    {
      id: 'cons_corrige_claro', type: 'consequence', title: 'Problema resolvido na quinta', tone: 'positive', objectiveIds: [], required: true,
      body: p('O cliente não gosta da notícia, mas agradece o aviso: consegue remarcar o pedreiro para quarta e aceita receber parte do material sexta. O supervisor, já informado, aprova um frete grátis como compensação. O cliente volta a comprar no mês seguinte.'),
      guidance: p('Corrigir bem um erro pode gerar mais confiança do que nunca ter errado.'),
    },
    {
      id: 'avaliacao_correcao', type: 'assessment', title: 'O que uma correção precisa ter', objectiveIds: ['obj_corrigir_erro'], required: true, mode: 'multiple', maxAttempts: 2,
      passing: { kind: 'all_correct' },
      prompt: p('Marque todos os elementos que uma mensagem de correção precisa conter:'),
      options: [
        { id: 'o_que', label: 'O que estava errado e qual é a informação correta.', correct: true },
        { id: 'culpado', label: 'O nome de quem causou o erro.', correct: false, feedback: p('Apontar culpados não ajuda o cliente e soa como fuga de responsabilidade.') },
        { id: 'alternativa', label: 'O que você propõe para reduzir o impacto.', correct: true },
        { id: 'minimizar', label: 'Uma frase dizendo que "não foi nada demais".', correct: false, feedback: p('Minimizar o erro desrespeita quem foi afetado.') },
        { id: 'desculpas', label: 'Um pedido de desculpas direto.', correct: true },
      ],
      feedbackPassed: p('Correto: o que mudou, desculpas diretas e uma proposta. Sem culpados, sem minimizar.'),
      feedbackFailed: p('Revise: uma correção tem o que mudou, desculpas e uma proposta. Não aponta culpados nem minimiza.'),
    },
    {
      id: 'reflexao_mensagem', type: 'reflection', title: 'Escreva a correção', objectiveIds: ['obj_corrigir_erro', 'obj_transparencia'], required: true, minLength: 80, maxLength: 1500,
      prompt: p('Escreva a mensagem de WhatsApp que você enviaria ao cliente dos pisos. Inclua: o que mudou, um pedido de desculpas e ao menos uma alternativa.'),
      placeholder: 'Olá, [nome]. Preciso corrigir uma informação que passei ontem…',
    },
    {
      id: 'fim_correcao', type: 'end', title: 'Encerramento', objectiveIds: [], required: true,
      summary: p('Você analisou um erro de correção, decidiu como agir em uma situação real e escreveu sua própria mensagem. Esses três movimentos — analisar, decidir, produzir — são o que você vai repetir no trabalho.'),
      outcomeLabel: 'Aula concluída',
    },
  ],
  edges: [
    { id: 'c1', from: 'exemplo_mensagem', to: 'analise_problema' },
    { id: 'c2', from: 'analise_problema', to: 'cons_demorou', optionId: 'demorou' },
    { id: 'c3', from: 'analise_problema', to: 'cons_nao_devia', optionId: 'nao_devia' },
    { id: 'c4', from: 'analise_problema', to: 'cons_so_tom', optionId: 'so_tom' },
    { id: 'c5', from: 'cons_demorou', to: 'situacao_voce' },
    { id: 'c6', from: 'cons_nao_devia', to: 'situacao_voce' },
    { id: 'c7', from: 'cons_so_tom', to: 'situacao_voce' },
    { id: 'c8', from: 'situacao_voce', to: 'decisao_correcao' },
    { id: 'c9', from: 'decisao_correcao', to: 'cons_espera', optionId: 'espera' },
    { id: 'c10', from: 'decisao_correcao', to: 'cons_avisa_chefe', optionId: 'avisa_chefe' },
    { id: 'c11', from: 'decisao_correcao', to: 'cons_corrige_claro', optionId: 'corrige_claro' },
    { id: 'c12', from: 'cons_espera', to: 'avaliacao_correcao' },
    { id: 'c13', from: 'cons_avisa_chefe', to: 'avaliacao_correcao' },
    { id: 'c14', from: 'cons_corrige_claro', to: 'avaliacao_correcao' },
    { id: 'c15', from: 'avaliacao_correcao', to: 'reflexao_mensagem' },
    { id: 'c16', from: 'reflexao_mensagem', to: 'fim_correcao' },
  ],
  layout: { positions: {
    exemplo_mensagem: { x: 0, y: 0 }, analise_problema: { x: 0, y: 180 }, cons_demorou: { x: -320, y: 360 }, cons_nao_devia: { x: 0, y: 360 }, cons_so_tom: { x: 320, y: 360 },
    situacao_voce: { x: 0, y: 540 }, decisao_correcao: { x: 0, y: 720 }, cons_espera: { x: -320, y: 900 }, cons_avisa_chefe: { x: 0, y: 900 }, cons_corrige_claro: { x: 320, y: 900 },
    avaliacao_correcao: { x: 0, y: 1080 }, reflexao_mensagem: { x: 0, y: 1260 }, fim_correcao: { x: 0, y: 1440 },
  } },
};

export const comunicacaoPrimeiroEmprego: CourseDocument = CourseDocumentSchema.parse({
  schemaVersion: 1,
  title: 'Comunicação no primeiro emprego',
  description: 'Duas situações comuns nas primeiras semanas de trabalho: negociar um prazo que não fecha e corrigir uma informação que você já enviou errada.',
  brief: {
    audience: 'Jovens e adultos em início de vida profissional (estágio, primeiro emprego, aprendiz).',
    context: 'Comunicação com gestores, colegas de outros setores e clientes, por conversa, e-mail e WhatsApp.',
    prerequisites: 'Nenhum.',
    finalSkill: 'Comunicar um problema (prazo inviável ou informação errada) cedo, com fatos e uma proposta, preservando a relação de confiança.',
    sourcesNote: 'Conteúdo autoral baseado em situações de trabalho recorrentes; sem fontes externas que exijam validação.',
  },
  objectives: [
    { id: 'obj_negociar_prazo', title: 'Negociar um prazo inviável com fatos e uma proposta', criterion: 'Escolhe avisar cedo e propor alternativa; acerta a verificação sobre primeira ação.', required: true },
    { id: 'obj_comunicar_limites', title: 'Comunicar limites sem fechar portas', criterion: 'Em conflito de prioridades, envolve quem decide em vez de aceitar ou recusar sozinho.', required: false },
    { id: 'obj_corrigir_erro', title: 'Corrigir uma informação errada de forma rápida e clara', criterion: 'Identifica os elementos de uma boa correção e escreve uma mensagem contendo o que mudou, desculpas e alternativa.', required: true },
    { id: 'obj_transparencia', title: 'Assumir a comunicação de um erro próprio', criterion: 'Escolhe falar diretamente com quem foi afetado e manter o gestor informado.', required: true },
  ],
  modules: [
    {
      id: 'mod_1', title: 'Situações do dia a dia', description: 'Duas aulas curtas, cada uma com uma dinâmica diferente.',
      lessons: [
        { id: 'aula_negociar_prazo', title: 'Negociar um prazo', description: 'Começa com uma decisão sob pressão e termina com uma verificação.', estimatedMinutes: 12, family: 'decision_consequence', objectiveIds: ['obj_negociar_prazo', 'obj_comunicar_limites'], graph: negociarPrazo },
        { id: 'aula_corrigir_informacao', title: 'Corrigir uma informação enviada errada', description: 'Começa analisando um exemplo real, depois pede uma decisão e uma produção.', estimatedMinutes: 15, family: 'production_review', objectiveIds: ['obj_corrigir_erro', 'obj_transparencia'], graph: corrigirInformacao },
      ],
    },
  ],
  completion: { requiredLessonIds: ['aula_negociar_prazo', 'aula_corrigir_informacao'] },
});
