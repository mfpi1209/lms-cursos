# Construtor de cursos interativos com IA + LMS próprio: dossiê para revisão externa

> Documento gerado em 2026-10-29 para ser colado em outra IA. Não contém chaves, senhas nem dados pessoais.
> **Pedido ao revisor:** leia tudo e devolva **ajustes concretos e priorizados**: produto, didática, arquitetura, IA/prompts, produção de vídeo, UX, segurança e plano para "cursos que comprovadamente funcionam". Para cada sugestão, diga o impacto, o esforço (P/M/G) e o risco de não fazer. As perguntas específicas estão no fim.

---

## 1. Visão do produto

- **O que é:** uma ferramenta interna, que deve virar produto para clientes, para **criar, revisar, publicar e entregar cursos práticos e interativos** em pt-BR. O aluno vive situações, toma decisões, vê consequências e recebe feedback. Uma apresentadora em vídeo (avatar de IA) conduz a conversa.
- **Diferencial pretendido:** um "motor" de IA que, a partir de um briefing ou roteiro, monta o curso inteiro:
  - estrutura;
  - cenas e decisões com caminhos;
  - textos em voz de ensino;
  - direção de câmera;
  - vídeos com avatar e voz;
  - avaliação de qualidade;
  - publicação.

  O autor humano aprova cada etapa, e nada pago roda sem confirmação.
- **Caso de uso principal hoje:** preparação para entrevista de emprego, para jovens que buscam o **primeiro estágio ou emprego**, muitas vezes **tímidos ou introvertidos**.
- **Objetivo declarado do dono:** "um motor que construa cursos perfeitos". A interpretação que estou usando é "cursos que comprovadamente ensinam, com baixo atrito para o aluno, custo de produção previsível e mínimo trabalho manual do autor".

## 2. Stack e organização

- **Monólito modular em TypeScript estrito, monorepo pnpm:**
  - `apps/web`: Next.js 16 App Router, React 19, Tailwind v4, Better Auth. Estúdio do autor + LMS do aluno + API. Cerca de 200 arquivos e 28 mil linhas.
  - `apps/worker`: Node + tsx. Faz polling de um outbox no Postgres e executa as tarefas de IA e a produção de mídia (vídeo, voz, composição com ffmpeg).
  - `packages/course-schema`: contrato do curso (Zod 4), compilador de publicação, DSL de condições e efeitos, direção cinematográfica, relatório de tamanho e cursos de exemplo.
  - `packages/course-engine`: motor de execução determinístico (estado, transições, pontuação, recap, navegação para trás).
  - `packages/ai`: orquestração de IA, prompts, validadores, assistente, avaliador e diretor.
  - `packages/media`: adapters do HeyGen (vídeo com avatar, looks, cinemático) e do ElevenLabs (TTS com timestamps), mais o compositor ffmpeg (planos, slides via satori/resvg, legendas WebVTT, apresentadora com fundo transparente posicionada sobre um cenário).
  - `packages/db`: Drizzle + PostgreSQL, migrations, repositórios e seed.
- **Testes:** Vitest em todos os pacotes (dezenas de arquivos e centenas de casos) e Playwright e2e (aluno, estúdio, tema e navegação; desktop e mobile).
- **IA de texto:** OpenAI (`gpt-5.5`, saídas estruturadas) como provedor ativo, com Anthropic implementado como alternativa e um provedor "fake" para testes.
- **Mídia:** HeyGen API v3 e ElevenLabs. Existe um **modo simulado** (`MEDIA_SIMULATION=1`) que gera vídeos substitutos gratuitos.
- **Infra:** roda localmente (Mac). Os Dockerfiles e o docker-compose estão escritos, mas **nunca foram construídos ou testados**. O armazenamento de mídia é em disco local (`.data/`, cerca de 800 MB). S3 está previsto e não implementado. Não há billing nem multiempresa real: existe um workspace único com `workspaceId` em todas as consultas.
- **⚠️ Controle de versão:** **nenhum commit foi feito ainda.** Todo o projeto está como arquivos não rastreados no branch `feat/incremento-1-fluxo-vertical`.

