# API de integração v1

Para sistemas externos (como o DNA) conversarem com o LMS: cadastrar alunos, ler o progresso e receber avisos por webhook. Todos os valores de exemplo abaixo são inventados.

- Base: `https://<domínio do LMS>/api/integracao/v1`
- Formato: JSON em UTF-8. Datas em ISO 8601 (UTC, com `Z`).
- Quem usa: sistemas, com um **token**. Pessoas da administração usam as telas de Configurações no estúdio.

## 1. Autenticação e escopos

Crie o token em **Configurações › Integrações › Tokens** (só administração). O segredo (`lms_…`) aparece uma vez; guarde-o em local seguro. Ele vale para o workspace em que foi criado e nunca enxerga dados de outro.

```
Authorization: Bearer lms_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcde
```

| Escopo | Libera |
|---|---|
| `students:write` | `GET /cursos`, `POST /alunos` |
| `progress:read` | `GET /progresso` |
| `webhooks:manage` | `GET /webhooks`, `POST /webhooks`, `DELETE /webhooks/{id}` |

Um token pode ter vários escopos. Para revogar, use o botão **Revogar** na lista (vale na hora).

### Limites

- 120 chamadas por minuto por token. Passou: `429` com `Retry-After: 60`.
- 30 falhas de autenticação por minuto por IP: `429`.
- Os limites ficam na memória do servidor (uma réplica): reiniciar zera a contagem.
- Alunos: até 500 por chamada. Links de acesso: até 1.000 por hora por token.
- Progresso: `limite` de 1 a 500 (padrão 100).

### Erros

Sempre este formato:

```json
{ "error": { "code": "FORBIDDEN", "message": "O token não tem o escopo progress:read" } }
```

| Status | `code` | Quando |
|---|---|---|
| 401 | `UNAUTHORIZED` | token ausente, malformado, desconhecido ou revogado (a mesma resposta para todos, com `WWW-Authenticate: Bearer`) |
| 403 | `FORBIDDEN` | token válido, mas sem o escopo da rota |
| 404 | `HTTP_404` ou `NOT_FOUND` | curso ou webhook inexistente neste workspace |
| 422 | `VALIDATION` ou `HTTP_422` | parâmetro inválido (a mensagem diz qual) |
| 429 | `RATE_LIMITED` | limite de chamadas |

## 2. Cursos

`GET /cursos` (escopo `students:write`): os cursos publicados que podem ir em `cursos` no cadastro de alunos.

```json
{ "cursos": [{ "slug": "comunicacao-no-primeiro-emprego", "title": "Comunicação no primeiro emprego" }] }
```

## 3. Alunos

`POST /alunos` (escopo `students:write`). Cadastra ou atualiza, de forma idempotente pelo **RGM** dentro do workspace: repetir o mesmo lote dá o mesmo resultado, sem conta, matrícula ou efeito duplicado. O RGM é único no workspace e **é obrigatório** e é a chave da linha. A conta nasce sem senha; o aluno entra por link de acesso.

### Como cada linha é identificada

| Situação da linha | O que acontece |
|---|---|
| RGM já existe no workspace | É a mesma pessoa. Atualiza nome, telefone (telefone em branco não apaga) e **e-mail**; a matrícula nos cursos é idempotente (não duplica) |
| RGM novo, e-mail novo | Cria a conta e o vínculo de aluno |
| RGM novo, e-mail de membro antigo **sem RGM** | Atribui o RGM a esse membro |
| RGM novo, e-mail que já pertence a **outro RGM** | Erro só nessa linha (`EMAIL_EM_USO_POR_OUTRO_RGM`). Nunca se troca o dono de uma conta |
| Sem RGM | Erro só nessa linha (`RGM_EM_BRANCO`) |

### Troca de e-mail

Só acontece por RGM conhecido: o mesmo RGM chegando com outro e-mail troca o e-mail daquela conta (a linha volta `atualizado` com `emailAlterado: true`). Na troca, o sistema registra auditoria (`student.email_changed`, com e-mail antigo e novo) e **encerra todas as sessões abertas** da pessoa; o novo e-mail fica como não confirmado e ela entra de novo por link de acesso (use `gerarLink`). Se o e-mail novo já é de outra conta (de outro RGM, de membro sem RGM, de conta fora do workspace), a linha dá erro e nada muda.

