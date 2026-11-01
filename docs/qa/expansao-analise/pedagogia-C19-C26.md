# Revisão pedagógica — pacote de expansão, C19–C26

Revisão só de conteúdo (nada executado). Base: `cursos/C19.md…C26.md`, `expansao.json`, `FICHAS_DE_VOZ.md`, `CORRECOES_ADICIONAIS.md` × `docs/qa/raio-x/raio-x.json` (versão publicada).

## Veredito rápido

| Curso | Orientador | Veredito | Problema principal |
|---|---|---|---|
| C19 Parece verdade. Será? | Laís | adotar com correções | prática entrega a resposta no enunciado; anúncio gravado da missão antiga |
| C20 IA como aliada | Laís | adotar com correções | prática nova é trivial (resposta já dita na decisão) e apaga a única prática de escrever um pedido |
| C21 Tudo é urgente? | Vinícius | adotar com correções | "Escolho A" ambíguo; aprofundamento repete v05 |
| C22 Errei. E agora? | Vinícius | adotar com correções | decisão repete a q04 (Elaine) com outra "melhor resposta" → contradição |
| C23 Aprender faz parte | Vinícius | adotar com correções | título da prática não bate com a tarefa; opção C caricata |
| C24 Por onde eu começo? | Flávia | adotar com correções | decisão já respondida no enunciado ("a equipe autorizou"); ordenação igual à q03 |
| C25 Faz sentido? | Flávia | adotar com correções | classificação fácil demais (3 itens); o melhor lote do bloco |
| C26 Onde está o problema? | Flávia | adotar com correções | demo + decisão repetem q06/v06 quase literalmente |

Nenhum "não adotar": os roteiros são corretos, seguros e sem termos proibidos. O que falta é o que o dono pediu: missão de verdade, voz distinta, fecho memorável.

## Problemas transversais (valem para os 8)

**P1 — Fórmula única de encerramento.** Os 26 fechos (e os 8 deste lote) têm o mesmo esqueleto de 4 parágrafos: recap → "você praticou/viu" → "Na próxima X, experimente…" → "Se fez a atividade, está no Meu roteiro. [Tema] não é Y. É Z." Em C19, C21, C22, C23 e C26 a última frase é literalmente "não é… É…". No `expansao.json` todos se chamam "Leve para o próximo dia" e todos os aprofundamentos "O que muda na prática". É exatamente a repetição que o dono criticou. Correção: título próprio por curso; variar o 4º parágrafo (pergunta, imagem concreta, frase curta) — exemplos abaixo.

**P1 — Vozes indistinguíveis.** Laís, Vinícius e Flávia falam no mesmo registro ensaístico ("Uma verificação boa termina com uma conclusão do tamanho da evidência"; "proporcional", "sustentação", "unilateral", "referência responsável", "procedimento autorizado"). As fichas pedem frases curtas e faladas: Laís "O texto convence. Mas de onde veio este dado?"; Vinícius "Os dois pedidos são importantes. Eles cabem?"; Flávia "Isso a gente sabe. O motivo, ainda não." Correção: na revisão final, reescrever 2–3 frases por vídeo nesse tom e trocar jargão por palavras do dia a dia (ver lista no JSON). "Referência" como sinônimo de gestor (C21, C26) não é entendido por um jovem de 16 anos — usar "quem pediu" / "a pessoa responsável".

**P1 — Práticas continuam exercícios de tela.** Todas as 8 práticas são resposta curta/seleção sobre um caso fictício. O 3º parágrafo dos encerramentos já sugere uma ação real ("Na próxima oportunidade recebida…"), mas ela não vira atividade. Proposta: manter a prática de tela e acrescentar, opcional, uma **missão de campo** de uma linha, factível sem emprego (lista por curso abaixo).

