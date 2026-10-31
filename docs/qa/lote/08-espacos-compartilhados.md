# Lote 08: Espaços compartilhados (você não está sozinho)

Status: **publicado** (versão 1, revisão 18, 30/10). Alunos de teste matriculados (`aluno@demo.local`, `aluna@demo.local`). Vídeos V00–V03 gravados com a Aline e conferidos.

- Curso: `crs_8g0csi2hflfztfge` (slug `espacos-compartilhados-voce-nao-esta-sozinho`), workspace `wsp_eogwtp01f358wyof`
- Roteiro trabalhado: `docs/roteiros/lote/08_espacos_compartilhados.md` (cópia de `~/Downloads/08_espacos_compartilhados.md`)
- Instrutora: **Aline** (Sua orientadora). Personagem fictícia: mulher de ascendência asiática, 29 anos, cabelo chanel, blusa off-white com cardigã coral. Estúdio 6. Câmeras `cam_aline6_esq|dir|34` (base `cam_aline_base`).
- Voz: **Ana Alice (ElevenLabs)**, `ORgG8rwdAiMYRug8RJwR` (biblioteca pública, "Friendly & Clear", pt-BR).
- Biblioteca: `voz-ana-alice` (voice), `instrutor-aline` (presenter), `estudio6-aline` (kit).
- Paleta: clássica, `branding.videoPalette = { base: "#1D1E4C", accent: "#FF7A08" }`
- Scripts meus (`packages/db/src/scripts/lote/`): `08-biblioteca-aline.ts` (`voz` | `instrutor` | `aplicar`), `08-caminhos.ts` (todos os caminhos), `08-rotulos.ts` (acentos das missões), `08-matricular.ts` (alunos de teste). `08-gerar-aline.sh` foi salvo pela sessão principal.

## Linha do tempo

1. Li `docs/lote-12-cursos.md`, `docs/biblioteca-de-modelos.md`, os scripts do instrutor e as notas da pasta compartilhada.
2. Escolhi a voz pela busca grátis `/v1/shared-voices` (feminina, pt-BR) e conferi `library_templates`: ninguém tinha pego. Gravei `voz-ana-alice` na hora.
3. Ajustei o roteiro (ver abaixo) e importei com `--kit estudio7-marina` como base provisória. Revisão 2, 2 aulas, 12 cenas, 3 decisões, cerca de 7,5 min, 0 erros, 7 avisos `MEDIA_MISSING`.
4. Passei o comando do rosto (`gerar-instrutor.sh`, `PRONOUN=she`, `ESTUDIO=6`). A sessão principal o salvou em `08-gerar-aline.sh` e o rodou no lote de rostos.
5. Orçamento oficial (rota quote, base provisória, só `v00..v03`): **US$ 3,36** (38 + 42 + 38 + 42 s).
6. Simulação dos alunos de teste (grátis): média 4,2; 5 de 5 recomendam; todos terminam em 7,4 min.
7. Rostos, 1ª tentativa (12:29): o HeyGen recusou o personagem base por falta de créditos de **API** (`Insufficient credit`), sem cobrança. A voz Ana Alice entrou na conta e no rascunho.
8. Rostos, 2ª tentativa (12:31, depois de nova compra): personagem base pronto; câmeras esquerda e direita disparadas; a 3/4 parou de novo por falta de créditos.
9. 12:34, `lote-piloto.sh` (sessão principal): a 3/4 saiu; rodou meu `08-biblioteca-aline.ts instrutor` (`instrutor-aline` e `estudio6-aline` criados) e aplicou o kit com `aplicar-kit.ts` + paleta clássica (revisão 12 → 13). **O motor trocou sozinho os 21 planos para as câmeras da Aline na mesma zona** e trocou o letreiro (Marina → Aline). Meu passo `aplicar` não foi preciso.
10. 13:14, lote de vídeos: orçamento oficial de novo US$ 3,36 (modo real); aprovação do usuário repassada pela sessão principal ("Produção e entrega. APROVO, depois ajustamos."). Os 4 vídeos ficaram prontos entre 13:23 e 13:29.
11. Conferência quadro a quadro, QA (motor, prévia e área do aluno), correção dos rótulos das missões (revisão 17 → 18), publicação (versão 1) e matrícula dos alunos de teste.

## Ajustes no roteiro (antes de gravar)

