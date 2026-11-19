# Plano: trilha de cursos livres da Cruzeiro EaD

Base: branch `feat/incremento-1-fluxo-vertical` (commit `38c1aaa`), árvore limpa. Nada foi implementado. Este plano espera o seu OK.

## Ponto de partida (o que o código já tem)

- **Importador:** `packages/course-schema/src/import/markdown-course.ts` (1.288 linhas). Ele já lê qualquer `Chave: valor` do cabeçalho em `fields` (linha 225), então campos novos entram sem quebrar os roteiros atuais.
- **Avaliação:** "Aprovação: X de Y" já existe, com a variável `acertos` e dois finais.
  - O motor guarda o resultado de cada pergunta em `lesson_attempts.state.answers`, com `correctCount` e `passed` (`packages/course-engine/src/state.ts`).
- **Tarefa:** `TaskNodeSchema` existe, mas o compilador recusa (`compile.ts:106`, `NODE_TYPE_NOT_EXECUTABLE`).
- **Certificado:**
  - só existe o de trilha: `trail_badges`, as páginas `/selo/[code]` e `/selo/[code]/certificado` e o QR. A marca DNA Work está fixa no modelo.
  - A carga horária é a soma de `estimatedMinutes` das aulas.
- **Conclusão de curso:** acontece em `packages/db/src/repositories/learning.ts:335-347`, que grava os eventos `lesson.completed` e `course.completed` no outbox.
  - O worker já tem fila com tentativas (`apps/worker/src/index.ts:42-76`), mas os handlers só registram em log (`:22-24`).
- **Login:** Better Auth 1.7.12, com cadastro desligado e sem envio de e-mail. O pacote instalado já traz o plugin `magic-link`. Não há plugin de chave de API, só `bearer`.
- **Arquivos:** os assets do tipo `document` já são legíveis só pela equipe (`api/assets/[assetId]/route.ts:23`). O upload hoje não aceita PDF (`packages/media/src/sniff.ts:2-10`).
- **Acesso:** o registro `access_logs` (migração 0019) guarda login e renovação diária, o que dá o primeiro e o último acesso.
- **Migrações:** a última é a `0019`. As novas começam em `0020` e só acrescentam tabelas e colunas, sem apagar nem renomear nada.

## Regras que valem para todas as fases

- **Branches:**
  - uma por fase, criada a partir de `feat/incremento-1-fluxo-vertical`;
  - nomes `feat/cruzeiro-f1-lancamento`, `feat/cruzeiro-f2-engajamento` e `feat/cruzeiro-f3-carga-horaria`;
  - um commit por item.
- **Compatibilidade:**
  - todo campo novo é opcional e tem padrão que mantém o comportamento atual;
  - um teste importa `docs/roteiros/*.md` e compara o documento gerado com uma foto tirada antes da mudança;
  - os cursos publicados continuam válidos no compilador.
- **Testes:** unitários do schema, do importador, do motor e dos repositórios (`packages/db/test`, com `TEST_DATABASE_URL`), mais o robô (`tools/robo-aluno`) em todo fluxo com tela.
- **Proibido:** deploy, acesso ao servidor e migração em produção.
- **Documentação:** cada sintaxe nova entra no cabeçalho do importador e num roteiro de exemplo, `docs/roteiros/exemplo-cruzeiro.md`.
- **Dados pessoais novos** (RGM, CPF, telefone, arquivos enviados): cada fase atualiza `docs/legal/registro-de-operacoes.md`, a política de privacidade e as pendências.

---

## FASE 1: essencial para lançar

Branch `feat/cruzeiro-f1-lancamento`. **Esforço: 16 a 20 dias úteis**, mais o tempo de configurar o serviço de e-mail.

### 1.0 Perfil de formato por curso (pequeno, mas necessário)

