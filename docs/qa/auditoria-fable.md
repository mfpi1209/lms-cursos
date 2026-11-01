# Auditoria independente da rodada — DNA Work (base b210fd8 + árvore de trabalho)

Data: 2026-10-31 · Auditor: Claude (Fable 5.1) · Modo: só leitura (nenhum arquivo, banco, servidor ou curso alterado; este relatório é o único arquivo criado).

Escopo verificado: `git status --porcelain` (100 entradas: 46 modificadas, 54 novas), `git diff HEAD`, árvore de trabalho. Nota: o índice está **parcialmente** preparado (`git diff --cached --stat`: 9 arquivos, entre eles `apps/worker/src/adjust.ts`, `packages/media/src/adjust.ts`, `packages/course-schema/src/nodes.ts` com metade das mudanças). Um `git commit` sem rever o índice gravaria metades de arquivos.

## Verificações executadas

| Pacote | tsc --noEmit | vitest |
|---|---|---|
| `@lms/web` | ok | 7 arquivos, 19/19 ok (só `compose-state.test.ts` é novo) |
| `@lms/media` | ok | 164/164 ok (inclui ffmpeg real) |
| `@lms/course-schema` | ok | 225/225 ok |
| `@lms/worker` | ok | 36/36 ok isolado; na 1ª rodada 13 falhas em `directed-video.test.ts` por `drop schema` concorrente no `lms_cursos_test` (outra sessão), não regressão |
| `@lms/db` | — | `recognition.test.ts` 4/4, `trails.test.ts` 6/6 |

Conteúdo: 15 aulas amostradas em `docs/qa/revisao-final/transcricao-depois.csv` (14 cursos, 43 aulas, 2.523 linhas).

---

## Achados por gravidade

### CRÍTICO

Nenhum bloqueio de segurança ou de perda de dados em produção encontrado. Os itens abaixo em ALTO precisam de correção **antes** do commit/execução, mas são contidos.

### ALTO

**A1. Worktree de 874 MB e rascunhos não ignorados — `git add -A` os registraria.**
`.claude/worktrees/agent-a7320afc1cd11e2ea` (874 MB, worktree git ativo) e `packages/db/.tmp/` (19 arquivos: `q4.ts`, `t3.ts`, `dump.ts`, `edit.ts`, snapshots JSON) aparecem em `??`. O diff do `.gitignore` só acrescentou `/videos-publicados/` (`.gitignore:25`).
Correção: acrescentar `.claude/worktrees/` e `packages/db/.tmp/` ao `.gitignore`; `git worktree remove` quando terminar.

**A2. `publicar-e-matricular.ts` encerra tentativas que já PASSARAM pela cena removida, sem transação e sem ensaio.**
`packages/db/src/scripts/publicar-e-matricular.ts:59`: `touched = [st?.currentNodeId, ...(st?.path ?? []).map(p => p.nodeId)].some(id => gone.has(...))` — basta o `path` ter tocado a cena removida (ex.: avaliação de módulo já respondida) para a tentativa virar `abandoned` (`:61`), mesmo que o aluno esteja três cenas à frente. Efeitos: progresso da aula perdido; variáveis gravadas só nessa tentativa deixam de ser herdadas (`learning.ts:155` exclui `abandoned`). `update lesson_attempts` (`:61`) e `update enrollments` (`:65`) fora de `db.transaction`: falha no meio deixa tentativas abandonadas com a matrícula na versão antiga. Sem `--dry-run`, sem `learner_events`.
Correção: abandonar só quando `currentNodeId` foi removido (ou quando o nó atual ficou sem saída válida); envolver em `db.transaction`; `--dry-run`; registrar `attempt_abandoned` como `startOrResumeAttempt` faz (`learning.ts:214-219`). O comentário do próprio script ("parada numa cena que saiu") descreve a regra certa; o código faz outra.