```json
{
  "alunos": [
    { "nome": "Maria Souza", "email": "maria.souza@exemplo.com", "rgm": "20260001", "telefone": "11 90000-0000", "cursos": ["comunicacao-no-primeiro-emprego"] }
  ],
  "gerarLink": true,
  "callbackURL": "/aprender"
}
```

```json
{
  "resumo": { "created": 1, "updated": 0, "unchanged": 0, "error": 0, "total": 1 },
  "resultados": [
    {
      "linha": 1,
      "email": "maria.souza@exemplo.com",
      "status": "created",
      "userId": "usr_k3j9x0a1b2c3d4e5",
      "cursosMatriculados": ["comunicacao-no-primeiro-emprego"],
      "cursosJaMatriculados": [],
      "linkAcesso": "https://lms.exemplo.com.br/api/auth/magic-link/verify?token=…"
    }
  ]
}
```

- `status`: `created`, `updated`, `unchanged` ou `error`. `situacao` é o mesmo valor em português: `criado`, `atualizado`, `sem_mudanca` ou `erro`. O `resumo` traz as duas contagens (`created`/`criado`, `updated`/`atualizado`, `unchanged`/`sem_mudanca`, `error`/`erro`). Os campos antigos não mudaram.
- Em `erro` a linha traz `motivo` (texto para pessoas) e `codigo` (estável, para o seu sistema decidir). Uma linha ruim não derruba as outras.
- `emailAlterado: true` (só quando houve troca de e-mail): `email` é o endereço novo.

| `codigo` | Quando |
|---|---|
| `EMAIL_INVALIDO`, `NOME_EM_BRANCO`, `RGM_EM_BRANCO`, `RGM_LONGO` | dado da linha inválido ou ausente (RGM obrigatório, até 40 caracteres) |
| `EMAIL_REPETIDO_NO_LOTE`, `RGM_REPETIDO_NO_LOTE` | o mesmo e-mail ou RGM em duas linhas do lote |
| `CURSO_INVALIDO` | curso inexistente ou não publicado |
| `CONTA_DA_EQUIPE` | e-mail ou RGM de conta da equipe; não é alterada por esta rota |
| `EMAIL_EM_USO_POR_OUTRO_RGM` | o e-mail já pertence a um aluno com outro RGM neste workspace |
| `EMAIL_EM_USO_POR_OUTRA_CONTA` | na troca de e-mail por RGM, o e-mail novo já é de uma conta sem RGM ou de fora do workspace |
| `RGM_EM_USO`, `EMAIL_EM_USO`, `CADASTRO_SIMULTANEO` | corrida com outro cadastro no mesmo instante; envie a linha de novo |
| `FALHA_AO_GRAVAR` | falha inesperada ao gravar a linha; envie de novo |
- `linkAcesso` (só com `gerarLink: true`): vale como senha até vencer e uso único. Entregue só à pessoa certa e nunca registre em log.
- Matricular o aluno em um curso gera o evento `enrollment.created` (ver webhooks).

## 4. Progresso

`GET /progresso` (escopo `progress:read`). Uma linha por matrícula do workspace.

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `curso` | não | slug do curso. Sem ele, todos os cursos. Slug que não existe: 404 |
| `desde` | não | só matrículas com atividade ou atualização **depois** deste instante (ISO 8601; sem fuso vale UTC; `2026-03-10` vale `00:00Z`) |
| `limite` | não | 1 a 500. Padrão 100 |
| `cursor` | não | `proximoCursor` da página anterior |

### O que conta para `desde`

A matrícula entra se QUALQUER um destes aconteceu depois do instante:

