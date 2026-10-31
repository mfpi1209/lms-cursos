# Auditoria do percurso do autor (wizard → curso publicado com avatar)

Data: 2026-10-29.

**Como foi feita:** só leitura, em quatro frentes (arquitetura; percurso do autor e IA; produção de mídia; prévia, publicação e segurança).
- Nenhum arquivo do projeto, banco, curso ou mídia foi alterado.
- Nenhuma chamada paga, nenhum servidor iniciado, nenhuma publicação.
- No banco de desenvolvimento rodaram apenas consultas SELECT.

**Pergunta central:** com o código de hoje, onde exatamente o autor deixa de conseguir transformar uma ideia num curso interativo publicado com avatar, e qual é o menor conjunto de ajustes para completar esse percurso?

---

## A. Diagnóstico executivo

**O percurso existe e funciona por completo apenas em modo demonstração.**
- O wizard (tema → conteúdo → estrutura → apresentação → aulas → revisão), a IA por propostas, o storyboard, a prévia com modo de teste, a produção de vídeo e a publicação versionada estão integrados.
- O banco tem 10 cursos publicados pelo wizard, todos criados pelos testes e2e, todos com IA `fake` e nenhum com vídeo.
- **Nenhum curso real chegou a publicado pelo wizard usando IA real e vídeo real.** Os cursos reais ("Pode entrar", o Light e o seed) foram inseridos e publicados por scripts.

O vídeo real funciona no caminho básico: são 68 jobs reais concluídos, com `external_id` do HeyGen.

**O principal impedimento não é a falta de peças. São quatro pontos que tornam o percurso real inseguro ou sem saída:**
1. Não há controle de gasto no servidor. O ambiente local está em modo pago para IA e vídeo, não existe orçamento nem teto, e a etapa "aprovar orçamento" não existe.
2. A IA pode apagar ou sobrescrever trabalho do autor sem mostrar o que muda: estrutura refeita e aula regerada.
3. Vídeo e texto podem divergir em silêncio: anexo sem conferir a fala, troca de apresentação sem invalidar.
4. A publicação não confere o estado da mídia: aceita vídeo simulado, ausente ou em geração.

---

## B. Inventário do que já existe

