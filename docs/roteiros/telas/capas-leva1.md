# Capas próprias dos 5 cursos livres (leva 1)

Os instrutores já aparecem em outros cursos e trilhas com a mesma roupa e pose; cada curso ganha uma CAPA própria:
mesmo instrutor (mesmo rosto), outra roupa e outra pose ligadas ao tema, no estúdio dele, em 16:9 (meio corpo, olhando
para a câmera, instrutor num terço e o resto da parede livre). O vídeo não muda. A capa vira `courses.poster_asset_id`;
o cartão do curso livre e o da vitrine já usam essa imagem quando existe.

| Curso | Instrutor (chave) | Roupa de hoje | Roupa da capa | Pose |
|---|---|---|---|---|
| C1 `crs_g3vzc9kcvbkt284c` IA na prática | Thiago (`instrutor-thiago`) | camisa azul-clara de manga curta | camiseta cinza-escura sob jaqueta bomber verde-oliva | postura relaxada, notebook aberto no braço, outra mão apontando de leve para ele |
| C2 `crs_jjixvm66gvte13uh` LinkedIn e currículo | Marina (`instrutor-marina`) | não conferida (sem imagem das câmeras no curso) | blazer de alfaiataria grafite sobre blusa branca | currículo impresso nas duas mãos na altura do peito, leve sorriso |
| C3 `crs_jkfzh199gekcu2hy` Produtividade e foco | Júlia (`instrutora-julia`) | camisa listrada azul-marinho | suéter de tricô creme | agenda/planner junto ao peito com um braço, caneta na outra mão |
| C4 `crs_k56estb8rf34g6s2` Dinheiro no controle | Flávia (`instrutor-flavia`) | blazer cinza sobre blusa lilás | camisa branca de botões, mangas dobradas | calculadora simples numa mão e cofrinho de cerâmica na outra, à altura da cintura |
| C5 `crs_j1pnhyikua4s5yiy` Segurança digital | Laís (`instrutor-lais`) | cardigã ameixa sobre blusa creme | cardigã verde-azulado sobre blusa cinza-clara | celular na altura do peito, tela para a câmera com um cadeado simples (sem marca), outra mão relaxada |

Roupas "de hoje" conferidas nas câmeras do curso (Marina não: confira a roupa dela antes de gerar; se já usa blazer, troque).
Lado padrão: instrutor no terço ESQUERDO (`--lado esq`), o que mantém o logo da parede à direita; use `--lado dir` se preferir.

## Comandos (a partir da raiz do monorepo)

Ensaio, sem custo e sem chamar provedor (mostra prompt, look-base, chave e custo):

```
./apps/worker/node_modules/.bin/tsx --env-file=.env apps/worker/src/scripts/capa-curso.ts \
  --course crs_g3vzc9kcvbkt284c \
  --roupa "dark grey crew-neck t-shirt under an olive casual bomber jacket" \
  --pose "relaxed stance, holding an open laptop in one arm, the other hand gesturing lightly toward it" \
  --max-usd 1 --seco --out tmp/capas-cursos
```

Gerar (PAGO, US$ 1 por imagem; exige `ALLOW_PAID_PROVIDERS=1` e `HEYGEN_API_KEY`; refazer = outro `--sufixo`):

```
ALLOW_PAID_PROVIDERS=1 ./apps/worker/node_modules/.bin/tsx --env-file=.env apps/worker/src/scripts/capa-curso.ts \
  --course crs_g3vzc9kcvbkt284c --roupa "..." --pose "..." --sufixo v1 --max-usd 1 --confirmar --out tmp/capas-cursos
```

Aplicar (sem custo; só grava `courses.poster_asset_id`):

```
./apps/worker/node_modules/.bin/tsx --env-file=.env apps/worker/src/scripts/capa-curso.ts \
  --aplicar --course crs_g3vzc9kcvbkt284c --de-arquivo tmp/capas-cursos/capa-crs_g3vzc9kcvbkt284c-v1.json
```

Textos (`--roupa`/`--pose`, em inglês, como o provedor entende melhor):

| Curso | `--roupa` | `--pose` |
|---|---|---|
| C1 | dark grey crew-neck t-shirt under an olive casual bomber jacket | relaxed stance, holding an open laptop in one arm, the other hand gesturing lightly toward it |
| C2 | tailored charcoal blazer over a white top | holding a printed resume with both hands at chest height, slight smile |
| C3 | soft cream knit sweater | holding a paper planner against her chest with one arm, a pen in the other hand |
| C4 | crisp white button-up shirt with sleeves rolled to the elbows | holding a small plain calculator in one hand and a small ceramic piggy bank in the other at waist height |
| C5 | teal cardigan over a light grey blouse | holding a smartphone at chest height, screen turned to the camera showing a plain padlock icon with no brand marks, other hand relaxed |
