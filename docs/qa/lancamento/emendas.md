# Emendas sem "travamento" (motor de montagem)

Reclamação: "o vídeo corta no meio e começa outro", "um rápido travamento" entre as falas.
Causa (medida): na troca de plano o clipe que sai termina com o avatar parado, de boca fechada, por décimos de segundo
depois da última palavra (mais o `tpad` que congelava o último quadro), e o que entra começa com outra pose.
Parada + salto = travamento.

## O que mudou no motor

`packages/media/src/compose/join.ts` (novo) + `compose.ts` (`composeScene`, `buildComposeCommand`). Ligado por padrão;
`joins: false` ou `COMPOSE_JOINS=0` volta à montagem antiga.

1. **Falas encostadas nas trocas.** O plano que sai termina logo depois da última palavra (≈ 0,05–0,06 s); o que entra
   começa ≈ 0,06–0,14 s antes da primeira. Pausa de áudio entre frases: 0,20 s depois de fim de frase, 0,15 s no meio de frase
   (`joinPause`). O corte cai no ponto de menor volume (`quietestIn`; `quietestPoint` saiu do `adjust.ts` para o pacote e o
   ajuste fino usa a mesma função), nos quadros de 25 qps. O fim da fala vem do SOM; o alinhamento por palavra
   (`ShotClip.words`, vindo do `words` por item que o worker guarda) confere: o fim da última palavra do ElevenLabs costuma passar
   ~0,25 s do som, então ele nunca estende o plano, mas som muito depois da última palavra vira ruído e não conta.
   Só as bordas do CLIPE são apertadas (planos no meio de um clipe compartilhado ficam como estão). Começo/fim da cena mantêm
   respiro (0,12 s / 0,25 s).
2. **Sem quadro congelado.** O `tpad` do apresentador é de no máximo 1 quadro (`presenterFreeze`); se a imagem do clipe acaba antes,
   o som é cortado ali.
3. **Transição na troca = corte seco** quando o plano que sai é o apresentador em vídeo (`cleanTransitions`): a fusão só existia
   sobre o último quadro congelado. 86 trocas no catálogo eram `crossfade`; todas viram corte. Saída com cartão/slide fica como estava.
4. **Enquadramento alternado** (`framingPunchPlan`): em planos seguidos da MESMA câmera e mesmo enquadramento, base → punch-in 1,14× → base…
   Câmera nova ou enquadramento novo volta ao base. O recorte tira no máx. 1,5% do topo (cabeça nunca cortada; o resto sai de baixo)
   e vai para o lado da pessoa (zona esquerda/direita/centro). Só onde cabe: `presenter`, `lower_third` e `presenter_chips` nas zonas
   esquerda/direita. Ficam no base: chips no centro (3/4), painel, tela dividida, PiP, slide, cartão e qualquer plano com movimento
   de câmera. Letreiro, marca d'água, cartões e pílulas são desenhados DEPOIS do recorte, então nada deles é cortado.
   No catálogo: 160 de 422 planos `presenter` e 9 de 37 `presenter_chips` entram em punch-in.
5. **Ajuste fino:** as clipes recortados pelo ajuste (`skip`/frase/lead) passam pela mesma regra de bordas; as emendas internas
   (fusão curta sobre quadros reais, ≈ 0,08 s) seguem como estavam. Legendas seguem o começo real de cada plano (`timeline[].clipStart`).

## Arquivos

Alterados: `packages/media/src/compose/compose.ts`, `packages/media/src/compose/index.ts`, `apps/worker/src/compose-scene.ts`
(passa `words` e ajusta `sourceStart` das legendas), `apps/worker/src/adjust.ts` (usa `quietestPoint` do pacote; devolve `timeline`/`joins`).
Novos: `packages/media/src/compose/join.ts`, `packages/media/test/join.test.ts`, `apps/worker/src/scripts/remontar-emendas.ts`.
Teste legado ajustado: `packages/media/test/compose.test.ts` (crossfade/whip real com `joins: false`).

**PENDENTE (1 linha, aplicar quando o worker puder reiniciar):** `docs/qa/lancamento/emendas/fix-quadro-marca.patch`.
O `overlay` da marca d'água perdia o ÚLTIMO quadro de cada plano (bases de tempo diferentes): imagem ~1 quadro mais curta por plano
(até 0,36 s por cena; já existia antes, 6 cenas ≥ 0,3 s). A correção (`settb=AVTB` na camada da marca) foi montada e testada numa cópia
do repositório (`scratchpad/repo`, só leitura de código) porque a gravação paga bloqueava edições em `apps/worker/src` e `packages/media/src`.
As 13 cenas-curso remontadas na 2ª passada já saíram com a correção; o código-fonte do repositório ainda não a tem
(sem o patch, uma remontagem futura volta a perder 1 quadro por plano). O patch inclui o teste que pega o defeito.

## Remontagem (grátis, `MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0`)

`apps/worker/src/scripts/remontar-emendas.ts <curso>… [--so=aula/no] [--out=<pasta>] [--dry-run] [--log=…]`.
Remonta TODA cena dirigida dos 14 cursos a partir dos clipes já pagos; parte do `media.adjust` guardado no rascunho, então cortes,
planos tirados e cartões continuam valendo. 84 cenas, 0 falhas. Novas mídias (as antigas seguem no storage). Logs:
`docs/qa/lancamento/emendas-remontagem.log` (14 cursos) e `emendas-remontagem-2.log` (13 cursos, com a correção do quadro).
**C06**: remontado só na 1ª passada (4 cenas, antes do aviso de não mexer no C06) e SEM a correção do quadro; refazer depois da gravação:
`remontar-emendas.ts crs_b8zeh4b2gguseghq`. Os 12 cursos novos não foram tocados.