**A3. Margens de corte ainda podem invadir a palavra vizinha (a correção de hoje não cobre o caso contíguo).**
`apps/worker/src/adjust.ts:164-167`. Trecho do meio: `tb = max(words[b].end + 0.06, min(words[b].end + 0.3, words[b+1].start - 0.02))`. Quando `words[b+1].start ≤ words[b].end + 0.08` (alinhamento por letra sem pausa, comum), `tb = end + 0.06` entra até 60 ms na palavra tirada — o "e aí…" que motivou a correção pode voltar. Começo de trecho (`:164`): `ta = max(words[a-1].end + 0.02, words[a].start - 0.2)` pode cair 20–30 ms DENTRO da primeira palavra que fica (consoante inicial cortada). A lógica está inline, sem teste (`adjust-joins.test.ts` cobre só `joinsAfterRemoval`).
Correção: `gap = words[b+1].start - words[b].end`; margem `= clamp(gap/2, 0, 0.3)`; garantir `ta ≤ words[a].start`. Extrair `segmentTimes(words, segs, total)` para função pura e testar com palavras contíguas.

**A4. `skip` sobrevive à regravação por ÍNDICE de palavra, sem conferir o texto.**
`packages/media/src/adjust.ts:335` (reaplicação de `[from,to]`) e `validateAdjust:261-267` (só checa limites). `carryAdjust` reaplica quando a fala do plano não mudou, mas a tokenização do novo alinhamento pode diferir (hífen, número, "d'água") → tira palavras erradas em silêncio.
Correção: guardar o texto do trecho tirado junto do `skip`; no carry, reaplicar só se `norm(words[from..to])` bate, senão `skipped.push('trecho …: palavras não batem')`.

**A5. Conteúdo: a regra "No lugar de X, o que você…?" é violada em 11 perguntas.**
Regra em `packages/db/src/scripts/titulos-perspectiva.ts:2`. Violam (caso em 3ª pessoa + opções "Eu…" + título sem o personagem): CSV 312 `C03·A2·q03` "Como você combinaria esse recado?" (Ana); CSV 1066 `C10·A1·q01` "Como você entregaria essa lista?" (Henrique); e 9 das 10 perguntas do C13 (CSV 1417, 1465, 1503, 1532, 1569 "Qual compromisso você assume agora?" [Luana], 1615 "Como você reage ao descobrir o erro?" [Caio], 1644, 1680, 1708, 1743). Só `C13·A1·q11` segue a regra.
Correção: aplicar `titulos-perspectiva.ts` com um JSON para essas perguntas (ex.: "No lugar da Luana, qual compromisso você assume?"), depois `publicar-e-matricular` (após A2).

### MÉDIO

**M1. Player: depois da vinheta, o vídeo longo RECOMEÇA durante a ida ao servidor (mesma família do bug "autoplay recomeçava").**
`immersive-player.tsx:199-204`: `onDone` faz `markOutro(); setOutroNow(false); if (currentNodeId === lastLongId) send({kind:'advance'})`. `setOutroNow(false)` remonta `Scene` (a instância anterior saiu quando `OutroStage` entrou) com `useSceneVideo` novo: `phase='idle'`, `videoRef.current.ended=false` → o guarda de `use-scene-video.ts:139` não se aplica e `play()` (`:140`) dispara com `autoPlay = gesture`. O vídeo longo toca de novo (com rampa de som) até a resposta do `advance` trocar o nó. Se `send` for descartado (`use-player-session.ts:122`: `if (!session || pending) return`), o aluno vê o vídeo inteiro de novo e precisa clicar.
Correção: manter `OutroStage` até `state.currentNodeId !== lastLongId` (efeito que baixa `outroNow` na troca do nó), ou passar `autoPlay=false` na remontagem quando `outroPlayed` acabou de virar `true`.

**M2. `callSpoken` existe em três lugares e dois divergem.**
(1) `immersive-player.tsx:797-809` usa `m.transcript ?? narration`; (2) `immersive-player.tsx:935-946` (`leadsToChoice`) usa **só** `m?.transcript` (`:944-945`); (3) `packages/course-schema/src/video-runtime.ts:40-50` `callSpokenBefore` usa `transcript ?? narration`. Cena sem `transcript` cuja narração termina com a chamada: o vídeo da pergunta é pulado (1), mas não há avanço automático (2) → o aluno fica num vídeo terminado sem a pergunta entrar sozinha; e a duração (3) conta como pulado. Há ainda uma 4ª cópia ad hoc em `apps/worker/src/scripts/coerencia.ts:93`.
Correção: exportar `callSpokenBefore` de `@lms/course-schema` (já existe) e usá-la nos dois pontos do player; apagar `spokenWords` local (`:537`).