1. a matrícula foi criada ou concluída;
2. o aluno começou, respondeu ou concluiu uma aula (início, última resposta ou conclusão de qualquer tentativa);
3. o aluno enviou uma tarefa, ou a tarefa foi corrigida ou reenviada;
4. o aluno **entrou ou renovou a sessão** (`access_logs`). Isso vale para todas as matrículas dele, porque `ultimo_acesso` mudou.

O campo `atualizado_em` de cada linha é o instante mais recente entre tudo isso, então `atualizado_em > desde` sempre vale para as linhas devolvidas. Para sincronizar aos poucos, guarde o maior `atualizado_em` que recebeu e use-o como `desde` na próxima rodada (com uma folga de alguns segundos; repetições são inofensivas, pois cada linha traz o estado completo).

Não contam: edição do curso, mudança de nome, e-mail ou RGM do aluno.

### Paginação

A ordem é a do `id` da matrícula, que não muda. Siga `proximoCursor` até ele vir `null`. Matrículas novas durante a leitura aparecem no fim (ou na próxima rodada), e nenhuma linha se repete nem se perde entre páginas.

### Resposta

```json
{
  "itens": [
    {
      "matricula_id": "enr_8f2k1j3h4g5d6s7a",
      "status_matricula": "completed",
      "aluno": { "id": "usr_k3j9x0a1b2c3d4e5", "nome": "Maria Souza", "email": "maria.souza@exemplo.com", "rgm": "20260001" },
      "curso": { "id": "crs_p0o9i8u7y6t5r4e3", "slug": "comunicacao-no-primeiro-emprego", "titulo": "Comunicação no primeiro emprego" },
      "matriculado_em": "2026-03-10T15:30:00.000Z",
      "primeiro_acesso": "2026-03-10T16:02:11.000Z",
      "ultimo_acesso": "2026-03-18T21:40:05.000Z",
      "atualizado_em": "2026-03-18T21:40:05.000Z",
      "aulas_concluidas": 2,
      "aulas_total": 2,
      "avaliacoes": [
        { "aula_id": "aula_negociar_prazo", "aula": "Negociar um prazo", "grupo_id": "av1", "titulo": "Revisão", "acertos": 2, "total": 3, "respondidas": 3, "aprovado": true }
      ],
      "tarefa": { "status": "aprovada", "total": 1, "pendentes": 0, "enviadas": 0, "aprovadas": 1, "devolvidas": 0 },
      "curso_concluido": true,
      "concluido_em": "2026-03-18T21:40:05.000Z",
      "certificado_codigo": null
    }
  ],
  "proximoCursor": "ZTE6ZW5yXzhmMmsxajNoNGc1ZDZzN2E"
}
```

### Campos

- `status_matricula`: `active`, `completed` ou `canceled`.
- `aluno.rgm`: `null` se o aluno não tem RGM.
- `primeiro_acesso`, `ultimo_acesso`: o menor e o maior instante entre os registros de login e renovação (`access_logs`) e as tentativas de aula. Os registros de acesso são apagados após 6 meses; as tentativas completam o que faltar. `null` se a pessoa nunca entrou.
- `aulas_total`: quantas aulas são obrigatórias para concluir o curso nesta matrícula (as de `completion.requiredLessonIds`, ou todas se a lista for vazia; aulas acrescentadas depois da conclusão não contam). `aulas_concluidas`: quantas dessas têm uma tentativa concluída.
- `curso_concluido`: `true` quando a matrícula está concluída. `concluido_em`: quando.
- `certificado_codigo`: reservado. É sempre `null` até a emissão de certificados existir; quando existir, passa a vir preenchido sem mudar o formato.

### Avaliações (`avaliacoes`)

Um item por **grupo de avaliação**. O bloco `AV..` do roteiro vira várias cenas de pergunta encadeadas (`av1_q1`, `av1_q2`, `av1_q3`) e é resumido como UM grupo:

