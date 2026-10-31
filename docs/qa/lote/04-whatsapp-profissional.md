# Lote 12 · Curso 04 — WhatsApp profissional sem passar vergonha

**Situação: publicado (versão 1), com os 4 vídeos conferidos e os alunos de teste matriculados.**

- Curso: `crs_4z17p0m6d43qxmmo` (slug `whatsapp-profissional-sem-passar-vergonha`), rascunho rev. 24 = versão 1
- Matrículas: `aluno@demo.local` (`enr_yeedsv008io0uyd3`), `aluna@demo.local` (`enr_6qxr2rxsg8c2kyx4`)
- Roteiro de trabalho: `docs/roteiros/lote/04_whatsapp_profissional.md` (cópia ajustada do `Downloads/04_whatsapp_profissional.md`)
- Scripts: `packages/db/src/scripts/lote/04-whatsapp.ts` (`voz` | `instrutor [--aplicar]` | `paleta` | `textos`),
  `04-gerar-thiago.sh` (pago; rodado pela sessão principal em `lote-rostos.sh`), `04-caminhos.ts` (todos os caminhos no motor),
  `04-qa-aluno.mjs` (QA visual como aluna, Playwright isolado)
- Telas e quadros: `docs/qa/lote/04-telas/`

## Elenco, marca e biblioteca

- Instrutor: **Thiago** (Seu orientador), homem pardo, uns 25 anos, cabelo curto com degradê, camisa azul-clara de manga curta, sorriso leve.
  Personagem fictício, criado só por texto (prompt em `04-whatsapp.ts`, `THIAGO_BASE_PROMPT`).
- Voz: **Davi Andrei** (ElevenLabs, biblioteca pública, `2CECaLAGTS5NRGxgbcxr`; dono `ed7d4eb1c7a13c5467247589fd317f4ac181df7796bba465a75cca65526678bc`):
  masculina, 20 e poucos, fala natural e leve. Escolhida pela busca grátis `/v1/shared-voices?language=pt&accent=brazilian&gender=male`.
- Estúdio 8, paleta clássica (`base #1D1E4C`, `accent #FF7A08`), letreiro "WhatsApp profissional", marca d'água DNA Work no rodapé.
- Biblioteca: `voz-davi-andrei`, `instrutor-thiago` (câmeras `cam_thiago8_esq/dir/34`, look base `cam_thiago_base`), kit **`estudio8-thiago`**.
  Para o próximo curso com o Thiago: `import-markdown-course.ts --file … --kit estudio8-thiago` (nada pago).

## Passo a passo

1. Roteiro copiado e ajustado:
   - Marina → Thiago ("Oi! Eu sou o Thiago, seu orientador neste curso da DNA Work."), "Direção do instrutor"; erro "consegue escreve" corrigido.
   - `Chamada:` em Q01–Q03 (o motor fala no fim do vídeo anterior, num plano final olhando para a lente).
   - V01 e V03 começam com "Seja qual for a sua escolha…" (retomada que serve para qualquer resposta).
   - V01 deixou de adiantar a resposta da Q02 (áudio); V02 deixou de adiantar a da Q03 (explicar a dependência).
   - `Cartão:` em V01 ("Na primeira mensagem") e V03 ("Antes de enviar, confira") para ter pílulas.
   - Falas: V00 94, V01 104, V02 79, V03 102 palavras (+ chamada). Sem futsal, CIEE, slogan, Marina.
2. Voz registrada na biblioteca na hora (sem colisão com as outras sessões).
3. Import provisório com `--kit estudio7-rafael` (ver achado 1), paleta + letreiro pelo script.
4. Rosto do Thiago (1 personagem + 3 câmeras no estúdio 8) pela sessão principal. Conferido: mesma pessoa nas 3 câmeras, perfil pedido.
5. `instrutor-thiago` + `estudio8-thiago` gravados; reimport com `--kit estudio8-thiago` (ver achado 3); paleta reaplicada (achado 4).
6. Orçamento oficial só dos V: **US$ 3,20** (4 cenas, 153 s). Lote disparado pela sessão principal com a aprovação do usuário de lá.
   V00 e V03 falharam por falta de crédito no HeyGen (não cobrado) e foram regravados pela fila da sessão principal.
7. Depois dos vídeos: menos texto em Q01/Q02 direto no rascunho (sem reimportar). Cotação de novo: 4 vídeos reaproveitados, US$ 0.
8. Publicado e matriculado (`publicar-e-matricular.ts`).

## Conferência dos vídeos (quadro a quadro)

| Vídeo | Duração | Câmeras | Pílulas | Letreiro | Pergunta a seguir | Marca d'água / cores | Nota |
|---|---|---|---|---|---|---|---|
| V00 | 31,4 s | 3/4 → frontal na chamada | — | "Thiago · Seu orientador · DNA Work" | "Como você começa o primeiro contato?" | ok / ok | ok |
| V01 | 36,3 s | esquerda | "Na primeira mensagem": equipe · pedido · numa mensagem | — | **"Como procede?"** (vaga, achado 7) | ok / véu marinho, laranja | ok |
| V02 | 27,0 s | 3/4 → frontal na chamada | — | "Thiago · Seu orientador · DNA Work" | **"Qual o próximo passo?"** (vaga) | ok / ok | ok |
| V03 | 34,2 s | esquerda | "Antes de enviar, confira": destinatário · conteúdo · anexos | — | — (segue para a missão) | ok / ok | ok |

Rosto e roupa iguais em todos os planos; boca acompanha a fala; voz masculina leve, a mesma nos 4. Os vídeos saíram mais curtos
que a estimativa (129 s reais × 153 s estimados).

