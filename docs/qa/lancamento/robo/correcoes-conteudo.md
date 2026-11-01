# Correções de conteúdo do robô de QA (rodada `linha-de-base`)

Data: 31/10/2026. Alvo: **rascunho** dos 14 cursos atuais. Nada foi publicado, nenhum commit, nenhuma mídia gerada. Não toquei em `apps/worker/src`, `packages/media/src`, falas gravadas (`bridge.call`, `reaction.text`), mídia, cortes nem `media.adjust`. Texto de tela: título e enunciado da pergunta, rótulo de opção e ponte (`intro`) da atividade. **Exceção, só na seção "Missão" (2): 35 planos novos de fala** no rascunho (a narração do nó passa a ser a soma dos planos), ainda sem gravar.

## Resumo

| Tipo | Achados | Corrigidos agora | Observação |
|---|---|---|---|
| Título da pergunta não é pergunta | 21 | **21** | enunciado passa a fechar com a pergunta; quadro "A situação" volta |
| Título fora do padrão "No lugar de X" | 21 | **10** corrigidos agora; **11** já estavam corrigidos no rascunho | os 11 só esperam publicação (ver abaixo) |
| Opção fora da 1ª pessoa | 13 | **13** (+5 opções vizinhas, por coerência), **revertido por decisão do dono (item 5)** | os 18 rótulos voltaram ao original; ver seção 3 |
| Missão não anunciada | 5 | **5 com ponte escrita** + **5 falas novas no rascunho** | o anúncio falado só chega ao aluno depois de gravar (orçamento no fim da seção 2) |
| Atividade no meio / "Continuar aula" não leva ao fim | 3 | 0 (desenho intencional) | explicado abaixo |
| Vídeo final não chama a missão | 13 (= 31 aulas) | **30 falas novas no rascunho** (+1 em C14·A6, junto da abertura) | só chega ao aluno depois de gravar |
| Obrigatória com "Fazer depois" | 14 | **resolvido por decisão do dono (item 2)**: `required: false` em 66 atividades de 26 cursos | ver `correcoes-player.md` |

Escritas no rascunho: **64 textos** em 3 scripts (41 de título/enunciado em 31 perguntas, 18 rótulos de opção, 5 pontes). Os 18 rótulos de opção foram desfeitos depois (item 5, seção 3). Cada gravação virou uma revisão nova do rascunho (`origin: script`).

## Achado importante: o robô testou a versão publicada

Pelo que os títulos mostram, o robô jogou a versão **publicada** (os textos dele batem com a última publicação, de 15:20), e o rascunho já tinha avançado. Os títulos "No lugar de X" aplicados às 15:54 (`titulos-perspectiva.ts`) estão no rascunho, mas ainda não foram publicados. Por isso 11 dos 21 "Título fora do padrão" **já estão certos no rascunho** e só precisam de publicação: P009 (C03·A2·q03), P041 (C10·A1·q01), P060, P061 (C13·A1), P065, P066 (C13·A2), P068 (C13·A3), P071 (C13·A4), P076, P077 (C13·A5), P084 (C13·A6). Dos 21 "Título da pergunta não é pergunta", o título do nó já estava razoável em vários; o defeito era do enunciado (abaixo). Depois de publicar, vale rodar o robô de novo.

## 1. Títulos das perguntas

**Causa dos 21 "não é pergunta".** O player (`splitPrompt` em `apps/web/src/components/player/immersive/theme.ts`) escolhe o título da tela assim: a frase com "?" do enunciado; se não houver, o próprio enunciado quando ele tem **até 110 caracteres**; só com enunciado maior usa o `title` do nó, e então o enunciado inteiro vai para o quadro "A situação". Os 21 enunciados são curtos e não tinham pergunta, então **o enunciado virou o título** e o quadro sumiu. A revisão de coerência de 31/10 tinha tirado a pergunta do enunciado achando que o título a mostraria.

**Correção (só dado).** A pergunta passou a ser a última frase do enunciado (igual ao que C06·A3·q05 já fazia). O player a usa como título e mostra o resto como "A situação", completo. Fatos que só estavam no título antigo entraram na situação (ex.: "Pedem R$ 49,90", "prazo de três dias", "faltam 5 minutos"). Conferi cada um simulando o `splitPrompt`: nas 73 perguntas do rascunho, o título da tela agora é uma pergunta e nenhum caso cai em "enunciado curto vira título". Alternativa de código (não feita, fora do pedido): o player preferir `title` quando ele termina em "?"; resolveria sem repetir a pergunta no enunciado.

Verbos: "faria" (padrão), "diria" (C02·A2, a Bia fala), "responde/confirma/pergunta/evita" onde o título já trazia o verbo, "como você continuaria" (C10·A2, igual à chamada falada). Concordância: do Davi, do Rafael, da Bia, do Caio, da Ana, do Pedro, do Lucas, do Luan, da Sara, da Malu, do Henrique, da Alana. Sem personagem (C14), pergunta direta em 2ª pessoa. C13·A1·q11 mudou só título/enunciado; o corte manual do vídeo não foi tocado.

