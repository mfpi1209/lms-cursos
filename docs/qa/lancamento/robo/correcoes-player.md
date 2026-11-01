# Correções do player a partir do robô de QA

Rodada de origem: `linha-de-base` (resumo.md, resultado.json). Nada foi commitado, publicado nem gravado em mídia; `apps/worker/src` e `packages/media/src` ficaram intocados. As correções são só de código (player e esquema), valem para a versão publicada assim que o web as serve: **nada depende de publicar**.

## Achado 1: C13 "Comecei a trabalhar" para em "Continuar" (6 aulas)

### Causa

Não é dado errado do C13 nem defeito só dele: é uma lacuna na regra de avanço do player.

- Nos outros 13 cursos, o vídeo da cena termina falando a chamada da pergunta ("… Agora, responda: …"). A regra única `questionVideoSkipped` (packages/course-schema/src/video-runtime.ts) então pula o vídeo próprio da pergunta, e o avanço automático (`leadsToChoice`, immersive-player.tsx) abre a pergunta 700 ms depois do fim do vídeo.
- No C13, o vídeo de abertura (v00, v02, v04, v06, v08, v10) é só uma apresentação ("Vamos com a Luana…"), e a pergunta (q01, q03, q05, q06, q08, q10) tem vídeo próprio completo (situação + "Agora é com você: …"). Aí `questionVideoSkipped` é falso e `leadsToChoice` também: o player não tinha regra para "vídeo da cena termina e o vídeo da pergunta segue". O fim do vídeo caía na tela com "Continuar".
- Por que o robô só viu isso na primeira pergunta de cada aula: nas seguintes, a vinheta da marca (`onLongVideoEnded`) já avança sozinha.
- Conferência no grafo publicado das 14 aulas: cena com vídeo cujo único destino é uma pergunta com vídeo que toca só ocorre no C13 (9 transições). Nos outros 13 cursos, nenhuma.

### Correção (geral, sem caso especial)

- `questionVideoFollows(graph, fromId)` em `packages/course-schema/src/video-runtime.ts`: a cena tem vídeo, segue só para uma pergunta com vídeo, e esse vídeo não é pulado.
- `immersive-player.tsx`: `leadsToChoice` também é verdadeiro nesse caso. O fim do vídeo (visto até o fim, não pulado) avança sozinho e o vídeo da pergunta começa direto. Vinheta, "Pular vídeo" e o caso do vídeo da pergunta pulado seguem como antes.

### Prova

- Teste de unidade (`packages/course-schema/test/video-runtime.test.ts`, 3 casos novos, 17 no arquivo): segue no caso C13; não segue quando o vídeo da pergunta é pulado, quando a pergunta não tem vídeo, quando a cena não tem vídeo, quando há mais de um destino ou o destino não é pergunta.
- Varredura dos 14 grafos publicados: só C13 muda (cena com vídeo -> pergunta com vídeo). A única outra diferença bruta, C14·A6 m05 -> q12, parte de uma missão sem vídeo e não é afetada (o avanço depende do fim de um vídeo).
- Robô (rodada `depois-player`, conta aluna@demo.local, versão publicada, aula 1, caminhos 1 e 3):
  - C13·A1·c1 e c3: concluem; nenhum clique em "Continuar" (antes: `player-continue` em v00 aos 23,5 s e a observação "vídeo terminou e a cena pediu Continuar"). Sequência: v00 termina -> q01 toca sozinho.
  - C01·A1 (controle), c1 e c3: concluem, sem "Continuar", mesma sequência de antes (as diferenças em `telas` são de amostragem do robô, não de fluxo).
  - Bruto: `rodadas/depois-player/bruto/*.json`.

## Achado 2: cabeçalho do player e marca do curso

> **Atualizado pela decisão do dono (item 1, opção A): ver "Decisões do dono" no fim.** O centro do cabeçalho deixou de ser "Aula N de M" e passou a ser o nome curto do curso; o logo à esquerda continua. As capturas sem sufixo e o texto de "Aula N de M" abaixo são o histórico da primeira versão.

### Causa

