# Lote de 12 cursos (2026-10-30): regras comuns

Uma sessão por curso. Objetivo duplo: **entregar o curso pronto** (importado, com
instrutor próprio, vídeos, QA e publicado) e **descobrir se o motor entrega tudo
sozinho**, sem precisar de ajuda da sessão principal. Toda vez que precisar
contornar algo, isso vira um achado no relatório.

Roteiros de origem: `/Users/marcelopinheiro/Downloads/NN_*.md` (formato do
`docs/prompts/prompt-gpt-roteiro-curso.md`). Copie o seu para
`docs/roteiros/lote/NN_*.md` e trabalhe sobre a cópia.

## Elenco, estúdio e paleta (não troque sem combinar)

Instrutores **novos** entram na biblioteca (`docs/biblioteca-de-modelos.md`, tipo
`presenter` + `voice` + um `kit`). Marina e Rafael já existem (kits
`estudio7-marina` e `estudio7-rafael`). Os nomes abaixo não colidem com os
personagens de cada roteiro.

| Curso | Instrutor (papel) | Perfil visual | Voz (ElevenLabs, pt-BR) | Estúdio | Paleta |
|---|---|---|---|---|---|
| 01 Primeiro dia | **Marina** (Sua orientadora) — já existe | — | Ana Dias (já existe) | 7 | invertida |
| 02 Roupa no trabalho | **Camila** (Sua orientadora) | mulher negra, 27, cabelo cacheado, blazer leve claro | feminina jovem, acolhedora | 6 | clássica |
| 03 Celular no trabalho | **Rafael** (Seu orientador) — já existe | — | Gabriel (já existe) | 7 | invertida |
| 04 WhatsApp profissional | **Thiago** (Seu orientador) | homem pardo, 25, camisa casual, sorriso fácil | masculina jovem, leve | 8 | clássica |
| 05 Horários e combinados | **Júlia** (Sua orientadora) | mulher branca, 26, cabelo liso preso, camisa listrada | feminina clara, objetiva | 6 | invertida |
| 06 Limites e intimidade | **Patrícia** (Sua orientadora) | mulher parda, 38, cabelo curto, serena | feminina madura, calma | 8 | clássica |
| 07 Conversar com a equipe | **Gustavo** (Seu orientador) | homem negro, 30, barba curta, camisa social sem gravata | masculina calma, firme | 7 | invertida |
| 08 Espaços compartilhados | **Aline** (Sua orientadora) | mulher de ascendência asiática, 29, cabelo chanel | feminina simpática | 6 | clássica |
| 09 Redes sociais | **Enzo** (Seu orientador) | homem branco, 24, cabelo ondulado, camiseta + jaqueta leve | masculina jovem, animada | 8 | invertida |
| 10 Terminei a tarefa | **Beatriz** (Sua orientadora) | mulher indígena, 28, cabelo longo liso | feminina tranquila | 7 | clássica |
| 11 Perguntar sobre regras | **Renato** (Seu orientador) | homem pardo, 34, óculos, cardigã | masculina clara, paciente | 6 | invertida |
| 12 Correção de postura | **Helena** (Sua orientadora) | mulher negra, 45, cabelo grisalho curto | feminina madura, acolhedora | 8 | clássica |

- **Vozes:** escolha na biblioteca pública do ElevenLabs (busca grátis em
  `/v1/shared-voices?language=pt&accent=brazilian…`). Antes de escolher, veja
  na tabela `library_templates` (tipo `voice`) se alguém já pegou a voz; ao
  escolher, registre na biblioteca na hora. Nada de voz repetida entre cursos.
- **Paletas** (`branding.videoPalette` no rascunho; o compositor já aceita):
  - clássica: `{ "base": "#1D1E4C", "accent": "#FF7A08" }` (véu roxo-marinho, destaque laranja)
  - invertida: `{ "base": "#FF7A08", "accent": "#1D1E4C" }` (véu laranja, título e ícones roxo-marinho)
  - pode variar o tom dentro da marca (ex.: um roxo mais claro), mas mantenha
    legível. O texto escolhe branco ou marinho sozinho pelo contraste.