| Achado | Onde | Título antes | Título depois | Situação (painel "A situação") |
|---|---|---|---|---|
| P001 | C01·A1·q02 | O que você faria no lugar do Davi? | No lugar do Davi, o que você faria? | igual (já mostra a situação inteira) |
| P004 | C02·A1·q02 | O que você faria no lugar do Rafael? | No lugar do Rafael, o que você faria? | + “No lugar do Rafael, o que você faria?” (a pergunta passa a fechar o enunciado) |
| P005 | C02·A2·q03 | O que você diria no lugar da Bia? | No lugar da Bia, o que você diria? | igual (já mostra a situação inteira) |
| P006 | C03·A1·q01 | O que você faria no lugar do Caio? | No lugar do Caio, o que você faria? | + “No lugar do Caio, o que você faria?” (a pergunta passa a fechar o enunciado) |
| P007 | C03·A1·q02 | O que você faria no lugar da Ana? | No lugar da Ana, o que você faria? | + “No lugar da Ana, o que você faria?” (a pergunta passa a fechar o enunciado) |
| P010 | C04·A1·q02 | O que você faria no lugar do Pedro? | No lugar do Pedro, o que você faria? | igual (já mostra a situação inteira) |
| P017 | C05·A1·q02 | O que você faria no lugar do Lucas? | No lugar do Lucas, o que você faria? | igual (já mostra a situação inteira) |
| P019 | C06·A1·q02 | (mantido) | (mantido) | + “No lugar do Bruno, o que você responde?” (a pergunta passa a fechar o enunciado) |
| P022 | C07·A1·q02 | (mantido) | (mantido) | + “No lugar do André, o que você confirma antes de sair?” (a pergunta passa a fechar o enunciado) |
| P029 | C08·A1·q01 | O que você faria no lugar do Luan? | No lugar do Luan, o que você faria? | igual (já mostra a situação inteira) |
| P030 | C08·A1·q02 | O que você faria no lugar da Sara? | No lugar da Sara, o que você faria? | igual (já mostra a situação inteira) |
| P032 | C08·A2·q03 | O que você faria no lugar da Sara? | No lugar da Sara, o que você faria? | igual (já mostra a situação inteira) |
| P034 | C09·A1·q02 | (mantido) | (mantido) | + “No lugar do Ícaro, o que você faz antes de postar?” (a pergunta passa a fechar o enunciado) |
| P037 | C09·A2·q03 | O que você faria no lugar da Malu? | No lugar da Malu, o que você faria? | igual (já mostra a situação inteira) |
| P043 | C10·A2·q03 | O que você faria no lugar do Henrique? | No lugar do Henrique, como você continuaria? | igual (já mostra a situação inteira) |
| P056 | C12·A1·q01 | O que você faria no lugar da Alana? | No lugar da Alana, o que você faria? | igual (já mostra a situação inteira) |
| P059 | C13·A1·q11 | (mantido) | (mantido) | + “No lugar da Luana, o que você pergunta à supervisora?” (a pergunta passa a fechar o enunciado) |
| P070 | C13·A4·q07 | (mantido) | (mantido) | + “No lugar do Caio, como você evita repetir a falha?” (a pergunta passa a fechar o enunciado) |
| P086 | C14·A1·q02 | (mantido) | (mantido) | + “Que habilidade isso mostra?” (a pergunta passa a fechar o enunciado) |
| P089 | C14·A2·q04 | (mantido) | (mantido) | + “Com pouco tempo, que parte da vaga você lê primeiro?” (a pergunta passa a fechar o enunciado) |
| P091 | C14·A3·q06 | Pedem R$ 49,90 para garantir sua vaga. O que você faz? | O que você faz com esse pedido de pagamento? | + “Para garantir a vaga, pedem R$ 49,90. O que você faz com esse pedido de pagamento?” (a pergunta passa a fechar o enunciado) |
| P094 | C14·A5·q09 | (mantido) | (mantido) | + “Qual foto você usa no perfil?” (a pergunta passa a fechar o enunciado) |
| P095 | C14·A5·q10 | (mantido) | (mantido) | + “Qual título você coloca no perfil?” (a pergunta passa a fechar o enunciado) |
| P105 | C14·A6·q12 | A pessoa não respondeu em uma semana. E agora? | O que você faz depois de uma semana sem resposta? | + “A pessoa não respondeu em uma semana. O que você faz depois de uma semana sem resposta?” (a pergunta passa a fechar o enunciado) |
| P107 | C14·A7·q13 | O teste online tem prazo de três dias. Quando você faz? | Quando você faz o teste? | + “O prazo é de três dias. Quando você faz o teste?” (a pergunta passa a fechar o enunciado) |
| P111 | C14·A8·q15 | Faltam 5 minutos e o grupo não decidiu. O que você faz? | O que você faz para o grupo decidir a tempo? | + “Faltam 5 minutos e o grupo ainda não decidiu. O que você faz para o grupo decidir a tempo?” (a pergunta passa a fechar o enunciado) |
| P116 | C14·A9·q18 | Deu branco no meio da apresentação. O que você faz? | O que você faz quando dá branco no meio da apresentação? | + “O que você faz quando dá branco no meio da apresentação?” (a pergunta passa a fechar o enunciado) |
| P120 | C14·A10·q20 | (mantido) | (mantido) | + “Qual frase mostra melhor a sua parte?” (a pergunta passa a fechar o enunciado) |
| P126 | C14·A11·q21 | "Qual é o seu ponto fraco?" | Como você responde sobre o seu ponto fraco? | “…A recrutadora pergunta:” → “A recrutadora pergunta qual é o seu ponto fraco. Como você responde sobre o seu ponto fraco?” |
| P127 | C14·A11·q22 | "Por que você quer trabalhar aqui?" | Como você responde por que quer trabalhar ali? | “…A recrutadora pergunta:” → “A recrutadora pergunta por que você quer trabalhar ali. Como você responde por que quer trabalhar ali?” |
| P130 | C14·A12·q24 | (mantido) | (mantido) | + “Onde você se posiciona para a entrevista online?” (a pergunta passa a fechar o enunciado) |

