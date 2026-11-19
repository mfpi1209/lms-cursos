---
tags: [decisão, produção, avatar]
atualizado: 2026-11-13
fonte:
  - packages/course-schema/src/course.ts
  - apps/worker/src/scripts/regerar-cameras-instrutor.ts
---

# Avatar com mãos paradas

**Data:** 2026-11-13. **Status:** decidida.

## Contexto

O HeyGen inventava relógio ou pulseira no apresentador quando ele gesticulava.

## Decisão

- Usar HeyGen Avatar IV com expressividade baixa.
- Ligar "mãos paradas" por curso: `presentation.avatarEngine` e `presentation.handsStill`. Gestos só de rosto e tronco.
- Refazer as imagens-base do Thiago com os pulsos nus visíveis. Câmeras `cam_thiago8v2_*` e `cam_thiago8v3_esq`.

## Consequência

- O roteiro não deve pedir gestos de mão.
- Menos tomadas refeitas. O que sobrar passa pelo [[Conferência de qualidade]].
- Refazer câmeras custa cerca de US$ 1 por imagem. Ver [[Kits, estúdios e instrutores]].

Relacionado: [[2026-11-13 Câmera de lado retirada]], [[Direção e câmeras]].
