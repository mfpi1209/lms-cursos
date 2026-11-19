---
tags: [produção, prévia, montagem]
atualizado: 2026-11-13
fonte:
  - apps/worker/src/scripts/gerar-telas-previa.ts
  - docs/architecture.md
  - docs/direcao-cinematografica.md
  - docs/planos/piloto-resumo.md
---

# Prévias e montagem do módulo

## Prévias sem custo

| O que | Como |
|---|---|
| Telas simuladas | `gerar-telas-previa.ts --todos --out <pasta>`. Gera MP4, PNG e `index.html`. Sem banco nem rede. Ver [[Telas simuladas]]. |
| Prévia da aula no estúdio | Mesmo motor e player do portal, sem gravar (`/api/preview/step`). Ver [[Portal do aluno e Estúdio]]. |
| Tópicos no painel | `aplicar-topicos.ts` muda só a montagem. O clipe do HeyGen continua o mesmo. Ver [[Tópicos do painel]]. |
| Modo de demonstração | Sem `ALLOW_PAID_PROVIDERS`, o job termina com um vídeo substituto marcado como simulado. |

## Montagem

O worker monta a cena com ffmpeg sobre os clipes do HeyGen:

- Narração sintetizada uma vez e cortada por plano.
- Legenda WebVTT em todo anexo.
- Marca d'água e vinheta de assinatura.
- Cena de tela: gravações em sequência, 1920x1080, 30 fps, borda preta e sem o áudio original.

Código: `apps/worker/src/compose-*.ts` e `packages/media/src/compose/`.

## Módulo

O módulo é montado cena a cena. No C1, o módulo 1 foi refeito várias vezes durante os testes. Ver [[Cursos C1 a C5]].

> [!warning] A confirmar
> Não há, nos docs do repo, um passo único de "montar o módulo". A prática vem da sessão de 2026-11-13: gerar o módulo 1 inteiro com `--cenas` e conferir pelo [[Conferência de qualidade]]. Confirmar se isso deve virar procedimento fixo.
