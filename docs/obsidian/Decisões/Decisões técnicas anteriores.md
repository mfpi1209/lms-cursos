---
tags: [decisão, arquitetura]
atualizado: 2026-11-13
fonte:
  - docs/decisions.md
---

# Decisões técnicas anteriores

Resumo das 14 decisões de `docs/decisions.md`. Todas são reversíveis, exceto as marcadas com traço.

| # | Decisão | Por quê |
|---|---|---|
| 1 | Módulos e aulas ficam no JSONB do rascunho (`course_drafts.document`). | Uma revisão e um conflito para o documento todo. |
| 2 | O worker lê o outbox por polling no Postgres. Redis só quando houver necessidade. | Evita dependência obrigatória. |
| 3 | Um workspace no seed; `workspaceId` em toda consulta. | Isolamento sem multiempresa. |
| 4 | A prévia roda o motor sem gravar. | Mesmo motor e player, sem tabelas extras. |
| 5 | Progresso = concluídos obrigatórios / (concluídos + obrigatórios ainda alcançáveis). | Ramos exclusivos não inflam o total. |
| 6 | "Demonstrado" só com avaliação determinística aprovada. | Separa conclusão de domínio. |
| 7 | Ciclos irrestritos bloqueiam a publicação. | Evita loops sem saída. |
| 8 | O seed usa o `hashPassword` do Better Auth. | Roda sem subir o app. |
| 9 | Sem `proxy.ts`; autorização nos layouts e rotas. | Regras perto dos dados. |
| 10 | Texto é Tiptap JSON restrito, sem HTML. | Sanitização por construção. |
| 11 | A direção por planos é montada por nós (ffmpeg) sobre clipes curtos do HeyGen. | A API não tem ângulo, zoom ou transição. |
| 12 | A narração é sintetizada uma vez, com timestamps, e cortada por plano. | Prosódia contínua e um custo de voz. |
| 13 | Apresentador andando só como cena em movimento, com narração por cima. | Vídeo com leitura labial não anda. |
| 14 | Posição por câmera (`placement`): `inherit`, centro, direita, esquerda, `full_frame`. | Visual sentado precisa de tela cheia. |

> [!note]
> As decisões 11 e 13 convivem com [[2026-11-13 Um lado por cena]]: a montagem continua nossa, mas a cena agora é uma tomada contínua.

Ver [[Visão geral]] e [[Índice de decisões]].
