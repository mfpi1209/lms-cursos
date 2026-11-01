# Raio-X dos cursos: resumo

Gerado em 2026-11-01 13:01 por `tools/raio-x/gerar.mjs`. Detalhe completo em `raio-x.json`.

## Cobertura do áudio (ASR)

- Vídeos com arquivo no disco: **700**; com transcrição real: **700** (700 com texto e tempos do whisper, 0 herdados do QA anterior, sem acento nem tempos); pendentes: **0**.
- Nós que deveriam ter vídeo e ainda não têm (aguardando gravação ou lacuna): **87** no rascunho, **87** na versão publicada. Vídeos referenciados sem arquivo: 0.
- Para completar depois da gravação, rode o gerador de novo: ele transcreve só o que falta.

## Frases que se repetem em vários cursos (fala robótica)

Frases de 4 palavras ou mais ditas em 3 cursos ou mais (rascunho). As primeiras 15; a lista completa está em `frasesRepetidasEmVariosCursos` no JSON.

| Frase | Vezes | Cursos |
|---|---|---|
| Vamos olhar o efeito disso. | 26 | 13 (C06, C15, C16, C17, C18, C19…) |
| Veja o que essa escolha muda. | 25 | 13 (C06, C15, C16, C17, C18, C19…) |
| Muita gente responderia assim. | 24 | 14 (C01, C02, C03, C04, C05, C06…) |
| Faz sentido pensar assim, mas repara. | 22 | 14 (C01, C02, C03, C04, C05, C06…) |
| Vamos olhar isso com calma. | 20 | 14 (C01, C02, C03, C04, C05, C06…) |
| Faz sentido, mas dá para ir além. | 19 | 14 (C01, C02, C03, C04, C05, C06…) |
| Pense no que acontece depois. | 14 | 13 (C06, C15, C16, C17, C18, C19…) |
| Repare no que isso provoca. | 13 | 12 (C06, C15, C16, C17, C18, C19…) |
| Olhe isso com calma. | 12 | 12 (C15, C16, C17, C18, C19, C20…) |
| Vale pensar no que fica de fora. | 12 | 12 (C15, C16, C17, C18, C19, C20…) |
| Tem um caminho ainda melhor. | 8 | 7 (C02, C04, C07, C08, C10, C13…) |
| Agora, responda: o que você faz? | 7 | 4 (C14, C15, C19, C22) |
| Eu sou o Mauro, seu orientador neste curso da DNA Work. | 3 | 3 (C15, C16, C17) |
| Eu sou a Laís, sua orientadora neste curso da DNA Work. | 3 | 3 (C18, C19, C20) |
| Eu sou o Vinícius, seu orientador neste curso da DNA Work. | 3 | 3 (C21, C22, C23) |

## Por curso (rascunho | versão publicada)

Alertas por gravidade: A = alta, M = média, B = baixa (informativos, como vídeo ainda não gravado, ficam fora). “sem vídeo” = nós que deveriam ter vídeo e não têm.

