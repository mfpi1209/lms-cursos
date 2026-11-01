# Proposta: estúdio em 4 passos (2026-10-31)

**Pedido do autor:** "Acho que está muito complexo, sendo que já temos algumas coisas estáticas, qual sua proposta?"

**Como foi feito:** só leitura.
- Código do estúdio: `apps/web/src/components/studio`, `apps/web/src/app/(studio)`, `packages/course-schema`.
- Os 14 rascunhos reais no banco, com consultas SELECT.
- Os scripts desta sessão e dos lotes.
- Seis telas abertas sem clicar em nada que grave. Screenshots em `/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/wizard-hoje/`.

**Garantias:** nenhum código, rascunho, servidor ou mídia foi alterado.

---

## 1. Resumo

O estúdio hoje foi feito para **qualquer curso, de qualquer jeito**. Os 14 cursos da DNA Work são **um formato só**:

- mesmo público e mesmo tom;
- mesmo esqueleto de aula;
- mesma direção de vídeo;
- só muda o instrutor, que vem de um kit pronto.

Por isso o autor enfrenta 8 passos, 12 campos de briefing e 7 seções de apresentação. Uma única aula tem 79 campos e 126 botões numa página de cerca de 9.200 px de altura.

O detalhe mais revelador: **nenhum dos 14 cursos passou pelo wizard.** Todos seguiram o mesmo caminho:

1. roteiro em Markdown, em `docs/roteiros`;
2. importação por script com `--kit`;
3. cerca de 60 scripts de ajuste e gravação: 48 em `scripts/lote` e 16 avulsos.

**Proposta:**
- trocar o wizard por **4 passos**: Roteiro → Instrutor → Revisar como aluno → Gravar e publicar;
- congelar o que nunca varia num **preset DNA Work**, editável só em "Avançado";
- passar para o motor as regras que hoje vivem em scripts.

## 2. Como é hoje

| Onde | O que o autor enfrenta |
|---|---|
| Wizard (`WIZARD_STEPS`) | 8 passos: tema, conteúdo, estrutura, aulas, apresentação, prévia, produção, revisão. Ao lado, 6 abas do curso e a tela Modelos. |
| Ideia e público (`brief-fields.tsx`) | 12 campos: título, ideia, para quem, momento de carreira, nível, pré-requisitos, objetivo, onde usa, duração, tom (duas vezes), observações. |
| Apresentação (`step-apresentacao.tsx`, 2.034 linhas) | 7 seções: formato; quem apresenta; voz (provedor, idioma, voz); ambiente; posição (4 controles); câmeras (lista, ordem, gerar ângulo pago); estilo de direção (8 parâmetros). |
| Aula (storyboard) | Por cena: título, "o que o apresentador fala", pedidos à IA, gesto **em inglês**, próxima cena, "regras avançadas", "mais detalhes", **direção com planos** (câmera, enquadramento, movimento, layout, slide, transição), animatic, "gerar de novo" e "enviar arquivo". Na aula 1 do curso 1 são 79 campos e 126 botões. |
| Produção | Orçamento, fila, ajuste fino por cena e recomposição. |

### O que os 14 cursos reais mostram (rascunhos no banco)

| Campo | Valores distintos nos 14 |
|---|---|
| `aspectRatio` | 1 (16:9) |
| `voiceProvider` | 1 (ElevenLabs) |
| `expressiveness`, `removeBackground` | 1 cada |
| `directionStyle.*` (8 parâmetros) | 1 cada, iguais nos 14 |
| `brief`: público, nível, tom, voz narrativa, pré-requisitos, traços, interação | 1 cada (o público tem 3 redações da mesma coisa) |
| `brief.targetMinutes` | 3 (10, 30, 75): é o "tamanho" do curso |
| Marca: tema, vinheta, marca d'água | 1 cada |
| Marca: paleta | 2 (normal e invertida) |
| Planos (475): `framing`, `cameraMove`, `transitionIn` | 1 cada (medium, static, cut em 100%) |
| Planos: `layout` | 2 (presenter 92%, presenter_chips 8%) |
| Planos: `motionPrompt` | 8 gestos, sempre da mesma lista |
| Esqueleto da aula | 2 padrões cobrem 35 de 42 aulas: caso → pergunta → explicação → pergunta → missão → fim, ou com avaliação |
| **O que de fato varia** | Textos (fala, pergunta, opções, retorno, missão), o instrutor (avatar, voz, câmeras, nome e papel) e o tamanho do curso |