**P1 — Anúncio gravado da missão antiga.** v01/v03 de cada aula anunciam a missão atual ("No fim desta aula, tem uma missão para você: monte uma sequência de três verificações…"). O pacote troca a prática, mas o áudio continua prometendo outra coisa. Pior em C20 (v01 promete "monte um pedido", chega uma seleção múltipla), C25 (promete "conclusão provisória", chega classificação) e C19/C23. Não adotar a prática nova sem o corte/regravação do anúncio (candidatos_cortes.json ainda sem timestamps).

**P2 — Feedbacks de uma linha.** Os 24 feedbacks novos são uma frase de diagnóstico, sem o "faça assim" que os feedbacks existentes têm. Acrescentar uma frase de ação em cada (exemplos no JSON).

**P2 — Reações repetidas não tratadas.** "Vamos olhar o efeito disso", "Veja o que essa escolha muda", "Pense no que acontece depois", "Olhe isso com calma", "Vale pensar no que fica de fora", "Repare no que isso provoca" aparecem nos 8 cursos (vídeos HeyGen já gerados). O pacote não mexe nelas (feedbacks novos são textuais, sem bordão — bom), mas o problema conhecido segue. Registrar como pendência separada.

**Implementação (não pedagógico):** `packages/course-schema/src/nodes.ts` só conhece `reflection` texto livre/blocos. Seleção múltipla (C20), ordenação (C24), classificação (C25) e 4 campos (C24 A1) são componentes novos.

## Por curso

### C19 — Parece verdade. Será? (Laís)
- **Demo** (86 pal.): ângulo novo e útil — "verdadeiro, mas fora de data". Concreto, coerente com o curso. Falta mostrar o print em vez de "imagine".
- **Decisão**: boa. A é claramente a melhor; B ("golpe") e C plausíveis; feedback de B importante (não acusar sem prova).
- **Aprofundamento**: acrescenta "conclusão do tamanho da evidência". Vale, mas frase difícil → "Conclua só o que a evidência permite".
- **Prática** (P2): o enunciado dita a resposta ("informe isso sem chamar de falsa nem afirmar que está aberta"); o exemplo é quase a única redação possível. Dar um atrito: a pessoa que enviou pergunta "então me inscrevo ou não?".
- **Encerramento** (140 pal.): bom callback ao Kelvin (pagamento). Falta a frase que fica: **"Vaga de verdade não cobra para você se inscrever."** 4º parágrafo na fórmula "não é… É…".
- Segurança/legal: ok. Sem termos proibidos.

### C20 — IA como aliada (Laís) — checar com cuidado
- **Precisão/segurança da orientação de IA**: correta. Mostra invenção de dados (certificado, prazo), manda comparar com a origem, "se faltar, sinalize", não colar dado pessoal/interno, responsabilidade fica com quem comunica. Nada perigoso. Falta repetir a regra já dita em v02: **perguntar qual é a regra de uso de IA no trabalho** — colocar no encerramento.
- **Demo** (103 pal.): a melhor do lote — mostra pedido ruim, resposta inventada, pedido bom, resposta honesta ("O tema não foi informado"). Direção visual correta (marcar como simulação).
- **Decisão**: C melhor, B boa pegadinha. Ok.
- **Prática** (P1): a seleção múltipla tem 4 itens e o enunciado da decisão já disse quais 2 são inventados. Zero desafio. E ela substitui a01, a única prática em que o aluno **escreve um pedido** — regressão. Opções: (a) manter a01 como texto curto "escreva o pedido" (abaixo) e aplicar a seleção múltipla na a02 (checklist); ou (b) ampliar para 7 itens com inventados sutis.
- **Encerramento** (152 pal.): "Seu roteiro reúne o que você salvou" é afirmação incondicional (CORRECOES pede condicional). Último parágrafo bom ("manter a direção do trabalho").

