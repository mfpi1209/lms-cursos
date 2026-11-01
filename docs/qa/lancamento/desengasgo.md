# Desengasgo: fim das imagens paradas (>= 200 ms) nos vídeos dos cursos

Meta: zerar os trechos de imagem parada de 200 ms ou mais (os de 120 a 199 ms ficam tolerados). Medidor: o do robô (`tools/robo-aluno/trava.py`, 160x90 cinza, diferença máxima <= 4 e média < 0,15 entre quadros vizinhos), usado sem alteração em todas as medições abaixo.

## Resultado

- **30 vídeos tratados** (assets novos; os antigos seguem no storage): 17 reações, 3 vídeos próprios de pergunta, 10 cenas. Nos 13 cursos atuais (C01 a C14 sem C06) o rascunho passou de **46 trechos >= 200 ms (43 vídeos) para 15 (13 vídeos)**; os 15 que sobram são todos de vídeos que de propósito ficaram de fora (abaixo). Os trechos tolerados (120 a 199 ms) foram de 189 para 179.
- **Validação de cada asset novo** (sem passar em tudo, o asset não entra no curso; 0 reprovados): medidor do robô com 0 trechos >= 200 ms; ffprobe com o mesmo número de quadros e durações de vídeo e de áudio iguais ao original (±1 quadro; na prática exatamente iguais); áudio idêntico bit a bit (md5 dos pacotes, o áudio é copiado sem recodificar); whisper (`asr.py`, modelo `ggml-large-v3-turbo`, no máx. 2 em paralelo, com `nice`) com semelhança 1,000 e 0 diferenças em relação à fala do original.
- **Rascunho**: só `assetId` mudou em cada nó (conferido por diferença entre as revisões: 30 referências, nenhum outro campo). `media.adjust`, legendas, `generatedFrom` e o resto ficaram como estavam. Nada publicado.
- **Ainda de fora** (de propósito): 12 cenas da lista das 35 da missão falada que têm trecho (ver "Pendentes"), a reação q05·C da aula 3 do C06 (curso em gravação) e os 12 cursos novos. As **versões publicadas** continuam com os assets antigos (44 vídeos com trecho >= 200 ms) até o dono republicar a partir do rascunho.

## Técnica escolhida e por quê

O que o HeyGen entrega nesses trechos é o MESMO quadro repetido (A, A, A, ..., A) e só depois a imagem volta a se mexer (B). Medido nos trechos: em quase todos A e B quase não diferem (pausa de boca fechada entre falas; diferença máxima típica de 10 a 50 em 255, média ~0,4); em alguns há fala no meio e a diferença é maior; alguns vão até o fim do arquivo e outros acabam num corte seco (A e B são outros planos).

**Interpolação pura não resolve.** Testei `minterpolate` (mci) só no trecho, a técnica proposta: como A e B são quase iguais, os quadros interpolados também são, e o medidor continua vendo o mesmo trecho parado (moldura vermelha na linha do meio de cada folha de contato). Interpolar entre dois quadros iguais não cria movimento.

**Escolhida: base + deriva de câmera contínua** (`tools/desengasgo/desengasgo.py`):

1. Só os quadros repetidos do MEIO do trecho são trocados (A e B ficam), na mesma quantidade: o arquivo tem exatamente o mesmo número de quadros.
2. Imagem de base entre A e B: fluxo óptico (DIS, deformação dos dois lados e mistura) quando A e B diferem muito (fala no meio do trecho), mistura simples quando quase não diferem. Se B é outro plano (corte seco, diferença >= 100) ou o trecho vai até o fim do arquivo, não se interpola: A segue.
3. Deriva de câmera: zoom que sobe e desce (1,000 → 1,00x → 1,000, volta a 1 exatamente em B, pico entre dois quadros para que nenhum par de vizinhos tenha o mesmo zoom), na MENOR amplitude que faz todo par de quadros vizinhos do trecho passar de 7 de diferença máxima (limite do medidor: 4). O teto é 2,5% (o sugerido era 2%); o que saiu foi **mediana 0,4%, máximo 1,0%**. Sem deformar rosto ou boca: é um escalonamento da imagem inteira.
4. Quase-paradas (diferença máx. <= 6, média < 0,25, >= 200 ms) dentro do mesmo vídeo também são refeitas: ao recodificar, quadros quase iguais viram iguais e o medidor passaria a ver trechos novos (aconteceu em 2 de 42 vídeos no primeiro teste).
5. Codificação: x264 crf 18, preset medium, yuv420p, faststart, 25 qps; áudio com `-c:a copy`. O arquivo cresce em média 14% (de -1% a +38%). Só os quadros dos trechos passam por conversão de cor; os demais são recodificados como vieram.

