# C02 · “Que roupa eu uso?” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (para o agente aplicar no rascunho). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutora: Camila._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | 3–4 min (173.9–181.3 s) | **cerca de 4.7–4.8 min** (279.1–287.2 s) |
| Missão | montar frase em blocos (2×) | as duas ficam como exercício · **olhar a roupa de um lugar real e anotar a dúvida**, fora da tela, com “Como foi?” |
| Decisão nova | — | 1 (“Você decide”: o que fazer quando a resposta é “venha adequada à função”) |
| Fim do curso | tela de texto genérica, sem fala | despedida da Camila em vídeo (59 palavras) + frase de fechamento própria |
| Aberturas | 2 planos “No fim desta aula, tem uma missão para você: …” | 2 promessas próprias, sem a palavra “missão” |

**Fala nova a gravar:** 14 planos (279 palavras, ~106.5 s) + 3 reações (61 palavras, ~23.3 s) = **~129.8 s (2.2 min) ≈ US$ 2.38** a US$ 0,0183/s. Alvo 90–130 s, teto 150 s.

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto (custo zero) · 🎙️ troca a fala do plano (mesmo id, regrava) · ➕ novo (grava).

## 1 · A lacuna do C02

1. As duas missões (m01, m02) são montagem de frase em blocos, na tela; nada acontece fora da plataforma e não há caminho para quem ainda não tem vaga.
2. O curso ensina a perguntar e a propor uma alternativa, mas para na resposta boa: nunca mostra a resposta vaga (“venha adequada à função”), que é a que mais chega.
3. Também não trata o dia em que a peça falta de verdade (rasgou, não secou): quando avisar e o que dizer.
4. As aberturas das duas aulas usam a mesma fórmula “No fim desta aula, tem uma missão para você: …”.
5. O curso termina numa tela de texto genérica: sem fecho da Camila, sem volta à história da Bia.

Por isso a aula 3 não repete a pergunta sobre a calça azul (v03 já faz isso) nem a conversa sobre uniforme. Ela preenche o que falta: **a resposta vaga virando pergunta concreta, o dia em que a peça falta, uma observação real fora da tela e o fecho da Camila.** A demonstração do pacote foi descartada (repetia a v03); sobraram a situação da decisão e a frase final.

## 2 · Aulas existentes: texto e a abertura de cada prática

### Aula 1 · Como confirmar roupa e calçado
- **v00/missao 🎙️** (18 pal · ~6.9 s) — era: “No fim desta aula, tem uma missão para você: pergunte sobre a roupa.”
  > Daqui a pouco, você escreve a pergunta que confirma roupa e calçado, pronta para o seu primeiro dia.
- **m01 ✏️**: Só a instrução: o componente é de blocos. Molde, blocos e título ficam.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_01 ✏️**: Só acrescenta a frase de fechamento (hoje null).
  - closingLine: “A foto mostra um dia. A orientação vale todos os dias.”

### Aula 2 · Como conversar sobre alternativas de roupa
- **v02/missao 🎙️** (21 pal · ~8.0 s) — era: “No fim desta aula, tem uma missão para você: combine uma alternativa.”
  > E se a peça pedida não estiver no seu armário? No fim, você monta o pedido de alternativa, sem prometer compra.
- **m02 ✏️**: Só a instrução.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_02 ✏️**: Deixa de ser o fim do curso: “Curso concluído” passa para fim_aula_03.
  - outcomeLabel: “Aula concluída”
  - summary: “Descrever a peça que você tem e perguntar se serve resolve mais do que prometer uma compra. Se você salvou, seu pedido fica no Meu roteiro. Na próxima aula: o que fazer quando a resposta vem vaga, e quando a peça falta de verdade.”
  - closingLine: “Uma conversa curta resolve. Uma compra por suposição, não.”

- **Cortes: nenhum novo.** O C02 não tem `missao_fim`; as duas aberturas são o único anúncio de m01/m02 e por isso são trocadas, não tiradas.

---

## 3 · Aula 3 · Resposta vaga e peça que falta ➕ nova
_Módulo: Pratique os combinados · Você transforma uma orientação vaga em pergunta sobre uma peça concreta, aprende a avisar quando a peça falta e olha a roupa de um lugar real. · ~4 min_  
Caminho: v04 → q04 → v05 → m03 → despedida → fim_aula_03

### v04 · Cena ➕: Venha adequada à função
- `s1` ➕ (22 pal · ~8.4 s)
  > A Bia perguntou e descreveu o que tinha. Agora, duas coisas que acontecem muito: a resposta vaga e a peça que falta.
- `promessa` ➕ (20 pal · ~7.6 s)
  > Antes de terminar, você olha a roupa de um lugar onde quer trabalhar e anota uma dúvida concreta para perguntar.
- `s2` ➕ (20 pal · ~7.6 s)
  > A Bia mandou: tenho uma calça azul-marinho lisa, ela atende? Resposta: venha adequada à função. O primeiro dia é amanhã.
- `chamada` ➕ (14 pal · ~5.3 s)
  > Essa resposta resolveu a dúvida dela? No lugar da Bia, o que você faz?

