# Pacote de expansão dos 26 cursos: análise consolidada

_1º/11/2026. Fable (técnica + 3 lotes pedagógicos) e conferência dos cortes nas transcrições. Nada foi aplicado, gravado ou publicado._

## Veredito

**Adotar em parte, reescrevendo antes.** O pacote é tecnicamente correto: os IDs, as versões e os pontos de inserção batem com os 26 cursos. Não há CIEE, IEL, THEO, slogans nem experiência pessoal dos avatares (com uma exceção no C11). O conteúdo novo é útil e, na maior parte, seguro.

Mesmo assim, ele **não entrega o que você pediu**:
- as práticas continuam sendo exercícios na tela;
- os encerramentos seguem um molde único;
- as vozes continuam iguais;
- do jeito que foi escrito, quebra a matrícula de quem já está fazendo os cursos.

## Por curso

| Curso | Veredito | O principal a corrigir |
|---|---|---|
| C01 | **Não adotar** | Conflita com o piloto já aplicado: apagaria a missão real "Se eu atrasar", poria o encerramento no meio do curso e usa "Paula" em vez da Renata. Só a decisão nova entra no piloto, reescrita com a Renata. |
| C02–C09 | Adotar com correções | O C03 e o C04 são os mais prontos. No C05, o retorno precisa dizer que o aprendiz não compensa jornada (CLT, art. 432). No C03, uma fala com cliente soa irreal. No C07 e no C09, a demonstração repete um vídeo que o curso já tem. |
| C10 | Adotar com correções | O aprofundamento repete o v03. A prática perde o objetivo da aula 2. Aparece uma "Nina" inventada, quando o curso já tem o Henrique. |
| C11 | Adotar com correções (**P0**) | O avatar Renato vira personagem da cena, como se fosse experiência pessoal. Trocar pela Duda. |
| C12, C13 | Adotar | Só ajustes de texto. |
| C14 | Adotar com correções | As trocas de fala das aulas 8 e 9 **não** devem entrar, porque quebram a missão m07. A da aula 4 entra só curta. A reação da q25, opção C, foi reescrita. |
| C15, C16 | Adotar com correções | A demonstração ou a decisão repetem um caso que o curso já tem. As versões novas já estão escritas. |
| C17, C18 | Adotar | Só ajustes de texto. |
| C19 | Adotar com correções | A prática já traz a resposta no enunciado. Falta a frase memorável "vaga de verdade não cobra". |
| C20 | Adotar com correções | A seleção múltipla é fácil demais e apaga a única prática de escrever um pedido para a IA. |
| C21, C23 | Adotar com correções | Ambiguidades de texto e uma opção caricata. |
| C22 | Adotar com correções | A decisão nova repete a situação da Elaine com outra resposta como a melhor, o que gera contradição. A substituta já está escrita. |
| C24 | Adotar com correções | A decisão traz a resposta no enunciado, e a ordenação repete a q03. |
| C25 | Adotar com correções | É o melhor do pacote. Só faltam mais itens na classificação. |
| C26 | Adotar com correções | A demonstração e a decisão repetem o fim do curso. A substituta é "o problema voltou uma semana depois". |

## Problemas que se repetem nos 26

1. **Práticas que não são missões.** Em 23 dos 26 cursos, a prática vira um texto curto sobre um caso fictício. Em vários, a pessoa só copia a frase que acabou de ver. **Proposta:** "Leve para a vida real", com uma ação concreta, um caminho para quem ainda não tem vaga e uma caixa "Fiz". O modelo é o piloto do C01.
2. **Encerramentos.** Os 26 têm a mesma estrutura de 4 parágrafos, o mesmo título "Leve para o próximo dia" e citam "Meu roteiro" na fala. Duram cerca de 1 minuto cada. **Proposta:** no máximo 110 palavras, com um momento do próprio curso, o que a pessoa já sabe fazer, uma frase final forte e uma despedida. Há um modelo reescrito para o C09, com 98 palavras.
3. **Vozes.** As fichas de voz são boas, mas não foram usadas. Os instrutores ficaram com frases do mesmo tamanho, sem perguntas e com jargão ("referência responsável", "proporcional", "impedimento").
4. **Repetição do curso atual.** Em C07, C09, C10, C15, C16, C22, C24 e C26, o conteúdo novo repete um vídeo ou uma pergunta que o curso já tem.
5. **Missão antiga no áudio.** Os vídeos gravados ainda anunciam a prática antiga. Trocar a prática exige cortar esse anúncio também.

## Estrutura: onde entra o conteúdo novo

O pacote insere conteúdo **dentro** de aulas que já existem, nos 26 cursos. Hoje o sistema não consegue levar quem já está matriculado para uma versão assim. Há dois caminhos:
- **(A) Uma aula nova no fim de cada curso.** É o caminho seguro, e é o que o piloto do C01 já fez.
- **(B) Programar a migração para aceitar cenas novas no meio das aulas.** Funciona, mas é trabalho de código e traz mais risco.

## Tipos novos de prática

Hoje só existem a montagem de frase com blocos e as perguntas de escolha. Os tipos novos ficam assim:
- **Texto com autoconferência** ("Conferir minha resposta"): esforço pequeno.
- **Ordenação e classificação:** de 3 a 5 dias de código cada, e servem para 1 curso cada (C24 e C25).
- **Seleção múltipla:** já existe como avaliação, mas nenhum curso usa.

## Cortes (conferidos nas transcrições)

O pacote sugere 96 cortes. Conferidos nas transcrições:
- **28 são seguros e grátis:** é o aviso repetido da missão no fim do vídeo. Somam cerca de 2 minutos e saem só remontando.
- **64 são arriscados:** em 36 aulas, o aviso de abertura é o **único** aviso da missão.
- **4 são do C01** e já foram resolvidos pelo piloto.

A análise técnica inicial dizia 95 cortes grátis. A conferência nas transcrições corrigiu esse número.

## Custo

- **Ritmo real de fala** (medido em 717 planos): 2,62 palavras por segundo.
- **Pacote como veio** (78 vídeos, 7.938 palavras): **cerca de US$ 55**.
- **Com os encerramentos encurtados para cerca de 110 palavras:** cerca de US$ 45.
- **Saldo de mídia hoje:** cerca de US$ 33, com o piloto do C01 (US$ 9,34) ainda pendente.
- **O que é grátis:** as correções de texto, os 28 cortes e as remontagens.

## Plano recomendado

- **Fase 0 (grátis):** os 28 cortes seguros; trocar "Escreva…" pelo enunciado certo nas 26 práticas de montagem; as correções de texto do C22 e do C24.
- **Fase 1 (cerca de US$ 12):** gravar o piloto do C01 (US$ 9,34) e um segundo piloto do pacote já corrigido, como aula nova no fim (o C24 ou o C25).
- **Fase 2 (cerca de US$ 40):** os 24 cursos restantes, trilha por trilha, com práticas de vida real, encerramentos curtos e vozes distintas. Isso exige um novo teto de gastos.

Detalhes: `analise.md` (técnica), `pedagogia-C01-C09.md`, `pedagogia-C10-C18.md`, `pedagogia-C19-C26.md` e `cortes.md`.
