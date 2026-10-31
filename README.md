# Construtor de cursos práticos + LMS

Ferramenta **interna** para criar, revisar, publicar e entregar cursos práticos com situações, decisões, consequências, reflexão e avaliação determinística. Monólito modular TypeScript (Next.js + PostgreSQL), com motor de execução próprio e LMS próprio.

- [docs/architecture.md](docs/architecture.md) — limites entre editor, agente, motor e LMS
- [docs/course-schema.md](docs/course-schema.md) — contrato do curso e política de versão
- [docs/implementation-status.md](docs/implementation-status.md) — pronto, parcial, simulado e futuro
- [docs/decisions.md](docs/decisions.md) — premissas reversíveis
- [deploy/easypanel.md](deploy/easypanel.md) — deploy, variáveis, health checks, backup

## Requisitos

- Node.js 22+ (testado com 26) e pnpm 12 (`npm i -g pnpm`)
- PostgreSQL 15+ local **ou** Docker (`docker compose up postgres redis`)
- Redis é opcional no incremento 1 (o worker usa polling do outbox no Postgres)

## Instalação local

```bash
pnpm install
cp .env.example .env            # ajuste DATABASE_URL e BETTER_AUTH_SECRET
createdb lms_cursos && createdb lms_cursos_test
pnpm db:migrate                 # aplica packages/db/migrations
pnpm db:seed                    # curso "Comunicação no primeiro emprego" + usuários de demonstração
pnpm dev                        # http://localhost:3000
```

Os scripts leem `DATABASE_URL` do ambiente. Para carregar o `.env` no shell: `set -a; source .env; set +a`.

### Credenciais de desenvolvimento (apenas seed local; senha `senha-dev-123`)

| Papel | E-mail |
|---|---|
| admin | admin@demo.local |
| author | autor@demo.local |
| reviewer | revisor@demo.local |
| student | aluno@demo.local (já matriculado no curso seed) |
| student | aluna@demo.local |

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Next.js em modo dev (estúdio em `/estudio`, LMS em `/aprender`) |
| `pnpm dev:worker` | worker (outbox, jobs de mídia, agente, fontes). Rode **um** worker por vez; para encerrar todas as instâncias (o `tsx` cria um processo-filho): `pnpm --filter @lms/worker stop` |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm test` | Vitest: contratos, compilador, motor e **integração com banco** (`TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright: criar → publicar → cursar → retomar (precisa do dev server ou sobe um) |
| `pnpm db:generate` | gera migration SQL a partir do schema Drizzle |
| `pnpm db:migrate` / `pnpm db:seed` | aplica migrations / seed idempotente |
| `pnpm build` | build de produção (Next standalone) |

## Estrutura

```
apps/web                 estúdio, LMS e Route Handlers (/api)
apps/worker              consumidor do outbox (polling)
packages/course-schema   contratos Zod, DSL, compilador de publicação, curso seed
packages/course-engine   motor determinístico (transições, avaliação, progresso)
packages/db              Drizzle schema, migrations, repositórios, seed
packages/ai              contrato de adapter LLM + fake (sem provedor real ainda)
packages/media           contratos de voz/vídeo/storage (sem integração ainda)
docs                     arquitetura, contratos, decisões, estado
deploy                   guia EasyPanel
```

## Fluxo do incremento 1

1. Equipe faz login → `/estudio` lista cursos; cria ou abre um curso.
2. Visão geral: briefing, objetivos, módulos e aulas. Cada aula tem um editor de blocos sincronizado com o mapa (React Flow). Autosave com revisão e detecção de conflito; desfazer e restaurar revisões.
3. Prévia da aula usa o mesmo player e o mesmo motor do LMS, sem persistir.
4. Revisão e publicação: validação estrutural (erros bloqueiam, avisos são revisáveis) e publicação de snapshot imutável.
5. Administrador matricula alunos; a matrícula fixa a versão.
6. Aluno faz login → `/aprender`, começa/retoma a aula; o servidor valida cada intenção, grava estado + evento na mesma transação, reenvios com o mesmo `eventId` são idempotentes.
7. Relatório por matrícula: progresso, caminho percorrido, respostas e resultado por objetivo.