- `grupo_id`: o prefixo comum das perguntas (`av1`). Uma avaliação avulsa (id sem `_qN`) é um grupo de uma pergunta.
- `titulo`: o título do bloco, sem o sufixo "· pergunta N de M".
- `total`: quantas perguntas o grupo tem no curso.
- `respondidas`: perguntas que o aluno já respondeu; `acertos`: perguntas com resposta correta (`passed`), na tentativa de aula **mais recente que tenha resposta no grupo**. Refazer a aula substitui o resultado anterior.
- Limiar de aprovação: o "Aprovação: X de Y" do roteiro (lido da regra que sai da última pergunta). Sem regra, todas as perguntas.
- `aprovado`:
  - `true`: `acertos` chegou ao limiar;
  - `false`: respondeu todas e ficou abaixo do limiar;
  - `null`: ainda sem resultado (não respondeu nada, ou há perguntas por responder e o limiar ainda não foi atingido).
- O array traz todos os grupos da versão do curso em que o aluno está matriculado, na ordem do curso, mesmo os ainda não iniciados.

### Tarefa (`tarefa`)

Resume as tarefas **obrigatórias** das aulas obrigatórias. Uma tarefa que ficou fora do caminho da última tentativa concluída da aula, e que o aluno nunca enviou, não é cobrada.

- `status` geral, por prioridade: `devolvida` (alguma devolvida: o aluno precisa agir), `pendente` (alguma ainda não enviada), `enviada` (todas enviadas e alguma aguardando correção), `aprovada` (todas aprovadas). `null`: o curso não tem tarefa obrigatória nesta matrícula.
- `total`, `pendentes`, `enviadas`, `aprovadas`, `devolvidas`: contagens (`enviadas` = enviadas e ainda não corrigidas).

## 5. Webhooks

O LMS faz um `POST` no seu endereço quando algo acontece. Cadastre em **Configurações › Integrações › Webhooks** (administração) ou pela API (seção 5.6).

### 5.1 Eventos

| Evento | Quando |
|---|---|
| `enrollment.created` | o aluno foi matriculado em um curso |
| `lesson.completed` | o aluno concluiu uma aula |
| `course.completed` | o aluno concluiu o curso |
| `task.submitted` | o aluno enviou (ou reenviou) uma tarefa |
| `task.reviewed` | uma tarefa foi aprovada ou devolvida (inclusive a aprovação automática) |
| `certificate.issued` | reservado: o evento já existe, mas **nada o produz ainda** (a emissão de certificados está adiada) |
| `ping` | só no botão "Enviar teste"; não se assina |

### 5.2 Corpo

```json
{
  "id": "obx_a1b2c3d4e5f6g7h8",
  "type": "lesson.completed",
  "created_at": "2026-03-12T14:03:22.000Z",
  "workspace_id": "wsp_q1w2e3r4t5y6u7i8",
  "data": {
    "matricula_id": "enr_8f2k1j3h4g5d6s7a",
    "curso": { "id": "crs_p0o9i8u7y6t5r4e3", "slug": "comunicacao-no-primeiro-emprego" },
    "aluno": { "id": "usr_k3j9x0a1b2c3d4e5", "email": "maria.souza@exemplo.com", "rgm": "20260001" },
    "aula_id": "aula_negociar_prazo"
  }
}
```

- `id`: o id do evento. É o mesmo em todas as tentativas e reenvios: **descarte repetidos por ele**.
- `data` é pequeno de propósito: ids, o slug do curso e quem é o aluno (e-mail e RGM, o necessário para o seu sistema reconhecer a pessoa). Não há nome, telefone, link nem arquivo de entrega, comentário do avaliador nem respostas. Para mais, consulte `GET /progresso`.
- Todos os eventos de aluno trazem `matricula_id`, `curso` e `aluno`. O que muda:

| Evento | Campos a mais em `data` |
|---|---|
| `enrollment.created` | `matriculado_em` |
| `lesson.completed` | `aula_id` |
| `course.completed` | `concluido_em`, `certificado_codigo` (`null` por enquanto) |
| `task.submitted` | `tarefa`: `{ "aula_id": "aula_x", "no_id": "tarefa_final", "status": "enviada", "reenvio": false }` |
| `task.reviewed` | `tarefa`: `{ "aula_id": "aula_x", "no_id": "tarefa_final", "status": "aprovada", "automatica": false }` (`status` é `aprovada` ou `devolvida`) |
| `certificate.issued` | `certificado_codigo` |
| `ping` | `mensagem` (sem dados de aluno) |

