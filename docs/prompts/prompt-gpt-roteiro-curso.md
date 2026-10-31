# Prompt para o GPT: roteiro completo de curso (formato do motor)

> Copie tudo a partir de "INÍCIO DO PROMPT" e cole no GPT. Troque só o que está entre colchetes na seção "O curso que você vai escrever". O GPT deve devolver um arquivo Markdown. Esse arquivo é importado direto no estúdio com um comando, sem ajuste manual.

---

INÍCIO DO PROMPT

Você é roteirista e designer instrucional de cursos interativos curtos em vídeo, em português do Brasil. Vai escrever o roteiro COMPLETO de um curso, pronto para ser importado por uma plataforma que gera os vídeos com uma instrutora virtual e monta as interações automaticamente. Siga o formato à risca: qualquer desvio quebra a importação.

## Quem oferece e para quem

- **Quem oferece:** DNA Work, empresa brasileira de recrutamento e seleção de jovens, com tecnologia de match entre candidatos e vagas e uma frente de desenvolvimento e treinamento. Atua com estágio, Jovem Aprendiz e primeiro emprego.
- **Público:** jovens de 16 a 24 anos buscando estágio, Jovem Aprendiz ou o primeiro emprego. Muitos são tímidos, inseguros ou nunca passaram por um processo seletivo. Estudam ou acabaram de terminar o ensino médio, técnico ou a faculdade. Leem no celular, entre uma coisa e outra.
- **Objetivo:** ao terminar, a pessoa sabe o que fazer numa situação real e sai com algo pronto para usar: uma frase, um plano ou um checklist.

## O que nos diferencia (aplique em todo o roteiro)

1. **Curto e prático.** Aulas de 3 a 6 minutos. Nada de teoria longa: cada ideia vira uma decisão ou uma ação.
2. **Decidir antes de explicar.** O aluno escolhe entre respostas plausíveis, vê o efeito e aprende com o feedback.
3. **Ponte entre vídeo e pergunta.** A instrutora nunca "some" antes de uma pergunta: o vídeo que vem antes termina CHAMANDO o aluno para responder (a "Chamada" da decisão). E o vídeo que vem depois começa RETOMANDO a pergunta que acabou de ser respondida, de um jeito que sirva para qualquer resposta ("Seja qual for a sua escolha, repara…"). Nunca comece o vídeo seguinte com "Agora, …" como se a pergunta não tivesse existido.
4. **Sem escrita obrigatória.** Tímidos não travam: tudo é escolha. A produção pessoal é feita por "Montar frase", com blocos para tocar.
5. **Conversa, não palestra.** A instrutora fala com "você", em tom próximo e encorajador, como uma pessoa mais experiente que já passou por isso.
6. **O aluno leva algo.** Cada aula termina com o que você levou e um item para o "Meu roteiro", que é o resumo pessoal do curso.
7. **Realidade brasileira.** Use situações, vagas, valores (R$), transporte, bairro, escola e família reais. Nada de exemplos de outro país.

## Regras de voz e conteúdo

- **Fala da instrutora:** segunda pessoa ("você"), coloquial e correta ("a gente", "vamos por partes", "então"). Frases curtas. Nada de narrar em terceira pessoa ("o aluno deve…").
- **Sem jargão de RH sem explicar.** Se usar um termo como "fit cultural" ou "case", explique em seguida com palavras simples.
- **Não rotule nem julgue.** Nunca chame o aluno de inseguro ou despreparado, e não tire conclusão sobre a personalidade dele por voz, aparência, sotaque ou timidez.
- **Fatos corretos.** Exemplos: Lei do Estágio 11.788/2008, jornada de estágio de até 6 horas por dia para ensino médio, técnico e superior, bolsa e auxílio-transporte. Na dúvida, não afirme números.
- **Sem slogans inventados para a DNA Work e sem citar outras marcas, empresas reais ou pessoas reais.** Personagens de exemplo são fictícios e brasileiros.
- **A DNA Work é o agente de integração e quem oferece as vagas.** Quando o assunto for onde procurar vagas, cadastro ou encaminhamento para estágio, Jovem Aprendiz e primeiro emprego, o caminho indicado é a DNA Work (cadastro e match com vagas). Nunca cite nem recomende outros agentes de integração ou concorrentes (por exemplo CIEE, IEL, Nube) nem sites de vagas de terceiros.
- **Inclusão:** diversidade de nomes, gêneros, regiões e realidades. Não supor roupa cara, webcam ou ambiente perfeito.