## 3. Modelo do curso (contrato)

- `CourseDocument` (JSONB no rascunho, com revisões e controle otimista):
  - briefing, objetivos de aprendizagem e módulos → aulas → **grafo da aula** (nós + arestas com condições);
  - variáveis (escopo de aula ou de curso; ex.: `perfil` escolhido na 1ª aula vale no curso todo);
  - `branding`: tema imersivo, wordmark, cor de destaque, nome e papel da apresentadora;
  - `presentation`: avatar, voz, kit de câmeras, posição da apresentadora, fundo, estilo de direção e pronome.
- **Tipos de nó:** `scenario`, `content`, `choice`, `consequence`, `reflection`, `assessment`, `end`, além de `dialogue`, `task`, `evidence`, `resource_simulation` e `ai_feedback` (os últimos parcialmente usados).
- **Nós de mídia** têm `narration` (fala da apresentadora), `motionPrompt` (gesto), `direction` (planos de câmera) e `media` (vídeo + legendas + flag `stale` quando a fala muda).
- **`choice`:**
  - 3 opções com feedback;
  - efeitos (pontuação, variáveis) e ramificação;
  - `openAnswer` opcional (resposta falada e/ou escrita, seguida de autoavaliação "qual opção se parece com a sua").
- **`end`:** fecha com recap ("Meu roteiro"), montado a partir das escolhas, anotações opcionais e checklists.
- **Compilador de publicação:** valida o grafo (sem ciclos irrestritos, todos os caminhos chegam ao fim, tipos de variável, fontes do recap, limites de tamanho). A publicação gera uma versão imutável, e as matrículas ficam presas à versão em que entraram.
- **Progresso:** concluídos obrigatórios / (concluídos + obrigatórios ainda alcançáveis).
- **"Demonstrado":** só com avaliação determinística aprovada. Escolhas e reflexões contam como "tentado".

## 4. Motor de execução (aluno)

- Determinístico. O estado contém o nó atual, o caminho percorrido (com um retrato das variáveis a cada passo), as respostas, a pontuação e as tentativas de avaliação.
- **Navegação** (recém-implementada):
  - "Cena anterior" restaura exatamente o estado daquele ponto e permite trocar a resposta;
  - mapa da aula com as cenas já vistas, sem mostrar as futuras para não estragar os caminhos;
  - "Recomeçar aula";
  - "Rever", uma reprodução só de leitura das aulas concluídas;
  - atalhos de teclado.
- Os eventos são só acrescentados (analytics), e voltar uma cena registra `navigated_back`.
  - **Limitação:** as evidências de objetivo de respostas desfeitas continuam contando.
- **Prévia do estúdio:** sem persistência. Pode começar em qualquer cena, com variáveis forçadas (modo de teste).

## 5. Pipeline de IA (texto)

Tarefas do orquestrador: `outline`, `lesson` (+ repair), `revise_lesson` (focos: encurtar, prático, voz de ensino…), `scene_variations`, `scene_direction` (diretor de câmera), `evaluate_lesson` (avaliador) e o assistente do estúdio (`assistant_turn`, com cartões de ação gratuitos, de IA ou pagos).

- **Saídas estruturadas** com esquema, **validadores determinísticos** e **laço de reparo**: se a saída viola as regras, a IA recebe os erros e corrige.
- **Regras de ensino aplicadas por validador:**
  - segunda pessoa, sem narração em terceira pessoa (`THIRD_PERSON_NARRATION`, `NOT_TEACHING`);
  - ≤ 7 cenas por aula;
  - ≤ 45 palavras na tela por cena, e ≤ 12 palavras-chave quando há fala;
  - 3 opções de ≤ 12–14 palavras e feedback curto;
  - cena "Dica";
  - proibição de gestos de dedo (o avatar fazia "V").
- **Público iniciante ou tímido**, detectado no briefing:
  - decisões por escolha;
  - nada de escrita obrigatória;
  - no máximo uma anotação opcional por curso;
  - voz apenas como treino opcional.
  - Avisos `TOO_MUCH_SCREEN_TEXT_WITH_NARRATION` e `OPEN_ANSWER_HEAVY`.
