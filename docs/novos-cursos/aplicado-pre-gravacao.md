# Revisão pré-gravação aplicada

Data: 31/10/2026. Fonte: `docs/novos-cursos/revisao-pre-gravacao.md`. Nada foi publicado, commitado nem gravado em vídeo; só rascunhos, código e testes.

## Como foi aplicado

As correções entraram **na fonte do importador** (`packages/db/src/scripts/pacote-15/`), não nos rascunhos, então reimportar não as desfaz (reimportação 2×: 13 linhas "sem mudanças", nenhum curso duplicado). Os 12 rascunhos e a aula 3 de `crs_b8zeh4b2gguseghq` foram atualizados pelo próprio importador (`importar-pacote-15.ts`).

| Onde | O que mudou |
|---|---|
| `final.ts`, `editorial.ts`, `dados.ts` | textos das alternativas, retornos, reações (novo campo `r`), casos, fechamentos, atividades, pílulas, objetivos |
| `final.ts` (`CORRECOES_DE_FALA`) | trechos de fala que vêm do pacote (`curso.json`, que não se edita). Cada um tem o trecho antigo e para o importador se ele não estiver mais lá |
| `planos.ts` (novo) | cortes de fala em planos fixados pelo revisor (14 cenas): missão num plano, caso num plano novo, etc. Para se a fala mudou sem atualizar o corte |
| `montagem.ts` | reação escrita, `falaAntes` (fala diferente do painel), planos fixados, recomendada dupla, conferência dos pontos pela classificação |
| `importar-pacote-15.ts` | aula 3: preserva o título já decidido, grava com `expectedRevision` e tenta de novo se houver conflito, recusa se a aula tiver vídeo |
| `trails.ts` | checagens: posições, distratores novos, tamanhos |
| `trail-check-form.tsx`, `page.tsx`, `api/trilhas/[trail]/checagem/route.ts`, `recognition.ts` | opções embaralhadas por aluno e tentativa |

## Aplicado

1. **As 141 correções do JSON**, todas. O teste `packages/db/test/pacote-15-revisao.test.ts` lê o bloco JSON do relatório e confere cada item no documento gerado (141 testes, um por item). Regras do motor conferidas pelo importador: fala = soma dos planos, `bridge.call` = fala final da cena anterior (as correções de chamada mudam situação, chamada e plano juntos), planos novos com "nods slowly, warm" ou "hands relaxed at the waist, calm, small nods".
2. **Pontos das arestas**: o importador dá +2/+1/0 pela classificação, então as 8 mudanças de `quality` já acertaram as arestas (`e_q03_b` de O outro, `e_q04_a`/`e_q04_b` de Discordar, `e_q03_c` de Seus dados, `e_q04_a` de Tudo é urgente, `e_q03_c` de Faz sentido, `e_q01_c` e `e_q05_b` de Onde está o problema). Teste e validador conferem aresta por aresta.
3. **Checagens das trilhas** (`trails.ts`): correta nas posições do relatório (nunca sempre "a"; marcar sempre a, b ou c não passa), 24 distratores/situações do relatório trocados, aspas aninhadas corrigidas. A correta era a mais longa em 21 de 24; agora é em 2 (tc1 e pr6; encurtei a correta ou alonguei distratores que não eram do relatório).
4. **Embaralhar as opções** (estável por aluno e tentativa, sem gabarito no navegador): semente `usuário|trilha|nº de tentativas já enviadas`; a página entrega as opções já embaralhadas, o novo `GET /api/trilhas/[trail]/checagem` devolve a ordem da próxima tentativa (o botão "Refazer" usa) e o `POST` continua corrigindo pelo id da opção. Testes: `packages/course-schema/test/trails.test.ts` (estabilidade, mudança por tentativa/aluno, permutação, sem `correct`/retorno, correta espalhada em 300 alunos) e `apps/web/src/app/api/trilhas/[trail]/checagem/route.test.ts`.
5. **"Missão" na fala, "Na prática" na tela**: mantido (teste confere).
6. **IA como aliada**: a fala não afirma mais política, ferramenta autorizada nem idade. Agora: "Use somente informações que você pode compartilhar e pergunte qual é a regra para uso de IA no seu trabalho" (aula 1, fala); fechamento da aula 1 ("informações que você pode compartilhar"); retorno da decisão do Samuel ("pergunte qual é a regra para uso de IA no seu trabalho"); opção da atividade da aula 2. Teste proíbe "ferramenta autorizada/permitida", "idade mínima", "política de IA".
7. **Canal de apoio**: "responsável pelo programa" saiu da fala, da pílula ("Na escola ou no trabalho") e da atividade ("quem acompanha o seu trabalho"); nenhum texto cita agente de integração (teste confere).

## Desvios e consequências (decisões minhas, para conferir)