| Curso | Título | Instrutor | Trilha | Situação | Aulas | Vídeo real | ASR | Sem vídeo | Rascunho A/M/B | Publicada A/M/B |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Meu primeiro dia | Marina | Primeiro emprego | publicado v13 | 4 | 8 min | 21/21 | 12 | 12/1/4 | 12/1/4 |
| C02 | Que roupa eu uso? | Camila | Imagem e postura | publicado v13 | 3 | 5 min | 19/19 | 3 | 3/0/3 | 3/0/3 |
| C03 | Celular no trabalho | Rafael | Rotina e combinados | publicado v14 | 3 | 5 min | 19/19 | 3 | 3/0/5 | 3/0/5 |
| C04 | WhatsApp sem complicação | Thiago | Rotina e combinados | publicado v15 | 3 | 5 min | 19/19 | 3 | 3/0/1 | 3/0/1 |
| C05 | Horário é combinado | Júlia | Rotina e combinados | publicado v16 | 3 | 5–6 min | 19/19 | 3 | 3/1/3 | 3/1/3 |
| C06 | Brincadeiras têm limite | Patrícia | Convivência | publicado v13 | 4 | 7 min | 28/28 | 3 | 3/1/6 | 3/1/6 |
| C07 | Como falar com a equipe | Gustavo | Convivência | publicado v16 | 3 | 5 min | 19/19 | 3 | 3/0/6 | 3/0/6 |
| C08 | O espaço também é do outro | Aline | Convivência | publicado v15 | 3 | 5 min | 19/19 | 3 | 3/3/2 | 3/3/2 |
| C09 | Posso postar isso? | Enzo | Imagem e postura | publicado v16 | 3 | 5–6 min | 19/19 | 3 | 3/0/1 | 3/0/1 |
| C10 | Terminei. E agora? | Beatriz | Rotina e combinados | publicado v15 | 3 | 5 min | 19/19 | 3 | 3/0/5 | 3/0/5 |
| C11 | Não entendi. Posso perguntar? | Renato | Rotina e combinados | publicado v17 | 3 | 5 min | 19/19 | 3 | 3/0/1 | 3/0/1 |
| C12 | Recebi uma correção. E agora? | Helena | Imagem e postura | publicado v17 | 3 | 5–6 min | 18/18 | 3 | 3/0/1 | 3/0/1 |
| C13 | Comecei a trabalhar | Rafael | Primeiro emprego | publicado v16 | 7 | 13–14 min | 58/58 | 3 | 3/4/32 | 3/4/32 |
| C14 | Minha primeira vaga | Marina | Primeiro emprego | publicado v18 | 13 | 20–22 min | 115/115 | 3 | 3/26/59 | 3/26/59 |
| C15 | O outro só é diferente | Mauro | Respeito e diálogo | publicado v5 | 3 | 5 min | 23/23 | 3 | 3/2/5 | 3/2/5 |
| C16 | Discordar sem brigar | Mauro | Respeito e diálogo | publicado v5 | 3 | 5 min | 23/23 | 3 | 3/3/4 | 3/3/4 |
| C17 | Minha ideia também conta | Mauro | Respeito e diálogo | publicado v4 | 3 | 5 min | 23/23 | 3 | 3/4/4 | 3/4/4 |
| C18 | Seus dados também trabalham | Laís | Tecnologia com critério | publicado v5 | 3 | 5 min | 23/23 | 3 | 3/2/9 | 3/2/9 |
| C19 | Parece verdade. Será? | Laís | Tecnologia com critério | publicado v5 | 3 | 5 min | 23/23 | 3 | 3/3/7 | 3/3/7 |
| C20 | IA como aliada | Laís | Tecnologia com critério | publicado v4 | 3 | 5 min | 23/23 | 3 | 3/2/8 | 3/2/8 |
| C21 | Tudo é urgente? | Vinícius | Autonomia no trabalho | publicado v6 | 3 | 5 min | 24/24 | 3 | 3/3/9 | 3/3/9 |
| C22 | Errei. E agora? | Vinícius | Autonomia no trabalho | publicado v6 | 3 | 4 min | 23/23 | 3 | 3/5/7 | 3/5/7 |
| C23 | Aprender faz parte do trabalho | Vinícius | Autonomia no trabalho | publicado v3 | 3 | 4–5 min | 23/23 | 3 | 3/0/9 | 3/0/9 |
| C24 | Por onde eu começo? | Flávia | Pensar e resolver | publicado v5 | 3 | 6 min | 23/23 | 3 | 3/2/8 | 3/2/8 |
| C25 | Faz sentido? | Flávia | Pensar e resolver | publicado v4 | 3 | 4–5 min | 23/23 | 3 | 3/3/6 | 3/3/6 |
| C26 | Onde está o problema? | Flávia | Pensar e resolver | publicado v3 | 4 | 6 min | 33/33 | 3 | 3/4/16 | 3/4/16 |