### 5.3 Cabeçalhos

| Cabeçalho | Valor |
|---|---|
| `Content-Type` | `application/json; charset=utf-8` |
| `User-Agent` | `DNA-LMS-Webhooks/1` |
| `X-DNA-Event` | o tipo (`lesson.completed`) |
| `X-DNA-Delivery` | id da entrega (`wdl_…`); o mesmo em tentativas e reenvios da mesma entrega |
| `X-DNA-Timestamp` | segundos desde 1970 (UTC), do momento deste envio |
| `X-DNA-Signature` | `sha256=<hex>`: HMAC-SHA256 de `"<timestamp>.<corpo>"` com o segredo do webhook |

O corpo assinado é o **texto exato** recebido (use o corpo bruto, antes de converter para objeto).

### 5.4 Verificar a assinatura

Confira sempre: sem isso qualquer pessoa que descubra o endereço poderia enviar eventos falsos. Rejeite carimbos com mais de 5 minutos (evita repetição de um envio capturado) e compare em tempo constante.

#### Verificar a assinatura (Node.js)

```js
const crypto = require('node:crypto');

// headers: objeto com os cabeçalhos em minúsculas (como no Express/Node); corpoBruto: o texto recebido, sem converter
function verificarAssinatura(segredo, headers, corpoBruto) {
  const timestamp = headers['x-dna-timestamp'];
  const recebida = headers['x-dna-signature'] || '';
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', segredo).update(`${timestamp}.${corpoBruto}`).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Com Express, guarde o corpo bruto: `app.post('/webhooks/lms', express.raw({ type: 'application/json' }), (req, res) => { if (!verificarAssinatura(SEGREDO, req.headers, req.body.toString('utf8'))) return res.sendStatus(401); … res.sendStatus(204); })`.

#### Verificar a assinatura (Python)

```python
import hashlib
import hmac
import time


def verificar_assinatura(segredo: str, headers: dict, corpo_bruto: bytes) -> bool:
    timestamp = headers.get("X-DNA-Timestamp", "")
    recebida = headers.get("X-DNA-Signature", "")
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    mensagem = timestamp.encode() + b"." + corpo_bruto
    esperada = "sha256=" + hmac.new(segredo.encode(), mensagem, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, recebida)
```

### 5.5 Entrega e tentativas

- Sucesso = resposta **2xx**, em até **10 segundos**. Qualquer outra coisa (4xx, 5xx, redirecionamento 3xx, erro de rede, tempo esgotado) é falha. **Redirecionamentos não são seguidos**: cadastre o endereço final.
- Até **8 tentativas** por entrega. Esperas depois de cada falha: 1 min, 3 min, 9 min, 27 min, 81 min, 243 min (4 h) e 12 h, cada uma com variação aleatória de ±20% (o teto de 12 h vale sempre). Ao todo cerca de 17 horas.
- Depois da 8ª falha a entrega fica como **Falhou**. Na tela (Entregas recentes), **Reenviar** recoloca a entrega na fila com a contagem zerada, no mesmo corpo e com o mesmo `id`.
- **Idempotência no LMS:** cada evento gera no máximo UMA entrega por webhook, mesmo que o servidor reprocese o evento.
- **Idempotência no seu lado:** como pode haver tentativas repetidas (por exemplo, o seu servidor processou mas a resposta se perdeu), trate o `id` do corpo como chave de deduplicação.
- A ordem entre eventos **não é garantida** (uma tentativa antiga pode chegar depois de um evento mais novo). Use `created_at`, ou consulte `GET /progresso` para o estado atual.
- Um endereço lento ou fora do ar não atrasa os outros webhooks nem o processamento dos eventos no LMS: o envio roda em um laço separado, com no máximo 3 entregas simultâneas por endereço.
- Desativar um webhook faz as entregas pendentes dele falharem ("webhook desativado"). Apagar apaga também as entregas.
- Entregas já resolvidas (entregues ou falhas) são apagadas após 30 dias (`RETENTION_OUTBOX_DAYS`), porque o corpo tem e-mail e RGM do aluno. Apagar a conta de um aluno apaga as entregas guardadas dele.

#### Segurança do destino (SSRF)

O LMS não envia para redes internas. Em **produção**:

- só `https://`, sem usuário e senha na URL, e nome de servidor público (`localhost`, nomes sem ponto e `.local`, `.internal`, `.lan` são recusados no cadastro);
- na hora do envio, o nome é resolvido e o envio é **recusado** se QUALQUER endereço for privado, de loopback, link-local (inclui `169.254.169.254`, o serviço de metadados de nuvem), CGNAT, multicast ou reservado, em IPv4 ou IPv6 (inclusive IPv4 embutido em IPv6);
- a checagem é feita no momento de conectar, então trocar o DNS depois do cadastro não contorna a regra.

