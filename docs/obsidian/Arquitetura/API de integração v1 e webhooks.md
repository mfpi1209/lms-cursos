---
tags: [arquitetura, api, integração]
atualizado: 2026-11-13
fonte:
  - docs/integracao/api-v1.md
  - docs/planos/piloto-resumo.md
  - packages/db/migrations/0021_alunos_academico_e_tokens.sql
  - packages/db/migrations/0022_webhooks.sql
---

# API de integração v1 e webhooks

Serve para o sistema da instituição (no piloto, o sistema DNA) cadastrar alunos, ler progresso e receber avisos. Base: `/api/integracao/v1`. Texto completo: `docs/integracao/api-v1.md`.

## Autenticação

- Token criado em Configurações › Integrações › Tokens (só administração). Aparece uma vez.
- Cabeçalho `Authorization: Bearer <token>`. Nunca guarde token em nota, log ou código.
- Escopos: `students:write`, `progress:read`, `webhooks:manage`.
- Limites: 120 chamadas por minuto por token; 30 falhas de autenticação por minuto por IP. Os contadores ficam na memória (uma réplica).

## Rotas

| Rota | Escopo | O que faz |
|---|---|---|
| `GET /cursos` | `students:write` | Lista cursos publicados (slug e título). |
| `POST /alunos` | `students:write` | Cadastro idempotente pelo RGM. Até 500 por chamada. |
| `GET /progresso` | `progress:read` | Uma linha por matrícula, com paginação por cursor e filtro `desde`. |
| `GET/POST/DELETE /webhooks` | `webhooks:manage` | Gerencia endereços de webhook. |

## Cadastro pelo RGM

- O RGM é obrigatório (`RGM_EM_BRANCO` se faltar), único no workspace e chave da linha.
- Repetir o lote dá `sem_mudanca`. Uma linha ruim não derruba as outras.
- Troca de e-mail só por RGM conhecido. O sistema audita (`student.email_changed`) e encerra as sessões da pessoa.
- A conta nasce sem senha. Com `gerarLink: true`, a resposta traz o link de acesso. Entregue só à pessoa certa.

## Progresso

Cada linha traz matrícula, aluno, curso, datas de acesso, aulas concluídas, `avaliacoes`, `reflexoes` (respostas das missões), `tarefa` e `curso_concluido`. `certificado_codigo` é sempre `null` por enquanto: certificado está adiado. Ver [[2026-11-13 Política, termos e certificado adiados]].

## Webhooks

- Eventos: `enrollment.created`, `lesson.completed`, `course.completed`, `task.submitted`, `task.reviewed`. `certificate.issued` está reservado e nada o produz.
- Assinatura `X-DNA-Signature` = HMAC-SHA256 de `"<timestamp>.<corpo>"`. Rejeite carimbo com mais de 5 minutos.
- Sucesso é 2xx em até 10 s. Até 8 tentativas, de 1 minuto a 12 horas. Redirecionamento não é seguido.
- O `id` do evento é a chave de deduplicação do receptor.
- O envio é feito pelo worker. Ver [[Worker e fila]].

> [!tip] Piloto
> No piloto, a Cruzeiro do Sul divulga o link no app dela. O cadastro chega pelo sistema DNA por esta API. Ver [[Visão do piloto]].