| Funcionalidade | Local no código | Acesso pela interface | Estado | Evidência |
|---|---|---|---|---|
| Criar curso | `api/courses/route.ts:16-23`, `new-course-form.tsx:14-33` | `/estudio/novo` | Completa e verificada (e2e, modo demo) | 13 cursos "Curso wizard…" no banco. O passo 1 aparece duas vezes (`course.ts:122`) |
| Rascunho com revisões e concorrência otimista | `authoring.ts:79-122`, `draft-provider.tsx:116-188` | Autosave (1,2 s) e histórico de revisões (modo avançado) | Completa e verificada (testes) | `FOR UPDATE` + `expectedRevision`, `draft_revisions` único |
| Fontes (texto colado, PDF) | `sources/route.ts:34-69`, `worker/src/sources.ts:17-30` | Wizard › Conteúdo | Parcial | O PDF quebra a tela (`step-conteudo.tsx:14,188-193`). `source_chunks` nunca são lidos (`sources.ts:53`). As fontes entram no prompt cortadas em 60 mil caracteres (`orchestrator.ts:37-47`) |
| Estrutura por IA (`outline`) | `orchestrator.ts:49-56`, `agent.ts:176-190` | Wizard › Estrutura | Implementada; executada com OpenAI (banco) | Sem reparo nem validação semântica. Não recebe a estrutura atual (`prompts.ts:165-179`) |
| Aulas por IA (`lesson`) | `orchestrator.ts:157-163`, `agent/lessons/route.ts:22-26` | Só no wizard › Aulas | Implementada; verificada em demo e com OpenAI | Sem prévia nem diff antes de aplicar (`step-aulas.tsx:339-356`). `keyScenes` aprovadas se perdem (`agent.ts:185`) |
| Revisão por IA (cena ou aula), variações | `orchestrator.ts:172-270` | Storyboard e assistente | Implementada, não verificada ponta a ponta | Mostra só contagens, sem texto antes/depois (`ai-revise.tsx:204-211`). "Aplicar mesmo assim" troca a aula inteira (`agent.ts:344-346`) |
| Direção de câmera por IA | `orchestrator.ts:465`, `direction-review.tsx` | Storyboard, um clique | Completa (backend e interface) | Preserva o que o autor ajustou (`overwriteAuthored`, `agent.ts:219-273,359-368`) |
| Avaliador de qualidade | `worker/src/agent.ts:132-146`, `evaluation.ts` | Painel "Avaliação" | Implementado por aula | Não avalia a coerência entre aulas. Padrão `includeVideo` diferente entre servidor e interface (`evaluate/route.ts:34` contra `quality-panel.tsx:216`) |
| Assistente ⌘K | `assistant/route.ts:24-40`, `assistant.ts:844` | Toda a área do curso | Implementado | Chamada à IA feita direto pelo web, sem `agent_runs`. Ações de IA rodam com um clique, sem confirmação no servidor (`assistant/execute/route.ts:55-70`) |
| Apresentação (avatar, voz, câmeras, fundo, posição) | `step-apresentacao.tsx:54-1520`, `/api/media/*` | Wizard › Apresentação | Parcial | `avatarType` nunca é gravado (`:81-87`). Sem biblioteca de cenários. 11 de 15 rascunhos ainda com avatar `sim_*` |
| Geração de ângulo (look) por IA | `media/looks/route.ts`, `heygen-looks.ts` | Diálogo "Gerar novo ângulo" | Implementada; 1 execução real (banco) | Limitador só em memória (`looks/_lib/looks.ts:10-16`) |
| Produção de vídeo (plano único, posicionado, dirigido, cinemático) | `media-jobs/route.ts:77-215`, `worker/src/media.ts`, `compose-scene.ts` | Storyboard, revisão do wizard, painel de produção, painel avançado | Implementada; básico verificado com uso real (68 jobs) | 4 painéis e 3 montadores de pedido diferentes. O `media-panel.tsx:441-503` ignora a apresentação do curso |
| Orçamento e teto de gasto | `media-jobs/route.ts:178-190` (só a estimativa) | Confirmação em 2 cliques | **Ausente** como etapa | `cost_estimated_usd` e `cost_usd` são nulos em todos os jobs e execuções. `maxCostUsd` nunca é aplicado (`ai/adapter.ts:87`) |
| Invalidação de mídia (`stale`) | `node-form.tsx:64-71`, `graph-ops.ts:416-419` | Selo "desatualizado" | Parcial | Só reage a texto, e só no cliente. O worker grava `stale:false` ao anexar (`worker/media.ts:121-133`) |
| Prévia, modo de teste e lista de vídeos | `preview/step/route.ts`, `navigation.ts:205-218`, `test-mode/*` | Storyboard "Testar a partir daqui" e painel "Vídeos e testes" | Implementada, não verificada no navegador | A lista esconde cenas sem direção nem vídeo (`video-list.tsx:35`). A prévia lê o rascunho salvo (`previa/page.tsx:25`) |
| Compilador (caminhos, objetivos) | `compile.ts` | Revisão e editor ao vivo; botão de publicar desabilitado com erros | Completa e verificada (testes) | `OBJECTIVE_UNCOVERED` conta nós inalcançáveis (`compile.ts:324`) |
| Publicação versionada e matrícula fixa na versão | `publishing.ts:19-38`, `learning.ts:23-43` | Revisão › Publicar | Completa no núcleo | `expectedRevision` é opcional (`publish/route.ts:7`). Não olha a mídia. Não há como mover alunos para uma versão nova |
| Motor com estado no servidor, idempotente | `learning.ts:269-343`, `engine.ts` | Player | Completa e verificada (testes + e2e) | O cliente envia só a intenção do aluno |
| Voltar cena e trocar resposta | `navigation.ts:134-163`, `learning.navigateAttempt` | Player (botão, mapa, ←) | Completa no estado; parcial nas evidências | As evidências desfeitas continuam contando. As tentativas da avaliação são zeradas (`navigation.ts:148-152`) |
| Privacidade do treino de voz | `open-answer.tsx:184-236`, `immersive-player.tsx:741` | Player | Verificada no código | O áudio nunca sai do navegador. A promessa "Só você ouve" se sustenta |
| Armazenamento local e S3 | `media/src/storage/*` | — | Local em uso; S3 implementado sem bucket real | `getSignedUrl` nunca é usado. O docker-compose não tem volume compartilhado entre web e worker |
| Rotas sem chamador na interface | `agent-runs/[id]/cancel`, `duplicate`, `versions`, `enrollments/[id]/report`, `me/enrollments`, `workspace/students`, `assistant/suggestions`, `courses GET`, `enrollments GET` | Nenhum | Desconectada | Varredura de chamadores (frente de arquitetura) |
| Tipos de nó planejados (`dialogue`, `task`, `evidence`, `resource_simulation`, `ai_feedback`) | `nodes.ts:192-231` | Não oferecidos | Só no esquema | A IA não os gera (`ai/schemas.ts:53`). A publicação os bloqueia (`compile.ts:80-83`) |
| Eventos do outbox sem consumidor | `course.published`, `lesson.completed`, `media_job.succeeded`… | — | Só `console.log` | `worker/src/index.ts:17-28` |

