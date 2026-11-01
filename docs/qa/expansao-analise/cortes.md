# Análise dos 96 cortes candidatos (pacote de expansão)

Só leitura: nada foi alterado (código, banco, rascunhos, mídia), nenhum job pago, nenhum commit. Fontes: `docs/qa/raio-x/raio-x.json` (gerado 01/11 02:33) e `asr-cache.json` (palavras do whisper no vídeo FINAL). O pacote não traz id por item; uso `curso/aula/nó/plano` e `n` (ordem no pacote). Detalhe por item em `cortes.json`.

## Resultado

| Classe | Qtde | Segundos (estim.) |
|---|---|---|
| (a) plano inteiro, corte grátis por `media.adjust.drop` | **28** (todos `missao_fim`) | **122.7** |
| (b) corte parcial dentro de um plano | **0** | — |
| (c) texto mudou no rascunho / não achado | **4** (C01) | — |
| (d) arriscado | **64** = 36 abertura que é o ÚNICO anúncio da aula + 28 abertura de aula que também tem `missao_fim` | 135.5 (par) / 255.8 (únicas) |

**Aplicável sem risco: 28 cortes, ~122.7 s (≈ 2 min 3 s) em 28 vídeos, ≈ 4,4 s cada.** Os 28 `missao_fim` e as 28 aberturas "do par" são alternativas entre si: cortar os dois lados de uma aula deixa a missão sem nenhum anúncio falado.

## Achados que mudam o pacote

1. **Os 96 textos são planos inteiros** (fala do plano == texto do pacote, conferido contra o áudio): nenhum precisa de corte no meio de plano. A única exceção é C25·A1 `s3`, cujo texto do pacote inclui uma frase de ensino ("Um fato pode ser compatível com várias explicações."): tirar o plano perde conteúdo.
2. **O pacote chama de "redundante" o que na maior parte é o único anúncio.** Em 36 das 66 aulas com abertura candidata não existe `missao_fim` nem outra fala com "missão"/"na prática" antes da atividade (C02, C03·A2, C04·A2, C05·A2, C06·A2-A3, C11·A2, C12·A2, C13·A6, C14·A6 e todas as 24 aulas de C15–C26). Só 28 aulas (+2 em C01) têm anúncio duplo.
3. **A abertura é regra do projeto**: o robô-aluno exige "missão … <título>" na abertura (`missao-sem-anuncio`, importante) e o raio-x alerta `missao_sem_anuncio` (média). Já o `missao_fim` foi dispensado pelo dono em 31/10 (`docs/qa/lancamento/robo/decisoes-linha-de-base.md` §3: "o vídeo final não precisa chamar a missão"). Por isso o descartável do par é o `missao_fim`.
4. **C01 mudou desde o snapshot do pacote**: o rascunho reescreveu as 4 falas (sem a palavra "missão", planos "novo", sem áudio); o vídeo publicado ainda tem as falas antigas. Não cortar: decidir se grava o texto novo.
5. **Correção ao raio-x**: em 3 itens o `tempo.fimS` do plano termina cedo porque a última palavra tem hífen ("vaga-alvo", "testá-la"): C14·A2 `missao` (13,02 s, não 11,96), C14·A2 `missao_fim` (37,88 s, não 36,68) e C25·A2 `s2` (15,30 s, não 14,40). Os tempos deste relatório já vêm do alinhamento por palavra.
6. O whisper ouve "tenho uma missão" onde o roteiro diz "tem uma missão" (12+ casos); é erro de transcrição conhecido (`trocados` do raio-x), não afeta tempos.

## Viabilidade técnica do corte grátis

- `media.adjust.drop: [<plano>]` + remontagem local (`adjustScene`, provedor `local-adjust`, custo 0). `adjustOptions.canDrop` exige plano em clipe próprio e que sobre ao menos um plano. Todos os 96 têm ≥ 2,9 s e layout `presenter`; `MIN_UNIT_SECONDS` = 1,2 s, então nenhum é fundido ao vizinho (confirmar o botão "Tirar plano" no Estúdio por nó: o raio-x não guarda as unidades do job).
- Plano inteiro: o corte cai na fronteira entre clipes e a emenda nova entra em fusão (`joinsAfterRemoval`); não depende de pausa de palavra. Pausa entre os planos hoje: mediana 0,32 s (593 emendas). Em 9 `missao_fim` o plano vizinho está colado (pausa < 150 ms de um lado, coluna "emenda"): ouvir a emenda nesses.
- Efeitos colaterais: a alternância do punch-in 1,14x recalcula nos planos seguintes (cosmético); legendas VTT são refeitas; o ajuste fica no rascunho e só chega ao aluno com nova publicação. Limite de 12 `drop` por nó (nenhum nó candidato está perto).
- Fim do vídeo: dos 28, 11 são o último plano. Os 4 de C13 que levam a uma pergunta (A1, A2, A4, A5) terminam no conteúdo e o cartão "Pergunta a seguir" faz a chamada (como antes de 31/10). Os 7 que levam à atividade (C07·A2, C08·A2, C09·A2, C10·A2, C13·A3, C14·A5, C14·A8) passam a terminar sem chamar a missão (aceito, §3). Nos outros 17 a `chamada` (ou a situação) continua como último plano. Nenhuma referência pendurada: os planos vizinhos não citam o anúncio, nem a ponte da atividade.