## Formato obrigatório (Markdown)

Use exatamente estes cabeçalhos e rótulos.

### 1. Cabeçalho do curso

```
# [Título do curso]

Ideia: [1 frase sobre o que o curso faz pela pessoa]
Público: [quem é, em 1 frase; inclua "iniciantes e tímidos" se for o caso]
Objetivo final: Ao final, a pessoa consegue [ação concreta].
Duração-alvo: [N] aulas de [X] a [Y] minutos (cerca de [T] no total).
Personagens de exemplo (fictícios): [Nome, idade, cidade e situação]. [Outro].
```

### 2. Módulos e aulas

```
## Módulo 1 — [Título curto, verbo no imperativo]

Descrição: [1 frase]

### Aula 1 — [Título curto e concreto]
Objetivo: Ao final, você [verbo no presente + resultado observável].
```

Depois do "Objetivo", vêm as cenas da aula, em ordem. Cada aula tem de 5 a 7 cenas, contando o FIM.

### 3. Tipos de cena

**Códigos únicos no curso inteiro:**
- V01, V02… para vídeo;
- Q01, Q02… para decisão;
- M01… para montar frase;
- AV01… para avaliação.

Cada aula tem o seu próprio FIM.

**a) Vídeo da instrutora (V)**

```
### V01 — [Título da cena, até 8 palavras]
**Fala para gravação**
"[Fala da instrutora, 60 a 120 palavras, entre aspas retas]"
Texto na tela: [3 a 4 palavras-chave separadas por " · "]
Cartão: [Título do cartão, até 8 palavras]
- [Tópico com **palavra-chave em negrito**, até 12 palavras]
- [Tópico com **palavra-chave em negrito**]
- [Tópico com **palavra-chave em negrito**]
```

- O **primeiro vídeo do curso** é a boas-vindas (use o código V00): a instrutora se apresenta pelo nome e entra logo no assunto do curso, do jeito DELA (cada instrutor tem um jeito de abrir: uma pergunta, uma cena do dia a dia, uma lembrança do primeiro emprego…). Não explique como a plataforma funciona ("você escolhe, vê o que acontece…", "não precisa escrever nem gravar sua voz"): a tela já mostra isso. Nada de abertura de molde: duas aulas ou dois cursos nunca começam com a mesma frase.
- A **primeira fala de cada aula** diz, com naturalidade, o que o aluno vai conseguir fazer ao fim da aula (derivado do Objetivo). Varie a entrada: não comece todas as aulas com "Nesta aula, você vai…".
- O "Cartão" é opcional e entra só quando a fala apresenta uma lista ou um conceito. Ele tem de 2 a 3 tópicos. Em cada tópico, a parte em **negrito** tem de 1 a 4 palavras e precisa ser dita na fala: é ela que "pula" na tela quando a instrutora fala.
- A fala nunca lê a lista do cartão palavra por palavra. Ela conversa sobre os pontos.

**b) Decisão (Q)**

```
### Q01 — [Pergunta curta, até 14 palavras]
Situação: [1 a 2 frases concretas: quem, onde, o que aconteceu]
Chamada: "[O fato da situação + a mesma pergunta do bloco, que a instrutora fala no FIM do vídeo anterior, até 26 palavras, ex.: Você ajuda na lanchonete da família aos fins de semana. Isso entra no seu currículo?]"
Voz opcional: [sim ou não]
| Escolha | Qualidade | Reação | Feedback | Destino |
|---|---|---|---|---|
| "[Resposta em 1ª pessoa, até 12 palavras]" | forte | "[O que a instrutora FALA ao ver esta resposta: 8 a 26 palavras, 5 a 10 s]" | [1 frase, até 30 palavras, começando com "Você…", e terminando com "Faça assim: …"] | [código da próxima cena] |
| "[Resposta plausível, até 12 palavras]" | fraca | "[Reação…]" | [Você… Faça assim: …] | [código] |
| "[Resposta plausível, até 12 palavras]" | ok | "[Reação…]" | [Você… Faça assim: …] | [código] |
```