- **"DNA Work" no centro (C02, "Que roupa eu uso?")**: dado do curso. O C02 grava `branding.subtitle = "DNA Work"`, e `resolveBrand` (theme.ts) dava prioridade a esse campo sobre "Aula N de M". Os outros 13 não têm subtitle.
- **Canto esquerdo em texto**: o player nunca recebeu o logo. A página da aula troca o `branding.wordmark` do curso pelo título curto (`shortTitleFor`) e o cabeçalho desenhava esse texto. O catálogo, a página do curso e o rodapé usam o logo da marca do workspace (`BrandLogo`, preset DNA Work em `config/brand.ts`). Observação: o pedido chamou isso de `branding.wordmark`; o campo `branding.wordmark` do curso é texto (o nome do curso), e o logo é o do preset do workspace. Foi esse logo que entrou.

### Correção

- `theme.ts` (`resolveBrand`): o centro é sempre "Aula N de M" em curso com mais de uma aula; `branding.subtitle` só vale para curso de uma aula (senão, o título). O `subtitle` continua na ficha do curso (comentário do esquema em course.ts atualizado). Nenhuma mudança de dado: o C02 não precisa de script nem de publicação.
- Logo no canto esquerdo: `config/brand.ts` ganhou `BrandMark`/`brandMarkOf`; `PlatformContext.brandMark` (types.ts, platform-context.ts) é preenchido pela página da aula do aluno e pela prévia do estúdio; `ResolvedBrand.mark`; `PlatformHeader` (immersive-player.tsx) usa `BrandLogo` (versão clara/branca pelo tema), 28 px no computador e 22 px no celular. O link tem `aria-label="<título>: início"` e o logo tem texto alternativo igual ao título do curso. Sem logo no preset (preset `lms`) ou sem `brandMark`, o texto de antes é mantido.
- `brand-logo.tsx`: aceita `BrandMark` (subconjunto serializável do preset).

### Prova

- Teste de unidade `apps/web/src/components/player/immersive/theme.test.ts` (4 casos): subtítulo "DNA Work" não vence "Aula N de M"; curso de uma aula; logo presente; sem logo mantém o texto.
- Playwright (aluna@demo.local, versão publicada): os 14 cursos, aula 2, 1440 px: centro "Aula 2 de M" em todos (C13 "de 6", C14 "de 12"), logo presente, texto alternativo = título do curso. C02 aula 1: "Aula 1 de 2" (antes: "DNA Work"). Sem rolagem horizontal em 1440 nem em 375 (`scrollWidth` = largura). No celular o centro continua oculto (como antes); a posição aparece no painel ("Aula 1").
- Capturas em `docs/qa/lancamento/robo/correcoes-player/`:
  - `C02-desktop-1440-light.png`, `C02-desktop-1440-dark.png`, `C02-celular-375-light.png`, `C02-celular-375-dark.png`
  - `C13-desktop-1440-light.png`, `C13-celular-375-light.png`
  - `C01-desktop-1440-light.png`, `C01-celular-375-light.png`

## Arquivos mudados

- `packages/course-schema/src/video-runtime.ts` (+ `questionVideoFollows`), `packages/course-schema/test/video-runtime.test.ts`, `packages/course-schema/src/course.ts` (só o comentário do `subtitle`)
- `apps/web/src/components/player/immersive/immersive-player.tsx` (avanço automático, cabeçalho), `apps/web/src/components/player/immersive/theme.ts`, `apps/web/src/components/player/immersive/theme.test.ts` (novo)
- `apps/web/src/components/player/types.ts`, `apps/web/src/components/player/platform-context.ts`, `apps/web/src/components/brand-logo.tsx`, `apps/web/src/config/brand.ts`
- `apps/web/src/app/(lms)/aprender/[enrollmentId]/aulas/[lessonId]/page.tsx`, `apps/web/src/app/(studio)/estudio/cursos/[courseId]/aulas/[lessonId]/previa/page.tsx` (passam `brandMark`)

Verificação: `vitest` de `packages/course-schema/test/video-runtime.test.ts` (17) e de `apps/web/src/components/player` (10) passam; `tsc --noEmit` do apps/web e do packages/course-schema sem erros.

## Depende de publicar

Nada. Ambas as correções são de código e já valem para o que o aluno vê. Só o "DNA Work" do `branding.subtitle` do C02 continua gravado no rascunho/versão (aparece na ficha do curso como linha acima do título); isso não afeta o player e pode ser limpo na próxima edição do curso, se quiserem.

## Decisões do dono (31/10, `decisoes-linha-de-base.md`, itens 1, 2 e 5)

Nada commitado, publicado nem gravado em mídia. `apps/worker/src` e `packages/media/src` intocados. O web não foi reiniciado (HMR).

### Item 1: cabeçalho da aula, opção A