- "Marina" → "Aline" (fala de V00, personagens, direção da instrutora). "Eu sou a Aline, sua orientadora…"
- Erro do original: na Q01 as qualidades estavam trocadas. "Retiro minhas coisas e deixo a caneca separada" estava como **forte**, com feedback de resposta parcial. "Limpo o que usei e pergunto onde guardar" estava como **ok**, com feedback de resposta completa. Troquei: limpar + perguntar = forte; retirar e deixar separada = ok.
- Cabeçalho: "consegue organiza … e comunica" → "consegue organizar … e comunicar".
- Ponte com o aluno: `Chamada:` em Q01, Q02 e Q03 ("Agora é com você: o que você faria no lugar do Luan / da Sara?").
- Retomadas: V01 começa com "Seja qual for a sua escolha, o caminho é parecido…" e V03 com "Qualquer que tenha sido a sua escolha, vale guardar isto: … o mais seguro é não usar e avisar quem pode resolver".
- V01 entregava a resposta da Q02 que vem logo depois. Tirei a frase e troquei por uma ponte para a situação da Sara. O ponto continua no feedback da Q02, no "O que você levou" e na avaliação.
- V00 e V02 terminam apresentando a situação que vem a seguir (Luan na copa; Sara com o cabo danificado), com leveza ("Tudo bem, isso se aprende").
- Depois de gravar (sem reimportar): rótulos das lacunas das missões com acento, `espaco` → "espaço" e `orientacao` → "orientação" (`08-rotulos.ts`).

## Conferência dos vídeos (quadro a cada 3 s + quadro final)

| Vídeo | Duração | Câmeras | Letreiro | "Pergunta que vem a seguir" | Marca d'água / cores |
|---|---|---|---|---|---|
| V00 | 38,9 s | 3/4 + frontal à esquerda na chamada | "Aline · Sua orientadora · DNA Work" | "O que faz?" | ok / ok |
| V01 | 43,8 s | só frontal à esquerda | — (2º vídeo da aula) | "Você pode pegar?" | ok / ok |
| V02 | 39,5 s | 3/4 + frontal à esquerda | "Aline · Sua orientadora · DNA Work" | "O que faz?" | ok / ok |
| V03 | 43,9 s | só frontal à esquerda | — | — (segue a missão) | ok / ok |

- **Rosto:** a mesma pessoa em todos os planos (cabelo chanel preto, cardigã coral, blusa off-white), boca nítida, estúdio 6 com o logo DW na estante.
- **Voz:** os 4 jobs usaram `ORgG8rwdAiMYRug8RJwR` (Ana Alice) e só câmeras `cam_aline6_*`. Volume parecido (média −23,8 a −24,5 dB, pico −5,1 a −5,7 dB).
- **Cores:** paleta clássica. O cartão da pergunta e o letreiro são roxo-marinho, com o título da pergunta em laranja. Marca d'água DNA WORK no rodapé direito.
- **Pílulas:** não há nos vídeos, como esperado, porque o roteiro não tem `Cartão:`. O "Texto na tela" aparece no player, abaixo do vídeo, como etiquetas ("Espaço · Cuidado · Próxima pessoa").

## QA como aluno

- **Todos os caminhos no motor** (`08-caminhos.ts`): aula 1 com 9 caminhos, todos em `fim_aula_01`; aula 2 com 1.029 caminhos (624 em `fim_aula_02_revisar`, 405 em `fim_aula_02`). Nenhuma cena fica de fora.
- **Prévia (navegador):**
  - **Aula 1:** pulei o V00, escolhi a fraca na Q01 e recebi o cartão "Sua escolha" com "Faça assim…" antes do V01. Na Q02 escolhi a forte. Montei a frase da M01 (rótulo "Escolha espaço:" já certo). Terminou em "Aula concluída", com o roteiro e a frase.
  - **Aula 2:** escolhi a fraca na Q03, com o retorno certo antes do V03. Pulei a M02 (rótulo "orientação" certo). Na avaliação acertei as 3 e cheguei a "Aula concluída · Curso concluído".
  - **Enunciado:** o enunciado completo aparece no player. A situação e a chamada ("Agora é com você…") ficam abaixo do título curto.
