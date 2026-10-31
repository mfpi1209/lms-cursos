# Lote 10 — "Acabou minha tarefa. E agora?" (2026-10-30)

**Curso:** `crs_q52zsimeeahpa9bq` · publicado (versão 2) · 1 módulo, 2 aulas, 4 vídeos, 3 decisões, 2 missões, 1 avaliação (~7,3 min).
**Instrutora:** Beatriz, "Sua orientadora" (nova; mulher indígena, 28, cabelo preto longo e liso, blusa bege), estúdio 7.
**Voz:** Bea – Calm & Friendly (ElevenLabs, `cabLxBh81HurPAAJfEHo`, jovem, calma, pt-BR).
**Paleta:** clássica (`videoPalette = { base: "#1D1E4C", accent: "#FF7A08" }`).
**Alunos de teste matriculados:** aluno@demo.local, aluna@demo.local (versão 2).

## Custo

| Item | Valor |
|---|---|
| Visual da Beatriz (1 personagem + 3 câmeras, HeyGen) | ~4 créditos HeyGen (rodado pelo usuário via `lote-rostos.sh` → `10-gerar-beatriz.sh`) |
| Voz Bea adicionada à conta ElevenLabs | grátis |
| Vídeos V00–V03 (orçamento `mqt_dsrq6sd3mp2xun15`, aprovado com "aprovo" nesta sessão) | **US$ 3,23** estimado (152 s) — dentro do teto de US$ 4 |
| Perguntas (Q01–Q03) | US$ 0 (só texto, sem voz) |

`cost_actual_usd` ficou vazio nos 4 jobs; `/spend` mostra `actualUsd: 0` (ver achado 10).

## Entregas

- Roteiro: `docs/roteiros/lote/10_terminei_a_tarefa.md` (cópia ajustada: Marina → Beatriz; objetivo corrigido para "comunicar … e propor"; `Chamada:` em Q01–Q03; V01/V03 começam com "Seja qual for a sua escolha…"/"Qualquer que tenha sido a sua escolha…"; V01 apresenta a Jéssica antes de Q02; V02 retoma o Henrique antes de Q03; `Cartão:` em V01 e V03 para gerar pílulas).
- Biblioteca: `voz-bea`, `instrutor-beatriz` (câmeras `cam_beatriz7_esq/dir/34`, look base, prompt), kit `estudio7-beatriz` (estúdio 7, marca DNA Work, direção com zonas, regras, alunos de teste).
- Scripts meus: `packages/db/src/scripts/lote/10-biblioteca-beatriz.ts` (`voz | instrutora | aplicar | paleta | marca`), `10-gerar-beatriz.sh` (rosto, pago), `10-gravar.sh` (orçamento + lote com trava de cenas e de valor).

## Conferência dos vídeos (quadro a quadro)

| Vídeo | Duração | Rosto/voz | Letreiro | Pílulas | "A seguir" | Marca d'água / cores |
|---|---|---|---|---|---|---|
| V00 | 35,5 s | Beatriz, 3/4 → chamada na câmera esquerda | "Beatriz · Sua orientadora · DNA Work" | — | "Como entrega?" | ok / ok |
| V01 | 47,0 s | câmera esquerda | — (não é a 1ª cena) | Local · Versão · Depende de outra pessoa (véu marinho, destaque laranja) | "O que informa?" | ok / ok |
| V02 | 36,0 s | 3/4 → chamada na esquerda | "Beatriz · Sua orientadora · DNA Work" | — | "Como você continua?" | ok / ok |
| V03 | 40,4 s | câmera esquerda | — | Próxima atividade · Proponha algo pequeno · Ideia | — (segue missão) | ok / ok |

Nada de futsal, CIEE ou slogan no rascunho nem nas falas.

## QA como aluno

- Pela API do player (`/api/enrollments/…/attempts` + `/api/attempts/…/events`), aluno@demo.local:
  - Aula 1: Q01 a/b/c × Q02 a/b/c (3 percursos cobrindo todas as opções) → v01 → m01 (frase montada certa) → `fim_aula_01`, aula concluída.
  - Aula 2: Q03 a/b/c → v03 → m02 → avaliação: 3/3 → `fim_aula_02`; 2/3 com 2ª tentativa → `fim_aula_02`; 0/3 em duas tentativas → `fim_aula_02_revisar`. Toda escolha leva a algum lugar; toda aula chega ao fim.
- Páginas `/aprender…` (aluno) e `…/previa` (autor) respondem 200. Prévia no navegador: pular vídeo → pergunta (situação + chamada) → confirmar → cartão "Sua escolha" com o retorno **antes** do vídeo seguinte.
- Alunos simulados (biblioteca): média 4,2; 5 de 5 recomendam; todos terminam em ~7,3 min. Queixa única: Q01/Q02 com ~110 palavras "para ler no celular" (ver achado 11).

## O que funcionou sozinho

