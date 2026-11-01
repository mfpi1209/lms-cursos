# Onda 1 (C01 a C11): QA da expansão, publicação e robô

Data: 01/11/2026. Só operações gratuitas (nenhum job pago criado: `media_jobs` sem linhas novas depois das 04:50; nenhuma chamada a `/media-jobs/batch`, nenhum `gravar*.py`). Servidor :3010 e worker não foram reiniciados.

## Resultado em uma tabela

| Curso | Vídeos novos/alterados | Diferenças de fala | Vídeos sem imagem parada (>= 200 ms) | Publicação | Robô (4 caminhos) |
|---|---|---|---|---|---|
| C01 · Meu primeiro dia | 9 | 4 (todas variações do whisper, ver abaixo) | 2 tratado(s) | versão 13, 11 avisos | 16/16 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C02 · Que roupa eu uso? | 5 | 3 (todas variações do whisper, ver abaixo) | 2 tratado(s) | versão 12, 5 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C03 · Celular no trabalho | 5 | 2 (todas variações do whisper, ver abaixo) | 2 tratado(s) | versão 13, 5 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 1 menor |
| C04 · WhatsApp sem complicação | 5 | 2 (todas variações do whisper, ver abaixo) | 1 tratado(s) | versão 14, 5 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C05 · Horário é combinado | 5 | 1 (todas variações do whisper, ver abaixo) | 0 tratado(s) | versão 15, 5 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C06 · Brincadeiras têm limite | 6 | 4 (todas variações do whisper, ver abaixo) | 1 tratado(s) | versão 12, 7 avisos | 16/16 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C07 · Como falar com a equipe | 5 | 0 (todas variações do whisper, ver abaixo) | 2 tratado(s) | versão 15, 5 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C08 · O espaço também é do outro | 5 | 2 (todas variações do whisper, ver abaixo) | 0 tratado(s) | versão 14, 7 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |
| C09 · Posso postar isso? | 5 | 3 (todas variações do whisper, ver abaixo) | 2 tratado(s) | versão 15, 7 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 1 menor |
| C10 · Terminei. E agora? | 5 | 2 (todas variações do whisper, ver abaixo) | 1 tratado(s) | versão 14, 6 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 1 menor |
| C11 · Não entendi. Posso perguntar? | 5 | 1 (todas variações do whisper, ver abaixo) | 3 tratado(s) | versão 15, 7 avisos | 12/12 concluídas; 0 bloqueante, 0 importante, 0 menor |

## 1. Rascunho (validateDraft)

`ok=true`, 0 erros em todos os cursos. Mídia: `MEDIA_MISSING` só nos nós `q` novos (vídeo próprio da pergunta, que o player pula, e reações das opções, que ficaram sem gravar de propósito): 2 avisos por curso (C01: 8, porque tem duas aulas novas; C06: a aula nova é a 4). `MEDIA_STALE`: 0. Nenhum outro aviso de mídia. Arquivos: `validar.json`, `validar-depois-desengasgo.json`.

## 2. Fala (whisper large-v3-turbo, `tools/raio-x/gerar.mjs`)

60 vídeos novos ou com asset diferente da versão publicada (cena nova, explicação, despedida e aberturas regravadas sem a fórmula). Cada um foi comparado com a fala do roteiro (plano a plano). Cache: `docs/qa/raio-x/asr-cache.json` (+73 itens). Detalhe bruto: `asr-novos.json`; raio-x das 11 cursos: `raiox/raio-x.json`.

Nomes conferidos (Renata, Caio, Davi, Luana, Duda, Bia, Rafael, Bruno, Henrique, Camila, Beatriz, Thiago/Tiago, Iara, Sara, Ravi): nenhum errado. Variantes só de grafia (Thiago/Tiago, Iara/Yara, Sara/Sarah) e o Ravi, que o avatar lê com R inicial brasileiro ("Havi") e o whisper escreve "Javi" (os assets antigos do C06 saem com a mesma leitura; não é regressão).

### C01 · Meu primeiro dia (9 vídeos)
- C01·A2·v02 (semelhança 0.994): falta "a" (~24s)
- C01·A2·v03 (semelhança 0.984): falta "oito e vinte" (~30s); sobra "8h20" (~30s); assim → sim
- C01·A3·v05 (semelhança 0.994): pergunto → pergunte
- C01·A4·v07 (semelhança 0.997): sobra "um" (~7s)

### C02 · Que roupa eu uso? (5 vídeos)
- C02·A3·v04 (semelhança 0.961): falta "venha" (~21s); falta "à" (~21s); sobra "Vem a" (~21s); tenho → Tem
- C02·A3·v05 (semelhança 0.986): sobra "a" (~14s); tenho → tem
- C02·A3·despedida (semelhança 0.974): falta "a" (~19s); que → aqui

