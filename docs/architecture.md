# Arquitetura

Monólito modular em TypeScript, com dois processos: **web** (Next.js App Router: estúdio, LMS e Route Handlers) e **worker** (jobs em background). Um único PostgreSQL guarda dados relacionais e documentos JSONB versionados.

```
apps/web                 estúdio, LMS, HTTP (Route Handlers finos + serviços)
apps/worker              consumidor do outbox (polling); BullMQ/Redis entram com jobs de ingestão/mídia
packages/course-schema   contrato do curso: tipos de bloco, DSL, compilador de publicação, migrações de schema
packages/course-engine   motor determinístico: transições, avaliação, progresso, resultado por objetivo
packages/db              schema Drizzle, migrations SQL, repositórios transacionais, seed
packages/ai              contrato de adapter LLM + adapter fake (nenhum provedor real ainda)
packages/media           contratos de voz/vídeo/storage (nenhuma integração ainda)
```

## Limites entre editor, agente, motor e LMS

```
            ┌──────────────┐      propostas validadas       ┌──────────────┐
            │   Estúdio    │◄──────────────────────────────►│    Agente    │ (fase B)
            │ (editor)     │                                │ (packages/ai)│
            └──────┬───────┘                                └──────────────┘
                   │ PUT /draft (expectedRevision)
                   ▼
        ┌─────────────────────┐   compileCourse()   ┌──────────────────────┐
        │ course_drafts       │────────────────────►│ course_versions      │ snapshot imutável
        │ draft_revisions     │  erros bloqueiam    │ (publicação explícita)│
        └─────────────────────┘                     └──────────┬───────────┘
                                                               │ fixada na matrícula
                                                               ▼
   ┌──────────────┐  intenção {attemptId,nodeId,eventId,   ┌──────────────────────┐
   │ Player (LMS  │  expectedRevision, resposta}            │ Motor (course-engine)│
   │ e prévia)    │───────────────────────────────────────► │ applyIntent() puro   │
   │              │◄─────────────────────────────────────── │ dentro da transação  │
   └──────────────┘  estado, feedback, progresso            └──────────────────────┘
```

- **Editor e player compartilham o mesmo contrato** (`@lms/course-schema`). O editor manipula `CourseDocument`; o player recebe uma `Lesson` da versão publicada (ou do rascunho, na prévia).
- **O motor é uma função pura** (`applyIntent(graph, state, intent)`); o servidor é a autoridade: valida sessão, dono da matrícula, versão, nó atual, revisão e grava estado + evento na mesma transação (`learning.applyLearnerEvent`).
- **Prévia e LMS executam o mesmo motor e o mesmo componente `LessonPlayer`**; só o *driver* muda (`/api/attempts/*` persiste; `/api/preview/step` não).
- **O agente** (fase B) nunca escreve no rascunho diretamente: gera propostas com `baseRevision`, o backend valida (schema + compilador) e aplica como nova revisão. Não tem SQL, shell nem permissão de publicação.
- **Publicação** é explícita e cria um snapshot imutável; alunos em andamento ficam na versão fixada. Migração de versão para matrículas existentes será uma operação explícita e auditada (fora do incremento 1).

## Módulos de domínio

| Módulo | Onde | Responsabilidade |
|---|---|---|
| autoria | `packages/db/src/repositories/authoring.ts` | rascunho, revisões, concorrência otimista, restauração, duplicação |
| publicação | `packages/db/src/repositories/publishing.ts` | validação, snapshot, auditoria, outbox `course.published` |
| aprendizagem | `packages/db/src/repositories/learning.ts` | matrícula, tentativas, eventos idempotentes, evidências, relatório |
| identidade | `packages/db/src/repositories/identity.ts` + `apps/web/src/server/viewer.ts` | papéis por workspace e autorização no backend |
| agente | `packages/ai` | contrato e fake (fase B: orquestrador, ferramentas, propostas) |
| mídia | `packages/media` | contratos (fase C: HeyGen, ElevenLabs, S3, jobs) |
| fontes | — | fase A (`source_documents`, `source_chunks`) |

## Concorrência e idempotência

- **Rascunho**: `course_drafts.revision` + `expectedRevision` → `409 CONFLICT`; o cliente mantém as alterações locais e mostra o conflito.
- **Tentativa**: `SELECT … FOR UPDATE` na linha da tentativa; `lesson_attempts.revision` + `expectedRevision`; `learner_events (attempt_id, event_id)` único → reenvio devolve o resultado gravado sem reaplicar efeitos.
- **Outbox**: eventos gravados na mesma transação; o worker processa por polling com tentativas limitadas (`attempts`, `last_error`). Sem transação aberta durante chamadas externas.

## Segurança