## A. Cortes grátis recomendados (28 `missao_fim`, status a)

Pedido: no nó indicado, `media.adjust.drop += ['missao_fim']`. Pré-condição: manter a abertura da aula.

| n | Curso·Aula · nó | Início–fim (s) | Dur. | Pausa antes/depois | Economiza | Observação |
|---|---|---|---|---|---|---|
| 8 | C03·A1 · v01 | 33.04–36.98 | 3.94 | 0.3/0.46 | 4.4 |  |
| 11 | C04·A1 · v01 | 28.23–32.44 | 4.21 | 0.11/0.38 | 4.4 | ouvir emenda |
| 14 | C05·A1 · v01 | 40.32–45.02 | 4.7 | 0.2/0.2 | 4.8 |  |
| 17 | C06·A1 · v01 | 37.64–42.20 | 4.56 | 0.3/0.32 | 4.9 |  |
| 21 | C07·A1 · v01 | 37.40–41.00 | 3.6 | 0.22/0.18 | 3.7 |  |
| 23 | C07·A2 · v03 | 37.48–41.02 | 3.54 | 0.26/— | 3.8 | último plano; segue vinheta+atividade |
| 25 | C08·A1 · v01 | 28.89–35.02 | 6.13 | 0.09/0.3 | 6.2 | ouvir emenda |
| 27 | C08·A2 · v03 | 40.36–43.72 | 3.36 | 0.24/— | 3.7 | último plano; segue vinheta+atividade |
| 29 | C09·A1 · v01 | 35.92–40.88 | 4.96 | 0.38/0.36 | 5.4 |  |
| 31 | C09·A2 · v03 | 35.26–38.86 | 3.6 | 0.28/— | 4 | último plano; segue vinheta+atividade |
| 33 | C10·A1 · v01 | 33.20–37.54 | 4.34 | 0.2/0.18 | 4.4 |  |
| 35 | C10·A2 · v03 | 37.72–40.64 | 2.92 | 0.26/— | 3.3 | último plano; segue vinheta+atividade |
| 37 | C11·A1 · v01 | 25.44–29.46 | 4.02 | 0/0.45 | 4.1 | ouvir emenda |
| 40 | C12·A1 · v01 | 34.80–38.74 | 3.94 | 0.24/0.26 | 4.1 |  |
| 43 | C13·A1 · v01 | 32.16–36.30 | 4.14 | 0.28/— | 4.3 | último plano; cartão da pergunta |
| 45 | C13·A2 · v03 | 33.62–37.76 | 4.14 | 0.24/— | 4.2 | último plano; cartão da pergunta |
| 47 | C13·A3 · v05 | 32.30–35.42 | 3.12 | 0.24/— | 3.5 | último plano; segue vinheta+atividade |
| 49 | C13·A4 · v07 | 32.88–36.66 | 3.78 | 0.18/— | 3.9 | último plano; cartão da pergunta |
| 51 | C13·A5 · v09 | 33.26–37.12 | 3.86 | 0.16/— | 4 | último plano; cartão da pergunta |
| 54 | C14·A1 · v02 | 33.28–37.68 | 4.4 | 0.3/0.36 | 4.7 |  |
| 56 | C14·A2 · v04 | 33.54–37.88 | 4.34 | 0.36/0.28 | 4.7 |  |
| 58 | C14·A4 · v08 | 33.60–38.22 | 4.62 | 0.24/0.32 | 4.9 |  |
| 60 | C14·A5 · v10 | 29.75–32.64 | 2.89 | 0.09/— | 3.1 | último plano; segue vinheta+atividade; ouvir emenda |
| 63 | C14·A7 · v13 | 21.58–26.26 | 4.68 | 0.4/0 | 4.8 | ouvir emenda |
| 65 | C14·A8 · v15 | 28.86–33.12 | 4.26 | 0.14/— | 4.4 | último plano; segue vinheta+atividade; ouvir emenda |
| 67 | C14·A9 · v17 | 26.34–31.36 | 5.02 | 0/0.26 | 5 | ouvir emenda |
| 69 | C14·A10 · v19 | 28.67–33.20 | 4.53 | 0.11/0.3 | 4.6 | ouvir emenda |
| 71 | C14·A11 · v21 | 26.10–31.34 | 5.24 | 0.34/0.12 | 5.4 | ouvir emenda |

