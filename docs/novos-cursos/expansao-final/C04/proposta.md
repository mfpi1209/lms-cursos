# C04 · “WhatsApp sem complicação” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (para o agente aplicar no rascunho). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutor: Thiago._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | 3 min (149.3–154.0 s) | **cerca de 4.2–4.3 min** (254.6–259.6 s) |
| Missão | montar frase em blocos (2×) | as duas ficam como exercício · **um pedido real reescrito e enviado**, fora da tela, com “Como foi?” |
| Decisão nova | — | 1 (“Você decide”: o que fazer quando o prazo passa e a confirmação não veio) |
| Fim do curso | tela de texto genérica, sem fala | despedida do Thiago em vídeo (54 palavras) + frase de fechamento própria |
| Aberturas | 2 planos “No fim desta aula, tem uma missão para você: …” | 2 promessas próprias, sem a palavra “missão” |

**Fala nova a gravar:** 16 planos (277 palavras, ~105.7 s) + 3 reações (59 palavras, ~22.5 s) = **~128.2 s (2.1 min) ≈ US$ 2.35** a US$ 0,0183/s. Alvo 90–130 s, teto 150 s.

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto (custo zero) · 🎙️ troca a fala do plano (mesmo id, regrava) · ➕ novo (grava).

## 1 · A lacuna do C04

1. As duas missões (m01, m02) são montagem de frase em blocos; nada acontece fora da tela.
2. O curso ensina a primeira mensagem e a retomada, mas para antes do caso mais comum: a resposta vem (“vou ver”), não resolve, e o prazo chega.
3. Não ensina a fechar a conversa quando a orientação chega (“recebi, vou seguir”), o que deixa a outra pessoa procurando uma solução que você já tem.
4. As aberturas das duas aulas usam a fórmula “No fim desta aula, tem uma missão para você: …”; o missao_fim de v01 já saiu na Fase 0.
5. O curso termina numa tela de texto genérica: sem fecho do Thiago.

Por isso a aula 3 não repete “quem fala, assunto, pedido” (v01) nem “relembre o pedido e diga por que importa” (v03). Ela preenche o que falta: **a resposta que não resolve, a decisão quando o prazo passa, o fechamento da conversa, uma mensagem real reescrita e o fecho do Thiago.** Demonstração, decisão e aprofundamento do pacote entram reescritos na voz dele.

## 2 · Aulas existentes: texto e a abertura de cada prática

### Aula 1 · Como escrever uma mensagem com contexto e pedido
- **v00/missao 🎙️** (18 pal · ~6.9 s) — era: “No fim desta aula, tem uma missão para você: monte uma mensagem de trabalho.”
  > Daqui a pouco você monta a sua primeira mensagem de trabalho. Curta, com quem fala, assunto e pedido.
- **m01 ✏️**: Só a instrução: o componente é de blocos.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_01 ✏️**: Só acrescenta a frase de fechamento (hoje null).
  - closingLine: “Um oi sozinho é uma notificação. Com assunto e pedido, vira mensagem.”

### Aula 2 · Como acompanhar um pedido sem pressionar
- **v02/missao 🎙️** (19 pal · ~7.3 s) — era: “No fim desta aula, tem uma missão para você: retome um pedido.”
  > E você sai desta aula com a retomada escrita: pedido, motivo, e uma saída se a resposta não vier.
- **m02 ✏️**: Só a instrução.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_02 ✏️**: Deixa de ser o fim do curso: “Curso concluído” passa para fim_aula_03.
  - outcomeLabel: “Aula concluída”
  - summary: “Retomar sem pressionar é lembrar o pedido e dizer por que ele importa. Se você salvou, sua retomada fica no Meu roteiro. Na próxima aula, a resposta chega, mas não resolve: o que fazer, e como fechar a conversa.”
  - closingLine: “Cobrar cinco vezes é barulho. Explicar por que importa é informação.”

- **Cortes: nenhum novo.** O missao_fim de v01 já saiu na Fase 0 (status a). O v03/s5 (“Agora, monte a sua mensagem de retomada”) fica, porque m02 continua logo depois. As duas aberturas são o único anúncio de m01/m02 e são trocadas, não tiradas.

---

## 3 · Aula 3 · Quando a resposta não resolve ➕ nova
_Módulo: Pratique os combinados · Você vê uma resposta que não resolve, decide o que fazer quando o prazo passa, aprende a fechar a conversa e reescreve um pedido seu de verdade. · ~4 min_  
Caminho: v04 → q04 → v05 → m03 → despedida → fim_aula_03

### v04 · Cena ➕: Vou ver
- `s1` ➕ (16 pal · ~6.1 s)
  > Agora, o que acontece toda semana: você pergunta, a pessoa responde, e a resposta não resolve.
- `promessa` ➕ (19 pal · ~7.3 s)
  > No fim, você pega uma mensagem real que já mandou, pedindo algo a alguém, e manda a versão melhor.
- `s2` ➕ (15 pal · ~5.7 s)
  > O Pedro pediu o procedimento da tarefa da tarde. A resposta: vou ver. Duas palavras.
