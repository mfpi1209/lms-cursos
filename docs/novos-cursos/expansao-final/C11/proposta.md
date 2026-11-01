# C11 · “Não entendi. Posso perguntar?” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (para o agente aplicar no rascunho). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutor: Renato._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | 4 min (182.7–186.3 s) | **cerca de 4.7–4.8 min** (281.5–288.2 s) |
| Missão | montar um pedido de exemplo e uma pergunta sobre duas orientações (2×, na tela) | as de tela ficam como exercício · **repetir uma regra que alguém te explicar nesta semana e perguntar “e se…?” com um caso real, com “Como foi?”** |
| Decisão nova | — | 1 (“Você decide”: a regra confirmada encontra um caso que ela não cobre) |
| Abertura das aulas | “No fim desta aula, tem uma missão…” em todas | uma promessa própria por aula, sem a palavra “missão” |
| Fim do curso | tela de texto genérica | despedida do Renato em vídeo (64 palavras) + frase de fechamento própria |

**Fala nova a gravar:** 12 planos novos (244 palavras, ~93.1 s) + 3 reações (57 palavras, ~21.8 s) + 2 aberturas trocadas (38 palavras, ~14.5 s) = **~129.4 s (2.2 min) ≈ US$ 2.37** a US$ 0,0183/s. Alvo 90–130 s · teto 150 s.

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto ou só o plano indicado · ➕ novo (grava).

## 1 · A lacuna do C11

1. As duas missões (m01, m02) são montagem de blocos; nada acontece fora da tela, e a m02 monta a frase que o v03 acabou de ditar.
2. O curso ensina a pedir exemplo e a mostrar duas orientações, mas não o mecanismo que faz o exemplo funcionar: ele revela o critério escondido, e você confirma (“então X vem antes de Y, certo?”).
3. Falta o que fazer quando a regra confirmada encontra um caso que ela não cobre (a fronteira da regra) e a ideia de sair da conversa com um critério, não só com a resposta daquele caso.
4. O pacote colocou o Renato como personagem da cena (“Renato ouviu…”), o que a regra do dono proíbe: a cena é da Duda.
5. O curso termina numa tela de texto genérica: sem fecho do Renato, sem retorno à Duda e ao Miguel.

Por isso a aula 3 não repete “peça um exemplo” (v01) nem “mostre as duas orientações” (v03). Ela mostra, com a Duda, **o exemplo revelando o critério, a confirmação, a fronteira da regra (um pedido sem data), o teste numa regra real da sua semana e o fecho do Renato.**

## 2 · Aulas existentes: só texto e a troca do plano de abertura

O plano `missao` de cada aula (“No fim desta aula, tem uma missão para você: …”) é regravado com uma promessa própria, sem a palavra “missão” e com estrutura diferente entre as aulas. Ele continua sendo o anúncio da prática daquela aula. Os `missao_fim` saem na Fase 0 e não são tocados aqui.

### Aula 1 · Como pedir um exemplo
Caminho (sem mudança): v00 → q01 → v01 → q02 → m01 → fim_aula_01

- **v00 ✏️** troca só o plano `missao` (19 pal · ~7.3 s):
  > Quando esta aula terminar, você vai ter um pedido de exemplo montado, para a primeira regra vaga que aparecer.
  <br><small>antes: _No fim desta aula, tem uma missão para você: peça um exemplo._</small>
- **fim_aula_01 ✏️**: frase de fechamento: ““Bom senso” é regra sem exemplo. Peça o exemplo.”

### Aula 2 · Como esclarecer orientações diferentes
Caminho (sem mudança): v02 → q03 → v03 → m02 → fim_aula_02

- **v02 ✏️** troca só o plano `missao` (19 pal · ~7.3 s):
  > No fim, você escreve a pergunta que põe duas orientações lado a lado e pede para confirmar qual vale.
  <br><small>antes: _No fim desta aula, tem uma missão para você: esclareça uma diferença._</small>
- **fim_aula_02 ✏️**: rótulo **Aula concluída** · resumo: “Esclareça orientações diferentes com quem combinou a tarefa com você. Confirme as condições de uma exceção. Na próxima aula, a Duda volta: a regra foi confirmada, e aparece um caso que ela não cobre.” · frase de fechamento: “Duas orientações diferentes não são um problema seu para resolver no chute.”


---

## 3 · Aula 3 · Saia com o critério, não só com a resposta ➕ nova
_Módulo: Pratique os combinados · Você vê um exemplo revelar o critério escondido, testa a regra na fronteira e faz isso com uma regra real da sua semana. · ~4 min_  
Caminho: v04 → q04 → v05 → m03 → despedida → fim_aula_03

### v04 · Cena ➕: O exemplo que revela o critério
- `s1` ➕ (13 pal · ~5.0 s)
  > Nesta última aula, a pergunta é outra: o que você leva da conversa?