Observações: "(mantido)" no título = já estava no padrão ou já era pergunta direta em 2ª pessoa; só o enunciado mudou. Em C14·A11·q21 e q22 a citação da recrutadora virou fala indireta no quadro ("A recrutadora pergunta qual é o seu ponto fraco."), porque uma citação com "?" no fim seria tomada como título; a fala gravada do vídeo continua com a pergunta literal.

## 2. Missão

### Anúncio falado ausente (5): C09·A2, C11·A2, C14·A6, C14·A9, C14·A11

**Causa: foi decisão editorial, não esquecimento.** A revisão final (`docs/qa/revisao-final/revisao-fable.md`, item P1, aplicada em `aplicado.md`) cortou o plano `missao` dessas cinco aberturas (`media.adjust.drop: ['missao']`) porque a frase "No fim desta aula, tem uma missão para você: …" caía no meio do raciocínio e separava pronome do referente ("E indicação começa…", "Essa costuma ser…", "Talvez uma delas…"). Nas outras 35 aberturas a frase está num bloco à parte e foi mantida.

**Correção sem regravar.** A ponte escrita da própria atividade (`intro`, no topo do "Na prática") passa a abrir com "Esta é a missão da aula." O aluno vê o título da missão e o rótulo "Na prática" logo abaixo. A frase não diz "no fim", porque em C14·A6 a atividade fica no meio.

| Achado | Onde | Ponte antes | Ponte depois |
|---|---|---|---|
| P036 | C09·A2·m02 | Você viu que, se algo escapou, o caminho é parar a divulgação e avisar. Agora monte o seu aviso. | Esta é a missão da aula. Você viu que, se algo escapou, o caminho é parar a divulgação e avisar. Agora monte o seu aviso. |
| P050 | C11·A2·m02 | Você viu que orientações diferentes se resolvem confirmando qual vale. Agora monte a pergunta para esclarecer a sua. | Esta é a missão da aula. Você viu que orientações diferentes se resolvem confirmando qual vale. Agora monte a pergunta para esclarecer a sua. |
| P104 | C14·A6·m05 | Você viu que uma mensagem curta e um pedido simples abrem conversas. Agora monte a sua mensagem. | Esta é a missão da aula. Você viu que uma mensagem curta e um pedido simples abrem conversas. Agora monte a sua mensagem. |
| P115 | C14·A9·m08 | Você viu que a apresentação cabe em três frases ligadas à vaga. Agora monte a sua. | Esta é a missão da aula. Você viu que a apresentação cabe em três frases ligadas à vaga. Agora monte a sua. |
| P125 | C14·A11·m10 | Você viu que um ponto a melhorar convence quando é real e tem uma ação. Agora monte o seu. | Esta é a missão da aula. Você viu que um ponto a melhorar convence quando é real e tem uma ação. Agora monte o seu. |

O robô vai continuar apontando "Missão não anunciada" nessas cinco aulas, porque ele procura a frase **falada** na abertura. A ponte escrita corrige o que o aluno vê; só a regravação corrige o que ele ouve.

### Fala da missão nas 5 aberturas: plano novo já no rascunho, falta gravar (aprovação do dono)

Aplicado em 31/10 (script `qa-missao-falada.ts`, depois do `emendas.md`). Cada fala é um **plano novo** (`missao`, o mesmo id do plano que a revisão final tirou com `media.adjust.drop: ['missao']`) inserido na direção do vídeo de abertura, entre o último plano de conteúdo e a `chamada` da pergunta. A narração do nó passou a ser a soma dos planos e o vídeo ficou marcado como desatualizado (`media.stale`), o que o põe no orçamento. **Nenhum vídeo foi gravado.** Textos: os da tabela sugerida, revisados e mantidos (são os mesmos usados nas outras 35 aberturas; em C14·A6 "Daqui a pouco", porque a atividade fica no meio da aula).

| Aula | Nó · plano | Posição | Fala | Depois do vídeo |
|---|---|---|---|---|
| C09·A2 | `v02` `missao` | depois de «…um problema sem ampliar a divulgação.» (s4), antes de `chamada` | No fim desta aula, tem uma missão para você: avise sobre uma publicação. | pergunta q03 → atividade m02 |
| C11·A2 | `v02` `missao` | depois de «…inicial era confirmar no sistema antes.» (s4), antes de `chamada` | No fim desta aula, tem uma missão para você: esclareça uma diferença. | pergunta q03 → vídeo v03 → atividade m02 |
| C14·A6 | `v11` `missao` | depois de «…outra pessoa e siga em frente.» (s5), antes de `chamada` | Daqui a pouco, você tem uma missão: escreva sua mensagem. | pergunta q11 → atividade m05 (no meio da aula) → pergunta q12 |
| C14·A9 | `v16` `missao` | depois de «…abre caminho para as próximas perguntas.» (s4), antes de `chamada` | No fim desta aula, tem uma missão para você: prepare sua apresentação. | pergunta q17 → vídeo v17 → pergunta q18 → atividade m08 |
| C14·A11 | `v20` `missao` | depois de «…escola.’ Real, pequeno e com ação.» (s4), antes de `chamada` | No fim desta aula, tem uma missão para você: escolha seu ponto a melhorar. | pergunta q21 → vídeo v21 → perguntas q22, q23 → atividade m10 |

Observação de leitura (C11·A2): a chamada que vem depois ("Agora, responda: o que o Miguel faz?") continua grudada à história do Miguel; a fala da missão entra entre as duas, como o dono pediu. Se preferir a missão ANTES da história do Miguel (mais natural), é só mover o plano `missao` para antes de `s4` e regravar.

### Atividade no meio (2) e "Continuar aula" não leva ao fim (1): todos em C14·A6

