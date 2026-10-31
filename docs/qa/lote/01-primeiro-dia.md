# Lote 01 — Primeiro dia: como chegar preparado (2026-10-30)

**Situação: PUBLICADO** (versão 1, da revisão 14 do rascunho), com os alunos de teste matriculados.

| Item | Valor |
|---|---|
| Curso | `crs_99hpdsc8w88osiuh` (slug `primeiro-dia-como-chegar-preparado`) |
| Roteiro | `docs/roteiros/lote/01_primeiro_dia.md` (cópia ajustada de `~/Downloads/01_primeiro_dia.md`) |
| Instrutora | Marina, "Sua orientadora" (kit `estudio7-marina`, estúdio 7, câmeras `cam_j7_34`/`cam_j7_esq`/`cam_j7_dir`) |
| Voz | Ana Dias (ElevenLabs `MZxV5lN3cv7hi1376O0m`), a do kit (nenhuma voz nova) |
| Paleta | invertida: `branding.videoPalette = { base: #FF7A08, accent: #1D1E4C }` |
| Estrutura | 1 módulo, 2 aulas, 4 vídeos, 3 decisões, 2 missões de montar frase, avaliação com 3 perguntas (2 de 3), cerca de 7,2 min |
| Vídeos | V00 (33,7 s), V01 (44,4 s), V02 (29,5 s), V03 (40,1 s): 1920×1080, 25 fps |
| Matrículas | `enr_bzz4x6wyc286nh1g` (aluno@demo.local), `enr_7new99llbd6ees3e` (aluna@demo.local), na versão 1 |
| Custo | **US$ 3,18** (orçamento `mqt_j4rs1ulq8s0q5e2p`, só V00–V03; perguntas só em texto). Limite do curso: US$ 4 |

## Linha do tempo

1. Importação sem gravar nada (dry-run) com `--kit estudio7-marina`: 0 erros.
2. Ajustes na cópia do roteiro, sem custo:
   - erro de digitação no objetivo final ("consegue confirma" → "confirmar… e comunicar");
   - ponte com o aluno: a cena depois de cada resposta começa com "Seja qual for a sua escolha…" e serve para qualquer escolha;
   - V02 não entrega mais a resposta antes da Q03, e a explicação ficou no V03 (regra do roteiro: "a primeira decisão de cada aula vem antes da explicação");
   - a frase que chama o aluno ("Agora é com você…") foi para o campo `Chamada:` de cada Q, quando o motor passou a aceitar esse campo;
   - `Cartão:` em V01 e V03 para gerar as pílulas (ver achado 2).
3. Importação real e 3 reimportações enquanto ainda não havia vídeo (revisões 2 a 8). Paleta aplicada por script depois de cada reimportação (revisão 9).
4. Orçamento oficial (rota quote, não cobra): sem filtro deu US$ 3,81 (incluía Q01–Q03 lidas pela Marina). Com `nodeIds` V00–V03 ficou em **US$ 3,18**.
5. O disparo pago desta sessão foi **bloqueado pelo modo automático** (como as regras previam). A aprovação veio da sessão principal, com as palavras do usuário ("organize todas as sessões, aprovo a construção" e "Produção e entrega. APROVO"). A sessão principal disparou o lote às 12:23. Os vídeos ficaram prontos entre 12:26 e 12:30; o V01 precisou de 2 tentativas do worker, sem custo de orçamento a mais.
6. Conferência quadro a quadro, ajustes de texto sem reimportar (revisão 14), QA na prévia e na área do aluno, publicação e matrícula.

## Conferência quadro a quadro

Folhas de contato de 16 quadros por vídeo, mais recortes do letreiro, das pílulas, do cartão "pergunta a seguir" e da marca d'água.

| Vídeo | Rosto/câmeras | Voz | Pílulas | Letreiro | Pergunta a seguir | Marca d'água | Cores |
|---|---|---|---|---|---|---|---|
| V00 | Marina na 3/4; corte para a lateral esquerda na chamada | Ana Dias, sem silêncio longo (média −23 dB) | — (sem cartão) | "Marina · Sua orientadora · DNA Work" no começo | "O que falta confirmar?" | DNA Work, rodapé direito | véu laranja, texto marinho ✔ |
| V01 | lateral esquerda o vídeo todo | ok | "Antes de sair, pergunte": Documentos · Entrada · Canal, acendendo quando ditas | — | "Como você resolve uma dúvida de documento?" | ✔ | ✔ |
| V02 | 3/4, depois lateral esquerda na chamada | ok | — | ✔ (primeira cena da aula 2) | "Como você avisa?" | ✔ | ✔ |
| V03 | lateral esquerda | ok | "Avise sem inventar": O fato · A previsão · Quando | — | — (segue para missão, correto) | ✔ | ✔ |

