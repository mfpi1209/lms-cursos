# Instrutores novos: gerados (Mauro, Laís, Vinícius, Flávia)

Data: 31/10/2026. Execução do plano de `instrutores-novos.md`, com a aprovação do dono ("pode", teto de US$ 100 para avatares e vídeos dos cursos novos). **Nenhuma aula foi gravada** (`media-jobs/batch` não foi chamado). Nada foi publicado nem commitado.

## 1. Resumo

| Instrutor | Trilha | Estúdio | Voz escolhida | Kit | Cursos (kit aplicado) |
|---|---|---|---|---|---|
| Mauro | Respeito e diálogo | 7 | José Pininga | `estudio7-mauro` | crs_t303ykqfmhj3yb1g, crs_2rt2rsoii8bpydp2, crs_5k5upah2xphlfvi5 |
| Laís | Tecnologia com critério | 8 | Muriell | `estudio8-lais` | crs_tg9iqz8wmmf5pw77, crs_au1463izc386by27, crs_m60hsx8on6ebcyqg |
| Vinícius | Autonomia no trabalho | 6 | Guilherme | `estudio6-vinicius` | crs_4jh683s5h351z2db, crs_njtlqq7y7fyfeqcr, crs_gl0hjkmqfgnnur9y |
| Flávia | Pensar e resolver | 6 | Scheila | `estudio6-flavia` | crs_dp9s7pdro9j6e3m0, crs_0ua5onij460lpzs0, crs_d5rsi8gt36rv0qbq |

A aula 3 nova de `crs_b8zeh4b2gguseghq` continua com a Patrícia (não foi tocada). Os 14 cursos atuais só foram lidos.

## 2. Vozes (ElevenLabs, biblioteca pública, pt-BR)

Ouvir não foi possível: a escolha usa só metadados (idioma, sotaque, gênero, faixa de idade, descrição, uso) do catálogo `shared-voices`. Filtros: locale pt-BR, sotaque brasileiro, `free_users_allowed`, `rate` 1,0 (sem sobretaxa), suporte ao `eleven_multilingual_v2` (modelo padrão do pipeline). Fora de cogitação: as 12 vozes dos kits atuais (Ana Dias, Gabriel, Ádria Freitas, Matheus, Juliana, Campanholi, Davi Andrei, Bea, Malu, Cirilo, Ana Alice, Luciana Cadar) e as demais já na conta. Adicionar à conta foi grátis (conta payg, `voice_slots_used` continua 0).

| Instrutor | Voz | `voice_id` | Metadados do catálogo | Por que (3 critérios do perfil) |
|---|---|---|---|---|
| Mauro | José Pininga - Educational | `o5SEF8ldKBWn7OBNDti3` | masculina, middle_aged, brazilian, "confident", informativo/educacional; "mature and welcoming, deep timbre, authority, serenity and confidence; moderate pacing, good articulation, warmth and good humor" | masculina 40-55, grave e encorpada, ritmo moderado, acolhedora e firme (exatamente o "acolhedor e firme" do Mauro) |
| Laís | Muriell - Natural, Confident | `JcRcOH4TrCX2WZ3MNBts` | feminina, young, brazilian, "confident"; "natural, confident, welcoming; clear speech, balanced pace, gentle pauses; professional yet approachable; not artificial or overly formal" | feminina jovem-adulta, dicção clara (termos técnicos), ritmo equilibrado, sem tom de propaganda |
| Vinícius | Guilherme - Direct and Neutral | `GnDrTQvdzZ7wqAKfLzVQ` | masculina, young, brazilian, casual, conversacional; "Brazilian, 30 years old, male"; ~25 mil clonagens | masculina de 30 anos, conversacional, direta e sotaque neutro (não é voz "de YouTuber" nem abaixo de 25) |
| Flávia | Scheila - Serious and Direct | `cyD08lEy76q03ER1jZ7y` | feminina, middle_aged, brazilian, calma, conversacional, `high_quality`; "crisp, carefully articulated, smooth engaging cadence"; ~120 mil usos | feminina de meia-idade, nítida e calma, "séria e direta" evita o sorriso audível constante (pensa junto, não vende) |

