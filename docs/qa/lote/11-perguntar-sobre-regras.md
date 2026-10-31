# Curso 11 · "Não entendi a regra. Como pergunto?" (lote de 12, 2026-10-30)

- Curso: `crs_u4nfw88a4n2n0ubv` (slug `nao-entendi-a-regra-como-pergunto`)
- Roteiro: `docs/roteiros/lote/11_perguntar_sobre_regras.md` (cópia adaptada de `~/Downloads/11_perguntar_sobre_regras.md`)
- Instrutor: **Renato**, "Seu orientador" (homem pardo, 34, óculos, cardigã), estúdio 6, câmeras `cam_renato6_esq|dir|34`
- Voz: **Campanholi** (ElevenLabs, biblioteca pública, "professor, 40 anos, voz clara e didática"), `AaeZyyi87RCxtFnHPS3e`
- Biblioteca: `voz-campanholi` (voice), `instrutor-renato` (presenter), `estudio6-renato` (kit)
- Paleta invertida: `branding.videoPalette = { base: "#FF7A08", accent: "#1D1E4C" }`
- Scripts desta sessão: `packages/db/src/scripts/lote/11-biblioteca-renato.ts`, `11-ajustes.ts`

## Situação

**Pronto e publicado** (versão 1, da revisão 19 do rascunho). Matriculados: `aluno@demo.local`
(`enr_hjaqqdxbqqm60qbn`, já percorreu o curso inteiro no QA: 2 de 2 aulas) e `aluna@demo.local`
(`enr_p7wr9c6ipxa11ji4`, intacta). Avisos da publicação: 3 × `MEDIA_MISSING` nas perguntas Q01–Q03 (esperado:
perguntas só em texto).

O motor entregou quase tudo sozinho: importação, chamada antes das perguntas, kit, direção em zonas, vídeos,
legendas, letreiro, cartão "pergunta a seguir", marca d'água, paleta, publicação. Contornos: 5 achados abaixo
(nenhum exigiu editar código do motor).

## Passo a passo (o que aconteceu)

1. Voz escolhida pela busca grátis `/v1/shared-voices?language=pt&accent=brazilian&gender=male` e registrada
   na biblioteca na hora (`11-biblioteca-renato.ts voz`), antes de qualquer gasto, para nenhum outro curso pegar.
2. Roteiro adaptado: "Eu sou o Renato, seu orientador"; a chamada antes de cada pergunta foi para o campo novo
   `Chamada:` do importador (o motor grava como plano final próprio, voltado para a lente); a cena depois da
   resposta abre com "Seja qual for a sua escolha…"; corrigido "consegue pede" → "consegue pedir".
3. Importado com o kit `estudio7-rafael` (provisório: o kit só aceita instrutor com câmeras prontas), paleta
   aplicada por `11-ajustes.ts`.
4. Visual do Renato (1 personagem + 3 câmeras no estúdio 6) gerado com `gerar-instrutor.sh` (`11-gerar-renato.sh`) rodado no Terminal;
   a sessão principal gravou o presenter + kit (`11-biblioteca-renato.ts instrutor`) e aplicou o kit
   (`11-ajustes.ts --kit estudio6-renato`): 21 planos remapeados para `cam_renato6_*`, letreiro "Renato · Seu orientador".
5. Vídeos V00–V03 gravados pelo `lote-videos.sh` (perguntas só em texto).

## Onde precisei contornar (achados para o motor)

1. **Kit apaga as flags do importador.** `import-markdown-course.ts --kit … --presenter/--avatar-name/--voice/--voice-name`
   aplica as flags e depois `applyKitToDocument` sobrescreve tudo de novo: o rascunho saiu com Rafael e voz Gabriel
   no elenco, letreiro e apresentação. O cabeçalho promete "voz/nome sobrescritos pelas flags valem por cima".
   Sugestão: aplicar as flags DEPOIS do `applyKitToDocument` (ou recusar a combinação com mensagem clara).
2. **Instrutor novo não tem caminho de importação direto.** Kit exige câmeras prontas, câmeras exigem um rascunho:
   foi preciso importar com o kit de outro instrutor (Rafael, estúdio 7) e trocar depois. Sugestão: `--kit` aceitar
   instrutor ainda sem câmeras ("pendente"), importando com estúdio + voz + nome certos e câmeras vazias.
3. **Instrutor na linha "Personagens de exemplo" vira personagem fictício.** O roteiro de origem lista "Marina,
   orientadora virtual da DNA Work" entre os personagens; o importador cria um personagem de exemplo com esse nome
   (ficaria "Renato" duas vezes no elenco). Tirei da linha. Sugestão: ignorar/avisar quando o nome bate com o instrutor.
4. **O orçamento padrão inclui as perguntas.** `media-jobs/quote` sem `nodeIds` orçou 7 cenas (US$ 3,96), incluindo
   Q01–Q03, mesmo com "Voz opcional: não" no roteiro. Só com `nodeIds: [v00…v03]` deu US$ 3,21. Quem clicar
   "gerar todos" no estúdio paga as perguntas. Sugestão: o importador gravar "sem voz" na decisão e o orçamento pular.