- **Hoje:** logo DNA Work à esquerda (o mesmo `[data-testid=brand-logo]` do catálogo, dentro do link `player-brand`) e o **nome curto do curso no centro**, em todos os cursos. A posição na aula fica só em "x de y etapas".
- **Nome curto = o do catálogo:** `shortTitleFor(courseId, título)` (`_lib/short-titles.ts`, o mesmo de `learner-courses.ts`). A página da aula do aluno e a prévia do estúdio põem em `PlatformContext.courseShortTitle` (campo novo, `types.ts`); curso fora da tabela (hoje os 12 novos) usa o título inteiro, igual ao catálogo.
- `resolveBrand` (`theme.ts`) agora devolve `title` e `mark`. **`branding.wordmark` e `branding.subtitle` do curso não entram mais no player** (o "DNA Work" do C02 e o "Roupa no trabalho"/"Comece bem" deixam de importar; os campos continuam na ficha/rascunho).
- **Celular:** o centro continua oculto (`hidden md:block`); a posição aparece no painel ("Aula 1") e nas etapas. O logo fica em 22 px e nada empurra os botões.
- **Prévia do estúdio:** `previa/page.tsx` passa o mesmo `brandMark` e `courseShortTitle` (o `wordmark` por cima do branding saiu), então mostra o mesmo cabeçalho. Não abri a prévia no navegador (precisa de login de autor); a página usa exatamente o mesmo caminho de dados da do aluno.
- Arquivos: `theme.ts`, `theme.test.ts`, `immersive-player.tsx` (`PlatformHeader`), `types.ts`, as duas páginas, comentários de `branding` em `packages/course-schema/src/course.ts`.
- **Prova:**
  - Teste de unidade `theme.test.ts` (6 casos): centro é o nome curto; sem nome curto vale o título e nunca "Aula N de M"; `wordmark`/`subtitle` do curso (inclusive "DNA Work") não aparecem; vale para curso de uma aula; `mark` vem do contexto.
  - Playwright (aluna@demo.local, versão publicada, aula 1 de cada curso, `tools/robo-aluno/capturas-cabecalho.mjs`): os 14 cursos × 1440 e 375 px × claro e escuro. Em todos: logo do player visível e é o `[data-testid=brand-logo]`; texto do centro = nome do curso (C02 "Que roupa eu uso?", C13 "Comecei a trabalhar", C14 "Minha primeira vaga"); visível a 1440 e oculto a 375; sem rolagem horizontal; centro não encosta nos botões. Nome acessível do link: "<curso>: início".
  - Capturas em `docs/qa/lancamento/robo/correcoes-player/`, sufixo `-v2`: `C01`, `C02` e `C13`, `desktop-1440` e `celular-375`, `light` e `dark`.

### Item 2: atividade "Na prática" opcional

**a) Dados (rascunho).** Script `packages/db/src/scripts/oneoff/qa-atividade-opcional.ts` (`--dry-run` por padrão, `--apply` grava, idempotente, controle de revisão com `expectedRevision` e nova tentativa em conflito): `required: true` → `false` em **66 atividades de 26 cursos** (14 atuais: 41; 12 novos: 25 — C06 com a aula 3 inclusa; C13: 6; C14: 10). Mudou só `required`: o diff trava qualquer outro caminho (`...graph.nodes.N.required`) e exige que o número de caminhos diferentes seja igual ao de atividades mudadas. `minLength` ficou 0 em todas (nenhuma tinha `minLength > 0`), então "Fazer depois" continua em todas. Segunda rodada: 0 a mudar, 66 já opcionais. Antes/depois e revisões em `correcoes-atividade-opcional.antes-depois.json` (cada curso: revisão N → N+1, `origin: script`). Rascunhos de mídia em gravação (12 novos + 13 atuais) só ganharam essa revisão extra, sem tocar em narração, direção nem `media`.

**Nenhuma cena fica desatualizada (`stale`).** `required` é de nó e atividade (`reflection`) não é cena de vídeo (`MEDIA_NODE_TYPES` = scenario, content, choice, consequence); `stale` vem de `media.stale` (texto) ou da impressão da apresentação (`mediaPresentationStale`), nenhum dos dois lê `required`. Conferi por código, no script, antes de gravar em cada curso: o conjunto de cenas desatualizadas pelo mesmo critério do `media-jobs/quote` é idêntico antes e depois (ex.: C14 12 → 12, C13 5 → 5, C01 2 → 2, os 12 novos 0 → 0). **Não rodei o orçamento HTTP** (`quote`): ele exige o login de autor@demo.local, e a leitura da senha no seed foi bloqueada pelo ambiente; o equivalente em processo cobre o que o orçamento usa para decidir "desatualizada". `/batch` não foi chamado.