- `s3` ➕ (19 pal · ~7.3 s · card)
  > Ele retoma: preciso da confirmação até as duas para entregar às quatro. Se não der, quem pode me orientar?
  <br><small>cartão «A retomada do Pedro»: **Obrigado.** Preciso dessa confirmação **até as 14h** para entregar **às 16h**. · Se não for possível, **quem pode me orientar?**</small>
- `s4` ➕ (13 pal · ~5.0 s)
  > Duas da tarde, nada. Duas e meia, nada. A entrega é às quatro.
- `chamada` ➕ (9 pal · ~3.4 s)
  > No lugar do Pedro, o que você faz agora?

<small>Cartão “Pergunta a seguir”: Duas e meia. O Pedro já retomou com prazo e motivo e não teve resposta. A entrega é às quatro. O que você faz?</small>

### q04 · Você decide ➕
**No lugar do Pedro, o que você faz agora?**  
_Duas e meia. O Pedro já retomou com prazo e motivo e não teve resposta. A entrega é às quatro._

- **A** (média) “Mando a mesma mensagem de novo, para ela voltar ao topo.”
  - Thiago reage (20 pal · ~7.6 s): “Mesma mensagem, mesma informação. Quem lê não ganha nada novo. O que muda é outra pessoa saber que você travou.”
  - Retorno escrito: Pode chamar atenção, mas não acrescenta nada e não abre outro caminho. Faça assim: avise quem acompanha a tarefa que a confirmação está pendente.
- **B** (melhor) “Aviso quem acompanha a tarefa que a confirmação não veio e pergunto como seguir.”
  - Thiago reage (20 pal · ~7.6 s): “Você não cobrou de novo: avisou quem decide. Uma mensagem: pedi, não veio, preciso até as quatro. A tarefa anda.”
  - Retorno escrito: Você leva o bloqueio a quem pode decidir, sem cobrar a pessoa de novo. Faça assim: diga o que pediu, a quem, e o que precisa até as quatro.
- **C** (fraca) “Escolho um procedimento por conta própria para não atrasar.”
  - Thiago reage (19 pal · ~7.3 s): “Resolver sozinho dá alívio às três e retrabalho às cinco. Se precisava de confirmação, precisava. Avise antes de escolher.”
  - Retorno escrito: A iniciativa parece boa, mas, se o procedimento precisava de confirmação, vira retrabalho às cinco. Faça assim: antes de decidir sozinho, avise quem acompanha a tarefa.

A resposta não está no enunciado: ele diz que a retomada já foi feita e que o prazo chega; perceber que a próxima mensagem não é para a mesma pessoa, e sim para quem acompanha a tarefa, é a decisão. Sem vídeo próprio da pergunta.

### v05 · Explicação ➕: Resposta incompleta e conversa fechada
- `s1` ➕ (18 pal · ~6.9 s)
  > Mensagem clara também recebe resposta incompleta. Não quer dizer que você escreveu mal. A conversa só não acabou.
- `s2` ➕ (23 pal · ~8.8 s · card)
  > O próximo passo depende de duas coisas: o prazo e o canal da equipe. Silêncio não é acusação. Descreva o que está pendente.
  <br><small>cartão «Resposta incompleta»: Veja o **prazo** · Use o **canal** da equipe · Descreva o que está **pendente** · Quando chegar, **feche**</small>
- `s3` ➕ (17 pal · ~6.5 s)
  > E quando a orientação chega, feche a conversa: recebi, vou seguir esse procedimento. Três segundos para escrever.
- `s4` ➕ (16 pal · ~6.1 s)
  > Sem isso, a pessoa continua procurando uma solução que você já tem. Conversa boa termina fechada.
- `lancamento` ➕ (21 pal · ~8.0 s)
  > Sua vez: ache um pedido seu sem resposta, ou o próximo que for fazer. Escreva quem fala, assunto, pedido. E mande.

Não repete v01 (quem fala, assunto, pedido; áudio) nem v03 (retomada com motivo; destinatário, conteúdo, anexos). O novo: resposta incompleta não é culpa sua; silêncio não é acusação; levar o bloqueio a quem decide; fechar a conversa.

### m03 · Leve para a vida real ➕: Reescreva um pedido de verdade
**Tipo:** FAZER no celular, fora da plataforma: um pedido real reescrito, enviado e fechado quando a resposta vier  
**Ponte (intro):** O Pedro retomou com prazo e motivo, e fechou a conversa quando a resposta veio. Agora é com uma mensagem sua.  
**Ação:**

1. Abra suas conversas e ache um pedido seu que ficou sem resposta. Ou pense no próximo pedido que vai fazer: escola, família, curso, trabalho.
2. Reescreva numa mensagem só: quem fala (se a pessoa não te conhece bem), o assunto e o pedido. Se tem prazo, diga por que ele importa.
3. Mande.
4. Quando a resposta vier, feche: “Recebi, obrigado. Vou fazer assim.”
5. Volte aqui, marque “Já experimentei” e conte o que mudou.

