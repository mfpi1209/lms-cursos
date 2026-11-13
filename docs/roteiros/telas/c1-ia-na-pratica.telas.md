# Telas simuladas — IA na prática para estudar e trabalhar

## gravacao_livros_pedido
Modelo: chat
Aparelho: celular
App: Assistente de IA
- destaca: Fatos recentes, contas longas, citações e fontes: aqui a IA tropeça
- digita: me indique três livros sobre gestão do tempo, com autor e ano de publicação (peso 3)
- usuário: me indique três livros sobre gestão do tempo, com autor e ano de publicação
- ia: Claro! Separei três títulos sobre gestão do tempo. Já vou listar com autor e ano. (peso 2)

## gravacao_livros_resposta
Modelo: chat
Aparelho: celular
App: Assistente de IA
- ia: Aqui estão três livros sobre gestão do tempo, com autor e ano de publicação.
- mostra: 1. Tempo de Sobra | Helena Duarte, 2016 | Como organizar a rotina com blocos de horário e pausas planejadas. (peso 2)
- mostra: 2. Foco no Essencial | Carlos Mendonça, 2014 | Um método para escolher poucas prioridades e dizer não ao resto. (peso 2)
- mostra: 3. O Relógio Invisível | Paulo Arantes, 2018 | Um estudo sobre hábitos de atenção e como o tempo parece passar mais rápido. (peso 2)
- destaca: Tudo muito seguro e bem escrito, com autor, ano e resumo

## gravacao_busca_confere
Modelo: browser
Aparelho: celular
App: Buscador
- digita: "Tempo de Sobra" Helena Duarte livro
- mostra: Resultado da busca | Tempo de Sobra, Helena Duarte, 2016 | Livraria online: disponível em papel e digital (peso 2)
- destaca: O primeiro existe
- digita: "Foco no Essencial" Carlos Mendonça livro
- mostra: Resultado da busca | Foco no Essencial, Carlos Mendonça | Publicado em 2019, e não em 2014 (peso 2)
- destaca: Existe, mas o ano está errado
- digita: "O Relógio Invisível" Paulo Arantes livro
- mostra: Resultado da busca | Nenhum resultado encontrado para "O Relógio Invisível" Paulo Arantes (peso 2)
- destaca: O terceiro não existe: a IA inventou o livro, com autor e tudo (peso 2)

## gravacao_pedido_vago
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: me explica marketing (peso 2)
- usuário: me explica marketing
- ia: Marketing é o conjunto de ações que uma empresa realiza para entender o mercado, criar valor para os clientes e comunicar esse valor, com o objetivo de vender e manter relacionamento ao longo do tempo. Envolve pesquisa, produto, preço, distribuição e divulgação. (peso 3)
- mostra: Resposta longa | Define marketing | Lista conceitos gerais | Serve para qualquer pessoa
- destaca: Texto correto, mas genérico: nenhum exemplo da minha vida (peso 2)
- destaca: Sem pistas, a IA vai no texto médio, que serve para todo mundo e para ninguém

## gravacao_pedido_4p
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: Aja como um professor de marketing para iniciantes. Sou caloura de Administração e trabalho numa loja de roupa. Explique os quatro Ps do marketing com exemplos da minha loja. Responda em até dez linhas, com um exemplo por item. (peso 4)
- usuário: Aja como um professor de marketing para iniciantes. Sou caloura de Administração e trabalho numa loja de roupa. Explique os quatro Ps do marketing com exemplos da minha loja. Responda em até dez linhas, com um exemplo por item.
- mostra: Resposta com os 4 P | Produto: a coleção nova que chegou esta semana. | Preço: a promoção de fim de mês nas camisetas. | Praça: a vitrine e o ponto da loja, onde o cliente encontra você. | Promoção: o post nas redes e o cartaz na porta. (peso 4)
- destaca: Papel, pano de fundo, pedido e padrão: curto, claro, com exemplos da loja (peso 2)

## gravacao_explicacao_nivel
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: explique juros compostos como se eu tivesse quinze anos, com um exemplo do meu trabalho numa loja (peso 2)
- usuário: explique juros compostos como se eu tivesse quinze anos, com um exemplo do meu trabalho numa loja
- ia: Imagina que a loja cobra 10% de juros por mês numa compra parcelada de R$ 100. No primeiro mês, vira R$ 110. No segundo, os 10% incidem sobre os R$ 110, e não sobre os R$ 100: vira R$ 121. (peso 3)
- digita: não entendi a parte do juro sobre juro, explique de outro jeito (peso 2)
- usuário: não entendi a parte do juro sobre juro, explique de outro jeito
- ia: Pensa numa bola de neve: ela cresce e, a cada volta, junta neve nova e também a neve que já tinha juntado. O juro do mês passado também passa a render juro. (peso 2)
- destaca: A IA não cansa, não julga e não acha a pergunta boba