- **Por quê:** cursos de 4 a 8 h disparam os avisos de aula longa (`length.ts:14-16`, mais de 6 min ou 9 cenas) e de fala longa (`markdown-course.ts:929`). Esses avisos encheriam o `--dry-run` do conversor sem dizer nada útil.
- **Sintaxe:** `Formato: EaD` no cabeçalho, com aulas de até 30 min e cenas de até 300 palavras. Sem essa linha, vale o perfil atual, "micro".
- **Arquivos:**
  - `course.ts`: campo opcional `brief.format`;
  - `length.ts`: limites por perfil;
  - `markdown-course.ts`: leitura do campo e avisos por perfil.
- **Testes:** os roteiros atuais geram os mesmos avisos de antes, e um roteiro EaD não gera aviso de tamanho.
- **Esforço:** 0,5 dia.

### 1.1 Certificado por curso

- **Modelo de dados:**
  - `0020_emissor_certificado.sql`: coluna `workspaces.certificate_issuer` (jsonb) com nome da instituição, CNPJ, `logoAssetId`, `signatureAssetId`, nome e cargo de quem assina, e `showPlatformBrand` (padrão `true`, para manter o padrão atual).
  - `0021_certificado_curso.sql`: tabela `course_certificates` com id, `code` único (mesmo formato `DNA-XXXX-XXXX`, para a verificação pública valer para os dois tipos), workspace, usuário (nulo se a conta for apagada), curso, versão, nome do titular, RGM e CPF mascarado gravados no momento da emissão, carga horária em minutos, conteúdo programático (jsonb com módulos e minutos), data de emissão e revogação.
- **Documento:** campo opcional `certificate` no curso, com `enabled` (padrão `false`) e `workloadMinutes` (se ausente, vale a soma das aulas). O conteúdo programático sai dos módulos: título e soma de `estimatedMinutes`.
- **Sintaxe:**
  - `Certificado: sim`;
  - `Carga horária: 8 h`, que aceita `8 h`, `8h30` ou `480 min`.
  - Um curso com `Certificado: sim` sem `Carga horária` gera aviso e usa a soma das aulas.
- **Regra de emissão:** função `courseCertificateEligibility`, que reaproveita o estilo de `badgeEligibility`:
  1. curso concluído (as aulas obrigatórias, o que já existe);
  2. todas as avaliações com critério aprovadas, lidas do último resultado de cada aula;
  3. todas as tarefas obrigatórias (item 1.4) **aprovadas**.
- **Quando emitir:**
  - na conclusão do curso, dentro da mesma transação de `learning.ts`, quando já der para emitir;
  - ou quando o avaliador aprovar a tarefa.
  - O evento `certificate.issued` vai para o outbox.
- **Telas:**
  - **Fim do curso:** botão "Ver meu certificado".
  - **Página pública `/selo/[code]`:** passa a reconhecer também os certificados de curso. Mostra só o nome, o curso, a carga horária, a data e a validade. **Não mostra CPF nem RGM.**
  - **Folha de impressão `/certificado/[code]`:**
    - o RGM e o CPF mascarado (`***.456.789-**`) aparecem só para o próprio aluno logado ou para a equipe;
    - o emissor vem do workspace, e sem a marca DNA quando `showPlatformBrand` for falso;
    - o QR segue o domínio de quem acessa, como hoje.
  - **Estúdio:** "Configurações › Certificado", para o emissor, com upload de logotipo e assinatura (PNG ou JPEG); e a opção de certificado na página de detalhes do curso.
- **Arquivos:**
  - `course.ts`;
  - `markdown-course.ts`;
  - `packages/db/src/schema/recognition.ts`;
  - um repositório novo, `certificates.ts`;
  - `learning.ts` (gancho na conclusão);
  - `apps/web/src/app/selo/**`, uma rota nova `/certificado/[code]` e `certificate-sheet.tsx`, que vira um modelo com emissor;
  - `(studio)/estudio/configuracoes`.
- **Testes:**
  - a regra de emissão, cobrindo cada pendência isolada;
  - a emissão única e sem repetição;
  - o código único;
  - a máscara do CPF;
  - a página pública sem dado pessoal;
  - o robô fazendo o curso inteiro até o certificado.
