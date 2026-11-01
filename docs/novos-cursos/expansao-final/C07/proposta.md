# C07 · “Como falar com a equipe” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (para o agente aplicar no rascunho). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutor: Gustavo._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | 4 min (186.7–194.0 s) | **cerca de 4.9–5.0 min** (291.6–299.7 s) |
| Missão | montar frase em blocos (2×) | as duas ficam como exercício · **uma orientação real devolvida com suas palavras antes de executar**, com “Como foi?” |
| Decisão nova | — | 1 (“Você decide”: o que acrescentar quando o prazo está confirmado e falta o acesso) |
| Fim do curso | tela de texto genérica, sem fala | despedida do Gustavo em vídeo (56 palavras) + frase de fechamento própria |
| Aberturas | 2 planos “No fim desta aula, tem uma missão para você: …” | 2 promessas próprias, sem a palavra “missão” |

**Fala nova a gravar:** 15 planos (277 palavras, ~105.7 s) + 3 reações (63 palavras, ~24.0 s) = **~129.8 s (2.2 min) ≈ US$ 2.38** a US$ 0,0183/s. Alvo 90–130 s, teto 150 s.

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto (custo zero) · 🎙️ troca a fala do plano (mesmo id, regrava) · ➕ novo (grava).

## 1 · A lacuna do C07

1. As duas missões (m01, m02) são montagem de frase em blocos; nada acontece fora da tela.
2. O curso ensina a pedir orientação e a esclarecer um prazo, mas para quando o prazo fica claro. Não trata o que vem em seguida: falta o acesso ao arquivo, e esse é o tipo de coisa que o jovem esconde.
3. Não diz que confirmar entendimento não é concordar com o impossível: dá para dizer “entendi” e, na mesma frase, “me falta isto”.
4. As aberturas das duas aulas usam a fórmula “No fim desta aula, tem uma missão para você: …”; os missao_fim de v01 e v03 já saíram na Fase 0.
5. O curso termina numa tela de texto genérica: sem fecho do Gustavo, sem as duas perguntas que são a marca dele.

Por isso a aula 3 não repete “qual prazo vale?” (v03 e q03 já fazem isso) nem a frase para pedir orientação (v01). Ela começa depois da resposta “é hoje”: **o acesso que falta, a decisão de dizer ou esconder, confirmar sem concordar com o impossível, uma orientação real devolvida com as próprias palavras e o fecho do Gustavo.** A demonstração do pacote foi descartada (repetia a v03); a decisão e o aprofundamento entram reescritos.

## 2 · Aulas existentes: texto e a abertura de cada prática

### Aula 1 · Como pedir orientação no momento certo
- **v00/missao 🎙️** (17 pal · ~6.5 s) — era: “No fim desta aula, tem uma missão para você: peça uma conversa.”
  > O pedido de conversa com quem orienta você, você monta hoje: assunto, motivo e um horário possível.
- **m01 ✏️**: Só a instrução: o componente é de blocos.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_01 ✏️**: Só acrescenta a frase de fechamento (hoje null).
  - closingLine: “Urgência de verdade passa na frente. O resto espera o canal combinado.”

### Aula 2 · Como esclarecer uma diferença de entendimento
- **v02/missao 🎙️** (20 pal · ~7.6 s) — era: “No fim desta aula, tem uma missão para você: apresente uma diferença.”
  > Daqui a pouco, a frase é sua: o que você entendeu, o que mudou e o que vocês precisam confirmar.
- **m02 ✏️**: Só a instrução. Título “Apresente uma diferença” fica: a prática não muda.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_02 ✏️**: Deixa de ser o fim do curso: “Curso concluído” passa para fim_aula_03.
  - outcomeLabel: “Aula concluída”
  - summary: “Uma diferença se esclarece com fatos e uma proposta, sem provar quem errou. Se você salvou, sua frase fica no Meu roteiro. Na próxima aula, o prazo está claro, mas falta uma coisa para começar, e é a que a gente costuma esconder.”
  - closingLine: “Esclarecer o prazo, sim. Provar quem errou, não.”

- **Cortes: nenhum novo.** Os missao_fim de v01 e v03 já saíram na Fase 0 (status a). As duas aberturas são o único anúncio de m01/m02 e são trocadas, não tiradas.

---

## 3 · Aula 3 · Prazo confirmado. E o que falta para começar? ➕ nova
_Módulo: Pratique os combinados · O prazo está claro, mas falta o acesso. Você decide se diz ou esconde, vê que confirmar não é concordar com o impossível e devolve uma orientação real com suas palavras. · ~4 min_  
Caminho: v04 → q04 → v05 → m03 → despedida → fim_aula_03

### v04 · Cena ➕: Acesso negado
- `s1` ➕ (19 pal · ~7.3 s)
  > A Elisa esclareceu o prazo: é hoje. Pronto? Ainda não. Tem uma segunda pergunta, e essa a gente engole.
- `promessa` ➕ (20 pal · ~7.6 s)
  > Antes de terminar, você pega uma orientação real e devolve com suas palavras: o quê, até quando, o que falta.