- Autorização sempre no servidor (`requireStaff`, `requireEditor`, `requireAdmin`, `requireOwnEnrollment`, `requireCourseInWorkspace`).
- Conteúdo é JSON tipado; o renderer só emite os blocos permitidos. Nunca `eval`, HTML arbitrário ou SQL gerado por autor/LLM.
- Segredos só em variáveis de ambiente do servidor; nada de provedor chega ao navegador.

## O que fica fora do incremento 1

Agente de construção com provedor real, fontes e ingestão, jobs de mídia, conversa dinâmica no LMS, migração de versão de matrículas, webhooks para CRM/n8n, busca na internet, SCORM/xAPI, checkout e comunidade.

## Agente de construção (fase B — implementado)

```
Wizard ──"Propor estrutura" / "Gerar aulas"──► agent_runs (queued) ──outbox agent_run.queued──► worker
   │                                                 │
   │                              packages/ai: adapter (Anthropic messages.parse + zodOutputFormat | OpenAI responses.parse)
   │                              prompts versionados (INSTRUCTIONS_VERSION) · fontes como <fontes> (dados, não instruções)
   │                              roteiro → scriptToGraph → compileLesson → reparo limitado (máx. 2) com os erros
   ▼                                                 ▼
agent_proposals (baseRevision, payload, rationale, summary) ◄──── proposta estruturada e auditável
   │ "Usar esta estrutura" / "Aplicar selecionadas" (aprovação em lote)
   ▼
applyProposal: expectedRevision + conflito se a parte afetada mudou desde baseRevision (force explícito) → nova revisão do rascunho (origem "agent")
```

- Um único orquestrador com tarefas tipadas (`outline`, `lesson`); sem multiagentes autônomos. O agente não tem SQL, shell nem permissão de publicação; só produz propostas.
- Fallback entre fornecedores apenas em erro transitório e só quando `AI_FALLBACK_PROVIDER` foi configurado (reenvio a terceiro é explícito e registrado em `fallback_used`).
- Registro por execução: provedor, modelo efetivo, versão das instruções, latência, tokens, custo (tabela Anthropic embutida; OpenAI indisponível), reparos, erro. Nenhum raciocínio privado é solicitado ou armazenado; `rationale` é uma justificativa curta.
- Modo de demonstração (`AI_PROVIDER=fake`): propostas-modelo determinísticas, identificadas como tal.
- Fontes: `source_documents`/`source_chunks`; extração de PDF no worker (`pdf-parse`); PDF digitalizado → `needs_ocr` sem simular extração; trechos por página.

## Produção de mídia por cena (fase C — implementada com modo simulado)

```
Editor ──"Gerar vídeo desta cena" (ação explícita, paga)──► POST /api/courses/:id/media-jobs
   │   hash = sha256(roteiro + avatar + voz + parâmetros + versão do adapter)
   │   mesmo hash já bem-sucedido? ──► reaproveita o asset (sem novo job)
   ▼
media_jobs (queued) ──outbox media_job.queued──► worker
   ├─ voz ElevenLabs? POST /v1/text-to-speech → asset de áudio (nosso storage) → POST /v3/assets (HeyGen)
   ├─ POST /v3/videos (Idempotency-Key = requestId persistido) → external_id
   ├─ webhook /api/webhooks/heygen (HMAC-SHA256 do corpo bruto) ──outbox media_job.reconcile──┐
   ├─ polling GET /v3/videos/{id} a cada MEDIA_POLL_MS ◄─────────────────────────────────────┘
   └─ completed → download → asset de vídeo (sha256) → job succeeded → node.media anexado ao rascunho (nova revisão, origem "media")
```

- Estados: `queued, running, succeeded, failed, canceled, reconciliation_required` (sem conclusão após 2 h).
- Tentativas limitadas (3) com backoff; erros 4xx do provedor não são repetidos; 409 `request_in_progress` (mesma chave de idempotência) só aguarda reconciliação. Timeout após o envio nunca cria um segundo pedido: o reenvio usa a mesma `Idempotency-Key`.
- Nenhuma transação de banco fica aberta durante chamadas externas.
- Trocar avatar/voz gera outro hash e outro asset, mas não altera o grafo nem a avaliação.
- Editar o texto de uma cena com mídia gerada marca `media.stale = true`; nada é regenerado automaticamente.
- **Modo simulado** (sem `HEYGEN_API_KEY` ou `MEDIA_SIMULATION=1`): nenhum provedor é chamado; o job termina `succeeded` com `simulated=1`, sem vídeo (a voz simulada gera um WAV de silêncio para exercitar o storage). A interface mostra isso explicitamente.
- Custo: ElevenLabs cobra 1 crédito por caractere (header `character-cost` registrado); o HeyGen não publica tabela de créditos por vídeo, então a estimativa em moeda aparece como **indisponível**.