---

## C. Percurso do autor

| Etapa | Entrada | Saída persistida | Próxima etapa conectada? | Intervenção técnica necessária | Problema encontrado | Classificação |
|---|---|---|---|---|---|---|
| 1. Criar curso | Título e briefing | `courses` e `course_drafts` (`wizard.step='tema'`) | Sim, vai para `/montar` | Não | O passo 1 se repete no wizard com os mesmos campos | Completa e verificada (demo) |
| 2. Briefing e fontes | Texto, PDF | `source_documents`; chunks; `doc.sourceIds` | Em parte: texto truncado, chunks ignorados, fonte em `processing` excluída sem aviso | **Sim**: fonte com falha não tem reprocessamento | **PDF quebra a tela** (P0-3). Sem rastreio de qual fonte originou cada trecho | Parcial |
| 3. Gerar estrutura | Botão "Propor estrutura" | `agent_runs` e `agent_proposals(outline)` | Parcial: "pedir outra proposta" não leva a anterior nem a atual | Não | Sem reparo nem validação semântica | Implementada, não verificada (2 execuções reais) |
| 4. Aprovar estrutura | "Usar esta estrutura" | Nova revisão; `requiredLessonIds`; `completedSteps` | Parcial: `keyScenes` e `rationale` descartadas | **Sim** em conflito: sem "aplicar mesmo assim", e a proposta some ao recarregar | **Repropor a estrutura apaga as cenas das aulas sem aviso** (P0-4). Sem diff | Parcial |
| 5. Gerar aulas e cenas | "Gerar aulas" (1 execução por aula) | Uma proposta por aula; aplicação em lote atômica | Sim, usa o rascunho atual | Sim se o worker estiver parado (sem cancelamento na interface) | Aplicação às cegas; erros do roteiro ocultos; regerar sobrescreve edições e vídeos; 409 sem saída | Implementada, não verificada (real) |
| 6. Revisar falas e interações | Edição no storyboard, "Revisar com IA", variações, ⌘K | Autosave e revisões | Sim | Recuperar perdas exige o modo avançado | Revisão sem texto antes/depois. Força de variação troca a aula inteira. O banner de conflito descarta as alterações locais apesar de dizer que as mantém | Implementada, não verificada |
| 7. Configurar apresentação | Avatar, voz, câmeras, fundo, posição | `document.presentation` | Parcial: o pedido de vídeo leva avatar, voz e fundo **pelo corpo do cliente** | Não | Trocar apresentação não invalida vídeos. Sem biblioteca de cenários. `avatarType` ausente | Parcial |
| 8. Testar prévia | "Testar a partir daqui", barra de teste | Nada (sem persistência) | Sim | Não | A prévia pode mostrar a revisão anterior se aberta antes do autosave | Implementada, não verificada no navegador |
| 9. Aprovar orçamento | — | **Nada** | — | — | Não há cotação, teto nem registro de aprovação. `confirmPaid` é um literal do cliente. O lote é um laço no navegador | **Ausente** |
| 10. Produzir mídia | Lote ou cena a cena | `media_jobs`, `assets`, `node.media` (nova revisão) | Sim | **Sim**: job zumbi, `reconciliation_required`, disjuntor | Anexa sem conferir a fala. Job pode ficar preso em `running`. Plano único pago pode se perder depois de 2 h | Parcial (básico verificado real) |
| 11. Revisar resultado | Player, painéis | Nada (sem aprovar ou rejeitar) | Publicação aceita qualquer estado | Voltar ao vídeo anterior = restaurar revisão inteira | Sem estado "aprovado". `stale` não confiável | Parcial |
| 12. Publicar | "Publicar" na revisão | `course_versions` imutável | Sim, para novas matrículas | Mover alunos para a versão nova exige script | Aceita mídia simulada, ausente ou em geração. Cada anexo do worker gera 409 na publicação. `expectedRevision` opcional | Parcial |

