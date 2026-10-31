# Estado da implementação

Atualizado em 2026-10-23 · incremento 1 (fluxo vertical) + assistente de montagem, agente de construção e vídeo por cena. Legenda: **Pronto** = implementado e testado; **Parcial** = funciona com limitações descritas; **Simulado** = existe só como fake explicitamente identificado; **Futuro** = apenas contrato/planejado.

## Incremento 1 — fluxo vertical

| # | Item | Estado | Evidência / limitação |
|---|---|---|---|
| 1 | Projeto executável, migrations e seed idempotente | Pronto | `pnpm db:migrate`, `pnpm db:seed` (rodado 2× sem duplicar); `packages/db/migrations/0000_initial.sql` |
| 2 | Autenticação e separação equipe/aluno | Pronto | Better Auth (sessão em banco), papéis por `workspace_memberships`; `requireStaff/requireEditor/requireAdmin/requireOwnEnrollment`; e2e `aluno não acessa o estúdio` |
| 3 | Curso, módulo e aula persistidos com rascunho editável | Pronto | `course_drafts` (JSONB + `revision`), `draft_revisions`; concorrência otimista testada (`saveDraft` CONFLICT) |
| 4 | Editor de blocos e mapa React Flow sincronizados | Pronto | Mesmo objeto `lesson.graph`; mapa altera só `layout.positions`; conexão por handle de opção cria/replace aresta com `optionId`; e2e `studio.spec.ts` |
| 5 | Validação estrutural e publicação de snapshot imutável | Pronto | `compileCourse` (12 testes), `publishCourse` bloqueia com `PUBLISH_BLOCKED` + issues; `course_versions` |
| 6 | Matrícula por administrador e player real | Pronto | `enrollStudent` fixa a versão; página de matrículas; `LessonPlayer` compartilhado entre LMS e prévia; e2e desktop + mobile |
| 7 | Escolhas → consequências diferentes → reencontro | Pronto | Curso seed; testes do motor e de integração verificam `cons_aceita`/`cons_negocia` → `conteudo_negociar` |
| 8 | Reflexão livre e avaliação determinística | Pronto | `reflection` (registra, não avalia; min/max), `assessment` (single/multiple, `all_correct`/`min_correct`, `maxAttempts`) |
| 9 | Retomada e proteção contra eventos duplicados | Pronto | `startOrResumeAttempt`; `learner_events (attempt_id,event_id)` único → replay; `FOR UPDATE` + `expectedRevision` → 409 (teste com `Promise.allSettled` de duas "abas") |
| 10 | Relatório básico por matrícula | Pronto | `getEnrollmentReport`: progresso, caminho, respostas, resultado por objetivo (demonstrado/tentado/não demonstrado/não alcançado) |

## Motor e contrato

| Item | Estado | Notas |
|---|---|---|
| Blocos `scenario, content, choice, consequence, reflection, assessment, end` | Pronto | executor + renderer registrados |
| Blocos `dialogue, task, evidence, resource_simulation, ai_feedback` | Futuro | contratos Zod existem; compilador bloqueia publicação; editor não oferece |
| DSL de condições/efeitos | Pronto | tipada, validada, sem eval; `answered`/`passed` para ramificar por resposta |
| Ciclos | Parcial | ciclos irrestritos bloqueados; repetição só via `maxAttempts` da avaliação |
| Progresso por requisitos alcançáveis | Pronto | ramos exclusivos não inflam o denominador (teste) |
| Migração de `schemaVersion` | Pronto (infra) | `migrateCourseDocument` com cadeia vazia (só v1) |
| Migração de matrículas para nova versão | Futuro | alunos permanecem na versão fixada |
| Mídia em blocos (`media` ref) | Pronto | upload com detecção por assinatura, entrega com Range, `generatedFrom` + `stale` |

## Estúdio (apps/web)

