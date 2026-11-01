# Revisão pedagógica (Fable): o que foi aplicado no rascunho

Fonte: `fable.md` e `fable.json` (35 itens). Nada foi publicado, commitado, nenhum servidor reiniciado, nenhuma mídia paga (`MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0`). O rascunho dos cursos foi o único lugar editado, mais `packages/course-schema/src/trails.ts` (checagens finais das trilhas: conteúdo fixo em código, não existe rascunho para elas).

Scripts (todos idempotentes, com `--dry-run` por padrão e `--apply` para gravar):
- `packages/db/src/scripts/oneoff/qa-revisao-pedagogica.ts`: textos do rascunho (diff trava qualquer campo fora do previsto, texto atual conferido, controle de revisão) e textos das trilhas. Antes/depois em `aplicado.antes-depois.json`.
- `packages/db/src/scripts/oneoff/qa-p1-devolver-s3.ts`: P1, prepara o rascunho (antes/depois em `p1-devolver-s3.antes-depois.json`).
- `apps/worker/src/scripts/qa-p2-cortar-agente.ts`: P2, corte de áudio pelo ajuste fino existente.

## Resumo

| Tipo | Itens | Quantidade |
|---|---|---|
| Só texto, rascunho dos cursos | P4, P5, P6, P7, P24, P25, P26, P27, P28, P29, P31, P32, P33, P34 | 14 itens (28 campos, 11 cursos) |
| Só texto, checagens finais das trilhas (código) | P9–P23, P30 | 16 itens (39 textos) |
| Vídeo sem regravar (remontagem / corte de áudio) | P1, P2 | 2 itens |
| Só verificação | P8 | 1 item |
| Não aplicados | P3, P35 | 2 itens |

## Itens

| Item | Situação | Onde / motivo |
|---|---|---|
| P1 | **aplicado** | C14·A12·v23: `s3` saiu de `media.adjust.drop` (o `s4` continua fora) e o vídeo foi remontado dos clipes já pagos (custo 0). A `narration` acompanha (fala do s3 entra depois do s2, antes da chamada). Vídeo novo `ast_p06zzctdtw5m41x3`: 29,0 s (era 18,4 s). Validação abaixo. |
| P2 | **aplicado** | C06·A2·v03, plano s2: palavras 18–25 ("ou ao agente de integração do seu contrato.") tiradas com `skip`/`skipText` do ajuste fino; corte no ponto mais silencioso entre "escola" e "ou". Fala agora termina em "…à escola." Vídeo novo `ast_koxza1c8x0a2q6qt`. `narration`, `direction` e `media.transcript` acompanham. Não precisou regravar. |
| P3 | não aplicado | Decisão do dono (cadastro na DNA Work no C14·A3). Texto, opção A, retorno, resumo, checklist e textoTela ficam como estão. |
| P4 | aplicado | C14·A5·fim_aula_05, checklist "Meu LinkedIn": "dez conexões" → "primeiras conexões". |
| P5 | aplicado | C14·A12·fim_aula_12, checklist "Dia da entrevista": "mensagem de agradecimento escrita" → "agradecimento enviado, se houver canal". |
| P6 | aplicado | C14·A12·q24·C, retorno escrito (a reação em vídeo dessa opção segue `disabled`, o aluno vê só o texto). |
| P7 | aplicado | C02: `description` (trecho "Objetivo final") e `brief.finalSkill`. |
| P8 | **verificado, sem ação** | C20·A2·v03: ver abaixo. Não regravei. |
| P9–P23 | aplicados | `trails.ts`: pe1, pe4, pe5, ip1–ip6, rc1–rc3, cv1, cv2, cv6 (só `label`, textos da revisão). Gabarito (opção `correct`) intacto. Resultado do tamanho das opções abaixo. |
| P24 | aplicado | C01·A2·m02: molde ("Minha previsão de chegada está…") e as 3 opções de {previsao}. O "exemplo" do relatório é a frase montada com a 1ª opção de cada lacuna, não é campo guardado (o `prompt` da atividade é outra conversa de exemplo e não foi tocado). |
| P25 | aplicado | C13·A2·m02: instruções (`prompt` da atividade). |
| P26 | aplicado | C21·A2: rótulo da opção B de q04 e lacunas situação (3), alternativa (1ª) e pedido (1ª) de a02. Opções 2 e 3 de alternativa e pedido já eram o texto novo. O "exemplo" é derivado, igual ao P24. |
| P27 | aplicado | C24·A2·a02: ponte (`intro`). Título fica. |
| P28 | aplicado | C08·A2·m02: opções 2 e 3 de {problema}. "Exemplo" derivado, igual ao P24. |
| P29 | aplicado | C14·A9·m08: opção 4 de {hoje} → "já concluí o ensino médio". |
| P30 | aplicado | `trails.ts`: feedback de cv3·c. |
| P31 | aplicado | C05: `description` e `brief.finalSkill`. |
| P32 | aplicado | C07: idem. |
| P33 | aplicado | C11: idem. |
| P34 | aplicado | C12: idem. |
| P35 | não aplicado | Decisão do dono (perguntas com duas opções fortes). |