## gravacao_analogia
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: explique oferta e demanda usando uma loja de roupa em liquidação (peso 2)
- usuário: explique oferta e demanda usando uma loja de roupa em liquidação
- ia: Na liquidação, o preço cai e muita gente quer comprar: a demanda sobe. Mas o estoque é limitado: a oferta é pequena. Quando todo mundo quer e sobra pouco, as peças acabam rápido. (peso 3)
- destaca: Quando o assunto vira uma cena da sua vida, ele gruda
- digita: me faça cinco perguntas sobre juros compostos, uma de cada vez. Espere a minha resposta, corrija e explique o erro antes de passar para a próxima (peso 3)
- usuário: me faça cinco perguntas sobre juros compostos, uma de cada vez. Espere a minha resposta, corrija e explique o erro antes de passar para a próxima
- ia: Pergunta 1 de 5: se você aplica R$ 100 a 10% ao mês, quanto terá depois de dois meses?

## gravacao_perguntas_uma_vez
Modelo: chat
Aparelho: celular
App: Assistente de IA
- ia: Pergunta 1 de 5: se você aplica R$ 100 a 10% ao mês, quanto terá depois de dois meses?
- usuário: R$ 120, porque são 10% duas vezes
- ia: Quase! Você acertou que são dois meses de 10%, mas o segundo juro incide sobre R$ 110. O certo é R$ 121. Faltou o juro sobre juro. (peso 3)
- destaca: Ela pergunta, eu respondo com as minhas palavras, e ela diz o que acertei e o que faltou (peso 2)
- ia: Pergunta 2 de 5: qual a diferença entre juros simples e juros compostos?
- destaca: Quem pensa sou eu. A IA faz o papel de professora particular

## gravacao_perguntas_uma_vez
Modelo: chat
Aparelho: celular
App: Assistente de IA
- ia: Pergunta 1 de 5: se você aplica R$ 100 a 10% ao mês, quanto terá depois de dois meses?
- usuário: R$ 120, porque são 10% duas vezes
- ia: Quase! Você acertou que são dois meses de 10%, mas o segundo juro incide sobre R$ 110. O certo é R$ 121. Faltou o juro sobre juro. (peso 3)
- destaca: Ela pergunta, eu respondo com as minhas palavras, e ela diz o que acertei e o que faltou (peso 2)
- ia: Pergunta 2 de 5: qual a diferença entre juros simples e juros compostos?
- destaca: Quem pensa sou eu. A IA faz o papel de professora particular

## gravacao_flashcards_simulado
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: crie dez flashcards sobre juros compostos, em tabela, com pergunta e resposta curtas (peso 2)
- usuário: crie dez flashcards sobre juros compostos, em tabela, com pergunta e resposta curtas
- mostra: Flashcards | 1. O que são juros compostos? Juros calculados sobre o capital mais os juros já acumulados. | 2. Qual a fórmula do montante? M = C x (1 + i) elevado a n. | 3. Em que juros compostos diferem dos simples? No composto, o juro rende juro. (peso 3)
- destaca: Revise um por um: se a IA errar um cartão, corrigir já é estudar
- digita: monte cinco questões de múltipla escolha sobre este conteúdo, com quatro alternativas, e só me mostre o gabarito quando eu pedir (peso 3)
- usuário: monte cinco questões de múltipla escolha sobre este conteúdo, com quatro alternativas, e só me mostre o gabarito quando eu pedir
- mostra: Questão 1 de 5 | Aplicando R$ 100 a 10% ao mês em juros compostos, o montante após 2 meses é: | A) R$ 110 | B) R$ 120 | C) R$ 121 | D) R$ 130 (peso 3)
- destaca: Gabarito só no fim, no formato da prova

## gravacao_flashcards_simulado
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: crie dez flashcards sobre juros compostos, em tabela, com pergunta e resposta curtas (peso 2)
- usuário: crie dez flashcards sobre juros compostos, em tabela, com pergunta e resposta curtas
- mostra: Flashcards | 1. O que são juros compostos? Juros calculados sobre o capital mais os juros já acumulados. | 2. Qual a fórmula do montante? M = C x (1 + i) elevado a n. | 3. Em que juros compostos diferem dos simples? No composto, o juro rende juro. (peso 3)
- destaca: Revise um por um: se a IA errar um cartão, corrigir já é estudar
- digita: monte cinco questões de múltipla escolha sobre este conteúdo, com quatro alternativas, e só me mostre o gabarito quando eu pedir (peso 3)
- usuário: monte cinco questões de múltipla escolha sobre este conteúdo, com quatro alternativas, e só me mostre o gabarito quando eu pedir
- mostra: Questão 1 de 5 | Aplicando R$ 100 a 10% ao mês em juros compostos, o montante após 2 meses é: | A) R$ 110 | B) R$ 120 | C) R$ 121 | D) R$ 130 (peso 3)
- destaca: Gabarito só no fim, no formato da prova

