---
tags: [produção, roteiro, sintaxe]
atualizado: 2026-11-13
fonte:
  - packages/course-schema/src/import/markdown-course.ts
  - docs/roteiros/c1-ia-na-pratica.md
  - docs/roteiros/exemplos/
---

# Sintaxe do roteiro Markdown

O importador lê um roteiro em Markdown sem IA e gera um `CourseDocument`. O cabeçalho do arquivo `packages/course-schema/src/import/markdown-course.ts` é a referência completa.

## Cabeçalho do curso

```
# Título
Ideia: ...
Público: ...
Objetivo final: ...
Duração-alvo: 21 aulas de 23 a 23 minutos (cerca de 8h no total).
Formato: EaD | micro
Certificado: sim | não
Carga horária: 8 h
```

- `Formato: EaD` aceita aulas de até 30 min e 40 cenas, falas de 40 a 300 palavras. `micro` (padrão) limita a 6 min e 9 cenas.
- `Certificado: sim` sem carga horária gera o aviso `CERTIFICATE_NO_WORKLOAD`. Nenhum certificado é emitido ainda.

## Estrutura

- `## Módulo N — título` com `Descrição:`.
- `### Aula N — título` com `Objetivo:`.
- Cenas: `### CÓDIGO — título`. Os códigos são únicos no curso inteiro.
- Uma seção `## Notas...` (ou qualquer `##` que não seja módulo) encerra o roteiro.

## Tipos de cena

| Código | Tipo | Campos |
|---|---|---|
| `V..` | Vídeo | `**Fala para gravação**` com a fala entre aspas, `Texto na tela:`, `Cartão:` opcional, `Vídeo próprio:` opcional |
| `Q..` | Decisão | `Situação:`, `Chamada:`, tabela `Escolha / Qualidade / Reação / Feedback / Destino` |
| `M..` | Composição guiada | `Montar frase:` com `{lacunas}` |
| `AV..` | Avaliação | `Tentativas:`, `Aprovação: X de Y`, perguntas com `(correta)`, `Explicação:` |
| `A..` | Anotação | `Pergunta:`, `Pular: sim`, `Destino:` |
| `T..` | Tarefa com entrega | `Entrega:`, `Arquivos:`, `Instrução:`, `Critérios:`, `Correção:`, `Obrigatória:` |
| `FIM` | Encerramento | tópicos, `Meu roteiro:`, `Checklist:` |

## Vídeo de tela

A linha `Vídeo próprio: arquivo.mp4` marca uma cena de tela cheia com a narração da instrutora, sem avatar. No piloto, a maior parte dessas telas é simulada. Ver [[Telas simuladas]].

Avisos do importador: `SCREEN_MEDIA_MISSING`, `SCREEN_LIST_MISMATCH`, `SCREEN_RECORDING_WRONG_SCENE`.

## Qualidade

- A narração tem limites de palavras por perfil de formato.
- Reação curta com menos de 8 palavras gera `REACTION_LENGTH`.
- Cena de avaliação precisa de objetivo (`NO_OBJECTIVE`).

> [!warning] Pendente
> O conversor da outra sessão ainda não gera as linhas `Vídeo próprio:`, tem 23 reações curtas e um `NO_OBJECTIVE` na A01. Ver [[Pendências]].

Próximo passo: [[Importador (CLI e flags)]].
