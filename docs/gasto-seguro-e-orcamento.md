# Gasto seguro, custo e orçamento de produção (incremento 1)

Implementa os achados P0-1, P0-2 e P1-10 da [auditoria de 2026-10-29](./auditoria-wizard-2026-10-29.md).

## Trava de provedores pagos (P0-1)

- `ALLOW_PAID_PROVIDERS=1` (ou `true`) é obrigatório para qualquer chamada paga. Sem ela:
  - `aiConfigFromEnv()` força `provider = 'fake'` (modo de demonstração, configurado) mesmo com `AI_PROVIDER` e chaves, e expõe `paidAllowed: false`, `mode: 'demo'`, `blockedProvider` e `guardReason`.
  - `mediaConfigFromEnv()` força `simulation = true` (`mode: 'demo'`, `simulationReason`).
  - `createAdapter('openai'|'anthropic')` lança `LlmError('auth')` (defesa em profundidade).
- `NODE_ENV=production` não libera sozinho: produção define a variável explicitamente, na web e no worker.
- Worker: `processAgentRun` falha a execução com "provedor divergente entre web e worker" quando `run.provider !== aiConfigFromEnv().provider`, sem chamar nenhuma API. Para mídia vale a trava já existente (`worker/media.ts`: worker em simulação nunca executa job real).
- Modo resolvido é logado (só nomes) no boot do worker e na primeira requisição da web que toca IA/mídia.
- `GET /api/ai/capabilities` e `GET /api/media/capabilities` devolvem `{ mode: 'demo'|'real', paidAllowed, provider/model… }` sem segredos.

## Custo

- IA: `packages/ai/src/pricing.ts` (`AI_PRICES_JSON` sobrescreve; padrões por id/prefixo de modelo, **estimativas**). Os adapters OpenAI e Anthropic devolvem `costUsd`; o worker grava `cost_usd` e `usage` em `agent_runs` (colunas já existiam).
- Mídia: `packages/media/src/pricing.ts` (`MEDIA_PRICES_JSON`: ElevenLabs por 1k caracteres, HeyGen por segundo, cena em movimento por segundo; **estimativas**).
  - `cost_estimated_usd` preenchido na criação (pedido avulso e lote); 0 em simulação.
  - `cost_actual_usd` preenchido na conclusão de plano único pelas quantidades reais: caracteres cobrados pelo ElevenLabs neste job (`elevenLabsCharacterCost`) e segundos do vídeo entregue pelo HeyGen (narração ou vídeo transparente reaproveitados = 0).
- `GET /api/courses/[courseId]/spend`: totais do curso, do workspace nos últimos 30 dias, e o teto/comprometido da janela de 24 h.

## Orçamento e teto (P0-2)

- `POST /api/courses/[courseId]/media-jobs/quote` `{ lessonIds?, nodeIds?, includeStale }` → resolve cada cena elegível com a mesma regra do pedido avulso (`resolveSceneProduction` em `apps/web/src/server/media.ts`), identifica reaproveitamento por hash (`reused`, custo 0) e cenas já na fila (`open`), devolve `{ quoteId, items, totals, expiresAt, errors, budget }` e persiste em `media_quotes` (revisão + impressão do rascunho, validade `MEDIA_QUOTE_TTL_MIN`, padrão 30 min). Nada é criado nem cobrado.
- `POST /api/courses/[courseId]/media-jobs/batch` `{ quoteId, confirmPaid: true }` → `media.createJobsFromQuote` cria todos os jobs numa transação, respeitando a unicidade de job aberto por cena (cenas que ganharam job são `skippedOpen`), e grava `quote_id`, `approved_by`, `approved_at` em cada job. Recusa com 409 (`details.reason`): `expired`, `consumed`, `revision_changed`, `mode_changed`. Cenas `reused` recebem a mídia já paga sem novo job.
- Teto: `MEDIA_DAILY_BUDGET_USD` / `AI_DAILY_BUDGET_USD` (padrões 50 / 20; `-1`/`unlimited` desliga; override em `workspaces.spend_limits`). Janela deslizante de 24 h. Comprometido = Σ `coalesce(cost_actual_usd, cost_estimated_usd)` dos jobs reais não cancelados (abertos contam pelo estimado) + Σ `cost_usd` das execuções pagas + execuções abertas × `AI_RUN_ESTIMATE_USD`. Pedido avulso, lote ou execução de IA que ultrapassaria devolve **402 `BUDGET_EXCEEDED`** com `{ limitUsd, spentUsd, addUsd, remainingUsd }`. Simulação/fake nunca são checados nem contados.
- Worker: pré-checagem barata antes de pagar a narração (`narrationPreflight`): avatar `sim_*`, voz `sim_*` ou `voiceId` nulo no ElevenLabs falham o job sem chamar provedor (`PreflightError`, não repetível).
- Wizard (`VideosBlock` em `step-revisao.tsx`): "Calcular orçamento" → lista com totais, cenas reaproveitadas e teto → "Aprovar e produzir". O painel de produção segue mostrando o progresso.

## Colheita de plano único (P1-10)

Job real com `externalId` que passa de 2 h vai para `reconciliation_required` (libera a vaga) com `input.harvestUntil = início + 24 h`. `harvestSingleShotJobs()` (a cada ciclo de `pollRunningJobs`) consulta o HeyGen; se o vídeo ficou pronto, o job volta a `running` e a reconciliação normal baixa, anexa e marca sucesso, sem novo envio nem nova cobrança. Falha remota ou 24 h encerram a colheita (`harvestDone`).

## Migração

`packages/db/migrations/0010_spend_quotes.sql` (aditiva): tabela `media_quotes`, enum `media_quote_status`, colunas `media_jobs.quote_id/approved_by/approved_at`, `workspaces.spend_limits`.