---

## D. Achados priorizados

### P0: bloqueiam o percurso, perdem dados ou gastam sem querer

**P0-1. Gasto real sem trava no servidor (IA e mídia)**
- **Sintoma:** em dev, um clique em "Dirigir aula com IA" chamou a OpenAI real. Isso aconteceu de fato: `run_moyy87edol4s1fz0`, de 24/10, sobre o curso publicado. Gerar vídeo em dev chama HeyGen e ElevenLabs reais.
- **Evidência:**
  - O provedor é decidido só pelo ambiente (`packages/ai/src/registry.ts:18-42`, `packages/media/src/scene.ts:30-42`).
  - O `.env` local tem `AI_PROVIDER=openai` e as chaves, sem `MEDIA_SIMULATION`. O worker ignora `run.provider` (`apps/worker/src/agent.ts:46`).
  - As rotas de IA não pedem confirmação, e `confirmPaid` vem do cliente (`media-jobs/route.ts:23`).
  - O Playwright reaproveita o servidor de dev (`playwright.config.ts:18-20`).
  - `cost_usd` é nulo em 37 execuções reais.
- **Consequência:** o autor (ou um teste, ou um agente) gasta sem perceber e sem registro.
- **Menor ajuste:**
  - Exigir `ALLOW_PAID_PROVIDERS=1` para provedor diferente de `fake` ou mídia não simulada; sem a variável, cair para `fake` e simulação.
  - Expor o modo em `/api/ai/capabilities` e `/api/media/capabilities`, com o selo "IA real / vídeo real" nos botões.
  - O worker recusa a execução quando o provedor dele diverge de `run.provider`.
- **Reaproveitar:** os pontos únicos de configuração (`registry.ts`, `scene.ts`), a trava simulado/real do worker (`worker/media.ts:317`) e o `ActionButton` armado.
- **Esforço:** pequeno.
- **Aceite:** com o `.env` atual sem a variável, `POST …/agent/outline` cria uma execução `fake`, `media-jobs` cria `simulated=1`, e um worker com provedor diferente falha a execução sem chamar a API. Testes unitários cobrem os dois casos.

**P0-2. Produção sem orçamento nem teto**
- **Sintoma:** "gerar todos os vídeos" é um laço no navegador, sem total em créditos ou moeda e sem limite. No incidente de 23/10, 81 narrações pagas foram desperdiçadas e 62 jobs foram cancelados à mão.
- **Evidência:** `step-revisao.tsx:201-232`; `media-jobs/route.ts:178-190` (estimativa sempre nula, só um limite de 200 jobs na fila); a ElevenLabs é cobrada antes de validar o HeyGen (`worker/media.ts:367-389`).
- **Consequência:** o autor não sabe quanto vai gastar nem pode limitar.
- **Menor ajuste:**
  - `POST /media-jobs/quote` devolve o total (caracteres, segundos, cenas reaproveitadas) e um `quoteId`.
  - O envio em lote (servidor) exige um `quoteId` válido.
  - Teto por workspace por dia (caracteres e segundos), checado no POST.
  - Verificação barata do avatar e da voz antes de sintetizar.
- **Reaproveitar:** a estimativa existente, `elevenLabsCharacterCost`, o disjuntor (`worker/media.ts:81-97`) e o reaproveitamento por `sceneHash`.
- **Esforço:** médio.
- **Aceite:** um POST acima do teto devolve 402/409 sem criar job; um lote sem `quoteId` é recusado; a tela mostra o total antes de confirmar.

**P0-3. Upload de PDF derruba o passo "Conteúdo"**
- **Evidência:** a rota devolve `status:'processing'` (`sources/route.ts:58-59`), mas `SourceStatus` não inclui esse valor e `StatusPill` lê `map[status].tone` em `undefined` (`step-conteudo.tsx:14,188-193`). Não há `error.tsx` nem polling. Conclusão vem só da leitura do código, sem execução.
- **Consequência:** o autor que envia material em PDF perde a tela.
- **Menor ajuste:** estado "Lendo arquivo…", polling enquanto houver `processing`, e bloquear "Continuar" ou avisar enquanto houver fonte pendente.
- **Esforço:** pequeno.
- **Aceite:** enviar um PDF de texto mostra "Lendo…" e depois "Pronta", sem recarregar, e a fonte entra na geração.