- Importação do roteiro com `--kit` (0 erros), direção com zonas (fala na 3/4 / lateral, pílulas na câmera lateral, alternância).
- Ponte: `Chamada:` vira plano final próprio, olho na lente, na câmera frontal; cartão "Pergunta que vem a seguir" no fim.
- Orçamento oficial (`/media-jobs/quote`) + lote (`/media-jobs/batch` com `confirmPaid`), teto de 24 h, worker real: 4 vídeos prontos em ~4 min, sem falha.
- Paleta clássica, letreiro, marca d'água e legenda aplicados pelo compositor sem ajuste.
- Publicação pela API, validação, simulação de alunos, biblioteca (`upsertTemplate`, `applyTemplateToCourse`).

## Onde precisei contornar (achados)

1. **Aplicar kit num curso existente não reaponta os planos.** `applyTemplateToCourse(estudio7-beatriz)` trocou `presentation.cameras` para `cam_beatriz7_*`, mas os `direction.shots[].cameraId` continuaram em `cam_j7_*` (câmeras da Marina, que saíram da lista). Gravar assim usaria câmera inexistente. Contorno: reimportar o roteiro com `--kit estudio7-beatriz` (só possível antes de haver vídeo pago). **Sugestão:** ao aplicar kit, remapear cameraId por zona (center/left/right) ou redirigir as cenas sem vídeo.
2. **Instrutor novo é "ovo e galinha".** `novo-instrutor.ts` grava as câmeras num rascunho, então foi preciso importar antes com o kit de outra instrutora (Marina) e, depois, montar à mão `presenter` + `kit` na biblioteca (script próprio `10-biblioteca-beatriz.ts`). **Sugestão:** o script do instrutor registrar `voice` + `presenter` + `kit` no fim (e aceitar rodar sem curso, gravando só na biblioteca).
3. **`--presenter`/`--presenter-role` são ignorados com `--kit`** (a importação com o kit da Marina gravou `presenterName: "Marina"`). Sem impacto final porque o kit da Beatriz corrigiu, mas confunde.
4. `novo-instrutor.ts` tinha `pronoun: 'he'` fixo e prefixo de câmera pela inicial; a sessão principal corrigiu durante o lote (`PRONOUN`, `CAM_PREFIX`). Usei a versão nova.
5. **Pílulas só nascem de `Cartão:`.** O roteiro do GPT traz só `Texto na tela:` (que vai para o corpo do cartão no player, não para o vídeo) e diz "sem cartões conceituais". Sem `Cartão:` os vídeos saem só com a instrutora falando. Adicionei cartões em V01/V03, como os cursos 01 e 04. **Sugestão:** o prompt de roteiro pedir `Cartão:` nos vídeos "Como aplicar", ou o importador gerar pílulas a partir de `Texto na tela`.
6. **Roteiro do GPT não traz `Chamada:`** → chamada padrão genérica ("escolha a resposta que você daria"). Escrevi uma por pergunta. **Sugestão:** incluir `Chamada:` no `prompt-gpt-roteiro-curso.md`.
7. **Cabeçalho do player com marca longa:** `branding.wordmark` = título inteiro → o cabeçalho mostrava "acabou minha tarefa. e agora?." (minúsculas + ponto laranja depois do "?"). Contorno: marca curta "Terminei a tarefa" no rascunho (não entra no vídeo; nada ficou desatualizado) e republicação (versão 2). **Sugestão:** importador derivar marca curta (ou tirar pontuação final) e o cabeçalho não acrescentar ponto quando a marca já termina em pontuação.
8. **Republicar não leva os alunos para a versão nova.** As matrículas ficam presas na versão em que foram criadas e não há rota/repositório para atualizar. Contorno: `UPDATE enrollments SET course_version_id = <versão 2>` só das duas matrículas deste curso. **Sugestão:** ação "atualizar matrículas para a última versão" (com regra para tentativas em andamento).
9. Matricular pela API exige administrador (`admin@demo.local`); o autor recebe 403. Coerente, mas o fluxo do lote ("publicar e matricular") precisa de duas contas.
10. **`cost_actual_usd` vazio** nos 4 jobs concluídos (doc diz que é preenchido na conclusão de plano único); `/spend` mostra `actualUsd: 0`. Custo real só pela fatura.
11. **Aviso `MEDIA_MISSING` nas perguntas com `Voz opcional: não`** (validação e publicação). É ruído: a decisão é só texto por escolha. Também a simulação conta `TOO_MUCH_TEXT` somando os 3 retornos, embora o aluno veja só 1 (Q01 113, Q02 110 palavras).
12. Cartão "A seguir" usa o título abreviado da pergunta ("Como entrega?", "O que informa?"), que soa cortado fora de contexto. Sugestão: usar a chamada ou a pergunta completa.
13. Detalhe visual: nas cenas com pílulas, o logo DW da parede aparece apagado através do véu marinho (lado direito). Não atrapalha a leitura.

## Observações

- A avaliação reprovada termina em `fim_aula_02_revisar` com a aula marcada como concluída (comportamento do motor preservado, como pede o roteiro).
- A matrícula de aluno@demo.local ficou "concluída" por causa do teste (os percursos acima). aluna@demo.local está intacta.
- Teto de mídia no disparo: US$ 30,42 gastos + 3,23 deste curso; restavam US$ 19,58 antes — cursos seguintes podem esbarrar no teto de 24 h.
