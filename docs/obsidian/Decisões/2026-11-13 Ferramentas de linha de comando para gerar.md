---
tags: [decisão, produção, ferramentas]
atualizado: 2026-11-13
fonte:
  - apps/web/src/scripts/gerar-curso.ts
  - apps/web/src/scripts/refazer-tomadas.ts
  - apps/worker/src/scripts/painel-pulsos.ts
  - apps/worker/src/scripts/regerar-cameras-instrutor.ts
  - packages/db/src/scripts/aplicar-topicos.ts
  - apps/worker/src/scripts/gerar-telas-previa.ts
---

# Ferramentas de linha de comando para gerar

**Data:** 2026-11-13. **Status:** em uso.

## Contexto

Gerar um curso inteiro pelo estúdio é lento e difícil de repetir. O piloto precisa de lotes por curso e de refazer só o que falhou.

## Decisão

Ter scripts de linha de comando, todos a seco por padrão:

| Script | Para quê |
|---|---|
| `gerar-curso.ts` | Orçamento e lote de um curso, com `--cenas`. |
| `refazer-tomadas.ts` | Refazer só uma tomada. |
| `painel-pulsos.ts` | Conferir pulsos por tomada. |
| `regerar-cameras-instrutor.ts` | Refazer câmeras com pulsos no quadro. |
| `aplicar-topicos.ts` | Aplicar tópicos sem reimportar. |
| `gerar-telas-previa.ts` | Prévia local das telas simuladas. |

## Consequência

- Toda ação paga tem `--confirmar` explícito, `--max-usd` e guardas.
- Os scripts só enfileiram. O worker é quem chama os provedores.
- Ver [[Geração de mídia, orçamento e teto diário]] e [[Conferência de qualidade]].
