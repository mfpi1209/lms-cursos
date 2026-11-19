---
tags: [arquitetura]
atualizado: 2026-11-13
fonte:
  - docs/architecture.md
  - docs/decisions.md
  - docs/course-schema.md
---

# Visão geral

Monólito modular em TypeScript com dois processos: **web** (Next.js: estúdio, portal do aluno e rotas HTTP) e **worker** (jobs em segundo plano). Um PostgreSQL guarda os dados e os documentos JSONB versionados.

```mermaid
flowchart LR
  autor[Autor no Estúdio] -->|PUT draft + expectedRevision| rasc[(course_drafts)]
  rasc -->|compileCourse| ver[(course_versions<br/>snapshot imutável)]
  ver -->|fixada na matrícula| player[Player do aluno]
  player -->|intenção| motor[course-engine<br/>applyIntent]
  motor --> db[(PostgreSQL)]
  rasc -->|media_job.queued| outbox[(outbox_events)]
  outbox --> worker[apps/worker]
  worker --> prov[HeyGen / ElevenLabs]
  worker --> storage[(Storage de mídia)]
  worker -->|anexa mídia| rasc
  ext[Sistema externo] -->|API v1| web[apps/web]
  worker -->|webhooks assinados| ext
```

## Ideias centrais

- Editor e player usam o mesmo contrato: `@lms/course-schema`. Veja [[Monorepo e pacotes]].
- O motor é uma função pura. O servidor é a autoridade e grava estado e evento na mesma transação.
- Publicar é explícito e cria um snapshot imutável. Aluno em andamento fica na versão fixada.
- Prévia e portal rodam o mesmo motor e o mesmo componente `LessonPlayer`.
- O agente de IA só propõe. Quem aplica é o backend, com validação e nova revisão.
- Nenhum provedor pago roda sem `ALLOW_PAID_PROVIDERS`. Veja [[Geração de mídia, orçamento e teto diário]].

## Concorrência

- Rascunho: `course_drafts.revision` com `expectedRevision`. Conflito devolve 409.
- Tentativa do aluno: `SELECT ... FOR UPDATE` e evento idempotente por `(attempt_id, event_id)`.
- Outbox: gravado na mesma transação, com tentativas limitadas. Nenhuma transação fica aberta durante chamada externa.

## Para onde ir

[[Banco e migrações]] · [[Worker e fila]] · [[Portal do aluno e Estúdio]] · [[Segurança, acesso e login]] · [[Implantação]]