Limites da escolha por metadado (conferir de ouvido nas amostras da seção 6): o catálogo não informa o timbre (grave/médio) de Laís, Vinícius e Flávia nem o ritmo em palavras por minuto. Pela duração das amostras, o ritmo bruto ficou perto de 150 (Mauro), 168 (Laís), 131 (Vinícius) e 140 (Flávia) palavras/min, contando silêncio nas pontas: Mauro e Laís podem estar um pouco acima do desejado, Vinícius abaixo. Se o dono achar, ajuste de `speed` por voz resolve sem trocar a voz. Reservas, caso alguma seja reprovada: Mauro: Kpelo (`8BWp4523yEDDjOJi73mz`, 30-45, "mentor, não locutor"); Laís: Sofia (`n2a9VtkZLl8j1FSXHsL7`); Vinícius: Matheus Santos (`xWdpADtEio43ew1zGxUQ`, 28 anos); Flávia: Alina (`jXut6osIUq8fzeZmDtEf`, "ensino e e-learning").

Peças na biblioteca de modelos (tipo `voice`): `voz-jose-pininga`, `voz-muriell`, `voz-guilherme`, `voz-scheila`.

## 3. Rosto e câmeras (HeyGen)

Fluxo: `apps/worker/src/scripts/gerar-instrutor.sh` (que chama `novo-instrutor.ts`) com os `BASE_PROMPT` literais de `instrutores-novos.md` e o 1º curso da trilha como `COURSE_ID`. Para poder **conferir o rosto antes de pagar as câmeras**, o rosto foi gerado antes por um passo novo, `apps/worker/src/scripts/instrutor-rosto.ts` (mesma Idempotency-Key do script original; só personagem, e para). Depois o `.sh` continuou do rosto pronto (não pagou de novo) e gerou as 3 câmeras.

Conferência do rosto (imagem aberta; pulsos e mãos ampliados quando visíveis). **Os 4 rostos saíram bons de primeira; nenhuma regeração de rosto foi necessária.**

| Instrutor | Pulsos sem acessório | Folhas/objetos estranhos | Mãos | Observação |
|---|---|---|---|---|
| Mauro | sim (só punhos brancos de camisa) | nenhum | normais, entrelaçadas | careca, barba grisalha, suéter carvão |
| Laís | sim (mãos recortadas na base, sem pulso à vista) | nenhum | normais | óculos redondos dourados **sem reflexo**, coque baixo, cardigã ameixa |
| Vinícius | sim (antebraços limpos, mangas dobradas) | nenhum | normais | overshirt azul-ardósia, cabelo liso curto |
| Flávia | sim | nenhum | normais (nas câmeras laterais; fora do quadro no retrato) | usa uma aliança fina no anelar (dedo, não pulso; combina com o perfil, que só proíbe relógio e pulseira) |

IDs no HeyGen (look = `lookId`; as câmeras seguem o formato `cam_<nome><estúdio>_<esq|dir|34>`):

| Instrutor | Retrato-base (`cam_<nome>_base`) | esq | dir | 3/4 (principal) |
|---|---|---|---|---|
| Mauro | `82c52f084e6faf9ddaec4da3904be387` | `e8a66661b0a76db64ed1a50c877987d1` | `f0d65b2ebdcb6d0c0b45e6b04611b55e` | `54adc389bff535e1ed6e7513c2cf220d` |
| Laís | `1c0e5dad463011ca40d04ec922ba6738` | `7580bd4b28001b3842e155048c0c129f` | `4c8ed6b4197103a8529bcca0a8af8c46` | `c6a3f651db74b8facfc7504c604d1f10` |
| Vinícius | `17a4ac24f55cc8917bf1b8c746ae5846` | `9c3a82e4b66ce01327cf6a3f9948d3e5` | `8f8ae6f5ede7badbcf11e6c3aa0a3e47` | `9ca032da09fa9bb552ef94d4b67dbd5f` |
| Flávia | `b49e34562e327dd9792681ac93dd7789` | `1735610d61546db845e79bee70531128` | `6ccb5c3791cc82ac4bc07db5a13b6a5e` | `b0e7768deb4b998c01a2e4cbc5d0717b` |

Câmeras: `cam_mauro7_*`, `cam_lais8_*`, `cam_vinicius6_*`, `cam_flavia6_*`. As 4 câmeras de cada instrutor ficaram prontas (`ready`) nos rascunhos dos 1ºs cursos.

## 4. Kits e conferência dos rascunhos

Biblioteca de modelos (script novo, idempotente, só dados: `packages/db/src/scripts/novos-instrutores-biblioteca.ts`): voz, instrutor (`instrutor-mauro`, `instrutor-lais`, `instrutor-vinicius`, `instrutor-flavia`) e kit (`estudio7-mauro`, `estudio8-lais`, `estudio6-vinicius`, `estudio6-flavia`) com a mesma receita dos kits atuais (marca `marca-dnawork`, direção `direcao-estudio-zonas`, 9 regras de conhecimento, 5 alunos de teste).