**P0-4. Repropor a estrutura apaga as cenas das aulas sem aviso**
- **Evidência:** `applyOutline` só mantém o grafo de aulas com o mesmo id (`packages/db/src/repositories/agent.ts:183-186`), e o prompt não recebe os ids atuais (`prompts.ts:165-179`). Sem edições depois da proposta, não há conflito, então o conteúdo some em silêncio. A interface promete preservar (`step-estrutura.tsx:42`). Com conflito, não há "aplicar mesmo assim".
- **Consequência:** perda de aulas geradas e editadas. A recuperação só existe pelo histórico de revisões no modo avançado.
- **Menor ajuste:**
  - Enviar ao prompt as aulas atuais (id e título), com a regra de manter ids.
  - Na proposta, marcar cada aula como mantém / perde N cenas / nova / removida.
  - Exigir confirmação quando houver perda.
  - Oferecer "aplicar mesmo assim" no 409.
- **Reaproveitar:** `graphDiffSummary` (`agent.ts:434-446`), `isPlaceholderGraph`, o padrão de confirmação do `DirectionProposalPanel`.
- **Esforço:** médio.
- **Aceite:** com 2 aulas geradas, uma nova proposta lista o que se perde, e aplicar exige confirmação quando há perda.

**P0-5. Vídeo anexado como "pronto" mesmo quando a fala mudou; job pode travar a fila**
- **Evidência:**
  - `attachToNode` grava `stale:false` sem comparar a fala (`worker/media.ts:121-133`), e `setNodeMedia` não valida (`authoring.ts:136-161`).
  - Se a cena for apagada durante o job, `setNodeMedia` lança `NOT_FOUND` e o job fica em `running` para sempre (`worker/media.ts:235-239,464-471`). Não dá para cancelá-lo com `externalId`, e ele ocupa vagas (3 por curso, 5 globais).
- **Consequência:** curso publicado com vídeo que não bate com o texto, ou produção inteira parada.
- **Menor ajuste:**
  - `setNodeMedia` recebe a fala usada no job e grava `stale:true` se a fala atual for diferente.
  - Registrar `draftRevision` no job.
  - Em `NOT_FOUND` no anexo, encerrar o job como concluído com nota "cena removida", mantendo o asset.
- **Reaproveitar:** `spokenTextOf`/`sameSpoken`, `directionLinesMatchSpoken`.
- **Esforço:** pequeno.
- **Aceite:** testes com banco. Editar a fala durante o job termina com `stale=true`. Apagar o nó durante o job o tira de `running` em um ciclo.

### P1: falhas relevantes com contorno

