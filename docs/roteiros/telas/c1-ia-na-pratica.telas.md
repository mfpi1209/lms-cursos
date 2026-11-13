# Telas simuladas — IA na prática para estudar e trabalhar

<!--
Conferidas contra a fala de cada cena (storyboard de `qa-telas.ts` + prévia com o tempo da legenda). Regras usadas:
- todo passo que importa leva `(na fala: "…")` com o trecho exato em que ele deve aparecer;
- o texto de `digita:` é o que a fala dita; não há `usuário:` repetindo o `digita:` (o digitado já vira o balão);
- quando a fala compara duas telas ("à esquerda… à direita…"), a seção usa `Modelo: comparar`;
- cada gravação da cena começa no passo cujo `(na fala: …)` abre o trecho dela.
-->

## gravacao_livros_pedido
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Onde a IA tropeça: fatos recentes, contas longas, citações e fontes (na fala: "Em fatos muito recentes")
- destaca: Citações e fontes: nome de livro, autor, artigo, lei, data. É aí que mora o perigo (na fala: "E principalmente em citações")
- digita: me indique três livros sobre gestão do tempo, com autor e ano de publicação (na fala: "me indique três livros")

## gravacao_livros_resposta
Modelo: chat
Aparelho: celular
App: Assistente de IA
- usuário: me indique três livros sobre gestão do tempo, com autor e ano de publicação (na fala: "Olha a resposta")
- mostra: 1. Tempo de Sobra | Helena Duarte, 2016 | Rotina em blocos de horário, com pausas. (na fala: "três títulos")
- mostra: 2. Foco no Essencial | Carlos Mendonça, 2014 | Poucas prioridades e não ao resto. (na fala: "autor, ano")
- mostra: 3. O Relógio Invisível | Paulo Arantes, 2018 | Hábitos de atenção e a pressa do tempo. (na fala: "até um resumo")
- destaca: Tudo muito seguro, muito bem escrito (na fala: "Tudo muito seguro")

## gravacao_busca_confere
Modelo: browser
Aparelho: celular
App: Buscador
- digita: Tempo de Sobra Helena Duarte (na fala: "Agora eu confiro cada um")
- mostra: Tempo de Sobra, Helena Duarte, 2016 | Livraria online: disponível em papel e digital (na fala: "busca comum")
- destaca: O primeiro existe (na fala: "O primeiro existe")
- digita: Foco no Essencial Carlos Mendonça (na fala: "O segundo existe")
- mostra: Foco no Essencial, Carlos Mendonça | Publicado em 2019, e não em 2014 (na fala: "mas o ano")
- destaca: O segundo existe, mas o ano está errado (na fala: "está errado")
- digita: O Relógio Invisível Paulo Arantes (na fala: "E o terceiro")
- mostra: Nenhum resultado encontrado | Sua busca por "O Relógio Invisível" não encontrou nenhum livro (na fala: "Não existe")
- destaca: O terceiro não existe: a IA inventou o livro, com autor e tudo (na fala: "A IA inventou")

## gravacao_pedido_vago
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Erro comum, de propósito: o pedido vago (na fala: "um erro comum")
- digita: me explica marketing (na fala: "me explica marketing")
- toca: Enviar (na fala: "Enviar")
- ia: Marketing é o conjunto de ações que uma empresa realiza para entender o mercado, criar valor para os clientes e comunicar esse valor, com o objetivo de vender e manter relacionamento ao longo do tempo. Envolve pesquisa, produto, preço, distribuição e divulgação. (na fala: "Olha o que voltou")
- destaca: Texto longo e correto, mas que serve para qualquer pessoa (na fala: "que serve para qualquer")
- destaca: Nenhum exemplo da minha vida (na fala: "Nenhum exemplo")
- destaca: A IA não sabe quem eu sou, para que eu quero, nem como eu quero a resposta (na fala: "Porque a IA não sabe")
- destaca: Sem pistas, ela vai no texto médio: serve para todo mundo e para ninguém (na fala: "Sem essas pistas")
- destaca: A solução é dar as pistas: quatro palavras que começam com P (na fala: "A solução é dar")

