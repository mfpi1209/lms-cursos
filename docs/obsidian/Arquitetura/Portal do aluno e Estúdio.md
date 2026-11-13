---
tags: [arquitetura, web, estúdio]
atualizado: 2026-11-13
fonte:
  - apps/web/src/app
  - docs/architecture.md
  - docs/planos/piloto-resumo.md
  - docs/biblioteca-de-modelos.md
  - docs/gasto-seguro-e-orcamento.md
---

# Portal do aluno e Estúdio

As duas faces ficam em `apps/web`, no mesmo app Next.js. Grupos de rotas: `(lms)` para o aluno, `(studio)` para a equipe.

## Portal do aluno

- O aluno entra por link de acesso ou senha. Ver [[Segurança, acesso e login]].
- O `LessonPlayer` executa o motor de aprendizagem. Cada ação vira uma intenção validada no servidor.
- Legendas nascem ligadas. A escolha do aluno fica no navegador.
- Reflexões e a "missão" ficam registradas e saem na API de progresso. Ver [[API de integração v1 e webhooks]].
- Tarefa com entrega: o aluno envia link ou arquivo e um avaliador corrige no estúdio.

## Estúdio

Telas que o time usa:

| Tela | Para quê |
|---|---|
| Cursos e wizard | Criar curso, revisar aulas, calcular orçamento e aprovar produção (`VideosBlock`). |
| `/estudio/modelos` | Biblioteca de kits, vozes, marcas e alunos de teste. Ver [[Kits, estúdios e instrutores]]. |
| `/estudio/cursos/[id]/gravacoes` | "Gravações de tela": envio em lote de MP4 ligado pelo nome do arquivo. Ver [[Telas simuladas]]. |
| Configurações › Integrações | Tokens de API e webhooks. Ver [[API de integração v1 e webhooks]]. |

Permissões: papéis por workspace, checados no servidor (`requireStaff`, `requireEditor`, `requireAdmin`).

## Prévia

A prévia usa o mesmo motor e o mesmo player, mas não grava nada (`/api/preview/step`). Ver também [[Prévias e montagem do módulo]].

> [!warning] A confirmar
> A lista completa de telas do estúdio não foi revisada rota por rota. A tabela acima cobre o que os docs citam.
