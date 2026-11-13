---
tags: [decisão, custo]
atualizado: 2026-11-13
fonte:
  - docs/planos/orcamento-leva1.md
  - docs/gasto-seguro-e-orcamento.md
---

# Teto diário e geração em lotes

**Data:** 2026-11-13. **Status:** em uso.

## Contexto

O orçamento da leva 1 (5 cursos) deu US$ 234,74 só para a primeira passada, acima do teto diário de US$ 200 do workspace.

## Decisão

- Manter o teto diário de mídia do workspace em US$ 200 (`spend_limits.mediaDailyUsd`).
- Gerar por curso e em lotes. Cada curso isolado cabe no teto.
- Dividir a leva em dias diferentes. O doc sugere C1 a C3 em um dia (US$ 147,52) e C4 e C5 no seguinte (US$ 87,22).

## Consequência

- Um lote que passa do teto recebe 402 `BUDGET_EXCEEDED`.
- Refazer tomadas e testes também contam na janela de 24 h.
- Ver [[Geração de mídia, orçamento e teto diário]] e [[Custos até agora]].