**M3. Balão "Reiniciar aula": o foco se perde ao fechar.**
`immersive-player.tsx:496-507`: ao abrir, foco em "Cancelar"; Esc/Cancelar/clique fora fazem `setOpen(false)` e o `div role="dialog"` desmonta com o elemento focado dentro → `document.activeElement` vira `body`. Sem `aria-modal` (ok, não é modal), mas sem devolver o foco ao botão disparador (WCAG 2.4.3).
Correção: `useRef` no botão e `triggerRef.current?.focus()` ao fechar (exceto quando "Reiniciar" navega).

**M4. Selo só é emitido no envio da checagem; concluir o curso depois não emite.**
`packages/db/src/repositories/recognition.ts:163` (`issueBadgeIfEligible` só em `submitTrailCheck`; único call site `api/trilhas/[trail]/checagem/route.ts:20`). A API aceita a checagem antes de concluir os cursos (só a UI trava em `trilhas/[trail]/page.tsx:147`). Quem passa primeiro e conclui depois vê "checagem feita" e fica sem selo até reenviar (`trail-check-form.tsx` até avisa isso em texto).
Correção: chamar `issueBadgeIfEligible` ao montar `trailStatus` quando `eligibility.eligible && !badge` (é idempotente: `UNIQUE(user_id, trail_key)` + `onConflictDoNothing`, `recognition.ts:125-147`).

**M5. Checagem: tentativas ilimitadas, gabarito devolvido por item, tabela sem teto.**
`recognition.ts:157-165` grava e devolve `results[].correct` + `feedback`; `trails.ts:601-611` exige 5/6 com 3 opções → 2–3 envios bastam. Cada POST insere em `trail_check_attempts` (`0015_trail_badges.sql:18`) sem limite; nenhum rate limit na rota. Decisão de produto ("não é prova punitiva"), mas o selo atesta pouco e a tabela cresce sem freio.
Correção mínima: 1 envio/min por usuário, e/ou só mostrar `correct` por item depois de aprovado.

**M6. Trecho curto entre dois cortes quebra o `xfade`/`acrossfade`.**
`apps/worker/src/adjust.ts:172-207`: `XF = 0.18` fixo; `offset = acc - XF` negativo quando `durs[0] < 0.18`; `acrossfade=d=0.18` falha com entrada menor que `d` (segmento de uma palavra curta, "e"). Nada valida duração mínima.
Correção: `XF = min(0.18, 0.45*min(durs))` por emenda (como `buildComposeCommand`, `compose.ts:516`) e recusar em `validateAdjust` trecho restante < 0,35 s.

**M7. Validações do ajuste não enxergam o `skip` acumulado; fallback "só o cartão" ignora `skip`.**
`packages/media/src/adjust.ts:259` e `:284` usam `keptWordRange` (sem skip): "tirar a primeira frase" passa na validação e explode em `adjustScene:152` ("ficaria sem fala") depois de baixar o clipe. `apps/worker/src/adjust.ts:308`: `if (request.teaser === undefined || (!request.drop && !request.cut && !request.trimLead)) throw e;` — pedido `{skip, teaser}` que falha lança em vez de reaplicar o cartão. `nodes.ts:372` `skip.max(10)` vs `mergeAdjust` ilimitado: a 11ª emenda grava o asset e só o zod de `saveDraft` rejeita (asset órfão).
Correção: `keptSegments(words, cut).length`; `&& !request.skip`; validar o teto em `validateAdjust`.

