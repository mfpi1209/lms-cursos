# Revisão final (Fable) — o que foi aplicado nos rascunhos

Fonte: `revisao-fable.md` (bloco JSON do fim). Especificação usada: `spec.json` (gerada de `correcoes.json`). Script: `apps/worker/src/scripts/revisao-final.ts` (idempotente; repetir não refaz nada). Log: `aplicado.log`. Transcrição regenerada: `transcricao-depois.html` / `.csv`. Nada foi publicado, nenhum commit, nenhum servidor reiniciado, nenhum provedor pago (`MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0`).

O bloco JSON tem **38** correções: **24** "tela", **13** "cortar" e **1** "ordem" (o pedido falava em 23/14/1; a contagem real do arquivo é esta).

## Aplicado (38 de 38; 37 exatamente como no relatório, 1 com ajuste)

### Cortes de fala (13): 11 vídeos remontados + 1 reação + 1 emenda
Um ajuste por vídeo, a partir dos clipes originais, somando aos cortes que já existiam.

| Código | Mecanismo | Vídeo novo (s) |
|---|---|---|
| C04·A2·v03 "E sobre horários…" | plano inteiro s4 (`drop`) | 23,8 |
| C06·A2·v02 "O apelido continuou mesmo depois do pedido." | 1ª frase de `chamada` (`cut first`) | 46,1 |
| C07·A1·v00 "Quem pode tirar a dúvida está em reunião." | 1ª frase de `chamada` | 39,2 |
| C09·A2·v02 frase da missão | plano `missao` inteiro (`drop`; o "Ela fica salva…" já tinha saído) | 41,2 |
| C10·A2·v02 "A referência do Henrique está ocupada, e há uma planilha…" | 1ª frase de `chamada` + cartão novo | 41,0 |
| C11·A2·v02 frase da missão | `drop` de `missao` | 38,0 |
| C14·A1·v01 "Nesta aula, você vai encontrar…" | última frase de s4 (`cut last`) | 40,8 |
| C14·A6·v11 frase da missão | `drop` de `missao` | 40,0 |
| C14·A9·v16 frase da missão | `drop` de `missao` | 43,2 |
| C14·A11·v20 frase da missão | `drop` de `missao` | 34,9 |
| C14·A12·v23 "E se a resposta for não? … próxima." | plano inteiro s3 (`drop`) | 18,7 |
| C06·A1·q01·A reação "Quase lá." | `trimReactionOpener` (ajuste de reação que já existe em `adjust.ts`); texto da reação passa a "Você evita presumir uma intimidade que não conhece. Mantenha o nome apresentado e pergunte se houver dúvida." | 7,9 |
| C13·A1·q11 "Vamos tentar de novo: o que você pergunta?" | emenda de uma frase inteira (entre duas frases) no vídeo próprio da pergunta, que não é cena dirigida (sem planos). Usa o tempo de cada palavra guardado no job; mesma montagem (fusão curta de imagem e som) e mesmas margens do `adjust.ts`; legendas e fala refeitas | 10,5 (era 13,6) |

Nenhum `skip` no meio de frase foi preciso: todos os trechos eram frases inteiras do começo, do fim ou planos inteiros.

Efeitos colaterais acertados junto:
- `narration` da cena = soma dos planos que ficam (C04·A2·v03, C06·A2·v02, C07·A1·v00, C09·A2·v02, C10·A2·v02, C11·A2·v02, C14·A1·v01, C14·A6·v11, C14·A9·v16, C14·A11·v20, C14·A12·v23); o orçamento não recusa.
- `bridge.call` das perguntas que seguem um corte na `chamada`: C06·A2·q03 ("Agora, responda: o que o Bruno pode fazer?"), C07·A1·q01 ("Agora, responda: no lugar da Elisa, como você pediria orientação?"), C10·A2·q03 ("Agora, responda: como você continuaria?"). A regra do player continua valendo: a transcrição regenerada marca esses três vídeos de pergunta como "NÃO TOCA (pulado)".
- C13·A1·q11: `narration` e `media.transcript` sem a frase (a chamada "Sua vez: escolha a pergunta que você faria." fica igual).