- **Riscos:**
  - **Formato do certificado:** a Cruzeiro pode exigir outro formato para aceitar como hora complementar. O modelo fica configurável, mas os campos exatos precisam ser confirmados antes.
  - **CPF:** guardar só a forma mascarada no certificado e, no cadastro, o CPF cifrado, ou nada, se o RGM bastar. Decisão sua.
- **Esforço:** 4 a 5 dias.

### 1.2 Cadastro e acesso dos alunos

- **Modelo de dados:** `0022_aluno_academico_e_tokens.sql`:
  - colunas em `workspace_memberships`, porque o RGM é único **por workspace**:
    - `rgm` (texto, único por workspace quando preenchido);
    - `phone`;
    - `cpf_cipher` e `cpf_last` (só se a decisão for guardar o CPF);
  - tabela `integration_tokens`: id, workspace, nome, `hash` (SHA-256; o token só aparece uma vez), escopos (`students:write`, `progress:read`, `webhooks:manage`), criação, último uso e revogação.
- **Importação em massa:**
  - **CSV no estúdio:** colunas `nome,email,rgm,telefone,cursos`. O campo `cursos` leva os slugs separados por `;`.
    - Primeiro aparece uma prévia com erro por linha (e-mail inválido, RGM repetido, curso inexistente). Depois vem a aplicação, que é idempotente pelo e-mail.
    - Cria a conta sem senha, o papel `student` e as matrículas.
  - **API:** `POST /api/integracao/v1/alunos` com `Authorization: Bearer <token>`, aceitando até 500 alunos por chamada, com a mesma regra do CSV.
    - Devolve, por aluno, o `userId`, as matrículas criadas e, se pedido, o **link mágico**.
- **Login por link mágico:**
  - plugin `magicLink` do Better Auth, com link de uso único e validade configurável (padrão 72 h para quem chega pelo WhatsApp);
  - envio por e-mail com um transporte novo, `packages/email`: SMTP ou Resend por variável de ambiente, e "só registrar em log" em desenvolvimento;
  - a API devolve o link para outro sistema mandar pelo WhatsApp.
  - Com e-mail ativo, entra também "Esqueci minha senha", com o fluxo de recuperação do Better Auth.
- **Arquivos:**
  - `apps/web/src/lib/auth.ts` (plugins);
  - um pacote novo, `packages/email`;
  - `packages/db/src/schema/identity.ts`;
  - um repositório novo, `students.ts`;
  - as rotas `api/integracao/v1/*` e o auxiliar de autenticação `server/integration-auth.ts`;
  - as telas "Alunos › Importar CSV" e "Integrações › Tokens";
  - o login, com o pedido de link por e-mail.
- **Testes:**
  - leitura do CSV (BOM, separador `;` ou `,`, acentos);
  - RGM único;
  - idempotência;
  - escopo do token;
  - token revogado;
  - link mágico de uso único e vencido;
  - limite de tentativas.
  - Robô: login pelo link.
- **Riscos:**
  - **Link mágico pelo WhatsApp:** quem recebe o link entra na conta. Mitigação: uso único, validade curta, registro em `access_logs` e revogação ao entrar.
  - **Rede compartilhada:** o limite de tentativas por IP, de 3 em 10 s, pode travar um laboratório inteiro. Proponho ajustar o limite do login por link.
  - **E-mail:** o envio depende de um serviço, e nenhum foi contratado.
- **Esforço:** 4 a 5 dias.

### 1.3 Progresso para fora

- **Modelo de dados:** `0023_webhooks.sql`:
  - `webhook_endpoints`: workspace, URL, `secret` cifrado, eventos, ativo;
  - `webhook_deliveries`: evento, tentativa, status HTTP, próximo envio, último erro.