- `promessa` ➕ (22 pal · ~8.4 s)
  > No fim, você testa uma regra de verdade, com alguém que te explicar algo nesta semana. Em casa, na escola, no trabalho.
  <br><small>_Faz o papel do antigo plano 'missao', sem a fórmula._</small>
- `s2` ➕ (20 pal · ~7.6 s)
  > A Duda ouviu: separe os pedidos prioritários. Perguntou o que é prioritário. Resposta: os que precisam sair primeiro. Não ajudou.
- `s3` ➕ (21 pal · ~8.0 s)
  > Então ela tentou um exemplo: tenho um pedido para hoje e outro de um cliente antigo para amanhã. Qual entra primeiro?
- `s4` ➕ (22 pal · ~8.4 s · cartão)
  > Resposta: o de hoje, data de entrega vem antes de tempo de cadastro. A Duda confirmou e anotou. Agora tem um critério.
  <br><small>cartão «O que a Duda levou»: Pergunta vaga → **resposta vaga** · Exemplo → **o critério aparece** · Confirmar: “então X vem antes de Y, certo?”</small>
- `chamada` ➕ (19 pal · ~7.3 s)
  > Na hora de separar, aparece um pedido sem data. No lugar da Duda, o que você faz com ele?

<small>Cartão “Pergunta a seguir”: A regra confirmada: data de entrega vem primeiro. Aparece um pedido sem data nenhuma. O que você faz com ele?</small>

### q04 · Você decide ➕
**No lugar da Duda, o que você faz com esse pedido?**  
_Quem combinou a tarefa confirmou: a data de entrega vem primeiro. Na hora de separar, a Duda encontra um pedido sem data nenhuma._

- **A** (média) “Separo pelo tempo de cadastro, porque foi o outro critério citado.”
  - Renato reage (15 pal · ~5.7 s): “Faz sentido como palpite. Mas é você criando regra para a exceção, e ninguém confirmou.”
  - Retorno escrito: Você criou uma regra para a exceção sem combinar. Pode até fazer sentido, mas ninguém confirmou. Faça assim: separe os que têm data e pergunte sobre esse, com ele na mão.
- **B** (fraca) “Deixo esse pedido de lado e sigo com os outros, sem avisar.”
  - Renato reage (19 pal · ~7.3 s): “Os outros andam, e esse some. Quem espera por ele não sabe que travou. Sem aviso, ninguém vai procurar.”
  - Retorno escrito: O pedido some da fila. Quem espera por ele não sabe que travou. Faça assim: avise que existe um pedido sem data e pergunte como tratar.
- **C** (melhor) “Separo os que têm data e pergunto, com esse pedido na mão, como tratar quem não tem.”
  - Renato reage (23 pal · ~8.8 s): “O critério vale onde ele vale. Com o pedido na mão, a pergunta fica concreta, e a resposta vira regra para o próximo.”
  - Retorno escrito: O critério vale onde ele vale; o caso real serve para descobrir a fronteira da regra. Faça assim: mostre o pedido, pergunte, e anote a resposta junto com a regra.

A resposta não está no enunciado: ele diz a regra e mostra o caso fora dela; perceber que o critério vale só onde vale, e que o caso real na mão é o jeito de perguntar, é a decisão. Não repete a q03 (duas orientações), que já foi resolvida. Sem vídeo próprio da pergunta.

### v05 · Explicação ➕: Teste a regra na fronteira
- `s1` ➕ (22 pal · ~8.4 s)
  > Quando a explicação chegar, teste com outro caso: e se os dois tiverem a mesma data? Isso mostra onde a regra termina.
- `s3` ➕ (23 pal · ~8.8 s · cartão)
  > Se ainda houver dúvida, diga qual parte entendeu e qual falta. Não entendi nada, e entendi tudo, quase nunca descrevem o que aconteceu.
  <br><small>cartão «Antes de sair da conversa»: **Repita** com suas palavras · **Teste** com um “e se…?” · **Diga** qual parte faltou</small>
- `lancamento` ➕ (18 pal · ~6.9 s)
  > Nesta semana, alguém vai te explicar uma regra. Repita, teste com um caso, e veja o que muda.
  <br><small>_Faz o papel do antigo 'missao_fim', sem a palavra 'missão'. A aula segue para m03._</small>

É o aprofundamento do pacote (aprovado), em planos e sem jargão. Não repete v01 (peça exemplo, limite, quem orienta; repita o que entendeu) nem v03 (frase com as duas orientações; quem decide). O novo: testar na fronteira, só as exceções que mudam a ação, dizer qual parte faltou.

### m03 · Leve para a vida real ➕: Repita a regra e pergunte “e se…?”
**Tipo:** FAZER fora da tela: com uma regra que alguém te explicar nesta semana  
**Ponte (intro):** A Duda saiu com um critério e com a fronteira dele. Agora é com uma regra que alguém te explicar nesta semana: em casa, na escola, no curso ou no trabalho.  
**Ação:**
1. Nesta semana, quando alguém te explicar uma regra ou um jeito de fazer, não diga só “entendi”.
2. Repita com suas palavras: “então é assim: …, certo?”.
3. Pergunte “e se…?” com um caso de verdade: “e se chegar um sem data?”, “e se eu estiver sozinho?”, “e se der empate?”.
4. Repare no que mudou no seu entendimento depois do “e se”.
5. Volte aqui, marque “Já experimentei” e conte.

