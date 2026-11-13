# Contrato de Operação de Dados Pessoais (DPA): minuta

Minuta para revisão do advogado. Não é parecer jurídico nem contrato pronto para assinar. Escrita em 13/11/2026 a partir do código do repositório (versão `piloto/e-legal`). Onde há dúvida jurídica, o texto traz `[revisar jurídico]`. Campos entre colchetes e em branco são para preencher; nada aqui foi inventado: em especial, o CNPJ, o endereço e o representante da Operadora ficam em branco até o responsável informar.

Quem assina como Controlador no piloto (a instituição de ensino ou o polo, e qual pessoa jurídica) depende do contrato principal entre as partes `[revisar jurídico]`. **Não publicar as páginas de privacidade e de termos antes de confirmar o Controlador e de este contrato ser assinado** (ver `pendencias.md`).

---

## Partes

**CONTROLADOR**

- Razão social: [__________________________]
- CNPJ: [__________________________]
- Endereço: [__________________________]
- Representante legal (nome, cargo, CPF): [__________________________]
- Encarregado (DPO) e contato: [__________________________]

**OPERADORA**

- Razão social: [__________________________] (DNA Work; preencher conforme o contrato social)
- CNPJ: [__________________________]
- Endereço: [__________________________]
- Representante legal (nome, cargo, CPF): [__________________________]
- Contato para assuntos de dados: [__________________________]

As partes celebram este contrato como anexo do contrato principal de [descrever: licença e operação da plataforma de cursos / piloto], de [data] (o "Contrato Principal"). Em caso de conflito sobre proteção de dados, vale este contrato `[revisar jurídico]`.

## 1. Definições

Os termos "dado pessoal", "titular", "tratamento", "controlador", "operador", "encarregado" e "ANPD" têm o sentido da Lei 13.709/2018 (LGPD), art. 5. "Plataforma" é o sistema de cursos operado pela Operadora, com as telas de aluno e de estúdio, a API de integração e a exportação em CSV. "Instituição" é o Controlador. "Aluno" é o titular matriculado pelo Controlador.

## 2. Objeto e papéis

2.1. A Operadora trata dados pessoais dos alunos do Controlador, na Plataforma, em nome dele, para executar o Contrato Principal.

2.2. O Controlador decide a finalidade e os meios essenciais do tratamento e tem a relação com o titular. A Operadora trata os dados somente segundo as instruções documentadas do Controlador (LGPD, art. 39) e deste contrato.

2.3. Dados que a Operadora trata para finalidade própria são excluídos deste contrato, e para eles a Operadora é controladora: (a) contas de quem trabalha na equipe da Operadora; (b) registros de segurança da Plataforma, como IP e navegador das sessões; (c) o registro de acessos que a Lei 12.965/2014 (Marco Civil da Internet), art. 15, exige de quem mantém aplicação de internet. `[revisar jurídico: confirmar esta divisão, em especial quem é o obrigado do art. 15 e o enquadramento do item (b).]`

2.4. A Operadora não trata os dados dos alunos para fins próprios, não os vende, não os usa para publicidade nem para perfis, e não os usa para treinar modelos de inteligência artificial.

## 3. Instruções documentadas

3.1. São instruções do Controlador: este contrato e seus anexos; o Contrato Principal; as configurações que a administração do Controlador faz na Plataforma (matrículas, cursos, tokens de integração, webhooks, exportações); e pedidos escritos do encarregado do Controlador.

3.2. A Operadora avisa o Controlador se entender que uma instrução viola a LGPD ou outra lei, e pode suspender a execução dela até a resposta `[revisar jurídico]`.

3.3. A Operadora mantém registro das operações de tratamento que realiza em nome do Controlador (LGPD, art. 37). O modelo está em `docs/legal/registro-de-operacoes.md`.

## 4. Titulares e dados tratados

4.1. Titulares: alunos do Controlador, em geral pessoas de 15 a 24 anos (a Plataforma não coleta a idade, e por isso trata todos com o cuidado devido a adolescentes, LGPD, art. 14); e, de forma acessória, responsáveis legais que fizerem pedidos em nome do aluno; e pessoas da equipe do Controlador que usem o estúdio (nome, e-mail, papel).