- **Texto:** nada de futsal, CIEE, IEL, slogan, Marina, Rafael ou Gustavo no rascunho.
- **Área do aluno (`aluno@demo.local`, HTTP):** `/aprender` lista o curso. A página do curso e as duas aulas respondem 200 com a Aline. Os vídeos são servidos ao aluno (`/api/assets/…`, 206 video/mp4).
- **Alunos simulados (revisão 18):** média 4,2; os 5 terminam as 2 aulas em cerca de 7,4 min e recomendam. A queixa "texto demais" em Q01/Q02 é o falso alarme do achado 2.
- **Avisos da publicação (6):** `MEDIA_MISSING` e `REACTION_MISSING` em Q01–Q03. São esperados: pelas regras do lote, as perguntas ficam só em texto.

## O que funcionou sozinho

- Importação do Markdown com kit: estrutura, decisões, missões (montar frase), avaliação 2 de 3 com duas tentativas e dois encerramentos, sem erro de compilação.
- `Chamada:` virou plano final próprio na câmera frontal, e o card "Pergunta que vem a seguir" saiu no fim de V00, V01 e V02.
- Aplicar o kit num curso já montado: o motor trocou sozinho os 21 planos para as câmeras da Aline na mesma zona e trocou o letreiro (correção da sessão principal de 30/10).
- `gerar-instrutor.sh` continua do ponto onde parou sem pagar de novo: a 3ª tentativa só gerou a câmera 3/4.
- Orçamento oficial pela rota quote, com teto de 24 h; gravação em lote; paleta pelo `branding.videoPalette`.
- Prévia, área do aluno, simulação de alunos e publicação com troca de matrículas (`publicar-e-matricular.ts`).

## Onde precisei contornar / achados do motor

1. ~~Aplicar um kit não troca as câmeras dos planos já dirigidos.~~ **Corrigido pela sessão principal em 30/10.** No curso 08, o motor trocou sozinho os 21 planos. Meu passo `aplicar` ficou só como reserva.
2. **O simulador conta os feedbacks de todas as alternativas como texto na tela.** `nodeScreenWords` soma os três feedbacks de uma decisão, mas o aluno só vê o da escolha dele. Isso gera um falso "TOO_MUCH_TEXT" na Q01 (119 palavras) e na Q02 (109), com nota 4 em vez de 5. Sugestão: contar só o enunciado, as alternativas e o feedback mais longo.
3. **Título curto repetido no card do vídeo.** O card "Pergunta que vem a seguir" usa a última frase do título da cena. Q01 e Q03 aparecem os dois como "O que faz?", e o simulador mostra o mesmo título curto. No player o enunciado completo aparece, então não é erro, mas o card fica genérico. Sugestão: um campo `Pergunta curta:` no roteiro, ou um aviso quando dois cards ficarem iguais.
4. **O instrutor novo precisa de um rascunho com alguma apresentação antes.** Usei o kit da Marina como base provisória. Sugestão: permitir criar o instrutor direto na biblioteca, sem curso.
5. **Rótulo da lacuna sem acento.** O importador usa o id da lacuna como rótulo ("Escolha espaco:", "orientacao"). Corrigi no rascunho com `08-rotulos.ts`, igual ao curso 05. Sugestão: o importador aceitar um rótulo (`{espaço|espaco}`) ou pôr o acento a partir de uma lista de palavras.
6. **Sem aviso de saldo antes do lote de rostos.** O `gerar-instrutor.sh` só descobre a falta de créditos de API do HeyGen na hora de gerar, e o lote segue tentando os próximos. Sugestão: checar o saldo de créditos `api` no começo do lote e dizer quantos instrutores cabem.
7. **Planos sem variedade em V01 e V03.** Esses dois vídeos ficaram inteiros na câmera frontal à esquerda; a câmera da direita não foi usada em nenhum vídeo. Não é erro, mas fica parado. Sugestão: a direção alternar as zonas em vídeos com mais de 30 s.
8. **Sem `Cartão:` não há pílulas no vídeo.** O "Texto na tela" só aparece no player. Para ter pílulas, o roteiro precisa de `Cartão:`.

## Custo

- **Rosto da Aline:** cerca de 4 créditos de API no HeyGen (base + 3 câmeras). A 1ª tentativa foi recusada sem cobrança.
- **Vídeos:** **US$ 3,36** (orçamento oficial; jobs: v00 0,79 + v01 0,88 + v02 0,80 + v03 0,88). Dentro do teto do curso (US$ 4).
- **Voz:** grátis (biblioteca pública ElevenLabs).
- **Total em vídeo:** **US$ 3,36**.
