---
tags: [arquitetura, segurança, login]
atualizado: 2026-11-13
fonte:
  - docs/architecture.md
  - deploy/easypanel.md
  - docs/integracao/api-v1.md
  - docs/legal/pendencias.md
  - docs/gasto-seguro-e-orcamento.md
---

# Segurança, acesso e login

## Login do aluno

- Autenticação com Better Auth (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`).
- O aluno cadastrado pela API nasce sem senha e entra pelo **link de acesso** (link mágico): uso único, vale por 72 h (`MAGIC_LINK_TTL_HOURS`) e exige confirmação por clique.
- Recuperação de senha por e-mail vale 1 hora.
- E-mail sai por `EMAIL_TRANSPORT` (`smtp` ou `resend`). Padrão `log`, que não entrega nada.
- Em produção o link inteiro nunca vai para o log. `EMAIL_LOG_FULL_LINKS` é só de desenvolvimento.
- Limites de login ficam em `apps/web/src/lib/auth-access.ts` e valem em memória (1 réplica).

## RGM

O RGM identifica o aluno dentro do workspace. É único e obrigatório na API. Trocar o e-mail encerra todas as sessões abertas. Ver [[API de integração v1 e webhooks]].

## Autorização

- Sempre no servidor, nos layouts e Route Handlers (`requireStaff`, `requireEditor`, `requireAdmin`, `requireOwnEnrollment`, `requireCourseInWorkspace`). Não há `proxy.ts`.
- Tokens de integração valem para um workspace e podem ser revogados na hora.
- Conteúdo é JSON tipado. Nunca `eval`, HTML livre ou SQL gerado por autor ou IA.
- Segredos só em variáveis de ambiente do servidor.

## Registro de acessos

O IP real depende de `TRUSTED_PROXIES` (e `CLIENT_IP_HEADERS` atrás do Cloudflare). Os registros de acesso são apagados após 6 meses.

## Trava de gasto

`ALLOW_PAID_PROVIDERS` impede chamadas pagas sem decisão explícita. Ver [[Geração de mídia, orçamento e teto diário]].

## Privacidade

O modelo é "cliente controlador, DNA operadora" para clientes institucionais. Textos legais ficam em rascunho até a revisão jurídica. Ver [[2026-11-13 Política, termos e certificado adiados]] e [[Pendências]].

> [!warning] Dados de teste
> O seed cria usuários de demonstração com senha de desenvolvimento. Não rode o seed em produção real. A senha não é registrada neste cofre.