**Decisão: é desenho intencional; não reordenei.** A aula é `v11 → q11 → m05 (Escreva sua mensagem) → q12 (a pessoa não respondeu em uma semana) → fim`. A revisão final registrou: "a ordem atual é a certa narrativamente (escreve a mensagem → 'a pessoa não respondeu em uma semana')" (`revisao-fable.md`, item 33). A pergunta q12 só faz sentido depois de o aluno ter escrito a mensagem; com a atividade no fim, a história se desfaz. Já em C14·A11 a revisão **moveu** a atividade para o fim (`m10` depois de `q23`), e é por isso que só A6 aparece.

"Continuar aula" não promete o fim: é o botão genérico depois de "Resposta salva no Meu roteiro." e ele leva à próxima etapa (q12), que é o esperado. O que prometia o fim era a frase falada "No fim desta aula…", e ela já saiu da abertura de A6. A ponte nova ("Esta é a missão da aula.") não fala de posição. Nada mais a mudar. O robô trata "atividade no meio" como defeito por regra geral; sugiro tratar A6 como exceção documentada.

### Vídeo final não chama a missão: 30 falas novas no rascunho, falta gravar (aprovação do dono)

**Os "13 menores" do robô são 13 achados, um por curso, que somam 31 aulas** (C01 A1-A2 · C03 A1 · C04 A1 · C05 A1 · C06 A1 · C07 A1-A2 · C08 A1-A2 · C09 A1-A2 · C10 A1-A2 · C11 A1 · C12 A1 · C13 A1-A5 · C14 A1, A2, A4-A11). Foram feitas as 31: 30 falas de fecho (`missao_fim`) + a de C14·A6, que é a abertura e o último vídeo ao mesmo tempo (um plano só atende os dois achados). O robô procura "missão/na prática/monte/seu roteiro/atividade" nos últimos 260 caracteres da fala do último vídeo longo (a mesma lógica da vinheta do player: última cena narrada com vídeo); com o plano novo, todas passam.

Cada fala é **um plano novo** (`missao_fim`) na direção do último vídeo longo, mesma câmera do plano vizinho, gesto diferente dos vizinhos, corte seco. Como é a ordem real da aula (`vinheta → …`):
- **Atividade logo depois da vinheta** (8 aulas): a fala fecha o vídeo ("Agora é com você: a missão desta aula é …").
- **Pergunta(s) entre o vídeo e a atividade** (22 aulas): a fala não pode dizer "agora" (a pergunta vem primeiro). Ela entra antes da situação/chamada da pergunta, que continua sendo a ÚLTIMA fala do vídeo (`chamada` intacta), e promete só o que vem: "depois da pergunta", "daqui a pouco", "mais adiante". Em C14·A11 são duas perguntas ("depois das duas próximas perguntas").
- Onde a abertura já anuncia a missão (C09·A2, C14·A9, C14·A11) a chamada final é mais curta.

