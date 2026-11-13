---
tags: [mapa, início]
atualizado: 2026-11-13
fonte:
  - docs/architecture.md
  - docs/decisions.md
  - docs/planos/piloto-resumo.md
---

# Plataforma de cursos da DNA Work

Este cofre explica a plataforma de cursos da DNA Work para o time. Ele cobre a parte técnica, a produção dos cursos, as decisões e o piloto.

A plataforma, os cursos, a marca, os dados e o certificado são da DNA Work. Veja [[2026-11-13 Plataforma, cursos e marca são da DNA]].

## Comece por aqui

1. Entenda o desenho geral: [[Visão geral]].
2. Veja como um curso nasce: [[Fluxo de ponta a ponta]].
3. Consulte as palavras do time: [[Glossário]].
4. Veja onde o piloto está: [[Visão do piloto]] e [[Pendências]].
5. Antes de gerar qualquer mídia, leia [[Geração de mídia, orçamento e teto diário]].

## Arquitetura

- [[Visão geral]]
- [[Monorepo e pacotes]]
- [[Banco e migrações]]
- [[Worker e fila]]
- [[Portal do aluno e Estúdio]]
- [[API de integração v1 e webhooks]]
- [[Segurança, acesso e login]]
- [[Implantação]]
- [[Testes e robô aluno]]

## Produção de cursos

- [[Fluxo de ponta a ponta]]
- [[Sintaxe do roteiro Markdown]]
- [[Importador (CLI e flags)]]
- [[Kits, estúdios e instrutores]]
- [[Telas simuladas]]
- [[Tópicos do painel]]
- [[Direção e câmeras]]
- [[Geração de mídia, orçamento e teto diário]]
- [[Conferência de qualidade]]
- [[Prévias e montagem do módulo]]

## Decisões

- [[Índice de decisões]]

## Piloto Cruzeiro

- [[Visão do piloto]]
- [[Cursos C1 a C5]]
- [[Custos até agora]]
- [[Pendências]]

## Apoio

- [[Glossário]]
- [[Modelo de decisão]] e [[Modelo de curso]] (pasta Modelos)

> [!warning] Regras do cofre
> Este cofre não guarda segredos, senhas, tokens, chaves, e-mails reais nem dados de alunos. Cite só o NOME das variáveis de ambiente.

> [!info] Como manter
> Cada nota tem `fonte:` no cabeçalho. Se o código mudar, atualize a nota e a data em `atualizado`.
