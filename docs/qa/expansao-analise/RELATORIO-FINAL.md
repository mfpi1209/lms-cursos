# Expansão dos 26 cursos: relatório final (1º/11/2026)

## O que está no ar
- **26 cursos publicados com a expansão:** uma aula nova no fim de cada curso, com cena, "Você decide", explicação, "Leve para a vida real" e despedida. O C01 tem duas aulas novas.
- **Aberturas sem a fórmula** "No fim desta aula, tem uma missão". Cada aula ganhou uma promessa própria.
- **Fala de encerramento do curso** no fim da despedida, diferente em cada curso. Está em C02–C14 e na última parte de cada trilha em 3 partes (C17, C20, C23 e C26). As partes 1 e 2 dessas trilhas não dizem que o curso acabou. O C01 já tinha um adeus.
- **Player:**
  - tela cheia que não fecha entre as cenas, com enquadramento inteiro no celular deitado;
  - ponte "Agora é com você" antes da missão;
  - resposta escrita depois de "Já experimentei" e de "Vou fazer depois";
  - etapa "Fechamento";
  - tela "Você concluiu [curso]", com o selo em destaque e uma comemoração curta.
- **Home:** "Respeito e diálogo", "Tecnologia com critério", "Autonomia no trabalho" e "Pensar e resolver" viraram um card cada, com Parte 1, 2 e 3. Dentro da aula aparece "Parte N de 3", e o fim das partes 1 e 2 leva para a parte seguinte.
- Quem já tinha concluído um curso continua concluído e vê a aula nova como "Conteúdo novo".

## Validação
- **Robô, rodada final** (`docs/qa/lancamento/robo/rodadas/final-0111/`): 26 de 26 cursos, 95 de 95 aulas e 190 caminhos (missão feita e "Vou fazer depois"), todos até o fim. Resultado: **0 bloqueantes, 0 importantes e 5 menores**. Os menores são travadas de 120 a 199 ms, toleradas pela regra.
- Rodadas por etapa: onda 1 com 140 caminhos, onda 2 com 60, fecho com 30 e mais as de C24 e C25. Todas fecharam com 0 bloqueantes e 0 importantes no fim.
- **Testes do app:** 149 de 149 no web e 265 de 265 no course-schema. A checagem de tipos passou.
- **Raio-X:** 700 de 700 vídeos com o áudio transcrito. Ele está em `docs/qa/raio-x/raio-x-completo.html` e no artefato (versão 5).

## Gasto (teto aprovado: US$ 80,40)
- **Total: US$ 74,36.**
  - Onda 1: US$ 31,71.
  - Onda 2: US$ 30,11.
  - Regravação depois da falta de créditos: US$ 9,61.
  - Falas de encerramento: US$ 2,93. Desse valor, cerca de US$ 0,86 ficou sem uso nas partes 1 e 2 das trilhas.
- O detalhe está em `GASTOS.md`. Os jobs que falharam por falta de crédito não foram cobrados.
- A trava diária de mídia do sistema está em **US$ 200** (antes era US$ 140). O comando para voltar está em `DECISOES-AUTONOMAS.md`.
- Os servidores estão em **modo demo**, sem mídia paga.

## Ficou para você decidir ou ouvir
1. **Ouvir rapidinho** (pode ser só erro da transcrição; regravar custa cerca de US$ 0,14 cada):
   - C14 A13·v25: "Peça" ou "Teça"?
   - C17 A3·v06: "Perceber" ou "Receber"?
   - C20 A2·v03: "a IA" ou "a EA"?
   - C18 A3·v05: "quatro e meia".
   - C22 despedida: o "de" de "feito de pendente".
   - C08 fecho: "deixa" ou "deixe"?
   - C02 A3·v04, C06 A2·v02 e "Ravi"/"Javi" no C06: pendências antigas.
2. **Reações faladas** nas decisões novas: não foram gravadas. O retorno é escrito. Gravar custaria cerca de US$ 15,60, acima do saldo.
3. **C01:** falta a foto da Marina no curso; a tela final usa uma miniatura. As aulas terminam em "Na prática", não em "Leve para a vida real". Os slides parados de A1·v01 e A2·v03 também estão no C01.
4. **Visual da home:** resolvido. As 4 trilhas em 3 partes estão numa fileira só, "Trilhas em 3 partes". Com a ficha de uma trilha escolhida, ela aparece sozinha.
5. **Ainda não testado com aluno novo:** os estados "Começar", "Continuar parte 2" e o botão "Ir para a Parte 2" no player real. A conta de teste já concluiu tudo, então foram vistos só com dados de teste e testes automáticos.
6. **Diversos:** o QR do certificado aponta para localhost; falta a página "Verificar um selo"; "Missões para depois" não aparece em Minhas trilhas.
7. **Nada foi commitado.** O commit é feito quando você pedir.
