---
tags: [produção, custo, mídia]
atualizado: 2026-11-13
fonte:
  - docs/gasto-seguro-e-orcamento.md
  - docs/planos/orcamento-leva1.md
  - apps/web/src/scripts/gerar-curso.ts
  - apps/web/src/scripts/refazer-tomadas.ts
  - .env.example
---

# Geração de mídia, orçamento e teto diário

## Trava de provedores pagos

- `ALLOW_PAID_PROVIDERS=1` é obrigatório para qualquer chamada paga. Sem ele, a IA cai para `fake` e a mídia fica em simulação.
- Web e worker precisam concordar. Se divergirem, a execução falha sem chamar API.
- `NODE_ENV=production` não libera sozinho.

## Orçamento antes de pagar

`gerar-curso.ts` (em `apps/web/src/scripts/`) usa as mesmas regras da rota de orçamento do estúdio.

```bash
set -a; . ../../.env; set +a
tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55            # a seco (padrão)
ALLOW_PAID_PROVIDERS=1 tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 55 --confirmar
tsx src/scripts/gerar-curso.ts --course crs_xxx --max-usd 10 --cenas v01,v02,q01~a
```

- `--cenas` limita a certas cenas (ids de nó), mesmo com vídeo atualizado.
- `--confirmar` cria o orçamento e o lote. O script **só enfileira**. Quem chama os provedores é o worker, com o mesmo `.env` e `ALLOW_PAID_PROVIDERS=1`.
- Recusa sem gravar nada se: simulação ativa, total maior que `--max-usd`, erro de cena, teto diário estourado ou jobs abertos do curso.
- O aprovador registrado é o criador do curso. A origem fica como `cli`.

## Teto diário

- `MEDIA_DAILY_BUDGET_USD` e `AI_DAILY_BUDGET_USD` (padrões 50 e 20). O workspace pode ter limite próprio em `workspaces.spend_limits`.
- A janela é deslizante de 24 h. Conta o custo real dos concluídos e o estimado dos abertos.
- Passou do teto: HTTP 402 `BUDGET_EXCEEDED`.
- Teto de mídia do workspace do piloto: **US$ 200** por dia. Ver [[2026-11-13 Teto diário e geração em lotes]].

## Custo por minuto

Preços padrão (`packages/media/src/pricing.ts`, estimativas de 2026-10; a fatura do provedor é a referência):

- ElevenLabs: US$ 0,30 por 1.000 caracteres.
- HeyGen: US$ 1/60 por segundo, ou seja, US$ 1,00 por minuto de avatar.
- Cena em movimento: US$ 0,12 por segundo.
- Na prática o avatar sai a cerca de US$ 1,25 por minuto com a voz.
- Duração estimada: palavras divididas por 150 por minuto.
- Tela simulada: só voz.

Valores do piloto em [[Custos até agora]].

## Refazer só uma tomada

`refazer-tomadas.ts` incrementa a variação `direction.retake[...]` no rascunho e enfileira só as cenas afetadas. O worker reaproveita as tomadas iguais (custo 0) e cobra só os segundos da tomada marcada. Ver [[Conferência de qualidade]].

## Reaproveitamento

O hash da cena (roteiro, avatar, voz, parâmetros e versão do adapter) evita pagar duas vezes. Editar o texto marca a mídia como desatualizada (`stale`); nada regenera sozinho.

> [!danger] Regra de ouro
> Primeiro a seco. Só use `--confirmar` com o total conferido e a aprovação do dono.

Veja [[Worker e fila]] para o que acontece depois de enfileirar.