- `s2` ➕ (19 pal · ~7.3 s)
  > Ela abre a pasta para começar a lista. Acesso negado. O arquivo está numa área que ela não abre.
- `s3` ➕ (16 pal · ~6.1 s)
  > Quem confirmou o prazo ainda está na sala. A Elisa já disse que entendeu: é hoje.
- `chamada` ➕ (10 pal · ~3.8 s)
  > No lugar da Elisa, o que você acrescenta à conversa?

<small>Cartão “Pergunta a seguir”: O prazo foi confirmado: é hoje. A Elisa não tem acesso ao arquivo da lista. Quem confirmou ainda está na sala. O que você acrescenta?</small>

### q04 · Você decide ➕
**No lugar da Elisa, o que você acrescenta à conversa?**  
_O prazo foi confirmado: é hoje. A Elisa não tem acesso ao arquivo da lista. Quem confirmou ainda está na sala._

- **A** (fraca) “Nada. Confirmo o prazo e tento conseguir o acesso depois, por conta própria.”
  - Gustavo reage (21 pal · ~8.0 s): “Você confirmou o prazo e escondeu o problema. Se o acesso demorar, às cinco a pergunta será: por que não avisou?”
  - Retorno escrito: O prazo fica confirmado, mas ninguém sabe que sem o arquivo nada começa. Se o acesso demorar, a culpa parece sua. Faça assim: diga agora o que falta para começar.
- **B** (média) “Digo que vou tentar entregar hoje e peço o acesso pelo grupo da equipe.”
  - Gustavo reage (20 pal · ~7.6 s): “Você falou do acesso, bom. Mas “vou tentar” esconde o tamanho do problema. Sem o arquivo, não começa. Diga isso.”
  - Retorno escrito: Você já sinaliza o acesso, mas “vou tentar” não diz que sem o arquivo nada começa, e o grupo pode demorar. Faça assim: diga direto, a quem confirmou: preciso do acesso para começar.
- **C** (melhor) “Confirmo o prazo e aviso que preciso do acesso ao arquivo para conseguir começar.”
  - Gustavo reage (22 pal · ~8.4 s): “Duas informações, uma frase: é hoje, e falta o acesso. Agora a pessoa pode resolver. Confirmar não é concordar com o impossível.”
  - Retorno escrito: Você mostra o que falta e dá à pessoa a chance de resolver agora. Faça assim: “entendi, é hoje; preciso do acesso à pasta para começar. Quem libera?”

A resposta não está no enunciado: ele diz que o prazo está confirmado e que falta o acesso; perceber que a falta de acesso é informação para quem confirmou, agora, e não um problema para resolver depois sozinha, é a decisão. Sem vídeo próprio da pergunta.

### v05 · Explicação ➕: Confirmar não é concordar com o impossível
- `s1` ➕ (22 pal · ~8.4 s)
  > Aqui existem duas perguntas. Qual é o prazo? E o que falta para começar? A primeira a gente faz. A segunda, esconde.
- `s2` ➕ (20 pal · ~7.6 s · card)
  > Confirmar entendimento não é concordar com algo impossível. Diga o que entendeu, e o que falta: acesso, material, orientação, tempo.
  <br><small>cartão «Duas perguntas»: **Qual é o prazo?** · **O que falta para começar?** · Falta: acesso · material · orientação · tempo</small>
- `s3` ➕ (19 pal · ~7.3 s)
  > Depois, registre o combinado numa frase: começo a lista quando o acesso chegar, e revisamos o prazo do relatório.
- `s4` ➕ (19 pal · ~7.3 s)
  > Vale para escola, curso, casa. Alguém te pede algo? Devolva: entendi isso, até tal dia, e me falta aquilo.
- `lancamento` ➕ (20 pal · ~7.6 s)
  > Então, na próxima orientação que receber, antes de executar, devolva com suas palavras: o quê, até quando, o que falta.

Não repete v01 (assunto, necessidade, prazo; urgência) nem v03 (qual prazo vale; confirmar o novo combinado; ofensa → apoio, que por isso não volta aqui). O novo: a segunda pergunta; confirmar sem concordar com o impossível; registrar o combinado; devolver com as próprias palavras.

### m03 · Leve para a vida real ➕: Devolva a orientação com suas palavras
**Tipo:** FAZER fora da tela: na próxima orientação real que receber, devolver o quê, até quando e o que falta antes de executar  
**Ponte (intro):** A Elisa disse o que entendeu e o que faltava, na mesma frase. Agora é na sua semana, com uma orientação de verdade.  
**Ação:**

1. Espere a próxima orientação que você receber: um pedido na escola, no curso, em casa, no trabalho.
2. Antes de executar, devolva, em voz alta ou por mensagem: “Entendi que é [o quê], até [quando]. Para começar, me falta [o quê].” Se não falta nada, diga isso também.
3. Repare na resposta: a pessoa corrigiu algo? Liberou o que faltava?
4. Volte aqui, marque “Já experimentei” e conte o que aconteceu.