4.2. Categorias de dados pessoais, no estado atual da Plataforma:

| Categoria | Dados | Origem |
| --- | --- | --- |
| Cadastro | nome, e-mail, RGM, telefone, papel, data de criação | Controlador (CSV no estúdio ou `POST /api/integracao/v1/alunos`) |
| Acesso | link de acesso (link mágico, 72 h, uso único), senha em hash quando houver, sessão (IP, navegador, validade de 14 dias), registro de entradas | gerado pela Plataforma, a partir do uso pelo aluno |
| Percurso | matrículas, estado e horários de cada aula, respostas e opções escolhidas, evidências de objetivos | aluno |
| Notas | acertos, total e aprovação nas avaliações; tentativas | aluno |
| Reflexões | texto livre da missão (até 500 caracteres, pode conter link colado), situação e histórico de versões; texto curto de "Na prática" (até 200 caracteres por espaço) | aluno |
| Entregas de tarefa | link enviado, arquivo opcional (PDF, PNG ou JPEG de até 10 MB), situação, critérios, comentário do avaliador, histórico | aluno e avaliador |
| Auditoria | ator, ação, entidade, data (por exemplo matrícula, importação, abertura de entrega, exportação) | Plataforma |
| Compartilhamento com o Controlador | progresso por matrícula (nome, e-mail, RGM, curso, datas, aulas concluídas, acertos, situação da tarefa), por API e por CSV; avisos por webhook (ids, e-mail e RGM do aluno, situação) | Plataforma, para o Controlador |

4.3. Não são coletados: CPF ou outro documento, endereço, data de nascimento, foto, voz, localização, dados de pagamento. Certificado de conclusão não existe na Plataforma hoje; se for criado, entra neste anexo por aditivo, antes de entrar em uso.

4.4. Dados sensíveis (LGPD, art. 5, II) não são pedidos. Os campos de texto livre podem receber dado sensível por iniciativa do aluno; a Plataforma avisa o aluno para não escrever esse tipo de dado, e o tratamento nesse caso segue o art. 11 `[revisar jurídico]`.

## 5. Finalidades

5.1. Cadastrar a turma e dar acesso ao aluno; matricular nos cursos; exibir aulas e atividades; registrar percurso, notas e reflexões; receber e corrigir tarefas; calcular a conclusão do curso; entregar ao Controlador o andamento dos alunos (API, CSV, webhooks); garantir a segurança e a continuidade da Plataforma; atender pedidos de titulares encaminhados pelo Controlador.

5.2. Qualquer finalidade nova depende de instrução escrita do Controlador.

5.3. A escolha da base legal (LGPD, art. 7) é do Controlador. `[revisar jurídico: base legal do cadastro, do percurso, das reflexões (opcionais) e do envio de progresso à própria instituição.]`

## 6. Duração, devolução e eliminação

6.1. Este contrato vale enquanto durar o Contrato Principal e enquanto a Operadora mantiver dados do Controlador.

6.2. Durante a vigência, a retenção segue os prazos que o Controlador definir. Proposta inicial, ainda não confirmada `[revisar jurídico]`: cadastro e percurso, enquanto o aluno estiver ativo e por 12 meses depois do encerramento da conta; sessões vencidas, 30 dias; eventos técnicos já processados, 30 dias; auditoria, 2 anos; registro de acessos do Marco Civil, 6 meses; arquivos de entrega, 12 meses depois da aprovação.

6.3. No fim do Contrato Principal, em até [30] dias após pedido escrito do Controlador, a Operadora (a) devolve os dados em formato de uso comum (CSV ou JSON) e (b) elimina os dados e as cópias, inclusive arquivos de entrega e cópias de segurança no ciclo rotativo, e confirma a eliminação por escrito. Ficam de fora apenas dados que a lei mande guardar, que serão informados ao Controlador (LGPD, art. 16) `[revisar jurídico: prazo e formato]`.

6.4. O arquivo (planilha) baixado e os dados recebidos por API ou webhook ficam sob responsabilidade do Controlador a partir do recebimento.

## 7. Suboperadores

