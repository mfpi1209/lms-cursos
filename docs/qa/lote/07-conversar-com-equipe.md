# Lote · 07 — Como conversar com colegas e gestores

- Curso: `crs_bmf11akamtxoti28` (slug `como-conversar-com-colegas-e-gestores`) · **publicado (versão 1)** · 1 módulo, 2 aulas, 4 vídeos, 3 decisões, 2 missões, 1 avaliação (~7,3 min)
- Alunos de teste matriculados: aluno@demo.local (`enr_jbjqtsnq7qo1m1iw`), aluna@demo.local (`enr_o1y7s7e5u8k5vjk4`)
- Roteiro: `docs/roteiros/lote/07_conversar_com_equipe.md` (cópia ajustada de `~/Downloads/07_conversar_com_equipe.md`)
- Instrutor: **Gustavo** · Seu orientador (novo; homem negro, 30, barba curta, camisa social azul-clara sem gravata)
- Voz: **Cirilo** (ElevenLabs, biblioteca pública, `1DXriIY2zhyCt1cj8onn`; masculina, médio-grave, firme e calma, sem jeito de locutor) — modelo `voz-cirilo`
- Estúdio 7 · paleta **invertida** (`branding.videoPalette = { base: "#FF7A08", accent: "#1D1E4C" }`)
- Scripts próprios: `packages/db/src/scripts/lote/07-gustavo-biblioteca.ts` (voz, instrutor, kit), `07-ajustes.ts` (paleta, kit no curso, rótulos), `07-gerar-gustavo.sh` (rosto, salvo pela sessão principal)

## Linha do tempo

1. Roteiro copiado e ajustado (ver "Ajustes no roteiro").
2. Voz escolhida na biblioteca pública (busca grátis) e registrada na hora (`voz-cirilo`), conferindo que nenhum outro modelo de voz usa o mesmo id.
3. Importado com `--kit estudio7-rafael` como base PROVISÓRIA (o Gustavo ainda não tinha câmeras): revisão 2; reimportado após ajustes (rev 3); paleta (rev 4).
4. Orçamento oficial (rota quote, sem custo) com a base provisória: 7 cenas, US$ 4,10 — mas 3 delas são as perguntas (q01–q03). Só os 4 vídeos V: **US$ 3,36**.
5. Usuário aprovou o rosto ("aprovo", nesta sessão). Rosto roda pelo comando único `apps/worker/src/scripts/lote-rostos.sh` (sessão principal).
6. Sessão principal registrou `instrutor-gustavo` + kit `estudio7-gustavo` (`07-gustavo-biblioteca.ts instrutor`) e aplicou o kit (rev 15). Conferido no rascunho: câmeras `cam_gustavo7_34/esq/dir`, elenco Gustavo · Seu orientador / Elisa / André, voz Cirilo (`1DXriIY2zhyCt1cj8onn`), pronome he, paleta invertida mantida.
7. Usuário aprovou produção e vídeos na sessão principal ("Produção e entrega. APROVO, depois ajustamos."); V00–V03 disparados pelo `lote-piloto.sh` da sessão principal (não por aqui).
8. Com os vídeos já na fila: rótulos da missão 2 acentuados (`07-ajustes.ts rotulos`, rev 15 → 16; só a missão, nenhuma cena gravada muda).
9. 4 vídeos prontos às 13:20–13:26 (rev 17–20, gravados pelo worker), 1 tentativa cada, ~5–7 min por vídeo.
10. Conferência quadro a quadro, prévia como aluno, área do aluno, alunos simulados.
11. **Publicado: versão 1** (rev 20). Matrículas: aluno@demo.local (`enr_jbjqtsnq7qo1m1iw`) e aluna@demo.local (`enr_o1y7s7e5u8k5vjk4`).

## Ajustes no roteiro

- "Eu sou a Marina, sua orientadora" → "Eu sou o Gustavo, seu orientador"; direção "do instrutor".
- Tirei o orientador da linha "Personagens de exemplo": o importador põe todo nome dessa linha no elenco como personagem fictício, e o instrutor ficaria duplicado.
- Corrigi "a pessoa consegue pede" → "consegue pedir" (objetivo final).
- Ponte: `Chamada:` em Q01, Q02, Q03 (≤ 16 palavras). A cena depois da resposta retoma servindo para qualquer escolha: V01 "Seja qual for a sua escolha, o que mais ajuda é…", V03 "Seja qual for a sua escolha, o objetivo é esclarecer o prazo, não provar quem errou." Q02 traz o André, que não tinha sido apresentado: V01 termina com "Agora vamos ver o André, que recebeu uma orientação com duas etapas."
- V01 tinha 132 palavras com a retomada (limite de fala 120): enxuguei para 116.
- **Cartões** (3 tópicos com negrito) em V00–V03: só "Texto na tela" não gera pílulas no vídeo. O roteiro dizia "sem cartões conceituais", mas a entrega do lote pede pílulas.