## gravacao_pedido_4p
Modelo: comparar
Aparelho: celular
App: Assistente de IA
Esquerda: Pedido vago
Direita: Pedido com os 4 P
- [esq] usuário: me explica marketing (na fala: "Agora eu refaço")
- [esq] ia: Marketing é o conjunto de ações que uma empresa realiza para entender o mercado, criar valor para os clientes e comunicar esse valor. (na fala: "Agora eu refaço")
- [dir] digita: Aja como um professor de marketing para iniciantes. Sou caloura de Administração e trabalho numa loja de roupa. Explique os quatro Ps do marketing com exemplos da minha loja. Responda em até dez linhas, com um exemplo por item. (na fala: "Aja como um professor")
- [dir] mostra: Os 4 P na sua loja | Produto: a coleção nova. | Preço: a promoção do mês. | Praça: a vitrine da loja. | Promoção: o post nas redes. (na fala: "Olha as duas respostas")
- [esq] destaca: À esquerda: o texto genérico (na fala: "À esquerda")
- [dir] destaca: À direita: cada P com um exemplo da loja (na fala: "À direita")
- [dir] destaca: Curto, claro, e eu entendo na hora (na fala: "Curto, claro")

## gravacao_explicacao_nivel
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: explique juros compostos como se eu tivesse quinze anos, com um exemplo do meu trabalho numa loja (na fala: "explique juros compostos")
- ia: Imagina que a loja cobra 10% de juros por mês numa compra parcelada de R$ 100. No primeiro mês, vira R$ 110. No segundo, os 10% incidem sobre os R$ 110: vira R$ 121. (na fala: "Repare que os quatro P")
- destaca: com um exemplo do meu trabalho numa loja (na fala: "o Pano de fundo")
- digita: não entendi a parte do juro sobre juro, explique de outro jeito (na fala: "não entendi a parte")
- ia: Pensa numa bola de neve: a cada volta ela junta neve nova e também a neve que já tinha. O juro do mês passado também passa a render juro. (na fala: "A IA não cansa")
- destaca: A IA não cansa, não julga e não acha a sua pergunta boba (na fala: "não julga")

## gravacao_analogia
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Segundo jeito: analogia com algo que você conhece bem (na fala: "Segundo jeito")
- digita: explique oferta e demanda usando uma loja de roupa em liquidação (na fala: "explique oferta e demanda")
- ia: Na liquidação, o preço cai e muita gente quer comprar: a demanda sobe. Mas o estoque é limitado: a oferta é pequena. Por isso as peças acabam rápido. (na fala: "em liquidação")
- destaca: Quando o assunto vira uma cena da sua vida, ele gruda (na fala: "Quando o assunto vira")
- destaca: Funciona em qualquer curso: o sistema circulatório como as linhas de ônibus da cidade (na fala: "Funciona em qualquer curso")

## gravacao_perguntas_uma_vez (V30)
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Terceiro jeito: perguntas uma por vez, com correção (na fala: "Terceiro jeito")
- digita: me faça cinco perguntas sobre juros compostos, uma de cada vez. Espere a minha resposta, corrija e explique o erro antes de passar para a próxima (na fala: "me faça cinco perguntas")
- ia: Pergunta 1 de 5: quanto viram R$ 100 a 10% ao mês em dois meses? (na fala: "Repare no")
- destaca: uma de cada vez (na fala: "uma de cada vez")
- destaca: Todas juntas, com as respostas: a tentação de olhar é grande demais (na fala: "se as cinco vierem")

## gravacao_perguntas_uma_vez (V31)
Modelo: chat
Aparelho: celular
App: Assistente de IA
- ia: Pergunta 1 de 5: se você aplica R$ 100 a 10% ao mês, quanto terá depois de dois meses? (na fala: "Olha o que acontece")
- usuário: R$ 120, porque são 10% duas vezes (na fala: "eu respondo")
- ia: Quase! Você acertou que são dois meses de 10%, mas o segundo juro incide sobre R$ 110. O certo é R$ 121. (na fala: "e ela diz")
- destaca: Aqui quem pensa sou eu. A IA só faz o papel de professora particular (na fala: "Aqui quem pensa")

## gravacao_flashcards_simulado (V31)
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Quarto jeito: flashcards, com a pergunta de um lado e a resposta do outro (na fala: "Quarto jeito")
- digita: crie dez flashcards sobre juros compostos, em tabela, com pergunta e resposta curtas (na fala: "crie dez flashcards")
- mostra: Flashcards | 1. O que são juros compostos? Juros sobre o capital mais os juros já acumulados. | 2. Qual a fórmula do montante? M = C x (1 + i) elevado a n. | 3. E os juros simples? Só sobre o capital inicial. (na fala: "Depois, revise")
- destaca: Revise um por um: a IA pode errar um cartão, e corrigir já é estudar (na fala: "A IA pode errar")

