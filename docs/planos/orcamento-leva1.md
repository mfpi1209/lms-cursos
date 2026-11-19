# Orçamento de geração (avatar + voz) — leva 1 (5 cursos rascunho)

Gerado por `apps/web/src/scripts/orcamento-cursos.ts` (só leitura; nenhum provedor chamado, nenhum job/cotação criado).

```
cd apps/web
../../node_modules/.pnpm/node_modules/.bin/tsx --env-file=<raiz>/.env src/scripts/orcamento-cursos.ts crs_g3vzc9kcvbkt284c crs_jjixvm66gvte13uh crs_jkfzh199gekcu2hy crs_k56estb8rf34g6s2 crs_j1pnhyikua4s5yiy
# opcional: BRL_PER_USD=5.5 para ver em R$
```

## Resultado

| Curso | Avatar cenas | Avatar min | Avatar US$ | Tela cenas | Tela min | Tela US$ | Reações (cenas / US$) | Reaproveitadas | Total US$ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C1 crs_g3vzc9kcvbkt284c — IA na prática para estudar e trabalhar | 86 | 37.88 | 47.18 | 25 | 14.53 | 3.60 | 15 / 1.15 | 0 | 50.78 |
| C2 crs_jjixvm66gvte13uh — LinkedIn e currículo com IA | 110 | 43.63 | 54.54 | 14 | 6.47 | 1.65 | 24 / 1.92 | 0 | 56.19 |
| C3 crs_jkfzh199gekcu2hy — Produtividade e foco | 77 | 31.63 | 39.39 | 9 | 4.80 | 1.16 | 15 / 1.25 | 0 | 40.55 |
| C4 crs_k56estb8rf34g6s2 — Dinheiro no controle | 85 | 34.18 | 42.59 | 7 | 3.47 | 0.83 | 15 / 1.41 | 0 | 43.42 |
| C5 crs_j1pnhyikua4s5yiy — Segurança digital | 84 | 34.45 | 42.98 | 7 | 3.17 | 0.82 | 18 / 1.73 | 0 | 43.80 |
| **Total** | 442 | 181.78 | 226.69 | 62 | 32.43 | 8.05 | 87 / 7.46 | 0 | **234.74** |

- "Avatar US$" inclui a voz ElevenLabs das cenas de avatar; "Tela US$" é só voz (a tela simulada é grátis). As reações da instrutora já estão contadas dentro de Avatar (coluna informativa).
- Decomposição por provedor (US$): HeyGen 181.78 + ElevenLabs 52.96 = 234.74. Por curso (HeyGen + voz): C1 37.88 + 12.90; C2 43.63 + 12.55; C3 31.63 + 8.92; C4 34.18 + 9.24; C5 34.45 + 9.35.
- Nenhuma cena reaproveita vídeo já pago (todas as 504 cenas elegíveis são novas); não houve erro de resolução em nenhuma cena.
- Em R$: o pricing não tem conversão cambial; use `BRL_PER_USD` no script se quiser (ex.: 5,5 daria cerca de R$ 1.291).

## Teto de gasto

Workspace `wsp_eogwtp01f358wyof`: `spend_limits.mediaDailyUsd = 200` (teto diário, janela deslizante de 24 h, imposto no lote por `mediaBudgetCheck`). Comprometido nas últimas 24 h: US$ 0,00. Total desta leva: US$ 234,74 > US$ 200 → **não cabe de uma vez**; precisa ser dividido em dois lotes com 24 h de intervalo (ex.: C1+C2+C3 = US$ 147,52 num dia; C4+C5 = US$ 87,22 no seguinte), ou o limite do workspace deve ser elevado. Cada curso isolado cabe.

## Premissas

- Preços (`packages/media/src/pricing.ts`, padrões, `MEDIA_PRICES_JSON` não definido): ElevenLabs US$ 0,30 por 1.000 caracteres; HeyGen US$ 1/60 por segundo (US$ 1,00/min de avatar); cena em movimento US$ 0,12/s (nenhuma cena em movimento usada). São estimativas ("aproximações de 2026-10"); a fatura dos provedores é a referência.
- Duração: `estimateNarrationSeconds` = palavras / 150 por minuto (mínimo 1 s) sobre o roteiro falado (narração ou fala da cena; com direção, soma das falas dos planos). Caracteres = tamanho do roteiro.
- A voz é ElevenLabs em todos os cursos (custo de voz = caracteres × preço); por isso o avatar custa em média ~US$ 1,25/min.
- Cenas de tela (gravação de tela própria) cobram só voz; reações da instrutora (`decisão~opção`) são cenas de plano único de avatar.
- Elegíveis = todas as cenas com fala sem vídeo ou com vídeo desatualizado (mesmo critério da rota com `includeStale=true`).

## Diferenças em relação à rota de orçamento do estúdio

- O script reutiliza `resolveSceneProduction`, `sceneRequestFromPresentation`, `recomposeAlphaKey`, `directedPartialReuse`, `findSucceededJobsByHashes`/`findRecomposeSourcesByAlphaKeys` e `mediaBudgetCheck` diretamente (mesma lógica), mas não cria cotação (`createQuote`), não autentica viewer (o workspace vem do curso) e não valida o asset de imagem de fundo.
- O ambiente local roda em modo demo (`ALLOW_PAID_PROVIDERS` não definido, simulação ligada): a consulta de reaproveitamento usa `simulated=true` + jobs reais, como a rota; a rota em modo demo também não aplica o teto (`budget: null`), enquanto o script sempre calcula a checagem do teto, como ocorreria em produção real. O custo por cena não depende do modo.
- O teto é avaliado sobre o total das 5 cursos de uma vez (a rota o avalia por cotação/lote).