### C21 — Tudo é urgente? (Vinícius)
- **Demo** (95 pal.): concreta (60 min, 2×40), coerente com q04. Boa frase: "O que não muda por vontade é a quantidade de trabalho que cabe no tempo."
- **Decisão** (P2): opção C "Escolho A sem informar" — "A" é tarefa e também letra de alternativa. Trocar por "o relatório" e "a planilha".
- **Aprofundamento** (P2): "pergunte quem tem essa responsabilidade" repete v05, que fica logo antes da inserção. Cortar essa frase e manter o que é novo (atualizar estimativa; não é teste de quanto você aceita; não abrir mão da pausa — bom, protege o aprendiz).
- **Prática**: ok, mensagem real. Critérios bons.
- **Encerramento** (146 pal.): correto, mas genérico; "Não espere o prazo acabar para revelar um bloqueio que já percebeu" é a frase forte — fechar com ela.
- Trabalhista: ok (não glorifica hora extra).

### C22 — Errei. E agora? (Vinícius)
- **Demo** (89 pal.): 840/480 coerente com q01. "Contenha primeiro, previna depois" é conteúdo novo. Bom.
- **Decisão** (P1): a situação ("conferência reduziu erros, envios demoram") **é a q04 da Elaine**, que o aluno acabou de responder. Lá a melhor era "conferir só valor alto"; aqui é "investigar a etapa lenta". Duas respostas-modelo para o mesmo caso em 2 minutos → contradição. Trocar a decisão pelo tema do aprofundamento (comunicar a correção sem prometer o que não foi decidido) — reescrita abaixo.
- **Aprofundamento**: bom ("'O orçamento foi revisado' não significa que o cliente já foi tratado").
- **Prática**: ok, coerente. "Considere o esforço" é critério real.
- **Encerramento** (151 pal.): "o que aconteceu, quem pode estar usando essa informação e qual é a ação segura agora?" — memorável. 4º parágrafo na fórmula.
- **Correção C22 A1**: correta e necessária (a01 atual mistura destinatário/arquivo com orçamento). Ajuste: molde em voz passiva ("foi digitado") contradiz o "Assumo o erro" da q01 → "Eu digitei R$ 480 no lugar de R$ 840 no orçamento". Não responsabiliza financeiramente o jovem: bom.

### C23 — Aprender faz parte do trabalho (Vinícius)
- **Demo** (89 pal.): Priscila/Sérgio coerentes; "anote o critério, não só o botão" é conteúdo novo e bom.
- **Decisão**: A melhor; C ("façam todos os cadastros por mim") é caricata — trocar por "Faço como no exemplo e aviso depois se der errado".
- **Aprofundamento**: "referência viva" — ok, mas trocar por "anotação que vai melhorando".
- **Prática** (P2): título "Anote ação e critério" ≠ tarefa (duas perguntas). Anúncio gravado promete "plano". Renomear: "Duas perguntas para aprender uma tarefa".
- **Encerramento** (147 pal.): bom callback à Priscila e à aula 1; "respeitando os acessos e combinados" certo. 4º parágrafo na fórmula.

### C24 — Por onde eu começo? (Flávia)
- **Demo** (82 pal.): kits/canetas coerente. Sobrepõe a q04 (Yuri, paralelo), mas com exemplo melhor.
- **Decisão** (P1): o enunciado diz "A equipe autorizou separar os demais itens" — a resposta está no texto; A é absurda. Reescrever sem a autorização e com a decisão sendo pedir/registrar (abaixo).
- **Aprofundamento**: "como saber que terminou" é novo e bom.
- **Prática** (P2): a ordem certa foi dita na q03 (opção A forte) e em v04. Itens 1 e 3 ("Verificar conteúdo…" / "Confirmar o conteúdo…") confundem por vocabulário, não por raciocínio. Reescrever itens (abaixo).
- **Encerramento** (151 pal.): bom callback à reunião. Link a "Faz sentido?" só se disponível.
- **Correção C24 A1**: certa (a01 mistura relatório/kits/reunião). Mas o exemplo repete v02 palavra por palavra — o aluno copia. Usar caso novo: "Pediram 30 cópias de um material para amanhã; você não sabe qual versão nem se é frente e verso."