## gravacao_flashcards_simulado (V32)
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Quinto jeito: simulado no formato da prova (na fala: "Quinto jeito")
- digita: monte cinco questões de múltipla escolha sobre este conteúdo, com quatro alternativas, e só me mostre o gabarito quando eu pedir (na fala: "monte cinco questões")
- mostra: Questão 1 de 5 | Aplicando R$ 100 a 10% ao mês em juros compostos, o montante após 2 meses é: | A) R$ 110 | B) R$ 120 | C) R$ 121 | D) R$ 130 (na fala: "Você treina")
- destaca: Você treina do jeito que vai ser cobrado (na fala: "do jeito que vai ser cobrado")
- destaca: Dica para os cinco jeitos: escreva os tópicos da disciplina e peça para a IA ficar neles (na fala: "Uma dica que vale")
- destaca: Assim ela trabalha no conteúdo que você precisa, e não num assunto parecido (na fala: "Assim ela trabalha")
- destaca: Apareceu algo que você nunca viu no material? Desconfie e pergunte ao tutor (na fala: "E se ela trouxer")

## gravacao_resumo_copiado
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Erro comum, de propósito (na fala: "o erro comum")
- digita: faça um resumo sobre juros compostos para o fórum da disciplina (na fala: "faça um resumo")
- ia: Juros compostos são aqueles calculados sobre o capital inicial e também sobre os juros acumulados de períodos anteriores, o que gera crescimento exponencial do montante ao longo do tempo. (na fala: "A IA entrega")
- toca: Copiar (na fala: "Eu copio")
- toca: Enviar no fórum (na fala: "e envio")
- destaca: Tarefa feita? São três problemas (na fala: "Feita mesmo")
- destaca: 1. Eu não aprendi nada: se o tutor perguntar, eu travo (na fala: "eu não aprendi nada")
- destaca: 2. Entregar como meu um texto que eu não escrevi é plágio (na fala: "Dois")
- destaca: 3. Se a IA errou alguma coisa, agora o erro tem o meu nome (na fala: "Três")

## gravacao_refaz_perguntas
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: me faça perguntas sobre juros compostos, uma por vez (na fala: "Fazendo do jeito certo")
- ia: Pergunta 1: por que, nos juros compostos, o valor cresce cada vez mais rápido? (na fala: "me fazer perguntas")
- usuário: Porque o juro de cada mês também rende juro (na fala: "respondo")
- ia: Isso mesmo! Você explicou o ponto central. (na fala: "e ela corrige")
- mostra: Meu texto para o fórum | Escrito por mim, com as minhas palavras (na fala: "escrevo o meu texto")
- digita: aponte o que ficou confuso no meu texto, sem reescrever por mim (na fala: "peço para a IA apontar")
- destaca: Dá mais trabalho, mas é esse trabalho que faz você aprender (na fala: "Dá mais trabalho")

## gravacao_email_pedido
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Tarefa um: e-mail pedindo mais prazo para um relatório (na fala: "Tarefa um")
- destaca: O pedido com os quatro P (na fala: "O pedido com os quatro")
- digita: Aja como um assistente administrativo experiente. Trabalho no setor de compras e não vou conseguir entregar o relatório mensal na sexta, porque faltam dados de um fornecedor. Escreva um e-mail para a minha supervisora pedindo até terça. Tom profissional e cordial, no máximo seis linhas. (na fala: "aja como um assistente")

## gravacao_email_resposta
Modelo: notes
Aparelho: celular
App: E-mail
- mostra: Assunto: Pedido de prazo (na fala: "Olha a resposta")
- mostra: Olá, Marta, | Não consigo entregar o relatório mensal na sexta: ainda faltam dados de um fornecedor. | Posso entregar até terça-feira. | Agradeço a compreensão. | Atenciosamente, Bia (na fala: "Olha a resposta")
- destaca: Assunto: Pedido de prazo (na fala: "assunto")
- destaca: Olá, Marta (na fala: "saudação")
- destaca: ainda faltam dados de um fornecedor (na fala: "o motivo explicado")
- destaca: até terça-feira (na fala: "a nova data")
- destaca: Agradeço a compreensão (na fala: "um fechamento educado")
- destaca: Eu leio, troco o que não tem o meu jeito e confiro nome, data e relatório (na fala: "Agora eu leio")
- destaca: Ficou formal demais? Peça na mesma conversa (na fala: "Ficou formal demais")
- digita: deixe mais simples e direto, do jeito que se fala num escritório pequeno (na fala: "deixe mais simples")

