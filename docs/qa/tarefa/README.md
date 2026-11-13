# QA: tarefa com entrega (item 1.4 do plano Cruzeiro EaD)

Conferência de 12/11/2026, em navegador de verdade (Playwright), contra o servidor de desenvolvimento do worktree na porta 3023 e um **banco-cópia** (`lms_cursos_wt_tarefa`, com a migração `0020_entregas`). Nada foi rodado no banco de desenvolvimento nem em produção.

## Como repetir

```
# 1. banco-cópia e migração
createdb lms_cursos_wt_tarefa
pg_dump -Fc "$DATABASE_URL" | pg_restore -d lms_cursos_wt_tarefa --no-owner
DATABASE_URL=postgres://localhost:5432/lms_cursos_wt_tarefa pnpm --filter @lms/db migrate

# 2. roteiro de exemplo como rascunho (o script imprime o id do curso)
DATABASE_URL=postgres://localhost:5432/lms_cursos_wt_tarefa ./apps/worker/node_modules/.bin/tsx \
  packages/db/src/scripts/import-markdown-course.ts --file docs/roteiros/exemplos/exemplo-cruzeiro-tarefa.md --no-direction

# 3. servidor na porta 3023 apontando para a cópia (storage próprio, sem provedores pagos), e o fluxo
node docs/qa/tarefa/fluxo.mjs --base http://localhost:3023 --curso <crs_…>
```

O fluxo usa as contas `autor@`, `admin@`, `revisor@` e `aluna@demo.local` da cópia e uma conta descartável `tarefa-teste-outra@demo.local`, criada só na cópia para provar que outro aluno não lê o arquivo.

## Resultado

28 de 28 passos passaram (`fluxo-resultado.json`):

| Etapa | O que foi conferido | Captura |
| --- | --- | --- |
| Estúdio | O autor publica o roteiro de exemplo, com as duas tarefas | `01-estudio-publicar.png` |
| Estúdio | O admin matricula a aluna | `02-estudio-matricula.png` |
| Aluna, celular (390 px) | Painel da tarefa: instrução, "O que o avaliador confere" com 3 critérios, link, arquivo opcional; sem rolagem horizontal | `03-aluna-tarefa-celular.png` |
| Aluna | Link sem `https` recusado na tela; arquivo que não é PDF, com nome `.pdf`, recusado pelo servidor | `04-aluna-arquivo-recusado-celular.png` |
| Aluna | Envio com link e PDF: "Entrega enviada. Em correção." e a aula conclui | `05-…`, `06-…` |
| Aluna | "Suas entregas" na página do curso | `07-aluna-suas-entregas-celular.png` |
| Acesso | A aluna baixa o próprio PDF; outro aluno recebe 404 no arquivo e nas entregas; sem login, 401; aluno não abre a fila do estúdio | sem captura |
| Estúdio | Fila do workspace e fila do curso | `08-…`, `09-…` |
| Estúdio | Tela de correção: link com `rel="noopener noreferrer"` em outra aba, arquivo, critérios; sem marcar tudo não aprova nem devolve; com um "não", só devolve | `10-estudio-correcao-devolver.png` |
| Estúdio | Devolvida com comentário | `11-estudio-entrega-devolvida.png` |
| Aluna | Vê o comentário e reenvia pela página do curso (link e PDF novos) | `12-…`, `13-…` |
| Estúdio | Aprovação; histórico com enviada, devolvida, reenviada e aprovada | `14-…`, `15-…`, `16-…` |
| Aluna | "Entrega aprovada" na página do curso | `17-aluna-entrega-aprovada-celular.png` |
| Aluna, computador, tema escuro | Aula refeita: a tarefa aparece aprovada, com "Continuar" (não envia de novo) | `18-aluna-tarefa-aprovada-na-aula-desktop.png` |

As capturas (`*.png`, `robo/*.jpg`) ficam só no disco: o `.gitignore` do repositório não versiona imagens de `docs/qa`.

## Robô aluno

`tools/robo-aluno/aula-avulsa.mjs`, nas duas aulas do exemplo (bruto em `robo/`):

| Aula | Caminho | Resultado |
| --- | --- | --- |
| `aula_02` (T02, só link, correção automática) | 2 | recusou o link sem `https`, enviou, recebeu "aprovada" e concluiu a aula |
| `aula_01` (T01, link e arquivo, avaliador), entrega devolvida | 1 | reenviou com link e PDF, recebeu "em correção" e concluiu |
| `aula_01`, entrega já em correção | 3 | tocou "Continuar" (sem novo envio) e concluiu |

Os 2 erros de rede registrados na `aula_02` são de uma imagem do apresentador que existe no banco copiado, mas não no storage vazio usado no teste; não vêm da tarefa.

## O que não foi conferido aqui

- Leitor de tela de verdade (VoiceOver ou NVDA) e navegação só por teclado, de ponta a ponta. Os rótulos, as mensagens de erro (`role="alert"`) e as regiões de situação (`role="status"`) existem, mas não houve teste com tecnologia assistiva.
- Tela cheia do player com a tarefa aberta. O painel usa a mesma área e os mesmos componentes dos outros painéis; abrir o seletor de arquivo pode tirar o navegador da tela cheia, o que é comportamento do navegador.
- Arquivo de 10 MB pela rede e em conexão lenta (o limite e a recusa de 11 MB estão nos testes automatizados).
- Safari no iPhone e Chrome no Android em aparelho físico.
