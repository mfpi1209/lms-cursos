# Nomes finais e parte de baixo do Explorar (31/10/2026)

Nada foi publicado, commitado nem pago. Servidor não reiniciado. Escopo: seções 5 e 6 de `docs/qa/enriquecimento/brief.md` e o mockup da parte de baixo da Home.

## 1) Nomes finais

Script: `packages/db/src/scripts/nomes-finais.ts` (dry-run por padrão; `--apply` grava). Idempotente (segunda execução: "nada a fazer" nos 14 cursos). Lê o rascunho de novo, só troca texto que ainda está antigo (ou já novo), grava com `expectedRevision` e, em conflito, relê e tenta de novo (até 8 vezes). Texto que outra pessoa mudou para um terceiro valor não é sobrescrito (aparece como PULADO; nenhum caso na execução).

```
set -a; . ./.env; set +a
./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/nomes-finais.ts           # dry-run
./apps/worker/node_modules/.bin/tsx packages/db/src/scripts/nomes-finais.ts --apply
```

Aplicado: 92 textos em 14 rascunhos (uma revisão nova por curso, origem `script`). Em cada rascunho mudaram `title` (e, por `saveDraft`, a coluna `courses.title`), `learnerSummary` (é o que a ficha e o card mostram), `branding.tagline` (era igual ao resumo), `branding.wordmark` e os títulos das aulas. Ids, slugs, URLs, matrículas, nós, vídeos e capas não mudaram. O curso C06 (crs_b8zeh4b2gguseghq) recebeu só texto (título do curso, resumo e título das 3 aulas); a aula 3 nova ficou intacta no resto.

### O que o aluno vê já e o que só depois de publicar
- Já (coluna `courses.title` + tabela `short-titles.ts`): nome do curso no catálogo, "Continuar assistindo", destaque, ficha (h1), trilhas, topo do player e conquista "Curso concluído".
- Só depois de publicar (a versão publicada ainda traz o texto antigo): resumo/descrição do curso (card, ficha, popover), títulos das aulas (lista de aulas, player, capítulos) e `document.title` da versão. **Por isso o popover da ficha ainda mostra descrição e aulas antigas até a publicação.**

### Histórico, certificados e selo
- Não há certificado por curso. O Selo DNA Work é por trilha e guarda `trail_name`; o campo `courses` do selo guarda um instantâneo `{courseId, title}` dos cursos da trilha no momento da emissão. Não há selos emitidos (`trail_badges` vazia), então nada a preservar agora; selos novos já nascem com os nomes novos, e um selo antigo manteria o título da época (comportamento desejado: "título da versão concluída").
- Matrículas e tentativas guardam ids, não títulos. Nada a migrar.
- Atenção: a lista de cursos de uma trilha é ordenada por título (`recognition.trailStatus`); a ordem dentro das trilhas muda com os nomes novos.
- O texto "Antes de postar, confira: pessoas, informações visíveis e autorização." (cartão de fim do C09) é uma frase de conteúdo, não o nome do curso; ficou.
- Referências textuais do código: só `short-titles.ts` (atualizado, incluindo comentários e os comentários dos banners). Os demais achados são scripts históricos de importação (`lote/`, `pacote-15`) e testes, que não são lidos em tempo de execução.

### Cursos (antigo → novo; descrição = `learnerSummary`)