## gravacao_anotacoes
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Reunião de equipe | reun. seg 9h | decid: trocar fornecedor X | Marina liga p/ cliente qta | R. envia orçam. sex | prazo ?? | J. ajusta estoque (na fala: "Tarefa três")
- destaca: Anotações bagunçadas, cheias de abreviação, escritas correndo (na fala: "anotações bagunçadas")
- destaca: A IA organiza. Mas, antes de colar, tem um passo obrigatório (na fala: "A IA organiza")
- destaca: Troque os nomes por iniciais ou por cargos (na fala: "Troque os nomes")
- destaca: Apague dado pessoal: CPF, telefone, endereço, dado de cliente (na fala: "apague qualquer dado")
- mostra: Em vez de | a Marina vai ligar para o cliente (na fala: "Em vez de")
- mostra: Escreva | M. vai ligar para o cliente (na fala: "escreva")
- destaca: A IA não precisa saber quem é quem para organizar (na fala: "não precisa saber")

## gravacao_resumo_reuniao
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: organize estas anotações de reunião em três partes: decisões tomadas, quem faz o quê, e prazos. Use tópicos curtos. Se alguma coisa não estiver clara, marque com um ponto de interrogação em vez de inventar. (na fala: "organize estas anotações")
- mostra: Resumo da reunião | Decisões: trocar o fornecedor X. | Quem faz o quê: M. liga para o cliente; R. envia o orçamento; J. ajusta o estoque. | Prazos: orçamento até sexta; ligação na quarta (?). (na fala: "Pronto")
- destaca: Antes de mandar: confira as decisões e troque as iniciais de volta pelos nomes (na fala: "depois de você conferir")

## gravacao_formula_pedido
Modelo: chat
Aparelho: computador
App: Assistente de IA
- destaca: Planilha: descreva o que quer e peça a fórmula (na fala: "Tarefa quatro")
- digita: Tenho uma planilha com o nome da vendedora na coluna A e o total vendido na coluna B. Quero que a coluna C mostre "bateu" se a venda passou de cinco mil reais, e "não bateu" se não passou. Me dê a fórmula e explique cada parte. (na fala: "Tenho uma planilha")
- mostra: Fórmula sugerida | =SE(B2>5000; "bateu"; "não bateu") (na fala: "A IA sugere")
- ia: Primeiro vem a condição: B2>5000 (o total passou de cinco mil?). (na fala: "primeiro vem a condição")
- ia: Depois, o que aparece se for verdade: "bateu". (na fala: "depois o que aparece")
- ia: E, por fim, o que aparece se for falso: "não bateu". (na fala: "e depois o que aparece")
- destaca: Pedir a explicação é o que faz você aprender, e não só copiar (na fala: "Pedir a explicação")

## gravacao_formula_teste
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Vendedora (na fala: "Agora, o mais importante")
- célula: B1 = Total vendido (na fala: "o mais importante")
- célula: C1 = Resultado (na fala: "teste antes de confiar")
- destaca: Teste antes de confiar: três linhas cujo resultado você já sabe (na fala: "Coloque três linhas")
- célula: A2 = Teste 1 (na fala: "uma venda de")
- célula: B2 = 6000 (na fala: "seis mil")
- célula: C2 = =SE(B2>5000; "bateu"; "não bateu")
- célula: A3 = Teste 2 (na fala: "uma de três")
- célula: B3 = 3000 (na fala: "três mil")
- célula: C3 = =SE(B3>5000; "bateu"; "não bateu")
- célula: A4 = Teste 3 (na fala: "e uma de")
- célula: B4 = 5000 (na fala: "cinco mil")
- célula: C4 = =SE(B4>5000; "bateu"; "não bateu")
- destaca: Deu errado? Conte para a IA o que aconteceu e peça a correção (na fala: "Se alguma der errado")
- destaca: O mesmo vale para o PROCV: busca uma informação em outra tabela, como o preço pelo código (na fala: "O mesmo vale")
- destaca: Um detalhe: a fórmula usa ponto e vírgula ou vírgula, conforme o programa e o idioma (na fala: "Um detalhe")
- destaca: Se der erro, diga para a IA qual programa você usa (na fala: "Se der erro")