| Id | Sintoma | Evidência | Menor ajuste | Esforço | Aceite |
|---|---|---|---|---|---|
| P1-1 | Trocar voz, avatar, fundo, câmera ou posição não marca vídeos como desatualizados | Nada compara `generatedFrom.sceneHash`; `wizard-state.ts:103`, `storyboard-editor.tsx:190` | Guardar em `generatedFrom` uma impressão da apresentação e comparar em `video-stats.ts`/`next-steps.ts` | P/M | Trocar a voz aumenta a contagem de desatualizados |
| P1-2 | Publicação aceita mídia simulada, ausente ou em geração | `publishing.ts:19-38`; `compile.ts:184` (só aviso de desatualizado) | Avisos `MEDIA_SIMULATED`/`MEDIA_MISSING` no compilador; confirmação de publicar lista as contagens; bloquear simulada fora do modo de simulação | P/M | Nó com mídia simulada gera aviso; confirmação mostra contagens |
| P1-3 | Aula proposta aplicada às cegas; erros ocultos; regerar sobrescreve edições e vídeos; 409 sem saída | `step-aulas.tsx:339-356`; `orchestrator.ts:138-139`; `agent.ts:192-197` | Botão "Ver proposta" (storyboard em leitura + `graphDiffSummary`); selo de erros; aviso "edições manuais / N vídeos"; "aplicar mesmo assim" | M | O autor vê as cenas antes de aplicar; proposta com erro exige confirmação |
| P1-4 | `keyScenes` aprovadas na estrutura não chegam ao gerador de aula | `step-estrutura.tsx:329-337` → descartadas em `agent.ts:185`; `prompts.ts:188` já as usaria | `keyScenes`/`rationale` no `LessonSchema`; gravar em `applyOutline`; repassar em `lessonArgs` | P | O prompt de `lesson` contém as cenas previstas |
| P1-5 | Execução de IA presa sem cancelamento pela interface | Rota `agent-runs/[id]/cancel` sem chamador; varredura só no worker (`index.ts:87-91`) | Botão "Cancelar" nas barras de execução; aviso "worker sem resposta" após 2 min em `queued` | P | Run `queued` cancelado pela interface libera o passo |
| P1-6 | O banner de conflito do rascunho induz à perda de dados | `draft-provider.tsx:338-346` → `adopt` (`:99-107`) | Texto honesto ("Descartar as minhas e recarregar") e opção de copiar as alterações | P | O texto descreve o efeito real |
| P1-7 | "Aplicar mesmo assim" em variação ou revisão substitui a aula inteira | `agent.ts:344-346` contra `scene-variations.tsx:80,124` | Na força, aplicar só o nó-alvo sobre o grafo atual | M | A edição em outra cena sobrevive |
| P1-8 | Voltar cena deixa evidências fantasmas e zera tentativas | `learning.ts:309-312`; `progress.ts:84-87`; `navigation.ts:148-152` | `superseded_at` em `objective_evidence`; preservar o contador de tentativas | M | Aprovar → voltar → reprovar = `not_demonstrated` |
| P1-9 | E2E grava no banco de dev e depende de dados de lá | `playwright.config.ts:3,18-20`; `navigation.spec.ts:11,51`; `studio.spec.ts:33-43` | `webServer` próprio (banco `_e2e`, `fake`, simulação), migrate e seed no `globalSetup` | M | `pnpm test:e2e` não altera `lms_cursos` |
| P1-10 | Vídeo de plano único pago pode se perder após 2 h | `worker/media.ts:505-506`; colheita só para dirigido (`compose-scene.ts:1309-1320`) | Estender a consulta por 24 h a jobs com `externalId`, reaproveitando `harvestDirectedJob` | P | Job que fica pronto após 2 h é anexado sem nova cobrança |
| P1-11 | Fontes sem rastreabilidade; truncamento silencioso | `sources.ts:53-55`; `orchestrator.ts:37-47` | Montar o trecho a partir dos chunks com rótulos; `sourceRefs` por cena; registrar cobertura e truncamento | M/G | A cena mostra "baseada em: Manual p.3" |

### P2: melhorias

**Cópias, estados e fluxo**
- **Passo 1 duplicado.** Criar o curso já em `conteudo`.
- **`wizard.finished`.** Gravar no servidor ao publicar.
- **Aulas manuais fora de `requiredLessonIds`.** Hoje o aluno conclui o curso sem elas.
- **Sem estado "aprovada" por aula, sem indicador de "mudanças não publicadas".**
- **Assistente não aplica sugestões ao briefing.**
- **Revisão por IA descarta a direção do autor sem aviso** (`schemas.ts:313-315`).
- **Autosave antes de abrir a prévia** (`draft-provider.tsx:37` contra `previa/page.tsx:25`).
- **A lista "Vídeos" esconde cenas sem direção nem vídeo.**

**Robustez e segurança**
- **Guarda do banco de teste.** Exigir o sufixo `_test` antes de `drop schema` (`db/test/setup.ts:8-10`).
- **`expectedRevision` obrigatório na publicação.**
- **Tentativa abandonada aceita eventos** (`learning.ts:211,306`).
- **Outbox perde o evento se o worker morrer no meio** (`index.ts:56-61`). Usar lease.
- **Aluno lê qualquer asset do workspace, inclusive de rascunho** (`assets/[assetId]/route.ts:17-23`).
- **Seed sem trava de produção.** A senha do perfil admin está em texto no README (`README.md:30`) e é impressa pelo seed.
- **Limitadores em memória** (assistente, looks).
- **Versão de prompt errada gravada na direção** (`worker/src/agent.ts:78`).
- **`presenterPronoun` fora do hash.** `maxCinematicPerLesson` não é aplicado no servidor.