## Testes

```bash
pnpm test                                        # unit + integração (usa lms_cursos_test)
pnpm --filter @lms/web exec playwright install chromium
pnpm test:e2e                                    # e2e contra http://localhost:3000
```

Os testes de integração recriam o schema do banco de teste a cada execução.

## Assistente de montagem (wizard) e agente de construção

O estúdio começa por um assistente em seis passos: **Tema e público → Conteúdo → Estrutura → Apresentação → Aulas → Revisão e publicação**. O autor cola texto ou envia PDF/TXT/MD (fontes rastreáveis, PDF digitalizado é sinalizado como "precisa de OCR"), escolhe apresentador, voz e ambiente, e pode pedir ao agente que **proponha a estrutura** e **escreva as aulas** (cenas, decisões plausíveis, consequências, reflexão e verificação). Toda proposta é validada pelo compilador, exibida com justificativa e só entra no rascunho quando o autor aplica (individualmente ou em lote); conflitos com edições concorrentes são detectados por `baseRevision`.

Cada aula abre em um **storyboard** (cenas em sequência, edição inline, mídia por cena); o editor técnico continua disponível em "Modo avançado".

```bash
# .env — provedor de IA (Anthropic primeiro; OpenAI como segundo com fallback opcional)
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-5-5
OPENAI_API_KEY=...            # opcional
OPENAI_MODEL=...              # obrigatório se usar OpenAI (não assumimos identificadores de modelo)
AI_FALLBACK_PROVIDER=openai   # opcional
AI_PROVIDER=fake              # modo de demonstração sem chaves (propostas-modelo genéricas)
```

Execuções do agente ficam em `agent_runs` (provedor, modelo efetivo, versão das instruções, latência, tokens, custo quando conhecido, fallback) e as propostas em `agent_proposals`. O worker precisa estar rodando.

## Vídeo por cena (HeyGen + ElevenLabs)

Cenas (`scenario`, `content`, `consequence`, `choice`) aceitam mídia: upload de arquivo existente ou geração de vídeo com avatar a partir do roteiro da cena. A geração é uma ação explícita e paga no editor; o resultado é baixado para o nosso storage e anexado ao bloco. Sem `HEYGEN_API_KEY` o sistema roda em **modo simulado** (identificado na interface, sem vídeo real).

```bash
# .env
HEYGEN_API_KEY=...            # API v3
ELEVENLABS_API_KEY=...        # opcional: voz ElevenLabs enviada ao HeyGen como áudio
HEYGEN_CALLBACK_URL=https://seu-dominio/api/webhooks/heygen
HEYGEN_WEBHOOK_SECRET=...     # obtido com: pnpm --filter @lms/worker heygen:register-webhook
```

O worker precisa estar rodando (`pnpm dev:worker`) para processar jobs e reconciliar o estado remoto.

## Testes (resumo atual)

| Pacote | O que cobre |
|---|---|
| `course-schema` (12) | contrato, compilador, curso seed |
| `course-engine` (9) | transições, retries, condições, progresso |
| `db` (11, Postgres real) | idempotência, concorrência, versão fixada, publicação |
| `ai` (8) | roteiro→grafo, reparo, fallback, modo demo |
| `media` (10) | HeyGen v3, ElevenLabs, webhook, hash de cena |
| `worker` (3, Postgres real) | fontes PDF/OCR, propostas e conflitos |
| Playwright (11) | aluno (desktop+mobile), estúdio, storyboard, mídia, wizard completo |

Para os e2e: dev server + worker rodando (`AI_PROVIDER=fake` no worker para o wizard em modo demo).
