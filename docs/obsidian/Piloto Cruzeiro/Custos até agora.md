---
tags: [piloto, custo]
atualizado: 2026-11-13
fonte:
  - docs/planos/orcamento-leva1.md
  - docs/gasto-seguro-e-orcamento.md
---

# Custos até agora

Valores em dólar. Preços do repo são estimativas; a fatura dos provedores é a referência.

## Orçamento da leva 1 (primeira passada, a seco)

Gerado por `apps/web/src/scripts/orcamento-cursos.ts`. Fonte: `docs/planos/orcamento-leva1.md`.

| Curso | Avatar | Tela (só voz) | Total |
|---|---:|---:|---:|
| C1 | 47,18 | 3,60 | 50,78 |
| C2 | 54,54 | 1,65 | 56,19 |
| C3 | 39,39 | 1,16 | 40,55 |
| C4 | 42,59 | 0,83 | 43,42 |
| C5 | 42,98 | 0,82 | 43,80 |
| **Total** | 226,69 | 8,05 | **234,74** |

- HeyGen 181,78 e ElevenLabs 52,96.
- O total passa do teto diário de US$ 200. Ver [[2026-11-13 Teto diário e geração em lotes]].

## Situação do C1 (informado em 2026-11-13)

> [!info] Fora dos docs
> Os números abaixo foram informados na sessão e ainda não estão nos docs do repo.

| Item | Valor |
|---|---|
| Gasto até agora | cerca de US$ 60 (inclui testes e lotes descartados) |
| Falta para terminar | cerca de US$ 40 a 42 |
| Total previsto do C1 | cerca de US$ 105 a 110 |
| Teto diário de mídia do workspace | US$ 200 |

O total previsto do C1 fica acima dos US$ 50,78 do orçamento da leva 1 porque inclui módulo 1 refeito várias vezes, testes e lotes descartados.

## Como calcular de novo

Rode o `gerar-curso.ts` a seco. Ver [[Geração de mídia, orçamento e teto diário]].

> [!warning] A confirmar
> O gasto real de C2 a C5 depende de refazer tomadas. Se o C1 custar mais que o dobro do orçamento, reavalie a estimativa dos demais antes de gerar.
