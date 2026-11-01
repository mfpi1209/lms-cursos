# Política interna de acesso a dados de alunos

Documento interno da DNA Work. Versão de 01/11/2026. Vale para toda pessoa com conta no estúdio ou no portal com papel `admin`, `author` ou `reviewer`, e para quem opera servidor, banco ou backups. Cada pessoa lê e confirma por escrito `[A CONFIRMAR: forma de registro do aceite]`.

## 1. Regra geral

Dado de aluno existe para o aluno fazer o curso. Nada além disso. Se a tarefa não exige olhar dado de aluno, não olhe.

## 2. Quem vê o quê

| Papel | Pode | Não pode |
| --- | --- | --- |
| `admin` | criar contas e matrículas; revogar selos; atender pedidos de direitos (com o encarregado); consultar o banco para suporte, com motivo registrado | ler notas ou respostas de alunos por curiosidade; exportar listas de alunos para fora do sistema |
| `author`, `reviewer` | editar e revisar cursos no estúdio; ver números agrupados de aulas (quando existirem, com grupo mínimo de 10) | ver conta, percurso, respostas ou notas de um aluno identificado |
| Operação (servidor, banco, backups) | manter o sistema; copiar logs e backups dentro da hospedagem | abrir tabelas de alunos sem chamado; levar cópias para máquina pessoal |
| Encarregado | tudo o que o procedimento de direitos e o plano de incidentes exigem | - |

Fato do código: os papéis estão em `workspace_memberships`. O `admin` tem acesso ao banco todo. Não existe hoje um perfil "suporte" que veja só o necessário; enquanto não existir, a regra é por conduta, e cada consulta a dado de aluno pelo banco é registrada (seção 4).

## 3. Texto livre dos alunos

As respostas digitadas em "Na prática" e as notas da missão podem conter relatos pessoais. Regras:

- Ninguém lê nota ou resposta de aluno identificado sem um destes motivos: pedido do próprio aluno; problema técnico naquela resposta; suspeita de uso indevido da conta; ordem de autoridade encaminhada pela direção.
- Não existe revisão, correção ou "leitura pedagógica" das notas. Se um dia houver, a política de privacidade precisa dizer antes.
- Se, ao atender um motivo acima, alguém encontrar relato de violência ou risco a uma pessoa, avisa o encarregado no mesmo dia. O encarregado decide, com a direção e o advogado, o que fazer; a equipe não entra em contato com o aluno por conta própria sobre o conteúdo da nota.

## 4. Registro de consultas

Toda consulta ao banco que toque tabela de aluno (`user`, `session`, `enrollments`, `lesson_attempts`, `learner_events`, `objective_evidence`, `mission_responses`, `mission_response_events`, `trail_check_attempts`, `trail_badges`, e `access_logs` quando existir) fora das telas do produto é registrada: data, quem, motivo, o que foi consultado. Arquivo na pasta do encarregado `[A CONFIRMAR: local]`. Registro de acesso do Marco Civil: só por ordem judicial, registrado com o número do processo (Decreto 8.771/2016, art. 13, III: inventário de acessos).

## 5. Onde dado de aluno não pode estar

- Planilhas, documentos ou apresentações fora do sistema (nem "só a lista de e-mails").
- WhatsApp, Slack, Discord, e-mail pessoal, prints de tela.
- Ferramentas de IA (ChatGPT, Claude, Gemini, assistentes do estúdio ou de código). O estúdio usa IA só para conteúdo de curso; nenhuma tabela de aluno vai a IA, e isso deve continuar.
- Máquinas pessoais sem criptografia de disco; pendrives.
- Ambientes de teste: usar contas de teste, nunca cópia do banco de produção `[A CONFIRMAR: regra para homologação]`.

Exceções: a exportação para atender pedido de direitos vai só para o e-mail da conta do aluno e não fica guardada na máquina de quem enviou. Relatórios de números agrupados (mínimo de 10 alunos por número, sem nomes) podem circular internamente.

## 6. Contas e senhas da equipe

- Conta individual, nunca compartilhada. Ao sair da equipe, a conta é removida no mesmo dia.
- Senha própria, forte, não reutilizada. Segredos do sistema ficam fora do código e fora de chats.
- Lista de quem tem `admin` revisada a cada 3 meses pelo encarregado `[A CONFIRMAR]`.
- Senha inicial de aluno: gerada pela equipe, enviada por `[A CONFIRMAR: canal]`, com orientação de troca no primeiro acesso; a equipe não guarda a senha depois de enviar.

## 7. Se algo der errado

Viu dado de aluno onde não devia, mandou e-mail para a pessoa errada, perdeu um aparelho com acesso: avise o encarregado no mesmo dia. Isso não é motivo de punição; esconder é. O que fazer depois está no `plano-de-incidentes.md`.

## 8. Descumprimento

Quebra desta política pode levar a perda do acesso, medidas trabalhistas ou contratuais e, se for o caso, comunicação à ANPD e aos afetados.
