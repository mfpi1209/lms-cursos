# C22 · “Errei. E agora?” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (mesmo formato do piloto C24). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutor: Vinícius._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | ~3 min (140.4–146.3 s) | **cerca de 4.0–4.1 min** (239.1–245.4 s) |
| Prática | a01 (aviso) e a02 (mudança), na tela | as duas ficam · **um erro seu de verdade e a conferência usada na semana**, com “Como foi?” |
| Decisão nova | — | 1 (“Você decide”: “Resolveu aquilo do orçamento?”) |
| Fim do curso | tela de texto genérica | despedida do Vinícius em vídeo + frase de fechamento própria |

**Fala nova a gravar:** 12 planos novos (237 palavras, ~90.5 s) + 3 reações (62 palavras, ~23.7 s) + 2 aberturas trocadas (40 palavras, ~15.3 s) = **~129.4 s ≈ US$ 2.37** a US$ 0,0183/s. Alvo 90–130 s; teto 150 s. Opcional, fora da conta: 8 reações antigas com abertura repetida (ver pergunta).

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto (custo zero) · 🎙️ regrava o plano (mesmo id) · ➕ novo (grava).

## 1 · A lacuna do C22

1. O curso ensina a avisar o erro (aula 1) e a mudar o processo (aula 2), mas pula o meio do caminho: você já corrigiu o seu arquivo, o cliente ainda não foi avisado, e alguém pergunta “resolveu?”.
2. Nenhuma cena separa “o que eu fiz” de “o que ainda depende de decisão”; o risco de dizer “tudo certo” antes da hora não aparece.
3. A ordem “contenha primeiro, previna depois” e o registro do tipo de erro + ponto de conferência (para ver se a prevenção atacou a causa) ficam de fora.
4. As duas práticas (a01 aviso, a02 mudança) são de tela sobre o orçamento fictício; ninguém olha um erro seu de verdade.
5. O curso termina numa tela de texto genérica (“Você chegou ao final…”): sem fecho do Vinícius, sem as três perguntas que o banco considera memoráveis.

Por isso a aula 3 não repete “avise com fatos” (v02) nem “uma conferência que ajude” (v04). Ela preenche o que falta: **corrigido no seu arquivo não é resolvido para o cliente, a conversa “resolveu?” sem prometer pelo outro, o registro que mostra se a prevenção atacou a causa, um erro real do aluno e o fecho do Vinícius com as três perguntas.**

## 2 · Aulas existentes: aberturas sem fórmula e textos de tela

### Aula 1 · Percebi o erro: qual é o próximo passo?
- **v01/s4 🎙️** (20 pal · ~7.6 s; antes 7.2 s)
  > Antes de terminar, você monta um aviso de erro pronto para mandar: o fato, o possível impacto, o próximo passo.
  <br><small>antes: _No fim desta aula, tem uma missão para você: escreva um aviso de erro com fato, possível impacto e próximo passo._</small>
  <br><small>Anúncio da a01 sem a palavra “missão”.</small>
- **a01 ✏️** Fase 0 já aplicou o contexto do orçamento (molde “No orçamento, eu digitei R$ 480 no lugar de R$ 840. {impacto}. {pedido}?”). Só troca jargão no prompt.
  - prompt: “Você digitou R$ 480 no lugar de R$ 840 no orçamento, e o cliente já aceitou. Monte o aviso para a pessoa responsável, escolhendo uma opção em cada grupo. Você ainda não tem autorização para alterar as condições com o cliente.”
  - campos.pedido.pergunta: “O que você pede à pessoa responsável?”
- **fim_aula_01 ✏️** Só acrescenta a frase de fechamento (hoje null).
  - closingLine: “Fato, impacto, próximo passo. Sem desculpa no meio.”

### Aula 2 · Como corrigir e aprender
- **v03/s2 🎙️** (20 pal · ~7.6 s; antes 7.4 s)
  > Daqui a pouco, a pergunta é outra: que mudança pequena evita esse erro, e como você vai saber se funcionou?
  <br><small>antes: _No fim desta aula, tem uma missão para você: escolha uma mudança no processo e diga como verificar se ela reduziu o erro._</small>
  <br><small>Anúncio da a02, com estrutura diferente do v01/s4.</small>
