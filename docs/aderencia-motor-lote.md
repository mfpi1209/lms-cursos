# O motor dá conta do lote sozinho? (2026-10-30)

Pergunta: dá para **construir e pilotar** os 12 cursos só pelo motor (estúdio + fila),
sem sessões do Claude e sem scripts no Terminal?

**Resposta curta:** a produção de cada curso, sim; o começo (instrutor novo e
importação do roteiro) e o lote, ainda não. Cerca de 70% do caminho já passa pelo
estúdio. Os 30% que faltam estão em 4 lacunas bem definidas.

## O que o motor já faz sozinho

| Etapa | Onde está | Situação |
|---|---|---|
| Aplicar kit (instrutor, voz, câmeras, letreiro, elenco) | `/estudio/modelos` + `POST /api/courses/:id/library` | ✅ remapeia a direção por zona |
| Orçamento oficial e aprovação paga | `media-jobs/quote` → `batch` (confirmPaid) | ✅ com teto em 24 h por workspace |
| Fila de gravação, recomposição grátis | `media-queue`, `media-jobs/recompose` | ✅ |
| Paleta, pílulas, letreiro, marca d'água, "pergunta a seguir" | compositor | ✅ automático a partir do rascunho |
| Câmera nova a partir de um visual existente | `POST /api/media/looks` (sourceLookId + referência do estúdio) | ✅ |
| QA de conteúdo | `quality`, `validate`, prévia da aula | ✅ |
| Publicar, matricular, versões | `publish`, `enrollments`, `versions` | ✅ (mover matrículas para a versão nova: só script) |
| Teto de gasto | `workspaces.spend_limits` | ✅ (sem tela para mudar) |

## O que hoje só sai por script ou sessão

1. **Instrutor novo do zero** (personagem por texto + 3 câmeras do estúdio + voz):
   `novo-instrutor.ts`. A API de visuais exige um visual de origem; falta
   "criar personagem por descrição" e "gerar as 3 câmeras do estúdio N" na tela.
2. **Importar o roteiro no formato GPT** (`import-markdown-course.ts`). O estúdio
   aceita `.md` como *fonte* para a IA montar o curso; não faz a importação fiel,
   cena por cena.
3. **Paleta do vídeo** (`branding.videoPalette`): não há campo na tela.
4. **Lote**: rodar N cursos de uma vez (rostos → kit → orçamento → gravação → QA →
   publicação) e acompanhar tudo num painel. Hoje são `lote-rostos.sh`,
   `aplicar-kit.ts`, `lote-videos.sh` e 12 sessões.

Também: mover matrículas para a versão nova e ajustar o teto pela tela.

## O que foi preciso contornar neste lote

- Créditos de API do HeyGen esgotados no meio (o motor não avisa antes; só falha).
- O modo automático bloqueia scripts pagos: as aprovações tiveram que ir ao Terminal.
- Mensagens entre sessões têm limite; parte das sessões ficou sem aviso.
- Cada sessão criou seus scripts de biblioteca com formatos diferentes; o
  `aplicar-kit.ts` unificou a aplicação.

## Proposta para fechar (ordem sugerida)

1. **Tela "Novo instrutor"** em `/estudio/modelos`: descrição → personagem →
   3 câmeras no estúdio escolhido → voz da biblioteca → grava presenter + kit.
   Orçamento e "aprovo" iguais aos vídeos.
2. **Importar roteiro** em `/estudio/novo`: subir o `.md` do GPT → rascunho fiel,
   já com kit e paleta escolhidos.
3. **Paleta e teto** em detalhes do curso e do workspace.
4. **Painel de lote**: lista de cursos com etapa atual, custo, botão "aprovar tudo
   até US$ X", e QA automático ao fim da gravação. Junto, saldo de créditos do HeyGen
   antes de disparar.

Com 1 e 2, um autor monta um curso inteiro sozinho pelo estúdio. Com 4, pilota
12 de uma vez sem sessões.