Nenhum item caiu no caso "texto ligado a fala gravada": a conferência (o texto atual não aparece em transcrição de vídeo, narração, chamada ou fala de reação do curso) passou em todos. Nenhum `textoAtual` divergiu do rascunho.

## Cenas desatualizadas (stale)

- Pelo orçamento de leitura (`POST /api/courses/:id/media-jobs/quote {includeStale:true}`, logado como autor@demo.local) nos 12 cursos mexidos: **0 cenas e US$ 0** antes e depois dos textos, e depois do P1 e do P2. O orçamento só lista cena sem vídeo ou com `stale`/apresentação diferente.
- O script também compara o conjunto de cenas stale (mesmo critério de `qa-atividade-opcional.ts`) antes e depois, curso a curso, e aborta se mudar. Em todos: 0 → 0.
- Os textos trocados são só rótulo de opção, retorno escrito, texto de checklist/molde/ponte/instrução e descrição do curso; nenhum campo falado (`narration`, `bridge.call`, `reaction.text`, enunciado de pergunta, `body`, `direction`, `media`) foi tocado, exceto `narration` do v23 (C14) e do v03 (C06), que acompanham o vídeo remontado.

## P1: validação (C14·A12·v23)

- Whisper (`ggml-large-v3-turbo`) × `media.transcript`: semelhança 1,000, sem palavra a mais nem faltando. A fala "E se a resposta for não? Dói, mas faz parte. Pergunte, com educação, o que você pode melhorar. Anote, ajuste e siga para a próxima." aparece entre o s2 e a chamada.
- Medidor `tools/robo-aluno/trava.py`: 0 trechos ≥ 200 ms (há um de 120 ms em 3,88 s, abaixo do limite).
- ffprobe: vídeo 28,92 s, áudio 29,00 s (0,08 s de diferença, 2 quadros; o limite usado nas revisões anteriores é 0,3 s).
- Desengasgo (`desengasgo.ts crs_hvvgkvtd1rb2um0l --excluir=nenhum --so=aula_12/v23`): 0 vídeos a tratar (a remontagem nova já não tem trecho parado ≥ 200 ms). Usei `--so` para limitar à cena; sem ele o comando varre o curso inteiro.
- Observação: o cartão de tela do v23 ("Duas perguntas · Agradeça · Aprenda com o não") ainda cita "Agradeça", que o vídeo não fala mais (o agradecimento passou a ser opcional no P5). Não está na lista da Fable; não mexi.

## P2: validação (C06·A2·v03)

- Whisper × `media.transcript`: semelhança 1,000; a fala termina em "…pela empresa, à escola." e segue direto em "Se você for adolescente…". Nenhuma sílaba sobrando.
- `trava.py`: 0 trechos ≥ 200 ms (um de 120 ms em 35,2 s). ffprobe: vídeo 42,04 s, áudio 42,10 s.
- Legenda nova (`captions`): sem "agente" nem "integra". Desengasgo na cena: 0 a tratar.
- Resta "agente de integração" só em `media.adjust.baseLines`/`falaOriginal` (gravação original, não é o que o aluno vê) e na versão publicada v9.

## P8: C20·A2·v03 (só verificação)

