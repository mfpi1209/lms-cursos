---
tags: [decisão, produção, telas]
atualizado: 2026-11-13
fonte:
  - docs/planos/plano-piloto-cruzeiro.md
  - docs/planos/piloto-resumo.md
---

# Narração manda no tempo da cena

**Data:** 2026-11-13 (versão 2 do plano do piloto). **Status:** decidida.

## Contexto

A gravação ou tela simulada pode ter duração diferente da fala.

## Decisão

A narração sempre manda. Com N a duração da fala e R a soma das telas:

- R menor que N, até 3 s: congela o último quadro. `fit = ok`.
- R menor que N, mais de 3 s: monta congelando e marca `fit = short` ("mídia curta").
- R maior que N: acelera só os trechos parados até 1,5x. Se não couber, corta o fim e marca `fit = trimmed` ("mídia cortada"). Corte de até 0,1 s não marca.
- Várias telas na mesma cena tocam em sequência, e a regra vale para a soma.

## Consequência

O `fit` e a duração medida ficam no rascunho. Ver [[Telas simuladas]].

> [!warning] A confirmar
> A detecção de trechos parados (`freezedetect`) foi calibrada só com vídeo sintético. Ajustar com as primeiras telas reais.
