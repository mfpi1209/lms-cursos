# C05 · “Horário é combinado” · proposta da aula 3

_Gerado em 2026-11-01. Arquivo gêmeo: `proposta.json` (para o agente aplicar no rascunho). Nada foi gravado no banco, nenhum vídeo gerado, nenhum commit. Instrutora: Júlia._

## Em uma tela

| | Antes | Depois |
|---|---|---|
| Aulas | 2 | **3** (uma nova, no fim) |
| Vídeo do curso | 4 min (193.8–198.1 s) | **cerca de 5.0–5.0 min** (297.2–301.9 s) |
| Missão | montar frase em blocos (2×) | as duas ficam como exercício · **o trajeto real cronometrado e a hora de sair definida com margem**, com “Como foi?” |
| Decisão nova | — | 1 (“Você decide”: o que responder quando um colega sugere “fica uma hora a mais”) |
| Fim do curso | tela de texto genérica, sem fala | despedida da Júlia em vídeo (51 palavras) + frase de fechamento própria |
| Aberturas | 2 planos “No fim desta aula, tem uma missão para você: …” | 2 promessas próprias, sem a palavra “missão” |

**Fala nova a gravar:** 14 planos (272 palavras, ~103.8 s) + 3 reações (68 palavras, ~26.0 s) = **~129.8 s (2.2 min) ≈ US$ 2.38** a US$ 0,0183/s. Alvo 90–130 s, teto 150 s.

**Legenda:** ✅ mantém (custo zero) · ✏️ troca só texto (custo zero) · 🎙️ troca a fala do plano (mesmo id, regrava) · ➕ novo (grava).

## 1 · A lacuna do C05

1. As duas missões (m01, m02) são montagem de frase em blocos; nada acontece fora da tela, e o trajeto nunca é medido de verdade.
2. O curso ensina a avisar e a perguntar o procedimento, mas não trata a “solução” que vem de um colega (“fica uma hora a mais e resolve”): aprendiz não pode compensar jornada, e no estágio vale o termo.
3. Não trata a dificuldade que se repete (o ônibus que nunca cabe no horário): levar fatos, sem prometer um transporte que não pode pagar.
4. As aberturas das duas aulas usam a fórmula “No fim desta aula, tem uma missão para você: …”; o missao_fim de v01 já saiu na Fase 0.
5. O curso termina numa tela de texto genérica: sem fecho da Júlia.

Por isso a aula 3 não repete a mensagem da Yasmin para a sexta (v03 já ensina período, pendência, procedimento). Ela começa depois: **a sugestão do colega, quem confirma uma troca de horário, a dificuldade que se repete, o trajeto medido com relógio e o fecho da Júlia.** A demonstração do pacote foi descartada (repetia a A2); a decisão e o aprofundamento entram reescritos.

## 2 · Aulas existentes: texto e a abertura de cada prática

### Aula 1 · Como planejar o trajeto e a chegada
- **v00/missao 🎙️** (21 pal · ~8.0 s) — era: “No fim desta aula, tem uma missão para você: confirme os horários.”
  > Antes de terminar, você escreve a pergunta sobre o seu horário: onde se apresentar, a que horas, como é a entrada.
- **m01 ✏️**: Só a instrução: o componente é de blocos.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_01 ✏️**: Só acrescenta a frase de fechamento (hoje null).
  - closingLine: “A porta do prédio não é o seu posto. Conte a entrada.”

### Aula 2 · Como avisar uma mudança de horário
- **v02/missao 🎙️** (20 pal · ~7.6 s) — era: “No fim desta aula, tem uma missão para você: alinhe uma ausência.”
  > Hoje você monta o aviso de uma ausência do jeito que funciona: período, pendência e a pergunta sobre o procedimento.
- **m02 ✏️**: Só a instrução.
  - instrucoes: “Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito. Não inclua nomes, contatos ou informações internas.”
- **fim_aula_02 ✏️**: Deixa de ser o fim do curso: “Curso concluído” passa para fim_aula_03.
  - outcomeLabel: “Aula concluída”
  - summary: “Avisar informa; combinar resolve. Se você salvou, seu pedido fica no Meu roteiro. Na próxima aula, um colega oferece uma solução que parece justa, e você vê por que quem confirma é outra pessoa.”
  - closingLine: “Avisar é o começo. O combinado é o fim.”

