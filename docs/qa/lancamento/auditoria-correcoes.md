# Correções da auditoria (docs/qa/auditoria-fable.md)

Data: 2026-10-31. Nada publicado, nada commitado, servidores não reiniciados, nenhuma mídia paga.

## Corrigido

| Achado | O que mudou | Teste |
|---|---|---|
| **A1** | `.gitignore`: `.claude/worktrees/` e `packages/db/.tmp/` (`/videos-publicados/` já estava). Worktree intacto. | `git check-ignore` confirma os três caminhos |
| **A2** | `publicar-e-matricular.ts`: só encerra a tentativa cujo `currentNodeId` saiu (quem apenas passou por cena removida continua); troca de versão + encerramentos numa `db.transaction` por matrícula; grava `learner_events` `attempt_abandoned` (`reason: scene_removed`); `--dry-run` (não publica nem grava; simula com o rascunho). Regras puras em `matricula-migracao.ts`. | `packages/db/test/matricula-migracao.test.ts` (4). Dry-run real no C01: lista as 2 matrículas sem gravar |
| **A3** | `segmentTimes(words, segs, total)` em `packages/media/src/adjust.ts` (o worker passa a usá-la): fim do trecho ≤ início da próxima palavra − 0,01 s; começo ≥ fim da anterior + 0,01 s; intervalo < 20 ms corta no ponto médio; as palavras que ficam nunca são cortadas. | `packages/media/test/adjust.test.ts`: caso contíguo (0 ms), 10 ms, 50 ms, pausa larga, alinhamento sobreposto, propriedade com 200 alinhamentos aleatórios |
| **A4** | `skip` guarda também o texto normalizado (`cut[plano].skipText`, em paralelo a `skip`; opcional no zod). Ao reaplicar (`carryAdjust` leva o texto no pedido; `verifySkips` no início de `adjustScene`), se as palavras do índice não batem o trecho NÃO é aplicado e o worker registra aviso. Estado antigo (sem texto) segue como antes; `fillSkipText` preenche o texto ao montar. | 8 testes novos em `adjust.test.ts` (merge, compatibilidade, carry, desencontro por tokenização, fill) |
| **M1** | Depois da vinheta o palco SEGURA o último quadro dela até o motor trocar de cena (`outroDone`), e a cena do vídeo longo remontada não toca sozinha (`videoSeen`). Achado extra: `BrandBumper` recomeçava a vinheta já terminada (o efeito de autoplay reexecutava quando `onDone` mudava de identidade); corrigido com ref + guarda. | Headless real, aluna@demo.local, C01 aula 1 (v01 + vinheta). Normal: v01 → vinheta → pergunta, nenhum `play` depois do fim. Com 2,5 s de atraso no `advance`: a tela fica na vinheta e a pergunta entra direto, sem novo vídeo nem replay da vinheta |
| **M2** | `questionVideoSkipped(graph, choiceId)` em `packages/course-schema/src/video-runtime.ts` (`transcript ?? narration`); usada em `callSpoken` e `leadsToChoice` do player e na duração do percurso. `callSpokenBefore` e `spokenWords` locais removidos. | 5 testes em `video-runtime.test.ts` (inclui o caso sem transcrição, que fazia o aluno ficar parado) |
| **M3** | "Reiniciar aula": Esc e "Cancelar" devolvem o foco ao botão (clique fora não rouba o foco). | Headless: Esc e Cancelar mostram `restart-lesson` focado; clique fora deixa o foco onde clicou |
| **M11** | Removidos `lastVideo`/`reportVideo`/`onVideoReport`/`phaseRef` e os dois efeitos; `ReactionScene.onDone` sem argumento; comentário duplicado. `COMPOSE_DUMP` **mantido** e documentado (diagnóstico opt-in, não altera a montagem, foi o que achou o desvio de relógio); `import` agora estático. `CALL_SHOT_RE` fica duplicada de propósito (media não depende do schema), com comentário cruzado. | `apps/worker/test/call-shot-sync.test.ts` garante que as duas regras são iguais |
| **M12** | 9 scripts movidos para `oneoff/` (imports e `ROOT` ajustados, uso nos cabeçalhos atualizado), cada pasta com `README.md` de uma linha por script. DB: `gestos-defeitos`, `reordenar-abertura`, `revisao-roteiro`, `vinheta-cada-aula`, `remover-avaliacoes`. Worker: `coerencia`, `remendos-mapa`, `revisao-final`, `reaplicar-ajustes`. | `tsc` dos dois pacotes |
| **SELO** | `revisao-roteiro.ts`: constante `SELO` e seu uso removidos (boas-vindas só com o que o aluno leva). Também corrigida a frase de `docs/qa/remendos/plano.md:5`. | `tsc` |
| **A5** | 12 títulos (não 11): C13 tem **10** (q01 a q10; a auditoria lista 10 linhas CSV, só q11 já seguia a regra), C03·A2·q03, C10·A1·q01. Ex.: "No lugar da Luana, qual compromisso você assume agora?". `bridge.call` e falas intactos. Via `titulos-perspectiva.ts`, que ganhou retry em conflito de revisão (não houve conflito). Lista em `docs/qa/perspectiva/titulos-auditoria.json`. Rascunhos: C13 135→136, C03 71→72, C10 77→78. | Reexecução do script em modo seco: 0 diferenças |

