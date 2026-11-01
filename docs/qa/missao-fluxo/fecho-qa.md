# Fala de encerramento (plano `fecho`): QA e publicação, C02 a C22

Data: 01/11/2026. Servidores :3010 e worker não foram tocados. Só aluna@demo.local; nenhuma sessão desconectada.

## Resumo

- Os 21 jobs `despedida` (C02–C22, criados 09:00–09:06) terminaram com sucesso. Nenhuma falha, nenhuma nova tentativa minha, **nenhum gasto adicional**. Acumulado da expansão: US$ 74,36 (teto 80,40).
- **Escopo do dono, recebido no meio do trabalho:** as partes 1 e 2 das trilhas (C15, C16, C18, C19, C21, C22) não levam a fala de fecho. Eu já tinha publicado essas seis com o fecho (versões 4, 4, 4, 4, 5, 5). Corrigi (seção 4).
- **Pendente (bloqueado): C24 e C25** (publicados pelo outro agente com fecho). A ação de gravar no rascunho desses cursos foi negada pelo sistema de permissões; nada foi alterado neles (seção 5).
- Fecho publicado e conferido em **15 cursos**: C02–C14, C17 e C20. Robô nesses 15: 0 bloqueantes, 0 importantes.

## 1. Tabela por curso

Versão = a publicada agora. "Fala" = o que o whisper (large-v3-turbo, `tools/raio-x/asr.mjs`) ouve nas últimas palavras do vídeo contra a linha de `docs/novos-cursos/fechamento-falado/linhas.json`. "Emenda" = pausa mais próxima do início do fecho (silencedetect -45 dB, a mesma usada entre as frases da fala). Tempo da despedida em segundos.

| Curso | Versão publicada | Asset publicado | Duração | Fala × linha | Emenda | Imagem parada (>= 200 ms) | Robô (caminhos 1 e 3) |
|---|---|---|---|---|---|---|---|
| C02 | 13 | ast_87yavzulx2w7ajrl | 28,2 | igual | pausa 0,36 s | 1 → 0 (desengasgo) | 0/0/0, 4 de 4 chegaram ao fim |
| C03 | 14 | ast_d5x0b199bz029gpf | 28,0 | igual | 0,36 s | 1 → 0 (desengasgo) | 0/0/0 |
| C04 | 15 | ast_kl56nmuxwtlp9td4 | 26,2 | igual | 0,35 s | 1 → 0 (desengasgo) | 0/0/0 |
| C05 | 16 | ast_36oelr6uup9t16rp | 30,2 | igual | 0,38 s | 0 | 0/0/0 |
| C06 | 13 | ast_yn1ymif9q41jpgae | 33,8 | igual | 0,53 s | 0 | 0/0/0 |
| C07 | 16 | ast_2zbn39qv53sqmkj2 | 26,3 | igual | sem silêncio a -45 dB; ~0,2 s a -38 dB | 0 | 0/0/0 |
| C08 | 15 | ast_ourhei2a55ewm1qr | 30,3 | 1 variação: ouve "deixe", linha "deixa" (ver seção 3) | 0,44 s | 0 | 0/0/0 |
| C09 | 16 | ast_orw1u7b78g0c0i2l | 30,9 | igual | 0,37 s | 0 (160 ms tolerado) | 0/0/1 menor (os 160 ms) |
| C10 | 15 | ast_45agag0pl89hfq24 | 32,9 | igual | 0,43 s | 0 | 0/0/0 |
| C11 | 17 | ast_fae6vo7nbk8a7dhc | 32,0 | igual | 0,48 s | 0 (120 ms tolerados) | 0/0/0 |
| C12 | 17 | ast_gz7pjjqdltwhtqq6 | 33,0 | igual | 0,37 s | 0 (160 ms tolerados) | 0/0/0 |
| C13 | 16 | ast_pntpeo2k0kcuq0fu | 32,7 | igual | 0,47 s | 0 (120 ms tolerados) | 0/0/0 |
| C14 | 18 | ast_d8daijiv87sfhiqv | 33,8 | igual, com um "o" a mais ("tudo o que") | 0,37 s | 0 | 0/0/1 menor (120 ms no v24, fora da despedida) |
| C17 | 4 | ast_n9kijq991nu8bk6u | 35,0 | igual | 0,45 s | 0 (160 ms tolerado) | 0/0/0 |
| C20 | 4 | ast_gl1l0d1a4b0u637z | 30,6 | igual | 0,39 s | 1 → 0 (desengasgo) | 0/0/0 |
| C15, C16, C18, C19, C21, C22 | 5, 5, 5, 5, 6, 6 | sem fecho (ver seção 4) | | | | | 0/0/0 (fecho-4, depois de refazer; ver seção 4) |
| C24, C25 | 4 e 3 (do outro agente, com fecho) | | | | | | pendente (seção 5) |

"0/0/0" = bloqueantes/importantes/menores. Rodadas: `docs/qa/lancamento/robo/rodadas/fecho-1` (C02, C03), `fecho-2` (C04–C12), `fecho-3` (C13, C14 e C15–C22 ainda com fecho), `fecho-4` (as seis revertidas). Brutos em `bruto/`, resumo em `resumo.md`.