## O que funcionou sozinho

- Importador com kit: compila de primeira (0 erros), chamadas viram plano final `chamada` olhando para a lente, câmeras de zona alternadas, pílulas na lateral.
- Paleta por `branding.videoPalette` aceita direto no rascunho.
- Orçamento oficial pela rota quote, com teto diário e saldo.
- Alunos de teste: média 4,2; 5 de 5 recomendam; todos terminam em ~7,3 min.
- Kit do instrutor novo aplicado de uma vez (`applyTemplateToCourse`): 21 planos trocados para as câmeras do Gustavo na mesma zona, elenco e letreiro trocados, paleta preservada.
- Lote de vídeos: 4 de 4 na primeira tentativa, voz e câmeras certas, marca d’água, paleta invertida, legendas (CC), letreiro só no 1º vídeo de cada aula, pílulas sincronizadas com a fala.
- Publicação + matrícula pelo script `publicar-e-matricular.ts`, sem custo.

## Onde precisei contornar (achados para o motor)

1. **Instrutor novo exige curso antes do kit** (ovo e galinha): `novo-instrutor.ts` grava câmeras no RASCUNHO de um curso, e o kit só aceita câmeras prontas. Tive de importar com o kit de outro instrutor (Rafael) como base provisória, depois registrar instrutor + kit a partir do rascunho e aplicar o kit. Sugestão: `novo-instrutor.ts` gravar direto o modelo `presenter` (e o `kit`) na biblioteca, sem depender de curso.
2. **`--voice`/`--avatar-name` são ignorados com `--kit`**: `applyKitToDocument` roda depois e repõe voz/nome do kit. Ou recusar a combinação, ou aplicar as flags por último.
3. **"Texto na tela" não vira pílula**; só `Cartão:` vira. O formato do roteiro (e o prompt do GPT) sugere que "Texto na tela" basta.
4. **Orçamento inclui as perguntas** (q01–q03) mesmo com `Voz opcional: não`: o padrão do quote soma +US$ 0,74. Precisei filtrar por `nodeIds`. Sugestão: `Voz opcional: não` excluir a decisão do orçamento/lote.
5. **Personagens de exemplo**: o orientador listado ali entra no elenco como "personagem fictício" e duplica o instrutor.
6. **Simulador de alunos**: em decisões, conta as palavras de TODOS os feedbacks (o aluno lê só um) → "114 palavras para ler" em q01 é falso alarme.
7. Teto diário de mídia: restavam US$ 19,58 para 12 cursos (≈ 5 cursos de US$ 3,5).
8. **Rótulo da lacuna = nome do marcador sem acento**: `{mudanca}`/`{decisao}` viram o rótulo que o aluno lê ("Escolha mudanca:"). Mesmo achado do curso 01 (`previsao`). Corrigi no rascunho (`07-ajustes.ts rotulos`). Sugestão: o importador aceitar `{mudança}` ou acentuar o rótulo por dicionário.
9. **Descrição do curso** junta `Ideia` + "Público: …" + "Objetivo final: …" (todos os 14 cursos). O aluno lê no catálogo um texto de planejamento ("Objetivo final: Ao final, a pessoa consegue…"). Sugestão: usar só a `Ideia` como descrição e guardar público/objetivo no `brief`. Não mexi, para manter o lote igual.
10. **Rosto parou no meio por falta de crédito HeyGen** (`Insufficient credit… 'api' credits`, depois da base e antes da câmera esquerda). Rodar de novo retomou do ponto (não refez a base nem cobrou de novo) — bom. Sugestão: checar o saldo antes de começar e avisar quantos créditos faltam.
11. **Fim reprovado diz "Curso concluído"** ao lado de "Não foi dessa vez / Reveja as aulas" (o importador põe `outcomeLabel: "Curso concluído"` nos dois fins). Mesmo achado de 02 e 04. Não mexi.
12. **Título da pergunta cortado na última frase** (como no 05): "A pessoa está em reunião. Como você pede orientação?" vira título "Como você pede orientação?" e o cartão gravado diz "Como você pede orientação?" / "O que você confirma?" / "Como apresenta a diferença?". Aqui ficou legível; na avaliação "Você entendeu dois prazos diferentes. Como abordar?" vira só "Como abordar?" com a primeira frase embaixo do resultado anterior.
13. **Avaliação mostra "RESULTADO DA AVALIAÇÃO · Não foi dessa vez" no topo da pergunta seguinte** (resultado da pergunta anterior). Parece o resultado da prova inteira. Sugestão: "Pergunta 1: …".
14. **Acessibilidade:** os botões de opção da avaliação têm nome "a", "b", "c" no leitor de tela (o texto da opção não é o rótulo).
15. **Aviso de publicação no feminino:** `REACTION_MISSING` diz "sem reação da instrutora" com instrutor homem (pronome `he`).
16. Q02 pergunta "o que o **André** confirma" e as opções estão em 1ª pessoa ("Eu repito a ordem…"). Funciona como "no lugar dele", mas a chamada podia dizer "no lugar do André". Não mexi (fala já gravada).

