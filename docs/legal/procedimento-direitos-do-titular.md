# Procedimento: pedidos de direitos do titular

Documento interno para quem atende contato@dnawork.ai. Versão de 01/11/2026. Base: LGPD, arts. 18 e 19 (prazo de 15 dias para a resposta completa; confirmação e acesso em formato simplificado de imediato); art. 14 (adolescentes); Lei 12.965/2014, art. 7, X (exclusão definitiva ao fim da relação, salvo guarda obrigatória).

Ferramentas (criadas em 01/11/2026, em `packages/db`; precisam de `DATABASE_URL`; sem `--apply` só mostram o que fariam): `pnpm --filter @lms/db dados:exportar <email> [--saida <pasta>]` (grava `dados.json` e `resumo.txt` numa pasta só do dono e imprime apenas o caminho e contagens); `pnpm --filter @lms/db dados:apagar <email> [--apply]` (cancela o selo e troca o nome por "Titular removido a pedido", apaga a conta e o outbox da pessoa; mantém auditoria e registro de acesso; `--encerrar` só marca a conta como encerrada); `pnpm --filter @lms/db dados:apagar-nota <email> <idDaMatrícula|idDaAula> [--apply]` (apaga a nota, o histórico e as cópias do texto; o botão "Apagar minha nota" do aluno faz o mesmo). Os scripts recusam `aluno@demo.local`, qualquer `@demo.local` do seed (só contas `lgpd-teste-*@demo.local` aceitam `--apply`) e contas de equipe, e gravam uma linha em `audit_logs` (`data.export`, `badge.revoke`, `user.delete`, `user.close`, `note.delete`). Consulta ao registro de acesso: `pnpm --filter @lms/db acesso:consultar <email|ip> --motivo "<ordem judicial>"`.

## 1. Quem atende

- Responsável: o encarregado (Caio Vinicius Pinheiro / Luan Melo Villas Boas). Um dos dois é o titular do prazo em cada pedido; registrar quem.
- A caixa contato@dnawork.ai é geral `[A CONFIRMAR: quem mais tem acesso]`. Pedidos de dados devem ser movidos para uma pasta restrita ao encarregado no mesmo dia.
- Prazo interno: acusar recebimento em 2 dias úteis; responder em até 15 dias corridos contados do pedido (art. 19, II). Se precisar de mais informação do titular, o pedido de esclarecimento não suspende o prazo: planejar com folga.

## 2. Recebimento

1. Registrar no log (seção 7): data, e-mail remetente, tipo de pedido, responsável.
2. Responder com o modelo A (acuse de recebimento) em até 2 dias úteis.
3. Se o pedido veio por outro canal (WhatsApp, telefone, pessoalmente), pedir que o titular escreva de seu e-mail para contato@dnawork.ai, ou registrar o pedido com data e canal e seguir a verificação de identidade.

## 3. Verificação de identidade

Regra: o pedido vale se vem do e-mail cadastrado na conta (`user.email`). Esse é o único identificador que o portal tem; não pedimos documento.

- E-mail diferente do cadastrado: responder pelo modelo B pedindo que o titular escreva do e-mail da conta, ou que explique por que não consegue (perdeu o acesso). Nesse caso, confirmar por dois dados que só o titular saberia: curso em que está matriculado e data aproximada de criação da conta `[A CONFIRMAR: critério]`. Em dúvida, não entregar dados; oferecer apenas exclusão (que não expõe nada).
- Pedido por responsável (pai, mãe, tutor): aceitar quando (a) o responsável informa o nome e o e-mail do aluno cadastrado e (b) [A CONFIRMAR: como comprovar o vínculo; proposta: declaração simples por e-mail mais confirmação enviada ao e-mail do aluno, com prazo de 5 dias para o aluno se opor]. O portal não guarda idade nem responsável, então não há como validar automaticamente. Registrar a decisão no log.
- Pedido de terceiro sem vínculo (empresa, escola, recrutador): não entregar nada. Responder que só o titular ou seu responsável pode pedir (modelo F).
- Autoridade (ordem judicial, requisição legal): encaminhar à direção e ao advogado antes de qualquer resposta. Registros de acesso só por ordem judicial (Lei 12.965/2014, art. 10, §1).

## 4. Passos por direito