- **Leitura:** uma consulta só, `progressRows(workspace, filtros)`, com uma linha por aluno e curso. Ela traz:
  - nome, e-mail e RGM;
  - matrícula;
  - primeiro e último acesso (`access_logs`, ou `lesson_attempts` como reserva);
  - aulas concluídas e total;
  - nota de cada avaliação (acertos e total por cena `AV`, com aprovado ou não);
  - situação da tarefa (enviada, aprovada ou devolvida);
  - curso concluído e data;
  - código do certificado.
- **Saídas:**
  - CSV no estúdio, em "Relatórios › Exportar";
  - `GET /api/integracao/v1/progresso?curso=&desde=&pagina=`, em JSON paginado, com escopo `progress:read`.
- **Webhooks:**
  - o worker passa a enviar `enrollment.created`, `lesson.completed`, `course.completed` e `certificate.issued` para as URLs cadastradas;
  - corpo JSON com `id` do evento, para quem recebe descartar repetidos;
  - cabeçalho `X-DNA-Signature: sha256=<HMAC>` mais data;
  - até 8 tentativas, com espera crescente de 1 min a 12 h;
  - tela de entregas com o botão "reenviar".
- **Arquivos:**
  - `apps/worker/src/index.ts` (handlers);
  - um arquivo novo, `apps/worker/src/webhooks.ts`;
  - um repositório novo, `reports.ts`;
  - as rotas de integração;
  - a tela "Integrações › Webhooks".
- **Testes:** assinatura HMAC conferida, espera entre tentativas, falha marcada sem travar a fila, paginação, colunas do CSV e nenhum dado de outro workspace.
- **Riscos:**
  - **Dados pessoais:** o relatório expõe dados pessoais, então fica só para admin e para tokens com escopo, e cada exportação gera registro de auditoria.
  - **Servidor que recebe:** uma URL lenta não pode atrasar o worker. O envio tem tempo limite de 10 s.
- **Esforço:** 3 a 4 dias.

### 1.4 Missão com entrega (tipo "Tarefa")

É um tipo novo e separado da missão atual, que continua opcional e sem bloqueio.

- **Documento:** o `TaskNodeSchema` passa a executar, com:
  - `title` e `instruction`;
  - `deliverable`: `link` ou `link_file`;
  - `fileKinds`: `pdf` e `image`, até 10 MB;
  - `criteria`: lista de itens sim ou não;
  - `review`: `manual` ou `auto`;
  - `required` (padrão `true`).

  Os campos antigos continuam aceitos.
- **Sintaxe:**

```
### T01 — Missão final
Entrega: link e arquivo
Instrução: Grave um vídeo de 1 minuto se apresentando e envie o link.
Critérios: Fala o nome e o curso · Cita um objetivo · Tem até 1 minuto
Correção: avaliador | automática
Destino: FIM
```

- **Motor:** intenção nova `submit`. A aula segue depois do envio, e a tarefa fica "em correção". Não trava a aula, só o certificado.
- **Modelo de dados:** `0024_entregas.sql`:
  - `task_submissions`: matrícula, aula, cena, link, `assetId` do arquivo, status (`submitted`, `approved` ou `returned`), resultado dos critérios, comentário, avaliador e datas;
  - `task_submission_events`: histórico.
- **Upload do aluno:**
  - uma rota nova, que aceita PDF, PNG e JPEG de até 10 MB, conferidos pelos primeiros bytes;
  - grava como asset `document`, que a equipe já lê sozinha;
  - o próprio aluno lê o seu arquivo por uma regra nova;
  - o link precisa começar com `https://`.
- **Correção no estúdio:**
  - fila "Entregas para corrigir", por curso, com os critérios marcados e as opções "Aprovar" ou "Devolver com comentário";
  - quando a entrega é devolvida, o aluno vê o comentário e reenvia.
  - Com aprovação automática, aprova ao enviar.
  - Cada decisão gera evento para o webhook e uma linha de auditoria.