## gravacao_roteiro_slides
Modelo: chat
Aparelho: computador
App: Assistente de IA
- destaca: Tarefa cinco: roteiro de apresentação (na fala: "Tarefa cinco")
- digita: Aja como um professor de oratória. Vou apresentar para a minha equipe os resultados de vendas do mês, em cinco minutos. Monte um roteiro de cinco slides, com título, três tópicos curtos por slide e o que eu devo falar em cada um. (na fala: "aja como um professor")
- mostra: Slide 1: Resultados de vendas do mês | Abertura e objetivo | Período analisado | Fala: cumprimente e diga o que vai mostrar (na fala: "A IA te dá")
- mostra: Slide 2: Números principais | Total vendido: [seu número] | Comparação com o mês anterior: [seu número] | Fala: destaque o número mais importante (na fala: "o esqueleto")
- destaca: Os números reais, que só você tem, você coloca e confere (na fala: "Os números reais")
- destaca: Na faculdade: a IA organiza, mas o conteúdo e as palavras são seus (na fala: "E se a apresentação")

## gravacao_email_sem_ler
Modelo: notes
Aparelho: celular
App: E-mail
- destaca: Erro comum: enviar sem ler (na fala: "o erro comum")
- mostra: Assunto: Atualização do projeto (na fala: "Eu peço um e-mail")
- mostra: Prezado [nome do gestor], | Segue a atualização do projeto desta semana. | Atenciosamente, | [seu nome] (na fala: "copio a resposta")
- toca: Enviar (na fala: "envio sem ler")
- destaca: [nome do gestor] (na fala: "Prezado")
- destaca: [seu nome] (na fala: "Atenciosamente")
- destaca: A IA deixa esses espaços para você preencher (na fala: "A IA deixa")
- destaca: Se você não lê, eles vão do jeito que estão: quem recebe percebe na hora (na fala: "Se você não lê")

## gravacao_imagem_pedidos
Modelo: chat
Aparelho: celular
App: Gerador de imagens
- destaca: Primeiro, o erro comum (na fala: "o erro comum")
- digita: uma imagem de loja (na fala: "uma imagem de loja")
- mostra: Imagem gerada | Uma loja qualquer, num estilo qualquer (na fala: "Olha o resultado")
- destaca: Não combina com nada que eu precise (na fala: "que não combina")
- destaca: Agora com os quatro P adaptados para imagem: Papel, Pano de fundo, Pedido e Padrão (na fala: "Agora com os quatro")
- digita: Você é um ilustrador. É para o cartaz de uma loja de roupa de bairro, divulgando a troca de estação. Uma ilustração de uma vitrine com casacos e cachecóis. Desenho simples, cores quentes, formato vertical, sem texto na imagem. (na fala: "você é um ilustrador")

## gravacao_imagem_boa
Modelo: chat
Aparelho: celular
App: Gerador de imagens
- mostra: Imagem gerada | Vitrine com casacos e cachecóis | Desenho simples, cores quentes, formato vertical, sem texto na imagem (na fala: "Bem melhor")
- destaca: sem texto na imagem (na fala: "sem texto na imagem")
- destaca: Os geradores muitas vezes erram as letras (na fala: "os geradores")
- destaca: O texto do cartaz você coloca depois, num editor de imagem simples (na fala: "Então o texto")
- digita: deixe as cores um pouco mais claras e o casaco vermelho em destaque (na fala: "E se não gostou")
- destaca: Onde fazer? Algumas ferramentas geram imagem na versão gratuita, às vezes com limite de uso (na fala: "Onde fazer")
- destaca: Se a sua não gerar, use outra: o método dos quatro P é o mesmo (na fala: "Se a sua não gerar")

## gravacao_voz_clonada
Modelo: browser
Aparelho: celular
App: Gerador de voz
- mostra: Voz clonada | Criada a partir de uma gravação curta, com autorização da dona da voz (na fala: "E a voz")
- toca: Ouvir exemplo (na fala: "Ouça este exemplo")
- destaca: Aviso: voz sintética, usada com autorização (na fala: "com o aviso")
- destaca: Fica muito parecida. Agora imagine isso nas mãos de um golpista (na fala: "Fica muito parecida")
- destaca: Por isso este exemplo foi feito com autorização e com aviso (na fala: "Por isso este exemplo")
- destaca: A próxima situação pode acontecer com qualquer família (na fala: "a próxima situação")

