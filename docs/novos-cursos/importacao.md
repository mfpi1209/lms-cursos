# Importação do pacote-15 como rascunhos

Data: 31/10/2026 · ambiente de desenvolvimento (servidor em `http://localhost:3010`, modo de mídia **demo**; nada foi publicado, gerado, pago nem commitado).

Fontes: `docs/novos-cursos/pacote-15/` (contrato `dna-editorial-1.0`), `docs/novos-cursos/analise-fable.md` e as duas decisões da coordenação (ajustes de padrão do motor; depois a aprovação do dono às fusões, às trilhas novas e a 2 decisões por aula).

Script: `packages/db/src/scripts/importar-pacote-15.ts` (módulos em `packages/db/src/scripts/pacote-15/`). Resultado da última execução: `docs/novos-cursos/importacao.json`.

## 1. Resultado

Os 15 cursos do pacote viraram **12 cursos finais** (rascunhos, nunca publicados) e **1 aula nova** no rascunho de um curso existente. Três cursos do pacote foram fundidos e seus rascunhos arquivados (nada foi apagado).

### 1.1 Cursos finais (rascunho)

| ID | Curso | Instrutor (kit) | Trilha | Aulas | Prévia (curso · aula 1) | Orçamento (cálculo, sem batch) |
|---|---|---|---|---|---|---|
| `crs_t303ykqfmhj3yb1g` | O outro só é diferente | Patrícia (`estudio8-patricia`) | Respeito e diálogo | 2 | [curso](http://localhost:3010/estudio/cursos/crs_t303ykqfmhj3yb1g) · [aula 1](http://localhost:3010/estudio/cursos/crs_t303ykqfmhj3yb1g/aulas/aula_01/previa) | 20 cenas · US$ 5.86 |
| `crs_m60hsx8on6ebcyqg` | IA como aliada | Enzo (`estudio8-enzo`) | Tecnologia com critério | 2 | [curso](http://localhost:3010/estudio/cursos/crs_m60hsx8on6ebcyqg) · [aula 1](http://localhost:3010/estudio/cursos/crs_m60hsx8on6ebcyqg/aulas/aula_01/previa) | 20 cenas · US$ 5.25 |
| `crs_au1463izc386by27` | Parece verdade. Será? | Enzo (`estudio8-enzo`) | Tecnologia com critério | 2 | [curso](http://localhost:3010/estudio/cursos/crs_au1463izc386by27) · [aula 1](http://localhost:3010/estudio/cursos/crs_au1463izc386by27/aulas/aula_01/previa) | 20 cenas · US$ 5.23 |
| `crs_tg9iqz8wmmf5pw77` | Seus dados também trabalham | Thiago (`estudio8-thiago`) | Tecnologia com critério | 2 | [curso](http://localhost:3010/estudio/cursos/crs_tg9iqz8wmmf5pw77) · [aula 1](http://localhost:3010/estudio/cursos/crs_tg9iqz8wmmf5pw77/aulas/aula_01/previa) | 20 cenas · US$ 4.89 |
| `crs_4jh683s5h351z2db` | Tudo é urgente? | Júlia (`estudio6-julia`) | Autonomia no trabalho | 2 | [curso](http://localhost:3010/estudio/cursos/crs_4jh683s5h351z2db) · [aula 1](http://localhost:3010/estudio/cursos/crs_4jh683s5h351z2db/aulas/aula_01/previa) | 21 cenas · US$ 5.41 |
| `crs_njtlqq7y7fyfeqcr` | Errei. E agora? | Beatriz (`estudio7-beatriz`) | Autonomia no trabalho | 2 | [curso](http://localhost:3010/estudio/cursos/crs_njtlqq7y7fyfeqcr) · [aula 1](http://localhost:3010/estudio/cursos/crs_njtlqq7y7fyfeqcr/aulas/aula_01/previa) | 20 cenas · US$ 5.41 |
| `crs_5k5upah2xphlfvi5` | Minha ideia também conta | Gustavo (`estudio7-gustavo`) | Respeito e diálogo | 2 | [curso](http://localhost:3010/estudio/cursos/crs_5k5upah2xphlfvi5) · [aula 1](http://localhost:3010/estudio/cursos/crs_5k5upah2xphlfvi5/aulas/aula_01/previa) | 20 cenas · US$ 4.95 |
| `crs_2rt2rsoii8bpydp2` | Discordar sem brigar | Gustavo (`estudio7-gustavo`) | Respeito e diálogo | 2 | [curso](http://localhost:3010/estudio/cursos/crs_2rt2rsoii8bpydp2) · [aula 1](http://localhost:3010/estudio/cursos/crs_2rt2rsoii8bpydp2/aulas/aula_01/previa) | 20 cenas · US$ 5.02 |
| `crs_gl0hjkmqfgnnur9y` | Aprender faz parte do trabalho | Helena (`estudio8-helena`) | Autonomia no trabalho | 2 | [curso](http://localhost:3010/estudio/cursos/crs_gl0hjkmqfgnnur9y) · [aula 1](http://localhost:3010/estudio/cursos/crs_gl0hjkmqfgnnur9y/aulas/aula_01/previa) | 20 cenas · US$ 5.76 |
| `crs_dp9s7pdro9j6e3m0` | Por onde eu começo? | Renato (`estudio6-renato`) | Pensar e resolver | 2 | [curso](http://localhost:3010/estudio/cursos/crs_dp9s7pdro9j6e3m0) · [aula 1](http://localhost:3010/estudio/cursos/crs_dp9s7pdro9j6e3m0/aulas/aula_01/previa) | 20 cenas · US$ 5.66 |
| `crs_0ua5onij460lpzs0` | Faz sentido? | Helena (`estudio8-helena`) | Pensar e resolver | 2 | [curso](http://localhost:3010/estudio/cursos/crs_0ua5onij460lpzs0) · [aula 1](http://localhost:3010/estudio/cursos/crs_0ua5onij460lpzs0/aulas/aula_01/previa) | 20 cenas · US$ 4.92 |
| `crs_d5rsi8gt36rv0qbq` | Onde está o problema? | Renato (`estudio6-renato`) | Pensar e resolver | 3 | [curso](http://localhost:3010/estudio/cursos/crs_d5rsi8gt36rv0qbq) · [aula 1](http://localhost:3010/estudio/cursos/crs_d5rsi8gt36rv0qbq/aulas/aula_01/previa) | 30 cenas · US$ 7.58 |

Todas as prévias abrem com o login de autor do estúdio (`/estudio/cursos/<id>/aulas/<aula>/previa`); as outras aulas seguem o mesmo padrão (`aula_02`, `aula_03`).

### 1.2 Fundidos e arquivados (decisão do dono)

| ID | Curso do pacote | Estado | Onde foi parar |
|---|---|---|---|
| `crs_i433lbkq93tu9bta` | Nem toda brincadeira é brincadeira | arquivado | aula 3 do curso existente "Liberdade e intimidade são coisas diferentes" (crs_b8zeh4b2gguseghq); a aula 1 foi descartada (duplica "Brincadeiras têm limite") |
| `crs_7y0udlps2b7ri19i` | Seu ritmo também importa | arquivado | aula 2 de "Tudo é urgente?" |
| `crs_jt8kv51e0ftzi7zi` | Travei. Como peço ajuda? | arquivado | aula 1 de "Onde está o problema?"; a aula 2 foi descartada (duplica "Comecei a trabalhar") |

Arquivar = o mecanismo do projeto (`courses.status = 'archived'` + `archivedAt`); o rascunho e as revisões continuam no banco, só saem da lista ativa. A trilha provisória do pacote foi limpa desses 3 cursos (para não aparecer na lista de trilhas do estúdio).

### 1.3 Aula 3 de "Liberdade e intimidade são coisas diferentes"

Curso existente `crs_b8zeh4b2gguseghq` (publicado, versão 8): o **rascunho** ganhou a aula 3, "Quando o alvo é outra pessoa" (vinda de `nem-toda-brincadeira/a02`, mais uma 2ª decisão nova), com Patrícia e as câmeras do próprio curso. [Prévia da aula 3](http://localhost:3010/estudio/cursos/crs_b8zeh4b2gguseghq/aulas/aula_03/previa).
- As aulas 1 e 2 **não mudaram** (conferido por hash antes e depois, aula a aula); os outros 40 cursos fora do pacote também não mudaram (hash do rascunho, estado, versão e trilha idênticos).
- Também entraram `obj_aula_03` e `aula_03` em `completion.requiredLessonIds`. Os ids dos nós novos (`v04, q04, v05, q05, a03`) não colidem com os existentes.
- A versão publicada (v8) segue como estava; a aula 3 só chega aos alunos se o dono republicar (não foi feito).
- Custo de produção dessa aula, pelo orçamento (cálculo): 2 vídeos + 6 reações + 2 perguntas lidas = US$ 2,33 (2 vídeos US$ 1,06 + 6 reações US$ 0,85 + 2 perguntas lidas US$ 0,41).

## 2. O que foi aplicado

### 2.1 Ajustes de padrão do motor (1ª mensagem da coordenação)

| Pedido | Como ficou |
|---|---|
| Abertura "Oi! Eu sou… Hoje, vamos…" | Aula 1 de cada curso: "Oi! Eu sou a/o X, sua orientadora/seu orientador neste curso da DNA Work. Hoje, vamos <objetivo do curso>." (nome e papel vêm do kit). Aula 2 e 3: "Agora, vamos…". Aviso da missão: "No fim desta aula, tem uma missão para você: <ação>." |
| Fala antes da pergunta termina em "Agora, responda: …" | Cada decisão tem `bridge.call` = último fato do caso + "Agora, responda: <pergunta>", falada como plano final do vídeo anterior; os fatos anteriores do caso entram na fala antes. O painel mostra "A situação" completa. Conferido: a chamada está no fim da fala (`callStatuses`), até 28 palavras. |
| Título "No lugar de X, o que você…?" | Nas 2ª decisões (e nas novas) com personagem que decide: "No lugar da Lorena, o que você faz?". As decisões em 2ª pessoa do pacote ("Como você reage?") ficam como estão, porque o aluno já é o personagem. |
| Atividades por grupos (scaffold), não texto livre | 30 atividades por grupos (2 a 4 grupos, `question` por grupo, 2 a 5 opções), "Prefiro escrever" ligado (`allowCustom`, até 120 caracteres por lacuna), `intro` com a ponte, "Fazer depois" (`minLength 0`), título sem "Missão:" (o enunciado do pacote vira o título), entrada no "Meu roteiro". |
| Retornos em 3 partes | Todos os retornos: o que resolve, o que falta e "Faça assim: …" (o 1º trecho é o retorno do pacote onde o caso é o do pacote). |
| Recomendada: posição e tamanho; strong/ok/weak | Posição da recomendada: 16 / 16 / 18 (1ª / 2ª / 3ª) nas 50 decisões. Recomendada estritamente mais longa em 2 de 50 (no pacote era em 27 de 30). Diferença máxima de tamanho: 7 palavras (média bem menor). Nas 150 alternativas: 50 `strong`, 37 `ok` (têm parte do caminho) e 63 `weak` (não resolvem). |
| Abertura da aula 2 não entrega a resposta | As 15 aberturas da aula 2 foram reduzidas a "Agora, vamos…" + as frases do pacote que não resolvem o caso (a frase que dizia a resposta saiu). |
| Fechamentos diferentes | 30 fechamentos próprios (nenhum idêntico), cada um sobre o produto da aula e, na aula 1, a ponte para a aula 2. Sem "o plano". |

### 2.2 Decisões do dono ("aprovo")

| Item | Aplicado |
|---|---|
| nem-toda-brincadeira → aula 3 de "Liberdade e intimidade…" | Feito (seção 1.3); aula 1 do pacote descartada; rascunho novo arquivado. |
| seu-ritmo → tudo-e-urgente | Feito: "Tudo é urgente?" aula 1 = pedido "para agora" (pacote + 2ª decisão nova); aula 2 = "Quando as tarefas deixam de caber" (as duas decisões, as duas explicações e a atividade de pedido de ajuste de "Seu ritmo"). A cena de 40/50 minutos e a atividade de organizar 3 demandas saíram. "Seu ritmo" arquivado. |
| travei a01 → aula inicial de "Onde está o problema?" | Feito: 3 aulas ("Antes de mexer: dá para desfazer?", "Antes de consertar, investigue", "Funcionou mesmo?"). A aula 2 de "Travei" foi descartada (duplica "Comecei a trabalhar"). "Travei" arquivado. |
| errei, aprender-faz-parte, o-outro: casos novos | **errei**: aula 1 com erro que já produziu efeito (orçamento com valor errado, reação do gestor) e aula 2 com prevenção proporcional; **aprender-faz-parte** reorientado ("O que eu já faço com autonomia?" e "Como aprender uma tarefa observando"), sem repetir "Comecei a trabalhar"; **o-outro**: aula 2 nova (diferença que não é erro: convidar sem cobrar; limite com sotaque sem depender de confronto). Também: discordar a01 virou "receber a discordância" (o caso do pacote passou a ser a 2ª decisão) e minha-ideia a02 ganhou alternativas razoáveis (`ok`) no lugar das caricatas. |
| 4 trilhas atuais intactas, 4 novas | Feito (seção 3). |
| 2 decisões por aula | Feito: 25 aulas × 2 = 50 decisões nos 12 cursos (mais 2 na aula 3). 2ª decisão: caso com personagem novo, título "No lugar de X, o que você…?", opções em 1ª pessoa embaralhadas e de tamanho parecido, reação exclusiva por opção, retorno em 3 partes, e a explicação anterior termina com o fato do caso + "Agora, responda: …" (`bridge.call`). |
| Reimportação idempotente também nas fusões | Feito e testado (seção 5). |

### 2.3 Recomendações do Fable

| Recomendação (analise-fable.md) | Estado |
|---|---|
| 5.3: abertura, chamada, título, scaffold, retorno em 3 partes, posição/tamanho, strong/ok/weak, abertura da aula 2, fechamentos distintos | **Aplicadas** (2.1) |
| 3 e 2: fusões (nem-toda, seu-ritmo, travei), reorientação de aprender, substituir a02 de o-outro, novos casos de errei, diferenciar discordar a01 | **Aplicadas** (2.2) |
| 4: 4 trilhas novas, 4 atuais intactas | **Aplicada** (trilhas e checagens; ordem: ver 6) |
| 5.2.5, 2ª decisão por aula | **Aplicada** |
| Trocar as alternativas caricatas por razoáveis em todas as decisões (2.2, 2.3, 2.4… "op3 caricata") | **Pendente** (só minha-ideia a02 e as decisões novas). Aqui só se classificou strong/ok/weak e se equilibrou o tamanho, sem trocar o sentido das alternativas do pacote. |
| 5.1: trocar o texto de tela da explicação (que repete o enunciado da prática) por 2 a 3 ideias da fala | **Pendente** (a explicação já tem as pílulas com as ideias; o "texto na tela" do pacote ficou) |
| Nomes finais dos cursos ("Antes de enviar, confira", "O que eu já sei fazer?") | **Pendente** (decisão do dono; os títulos são os do pacote) |
| Política de IA e idade mínima das ferramentas (ia-como-aliada) | **Pendente** (dono/organização) |
| Registro formal demais ("atribuir uma intenção", "delimita"…) em falas e retornos do pacote | **Pendente** (revisão editorial; o texto novo foi escrito mais coloquial) |
| `parece-verdade a02` repete C14·A3 ("confira o domínio"); `seus-dados` citar C04/C09; ordem Parece verdade → IA | **Pendente** |
| `onde-esta-o-problema`: instância tangível no lugar do "formulário de teste/ambiente de produção" | **Parcial** (a 2ª decisão de cada aula usa preços, cadastros e envios; o caso do pacote ficou) |
| Trocar 1 situação da checagem de "Convivência" (cv3/cv4) por apoio a colega | **Pendente** (as trilhas atuais ficaram intactas por decisão) |
| Personagem com nome fio-condutor por curso | **Parcial** (cada 2ª decisão tem personagem novo; as 1ªs decisões do pacote seguem em 2ª pessoa) |
| Título curto de vitrine, descrição de uma linha e capa por curso | **Pendente** (`short-titles.ts` e capas só fazem sentido na publicação) |
| Reações em vídeo: decisão de orçamento | Reações **escritas** e prontas (texto, 8 a 26 palavras, abertura neutra e diferente em cada reação da aula); **nenhum vídeo gerado**. Desligar uma reação = `reaction.disabled`. |

## 3. Trilhas

As 4 trilhas atuais (Primeiro emprego, Rotina e combinados, Imagem e postura, Convivência) **não foram tocadas**, nem as checagens delas. Criadas (campo `courses.trail`, trocável pelo estúdio; a importação só troca a trilha quando está vazia ou ainda é a provisória do pacote):

| Trilha | Cursos (ordem proposta) | Checagem final (`packages/course-schema/src/trails.ts`) |
|---|---|---|
| Respeito e diálogo | O outro só é diferente → Discordar sem brigar → Minha ideia também conta | `respeito-e-dialogo`: 6 situações novas |
| Tecnologia com critério | Seus dados também trabalham → Parece verdade. Será? → IA como aliada | `tecnologia-com-criterio`: 6 situações |
| Autonomia no trabalho | Tudo é urgente? → Errei. E agora? → Aprender faz parte do trabalho | `autonomia-no-trabalho`: 6 situações |
| Pensar e resolver | Por onde eu começo? → Faz sentido? → Onde está o problema? | `pensar-e-resolver`: 6 situações |

24 situações novas, no formato das existentes (caso, pergunta, 3 opções com retorno, 1 correta), com 24 personagens que não aparecem em nenhum curso (nem nos novos). O teste `trails.test.ts` passa. Avisos: (1) a ordem dentro da trilha **não é representável**: a vitrine e o selo ordenam os cursos por título (`recognition.trailStatus`, `orderBy title`); (2) trilha só vale com os cursos **publicados**; (3) "Convivência" ganha uma aula, mas a checagem dela não mudou.

## 4. Decisões de adaptação do contrato (pacote → motor)

| Contrato do pacote | Motor | Decisão |
|---|---|---|
| `curso.json` + `roteiro.md` | `parseMarkdownCourse` / `importMarkdownCourse` | O importador gera o roteiro em Markdown a partir do pacote (conferido contra o `roteiro.md`: 100% dos textos de caso, alternativas, retornos, falas e atividades estão lá) e usa o importador do motor; depois ajusta o documento. Nada de sistema novo. |
| `dna-proposta-*` (chave externa) | sem coluna própria | Marcador `[pacote-15:<id>]` no início de `brief.sourcesNote` + slug proposto como slug do curso. É a chave da idempotência. |
| `instructor_proposed` | kit da biblioteca | Os 8 instrutores têm kit pronto (`estudio8-patricia`, `estudio8-enzo`, `estudio8-thiago`, `estudio6-julia`, `estudio6-renato`, `estudio7-beatriz`, `estudio7-gustavo`, `estudio8-helena`) e paleta igual à do curso atual do instrutor. Nenhum avatarId/voiceId novo; nenhum instrutor sem kit. |
| `track_proposed` | `courses.trail` | Ver seção 3. A classificação do pacote fica no briefing (`sourcesNote`). |
| `feedback` por alternativa (`text_feedback`) | `option.feedback` + `option.reaction.text` | Retorno escrito exclusivo por alternativa (sem retorno em sequência), mais a reação em vídeo da alternativa escolhida (texto pronto, sem vídeo). |
| `recommended` (booleano) | `quality` strong/ok/weak | A recomendada é `strong`; as outras são `ok` quando têm parte do caminho e `weak` quando não. |
| "Comparar outra escolha" | sem equivalente | O player não volta à decisão confirmada; botão e frase não foram reproduzidos. (As decisões podem ser revistas pela página "Rever".) |
| Prática de texto curto, 800 caracteres | atividade por grupos (scaffold) | Por decisão da coordenação/dono: montagem por grupos com "Prefiro escrever". Limite de 800 mantido na cena; cada lacuna aceita até 120 caracteres. "Ver um exemplo" e "Autorrevisão" não existem no player (o exemplo virou a 1ª opção de cada grupo). |
| "Salvar no meu roteiro" / "Fazer depois" | compose panel | "Salvar no meu roteiro" confirma "Resposta salva no Meu roteiro." e abre "Continuar aula"; "Fazer depois" não salva nada e deixa o item do roteiro com "Você deixou uma atividade para depois…". |
| Fechamento em texto | `end.summary` | Texto próprio de cada aula; na última aula, mais a frase de encerramento do curso do pacote. |
| `duration_seconds = null` | sem duração em rascunho | Nada medido. Valores exigidos pelo esquema (`estimatedMinutes = 1`, `targetMinutes = 5`) são o **mínimo do esquema**, não duração (a vitrine usa a duração de vídeo medida). |
| Conclusão (2 decisões confirmadas + fechamento nas 2 aulas) | `completion.requiredLessonIds` | Igual à regra do portal: conclui-se ao chegar ao encerramento de cada aula; cada decisão exige resposta para avançar; a prática é opcional. Nenhuma regra global foi alterada. |
| Estados (roteiro pronto / mídia pendente / revisão pendente) | `wizard.completedSteps` | Concluídos: tema…apresentação. **Não** concluídos: `producao` (mídia) e `revisao`. A revisão editorial do pacote está em `brief.context`. |

Texto novo (não vem do pacote, precisa de revisão editorial): apresentação e "Hoje, vamos…"; aviso da missão; chamadas; 31 decisões novas (contexto, alternativas, retornos); o "o que falta" e o "Faça assim" de todos os retornos; 30 atividades por grupos; 30 fechamentos; aberturas da aula 2; as aulas novas ou reescritas (o-outro aula 2, aprender-faz-parte aulas 1 e 2, errei decisões e explicação da aula 1; tudo-e-urgente aula 2 e onde-esta-o-problema aula 1 reaproveitam o pacote); as reações (derivadas do retorno de cada alternativa + abertura neutra); 24 situações de checagem; o apoio visual (pílulas) das explicações, com palavras que a própria fala diz.

## 5. Testes executados

- **Typecheck**: `tsc --noEmit` em `packages/db` e `packages/course-schema` sem erros.
- **Unitários (puros, sem banco)**: `packages/db/test/pacote-15.test.ts` (18 testes: pacote 15/30/60/30/90/30 e igual ao `roteiro.md`; 12 cursos finais compilam; 50 decisões; 25 aulas; **9 rotas por aula × (salvar | fazer depois)** rodando o próprio motor (`course-engine`) até o encerramento; chamada falada; fala = soma dos planos; sem gestos de mãos; sem mídia nem avaliação; posição/tamanho; 30 fechamentos distintos; determinismo; aula 3 sem colisão de ids; trilhas e checagens) + `trails.test.ts` (6) + testes do importador existentes (zone-cameras, presenter-overrides, carry-media). Todos passam. Os testes de banco do projeto (que recriam o banco de teste) **não foram rodados**.
- **Reimportação**: `importar-pacote-15.ts` rodado várias vezes: 1ª execução cria 15; execuções seguintes **não criam nem duplicam** nada (15 → 12 cursos finais + 3 arquivados, 0 duplicados, 0 slugs repetidos; aula 3 não duplica: hash do curso existente idêntico entre as execuções). Conflito: depois de uma edição manual de teste em `faz-sentido`, a reimportação **recusou** (conflito, nada gravado, saída com código 2); `--forcar` sobrescreveu e voltou ao normal. Curso publicado, slug de outro curso e rascunho com vídeo também viram conflito.
- **Cursos existentes**: hash do rascunho, estado, versão e trilha dos 41 cursos fora do pacote conferidos antes/depois: só `crs_b8zeh4b2gguseghq` mudou (aula 3 acrescentada; hashes das aulas 1 e 2 idênticos).
- **Prévia do estúdio** (Chrome headless, `autor@demo.local`; nunca `aluno@demo.local`): percorridas **as 26 aulas** (25 dos cursos finais + aula 3 do curso existente) até o "Fim da aula", com a alternativa e o modo da atividade variando (salvar, "Prefiro escrever", "Fazer depois"). Resultado: ver 5.1.
- **Orçamento** (`POST /api/courses/:id/media-jobs/quote`, só cálculo, modo demo): 0 erros de direção em todos os cursos. Nenhum `batch`, nenhum job criado.

### 5.1 Prévia: o que foi e o que não foi verificado

**Desktop (1440 px), 26 aulas**: todas chegaram ao "Aula concluída" (26/26) sem erro de página (`pageerror`). Cobertura dos caminhos: as 26 aulas foram percorridas com uma combinação diferente de alternativas (a, b e c) e de modo da atividade (9 com "Prefiro escrever" em um grupo, 8 com "Fazer depois", 9 escolhendo só as opções). Em todas as que salvaram, a tela mostrou "Resposta salva no Meu roteiro." e "Continuar aula" (18 de 18). Em "Fazer depois" nada é salvo e a aula segue (8 de 8). Em cada aula: abertura → decisão 1 → "Sua escolha" com o retorno exclusivo → explicação (com a transcrição) → decisão 2 (chamada "Pergunta 2 de 2") → atividade → fim. Foram lidos, nas telas, o retorno exclusivo, a explicação, a situação completa e a frase montada.
**As 9 combinações de alternativas por aula** (3 × 3) foram verificadas no motor (`course-engine`, ver acima), não clicadas uma a uma na tela.
**Celular (390 px)**: percorridas na prévia 3 aulas (errei a1, tudo-e-urgente a2 com 3 vídeos e a anterior), sem rolagem horizontal (`overflow = 0`), 0 controles sem nome acessível, todos os controles alcançáveis por tabulação (`tabIndex ≥ 0`). Na atividade há 10 a 13 controles menores que 24 px de altura (os links "Prefiro escrever" do componente existente; não foi mexido). Escolher a alternativa "c" no celular pelo script não foi confirmado (o botão fixo "Confirmar escolha" cobre as últimas opções até a rolagem), por isso só as alternativas a e b foram clicadas no celular.
**Não executado**: navegação só por teclado e foco visível (nada além de checar que os controles são tabuláveis e têm nome); leitor de tela; a página "Rever"; salvar e reabrir (a prévia não grava).
**Aviso do navegador**: 2 mensagens "404 (Not Found)" de recurso aparecem em **todas** as prévias, inclusive nas dos cursos já publicados (não vêm destes cursos).

## 6. Pendências reais

**Mídia (todas as cenas)**
- Nenhuma cena tem vídeo. Orçamento calculado (modo demo; o modo real pode diferir; nada foi disparado). Nos 12 cursos: 51 vídeos longos ≈ US$ 33.23; 150 reações ≈ US$ 20.95; 50 "perguntas lidas" ≈ US$ 11.74 (o orçamento padrão as inclui; nos cursos atuais elas ficam em texto, então pedir só os vídeos e as reações: ≈ US$ 54.18). Aula 3 de "Liberdade e intimidade…": ≈ US$ 2.33 (inclui as 2 perguntas). Valores por curso na tabela 1.1.
- As reações são 150 vídeos curtos (12 cursos) + 6 (aula 3); o dono pode desligar por alternativa (`reaction.disabled`).
- Legendas só depois da mídia (nada sincronizado foi inventado). Duração real: medir depois do vídeo.
- O texto na tela da explicação é o do pacote (o enunciado da prática); as pílulas trazem as ideias.

**Instrutores**: nenhum sem kit. Pendência de produção: a mesma voz/rosto aparece em mais de um curso (Enzo ×2, Renato ×2, Helena ×2, Gustavo ×2), como nos cursos atuais.

**Fatos e políticas a confirmar**: política de uso de IA da organização e idade mínima das ferramentas (ia-como-aliada); canal de apoio e quem é "responsável pelo programa"/"canal adequado" (aula 3 de Liberdade e intimidade, o-outro a02); "procedimento interno" de comunicação de envio indevido (seus-dados); "atendimento adequado" e "apoio de confiança" em Tudo é urgente? (não é orientação clínica; manter curta).

**Revisão editorial** (cada curso traz o aviso do pacote em `brief.context`): todo o texto novo; as alternativas do pacote que seguem caricatas; registro formal; sobreposições abaixo.

**Sobreposições com os 14 cursos atuais** (lista do Fable 3.1, conferida; estado depois das decisões):

| Novo | Existente | Estado |
|---|---|---|
| nem-toda-brincadeira a01/a02 × "Liberdade e intimidade" (Brincadeiras têm limite) | duplicata da a01; a02 é complementar | **Resolvido**: virou a aula 3 do próprio curso; a01 descartada. Revisar se a explicação da aula 3 não repete a aula 2 existente. |
| o-outro a02 (sotaque) × "Liberdade e intimidade" | duplicata de tese | **Reduzido**: a aula 2 agora é sobre convidar sem cobrar; o caso do sotaque (2ª decisão) ainda toca no tema, sem depender de confronto. Revisar antes de publicar. |
| travei a02 × "Comecei a trabalhar" a2 / "Não entendi a regra" | duplicata | **Resolvido**: descartada. |
| errei × "Comecei a trabalhar" a4 | mesmo tema | **Reduzido**: casos novos; ainda é o aprofundamento do mesmo tema. |
| tudo-e-urgente × "Comecei a trabalhar" a3 / "Como conversar…" | duplicata na aula 2 | **Resolvido** (cena 40/50 cortada); a aula 1 ("para agora") segue próxima. |
| aprender-faz-parte × "Comecei a trabalhar" a5 / "Como receber uma correção" | duplicata | **Resolvido** pela reorientação (revisar). |
| discordar a01 × "Como conversar com colegas e gestores" | mesmo movimento | **Reduzido** (agora recebe a discordância); a02 e a 2ª decisão ainda tocam o tema. |
| minha-ideia a02 × "Comecei a trabalhar" a6 | menção | Mantido. |
| seus-dados a02 × "WhatsApp…"; "Redes sociais…" | parcial | Mantido; citar como pré-requisito. |
| parece-verdade a02 × "Minha primeira vaga" (golpes) | parcial | Mantido; reduzir a repetição. |
| travei a01 e onde-esta-o-problema | ambos sobre "tentativa segura" | **Resolvido** pela fusão. |
| faz-sentido a01 × o-outro a01 | "não preencha o silêncio com explicação pronta" | Aceitável; citar um no outro. |

**Outras pendências**
- Ordem dos cursos dentro da trilha (o motor ordena por título) e checagem de "Convivência" (ganhou aula, não ganhou situação).
- Títulos curtos de vitrine, capas e descrições (só na publicação).
- "Comparar outra escolha" e "Ver um exemplo" não existem no player.
- Salvamento real da atividade por aluno e isolamento entre contas: **não testados** (a prévia do estúdio não grava respostas; só há como testar com curso publicado e conta de aluno, o que foi proibido). A lógica de gravação é a do motor (testada com `course-engine`: a resposta de cada rota é guardada, e "Fazer depois" guarda vazio).
- Mobile e teclado: ver 5.1.
- O pacote não define certificado nem selo por curso; nenhum foi criado. O Selo só existe por trilha, com a checagem acima.
- Nenhuma publicação, matrícula, geração de mídia ou commit foi feito.

## Revisão pré-gravação (31/10)

As 141 correções do relatório `revisao-pre-gravacao.md` estão na fonte do importador e nos rascunhos; ver `aplicado-pre-gravacao.md`.
