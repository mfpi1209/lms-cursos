# Fase 1 (Cruzeiro EaD): resumo

Branch `feat/cruzeiro-f1-lancamento`. Plano de origem: `plano-cruzeiro-ead.md`. Tudo isto está só no código e no banco local de desenvolvimento: nada foi para o ar, nenhuma migração rodou em produção e nenhum provedor pago foi chamado.

## O que mudou

- **Formato por curso.** `Formato: EaD` troca os limites de extensão (aulas de até 30 min e 40 cenas, falas de 40 a 300 palavras). Sem a linha, vale o perfil "micro" de sempre; os cursos publicados geram os mesmos avisos de antes.
- **Duração-alvo em horas** (`6 h`, `6h30`, `360 min`), além do texto livre.
- **Certificado e carga horária no documento do curso** (`Certificado: sim`, `Carga horária: 8 h`). Só guardam o dado: **nada é emitido ainda**.
- **Tarefa com entrega** (bloco `T..`):
  - o aluno envia um link `https` e, se o curso pedir, um PDF, PNG ou JPEG de até 10 MB, conferido pelos primeiros bytes;
  - a aula segue depois do envio; a entrega fica "em correção";
  - o avaliador marca os critérios e aprova ou devolve com comentário; o aluno vê o comentário e reenvia;
  - correção automática aprova ao enviar; `Obrigatória: não` tira a tarefa da regra do certificado;
  - painel no player, "Suas entregas" na página do curso, fila "Entregas" no estúdio, seletor de arquivo em português.
- **Acesso dos alunos.**
  - Link mágico de uso único. A página `/entrar/confirmar` só mostra o botão "Continuar": abrir o link (leitores de e-mail e de WhatsApp) não gasta o acesso.
  - E-mail (`packages/email`: log, SMTP ou Resend) e "Esqueci minha senha".
  - RGM (único por workspace) e telefone na matrícula.
  - Importação de alunos por CSV no estúdio, com prévia e aplicação (idempotente pelo e-mail).
  - Tokens de integração com escopos `students:write`, `progress:read` e `webhooks:manage` (só o hash é guardado).
- **Progresso para fora.**
  - Uma consulta só, `progressRows`: aluno e curso, acessos, aulas, nota de cada avaliação, tarefa, conclusão.
  - Exportação em CSV no estúdio (só administração, com auditoria) e `GET /api/integracao/v1/progresso`, paginado.
  - Webhooks assinados (HMAC-SHA256 com carimbo de tempo): `enrollment.created`, `lesson.completed`, `course.completed`, `task.submitted` e `task.reviewed`; até 8 tentativas, tempo limite de 10 s, destinos em rede privada recusados, tela de entregas com "reenviar".
- **Migrações (só acrescentam):** `0020_entregas`, `0021_alunos_academico_e_tokens`, `0022_webhooks`.
- **Documentação:** `docs/integracao/api-v1.md`, `docs/roteiros/exemplos/exemplo-cruzeiro.md` (e `exemplo-cruzeiro-tarefa.md`, com as variações da tarefa), linhas 17 a 21 de `docs/legal/registro-de-operacoes.md`, seção 12 de `docs/legal/pendencias.md`.
- **Robô aluno:** caminho que envia a tarefa; a regressão dos 26 cursos publicados rodou limpa (ver abaixo).

## Testes rodados

Rodados em 12/11/2026 no banco local (testes de integração no banco de testes separado):

| Suíte | Arquivos | Testes |
|---|---|---|
| `packages/course-schema` | 27 | 322 |
| `packages/course-engine` | 7 | 81 |
| `packages/db` (com `TEST_DATABASE_URL`) | 24 | 348 |
| `packages/email` | 1 | 13 |
| `packages/media` | 17 | 226 |
| `apps/worker` | 9 | 78 |
| `apps/web` | 38 | 303 |
| **Total** | **123** | **1.371** |