| Aula | Nó · plano | Posição | Fala | Depois do vídeo |
|---|---|---|---|---|
| C01·A1 | `v01` `missao_fim` | depois de «…Preparação começa por esclarecer o combinado.» (s4), antes de `s5` | Depois da próxima pergunta, vem a missão desta aula: confirme sua chegada. | vinheta → pergunta q02 → atividade m01 |
| C01·A2 | `v03` `missao_fim` | depois de «…informações importantes ao longo do dia.» (s6), no fim do vídeo | Agora é com você: a missão desta aula é avisar um imprevisto. | vinheta → atividade m02 |
| C03·A1 | `v01` `missao_fim` | depois de «…dos colegas vale para qualquer contexto.» (s5), antes de `chamada` | Daqui a pouco, você tem uma missão: confirme o uso permitido. | vinheta → pergunta q02 → atividade m01 |
| C04·A1 | `v01` `missao_fim` | depois de «…autorizado e envie só o necessário.» (s4), antes de `chamada` | Mais adiante, tem uma missão para você: monte uma mensagem de trabalho. | vinheta → pergunta q02 → atividade m01 |
| C05·A1 | `v01` `missao_fim` | depois de «…o ônibus tem atrasado com frequência.» (s5), antes de `chamada` | A missão desta aula vem logo depois da pergunta: confirme os horários. | vinheta → pergunta q02 → atividade m01 |
| C06·A1 | `v01` `missao_fim` | depois de «…vem de conversas e atitudes respeitosas.» (s5), antes de `s6` | Mais adiante, a missão desta aula: respeite uma preferência. | vinheta → pergunta q02 → atividade m01 |
| C07·A1 | `v01` `missao_fim` | depois de «…recebeu uma orientação com duas etapas.» (s4), antes de `chamada` | Depois da pergunta, tem a missão: peça uma conversa. | vinheta → pergunta q02 → atividade m01 |
| C07·A2 | `v03` `missao_fim` | depois de «…para ajudar a tratar a situação.» (s5), no fim do vídeo | A seguir, a sua missão: apresente uma diferença. | vinheta → atividade m02 |
| C08·A1 | `v01` `missao_fim` | depois de «…depois e quem faz a manutenção.» (s3), antes de `s4` | Já deixo avisado: depois da próxima pergunta, sua missão é combinar o cuidado com o espaço. | vinheta → pergunta q02 → atividade m01 |
| C08·A2 | `v03` `missao_fim` | depois de «…comunicar o que precisa de orientação.» (s5), no fim do vídeo | Hora da missão: avise sobre um problema no espaço. | vinheta → atividade m02 |
| C09·A1 | `v01` `missao_fim` | depois de «…o ambiente ou identificar outras pessoas.» (s6), antes de `chamada` | Logo depois da pergunta, vem a sua missão: confirme antes de publicar. | vinheta → pergunta q02 → atividade m01 |
| C09·A2 | `v03` `missao_fim` | depois de «…sem expor o assunto em público.» (s5), no fim do vídeo | Chegou a hora da missão: avise sobre uma publicação. | vinheta → atividade m02 |
| C10·A1 | `v01` `missao_fim` | depois de «…use uma versão incompleta sem saber.» (s4), antes de `s5` | Daqui a pouco, você faz a missão desta aula: comunique sua entrega. | vinheta → pergunta q02 → atividade m01 |
| C10·A2 | `v03` `missao_fim` | depois de «…bem e perguntar pelo próximo passo.» (s4), no fim do vídeo | Sua missão agora é alinhar a próxima atividade. | vinheta → atividade m02 |
| C11·A1 | `v01` `missao_fim` | depois de «…você não consegue aprender a regra.» (s4), antes de `s5` | Mais adiante, tem uma missão para você: peça um exemplo. | vinheta → pergunta q02 → atividade m01 |
| C12·A1 | `v01` `missao_fim` | depois de «…que poderá praticar na próxima situação.» (s5), antes de `chamada` | Depois da pergunta, sua missão é pedir uma correção concreta. | vinheta → pergunta q02 → atividade m01 |
| C13·A1 | `v01` `missao_fim` | depois de «…a trabalhar com mais autonomia depois.» (s4), no fim do vídeo | Depois da próxima pergunta, vem a missão: confirme uma tarefa. | vinheta → pergunta q02 → atividade m01 |
| C13·A2 | `v03` `missao_fim` | depois de «…referência para uma situação parecida amanhã.» (s5), no fim do vídeo | Logo depois da pergunta, sua missão é preparar o seu pedido de ajuda. | vinheta → pergunta q04 → atividade m02 |
| C13·A3 | `v05` `missao_fim` | depois de «…cumprir compromissos dentro da rotina combinada.» (s5), no fim do vídeo | Vamos à missão desta aula: alinhe prioridades. | vinheta → atividade m03 |
| C13·A4 | `v07` `missao_fim` | depois de «…as datas antes do próximo envio.» (s5), no fim do vídeo | Daqui a pouco, tem uma missão para você: comunique um problema. | vinheta → pergunta q07 → atividade m04 |
| C13·A5 | `v09` `missao_fim` | depois de «…que você consiga compreender e aplicar.» (s4), no fim do vídeo | Mais adiante, a missão desta aula: combine sua melhoria. | vinheta → pergunta q09 → atividade m05 |
| C14·A1 | `v02` `missao_fim` | depois de «…deixar a habilidade aparecer no exemplo.» (s4), antes de `chamada` | Depois da pergunta, tem a missão: conte sua primeira experiência. | vinheta → pergunta q02 → atividade m01 |
| C14·A2 | `v04` `missao_fim` | depois de «…que você está fazendo para aprender.» (s4), antes de `chamada` | Mais adiante, a missão desta aula: escolha sua vaga-alvo. | vinheta → pergunta q04 → atividade m02 |
| C14·A4 | `v08` `missao_fim` | depois de «…português pode derrubar um currículo bom.» (s4), antes de `chamada` | Logo depois da pergunta, vem a missão: escreva sua linha de currículo. | vinheta → pergunta q08 → atividade m03 |
| C14·A5 | `v10` `missao_fim` | depois de «…em finanças.’ Simples, direto e verdadeiro.» (s3), no fim do vídeo | É hora da missão: escreva o seu Sobre. | vinheta → atividade m04 |
| C14·A7 | `v13` `missao_fim` | depois de «…gratuitos de lógica antes do próximo.» (s4), antes de `chamada` | Depois da pergunta, falta pouco para a missão: monte seu plano para o teste. | vinheta → pergunta q14 → atividade m06 |
| C14·A8 | `v15` `missao_fim` | depois de «…vale mais do que muita fala.» (s4), no fim do vídeo | Para fechar, a sua missão: defina seu papel na dinâmica. | vinheta → atividade m07 |
| C14·A9 | `v17` `missao_fim` | depois de «…onde enrolou e onde ficou claro.» (s3), antes de `chamada` | A missão desta aula chega logo depois da pergunta: prepare sua apresentação. | vinheta → pergunta q18 → atividade m08 |
| C14·A10 | `v19` `missao_fim` | depois de «…não aconteceu. Pequeno e verdadeiro funciona.» (s4), antes de `chamada` | Mais adiante, tem uma missão esperando por você: conte sua história. | vinheta → pergunta q20 → atividade m09 |
| C14·A11 | `v21` `missao_fim` | depois de «…pergunte qual é a faixa prevista.» (s4), antes de `chamada` | Depois das duas próximas perguntas, a missão: escolha seu ponto a melhorar. | vinheta → perguntas q22, q23 → atividade m10 |

### Orçamento da missão falada (nada gravado; `POST /quote`, grátis)

Orçado em 31/10 logado como `autor@demo.local`, depois de aplicar no rascunho. **Total: US$ 5,41 para 35 cenas em 13 cursos** (C02 não tem achado). Cada cena é gravada **parcialmente**: o orçamento reaproveita os planos já pagos (mesma fala, câmera, gesto e layout) e cobra só os planos que não batem. Só os 35 nós que mudei aparecem em `toProduce`; nenhuma outra cena desatualizada apareceu (em C06 aparecem 10 cenas da aula 3, mas já estão com gravação em fila de outro processo: `open`, fora do total).