**M8. `video-runtime.ts`: memo do `walk` depende da ordem da DFS.**
`packages/course-schema/src/video-runtime.ts:98-120`: nó alcançado por dois caminhos com `onPath` diferente pode ter aresta de volta ignorada numa visita e contada noutra; o memo congela a primeira. Sem laço infinito, mas `min/max` pode variar entre grafos equivalentes.
Correção: classificar arestas de retorno antes (DFS) e fazer o DP no DAG; teste com laço alcançado por dois caminhos.

**M9. Conteúdo (4 itens de coerência).**
(a) Dois moldes de título coexistem: 13 perguntas com "O que você faria no lugar do X?" (molde de `docs/qa/coerencia/revisao.md`) e 24 com "No lugar da X, …?" (molde de `titulos-perspectiva.ts`). (b) `C06·A3` ("Quando o alvo é outra pessoa") abre sem vídeo e sem chamada (CSV 683: a aula começa no painel `q04`), e é a única cujas situações ainda terminam repetindo a pergunta (CSV 684, 695). (c) Opções **fortes** com retorno que cobra ("Falta…"): CSV 687 `C06·A3·q04·A`, CSV 704 `C06·A3·q05·C`; a origem é o molde do pacote-15 — `packages/db/src/scripts/pacote-15/editorial.ts` tem 28 de 30 opções `strong` com "Falta …" (linhas 39, 53, 60, 67, 74…) — se o pacote for importado, multiplica. (d) CSV 1916-1917 `C14·A3·v05`: "**Também** vale olhar a página 'trabalhe conosco'…" ficou sem o 1º item depois que o plano "a gente é agente de integração…" saiu (`remendos/plano.md:45`); `revisao-fable.md` item 29 reconhece e não resolveu.
Correção: escolher um molde; abertura/ponte para C06·A3; nas fortes trocar "Falta X. Faça assim:" por "Para completar:"; regravar uma frase em C14·A3.

**M10. Promessa de "selo por curso" ainda vive num script e numa frase de abertura.**
`packages/db/src/scripts/revisao-roteiro.ts:17`: `const SELO = 'E ainda ganha o Selo de competência DNA Work para colocar no seu currículo.'` inserido nas 14 aberturas (`:116`). A regra real é selo por **trilha** (`packages/course-schema/src/trails.ts:2-6`; UI coerente: `immersive-player.tsx:1494-1499`, `achievements.tsx:49`). No CSV final a frase não aparece (0 ocorrências; nos rascunhos havia 14), então foi cortada depois — mas rodar o script de novo a reintroduz. `docs/qa/remendos/plano.md:5` ("a fala do Selo fica nas 14 aberturas") contradiz `docs/qa/enriquecimento/brief.md:13` e o CSV. Também CSV ~1783 `C14·A1·v00`: "vou te acompanhar **até a sua primeira vaga**" roça a promessa de contratação que `brief.md:100` veta.
Correção: neutralizar `SELO` no script (ou apagar o script, ver M12); atualizar `plano.md`; regravar "na preparação para a sua primeira vaga" na próxima rodada.

**M11. Código morto e diagnóstico no player e na montagem.**
`immersive-player.tsx:101-104`: `lastVideo` é escrito e nunca lido (`grep lastVideo` → só `:101`, `:103`); arrastam `reportVideo`, `onVideoReport`, `phaseRef` e dois efeitos (`:857-869`, `:923`) — 9 referências de encanamento sem efeito (a decisão da vinheta passou a ser `onLongVideoEnded`). Comentário obsoleto duplicado em `:541-542`. `packages/media/src/compose/compose.ts:762-763`: `COMPOSE_DUMP` faz `import('node:fs/promises')` dinâmico no caminho quente e grava onde a env mandar, sem documentação. Duplicação `CALL_SHOT_RE` (`packages/media/src/adjust.ts:291`) × `isCallShotId` (`bridge.ts:26`).
Correção: remover o encanamento de `lastVideo`; `COMPOSE_DUMP` ou vira flag documentada no README do pacote (com `import` estático) ou sai antes do commit; um só regex para o plano de chamada.