### Textos de tela (24)
Situações (sem a pergunta que o título já faz, onde o relatório mandou tirar): C01·A2·q03, C02·A2·q03, C05·A1·q01, C06·A2·q03, C07·A1·q01, C09·A2·q03, C12·A2·q03, C13·A1·q11, C13·A2·q03, C14·A3·q05.
Retornos: C03·A1·q01·A, C04·A1·q02·A, C04·A2·q03·B, C06·A1·q01·A, C14·A3·q05·A, C14·A6·q12·A/B/C (o complemento em segundo parágrafo saiu: o texto novo já traz o lembrete), C14·A7·q13·C.
C06·A1·q01·A: classificação `strong` e pontuação igual à da opção B (+2); "Quase lá." fora da reação (acima).
C09·A1·q02·B: opção "Eu recorto o documento da foto e publico." (mantive as aspas curvas das outras opções).
Cartões do fim (`summary` + recap "O que você levou"): C09·A2 (terceira linha "Antes de postar, confira: pessoas, informações visíveis e autorização.") e C14·A12 ("Leve duas perguntas; um agradecimento breve depois é opcional, se houver canal.").

### Ordem (C14·A11)
Atividade `m10` movida para depois de `q23`: `v20 → q21 → v21 → q22 → q23 → m10 → fim_aula_11`. Ids de nó e de aresta mantidos; efeitos de pontuação das arestas preservados; posições do mapa reordenadas. Todos os nós alcançáveis e a aula termina no fim (conferido na ordem da transcrição).

### Aplicado com ajuste (1)
**C10·A2·v02·cartão.** O texto do relatório tem 25 palavras e o cartão do vídeo aceita no máximo 22 (`validateAdjust`). Apliquei: "O Henrique entregou a tarefa e a referência está ocupada. Há atividades autorizadas e uma planilha restrita à vista. Como você continuaria?" (tirei só "uma lista de"). Se o dono preferir o texto exato, é preciso subir o limite do cartão.

## Não aplicado
- Os 4 itens de "alta condicional" (C14·A12·q25·C, C14·A6·q11·A, C14·A8·q15·C, C14·A5·q09·C): já estão com `reaction.disabled: true`, como o dono conferiu.
- Os itens fora do JSON (P5, "marcar NÃO TOCA", P7, P8, sistêmicos): conferência ou "sem ação" no próprio relatório.
- Pendências de corte: **nenhuma** (nenhum corte exigiu `skip` no meio de frase).

Observações para o dono:
- C13·A1·q11 é um vídeo de pergunta sem planos: a emenda fica gravada na mídia (`media.emenda`), mas uma regravação desse vídeo perde o corte (o ajuste fino do estúdio não cobre esse tipo de vídeo).
- C14·A12: o checklist "Dia da entrevista" ainda tem o item "mensagem de agradecimento escrita"; não estava nas 38 correções e ficou como está (é lista de conferência, não imposição).
- C06 (crs_b8zeh4b2gguseghq) foi editado só nos nós C06·A1·q01, C06·A2·v02 e C06·A2·q03, sempre relendo a revisão antes de salvar; nenhum trabalho do outro agente foi sobrescrito.

## Verificação
1. **Duração imagem × som** (ffprobe, vídeo e áudio de cada arquivo final; limite 0,3 s): C04·A2·v03 0,04 · C06·A2·v02 0,06 · C07·A1·v00 0,16 · C09·A2·v02 0,24 · C10·A2·v02 0,00 · C11·A2·v02 0,00 · C14·A1·v01 0,12 · C14·A6·v11 0,24 · C14·A9·v16 0,16 · C14·A11·v20 0,00 · C14·A12·v23 0,06 · C13·A1·q11 0,02 · reação C06·A1·q01·A 0,02. Todas abaixo de 0,3 s.
2. **Whisper local** (áudio real × `media.transcript`), semelhança: C04·A2·v03 1,000 · C06·A2·v02 0,974 · C07·A1·v00 0,990 · C09·A2·v02 1,000 · C10·A2·v02 0,989 · C11·A2·v02 1,000 · C14·A1·v01 1,000 · C14·A6·v11 0,990 · C14·A9·v16 1,000 · C14·A11·v20 1,000 · C14·A12·v23 1,000 · C13·A1·q11 1,000 · reação C06·A1·q01·A 1,000. Nenhuma sílaba sobrando do trecho cortado. As poucas diferenças são de reconhecimento nas partes que não mexi: "tem" ouvido como "tenho" em "tem uma missão" (C06·A2, C07·A1, C10·A2), "quem pedir" como "que impedir" (C06·A2), "quinze" como "15" (C14·A6).
3. **Transcrição dos rascunhos** regenerada (`transcricao-depois.html`/`.csv`, 43 aulas) e conferida item a item (script de conferência por código): 38 de 38 presentes (cortes ausentes da fala, textos iguais aos do relatório, ordem, classificação); a única diferença é o cartão do C10 descrito acima.
4. **Typecheck e testes:** `apps/worker` tsc sem erros; vitest do worker 51/51. Nenhum pacote (`course-schema`, `db`, `media`) foi alterado, então não rodei os testes deles.