Aplicação: `packages/db/src/scripts/lote/aplicar-kit.ts` nos 12 cursos (inclusive o 1º de cada trilha, para remapear a direção das câmeras antigas), mantendo a paleta de vídeo que cada curso já tinha. Os planos de câmera foram remapeados pela mesma zona (esquerda para esquerda, direita para direita, 3/4 para 3/4): 17 a 27 planos por curso, 0 planos sem câmera válida.

**Conferência antes x depois (diff estrutural completo dos 12 rascunhos, snapshots antes/depois guardados no scratchpad).** Só mudaram: `presentation` (instrutor, câmeras, voz, pronome, estilo), `cast` (elenco), `branding` (letreiro nome/papel e a vinheta) e o `cameraId` dos planos de direção. Falas, perguntas, atividades, retornos, cortes, títulos, objetivos, mídia: idênticos. Duas ressalvas, as duas corrigidas por `packages/db/src/scripts/novos-instrutores-ajustes.ts` (nova revisão do rascunho em cada curso):

1. **O kit desfez um ajuste do lote (o "aviso" da tarefa):** a marca do kit traz a vinheta em `course_end`, e os 12 cursos estavam em `lesson_end` (a vinheta fecha o último vídeo da aula). Devolvi `lesson_end` nos 12 (igual ao dos cursos atuais).
2. **Uma única mudança de fala, proposital:** a abertura da aula 1 dizia "Oi! Eu sou a Patrícia, sua orientadora…" (ou Gustavo, Thiago, Enzo, Júlia, Beatriz, Helena, Renato conforme o curso). Com o instrutor trocado, o avatar diria o nome do outro. Troquei **só o nome e a concordância** ("Eu sou o Mauro, seu orientador" / "a Laís, sua orientadora" / "o Vinícius, seu orientador" / "a Flávia, sua orientadora") nas 2 ocorrências por curso (fala do plano e narração), conforme previsto em `instrutores-novos.md` (seção 5). Nada além disso mudou nos textos. O campo `brief` ainda cita o instrutor sugerido antigo; é texto interno, não tocado.

Revisões finais dos rascunhos: 17, 6, 6 (Mauro); 18, 7, 6 (Laís); 16, 6, 6 (Vinícius); 16, 8, 6 (Flávia).

## 5. Custo

| Item | Valor |
|---|---|
| HeyGen, gerações de visual | 17 (4 rostos + 12 câmeras previstos = 16, **mais 1 gerada por engano**, ver abaixo) |
| HeyGen, saldo da carteira | de US$ 6,73 para US$ 9,73, com 2 recargas automáticas de US$ 10 (limite configurado: abaixo de US$ 5 recarrega US$ 10) |
| HeyGen, gasto apurado | 6,73 + 20,00 - 9,73 = **US$ 17,00** (US$ 1,00 por visual; coincide com o "1 crédito por look" do código) |
| ElevenLabs, vozes | grátis (4 adições à biblioteca) |
| ElevenLabs, amostras | 541 caracteres de texto (4 amostras de ~10 s), na ordem de centavos; contador de créditos da conta passou de 57 837 para 57 956 de 92 416 (o painel pode atrasar) |
| Total apurado | ~US$ 17,00 de HeyGen + centavos de ElevenLabs, contra a estimativa de US$ 16 |

**Erro meu, assumido:** ao disparar os rostos em paralelo, um comando de teste saiu com `INSTRUTOR=Lais` e `BASE_PROMPT=x`, e pediu um personagem com prompt de 1 caractere ao HeyGen (cobrou 1 visual, US$ 1,00, sem uso). Apaguei a câmera `cam_lais_base` que isso gravou no rascunho da Laís (revisão 6) e refiz o rosto correto. O visual avulso ficou na conta HeyGen, sem referência em nenhum curso.

Houve também uma falha transitória no 1º disparo das câmeras do Mauro ("Insufficient credit. This operation requires 'api' credits.") enquanto as recargas rodavam; nada foi cobrado nessa tentativa e a repetição (idempotente) passou. Quem rodar de novo: a carteira do HeyGen só tem US$ 9,73 e recarrega sozinha.

## 6. Amostras para o dono aprovar (antes de gravar as aulas)

Pasta: `/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/instrutores-novos/`

Folhas de contato (retrato-base, 3/4, esquerda e direita no estúdio):
- `folhas/folha-contato-mauro.png`
- `folhas/folha-contato-lais.png`
- `folhas/folha-contato-vinicius.png`
- `folhas/folha-contato-flavia.png`