| Cód. | Id | Antigo | Novo | Descrição |
|---|---|---|---|---|
| C01 | crs_99hpdsc8w88osiuh | Primeiro dia: como chegar preparado | Meu primeiro dia | O que confirmar, como chegar e quem procurar. |
| C02 | crs_arbeohlw3xp5v3zx | Que roupa eu uso para trabalhar? | Que roupa eu uso? | Entenda a orientação do trabalho e converse sobre alternativas. |
| C03 | crs_hd4jnnpx3oj0xf14 | Celular no trabalho: quando pega mal? | Celular no trabalho | Saiba como conciliar tarefas, mensagens e recados importantes. |
| C04 | crs_4z17p0m6d43qxmmo | WhatsApp profissional sem passar vergonha | WhatsApp sem complicação | Escreva mensagens claras e acompanhe seus pedidos. |
| C05 | crs_4tj8a3q3g9gudgb7 | Horário é combinado | Horário é combinado | Organize sua chegada e saiba como avisar mudanças. |
| C06 | crs_b8zeh4b2gguseghq | Liberdade e intimidade são coisas diferentes | Brincadeiras têm limite | Reconheça preferências, expresse seus limites e saiba buscar apoio. |
| C07 | crs_bmf11akamtxoti28 | Como conversar com colegas e gestores | Como falar com a equipe | Peça ajuda, confirme orientações e esclareça diferenças. |
| C08 | crs_8g0csi2hflfztfge | Espaços compartilhados: você não está sozinho | O espaço também é do outro | Cuide dos ambientes e materiais que você compartilha. |
| C09 | crs_gjn468p3y6hwua4f | Redes sociais e bastidores do trabalho | Posso postar isso? | Confira o que sua publicação pode revelar sobre o trabalho. |
| C10 | crs_q52zsimeeahpa9bq | Acabou minha tarefa. E agora? | Terminei. E agora? | Entregue com clareza e escolha o próximo passo. |
| C11 | crs_u4nfw88a4n2n0ubv | Não entendi a regra. Como pergunto? | Não entendi. Posso perguntar? | Tire dúvidas e esclareça orientações que não ficaram claras. |
| C12 | crs_5vccpfypr6fmxojb | Como receber uma correção de postura | Recebi uma correção. E agora? | Entenda o que aconteceu, converse e combine uma mudança. |
| C13 | crs_gujuaiykqcsl2n31 | Comece bem: seus primeiros passos no trabalho | Comecei a trabalhar | Pratique os primeiros passos para aprender e ganhar autonomia. |
| C14 | crs_hvvgkvtd1rb2um0l | Primeira Vaga | Minha primeira vaga | Prepare seu currículo, procure oportunidades e pratique entrevistas. |

Antes, a vitrine usava "títulos curtos" diferentes do nome do curso ("Feedback sem medo", "Conviver no trabalho", "Mensagem profissional", "Converse com confiança", "Respeite os limites", "Antes de postar", "Posso perguntar?", "O que vestir?", "Comece bem", "Primeira vaga"). Agora o nome de vitrine é o nome final (mesma tabela, ligada ao id).

### Aulas (43 no total: 38 renomeadas, 5 preservadas)
Critério: dizer o que se pratica, sem prometer resultado e sem tempo. Conferido no conteúdo: C02·A1 trata de roupa, calçado e uniforme; C01·A2 comunica imprevisto e trata de como se apresentar; C14·A9 trabalha a apresentação em até um minuto (o "em um minuto" saiu do título, ficou na descrição interna).