## gravacao_resumo_copiado
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: faça um resumo sobre juros compostos para o fórum da disciplina (peso 2)
- usuário: faça um resumo sobre juros compostos para o fórum da disciplina
- ia: Juros compostos são aqueles calculados sobre o capital inicial e também sobre os juros acumulados de períodos anteriores, o que gera crescimento exponencial do montante ao longo do tempo. (peso 2)
- toca: Copiar
- toca: Enviar no fórum (peso 2)
- destaca: Erro 1: não aprendi nada. Erro 2: entregar texto que eu não escrevi é plágio (peso 2)
- destaca: Erro 3: se a IA errou, o erro agora tem o meu nome (peso 2)

## gravacao_refaz_perguntas
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: me faça perguntas sobre juros compostos, uma por vez, e corrija as minhas respostas (peso 2)
- usuário: me faça perguntas sobre juros compostos, uma por vez, e corrija as minhas respostas
- ia: Pergunta 1: por que, nos juros compostos, o valor cresce cada vez mais rápido?
- usuário: Porque o juro de cada mês é calculado também em cima dos juros que já ganhei
- ia: Isso mesmo! Você explicou o ponto central. Se quiser, acrescente um exemplo numérico. (peso 2)
- mostra: Meu texto para o fórum | Escrito por mim, com as minhas palavras | A IA só aponta o que ficou confuso (peso 2)
- destaca: Dá mais trabalho, mas é esse trabalho que faz você aprender

## gravacao_email_pedido
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: Aja como um assistente administrativo experiente. Trabalho no setor de compras e não vou conseguir entregar o relatório mensal na sexta, porque faltam dados de um fornecedor. Escreva um e-mail para a minha supervisora pedindo até terça. Tom profissional e cordial, no máximo seis linhas. (peso 4)
- usuário: Aja como um assistente administrativo experiente. Trabalho no setor de compras e não vou conseguir entregar o relatório mensal na sexta, porque faltam dados de um fornecedor. Escreva um e-mail para a minha supervisora pedindo até terça. Tom profissional e cordial, no máximo seis linhas.
- destaca: Papel, pano de fundo, pedido e padrão: os quatro P no mesmo pedido (peso 2)
- ia: Pronto, preparei o e-mail. Veja abaixo.

## gravacao_email_resposta
Modelo: notes
Aparelho: celular
App: E-mail
- mostra: Assunto: Pedido de prazo para o relatório mensal
- mostra: Olá, Marta, | Não conseguirei entregar o relatório mensal na sexta, pois ainda faltam dados de um fornecedor. | Posso entregá-lo até terça-feira, com as informações completas. | Agradeço a compreensão. | Atenciosamente, | Bia (peso 4)
- destaca: Assunto, saudação, motivo sem drama, nova data e fechamento educado (peso 2)
- destaca: Agora eu leio, troco o que não tem o meu jeito e confiro nome, data e relatório (peso 2)
- digita: deixe mais simples e direto, do jeito que se fala num escritório pequeno

## gravacao_anotacoes
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Reunião de equipe | reun. seg 9h | decid: trocar fornecedor X | M. liga p/ cliente qta | R. envia orçam. sex | prazo ?? | J. ajusta estoque (peso 3)
- destaca: Anotações bagunçadas, cheias de abreviação, escritas correndo (peso 2)
- destaca: Antes de colar: troque nomes por iniciais e apague CPF, telefone e dado de cliente (peso 3)
- mostra: Em vez de | a Marina vai ligar para o cliente
- mostra: Escreva | M. vai ligar para o cliente (peso 2)

## gravacao_resumo_reuniao
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: organize estas anotações de reunião em três partes: decisões tomadas, quem faz o quê, e prazos. Use tópicos curtos. Se alguma coisa não estiver clara, marque com um ponto de interrogação em vez de inventar. (peso 3)
- usuário: organize estas anotações de reunião em três partes: decisões tomadas, quem faz o quê, e prazos. Use tópicos curtos. Se alguma coisa não estiver clara, marque com um ponto de interrogação em vez de inventar.
- mostra: Resumo da reunião | Decisões: trocar o fornecedor X. | Quem faz o quê: M. liga para o cliente; R. envia o orçamento; J. ajusta o estoque. | Prazos: orçamento até sexta; ligação para o cliente na semana que vem (?). (peso 4)
- destaca: O que era bagunça virou lista. Eu confiro as decisões e troco as iniciais pelos nomes (peso 2)

