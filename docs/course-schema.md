# Contrato do curso (`@lms/course-schema`)

`schemaVersion: 1`. Todos os tipos são validados com Zod; a interface, o agente e o player usam o mesmo contrato.

## CourseDocument

```ts
{
  schemaVersion: 1,
  title, description,
  brief: { audience, context, prerequisites, finalSkill, sourcesNote },
  objectives: [{ id, title, criterion, required }],
  modules: [{ id, title, description, lessons: [Lesson] }],
  completion: { requiredLessonIds: string[] },   // vazio = todas as aulas
  templateRef?: { templateId, version }           // modelo de origem (fase A)
}
```

## Lesson

```ts
{ id, title, description, estimatedMinutes, family, objectiveIds, graph: LessonGraph }
```

`family` é orientação pedagógica (`decision_consequence`, `investigation`, `dialogue`, `procedure`, `production_review`, `resource_simulation`); não restringe os blocos usados. `estimatedMinutes` é editável e não é regra de aprovação.

## LessonGraph

```ts
{
  schemaVersion: 1,
  startNodeId,
  variables: [{ name, type: 'number'|'boolean'|'string', initial, label? }],
  nodes: Node[],
  edges: Edge[],
  layout: { positions: { [nodeId]: { x, y } } }   // só editor; nunca afeta execução
}
```

### Blocos executáveis (incremento 1)

| type | campos principais | resposta do aluno |
|---|---|---|
| `scenario` | `body`, `media?` | avançar |
| `content` | `body`, `media?` | avançar |
| `choice` | `prompt`, `options[{id,label,feedback?}]` | `choose{optionId}` |
| `consequence` | `body`, `tone`, `guidance?`, `effects?` | avançar |
| `reflection` | `prompt`, `minLength`, `maxLength`, `placeholder?` | `reflect{text}` (registrada, não avaliada) |
| `assessment` | `prompt`, `mode`, `options[{id,label,correct,feedback?}]`, `passing`, `maxAttempts`, `feedbackPassed?`, `feedbackFailed?` | `assess{optionIds}` (critério determinístico) |
| `end` | `summary`, `outcomeLabel?` | — |

Todos têm `id`, `title?`, `objectiveIds[]`, `required` (conta para o progresso quando está no caminho).

### Blocos com contrato preparado, **não executáveis**

`dialogue`, `task`, `evidence`, `resource_simulation`, `ai_feedback`. O compilador bloqueia a publicação de qualquer aula que os use (`NODE_TYPE_NOT_EXECUTABLE`) e o editor não os oferece.

### Edge — única fonte de verdade de destinos

```ts
{ id, from, to, optionId?, condition?, effects?, priority?, isDefault? }
```

- Saída de `choice`: uma aresta por opção (`optionId` obrigatório).
- Demais nós: uma aresta sem condição, **ou** N arestas condicionais (prioridade única) + exatamente um fallback (`isDefault`).
- `effects` da aresta e do `consequence` de destino são aplicados na transição.

### DSL de condições e efeitos

```
Condition = {op: eq|neq|gt|gte|lt|lte, var, value}
          | {op: in, var, values[]}
          | {op: and|or, conditions[]} | {op: not, condition}
          | {op: answered, nodeId, optionId?} | {op: passed, nodeId} | {op: always}
Effect    = {op: set, var, value} | {op: inc, var, by}
```

Variáveis precisam estar declaradas e tipadas; o compilador rejeita comparações de tipo errado. Nunca há `eval`.

### RichTextDocument

JSON compatível com Tiptap restrito a `doc > (paragraph | heading[2,3] | bulletList | orderedList) > listItem > paragraph > text` com marcas `bold`/`italic`. Qualquer outro nó é rejeitado na validação; o renderer só emite esses elementos.

## Compilador de publicação (`compileCourse` / `compileLesson`)

Erros (bloqueiam): IDs duplicados, nó inicial inexistente, aresta para nó inexistente, opção sem destino, saídas ambíguas ou sem fallback, empate de prioridade, condição/efeito com tipo errado ou variável não declarada, ciclo irrestrito, nó sem caminho até um encerramento, avaliação sem opção correta ou modo incoerente, bloco sem executor, objetivo inexistente, curso sem aulas/título.

Avisos (editoriais): nó inalcançável, opção sem feedback, bloco sem texto, nó interativo sem objetivo, objetivo obrigatório não trabalhado, mídia desatualizada, briefing incompleto.

Validação estrutural não é prova de qualidade pedagógica.

## Política de versão

- `schemaVersion` em `CourseDocument` e `LessonGraph`. Migrações são funções puras encadeadas em `migrate.ts` (`v1 -> v2 -> …`) aplicadas ao **ler** rascunhos e versões (`migrateCourseDocument`).
- Snapshots publicados nunca são reescritos no banco; a leitura migra em memória. Se uma migração não for possível sem perda, a versão fica legível apenas pela versão anterior do código até migração explícita.
- Estado da tentativa tem `stateVersion` próprio (`@lms/course-engine`).
- Mudanças incompatíveis exigem nova `schemaVersion` + migração + testes com o curso seed.
