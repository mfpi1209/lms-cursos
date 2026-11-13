# Telas simuladas — Dinheiro no controle

<!--
Conferidas contra a fala de cada cena (storyboard de `qa-telas.ts` + prévia com o tempo da legenda). Regras usadas:
- todo passo que importa leva `(na fala: "…")` com o trecho exato em que ele aparece;
- nada é digitado ou mostrado antes de ser dito; sem tela vazia por muito tempo;
- contas conferidas: 300 previsto x 420 real = -120 (previsto menos real); 500+400+150+80 = 1.130;
  1000 x 1,1^6 = 1771,56; 1000 x 1,1^12 = 3138,43.
-->

## gravacao_planilha_colunas
Modelo: sheet
Aparelho: computador
App: Planilha
- destaca: Uma planilha gratuita já resolve (na fala: "Pode ser o Google Planilhas")
- célula: A1 = Categoria (na fala: "categoria,")
- célula: B1 = Previsto (na fala: "previsto, real")
- célula: C1 = Real (na fala: "real e diferença")
- célula: D1 = Diferença (na fala: "e diferença")
- célula: A2 = Mercado (na fala: "O previsto é o que você planeja")
- célula: B2 = 300 (na fala: "previsto é o que você planeja")
- célula: C2 = 420 (na fala: "O real é o que aconteceu")
- célula: D2 = -120 (na fala: "real é o que aconteceu")

## gravacao_planilha_soma
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Categoria (na fala: "Para somar uma coluna")
- célula: B1 = Previsto
- célula: A2 = Ajuda em casa
- célula: B2 = 500
- célula: A3 = Mercado
- célula: B3 = 400
- célula: A4 = Transporte
- célula: B4 = 150
- célula: A5 = Celular e internet
- célula: B5 = 80
- célula: A6 = Total (na fala: "clique na célula do total")
- digita: =SOMA(B2:B5) (peso 3) (na fala: "digite igual")
- célula: B6 = =SOMA(B2:B5) (na fala: "Pronto")
- destaca: A planilha faz a conta por você e refaz sozinha quando um valor muda (na fala: "a planilha faz a conta por você")

## gravacao_calculadora_mes_a_mes
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Mês (na fala: "Imagine")
- célula: B1 = Dívida (R$) (na fala: "uma dívida")
- célula: A2 = 0 (na fala: "de mil reais")
- célula: B2 = 1000 (na fala: "mil reais")
- célula: A3 = 1 (na fala: "No primeiro mês")
- célula: B3 = 1100 (na fala: "ela vira mil e cem")
- célula: A4 = 2 (na fala: "No segundo")
- célula: B4 = 1210 (na fala: "mil duzentos e dez")
- célula: A5 = 3 (na fala: "No terceiro")
- célula: B5 = 1331 (na fala: "mil trezentos e trinta e um")
- destaca: Juro sobre juro: o juro do mês é calculado sobre o valor do mês anterior (na fala: "Isso é juro composto")

## gravacao_calculadora_doze_meses
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Mês (na fala: "Se ninguém pagar nada")
- célula: B1 = Dívida (R$)
- célula: A2 = 6 (na fala: "em seis meses")
- célula: B2 = 1771,56 (na fala: "passa de mil e setecentos")
- célula: A3 = 12 (na fala: "Em doze meses")
- célula: B3 = 3138,43 (na fala: "três mil cento e trinta e oito")
- destaca: Mais que o triplo do começo: de R$ 1.000 para R$ 3.138 (na fala: "Mais que o triplo")

## gravacao_planilha_potencia
Modelo: sheet
Aparelho: computador
App: Planilha
- destaca: Juro ao mês não se multiplica por doze (na fala: "Por isso")
- célula: A1 = Dívida inicial (na fala: "Dez por cento ao mês")
- célula: B1 = 1000
- destaca: 10% ao mês não é 120% ao ano: é mais de 200% (na fala: "é mais de duzentos")
- célula: A2 = Depois de 1 ano (na fala: "Para conferir na planilha")
- digita: =1000*1,1^12 (peso 3) (na fala: "digite igual")
- destaca: O circunflexo quer dizer elevado a (na fala: "O circunflexo quer dizer")
- célula: B2 = 3138,43 (na fala: "Aparece o valor")
- destaca: Teste com outros números (na fala: "Faça o teste")