## gravacao_formula_pedido
Modelo: chat
Aparelho: computador
App: Assistente de IA
- digita: Tenho uma planilha com o nome da vendedora na coluna A e o total vendido na coluna B. Quero que a coluna C mostre "bateu" se a venda passou de cinco mil reais, e "não bateu" se não passou. Me dê a fórmula e explique cada parte. (peso 4)
- usuário: Tenho uma planilha com o nome da vendedora na coluna A e o total vendido na coluna B. Quero que a coluna C mostre "bateu" se a venda passou de cinco mil reais, e "não bateu" se não passou. Me dê a fórmula e explique cada parte.
- mostra: Fórmula sugerida | =SE(B2>5000; "bateu"; "não bateu") (peso 2)
- ia: B2>5000 é a condição: o total passou de cinco mil? "bateu" aparece se for verdade. "não bateu" aparece se for falso. (peso 4)
- destaca: Pedir a explicação é o que faz você aprender, e não só copiar

## gravacao_formula_teste
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Vendedora
- célula: B1 = Total vendido
- célula: C1 = Resultado
- célula: A2 = Teste 1
- célula: B2 = 6000
- célula: A3 = Teste 2
- célula: B3 = 3000
- célula: A4 = Teste 3
- célula: B4 = 5000
- célula: C2 = =SE(B2>5000; "bateu"; "não bateu") (peso 2)
- célula: C3 = não bateu
- célula: C4 = não bateu (peso 2)
- destaca: Três linhas cujo resultado já sei: seis mil, três mil e exatamente cinco mil (peso 3)

## gravacao_roteiro_slides
Modelo: chat
Aparelho: computador
App: Assistente de IA
- digita: Aja como um professor de oratória. Vou apresentar para a minha equipe os resultados de vendas do mês, em cinco minutos. Monte um roteiro de cinco slides, com título, três tópicos curtos por slide e o que eu devo falar em cada um. (peso 4)
- usuário: Aja como um professor de oratória. Vou apresentar para a minha equipe os resultados de vendas do mês, em cinco minutos. Monte um roteiro de cinco slides, com título, três tópicos curtos por slide e o que eu devo falar em cada um.
- mostra: Slide 1: Resultados de vendas do mês | Abertura e objetivo | Período analisado | Fala: cumprimente e diga o que vai mostrar (peso 2)
- mostra: Slide 2: Números principais | Total vendido | Comparação com o mês anterior | Fala: destaque o número mais importante (peso 2)
- destaca: A IA dá o esqueleto. Os números reais, só eu tenho: eu coloco e confiro (peso 3)

## gravacao_email_sem_ler
Modelo: notes
Aparelho: celular
App: E-mail
- mostra: Assunto: Atualização do projeto
- mostra: Prezado [nome do gestor], | Segue a atualização do projeto desta semana. | Atenciosamente, | [seu nome] (peso 3)
- toca: Enviar (peso 2)
- destaca: Os colchetes foram junto: a IA deixa esses espaços para você preencher (peso 3)
- destaca: Quem recebe percebe na hora

## gravacao_imagem_pedidos
Modelo: chat
Aparelho: celular
App: Gerador de imagens
- digita: uma imagem de loja
- usuário: uma imagem de loja
- mostra: Resultado | Uma loja qualquer, num estilo qualquer (peso 2)
- destaca: Não combina com nada que eu precise (peso 2)
- digita: Você é um ilustrador. É para o cartaz de uma loja de roupa de bairro, divulgando a troca de estação. Faça uma ilustração de uma vitrine com casacos e cachecóis. Desenho simples, cores quentes, formato vertical, sem texto na imagem. (peso 4)
- usuário: Você é um ilustrador. É para o cartaz de uma loja de roupa de bairro, divulgando a troca de estação. Faça uma ilustração de uma vitrine com casacos e cachecóis. Desenho simples, cores quentes, formato vertical, sem texto na imagem.

## gravacao_imagem_boa
Modelo: chat
Aparelho: celular
App: Gerador de imagens
- mostra: Imagem gerada | Vitrine com casacos e cachecóis | Desenho simples, cores quentes, formato vertical (peso 3)
- destaca: Sem texto na imagem: os geradores muitas vezes erram as letras (peso 3)
- mostra: Editor de imagens | O texto do cartaz entra depois, num editor simples: Troca de estação (peso 3)
- digita: deixe as cores um pouco mais claras e o casaco vermelho em destaque
- destaca: Se não gostou, ajuste na mesma conversa