- **Avaliador:** nota de 1 a 5 por dimensão (postura e gestos, tom de voz, voz, aparência, fundo, realismo, conteúdo, perguntas, decisões). Usa texto + **visão sobre frames do vídeo** e grava na tabela `lesson_quality`.
- **Versionamento de prompts:** `INSTRUCTIONS_VERSION`, `DIRECTOR_PROMPT_VERSION`, etc. entram no hash de reaproveitamento.
- **Não existe:**
  - conjunto de avaliação (eval set) com casos-ouro;
  - medição de regressão quando o prompt muda;
  - exemplos aprovados usados como few-shot;
  - validação de fatos.

## 6. Pipeline de mídia

- **Direção por planos (montada localmente):**
  - uma cena tem 1 a 12 planos: enquadramento (aberto, médio, fechado), câmera do kit, movimento (push-in, pan, drift), layout (apresentadora, apresentadora + slide, slide com PiP, letreiro, cinemático) e transição;
  - **a narração é sintetizada uma vez** (ElevenLabs com timestamps) e cortada por plano;
  - cada plano vira um clipe curto do HeyGen (avatar_iv, lip-sync);
  - o ffmpeg monta tudo com slides, legendas e transições.
- **Kit de câmeras:** cada câmera é um "look" do mesmo avatar no HeyGen. Pode ser gerado por IA a partir de um pedido ("sentada à mesa, plano médio"). Cada câmera tem uma posição própria:
  - `right` ou `left`: vídeo com fundo transparente montado sobre o cenário do curso;
  - `full_frame`: o look com o próprio fundo, para poses sentadas.
- **Cena em movimento (`cinematic_avatar`):** a apresentadora anda, atravessa, entra e senta, ou olha em volta, **sem falar**, com a narração por cima. Isso porque o modo cinemático do HeyGen não faz lip-sync nem aceita áudio próprio.
- **Segurança de custo:**
  - confirmação explícita para toda ação paga;
  - chaves de idempotência;
  - reaproveitamento por hash (roteiro + avatar + voz + parâmetros + versões);
  - vídeos pagos nunca são refeitos sem necessidade;
  - "leases" no worker e limite de 6 looks/hora;
  - travas que separam jobs simulados de reais.
- **Estado real:**
  - poucos vídeos reais gerados: abertura e cena 5 de um curso de teste, a pergunta 3 do Pode entrar (apresentadora à direita, fundo transparente) e um teste da apresentadora sentada (7 s);
  - todo o resto está em modo simulado.
- **Problemas observados:**
  - o look sentado gerado manteve o **cenário de sala de aula** da foto original, incoerente com uma entrevista em escritório;
  - expressão neutra ou séria no início dos clipes;
  - o custo exato do HeyGen não está documentado (a estimativa é em créditos/segundos).

## 7. Experiência do aluno (player)

- **Player "imersivo"** (padrão):
  - vídeo da apresentadora à direita;
  - painel à esquerda com pergunta, opções e botão "Confirmar escolha";
  - selo de status ("Sua vez", "Dica"), barra de progresso e "Meu roteiro" no topo.
- **Modo claro e escuro**, com seletor Sistema/Claro/Escuro e contraste WCAG AA verificado. Identidade: navy `#0B1424` + verde-limão `#C8F03C`; oliva `#3F5A00` para texto de destaque no claro; fonte Figtree.
- **Resposta aberta:**
  - hoje desligada por padrão;
  - quando ligada no modo só voz, aparece "Treinar em voz alta (opcional) · Só você ouve. Pode pular.";
  - depois de gravar, o aluno escolhe qual opção se parece com o que disse.
- **Fim da aula:** anotação opcional com botão "Pular", e "Meu roteiro" é montado a partir das escolhas.
- **Player clássico** disponível via `?player=classic`.

## 8. Experiência do autor (estúdio)

