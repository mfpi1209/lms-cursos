# Onda 2 (C12 a C26): QA da expansão, publicação e robô

Data: 01/11/2026. Mesmo roteiro da onda 1 (`onda1-qa.md`). Nesta sessão não disparei nenhum job pago (`gravar*.py` e `/media-jobs/batch` não foram usados por mim; o gasto da onda e as regravações depois da falta de crédito foram disparados pela coordenação e estão em `GASTOS.md`). Servidor :3010 e worker não foram reiniciados. Conta do robô: só aluna@demo.local.

## Resultado em uma tabela

| Curso | Vídeos novos | Diferenças de fala | Imagem parada (>= 200 ms) tratada | Publicação | Robô (4 caminhos) |
|---|---|---|---|---|---|
| C12 · Recebi uma correção. E agora? | 5 | 1 (erro de digitação no texto, corrigido) | 1 vídeo | versão 16, 7 avisos | 4/4; 0 bloqueante, 0 importante, 0 menor |
| C13 · Comecei a trabalhar | 9 | 1 (variação do whisper) | 4 vídeos | versão 15, 5 avisos | 4/4; 0/0/0 |
| C14 · Minha primeira vaga | 13 | 1 (ver "Para olhar") | 8 vídeos | versão 17, 33 avisos (31 já existiam) | 4/4; 0/0/1 |
| C15 · O outro só é diferente | 5 | 0 | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C16 · Discordar sem brigar | 5 | 0 | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C17 · Minha ideia também conta | 5 | 1 (para olhar) | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C18 · Seus dados também trabalham | 5 | 3 (variações do whisper) | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C19 · Parece verdade. Será? | 5 | 1 (variação do whisper) | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C20 · IA como aliada | 5 | 1 (para olhar) | 1 vídeo | versão 3, 6 avisos | 4/4; 0/0/0 |
| C21 · Tudo é urgente? | 5 | 0 | 0 | versão 4, 6 avisos | 4/4; 0/0/0 |
| C22 · Errei. E agora? | 5 | 2 (variações do whisper) | 1 vídeo | versão 4 (a 3 teve título de pergunta corrigido), 6 avisos | 4/4; 0/0/1 |
| C23 · Aprender faz parte do trabalho | 5 | 2 (variações do whisper) | 0 | versão 3, 6 avisos | 4/4; 0/0/0 |
| C24 · Por onde eu começo? (piloto) | 3 | 0 | 2 vídeos | versão 4, 6 avisos | 4/4; 0/0/0 |
| C25 · Faz sentido? | 5 | 1 (variação do whisper) | 0 | versão 3, 7 avisos | 4/4; 0/0/0 |
| C26 · Onde está o problema? | 6 | 1 (grafia de nome) | 3 vídeos | versão 3, 8 avisos | 4/4; 0/0/0 |

Rodada final: **60/60 caminhos concluídos (15 aulas novas x 4 caminhos). 0 bloqueantes, 0 importantes, 2 menores** (travamentos de 120 e 160 ms, tolerados pela regra do dono).

## 0. Fila de mídia e falta de crédito

Os 86 jobs de 07:41 rodaram no worker real (limite de 3 pedidos simultâneos no ElevenLabs gerou 429, reenfileirados pelo próprio worker, sem custo). Entre 08:30 e 08:40 a carteira do HeyGen chegou a US$ 0,02 e **16 jobs falharam com `MOVIO_PAYMENT_INSUFFICIENT_CREDIT`** (C23: v06 e despedida; C24: v05, v06, despedida; C25: v01, v03, v05, v06, despedida; C26: v01, v03, v05, v07, v08, despedida). Falha por crédito não cobra (`cost_actual_usd` nulo). Cotei os 16 nós (grátis, `POST /quote`: C23 1,27; C24 3,15; C25 2,31; C26 2,33; total 9,06) mas **não disparei**: a coordenação mandou não repetir e, depois da recarga do dono, regravou ela mesma os nós que faltavam (já com a frase de fecho). Os 16 jobs novos terminaram `succeeded`. C23 a C26 só foram publicadas depois disso. **Gasto meu em retentativas: US$ 0,00.**