### C03 · Celular no trabalho (5 vídeos)
- C03·A1·v00 (semelhança 0.996): sobra "o" (~19s)
- C03·A3·v04 (semelhança 0.995): sobra "o" (~7s)

### C04 · WhatsApp sem complicação (5 vídeos)
- C04·A1·v00 (semelhança 0.974): Thiago → Tiago; Iara → Yara; Iara → Yara
- C04·A3·despedida (semelhança 0.981): Iara → Yara

### C05 · Horário é combinado (5 vídeos)
- C05·A3·v04 (semelhança 0.995): sobra "o" (~12s)

### C06 · Brincadeiras têm limite (6 vídeos)
- C06·A2·v02 (semelhança 0.983): quem → que; pedir → impedir
- C06·A4·v06 (semelhança 0.973): Ravi → Javi; Ravi → Javi
- C06·A4·v07 (semelhança 0.985): sobra "o" (~36s); Vi → Viu
- C06·A4·despedida (semelhança 0.982): Ravi → Javi

### C07 · Como falar com a equipe (5 vídeos)
- todos com semelhança 1,000.

### C08 · O espaço também é do outro (5 vídeos)
- C08·A1·v00 (semelhança 0.996): sobra "o" (~31s)
- C08·A2·v02 (semelhança 0.982): Sara → Sarah; Sara → Sarah

### C09 · Posso postar isso? (5 vídeos)
- C09·A3·v04 (semelhança 0.995): sobra "o" (~33s)
- C09·A3·v05 (semelhança 0.994): sobra "um" (~4s)
- C09·A3·despedida (semelhança 0.985): para → pra

### C10 · Terminei. E agora? (5 vídeos)
- C10·A1·v00 (semelhança 0.991): o → um
- C10·A2·v02 (semelhança 0.995): falta "a" (~9s)

### C11 · Não entendi. Posso perguntar? (5 vídeos)
- C11·A3·v04 (semelhança 0.991): tenho → Tenha

**Para olhar (nenhum bloqueia):**

- **C11·A3·v04 (script, não é do áudio):** a fala do roteiro diz "com alguém que te explicar algo" (deveria ser "te explique"). O avatar disse como escrito. Só se corrige regravando (pago): fica para a decisão do dono. Também "tenho um pedido" saiu "Tenha um pedido" no whisper.
- **C02·A3·v04:** "tenho uma calça" → ouvido "Tem" e "venha adequada à função" → "Vem a adequada função" (a mesma frase na despedida sai certa: "venha adequada à função"). Provável variação do whisper na citação rápida; vale uma escuta de 5 s em 20,8 s do vídeo.
- **C06·A2·v02 (C06):** "quando e a quem pedir apoio" ouvido "a que impedir apoio" (uma palavra); escuta de 5 s recomendada.
- Palavras de ligação soltas ("o", "a", "um") a mais ou a menos em 10 vídeos: variações normais do reconhecimento; nenhuma com `borda` (sem sobra de corte no início ou no fim de vídeo).

## 3. Imagem parada (desengasgo)

Medidor do robô (`trava.py`), limite 200 ms. 16 vídeos tinham trecho >= 200 ms e foram tratados com `apps/worker/src/scripts/desengasgo.ts --excluir=nenhum` (a lista da missão falada deixou de valer: as cenas já foram gravadas): validação de cada asset novo passou em todos (0 trechos, quadros e áudio iguais, fala 1,000). Rascunho: revisões C01 105→106, C02 96→97, C03 99→100, C04 121→122, C06 138→139, C07 109→110, C09 116→117, C10 106→107, C11 106→107. C05 e C08 não tinham trecho.

