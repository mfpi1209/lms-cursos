# QA de conteúdo — "Primeira entrevista de emprego" (crs_xqkyc0g025q85as8)

Revisão somente leitura do rascunho em `course_drafts`, comparado com a spec (§1, 2, 5, 10) e com `packages/ai/src/prompts.ts` (versão 2026-10-23.2). L1 `preparacao_com_vaga_e_logistica` · L2 `fale_sobre_voce` · L3 `perguntas_dificeis_sem_se_desvalorizar` · L4 `postura_video_presencial` · L5 `perguntas_para_rh_e_gestor`.

**Visão geral.** O conteúdo é honesto, sem caricatura grosseira e sem fatos inventados. Todas as reflexões pedem um exemplo do próprio aluno. Os problemas centrais são quatro:
1. O aluno assiste à história de Rafael e Júlia em vez de viver a entrevista.
2. As cinco aulas usam o mesmo esqueleto, embora declarem famílias diferentes.
3. O elenco e os fatos se contradizem entre as aulas.
4. O texto não foi escrito para ser falado por um avatar.

## 1. Ponto de vista e engajamento

| Sev. | Onde | Trecho | Problema | Correção |
|---|---|---|---|---|
| alta | todas; ex. L1 `convite_de_rafael` | "Rafael se candidatou a uma vaga de auxiliar administrativo…" | O aluno fica de fora. Nas decisões ele é conselheiro ("Se você estivesse orientando Júlia", L2 `escolha_primeira_resposta`) ou escolhe pelo personagem ("Escolha a resposta que Júlia dá", L3 `escolha_defeito`). Isso contraria "o aluno aprende enfrentando situações" (§1). | Usar a 2ª pessoa nas cenas e a 1ª pessoa na fala da apresentadora: "Chegou um e-mail da Carla, do RH, para você: entrevista amanhã, às dez horas." Na decisão: "O que você faz primeiro?" |
| média | L1 `tres_frentes_de_preparo`, L4 `guia_video` | "Antes da entrevista, Rafael precisa responder a três perguntas." | Numa explicação, o personagem não acrescenta nada. | "Eu sugiro que você responda três perguntas antes de qualquer entrevista." |
| nota | L2 `exemplo_julia`, consequências | — | A 3ª pessoa protege o aluno em temas sensíveis, como falar dos próprios defeitos. | Manter personagens só em exemplos resolvidos ("um colega errou assim"). A decisão é sempre do "você". |

## 2. Adequação à narração (o avatar lê o texto literalmente)

| Sev. | Onde | Trecho | Problema | Versão falada |
|---|---|---|---|---|
| alta | L2 `inicio_entrevista_julia`, L3 `abertura_entrevista`, L5 `fim_da_entrevista`, `entrada_do_gestor` | "Carla, do RH, sorri e começa: “Júlia, para a gente começar…”" | Uma voz só lê o narrador e o personagem. Não dá para saber quem fala. | "A Carla, do RH, abre a conversa pedindo que você fale um pouco sobre você." Se a fala literal for necessária, ela vai num cartão na tela. |
| alta | L1 `modelo_de_plano` | "Vaga: auxiliar administrativo. Pontos-chave: documentos…; sair às 8h50" | É um formulário. "8h50" e ";" soam mal no TTS. | Mostrar o plano num cartão. Narração: "Veja um plano de uma página: o que a vaga pede, o que a empresa faz, seus dois exemplos e a hora de sair." |
| média | L2 `estrutura_resposta`, L3 `guia_resposta_dificil` | "1. Contexto: quem você é profissionalmente agora." | A lista numerada vira "um ponto" na leitura. | "Primeiro, diga quem você é hoje. Depois, conte uma experiência real. Em seguida, ligue isso à vaga. Para fechar, diga o que quer aprender." |
| média | L2 `consequencia_foco_vaga` (35 pal.), L3 `conseq_defeito_perfeccionismo` (28), L4 `inicio_video` (26), L4 `fim` (30), L5 `encerramento` (29) | "Ela diz que está começando na área de marketing, cita o curso técnico, fala do perfil…" | Frases com mais de 25 palavras e enumeração encadeada. | "Ela conta que está começando no marketing. Cita o curso técnico. E fala do perfil que cuida para praticar." |
| média | L2 `exemplo_julia` (97 pal.) | "“Estou começando na área de marketing e tenho buscado…”" | Um monólogo de 70 palavras entre aspas, lido pela apresentadora. | Mostrar o texto na tela. A narração diz: "Repare: ela não inventou nada, só organizou o que já tinha." |

## 3. Pedagogia