- **Cortes: nenhum novo.** O missao_fim de v01 já saiu na Fase 0 (status a). O v03/s5 (“Agora, monte a sua frase.”) fica, porque m02 continua logo depois. As duas aberturas são o único anúncio de m01/m02 e são trocadas, não tiradas.

---

## 3 · Aula 3 · Fica uma hora a mais e resolve? ➕ nova
_Módulo: Pratique os combinados · Você decide o que fazer com a solução que vem de um colega, vê como tratar uma dificuldade que se repete e mede o seu trajeto de verdade. · ~4 min_  
Caminho: v04 → q04 → v05 → m03 → despedida → fim_aula_03

### v04 · Cena ➕: A sugestão do colega
- `s1` ➕ (20 pal · ~7.6 s)
  > Planejar a chegada, avisar a ausência. Agora, uma cena comum: a solução que vem de um colega, com boa intenção.
- `promessa` ➕ (19 pal · ~7.3 s)
  > No fim, você faz o seu trajeto de verdade, com relógio, e descobre a hora de sair com margem.
- `s2` ➕ (25 pal · ~9.5 s)
  > A Yasmin avisou a sexta de manhã e perguntou o procedimento. Antes da resposta, um colega diz: sai tranquila, depois fica uma hora a mais.
- `s3` ➕ (19 pal · ~7.3 s)
  > Parece justo: uma hora fora, uma hora depois. A entrega da sexta continua marcada. Quem acompanha ainda não respondeu.
- `chamada` ➕ (10 pal · ~3.8 s)
  > No lugar da Yasmin, o que você responde ao colega?

<small>Cartão “Pergunta a seguir”: Um colega sugeriu: sai na sexta e fica uma hora a mais depois. Quem acompanha o horário da Yasmin ainda não respondeu. O que você faz?</small>

### q04 · Você decide ➕
**No lugar da Yasmin, o que você faz?**  
_Um colega sugeriu: sai na sexta e fica uma hora a mais depois. Quem acompanha o horário da Yasmin ainda não respondeu. A entrega da sexta continua._

- **A** (melhor) “Agradeço, mas confirmo com quem responde pelo meu horário antes de combinar qualquer troca.”
  - Júlia reage (22 pal · ~8.4 s): “O colega quis ajudar, e isso é bom. Mas troca de horário, quem confirma é quem responde por ele. Você perguntou antes.”
  - Retorno escrito: Você não trata a ideia de um colega como ajuste autorizado. Faça assim: pergunte a quem acompanha como fica a sexta e a entrega, e espere a resposta antes de prometer.
- **B** (fraca) “Aceito. Uma hora fora, uma hora depois: dá no mesmo.”
  - Júlia reage (23 pal · ~8.8 s): “Parece igual, mas não é. Aprendiz não pode compensar hora: a lei não deixa. No estágio, vale o termo. Confirme com quem responde.”
  - Retorno escrito: Parece justo, mas aprendiz não pode compensar hora: a lei não permite. No estágio, só vale o que está no seu termo. Faça assim: leve a ideia a quem responde pelo seu horário e pergunte se é possível.
- **C** (média) “Aviso no grupo da equipe que saio das nove às dez na sexta.”
  - Júlia reage (23 pal · ~8.8 s): “O grupo ficou sabendo. Mas grupo não confirma procedimento, e a entrega da sexta fica sem dono. Pergunte a quem responde pelo horário.”
  - Retorno escrito: Avisar é importante, mas o grupo não confirma procedimento nem resolve a entrega. Faça assim: fale com quem responde pelo seu horário e pergunte como fica a entrega.

A resposta não está no enunciado: ele diz que a sugestão veio de um colega e que quem acompanha ainda não respondeu; perceber que a troca parece justa e mesmo assim não é dele para oferecer (e pode nem ser permitida) é a decisão. Sem vídeo próprio da pergunta.

