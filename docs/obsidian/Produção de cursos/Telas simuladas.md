---
tags: [produção, telas]
atualizado: 2026-11-13
fonte:
  - packages/course-schema/src/screen-mock.ts
  - packages/course-schema/src/import/markdown-course.ts
  - apps/worker/src/scripts/gerar-telas-previa.ts
  - docs/roteiros/telas/
  - docs/planos/piloto-resumo.md
---

# Telas simuladas

Demonstrações de tela que a **plataforma desenha**. Não há gravação humana e não há provedor pago. O MP4 gerado entra no lugar de uma gravação de tela.

## Cena de tela

Narração com a voz do instrutor, legenda e a tela em tela cheia. **Sem avatar.** Custo de avatar zero, só voz. Ver [[2026-11-13 Telas simuladas no lugar da gravação]].

## Arquivo `.telas.md`

Fica em `docs/roteiros/telas/<roteiro>.telas.md`. Uma seção por arquivo de gravação:

```
## gravacao_pedido_vago
Modelo: chat
Aparelho: celular
App: Assistente de IA
- digita: me explica marketing
- ia: Marketing é o conjunto de ações que...
- destaca: resposta genérica, sem contexto
```

## Os 7 modelos

`chat`, `browser`, `form`, `settings`, `calendar`, `sheet`, `notes`. Aparelho: `phone` ou `desktop`.

## Passos

| Passo | O que mostra |
|---|---|
| `digita:` | texto sendo digitado |
| `usuário:`, `ia:`, `outro:` | balão de conversa |
| `mostra:` | bloco ou cartão |
| `liga:`, `desliga:` | interruptor |
| `toca:` | toque em botão ou item |
| `célula:` | célula de planilha (`B2 = valor`) |
| `evento:` | evento de agenda |
| `destaca:` | realce de um trecho |

## Ritmo da fala

Cada passo começa quando a narração chega nele (alinhamento por palavra). O sufixo `(na fala: "trecho")` força o início no trecho dito. Sem ele, a plataforma procura as palavras do próprio passo e a tela fica vazia até achar o primeiro. Sufixo `(peso 2)` dá mais tempo ao passo. Sem alinhamento, os passos se distribuem pelo peso.

## Regras de conteúdo

Telas genéricas, **sem logotipo nem identidade de marca real**. O nome do serviço só aparece como texto quando a aula ensina aquele serviço. Nada de dado pessoal real.

## Avisos do importador

`SCREEN_MOCK_PENDING`, `SCREEN_MOCK_MISSING`, `SCREEN_MOCK_UNUSED`, `SCREEN_MOCK_INVALID`.

## Duração e ajuste

A narração manda no tempo da cena. Gravação ou tela mais curta congela o último quadro (até 3 s). Acima disso, `fit = short`. Mais longa: acelera trechos parados até 1,5x, depois corta e marca `trimmed`. Ver [[2026-11-13 Narração manda no tempo da cena]].

## Prévia sem custo

`apps/worker/src/scripts/gerar-telas-previa.ts --todos --out <pasta>` renderiza todas as telas localmente. Sem banco, sem provedor. Gera MP4, PNG do último quadro e um `index.html`. Ver [[Prévias e montagem do módulo]].

Números da leva 1: 62 cenas com tela e 73 arquivos. Ver `docs/roteiros/telas/lista-leva1.md`.

Relacionado: [[Tópicos do painel]], [[Sintaxe do roteiro Markdown]].