Amostras de voz (`eleven_multilingual_v2`, estabilidade 0,5, 8,9 a 11 s cada):
- `vozes/amostra-voz-mauro.mp3`: "Oi! Eu sou o Mauro, seu orientador neste curso da DNA Work. Hoje, vamos ver por que ser diferente de mim não significa estar errado."
- `vozes/amostra-voz-lais.mp3`: "Oi! Eu sou a Laís, sua orientadora neste curso da DNA Work. Hoje, vamos olhar o que aparece no seu print, antes de ele sair por aí."
- `vozes/amostra-voz-vinicius.mp3`: "Oi! Eu sou o Vinícius, seu orientador neste curso da DNA Work. Hoje, vamos comparar dois pedidos que chegam juntos e decidir por onde começar."
- `vozes/amostra-voz-flavia.mp3`: "Oi! Eu sou a Flávia, sua orientadora neste curso da DNA Work. Hoje, vamos entender o problema antes de sair fazendo. Por onde eu começo?"

Também na pasta: `imgs/` (retratos e câmeras em PNG, mais os recortes de mãos usados na conferência), `antes/` e `depois/` (JSON dos 12 rascunhos), `quotes.json`.

## 7. Orçamento das aulas (`POST /api/courses/:id/media-jobs/quote`, `includeStale: true`)

O servidor em :3010 está em **modo demo (`mode: "demo"`, `simulated: true`)**: os valores são simulados (preço de tabela aplicado às cenas), não uma cotação do provedor, e nada é cobrado. Login como `autor@demo.local` (senha lida de `packages/db/src/seed/seed.ts`, não impressa). **0 erros de direção nos 12 cursos** depois da troca de instrutor.

| Curso | Cenas | Segundos | US$ estimado |
|---|---|---|---|
| crs_t303ykqfmhj3yb1g (Mauro) | 20 | 279 | 5,80 |
| crs_2rt2rsoii8bpydp2 (Mauro) | 20 | 242 | 5,08 |
| crs_5k5upah2xphlfvi5 (Mauro) | 20 | 233 | 4,89 |
| crs_tg9iqz8wmmf5pw77 (Laís) | 20 | 245 | 5,09 |
| crs_au1463izc386by27 (Laís) | 20 | 248 | 5,18 |
| crs_m60hsx8on6ebcyqg (Laís) | 20 | 255 | 5,31 |
| crs_4jh683s5h351z2db (Vinícius) | 21 | 252 | 5,30 |
| crs_njtlqq7y7fyfeqcr (Vinícius) | 20 | 255 | 5,30 |
| crs_gl0hjkmqfgnnur9y (Vinícius) | 20 | 273 | 5,64 |
| crs_dp9s7pdro9j6e3m0 (Flávia) | 20 | 263 | 5,50 |
| crs_0ua5onij460lpzs0 (Flávia) | 20 | 223 | 4,70 |
| crs_d5rsi8gt36rv0qbq (Flávia) | 30 | 357 | 7,46 |
| **Total** | **251** | **3 125 (52 min)** | **65,24** |

Compatível com os US$ 67,73 do plano (diferença de ~4%, por ser simulado). Somando os ~US$ 17 já gastos com avatares, o total fica perto de US$ 82 a 85, abaixo do teto de US$ 100. As cotações (`quoteId`) expiram em 30 min e nenhuma foi usada.

## 8. Arquivos novos (nenhum commit)

- `apps/worker/src/scripts/instrutor-rosto.ts` (passo pago de 1 visual, para conferir o rosto antes das câmeras)
- `packages/db/src/scripts/novos-instrutores-biblioteca.ts` (voz, instrutor e kit na biblioteca)
- `packages/db/src/scripts/novos-instrutores-ajustes.ts` (vinheta `lesson_end` e nome na abertura)
- este documento

Não foram editados `packages/media`, `apps/worker/src/adjust.ts` nem `compose-scene.ts`; o servidor web não foi reiniciado.

## 9. Próximos passos (com aprovação do dono)

1. Ver as 4 folhas e ouvir as 4 amostras; trocar voz ou rosto só se reprovar (reservas na seção 2; regerar um rosto custa US$ 1 e as 3 câmeras US$ 3).
2. Se aprovado, gravar as aulas (`media-jobs/batch`, ~US$ 67,73 reais), sem mexer nos rascunhos.
3. Os 4 kits novos devem entrar em `docs/biblioteca-de-modelos.md` quando a lista de kits for atualizada (não editei esse arquivo, que tem alterações do outro agente em andamento).