- O roteiro falado de cada gravação bate com o rascunho e termina com a chamada (V00–V02).
- Voz `MZxV5lN3cv7hi1376O0m` e paleta conferidas no pedido de cada vídeo.
- Não há transcrição automática do áudio nesta máquina (sem modelo do whisper). A conferência da fala foi feita pelo texto enviado e pelos níveis de áudio, não de ouvido.

## QA como aluno

- **Prévia (estúdio, revisão 14), aula 1:**
  - V00 → Q01 (resposta fraca): o cartão "Sua escolha" + retorno aparece antes do V01;
  - V01 → Q02 (forte) → M01 (montei "os documentos necessários" + "qual canal usar se houver um imprevisto") → Meu roteiro com a frase, o checklist e "O que você levou".
- **Prévia, aula 2:**
  - V02 → Q03 (fraca) → V03 → M02 ("Pular" funciona; o roteiro mostra "Monte na aula 2");
  - avaliação: pergunta 1 errada duas vezes, 2 e 3 certas, resultado 2 de 3 → aprovado → "Curso concluído" + vinheta + roteiro.
  - O fim "revisar" (menos de 2 acertos) é alcançável segundo a validação. Não o percorri clicando.
- **Toda escolha leva a algum lugar:** as 3 opções de Q01, Q02 e Q03 convergem para a cena seguinte (conferido no grafo e pela validação: todas as cenas alcançáveis). Avaliação: 2 tentativas por pergunta.
- **Área do aluno (aluno@ e aluna@, login próprio):**
  - o curso aparece em `/aprender` como "Novo · 2 aulas";
  - as páginas da matrícula e das duas aulas respondem 200;
  - os 4 vídeos tocam para o aluno (`/api/assets/...` 206 video/mp4).
- **Textos:**
  - nada de CIEE/IEL/futsal/slogan;
  - a DNA Work aparece só como quem oferece o curso;
  - "sua orientadora" no feminino;
  - corrigidos na revisão 14: pergunta da Q03 (ver achado 5) e rótulo "previsao" → "previsão" (achado 6).
- **Alunos de teste (simulação sem custo):**
  - notas 4, 4, 4, 4 e 5; todos terminam em cerca de 7 min e todos indicariam;
  - única queixa: Q01/Q02 com cerca de 103–106 palavras para ler no celular.

## O que funcionou sozinho

- `import-markdown-course.ts --kit estudio7-marina`: estúdio, instrutora, voz, letreiro, marca d'água, vinheta, pronome e alunos de teste, sem tocar em outro curso.
- Direção do estúdio com zonas: as cenas alternam a 3/4 e as laterais. As pílulas ficam na lateral, com o "acender quando dito". A chamada é um plano próprio, olhando para a lente.
- A paleta invertida chegou ao vídeo (véu das pílulas, letreiro, cartão "pergunta a seguir"). O texto escolheu marinho sobre laranja, legível.
- Orçamento oficial com filtro por cena, teto de 24 h informado, gravação e composição sem intervenção, preservação dos vídeos ao editar texto de outras cenas.
- Prévia, publicação, matrícula, área do aluno, "Meu roteiro" com a frase montada, vinheta no fim do curso.

## Onde precisei contornar (achados para o motor)

