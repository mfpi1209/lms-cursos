---
tags: [decisão, produção, painel]
atualizado: 2026-11-13
fonte:
  - docs/roteiros/telas/c1-ia-na-pratica.topicos.md
  - packages/course-schema/src/import/markdown-course.ts
---

# Painel com tópicos no ritmo da fala

**Data:** 2026-11-13. **Status:** em andamento.

## Contexto

Com um lado por cena, o outro lado fica vazio. Era preciso ocupá-lo com algo útil.

## Decisão

No lado vazio, um painel com o "Texto na tela" como título e **tópicos** que entram no ritmo da fala. Os tópicos vêm do arquivo `.topicos.md`.

> [!warning] Em andamento
> O visual do painel está sendo redesenhado. Há 3 estilos animados em teste. A escolha ainda não foi feita.

## Consequência

- O arquivo `.topicos.md` virou parte do pacote de cada curso. Ver [[Tópicos do painel]].
- Aplicar tópicos não gasta nada. Só a montagem muda.
- O C1 já tem tópicos escritos. Os demais cursos ainda não.

> [!warning] A confirmar
> Se C2 a C5 terão `.topicos.md`. Só `c1-ia-na-pratica.topicos.md` existe no repo.