**Limpeza**
- 4 painéis de mídia, sendo que `media-panel.tsx` ignora a apresentação do curso.
- 9 rotas sem chamador.
- 31 exports sem uso.
- `branding.theme` nunca lido.
- `REDIS_URL` sem uso.
- Assets duplicados por `sha256`.
- Docs que contradizem o banco: "poucos vídeos reais" contra 68 jobs reais; S3 "não implementado" contra o adapter existente; "toda cena recebe legenda" contra 3 de 91.

---

## E. Plano incremental (três incrementos, por dependência)

### Incremento 1. Percurso seguro: sem gasto acidental e sem perda silenciosa
- **Inclui:** P0-1 (trava de provedores pagos e selo de modo), P0-5 (fala conferida no anexo e job zumbi), P1-9 (e2e isolado), guarda do banco de teste, P1-5 (cancelar execução).
- **Entrega:** o autor e a equipe podem usar e testar o wizard sem risco de gasto. Os testes deixam de poluir o dev. Vídeo e texto nunca divergem como "pronto".
- **Reaproveita:** `registry.ts`, `scene.ts`, a trava simulado/real do worker, `setNodeMedia`, `seed()`/`runMigrations`.
- **Aceite:**
  - Com o `.env` sem `ALLOW_PAID_PROVIDERS`, nenhuma execução ou job real é criado.
  - Testes com banco cobrem "editar a fala durante o job" e "apagar o nó durante o job".
  - `pnpm test:e2e` não altera `lms_cursos`.

### Incremento 2. Texto confiável no wizard: do material às aulas aprovadas, sem surpresa
- **Inclui:** P0-3 (PDF), P0-4 (estrutura sem perda + diff + aplicar mesmo assim), P1-4 (`keyScenes`), P1-3 (ver proposta da aula + erros + aviso de sobrescrita), P1-6 (banner honesto), passo 1 duplicado, `requiredLessonIds`.
- **Entrega:** com IA real autorizada, o autor vai de briefing e PDF até as aulas revisadas vendo o que muda antes de aplicar, sem perder trabalho e sem precisar de intervenção técnica.
- **Reaproveita:** `graphDiffSummary`, `buildStoryboard`/`SceneCard` em modo leitura, a confirmação do `DirectionProposalPanel`, a UI de força do `ai-revise.tsx`.
- **Aceite:** um curso real percorre os passos 1 a 6 com IA real autorizada e, ao repropor a estrutura, nenhuma aula perde cenas sem confirmação explícita.

### Incremento 3. Produção e publicação coerentes: orçamento aprovado, vídeos válidos, versão consistente
- **Inclui:**
  - P0-2: cotação no servidor com `quoteId`, teto por workspace e uma etapa "Orçamento" dentro da revisão do wizard.
  - P1-1: a apresentação invalida vídeos.
  - P1-2: a publicação confere o estado da mídia.
  - P1-10: colheita de plano único.
  - Autosave antes da prévia.
  - Opcional, se houver alunos ativos: P1-8 (evidências).
- **Entrega:** o autor vê e aprova o custo total, produz, encontra vídeos desatualizados ou ausentes e publica uma versão sem mídia simulada ou divergente.
- **Reaproveita:** a estimativa existente, o disjuntor, `courseVideoStats`, `compileLesson`, `ProductionPanel`.
- **Aceite:** um curso de teste vai do briefing à versão publicada com vídeo real, dentro do teto, com a cotação aprovada registrada. A publicação lista e bloqueia mídia simulada.

---

## F. O que preservar e o que adiar

**Preservar (funciona e deve ser a base):**
- Contrato do curso, compilador e versões imutáveis com matrícula fixa na versão.
- Rascunho com revisões e concorrência otimista.
- IA por **propostas** (nunca aplica sozinha), com `baseRevision`, laço de reparo e validadores de ensino.
- Proteção do que o autor ajustou na direção (`overwriteAuthored`). É o modelo a estender para falas e aulas.
- Motor determinístico no servidor e navegação com retratos de estado.
- Pipeline de mídia com reaproveitamento por hash, Idempotency-Key, lease, colheita e trava simulado/real.
- Treino de voz local ("Só você ouve" é verdadeiro).
- Prévia sem persistência, modo de teste e lista de vídeos.
- Storage com chaves geradas no servidor e upload com detecção de tipo.