## Por tipo de alerta

| Tipo | Rascunho | Versão publicada | Checagem das trilhas |
|---|---|---|---|
| Frase repetida em vários nós (`fala_repetida`) | 114 | 114 | 0 |
| Nó sem vídeo (`sem_midia`) | 87 | 87 | 0 |
| Fala com mais de 25 palavras (`fala_longa`) | 77 | 77 | 0 |
| Título fora do padrão “No lugar de X” (`fora_padrao_no_lugar`) | 51 | 51 | 48 |
| Palavras do roteiro ausentes no áudio (`palavras_ausentes_no_audio`) | 28 | 28 | 0 |
| Opção muito mais longa que as outras (`opcao_muito_longa`) | 6 | 6 | 2 |
| Pergunta sem exatamente uma opção forte (`pergunta_sem_opcao_forte`) | 4 | 4 | 0 |
| Áudio × roteiro abaixo de 0,90 (`asr_similaridade_baixa`) | 4 | 4 | 0 |
| Palavras ouvidas que não estão no roteiro (`palavras_sobrando_no_audio`) | 3 | 3 | 0 |
| Chamada que o vídeo não diz (`chamada_nao_dita`) | 3 | 3 | 0 |

Dos alertas “Nó sem vídeo”, 0 são informativos (a aula inteira ainda aguarda gravação).

## Tipo × curso (rascunho, sem informativos)

| Tipo | C01 | C02 | C03 | C04 | C05 | C06 | C07 | C08 | C09 | C10 | C11 | C12 | C13 | C14 | C15 | C16 | C17 | C18 | C19 | C20 | C21 | C22 | C23 | C24 | C25 | C26 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Frase repetida em vários nós |  |  |  |  |  |  | 4 | 2 |  |  |  |  | 15 | 39 | 2 | 4 | 6 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 10 |
| Nó sem vídeo | 12 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| Fala com mais de 25 palavras | 3 |  | 4 | 1 | 3 | 4 | 2 | 2 | 1 | 3 | 1 | 1 | 16 | 14 | 2 |  |  | 3 | 1 | 2 | 1 |  | 5 | 3 | 1 | 4 |
| Título fora do padrão “No lugar de X” |  |  |  |  |  | 1 |  |  |  |  |  |  |  | 25 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 3 |  | 2 | 2 | 3 |
| Palavras do roteiro ausentes no áudio | 2 | 3 |  |  |  | 1 |  |  |  | 2 |  |  | 3 | 2 |  |  |  | 2 | 2 | 2 | 2 | 3 |  | 1 | 1 | 2 |
| Opção muito mais longa que as outras |  |  |  |  | 1 |  |  | 1 |  |  |  |  |  |  |  | 1 |  |  | 1 |  |  | 1 |  |  |  | 1 |
| Pergunta sem exatamente uma opção forte |  |  | 1 |  |  | 1 |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  |  |  |  |  |  |  |  |
| Áudio × roteiro abaixo de 0,90 |  |  |  |  |  |  |  |  |  |  |  |  | 1 | 1 |  |  |  |  |  |  |  | 1 |  |  | 1 |  |
| Palavras ouvidas que não estão no roteiro |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  | 2 |  |  |  |  |  |
| Chamada que o vídeo não diz |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 |  |  |  |  |  |  |  |  |  |  |  |  |

## Os 30 alertas mais graves

Causa comum: dos 0 vídeos desatualizados, 0 ganharam no roteiro a frase que anuncia a missão e não foram regravados; o aluno chega à missão sem ouvir o anúncio (alerta `missao_sem_anuncio`).

Ordem: gravidade e, dentro dela, o tamanho do problema (diferença do áudio, palavras faltando, repetições). No máximo 8 por tipo, para a lista não ficar só com uma causa; a lista completa está em `raio-x.json`. Alertas iguais no rascunho e na publicada aparecem uma vez.

