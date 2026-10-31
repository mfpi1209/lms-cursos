# Lote 12 · Curso 12 — Como receber uma correção de postura

Curso: `crs_5vccpfypr6fmxojb` (slug `como-receber-uma-correcao-de-postura`) · instrutora nova **Helena**
(Sua orientadora) · voz Ádria Freitas · estúdio 8 · paleta clássica (`#1D1E4C` / `#FF7A08`).

**Estado (30/10, fim do dia): ENTREGUE.** Publicado na **versão 4** (revisão 31): 4 vídeos de cena +
9 reações da instrutora, os 13 em −20 LUFS. Alunos de teste matriculados e já na versão 4
(`aluno@demo.local` → `enr_3kyp22x0tybmkpke`, `aluna@demo.local` → `enr_uorj1p06mfm4etjr`).
Republicar: `publicar-e-matricular.ts crs_5vccpfypr6fmxojb`, que move as matrículas.

## Linha do tempo

| Passo | Quem | Situação |
|---|---|---|
| Roteiro copiado e ajustado (`docs/roteiros/lote/12_correcao_de_postura.md`) | esta sessão | feito |
| Voz escolhida e registrada (`voz-adria-freitas`) | esta sessão | feito |
| Importação (rascunho rev 2) com kit provisório `estudio7-marina` | esta sessão | feito |
| Elenco sem duplicar a Helena (rev 4, `lote/12-ajustes.ts`) | esta sessão | feito |
| Rosto + 3 câmeras no estúdio 8 (`lote/12-gerar-helena.sh`) | 1ª tentativa: usuário (falhou, HeyGen sem crédito de API); depois o piloto da sessão principal | feito |
| Presenter `instrutor-helena` + kit `estudio8-helena` (`lote/12-biblioteca.ts tudo`) | piloto | feito |
| Kit + paleta clássica no curso (`lote/aplicar-kit.ts`) | piloto | feito |
| Vídeos V00–V03 (perguntas só em texto) | piloto, 13:14 | feito, US$ 3,37 |
| Conferência quadro a quadro | esta sessão | feito (ver abaixo) |
| QA como aluno (desktop e celular, todas as escolhas, avaliação aprovada e reprovada) | esta sessão | feito |
| Publicação v1 + matrículas (`lote/12-publicar.ts`) | esta sessão | feito |
| Volume normalizado nos 4 vídeos (`lote/12-normalizar.ts`): 1º em −16 LUFS (rev 20, v2); refeito dos originais em **−20 LUFS** (rev 21, **v3**), matrículas movidas | esta sessão, a pedido da sessão principal | feito |
| Reações da instrutora às respostas (A14: q01~a…q03~c) | sessão da ponte / worker | feito, 9 de 9 (7,8 a 10,7 s), US$ 1,45 |
| Volume das 9 reações (−31 a −35 → −20 LUFS) + publicação **v4** + matrículas | esta sessão | feito |

## Ajustes no roteiro

- "Eu sou a Marina…" → "Eu sou a Helena, sua orientadora…"; "Direção da instrutora: Helena"; a
  orientadora saiu da linha "Personagens de exemplo" (ver achado 4).
- Objetivo final: "a pessoa consegue **pede**" → "consegue **pedir**".
- V00: "comentário sobre **sua** postura" → "sobre **a postura dela**" (o "sua" soava como do aluno).
- Ponte com o aluno pelo campo `Chamada:` (o motor grava como plano final olhando para a lente):
  - Q01: "Agora é com você: o que você faria no lugar da Alana?"
  - Q02: "Agora é com você: o Vitor tem um contexto importante. Quando ele explica?"
  - Q03: "Agora é com você: qual combinado a Alana pode fazer?"
- Retomada que serve para qualquer escolha:
  - V01 abre com "Seja qual for a sua escolha, o caminho começa por entender o que a pessoa viu."
  - V03 abre com "Qualquer combinado fica mais fácil quando dá para ver a mudança acontecer." e fecha
    com "Agora, monte o seu próximo combinado." (antes da missão M02).
- Tom sensível mantido: pedir exemplo, explicar o contexto com calma, buscar apoio diante de insulto,
  ameaça ou exposição, adulto de confiança para adolescentes, "não obriga a aceitar humilhação nem
  abandonar seu jeito de ser".
- Falas: V00 86, V01 95, V02 82, V03 100 palavras, sem a chamada (todas abaixo de 120).

## Instrutora e voz