Total: 122.7 s.

## B. Aberturas de aulas com anúncio duplo (28, status d: manter)

Cada uma é plano inteiro e cortável de graça, mas é a fala que a regra da abertura confere. Alternativa a A (não somar): cortar estas em vez dos `missao_fim`, ≈ 135.5 s, e aceitar mudar a regra do robô.

| n | Curso·Aula · nó/plano | Início–fim (s) | Economiza |
|---|---|---|---|
| 7 | C03·A1 · v00/missao | 14.92–19.28 | 4.6 |
| 10 | C04·A1 · v00/missao | 14.64–18.80 | 4.6 |
| 13 | C05·A1 · v00/missao | 17.10–21.38 | 4.5 |
| 16 | C06·A1 · v00/missao | 22.20–27.22 | 5 |
| 20 | C07·A1 · v00/missao | 15.52–19.72 | 4.3 |
| 22 | C07·A2 · v02/missao | 6.00–10.26 | 4.8 |
| 24 | C08·A1 · v00/missao | 17.58–22.88 | 5.6 |
| 26 | C08·A2 · v02/missao | 6.48–11.72 | 5.6 |
| 28 | C09·A1 · v00/missao | 17.16–22.04 | 5.2 |
| 30 | C09·A2 · v02/missao | 31.66–36.74 | 5.1 |
| 32 | C10·A1 · v00/missao | 16.66–21.10 | 4.7 |
| 34 | C10·A2 · v02/missao | 8.82–13.34 | 5 |
| 36 | C11·A1 · v00/missao | 15.78–19.50 | 4.1 |
| 39 | C12·A1 · v00/missao | 17.40–22.10 | 5.1 |
| 42 | C13·A1 · v00/missao | 13.96–17.90 | 4.1 |
| 44 | C13·A2 · v02/missao | 5.54–9.78 | 4.8 |
| 46 | C13·A3 · v04/missao | 6.34–10.32 | 4.6 |
| 48 | C13·A4 · v06/missao | 5.16–9.02 | 4.2 |
| 50 | C13·A5 · v08/missao | 10.02–14.02 | 4.5 |
| 53 | C14·A1 · v00/missao | 11.28–16.08 | 5.2 |
| 55 | C14·A2 · v03/missao | 8.62–13.02 | 4.8 |
| 57 | C14·A4 · v07/missao | 9.64–14.28 | 5.1 |
| 59 | C14·A5 · v09/missao | 10.42–15.46 | 5.4 |
| 62 | C14·A7 · v12/missao | 6.16–10.86 | 5.2 |
| 64 | C14·A8 · v14/missao | 6.26–10.98 | 5.1 |
| 66 | C14·A9 · v16/missao | 34.86–39.30 | 4.7 |
| 68 | C14·A10 · v18/missao | 7.34–11.40 | 4.7 |
| 70 | C14·A11 · v20/missao | 30.58–35.42 | 4.9 |

## C. Aberturas que são o único anúncio (36, status d: não cortar)

Sem `missao_fim` na aula. Tirar o plano reabre `missao-sem-anuncio`/`missao_sem_anuncio`. Em C11·A2 e C14·A6 existe a ponte de reserva "Esta é a missão da aula.", que reduz mas não elimina o problema. Em C15–C26 o anúncio traz o enunciado específico da missão. C25·A1: ver abaixo.