| Curso | Cenas | Cenas (aula/nó) | Reaproveitado | Custo | quoteId |
|---|---|---|---|---|---|
| C01 | 2 | A1/v01, A2/v03 | 10 planos reaproveitados, 4 a gravar | US$ 0,40 | `mqt_kopd8a8fwydn2p5d` |
| C03 | 1 | A1/v01 | 5 planos reaproveitados, 2 a gravar | US$ 0,15 | `mqt_ngjqcg55837i970t` |
| C04 | 1 | A1/v01 | 5 planos reaproveitados, 1 a gravar | US$ 0,10 | `mqt_mfv9rfj7k7y44kyi` |
| C05 | 1 | A1/v01 | 5 planos reaproveitados, 2 a gravar | US$ 0,17 | `mqt_1ojrzm37j96o0gdz` |
| C06 | 1 | A1/v01 | 5 planos reaproveitados, 3 a gravar | US$ 0,17 | `mqt_237uc3a0gq0169cc` |
| C07 | 2 | A1/v01, A2/v03 | 9 planos reaproveitados, 3 a gravar | US$ 0,23 | `mqt_68it0imts575vz7e` |
| C08 | 2 | A1/v01, A2/v03 | 8 planos reaproveitados, 4 a gravar | US$ 0,46 | `mqt_86nkiqb494atcdsc` |
| C09 | 3 | A1/v01, A2/v02, A2/v03 | 16 planos reaproveitados, 3 a gravar | US$ 0,29 | `mqt_jy1925714vce77fs` |
| C10 | 2 | A1/v01, A2/v03 | 9 planos reaproveitados, 3 a gravar | US$ 0,23 | `mqt_85rf292v48m8v7lg` |
| C11 | 2 | A1/v01, A2/v02 | 9 planos reaproveitados, 4 a gravar | US$ 0,31 | `mqt_q4hzyjh62morzhyw` |
| C12 | 1 | A1/v01 | 6 planos reaproveitados, 1 a gravar | US$ 0,08 | `mqt_l1zpkss5zj20m932` |
| C13 | 5 | A1/v01, A2/v03, A3/v05, A4/v07, A5/v09 | 23 planos reaproveitados, 5 a gravar | US$ 0,42 | `mqt_qoo37h9b2m1g1lwq` |
| C14 | 12 | A1/v02, A2/v04, A4/v08, A5/v10, A6/v11, A7/v13, A8/v15, A9/v16, A9/v17, A10/v19, A11/v20, A11/v21 | 46 planos reaproveitados, 16 a gravar | US$ 2,39 | `mqt_sa9pfx2maj4f4rv1` |

Dos US$ 5,41, só cerca de US$ 3,23 são as falas novas; cerca de **US$ 2,18 são a regravação de planos que o ajuste fino já tinha cortado** (a fala cortada está no rascunho com o texto encurtado, então não bate com o plano pago e o orçamento a cobra de novo; é o comportamento de qualquer regravação dessas cenas, não efeito do plano novo). Maior caso: C14·A7 v13 custa US$ 0,65 (cena inteira), porque um plano já cortado ficou com 3 palavras ("Terceiro: faça sozinho.") e o orçamento, por regra, não reaproveita nada quando sobra plano com menos de 4 palavras; só o plano novo custaria cerca de US$ 0,11.

**Teto de mídia** (`workspaces.spend_limits.mediaDailyUsd`): US$ 140 por janela de 24 h. Gasto nas últimas 24 h: US$ 103,64. Com este lote: US$ 109,05, sobra US$ 30,95. Cabe, mas outros cursos estão gravando na fila e o teto é deslizante.

**Riscos ao ajuste fino (conferidos por simulação de `carryAdjust` em cada um dos 35 nós, antes e depois):**
- Os cortes e planos tirados (`media.adjust.cut`, `drop`) são guardados por **id de plano**, não por posição, então inserir um plano não desloca nada. Os planos existentes não mudaram em nada (câmera, fala, gesto, ordem relativa); `media.adjust` ficou intacto (diff do rascunho conferido nos 14 cursos: só `direction.shots`, `narration` e `media.stale` mudaram, nos 35 nós).
- O plano `missao_fim` é um id que a gravação antiga não tinha, e `carryAdjust` trata plano novo como "abertura reescrita" e solta os cortes. **Isso não custa nada aqui**: nos 35 nós o pedido reaplicado depois da regravação é idêntico antes e depois do plano novo (só o cartão "Pergunta a seguir"/`teaser`), porque os cortes já estão embutidos nas falas do rascunho (a fala do plano cortado já foi encurtada) e nunca eram reaplicados.
- Nas 5 aberturas o plano reaproveita o id `missao`; `media.adjust.drop: ['missao']` continua lá, mas a fala nova é diferente da antiga, então `carryAdjust` não tira o plano de novo ("fala mudou").
- **C13·A1·q11 não foi tocado** (o corte manual é do nó `q11`; os alvos de C13 são os vídeos `v01`, `v03`, `v05`, `v07`, `v09`).
- Cuidado: o plano novo existe **só no rascunho** até a gravação. Qualquer remontagem/ajuste fino dessas cenas antes de gravar (`remontar-emendas.ts`, a tela de ajuste fino) recomeça do job de origem e apaga o plano novo da direção (a narração ficaria com a fala e o orçamento recusaria a cena como "direção desatualizada": falha visível, não silenciosa). A ordem certa é **gravar primeiro, remontar depois** (vale para o C06, que as emendas deixaram para depois da gravação).
- `media.stale = true` nas 35 cenas: o aluno continua vendo o vídeo antigo até gravar e publicar; o estúdio mostra "vídeo desatualizado" (aviso `MEDIA_STALE`, não bloqueia publicar).