- Whisper no áudio da cena (`ast_u8j7vsbph9ag19le`): "o que a **EA** devolve" (1,7 s), "resposta de **EA**" (12,9 s), "A **EA** escreveu" (14,9 s). Igual a 0,75× de velocidade e com a dica "IA, inteligência artificial" no whisper: continua "EA" nas três.
- Nos outros vídeos do C20 com a mesma voz (v01, v02, v04, q03) o whisper ouviu "IA" corretamente, e as palavras de v03 são mais curtas (0,09 a 0,15 s contra 0,14 a 0,32 s). Em q02 e q04 ouviu "aí a" no lugar de "à IA" (o "i" aparece, mas a sigla se funde com o "à").
- Conclusão: a sigla **não está clara no v03** (3 de 3 ouvidas como "ea"). O ASR não substitui um ouvido humano, então é um risco real e não um erro provado. Não regravei. Se o dono ouvir e confirmar, a correção da Fable é trocar por "inteligência artificial" nas três frases (≈ 17 s de fala nova).

## Trilhas: tamanho das opções depois da troca (P9–P23)

Critério do raio-X (alerta `opcao_muito_longa`: ≥ 1,5× a média das outras e ≥ 20 caracteres): os alertas das trilhas caíram de 17 para 2 (`rc6`, aceito pela Fable, e `tc5`, trilha nova fora desta revisão).

Das 15 situações reescritas, **8 deixaram de ter a correta como a mais longa** (pe1, pe4, rc1, rc2, ip1, ip2, cv1, cv2). Em **7 a correta ainda é a mais longa, mas por margem pequena** (sobre a média das outras): pe5 1,10×, rc3 1,17×, ip3 1,12×, ip5 1,16×, ip6 1,12×, cv6 1,26× e ip4 1,42× (73 caracteres contra 47 e 56). Nenhuma passa do alerta. As mais folgadas para mexer, se quiser zerar: ip4 e cv6.

Fora desta revisão e inalteradas (já eram as mais longas, todas abaixo do alerta): pe2 1,35×, pe3 1,20×, pe6 1,45×, rc4 1,09×, rc5 1,44×, cv3 1,26×, cv4 1,35×, cv5 1,26×; rc6 4,06× (aceito pela Fable).

## Cursos que mudaram no rascunho (para republicar)

| Código | Id | Itens | Revisão do rascunho |
|---|---|---|---|
| C01 | crs_99hpdsc8w88osiuh | P24 | 91 → 92 |
| C02 | crs_arbeohlw3xp5v3zx | P7 | 87 → 88 |
| C05 | crs_4tj8a3q3g9gudgb7 | P31 | 93 → 94 |
| C06 | crs_b8zeh4b2gguseghq | P2 (vídeo) | 124 → 126 |
| C07 | crs_bmf11akamtxoti28 | P32 | 96 → 97 |
| C08 | crs_8g0csi2hflfztfge | P28 | 91 → 92 |
| C11 | crs_u4nfw88a4n2n0ubv | P33 | 94 → 95 |
| C12 | crs_5vccpfypr6fmxojb | P34 | 93 → 94 |
| C13 | crs_gujuaiykqcsl2n31 | P25 | 179 → 180 |
| C14 | crs_hvvgkvtd1rb2um0l | P4, P5, P6, P29, P1 (vídeo) | 428 → 431 |
| C21 | crs_4jh683s5h351z2db | P26 | 43 → 44 |
| C24 | crs_dp9s7pdro9j6e3m0 | P27 | 42 → 43 |

Republicar leva os vídeos novos de C14·A12·v23 e C06·A2·v03 (as versões publicadas são v13 e v9 e continuam com o vídeo antigo). As checagens das trilhas não são de curso: valem quando o código com `trails.ts` for para o ar.

## Atenção: trails.ts

`packages/course-schema/src/trails.ts` está **sem commit** no git (arquivo novo, `??`). Editei no lugar, 39 textos, número de linhas igual, `packages/course-schema` com `test/trails.test.ts` passando (18/18). O módulo recarregado foi comparado com o esperado antes de dar por concluído. Cópia do arquivo original: `/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/x/trails.antes.ts.txt`. Se o web em modo demo recompila o pacote a quente, o aluno já vê os rótulos novos.

## Raio-X

Regerado (`tools/raio-x/gerar.mjs`): 26 cursos, ASR 622/622 vídeos (2 novos: os dois vídeos acima), 594 alertas.