| Item | Estado | Notas |
|---|---|---|
| Biblioteca com status, autor, versão, pendências, duplicação | Pronto | duplicação via `POST /api/courses/[id]/duplicate` (botão na UI: ver status do editor) |
| Briefing estruturado, objetivos, árvore de módulos/aulas | Pronto | `/estudio/cursos/[id]` (Visão geral), reordenação por botões, pendências ao vivo com `compileCourse` |
| Editor de blocos + mapa React Flow | Pronto | formulários por tipo, construtor de condições (subconjunto da DSL), variáveis, validação ao vivo e sob demanda |
| Autosave com revisão, conflito, desfazer, restaurar revisões | Pronto | debounce 1,2 s, `expectedRevision`, 409 mantém alterações locais, undo (50), drawer de revisões com restauração |
| Prévia com o mesmo player do LMS | Pronto | `LessonPlayer` + `createPreviewDriver` sobre `POST /api/preview/step` (sem persistência); e2e |
| Mídia da cena: upload, biblioteca, geração por avatar, status do job, marcação de desatualizada | Pronto (modo simulado verificado) | painel no formulário do bloco; confirmação explícita de ação paga; polling do job; rebase automático quando a única diferença no servidor é a mídia anexada pelo worker |
| Revisão com erros/avisos e publicação explícita | Pronto | `/estudio/cursos/[id]/revisao` |
| Matrícula por administrador e relatório | Pronto | `/estudio/cursos/[id]/matriculas`, `/matriculas/[enrollmentId]` |
| Assistente de montagem (wizard em 6 passos) | Pronto | e2e `wizard.spec.ts` de ponta a ponta em modo demo (tema → fontes → estrutura por IA → apresentação → aulas por IA → publicar → painel → storyboard); verificado também no navegador | `/estudio/novo` → `/estudio/cursos/[id]/montar`; estado em `document.wizard` |
| Agente de construção: propor estrutura, gerar aulas, propostas com baseRevision, aprovação em lote, conflito | Pronto | OpenAI **testado contra a API real** (`gpt-5.5`, proposta de estrutura em 38 s com fontes); Anthropic implementado (`claude-opus-5-5`, `messages.parse`) mas sem chave para teste; modo demo `AI_PROVIDER=fake` — 8 testes unit + 3 integração |
| Fontes: texto colado, PDF/TXT/MD, OCR sinalizado, trechos por página | Pronto | worker extrai com `pdf-parse`; URL/DOCX/transcrição: futuro |
| Storyboard de aula (cenas, edição inline, inserir/excluir com religação, avisos em linguagem humana, mídia por cena) | Pronto | `?modo=avancado` mantém o editor técnico |
| Galeria de apresentadores, vozes e ambientes | Pronto | `document.presentation`; fundo por cor ou imagem (enviada ao HeyGen como asset) |
| Comandos finos do agente (Variar experiência, Expandir consequência, Revisar dificuldade, Verificar fontes) | Futuro | o orquestrador aceita `instruction` livre por execução |
| Acompanhamento de produção (tarefas, falhas, custos) | Futuro | fase C |

## LMS

| Item | Estado | Notas |
|---|---|---|
| Login, cursos matriculados, retomada | Pronto | `/aprender`, `/aprender/[matrícula]` com "Retomar de onde parou" e status por aula |
| Player em cartões, seleção e texto, consequência, orientação | Pronto | `LessonPlayer`: progresso real, feedback da escolha, retry de avaliação, conclusão ≠ domínio, 409 → ressincroniza, reenvio com o mesmo `eventId` |
| Progresso por atividades e competências | Pronto (backend) | `computeProgress`, `summarizeObjectives` |
| Certificado/declaração simples com regras explícitas | Parcial | texto de declaração na página do curso; sem PDF |
| Acessibilidade (teclado, foco, contraste, rótulos, reduced motion) | Parcial | CSS global + componentes; auditoria formal pendente |
| IA durante a aprendizagem | Futuro | fase D |

## Infra e operação

| Item | Estado | Notas |
|---|---|---|
| Worker (outbox por polling) | Pronto | processa `course.published`, `enrollment.created`, `lesson.completed`, `course.completed` (apenas log) |
| BullMQ/Redis | Futuro | entra com jobs de ingestão/mídia; Redis instalado localmente mas não usado |
| Adapter LLM | Simulado | `FakeLlmAdapter` explicitamente identificado; `AI_PROVIDER` ≠ `fake` lança erro "não implementado" |
| HeyGen v3 (vídeo com avatar) | Parcial | avatares/vozes reais listados; **upload de asset corrigido para multipart e verificado contra a API real**; geração de vídeo ainda não concluída (fila pausada aguardando o autor). Disjuntor pausa a fila do curso após 3 falhas iguais em 10 min |
| ElevenLabs TTS | Pronto | síntese real executada (83 narrações, ~26 mil caracteres, incidente de 2026-10-23); narração é gravada antes do upload e reaproveitada por hash de cena em qualquer retry |
| Jobs de mídia (worker) | Pronto | estados, tentativas limitadas, backoff, reconciliação por webhook e polling, download para storage próprio, anexo ao nó; verificado em modo simulado |
| Storage | Pronto (S3 não testado contra bucket real) | adapter local e S3-compatível (`@aws-sdk/client-s3`, multipart via lib-storage, Range), 15 testes sem rede; guia de deploy com política IAM mínima |
| Docker (web/worker), Compose, EasyPanel, health check, backup | Pronto (não testado em build) | `Dockerfile.web`, `Dockerfile.worker`, `docker-compose.yml`, `deploy/easypanel.md`; build de imagem não executado neste ambiente (sem Docker) |
| Webhooks CRM/n8n | Futuro | formato versionado do outbox já existe |

