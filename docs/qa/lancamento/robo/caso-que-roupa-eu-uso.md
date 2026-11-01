# Caso "Que roupa eu uso?" (C02 · aula 1): o v01 não tocou?

**Resposta: tocou.** O player está certo e o robô clicou os botões certos. O defeito era do **gravador do protótipo**, que deixou de anotar o v01 (e a reação da pergunta 2).

## O que o protótipo dizia

`robo.mjs` (protótipo) terminou a aula com só 2 vídeos registrados: v00 (`ast_vmr2h2o3lssx20a1`, abertura) e a reação B da q01 (`ast_bysvlf5c6yt789dn`). Faltavam o v01 (`ast_0kjdpkr4eswjh3bm`, "Como aplicar no dia a dia"), a vinheta e a reação da q02.

## Como foi verificado

Rodei o mesmo protótipo de novo (opção B, `?reiniciar=1`) com duas coisas a mais:

- um segundo gravador, ligado antes da página carregar, que escuta os eventos de mídia de **todos** os `<video>` na fase de captura;
- o registro de cada clique, com a tela antes e depois.

O resultado completo está em [evidencias/caso-que-roupa-prototipo.json](evidencias/caso-que-roupa-prototipo.json).

## Eventos reais (tempo da página, em segundos)

| t | evento | arquivo | onde |
|---|---|---|---|
| 3,4 | play | v00 `ast_vmr2h2o3lssx20a1` | palco |
| 23,1 | ended (39,5 s) | v00 | palco |
| 24,9 | play | reação B `ast_bysvlf5c6yt789dn` | palco |
| 28,9 | ended (7,9 s) | reação B | palco |
| **28,9** | **play** | **v01 `ast_0kjdpkr4eswjh3bm`** | **palco** |
| **48,8** | **ended (39,6 s)** | **v01** | **palco** |
| 48,8 | play → 50,9 ended | vinheta `ast_17oyy1lw72w7sf0m` | brand-bumper |
| 51,5 | play → 55,2 ended | reação B da q02 `ast_njtbpxfrxm9uby9q` | palco |

O robô fez 6 cliques: "Começar aula", "Continuar" (v00 já terminado, segue para a q01), "Confirmar escolha" (q01), "Confirmar escolha" (q02), "Salvar no meu roteiro" e "Continuar aula". Entre o clique na q01 (22,6 s) e o da q02 (49,2 s) **não houve nenhum clique**: nesse intervalo tocaram sozinhos a reação, o v01 inteiro e a vinheta.

## Por que o protótipo não anotou

O protótipo guardava cada vídeo numa tabela indexada pelo **nome do arquivo**, e o primeiro evento criava o registro (`window.__v[id] ??= {..., palco: …}`). O player pré-carrega os próximos vídeos em `<video>` invisíveis (`data-testid="video-prefetch"`, fora do palco) **com o mesmo arquivo**. O v01 foi pré-carregado aos 23,5 s, depois que o gravador do protótipo já estava ativo, e criou o registro com `palco: false`. Quando o mesmo arquivo tocou no palco aos 28,9 s, o registro já existia e continuou marcado como "fora do palco". No fim, o filtro `palco === true` o descartou. Com a reação da q02 aconteceu o mesmo. A reação da q01 escapou porque foi pré-carregada antes de o gravador ser instalado.

## No robô novo

O robô novo (`tools/robo-aluno/`) registra cada vídeo **pelo elemento**, não pelo arquivo, e anota onde ele está (palco, reação, vinheta ou pré-carga). O gravador é instalado antes do app (`addInitScript`).

Na mesma aula e no mesmo caminho, ele registra v00 → q01 → reação → v01 (39,6/39,6 s) → vinheta (4 s, logo após o v01) → q02 → reação → atividade → fim, sem interrupção nem recomeço.

## Observação à parte (print do dono)

O print do dono mostra a tela "A seguir · Como aplicar no dia a dia" com "Assistir": o v01 parado esperando um clique. Pelo código, o vídeo só toca sozinho depois de um clique do aluno nesta abertura da página (`gesture` em `use-player-session.ts`). Por isso é o que se vê quando a aula é retomada ou recarregada já nessa cena (a URL do print não tem `?reiniciar=1`); no fluxo contínuo, o robô viu o v01 tocar sozinho nos 3 caminhos. O robô passou a tratar como problema qualquer cena que pare em "A seguir" no meio da aula (`video-nao-seguiu`), com captura.