<small>Cartão “Pergunta a seguir”: A Bia descreveu a calça e recebeu só “venha adequada à função”. O primeiro dia é amanhã. O que você faz no lugar dela?</small>

### q04 · Você decide ➕
**No lugar da Bia, o que você faz com essa resposta?**  
_A Bia descreveu a calça azul-marinho lisa. A resposta foi só “venha adequada à função”. Ela ainda não sabe se a peça atende, e começa amanhã._

- **A** (melhor) “Pergunto de novo: essa calça atende? E, se não atender, qual alternativa serve?”
  - Camila reage (19 pal · ~7.3 s): “Viu a diferença? “Adequada” é vago. “Essa calça atende?” tem resposta: sim ou não. Agora dá para se preparar.”
  - Retorno escrito: Você transforma uma resposta vaga numa confirmação sobre uma peça concreta. Faça assim: nomeie a peça, peça um sim ou não e já pergunte a alternativa.
- **B** (média) “Levo a calça azul-marinho e, se alguém reclamar, explico que foi o que entendi.”
  - Camila reage (21 pal · ~8.0 s): “Pode dar certo. Mas você chega sem saber e descobre na frente de todo mundo. Pergunte hoje: evita começar com correção.”
  - Retorno escrito: Pode dar certo, mas você chega sem saber se a peça atende, e o primeiro dia pode começar com uma correção. Faça assim: pergunte hoje se essa calça serve. É uma mensagem.
- **C** (fraca) “Entendo que qualquer roupa escura foi autorizada.”
  - Camila reage (21 pal · ~8.0 s): ““Adequada à função” não disse sim nem não. Quem decidiu que roupa escura vale foi você. Descreva a peça e pergunte.”
  - Retorno escrito: A resposta continuava vaga, e você preencheu o vazio com uma suposição. Faça assim: quando a orientação não diz sim nem não, descreva a peça e pergunte de novo.

A resposta não está no enunciado: ele diz que a orientação veio vaga e que o dia é amanhã; perceber que falta um sim ou não sobre a peça, e já pedir a alternativa, é a decisão. Sem vídeo próprio da pergunta.

### v05 · Explicação ➕: Quando a peça falta de verdade
- `s1` ➕ (17 pal · ~6.5 s)
  > Agora, o outro caso: a peça que você tinha e não tem mais. Rasgou, molhou, não secou.
- `s2` ➕ (21 pal · ~8.0 s · card)
  > A diferença está na hora do aviso. Antes de sair de casa, dá tempo de combinar. Depois de chegar, vira correção.
  <br><small>cartão «Peça que falta»: Avise **antes de sair** · Diga **o que tem** · Pergunte **se serve hoje**</small>
- `s3` ➕ (22 pal · ~8.4 s)
  > A mensagem cabe em duas linhas: a calça escura rasgou; hoje tenho uma cinza lisa. Posso vir com ela e resolver amanhã?
- `s4` ➕ (22 pal · ~8.4 s)
  > Sem explicar a vida, sem prometer compra: quem responde decide. Peça de proteção é diferente: faltou, avise e espere antes de entrar.
- `lancamento` ➕ (23 pal · ~8.8 s)
  > Sua vez: escolha um lugar onde gostaria de trabalhar, olhe como a equipe se veste e anote uma dúvida. Depois, volte e conte.

Não repete v01 (confirmar antes; foto não é regra) nem v03 (descrever a peça; uniforme; ofensa → apoio). O novo: resposta vaga → pergunta sobre a peça; peça que falta → avisar antes de sair; proteção não se substitui por “parecida”.

### m03 · Leve para a vida real ➕: Olhe a roupa do lugar onde você quer trabalhar
**Tipo:** OBSERVAR fora da tela: um lugar real (vaga, curso ou lugar onde gostaria de trabalhar), com uma dúvida concreta anotada no celular  
**Ponte (intro):** A Bia só se preparou quando perguntou sobre uma peça concreta. Agora é com um lugar seu: a vaga ou o curso que você quer, ou um lugar onde gostaria de trabalhar.  
**Ação:**

1. Escolha o lugar: a vaga que você quer, o curso que vai começar, ou um lugar onde gostaria de trabalhar (loja, clínica, escritório, oficina).
2. Procure a orientação de roupa: o site, o aviso da vaga, a foto da equipe. Ou repare em como as pessoas estão vestidas quando passar lá.
3. Anote no celular uma dúvida concreta, sobre uma peça: “tênis preto serve?”, “tem uniforme?”, “calça jeans pode?”.
4. Tem com quem perguntar (quem te chamou, quem dá o curso)? Mande. Não tem? Guarde: é a sua primeira pergunta do primeiro dia.
5. Volte aqui, marque “Já experimentei” e conte o que percebeu.