- **Pílula "O trabalho caiba no tempo"** (Tudo é urgente?, aula 2, v05): o JSON pedia "cabe no tempo", mas a fala diz "caiba" e o motor exige que a pílula seja dita palavra por palavra. Usei "caiba". O teste tem essa exceção declarada.
- **Duas recomendadas** em O outro só é diferente (aula 2, 1ª decisão), como o relatório decide: o validador aceita 2 só onde a especificação tem 2. Só a primeira consome a lista de aberturas de reação "recomendadas", para as reações seguintes da aula não mudarem.
- **Regra "a recomendada nunca é a mais longa"** (teste existente) quebrava em 2 decisões por causa do JSON: alonguei o distrator fraco "Prometo compensar… até entregar tudo hoje" (Tudo é urgente?) e encurtei a recomendada "Faço um envio de teste fictício e confirmo no destino" (Onde está o problema?, antes "com dados fictícios").
- **Reação derivada**: o JSON trocou o retorno de Parece verdade. aula 2 q03·b sem dar reação; o importador teria posto o retorno inteiro (24 palavras com "Faça assim", o problema de S2). Escrevi "Olhe isso com calma. Popularidade não confirma a informação."
- **Objetivo do curso** (`OBJETIVO_CURSO`, `dados.ts`) para "Seus dados também trabalham" e "Aprender faz parte do trabalho". Além da fala "Hoje, vamos…", muda descrição, resumo do aluno, tagline e `brief.topic/finalSkill`. No de Aprender, a promessa antiga ("plano pequeno de desenvolvimento") estava em todos esses campos.
- **tc4** (Tales): o retorno da correta falava em "dinheiro"; troquei por "dados" porque a situação agora pede CPF.
- **Aula 3 de crs_b8zeh4b2gguseghq**: o rascunho tinha sido alterado depois da importação (por outros scripts), então apliquei com `--forcar --only nem-toda-brincadeira`, que troca só a aula 3 (aulas 1 e 2 conferidas intactas) com `expectedRevision` (rev. 92 → 93). O título da aula 3 ("Como apoiar quando o alvo é outra pessoa", do script de nomes finais) foi preservado. Antes disso só esse título diferia do gerado.
- **tudo-e-urgente aula 2, v04**: com a frase de revisão (10 palavras) o importador não consegue montar o cartão (precisa de 13 a 39). Os planos e as pílulas dessa cena são montados em `forcarPlanos`, com as mesmas câmeras que o importador usaria (estúdio com zonas).

## Validação

- Testes: `packages/db` 244 (inclui `pacote-15.test.ts`, `pacote-15-revisao.test.ts`), `packages/course-schema` 242 (inclui `trails.test.ts`), `apps/web` 29. Typecheck limpo em `packages/db`, `packages/course-schema` e `apps/web`.
- Reimportação 2×: tudo "sem mudanças"; aula 3 "já está igual".
- Diff do rascunho antes × depois dos 12 cursos: só os campos do JSON mais os efeitos acima.
- Orçamento (servidor :3010, demo, `POST …/media-jobs/quote` com `includeStale`, só calcula): **0 erros de direção** nos 13 documentos.

| Curso | Cenas | Orçamento (US$) |
|---|---|---|
| O outro só é diferente | 20 | 5,80 |
| IA como aliada | 20 | 5,31 |
| Parece verdade. Será? | 20 | 5,18 |
| Seus dados também trabalham | 20 | 5,09 |
| Tudo é urgente? | 21 | 5,30 |
| Errei. E agora? | 20 | 5,30 |
| Minha ideia também conta | 20 | 4,89 |
| Discordar sem brigar | 20 | 5,08 |
| Aprender faz parte do trabalho | 20 | 5,64 |
| Por onde eu começo? | 20 | 5,50 |
| Faz sentido? | 20 | 4,70 |
| Onde está o problema? | 30 | 7,46 |
| Liberdade e intimidade (cenas ainda sem vídeo, inclui a aula 3) | 10 | 2,48 |
| **Total** | 261 | **67,73** |

- Prévia do estúdio percorrida até "Aula concluída" em 6 aulas (O outro aula 2, Seus dados aula 2, Tudo é urgente? aula 2, Liberdade e intimidade aula 3, Por onde eu começo? aula 2, Aprender faz parte aula 1), sem erro de página.

## Não aplicado

- **S8** (trocar o `body` das 26 explicações por título de 2 a 4 palavras): o relatório não lista item a item; fora do pedido.
- **S5**, leitura de "16h/15h" pelo TTS (Tudo é urgente? aula 1): conferir na gravação de amostra.
- **S7** já decidido (missão na fala, Na prática na tela).

## Pendências (do dono ou de fora do código)

1. **Política de IA e idade mínima das ferramentas**: confirmar antes de publicar IA como aliada. A fala agora manda perguntar a regra do próprio trabalho, então a gravação não depende disso.
2. **Canal de apoio**: confirmar que "um adulto de confiança, na escola ou no trabalho" e "quem acompanha o seu trabalho" são verdadeiros para os alunos do programa.
3. **Onde está o problema?**, aulas 2 e 3: manter ou trocar a instância "formulário de teste" por algo do balcão/estoque/cozinha (antes de gravar).
4. **Checagem da trilha de Convivência** continua sem situação para a aula 3.
5. **Trilha**: a vitrine ordena por título, então "IA como aliada" aparece antes de "Parece verdade. Será?"; a recomendação Parece verdade → IA não é representável hoje.
6. Rascunhos prontos para o orçamento oficial e o "aprovo"; nada foi gravado nem publicado.