**Efeito na conclusão (conferido no código).**
- A aula conclui quando o aluno chega ao nó `end` (`engine.ts`: `target.type === 'end'` → `status: 'completed'`). Nenhum passo do motor lê `required`. `courseIsComplete` (`learning.ts`) olha só aulas concluídas (`completion.requiredLessonIds` ou todas). `required` de nó só entra em **`computeProgress`** (`course-engine/src/progress.ts`): o percentual e "restam N obrigatórios" do caminho.
- Portanto, **a conclusão da aula e do curso não muda**: o caminho do aluno sempre passa pela atividade (o grafo leva a ela), e ela já aceitava vazio ("Fazer depois", `minLength: 0`) — `required: false` só tira a atividade do denominador do percentual de progresso, que passa a fechar em 100% sem ela. A diferença prática é de rótulo/progresso, não de bloqueio.
- O aluno ainda vê a versão **publicada** (com `required: true`); como não afeta conclusão, só vale no próximo publicar.

**b) Defeito "Missão cumprida" para quem pulou.** `achievements` contava a atividade **visitada** (`state.path`). Agora conta só quem **salvou uma resposta não vazia**: "Fazer depois" envia texto vazio e o motor grava `answers[id] = { text: '' }`. Lógica pura e testada em `immersive/achievements.ts` (`lessonAchievements`, `missionChipLabel`); `immersive-player.tsx` só a chama. Quem salvou: "Missão cumprida" (ou "N missões cumpridas"). Quem deixou para depois: chip neutro **"Missão para depois"** (mesmo formato, ícone em cinza, sem cobrança). Aula sem atividade no caminho: nada.
- Teste de unidade `achievements.test.ts` (6 casos): salvou; "Fazer depois" (vazio); só espaços; sem resposta registrada; atividade fora do caminho/aula sem atividade; revisão.
- Playwright (robô `rodar.mjs --rodada missao-opcional --alvo C01:1 --caminhos 1,4`, versão publicada, aluna@demo.local): caminho 1 (salvando a atividade) termina com "2 decisões tomadas · **Missão cumprida**"; caminho 4 ("Fazer depois") termina com "2 decisões tomadas · **Missão para depois**" e **sem** "Missão cumprida" (o robô não gerou o problema `missao-cumprida-sem-fazer`; 0 achados nos dois). Bruto e imagens em `rodadas/missao-opcional/`; captura do fim em `correcoes-player/C01-fim-missao-para-depois-1440-light-v2.jpg`.

### Item 5: opções em 1ª pessoa, desfeito

Script `packages/db/src/scripts/oneoff/qa-opcoes-primeira-pessoa-reverter.ts` (`--dry-run`/`--apply`, idempotente, valor esperado por opção): os 18 rótulos (13 + 5 irmãs, C13·A1·q11 e C14·A5, A6, A10, A11, A12) voltaram ao original, a partir de `correcoes-opcoes.antes-depois.json`. C13 rascunho 171 → 172, C14 406 → 407. Só `options[].label` mudou (o diff de `_rascunho-qa.ts` trava qualquer outro caminho) e o conjunto de cenas desatualizadas ficou igual (C13: 5, C14: 12). 2ª rodada: 0 a aplicar, 18 já aplicados. Registro: `correcoes-opcoes-reversao.antes-depois.json`. `correcoes-conteudo.md` marca "revertido por decisão do dono (item 5)"; o script antigo ganhou o aviso de não rodar de novo.

### Depende de publicar

- Item 1 e 2b: nada (código; valem para o aluno já).
- Item 2a e item 5: mudam o **rascunho**. O aluno só vê ao publicar. Para o item 5 isso significa que as opções "Eu…" ainda estão na versão publicada até a próxima publicação.

### Verificação

`vitest` de `apps/web/src/components/player` e `apps/web/src/app` (33 passam; `theme.test.ts` 6, `achievements.test.ts` 6); `tsc --noEmit` do `apps/web` e do `packages/course-schema` sem erros. O `tsc` de `packages/db` acusa 1 erro que já existia em `qa-missao-falada.ts(215)` (não mexi nesse arquivo).