| Sev. | Onde | Trecho | Problema | Correção |
|---|---|---|---|---|
| alta | L1 `tres_frentes_de_preparo`/`modelo_de_plano`, L3 `guia_resposta_dificil`, L5 `criterio_perguntas` | "Uma resposta forte tem três partes: Verdade… Limite… Ação" | A explicação antes da decisão entrega a resposta (§2: "não comece toda aula com explicação"). Em L1, `modelo_de_plano` já traz "sair às 8h50; levar documento" antes de `decisao_logistica`. Ele também aparece para quem escolheu o caminho "genérico", como se Rafael tivesse mapeado a vaga. | Seguir a ordem situação → decisão → consequência → conceito como síntese → nova aplicação. |
| alta | todas | cenário → choice → 3 consequências → reflexão → "Marque todos" → end "Fechamento" | É o mesmo esqueleto cinco vezes. As famílias procedure, resource_simulation e dialogue não aparecem na estrutura. Toda aula termina com quiz `all_correct`. | L1: achar três erros no plano de um colega. L4: "você tem 5 minutos; escolha 2 de 6 ajustes". L5: diálogo em turnos com Marcos. L2 pode terminar sem quiz. |
| alta | L3, L4 | 3 choices × 3 = 9 consequências | O feedback da opção, o corpo da consequência e o guidance repetem a mesma ideia três vezes. Isso infla a narração. | Consequência ramificada só na decisão central. Nas outras decisões, basta o `feedback` da opção. No máximo 4 consequências por aula. |
| alta | L3 (a descrição promete "reescreve respostas mais fortes") | `reflexao_exemplo_proprio`: "Escreva um exemplo de algo que você aprendeu…" | O objetivo é *responder* perguntas difíceis, mas o aluno só reconhece respostas e nunca escreve a sua. | Reflexão: "Escreva como você responderia 'qual ponto precisa melhorar?' com verdade, impacto e ação." Depois, um checklist de autoavaliação como o de L2. |
| média | L1 `primeira_decisao_preparo`, `decisao_logistica`, L4 `escolha_preparar_video` | "…mesmo conseguindo comparecer" / "mesmo sem testar áudio e câmera" | O rótulo já anuncia o defeito da opção. A opção correta costuma ser a mais longa. | Rótulos com ação e intenção razoável, sem o defeito. O custo aparece na consequência. Tamanhos equilibrados. |
| média | L5 `pergunta_para_rh`, `pergunta_para_gestor` | "Boa escolha" (2 de 3, duas vezes) | Sem dilema real: 4 das 6 consequências são positivas. | Trocar uma opção boa por uma armadilha plausível, como perguntar algo que Marcos acabou de explicar. |
| média | todas | — | Nenhuma aula tem "tentar aplicar de novo" depois do erro, exceto a reescrita de L2. As consequências positivas são vagas ("Carla anota e segue a conversa"). | Depois de uma consequência fraca, criar uma mini-situação nova com a mesma habilidade. Nos caminhos bons, mostrar um ganho concreto. |
| média | assessments | L4 "Interromper a pergunta quando já entendeu, para mostrar agilidade" | Distratores óbvios. Medem reconhecimento, não transferência. Exceções boas: L3 `verif_rafael_exemplo` e a questão de L5 com Rafael. | Usar 1 ou 2 itens de cenário novo, de opção única, com distratores do nível das decisões. |
| média | conclusão ≠ domínio | `outcomeLabel: "Aula concluída"` em todas; objetivos com `required:false` | Nada distingue concluir de demonstrar. Falta a entrega prática final (§10). | Rótulo conforme o desempenho, mais um "kit de entrevista" final: apresentação, resposta difícil e duas perguntas. |
| baixa | L4/L5 `reflexao_exemplo_pessoal` | `minLength: 0`; "Escreva um exemplo da sua própria vida: qual seria uma pergunta…" | L4 aceita resposta vazia. Em L5 o enunciado é um molde reaproveitado. | `minLength` ≥ 30. Enunciado próprio: "Escreva uma pergunta para o RH e uma para o gestor de uma vaga real." |

## 4. Precisão, segurança e inclusão

Não há leis, estatísticas nem salários. O curso é explícito contra mentir: `experiencias_aumentadas` e `pretensao_faixa_pesquisada` ("Evite afirmar pesquisa que você não fez").

