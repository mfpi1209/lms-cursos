---
tags: [produção, kits, instrutores]
atualizado: 2026-11-13
fonte:
  - docs/biblioteca-de-modelos.md
  - docs/novos-cursos/instrutores-gerados.md
  - apps/worker/src/scripts/regerar-cameras-instrutor.ts
---

# Kits, estúdios e instrutores

## O que é um kit

Um **kit** junta estúdio, instrutor, voz, marca, direção, regras e alunos de teste. Aplicar um kit só copia dados. Nada é gerado nem cobrado. Fica na biblioteca de modelos (`/estudio/modelos`, tabela `library_templates`).

Tipos da biblioteca: `kit`, `studio`, `presenter`, `voice`, `branding`, `direction`, `knowledge`, `learner`.

Kit cujo instrutor não tem câmeras prontas no estúdio é recusado. Gerar câmeras é pago e fica à parte.

## Instrutores do piloto

| Curso | Tema | Instrutor | Kit |
|---|---|---|---|
| C1 | IA na prática | Thiago | `estudio8-thiago` |
| C2 | LinkedIn e currículo | Marina | `estudio7-marina` |
| C3 | Produtividade e foco | Júlia | `estudio6-julia` |
| C4 | Dinheiro no controle | Flávia | `estudio6-flavia` |
| C5 | Segurança digital | Laís | `estudio8-lais` |

Ver [[2026-11-13 Instrutores por tema]] e [[Cursos C1 a C5]].

## Câmeras do Thiago

As imagens-base foram refeitas com os pulsos nus visíveis. As câmeras são `cam_thiago8v2_*` e `cam_thiago8v3_esq`. Motivo: [[2026-11-13 Avatar com mãos paradas]].

## Refazer as câmeras de um instrutor

Script: `apps/worker/src/scripts/regerar-cameras-instrutor.ts`. Três modos:

- `--seco` (padrão): mostra o que seria pedido. Não chama provedor.
- `--confirmar`: PAGO, cerca de US$ 1 por imagem no HeyGen. Exige `ALLOW_PAID_PROVIDERS=1`, a chave do HeyGen e `--max-usd`. Retomável pelo JSON de saída, sem pagar de novo.
- `--aplicar`: sem custo. Põe as câmeras novas no rascunho e troca na direção.

## Comandos úteis

- Montar a biblioteca: `packages/db/src/scripts/biblioteca-modelos.ts [--dry-run]`.
- Importar com kit: ver [[Importador (CLI e flags)]].

> [!warning] A confirmar
> O estado atual dos kits `estudio8-thiago`, `estudio6-julia`, `estudio6-flavia` e `estudio8-lais` na biblioteca não está em docs do repo. Os nomes vêm da sessão de 2026-11-13. Os kits `estudio7-marina`, `estudio7-rafael` e `recepcao-marina` estão em `docs/biblioteca-de-modelos.md`.

Ver também [[Direção e câmeras]].