- **Arquivos:**
  - `nodes.ts`, `compile.ts`, `engine.ts` e `state.ts`;
  - `markdown-course.ts` (bloco `T..`);
  - `learning.ts`;
  - um repositório novo, `submissions.ts`;
  - as rotas de envio e de correção;
  - o painel da tarefa no player (`immersive-player.tsx`);
  - a tela de correção;
  - `sniff.ts` (PDF).
- **Testes:**
  - leitura do bloco `T` com cada variação;
  - erro de critérios vazios;
  - envio sem link recusado;
  - arquivo de 11 MB recusado;
  - executável disfarçado de PDF recusado;
  - aluno que não vê o arquivo de outro;
  - devolução seguida de reenvio;
  - aprovação que emite o certificado.
  - Robô: um caminho novo, que envia a tarefa.
- **Riscos:**
  - **Arquivos de alunos no servidor:** dá para conferir só o tipo, sem antivírus. O prazo de guarda precisa ser definido.
  - **Correção manual:** pode virar gargalo com dezenas de entregas por dia. A aprovação automática fica como opção por curso.
- **Esforço:** 4 a 5 dias.

### Robô, documentação e compatibilidade da Fase 1

- **Robô:** caminhos novos para entrar por link, enviar a tarefa, receber aprovação e emitir o certificado. Os 26 cursos atuais rodam de novo para confirmar que nada mudou.
- **Documentação:** `docs/roteiros/exemplo-cruzeiro.md` com todos os campos novos, e o cabeçalho do importador atualizado.
- **Esforço:** 1 a 2 dias.

---

## FASE 2: engajamento

Branch `feat/cruzeiro-f2-engajamento`. **Esforço: 14 a 19 dias**, mais custo de HeyGen.

### 2.5 Conversa com segundo personagem

- **Elenco:** `cast` ganha `avatarId`, `lookId`, `voiceId` e `voiceProvider` por personagem, até 3. A instrutora continua em `presentation`.
- **Bloco "Conversa":** passa a executar como vídeo com falas alternadas.
  - Cada fala vira um plano com o avatar e a voz de quem fala.
  - O worker monta os planos em sequência, no mesmo fluxo de hoje, mas com a voz por plano.
  - A legenda é gerada por fala.
- **Sintaxe:**

```
Elenco: Bia (avatar X, voz Y) · Recrutadora (avatar Z, voz W)

### C01 — Entrevista de emprego
Bia: "Bom dia, vim para a entrevista."
Recrutadora: "Me conte por que você quer a vaga."
Instrutora: "Repare como ela responde com um exemplo."
Destino: Q05
```

- **Arquivos:**
  - `course.ts`, `nodes.ts` e `direction.ts` (quem fala em cada plano);
  - `markdown-course.ts`;
  - `apps/worker/src/compose-plan.ts`, `compose-scene.ts` e `narration.ts` (voz por plano);
  - a cotação de mídia.
- **Riscos:**
  - **Custo:** cada personagem precisa de avatar e voz próprios, o que aumenta o custo da HeyGen.
  - **Composição de vídeo:** é a parte mais sensível do sistema, e os testes de composição precisam ser ampliados.
- **Esforço:** 5 a 7 dias.

### 2.6 Vídeo próprio com legenda e avatar em janela

- **Sintaxe:** `Vídeo próprio: tela-01.mp4` e `Legenda: tela-01.vtt` em `V..`. Sem o arquivo, a cena entra com aviso "falta mídia" para anexar no estúdio.
- **Estúdio:** anexar MP4 e `.vtt` (ou `.srt`, convertido) à cena.
  - Transcrição automática, como opção, usando a mesma ferramenta do raio-X (whisper local, sem custo).
  - Limite de upload maior para vídeo próprio, de 1 a 2 GB, ou corte orientado.
- **Avatar em janela:** quando a cena tem vídeo próprio e narração, o worker sobrepõe o avatar num canto com ffmpeg (layout novo `pip`).
- **Arquivos:** `nodes.ts` (legenda enviada), `markdown-course.ts`, `sniff.ts`, `api/assets`, o painel de mídia do estúdio e a composição no worker.
- **Riscos:**
  - **Arquivos grandes:** pesam no disco e no upload.
  - **Transcrição:** whisper leva tempo de CPU no servidor.