## Testes executados

- `packages/course-schema`: 12 testes (compilador, schema, curso seed) — **passaram**.
- `packages/course-engine`: 9 testes (transições, retries, condições, progresso, objetivos) — **passaram**.
- `packages/db`: 10 testes de integração com PostgreSQL real (idempotência, concorrência, versão fixada, publicação bloqueada, conclusão de curso) — **passaram**.
- `packages/ai`: 8 testes (roteiro→grafo, reparo, fallback, config, modo demo) — **passaram**.
- `apps/worker`: 3 testes de integração (fontes PDF/OCR, fluxo completo de propostas, conflito) — **passaram**.
- `packages/media`: 10 testes (HeyGen v3, ElevenLabs, assinatura de webhook, hash de cena, sniff) — **passaram**.
- Playwright (`apps/web/e2e`): `learner.spec.ts` 3/3 (desktop e mobile), `studio.spec.ts` 4/4 (storyboard, publicação, prévia, mídia), `wizard.spec.ts` 1/1 — **passaram** contra o dev server com seed e worker em modo demo.

## Revisão de código (2026-10-23)

Auditoria independente (somente leitura) com 20 achados; corrigidos nesta rodada, com testes de regressão:
- Compilador: opção com única saída condicional sem fallback agora bloqueia (aluno ficaria preso); fallback com condição é erro; ciclo não gera "beco sem saída" espúrio.
- Autenticação: cadastro público desligado (`disableSignUp`); contas só por administrador/seed.
- Worker: varredura de execuções do agente presas em `running` (worker caiu) e fontes em `processing`; rota `POST /api/agent-runs/[id]/cancel`; eventos lentos com concorrência limitada.
- Mídia: retry nunca sintetiza/reenvia o áudio de novo (sem recobrança); vídeo é anexado antes de marcar sucesso e o sucesso não sobrescreve cancelamento; dedupe de jobs por cena com índice único parcial no banco; limite e timeout no download; fundo de imagem validado no workspace; documentos (PDF de fonte) só para a equipe.
- Propostas: conflito também para estrutura (objetivos/esqueleto editados após a proposta); aplicação e lote em transação única; ids inválidos do LLM entram no ciclo de reparo.
- Progresso: o primeiro salto respeita as condições do estado atual (ramos impossíveis não inflam o denominador).
- Matrícula idempotente sob concorrência; health check sem detalhes do banco; assinatura de webhook validada como hex.

Pendentes (baixa severidade, registrados): retenção configurável de respostas livres/logs; custo real do ElevenLabs em USD (só caracteres); uploads ainda são lidos em memória (limite por `content-length`).

## Direção cinematográfica (2026-10-23)

Ver [direcao-cinematografica.md](direcao-cinematografica.md). Entregue e testado em simulação: contrato de direção, kit de câmeras (inclui gerar ângulo com IA, pago com confirmação), IA diretora com validação e reparo, painel "Direção" com editor de planos e animatic, pipeline por planos no worker (narração única com timestamps, clipes por plano, slides, letreiros, PiP, transições, reaproveitamento por plano) e simulação com apresentador substituto. Em andamento: "cena em movimento" (apresentador caminhando com narração por cima). Nenhuma cena dirigida real foi gerada ainda (aguarda aprovação de custo).

## QA completo (2026-10-24)