**M12. Scripts descartáveis misturados aos reutilizáveis.**
One-off (decisões datadas, listas fixas): `packages/db/src/scripts/{gestos-defeitos,reordenar-abertura,revisao-roteiro ("pedido do autor, 31/10"),vinheta-cada-aula,remover-avaliacoes}.ts`; `apps/worker/src/scripts/{coerencia (spec fixa em docs/qa/coerencia/spec.json),remendos-mapa,revisao-final ("14 cursos atuais"),reaplicar-ajustes}.ts`. Semi-reutilizáveis (JSON + `--apply`): `perguntas-grupos.ts`, `titulos-perspectiva.ts`. Reutilizáveis: `importar-pacote-15.ts` (`--dry-run/--only/--forcar`), `duracoes-faltantes.ts`, `acabamento-lote.ts` (guarda de provedor pago `:26`), `publicar-e-matricular.ts`.
Correção: mover os one-off para `scripts/one-off/2026-10/` (ou apagar após aplicados) e não os incluir nos commits de feature.

**M13. Cobertura de testes nas partes críticas novas é baixa.**
Player: nenhum teste (unitário ou e2e) menciona `outro-stage`, `restart-confirm`, `explore-hero`, `compose-saved`, `lesson-steps` ou `callSpoken` (grep em `apps/web/e2e/*.spec.ts` e `src/**/*.test.*` → 0). O único teste web novo é `compose-state.test.ts` (funções puras). Worker: margens/xfade do ajuste (`adjust.ts:160-207`) inline, sem teste; a mesma lógica está copiada em `apps/worker/src/scripts/revisao-final.ts:270`. Engine: falta teste de laço alcançado por dois caminhos (M8).
Correção: extrair `segmentTimes`/`xfadeChain` e `callSpokenBefore` (puras) e testá-las; e2e mínimo para vinheta→pergunta e balão de reinício (foco).

### BAIXO

**B1.** Código do selo com 40 bits (`recognition.ts:114-118`: `randomBytes(8)` CSPRNG, alfabeto 32, `256 % 32 = 0` sem viés) e página pública `force-dynamic` sem rate limit (`selo/[code]/page.tsx:7,24`). Enumeração lenta mas possível. → 12 símbolos (60 bits) ou limite por IP.
**B2.** URL de verificação montada do header `Host` (`trilhas/[trail]/page.tsx:36-38`) e enviada ao LinkedIn (`linkedin.ts:13`): Host injection atrás de proxy mal configurado. → `APP_URL` em env.
**B3.** `route.ts:6` `z.record(z.string().max(16), z.string().max(16))` limita chave/valor, não a quantidade de chaves. → `.refine(o => Object.keys(o).length <= 16)`.
**B4.** `trailStatus` faz N+1 por curso (`recognition.ts:72-91`) e é chamado 2× por envio (`:122`, `:164`). Aceitável com trilhas pequenas.
**B5.** `apps/web/src/server/lesson-runtime.ts` sem `import 'server-only'`; `console.warn` por requisição (`:47`). Consultas em lote (`:25-28,41`), cache 500 entradas — ok.
**B6.** "Recomeçar o curso" é `<a href="…?reiniciar=1">` (`immersive-player.tsx:526`): GET com efeito (tentativa nova). Padrão pré-existente (`course-menu.tsx`, `[enrollmentId]/page.tsx:142`), sem prefetch por ser `<a>`; registrar.
**B7.** Botão "Reiniciar aula" do balão usa `text-[#1d1e4c]` fixo sobre `var(--im-accent)` (`immersive-player.tsx:521`) em vez de `var(--im-on-accent)`: marca com acento escuro perde contraste. Contrastes documentados da atividade compacta (`globals.css:729-734`: 14,8 / 9,6 / 7,6 / 5,7 / 3,6 não-texto) e do carrossel (`#d9d8f5` e `#ff9a3d` sobre `#1d1e4c` ≥ 7:1) conferem.
**B8.** Com a pergunta centralizada, o véu `z-[5]` (`immersive-player.tsx:1141`) escurece o aviso "Sua vez de escolher" (`:1129`, dentro do `StageMedia` que é `md:z-0`). Só visual.
**B9.** `OutroStage` esconde o topo com `opacity-0`/`pointer-events-none`, mas os botões continuam tabuláveis (`:446` `focus-within` os traz de volta): o teclado pode ir a "Cena anterior" no meio da vinheta. O guarda `currentNodeId === lastLongId` (`:203`) evita avançar do nó errado.
**B10.** `validateAdjust:265` aceita `from/to` não inteiros/`NaN` (`words[a-1]` → `undefined` no worker); `packages/media/src/adjust.ts:137` não capitaliza quando o `skip` começa no 1º trecho; `withCall` com direção sobrescreve `narration` (`bridge.ts:118-119`, decisão documentada).
**B11.** Carrossel: sem `aria-live="polite"` quando pausado (padrão WAI-ARIA opcional); `inert` nos slides ocultos e pausa por foco/ponteiro/`prefers-reduced-motion` estão corretos (`hero-carousel.tsx:36-45, 62-66`).
**B12.** Conteúdo miúdo: reações `reaction.disabled` não marcadas na transcrição (CSV 2254, 2411, 2519-2520); 18 chamadas terminam em imperativo e não em pergunta (C13, C14·A10-12, C06·A3); aspas retas em `C14·A11·q21/q22` (CSV 2408, 2435); `short-titles.ts:20` 'Primeira vaga' × "Primeira Vaga" no CSV; 93 linhas `fim` vazias (artefato do gerador).
**B13.** `apps/web/public/destaque/*.webp` (6 arquivos, 592 KB, usados em `aprender/page.tsx:34`) estão com permissão `0600` → `chmod 644`; os nomes são ids de curso do banco local. `docs/qa/**` novo ≈ 6,8 MB com a transcrição CSV/HTML duplicada em `transcricao/`, `remendos/`, `coerencia/`, `revisao-final/`.
**B14.** Pré-existente, fora da rodada: `packages/db/src/scripts/.tmp-inspect-comece-bem.ts` já está rastreado.