### C25 — Faz sentido? (Flávia)
- **Demo** (87 pal.): excelente — produto em falta como fator concorrente; "procurar informação que possa contrariar a primeira ideia". Voz Flávia reconhecível.
- **Decisão**: muito boa; B e A são erros reais de raciocínio.
- **Aprofundamento**: "O que eu precisaria encontrar para mudar de ideia?" — a melhor frase do lote.
- **Prática** (P2): classificação com 3 itens, cada um com a palavra-chave ("pode", "sempre"). Subir para 5 itens (abaixo). Perde a prática generativa anterior — aceitável se a missão de campo entrar.
- **Encerramento** (150 pal.): "o que eu sei, o que estou supondo e que informação poderia mudar minha interpretação?" — fica. Melhor fecho dos 8.

### C26 — Onde está o problema? (Flávia)
- **Demo + decisão** (P1): repetem q06/v06 ("registro que o teste passou e peço envio real autorizado" / "funcionar em teste não prova todos os casos"). O aluno acabou de responder isso. Trocar o ângulo para **"o problema voltou uma semana depois"** — usa o registro que o curso ensinou a fazer (abaixo).
- **Aprofundamento**: parte nova (registrar também quando falha; descrever bem para quem tem acesso). Boa.
- **Prática**: quase igual à a03 atual, só mais estreita. Ok se demo mudar.
- **Encerramento** (146 pal.): "Parar antes de apagar, expor ou alterar algo importante faz parte do raciocínio, não é falta de iniciativa" — memorável, manter. Jargão: "procedimento autorizado", "referência responsável".

## Reescritas prontas

**C19 — fecho (4º parágrafo, no lugar da fórmula):**
> Se montou sua resposta, ela está no Meu roteiro. E guarda uma regra simples: vaga de verdade não cobra para você se inscrever. Quem pede pagamento, senha ou código antes de confirmar qualquer coisa já respondeu à sua pergunta.

**C19 — prática (enunciado):**
> Você achou o aviso original: é do ano passado e não há nova abertura confirmada. A pessoa que mandou o print pergunta: "Então me inscrevo ou não?". Responda em até 3 frases: o que você encontrou, o que ainda não está confirmado e onde ela pode conferir.

**C20 — prática a01 (manter como texto curto, em vez da seleção múltipla):**
> Dados confirmados: oficina interna, terça, 10h, sala 2, equipe de apoio. Escreva o pedido que você faria à IA para um convite de três frases. Use só esses dados e diga o que ela deve fazer se faltar informação.
> Critérios: diz o resultado e o tamanho; lista só os dados confirmados; pede para sinalizar o que falta, não inventar; não inclui dado pessoal ou interno.

**C20 — se mantiver a seleção múltipla, 7 itens:** Terça, às 10h · Certificado incluso · Sala 2 · Inscrições até segunda · Duração de uma hora · Equipe de apoio · Traga seu notebook. Gabarito: 2, 4, 5, 7.

**C20 — fecho, trocar "Seu roteiro reúne o que você salvou." por:**
> Se salvou seu pedido, ele está no Meu roteiro. E antes de usar IA numa tarefa de verdade, pergunte qual é a regra do lugar onde você trabalha.

**C21 — opção C:**
> Faço o relatório e deixo a planilha de lado, sem avisar. Alguém tinha que decidir.
> (e renomear A/B para "o relatório" e "a planilha" na situação e na opção B)

**C22 — nova decisão (substitui a que repete a q04):**
> Situação: Você conferiu o valor e corrigiu o orçamento no seu arquivo. O cliente ainda não foi avisado; isso depende do gestor. Uma colega pergunta no grupo: "Resolveu aquilo do orçamento?"
> A. "Resolvi, já está tudo certo." — Feedback: O arquivo foi corrigido, mas o cliente ainda não. Dizer "tudo certo" pode fazer alguém parar de acompanhar. Faça assim: separe o que você fez do que ainda depende de decisão.
> B. "Corrigi o valor no arquivo. O contato com o cliente está com o gestor; aviso quando fechar." (melhor) — Feedback: Você informa o fato e o que ainda está em aberto, sem prometer pelo outro.
> C. "Ainda não, tá tudo parado." — Feedback: Parte já foi feita. Esconder o avanço também confunde quem acompanha. Faça assim: diga o que foi feito e o que falta.

