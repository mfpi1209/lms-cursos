---
tags: [decisão, produção, telas]
atualizado: 2026-11-13
fonte:
  - packages/course-schema/src/screen-mock.ts
  - docs/planos/plano-piloto-cruzeiro.md
  - docs/roteiros/telas/lista-leva1.md
---

# Telas simuladas no lugar da gravação

**Data:** 2026-11-13. **Status:** decidida.

## Contexto

A leva 1 tinha 62 cenas com gravação de tela e 73 arquivos MP4 para a equipe gravar. O plano antes era subir MP4 gravado por pessoas.

## Decisão

Sem gravação humana. As demonstrações são telas simuladas geradas pela plataforma.

- 7 modelos: chat, browser, form, settings, calendar, sheet, notes.
- Sem marcas reais.
- No ritmo da fala: os passos casam com palavras da narração. Sufixo `(na fala: "...")`.
- A cena de tela usa a narração com a voz do instrutor e legenda, sem avatar.

## Consequência

- Custo da cena de tela é só voz.
- Pode renderizar tudo localmente, sem custo. Ver [[Telas simuladas]].
- A tela "Gravações de tela" do estúdio continua existindo para MP4 próprio quando houver.
- O conversor da outra sessão ainda precisa gerar as linhas `Vídeo próprio:`. Ver [[Pendências]].