## 1. Rascunho (validateDraft)

`ok=true`, 0 erros em todos. `MEDIA_MISSING`: só o nó `q` novo (vídeo próprio da pergunta, que o player pula, e as reações das opções, sem gravar de propósito): 2 avisos por curso. `MEDIA_STALE`: 0. Arquivos: `validar-antes.json` (estado logo após o disparo) e `validar-Cxx.json` (imediatamente antes de publicar, C13 a C26; o C12 foi validado em linha e saiu com os mesmos números).

## 2. Fala (whisper large-v3-turbo, `tools/raio-x/gerar.mjs`)

Vídeos novos (aberturas regravadas sem a fórmula, cena, explicação e despedida) comparados com a fala do roteiro. Cache: `docs/qa/raio-x/asr-cache.json`. Nomes conferidos: nenhum errado (Nathan sai "Natan", só grafia).

**Erro real de texto corrigido:** C12·A3·v04 tinha "só ouve:" no texto; o avatar disse "houve" (certo). Troquei para "só houve:" nas 3 ocorrências do rascunho (fala do plano, narração) sem mexer em `media.stale` (o vídeo continua válido). Ferramenta: `packages/db/src/scripts/oneoff/onda2-texto.ts`.

Diferenças só de reconhecimento (nenhuma bloqueia):
- C13·A7·despedida (0,969): "as seis" ouvido "a seis" (2x). Fala ligada.
- C14·A1·v00, A6·v11, A7·v12, A8·v14: só algarismos ("doze" → 12).
- C15·A3·v05, C18, C20, C21, C22: números por extenso ouvidos em algarismos ("dez" → 10, "quarenta" → 40, "quatrocentos e oitenta reais" → R$ 480).
- C18·A1·v01: "aparecem" → "aparece em"; C18·A3·v06: sobra "o".
- C19·A3·v06: "não consegui confirmar" ouvido "não conseguir confirmar".
- C22·A3·despedida (0,959): "para" → "pra"; "feito de pendente" ouvido "feito dependente".
- C23·A1·v01: "Mais para o fim" ouvido "Mas para o fim"; C23·A3·v05: sobra "é".
- C25·A3·v06: sobram "o" e "a".
- C26·A4·v07: "Nathan" → "Natan".

**Para olhar (escuta de 5 s recomendada; nenhum bloqueia):**
- **C14·A13·v25 (~39 s):** o roteiro diz "Veio um não? Peça retorno", o whisper ouviu "Teça retorno". Texto certo; a fala pode estar mal pronunciada. Só se corrige regravando.
- **C17·A3·v06:** "Perceber que a primeira tentativa errou o alvo" ouvido "Receber que…" (uma palavra).
- **C20·A2·v03:** "a IA" ouvido "a EA" em 2 das 3 vezes (as outras 3 vezes que a sigla aparece em outros vídeos saem "IA").
- **C18·A3·v05:** "O relógio marca quatro e meia" ouvido "4,5". Provavelmente a mesma fala; escutar.
- C22·A3·despedida: o "de" de "feito de pendente" pode estar engolido.

## 3. Imagem parada (desengasgo, `apps/worker/src/scripts/desengasgo.ts --excluir=nenhum`)

Medidor do robô, limite 200 ms. 20 vídeos tinham trecho >= 200 ms e foram tratados; validação de cada asset novo passou (0 trechos, quadros e áudio iguais, fala igual). Detalhe em `desengasgo-Cxx.json` e `desengasgo-exec.log`.

| Curso | Vídeos tratados | Trechos antes → depois |
|---|---|---|
| C12 | A3·v04 | 1 → 0 |
| C13 | A4·v06, A5·v08, A7·v12, A7·v13 | 1 → 0 cada |
| C14 | A2·v03, A5·v09, A6·v11, A7·v12, A8·v14, A10·v18, A13·v24, A13·v25 | 1 → 0 cada |
| C20 | A3·despedida | 1 → 0 |
| C22 | A3·despedida | 2 → 0 |
| C24 | A3·v05, A3·v06 | 2 e 1 → 0 |
| C26 | A1·v01, A3·v05, A4·v08 | 2, 1 e 1 → 0 |