## 3. Onde o autor vê técnica ou cai em estado inválido

1. **Duas fontes de verdade para a fala.**
   - A "fala do apresentador" e a "direção (planos)" precisam bater palavra por palavra. Se não batem, o orçamento recusa a cena com "A direção está desatualizada… Reconcilie no painel Direção".
   - Aconteceu hoje: 3 cenas por curso bloqueadas antes da rodada paga.
2. **Chamada da pergunta.** `withCall` (`packages/course-schema/src/bridge.ts`) *acrescenta* um plano `chamada_2` em vez de *trocar* o anterior. A cena passaria a fazer a pergunta duas vezes. Hoje foi consertado por script.
3. **Campos técnicos à vista:**
   - gesto em inglês;
   - id de câmera e enquadramento;
   - movimento e transição (sempre os mesmos);
   - layout, animatic e "voltar ao plano único";
   - "regras avançadas".
4. **"Desatualizado" e "gerar de novo" por cena.**
   - O estado `stale` e a impressão da apresentação aparecem como avisos que o autor não entende.
   - "Gerar de novo" em cada cena é um botão pago espalhado pela página.
5. **Ajuste fino se perde ao regravar.**
   - Quem regrava uma cena perde os cortes e o cartão "Pergunta a seguir" (hoje: 61 cenas).
   - Foi preciso o script `reaplicar-ajustes.ts`.
6. **Rótulo de lacuna = id técnico.** O importador mostra "Escolha horario:". Foi consertado por script em vários lotes.
7. **Mover matrículas para a versão nova** só existe em script (`publicar-e-matricular.ts`).

## 4. Regras que viraram script e devem ir para o motor

| Script (sessão ou lote) | Regra | Vai para |
|---|---|---|
| `revisao-roteiro.ts` | Abertura natural: "Nesta aula, você vai" → "Agora, vamos"; na 1ª aula, "Oi! Eu sou… Hoje, vamos" | Gerador e importador de roteiro (texto) |
| `revisao-roteiro.ts` | Boas-vindas com o que o aluno leva e o Selo de competência DNA Work | Plano automático na 1ª aula, a partir dos objetivos |
| `revisao-roteiro.ts` | Aviso da missão logo após a abertura | Plano automático em aula com missão |
| `revisao-roteiro.ts` + `ponte-chamadas.ts` + `perguntas-ligadas.ts` | Chamada = fato + "Agora, responda: <pergunta>", com a mesma pergunta no bloco e no cartão | `withCall` substitui a chamada; a pergunta do bloco é a mesma da chamada |
| `revisao-roteiro.ts` (correção) | A fala da cena é sempre a soma dos planos | Fonte única: o autor edita a fala e os planos derivam dela |
| `aparar-retomadas.ts` | Sem "Seja qual for a sua escolha," depois de uma reação | Gerador de texto + aparo automático na montagem |
| `aparar-reacoes.ts` | Interjeição da reação ("Boa escolha!") só na primeira vez no curso | Montagem das reações |
| `reacoes-padrao.ts` | Reação em vídeo derivada do retorno da opção | Padrão ao criar a opção |
| `reaplicar-ajustes.ts` | Depois de regravar, o ajuste volta nos planos que não mudaram | Worker, ao concluir o job |
| `normalizar-volume.ts` | −16 LUFS | Já é padrão na montagem; o script fica só para o legado |
| `lote/*-rotulos.ts` | Rótulo legível da lacuna | Importador: rótulo ≠ id, com fallback "Escolha a parte N" |
| `lote/*-paleta.ts` | Paleta invertida por curso | Preset com "alternar paleta" (1 clique) |
| `lote/*-gravar.sh` | Orçamento oficial com teto e só as cenas pedidas | Passo "Gravar", que já existe na API |
| `lote/03-caminhos.ts` | Toda escolha leva a algum lugar e toda aula termina | Validação automática antes de gravar |
| `publicar-e-matricular.ts` | Mover matrículas quando a estrutura não muda | Botão Publicar |
| `import-markdown-course.ts` | Roteiro em Markdown → rascunho, com kit | Passo 1 do estúdio (hoje só por script) |

## 5. Proposta: 4 passos

### Passo 1: Roteiro
- **Pede três coisas:**
  - título;
  - tamanho: curto (2 aulas, cerca de 10 min), médio (6 aulas) ou trilha (12 aulas);
  - o roteiro em uma de duas formas: **colar ou enviar o Markdown** no formato de `docs/roteiros`, ou **descrever a ideia** para a IA escrever no mesmo formato.
