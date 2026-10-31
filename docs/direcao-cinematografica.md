# Direção cinematográfica

Cada cena com vídeo pode ter uma **direção**: a fala do apresentador dividida em
planos, cada um com câmera, enquadramento, movimento, o que aparece na tela e
transição. A IA diretora propõe; o autor revisa, edita e aprova; o worker produz
os clipes e monta o vídeo final com ffmpeg.

## Contrato (`packages/course-schema/src/direction.ts`)

- `SceneDirection { version: 1, intent, source: 'ai' | 'author', shots[1..12] }`.
- `Shot { id, line, cameraId?, framing, layout, cameraMove, motionPrompt?, slide?, caption?, transitionIn }`.
  - `line` é um trecho **exato** da fala; as linhas em ordem reproduzem a fala
    inteira (`directionNarration`). O áudio é sintetizado uma vez e cortado nelas.
  - `framing`: `wide | medium | close | extreme_close` (zoom digital sobre o
    enquadramento nativo da câmera; nunca afasta além do nativo).
  - `layout`: `presenter | presenter_slide_right | presenter_slide_left | slide_with_pip | slide | lower_third | cinematic | card`.
  - `cameraMove`: `static | push_in | pull_out | pan_left | pan_right | drift`.
  - `transitionIn`: `cut | crossfade | whip | dip_to_color`.
- `presentation.cameras: Camera[]` (até 6): cada câmera é um *look* do mesmo
  apresentador (`lookId`, `angle`, `nativeFraming`, `status ready|generating|failed`).
  `cameraId` nulo = câmera principal (o apresentador da apresentação).
- `presentation.directionStyle { pace, useSlides, slideAccent, maxCinematicPerLesson, matchCinematicSetting, cameraMode, cardsPerMinute, gestures }`.

## O que é nativo do HeyGen e o que é montado por nós

Pesquisa na documentação oficial (out/2026):

| Efeito | Como |
|---|---|
| Troca de câmera | Looks diferentes do mesmo avatar (kit de câmeras). Sem parâmetro de ângulo na API. |
| Novo ângulo | `POST /v3/avatars` `type: "prompt"` com o look de origem (pago, confirmação em dois cliques). |
| Close / médio | Zoom digital (ffmpeg) sobre o render 1080p; plano aberto prejudica a leitura labial. |
| Aproximação, panorâmica, deriva | ffmpeg (`zoompan` com suavização). |
| Gestos | `motion_prompt` (avatar_iv/avatar_v); o movimento dura ~10 s e repete → planos ≤ 26 palavras. |
| Slides, tela dividida, PiP, letreiro | Renderizados com satori/resvg (fonte Inter) e compostos no ffmpeg. |
| Transições | `xfade` + `acrossfade`, alinhadas a 25 fps. |
| Andar / mudar de posição | Impossível em vídeo com leitura labial. Só `cinematic_avatar` (sem nossa fala) → "cena em movimento" com narração por cima. |

## Pipeline do worker (`apps/worker/src/compose-*.ts`)

1. Plano de unidades: cada plano com apresentador vira um clipe; plano só de
   slide não chama o HeyGen (só áudio); planos < 1,2 s são unidos ao vizinho e
   recortados de volta na montagem.
2. Narração: **uma** chamada `with-timestamps` da ElevenLabs; o alinhamento
   (`alignment`, não o normalizado) corta o áudio no silêncio entre os planos.
3. Clipes: até 3 por vez no HeyGen; `Idempotency-Key = requestId:item:seq`.
4. Montagem: normalização a 25 fps, enquadramento, movimento, layout, transições,
   H.264 + AAC com faststart; anexa ao nó e marca sucesso.

**Sem cobrança dupla**: narração e estado de cada plano são gravados antes do
passo seguinte; um item com a mesma chave (fala, voz, look, gesto, motor,
fundo…) já produzido em qualquer job do workspace é reaproveitado. Mudar
enquadramento, movimento, slide, letreiro ou transição **não gera clipe novo**,
só uma nova montagem.