---

## O que está correto (verificado)

- **Segurança do selo**: elegibilidade no servidor (`trails.ts:637-648`: cursos + atividades + checagem); `UNIQUE(user_id, trail_key)` e `UNIQUE(code)` (`0015_trail_badges.sql:14-15`), `onConflictDoNothing().returning()` + releitura (`recognition.ts:125-147`) → concorrência e idempotência ok (teste `recognition.test.ts:57-71`). Gabarito nunca vai ao cliente antes do envio (`publicTrailCheck`, `trails.ts:586`; teste `trails.test.ts:25`). Rota: sessão server-side (`requireViewer`), `userId`/`workspaceId` da sessão, `trail` validado contra a lista do workspace (`recognition.ts:54`), só `POST`, erros mapeados, Zod 422. Página pública: `robots: noindex, nofollow` (`selo/[code]/page.tsx:14`), sem e-mail/userId, lookup por índice único, `isBadgeCode` antes do banco (`recognition.ts:171`). Migração coerente (`prevId` do 0014, journal idx 15, FKs com cascade).
- **Senha do seed**: nenhum script novo imprime credenciais; `SEED_PASSWORD` só em `seed.ts:13` e `e2e/helpers.ts:3` (pré-existentes); `docs/qa/**` e `.tmp/*.json` sem senha/token/URL de banco (só `*@demo.local`).
- **Montagem ffmpeg**: relógio único (`compose.ts:522-531`: `settb=AVTB,setpts=N/(fps*TB)` nos dois lados e na saída, `concat` e `xfade`); vídeo = `acc + D_i`, áudio = concat com `asetpts=PTS-STARTPTS` → mesmos comprimentos (teste real `compose.test.ts:141-156`); micro-fades só com `D > 0.1` dentro do `atrim` (`:363`); pose pura com fallback (`pose.ts`, `compose.ts:745`); sem injeção (argumentos em array, `expr` constante); temporários em `finally` (`apps/worker/src/adjust.ts:249-251`).
- **Ajuste fino**: `carryAdjust` por id de plano + texto (não por índice): reordenar não desloca; plano novo → "abertura reescrita"; `attachToNode` substitui `media` inteira (`authoring.ts:161`), sem corte duplicado. `keptSegments` com skips sobrepostos/encostados/no início/fim → união correta.
- **Motor**: zod retrocompatível (`lead`, `skip`, `baseLines`, `reaction.disabled`, `motionPrompt`, `intro`, `slot.question` todos `optional()`); `bridge.ts` substitui em vez de acumular, idempotente, remove `chamada_N` legados (teste `bridge-replace.test.ts`); `learner-sim` e `lessonVideoAssetIds` respeitam `reaction.disabled`; `scaffoldSegments` reproduz a normalização de `assembleScaffold` (teste).
- **Player**: correção do autoplay (`use-scene-video.ts:139`) resolve o caso descrito (mesma instância, `ended`); `ReactionScene` nunca prende (`:695-699`: `ended` ou falha → segue); `prefers-reduced-motion` respeitado no fade (`globals.css:776`), nas transições (`motion-reduce:`) e no carrossel; foco no título a cada cena e na confirmação "Na prática" (`:881-900`); `saved`/`dismissSaved` zerados em `send`/`reset` (`use-player-session.ts:111,230`); `inert` + `aria-hidden` nos slides ocultos; atividade compacta com `fieldset`/`legend`, rádios nativos `sr-only`, `role="status"` só no progresso curto (`scaffold-composer.tsx:159`), `autoFocus` só após ação do aluno.
- **Conteúdo**: `revisao-final/aplicado.md` (38/38) confere (C04·A1·q02·A, C14·A3·q05·A, C09·A2·fim, C14·A11 ordem); nenhuma amostra com retorno citando outra opção, reação elogiando opção fraca ou título igual ao da aula; "certificado", "garantia de emprego", "vaga garantida" não aparecem; "agente de integração" só genérico (CSV 669).