Quando houver o script, `dados:exportar` gera um arquivo legível (JSON e resumo em texto) com tudo o que está ligado ao e-mail: conta, matrículas, tentativas, eventos, evidências, missões e histórico, checagens, selos, sessões ativas e registros de auditoria em que o aluno é objeto. Até lá, montar o mesmo conjunto por consulta.

| Direito (art. 18) | O que fazer | Observações |
| --- | --- | --- |
| Confirmação de existência (I) e acesso (II) | Confirmar por e-mail se há conta; enviar a exportação | Formato simplificado "temos sua conta com nome, e-mail e seu percurso em N cursos" pode ir de imediato; a exportação completa em até 15 dias. Enviar como anexo ao e-mail da conta, nunca a outro endereço |
| Correção (III) | Alterar `user.name` ou `user.email` | Se o nome mudar e houver selo, perguntar se quer o `holderName` do selo corrigido também (o selo guarda o nome da emissão). Registrar em `audit_logs` `[A CONFIRMAR: ação a criar]` |
| Anonimização, bloqueio ou eliminação de dados desnecessários (IV) | Avaliar o que é desnecessário para o serviço; o caso típico é a nota da missão: apagar `mission_responses.note` e o histórico em `mission_response_events` daquela resposta | Não pedir justificativa ao aluno para apagar a nota |
| Portabilidade (V) | Entregar a mesma exportação em JSON | A ANPD ainda não regulamentou formato; JSON estruturado atende o art. 19, §3 |
| Eliminação de dados tratados com consentimento (VI) | Nota da missão (base proposta: consentimento): apagar como em IV | - |
| Informação sobre compartilhamento (VII) | Responder com o texto da política: hospedagem; ninguém mais; página pública do selo se houver | - |
| Informação sobre recusa de consentimento (VIII) e revogação (IX) | Só se aplica à nota da missão: apagar e confirmar | - |
| Oposição a tratamento em legítimo interesse (art. 18, §2) | Sessão e auditoria: não dá para manter a conta sem; explicar e oferecer o encerramento. Página pública do selo: revogar o selo (ver seção 5). Números agrupados: registrar a oposição e excluir o aluno dos relatórios `[A CONFIRMAR: viável por script]` | - |
| Encerramento da conta / exclusão | Ver seção 5 | - |

## 5. Encerramento e exclusão da conta

Fato do código: apagar a linha de `user` apaga em cascata sessões, conta de senha, matrículas, tentativas, eventos, evidências, missões, checagens e os selos (`trail_badges.userId` tem `onDelete: cascade`). Registros de auditoria ficam, com o id do aluno sem chave. O registro de acesso do Marco Civil, quando existir, fica por 6 meses (guarda obrigatória; Lei 12.965/2014, art. 7, X, ressalva).

Proposta `[A CONFIRMAR pelo advogado e pelo responsável]`, a ser implementada em `dados:apagar`:

1. Confirmar o pedido com o titular (modelo D), avisando: o selo será cancelado e deixará de ser verificável; o progresso não poderá ser recuperado.
2. Selo: antes de apagar a conta, marcar `revokedAt` e trocar `holderName` por "Titular removido a pedido" (anonimização), mantendo trilha, cursos, data e código, para que a página pública mostre "Selo cancelado" e não "código não encontrado". Isso exige que o selo sobreviva à exclusão do usuário (tornar `userId` nulo ou mover o selo para um registro sem titular; decisão de código). Alternativa mais simples: deixar a cascata apagar o selo. Escolher uma.
3. Apagar a conta (cascata).
4. Auditoria: manter as linhas com o id do aluno (pseudônimo) pelo prazo de 2 anos `[A CONFIRMAR]`; ou, se o advogado preferir, substituir `data.userId` por "removido".
5. Outbox: eventos processados com `userId` são apagados pela rotina de 30 dias; se a rotina não existir ainda, apagar à mão os eventos do aluno.
6. Backups: quando existirem, a cópia expira em 30 dias `[A CONFIRMAR]`; informar isso ao titular (modelo E).
7. Confirmar ao titular por e-mail (modelo E) e registrar no log.

Prazo de carência: a política propõe guardar conta e percurso por 12 meses após o encerramento `[A CONFIRMAR]`. Um pedido explícito de exclusão (art. 18, IV ou VI) não espera esse prazo: executar em até 15 dias, salvo guarda obrigatória.

## 6. Casos especiais