**Simulação** (`MEDIA_SIMULATION=1` ou sem chave): nenhum provedor é chamado; o
apresentador é substituído por um vídeo real já existente dele (ou `testsrc`) e
a montagem é feita de verdade. Um worker em simulação **nunca** conclui um job
criado em modo real: falha com aviso ("nada foi cobrado").

**Cena em movimento** (`layout: cinematic`): a pessoa apresentadora caminha sem
falar (`cinematic_avatar`, 4–15 s, 720p por padrão) e a narração toca por cima.
O autor/IA escolhe a **ação** (vir à câmera, atravessar, afastar-se, entrar e
sentar, observar) e descreve só o **lugar**; `buildCinematicPrompt` monta o
pedido assertivo (ação em destaque, passos visíveis, corpo inteiro, câmera e
ritmo por ação, ambiente vazio no primeiro segundo, gênero configurável). Mínimo
de imagem por ação (5–8 s); a fala pode ser mais curta e entra com um pequeno
atraso. Com `matchCinematicSetting`, um quadro do lugar (desfocado) vira o fundo
dos planos com fala da mesma cena — enviado ao HeyGen uma vez e reaproveitado;
os clipes com fala esperam a cena em movimento ficar pronta.

**Posição por câmera** (`camera.placement`, `camera.scale`): cada câmera do kit
pode ter a sua posição — `inherit` (padrão: a do curso,
`presentation.presenterPlacement`), `center`, `right`, `left` ou `full_frame`.
`resolveCameraPlacement(presentation, camera)` devolve `{ placement, scale,
transparent }`; o worker resolve cada item pela câmera dele
(`resolveUnitPlacement`; sem `cameraId` = a câmera cujo look é o apresentador).

| Posição resolvida | Pedido ao HeyGen | Montagem | Fundo de continuidade |
|---|---|---|---|
| `right`/`left` | WebM transparente (plano B: verde) | `placePresenter` sobre o fundo | sim (na nossa montagem) |
| `center` | MP4 com o fundo da apresentação | nenhuma | sim (enviado ao HeyGen) |
| `full_frame` | MP4 **sem** `background` e sem `remove_background` (`keepLookBackground`), chave `:ff` | nenhuma | **não**: o look tem o próprio fundo |

Uso típico: um visual **sentado à mesa** gerado por prompt (cadeira e mesa no
quadro) em `full_frame`, e a câmera em pé à direita como no resto do curso.
Chaves: a do clipe leva o rótulo da posição resolvida (`right:0.92`,
`full_frame:opaque`; centro sem rótulo), então mudar a posição de uma câmera
nunca reaproveita um clipe feito no outro modo. Câmeras `inherit` (e documentos
antigos sem o campo) geram exatamente as chaves e o hash de cena de antes: o
hash só ganha a posição da câmera quando ela difere da do curso, e
`COMPOSE_PIPELINE_VERSION` não mudou. Na simulação, o substituto da câmera em
tela cheia é opaco (sem alfa falso nem recorte). O estúdio oferece, no cartão de
cada câmera, "Posição" (Igual ao curso / Centro / Direita / Esquerda / Tela
cheia) e o tamanho com direita/esquerda; um ângulo novo pedido como sentado
(sentad…/seated/mesa/cadeira) já nasce em tela cheia. A IA diretora vê a
posição de cada câmera; mudar de posição uma vez por cena é bem-vindo, alternar
mais de uma vez gera aviso (`directionPlacementWarnings`).

**Resgate e cancelamento**: ao cancelar ou falhar um vídeo dirigido, os clipes já
enviados ao HeyGen continuam sendo baixados e guardados com sua chave, e a
próxima tentativa os reaproveita sem nova cobrança.

**Legendas**: todo vídeo recebe um WebVTT (`media.captions`) a partir do
alinhamento da ElevenLabs, mapeado para a linha do tempo final (planos,
transições, atraso da cena em movimento); na voz do HeyGen as marcas são
proporcionais (`approx: true`).

## IA diretora (`packages/ai`)

Tarefa `scene_direction` (`directScenes`): uma chamada por lote de até 8 cenas,
até 2 rodadas de reparo. O validador garante fala idêntica, ids únicos, câmeras
existentes e prontas, ≤ 12 planos, 3–26 palavras por plano, ≤ 1 plano aberto
por cena, nunca 3 enquadramentos iguais seguidos, limites de slide e respeito a
"slides desligados". As capacidades reais (`VIDEO_CAPABILITIES`) entram no
prompt para a IA nunca pedir o impossível.

