# Lote 02 · "Que roupa eu uso para trabalhar?" (2026-10-30)

**Curso:** `crs_arbeohlw3xp5v3zx` (slug `que-roupa-eu-uso-para-trabalhar`), **publicado** na versão 1 (rascunho rev 20).
**Instrutora nova:** Camila · Sua orientadora, no estúdio 6, voz **Juliana (ElevenLabs)** `nczLZ6GvJGozyc3FlLte`, paleta **clássica** (`{ base: "#1D1E4C", accent: "#FF7A08" }`).
**Alunos de teste matriculados:** aluno@demo.local (`enr_3uf3170xr0txved6`) e aluna@demo.local (`enr_m7xj35lakal6jfdo`).
**Roteiro de trabalho:** `docs/roteiros/lote/02_roupa_no_trabalho.md` (cópia de `~/Downloads/02_roupa_no_trabalho.md`).

## Custo

| Item | Custo | Quem disparou |
|---|---|---|
| Visual da Camila: 1 personagem + 3 câmeras no estúdio 6 (HeyGen) | ≈ 4 créditos HeyGen | o autor, no Terminal (`02-gerar-camila.sh`) |
| Voz Juliana adicionada à conta ElevenLabs | grátis | mesmo comando |
| 4 vídeos V00–V03 (153 s) | **US$ 3,22** (orçamento oficial `mqt_20xr1xou5zcxc3ny`; custo real ainda não gravado nos jobs) | sessão principal (`lote-videos.sh`, aprovação do autor na sessão principal) |
| Perguntas Q01–Q03 | US$ 0 (só texto, como manda o lote) | — |

Dentro do limite de US$ 4 por curso. Nenhum vídeo foi regravado.

## Biblioteca (novos modelos no workspace `wsp_eogwtp01f358wyof`)

- `voz-juliana` (voice): feminina jovem e acolhedora, feita para cursos ("bright and encouraging"), com amostra pública e dono da biblioteca.
- `instrutor-camila` (presenter): mulher negra, 27 anos, cabelo cacheado volumoso, blazer bege leve sobre blusa branca. Personagem fictício criado só por texto (`baseLookId 0983d061a66dec1c6c6720522afe6f24`). Câmeras prontas no `estudio-jovem-6`: `cam_camila6_esq`, `cam_camila6_dir` e `cam_camila6_34`, todas com avatar_iv/avatar_v.
- `estudio6-camila` (kit): estúdio 6, Camila, voz Juliana, marca DNA Work, direção com zonas e pílulas, as 8 regras e os 5 alunos de teste.

Scripts meus em `packages/db/src/scripts/lote/`:
- `02-roupa-biblioteca.ts` (+ `-dados.ts`): grava voz, instrutora e kit (`voz | instrutora | kit --course …`).
- `02-gerar-camila.sh`: só passa as variáveis ao `gerar-instrutor.sh` oficial. Agora não faz nada (sem custo) se o kit já tem as 3 câmeras.
- `02-matricular.ts`: matricula os alunos de teste.

## Ajustes no roteiro (antes de gravar)

- Marina virou Camila na fala do V00, nos personagens e na direção. O Rafael de 17 anos continua só como personagem.
- Ponte com o aluno: `Chamada:` em Q01, Q02 e Q03. O motor grava a chamada como plano final do vídeo anterior (V00, V01 e V02), na câmera lateral.
- Retomada que serve para qualquer escolha: V01 começa com "Seja qual for a sua escolha, o passo mais seguro é confirmar antes." e V03 com "Qualquer que tenha sido a sua resposta, vale lembrar: uma conversa curta resolve muito."
- Depois da gravação, só ajustes de texto, sem custo: letreiro em texto `Roupa no trabalho` e rótulo da lacuna `orientação` (com acento).

## Conferência dos vídeos (quadro a quadro, 1 quadro a cada 3 s)

| Vídeo | Duração | Rosto/câmeras | Voz | Letreiro | Pergunta a seguir | Marca d'água | Cores | Pílulas |
|---|---|---|---|---|---|---|---|---|
| V00 | 33 s | 3/4 + lateral na chamada, Camila igual | Juliana, -23,6 dB | sim, "Camila · Sua orientadora · DNA Work" | "Qual informação ajuda você a escolher?" | sim | clássica | **não** |
| V01 | 38 s | lateral esquerda o vídeo todo | Juliana, -24,1 dB | — | **"E agora?"** (cortada) | sim | clássica | **não** |
| V02 | 34 s | 3/4 + lateral na chamada | Juliana, -24,5 dB | sim | **"O que diz?"** (cortada) | sim | clássica | **não** |
| V03 | 38 s | lateral esquerda o vídeo todo | Juliana, -25,1 dB | — | — (vem a missão) | sim | clássica | **não** |

A sincronia labial está boa, a identidade da Camila é a mesma em todas as câmeras e não há texto inventado nem slogan. Detalhe pequeno: na câmera 3/4 aparece um tripé de luz na borda esquerda.

## QA como aluno