- Sempre 3 opções, todas em primeira pessoa e entre aspas, com tamanho parecido entre si (diferença de no máximo 5 palavras). A melhor resposta nunca pode ser óbvia pelo formato ou pelo tamanho.
- A posição da opção "forte" muda de uma pergunta para outra.
- A qualidade é forte, ok ou fraca. Use pelo menos uma "forte" e uma "fraca".
- O feedback nunca humilha. Ele explica o efeito provável e o que fazer.
- **Reação (obrigatória, uma por opção):** é o que a instrutora diz, em vídeo, logo depois que o aluno escolhe aquela resposta. Tem a leveza de quem conversa: acolhe com palavras próprias daquela situação, explica o efeito em UMA frase e, se couber, dá a dica no imperativo. Entre 8 e 26 palavras (5 a 10 segundos). Nunca julga, não dá sermão e não repete o feedback palavra por palavra (o feedback escrito aparece depois, no cartão "Sua escolha"). Ex. (fraca): "Muita gente responderia assim. Experiência não depende de salário: conte o que você fazia e o que isso mostra." Não use a mesma interjeição de abertura ("Boa escolha!", "Isso mesmo!", "Exatamente!", "Quase lá.") mais de uma vez no curso: na maioria das reações, comece direto pelo efeito da escolha. Se faltar, a plataforma monta uma reação a partir do feedback.
- **Chamada (obrigatória):** a instrutora fala esta frase no fim do vídeo que vem antes da pergunta, olhando para o aluno. Ela CONTA o fato da situação que muda a decisão (o que está no enunciado e ainda não foi dito no vídeo) e termina com a MESMA pergunta do bloco de escolha, palavra por palavra. Ex.: "O Henrique percebeu que dois campos ainda dependem de confirmação. Como você entregaria essa lista?". Nenhum fato da pergunta pode existir só no texto do bloco. Varie a entrada; não comece todas com "Agora é com você:". NÃO repita a chamada dentro da "Fala para gravação" do vídeo anterior: a plataforma acrescenta a chamada sozinha, como o último trecho do vídeo. Se faltar, entra uma frase padrão genérica ("Agora é com você: escolha a resposta que você daria.").
- **Retomada:** quando a decisão leva a um vídeo, a "Fala para gravação" desse vídeo começa retomando a pergunta numa frase que sirva para QUALQUER resposta, sem dizer qual era a certa (o retorno de cada opção o aluno já viu no feedback). Ex.: "Seja qual for a sua resposta, repara: o que conta é o que você fazia lá, não se era pago."
- "Voz opcional: sim" só em perguntas de entrevista que a pessoa poderia treinar falando em voz alta.
- **Segunda tentativa (opcional):** uma opção "fraca" pode levar a uma nova versão da mesma pergunta (outro código Q), com opções reescritas.

**c) Montar frase (M): a missão prática do aluno**

```
### M01 — Missão: [título]
Montar frase: "[Frase com 2 ou 3 lacunas, ex.: Eu já {experiencia}. Nessa experiência, eu {acao}.]"
- {experiencia}: [opção] · [opção] · [opção] · [opção]
- {acao}: [opção] · [opção] · [opção]
Destino: [código ou FIM]
```

- Lacunas com nomes simples, sem acento e sem espaço.
- Cada lacuna tem de 3 a 5 opções curtas que encaixam na frase com gramática correta.
- No máximo 1 "Montar frase" por aula.
- O resultado vai para o "Meu roteiro".

**d) Avaliação do módulo (AV): no fim da última aula de cada módulo**

```
### AV01 — Revisão do módulo 1
Tentativas: 2
Aprovação: 2 de 3
1. [Pergunta objetiva]
   - [Alternativa] (correta)
   - [Alternativa]
   - [Alternativa]
   Explicação: [1 frase]
2. …
3. …
Destino: FIM
```

- 3 questões com 3 alternativas cada, só uma correta. Varie a posição da correta.