- **fim_aula_02 ✏️** Deixa de ser o fim do curso: “Curso concluído” e “Você chegou ao final…” vão para fim_aula_03.
  - outcomeLabel: “Aula concluída”
  - summary: “Corrigir também é olhar o processo: uma mudança pequena e uma conferência já ajudam. Se você salvou, sua escolha fica no Meu roteiro para acompanhar. Na próxima aula: o arquivo já corrigido, o cliente ainda não avisado, e um erro seu de verdade.”
  - closingLine: “Mudança pequena, conferência certa. Lista de dez etapas ninguém segue.”

---

## 3 · Aula 3 · Resolveu aquilo? ➕ nova
_Módulo: Errei. E agora? · Você corrigiu o seu arquivo, o cliente ainda não foi avisado e alguém pergunta “resolveu?”. Depois, um erro seu de verdade e a conferência que o evitaria. · ~4 min_  
Caminho: v05 → q05 → v06 → a03 → despedida → fim_aula_03

### v05 · Cena ➕: Resolveu aquilo?
- `s1` ➕ (22 pal · ~8.4 s)
  > Você já avisou o erro e já escolheu uma conferência. Falta o meio: corrigido no seu arquivo, mas o caso não acabou.
- `promessa` ➕ (22 pal · ~8.4 s)
  > No fim, você pega um erro pequeno seu, de verdade, monta a conferência que teria evitado e usa essa conferência nesta semana.
  <br><small>Faz o papel do antigo anúncio, sem “missão”.</small>
- `s2` ➕ (22 pal · ~8.4 s · presenter_chips)
  > De volta ao orçamento. Você corrigiu o valor no seu arquivo. O cliente ainda não foi avisado: isso está com o gestor.
  <br><small>cartão «Onde o caso está»: **Feito**: valor corrigido no arquivo (R$ 840) · **Pendente**: aviso ao cliente, com o gestor</small>
- `s3` ➕ (11 pal · ~4.2 s)
  > No grupo da equipe, uma colega pergunta: “Resolveu aquilo do orçamento?”
- `chamada` ➕ (8 pal · ~3.1 s)
  > Agora, responda: o que você escreve no grupo?

<small>Cartão “Pergunta a seguir”: Você corrigiu o valor no seu arquivo. O cliente ainda não foi avisado; isso está com o gestor. Uma colega pergunta no grupo: “Resolveu aquilo do orçamento?” O que você escreve?</small>

### q05 · Você decide ➕
**O que você escreve no grupo?**  
_Você conferiu o valor e corrigiu o orçamento no seu arquivo. O cliente ainda não foi avisado; isso depende do gestor. Uma colega pergunta no grupo: “Resolveu aquilo do orçamento?”_

- **A** (média) “Resolvi, já está tudo certo.”
  - Vinícius reage (21 pal · ~8.0 s): “Tudo certo para você. Para o cliente, ainda não. Quem lê “tudo certo” para de acompanhar, e aí o erro cresce.”
  - Retorno escrito: O arquivo foi corrigido, mas o cliente ainda não. “Tudo certo” pode fazer alguém parar de acompanhar. Faça assim: separe o que você fez do que ainda depende de decisão.
- **B** (melhor) “Corrigi o valor no arquivo. O contato com o cliente está com o gestor; aviso quando fechar.”
  - Vinícius reage (21 pal · ~8.0 s): “Duas frases, duas informações: o que você fez, o que depende de alguém. Ninguém promete pelo gestor, ninguém para de acompanhar.”
  - Retorno escrito: Você informa o fato e o que ainda está em aberto, sem prometer pelo gestor. Faça assim: quando o contato com o cliente fechar, volte ao grupo e encerre o assunto.
- **C** (fraca) “Ainda não, tá tudo parado.”
  - Vinícius reage (20 pal · ~7.6 s): “Parado não está: o arquivo foi corrigido. Esconder o avanço confunde tanto quanto esconder o erro. Diga feito e pendente.”
  - Retorno escrito: Parte já foi feita. Esconder o avanço confunde quem acompanha tanto quanto esconder o erro. Faça assim: diga o que foi feito e o que falta.

