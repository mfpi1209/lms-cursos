---
tags: [piloto, pendências]
atualizado: 2026-11-13
fonte:
  - docs/planos/piloto-resumo.md
  - docs/legal/pendencias.md
  - docs/planos/plano-piloto-cruzeiro.md
---

# Pendências

## Conversor da outra sessão

- Gerar uma linha `Vídeo próprio:` por arquivo (62 cenas, 73 MP4 na leva 1).
- Corrigir `REACTION_LENGTH`: 23 reações com menos de 8 palavras.
- Ligar a cena `A01` a um objetivo (`NO_OBJECTIVE`).
- Trocar "apresentador" genérico no C1 pelo instrutor do curso.

Ver [[Sintaxe do roteiro Markdown]].

## Imagens do curso de origem

11 imagens da apresentadora do curso de origem ainda apontam para o HeyGen. É preciso guardá-las na plataforma.

## Certificado e jurídico

- Certificado por curso: adiado. Falta modelo, emissor, CNPJ e assinatura.
- Política e termos: adiados. Não publicar sem revisão jurídica.
- Documentos internos de privacidade ainda dizem "Controladora: DNA Work".
- Endereço da DNA diverge do cadastro público.

Ver [[2026-11-13 Política, termos e certificado adiados]].

## Carga horária

Os cinco cursos somam cerca de 5 h de vídeo para 30 h de carga. Decidir como justificar ou completar a diferença.

## Produção

- Escolher o visual do painel (3 estilos em teste). Ver [[2026-11-13 Painel com tópicos no ritmo da fala]].
- Gerar o resto do C1 (cerca de US$ 40 a 42). Ver [[Custos até agora]].
- Gerar C2 a C5 em lotes diários. Ver [[2026-11-13 Teto diário e geração em lotes]].

## Plataforma

- A rota `media-jobs` ainda exige `avatarId` na cena de tela e rotula o job como `heygen`.
- Vinheta final não está ligada à cena de tela.
- `freezedetect` calibrado só com vídeo sintético.
- Proxy precisa aceitar 1 GB; Cloudflare gratuito corta em 100 MB.
- Controlador por variável de ambiente vale para o servidor inteiro.
- Hospedagem, HTTPS e backup seguem pendentes. Ver [[Implantação]].

> [!warning] A confirmar
> Quais itens acima já foram resolvidos depois do último commit de docs. Os docs do repo são de antes de 2026-11-13.
