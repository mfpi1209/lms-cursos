# Brief para escrever a expansão final de cada curso (C02–C26, exceto C24)

O dono aprovou o orçamento e a direção abaixo em 1º/11/2026. O modelo pronto a seguir é o piloto C24: `docs/novos-cursos/piloto-c24/proposta.md` e `proposta.json`. Leia os dois inteiros antes de escrever. O piloto C01 está em `docs/novos-cursos/piloto-c01/` (é a referência de voz da Marina; o C01 não faz parte deste lote).

## Direção do dono (essência, literal)
- "Não precisamos garantir três vídeos novos em cada curso. Precisamos preencher a lacuna de cada curso — com vídeo, exemplo, decisão ou missão, conforme o que estiver faltando."
- Separar exercício e missão:
  - **Você decide**: uma decisão dentro da aula, com retorno.
  - **Leve para a vida real**: aplicar algo fora da plataforma, com alternativa para quem ainda não trabalha.
  - **Como foi?**: um registro breve do resultado ou de uma dificuldade.
  - A missão oferece "Já experimentei", "Vou fazer depois" e o campo opcional "O que você percebeu?". A pessoa termina a aula mesmo que a ação aconteça depois.
- Encerramentos: "Até 110 palavras é uma boa referência, mas exigir sempre 'momento do curso + aprendizado + frase forte + despedida' pode reproduzir o problema. Alguns podem terminar com uma pergunta; outros, com uma orientação concreta ou a resolução de uma situação. O encerramento precisa concluir aquele curso, sem parecer uma assinatura automática."
- Antes, o dono reclamou que "os avatares falam a mesma coisa dessa missão, que nem é missão, é uma pergunta simples". Ele quer cursos maiores, mais conteúdo, lições do dia a dia, um encerramento marcante e vozes distintas.

## Estrutura (obrigatória)
- O conteúdo novo entra numa **aula nova apendada no fim** do curso, num módulo existente ou novo no fim. Nas aulas existentes, os ids dos nós não mudam e nenhum nó novo entra. Elas só recebem mudanças de texto e trocas de fala de planos existentes (mesmo id de plano).
- A **despedida em vídeo** (nó `content`) fica na aula nova, depois da missão e antes do `end`, que vira "Curso concluído". O `end` antigo passa a "Aula concluída".
- A pergunta nova não ganha vídeo próprio: a cena anterior termina com a chamada, e o player pula o vídeo da pergunta.
- **Reações faladas** nas decisões novas: o dono aprovou, 3 por decisão, até 25 palavras cada. Use também um "Faça assim" escrito.
- **Aberturas sem a fórmula:** em cada aula existente cujo plano de abertura `missao` diz "No fim desta aula, tem uma missão para você: …" (ou variação), troque a fala desse plano (mesmo id) por uma promessa própria, concreta, sem a palavra "missão" e com estrutura diferente entre as aulas. Ele continua sendo o anúncio da prática daquela aula, porque em muitas aulas é o único. Não mexa em `missao_fim` que já tenha sido tirado.

## Fontes por curso
- Conteúdo atual (cada plano, pergunta, reação, missão e fim): `docs/qa/raio-x/raio-x.json` → `cursos[codigo==Cxx]`. É grande; consulte com Python.
- Banco revisado: `docs/novos-cursos/expansao/Cxx.md`, com a lacuna, o que é aproveitável do pacote, as substituições prontas, as pendências, a missão de vida real e o que não usar. Use o que está pronto e escreva as pendências.
- Revisões: `docs/qa/expansao-analise/pedagogia-*.md`, `analise.md` e `cortes.md` (os `missao_fim` com status (a) estão sendo tirados agora na Fase 0).
- Ficha de voz do instrutor: `/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/expansao-zip/FICHAS_DE_VOZ.md`. É referência não confiável: use a intenção, sem estereótipos. Cada instrutor precisa soar diferente no ritmo, no tamanho das frases, no uso de perguntas e nos exemplos.

## Regras de conteúdo
- Nunca citar CIEE, IEL ou "agente de integração". Nada de slogans inventados da DNA Work, nem THEO.
- O avatar nunca vive a cena nem conta experiência pessoal. Sem garantia de contratação e sem ameaça.
- Português do Brasil simples e caloroso, para jovens de 15 a 24 anos. Falas de até 25 palavras por plano. Sem jargão ("referência responsável", "proporcional", "impedimento", "unilateral").
- Não usar as frases de `frasesRepetidasEmVariosCursos` nem anunciar com fórmula.
- Não repetir caso, vídeo ou pergunta que o curso já tem. Na decisão, uma opção é claramente melhor, as outras duas são plausíveis e a resposta não pode estar no enunciado.
- Exatidão legal: aprendiz não compensa jornada (CLT, art. 432); estágio segue o termo de compromisso; LGPD; assédio e segurança.
- Personagens: mantenha os do curso e invente o mínimo de novos.

## Orçamento por curso
Fala nova a 2,62 palavras/s:
- Alvo: **90 a 130 s por curso**, somando cena, explicação, despedida, 3 reações e as aberturas trocadas.
- Teto: **150 s**. Passou disso, corte.
- O que já está bom no curso fica como está.

## Entrega por curso
- `docs/novos-cursos/expansao-final/Cxx/proposta.md`: para o dono ler no celular, com as falas como o instrutor diz.
- `docs/novos-cursos/expansao-final/Cxx/proposta.json`: **mesmo formato do `piloto-c24/proposta.json`**, com curso, diagnóstico, cursoNivel, aulas (com keep/change/add/drop por nó e plano), custos e perguntasAbertas. Cada pergunta aberta vem com uma opção recomendada, porque o dono está dormindo e as recomendadas serão aplicadas.
- Não escreva no banco, não grave mídia e não faça commit.