### v05 · Explicação ➕: Quando a dificuldade se repete
- `s1` ➕ (20 pal · ~7.6 s)
  > Troca de horário não se combina com colega. Se combina com quem responde por ele, depois de perguntar se pode.
- `s2` ➕ (23 pal · ~8.8 s)
  > Outra situação: a dificuldade que se repete. O ônibus mudou, você chega dez minutos depois todo dia. Isso não é aviso: é conversa.
- `s3` ➕ (22 pal · ~8.4 s · card)
  > Leve exemplos: os dias, os horários, o que já tentou. Sem prometer um transporte que você não pode pagar. Fatos ajudam mais.
  <br><small>cartão «Dificuldade que se repete»: Leve **os dias e horários** · Diga **o que já tentou** · Pergunte **o que é possível** · Sem prometer o que **não pode pagar**</small>
- `lancamento` ➕ (22 pal · ~8.4 s)
  > Agora, o seu trajeto. Faça o caminho, ou simule no aplicativo, no horário real de um dia de semana. Anote quanto deu.

Não repete v01 (horário, entrada, trajeto, margem) nem v03 (período, pendência, procedimento; imprevisto já acontecendo). O novo: quem confirma uma troca; aprendiz não compensa; dificuldade que se repete com fatos; trajeto medido.

### m03 · Leve para a vida real ➕: Cronometre o seu trajeto
**Tipo:** FAZER fora da tela: o trajeto real (ou simulado no app) no horário de um dia de semana, com a hora de sair definida  
**Ponte (intro):** O Lucas calculou o ônibus até a porta e errou por pouco. Agora é o seu caminho, com relógio de verdade.  
**Ação:**

1. Escolha o trajeto: para o trabalho, o estágio, a escola ou o curso.
2. Faça o caminho num dia de semana, no horário em que precisa chegar. Marque a hora que saiu de casa e a hora que chegou ao ponto onde se apresenta (não só à porta).
3. Não dá esta semana? Simule no aplicativo de mapas, no horário real de um dia útil, e some a entrada: catraca, elevador, crachá.
4. Anote no celular: “Saí às __, cheguei às __. Deu __ minutos. Vou sair às __.” A margem precisa caber no seu dia.
5. Volte aqui, marque “Já experimentei” e conte quanto deu.

**Para quem não trabalha (e para quem trabalha):** Sem vaga ainda? O trajeto da escola ou do curso serve igual. Se não tem nenhum dos dois, escolha um lugar onde gostaria de trabalhar e simule o caminho às 7h de uma segunda-feira. Se trabalha, meça o dia em que o trajeto costuma dar errado.  
**Exemplo: a nota de um aluno** (visível só ao tocar em “Ver um exemplo”): “Casa → estágio. Saí 7h10, cheguei na catraca 8h02: 52 minutos, com 6 de fila no elevador. Entrada às 8h. Vou sair 6h50.”  
**Como foi?** · campo opcional “O que você percebeu?” (até 300 caracteres). Texto de ajuda: “Quanto deu, e o que você não tinha contado? Fila, baldeação, elevador?” Placeholder: “Ex.: deu 48 minutos; não tinha contado os 7 minutos da catraca.”  
**Botões:** Já experimentei · Vou fazer depois. Quem escolhe “Vou fazer depois” conclui a aula; m03 e “Como foi?” ficam no Meu roteiro.  
**Sem molde na tela** (draftFromNodeId: null): a ação acontece fora da plataforma, de propósito.

### despedida · Despedida da Júlia ➕ (depois da missão, antes do fim)
_51 palavras · ~19.5 s · tela: Trajeto real · Entrada · Quem confirma · Fatos_

> O Lucas calculou até a porta e esqueceu a entrada. A Yasmin quase trocou uma hora que não era dela.
>
> Horário é trajeto real, entrada, intervalo, volta. Quando algo muda, avise cedo. Quando se repete, converse com fatos.
>
> Horário combinado se combina antes. Depois, só dá para avisar. Saia com margem.
>

**Forma escolhida: termina com uma orientação concreta (“saia com margem”) depois da frase do curso; abertura por callback (Lucas, Yasmin). Realista, sem culpar transporte. Sem “Meu roteiro” na fala.**