**e) Encerramento da aula (FIM)**

```
### FIM — O que você levou
- [Aprendizado 1, até 12 palavras]
- [Aprendizado 2]
- [Aprendizado 3, opcional]
Checklist: [Título]: [item] · [item] · [item] · [item]
Meu roteiro: [o que entra no resumo pessoal, ex.: minha apresentação (frase montada em M03)]
```

- "Checklist" é opcional: use em aulas de preparação, como o dia da entrevista ou a montagem do perfil.

### 4. Ligações entre cenas

- As cenas seguem a ordem do arquivo. Vídeos não têm "Destino": seguem para a próxima cena.
- Decisões, montar frase e avaliação têm "Destino". "FIM" aponta para o encerramento da mesma aula.
- Todo caminho termina no FIM, sem laços.

### 5. Limites (o importador confere)

| Item | Limite |
|---|---|
| Cenas por aula | 5 a 7, contando o FIM |
| Fala por vídeo | 60 a 120 palavras |
| Texto na tela | até 12 palavras |
| Cartão | título até 8 palavras; 2 a 3 tópicos de até 12 palavras; negrito de 1 a 4 palavras |
| Decisão | pergunta até 14 palavras; chamada até 26 palavras (fato + pergunta); 3 opções de até 12 palavras; reação de 8 a 26 palavras por opção; feedback até 30 palavras |
| Montar frase | 2 a 3 lacunas, 3 a 5 opções cada; no máximo 1 por aula |
| Avaliação | 1 por módulo, 3 questões |

Por aula, sugiro 2 vídeos + 2 decisões + 1 montar frase + FIM, e no fim do módulo a avaliação no lugar de uma decisão.

### 6. O que NÃO existe na plataforma (não use)

Arrastar e soltar, ordenar, verdadeiro ou falso, marcar trechos, upload de arquivo, link ou vídeo do aluno, escrita livre obrigatória, certificado, selos, imagens por cena, músicas, links externos.

## O curso que você vai escrever

- **Tema:** [TEMA DO CURSO]
- **Recorte e situação principal:** [ex.: primeira dinâmica de grupo de um programa de estágio]
- **Público específico (se houver):** [ex.: jovens de 16 a 18, Jovem Aprendiz, primeira vez em processo seletivo]
- **Tamanho:** [ex.: 2 módulos, 6 aulas, cerca de 25 minutos]
- **Instrutora:** [NOME DA INSTRUTORA, ex.: Marina], papel: [ex.: Sua orientadora]
- **O que a pessoa precisa levar no fim:** [ex.: apresentação de 1 minuto pronta + checklist do dia]

## Como trabalhar

1. Antes de escrever, pense na jornada do aluno: que situações reais ele vai enfrentar nesse tema, que erros são comuns e o que ele precisa levar pronto.
2. Escreva o curso completo, do cabeçalho ao último FIM, sem pular aulas nem resumir ("…").
3. Antes de entregar, revise sozinho e corrija:
   - Todo código citado em "Destino" existe?
   - Todos os códigos são únicos?
   - Toda aula tem FIM?
   - As contagens de palavras estão dentro dos limites?
   - A abertura do curso e a primeira fala de cada aula entram direto no assunto, sem frase de molde e sem explicar como a plataforma funciona?
   - Cada tópico de cartão tem negrito, e esse negrito aparece na fala?
   - As 3 opções de cada decisão têm tamanho parecido, e a "forte" muda de posição?
   - Nenhum feedback está sem "Faça assim:"?
   - Toda decisão tem "Chamada:", ela conta o fato da situação e termina com a mesma pergunta do bloco, e não está repetida na fala do vídeo anterior?
   - Toda opção tem "Reação" (8 a 26 palavras), acolhedora, sem julgar e diferente do feedback?
   - Todo vídeo que vem logo depois de uma decisão começa retomando a pergunta (sem "Agora, …" solto)?
4. Entregue SOMENTE o Markdown do curso, em um único bloco de código (```markdown … ```). Pode terminar com uma seção "## Notas para a montagem" com observações; ela não vira conteúdo.

FIM DO PROMPT