| Sev. | Onde | Trecho | Problema | Correção |
|---|---|---|---|---|
| média | L1 `decisao_logistica`/`consequencia_logistica_troca` | "Pedir para trocar para vídeo porque presencial dá mais trabalho" | É caricata. Para jovens de baixa renda, custo e tempo de deslocamento são impedimentos reais, e a opção ensina que pedir ajuste é mal visto. | Transformar em dilema: "O trajeto leva 1h30 e duas conduções. Você pergunta se dá por vídeo?" A consequência mostra como pedir. |
| média | L4 `inicio_video`, `guia_video` | "o áudio do notebook está baixo" | Supõe que o aluno tem notebook e quarto próprio. | Incluir celular na horizontal, fone com microfone e alternativas de lugar silencioso. |
| média | L4 `guia_video`, `escolha_postura_presencial` | "Sentar-se de forma confortável e ereta, alternar olhar…" | Exclui pessoas neurodivergentes e cadeirantes. | "Se olhar nos olhos é difícil para você, olhar para a região da câmera ou anotar já mostra atenção." |
| baixa | elenco; L4 reflexão; L5 `consequencia_rh_beneficios` | "quando você fica nervoso" | Mulher sempre no RH e homem sempre como chefe. Masculino genérico. A pergunta sobre bolsa aparece como suspeita, embora seja decisiva para esse público. | Pôr uma gestora no elenco. Trocar por "quando o nervosismo aparece". Deixar claro que o problema é só *abrir* a conversa pela bolsa. |

## 5. Extensão e ritmo

Estimativa média por caminho, com narração a 150 palavras por minuto, mais o tempo de decisão e escrita:

| Aula | Palavras/caminho | Narração | Total est. | Declarado |
|---|---|---|---|---|
| L1 | ~700 | 4,7 min | ~9 | 8 |
| L2 | ~680 | 4,5 min | **~13–14** (3 escritas) | 9 |
| L3 | ~730 | 4,9 min | ~10 | 10 |
| L4 | ~700 | 4,7 min | ~10 | 9 |
| L5 | ~720 | 4,8 min | ~9 | 8 |

O total fica entre 50 e 52 minutos, para um alvo de 45. Nenhuma cena passa de 120 palavras, mas quatro passam de 80, o que dá mais de 35 segundos de avatar falando: `tres_frentes_de_preparo` (87), `exemplo_julia` (97), `criterio_perguntas` (84) e `montar_lista_final` (81). Sugestões:
- Dividir essas cenas ou passar o conteúdo para cartões.
- Em L2, juntar `rascunhar_resposta` e `ajustar_resposta` numa tela com o checklist ao lado.
- Cortar a menção a Rafael em L5 `fim_da_entrevista`.

## 6. Língua e consistência

| Sev. | Onde | Problema | Correção |
|---|---|---|---|
| alta | descrições das aulas | As descrições citam "Ana" (L1), "Lucas, estágio de suporte" (L2), "Mariana" (L3) e "Bianca, estágio financeiro" (L5). As cenas usam Rafael e Júlia. | Reescrever as descrições com o elenco real. |
| alta | L1 vs L4 | L1 diz "Entrevista amanhã, 10h, presencial", com Carla e depois Marcos. L4 diz "primeira entrevista por vídeo", com Marcos "na semana seguinte". | Unificar a linha do tempo de Rafael. |
| média | Carla/Marcos | Os dois entrevistam Rafael (administrativo) e Júlia (marketing), e Marcos é "gestor da área" nos dois casos. Em L5, "Rafael, outro candidato… na recepção" sugere que é a mesma empresa. | Criar duas empresas, ou dois gestores, por exemplo Paula no marketing. |
| média | Júlia L2 vs L3/L5 | "curso técnico" em L2, mas "projeto da faculdade" em L3 e L5. Entrevista por vídeo em L2, presencial em L5. | Criar uma ficha fixa da personagem. |
| média | L3 `conseq_aprendo_rapido` | "em quanto contexto" | "em que contexto, em quanto tempo e com qual resultado" |
| baixa | L1, L3, L5 | "empresa média" é ambíguo. "como eu chego ou acesso no horário?" mistura pessoas e deixa "acesso" sem objeto. Os seis guidances de L1 começam com "Leve disso:". | "de médio porte"; "Como você chega, ou entra na chamada, no horário?"; variar o bordão. |

As aspas curvas estão consistentes.

## Scorecard (0–5)

| Aula | Engajamento | Realismo | Prática | Clareza | Narração |
|---|---|---|---|---|---|
| L1 Preparação | 2 | 4 | 3 | 3 | 2 |
| L2 Fale sobre você | 3 | 4 | 5 | 4 | 2 |
| L3 Perguntas difíceis | 2 | 4 | 2 | 4 | 3 |
| L4 Postura | 2 | 4 | 2 | 4 | 3 |
| L5 Perguntas finais | 2 | 3 | 3 | 4 | 3 |