## gravacao_registrato
Modelo: browser
Aparelho: celular
App: Navegador
- mostra: Registrato — Banco Central | Consulte as dívidas e empréstimos no seu nome (na fala: "Não lembra de tudo")
- destaca: Mostra dívidas em bancos e financeiras, de graça (na fala: "que mostra as dívidas")
- toca: Entrar com conta gov.br (na fala: "O acesso é pela")
- mostra: Seu resultado | Banco Exemplo — Cartão de crédito | Banco Exemplo — Empréstimo pessoal | Financeira Exemplo — Financiamento (na fala: "Ele não mostra")
- destaca: Luz e crediário de loja não aparecem: essas você junta pelas faturas (na fala: "luz ou crediário")
- destaca: Vale olhar uma vez por ano, mesmo sem dívida (na fala: "Vale olhar")

## gravacao_pix_confirmacao
Modelo: form
Aparelho: celular
App: Banco
- toca: Pix (na fala: "O Pix é ótimo")
- destaca: Instantâneo e gratuito para pessoa física, na maioria dos casos (na fala: "é instantâneo")
- destaca: Rápido para pagar, rápido para sumir (na fala: "também é rápido para sumir")
- destaca: Depois de confirmado, desfazer é difícil (na fala: "depois de confirmado")
- destaca: O momento mais importante: a tela de confirmação (na fala: "Por isso")
- mostra: Confirme os dados | Para: Mercadinho Exemplo Ltda | Instituição: Banco Exemplo | Valor: R$ 150,00 (peso 3) (na fala: "a tela de confirmação")
- destaca: Leia o nome de quem vai receber, a instituição e o valor (na fala: "leia o nome de quem vai receber")
- destaca: Se o nome não bate com quem você espera, pare e confirme por outro canal (na fala: "Se o nome não bate")

## gravacao_limite_pix
Modelo: settings
Aparelho: celular
App: Banco
- toca: Configurações do Pix (na fala: "no aplicativo do seu banco")
- toca: Limites (na fala: "ajustar o limite de valor")
- mostra: Limite do Pix | Dia: R$ 1.000 | Noite: R$ 1.000 (na fala: "no período da noite")
- toca: Alterar limite noturno (na fala: "Deixe um limite baixo")
- mostra: Limite alterado | Noite: R$ 200 (na fala: "Se um dia precisar")
- destaca: Se precisar de mais, aumente com antecedência (na fala: "você aumenta com antecedência")
- destaca: Dica: salve como contato quem você paga sempre (na fala: "Outra dica")

## gravacao_contatos_salvos
Modelo: form
Aparelho: celular
App: Banco
- mostra: Contatos salvos | Mercadinho Exemplo | Academia Exemplo | Maria (aluguel) (peso 2) (na fala: "Assim você não digita")
- destaca: Um nome estranho chama atenção na hora (na fala: "um nome estranho")

## gravacao_planilha_calendario
Modelo: sheet
Aparelho: computador
App: Planilha
- célula: A1 = Gasto do ano (na fala: "Muita conta não aparece")
- célula: B1 = Mês (na fala: "mas aparece todo ano")
- célula: A2 = Aniversários (na fala: "Aniversários")
- célula: B2 = Março
- célula: A3 = Presentes (na fala: "presentes de fim de ano")
- célula: B3 = Dezembro
- célula: A4 = Estudo (na fala: "material de estudo")
- célula: B4 = Julho
- célula: A5 = Conserto (na fala: "um conserto")
- célula: B5 = Maio
- célula: A6 = Documento (na fala: "a renovação de um documento")
- célula: B6 = Outubro
- célula: A7 = Férias (na fala: "as férias")
- célula: B7 = Janeiro (na fala: "as férias")
- destaca: Uma aba com os 12 meses: anote os gastos que você já sabe que vêm (na fala: "crie uma aba")
- destaca: Em dez minutos, o ano fica à vista (na fala: "Em dez minutos")