7.1. O Controlador autoriza, de forma geral, os suboperadores listados no Anexo II. A Operadora avisa o Controlador por escrito, com [30] dias de antecedência, antes de incluir ou trocar um suboperador, e o Controlador pode se opor por motivo razoável; se não houver acordo, o Controlador pode encerrar o Contrato Principal sem multa pela parte afetada `[revisar jurídico: a LGPD não trata de suboperador de modo expresso; o texto segue o Guia Orientativo da ANPD sobre agentes de tratamento e a prática de mercado.]`

7.2. A Operadora impõe aos suboperadores obrigações de proteção de dados equivalentes às deste contrato e responde perante o Controlador pelos atos deles.

7.3. Os provedores de geração de vídeo, voz e texto por inteligência artificial usados para produzir o conteúdo dos cursos (HeyGen, ElevenLabs, Anthropic e OpenAI) recebem somente o conteúdo dos cursos (roteiros e textos de aula). A Operadora não envia a eles dado pessoal de aluno, e por isso eles não são suboperadores deste contrato. Se isso mudar, a lista é atualizada antes (item 7.1).

## 8. Segurança

8.1. A Operadora adota medidas técnicas e administrativas aptas a proteger os dados contra acessos não autorizados e situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão (LGPD, art. 46), e mantém essa segurança mesmo depois do término do tratamento (art. 47).

8.2. As medidas mínimas estão no Anexo I. A Operadora pode melhorá-las sem aviso, mas não reduzi-las sem acordo.

8.3. O acesso aos dados é limitado a pessoas que precisam dele para a função, com dever de confidencialidade (item 12). A regra interna de acesso está em `docs/legal/politica-interna-de-acesso.md`.

## 9. Incidentes de segurança

9.1. A Operadora comunica ao Controlador, por e-mail ao contato do encarregado, qualquer incidente que afete dados do Controlador, em até [48 horas] depois de tomar ciência `[revisar jurídico: o prazo do Controlador à ANPD e aos titulares é de 3 dias úteis pela Resolução CD/ANPD nº 15/2024 (conferir o artigo), para incidente com risco relevante; conferir o texto e fixar um prazo da Operadora que deixe tempo ao Controlador]`.

9.2. A comunicação traz, no que já se souber: natureza do incidente, dados e titulares afetados, medidas de contenção, riscos e contato. A Operadora complementa as informações conforme as apura e ajuda o Controlador a preparar a comunicação à ANPD e aos titulares (LGPD, art. 48), que é decisão do Controlador.

9.3. A Operadora registra os incidentes e as medidas tomadas (plano interno em `docs/legal/plano-de-incidentes.md`).

## 10. Direitos dos titulares

10.1. O Controlador responde aos titulares. Se a Operadora receber pedido direto de um titular, encaminha ao Controlador em até [2] dias úteis e não responde no mérito, salvo instrução.

10.2. A Operadora ajuda o Controlador a atender os direitos do art. 18 da LGPD (confirmação, acesso, correção, anonimização, bloqueio ou eliminação, portabilidade, informação sobre compartilhamento), em até [10] dias úteis depois do pedido do Controlador, por scripts de exportação e de apagamento do banco ou pelas telas da Plataforma. Hoje não há botão de exportar ou apagar a conta para o aluno; o atendimento é manual. `[revisar jurídico: prazo, para caber nos 15 dias do art. 19, II.]`

## 11. Auditoria e prestação de contas

11.1. A Operadora fornece ao Controlador, quando pedido, as informações necessárias para demonstrar o cumprimento deste contrato e permite auditorias razoáveis, com aviso de [15] dias, em horário comercial, sem expor dados de outros clientes nem segredos da Operadora, uma vez por ano, ou a qualquer tempo após incidente (LGPD, art. 39, em que o Controlador verifica a observância das instruções).

11.2. A Operadora ajuda o Controlador com relatório de impacto à proteção de dados, se a ANPD pedir (LGPD, art. 38), e com consultas da ANPD.

11.3. Custos: cada parte arca com os seus, exceto auditoria repetida sem justa causa, paga por quem pediu `[revisar jurídico]`.

## 12. Confidencialidade

12.1. A Operadora garante que as pessoas autorizadas a tratar os dados assumiram dever de confidencialidade, por contrato ou por regra interna, que continua depois do fim do vínculo.