C15 a C19, C21, C23 e C25 não tinham trecho. Restam 2 travamentos tolerados (120 a 199 ms): C14·A13·v24 (120 ms) e C22·A3·v05 (160 ms), no fim do vídeo com fala.

## 4. Reações sem vídeo

Mesmo comportamento da onda 1 (seção 4 do `onda1-qa.md`): as decisões novas usam retorno escrito + "Faça assim", sem palco de reação vazio. O robô passou por todas (4 caminhos, 15 decisões novas) sem tela presa.

## 5. Publicação (`publicar-e-matricular.ts`, dry-run antes)

Logs: `dryrun-antes.log`, `publicar.log`; estado final: `matriculas-depois.txt`. Todas as simulações bateram com `onlyAppendedLessons`: matrícula concluída continua concluída e recebe a aula nova em `optional_lesson_ids` ("conteúdo novo"); matrícula em andamento fica com a aula nova obrigatória; tentativas abertas continuam.

- **aluna@demo.local:** concluída nos 15 cursos, com a aula nova opcional (C12, C15 a C25: aula_03; C13: aula_07; C14: aula_13; C26: aula_04).
- **aluno@demo.local:** só olhado em leitura (nunca usado em teste automático). Em andamento com a aula nova obrigatória (`optional_lesson_ids = []`) em C13, C14, C16 a C26. Concluído com conteúdo novo opcional em C12 e C15.
- Página da aluna antes do robô: C12, C23, C24, C25 e C26 mostram "Conteúdo novo disponível: Aula N … É opcional: o seu curso segue concluído" e o selo Novo (`rodadas/onda2-paginas/`). Em C13 a C22 a página foi capturada depois de o robô já ter jogado a aula, então a aula aparece concluída e o aviso sumiu; o banco confirma a aula em `optional_lesson_ids` e o curso `completed`.

## 6. Robô (aluna@demo.local, caminhos 1 a 4, 15 aulas, 60 execuções)

Rodada `onda2` em `docs/qa/lancamento/robo/rodadas/onda2/` (`resumo.md`, `resultado.json`, `relatorio.html`, `execucao-1/2/3.log`). 60/60 concluídas, 0 bloqueantes, 0 importantes, 2 menores (seção 3). Algumas execuções "recarregou no meio; refazendo" foram refeitas pelo próprio robô e passaram.

**Correção de conteúdo (rascunho):** C22·A3·q05: o enunciado tinha uma pergunta entre aspas antes da pergunta final; o título da tela saía "Uma colega pergunta no grupo: “Resolveu aquilo do orçamento?”" (não era pergunta). Troquei para "Uma colega pergunta no grupo se você resolveu aquilo do orçamento. O que você escreve no grupo?" (só `prompt`, sem mídia afetada). Republicado (versão 4) e rodado de novo (4/4, sem o achado).

**Ajuste no robô (ferramenta):** `analisar.mjs`: opção entre aspas (“…”) é fala da pessoa na cena e passa a valer como a exceção "fala dirigida a alguém" de `decisoes-linha-de-base.md` §5. Falso positivo no C19·A3·q05 opção B ("Isso é golpe…").

## 7. O que ficou

- **Frase de fecho (`fecho`) no despedida:** C23 a C26 foram publicadas já com ela (a coordenação a adicionou antes de regravar). **C12 a C22 foram publicadas sem ela**; a coordenação a acrescentou depois nos rascunhos e vai republicar. Não republiquei esses cursos.
- Fala para escutar: C14·A13·v25 ("Peça" ouvido "Teça"), C17·A3·v06, C20·A2·v03, C18·A3·v05, C22·A3·despedida (seção 2). Só se corrige regravando (pago).
- Reações das decisões novas continuam sem vídeo (por orçamento); `MEDIA_MISSING` dos `q` novos segue nos avisos das versões.
- Matrícula nova de aluno novo (conta nova) não testada; regra comprovada pelas matrículas em andamento do aluno@demo.local (leitura).
- Ferramentas criadas: `packages/db/src/scripts/oneoff/onda2-texto.ts` (correção de texto sem tocar `media.stale`); `rodadas/onda2-paginas/paginas.mjs`.