**Para gravar, depois da aprovação do dono** (não rodei; o orçamento vence em 30 min e vira inválido se o rascunho mudar, então orce de novo na hora):
1. Orçar: `python3 -I /private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/orcar_missao.py <saida.json> <courseId>…` (só `POST /api/courses/:id/media-jobs/quote` com `includeStale:true`; imprime `quoteId` e total por curso).
2. Gravar cada curso: `POST /api/courses/:courseId/media-jobs/batch` com `{"quoteId":"<id>","confirmPaid":true}` (logado como autor). Para gravar só parte, orce com `nodeIds` (ex.: pular C14·A7 v13, que é o mais caro).
3. Depois: `remontar-emendas.ts crs_b8zeh4b2gguseghq` (C06) e conferir com o robô; publicar.

## 3. Menores fáceis de texto

### Opção fora da 1ª pessoa (13): revertido por decisão do dono (item 5)

> **Revertido por decisão do dono (item 5 de `decisoes-linha-de-base.md`, 31/10).** Opções que são escolha de item, fala dirigida a alguém ou continuação de frase ficam aceitas como exceção à 1ª pessoa. Os 18 rótulos abaixo (13 apontados + 5 irmãs) voltaram ao texto da coluna "Antes", no rascunho, pelo script `packages/db/src/scripts/oneoff/qa-opcoes-primeira-pessoa-reverter.ts` (idempotente, `--dry-run`/`--apply`; C13 rascunho 171 → 172, C14 406 → 407). Mudou só `options[].label` (o diff trava qualquer outro caminho) e o conjunto de cenas desatualizadas ficou igual (C13: 5, C14: 12). Registro: `correcoes-opcoes-reversao.antes-depois.json`. O robô deve aceitar essas opções como exceção. A tabela abaixo é o histórico da reescrita que foi desfeita; "Depois" já não vale.


Reescritas em "Eu …" sem mudar o sentido nem a qualidade (qual é a forte, a média, a fraca). Onde o rótulo é uma fala ou uma peça a escolher (pergunta ao supervisor, título de perfil, final de história) usei "Eu pergunto …", "Eu coloco ‘…’", "Eu fecho com: ‘…’". As cinco opções vizinhas marcadas "irmã" mudaram junto para a pergunta não ficar com dois estilos (C13·A1·q11·c, C14·A5·q10·a e c, C14·A10·q19·c, C14·A12·q24·c). **Reações gravadas:** conferi o `reaction.text` e a transcrição do vídeo de todas as opções de cada pergunta; nenhuma repete o rótulo literalmente, então nenhuma ficou de fora por isso. Retornos escritos e reações não foram alterados.

| Achado | Onde | Antes | Depois |
|---|---|---|---|
| P323 | C13·A1·q11·a | “Como você quer a lista e até que horas?” | “Eu pergunto como ela quer a lista e até que horas.” |
| P324 | C13·A1·q11·b | “Tem algum jeito certo de fazer essa lista?” | “Eu pergunto se tem um jeito certo de fazer essa lista.” |
| irmã | C13·A1·q11·c | “Pode deixar, qualquer coisa eu te chamo depois.” | “Eu digo que pode deixar e que chamo depois, se precisar.” |
| irmã | C14·A5·q10·a | “Estudante de Administração · Buscando estágio em finanças” | “Eu coloco ‘Estudante de Administração · Buscando estágio em finanças’.” |
| P393 | C14·A5·q10·b | “Sem experiência, mas com muita vontade de aprender” | “Eu coloco ‘Sem experiência, mas com muita vontade de aprender’.” |
| irmã | C14·A5·q10·c | “Futuro CEO apaixonado por desafios e inovação” | “Eu coloco ‘Futuro CEO apaixonado por desafios e inovação’.” |
| P402 | C14·A6·q11·a | “Oi! Vi seu perfil. Tem alguma vaga aberta aí no hospital?” | “Oi! Eu vi seu perfil. Tem alguma vaga aberta aí no hospital?” |
| P425 | C14·A10·q19·a | “...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.” | “Eu fecho com: ‘...e a feira aconteceu com 42 expositores e ainda sobrou dinheiro.’” |
| P426 | C14·A10·q19·b | “...e foi uma experiência muito legal para todo mundo.” | “Eu fecho com: ‘...e foi uma experiência muito legal para todo mundo.’” |
| irmã | C14·A10·q19·c | “...e acho que todo mundo gostou do meu trabalho.” | “Eu fecho com: ‘...e acho que todo mundo gostou do meu trabalho.’” |
| P427 | C14·A10·q20·a | “A gente fez tudo junto e deu muito certo.” | “Eu e o grupo fizemos tudo junto e deu muito certo.” |
| P428 | C14·A10·q20·c | “O grupo era ótimo, então foi tudo fácil.” | “Eu estava num grupo ótimo, então foi tudo fácil.” |
| P433 | C14·A11·q22·c | “Porque é uma empresa grande e muito conhecida.” | “Porque eu quero trabalhar numa empresa grande e muito conhecida.” |
| P439 | C14·A12·q24·a | “De frente para a janela, com a parede lisa atrás.” | “Eu fico de frente para a janela, com a parede lisa atrás.” |
| P440 | C14·A12·q24·b | “De costas para a janela, que tem uma vista bonita.” | “Eu fico de costas para a janela, que tem uma vista bonita.” |
| irmã | C14·A12·q24·c | “Deitado na cama, segurando o celular na mão.” | “Eu me deito na cama e seguro o celular na mão.” |
| P441 | C14·A12·q25·a | “Como é um dia normal de quem trabalha nessa vaga?” | “Eu pergunto como é um dia normal de quem trabalha nessa vaga.” |
| P442 | C14·A12·q25·c | “Como funcionam os horários e as folgas nesta vaga?” | “Eu pergunto como funcionam os horários e as folgas nesta vaga.” |