- **Mostra o que foi lido:** aulas, perguntas e missões, com avisos claros. Exemplos: "pergunta sem retorno na opção B", "missão sem rótulo na parte 2".
- **Fica no preset:** público "primeiro emprego", nível iniciante, tom DNA Work, segunda pessoa, escolhas guiadas sem escrita obrigatória.

### Passo 2: Instrutor
- **Pede uma escolha:** um **kit** (cartão com rosto, nome, papel e amostra de voz).
- **Fica em "Avançado":** posição na tela, paleta invertida, vinheta, criar instrutor novo (o fluxo pago que já existe, com aprovação).

### Passo 3: Revisar como aluno
- **É o próprio player** com o texto do curso, com edição no lugar de cada texto: fala, pergunta, opções, retorno, missão e rótulos das lacunas.
- **Cada cena tem uma só fala.** Os planos, a câmera e o gesto são escolhidos pelo motor, sempre igual nos 14 cursos.
- **Lista de pendências no topo,** gerada pelas validações de caminhos e qualidade.
- **Fica em "Avançado":** storyboard completo e direção por plano. É a tela atual, intacta, para o caso raro.

### Passo 4: Gravar e publicar
1. **Um orçamento** do que mudou: "12 cenas novas, US$ 4,10, dentro do teto". **Uma aprovação.**
2. **Fila de gravação**, com ajuste fino por cena depois que o vídeo existe: tirar frase, aparar e trocar o cartão. Esse ajuste **sobrevive a regravações**.
3. **Publicar**, movendo as matrículas automaticamente quando a estrutura não mudou.

### Preset DNA Work (fixo, editável só em "Avançado")

- **Formato:** 16:9, ElevenLabs, fundo removido, expressividade alta.
- **Direção:** câmera única por cena; enquadramento médio; câmera parada; corte seco; 2 cartões por minuto; slides com destaque `#1a66d1`; gestos da lista de 8.
- **Marca:** tema imersivo, vinheta de assinatura, marca d'água (rodapé, 0,7), paleta normal ou invertida.
- **Aula:** esqueleto padrão: abertura → caso → pergunta → explicação → pergunta → missão → fim, com avaliação opcional por módulo.
- **Conclusão:** aulas obrigatórias = todas, e o Selo de competência DNA Work.

### O que o motor passa a fazer sozinho

1. A fala da cena é a **única** fonte; os planos derivam dela. Fim do "direção desatualizada".
2. Chamada **substitui** a anterior, no formato fato + "Agora, responda: …", com a mesma pergunta no bloco e no cartão.
3. Abertura natural, boas-vindas com o Selo (1ª aula) e aviso da missão (aula com missão), escritos e mantidos pelo motor.
4. Sem "Seja qual for a sua escolha," e sem interjeição repetida nas reações.
5. Reação padrão em vídeo para cada opção, a partir do retorno.
6. Volume em −16 LUFS (já faz).
7. Ajuste fino reaplicado após regravar.
8. Rótulos de lacuna legíveis.
9. Validação de caminhos antes de gravar.
10. Mover matrículas ao publicar.

## 6. Antes e depois

| | Hoje | Proposta |
|---|---|---|
| Passos do wizard | 8 (+ 6 abas + Modelos) | 4 |
| Campos de briefing | 12 | 3 (título, tamanho, roteiro ou ideia) |
| Decisões de apresentação | cerca de 20 (7 seções, 8 parâmetros de direção) | 1 (kit) |
| Campos na aula 1 do curso 1 | 79 campos e 126 botões | cerca de 25 a 30, só textos que o aluno vê ou ouve |
| Botões pagos espalhados | "gerar de novo" por cena e "gerar ângulo" | 1 aprovação no passo 4; criar instrutor em Avançado |
| Estados inválidos possíveis | direção desatualizada, chamada duplicada, ajuste perdido | eliminados pelo motor |
| Scripts para fechar um curso | cerca de 5 a 10 por curso (importar, rótulos, paleta, chamadas, gravar, aparar, publicar, matricular) | 0 no caminho normal |

## 7. Riscos e compatibilidade

- **Cursos existentes:**
  - o preset é só o *padrão de um curso novo*; os rascunhos atuais mantêm os seus valores;
  - "Avançado" continua mostrando tudo, sem migração de dados.