A resposta não está no enunciado: ele diz o que foi feito e o que falta; perceber que a mensagem precisa carregar os dois, sem prometer pelo gestor, é a decisão. Não repete q01 (assumir o erro) nem q04 (ajustar a conferência). Sem vídeo próprio da pergunta.

### v06 · Explicação ➕: Feito, pendente, causa
- `s1` ➕ (22 pal · ~8.4 s)
  > Corrigir tem etapas. Primeiro, conter: o erro para de se espalhar. Depois, prevenir. E, no meio, dizer em que etapa você está.
- `s2` ➕ (23 pal · ~8.8 s · presenter_chips)
  > “O orçamento foi revisado” não quer dizer que o cliente foi avisado. Separe sempre: o que eu fiz, o que depende de outros.
  <br><small>cartão «Ao avisar a correção»: **Feito**: o que você já corrigiu · **Pendente**: o que depende de alguém · **Quando** você avisa de novo</small>
- `s3` ➕ (22 pal · ~8.4 s)
  > E anote o tipo do erro e onde passou a conferir. Em um mês, você vê se a conferência atacou a causa.
- `lancamento` ➕ (23 pal · ~8.8 s)
  > Agora é com você: um erro pequeno seu, recente. O que aconteceu, quem foi afetado, que conferência evitaria. Use essa conferência esta semana.
  <br><small>Faz o papel do antigo missao_fim, sem a palavra “missão”. A aula segue para a03.</small>

Não repete v02 (avise com fatos) nem v04 (uma conferência que ajude, sem dez etapas). O novo: conter → dizer a etapa → prevenir; feito × pendente; registrar tipo de erro e ponto de conferência para ver se a prevenção atacou a causa.

### a03 · Leve para a vida real ➕: Um erro seu, uma conferência sua
**Tipo:** FAZER fora da tela: um erro pequeno real em três linhas no bloco de notas, e a conferência usada uma vez na semana  
**Ponte (intro):** No orçamento, a conferência certa era comparar com a origem. Agora é um erro seu: pequeno, recente, de qualquer lugar. E a conferência que teria evitado.  
**Ação:**

1. Lembre um erro pequeno e recente, de qualquer lugar: mensagem para a pessoa errada, material esquecido, conta errada, horário perdido.
2. No bloco de notas, três linhas: o que aconteceu · quem foi afetado (mesmo que só você) · que conferência de dez segundos teria evitado.
3. Nesta semana, use essa conferência uma vez, antes de entregar ou enviar algo parecido.
4. Se alguém perguntar “resolveu?”, responda com o feito e o que falta.
5. Volte aqui, marque “Já experimentei” e conte como foi.

**Para quem não trabalha (e para quem trabalha):** Não depende de emprego: erro de escola, de casa ou do grupo de amigos serve. Não lembra nenhum? Use o próximo erro pequeno que aparecer nesta semana; ele vai aparecer. Se trabalha, escolha um erro que só envolveu você, sem expor nome de cliente ou colega.  
**Exemplo: a nota de um aluno** (visível só ao tocar em “Ver um exemplo”): “Erro: mandei o trabalho do grupo na versão antiga. Afetou: o grupo, que revisou coisa velha. Conferência: abrir o arquivo e olhar a data antes de anexar. Usei na quinta: peguei a versão errada de novo, antes de enviar.”  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Texto de ajuda: “Em uma ou duas frases: a conferência pegou alguma coisa? Ou não precisou? Sem nomes de pessoas nem dados internos.” Placeholder: “Ex.: conferi o destinatário antes de enviar e estava errado; corrigi antes.”  
**Botões:** Já experimentei · Vou fazer depois. Quem toca “Vou fazer depois” conclui a aula normalmente; a03 e “Como foi?” continuam no Meu roteiro.  
**Sem molde na tela** (draftFromNodeId: null): a anotação vai para o celular, de propósito.

### despedida · Despedida de Vinícius ➕ (depois da missão, antes do fim)
_62 palavras · ~23.7 s · tela: O que aconteceu? · Quem pode estar usando essa informação? · Qual é a ação segura agora?_

> Errei. E agora? No orçamento, você viu: o número errado era o menor problema. O que pesou foi o que veio depois.
>
> Ninguém promete nunca mais errar. O que dá para prometer: contar o fato, separar feito de pendente, mexer na causa.
>
> Na próxima falha, três perguntas: o que aconteceu? Quem pode estar usando essa informação? Qual é a ação segura agora?
>