Em **desenvolvimento** (`NODE_ENV` diferente de `production`), `http://localhost` e `127.0.0.1` são aceitos para testar com um receptor local; redes privadas continuam recusadas.

### 5.6 Webhooks pela API (escopo `webhooks:manage`)

`POST /webhooks`

```json
{ "url": "https://exemplo.com.br/webhooks/lms", "eventos": ["enrollment.created", "course.completed"] }
```

```json
{
  "webhook": {
    "id": "whk_a1b2c3d4e5f6g7h8",
    "url": "https://exemplo.com.br/webhooks/lms",
    "eventos": ["enrollment.created", "course.completed"],
    "ativo": true,
    "segredo": "whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo"
  }
}
```

O `segredo` vem **só nesta resposta**; guarde-o. Nenhuma outra rota o devolve.

`GET /webhooks`: lista (`id`, `url`, `eventos`, `ativo`, `criadoEm`, `ultimoSucessoEm`, `ultimaFalhaEm`) e `eventosDisponiveis`. Sem o segredo.

`DELETE /webhooks/{id}`: apaga o webhook e as entregas dele.

Cada workspace pode ter até 20 webhooks. Para desativar, testar ("Enviar teste") ou reenviar entregas, use a tela do estúdio.

## 6. Configuração do servidor

| Variável | Onde | Para quê |
|---|---|---|
| `WEBHOOK_SECRET_KEY` | **web e worker** | chave de 32 bytes (64 caracteres hexadecimais ou 44 em base64) que cifra os segredos dos webhooks no banco (AES-256-GCM). **Obrigatória em produção**: sem ela o cadastro é recusado. Gere com `openssl rand -hex 32` e guarde em local seguro. Trocar a chave invalida os segredos já guardados (recadastre os webhooks) |
| `WEBHOOK_POLL_MS` | worker | intervalo do laço de envio (padrão 2000) |
| `RETENTION_OUTBOX_DAYS` | worker | também vale para as entregas de webhook já resolvidas (padrão 30) |

Sem a chave, fora de produção, os segredos são guardados sem cifra (só para desenvolvimento e testes).

## 7. Exportação em CSV (estúdio)

**Configurações › Relatórios › Progresso** (só administração) baixa a mesma consulta como planilha:

- UTF-8 com BOM, separador `;`, uma linha por aluno e curso;
- uma coluna por grupo de avaliação (`Avaliação: <aula> (acertos/total)`, com o valor `2/3 aprovado`);
- datas em horário de Brasília;
- células que começam com `=`, `+`, `-` ou `@` recebem um apóstrofo (à prova de injeção de fórmula);
- filtro por curso; cada exportação gera um registro de auditoria (`report.export_progress`) só com a quantidade de linhas e o curso.

## 8. Dados pessoais

O progresso, o CSV e os webhooks carregam dados pessoais de alunos (nome, e-mail, RGM, datas de acesso e resultados). Use o menor escopo possível, guarde o token e o segredo como senhas, e trate os dados recebidos conforme a LGPD. O registro das operações está em `docs/legal/registro-de-operacoes.md`.