Nota: "Vi seu perfil" (C14·A6·q11·a) já estava em 1ª pessoa pelo verbo; coloquei "Eu vi" só para o robô e o padrão fecharem. Se o dono achar o robô exigente demais com mensagens a enviar, dá para reverter essa sem efeito colateral.

### Obrigatória com "Fazer depois" (14): investigação, sem mudar código

**Causa.** São dois conceitos diferentes que o robô lê como um só:
- `required: true` (campo base de todo nó, `packages/course-schema/src/nodes.ts`) significa "conta no progresso quando está no caminho do aluno" (`computeProgress` em `course-engine/src/progress.ts`). Todas as atividades "Na prática" têm `required: true`.
- "Fazer depois" aparece quando `minLength === 0` (`immersive-player.tsx`, `const optional = node.minLength === 0`), e o motor aceita texto vazio nesse caso (`engine.ts`: `text.length < node.minLength`). Todas as atividades de molde têm `minLength: 0` (o tamanho mínimo não faz sentido para uma frase montada por blocos).

Resultado: a atividade conta como etapa obrigatória do caminho, mas o aluno pode pular com texto vazio, e o Meu roteiro mostra o texto de vazio ("Completar quando quiser"). Isso parece decisão de produto (o botão antigo era "Pular"), não erro de dado, e é igual em todos os cursos (C14: 10 das 12 aulas, as outras duas não têm atividade).

**Se o dono quiser que a missão seja de fato obrigatória:** basta `minLength` maior que 0 nas atividades (dado, sem código; um mínimo pequeno, já que a frase montada por blocos é bem maior, e o botão "Fazer depois" some sozinho). Se quiser que seja opcional, tirar `required` das atividades (ou mudar o robô para olhar `minLength`). Não alterei nada.

> **Resolvido por decisão do dono (item 2, 31/10): a atividade é opcional.** `required: false` nas 66 atividades dos 26 cursos (14 atuais + 12 novos) pelo script `qa-atividade-opcional.ts`; `minLength: 0` e "Fazer depois" ficaram. Detalhes e efeito na conclusão em `correcoes-player.md`.

## Como conferir e desfazer

- Scripts (rodar do repositório com `DATABASE_URL` do ambiente local): `packages/db/src/scripts/oneoff/qa-titulos-perguntas.ts`, `qa-opcoes-primeira-pessoa.ts`, `qa-ponte-missao.ts` (apoio comum em `_rascunho-qa.ts`). Padrão é `--dry-run`; `--apply` grava; `--saida arquivo.json` muda onde fica o antes/depois. São idempotentes (segunda rodada: 0 a aplicar, 64 já aplicados) e guardam o valor esperado: se alguém mexeu no texto, o item aparece como "divergente" e não é tocado. Antes de gravar, um diff confere que só mudaram `title`, `prompt`, `options[].label` e `intro`; qualquer outro caminho (mídia, `media.adjust`, falas) aborta sem gravar. Em conflito de revisão (a gravação paga e o ajuste fino também escrevem no rascunho), relê e tenta de novo.
- Antes/depois campo a campo (JSON): `docs/qa/lancamento/robo/correcoes-titulos.antes-depois.json`, `correcoes-opcoes.antes-depois.json`, `correcoes-missao.antes-depois.json`, `correcoes-missao-falada.antes-depois.json` (falas dos planos, revisões, simulação do ajuste carregado e planos que o orçamento cobra).
- Missão falada: `packages/db/src/scripts/oneoff/qa-missao-falada.ts` (`--dry-run` por padrão; `--apply` só roda se existir `docs/qa/lancamento/emendas.md`; `--so=C14,C09/aula_02`). Idempotente (2ª rodada: 35 já aplicados). O diff só deixa passar plano inserido em `direction.shots`, `narration` e `media.stale` dos nós-alvo; `media.adjust` não é tocado.
- Desfazer: restaurar a revisão anterior de cada curso (o histórico guarda tudo; `restoreDraftRevision`). Revisões geradas (antes → depois):

| Curso | Títulos e enunciados | Opções | Missão |
|---|---|---|---|
| C01 | 84 → 85 | — | — |
| C02 | 85 → 86 | — | — |
| C03 | 83 → 84 | — | — |
| C04 | 104 → 105 | — | — |
| C05 | 88 → 89 | — | — |
| C06 | 102 → 103 | — | — |
| C07 | 88 → 89 | — | — |
| C08 | 85 → 86 | — | — |
| C09 | 93 → 94 | — | 94 → 95 |
| C10 | 89 → 90 | — | — |
| C11 | — | — | 85 → 86 |
| C12 | 87 → 88 | — | — |
| C13 | 167 → 168 | 168 → 169 | — |
| C14 | 401 → 402 | 402 → 403 | 403 → 404 |

Missão falada (antes → depois): C01 85 → 86 · C03 84 → 85 · C04 105 → 106 · C05 89 → 90 · C06 103 → 104 · C07 89 → 90 · C08 86 → 87 · C09 95 → 96 · C10 90 → 91 · C11 86 → 87 · C12 88 → 89 · C13 169 → 170 · C14 404 → 405 (C02 não tem achado). Desfazer: restaurar a revisão "antes" de cada curso (só vale se ninguém gravou depois).

## Fora do pedido, para o dono saber

- C06 tem uma 3ª aula só no rascunho (`aula_03`, 43 aulas no total; a publicada e o robô têm 42). Não foi testada pelo robô; seus títulos já seguem o padrão ou são perguntas em 2ª pessoa.
- Para o aluno ver tudo isto é preciso **publicar** (as correções de título de 15:54 também). Os vídeos não ficaram desatualizados por estas mudanças (`media.stale` intocado).