Quatro frentes (código, prompts, estúdio, aluno) em simulação; relatório em
[qa/qa-completo-2026-10-24.md](qa/qa-completo-2026-10-24.md). Corrigidos os
achados altos e médios: segurança de cobrança (chave de repetição, resgate de
clipes pagos, cancelamento, isolamento por workspace, parse da ElevenLabs),
pedido de caminhada coerente e sem a pessoa no fundo, gênero configurável,
assistente com escopo e trava de pagamento corretos, legendas WebVTT em todo
vídeo, player no celular e acessibilidade. Teste real anterior: 2 vídeos
dirigidos gerados (abertura com caminhada + cena com slide); a regeneração com
as melhorias aguarda aprovação de custo.

## Curso curto, voz de ensino e Avaliador (2026-10-24/25)

- **Motor recalibrado**: meta padrão 15 min (10/15/20/30/45); aula = situação →
  decisão (3 opções) → consequências → Dica → fecho; tetos verificados com reparo
  (≤ 7 cenas, ≤ 45 palavras na tela, ≤ 60 faladas, opções ≤ 12 palavras);
  `courseLengthReport` gera avisos `LESSON_TOO_LONG`/`COURSE_TOO_LONG`.
- **Voz de ensino**: regras de mentor falando com "você" em todas as cenas,
  consequência como feedback direto; validador `THIRD_PERSON_NARRATION` /
  `NOT_TEACHING` (reparável); foco de revisão `teaching`.
- **Avaliador** (`evaluate_lesson`): nota 1–5 por dimensão (conteúdo, voz
  narrativa, perguntas, decisões, realismo, fala, postura, aparência, fundo, voz,
  realismo visual) com evidência, problema, correção e ação; texto via LLM +
  validadores; vídeo via quadros (ffmpeg) + visão (OpenAI/Anthropic) + métricas
  de ritmo das legendas; tabela `lesson_quality`; painel "Avaliação" por aula,
  cartão "Qualidade do curso" e aviso na revisão.
- **Player**: decisão sobre o vídeo em colunas quando as opções são curtas e o
  quadro comporta; abaixo do vídeo (com confirmar fixo) quando longas, quadro
  baixo ou celular.
- **Curso "Primeira entrevista de emprego"**: 77 → 35 cenas, ~45 → ~15 min, voz
  de ensino aplicada (rev. 106); avaliação do texto: 5/4/4/5/5. Os 59 vídeos
  antigos ficaram desatualizados (regeração aguarda aprovação de custo).
- Infra: worker recusa tarefas desconhecidas (evita gerar aula por engano com
  código antigo); modo real do worker em `tsx watch`.

## Plano: motor autônomo (sem sessões nem scripts)

Origem: lote de 12 cursos (2026-10-30). Análise em `docs/aderencia-motor-lote.md`.
Meta: uma pessoa monta um curso inteiro pelo estúdio, e pilota 12 de uma vez, sem
o Claude e sem o Terminal. Ordem de entrega:

| # | Item | Estado | Pronto quando |
|---|---|---|---|
| A1 | **Novo instrutor** em `/estudio/modelos`: descrição → personagem → 3 câmeras no estúdio 6/7/8 → voz da biblioteca → grava presenter + kit | Feito (31/10) | Botão "Novo instrutor": orçamento (4 visuais HeyGen) → "Aprovar e gerar" → progresso por câmera; estado gravado no próprio instrutor (`data.creation`), retomar não paga de novo. API `POST /api/library/instructors` (+ `/:key` para cada passo). Mesma máquina de estados do script (`advanceInstructor`, `@lms/media`). Kit novo copia marca/direção/regras/alunos do kit mais recente do estúdio. Testado só em simulação |
| A2 | **Importar roteiro GPT** em `/estudio/novo`: `.md` → rascunho cena por cena, com kit e paleta escolhidos | Futuro | Mesmo resultado do `import-markdown-course.ts --kit`; mostra os avisos do formato |
| A3 | **Paleta do vídeo** (`branding.videoPalette`) nos detalhes do curso, com prévia do véu | Futuro | Clássica/invertida/personalizada; contraste conferido (hoje: script) |
| A4 | **Teto de gasto** na tela do workspace (`spend_limits.mediaDailyUsd`/`aiDailyUsd`) | Futuro | Só admin; mostra o gasto das últimas 24 h (hoje: SQL) |
| A5 | **Saldo do HeyGen** antes de disparar (créditos de API) e erro claro de "sem crédito" | Futuro | Orçamento avisa antes de gerar quando o saldo não cobre (hoje: falha no meio) |
| A6 | **Republicar movendo matrículas** pela tela, quando aulas e cenas são as mesmas | Futuro | Hoje: `publicar-e-matricular.ts` |
| A7 | **Painel de lote**: cursos com etapa atual (rosto → kit → orçamento → gravação → QA → publicado), custo, "aprovar tudo até US$ X" | Futuro | Substitui `lote-rostos.sh`, `aplicar-kit.ts`, `lote-videos.sh` e as 12 sessões |
| A8 | **QA automático ao fim da gravação**: quadro de cada cena (rosto, pílulas, letreiro, marca d'água, cores) + checagem de texto (nomes, CIEE/IEL, slogan) | Futuro | Relatório por curso no painel; bloqueia publicar se falhar |
| A9 | Correção do letreiro/título em minúscula com ponto ("acabou minha tarefa. e agora?.") | Futuro | Achado do curso 10 |
| A10 | Vídeo que falha sem ser cobrado (ex.: "Insufficient credits") não conta no teto de 24 h | Futuro | Hoje soma a estimativa; o piloto do lote zera à mão |
| A11 | Pílulas a partir do "Texto na tela" quando o roteiro não tem `Cartão:` | Futuro | Achado do curso 02 |
| A12 | Cartão "Pergunta a seguir" com fato + pergunta inteira (até 22 palavras; letra menor nos longos) | Feito (31/10) | `teaserQuestion` em `zones.ts`; cartões dos 14 cursos reescritos sem regravar (`ajuste-fino.ts --teaser`) |
| A13 | Fila com retomada automática: regravar o que falhou por crédito quando houver saldo | Futuro | Hoje: `lote-piloto.sh` |
| A15 | **Volume normalizado** na composição (loudnorm 2 passadas, ganho linear, −16 LUFS / pico −1,5 dBTP) em toda saída: cena montada, plano único e apresentador posicionado; `metadata.loudness` no asset e aviso "voz baixa" abaixo de −19 LUFS | Feito (31/10) | `packages/media/src/compose/loudness.ts`. Cursos já publicados nivelados com `apps/worker/src/scripts/normalizar-volume.ts` (grátis, refaz do original as cópias −20 do curso 12) |
| A14 | **Reação da instrutora a cada resposta** (padrão): vídeo curto por opção, tocado logo depois da escolha, antes de "Sua escolha" / ▶ Assistir. Roteiro GPT com `Reação:` por opção; importador, orçamento, gravação e player | Em andamento (sessão da ponte) | Pedido do usuário em 30/10: "quero tudo, no motor e nos cursos; a criação dos novos já deveria ter isso padrão". Aplicar também nos 14 cursos existentes. Gravação aprovada pelo usuário: "Eu aprovo se ficar nessa faixa até usd 10" (teto de US$ 10 por curso) |
| A16 | **Pré-carga no player**: enquanto um vídeo toca, o navegador já baixa a cena seguinte e as reações da próxima pergunta (sem espera na troca vídeo → pergunta → reação → vídeo) | Feito (31/10) | `video-prefetch.tsx` (até 5 vídeos) |
| A17 | **Ajuste fino sem regravar**: tirar plano (`--drop`), aparar a primeira/última frase de um plano pelo tempo das palavras (`--cut`), trocar o cartão do fim (`--teaser`); reações com interjeição repetida aparadas pelo alinhamento por letra | Feito (31/10, script) | `ajuste-fino.ts`, `aparar-reacoes.ts`, `perguntas-ligadas.ts`. Falta levar à tela do estúdio |
| A18 | **Roteiro sem molde**: abertura do jeito de cada instrutor, sem explicar a plataforma; chamada = fato da situação + a mesma pergunta do bloco (`callFromSituation` quando o roteiro não traz); reações sem interjeição repetida | Feito (31/10) | Prompt do GPT e importador. Falta: QA acusar abertura repetida entre cursos e fato só no texto |

## Bloqueios externos

- Sem `HEYGEN_API_KEY`/`ELEVENLABS_API_KEY`: os adapters e o pipeline estão implementados e testados com `fetch` falso e em modo simulado; **o teste de ponta a ponta contra HeyGen/ElevenLabs permanece bloqueado** até as chaves existirem no `.env`. Agente de construção (Anthropic/OpenAI) e S3 seguem como futuro.
- Docker não está instalado nesta máquina: Dockerfiles e Compose foram escritos mas o build de imagem não foi executado.