12.2. As partes não divulgam dados pessoais nem informações confidenciais da outra, salvo ordem de autoridade (avisando a outra parte antes, quando a lei permitir).

## 13. Transferência internacional

13.1. A Operadora hospeda os dados em [país do servidor e do banco: preencher]. Se qualquer suboperador do Anexo II armazenar ou acessar dados fora do Brasil, a transferência cumpre os arts. 33 a 36 da LGPD e a regulamentação da ANPD sobre transferência internacional (cláusulas-padrão, quando aplicáveis) `[revisar jurídico: conferir a regulamentação vigente da ANPD e o mecanismo adotado]`.

13.2. Hoje, o serviço de e-mail por API (Resend) é prestado por empresa dos Estados Unidos `[confirmar]`. Se o serviço de e-mail ou o armazenamento de arquivos ficar fora do Brasil, o Anexo II mostra o país e o mecanismo de transferência.

## 14. Responsabilidade

14.1. Cada parte responde pelos danos que causar em violação à LGPD, nos termos do art. 42. O operador responde solidariamente pelos danos causados pelo tratamento quando descumprir as obrigações da legislação ou quando não tiver seguido as instruções lícitas do controlador, caso em que se equipara ao controlador (art. 42, §1º, I) `[revisar jurídico]`.

14.2. Fica assegurado o direito de regresso, na medida da participação de cada parte no dano (art. 42, §4º).

14.3. Limite de valor, multa por descumprimento e seguro: `[revisar jurídico: definir; esta minuta não propõe valores.]`

## 15. Prazo e rescisão

Este contrato começa na data da última assinatura e vale pelo prazo do item 6.1. A violação grave e não corrigida em [30] dias dá a qualquer parte o direito de rescindi-lo, bem como o Contrato Principal, na parte afetada `[revisar jurídico]`.

## 16. Disposições gerais

16.1. Este contrato segue as leis do Brasil. Foro: [__________________________] `[revisar jurídico]`.

16.2. Alterações só por escrito, assinadas pelas duas partes. O Anexo II (suboperadores) muda pelo procedimento do item 7.1.

16.3. Contatos para avisos: os indicados nas Partes.

[Local], [data].

&nbsp;

| CONTROLADOR | OPERADORA |
| --- | --- |
| Assinatura: ______________________ | Assinatura: ______________________ |
| Nome: [__________] | Nome: [__________] |
| Cargo: [__________] | Cargo: [__________] |
| CPF: [__________] | CPF: [__________] |

Testemunhas (se o jurídico exigir): 1. [__________] CPF [______] 2. [__________] CPF [______]

---

## Anexo I. Medidas técnicas e administrativas

Estado verificado no código em 13/11/2026. O que não está no ar é marcado como pendente e não faz parte da promessa até estar.

**Acesso e identidade**

- Cadastro público desligado: contas só nascem pelo Controlador (CSV no estúdio, API de integração) ou pela administração.
- Acesso por link de uso único, que vale 72 horas (configurável, até 720). A página de confirmação só consome o link no clique, para leitores de e-mail e de WhatsApp não gastarem o acesso. Link de e-mail desconhecido é recusado.
- Senha, quando houver: mínimo de 8 caracteres, guardada como hash; recuperação por link de 1 hora, que encerra as outras sessões.
- Sessão de 14 dias, renovada a cada dia de uso; cookie `HttpOnly`, `SameSite=Lax`, e `Secure` em HTTPS.
- Limites de tentativas de login, de pedidos de link e de e-mails por endereço.
- Papéis por workspace (administração, autoria, revisão, aluno), verificados no servidor. O aluno só enxerga as próprias matrículas, respostas e entregas.

**Integração**

- Tokens de integração por workspace, longos e aleatórios, com escopo mínimo (`students:write`, `progress:read`, `webhooks:manage`); só o hash do segredo fica no banco; o segredo é mostrado uma vez; revogação imediata; 120 chamadas por minuto por token.
- Webhooks: HTTPS obrigatório em produção, assinatura HMAC-SHA256 com carimbo de tempo, segredo cifrado (AES-256-GCM), tempo limite de 10 s, sem seguir redirecionamentos, bloqueio de destinos em rede privada, até 8 tentativas, corpo mínimo (sem nome, telefone, link, arquivo, comentário nem respostas).
- Exportação CSV só para a administração, protegida contra injeção de fórmula, com aviso na tela e limite de 50.000 linhas.

