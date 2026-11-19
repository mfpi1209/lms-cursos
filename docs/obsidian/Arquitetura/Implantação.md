---
tags: [arquitetura, deploy]
atualizado: 2026-11-13
fonte:
  - deploy/easypanel.md
  - Dockerfile.web
  - Dockerfile.worker
  - docker-compose.yml
  - .env.example
---

# Implantação

Guia completo: `deploy/easypanel.md`. Aqui está o resumo, sem segredos.

## Serviços

| Serviço | Dockerfile | Observações |
|---|---|---|
| web | `Dockerfile.web` | Porta 3000. Health check `GET /api/health`. Inclui ffmpeg para miniaturas. |
| worker | `Dockerfile.worker` | Sem porta pública. 1 réplica. Roda o outbox e os webhooks. |
| PostgreSQL 17 | serviço de dados | Externo ao container. |
| Redis 7 | serviço de dados | O fluxo principal não depende dele. |
| Storage | disco do servidor ou S3 | `STORAGE_PROVIDER` = `local` ou `s3`. |

## Variáveis (só os nomes)

- Banco e app: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `TRUSTED_PROXIES`, `CLIENT_IP_HEADERS`.
- Marca: `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_PRIMARY`.
- E-mail: `EMAIL_TRANSPORT`, `EMAIL_FROM`, `SMTP_URL`, `RESEND_API_KEY`, `MAGIC_LINK_TTL_HOURS`.
- Gasto e IA: `ALLOW_PAID_PROVIDERS`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MEDIA_DAILY_BUDGET_USD`, `AI_DAILY_BUDGET_USD`, `AI_RUN_ESTIMATE_USD`, `MEDIA_QUOTE_TTL_MIN`, `AI_PRICES_JSON`, `MEDIA_PRICES_JSON`.
- Mídia: `HEYGEN_API_KEY`, `ELEVENLABS_API_KEY`, `MEDIA_SIMULATION`, `HEYGEN_WEBHOOK_SECRET`, `HEYGEN_CALLBACK_URL`, `STORAGE_DIR`, `S3_*`, `SCREEN_RECORDING_MAX_MB`.
- Legal: `LEGAL_CONTROLLER_NAME`, `LEGAL_CONTROLLER_CNPJ`, `LEGAL_CONTROLLER_ADDRESS`, `LEGAL_CONTROLLER_CONTACT`, `LEGAL_DPO_NAME`, `LEGAL_DPO_CONTACT`, `LEGAL_PUBLISHED`.

O modelo completo está em `.env.example`. Nunca copie valores para notas.

## Migrações

Rodar antes da primeira subida e a cada deploy com migração nova: `pnpm --filter @lms/db migrate`. As migrações recentes só acrescentam. Ver [[Banco e migrações]].

## Antes de abrir para alunos

- O seed de demonstração não roda em produção real.
- Proxy precisa aceitar upload de 1 GB para gravações de tela. Cloudflare no plano gratuito corta em 100 MB.
- Política e termos só saem de rascunho com `LEGAL_PUBLISHED=1`. Ver [[2026-11-13 Política, termos e certificado adiados]].
- Confirmar hospedagem, HTTPS e backup (pendências legais).

> [!warning] A confirmar
> O disparo de deploy automático por webhook na `main` aparece só no histórico de outra linha de commits e não nesta branch. Confirmar com quem mantém o deploy. O estado real do ambiente de produção não está nos docs.