## Estúdio

- Wizard › Apresentação: kit de câmeras (adicionar look existente, gerar ângulo
  com IA) e estilo de direção (ritmo, slides, cor).
- Storyboard: "Dirigir aula com IA", painel "Direção" por cena (linha do tempo,
  editor de plano, "Ver animatic" sem custo), revisão da proposta com conflito
  de revisão.
- Confirmação de geração mostra planos, clipes pagos e planos só com slide; em
  simulação diz que não há cobrança.

## Cenário com balcão, enquadramento do cenário e troca de fundo sem custo

**Layout único** (`packages/media/src/compose/layout.ts`, `computeComposition`;
exportado também em `@lms/media/layout`, sem dependências do Node): a prévia do
estúdio (CSS) e a montagem do worker (ffmpeg) usam a MESMA função pura. Entra o
quadro (16:9), o cenário (tamanho + janela `frame`), o clipe da apresentadora
(tamanho + caixa da pessoa) e os controles; sai o recorte do cenário
(`bgCrop`/`bgScale`), o retângulo do clipe e da caixa, a faixa do balcão e os
valores efetivos. Regras: escala sempre uniforme (a escala vale para o clipe
inteiro: altura = `presenterScale × H`); o tronco continua para fora da borda
inferior — a base só sobe do fundo quando há balcão escondendo o corte, e nunca
acima da linha dele (nada "flutua"); o cenário é recortado em 16:9 (janela ou
cobertura centralizada) e escalado sem distorção.

Campos (todos opcionais e aditivos; ausentes = hash e chaves de antes):

| Campo | Onde | Efeito |
|---|---|---|
| `presenterX` (0,15–0,85) | `presentation` / `camera.x` | centro horizontal livre; sobrepõe o predefinido direita/esquerda |
| `presenterBottom` (0,5–1) | `presentation` / `camera.bottom` | base do recorte (com balcão, a linha do tampo) |
| `presenterHeadroom` (0,05–0,08) | `presentation` | o clipe desce até o topo da cabeça (3,7% do clipe, `PRESENTER_HEAD_OFFSET`) cair nessa linha; se a base subisse, cresce até encostar |
| `presenterGrade` (`none`/`warm`/`cool`) | `presentation` | harmonização de cor só na camada da apresentadora (`warm` = `eq=saturation=1.04:brightness=0.01`); prévia com filtro CSS equivalente |
| `background.foregroundFrom` (0,5–1) | imagem | a faixa da PRÓPRIA imagem a partir dessa fração é montada POR CIMA da apresentadora (balcão/mesa) |
| `background.frame` `{x,y,w,h}` | imagem | janela de enquadramento (frações da imagem); a largura manda e a altura sai da proporção; presets "Plano aberto" e "Plano médio (sem piso)" |
| `background.blur: false` | imagem | cenário já tratado: sem o desfoque leve de profundidade |

Só valem na montagem NOSSA (direita/esquerda). `compileCourse` avisa:
`PRESENTER_ABOVE_DESK` (base mais de 2% acima da linha do balcão),
`FOREGROUND_WITHOUT_PLACEMENT` (balcão com apresentadora no centro),
`BACKGROUND_FRAME_OUT_OF_BOUNDS` e `BACKGROUND_FRAME_ASPECT`.

**ffmpeg** (`buildPlacePresenterCommand`): `[1:v]crop=cw:ch:cx:cy,scale=W:H`
(cenário), `split` → parede (desfocada, salvo `blur:false`) e `[desk]` =
`crop=W:(H−fy):0:fy`; `[bg][fg]overlay=x:y[wall]`; `[wall][desk]overlay=0:fy`.
Plano B (verde) idêntico. A cor entra no `[fg]` antes de `format=yuva420p`.
Chaves/hashes: `right:0.92` ganha `:x0.375:b0.85:h0.06` só quando definidos; o
fundo `image:<id>` ganha `:fg0.85`, `:frame…` e `:noblur` só quando definidos;
`COMPOSE_PIPELINE_VERSION` não mudou.