## gravacao_voz_clonada
Modelo: browser
Aparelho: celular
App: Gerador de voz
- mostra: Voz clonada | Criada a partir de uma gravação curta, com autorização da dona da voz (peso 3)
- toca: Ouvir exemplo (peso 3)
- destaca: Aviso: voz sintética, usada com autorização (peso 3)
- destaca: Fica muito parecida. Imagine isso nas mãos de um golpista (peso 3)

## gravacao_config_privacidade
Modelo: settings
Aparelho: celular
App: Configurações
- toca: Privacidade e controle de dados (peso 2)
- mostra: Controle de dados | Usar minhas conversas para melhorar o modelo | Ativado (peso 2)
- desliga: Usar minhas conversas para melhorar o modelo (peso 2)
- destaca: Desligar ajuda, mas não é uma capa de invisibilidade: a empresa pode guardar a conversa (peso 3)
- destaca: Dado sensível não entra, com a opção ligada ou desligada (peso 2)
- mostra: Cuide da conta | Senha forte, só sua | Não deixe a conversa aberta em computador compartilhado (peso 3)

## gravacao_prompt_papel_fundo
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Meu prompt-mestre | Papel: aja como meu tutor de estudos, paciente e direto, que explica com exemplos simples e me faz pensar antes de dar a resposta. (peso 4)
- mostra: Pano de fundo | Sou aluna de Administração a distância, trabalho durante o dia e estudo à noite pelo celular, uns quarenta minutos por dia. (peso 4)
- destaca: Nada de nome, CPF ou dado pessoal: só o que o tutor precisa saber (peso 3)

## gravacao_prompt_pedido_regras
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Pedido | Explicar o conteúdo no meu nível, me fazer perguntas uma por vez e corrigir, montar planos de estudo e gerar flashcards. (peso 3)
- mostra: Padrão | Respostas curtas, que caibam na tela do celular, sempre com um exemplo do meu dia a dia. (peso 3)
- mostra: Regras | Se não souber ou não tiver certeza, diga. Avise quando eu devo conferir uma informação. Não faça as minhas atividades avaliadas: me ajude a entender, mas quem escreve sou eu. (peso 4)
- destaca: Guarde num bloco de notas e cole no começo de cada sessão de estudo (peso 3)

## gravacao_prompt_pedido_regras
Modelo: notes
Aparelho: celular
App: Bloco de notas
- mostra: Pedido | Explicar o conteúdo no meu nível, me fazer perguntas uma por vez e corrigir, montar planos de estudo e gerar flashcards. (peso 3)
- mostra: Padrão | Respostas curtas, que caibam na tela do celular, sempre com um exemplo do meu dia a dia. (peso 3)
- mostra: Regras | Se não souber ou não tiver certeza, diga. Avise quando eu devo conferir uma informação. Não faça as minhas atividades avaliadas: me ajude a entender, mas quem escreve sou eu. (peso 4)
- destaca: Guarde num bloco de notas e cole no começo de cada sessão de estudo (peso 3)

## gravacao_plano
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: monte um plano de estudo de quatro semanas para esta disciplina, com estes tópicos, considerando quarenta minutos por noite, de segunda a sexta. Em tabela. (peso 3)
- usuário: monte um plano de estudo de quatro semanas para esta disciplina, com estes tópicos, considerando quarenta minutos por noite, de segunda a sexta. Em tabela.
- mostra: Plano de 4 semanas | Semana 1: conceitos básicos, 40 min por noite | Semana 2: exercícios guiados | Semana 3: revisão com flashcards | Semana 4: simulado e correção (peso 4)
- digita: na quarta eu chego mais tarde, deixe a quarta livre e dê uma folga no fim da semana
- destaca: Um plano que cabe na sua vida vale mais do que um perfeito que você abandona (peso 3)

## gravacao_flashcards_sem_conferir
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: crie vinte flashcards sobre juros compostos para a missão (peso 2)
- usuário: crie vinte flashcards sobre juros compostos para a missão
- mostra: Flashcard 7 | Pergunta: Nos juros compostos, sobre o que incide o juro de cada período? | Resposta: apenas sobre o capital inicial (peso 3)
- destaca: A resposta está errada: isso é juros simples (peso 3)
- mostra: Corrigido | Resposta: sobre o capital inicial mais os juros já acumulados (peso 3)
- destaca: A missão pede pelo menos duas correções marcadas (peso 2)