- **Voz:** Ádria Freitas (biblioteca pública do ElevenLabs), `lxZ1N0qzmAGjqcuEctoH`, dona
  `10b0f198…68ac`; feminina, meia-idade, pt-BR, educacional ("gentle yet strong, direct yet
  welcoming"). Registrada como `voz-adria-freitas` antes de outra sessão pegá-la.
- **Rosto (prompt só com texto, personagem fictícia):** mulher negra de uns 45 anos, pele marrom-escura,
  cabelo crespo grisalho bem curto, expressão calma e acolhedora, blusa de malha terracota com
  blazer de linho bege aberto, brincos pequenos. O resultado bate com o perfil e é consistente nas 3
  câmeras.
- **Biblioteca:** `voz-adria-freitas` (voice), `instrutor-helena` (presenter, câmeras
  `cam_helena8_esq` / `_dir` / `_34`), `estudio8-helena` (kit).

## Conferência dos vídeos

Folhas de contato a cada 2 s, quadros inicial e final, recortes do letreiro e do aviso de pergunta,
volume medido com `ffmpeg volumedetect`.

| Vídeo | Duração | Rosto/câmeras | Voz | Pílulas | Letreiro | Pergunta a seguir | Marca d'água | Cores |
|---|---|---|---|---|---|---|---|---|
| V00 | 39,2 s | 3/4 + chamada na esquerda; rosto estável | certa (baixa → corrigida) | — | "Helena · Sua orientadora · DNA Work" | "Como responde?" | ok | marinho/laranja ok |
| V01 | 43,2 s | esquerda o vídeo todo (parede livre vazia) | certa (baixa → corrigida) | — | — (2º vídeo da aula) | "Quando explica?" | ok | ok |
| V02 | 38,4 s | 3/4 + chamada na esquerda | certa (baixa → corrigida) | — | ok | "Qual combinado permite verificar uma mudança?" | ok | ok |
| V03 | 42,6 s | esquerda o vídeo todo (parede livre vazia) | certa (baixa → corrigida) | — | — | — (vem a missão) | ok | ok |

- Reações (q01~a…q03~c): Helena na 3/4, rosto e roupa iguais aos das cenas, marca d'água, 7,8 a 10,7 s;
  tocam logo depois da escolha, antes do cartão "Sua escolha" (conferido no player do aluno).
- Chamadas faladas no fim de V00, V01 e V02 (as transcrições terminam com elas); V03 fecha com
  "Agora, monte o seu próximo combinado."
- Legendas (VTT pt-BR) nos 4 vídeos.
- Nada de futsal, CIEE, IEL ou slogan no roteiro, nas falas e nas telas.

## QA como aluna (área do aluno, versão 1)

Playwright (`lote/12-qa-aluno.mjs`), 1366×820 e 390×844 (celular):

- Aula 1: as 3 alternativas de Q01 e de Q02, missão M01 montada, "Meu roteiro" com os 2 aprendizados,
  "Próxima aula". Chega ao fim em todos os caminhos.
- Aula 2: as 3 alternativas de Q03, missão M02, avaliação **aprovada** (2 de 3 ou mais) e **reprovada**
  em 2 tentativas ("Não foi dessa vez" + "Reveja as aulas deste módulo"). Chega ao fim nos dois.
- 0 erro no console em 6 percursos. Feedback "Faça assim:" aparece no cartão "Sua escolha" antes de seguir.
- Alunos de teste simulados (`lote/12-alunos.ts`): média **4,2**, 5 de 5 recomendariam, ~7,3 min.
  Queixa comum: Q01 tem 109 palavras para ler no celular.

## Achados (o motor entrega sozinho?)

1. **Voz da Helena ~14 dB mais baixa que a de todos os outros cursos.** Volumedetect: média −38 dB e
   pico −15,7 dB, contra −21 a −29 dB de média e −4 a −8 dB de pico nos outros 13 cursos (cerca de
   −34 LUFS contra cerca de −20 LUFS nas referências). A amostra pública da voz já é baixa (−32/−12,5),
   e o motor não normaliza o volume na montagem. **Contorno (decidido pela sessão principal):**
   `lote/12-normalizar.ts`, sem custo, faz loudnorm em 2 passadas, sempre a partir do original, copia o
   vídeo sem recodificar, cria assets novos (`metadata.loudnorm` aponta a origem e o alvo) e troca o
   `assetId` no rascunho, mantendo legendas, transcrição e `generatedFrom`. 1ª rodada em −16 LUFS (v2).
   Como os outros cursos medem cerca de −20 LUFS (aviso da sessão da ponte), a sessão principal pediu
   **−20 LUFS**: refeito dos originais, com resultado de −19,9 a −20,1 LUFS e pico de −1,5 a −1,8 dBTP
   (v3). Durações iguais às originais; o player do aluno carrega o asset novo. O alvo único para todos
   os cursos, com normalização no compositor, fica para o item **A15**. *Sugestão:* o seletor de voz
   medir o volume da amostra e avisar.
2. **"Texto na tela" não vira pílula.** O motor só põe pílulas quando a cena tem `Cartão:`; este
   roteiro diz "sem cartões conceituais". Os 4 vídeos saíram sem pílulas, e em V01/V03 a parede livre
   fica vazia o vídeo todo. Mesmo achado dos cursos 01–11; a sessão principal decidiu publicar assim
   (item A11: pílulas a partir de "Texto na tela"). Para uma regravação: `Cartão:` em V01
   ("Escuta · Exemplo · Expectativa") e V03 ("Ação · Revisão · Apoio").
3. **Script de instrutor novo só servia para homem.** `novo-instrutor.ts` tinha `pronoun: 'he'` fixo
   e a descrição do estúdio 7 como padrão. Avisei; a sessão principal corrigiu (`PRONOUN`, descrição por
   `ESTUDIO`, prefixo sem acento, `COURSE_ID`/`INSTRUTOR` obrigatórios).
4. **Com `--kit`, `--presenter Helena` é ignorado, e a orientadora vira "personagem de exemplo".** O
   elenco e o letreiro ficaram "Marina", e a linha "Personagens de exemplo" (que traz a orientadora
   virtual) gerou "Helena — Personagem de exemplo (fictício)". Contorno: tirei a entrada no rascunho
   (`12-ajustes.ts`) e a orientadora da linha de personagens da cópia do roteiro. *Sugestão:* o
   importador reconhecer "orientador(a) virtual" e `--presenter` valer também com kit.
5. **Kit e instrutor novo dependem um do outro.** O kit exige câmeras prontas, mas o script de câmeras
   precisa de um rascunho. Contorno: importar com um kit emprestado, gerar as câmeras e registrar
   presenter + kit (`12-biblioteca.ts`). *Sugestão:* um comando único "novo instrutor" que termina
   criando presenter e kit.
6. **O importador não tem `--palette`.** A paleta entra por script (`aplicar-kit.ts`).
7. **HeyGen sem crédito de API** na 1ª tentativa: "Insufficient credit. This operation requires 'api'
   credits." O script falhou sem cobrar e travou todos os instrutores novos até a recarga.
8. Detalhes de texto/UX (não corrigidos, para não mexer no que a ponte está gravando):
   - Q03 fraca: "para não ser **corrigida** novamente" fica no feminino na boca de qualquer aluno.
     Sugestão: "para não receber outra correção".
   - "Pergunta que vem a seguir" usa só a última frase do título ("Como responde?", "Quando explica?").
   - Na reprovação, o fim mostra "Curso concluído" e só o resultado da última pergunta (comportamento
     do motor, que o roteiro pede para preservar).
   - A caixa "Pergunta que vem a seguir" encosta no painel marinho da direita no 3/4 do estúdio 8 (V02).
9. **Republicar não move as matrículas.** `enrollStudent` mantém a matrícula na versão antiga, e o
   script copiado do curso 01 imprime "→ versão 2" mesmo assim, o que engana. Contorno: usar
   `publicar-e-matricular.ts`, que move a matrícula quando as aulas e cenas são as mesmas.
10. **Funcionou sozinho:** importação sem erros; `Chamada:` virou plano final olhando para a lente;
   letreiro só no 1º vídeo de cada aula; paleta clássica no letreiro e no aviso; marca d'água; legendas;
   4 de 4 vídeos de primeira; publicação e matrícula; QA sem erro no console.

## Custo

| Item | Custo |
|---|---|
| Voz (adicionar à conta ElevenLabs) | grátis |
| Rosto + 3 câmeras (HeyGen) | ~4 créditos HeyGen (1ª tentativa sem custo) |
| Vídeos V00–V03 | **US$ 3,37** (estimado pelo motor; dentro do teto de US$ 4) |
| Reações A14 (9 vídeos curtos, pedido da sessão da ponte) | US$ 1,45 (fora do teto de US$ 4 dos vídeos deste curso) |
| Normalização de volume (13 vídeos) | grátis (ffmpeg local) |
| **Total em vídeo** | **US$ 4,82** (US$ 3,37 + US$ 1,45) |