**Cenários** (`assets.metadata.scenery`, migração 0011): imagens do workspace
com enquadramento e posição sugeridos aparecem no grupo "Cenários" do estúdio;
escolher um preenche a apresentação (`applyScenery`). Script
`packages/db/src/scripts/pode-entrar-cenario-recepcao.ts` envia as duas
recepções DNA Work (com balcão: imagem inteira, x 0,375, 82%, base 0,85,
balcão 0,85; sem balcão v2: janela 1529×860 em 250,0, x 0,34, escala 1, folga 6%,
cor quente) e aplica a COM balcão aos cursos "Pode entrar" e "Light".

**Trocar o fundo sem gerar de novo** (remontagem sem custo): cena de plano único
com a apresentadora à direita/esquerda cuja fala já tem vídeo transparente pago
(mesma `singleShotAlphaKey`, agora em `@lms/media`) em qualquer job REAL do
workspace. `POST /media-jobs` com `recompose: true` (sem `confirmPaid`) cria um
job `simulated=0`, `cost_estimated_usd=0`, `input.recomposeOf=<job>` +
`reusedRawFrom`, `rawVideoAssetId/Kind`, `alphaKey`, narração, alinhamento e
legendas copiados; idempotente por hash (o mesmo fundo já montado é só anexado).
`GET /media-jobs/recompose?lessonId&nodeId` diz se está disponível (o
storyboard mostra "Trocar fundo (sem custo)"); o orçamento lista essas cenas
com `reused: true, recompose: true, estimatedUsd: 0` e o lote cria o job real de
custo 0 mesmo em modo de demonstração. No worker, `isRecomposeJob` passa pela
trava "worker em simulação nunca conclui job real" porque não chama provedor:
antes de reivindicar, `recomposeMissingAssets` confere o vídeo transparente
(workspace, legível) e a imagem de fundo; faltando algo, falha sem tentativa.
`reconcileJob` também termina/anexa sem chave do HeyGen. Vídeos DIRIGIDOS não
têm remontagem explícita neste incremento (em modo real os clipes alfa já são
reaproveitados por `alphaKey`; em demonstração o job real continua recusado).

## Linguagem de vídeo: uma câmera, cartões de marca, legendas sempre (2026-10-29)