Extras pequenos feitos junto: `validateAdjust` recusa índices de `skip` não inteiros (B10); o fallback "só o cartão" agora também vale para pedido com `skip` (parte de M7).

## Verificação

`tsc --noEmit` e `vitest run` nos pacotes tocados:

- `@lms/course-schema`: 230/230
- `@lms/media`: 180/180 (ffmpeg real)
- `@lms/web`: 23/23
- `@lms/worker`: 58/58 (rodado sozinho)
- `@lms/db`: 90/92. As 2 falhas são de `test/pacote-15.test.ts` (conteúdo dos 12 cursos novos em `docs/novos-cursos/pacote-15`: "seu-ritmo-tambem-importa/a02" e "o-outro-so-e-diferente: aula_02/q03 deve haver exatamente 1 recomendada"). Não é desta rodada: foi o outro agente que mexe nesses cursos.

Efeito colateral do teste do M1: a matrícula da aluna@demo.local no C01 ganhou uma tentativa nova da aula 1 (`?reiniciar=1`). O arquivo de cookie foi apagado.

## Pendências (fila)

- **M10 (C14·A3·v05, "Também…")**: é FALA gravada (vídeo), não texto de tela. Pendente: regravar o plano com "Comece pelo seu cadastro na DNA Work e pelos programas de Jovem Aprendiz." antes de "Também vale olhar…". Alternativa grátis, se o autor aceitar: ajuste fino tirando só a palavra "Também" (`skip`), que deixa "Vale olhar a página…". Os textos de tela que citam o cadastro da DNA Work (item 30 de `revisao-fable.md`) seguem como estão.
- Auditoria, segue a lista de lá: M4 (selo ao concluir o curso depois da checagem), M5 (limite da checagem), M6 (xfade com trecho < 0,18 s), M7 (restante: validação com `skip` acumulado, teto de 10), M8 (memo da DFS), M9 a/b/c (molde de título único, abertura de C06·A3, opções fortes com "Falta…"), M13 (testes e2e do player: vinheta→pergunta, balão), B1 a B14.
- `apps/worker/src/scripts/oneoff/revisao-final.ts` ainda tem a cópia antiga da conta de margens (é histórico; não roda de novo).
- Os 9 `oneoff/` ficam fora dos commits de feature, como a auditoria pede (a pasta é nova e não ignorada: decidir se entra num commit `chore(scripts)` ou se é apagada).
