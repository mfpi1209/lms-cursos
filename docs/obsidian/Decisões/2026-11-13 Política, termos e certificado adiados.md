---
tags: [decisão, legal, certificado]
atualizado: 2026-11-13
fonte:
  - docs/legal/pendencias.md
  - docs/planos/plano-piloto-cruzeiro.md
  - docs/integracao/api-v1.md
---

# Política, termos e certificado adiados

**Data:** 2026-11-13. **Status:** adiada.

## Contexto

O piloto precisa ir ao ar, mas os textos legais e o certificado dependem de decisões e de revisão.

## Decisão

- **Política e termos:** ficam para depois. Não publicar sem revisão jurídica.
- **Certificado por curso:** adiado. Falta modelo, emissor, CNPJ e assinatura.

## Consequência

- Os textos ficam em rascunho (aviso e `noindex`). Só saem com `LEGAL_PUBLISHED=1`. Ver [[Implantação]].
- Na API, `certificado_codigo` é sempre `null` e o evento `certificate.issued` não é produzido. Ver [[API de integração v1 e webhooks]].
- Checklist de publicação (de `docs/legal/pendencias.md`): confirmar quem assina; preencher as variáveis `LEGAL_*`; revisão do advogado; contrato de operação assinado; só então `LEGAL_PUBLISHED=1`.

> [!warning] Conflito a resolver
> Os docs jurídicos usam o modelo "cliente controlador, DNA operadora". A decisão [[2026-11-13 Plataforma, cursos e marca são da DNA]] diz que o parceiro não é controlador. O jurídico precisa decidir qual vale.

Ver [[Pendências]].