| Curso | Vídeo (aula/nó) | Asset antigo → novo | Trechos >= 200 ms antes → depois |
|---|---|---|---|
| C01 | aula_03/v05 | ast_16was7rl7fjoa7s0 → ast_tdx82ikj5dho59a5 | 2 → 0 |
| C01 | aula_04/v07 | ast_hr33s4ugygpu6wxa → ast_6f3aeiiaju3jbnl0 | 2 → 0 |
| C02 | aula_03/v04 | ast_fk8n2xi0uacriisx → ast_z1nq04ea7xzyum6o | 3 → 0 |
| C02 | aula_03/despedida | ast_mxgqj7cvahg0ts88 → ast_6cocykpzvb1q9z93 | 1 → 0 |
| C03 | aula_03/v04 | ast_bx3q3q4kf8sep79b → ast_efyuss48go5gx98u | 1 → 0 |
| C03 | aula_03/despedida | ast_s5bxmpw2b9q40hhd → ast_lxxzre538ggvt1sv | 1 → 0 |
| C04 | aula_03/v05 | ast_3huyx7ta1y6h9pma → ast_rpku9rajhbqig9pn | 1 → 0 |
| C06 | aula_04/v07 | ast_05ggwqduho8fltkb → ast_d285p7gmqocdme2e | 1 → 0 |
| C07 | aula_02/v02 | ast_g0f7c7uy4wrry9h1 → ast_sbjnzqcmuimqf7n4 | 1 → 0 |
| C07 | aula_03/v05 | ast_wjhf2xatnz7qb150 → ast_z93kt6bi4kngid8y | 1 → 0 |
| C09 | aula_03/v04 | ast_9ykf0vkmbvrq3068 → ast_m29i7fh5qjyeo3p2 | 1 → 0 |
| C09 | aula_03/v05 | ast_w8x11x33kyuqmvyx → ast_9p46el6yt5fvbog3 | 1 → 0 |
| C10 | aula_03/v04 | ast_e54fxpfgaimfke9n → ast_0pilk23x40op2jeu | 1 → 0 |
| C11 | aula_02/v02 | ast_9x45pufmmj5nro12 → ast_28qrb4pc3d7378uk | 1 → 0 |
| C11 | aula_03/v04 | ast_14vcpkvnfvh3i3y6 → ast_rc62euctpv3ys7mb | 1 → 0 |
| C11 | aula_03/v05 | ast_xb9qnizjew5lcna6 → ast_7ygv1u0vmflrgjag | 3 → 0 |

**Não tratados, de propósito:** C01·A1·v01 (`ast_fa2durozbm29ur2q`, ~16,5 a 24,9 s, 8,7 s) e C01·A2·v03 (`ast_n52k0b0c96251uxy`, ~15,2 a 24,5 s, 9,5 s). São planos `card` (slide de texto em tela cheia com a voz seguindo: "O que a Luana perguntou", a mensagem de aviso). A imagem fica parada por desenho; um zoom de câmera num slide de texto pioraria a leitura e o desengasgo só aguenta ~2,5% de deriva. Para o robô não contar isso como travamento, criei `docs/qa/lancamento/robo/janelas-estaticas.json` (asset → janela do plano de cartão/slide, de `raio-x`) e `analisar.mjs` passa a ignorar paradas inteiras dentro dessas janelas (+-0,4 s), registrando `estaticoPorDesenho`. Se o dono preferir cartão com movimento, é remontagem (grátis) com outro layout ou uma animação leve no cartão: decisão dele.

Restam 3 trechos menores (120 a 160 ms, tolerados pela regra): C03·A2 reação q03·B (160 ms no fim), C09·A3·v04 (120 ms) e C10·A3·despedida (120 ms), todos com o asset pós-desengasgo e antes do corte final.

## 4. Reações sem vídeo (player)

Nas decisões novas (opções com `reaction.text` sem mídia), escolher uma opção não abre palco de reação: `use-player-session.ts` só monta reação quando existe `media.kind === 'video'`. A cena seguinte abre com "Sua escolha" + retorno escrito + "Faça assim" e o botão **Assistir**/Pular vídeo; sem palco vazio e sem tela presa. Conferido ao vivo (desktop 1440 e celular 390) em C02·A3·q04 (opção B), C06·A4·q06 (opção C) e C01·A3·q04 (opção A): `reactionScene=false`, `mostraSuaEscolha=true`, retorno escrito presente, como seguir presente. Capturas e dados em `docs/qa/lancamento/robo/rodadas/onda1-paginas/` (`retorno-*.png`, `retorno-escrito.json`). Nenhuma mudança no player foi necessária.

## 5. Publicação (`publicar-e-matricular.ts`, dry-run antes)

Todas as simulações bateram com a regra `onlyAppendedLessons`: matrícula concluída continua concluída (data, versão de conclusão, selos intactos) e recebe a aula nova em `optional_lesson_ids` ("Conteúdo novo"); matrícula em andamento fica com a aula nova obrigatória. Tentativas abertas continuam (nenhuma cena removida). Logs: `dryrun-antes.log`, `publicar.log`; estado final das matrículas: `matriculas-depois.txt`.

| Curso | Versão | aluna@demo.local | aluno@demo.local |
|---|---|---|---|
| C01 | versão 13, 11 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C02 | versão 12, 5 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C03 | versão 13, 5 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C04 | versão 14, 5 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C05 | versão 15, 5 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C06 | versão 12, 7 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C07 | versão 15, 5 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C08 | versão 14, 7 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C09 | versão 15, 7 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C10 | versão 14, 6 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |
| C11 | versão 15, 7 avisos | concluída, conteúdo novo opcional | ver `matriculas-depois.txt` |