- **Assistente de criação:**
  - passos: tema/público → conteúdo/fontes → estrutura → aulas → apresentação (avatar, voz, câmeras, fundo, posição) → revisão/publicação;
  - storyboard por cena com edição;
  - painel de direção (planos, animatic, prévia de slide);
  - painel de produção de mídia (fila, custo estimado, status, desatualizados).
- **Assistente de IA** (⌘K): conversa e propõe ações, sempre com custo indicado.
- **Painel "Avaliação":** notas do avaliador por aula.
- **Modo de teste:**
  - "Testar a partir daqui" em cada cena;
  - barra para pular de cena, voltar, recomeçar e trocar variáveis (ex.: perfil);
  - filtro "só cenas com vídeo";
  - lista "Vídeos e testes" no painel do curso, a 3 cliques de qualquer cena.
- **Feedback do dono:**
  - "difícil navegar para testar" (corrigido parcialmente com o modo de teste);
  - "muito texto";
  - "muita resposta aberta para tímidos" (corrigido);
  - "o curso estava extenso demais" (de 77 cenas para 35 no curso "Primeira entrevista").
- A lista de cursos está **poluída com dezenas de cursos criados pelos testes e2e** ("Curso wizard 179…").

## 9. Cursos existentes

| Curso | Estado | Observações |
|---|---|---|
| **Pode entrar: sua próxima entrevista começa aqui** | publicado, versão 2 | 7 aulas: abertura, "No dia: chegar bem e com calma" (horário, trânsito, roupa, ansiedade, online), conte sobre você, conte o que fez, explicar mudança, quando não souber/remuneração, simulação final com pontuação e 3 finais. Rota por perfil (primeiro emprego / experiência / transição). 2342 palavras na tela. Treino de voz opcional em 10 perguntas. 1 vídeo real publicado; o vídeo da apresentadora sentada está só no rascunho. |
| **Pode entrar Light** | publicado, versão 1 | Criado por engano (o pedido era "modo claro" da interface), mas útil: 3 aulas, 9 decisões, 638 palavras, cerca de 8 minutos, feedback de uma frase, sem segunda tentativa. |
| **Primeira entrevista de emprego** | rascunho | 35 cenas depois do corte, voz de ensino, avaliador 5/4/4/5/5, 59 vídeos desatualizados. |
| **Comunicação no primeiro emprego** | publicado | Curso de seed/demonstração. |

O roteiro original do autor (Pode entrar) previa:
- sequência vídeo → situação → escolha → feedback → próximo caminho;
- opções plausíveis;
- "não rotular o aluno" nem inferir personalidade por voz ou aparência;
- palavras-chave na tela em vez de texto longo.

## 10. Decisões de arquitetura registradas (reversíveis)

1. Módulos e aulas vivem dentro do JSONB do rascunho, com uma revisão por documento.
2. O worker faz polling do outbox no Postgres (sem Redis/BullMQ por ora).
3. Um único workspace, com `workspaceId` em todas as consultas.
4. A prévia é stateless (o estado vai e volta pelo cliente).
5. Fórmula de progresso que não infla ramos exclusivos.
6. "Demonstrado" só com avaliação determinística.
7. Ciclos irrestritos bloqueiam a publicação.
8. O seed usa o hash do Better Auth.
9. Sem middleware: a autorização fica nos layouts e route handlers.
10. Texto rico em Tiptap JSON restrito (sem HTML).
11. A direção por planos é montada por nós, com ffmpeg sobre clipes curtos.
12. A narração é sintetizada uma vez e cortada por plano.
13. A apresentadora anda só em cena muda (cinemática) com narração por cima.
14. Posição por câmera, incluindo tela cheia para looks sentados.

## 11. Lacunas e riscos conhecidos