### fim_aula_03 · Fim ➕
- Rótulo do resultado: **Curso concluído**
- Frase de fechamento: “Margem não é chute. É o trajeto medido, mais o que você não controla.”
- Roteiro · «Meu trajeto medido»: trajeto feito ou simulado no horário real · hora de saída e de chegada anotadas · entrada contada (não só a porta) · hora de sair definida com margem
- Roteiro · «Como foi?»: o que o aluno escreveu em m03 (vazio: “Você deixou para depois. Quando fizer, volte e conte como foi.”)
- Roteiro · «O que você levou»: Chegar na porta não é chegar: conte a entrada. / Mudança de horário: avise cedo e pergunte o procedimento. / Troca de hora, quem confirma é quem responde por ela. Aprendiz não compensa. / Dificuldade que se repete: converse com fatos.

---

## 4 · Custos (2,62 palavras/s · US$ 0,0183/s)

| Nó | Planos | Palavras | Segundos | US$ |
|---|---|---|---|---|
| v04 | 5 | 93 | 35.5 | 0.65 |
| q04 (3 reações) | 3 | 68 | 26.0 | 0.48 |
| v05 | 4 | 87 | 33.2 | 0.61 |
| despedida | 3 | 51 | 19.5 | 0.36 |
| aberturas trocadas (v00/missao, v02/missao) | 2 | 41 | 15.6 | 0.29 |
| **Total novo** | 14+3 | 340 | **129.8** | **2.38** |

- Vídeo que o aluno assiste: antes 193.8–198.1 s (4 min) → depois **297.2–301.9 s (5.0–5.0 min)**. antes + v04 + v05 + despedida + uma reação da q04 (mínima/máxima) + diferença das aberturas trocadas (+6.8 s). O “antes” é o raio-x das 02:33; a Fase 0 tirou o missao_fim de v01 (−4.8 s), não descontado aqui.
- Opcional: 4 reações antigas abrem com frase repetida em muitos cursos (q01 C, q02 C, q03 A, q03 B). Cortar a 1ª frase, grátis, se o ajustador aceitar vídeo de reação; ou regravar só a 2ª frase (~24.4 s ≈ US$ 0.45).
- Tudo o mais (campos das práticas, fins das aulas, descrição do curso) é texto: custo zero.

## 5 · Perguntas para o dono

1. Informação legal na reação B: (a) “a lei não deixa”, sem citar artigo, na fala e no retorno escrito · (b) acrescentar “(CLT, art. 432)” ao retorno escrito. Recomendo (a): a referência exata fica para a equipe, não para a fala de 15–24 anos.

2. Missão m03: (a) fazer o trajeto de verdade quando der, simular no app só se não der esta semana · (b) aceitar a simulação sempre. Recomendo (a).

3. As 4 reações antigas com abertura repetida: (a) deixar · (b) cortar a primeira frase, se o ajustador aceitar vídeo de reação (grátis) · (c) regravar (~24.4 s, ≈ US$ 0.45). Recomendo (b); se não der, (a).

4. Quem dá a sugestão na cena: (a) “um colega”, sem nome · (b) dar nome (personagem novo). Recomendo (a): o mínimo de personagens.


## Regras que a proposta respeita

- Aula nova só no fim; ids das aulas existentes intactos; nenhum nó novo nelas; nenhum plano tirado (os `missao_fim` já saíram na Fase 0, onde existiam).
- Falas ≤ 25 palavras; “você”; sem jargão; sem citar agentes de integração; sem slogan; Júlia não vira personagem nem conta experiência própria.
- Nenhuma reação nova abre com frase repetida entre cursos; nenhuma fala anuncia “missão”; as aberturas trocadas têm estrutura diferente entre si.
- Decisão com uma melhor e duas plausíveis, resposta fora do enunciado, retorno escrito com “Faça assim”.
- Missão com alternativa real para quem não trabalha; a aula fecha mesmo que a ação aconteça depois.
- Despedida de 51 palavras, sem o molde de 4 parágrafos; fecha este curso, não um curso qualquer.