| Cód. | Aula | Antigo | Novo |
|---|---|---|---|
| C01 | 1 | Confirme antes de sair | Como confirmar local, horário e documentos |
| C01 | 2 | Resolva a chegada sem adivinhar | Como avisar um atraso e se apresentar |
| C02 | 1 | Descubra o combinado do ambiente | Como confirmar roupa e calçado |
| C02 | 2 | Converse sobre alternativas | Como conversar sobre alternativas de roupa |
| C03 | 1 | Entenda quando pode usar | Como saber quando usar o celular |
| C03 | 2 | Combine recados e preserve o ambiente | Como receber um recado importante |
| C04 | 1 | Envie uma mensagem que ajuda | Como escrever uma mensagem com contexto e pedido |
| C04 | 2 | Acompanhe sem pressionar | Como acompanhar um pedido sem pressionar |
| C05 | 1 | Planeje uma chegada possível | Como planejar o trajeto e a chegada |
| C05 | 2 | Avise e confirme o próximo passo | Como avisar uma mudança de horário |
| C06 | 1 | Conheça as pessoas sem presumir | Nomes, apelidos e brincadeiras |
| C06 | 2 | Expresse limites e procure apoio | Como expressar um limite e buscar apoio |
| C06 | 3 (nova, só o título) | Quando o alvo é outra pessoa | Como apoiar quando o alvo é outra pessoa |
| C07 | 1 | Escolha o momento e o canal | Como pedir orientação no momento certo |
| C07 | 2 | Discorde com fatos e proposta | Como esclarecer uma diferença de entendimento |
| C08 | 1 | Deixe pronto para a próxima pessoa | Como deixar o espaço pronto para a próxima pessoa |
| C08 | 2 | Comunique o que precisa de cuidado | Como avisar o que precisa de cuidado |
| C09 | 1 | Olhe além da sua foto | Como conferir o que a publicação mostra |
| C09 | 2 | Se algo escapou, comunique | Como comunicar uma publicação indevida |
| C10 | 1 | Termine com uma entrega clara | Como entregar e avisar onde está o resultado |
| C10 | 2 | Tenha iniciativa com alinhamento | Como escolher a próxima tarefa |
| C11 | 1 | Troque uma palavra vaga por um exemplo | Como pedir um exemplo |
| C11 | 2 | Quando as orientações não batem | Como esclarecer orientações diferentes |
| C12 | 1 | Entenda o comportamento apontado | Como entender o que precisa mudar |
| C12 | 2 | Combine um ajuste e reconheça limites | Como combinar uma mudança e buscar apoio |
| C13 | 1 | Entenda antes de começar | Como confirmar a entrega, o prazo e quem orienta |
| C13 | 2–5 | Peça ajuda com clareza · Organize tarefas e prioridades · Avise quando algo der errado · Transforme feedback em ação | preservados (já claros) |
| C13 | 6 | Proponha seu próximo passo | Proponha uma oportunidade de aprender |
| C14 | 1 | Você tem mais experiência do que imagina | Como reconhecer experiências que entram no currículo |
| C14 | 2 | Lendo uma vaga sem medo | Como ler uma vaga e decidir se candidatar |
| C14 | 3 | Onde achar vagas, e como fugir de golpes | Como procurar vagas e reconhecer golpes |
| C14 | 4 | Currículo de uma página | preservado |
| C14 | 5 | LinkedIn em 20 minutos | Prepare seu perfil profissional |
| C14 | 6 | A mensagem que abre portas | Como escrever uma mensagem para pedir uma conversa |
| C14 | 7 | O caminho de um processo seletivo | Como se organizar nas etapas do processo seletivo |
| C14 | 8 | Dinâmica de grupo | Como participar de uma dinâmica de grupo |
| C14 | 9 | "Fale sobre você" em um minuto | Como responder "fale sobre você" |
| C14 | 10 | Conte histórias, não adjetivos | Como contar o que você fez, com exemplos |
| C14 | 11 | Perguntas que dão frio na barriga | Como responder perguntas difíceis da entrevista |
| C14 | 12 | Entrevista online, suas perguntas e o depois | Prepare a entrevista e os próximos passos |

Os nove exemplos do brief (seção 6) estão todos aqui, com o texto do brief (C02·A1, C01·A2, C03·A2, C06·A1, C10·A2, C12·A1, C11·A1, C14·A5, C14·A12). Observação para o editor: no C03·A2 o objetivo da aula é "combinar um canal para o recado necessário"; o título do brief ("receber um recado importante") foi mantido.

Fora do escopo e não alterados: os 12 cursos novos e os arquivados. Frases gravadas nos vídeos (ex.: "Você tem mais experiência do que imagina. Agora é mostrar.", usada como fecho falado) continuam como estão; não são título.

## Capas a refazer (pendência de arte)
As 14 capas em pé (`courses.poster_asset_id`) têm o nome antigo DESENHADO na arte, e nada foi sobreposto. Hoje o card mostra a arte com o nome antigo e, abaixo, "com X" e a linha de duração/aulas (nome novo só no texto lido por leitor de tela, no popover e no player). Refazer, com o título novo à mão: todas as 14.