## QA como aluno

- **Motor (todos os caminhos, `04-caminhos.ts`):** aula 1 = 9 caminhos, todos terminam em `fim_aula_01`; aula 2 = 1.029 caminhos
  (3 escolhas × missão × avaliação com 2 tentativas), fins `fim_aula_02` (405) e `fim_aula_02_revisar` (624). Nenhuma cena inalcançável.
- **Área do aluno (Playwright isolado, `aluna@demo.local`, computador 1366 px e celular 390 px):** escolhas forte/ok/fraca mostram
  "Sua escolha" + retorno "Faça assim…" e seguem para o vídeo; chamada "Agora é com você…" aparece na pergunta; missões M01/M02
  montam a frase tocando nos blocos ("Usar esta frase"); avaliação com acerto ("Correto") e com reprovação ("Não foi dessa vez",
  2 tentativas, depois "Reveja as aulas deste módulo"); fim de aula com "O que você levou" + Meu roteiro. 0 erros no console.
- **Alunos de teste (simulação, rev. 24):** média 4,2; 5 de 5 recomendariam; todos terminam em ~7,2 min.
  4 perfis reclamam de texto na tela em Q01/Q02 — ver achado 10 (a conta do simulador soma os 3 retornos; o aluno vê ~75 palavras).

## Onde precisei contornar (achados para o motor)

1. **Instrutor novo não tem caminho de import.** `--kit` exige câmeras prontas; `novo-instrutor.ts` exige um curso já existente.
   Contorno: import com o kit de outro instrutor (Rafael) só para criar o rascunho. Sugestão: `novo-instrutor` gravar as câmeras
   num `presenter` da biblioteca sem precisar de curso, ou o import aceitar instrutor pendente.
2. **`novo-instrutor` não registra nada na biblioteca.** Precisei de script próprio para `presenter` + `kit` (os 10 instrutores
   novos repetem isso). Sugestão: ao terminar, gravar `instrutor-<nome>` e `estudio<N>-<nome>`.
3. **Aplicar kit não refaz a direção.** `applyTemplateToCourse` trocou elenco/câmeras/letreiro, mas os planos continuaram com
   `cameraId` `cam_r7_*` (câmeras que já nem estavam no rascunho). Daria vídeo com o Rafael ou erro. Contorno: reimportar com o
   kit novo (só possível porque ainda não havia vídeo). Sugestão: remapear os planos por zona (esq/dir/3/4) ao aplicar o kit, ou recusar com aviso.
4. **Reimportar apaga ajustes de marca.** `branding.videoPalette` e o letreiro curto somem a cada reimport. Sugestão: o import
   preservar `videoPalette`/`wordmark` do rascunho existente, ou aceitar `--palette base,accent`.
5. **Letreiro cortado.** Sem `--wordmark`, o import usa o título e corta em 40 caracteres com "…" ("WhatsApp profissional sem
   passar vergon…"). Sugestão: avisar no import ou cortar em fim de palavra.
6. **Orçamento padrão inclui vídeo das perguntas.** Sem `nodeIds`, a cotação inclui Q01–Q03 em vídeo (US$ 3,93 em vez de US$ 3,20),
   mesmo com `Voz opcional: não`. Contorno: cotar com `nodeIds` dos V. Sugestão: respeitar "Voz opcional: não" na cotação.
7. **"Pergunta que vem a seguir" vaga.** `decisionQuestion` usa só a última frase com "?" do texto da pergunta; títulos de duas
   frases ("Você precisa mandar um áudio longo. Como procede?") viram "Como procede?" no V01, e "Qual o próximo passo?" no V02.
   O mesmo vale para o título da tela da pergunta e da avaliação ("Como agir?"). Já gravado, não regravei.
   Sugestão: usar a frase inteira quando a última tiver menos de ~5 palavras (ou a `Chamada:`), e avisar no import.
8. **HeyGen sem créditos no meio do lote.** V00/V03 falharam com "Insufficient credits" (não cobrado). Sugestão: checar o saldo
   do provedor antes de aceitar o lote.
9. **Player: resultado da pergunta anterior fica na tela da avaliação.** Na pergunta 2 da revisão, o cartão "Não foi dessa vez" da
   pergunta 1 continua em cima, como se fosse da pergunta atual (`04-telas/av01-resultado-anterior.png`). E o fim reprovado mostra
   o selo "Curso concluído" ao lado de "Não foi dessa vez" (`04-telas/fim-reprovado.png`).
10. **Simulador de alunos superestima o texto das perguntas.** `nodeScreenWords` soma os retornos das 3 alternativas, mas o aluno
    só vê o retorno da escolha dele. Q01 dá ~105 "palavras" no simulador; na tela são ~75. Sugestão: contar só um retorno.
11. Avisos de publicação dizem "reação **da instrutora**" mesmo com instrutor homem (`REACTION_MISSING`). Sugestão: usar o pronome.
12. Bom: o campo novo `Chamada:` funcionou (plano final na câmera frontal); o cartão "Sua escolha" já aparece junto com o vídeo
    seguinte; editar texto de pergunta depois da gravação não invalidou os vídeos (cotação com tudo reaproveitado).

## Custo

| Item | Valor |
|---|---|
| Rosto do Thiago (1 personagem + 3 câmeras) | ~4 créditos HeyGen (sessão principal, `lote-rostos.sh`) |
| Vídeos V00–V03 | **US$ 3,20** estimado (`cost_actual_usd` ainda vazio no banco); falhas por crédito = US$ 0 |
| Busca de voz, import, biblioteca, QA, publicação | US$ 0 |

Dentro do teto de US$ 4 por curso.