**Alternativa (sem estágio ou emprego):** Não apareceu ninguém explicando nada? Vale com uma regra de jogo, uma receita, o combinado de horários lá de casa ou a instrução de um trabalho da escola. Toda regra tem fronteira, e o “e se” acha.  
**Ver um exemplo · Exemplo: a Duda e os pedidos:** “Regra: data de entrega vem antes de tempo de cadastro. Repeti: então, entre dois pedidos, sai primeiro o de data mais perto, certo? Perguntei: e se um não tiver data? Resposta: pergunta para quem recebeu o pedido. Anotei junto com a regra.”  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Ajuda: “O que você entendeu diferente depois de repetir e perguntar “e se”? Em uma ou duas frases.” Placeholder: “Ex.: achei que era por ordem de chegada; era por prazo. O “e se” mostrou isso.”  
**Botões:** Já experimentei · Vou fazer depois. Quem escolhe “Vou fazer depois” conclui a aula; a missão e “Como foi?” ficam no Meu roteiro. **Sem molde na tela** (draftFromNodeId: null).

### despedida · Despedida do Renato ➕ (depois da missão, antes do fim)
_64 palavras · ~24.4 s · tela: A parte que entendi · A parte que falta · O critério_

> Perguntar não precisa começar com um pedido de desculpas. Você mostra a parte que entendeu e aponta onde a dúvida aparece.
>
> A Duda não saiu daquela conversa com um pedido separado. Saiu com um critério, e com a fronteira dele. Isso serve amanhã.
>
> Da próxima vez que alguém te explicar algo, antes de dizer entendi, pergunte: qual parte eu já entendi? E qual falta?

**Forma escolhida:** abre com a frase memorável do pacote (“Perguntar não precisa começar com um pedido de desculpas”), faz um callback à Duda e termina com a pergunta da ficha do Renato devolvida ao aluno (“qual parte eu já entendi?”). Sem recap, sem “Meu roteiro” na fala.

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Resposta resolve o caso de hoje. Critério resolve o de amanhã.”
- Roteiro · «Minha regra desta semana»: alguém me explicou uma regra · repeti com minhas palavras · perguntei “e se…?” com um caso real · anotei o que mudou
- Roteiro · «Como foi?»: o que o aluno escreveu em m03 (vazio: “Você deixou para depois. Quando testar uma regra, volte e conte o que mudou.”)
- Roteiro · «O que você levou»: Pergunta vaga, resposta vaga. Exemplo, critério. / Confirme: “então X vem antes de Y, certo?” / Teste a fronteira: “e se…?”. Diga qual parte faltou.

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v00/missao (abertura) | 1 | 19 | 7.3 | 0.13 |
| v02/missao (abertura) | 1 | 19 | 7.3 | 0.13 |
| v04 | 6 | 117 | 44.7 | 0.82 |
| q04 (3 reações) | 3 | 57 | 21.8 | 0.40 |
| v05 | 3 | 63 | 24.0 | 0.44 |
| despedida | 3 | 64 | 24.4 | 0.45 |
| **Total novo** | 12+3+2 | 339 | **129.4** | **2.37** |

- Vídeo que o aluno assiste: antes 182.7–186.3 s (4 min) → depois **281.5–288.2 s (cerca de 4.7–4.8 min)**.
- Dentro do alvo (90–130 s): sim.
- Tudo o mais (textos dos fins de aula, descrição do curso, missão de vida real) é texto: custo zero.

## 5 · Perguntas para o dono

1. Decisão: (a) o pedido sem data (fronteira da regra; reescrita dos revisores) · (b) dois pedidos com a mesma data (também fronteira, mas a explicação já usa esse exemplo). Recomendo (a).

2. Despedida: (a) termina com a pergunta da ficha do Renato devolvida ao aluno (“qual parte eu já entendi? E qual falta?”) · (b) termina com a frase do título (“saia com o critério, não só com a resposta”). Recomendo (a): é a assinatura do Renato e não vira frase de efeito.

3. Resumo do fim_aula_02: (a) trocar “referência responsável” por “quem combinou a tarefa com você” (jargão da lista do dono) · (b) manter como está. Recomendo (a): custo zero.

4. Frase de fechamento do fim_aula_01: (a) “‘Bom senso’ é regra sem exemplo. Peça o exemplo.” · (b) deixar null. Recomendo (a).

## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas; só o plano `missao` regrava (mesmo id) e os fins de aula mudam texto.
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; o Renato não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, retorno escrito com “Faça assim”.
- Missão com alternativa real para quem não trabalha; a aula fecha mesmo que a ação aconteça depois.
- Despedida curta, sem o molde de 4 parágrafos e sem “Meu roteiro” na fala.