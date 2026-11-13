---
tags: [arquitetura, testes, qa]
atualizado: 2026-11-13
fonte:
  - tools/robo-aluno/README.md
  - docs/planos/piloto-resumo.md
  - package.json
---

# Testes e robô aluno

## Testes automáticos

- `pnpm test` roda todos os pacotes. `pnpm test:e2e` roda o Playwright do web.
- Contagem na última rodada do piloto (`docs/planos/piloto-resumo.md`): course-schema 340, course-engine 81, email 13, media 235, db 361, worker 80, web 353, ai 183. Todos passavam. A contagem muda a cada commit.
- Rode as suítes de banco uma de cada vez. A do `db` apaga e recria o banco de teste.
- Os roteiros de referência têm snapshot (`curso-comece-bem`, `curso-primeira-vaga`). Os roteiros de cliente só precisam importar com 0 erros (`packages/course-schema/test/roteiros-compat.test.ts`).
- Teste intermitente conhecido: `reports.test.ts`, "paginação e filtro desde".

## Robô aluno

`tools/robo-aluno` faz cada aula publicada como um aluno faria, num navegador Playwright. Vídeos tocam a 2x. Responde a opção N nas perguntas, salva e chega ao fim. Depois cruza o que viu e classifica problemas em bloqueante, importante e menor.

```bash
node tools/robo-aluno/rodar.mjs --rodada base --paralelo 4
node tools/robo-aluno/analisar.mjs --rodada base --publicar
```

- Filtros: `--cursos`, `--aulas`, `--caminhos`. `--alvo` escolhe o conjunto.
- A conta de teste do robô usa a senha do seed, lida do arquivo e nunca impressa. Não copie essa senha para lugar nenhum.
- Relatórios saem em `docs/qa/lancamento/robo/`.
- Rodada `piloto-regressao` (26 cursos, caminhos 1 e 4): 190 de 190 execuções chegaram ao fim; 0 bloqueantes, 0 importantes e 5 menores.

> [!warning] A confirmar
> O robô cobre os cursos publicados. Os cursos C1 a C5 do piloto estão em rascunho ou em produção local e ainda não passaram pelo robô. Ver [[Cursos C1 a C5]].