**Forma escolhida: termina nas três perguntas (a frase memorável do banco), sem despedida formal: a última pergunta fica no ar e a tela mostra as três. Sem recap, sem “você praticou”, sem “Meu roteiro” na fala; sem a fórmula “não é… é…”.**

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Corrigido no seu arquivo não é resolvido para o cliente. Diga o que foi feito e o que falta.”
- Roteiro · «Meu erro, minha conferência»: escolhi um erro pequeno e recente · três linhas: o que, quem, que conferência · usei a conferência uma vez nesta semana · respondi “resolveu?” com feito e pendente
- Roteiro · «Como foi?»: o que o aluno escreveu em a03 (vazio: “Você deixou para depois. Quando usar a conferência, volte e conte como foi.”)
- Roteiro · «O que você levou»: Avisar: fato, possível impacto, próximo passo. / Corrigir: conter primeiro; dizer em que etapa está (feito × pendente); prevenir na causa. / Na próxima falha: o que aconteceu? quem pode estar usando essa informação? qual é a ação segura agora?

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v05 | 5 | 85 | 32.4 | 0.59 |
| q05 (3 reações) | 3 | 62 | 23.7 | 0.43 |
| v06 | 4 | 90 | 34.4 | 0.63 |
| despedida | 3 | 62 | 23.7 | 0.43 |
| aberturas trocadas (2 planos) | 2 | 40 | 15.3 | 0.28 |
| **Total novo** | | 339 | **129.4** | **2.37** |

- Vídeo que o aluno assiste: antes 140.4–146.3 s → depois **239.1–245.4 s (cerca de 4.0–4.1 min)**. antes + cena + explicação + despedida + uma reação da pergunta nova (mínima/máxima) + diferença de duração das aberturas trocadas.
- Opcional (fora da conta): 8 reações antigas abrem com frase repetida em vários cursos → cortar a 1ª frase, grátis, se o ajustador aceitar; ou regravar só a 2ª frase: 87 palavras, ~33.2 s, ≈ US$ 0.61.
- Tudo o mais (textos de tela, fins das aulas, missão, descrição do curso) é texto: custo zero.

## 5 · Perguntas para o dono

1. Aula 3 obrigatória ou opcional? (a) obrigatória: quem está no curso passa pela aula 3; quem já concluiu vê como conteúdo novo, sem reabrir matrícula · (b) opcional: aparece como extra. Recomendo (a), igual à decisão tomada no C24.

2. As 8 reações antigas com abertura repetida em vários cursos: (a) deixar · (b) cortar a primeira frase, se o ajustador aceitar vídeo de reação (grátis) · (c) regravar só a segunda frase (≈ 36.6 s, ≈ US$ 0.67). Recomendo (b); se não der, (a).

3. Prompt da a01 (Fase 0) diz “referência responsável”, termo que a regra de conteúdo veta: (a) trocar por “pessoa responsável” (texto, grátis) · (b) deixar. Recomendo (a).

4. Opção A da q05 (“Resolvi, já está tudo certo”) como média e C (“tá tudo parado”) como fraca: (a) manter · (b) inverter (A fraca, porque faz alguém parar de acompanhar; C média, porque pelo menos não cria falsa segurança). Recomendo (a): a reação de A já carrega o risco; C esconde o próprio trabalho, o que a aula 1 condenou.

## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas e nenhum plano tirado. Só texto e trocas de fala de planos existentes (mesmo id).
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; o avatar não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”; as duas aberturas trocadas têm estrutura diferente entre si.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, reação falada ≤ 25 palavras e retorno escrito com “Faça assim”.
- Missão fora da tela com alternativa real para quem não trabalha; “Já experimentei” / “Vou fazer depois” / “O que você percebeu?”; a aula fecha mesmo que a ação aconteça depois.
- Despedida em vídeo depois da missão e antes do fim; o fim antigo vira “Aula concluída” e o novo, “Curso concluído”.
- Não responsabiliza financeiramente o jovem nem promete novo preço: o contato com o cliente fica com o gestor; a aula só ensina a comunicar feito × pendente.
