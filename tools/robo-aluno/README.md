# Robô aluno

Faz cada aula publicada como um aluno faria, em navegador próprio (Playwright, headless, autoplay liberado). Os vídeos tocam a 2×, sem pular nada. O robô responde a opção N (1, 2 ou 3) em todas as perguntas e nos grupos da atividade, salva no Meu roteiro e chega ao fim. Depois cruza o que viu com o roteiro publicado e com os arquivos dos vídeos.

## Como rodar

O app precisa estar no ar em `http://localhost:3010`. A conta de teste é `aluna@demo.local`; a senha é lida de `packages/db/src/seed/seed.ts` e nunca é impressa.

1. Rodar o robô (padrão: todos os cursos × todas as aulas × caminhos 1, 2 e 3, com 4 navegadores):

   ```bash
   node tools/robo-aluno/rodar.mjs --rodada base --paralelo 4
   ```

2. Gerar o relatório (com `--publicar`, ele também vai para `docs/qa/lancamento/robo/`):

   ```bash
   node tools/robo-aluno/analisar.mjs --rodada base --publicar
   ```

3. Rodada nova, comparando com a anterior:

   ```bash
   node tools/robo-aluno/rodar.mjs --rodada depois-emendas && node tools/robo-aluno/analisar.mjs --rodada depois-emendas --comparar base --publicar
   ```

Filtros: `--cursos C02,C05`, `--aulas 1,2`, `--caminhos 1`.

O `--alvo` escolhe o conjunto: `atuais` (C01…C14, o padrão), `novos` (C15…C26, os 12 cursos de `docs/novos-cursos/instrutores-gerados.md`, na ordem da tabela), `todos`, ou uma lista com aulas separadas por `+`. Exemplo: `--alvo C06:3,novos` roda a aula 3 do C06 e os 12 novos. Curso em rascunho ou sem matrícula sai como "não coberto", com o motivo. Se a matrícula estiver numa versão sem a aula pedida, o relatório também diz isso.

Rodada dos cursos novos, depois da publicação:

1. Matricular a aluna nos publicados. O script usa `enrollStudent`, com `createdBy` = admin@demo.local, e pula rascunhos. Use `--seco` só para ver o que faria.

   ```bash
   set -a; . ./.env; set +a; packages/db/node_modules/.bin/tsx tools/robo-aluno/matricular.mts --alvo C06,novos
   ```

2. Rodar e analisar:

   ```bash
   node tools/robo-aluno/rodar.mjs --rodada novos --alvo C06:3,novos && node tools/robo-aluno/analisar.mjs --rodada novos
   ```

Um caminho que já chegou ao fim não roda de novo na mesma rodada; para forçar, use `--refazer`.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `rodar.mjs` | Fila de aulas. Os caminhos da mesma aula rodam em sequência, porque `?reiniciar=1` abandona a tentativa aberta. Grava o bruto em `docs/qa/lancamento/robo/rodadas/<rodada>/bruto/` e as capturas em `img/`. |
| `aula.mjs` | Uma aula, um caminho: decide o clique pela tela (`data-testid`). Mede a pergunta, a atividade (também em 390×844, numa segunda aba que retoma a atividade sem salvar), o salvamento e o fim. |
| `pagina.js` | Roda dentro da página antes do app. Registra cada `<video>` **pelo elemento** (palco, reação, vinheta ou pré-carga): duração, até onde tocou, fim, interrupção, recomeço e espera > 1 s. Também guarda a sequência de telas e o cabeçalho de cada tela. |
| `trava.py` | Travamento entre falas no arquivo do vídeo: imagem parada (nenhum pixel se mexe) por ≥ 120 ms, com a energia do áudio no trecho, antes e depois. |
| `analisar.mjs` | Regras de missão, vinheta, pergunta, atividade, cabeçalho, erros e travamento. Classifica cada problema (bloqueante / importante / menor) e compara rodadas. |
| `relatorio.mjs` | Gera `relatorio.html` e `resumo.md`. |
| `dados.mjs`, `login.mjs` | Leitura do banco (só leitura), lista C01…C26, `--alvo` e login da conta de teste. |
| `matricular.mts` | Matrícula da conta de teste nos cursos publicados do alvo, pelo repositório. Nunca usa aluno@demo.local. |

## Rodada final (todos os cursos)

Depois da publicação, rode na ordem:

1. Matricular a aluna nos cursos que faltam:

   ```bash
   set -a; . ./.env; set +a; packages/db/node_modules/.bin/tsx tools/robo-aluno/matricular.mts --alvo todos
   ```

2. Rodar o robô em todos os cursos, nos 4 caminhos:

   ```bash
   node tools/robo-aluno/rodar.mjs --rodada final --alvo todos --caminhos 1,2,3,4 --paralelo 4
   ```

3. Gerar o relatório, comparando com a rodada anterior:

   ```bash
   node tools/robo-aluno/analisar.mjs --rodada final --comparar depois-emendas --publicar
   ```

No caminho 1, cada pergunta e cada atividade ganha uma captura com nome estável, `img/<curso>-<aula>-<nó>.jpg` (ex.: `C02-A01-q02.jpg`). Cada problema no `resultado.json` traz `curso`, `aula`, `no` e, quando existe, `captura`, para cruzar com o raio-X dos cursos. Nas reações, o nó é a pergunta, e a opção aparece na etapa.

## Caminho 4 ("Fazer depois")

Com `--caminhos 1,2,3,4`, o robô faz também um caminho 4: opção 1 nas perguntas e "Fazer depois" na atividade. Ele confere que a atividade oferece "Fazer depois" e que o fim da aula não mostra "Missão cumprida" para quem pulou.

## O que conta como problema

O padrão decidido pelo dono está em [`docs/qa/lancamento/robo/decisoes-linha-de-base.md`](../../docs/qa/lancamento/robo/decisoes-linha-de-base.md).

- **Cabeçalho:** logo DNA Work à esquerda e nome do curso no centro.
- **Atividade:** é opcional.
- **Travamento:** a meta é zerar os de 200 ms ou mais; os de 120 a 199 ms são tolerados e contados à parte.
- **Exceções aceitas:** opções que são escolha de item, fala dirigida a alguém ("Você…", um pedido à IA como "Escreva…"), resposta a pergunta de sim/não ("Sim, porque…") ou continuação de frase ("Que ele…"); atividade que passa da tela com o botão de salvar visível.
- **Comparação (`--comparar`):** só entram os cursos cobertos nas duas rodadas.
- **Exceção por aula:** a lista `EXCECOES` em `analisar.mjs` guarda as exceções aceitas por aula (hoje, C14·A6: atividade no meio da aula). Elas saem como `excecoesAplicadas` no `resultado.json`.


| Gravidade | Casos |
|---|---|
| **Bloqueante** | Aula que não chega ao fim, vídeo de cena que não toca ou é interrompido, frase da atividade com lacuna, atividade que não salva, missão anunciada sem atividade. |
| **Importante** | Vídeo que recomeça, pausa, trava mais de 3 s ou para pedindo "Assistir" no meio da aula; vinheta ausente, repetida, fora do lugar ou que não segue sozinha; missão não anunciada ou com título diferente da atividade; atividade no meio da aula; grupo "Escolha a parte N"; frase com "??", ". ." ou começando com minúscula; botão de salvar fora da vista; pergunta sem situação, com título fora de "No lugar de X…" ou com opção fora da 1ª pessoa; cabeçalho fora do padrão (sem o logo DNA Work à esquerda ou sem o nome do curso no centro) ou diferente entre telas; "Missão cumprida" para quem clicou "Fazer depois"; erro de página; travamento entre falas ≥ 200 ms. |
| **Menor** | Imagem parada com fala no fim do vídeo, atividade obrigatória com "Fazer depois", vídeo que demora a começar, salvar lento, erro de console. |

O cache do travamento fica em `docs/qa/lancamento/robo/cache-trava.json`, indexado por asset, tamanho e data do arquivo. Um vídeo remontado é analisado de novo.

## Missão "Leve para a vida real" (nó `mission`)

Quando a aula tem a missão, o robô trata os dois estados: nos caminhos 3 e 4 toca "Vou fazer depois"; nos caminhos 1 e 2 toca "Já experimentei" (o 1 escreve "O que você percebeu?", o 2 deixa em branco) e salva. Em todos confere que a confirmação ("Missão registrada…" ou "Anotado…") só aparece depois do servidor, que "Continuar aula" segue e que a aula termina. Registra no bruto `missao` (estado, nota, medidas dos botões em 390 px, confirmação e capturas). Achados: `missao-sem-confirmacao` e `missao-rolagem-horizontal`. A missão não conta como "atividade no meio".
