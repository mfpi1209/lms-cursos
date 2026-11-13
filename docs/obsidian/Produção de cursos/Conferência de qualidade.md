---
tags: [produção, qualidade, conferência]
atualizado: 2026-11-13
fonte:
  - apps/worker/src/scripts/painel-pulsos.ts
  - apps/web/src/scripts/refazer-tomadas.ts
  - apps/worker/src/scripts/regerar-cameras-instrutor.ts
---

# Conferência de qualidade

Depois da geração, confira o vídeo antes de publicar. O problema conhecido é o apresentador ganhar relógio ou pulseira.

## Painel de pulsos

Script: `apps/worker/src/scripts/painel-pulsos.ts`.

```bash
./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/painel-pulsos.ts \
  --course crs_xxx [--cenas v01,v02,q01~a] --out ./painel-c1
```

- Divide cada cena de apresentador em tomadas.
- De cada tomada tira 2 recortes (a 40% e a 75% do tempo) na região das mãos e pulsos.
- Gera `painel.png` (paginado em 24 linhas), `index.html` e `tomadas.txt`.
- Só lê o banco e o storage e roda ffmpeg. Nenhum provedor, nenhum job, nada gravado.

## Marcar tomadas ruins

O rótulo é `aula/cena#<id do 1º plano>`, por exemplo `aula_01/v09#s3`. O `tomadas.txt` liga o número da imagem ao rótulo.

## Refazer só a tomada

```bash
tsx src/scripts/refazer-tomadas.ts --course crs_xxx --tomadas aula_01/v09#s3 --max-usd 5          # a seco
ALLOW_PAID_PROVIDERS=1 tsx src/scripts/refazer-tomadas.ts --course crs_xxx --tomadas aula_01/v09#s3 --max-usd 5 --confirmar
```

Também aceita `aula/cena#<n>` (índice da tomada, a partir de 1). Usa as mesmas guardas do `gerar-curso`. Ver [[Geração de mídia, orçamento e teto diário]].

## O que já aprendemos

- O HeyGen inventava relógio ou pulseira quando o apresentador gesticulava. Ver [[2026-11-13 Avatar com mãos paradas]].
- Na câmera de lado, o pulso de trás inventava acessório em cerca de 60% das tomadas. Ver [[2026-11-13 Câmera de lado retirada]].
- As câmeras de frente saíram limpas.

## Outras conferências

- Mídia de tela: estados "falta mídia", "mídia curta" e "mídia cortada". Ver [[Telas simuladas]].
- Robô aluno nos cursos publicados. Ver [[Testes e robô aluno]].
