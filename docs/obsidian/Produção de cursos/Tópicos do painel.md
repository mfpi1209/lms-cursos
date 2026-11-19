---
tags: [produção, painel, tópicos]
atualizado: 2026-11-13
fonte:
  - packages/db/src/scripts/aplicar-topicos.ts
  - packages/course-schema/src/import/markdown-course.ts
  - docs/roteiros/telas/c1-ia-na-pratica.topicos.md
  - docs/direcao-cinematografica.md
---

# Tópicos do painel

Na cena dirigida, o apresentador ocupa um lado do quadro. O **lado vazio** recebe um painel: o "Texto na tela" vira o título e os **tópicos** entram no ritmo da fala.

## Arquivo `.topicos.md`

Local: `docs/roteiros/telas/<roteiro>.topicos.md`.

```
# Tópicos do painel — C1 IA na prática

## V01
- Oito horas de curso (na fala: "Em oito horas")
- Assistente de estudos próprio (na fala: "assistente de estudos montado")
```

- Cada `## V07` é o código da cena de vídeo. O id do nó é o código em minúsculas (`v07`).
- Cada `- tópico` pode ter `(na fala: "trecho")` para marcar quando entra.
- O CLI de importação carrega o arquivo sozinho. `--topicos` troca e `--sem-topicos` desliga.

## Aplicar sem reimportar

```bash
./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/aplicar-topicos.ts \
  --course crs_... --file docs/roteiros/telas/c1-ia-na-pratica.topicos.md [--seco]
```

Grava `topics` nos nós, em nova revisão, só se algo mudou. O clipe do HeyGen continua o mesmo; só a montagem muda. Custo zero.

## Avisos

`SCENE_TOPICS_INVALID`, `SCENE_TOPICS_UNUSED` (código sem cena de vídeo) e `SCENE_TOPICS_IGNORED` (cena com gravação de tela não usa painel).

## Visual do painel

> [!warning] Em andamento
> O visual do painel está sendo redesenhado. Há 3 estilos animados em teste. Nada foi escolhido ainda. Ver [[2026-11-13 Painel com tópicos no ritmo da fala]].

O formato anterior (pílulas de vidro marinho e "pergunta a seguir") está descrito em `docs/direcao-cinematografica.md`. Ver [[Direção e câmeras]].

Relacionado: [[Telas simuladas]].