**Para quem não trabalha (e para quem trabalha):** Não trabalha? Serve o pedido de um documento na secretaria da escola, a dúvida com o professor, o combinado com alguém da família. Qualquer pedido real. Se trabalha, escolha um pedido que já está parado há mais de um dia.  
**Exemplo: antes e depois** (visível só ao tocar em “Ver um exemplo”): “Antes: “oi, tudo bem? então…”. Depois: “Oi, professora, é o Luan do 2º B. Sobre o trabalho de história: posso entregar quinta? Sexta tenho prova de manhã.” Resposta: “Pode.” Fechei: “Recebido, entrego quinta. Obrigado!””  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Texto de ajuda: “Qual era o pedido, e a resposta veio diferente de antes?” Placeholder: “Ex.: a secretaria respondeu em dez minutos; antes eu tinha mandado três mensagens.”  
**Botões:** Já experimentei · Vou fazer depois. Quem escolhe “Vou fazer depois” conclui a aula; m03 e “Como foi?” ficam no Meu roteiro.  
**Sem molde na tela** (draftFromNodeId: null): a ação acontece fora da plataforma, de propósito.

### despedida · Despedida do Thiago ➕ (depois da missão, antes do fim)
_54 palavras · ~20.6 s · tela: Quem fala? · Qual assunto? · O que precisa acontecer?_

> A Iara começou uma conversa. O Pedro continuou uma, e fechou. Três momentos, uma regra: quem lê entende sem perguntar.
>
> Antes de enviar: quem fala? Qual é o assunto? O que precisa acontecer? Se tem prazo, por que importa.
>
> Mensagem boa é a que a pessoa responde sem precisar perguntar nada. Até a próxima.
>

**Forma escolhida: termina com uma lista curta (três perguntas de checagem) e a frase do curso; abertura por callback duplo (Iara e Pedro). Enxuto como o Thiago. Sem “Meu roteiro” na fala.**

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Resposta incompleta não encerra o pedido. Resposta recebida, sim: feche a conversa.”
- Roteiro · «Meu pedido reescrito»: pedido escolhido (sem resposta, ou o próximo) · reescrito: quem fala, assunto, pedido · enviado · conversa fechada quando a resposta veio
- Roteiro · «Como foi?»: o que o aluno escreveu em m03 (vazio: “Você deixou para depois. Quando fizer, volte e conte como foi.”)
- Roteiro · «O que você levou»: Primeira mensagem: quem fala, assunto, pedido. / Retomada: o pedido, o prazo e por que importa. / Resposta incompleta e prazo chegando: avise quem acompanha. / Orientação chegou: “Recebi, vou seguir.”

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v04 | 6 | 91 | 34.7 | 0.64 |
| q04 (3 reações) | 3 | 59 | 22.5 | 0.41 |
| v05 | 5 | 95 | 36.3 | 0.66 |
| despedida | 3 | 54 | 20.6 | 0.38 |
| aberturas trocadas (v00/missao, v02/missao) | 2 | 37 | 14.1 | 0.26 |
| **Total novo** | 16+3 | 336 | **128.2** | **2.35** |

- Vídeo que o aluno assiste: antes 149.3–154.0 s (3 min) → depois **254.6–259.6 s (4.2–4.3 min)**. antes + v04 + v05 + despedida + uma reação da q04 (mínima/máxima) + diferença das aberturas trocadas (+6.4 s). O “antes” é o raio-x das 02:33; a Fase 0 tirou o missao_fim de v01 (−4.4 s), não descontado aqui.
- Opcional: 5 reações antigas abrem com frase repetida em muitos cursos (q01 C, q02 A, q02 C, q03 A, q03 B). Cortar a 1ª frase, grátis, se o ajustador aceitar vídeo de reação; ou regravar só a 2ª frase (~28.6 s ≈ US$ 0.52).
- Tudo o mais (campos das práticas, fins das aulas, descrição do curso) é texto: custo zero.

## 5 · Perguntas para o dono

1. Missão m03: (a) um pedido seu que ficou sem resposta, ou o próximo pedido que for fazer (evita reenviar algo já respondido) · (b) “a última mensagem em que você pediu algo”, reescrita e reenviada, como os revisores escreveram. Recomendo (a).

2. v03/s5 “Agora, monte a sua mensagem de retomada.” (2,2 s): (a) manter: m02 continua logo depois · (b) tirar por drop + remontagem (grátis). Recomendo (a).

3. As 5 reações antigas com abertura repetida: (a) deixar · (b) cortar a primeira frase, se o ajustador aceitar vídeo de reação (grátis) · (c) regravar (~28.6 s, ≈ US$ 0.52). Recomendo (b); se não der, (a).

4. Cartão da retomada do Pedro em v04/s3: (a) mostrar a mensagem completa no cartão (o aluno lê enquanto o Thiago fala) · (b) só a fala. Recomendo (a).


## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas; nenhum plano tirado (os `missao_fim` já saíram na Fase 0, onde existiam).
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; Thiago não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”; as aberturas trocadas têm estrutura diferente entre si.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, retorno escrito com “Faça assim”.
- Missão com alternativa real para quem não trabalha; a aula fecha mesmo que a ação aconteça depois.
- Despedida de 54 palavras, sem o molde de 4 parágrafos; fecha este curso, não um curso qualquer.