**Dados e arquivos**

- Arquivos de entrega: tipo conferido pelos primeiros bytes (não é antivírus), limite de 10 MB, 10 envios por hora e 30 por dia por matrícula; servidos só com login, só ao aluno que enviou e à equipe; PDF sempre como download.
- Mídia e arquivos servidos pela aplicação, só a quem está conectado; o bucket, se houver, não é público.
- Segredos e chaves fora do código (variáveis de ambiente).
- Registro de auditoria de ações da equipe (matrícula, importação, abertura de entrega, correção, exportação, webhooks), sem o conteúdo dos dados.
- Rotina diária de retenção (sessões, eventos processados, auditoria, registro de acessos), ligada em produção, com prazos por variável de ambiente.
- Scripts de exportação e de apagamento de dados de um aluno (`dados:exportar`, `dados:apagar`, `dados:apagar-nota`).

**Organizacionais**

- Política interna de acesso (`politica-interna-de-acesso.md`): sem olhar dado de aluno sem motivo, sem copiar para planilhas, conversas ou ferramentas de IA.
- Plano de resposta a incidentes (`plano-de-incidentes.md`), ainda sem exercício de mesa.

**Pendentes (dependem do servidor)**

- [PENDENTE] HTTPS na produção.
- [PENDENTE] Cópias de segurança e teste de restauração.
- [PENDENTE] IP real do aluno no registro de acessos (depende de o proxy repassar o endereço; variável `TRUSTED_PROXIES`).
- [PENDENTE] Escolha, contrato e país da hospedagem.

## Anexo II. Suboperadores

Confirmados no código e nas instruções de implantação (`deploy/easypanel.md`). Preencher nome e país antes da assinatura.

| Suboperador | Serviço | Dados do Controlador que recebe | Onde está no código | Local | Situação |
| --- | --- | --- | --- | --- | --- |
| [nome do provedor de hospedagem] | servidor onde rodam a aplicação web, o worker, o banco PostgreSQL e a fila Redis (a implantação usa o EasyPanel, software de gestão instalado no servidor) | todos os dados da Plataforma | `deploy/easypanel.md`, `docker-compose.yml`, `Dockerfile.web`, `Dockerfile.worker` | [país] | a preencher |
| [nome do provedor de armazenamento S3, se usado] | armazenamento de arquivos (entregas de tarefa, mídia), só se `STORAGE_PROVIDER=s3`; com disco local, fica no servidor acima | arquivos enviados pelos alunos e mídia dos cursos | `packages/media` (storage), `.env.example` (`S3_*`) | [país] | a preencher; pode não existir |
| SMTP escolhido ou Resend (`api.resend.com`) | envio de e-mails de acesso e de recuperação de senha | e-mail do aluno e o link de acesso ou de recuperação | `packages/email/src/transport.ts`, `config.ts` (`EMAIL_TRANSPORT`, `SMTP_URL`, `RESEND_API_KEY`) | SMTP: [país]; Resend: Estados Unidos `[confirmar]` | a escolher; hoje o padrão é `log` (não envia) |
| Cloudflare, se a produção ficar atrás dele (opcional) | proxy e CDN | tráfego da Plataforma (inclui IP e conteúdo em trânsito) | `deploy/easypanel.md` (`CLIENT_IP_HEADERS=cf-connecting-ip`) | [país] | opcional; confirmar se será usado |

Não recebem dado pessoal de aluno (verificado no código): HeyGen e ElevenLabs (`packages/media`, `apps/worker`), Anthropic e OpenAI (`packages/ai`), que recebem só conteúdo de curso. O sistema externo que recebe os webhooks e lê a API (indicado pelo Controlador) não é suboperador da Operadora: é destinatário escolhido pelo Controlador, e a responsabilidade pelos dados que ele recebe é dele `[revisar jurídico: se esse sistema for operado por terceiro, o Controlador precisa de contrato próprio com ele]`.
