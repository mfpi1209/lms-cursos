---
tags: [arquitetura, código]
atualizado: 2026-11-13
fonte:
  - package.json
  - docs/architecture.md
  - apps/web/package.json
  - apps/worker/package.json
---

# Monorepo e pacotes

Monorepo pnpm (Node 22 ou mais). Raiz: `package.json`.

| Pacote | Caminho | Papel |
|---|---|---|
| `@lms/web` | `apps/web` | Estúdio, portal do aluno e rotas HTTP (Next.js App Router). Também guarda scripts de CLI em `apps/web/src/scripts/`. |
| `@lms/worker` | `apps/worker` | Consome o outbox, gera mídia, monta vídeos e envia webhooks. Scripts em `apps/worker/src/scripts/`. |
| `@lms/course-schema` | `packages/course-schema` | Contrato do curso (Zod), compilador de publicação, importador de roteiro, telas simuladas, direção. |
| `@lms/course-engine` | `packages/course-engine` | Motor determinístico: transições, avaliação, progresso. |
| `@lms/db` | `packages/db` | Schema Drizzle, migrações SQL, repositórios, seed e scripts. |
| `@lms/media` | `packages/media` | Voz, vídeo, storage, preços e montagem (ffmpeg). |
| `@lms/ai` | `packages/ai` | Adaptadores de LLM (Anthropic, OpenAI, fake), preços e prompts. |
| `@lms/email` | `packages/email` | Envio de e-mail (link de acesso, recuperação de senha). |

Ferramentas fora dos pacotes: `tools/robo-aluno` (ver [[Testes e robô aluno]]) e `deploy/easypanel.md` (ver [[Implantação]]).

## Comandos da raiz

- `pnpm dev` e `pnpm dev:worker`
- `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`
- `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:generate`

> [!tip] Rodar scripts
> Os scripts de CLI usam `tsx` com o `.env` carregado no shell. Veja [[Importador (CLI e flags)]].

> [!warning] Testes de banco
> As suítes de banco precisam rodar uma de cada vez: a suíte do `db` apaga e recria o banco de teste. Fonte: `docs/planos/piloto-resumo.md`.
