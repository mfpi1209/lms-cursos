---
tags: [arquitetura, banco]
atualizado: 2026-11-13
fonte:
  - packages/db/src/schema/
  - packages/db/migrations/
  - docs/decisions.md
  - docs/architecture.md
---

# Banco e migrações

PostgreSQL 17 com Drizzle. Esquema em `packages/db/src/schema/`, migrações SQL em `packages/db/migrations/`, repositórios em `packages/db/src/repositories/`.

## Tabelas principais

| Grupo | Tabelas |
|---|---|
| Identidade | `user`, `account`, `session`, `verification`, `workspaces`, `workspace_memberships` |
| Autoria | `courses`, `course_drafts`, `draft_revisions`, `course_versions` |
| Aprendizagem | `enrollments`, `lesson_attempts`, `learner_events`, `objective_evidence`, `lesson_quality` |
| Missões e tarefas | `mission_responses`, `mission_response_events`, `task_submissions`, `task_submission_events` |
| Trilhas | `trail_badges`, `trail_check_attempts` |
| Mídia | `media_jobs`, `media_quotes`, `assets`, `library_templates` |
| IA | `agent_runs`, `agent_proposals`, `source_documents`, `source_chunks` |
| Integração | `integration_tokens`, `webhook_endpoints`, `webhook_deliveries` |
| Operação | `outbox_events`, `audit_logs`, `access_logs` |

> [!note]
> Módulos e aulas ficam dentro do JSONB do rascunho (`course_drafts.document`). Veja [[Decisões técnicas anteriores]].

## Migrações recentes

| Migração | O que faz |
|---|---|
| `0010_spend_quotes` | `media_quotes` e colunas de aprovação nos jobs; `workspaces.spend_limits`. Base de [[Geração de mídia, orçamento e teto diário]]. |
| `0012_library_templates` | Biblioteca de modelos (kits). Ver [[Kits, estúdios e instrutores]]. |
| `0018_mission_responses` | Respostas das missões. |
| `0019_privacidade_acesso_titular` | Privacidade e acesso do titular. |
| `0020_entregas` | `task_submissions` e `task_submission_events` (tarefa com entrega e correção). |
| `0021_alunos_academico_e_tokens` | `integration_tokens`; colunas `rgm` e `phone` em `workspace_memberships`; RGM único por workspace. |
| `0022_webhooks` | `webhook_endpoints` e `webhook_deliveries`. |

As migrações recentes só acrescentam. Rodar: `pnpm db:migrate`. Ver [[Implantação]].

> [!warning] A confirmar
> O conteúdo das migrações 0013 a 0017 (trilha, pôster, selos, aulas opcionais) vem só dos nomes dos arquivos. Confirmar antes de citar. Os nomes de 0018 e 0019 também vêm só do arquivo.