**Para quem não trabalha (e para quem trabalha):** Sem vaga nem curso em vista? Vale um lugar onde você gostaria de trabalhar. Ou o trabalho de alguém da sua casa: pergunte a essa pessoa como ela soube o que vestir no primeiro dia e o que teria perguntado antes. Se trabalha, escolha uma peça sobre a qual ainda tem dúvida e pergunte esta semana.  
**Exemplo: a nota de uma aluna** (visível só ao tocar em “Ver um exemplo”): “Loja de celular do shopping. Vi: camiseta preta da loja, calça escura, tênis. Minha dúvida: o tênis pode ser branco ou precisa ser escuro? Tem camiseta para quem está começando?”  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Texto de ajuda: “Em uma frase: qual foi a dúvida que você anotou, ou o que descobriu olhando?” Placeholder: “Ex.: achei a foto da equipe, todos de calça escura; vou perguntar do tênis.”  
**Botões:** Já experimentei · Vou fazer depois. Quem escolhe “Vou fazer depois” conclui a aula; m03 e “Como foi?” ficam no Meu roteiro.  
**Sem molde na tela** (draftFromNodeId: null): a ação acontece fora da plataforma, de propósito.

### despedida · Despedida da Camila ➕ (depois da missão, antes do fim)
_59 palavras · ~22.5 s · tela: Peça concreta · Dúvida concreta · Alternativa possível_

> Lembra da foto com todo mundo de bermuda? Não era regra. E “venha adequada à função” também não respondeu nada.
>
> O que respondeu foi a sua pergunta: tenho esta peça, ela serve? Se não, qual? Se faltou, aviso antes de sair.
>
> Roupa certa não é a mais cara nem a do colega. É a que você confirmou. Até mais.
>

**Forma escolhida: termina com uma afirmação curta, a frase do curso (“é a que você confirmou”), depois de um callback de uma linha (foto de bermuda, resposta vaga). Sem recap, sem “você praticou”, sem “Meu roteiro”.**

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Resposta vaga não é resposta. Peça o sim ou o não sobre a peça que você tem.”
- Roteiro · «Minha dúvida de roupa»: lugar escolhido · orientação procurada (site, aviso, foto, olhando) · dúvida concreta anotada no celular · perguntei, ou guardei para o primeiro dia
- Roteiro · «Como foi?»: o que o aluno escreveu em m03 (vazio: “Você deixou para depois. Quando fizer, volte e conte como foi.”)
- Roteiro · «O que você levou»: Confirme a orientação da sua atividade, não a foto. / Descreva a peça que tem e pergunte se serve. / Resposta vaga? Peça o sim ou o não sobre a peça. / Faltou a peça? Avise antes de sair de casa.

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v04 | 4 | 76 | 29.0 | 0.53 |
| q04 (3 reações) | 3 | 61 | 23.3 | 0.43 |
| v05 | 5 | 105 | 40.1 | 0.73 |
| despedida | 3 | 59 | 22.5 | 0.41 |
| aberturas trocadas (v00/missao, v02/missao) | 2 | 39 | 14.9 | 0.27 |
| **Total novo** | 14+3 | 340 | **129.8** | **2.38** |

- Vídeo que o aluno assiste: antes 173.9–181.3 s (3–4 min) → depois **279.1–287.2 s (4.7–4.8 min)**. antes + v04 + v05 + despedida + uma reação da q04 (mínima/máxima) + diferença das aberturas trocadas (+6.3 s). 
- Opcional: 5 reações antigas abrem com frase repetida em muitos cursos (q01 C, q02 A, q02 C, q03 A, q03 B). Cortar a 1ª frase, grátis, se o ajustador aceitar vídeo de reação; ou regravar só a 2ª frase (~27.9 s ≈ US$ 0.51).
- Tudo o mais (campos das práticas, fins das aulas, descrição do curso) é texto: custo zero.

## 5 · Perguntas para o dono

1. Alcance da missão m03: (a) vaga, curso ou um lugar onde a pessoa gostaria de trabalhar, com a alternativa “pergunte a alguém da sua casa” · (b) só vaga ou curso, como os revisores escreveram (deixa sem caminho quem não tem nenhum dos dois). Recomendo (a).

2. Frase sobre peça de proteção (v05/s4, 2ª frase, ~5 s): (a) manter: é o único lugar que diz que proteção não se substitui por “parecida” · (b) tirar da fala e deixar só no texto da missão. Recomendo (a).

3. As 5 reações antigas com abertura repetida: (a) deixar · (b) cortar a primeira frase, se o ajustador aceitar vídeo de reação (grátis) · (c) regravar (~27.9 s, ≈ US$ 0.51). Recomendo (b); se não der, (a).

4. Exemplo da missão (“Ver um exemplo”): (a) loja de celular do shopping, aluna sem nome · (b) voltar à Bia e à calça (repete o curso). Recomendo (a).


## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas; nenhum plano tirado (os `missao_fim` já saíram na Fase 0, onde existiam).
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; Camila não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”; as aberturas trocadas têm estrutura diferente entre si.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, retorno escrito com “Faça assim”.
- Missão com alternativa real para quem não trabalha; a aula fecha mesmo que a ação aconteça depois.
- Despedida de 59 palavras, sem o molde de 4 parágrafos; fecha este curso, não um curso qualquer.