Mix usado nos 51 trechos refeitos: 43 mistura, 5 fluxo óptico, 3 só deriva (cauda do vídeo ou corte seco).

Folhas de contato (quadro a cada 0,04 s; moldura vermelha = quadro igual ao anterior; linhas: antes, minterpolate, desengasgo escolhido) em `docs/qa/lancamento/desengasgo/`:

| Folha | Caso | Observação |
|---|---|---|
| `01-c14-a9-v17-28s76.png` | C14·A9 v17 @28,76 (400 ms, o pior) | pausa entre falas; prévia (cena da lista da missão) |
| `02-c14-a7-v13-8s64.png` | C14·A7 v13 @8,64 (320 ms) | fluxo óptico; prévia (cena da lista da missão) |
| `03-c07-a2-reacao-q03B-1s60.png` | C07·A2 reação q03·B @1,60 (360 ms) | tratado |
| `04-c13-a1-reacao-q11C-1s56.png` | C13·A1 reação q11·C @1,56 (360 ms) | tratado |
| `05-c03-a1-reacao-q02C-1s64.png` | C03·A1 reação q02·C (360 ms) | fluxo óptico; tratado |
| `06-c09-a2-reacao-q03A-4s52.png` | C09·A2 reação q03·A (280 ms, com fala) | fluxo óptico; tratado |
| `07-c07-a2-v03-12s40.png` | C07·A2 v03 @12,32 (320 ms) | parada antes de corte seco: só deriva; asset publicado antigo, tratado em arquivo de teste |
| `08-c13-a5-q08-16s8-cauda.png` | C13·A5 q08 @16,80 (200 ms) | cauda do vídeo: só deriva; tratado |

Na análise dos quadros nas folhas e em recortes do rosto (C09 q03·A, boca em fala) não vi rosto deformado, boca borrada nem pulo no começo ou fim dos trechos. Foi conferência por imagens paradas, não por reprodução: vale uma olhada ao vivo em 3 ou 4 desses casos. O efeito esperado é só uma respiração de câmera de menos de 1% nas pausas.

## Antes e depois por curso (trechos >= 200 ms; vídeos entre parênteses)

"Rascunho antes" = rascunho no momento anterior ao desengasgo. "Publicada" = versão publicada mais nova (o que o aluno vê; não mudou).

| Curso | Rascunho antes | Rascunho depois | Publicada (inalterada) | Tratados | Pendentes no rascunho |
|---|---|---|---|---|---|
| C01 | 1 (1) | 1 (1) | 0 | 0 | v03 (lista da missão) |
| C02 | 0 | 0 | 0 | 0 | |
| C03 | 1 (1) | **0** | 1 (1) | 1 | |
| C04 | 4 (4) | **0** | 5 (5) | 4 | |
| C05 | 0 | 0 | 0 | 0 | |
| C06 | 1 (1) | 1 (1) | 2 (2) | 0 | reação q05·C da aula 3 (em gravação; não tocado) |
| C07 | 5 (4) | 2 (1) | 5 (4) | 3 | v03 (lista da missão) |
| C08 | 0 | 0 | 0 | 0 | |
| C09 | 3 (3) | 1 (1) | 3 (3) | 2 | v03 (lista da missão) |
| C10 | 0 | 0 | 0 | 0 | |
| C11 | 6 (6) | 2 (2) | 6 (6) | 4 | v01 e v02 (lista da missão) |
| C12 | 1 (1) | **0** | 1 (1) | 1 | |
| C13 | 12 (11) | 1 (1) | 12 (11) | 10 | v09 (lista da missão) |
| C14 | 12 (11) | 7 (6) | 12 (11) | 5 | v08, v10, v11, v13, v17, v19 (lista da missão) |
| **Total** | **46 (43)** | **15 (13)** | 47 (44) | **30** | |

Detalhe por vídeo (asset antigo, asset novo, trechos, amplitude, tamanho, semelhança da fala): `docs/qa/lancamento/desengasgo/resultado.json`. Varreduras completas (cenas, perguntas e reações; rascunho e publicada) antes e depois: `varredura-antes.*` e `varredura-depois.*`. Log da execução: `execucao.log`.