## Custo

| Item | Estimado | Real |
|---|---|---|
| Rosto do Gustavo (1 personagem + base + 3 câmeras) | ~4 créditos HeyGen | 4 looks prontos (2 rodadas: a 1ª parou por falta de crédito, a 2ª retomou) — o motor não registra o gasto real |
| Vídeos V00–V03 | US$ 3,36 (orçamento oficial) | US$ 3,36 estimado por job (0,80 + 0,97 + 0,76 + 0,83); `cost_actual_usd` vazio, 0 refeitos |
| Perguntas Q01–Q03 | US$ 0 (só texto) | US$ 0 |

Dentro do teto do curso (US$ 4).

## Conferência dos vídeos (12 quadros por vídeo + quadro final + momentos das pílulas)

| Vídeo | Duração | Rosto / câmera | Letreiro | Pílulas | "Pergunta que vem a seguir" | Marca d'água / cores |
|---|---|---|---|---|---|---|
| V00 | 35,6 s | Gustavo 3/4 → lateral com parede livre → chamada de frente | "Gustavo · Seu orientador · DNA Work" | Assunto · Prazo · Canal | "Como você pede orientação?" | ok / ok |
| V01 | 43,6 s | 3/4 + lateral | — (2º vídeo da aula) | Um ponto · Confirme · Seu jeito | "O que você confirma?" | ok / ok |
| V02 | 33,3 s | 3/4 + lateral | "Gustavo · Seu orientador · DNA Work" | Fatos · Escute · Alinhamento | "Como apresenta a diferença?" | ok / ok |
| V03 | 39,9 s | 3/4 + lateral + close | — | Prioridade · Novo combinado · Apoio | — (segue a missão) | ok / ok |

- Mesma pessoa em todos os planos (pele, barba curta, camisa social azul-clara sem gravata), boca nítida, estúdio 7 com o logo DW na parede.
- Pílulas acendem quando ditas (conferido quadro a quadro em "Apoio", V03 ~29 s). Paleta invertida: véu laranja, título e ícones roxo-marinho; letreiro e cartão da pergunta em laranja com texto marinho.
- Voz: os 4 jobs usaram `1DXriIY2zhyCt1cj8onn` (Cirilo) e as câmeras `cam_gustavo7_*`; volume parecido (média −21,7 a −23 dB, pico −4,2 dB), sem silêncio > 1,5 s. As palavras com tempo do alinhamento ElevenLabs batem 100% com o roteiro de cada cena (95/116/89/97 palavras). Não foi transcrição independente do áudio final.

## QA como aluno

- **Prévia (navegador):** Aula 1 — pular V00 → Q01 escolha fraca → cartão "Sua escolha" com "Faça assim…" antes do V01 → Q02 forte → M01 montada (frase completa) → "Aula concluída" + "Meu roteiro" com a frase. Aula 2 — Q03 fraca → V03 → M02 pulada (rótulos "mudança"/"decisão" já corretos) → avaliação: Q1 errada 2×, Q2 certa, Q3 errada 2× → `fim_aula_02_revisar` ("Você acertou menos de 2 de 3… Reveja as aulas").
- **Rotas no rascunho:** toda escolha leva a uma cena, nenhuma cena inalcançável, as duas aulas chegam a um fim; o fim aprovado (≥ 2 acertos) foi conferido pelo grafo, não clicado.
- **Texto:** todo texto do aluno revisado. Nada de futsal, CIEE, IEL, slogan, Marina ou Rafael. O título em minúsculas na barra é estilo da página (`text-transform`), o dado está certo.
- **Área do aluno (aluno@demo.local, HTTP):** `/aprender`, a página do curso e as duas aulas respondem 200 com o Gustavo; os vídeos e as legendas são servidos ao aluno (`/api/assets/…`, 206 video/mp4 e text/vtt).
- **Alunos simulados:** notas 4, 4, 4, 4, 5 (média 4,2); 5 de 5 terminam as 2 aulas em ~7,3 min e recomendam. Queixa: "texto demais" em Q01/Q02 (114/109 palavras), falso alarme do achado 6.
- **Avisos da publicação (6):** `MEDIA_MISSING` e `REACTION_MISSING` em Q01–Q03, esperados (perguntas só em texto pelas regras do lote).

## Pendências

- Nenhuma do curso. Para o motor: os achados 1–6 e 8–15 acima.