**C24 — decisão reescrita:**
> Situação: Conteúdo confirmado e estoque conferido. Faltam canetas; o apoio está vendo a reposição. Ninguém disse o que você faz enquanto isso.
> A. Monto os kits sem caneta e entrego; depois alguém completa. — Feedback: O kit entregue não é o combinado, e ninguém sabe que falta algo. Faça assim: nada sai como pronto com item faltando.
> B. Pergunto se posso separar os itens que já tenho e anoto "faltam canetas" em cada kit. (melhor) — Feedback: Você avança no que não depende da caneta e deixa a pendência visível para quem for completar.
> C. Espero as canetas chegarem para começar qualquer coisa. — Feedback: Pode ser válido, mas separar o resto não depende da caneta. Faça assim: pergunte o que pode adiantar.

**C24 — itens da ordenação (mesma ordem inicial, gabarito igual):**
> 1. Conferir os kits prontos antes de entregar · 2. Separar e montar os kits · 3. Perguntar a quem pediu o que vai em cada kit · 4. Ver no estoque se tem material para todos.

**C25 — classificação, dois itens a mais:**
> 4. Nos dois dias, o produto mais procurado estava em falta. → Observação informada (foi informado no caso)
> 5. As vendas caíram por causa da falta do produto. → Conclusão não sustentada (afirma a causa sem comparar)

**C26 — nova demo/decisão ("o problema voltou"):**
> Demo (ideia, ~85 pal., Flávia): Uma semana depois, alguém avisa: "o formulário não chegou de novo". Sem registro, a investigação começa do zero. Com o registro do Nathan — ambiente de teste, destino corrigido, uso real não verificado — dá para perguntar: foi no uso real? Mudou mais alguma coisa? Isso a gente sabe. O motivo, ainda não.
> Decisão: "O formulário falhou de novo. O que você faz com o registro da semana passada?"
> A. Comparo as condições: onde falhou agora, o que mudou desde o teste, e levo isso a quem tem acesso. (melhor) — Feedback: O registro vira ponto de partida, não começa do zero.
> B. Refaço o ajuste do destino, porque funcionou da outra vez. — Feedback: Pode não ser a mesma causa. Repetir a correção sem comparar esconde o que mudou.
> C. Concluo que o teste da semana passada não valeu nada. — Feedback: Ele valeu para aquelas condições. A diferença entre elas é justamente a pista.

**Missões de campo (opcionais, uma por curso, factíveis sem emprego):**
- C19: Esta semana, pegue um print de vaga/curso que circulou no seu grupo. Ache a publicação original, a data e para quem vale. Anote o que confirmou e o que não.
- C20: Numa IA gratuita, peça um texto pequeno com dados inventados por você. Cole aqui o que teve de corrigir (só dados fictícios).
- C21: Liste o que você precisa entregar nesta semana (escola, casa, trabalho) com tempo estimado. Marque o que não cabe e para quem precisa avisar.
- C22: Lembre um erro pequeno recente (qualquer lugar). Escreva: o que aconteceu, quem foi afetado, qual conferência evitaria.
- C23: Pergunte a alguém que faz uma tarefa bem (em casa, escola, trabalho): "o que faz você escolher X?". Anote ação + critério.
- C24: Pegue uma tarefa real da semana. Escreva: resultado esperado, o que sei, o que falta, primeiro passo.
- C25: Anote uma certeza que você teve esta semana sobre alguém. Escreva o que foi observado e o que te faria mudar de ideia.
- C26: Um problema com celular/app/wi-fi em casa: sintoma, uma hipótese e uma verificação que não piora nada.

**Troca de vocabulário (todos):** proporcional → do tamanho do problema; sustentação/evidência → prova/o que você conferiu; unilateral → sozinho, sem avisar; referência responsável → a pessoa responsável / quem pediu; procedimento autorizado → do jeito combinado, com autorização; capacidade → o que cabe no tempo.