- **Fala única e planos derivados:**
  - para não regravar o que já está pago, a derivação reaproveita as falas dos planos existentes (mesma chave de plano);
  - só os planos de texto alterado entram no orçamento, que é a regra atual de reaproveitamento parcial;
  - o risco é mudar a divisão de planos de cenas antigas, por isso a derivação só roda quando o autor edita a fala.
- **Textos automáticos** (abertura, boas-vindas, missão, chamada):
  - mudam a fala, então geram regravação paga;
  - aparecem como **sugestão** com "aplicar a todas" e entram no orçamento normal;
  - nunca alteram em silêncio um vídeo já gravado.
- **Importar Markdown pela tela:**
  - o parser já existe (`packages/course-schema/src/import/markdown-course.ts`);
  - o risco está no reimport sobre um curso com vídeo pago, por isso o reimport fica proibido pela tela; usa-se "editar no passo 3".
- **IA no passo 1:** opcional, com o teto de IA atual; o caminho principal (Markdown) não usa IA.
- **Remover passos:** "Material" e "Estrutura" viram parte do passo 1, e as rotas antigas redirecionam. `wizard.step` aceita os valores antigos e mapeia cada um para o passo novo.

## 8. Plano em fatias pequenas

Cada fatia se entrega e se testa sozinha. Nenhuma tem custo de mídia, exceto quando o autor aprovar uma regravação.

| # | Fatia | Arquivos principais | Custo |
|---|---|---|---|
| F1 | Chamada substitui a anterior, e a fala da cena é sincronizada com os planos ao salvar | `packages/course-schema/src/bridge.ts` (`withCall`), novo `syncNarrationFromShots` em `direction.ts`, `apps/web/src/components/studio/draft-provider.tsx`; testes em `course-schema` | Nenhum |
| F2 | Ajuste fino sobrevive à regravação: o worker reaplica nos planos sem mudança | `apps/worker/src/media.ts` (ao concluir), `packages/media/src/adjust.ts`; aposenta `reaplicar-ajustes.ts` | Nenhum |
| F3 | Preset DNA Work: padrões de curso novo e "Avançado" recolhido no passo de apresentação | `packages/course-schema/src/library-defaults.ts`, `step-apresentacao.tsx` (recolher seções), `brief-fields.tsx` | Nenhum |
| F4 | Passo 1 Roteiro: importar Markdown pela tela, com o leitor de avisos | nova rota `apps/web/src/app/api/courses/[courseId]/import/route.ts` usando `parseMarkdownCourse`; `step-tema` + `step-conteudo` + `step-estrutura` fundidos em `step-roteiro.tsx`; `WIZARD_STEPS` com mapeamento dos antigos | Nenhum (IA só se o autor pedir) |
| F5 | Passo 2 Instrutor: escolher kit em cartões, reaproveitando `POST /api/courses/:id/library` | `step-apresentacao.tsx` vira `step-instrutor.tsx` com Avançado; `library/library-view.tsx` | Nenhum |
| F6 | Passo 3 Revisar como aluno: o player em modo edição, com uma fala por cena e as pendências | `components/player/immersive/*` (só a camada de edição, **depois** do fork da missão terminar), `test-mode/test-toolbar.tsx`, `quality/*` | Nenhum |
| F7 | Regras de texto no motor como **sugestões**: abertura, boas-vindas e Selo, aviso da missão, sem "Seja qual for", interjeição única, rótulos de lacuna | `packages/course-schema` (funções puras extraídas de `revisao-roteiro.ts`, `aparar-*`, `reacoes-padrao.ts`), `assistant/next-steps.tsx` | Nenhum para sugerir; aplicar gera regravação, sempre por orçamento aprovado |
| F8 | Passo 4 Gravar e publicar: um orçamento, uma aprovação, ajuste fino e publicar movendo matrículas | `step-producao.tsx`, `media-queue/production-panel.tsx`, `publish/route.ts` (lógica de `publicar-e-matricular.ts`) | Só o que o autor aprovar |

**Ordem sugerida:**
1. **F1 e F2** primeiro: eliminam os estados inválidos que custaram tempo hoje.
2. **F3 a F5**: reduzem passos e campos.
3. **F6**: só depois que o fork da missão "Tudo visível" terminar, porque mexe no mesmo player.
4. **F7 e F8**.

## 9. Fora do escopo

- Instrutor novo do zero continua um fluxo à parte, pago e com aprovação.
- Lote de vários cursos de uma vez: a fila já aceita; a tela de lote fica para depois.
- Telas de aluno e de matrículas não mudam.