5. **Chamada duplicada se o roteirista escreve a chamada dentro da fala** (como pede `docs/lote-12-cursos.md`):
   sem `Chamada:`, o motor acrescenta a padrão no fim ("…o que ela pode perguntar? Agora é com você: escolha a
   resposta que você daria."). Só percebi pelo aviso `CALL_DEFAULT` do dry-run. Sugestão: o doc do lote e o
   prompt do roteiro falarem do campo `Chamada:`; e o importador detectar fala que já termina em "Agora é com você…".

## QA como aluno (prévia do rascunho)

- Aula 1: V00 → Q01 (testei a fraca) → retorno "Sua escolha" + feedback → V01 → Q02 (forte) → M01 montada
  (3 blocos) → "Meu roteiro" com a frase certa. Aula concluída.
- Aula 2: V02 → Q03 (ok) → V03 → M02 (pulada: "Monte na aula 2" no roteiro) → AV01 errando 1ª e 3ª
  (2 tentativas cada) → fim "revisar" ("Você acertou menos de 2 de 3…"). Regras de 2 de 3 conferidas no grafo.
- Toda escolha converge para a próxima cena; toda aula chega ao fim. Sem futsal, CIEE ou slogan; DNA Work só
  como quem oferece o curso.
- Alunos de teste (simulação grátis): Ana Clara 4, Beatriz 4, Diego 4, Jéssica 4, Kauã 5; ~7,2 min, todos terminam.
  Única queixa: Q01 (119 palavras) e Q02 (104) com muito texto no celular (situação + chamada + 3 respostas).
- Observações de UX (motor, não do curso):
  - Na avaliação, errar a pergunta 1 de 3 já mostra "RESULTADO DA AVALIAÇÃO · Não foi dessa vez", parecendo
    que a revisão inteira acabou.
  - No fim "revisar" aparece "Curso concluído" junto com "Não foi dessa vez" (comportamento já existente; o
    roteiro pede para não inventar rota nova).

## Vídeos (conferidos quadro a quadro, folha de contato a cada 5 s)

| Cena | Duração | Câmeras | O que vi |
|---|---|---|---|
| V00 | 39,2 s | 3/4 → lateral esq. (chamada) | letreiro laranja "Renato · Seu orientador · DNA Work" no início; cartão laranja "Pergunta que vem a seguir: O que pergunta?" no plano da chamada |
| V01 | 38,6 s | lateral esq. | Renato no terço esquerdo, parede livre à direita; cartão "Como confirma?" no fim |
| V02 | 38,6 s | 3/4 → lateral esq. (chamada) | letreiro no início (1ª fala da aula 2); cartão "O que faz?" no fim |
| V03 | 39,3 s | lateral esq. | sem cartão (vem antes da missão, não de pergunta) — correto |

- Rosto e figurino iguais ao pedido em todos os planos (homem pardo, óculos, cardigã cinza, camiseta branca);
  sem troca de pessoa entre planos; estúdio 6 com logo DW na estante.
- Voz: jobs com `voiceId` `AaeZyyi87RCxtFnHPS3e` (Campanholi); áudio AAC, volume médio −21 dB, sem silêncios
  longos. **Não ouvi** (sem modelo de transcrição local): vale o usuário escutar um trecho.
- Marca d'água DNA Work no rodapé direito em todos os quadros. Paleta invertida: letreiro e cartão em laranja
  com texto marinho. Legendas VTT anexadas aos 4 vídeos.
- **Pílulas: nenhuma.** O roteiro só tem `Texto na tela:` (sem `Cartão:`), e o importador só cria planos
  `presenter_chips` a partir de `Cartão:`. O "Regra · Exemplo · Limite" aparece só no player, abaixo do vídeo.
  Coerente com o roteiro ("texto na tela sem cartões conceituais"), mas a lista de conferência do lote cita
  pílulas; os cursos 01 e 03 têm pílulas porque o roteiro deles tem `Cartão:`. Achado 6.

## QA na área do aluno (publicado, `aluno@demo.local`)

- Aula 1: V00 (vídeo carrega, legenda CC) → Q01 forte → cartão "Sua escolha" + retorno aparece ANTES do vídeo
  seguinte (o bug relatado pela sessão "ponte" não ocorreu aqui) → V01 → Q02 fraca → M01 montada → "Meu roteiro"
  com a frase. Aula 2: V02 → Q03 forte → V03 → M02 montada → AV01 com 2 de 3 (1ª certa, 2ª errada duas vezes,
  3ª certa) → fim normal, "Curso concluído". Página do curso: "2 de 2 concluídas".
- Console: só o 404 do `favicon.ico`.

## Custo

| Item | Valor |
|---|---|
| Visual do Renato (1 personagem + 3 câmeras, HeyGen) | ≈ 4 créditos HeyGen (sem conversão em dólar no motor) |
| Vídeos V00–V03 (orçamento `mqt_23u99xnu135ocljt`) | **US$ 3,21** estimado (0,81 + 0,80 + 0,82 + 0,77); `cost_actual_usd` vazio |
| Voz (adicionar à conta), simulação de alunos, publicação | US$ 0 |

Perguntas não foram gravadas (economia de US$ 0,74 frente ao orçamento padrão).

## Mais achados

6. **"Texto na tela" sem "Cartão" não vira pílula** (ver Vídeos). Sugestão: o importador montar pílulas com as
   palavras-chave do `Texto na tela:` quando o kit é de zonas, ou o doc do lote deixar claro que pílula = `Cartão:`.
7. **Orçamento do visual do instrutor fora da rota oficial**: `media-jobs/quote` só orça vídeos; o visual novo
   (HeyGen) aparece só como "≈ 4 créditos" no documento.
8. **Teto diário apertado para o lote**: antes deste curso restavam US$ 19,58 de US$ 50 para os 12 cursos.
