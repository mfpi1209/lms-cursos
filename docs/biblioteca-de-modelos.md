# Biblioteca de modelos (2026-10-29)

Peças prontas por workspace para montar o próximo curso sem copiar de outro curso.
Tela: **Estúdio › Modelos** (`/estudio/modelos`). Aplicar um modelo só copia dados
para o rascunho (nova revisão, origem `template`): **nenhum vídeo/voz é gerado e nada é cobrado**.

## Tipos

| Tipo | O que guarda | Usar sozinho? |
|---|---|---|
| `kit` | estúdio + instrutor + voz + marca + direção + regras + alunos de teste (por chave) | sim (tudo de uma vez) |
| `studio` | modo (`zones`/`composite`), descrição dos pedidos de câmera (`sceneryPrompt`), zonas, imagem, fundo/posição | só por kit |
| `presenter` | nome, papel, pronome, look base, voz, **kit de câmeras por estúdio** (lookIds prontos) | só por kit |
| `voice` | provedor, voiceId, amostra (trecho de narração já produzida) | sim |
| `branding` | marca d'água (logo, rodapé direito, 0,7), vinheta de assinatura; sem campo de slogan | sim |
| `direction` | `directionStyle`, cartão padrão (`presenter_chips`/`presenter_panel`/`card`), letreiro, pergunta a seguir, regras | sim |
| `knowledge` | base de conhecimento do motor (regras de roteiro, fala, vídeo, câmera, cartões, marca, custo, produto) | consulta |
| `learner` | aluno de teste fictício (idade, cidade, situação, traços, tempo, jeito de responder) | consulta + simulação |

Esquema: `packages/course-schema/src/library.ts` (+ `library-defaults.ts`, `learner-sim.ts`).
Banco: tabela `library_templates` (migração `0012_library_templates.sql`), repositório `packages/db/src/repositories/library.ts`.

## Kits prontos

- `estudio7-marina`: Marina no estúdio 7 (`cam_j7_esq`, `cam_j7_dir`, `cam_j7_34`), voz Ana Dias, pílulas.
- `estudio7-rafael`: Rafael no estúdio 7 (`cam_r7_esq`, `cam_r7_dir`, `cam_r7_34`), voz Gabriel, pílulas.
- `recepcao-marina`: Marina na recepção com balcão (`cam_principal`, `cam_cenario_34`), painel.

Kit cujo instrutor não tem câmeras PRONTAS no estúdio é recusado com mensagem clara:
gerar câmeras é pago e continua sendo um passo à parte, com aprovação.

## Como usar

- **Montar/atualizar a biblioteca** (extrai Marina e Rafael dos rascunhos, só leitura; envia as
  imagens dos estúdios ao storage local; idempotente):
  ```
  set -a; . ./.env; set +a
  pnpm db:migrate
  ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/biblioteca-modelos.ts [--dry-run]
  ```
- **Importar roteiro com kit** (no lugar de `--source-course`/`--zone-cameras`):
  ```
  ./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/import-markdown-course.ts \
    --file docs/roteiros/curso-x.md --kit estudio7-marina [--dry-run]
  ```
- **Novo curso no estúdio**: campo "Kit pronto" no passo 1.
- **Curso existente**: em Modelos, escolha o curso e "Usar neste curso".

## API

- `GET /api/library?kind=` · `POST /api/library` `{ template }` · `GET|DELETE /api/library/:idOuChave` (arquivar)
- `POST /api/courses/:id/library` `{ template, expectedRevision? }` — aplica kit/voz/marca/direção
- `GET /api/courses/:id/learners?keys=` — opinião dos alunos de teste
- `POST /api/courses` aceita `kit`

## Alunos de teste

Simulação por regras (sem IA, sem custo, determinística): cada perfil percorre o rascunho escolhendo
como responderia (`cautious`/`best`/`impulsive`/`mixed`) e avalia tempo × minutos disponíveis,
palavras na tela × tolerância de leitura, falas acima de 120 palavras, aula sem decisão, escrita
obrigatória, retorno que não diz o que fazer e jargão de RH sem explicação. Devolve nota 1–5,
o que gostou, o que atrapalhou e a opinião em primeira pessoa. Quem não termina no tempo que
tem não dá mais que 3.