---

## Plano de commits (por assunto)

Antes: `git reset` (desfazer o índice parcial) e corrigir `.gitignore` (A1). Depois, `git add` por grupo:

1. **`feat(engine): chamada substitui a anterior, intro/question no scaffold, reação desligada, trilhas e duração por percurso`**
   `packages/course-schema/src/{bridge,direction,nodes,scaffold,reaction,learner-sim,library-defaults,library,index,trails,video-runtime}.ts`, `packages/course-schema/test/{bridge-replace,scaffold-groups,trails,video-runtime,learner-sim,reaction}.test.ts`, `apps/web/src/components/studio/direction/direction-model.ts`, `apps/web/src/components/studio/scaffold-fields.tsx`, `apps/web/src/components/studio/storyboard/scene-fields.tsx`, `docs/biblioteca-de-modelos.md`.
2. **`feat(media): corte no meio do plano, carryAdjust, relógio único nas emendas, margens, pose`** (depois de A3, A4, M6, M7; decidir M11/COMPOSE_DUMP)
   `packages/media/src/adjust.ts`, `packages/media/src/compose/{compose,index,loudness,pose}.ts`, `packages/media/test/{adjust,compose,loudness}.test.ts`, `apps/worker/src/{adjust,compose-scene}.ts`, `apps/worker/test/adjust-joins.test.ts`.
3. **`feat(reconhecimento): conquista por curso, Selo DNA Work por trilha, checagem e página pública`** (depois de M4; B2/B3 opcionais)
   `packages/db/migrations/0015_trail_badges.sql`, `packages/db/migrations/meta/{0015_snapshot.json,_journal.json}`, `packages/db/src/schema/{recognition,index}.ts`, `packages/db/src/repositories/{recognition,index}.ts`, `packages/db/test/recognition.test.ts`, `apps/web/src/app/api/trilhas/`, `apps/web/src/app/(lms)/aprender/trilhas/[trail]/`, `apps/web/src/app/(lms)/aprender/trilhas/page.tsx`, `apps/web/src/app/selo/`, `apps/web/src/app/(lms)/aprender/_components/{course-trail-card,achievements}.tsx`, `apps/web/src/app/(lms)/aprender/[enrollmentId]/aulas/[lessonId]/page.tsx`, `apps/web/src/components/player/types.ts`.