| # | Onde | Gravidade | Problema | Versão |
|---|---|---|---|---|
| 1 | `C01·A3·q04·A·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 2 | `C01·A3·q04·B·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 3 | `C01·A3·q04·C·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 4 | `C01·A3·q05·A·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 5 | `C01·A3·q05·B·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 6 | `C01·A3·q05·C·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 7 | `C01·A4·q06·A·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 8 | `C01·A4·q06·B·reação` | alta | Este nó deveria ter vídeo e não tem, embora a aula já tenha outros vídeos gravados e não haja gravação na fila. | rascunho e publicada |
| 9 | `C13·A1·q01` | media | Fala com 49 palavras (limite 25). | rascunho e publicada |
| 10 | `C13·A5·q08` | media | Fala com 42 palavras (limite 25). | rascunho e publicada |
| 11 | `C13·A4·q06` | media | Fala com 41 palavras (limite 25). | rascunho e publicada |
| 12 | `C01·A2·v03` | media | Palavras do roteiro que não aparecem no áudio (3): “oito e vinte”. | rascunho e publicada |
| 13 | `C08·A1·v01` | media | Frase repetida em 2 nós do curso: “Agora, responda: o que você faria no lugar da Sara?” (também em C08·A2·v02). | rascunho e publicada |
| 14 | `C08·A2·v02` | media | Frase repetida em 2 nós do curso: “Agora, responda: o que você faria no lugar da Sara?” (também em C08·A1·v01). | rascunho e publicada |
| 15 | `C17·A2·v04` | media | Frase repetida em 2 nós do curso: “O Leandro testou o atalho por uma semana.” (também em C17·A3·v05). | rascunho e publicada |
| 16 | `C17·A3·v05` | media | Frase repetida em 2 nós do curso: “O Leandro testou o atalho por uma semana.” (também em C17·A2·v04). | rascunho e publicada |
| 17 | `C22·A3·q05·B` | media | Opção com 91 caracteres, 3.4× a média das outras (27) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 18 | `C25·A1·q02·C·reação` | media | O áudio bate 88% com o roteiro (mínimo 90%). | rascunho e publicada |
| 19 | `C05·A3·q04·A` | media | Opção com 91 caracteres, 1.6× a média das outras (56) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 20 | `C08·A3·q04·A` | media | Opção com 95 caracteres, 1.6× a média das outras (61) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 21 | `C16·A3·q05·B` | media | Opção com 96 caracteres, 1.7× a média das outras (58) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 22 | `C19·A3·q05·A` | media | Opção com 94 caracteres, 1.7× a média das outras (54) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 23 | `C26·A1·q02·C` | media | Opção com 69 caracteres, 1.6× a média das outras (42) e é a opção forte: o tamanho entrega a resposta. | rascunho e publicada |
| 24 | `C13·A3·q05` | media | O áudio bate 89% com o roteiro (mínimo 90%). | rascunho e publicada |
| 25 | `C14·A3·q06·B·reação` | media | O áudio bate 89% com o roteiro (mínimo 90%). | rascunho e publicada |
| 26 | `C06·A3·q04` | media | Título fora do padrão “No lugar de X, …?”: “O que você pode fazer?”. | rascunho e publicada |
| 27 | `C14·A1·q02` | media | Título fora do padrão “No lugar de X, …?”: “Que habilidade isso mostra?”. | rascunho e publicada |
| 28 | `C14·A10·q19` | media | Título fora do padrão “No lugar de X, …?”: “Qual final completa melhor a história?”. | rascunho e publicada |
| 29 | `C14·A11·q22` | media | Título fora do padrão “No lugar de X, …?”: “Como você responde por que quer trabalhar ali?”. | rascunho e publicada |
| 30 | `C14·A11·q23` | media | Título fora do padrão “No lugar de X, …?”: “Perguntaram quanto você espera de bolsa. O que você diz?”. | rascunho e publicada |