- **Marca:** a DNA Work é o agente de integração e oferece as vagas (nunca citar
  CIEE, IEL etc.); sem slogan inventado; logo no rodapé (marca d'água padrão).
- **Fala:** troque "Eu sou a Marina…" pelo novo instrutor (gênero certo:
  "seu orientador"/"sua orientadora"). Temas importantes com **leveza**, como a
  Marina e o Rafael: próximo, sem sermão, sem infantilizar, sem julgar.
- **Ponte com o aluno:** antes de cada pergunta, a última frase do vídeo chama o
  aluno ("Agora é com você: o que você faria?"); a cena depois da resposta
  retoma o tema de um jeito que serve para qualquer escolha. (Outra sessão está
  definindo o padrão do motor para isso; aqui, ajuste o texto do seu roteiro
  antes de gravar.)

## Gasto (obrigatório)

- Tudo que é pago (visual do instrutor no HeyGen, vídeos) só com **"aprovo"**
  escrito pelo usuário **na sua sessão**, depois de mostrar o orçamento oficial
  (`POST /api/courses/<id>/media-jobs/quote`, que não cobra).
- Orçamento por curso: **até US$ 4 em vídeos**; perguntas ficam só em texto
  (sem a instrutora lendo). O teto de mídia é US$ 120 a cada 24 h para as 12 juntas (subido de 50 → 80 → 120 pelo usuário em 30/10, no workspace: `workspaces.spend_limits.mediaDailyUsd`).
- Visual novo do instrutor: 1 personagem base + 3 câmeras no estúdio (≈ 4
  créditos HeyGen). Comando: `apps/worker/src/scripts/gerar-instrutor.sh` (leia o
  cabeçalho). **Obrigatórios:** `COURSE_ID`, `INSTRUTOR`; para instrutora,
  `PRONOUN=she`; passe também `ESTUDIO`, `BASE_PROMPT` (o padrão é o Rafael),
  `VOICE_ID`, `VOICE_OWNER`, `VOICE_NAME`. A descrição do estúdio sai pelo número
  (6/7/8) e as câmeras ficam `cam_<nome><estúdio>_esq|dir|34`. O modo automático bloqueia scripts pagos: **não contorne**;
  passe ao usuário o comando exato para rodar no Terminal.

- **Orçamento:** peça só os vídeos (`nodeIds` com os V…); o orçamento padrão
  inclui as perguntas (a instrutora lendo), que neste lote ficam em texto. O teto
  de mídia conta as **últimas 24 h** (não o dia do calendário).

## Correções do motor já feitas (2026-10-30)

- `gerar-instrutor.sh`/`novo-instrutor.ts`: `PRONOUN`, estúdio pelo número,
  câmeras com o nome, `COURSE_ID`/`INSTRUTOR` obrigatórios.
- `import-markdown-course.ts --kit`: `--presenter`, `--presenter-role`,
  `--voice`, `--avatar-name` agora valem por cima do kit (antes o kit apagava).
- **Aplicar um kit num curso já montado** (biblioteca / `applyKitToDocument`):
  os planos da direção passam sozinhos para as câmeras do instrutor novo na
  mesma zona (esq→esq, dir→dir, 3/4→3/4). Não precisa mais reimportar.
- `gerar-instrutor.sh`: se as 3 câmeras do estúdio já estão prontas, não gera
  nada (sem custo); câmera-base sem acento.
- Republicar: `packages/db/src/scripts/publicar-e-matricular.ts <curso> [aluno]`
  move as matrículas para a versão nova quando as aulas e cenas são as mesmas.
- Gravar vídeos de todos os cursos prontos de uma vez:
  `bash apps/worker/src/scripts/lote-videos.sh` (só grava curso com o instrutor
  certo nas câmeras; até US$ 4; respeita o teto; `DRY=1` só confere).
- 30/10 12:23–12:30: vídeos de 01, 02, 03, 04, 05, 06, 09 e 11 disparados pela
  sessão principal (`lote-videos.sh`). Enzo, Júlia, Patrícia e Renato prontos,
  com kit aplicado (`lote/aplicar-kit.ts <curso> <kit> <classica|invertida>`).
- Os créditos de API do HeyGen acabaram de novo às 12:28: Gustavo (07), Aline (08)
  e Helena (12) esperam mais créditos. Depois disso: `zsh apps/worker/src/scripts/lote-rostos.sh 07 08 12`,
  então biblioteca + `aplicar-kit.ts` + `lote-videos.sh 07 08 12`.

## Resultado (30/10, 15h)

Os 14 cursos (12 do lote + Primeira Vaga + Comece bem) estão publicados com vídeos,
chamada antes de cada pergunta e reação da instrutora a cada resposta (213 reações).
Gasto de mídia do dia ≈ US$ 75. Piloto desligado; servidores de volta ao **modo demo**.
Curso 12: antes de republicar, rodar `lote/12-normalizar.ts` (voz −20 LUFS) até a A15.

## Servidores (uma só porta 3010 para todos)

- Quem cuida dos servidores é a **sessão principal**. Eles ficam em **modo mídia
  real** durante o lote (nada é cobrado sem orçamento + "aprovo").
- **Nunca** pare, reinicie nem troque o modo dos servidores. Se cair, avise a
  sessão principal por mensagem e espere.

## Código do motor

- **Não edite código compartilhado** (`packages/*/src`, `apps/*/src`). Se o
  motor não der conta de algo, anote no relatório e avise a sessão principal por
  mensagem; ela corrige uma vez para todos.
- Pode criar arquivos seus: scripts em `packages/db/src/scripts/lote/NN-*.ts`,
  roteiro em `docs/roteiros/lote/`, relatório em `docs/qa/lote/NN-*.md`.
- Edite rascunhos sem reimportar depois que houver vídeo pago (reimportar
  descarta vídeos).
- Não commite.

## Entrega

1. Curso importado (rascunho), instrutor e voz na biblioteca, paleta aplicada.
2. Vídeos gravados (com aprovação), conferidos quadro a quadro: rosto, voz,
   pílulas, letreiro, pergunta a seguir, marca d'água, cores.
3. QA como aluno (prévia e área do aluno): toda escolha leva a algum lugar, toda
   aula chega ao fim, textos sem erro, nada de futsal/CIEE/slogan.
4. Publicado e com os alunos de teste matriculados.
5. Relatório `docs/qa/lote/NN-*.md`: o que funcionou sozinho, onde precisou
   contornar, sugestões para o motor, custo gasto.