4. **`feat(player): pergunta centralizada sem barra, vídeo da pergunta pulado quando a chamada já foi dita, vinheta após o último vídeo, fade, reiniciar com balão, Na prática compacta, conquista e trilha no fim`** (depois de M1, M2, M3, M11)
   `apps/web/src/components/player/immersive/{immersive-player,recap-drawer,use-scene-video,video-prefetch}.tsx|ts`, `apps/web/src/components/player/{scaffold-composer,lesson-player}.tsx`, `apps/web/src/components/player/{use-player-session,compose-state,compose-state.test}.ts`, `apps/web/src/app/globals.css`, `apps/web/src/app/(studio)/estudio/cursos/[courseId]/aulas/[lessonId]/previa/page.tsx`.
5. **`feat(explorar): carrossel de destaques e duração real de vídeo`**
   `apps/web/src/app/(lms)/aprender/_components/{hero-carousel,catalog,course-tile,learner-ui}.tsx`, `apps/web/src/app/(lms)/aprender/_lib/{learner-courses,short-titles}.ts`, `apps/web/src/app/(lms)/aprender/page.tsx`, `apps/web/src/app/(lms)/aprender/[enrollmentId]/page.tsx` (tem partes de 3 e 5: usar `git add -p` ou deixar inteiro em 3), `apps/web/src/server/lesson-runtime.ts`, `apps/web/public/destaque/*.webp` (`chmod 644` antes).
6. **`chore(scripts): importação do pacote 15, durações faltantes, acabamento em lote, migração de matrícula só com remoções`** (depois de A2)
   `packages/db/src/scripts/{publicar-e-matricular,importar-pacote-15,perguntas-grupos,titulos-perspectiva}.ts`, `packages/db/src/scripts/pacote-15/`, `packages/db/test/{pacote-15,library}.test.ts`, `apps/worker/src/scripts/{duracoes-faltantes,acabamento-lote}.ts`.
7. **`docs(qa): remendos, coerência, acabamento e revisão final dos 14 cursos; novos cursos`**
   `docs/qa/{remendos,coerencia,acabamento,enriquecimento,perspectiva,revisao-final,transcricao}/`, `docs/qa/lote/revisao-roteiro.md`, `docs/qa/proposta-wizard-simples.md`, `docs/novos-cursos/` — manter uma só cópia da transcrição (B13) e corrigir `remendos/plano.md:5` (M10).
8. **`chore: ignora worktrees e rascunhos`** — `.gitignore` (pode ir primeiro).

**Não commitar**: `.claude/worktrees/`; `packages/db/.tmp/`; os one-off de M12 (`gestos-defeitos`, `reordenar-abertura`, `revisao-roteiro`, `vinheta-cada-aula`, `remover-avaliacoes`, `coerencia`, `remendos-mapa`, `revisao-final`, `reaplicar-ajustes`) a menos que movidos para `scripts/one-off/2026-10/`; `docs/qa/*/aplicado.log` (já cai no `*.log`); a linha `COMPOSE_DUMP` se não for documentada.

---

## Veredito

**Pode commitar por assunto, mas não tudo e não agora.** Nenhum achado crítico; os testes e o `tsc` de todos os pacotes passam. O risco está (1) no que o `git add -A` levaria junto (A1), (2) em rodar de novo scripts que destroem progresso ou reintroduzem promessa (A2, M10) e (3) em três comportamentos que os testes não cobrem (A3, M1, M2).

Corrigir **antes** de commitar: A1 (`.gitignore`), A2 (`publicar-e-matricular`: só `currentNodeId`, transação, `--dry-run`), A3 (margens com `gap/2` + teste puro), M1 (vinheta → remontagem), M2 (uma só `callSpokenBefore`), M11 (código morto `lastVideo`; decidir `COMPOSE_DUMP`), M12 (tirar os one-off do caminho dos commits).

Corrigir **antes da próxima publicação de conteúdo**: A5 (11 títulos), M9 (C06·A3, opções fortes, "Também"), M10 (`SELO` no script), A4 (skip por texto).

Podem ir para a fila: M3–M8, M13, B1–B13.