- Aluno que pede para tirar o nome do selo mas manter a conta: revogar o selo e informar que não há selo "sem nome"; se o advogado aprovar a opção de nome abreviado, aplicar.
- Aluno que mudou de nome (incluindo nome social): corrigir `user.name` e, a pedido, `holderName`; reemitir o certificado.
- Pedido sobre registro de acesso (IP): informar que existe (quando existir), que é guardado por 6 meses por obrigação legal e que só é entregue por ordem judicial; o próprio IP pode ser informado ao titular na exportação `[A CONFIRMAR]`.
- Pedido de uma escola ou empresa sobre vários alunos: recusar e encaminhar à direção; só com base contratual e aviso prévio na política (`pendencias.md`, 1.3).
- Reclamação na ANPD: a ANPD pode pedir este log e o registro de operações; guardar tudo.

## 7. Log de pedidos

Planilha ou arquivo na pasta restrita do encarregado, uma linha por pedido: data do pedido; e-mail do remetente; titular (e-mail da conta); tipo (acesso, correção, exclusão, nota, selo, oposição, outro); responsável; verificação de identidade (como); data do acuse; data da resposta; o que foi feito; observações. Guardar por 5 anos `[A CONFIRMAR]`. Nunca copiar os dados exportados para o log: só o fato de que foram enviados.

## 8. Modelos de resposta

Escrever sempre em linguagem simples, sem jargão, e no e-mail da conta.

**A. Acuse de recebimento**

> Oi, [nome]. Recebemos seu pedido sobre seus dados no portal DNA Work em [data]. Vamos responder em até 15 dias. Se precisar de algo antes, responda a este e-mail. [Nome do encarregado], DNA Work.

**B. Pedido de confirmação de identidade**

> Oi. Para proteger seus dados, só podemos atender pedidos feitos pelo e-mail cadastrado na conta do portal. Você pode escrever de novo por esse e-mail? Se você não tem mais acesso a ele, nos conte, que a gente combina outra forma de confirmar que é você. [Nome do encarregado], DNA Work.

**C. Entrega de dados (acesso ou portabilidade)**

> Oi, [nome]. Segue, em anexo, tudo o que o portal guarda sobre você: sua conta, seus cursos, suas respostas e seu selo. O arquivo tem duas partes: um resumo em texto e um arquivo JSON, que serve se você quiser levar os dados para outro lugar. Só a hospedagem do portal ([PROVEDOR DE HOSPEDAGEM]) tem acesso técnico a esses dados; não enviamos nada a empresas. Qualquer dúvida, é só responder. [Nome do encarregado], DNA Work.

**D. Confirmação antes de apagar a conta**

> Oi, [nome]. Antes de apagar sua conta, queremos confirmar com você. Ao apagar: seu progresso nos cursos some e não dá para recuperar; seu selo [trilha] é cancelado e a página dele passa a mostrar "selo cancelado", sem o seu nome; seu e-mail e seu nome são removidos. Alguns registros técnicos ficam por tempo limitado, por exigência da lei, sem o seu nome. Responda "confirmo" para seguirmos. Se preferir só apagar uma nota ou cancelar o selo, também dá. [Nome do encarregado], DNA Work.

**E. Confirmação de exclusão**

> Oi. Sua conta no portal DNA Work foi apagada em [data]. Seu selo foi cancelado e seu nome foi removido dele. [Se houver backup: as cópias de segurança expiram em até 30 dias.] Obrigado por ter estudado com a gente. [Nome do encarregado], DNA Work.

**F. Pedido de terceiro**

> Olá. Só podemos tratar pedidos sobre dados feitos pela própria pessoa ou por seu responsável legal. Se você é responsável, nos escreva informando o nome e o e-mail cadastrados da pessoa, e explicando o vínculo. [Nome do encarregado], DNA Work.

**G. Nota da missão apagada**

> Oi, [nome]. Apagamos a nota que você escreveu na missão do curso [curso], incluindo o histórico. O resto do seu progresso continua igual. [Nome do encarregado], DNA Work.

**H. Resposta a responsável de menor de 18**

> Olá, [nome]. Recebemos seu pedido como responsável por [nome do aluno]. Para proteger o aluno, confirmamos o vínculo da seguinte forma: [A CONFIRMAR: procedimento]. Depois disso, respondemos em até 15 dias. [Nome do encarregado], DNA Work.