- **Prévia (estúdio):** testei a aula 1 com uma escolha fraca (Q01) e uma forte (Q02), montando a frase da missão. Na aula 2 escolhi a resposta ok (Q03), pulei a missão e errei a avaliação de propósito (2 tentativas por pergunta). O resultado foi "Não foi dessa vez", com o roteiro entregue. "Sua escolha" + feedback aparece **antes** do vídeo seguinte.
- **Mapa:** todas as escolhas levam à próxima cena; todo nó chega a um fim (aula 1: `fim_aula_01`; aula 2: `fim_aula_02` ou `fim_aula_02_revisar`).
- **Busca no documento:** futsal 0, CIEE 0, IEL 0, Marina 0, slogan 0.
- **Área do aluno** (aluna@demo.local): `/aprender` lista o curso e as duas aulas abrem. Vídeos e legendas (VTT) respondem 206/200 para a aluna.
- **Alunos de teste (simulação, sem custo):** Ana Clara 4, Beatriz 4, Diego 4, Jéssica 4, Kauã 5; todos terminam em ~7,2 min.

## O que o motor fez sozinho

- Importou o roteiro (formato do lote, com `Chamada:`) sem erros: 2 aulas, 3 decisões, 2 missões e a avaliação "2 de 3" com 2 tentativas.
- Gravou voz, instrutora e kit na biblioteca e aplicou o kit pela rota `POST /api/courses/:id/library`, com resumo claro das mudanças.
- O orçamento oficial respeitou o filtro `nodeIds` e mostrou o teto do dia.
- A ponte com o aluno entrou como plano final nos 3 vídeos certos; o letreiro saiu só na primeira cena de cada aula.
- Publicação pela rota `POST /api/courses/:id/publish` (os avisos MEDIA_MISSING são só as perguntas sem voz).

## Onde precisei contornar (achados para o motor)

1. **`novo-instrutor.ts` tinha pronome `'he'` fixo** nos pedidos de câmera e a descrição do estúdio 7 como padrão. Avisei a sessão principal, que corrigiu (`PRONOUN`, `ESTUDIO`, `CAM_PREFIX`).
2. **Importador com `--kit` ignorava `--presenter/--voice`:** o `applyKitToDocument` rodava depois das flags. Importei com o kit da Marina e troquei depois. A sessão principal diz que já corrigiu.
3. **Não há rota para "reaplicar a direção"** quando o instrutor/kit muda. Aplicar o kit troca as câmeras da apresentação, mas os planos das cenas continuam com `cam_j7_*` (Marina). Contornei reimportando o roteiro com `--kit estudio6-camila`, o que só é possível antes de haver vídeo pago. Sugestão: o "Usar neste curso" do kit deveria remapear `shot.cameraId` por zona (esq/dir/3/4).
4. **Reaplicar o kit tira a câmera base do rascunho**, e o `gerar-instrutor.sh` decide se cria o personagem olhando o rascunho. Rodar de novo (ex.: pelo `lote-rostos.sh`) poderia **recriar e cobrar** o personagem. Contornei com uma checagem no meu `.sh`. Sugestão: o script deveria olhar também `library_templates` (`baseLookId` do presenter).
5. **O personagem do roteiro vira elenco duplicado:** a linha "Personagens… Camila, orientadora virtual da DNA Work" criou uma "Camila · Personagem de exemplo" além da instrutora. Removi pelo rascunho. Sugestão: o importador deveria ignorar o nome do instrutor do kit nessa linha.
6. **"Texto na tela" não vira pílula.** O motor só põe pílulas quando a cena tem `Cartão:`. Este roteiro diz "texto na tela sem cartões conceituais", então os 4 vídeos ficaram sem pílulas e V01/V03 têm a parede livre vazia o vídeo todo. Sugestão: com estúdio de zonas, usar as palavras de "Texto na tela" como pílulas, ou avisar na importação que não haverá pílulas.
7. **Cartão "Pergunta que vem a seguir" corta a pergunta:** `decisionQuestion` pega só a última frase com "?". Q02 ("A orientação mudou de uma área para outra. E agora?") saiu como **"E agora?"** e Q03 como **"O que diz?"**. O texto está gravado no vídeo. Sugestão: usar o título inteiro quando a última frase tiver menos de ~4 palavras. Se a sessão principal quiser, uma remontagem sem custo resolve depois de ajustar o texto.
8. **"Voz opcional: não" não é respeitado** no orçamento padrão nem na validação: as perguntas entram no orçamento (+US$ 0,71) e aparecem como MEDIA_MISSING ao publicar. Usei `nodeIds` só dos V.
9. **Rótulo de lacuna sem acento:** `{orientacao}` virou o rótulo "orientacao" na tela, mas `{proximo}` virou "próximo". Corrigi no rascunho.
10. **Letreiro em texto com "?" ganha ponto:** "Que roupa eu uso?" aparecia como "que roupa eu uso?." Troquei por "Roupa no trabalho".
11. **Matrícula pela API exige administrador** (o autor de teste não é). Matriculei pela função `enrollStudent` num script meu, como faz o `--enroll-demo`.
12. Menores: na avaliação, a pergunta com duas frases mostra só a última no título ("Qual é o melhor passo?" / "O que fazer?") e a primeira frase vai para baixo do resultado da anterior. No fim reprovado aparece também "Curso concluído". A missão pulada mostra "Monte na aula 2" estando na aula 2.

## Teto diário

Na hora do orçamento havia US$ 30,42 gastos e US$ 19,58 livres no teto de US$ 50. Avisei a sessão principal de que ~US$ 3,2 por curso não cabe nos 11 cursos restantes no mesmo dia.