| Curso | Aparece na arte hoje | Refazer como |
|---|---|---|
| C01 crs_99hpdsc8w88osiuh | Meu primeiro dia | (igual; refazer só se a arte tiver a linha "com Marina", ver nota) |
| C02 crs_arbeohlw3xp5v3zx | O que vestir? | Que roupa eu uso? |
| C03 crs_hd4jnnpx3oj0xf14 | Celular no trabalho | (igual) |
| C04 crs_4z17p0m6d43qxmmo | Mensagem profissional | WhatsApp sem complicação |
| C05 crs_4tj8a3q3g9gudgb7 | Horário é combinado | (igual) |
| C06 crs_b8zeh4b2gguseghq | Respeite os limites | Brincadeiras têm limite |
| C07 crs_bmf11akamtxoti28 | Converse com confiança | Como falar com a equipe |
| C08 crs_8g0csi2hflfztfge | Conviver no trabalho | O espaço também é do outro |
| C09 crs_gjn468p3y6hwua4f | Antes de postar | Posso postar isso? |
| C10 crs_q52zsimeeahpa9bq | Terminei. E agora? | (igual) |
| C11 crs_u4nfw88a4n2n0ubv | Posso perguntar? | Não entendi. Posso perguntar? |
| C12 crs_5vccpfypr6fmxojb | Feedback sem medo | Recebi uma correção. E agora? |
| C13 crs_gujuaiykqcsl2n31 | Comece bem | Comecei a trabalhar |
| C14 crs_hvvgkvtd1rb2um0l | Primeira vaga | Minha primeira vaga |

Notas: (1) a tabela vem do que a vitrine usava antes; confira cada arte antes de mandar (C01, C03, C05 e C10 já podem estar certas). (2) A arte traz também uma linha pequena "com X"; como o card agora mostra "com X" dentro dele, as artes novas podem sair sem essa linha. (3) Se preferir não mostrar o nome antigo até as artes ficarem prontas, basta zerar `poster_asset_id` do curso: o card cai no quadro do vídeo com o título à mão já em nome novo (comportamento que já existe no código). Não fiz isso porque o pedido foi só registrar.

## 2) Parte de baixo da Home (Explorar)

Reaproveitado e ajustado, sem reescrever do zero:

- `_components/course-tile.tsx`
  - Variante `poster` (em pé): arte do curso inteira; dentro do card, embaixo do título, "com Instrutor" e "🕒 4 min | 📖 2 aulas" (ícones lucide Clock3/BookOpen), faixa marinho #1d1e4c; barra laranja na base quando em andamento. Sem selo "Novo" (o mockup não tem); o estado vai no texto para leitor de tela.
  - Variante `wide` (deitada, ≈2,2:1): lado esquerdo marinho com título branco e negrito, "com X", "🕒 N min | 📖 M aulas" e o botão laranja #FF7A08 "▶ Começar" (texto marinho, contraste ≈6:1); à direita a foto fundindo no marinho por degradê; em andamento "▶ Continuar", "N de M aulas" ao lado e barra laranja na base; concluído com a pílula laranja "✓ Concluído" no topo e botão contornado branco "▶ Rever". Cantos de 16 px e a mesma sombra do carrossel do topo.
  - Imagem do deitado, por ordem: banner largo `public/destaque/<id>.webp` (6 cursos: C04, C05, C07, C08, C09, C12), retrato do instrutor no estúdio (`presentation.avatarPreviewUrl`; o endereço da HeyGen é assinado e expira em cerca de uma semana, então, se não carregar, entra o quadro de abertura), e por fim o quadro do vídeo de abertura. Calculado em `_lib/learner-courses.ts` (`wide`).
  - Duração: curta no card ("4 min", "3–4 min"), por extenso para leitor de tela ("4 minutos de vídeo", "de 3 a 4 minutos de vídeo"), a partir do cálculo real de vídeo; os números do mockup não foram usados. Funções em `_lib/video-text.ts` (com teste).
  - Um único controle por card: o link é o cartão inteiro e o botão laranja é visual (sem link aninhado; verificado: 0 `a` dentro de `a`). O botão "ⓘ Detalhes" que já existia continua como irmão (não filho) do link, para abrir a ficha completa no celular. Nome acessível do link composto pelo conteúdo ("Meu primeiro dia com Marina 3 minutos de vídeo, 2 aulas. 0 de 2 aulas concluídas. Continuar aula 1."). Imagens decorativas com `alt=""`. Foco visível conferido (anel no cartão). Movimento reduzido respeitado (sem deslocamento no hover).