- **Esforço:** 4 a 5 dias.

### 2.7 Marca por workspace

- **Modelo de dados:** coluna `workspaces.branding` com logotipo, cores e nome. O tema de `config/brand.ts` passa a ler do workspace, e a variável `PLATFORM_BRAND` fica como reserva, porque já existe um TODO no código para isso (`brand.ts:14-17`).
- **Arquivos:** `brand.ts`, `layout.tsx`, `globals.css` (tokens via variáveis CSS), a tela de configurações e o e-mail.
- **Risco:** a cor do cliente pode deixar o contraste ruim, então a tela confere o contraste.
- **Esforço:** 2 a 3 dias.

### 2.8 Engajamento leve

- **Pontos das decisões:** já calculados na variável `pontos`, aparecem no fim da aula e no curso.
- **Sequência de dias:** contada pelos dias com atividade em `lesson_attempts`.
- **Lembrete:** quando o aluno passa 5 dias sem avançar, uma tarefa diária do worker manda e-mail ou o evento `learner.inactive` para o webhook.
- **Risco:** a frequência e o texto dos lembretes para adolescentes precisam de cuidado com o ECA Digital, sem pressão nem táticas de vício.
- **Esforço:** 2 a 3 dias.

---

## FASE 3: carga horária defensável

Branch `feat/cruzeiro-f3-carga-horaria`. **Esforço: 5 a 6 dias.**

### 3.9 Posição assistida e "assistiu até o fim"

- **Dados:** o evento novo `video_progress` é enviado a cada 15 s e ao sair, com cena, posição máxima e duração. Fica guardado no estado da tentativa e num resumo, o que dá o percentual assistido por cena e por aula.
- **Opção por curso:** "não permitir pular na primeira vez". O player esconde "Pular vídeo" e bloqueia o avanço da barra até o fim na primeira vez. Na revisão, libera.
- **Risco:** o aluno pode trapacear deixando o vídeo tocar sem olhar. Isso só se resolve com pergunta no meio do vídeo, que não está neste escopo.
- **Esforço:** 3 dias.

### 3.10 Relatório no estúdio

- **Métricas por curso:** matriculados, começaram, concluíram, nota média por avaliação e tarefas pendentes de correção, com filtro por período e grupo.
- **Base:** usa a mesma consulta do item 1.3.
- **Esforço:** 2 a 3 dias.

---

## Decisões que preciso de você ou da Cruzeiro antes da Fase 1

1. **Campos que a Cruzeiro aceita no certificado** para hora complementar: CPF, RGM ou os dois; quem assina; CNPJ de quem; se precisa de conteúdo programático por módulo.
2. **CPF:** guardar cifrado, guardar só os últimos dígitos, ou não guardar e usar só o RGM.
3. **Serviço de e-mail:** qual contratar (SMTP próprio ou Resend). Sem ele, o link mágico só sai pela API, para o WhatsApp.
4. **Validade do link mágico** enviado por WhatsApp (sugestão: 72 h e uso único).
5. **Correção das tarefas:** manual, automática ou por curso. E quem corrige.
6. **Grupo de controle:** fica fora da plataforma (sem matrícula), ou precisa de turmas já na Fase 1?

## O que fica de fora deste plano

- SCORM ou xAPI.
- Antivírus nos arquivos enviados pelos alunos.
- Pagamento.
- App nativo.
- Turmas e grupos (não estão no pedido; só se a decisão 6 exigir).
- Pergunta no meio do vídeo.

## Esforço total estimado

| Fase | Dias úteis |
|---|---|
| Fase 1 | 16 a 20 |
| Fase 2 | 14 a 19 |
| Fase 3 | 5 a 6 |
| **Total** | **35 a 45** |

São estimativas de ordem de grandeza, contando desenvolvimento, testes e robô, sem contar o tempo de resposta das decisões acima.
