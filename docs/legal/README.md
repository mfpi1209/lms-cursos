# Documentos de privacidade e uso do portal DNA Work

Conjunto de rascunhos escritos em 01/11/2026 a partir do código do repositório. Nenhum deles é parecer jurídico e nenhum afirma conformidade; todos prometem só o que o sistema faz hoje e marcam o resto com `[A CONFIRMAR: ...]`, `[PENDENTE ATÉ ESTAR NO AR: ...]` ou placeholders. Controladora: DNA Work Treinamento e Desenvolvimento Profissional Ltda., CNPJ 40.380.163/0001-61. Encarregado informado pelo responsável: Caio Vinicius Pinheiro / Luan Melo Villas Boas, contato@dnawork.ai (ver pendências sobre a forma de indicação).

| Documento | Público | Status | Falta do responsável | Falta do advogado | Falta do código |
| --- | --- | --- | --- | --- | --- |
| `politica-de-privacidade.md` (em `apps/web/src/content/legal/`) | alunos e responsáveis | rascunho completo | hospedagem e país; data; URL; forma de ingresso | bases legais e prazos; Marco Civil; texto do responsável | links no login e no rodapé; registro de acesso; retenção; HTTPS; backup |
| `politica-de-cookies.md` (idem) | alunos | rascunho completo | data; URL | base do cookie de sessão; enquadramento das preferências | links; nome do cookie com `__Secure-` após HTTPS |
| `termos-de-uso.md` (idem) | alunos e responsáveis | rascunho completo | forma de ingresso e aceite; canal da senha inicial | foro e CDC; classificação indicativa; regra do selo na exclusão; menor de 18 | página pública e aceite; faixa etária na tela de entrada |
| `resumo-publico-avaliacao-de-impacto.md` (idem) | alunos e responsáveis | rascunho | canais de apoio; periodicidade | aprovação do texto | página pública; atualizar a cada item concluído |
| `registro-de-operacoes.md` | interno (art. 37) | completo para o sistema atual | hospedagem | bases e prazos | manter ao criar tabela ou integração |
| `avaliacao-melhor-interesse-e-legitimo-interesse.md` | interno | completo | decisão sobre selo público e ingresso | validar testes; escolher bases | aviso no campo; apagar nota; grupo mínimo nos relatórios |
| `avaliacao-de-impacto.md` | interno (RIPD + art. 47) | versão 1 | parecer do encarregado; aceitar riscos R9 e R13 | revisar riscos e ordem | itens da seção 5 |
| `procedimento-direitos-do-titular.md` | interno | completo, aguardando scripts | quem acessa contato@dnawork.ai; critério para responsável | regra do selo na exclusão; verificação de vínculo | `dados:exportar` e `dados:apagar` |
| `plano-de-incidentes.md` | interno | completo, não testado | nomes dos papéis; canal interno; exercício de mesa | pequeno porte (prazo em dobro) | e-mail transacional; logs do servidor |
| `politica-interna-de-acesso.md` | interno (equipe) | completo | forma de aceite; local do registro de consultas | - | perfil "suporte" (opcional) |
| `pendencias.md` | interno | vivo | seções 1 e 2 | seções 3, 4, 7, 8 | seção "Para o código" |

## Onde estão os textos públicos

A fonte da verdade dos quatro textos públicos mudou para dentro do app, porque a imagem do Docker não leva `docs/`: **`apps/web/src/content/legal/`** (`politica-de-privacidade.md` → `/privacidade`; `politica-de-cookies.md` → `/cookies`; `termos-de-uso.md` → `/termos`; `resumo-publico-avaliacao-de-impacto.md` → `/seguranca`). Editar lá; os links `./x.md` entre os textos viram as rotas. O aviso "Rascunho em revisão jurídica" e o `noindex` saem trocando a constante `LEGAL_DRAFT` em `apps/web/src/lib/legal/documents.ts`. Os demais documentos desta pasta são internos e ficam aqui.

## Ordem sugerida

1. Responsável preenche o que só ele sabe (`pendencias.md`, seções 1 e 2) e decide a forma de indicação do encarregado.
2. Advogado revisa os textos públicos e fecha bases, prazos, Marco Civil, foro, classificação indicativa e a regra do selo.
3. Código executa a seção "Para o código" de `pendencias.md`, na ordem.
4. Infra: HTTPS e backup; só então os marcadores `[PENDENTE ATÉ ESTAR NO AR]` saem.
5. Publicar as páginas públicas com a data de vigência; fazer o exercício de mesa do plano de incidentes; assinar a política interna.

## Fontes conferidas nesta rodada

Lei 12.965/2014 (arts. 5, VIII; 7, I e X; 10; 15; 16; 17) e Decreto 8.771/2016 (arts. 11, 13, 15, 15-A), no Planalto; LGPD (arts. 10, 14, 18, 19, 37, 38, 46, 48), no Planalto; Lei 15.211/2025 (arts. 1, 7, 8, 16, 31) e Decreto 12.880/2026 (arts. 12, §4, e 47), no Planalto e na Câmara; Resolução CD/ANPD nº 15/2024 (arts. 5, 6, 8, 9, 10), na biblioteca digital do MJ; Guia Orientativo da ANPD sobre legítimo interesse (02/02/2024) e Enunciado CD/ANPD nº 1/2023, em gov.br/anpd; Resolução CD/ANPD nº 18/2024 (encarregado), por resumo de fontes públicas, texto integral não lido; Portaria MJSP 502/2021 e Guia Prático de Classificação Indicativa, só a estrutura, sem conferir a faixa etária por tema.