**Adiar (não é necessário para concluir o wizard):**
- Multiempresa e billing; S3 com bucket real e URLs assinadas; Docker e deploy.
- Migração de alunos entre versões (só quando houver turmas ativas).
- Rastreabilidade completa de fontes (P1-11) e eval set de prompts.
- Tipos de nó planejados (`dialogue`, `task` etc.) e consumidores dos eventos do outbox.
- Biblioteca de cenários e coerência visual avançada.
- Unificação dos 4 painéis de mídia: melhora a manutenção, mas não bloqueia. Fazer junto com P1-1.
- Limpeza das rotas sem chamador e dos exports sem uso.

---

## G. Evidências e limites

**Lido:**
- O código de `apps/web` (rotas, wizard, storyboard, painéis, player), `apps/worker`, `packages/*`.
- As configurações do Vitest e do Playwright.
- `docs/*` (tratados como afirmações a verificar).
- Variáveis de ambiente: só os nomes e se estão preenchidas.

**Executado:**
- Consultas SELECT agregadas no banco de dev: cursos, revisões por origem, `agent_runs` por tarefa e provedor, `media_jobs` por estado e modo, assets, mídia por nó.
- Varredura de chamadores de rotas e de exports sem uso (heurística).
- Testes unitários, depois de confirmar que usam o banco `lms_cursos_test`, provedores falsos e nenhuma leitura do `.env`: **428 testes em 34 arquivos passaram, 0 falharam**.
- Typecheck dos 7 pacotes: **passou**.

**Não executado (e por quê):**
- Playwright e2e: grava no banco de dev e usa o servidor de dev com provedor real.
- Servidores: proibido nesta auditoria.
- Qualquer chamada paga.

**Pendente de verificação:**
- **Queda com PDF (P0-3):** confirmar com servidor em `fake` e envio de um PDF.
- **Job zumbi e anexo divergente (P0-5):** confirmar com testes de worker com provedores falsos.
- **Os 68 jobs reais:** se são vídeos distintos ou repetições, e o custo efetivo (painel do HeyGen).
- **Alinhamento de legendas no vídeo real:** medir com `ffprobe` nos 3 assets com legenda.
- **Se a revisão de aula por IA preserva `media` dos nós:** teste de worker.
- **Quem disparou o run de 24/10:** cruzar `audit_logs` com os logs do servidor.
- **Como o worker recebe o ambiente localmente:** ele não carrega `.env` sozinho, e web e worker podem divergir de modo.
- **Docker, S3 real, webhook do HeyGen:** exigem infraestrutura.

**Correções ao dossiê `docs/revisao-externa.md`:**
- Há 68 vídeos reais gerados, não "poucos".
- S3 está implementado (sem bucket real).
- Confirmação explícita existe só para mídia e looks, não para chamadas de IA de texto.
- A ordem dos passos do wizard é tema → conteúdo → estrutura → **apresentação → aulas** → revisão.

---

## Primeira intervenção recomendada

**P0-1: trava de provedores pagos no servidor.** É pequena, desbloqueia o resto com segurança e impede repetir os incidentes de 23 e 24/10.

**Arquivos:**
- `packages/ai/src/registry.ts` (`aiConfigFromEnv`, `createAdaptersFromEnv`)
- `packages/media/src/scene.ts` (`mediaConfigFromEnv`)
- `apps/web/src/server/agent.ts` (`requireAiConfigured`, `enqueueRun`)
- `apps/worker/src/agent.ts` (~linha 46: conferir `run.provider`)
- `apps/web/src/app/api/ai/capabilities/route.ts` e `apps/web/src/app/api/media/capabilities/route.ts` (expor o modo)
- `apps/web/src/components/studio/agent/ai-revise.tsx` (`AiRunBar`) e `ui/action-button.tsx` (selo "IA real / vídeo real")
- `.env.example` (documentar `ALLOW_PAID_PROVIDERS`)
- Testes em `packages/ai/test` e `packages/media/test`

**Comportamento que ela deve habilitar:**
- Sem `ALLOW_PAID_PROVIDERS=1`, todo o percurso do wizard roda com IA `fake` e vídeo simulado, mesmo com chaves no `.env`, e a interface mostra claramente "modo demonstração".
- Com a variável ligada, os botões mostram "IA real" / "vídeo real".
- Um worker com provedor diferente do registrado na execução recusa a execução sem chamar a API.