## Antes e depois (84 cenas, 375 emendas)

Medidor oficial do robô (`tools/robo-aluno/trava.py`, parada ≥ 120 ms):

| | antes | depois |
|---|---|---|
| paradas ≥ 120 ms (meio) | 245 | 136 |
| paradas ≥ 200 ms ("importantes") | 50 | 23 |
| ≥ 200 ms em pausa entre falas | 29 | 15 |
| ≥ 200 ms no fim do vídeo (cauda) | 19 | 2 |
| ≥ 250 ms | 13 | 6 |

Medidor do dono (`robo/trava.py`, ≥ 120 ms com fala): 971 → 725 trechos; ≥ 250 ms: 308 → 209.

Só nas emendas (janela −0,6/+0,4 s em volta da troca, roteiro real da montagem, prévias antes/depois):
paradas 260 → 151; ≥ 250 ms: 71 → 30; maior 760 → 520 ms.
**Parada muda** (imagem parada E silêncio, a pausa de boca fechada que o aluno vê como travamento): 97 → 6 trechos;
≥ 250 ms: 11 → 0; tempo total 21,8 s → 2,9 s.

Alvos do robô (`robo/resultado.json`, "travamento-entre-falas"): dos 74 importantes, 54 são em cenas dirigidas: 54 → 25.

| caso | antes | depois |
|---|---|---|
| C14·A9 v17 @29,24 s | 400 ms (+2 de 200) | 400 ms em 28,76 s (+0) |
| C14·A7 v13 @8,60 s | 360 ms | 320 ms em 8,64 s |
| C09·A2 v02 @32,80 s | 320 ms | sem parada |
| C07·A2 reação ast_t6j3gbuntpxmkjk8 @1,60 s | 240 ms | igual (reação não é cena dirigida) |
| C13·A1 reação ast_gzqhrnvdon4nlrg4 @1,56 s | igual | igual |

Lista completa por vídeo: `docs/qa/lancamento/emendas/alvos-cenas.json` (linhas: vídeo, nº antes, nº depois, tempos/durações antes, tempos/durações depois).

### O que NÃO muda, e por quê
- As paradas que sobram nas cenas (23 ≥ 200 ms) são quase todas DENTRO de um clipe (2 na emenda): o avatar do HeyGen assenta a pose
  0,2–0,5 s antes do fim da frase, ainda falando (áudio −20 a −40 dB), ou fica quieto na pausa interna. A emenda não alcança isso;
  só regravar, ou mascarar com movimento de câmera digital. Avaliei tirar o miolo de pausas mudas e paradas dentro do clipe
  (corte sem salto, porque a pose é a mesma): nas cenas só achou pausas de ~0,16 s, quase nada, então não entrou.
- **Reações e vídeos de pergunta** (18 + 2 dos 74) são um clipe só, não passam pelo compositor: não foram remontados.
  Para reduzi-las seria preciso um script próprio (corte nas bordas, como `trimReactionOpener`).
- O logo "DW" da parede do estúdio pode ficar parcialmente cortado na borda direita nos punch-ins da câmera 3/4 (centro).

## Verificações

- Imagem × som: maior diferença 0,28 s (antes 0,36 s; antes 6 cenas ≥ 0,3 s, agora nenhuma). Duração total das cenas: 3329 s → 3260 s.
- QA de áudio real (`asr/lote.py`, whisper, 357 vídeos): palavras faltando 4 → 4 (as mesmas); semelhança média das cenas 0,9927 → 0,9920;
  congelamentos 1 → 0. Palavras novas "a mais": 2, ambas alucinação do whisper depois da última palavra
  ("a cidade no brasil" a 0,06 s do fim em C04·A2·v02; "legenda por sonia ruberti" em C14·A5·v10; o áudio ali é decaimento −60 a −95 dB,
  não fala). Outras 5 trocas novas são variação de reconhecimento em palavras que não foram tocadas (ex. C14·A4·v07 "feche"→"feste": a palavra
  é a 1ª do plano, `headTrim` = 0). Resultado em `scratchpad/asr/qa-rascunhos.json` (antes: `qa-antes-emendas.json`).
- Legendas: 1ª legenda de 0,04–0,15 s antes da 1ª fala e última de 0–0,48 s depois da última fala, nas 84 cenas.
- Testes: `@lms/media` 198 no repositório (199 com o patch; inclui `join.test.ts`: aperto das bordas, alternância, filtergraph sem `tpad` longo, duração = soma, e 3 clipes
  sintéticos com cauda de silêncio no ffmpeg real: sem imagem parada > 0,25 s na junção, fala inteira, pausas de 0,10–0,30 s, imagem e som iguais,
  controle com `joins: false` ≥ 0,5 s parado); `@lms/worker` 58; `@lms/course-schema` 242. Typecheck dos três limpo.
- Folhas de contato (quadros a cada 0,04 s, 0,4 s antes e 0,36 s depois da troca; linhas 1–2 = antes, 3–4 = depois), C02·A2·v02, emendas `missao`, `s2`, `s3`:
  `docs/qa/lancamento/emendas/folha-emenda-{1,2,3}.png`.