| n | Curso·Aula · nó/plano | Início–fim (s) | Economiza | Nota |
|---|---|---|---|---|
| 5 | C02·A1 · v00/missao | 15.86–20.20 | 4.6 |  |
| 6 | C02·A2 · v02/missao | 6.58–10.84 | 4.8 |  |
| 9 | C03·A2 · v02/missao | 6.88–11.46 | 5.1 |  |
| 12 | C04·A2 · v02/missao | 9.12–12.76 | 4 |  |
| 15 | C05·A2 · v02/missao | 10.02–14.50 | 4.9 |  |
| 18 | C06·A2 · v02/missao | 7.22–12.10 | 5.7 |  |
| 19 | C06·A3 · v04/s2 | 4.04–13.40 | 9.5 |  |
| 38 | C11·A2 · v02/missao | 34.38–39.04 | 5 | tem ponte de reserva |
| 41 | C12·A2 · v02/missao | 5.30–9.54 | 4.4 |  |
| 52 | C13·A6 · v10/missao | 8.50–13.36 | 5.6 |  |
| 61 | C14·A6 · v11/missao | 32.48–36.14 | 4.1 | tem ponte de reserva |
| 72 | C15·A1 · v01/s4 | 23.36–30.10 | 7.1 |  |
| 73 | C15·A2 · v03/s2 | 9.96–16.72 | 7.1 |  |
| 74 | C16·A1 · v01/s4 | 22.70–30.16 | 7.6 |  |
| 75 | C16·A2 · v03/s2 | 8.12–15.54 | 7.6 |  |
| 76 | C17·A1 · v01/s4 | 23.60–31.96 | 8.5 |  |
| 77 | C17·A2 · v03/s2 | 7.52–14.96 | 7.1 |  |
| 78 | C18·A1 · v01/s4 | 25.10–31.98 | 7 |  |
| 79 | C18·A2 · v03/s2 | 7.40–14.90 | 7.9 |  |
| 80 | C19·A1 · v01/s4 | 21.80–28.56 | 6.8 |  |
| 81 | C19·A2 · v03/s2 | 5.20–13.26 | 8.3 |  |
| 82 | C20·A1 · v01/s4 | 24.56–33.20 | 8.8 |  |
| 83 | C20·A2 · v03/s2 | 6.94–14.50 | 8 |  |
| 84 | C21·A1 · v01/s4 | 22.76–29.16 | 6.5 |  |
| 85 | C21·A2 · v03/s3 | 12.44–19.30 | 7.4 |  |
| 86 | C22·A1 · v01/s4 | 22.16–29.36 | 7.3 |  |
| 87 | C22·A2 · v03/s2 | 5.96–13.36 | 7.7 |  |
| 88 | C23·A1 · v01/s3 | 21.32–28.64 | 7.5 |  |
| 89 | C23·A2 · v03/s2 | 8.28–14.86 | 6.9 |  |
| 90 | C24·A1 · v01/s4 | 25.90–37.58 | 11.8 |  |
| 91 | C24·A2 · v03/s3 | 12.82–21.22 | 8.7 |  |
| 92 | C25·A1 · v01/s3 | 17.56–28.48 | 10.9 | o plano inclui frase de ensino; só a 2ª frase (21,44–28,48 s, pausa antes 0,58 s) seria corte parcial `cut.s3.last=1` |
| 93 | C25·A2 · v03/s2 | 7.50–15.30 | 8 |  |
| 94 | C26·A1 · v01/s4 | 24.86–32.34 | 7.7 |  |
| 95 | C26·A2 · v03/s3 | 12.98–20.84 | 8.1 |  |
| 96 | C26·A3 · v05/s2 | 3.36–10.82 | 7.8 |  |

## D. C01: texto mudou no rascunho (4, status c)

Tempos = fala antiga no vídeo publicado. O rascunho tem outro texto, sem áudio ("novo"):

| n | Plano | Publicada (áudio) | Início–fim | Rascunho (a gravar) |
|---|---|---|---|---|
| 1 | v00/missao (C01·A1) | No fim desta aula, tem uma missão para você: confirme sua chegada. | 16.62–20.94 | Antes de terminar esta aula, você vai ter no celular a mensagem que confirma a sua chegada. Pronta para enviar de verdade. |
| 2 | v01/missao_fim (C01·A1) | Depois da próxima pergunta, vem a missão desta aula: confirme sua chegada. | 32.68–37.56 | Daqui a pouco, você escreve a sua versão dessa mensagem. Se já tem data marcada, ela sai hoje do seu celular. |
| 3 | v02/missao (C01·A2) | No fim desta aula, tem uma missão para você: avise um imprevisto. | 4.98–9.26 | Hoje você sai daqui com um aviso de atraso salvo no celular. Tomara que nunca precise. Se o ônibus parar, é copiar e enviar. |
| 4 | v03/missao_fim (C01·A2) | Agora é com você: a missão desta aula é avisar um imprevisto. | 37.74–42.06 | Agora, monte o seu aviso e salve nas notas do celular. No dia em que precisar, você não vai ter que pensar: só enviar. |

Recomendação: não cortar. Ou grava o texto novo (custa gravação de 4 planos) ou tira os planos novos da direção do rascunho (grátis, mas aí C01 fica sem anúncio, como os 36 acima).

## Limites desta análise

- Os tempos vêm do whisper; a precisão é de dezenas de ms. O worker ainda refina o ponto de corte pelo som, só em cortes dentro de plano (nenhum aqui).
- "Segundos economizados" é estimativa (±0,3 s): emenda atual entre as palavras vizinhas menos a pausa típica entre planos (0,32 s); para o último plano, duração do vídeo menos a sobra típica (0,22 s).
- Estado do rascunho = raio-x das 02:33; se o C01 ou outro rascunho mudou depois, reexecutar o gerador.
- Não ouvi o áudio: a classificação (d) é de regra/estrutura, não de escuta.