## Pendentes e casos que não ficaram bons

- **Nenhum asset reprovado na validação.** O que não ficou resolvido é por escopo, não por qualidade:
  - **12 cenas da lista das 35 (missão falada)** têm trecho >= 200 ms: C01 aula_02/v03, C07 aula_02/v03, C09 aula_02/v03, C11 aula_01/v01 e aula_02/v02, C13 aula_05/v09, C14 aula_04/v08, aula_05/v10, aula_06/v11, aula_07/v13, aula_09/v17, aula_10/v19. Não foram trocadas no rascunho (o asset novo vem da gravação). Gerei a prévia dos 12 com `--prever` (fora do repositório, nada gravado): os 12 passam na mesma validação (0 trechos, quadros e áudio iguais, fala igual). As outras 23 cenas da lista já têm asset novo sem trecho no rascunho. Depois da gravação, rodar o mesmo comando abaixo nelas (sem `--excluir`).
  - **C06 aula_03, reação q05·C @0,8 s (200 ms):** a aula está em gravação; não tocado. Entra sozinho quando o script rodar no C06.
  - **Versões publicadas** (44 vídeos): só passam a ter o asset novo quando o rascunho for republicado.
- **Limite da técnica:** em pausa de boca fechada o que passa a existir é uma deriva de câmera (zoom de até 1%), não movimento natural de rosto (piscada, respiração). Atende ao medidor e ao olho, mas não é "vida" nova no avatar. Num trecho de 200 ms antes de um corte seco ou no fim do vídeo, só a deriva é usada (sem B para interpolar); o salto de escala (<= 1%) acontece exatamente no corte.
- **O desengasgo precisa rodar DEPOIS da última remontagem.** `remontar-emendas.ts`/`adjustScene` refazem a cena a partir dos clipes e o resultado volta a ter os trechos parados. Nas reações e perguntas (clipes únicos do HeyGen) vale o mesmo se o clipe for regravado.
- Medidas perto do limite: no primeiro teste, 2 dos 42 vídeos passaram a ter trecho novo depois do re-encode (quadros quase iguais viraram iguais); por isso o passe trata também as quase-paradas (item 4 acima).

## Como rodar

Preparo uma vez (já feito nesta máquina, em `.data/desengasgo-venv`): `python3 -m venv .data/desengasgo-venv && .data/desengasgo-venv/bin/pip install numpy opencv-python-headless`.

```bash
set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
T=./apps/worker/node_modules/.bin/tsx
# 1. só medir (rascunho e publicada), não grava nada
$T apps/worker/src/scripts/desengasgo.ts <curso>… --varrer
# 2. lista o que seria tratado
$T apps/worker/src/scripts/desengasgo.ts <curso>… --dry-run
# 3. tratar (gera assets novos, valida e troca no RASCUNHO; idempotente)
$T apps/worker/src/scripts/desengasgo.ts <curso>… --log=docs/qa/lancamento/desengasgo/execucao-novos.log --relatorio=docs/qa/lancamento/desengasgo/resultado-novos.json
```

`<curso>` é o id (`crs_…`) ou o código C01 a C14. Para os 12 cursos novos, passe os ids. Opções úteis: `--so=aula_02/v03` (só esses nós), `--sem=aula_03` (pular aula em gravação), `--min-ms=120` (tratar também os tolerados), `--excluir=nenhum` (sem a lista da missão falada: use depois que as 35 cenas forem gravadas), `--prever=<pasta>` (só gera os vídeos na pasta, sem tocar no banco), `--paralelo=3`.

Salvaguardas: pula cena `stale`, nó com job aberto, cena da lista `--excluir` (padrão: `docs/qa/lancamento/robo/correcoes-missao-falada.antes-depois.json`); a troca no rascunho relê o documento, troca só `assetId` onde o asset ainda é o antigo, usa controle de revisão e tenta de novo se o worker gravou no meio. Não chama provedor, não publica, não apaga mídia. Requer `whisper-cli` e o `asr.py` (caminho em `DESENGASGO_ASR`; sem ele use `--sem-whisper`, só para teste).

Arquivos: `apps/worker/src/scripts/desengasgo.ts` (ninguém importa; não reinicia o worker), `tools/desengasgo/desengasgo.py` (tratamento), `tools/desengasgo/folhas.py` (folhas de contato).