## 2. Como foi conferido

**Fala e emenda.** Para cada vídeo novo: whisper no vídeo inteiro, comparação das últimas palavras com a linha do fecho (distância de edição por palavra, janela de +-4 palavras), nível do áudio nos últimos 50 ms e silêncios do final. Resultado:

- Sem palavra cortada na emenda, sem áudio dobrado (a última frase do plano anterior e o começo do fecho aparecem uma vez cada, na ordem certa) e sem silêncio longo: a pausa na emenda ficou entre 0,35 e 0,53 s, igual às pausas entre frases do próprio vídeo (0,35 a 0,57 s).
- O áudio termina em queda (últimos 50 ms entre -42 e -104 dB) em todos; nenhum corte seco no fim.
- C07 é o único em que a pausa da emenda é mais curta que as outras (cerca de 0,2 s; só aparece com limiar de -38 dB). Soa como uma vírgula, não como corte; sem palavra comida. Se o dono quiser, é a primeira para ouvir.
- Os tempos de palavra do whisper (`-ml 1`) erram até 1 s, então a "pausa da emenda" é a pausa mais próxima do início estimado do fecho, não uma medida exata.

**Imagem parada.** `tools/robo-aluno/trava.py` (limite 200 ms) nos 21 vídeos. A remontagem com a cena nova perde o tratamento anterior: C02, C03, C04, C20 e C22 voltaram com trechos de 200 a 280 ms (C22 também com 520 ms no começo). Tratados com `apps/worker/src/scripts/desengasgo.ts --so=aula_03/despedida --excluir=nenhum`; cada asset novo passou na validação do script (0 trechos, quadros e áudio iguais, fala igual). Medição final dos assets publicados: 0 trecho >= 200 ms em todos (`final-trava.json`); restam trechos de 120 a 160 ms em C04, C09, C11, C12, C13, C14, C16, C17 e C19, tolerados pela regra.

**Publicação.** Para cada curso: `validateDraft` (ok, 0 erros, 0 mídia desatualizada; os 2 avisos `MEDIA_MISSING` de sempre, das reações sem vídeo), depois `publicar-e-matricular.ts --dry-run` e só então a publicação. Todas as simulações bateram "mesmas aulas e cenas": as matrículas mudam de versão sem mexer no status. Conferido antes e depois no banco: aluna@demo.local continua **concluída** em todos os cursos (data e versão de conclusão preservadas); aluno@demo.local (leitura apenas) mesmo status de antes (concluído ou em andamento). Logs: `publicar.log`, `dryrun.log`, `enr-antes-*.txt`, `enr-depois-*.txt` na pasta do scratchpad (`.../scratchpad/fecho/`).

**Robô e o fim da despedida.** Em todas as execuções dos 15 cursos com fecho (30 de 30 chegaram ao fim, 0 achados na despedida): o `<video>` da despedida carregou o asset publicado, tocou a duração inteira (tocado = duração, `ended=1`, sem interrupção, sem espera, sem recomeço), incluindo a linha nova no final; o cabeçalho mostrou "Fechamento do curso · {curso}"; a vinheta de marca veio depois; e a tela de fim mostrou "Você concluiu {curso}". Detalhe por execução: `despedida-robo-*.json` (scratchpad).

## 3. Para ouvir (nenhum bloqueia)

- **C08:** a linha diz "e **deixa** o espaço pronto" e o whisper ouve "e **deixe**" (duas decodificações, mesmo modelo). Pode ser o avatar dizendo "deixe". Escuta de 3 s em ~22 s do vídeo (ast_ourhei2a55ewm1qr). Se estiver errado, a regravação é um job de ~US$ 0,14 (uma só).
- **C19:** "Dessa vez, **é**: o curso acabou mesmo" sai sem o "é" no whisper (duas decodificações). Não será usado se o C19 ficar sem fecho; vale se a decisão mudar.
- **C18:** "Daqui para **a** frente" sai "para frente". Mesma observação.
- **C07:** a emenda com pausa menor que as demais (acima).
- Outras variações do whisper ("tudo o que" no C14) são palavras de ligação.

## 4. Mudança de escopo: C15, C16, C18, C19, C21, C22 sem fecho

Quando a mensagem chegou, as seis já estavam publicadas com o fecho (versões 4, 4, 4, 4, 5, 5), então "manter a versão publicada" não bastava. O que fiz (grátis, local):

