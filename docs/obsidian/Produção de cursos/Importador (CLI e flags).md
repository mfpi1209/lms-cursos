---
tags: [produção, importador, cli]
atualizado: 2026-11-13
fonte:
  - packages/db/src/scripts/import-markdown-course.ts
  - packages/db/src/scripts/aplicar-topicos.ts
  - docs/biblioteca-de-modelos.md
---

# Importador (CLI e flags)

Script: `packages/db/src/scripts/import-markdown-course.ts`. Cria ou atualiza um **rascunho** a partir do roteiro. Não usa IA e não chama provedor.

## Uso

```bash
set -a; . ./.env; set +a
./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/import-markdown-course.ts \
  --file docs/roteiros/c1-ia-na-pratica.md --kit estudio8-thiago [--dry-run]
```

## Idempotência

- O título é a chave. Curso existente no workspace com o mesmo título é atualizado com `saveDraft` (nova revisão, origem `script`).
- Documento idêntico ao rascunho atual não grava nada.
- Curso novo nasce vazio e o roteiro entra como revisão 2.

## Flags principais

| Flag | Efeito |
|---|---|
| `--file` | Roteiro em Markdown. |
| `--title` | Troca o título. |
| `--dry-run` | Só mostra o relatório. |
| `--kit <chave>` | Monta estúdio, instrutor, voz, marca e direção a partir de um kit. Ver [[Kits, estúdios e instrutores]]. Não combina com `--cameras`, `--zone-cameras` e `--source-course`. |
| `--workspace` | Escolhe o workspace (padrão: o único que existir). |
| `--telas <arquivo>` / `--sem-telas` | Troca ou desliga o arquivo `.telas.md`. Ver [[Telas simuladas]]. |
| `--topicos <arquivo>` / `--sem-topicos` | Troca ou desliga o arquivo `.topicos.md`. Ver [[Tópicos do painel]]. |
| `--no-direction` | Não gera direção de câmera. |
| `--cameras`, `--zone-cameras`, `--source-course` | Caminho antigo, sem kit. |
| `--voice`, `--voice-name`, `--avatar-name`, `--presenter`, `--presenter-role`, `--presenter-pronoun` | Ajustes do apresentador. |
| `--wordmark`, `--subtitle`, `--tagline`, `--closing-line`, `--watermark` | Marca. |
| `--publish`, `--enroll-demo` | Publicar e matricular para demonstração. |

## Arquivos ao lado do roteiro

O CLI procura sozinho, na pasta `telas/` irmã do roteiro:

- `<nome>.telas.md`
- `<nome>.topicos.md`

## Aplicar tópicos sem reimportar

`packages/db/src/scripts/aplicar-topicos.ts --course crs_... --file ...topicos.md [--seco]`. Grava `topics` nas cenas e só muda se houver diferença. Nada é gerado nem pago. Ver [[Tópicos do painel]].

> [!warning] Cuidado
> `--publish` publica o curso. Use só com decisão do dono.

Próximo: [[Geração de mídia, orçamento e teto diário]].