Referência aprovada pelo autor: aula de estúdio com UM plano 3/4 constante da
apresentadora gesticulando naturalmente, cortes para CARTÕES de marca em tela
cheia enquanto a voz continua (título grande + 2–3 tópicos com palavras-chave em
negrito sobre fundo da marca com formas sutis), legendas sempre visíveis e fala
contínua e conversada ("Hoje a gente vai falar sobre…", "Então vamos por partes.
Começando por você.").

**Cartão de marca** (`layout: card`, `packages/media/src/compose/slides.ts`,
`renderBrandCardPng`): slide em tela cheia, sem apresentador (item só de áudio,
nenhum clipe pago), desenhado pelo modelo da marca do workspace. Tokens por
preset (`PLATFORM_BRAND`, padrão DNA Work; `brandCardTokens`): variante `light`
(fundo `#F4F7FA`, texto navy `#1D1E4C`, acento laranja `#FF7A08`) e `navy`
(fundo `#1D1E4C`, texto branco, acento laranja). Formas de marca: dois traços
arredondados grossos em baixa opacidade (ecoam as curvas do "DW"), parcialmente
fora do quadro, mais um ponto de acento; barra de acento sob o título; marca em
texto no canto inferior direito. Margens seguras 7% (lados) e 8% (topo/base);
título 100 px (encolhe até 80 px para caber em duas linhas), tópicos 58–64 px
(legíveis a 375 px de largura: ver `docs/qa/screens/card-3-mobile-check.png`).
`Slide.variant?: 'light'|'navy'` (ausente = alterna por cartão na cena);
tópicos aceitam `**negrito**` (`boldSegments`/`stripBold` no course-schema).
Limites do cartão (`CARD_LIMITS`): título ≤ 8 palavras, 2–3 tópicos de ≤ 12
palavras (as marcas `**` não contam). O preset da marca NÃO entra no hash da cena.

**Estilo** (`directionStyle`): `cameraMode: 'single' | 'multi'` (padrão
`single`: só a câmera principal nos planos com apresentador; o ritmo vem dos
cartões e dos gestos), `cardsPerMinute` (padrão 2; 0 desliga os cartões),
`gestures: 'natural' | 'minimal'` (padrão natural: um gesto com as mãos
visíveis em todo plano explicativo).

**IA diretora** (`DIRECTOR_PROMPT_VERSION 2026-10-29.1`, `VIDEO_CAPABILITIES_VERSION
2026-10-29.1`): em câmera única nunca troca de ângulo; corridas de apresentador
de ≈ 52–104 palavras (20–40 s), um cartão de 13–39 palavras (5–15 s) sempre que
a fala enumera, define ou dá a regra, e volta; nunca dois cartões seguidos; sem
`slide_with_pip`; gesto natural em todo plano explicativo (dedos continuam
proibidos; "counts on fingers" é banido). Validador (`validateDirectionScene`,
códigos no prefixo da mensagem): `CAMERA_SWITCH_IN_SINGLE_MODE`,
`PIP_IN_SINGLE_MODE`, `CARD_TOO_LONG`, `CARD_TOO_SHORT`, `CONSECUTIVE_CARDS`,
`CARD_TITLE_TOO_LONG`, `CARD_TOO_MANY_BULLETS`, `CARD_BULLET_TOO_LONG`; aviso
(não erro) `MISSING_GESTURE` (`directionGestureWarnings`). O modelo de
demonstração (`templateDirection`) segue o mesmo contrato: câmera principal em
todos os planos, lista com vírgulas no plano do meio vira cartão (13–39
palavras) com `**palavra-chave**` (`cardBullet`), variantes alternadas.

**Fala** (`INSTRUCTIONS_VERSION 2026-10-29.2`, `LESSON_CAPS`): narração
contínua e conversada ("a gente", "então", "vamos por partes"), 60–120 palavras
nas cenas de situação/explicação/decisão (máximo 120; consequências 40–90,
máximo 90); as palavras-chave ficam na tela e nos cartões, nunca lidas como
lista. O modelo de demonstração traz falas nesse tom.

**Legendas sempre**: o player (clássico e imersivo, inclusive no celular) nasce
com legendas LIGADAS (`lms.player.captions` no localStorage guarda a escolha do
aluno; o botão CC continua) e as desenha em caixa escura com texto branco,
embaixo (`video::cue` no clássico; caixa própria no imersivo). No worker,
`attachToNode` → `ensureCaptions` garante o WebVTT em TODO anexo (plano único,
posicionado, dirigido, reconciliação, saída pronta, substituto simulado): usa
a referência já gravada, senão gera na hora — exata pelo alinhamento da
ElevenLabs, aproximada (`approx`) pelo texto e pela duração do vídeo.

**Modo de demonstração, plano único centralizado**: o job termina com um vídeo
SUBSTITUTO anexado (6–10 s): cartão de marca marinho com o título da cena,
"Prévia simulada" e as primeiras palavras da fala, áudio em silêncio, legendas
aproximadas, `generatedFrom.simulated = true`, `lastError` "SIMULADO: … prévia
substituta". A etapa "Vídeos" do estúdio e o player passam a ter mídia em
demonstração. As travas real/simulado continuam iguais.

**Visual dentro do cenário** (`heygen-looks.ts`, `buildSceneLookPrompt`;
`POST /api/media/looks` com `sceneryAssetId` + `preset: scene_three_quarter |
scene_front | scene_close`): a imagem do cenário (`assets.metadata.scenery`) vai
como `reference_images: [url]` no `POST /v3/avatars type=prompt` (até 3 URLs
públicas, documentado); o pedido: mesma pessoa, rosto, identidade e roupa,
DENTRO do ambiente da referência, ângulo pedido, plano médio-aberto da cintura
para cima, pouca profundidade de campo, luz prática do ambiente, postura natural
com as mãos visíveis, olhando para a câmera, fotorrealista. A câmera nasce com
`placement: full_frame` e nome "No cenário · 3/4". A imagem do cenário vai
EMBUTIDA no pedido (`reference_images: [{ type: 'base64', media_type, data }]`,
≤ 5 MB, PNG/JPEG, documentado em 2026-10-29), lida direto do storage: não é
preciso URL pública nem CDN. Em demonstração o gerador simulado devolve o id
determinístico de sempre.

## Estúdio com zonas: pílulas, pergunta a seguir e letreiro (2026-10-29)

Cenário aprovado: `docs/brand/cenario/estudio-zonas-1920.png` (parede central
limpa, ripas de nogueira com LED nas bordas, monograma DW à direita, planta à
esquerda, prateleira à direita). Três câmeras NO cenário (geradas pelo autor,
pagas): `cam_estudio_esq` (frontal, apresentadora no terço ESQUERDO),
`cam_estudio_dir` (frontal, terço DIREITO) e `cam_estudio_34` (3/4,
centralizada), todas `placement: 'full_frame'`.

**Zona da câmera** (`Camera.zone?: 'left' | 'right' | 'center'`, aditivo): onde
a apresentadora está no quadro do visual; a parede livre fica do lado oposto
(`freeSideOf`). O card da câmera no estúdio mostra o selo ("Apresentadora à
esquerda/direita/ao centro", `CAMERA_ZONE_LABELS`) e o campo "Zona no estúdio".
**Modo de zonas** = o kit tem ao menos uma câmera de zona lateral pronta
(`zoneCamerasOf`); sem ela tudo segue como antes (`presenter_panel`).

**Layout `presenter_chips`** (`packages/media/src/compose/zones.ts`): o clipe da
câmera de zona entra em tela cheia SEM transformação (sem zoom, sem
deslocamento). Na coluna da parede livre (36% da largura; apresentadora à
esquerda → x 0,50–0,86; à direita → 0,14–0,50; 3/4 → encostada à direita com
margem de 4%) vai um painel de **vidro marinho** (`#1D1E4C` a 84%, borda branca
a 14%, raio 28, sombra suave), topo a 15% da altura, base máxima a 78%: linha
de cima laranja (`#FFB070`, 22 px, barra `#FF7A08`) "Aula N · título", título
branco 800 (60 → 44 px até caber em 2 linhas) e as pílulas: fundo branco,
texto marinho 800 (40 → 30 px, sem quebra), ícone de linha num círculo laranja
de 56 px, altura 84 px, espaço 16 px. Rótulo da pílula = o PRIMEIRO trecho em
`**negrito**` do tópico, até 4 palavras (`chipLabel`); até 4 pílulas
(`CHIPS_LIMITS`). O painel cresce para baixo a cada pílula (um sprite por
quantidade; topo fixo).

*Decisão de leitura sobre a parede clara*: painel marinho com texto branco, e
não vidro branco com texto marinho — as pílulas são brancas e sumiriam sobre
vidro branco. Marinho a 84% sobre a parede bege dá ≈ 10:1 para o título branco
e mantém as pílulas (marinho sobre branco ≈ 14:1) legíveis a 375 px (título ≈
12 px, pílula ≈ 8 px). Sem desfoque de fundo: atrás do painel só há parede lisa
(o desfoque não aparece a 84% e custaria um recorte + desfoque por quadro).

*Tempo*: cada pílula surge quando a palavra-chave é dita (mesmos tempos do
painel: `panelRevealTimes`, 0,1 s antes da palavra, ≥ 0,6 s entre pílulas;
sem palavras, espaçadas). Pop de 0,24 s (6 quadros a 25 fps,
`chipPopKeyframe`): escala 0,8 → 1,06 (55%) → 1,0, giro −4° → −1,5° → 0°,
opacidade 0,3 → 1, halo laranja (anel de 5 px a 80% + brilho) que fica na
pílula ATUAL até a próxima surgir (`chipTimeline`); as anteriores ficam sem
halo. Montagem: sprites pequenos por pílula (sequência do pop + halo +
assentada) com o tempo deslocado (`setpts=…+t/TB`, `overlay … eof_action=pass`),
painel com entrada de 0,25 s. Custo: ≈ 1 s de satori/resvg por plano.

**Pergunta a seguir**: quando o PRÓXIMO nó de uma cena narrada é uma decisão
(`nextDecisionQuestion`; a última frase interrogativa do enunciado, senão o
título, ≤ 12 palavras), os últimos 3 s da cena (`teaserWindow`) mostram o
cartão "A seguir" + a pergunta (vidro marinho, 46/40 px branco 800) na parede
livre do ÚLTIMO plano, centrado a 47% da altura, subindo 30 px e acendendo em
0,35 s. Um painel de pílulas ainda na tela some quando ela entra. O player
mostra a decisão em seguida, como antes.

**Letreiro com o nome**: na primeira cena narrada da aula (`firstNarratedNodeId`:
o nó inicial, senão o primeiro narrado), de 0,6 s a 4,5 s
(`lowerThirdWindow`; cena curta encurta, < 1,5 s visível = sem), canto
inferior esquerdo (x 4,5%, base a 11% da altura), vidro marinho com barra
laranja: "Marina" (30 px 800) + "Sua orientadora · DNA Work" (21 px), de
`branding.presenterName/presenterRole` + o nome da marca (`platformBrandName`:
DNA Work; `lms` = `NEXT_PUBLIC_BRAND_NAME`). Desliza 40 px da esquerda e volta,
0,3 s. Nunca sobre a marca d'água: com a marca d'água à esquerda, sobe acima
dela (`lowerThirdRect`, testado contra `watermarkRect`).

**Dados e hash**: `resolveSceneProduction` → `studioSceneOverlays` (só em vídeo
dirigido num curso em modo de zonas) grava `nextQuestion` e `lowerThird` na
entrada do job e no hash da cena SÓ quando existem; a zona das câmeras usadas
entra no hash (`cameras[].zone`, `mainCameraZone`) e na impressão da
apresentação só quando definida. Cursos sem zonas: hash e vídeos de antes
intactos; `COMPOSE_PIPELINE_VERSION` não mudou.

**IA diretora** (`DIRECTOR_PROMPT_VERSION 2026-10-29.3`,
`VIDEO_CAPABILITIES_VERSION 2026-10-29.3`, regra 19): em modo de zonas,
`<cameras>` traz `zona`, `<estilo>` diz "câmera: estúdio com zonas"; fala na 3/4
ou nas laterais alternando entre cenas; listas/regras/definições =
`presenter_chips` numa câmera LATERAL, do lado oposto às pílulas anteriores
(inclusive da cena anterior: `directionPatternLine` informa "últimas pílulas:
zona …"); cortes só entre frases; sem zoom (a regra da tela cheia continua).
O validador aceita as câmeras de zona em câmera única e recusa pílulas fora do
modo de zonas (`CHIPS_WITHOUT_ZONES`). Correções automáticas com aviso
(`applyZoneRules`): `CHIPS_ON_CENTER_CAMERA` (pílulas na 3/4/sem zona → câmera
lateral que alterna), `CHIPS_SIDE_REPEAT` (mesmo lado → o outro); aviso
`CUT_MID_SENTENCE`. O modelo de demonstração e o importador seguem o mesmo
contrato (`zoneTalkCamera`: 3/4 nas cenas pares, laterais alternando nas
ímpares; `nextChipsCamera`).

**Importador** (`buildCardDirection` com `zone`, `buildTalkDirection`): com
câmeras de zona na apresentação, TODOS os vídeos ganham direção (as falas sem
cartão também, na câmera da cena) e o cartão vira pílulas numa câmera lateral
alternando o lado na aula. CLI: `--zone-cameras cam_estudio_esq,cam_estudio_dir,cam_estudio_34`
copia só essas câmeras do rascunho do Pode entrar (prontas, com look; zona
gravada ou deduzida do id: esq/dir/34), com a 3/4 como principal.

**Prévia sem provedor**: `apps/worker/src/scripts/zones-preview.ts` monta com o
compositor real um "clipe" de imagem parada (cenário + recorte da
apresentadora) → `docs/qa/screens/zonas-chips.mp4` (5 s), `zonas-chips.png`
(2ª pílula no meio do pop) e `zonas-pergunta.png`.