## Top 10 correções por impacto

1. Pôr o aluno no papel de candidato: "você" nas cenas e decisões, 1ª pessoa para a apresentadora.
2. Unificar elenco e linha do tempo: descrições com Ana, Lucas, Mariana e Bianca; L1 presencial contra L4 por vídeo; Carla e Marcos em duas empresas; curso técnico contra faculdade.
3. Tirar a explicação de antes da decisão (L1, L3, L5) e usá-la como síntese depois da consequência.
4. Dar estrutura própria a cada família de aula: caça a erros, orçamento de tempo, diálogo em turnos.
5. Reescrever a narração para ser falada: sem citações, sem listas numeradas, frases de até 20 palavras, "dez horas". Formulários e monólogos vão para cartões.
6. No máximo 4 consequências por aula, e sem repetir a mesma ideia no feedback, no corpo e no guidance.
7. Em L3, o aluno escreve as próprias respostas sobre defeito e pretensão e se autoavalia.
8. Rótulos de opção sem "mesmo sem…" e com tamanho equilibrado. Uma única opção melhor por decisão (L5).
9. Separar conclusão de domínio: assessments de transferência, `outcomeLabel` conforme o desempenho e um "kit de entrevista" final.
10. Inclusão: tratar o pedido de vídeo por custo de deslocamento como dilema legítimo, considerar entrevista pelo celular, contato visual e mobilidade, e alternar gênero nos papéis.

## Mudanças propostas em `packages/ai/src/prompts.ts`

**SYSTEM_DESIGNER**, acrescentar:
- "Escreva as cenas em segunda pessoa: o aluno é o protagonista (\"você recebe um e-mail\", \"o que você responde?\"). A apresentadora pode falar em primeira pessoa. Use personagens em terceira pessoa apenas em exemplos resolvidos ou para mostrar o erro de um colega."
- "Todo texto de scenario, content, consequence e end é lido em voz alta por um avatar. Escreva para o ouvido: frases de até 20 palavras, sem listas numeradas, parênteses, ponto e vírgula ou abreviações (escreva \"dez horas\"). Não ponha falas entre aspas na narração; use discurso indireto. Planos, tabelas e respostas-modelo longas vão em cartão na tela."
- "Considere jovens de baixa renda, que usam celular e transporte público, e pessoas com deficiência ou neurodivergentes. Não trate pedido de ajuste ou pergunta sobre remuneração como sinal negativo. Alterne gênero nos papéis de poder."

**TASK_OUTLINE**, acrescentar:
- "Defina um elenco único do curso (nome, papel, empresa, vaga, formação, formato e data da entrevista) e use exatamente esses nomes nas descrições das aulas."

**TASK_LESSON**, substituir:
- "Decisões centrais com 3 opções plausíveis, cada uma com sua consequence…" → "UMA decisão central por aula com 3 opções e uma consequence por opção. Decisões secundárias usam só o feedback da opção. No máximo 4 consequences por aula. A consequence mostra um efeito observável (o que a outra pessoa diz ou faz) e não repete o feedback."
- "Inclua ao menos uma reflection e, quando o objetivo permitir…, um assessment…" → "Inclua ao menos uma produção do aluno ligada ao critério do objetivo (a própria resposta, plano ou pergunta), seguida de critérios de autorrevisão. Use assessment só para testar aplicação numa situação NOVA. Não termine com assessment se a aula anterior terminou assim."
- "Textos curtos (até ~120 palavras por cena)… com nomes fictícios." → "Até 80 palavras por cena narrada. Use apenas o elenco de <elenco>."

**TASK_LESSON**, acrescentar:
- "Não ponha content explicativo antes da primeira decisão. O conceito vem depois da consequência, como síntese, seguido de nova oportunidade de aplicar."
- "Rótulos de opção descrevem a ação e uma intenção razoável. Nunca anuncie o defeito no rótulo (proibido \"mesmo sem…\", \"sem necessidade\"). Opções de tamanho semelhante. Exatamente uma opção é a melhor."
- "A estrutura reflete a família: procedure com identificação de erros; resource_simulation com limite explícito; dialogue com ao menos três turnos dependentes da escolha anterior; production_review com rascunho, critérios e reescrita."
- "Reflexões com minLength ≥ 30 e enunciado específico ao objetivo, sem repetir enunciados de outras aulas."

**buildLessonInput:** passar `<elenco>` e, em `<outras_aulas>`, um resumo da situação de cada aula (personagem, formato, momento), não só título e família. A ausência desse contexto causou as contradições entre L1 e L4 e entre L2 e L3.
