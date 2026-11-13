---
tags: [produção, direção, câmeras]
atualizado: 2026-11-13
fonte:
  - docs/direcao-cinematografica.md
  - docs/decisions.md
  - apps/web/src/scripts/refazer-tomadas.ts
  - apps/worker/src/scripts/painel-pulsos.ts
  - packages/course-schema/src/course.ts
---

# Direção e câmeras

## Regra atual (2026-11-13)

1. **Um lado por cena.** Cada cena dirigida é uma tomada contínua numa câmera frontal (esquerda ou direita). O lado alterna de cena para cena. Nunca troca de lado no meio da fala. Ver [[2026-11-13 Um lado por cena]].
2. **Sem câmera de lado (3/4).** Foi retirada. Ver [[2026-11-13 Câmera de lado retirada]].
3. **Mãos paradas.** Gestos só de rosto e tronco, por curso. Ver [[2026-11-13 Avatar com mãos paradas]].
4. **Avatar principal** do kit é a frontal da esquerda.
5. **Lado vazio** mostra o painel com tópicos. Ver [[Tópicos do painel]].

> [!warning] Documento antigo
> `docs/direcao-cinematografica.md` ainda descreve câmera 3/4 e troca de câmera entre planos. A regra acima vale no lugar dele.

## Como funciona a direção

- A cena tem planos (`SceneDirection`). Uma **tomada** é um grupo de planos seguidos na mesma câmera: um pedido ao HeyGen (`continuousTakeGroups`).
- A direção é montada por nós com ffmpeg sobre os clipes do HeyGen. Ver [[Decisões técnicas anteriores]].
- Câmeras têm `zone` (`left`, `right`, `center`) e `placement` (`full_frame` para o visual no cenário).
- A narração é sintetizada uma vez, com timestamps, e cortada por plano.

## Configuração do avatar por curso

Em `presentation` do curso:

- `avatarEngine`: `avatar_iii` ou `avatar_iv`. O piloto usa HeyGen Avatar IV com expressividade baixa.
- `handsStill`: `true` mantém as mãos paradas.

Câmera não frontal mantém as mãos juntas. `avatar_iii` não faz gesto.

## Cartões e legendas

Cartões de marca em tela cheia, legendas sempre ligadas e limites de texto (título até 8 palavras, 2 a 3 tópicos) seguem em `docs/direcao-cinematografica.md`.

## Ferramentas

- `refazer-tomadas.ts` refaz só uma tomada. Ver [[Conferência de qualidade]].
- `regerar-cameras-instrutor.ts` refaz câmeras com pulsos no quadro. Ver [[Kits, estúdios e instrutores]].