**Para quem não trabalha (e para quem trabalha):** Não trabalha? Serve a professora que passou um trabalho, alguém da família que pediu uma coisa, o instrutor do curso. Orientação é o que não falta. Se trabalha, escolha a próxima tarefa que vier com prazo.  
**Exemplo: a nota de um aluno** (visível só ao tocar em “Ver um exemplo”): “Minha mãe: “resolve o negócio do banco”. Devolvi: “Entendi: levar o comprovante na agência até sexta. Me falta o comprovante, que está com você.” Ela riu e me deu o papel.”  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Texto de ajuda: “O que você devolveu, e a pessoa corrigiu ou liberou alguma coisa?” Placeholder: “Ex.: o professor disse “até sexta”, mas quando repeti ele lembrou que era quinta.”  
**Botões:** Já experimentei · Vou fazer depois. Quem escolhe “Vou fazer depois” conclui a aula; m03 e “Como foi?” ficam no Meu roteiro.  
**Sem molde na tela** (draftFromNodeId: null): a ação acontece fora da plataforma, de propósito.

### despedida · Despedida do Gustavo ➕ (depois da missão, antes do fim)
_56 palavras · ~21.4 s · tela: Qual é o prazo? · O que falta para começar?_

> A Elisa pediu orientação na hora certa, mostrou dois prazos sem acusar, e disse o que faltava. Nunca precisou brigar.
>
> Falar com a equipe é separar assunto, dúvida e pedido. E não esconder o que falta. Preparado é quem avisa.
>
> Qual é o prazo? E o que falta para começar? São duas perguntas. Faça as duas.
>

**Forma escolhida: termina com as duas perguntas do Gustavo, entregues ao aluno como orientação concreta; abertura por callback (as três cenas da Elisa). Sem recap, sem “Meu roteiro”, sem link para outro curso na fala.**

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Confirmar o prazo é fácil. Dizer o que falta é o que faz a entrega acontecer.”
- Roteiro · «Minha orientação devolvida»: recebi uma orientação · devolvi: o quê, até quando, o que falta · reparei na resposta · comecei só depois de confirmar
- Roteiro · «Como foi?»: o que o aluno escreveu em m03 (vazio: “Você deixou para depois. Quando fizer, volte e conte como foi.”)
- Roteiro · «O que você levou»: Peça orientação com assunto, prazo e canal. / Diferença de entendimento: fatos, escuta, proposta. / Confirmar não é concordar com o impossível. / Duas perguntas: qual é o prazo? O que falta para começar?

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v04 | 5 | 84 | 32.1 | 0.59 |
| q04 (3 reações) | 3 | 63 | 24.0 | 0.44 |
| v05 | 5 | 100 | 38.2 | 0.70 |
| despedida | 3 | 56 | 21.4 | 0.39 |
| aberturas trocadas (v00/missao, v02/missao) | 2 | 37 | 14.1 | 0.26 |
| **Total novo** | 15+3 | 340 | **129.8** | **2.38** |

- Vídeo que o aluno assiste: antes 186.7–194.0 s (4 min) → depois **291.6–299.7 s (4.9–5.0 min)**. antes + v04 + v05 + despedida + uma reação da q04 (mínima/máxima) + diferença das aberturas trocadas (+5.6 s). O “antes” é o raio-x das 02:33; a Fase 0 tirou os missao_fim de v01 e v03 (−7.5 s), não descontados aqui.
- Opcional: 5 reações antigas abrem com frase repetida em muitos cursos (q01 C, q02 A, q02 C, q03 A, q03 B). Cortar a 1ª frase, grátis, se o ajustador aceitar vídeo de reação; ou regravar só a 2ª frase (~31.3 s ≈ US$ 0.57).
- Tudo o mais (campos das práticas, fins das aulas, descrição do curso) é texto: custo zero.

## 5 · Perguntas para o dono

1. Missão m03 depende de uma orientação chegar na semana: (a) manter como está, com “Vou fazer depois” cobrindo quem não receber nenhuma · (b) pedir que o aluno provoque uma (peça uma tarefa a alguém) para garantir a ação. Recomendo (a): orientação é o que não falta.

2. Opção A da decisão (“Nada. Confirmo e tento conseguir depois”): (a) manter como fraca (é o que acontece de verdade) · (b) usar a do pacote “Prometo entregar hoje e tento conseguir o arquivo depois” (mais explícita, menos realista). Recomendo (a).

3. As 5 reações antigas com abertura repetida: (a) deixar · (b) cortar a primeira frase, se o ajustador aceitar vídeo de reação (grátis) · (c) regravar (~31.3 s, ≈ US$ 0.57). Recomendo (b); se não der, (a).

4. Fim da despedida: (a) terminar nas duas perguntas (“Faça as duas.”) · (b) terminar em “Preparado é quem avisa.” Recomendo (a): é a marca do Gustavo.


## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas; nenhum plano tirado (os `missao_fim` já saíram na Fase 0, onde existiam).
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; Gustavo não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”; as aberturas trocadas têm estrutura diferente entre si.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, retorno escrito com “Faça assim”.
- Missão com alternativa real para quem não trabalha; a aula fecha mesmo que a ação aconteça depois.
- Despedida de 56 palavras, sem o molde de 4 parágrafos; fecha este curso, não um curso qualquer.