1. **Paleta sem opção no importador, e reimportar apaga a paleta.** Não há `--palette` nem paleta no kit. Usei um script meu (`packages/db/src/scripts/lote/01-primeiro-dia-paleta.ts`) rodado depois de cada importação. *Sugestão:* `--palette base,accent` no importador e/ou `videoPalette` no kit/branding da biblioteca; reimportar deveria preservar a `branding.videoPalette` do rascunho.
2. **"Texto na tela" sozinho não gera pílulas.** As pílulas só saem de `Cartão:`, mas o roteiro do GPT diz "texto na tela sem cartões conceituais". Sem ajuste, os 4 vídeos sairiam sem nenhuma pílula. Acrescentei `Cartão:` com 3 tópicos curtos em V01 e V03. *Sugestão:* com kit de pílulas, gerar pílulas a partir do "Texto na tela" (já vem em "A · B · C") ou ajustar `docs/prompts/prompt-gpt-roteiro-curso.md` para pedir `Cartão:`.
3. **"Voz opcional: não" não é respeitado no orçamento nem nos avisos.** O orçamento sem filtro incluía Q01–Q03 lidas pela Marina (+US$ 0,63). A validação e a publicação seguem avisando `MEDIA_MISSING` nas 3 perguntas (que são só texto de propósito). *Sugestão:* pergunta com voz opcional "não" fica fora do orçamento padrão e não gera `MEDIA_MISSING`.
4. **`Chamada:` entrou no motor durante o trabalho.**
   - A primeira importação avisou `CHOICE_NO_CALL`, mesmo com a fala já terminando em "Agora é com você…": o motor procura a chamada no campo `bridge.call`, não na fala.
   - Movi as frases para `Chamada:`, e o motor monta o plano final certinho.
   - *Sugestão:* incluir `Chamada:` no prompt do GPT. O importador poderia reconhecer quando a fala já termina com "Agora é com você…" e usar essa frase como chamada.
5. **A pergunta da decisão repete o título.**
   - O importador junta "Situação" + título da cena no texto da pergunta. Ficou "…não há previsão segura de retomada. O transporte parou. Como você avisa?" (repete o que a situação acabou de dizer).
   - O player usa esse último parágrafo como título do cartão.
   - Corrigi no rascunho por script (`01-primeiro-dia-ajustes.ts`), sem reimportar.
   - *Sugestão:* usar só a parte da pergunta do título (a frase com "?") ou um campo `Pergunta:`.
6. **Rótulo de lacuna sem acento.** `{informacao}` virou "informação", mas `{previsao}` ficou "previsao". O aluno vê esse rótulo na frase da missão. *Sugestão:* dicionário de acentos mais completo ou sintaxe `{previsao|previsão}`.
7. **Player: "Responder de novo" queima a 2ª tentativa.** Na avaliação, depois do erro, o botão "Responder de novo" é de envio. Clicar sem trocar a alternativa reenvia a mesma resposta errada e encerra a pergunta ("0 de 1 em 2 tentativas"). *Sugestão:* o botão só reabre a escolha, ou fica desativado até a resposta mudar.
8. **Disparo pago bloqueado pelo modo automático** (previsto nas regras). Deixei o comando seguro `packages/db/src/scripts/lote/01-primeiro-dia-gravar.sh`: refaz a cotação e só dispara se forem as cenas aprovadas e o valor máximo. A sessão principal disparou pelo `lote-videos.sh`.
9. **Teto diário compartilhado apertado.** No orçamento: gasto US$ 30,42, restam US$ 19,58 para 12 cursos de cerca de US$ 3 cada (cerca de US$ 38). Avisei na entrega.
10. Menores (sem ação):
    - o logo 3D da parede aparece de leve através do véu laranja das pílulas;
    - o cartão "pergunta a seguir" cobre a ponta da prateleira/planta à direita;
    - o título longo do curso aparece cortado no cabeçalho do player em 800 px ("primeiro dia: como chegar pr…");
    - duração estimada de 7,2 min contra a meta de 10 do roteiro;
    - Q01/Q02 com cerca de 105 palavras na tela (queixa dos alunos simulados).

## Arquivos desta sessão (sem commit)

- `docs/roteiros/lote/01_primeiro_dia.md`: roteiro ajustado.
- `packages/db/src/scripts/lote/01-primeiro-dia-paleta.ts`: paleta invertida (idempotente).
- `packages/db/src/scripts/lote/01-primeiro-dia-ajustes.ts`: Q03 e rótulo da M02, sem reimportar (idempotente).
- `packages/db/src/scripts/lote/01-primeiro-dia-publicar.ts`: publica o rascunho atual e matricula os alunos de teste (idempotente).
- `packages/db/src/scripts/lote/01-primeiro-dia-gravar.sh`: disparo pago com travas (não usado; a sessão principal disparou).

**Não reimporte este curso:** a reimportação apaga a paleta e os ajustes da revisão 14. Se for preciso, rode depois `01-primeiro-dia-paleta.ts` e `01-primeiro-dia-ajustes.ts`.