- `_components/catalog.tsx`: títulos das fileiras "Cursos em destaque", "Aprenda em poucos minutos" (≤ 10 min pelo maior percurso, regra que já existia; agora com os iniciados primeiro) e "Concluídos".
- `_components/course-rail.tsx`: setas ‹ › no canto superior direito da fileira (já existiam; só aparecem quando há o que rolar e no computador); contagem visível saiu (o mockup não tem), ficou para leitor de tela ("Cursos em destaque, 10 cursos").
- Celular (390 px): fileiras rolam na horizontal com snap (`scroll-snap-type: x mandatory`), deitados com 85% da largura (máx. 440 px), em pé com 44%; a página não tem rolagem horizontal (`scrollWidth` = 390). A fileira "Concluídos" e a página de trilhas usam a mesma variante deitada.
- Modo escuro: conferido (cartões já são marinho; anel claro sutil separa do fundo).
- `_lib/short-titles.ts`: nomes novos e comentários; `_lib/learner-courses.ts`: imagem do deitado.

Limitação conhecida: a aluna de demonstração só tem um curso em andamento com 0 aulas concluídas, então o texto "1 de 2 aulas" aparece nas telas como "0 de 2 aulas" (o formato é o mesmo). Não alterei dados dela.

## Verificação
- `apps/web`: `tsc --noEmit` sem erros; `vitest run` 8 arquivos / 23 testes passando (inclui `_lib/video-text.test.ts`). `packages/db`: `tsc --noEmit` sem erros. Não rodei Playwright e2e (não mudei rotas nem ids).
- Script de nomes: dry-run, `--apply` (92 textos), segunda execução sem mudanças.
- Telas (aluna@demo.local; autor@demo.local para a prévia do player), em `/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/home-final/`:
  - `explorar-1440.png`, `explorar-390.png` (claro); `explorar-escuro-1440.png`, `explorar-escuro-390.png`
  - `ficha-recebi-correcao-1440.png`, `ficha-recebi-correcao-390.png`, `ficha-whatsapp-1440.png`, `ficha-whatsapp-390.png`
  - `player-recebi-correcao-1440.png`, `player-recebi-correcao-390.png`, `player-whatsapp-1440.png`, `player-whatsapp-390.png` (prévia do rascunho no estúdio: título novo das aulas; aluno real vê o das aulas só depois da publicação)
  - `foco-teclado-1440.png` (foco visível)

## Arquivos alterados por este trabalho
- `packages/db/src/scripts/nomes-finais.ts` (novo)
- `apps/web/src/app/(lms)/aprender/_components/course-tile.tsx`
- `apps/web/src/app/(lms)/aprender/_components/catalog.tsx`
- `apps/web/src/app/(lms)/aprender/_components/course-rail.tsx`
- `apps/web/src/app/(lms)/aprender/_lib/learner-courses.ts`
- `apps/web/src/app/(lms)/aprender/_lib/short-titles.ts`
- `apps/web/src/app/(lms)/aprender/_lib/video-text.ts` e `video-text.test.ts` (novos)
- `docs/qa/lancamento/nomes-e-home.md` (este relatório)
- Banco (rascunhos e coluna `courses.title` dos 14 cursos), via script.

Observação: vários desses arquivos já tinham alterações não commitadas de outros trabalhos no mesmo diretório; editei por cima delas sem desfazer nada.

## Para publicar depois
Publicar os 14 cursos para que resumos, títulos de aulas e `document.title` cheguem ao aluno; refazer as capas; conferir o C03·A2 (título do brief × objetivo da aula).