1. `apps/worker/src/scripts/oneoff/fecho-reverter.ts`: copia o nó `despedida` da versão publicada anterior (3, 3, 3, 3, 4, 4) para o rascunho, só esse nó. Antes de gravar, confere que o resto do rascunho é idêntico à versão publicada atual e que o resto da versão anterior também. Resultado: mídia, `sceneHash`, direção (d1..d3, sem `fecho`) e fala iguais às da versão anterior, `stale=false`, `validateDraft` ok com 0 mídia desatualizada. Nenhuma renderização paga necessária.
2. Republicação (dry-run, depois publicar): C15 v5, C16 v5, C18 v5, C19 v5, C21 v6, C22 v6. O nó `despedida` de cada uma é idêntico ao da versão anterior ao fecho (comparado no banco). Matrículas: mesmo status de antes (aluna concluída em todos).
3. Robô (`fecho-4`, caminhos 1 e 3): 12 execuções, todas chegaram ao fim. Primeira passada: 4 importantes `cabecalho-muda-na-aula` no caminho 1 (C15, C16, C18, C19: o cabeçalho de uma tela mostrou "início · Respeito e diálogo · Parte 1 de 3" e a primeira tela só o título da aula). Não tem relação com o fecho (só no caminho 1, e a rodada com fecho no mesmo curso não tinha). Refiz o caminho 1 desses quatro: **0 achados**, ou seja, intermitente (provável carga da página de trilha em edição). Fica o aviso: a linha "Parte N de 3" no cabeçalho é recente; vale o dono saber que apareceu uma vez como inconsistência de primeira tela. C21 e C22: 0 bloqueantes, 0 importantes; menores apenas `net::ERR_ABORTED` do `?reiniciar=1` (navegação interrompida pelo próprio robô) e 160 ms de parada no v05 do C22 (tolerado). O relatório de `fecho-4` foi regerado só com C15, C16, C18, C19 depois do refazer; C21 e C22 estão no `bruto/` e acima.
4. As gravações do fecho desses seis (cerca de US$ 0,86) não serão usadas; os assets continuam no storage, caso o dono mude de ideia (reaplicar o nó das versões 4/4/4/4/5/5).

## 5. Pendente: tirar o fecho de C24 e C25 (bloqueado)

Pedido: tirar o `fecho` da despedida de C24 (crs_dp9s7pdro9j6e3m0, publicado v4 com fecho) e C25 (crs_0ua5onij460lpzs0, publicado v3 com fecho), de graça, com o ajuste fino (`media.adjust.drop`), validar, publicar e rodar o robô nos caminhos 1 e 3.

- Preparei `apps/worker/src/scripts/oneoff/fecho-tirar.ts` (cópia adaptada de `fase0-cortes.ts`, alvo `aula_03/despedida`, plano `fecho`, remontagem local sem provedor). O `--dry-run` passou nos dois: o plano é o último e `adjustOptions` aceita tirá-lo (custo zero, sem job). Estado hoje: os dois rascunhos == versão publicada, despedida com `fecho`, `media.adjust` vazio, sem job aberto.
- O `--apply` foi **negado pelo sistema de permissões** (modifica rascunho de curso do outro agente, que eu não tinha autorização para gravar). Não contornei. Nada foi alterado em C24 e C25.
- Para executar, depois de liberar:
  ```
  set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
  ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/fecho-tirar.ts --apply
  ```
  Depois: `desengasgo.ts <curso> --so=aula_03/despedida --excluir=nenhum` (a remontagem perde o tratamento), `onda1-validar.ts C24-C25`, `publicar-e-matricular.ts <id> --dry-run` e sem `--dry-run`, e `node tools/robo-aluno/rodar.mjs --rodada fecho-c24c25 --alvo C24:3,C25:3 --caminhos 1,3 --paralelo 4` (confirmar o número da última aula dos dois).
- Pergunta ao dono: a remontagem sem o `fecho` mantém o `direction.shots` com o plano `fecho` (só em `adjust.drop`), como nos cortes da fase 0. Se preferir remover o plano do rascunho em vez de dropar, o hash muda e a cena fica desatualizada (precisaria render pago); por isso usei o drop.

## 6. O que ficou

- C24 e C25: seção 5.
- Escuta de 3 s no C08 (deixa/deixe) e, se o C07 incomodar, na emenda dele.
- C17, C20 (e C23, C26 pelo outro agente) mantêm o fecho; as seis revertidas voltam a terminar na frase da despedida original, o que combina com "parte 1/2 de 3".
- Scripts criados (não commitados): `apps/worker/src/scripts/oneoff/fecho-reverter.ts`, `apps/worker/src/scripts/oneoff/fecho-tirar.ts`. Auxiliares de conferência no scratchpad: `check.mjs`, `pub.sh`, `despedida-robo.py`, `resumo.py`, `env.py`.
- `docs/qa/expansao-analise/GASTOS.md` ganhou uma nota (sem gasto novo). Nada foi commitado.

## 7. C24 e C25 resolvidos (com a liberação do dono)
- `fecho-tirar.ts --apply`: o plano `fecho` saiu por drop, sem custo. A despedida do C24 ficou com 28,60 s e a do C25 com 23,30 s. Rascunhos: C24 51 → 52, C25 43 → 44.
- Desengasgo: 0 trechos de 200 ms ou mais.
- Publicação: C24 na versão 5 e C25 na versão 4. As matrículas ficaram com "mesmas aulas e cenas" e os avisos são os mesmos da versão anterior (CALL_NOT_SPOKEN 4, MEDIA_MISSING 2).
- Robô, rodada `fecho-c24c25`: 4 de 4 ok, 0 achados.