Estado final no banco (`matriculas-depois.txt`): aluna concluída nos 11 cursos, com a(s) aula(s) nova(s) em `optional_lesson_ids` (C01: aula_03 e aula_04; C06: aula_04; demais: aula_03). aluno@demo.local: concluído com conteúdo novo opcional em C01, C03, C04, C07, C08, C10, C11; **em andamento com a aula nova obrigatória** em C02, C05, C06, C09 (`optional_lesson_ids = []`; `obrigatoria-em-andamento.txt`: `courseIsComplete` é falso com a aula nova pendente e verdadeiro só com todas). Matrícula nova de aluno novo usa `enrollStudent` na versão mais recente com `optional_lesson_ids = []`, ou seja, igual às em andamento.

**Conta de teste nova para o caso "matrícula nova em andamento": não criada.** Os helpers existentes (`matricular.mts`) só matriculam usuários já existentes e não criam conta; o seed só tem os 5 usuários demo (aluno@demo.local fica fora). A regra foi comprovada pelas 4 matrículas em andamento do aluno@demo.local (leitura, sem logar nem mexer nelas) e pelo código de `planAppend`/`courseIsComplete` (testes em `packages/db/test/matricula-migracao*.test.ts`).

## 6. Robô (aluna@demo.local, caminhos 1, 2, 3 e 4, 35 aulas, 140 execuções)

Rodada `onda1` em `docs/qa/lancamento/robo/rodadas/onda1/` (`resumo.md`, `resultado.json`, `relatorio.html`, `bruto/`, `img/`, `execucao-1.log`, `execucao-2.log`). **140/140 concluídas. 0 bloqueantes, 0 importantes, 3 menores** (os três travamentos tolerados acima).

Página de cada curso da aluna (`rodadas/onda1-paginas/paginas.json` e `C0x.png`): em todos os 11 aparece "Conteúdo novo disponível: Aula N … É opcional: o seu curso segue concluído", o selo **Novo** na aula e o curso continua concluído (`status completed`, `completed_version_number` inalterado). O robô jogou a aula nova de cada curso (a aluna tem agora 39 a 64 tentativas concluídas por curso, de todas as rodadas). Caminhos 1 e 2: "Já experimentei" (1 escreve "O que você percebeu?", 2 deixa em branco); caminhos 3 e 4: "Vou fazer depois". Aberturas, vinhetas, despedida e "Curso concluído" ok.

**Ajustes no robô (ferramenta, não conteúdo):**

1. `aula.mjs`: a segunda rodada na mesma matrícula encontrava a missão já marcada "Já experimentei" (painel abre em `reporting`, sem o botão "Vou fazer depois") e travava com "a missão não confirmou em 20 s" (C02, C03 nos caminhos 3 e 4). Agora clica **Voltar** antes de "Vou fazer depois" e não reclica "Já experimentei" quando já está registrando. Comportamento do player correto (a pessoa que já marcou volta direto ao campo).
2. `anuncio.mjs`/`analisar.mjs`: nas aulas novas o plano que promete a prática tem id `promessa` (antes só `missao`); o C01 (prática em `reflection`) saía com `missao-sem-anuncio`. `missao-sem-atividade` não vale quando a aula tem nó `mission`. A `despedida` em vídeo depois da prática deixou de contar como "atividade no meio" nem como "Continuar aula não levou ao fim" (C01·A4).
3. `analisar.mjs`: `opcao-fora-da-1a-pessoa` reconhece pretérito em 1ª pessoa ("avisei", terminação -ei); C10·A3·q04 opção C ("Já avisei no dia da entrega…") era falso positivo.
4. `analisar.mjs`: janelas estáticas de cartão/slide (seção 3).
5. `tools/raio-x/gerar.mjs`: `RAIOX_SAIDA` e `RAIOX_CACHE` (variáveis de ambiente) para gerar em outra pasta sem sobrescrever `docs/qa/raio-x/raio-x.json`.

## 7. O que ficou

- Fala errada no roteiro do **C11·A3·v04** ("que te explicar"): só regravando (pago).
- Escutas de 5 s sugeridas: C02·A3·v04 (~20,8 s) e C06·A2·v02 ("a quem pedir apoio").
- **C01·A1·v01 e C01·A2·v03** têm 8,7 e 9,5 s de slide parado por desenho; decisão do dono se isso é aceitável.
- Reações das decisões novas continuam sem vídeo (por orçamento); `MEDIA_MISSING` dos `q` novos segue no validateDraft e vai nos avisos de cada versão publicada.
- Matrículas de aluno novo em andamento: não testado com conta nova (ver 5).
- Scripts de leitura criados em `packages/db/src/scripts/oneoff/onda1-validar.ts` e `onda1-obrigatoria.ts`.