1. **Nenhum commit no git**, e o projeto inteiro existe só na máquina local.
2. **Sem dados de alunos reais.** A qualidade é julgada só pela IA (avaliador) e pelo dono, e não há analytics por cena (abandono, tempo, opção escolhida, voltas, uso de voz) nem medida antes/depois de confiança ou preparo.
3. **Sem eval set nem testes de regressão de prompts.** Mudar uma instrução pode piorar outra coisa sem ninguém perceber.
4. **Coerência visual de cenário:** looks gerados herdam o fundo da foto original, e não existe uma biblioteca de cenários (escritório, sala de reunião, recepção).
5. **Custo:** sem orçamento do curso inteiro antes de gerar, sem tabela de preço confiável do HeyGen, e sem prévia barata além do modo simulado.
6. **Produção não pronta para clientes:**
   - multiempresa, billing, S3/CDN, deploy testado, observabilidade, backups;
   - rate limit global, já que hoje é só em memória;
   - LGPD para gravações de voz: é preciso garantir que "Só você ouve" é verdade, ou seja, armazenamento, retenção e transcrição.
7. **Segurança:** o README traz a senha das contas de demonstração em texto claro (só ambiente local, mas deveria sair).
8. **O servidor de desenvolvimento usa a IA real para texto.** Um agente de testes disparou uma direção paga sem querer, ao clicar num botão durante as capturas de tela. O ambiente de teste deveria forçar o provedor fake no servidor, não só no Playwright.
9. **Testes e2e poluem o banco de desenvolvimento** com cursos de teste.
10. **Evidências de objetivo** continuam contando respostas desfeitas por "cena anterior".
11. **Interface:** não há um fluxo único e guiado "briefing → curso publicado". As peças existem, mas o autor precisa saber onde clicar.
12. **Acessibilidade:** contraste verificado e teclado parcial, mas sem auditoria completa com leitor de tela.
13. **Didática não validada com especialista:** as regras foram inferidas do feedback de uma pessoa (o dono) e do roteiro dele.

## 12. Perguntas específicas para o revisor

1. **Qualidade mensurável:** que métricas e que desenho de experimento (A/B, antes/depois, rubricas) você usaria para provar que um curso gerado ensina? Como transformar isso num ciclo automático de melhoria do motor?
2. **Didática para tímidos/iniciantes:**
   - o modelo "escolha guiada + treino de voz opcional + feedback de uma frase" é o melhor?
   - o que falta: prática espaçada, repetição, simulação final mais longa, autoeficácia?
   - como dosar o tamanho do curso (8 min vs 30 min)?
3. **Arquitetura da IA:**
   - vale trocar "um prompt grande + validadores + reparo" por agentes especializados (roteirista, pedagogo, revisor, diretor)?
   - como montar o eval set e os exemplos-ouro?
   - onde usar o modelo mais caro e onde o mais barato?
4. **Vídeo com avatar:**
   - como garantir consistência de cenário e expressão entre câmeras?
   - vale gerar um cenário fixo e sempre compor a apresentadora recortada por cima (inclusive sentada, com mesa em primeiro plano)?
   - alternativas ao HeyGen para lip-sync de qualidade em pt-BR?
5. **Custo:** como orçar e limitar o custo por curso? Quais cenas realmente precisam de vídeo e quais funcionam só com áudio + imagem?
6. **Produto:**
   - o que priorizar para os primeiros clientes (B2B: empresas, ONGs de empregabilidade, escolas técnicas)?
   - que funções de LMS são indispensáveis (relatórios para o gestor, certificados, SCORM/xAPI, integração com WhatsApp)?
7. **UX do estúdio:** como deve ser o fluxo ideal de "briefing → curso publicado" para um autor não técnico, com pontos de aprovação e visão de custo?
8. **Riscos legais e éticos:** gravação de voz de menores ou jovens, avatar que parece pessoa real, não inferir personalidade, LGPD.
9. **Ordem de execução:** dado tudo isso, quais são os 10 próximos passos em ordem, com esforço estimado?

## 13. Formato de resposta desejado

- Um resumo executivo (5 linhas).
- Ajustes priorizados numa tabela: área · problema · ajuste proposto · impacto (A/M/B) · esforço (P/M/G) · risco de não fazer.
- Respostas às perguntas da seção 12.
- Um plano de 30/60/90 dias.
- O que você **removeria ou simplificaria** no projeto.
