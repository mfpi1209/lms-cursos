---
tags: [arquitetura, worker, mídia]
atualizado: 2026-11-13
fonte:
  - docs/architecture.md
  - docs/gasto-seguro-e-orcamento.md
  - docs/planos/piloto-resumo.md
  - deploy/easypanel.md
---

# Worker e fila

O worker (`apps/worker`) consome o **outbox** do Postgres por polling. Redis existe no ambiente, mas o fluxo principal não depende dele.

## Eventos do outbox

- `course.published`
- `agent_run.queued`
- `media_job.queued` e `media_job.reconcile`
- entregas de webhook de saída (tabela `webhook_deliveries`)

## Jobs de mídia

1. O estúdio (ou o CLI `gerar-curso`) cria jobs a partir de um orçamento aprovado. Ver [[Geração de mídia, orçamento e teto diário]].
2. O worker sintetiza a voz (ElevenLabs), pede o vídeo (HeyGen) com `Idempotency-Key` e espera o fim por webhook ou polling.
3. Baixa o vídeo, guarda como asset (com sha256) e anexa ao rascunho como nova revisão de origem `media`.

Estados do job: `queued`, `running`, `succeeded`, `failed`, `canceled`, `reconciliation_required`.

## Regras de segurança do worker

- Até 3 tentativas com espera. Erro 4xx do provedor não é repetido.
- Timeout depois do envio nunca cria um segundo pedido: o reenvio usa a mesma chave de idempotência.
- Sem transação aberta durante chamada externa.
- Pré-checagem: avatar `sim_*`, voz `sim_*` ou voz nula falham o job sem chamar o provedor.
- Job real sem conclusão em 2 h vai para `reconciliation_required`; a colheita dura até 24 h.
- Worker em simulação nunca executa job real. Web e worker precisam concordar com `ALLOW_PAID_PROVIDERS`.

## Cena de tela

A cena de gravação ou tela simulada pede só a voz (custo de avatar 0). A montagem fica em `packages/media/src/compose/screen.ts` e `apps/worker/src/screen-scene.ts`. Ver [[Telas simuladas]].

## Webhooks de saída

O worker também envia os webhooks (8 tentativas). Ver [[API de integração v1 e webhooks]].

> [!warning] A confirmar
> O comando exato que o worker roda em produção está no `Dockerfile.worker`. Conferir em [[Implantação]].