## gravacao_config_privacidade
Modelo: settings
Aparelho: celular
App: Configurações
- destaca: Suas conversas treinam a IA? Dá para escolher (na fala: "Muitas ferramentas")
- toca: Privacidade e controle de dados (na fala: "procure a parte")
- destaca: Usar minhas conversas para melhorar o modelo (na fala: "uma opção sobre usar")
- desliga: Usar minhas conversas para melhorar o modelo (na fala: "Desligar ajuda")
- destaca: Desligar ajuda, mas não é uma capa de invisibilidade (na fala: "não é uma capa")
- destaca: A empresa ainda pode guardar a conversa por um tempo (na fala: "A empresa ainda pode")
- destaca: A regra continua: dado sensível não entra, com a opção ligada ou desligada (na fala: "a regra continua")
- mostra: Cuide da conta | Senha forte, só sua | Não deixe a conversa aberta num computador compartilhado (na fala: "E cuide da conta")

## gravacao_prompt_papel_fundo
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Meu prompt-mestre (na fala: "Vamos montar ao vivo")
- mostra: Papel | Aja como meu tutor de estudos, paciente e direto, que explica com exemplos simples e me faz pensar antes de dar a resposta. (na fala: "Papel")
- mostra: Pano de fundo | Sou aluna de Administração a distância, trabalho durante o dia e estudo à noite pelo celular, uns quarenta minutos por dia. (na fala: "Pano de fundo")
- destaca: Repare: nada de nome, CPF ou dado pessoal. Só o que o tutor precisa saber (na fala: "Repare")

## gravacao_prompt_pedido_regras (V81)
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Pedido | Explicar o conteúdo no meu nível, me fazer perguntas uma por vez e corrigir, montar planos de estudo e gerar flashcards. (na fala: "Pedido")
- mostra: Padrão | Respostas curtas, que caibam na tela do celular, sempre com um exemplo do meu dia a dia. (na fala: "Padrão")

## gravacao_prompt_pedido_regras (V82)
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Regras (na fala: "E as regras")
- mostra: | Se não souber ou não tiver certeza, diga. (na fala: "Se não souber")
- mostra: | Avise quando eu devo conferir uma informação. (na fala: "Avise quando")
- mostra: | Não faça as minhas atividades avaliadas: me ajude a entender, mas quem escreve sou eu. (na fala: "não faça as minhas")
- destaca: Guarde num bloco de notas e cole no começo de cada sessão de estudo, com o tema do dia (na fala: "Guarde esse texto")
- destaca: Sua ferramenta tem instruções fixas ou personalização? Também pode colocar lá (na fala: "Se a sua ferramenta")
- destaca: Teste agora: peça para explicar um tema que você já conhece bem (na fala: "E teste agora")
- destaca: Veio longa ou difícil? Ajuste o Padrão no próprio prompt (na fala: "Se a resposta vier")

## gravacao_plano
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: O plano de quatro semanas, com o prompt-mestre colado (na fala: "o plano de quatro semanas")
- digita: monte um plano de estudo de quatro semanas para esta disciplina, com estes tópicos, considerando quarenta minutos por noite, de segunda a sexta. Em tabela. (na fala: "monte um plano de estudo")
- mostra: Plano de 4 semanas | Semana 1: conceitos básicos | Semana 2: exercícios guiados | Semana 3: revisão com flashcards | Semana 4: simulado e correção (na fala: "A IA propõe")
- digita: na quarta eu chego mais tarde e domingo tem almoço de família: mude os dias e deixe folga (na fala: "Ela não sabe")
- destaca: Um plano que cabe na sua vida vale mais do que um plano perfeito que você abandona (na fala: "Um plano que cabe")

## gravacao_flashcards_sem_conferir
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Um último erro comum, de propósito: colar sem ler (na fala: "Um último erro")
- digita: crie vinte flashcards sobre juros compostos para a missão (na fala: "Eu peço os vinte")
- mostra: Flashcard 7 | Pergunta: nos juros compostos, sobre o que incide o juro de cada período? | Resposta: apenas sobre o capital inicial (na fala: "Olha este cartão")
- destaca: Resposta: apenas sobre o capital inicial (na fala: "a resposta está errada")
- destaca: Corrigindo: eu confiro no material e escrevo a resposta certa (na fala: "Corrigindo")
- mostra: Corrigido | Resposta: sobre o capital inicial mais os juros já acumulados (na fala: "marco a correção")
- destaca: A missão pede pelo menos duas correções marcadas (na fala: "A missão pede")