- **Typecheck:** web, worker, course-schema, course-engine, email, media e ai sem erro. `packages/db` tem 9 erros em três roteiros avulsos (`src/scripts/oneoff/expansao-final.ts`, `piloto-c01.ts`, `qa-missao-falada.ts`), arquivos que a fase 1 não tocou.
- **Compatibilidade:** `tools/compat/compilar-publicados.mts` com 0 erros. Linha de base: 43 cursos e 620 avisos; agora 45 cursos e 632 avisos, os 12 a mais são dos dois cursos de exemplo publicados na QA (6 de cada, avisos de mídia e de publicação; os cursos já estão arquivados). `roteiros-compat`: 3 de 3.
- **Robô aluno** (`f1-regressao`, 26 cursos publicados, 95 aulas, caminhos 1 e 4, 190 execuções, todas chegaram ao fim): **0 bloqueantes, 0 importantes, 5 menores** (travamento entre falas), idêntico à rodada limpa `final-0111`: nenhum achado novo.
- **Ponta a ponta no app real** (porta 3010, modo demo, e-mail em log, webhook para um receptor local): token e webhook criados, CSV de alunos (3 linhas, 1 com erro; reaplicar não cria nada), link mágico (GET não consome, "Continuar" entra, reuso recusado), aulas com avaliação "Aprovação 2 de 3" e tarefa com link e PDF (claro e escuro, 1440 e 390 px, teclado), correção (devolver, reenviar, aprovar), CSV e API de progresso, e os cinco eventos de webhook com assinatura válida. Capturas em `docs/qa/f1/` (PNG fora do git).

## Sintaxe final do roteiro

Linhas novas do cabeçalho (todas opcionais; ausentes = comportamento de sempre):

| Linha | Efeito |
|---|---|
| `Formato: EaD` ou `micro` | escolhe os limites de extensão |
| `Duração-alvo: 6 h` | meta do curso em horas (`6h30`, `360 min`); texto livre continua valendo |
| `Certificado: sim` ou `não` | guarda `certificate.enabled` (nada é emitido ainda) |
| `Carga horária: 6 h` | guarda `certificate.workloadMinutes`; sem ela, avisa e vale a soma das aulas |

Bloco da tarefa, com todas as linhas:

```
### T01 — Missão final: seu registro de atendimento
Entrega: link e arquivo
Arquivos: PDF · imagem
Instrução: Escreva um registro de atendimento (data, pedido e próximo passo) e envie o link.
Critérios: Tem a data · Descreve o pedido do cliente · Diz o próximo passo
Correção: avaliador
Obrigatória: sim
Destino: FIM
```

- `Entrega:` `link` (padrão) ou `link e arquivo`. `Arquivos:` `PDF · imagem` (padrão: os dois). `Critérios:` de 1 a 10 itens de sim ou não, separados por `·`.
- `Correção:` `avaliador` (padrão) ou `automática`. `Obrigatória:` `sim` (padrão) ou `não`.
- Exemplo completo: `docs/roteiros/exemplos/exemplo-cruzeiro.md`. A lista de todas as linhas está no comentário do cabeçalho de `packages/course-schema/src/import/markdown-course.ts`.

## O que ficou de fora

- **Emissão do certificado** (tabela `course_certificates`, regra de emissão, página pública e folha de impressão): adiada. O evento `certificate.issued` existe, mas nada o produz.
- **CPF** (cifrado ou mascarado): não é coletado. Só o RGM.
- **Antivírus** nos arquivos enviados: confere só o tipo pelos primeiros bytes.
- **Rotina de retenção** dos arquivos das entregas e botão para apagar uma entrega sem apagar a conta.
- **Configurações › Certificado** no estúdio (emissor, logotipo, assinatura).
- **Envio real de e-mail** (link de acesso e recuperação de senha): a tela de login já pede o link, mas depende de contratar o serviço; o transporte padrão (`EMAIL_TRANSPORT=log`) só registra em log e não entrega nada.
- Fase 2 (conversa com segundo personagem, vídeo próprio, marca por workspace, engajamento) e fase 3 (posição assistida, relatório no estúdio).
- Turmas e grupos, SCORM ou xAPI, pagamento, app nativo.

## Decisões pendentes

1. **Campos do certificado** que a Cruzeiro aceita para hora complementar (RGM, CPF, quem assina, CNPJ, conteúdo programático por módulo).
2. **CPF:** guardar cifrado, guardar só os últimos dígitos ou não guardar.
3. **Serviço de e-mail:** SMTP próprio ou Resend; sem ele o link mágico sai só pela API (WhatsApp).
4. **Validade do link mágico** enviado por WhatsApp (hoje 72 h e uso único).
5. **Correção das tarefas:** manual, automática ou por curso, e quem corrige.
6. **Grupo de controle:** fora da plataforma ou com turmas já na fase 1.
7. **Retenção** dos arquivos e das entregas, bases legais e textos públicos de privacidade e termos (`docs/legal/pendencias.md`, seção 12).
8. **Chave `WEBHOOK_SECRET_KEY`** no web e no worker em produção (sem ela, o cadastro de webhooks é recusado).
9. **Destino dos webhooks e da API de progresso:** nome, país e contrato de operador do sistema que recebe os dados (a DNA).
