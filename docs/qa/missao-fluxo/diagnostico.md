# Diagnóstico: a missão "entra abruptamente" e o avatar não fecha o curso

Data: 01/11/2026. Feito com o robô aluno (`tools/robo-aluno`), só conta `aluna@demo.local`. Nada foi editado nos cursos nem no código do app. As capturas estão nesta pasta.

> Queixa do dono, literal: "a missão entra abruptamente e o avatar não termina depois com um feedback ou encerramento do curso"

---

## 1. Resumo

**A queixa procede, e não por causa de bug.** O fluxo técnico funciona em todos os percursos. O problema é que **ninguém "apresenta" as duas passagens** e o fim do curso **não se parece com fim de curso**:

1. **Vídeo da explicação → missão.** O vídeo termina falando a missão (a frase final de cada v05 leva ao assunto). Depois vem silêncio, uma imagem parada da avatar e um cartão genérico "A SEGUIR + título do vídeo que acabou de passar + 'Sua escolha' repetido + Continuar". Ao tocar Continuar, a missão aparece em **0,07 a 0,13 s** (corte seco, sem animação), um cartão escuro-centralizado com **160 a 230 palavras**. Nada na tela anterior diz "a próxima etapa é sua missão".
2. **Depois do toque na missão.** Aparece uma confirmação pequena dentro do mesmo cartão ("Missão registrada…" ou "Anotado. Essa missão fica em Missões para depois."), com botão **"Continuar aula"**. A despedida começa **sozinha, 0,05 a 0,12 s depois**, sem nenhuma fala ou texto de transição. Ela **não reconhece** o que a pessoa escolheu, e o botão ("Continuar aula") sugere que ainda há aula.
3. **A despedida parece só mais um vídeo.** Mesmo cenário, mesma barra de etapas ("4 de 5 etapas", ícone de vídeo igual ao dos outros), mesmo título pequeno no topo (o da aula), sem legenda ligada e sem rótulo "Fechamento". Das 10 despedidas de C02 a C11, **só a do C01 se despede de verdade**. As outras terminam em recado de aula ("Faça as duas.", "E qual falta?", "Até a próxima.").
4. **A tela final não comemora o curso.** O título é **"Meu roteiro"**. O chip principal (laranja) diz **"Aula concluída"**; "Curso concluído" aparece como chip cinza secundário. Há um cartão "Conquista · Curso concluído · {curso}" (bom), mas **sem celebração**, e a frase de fecho do curso (ex.: "Margem não é chute…") fica **no fim da página, depois do roteiro inteiro** (~1.800 px abaixo no desktop). Antes da tela final há a vinheta DNA Work de 4 s, com som.

Nada travou, nada tocou em dobro, a despedida **nunca foi pulada** (46 percursos completos, 4 cursos x desktop e celular, 3 caminhos; mais C01 e C06 no desktop).

---

## 2. Como medi (e o que não deu para medir)

- Robô em Playwright (Chromium headless), vídeos a **2x**, com um amostrador novo a cada 80 ms (tela, nó, fase, vídeos, botões visíveis, região viva, rolagem) e capturas na chegada de cada tela e em rajada logo após cada toque. O robô e o amostrador desta rodada estão só no meu espaço temporário; o repositório não foi alterado.
- Cursos: **C02, C05, C08, C11** (desktop 1440x900 e celular 375x812), nos caminhos "Vou fazer depois", "Já experimentei" **sem nota** (campo esvaziado) e "Já experimentei" **com nota**. Extra: **C01** e **C06** (desktop, caminho com nota).
- Tempos de interface (cliques, confirmação, autoplay) **não dependem** dos 2x. Duração dos vídeos vem dos arquivos (1x).
- **Limite 1: a conta da aluna já tinha missões registradas ("Já experimentei") em todos os cursos.** Por isso, na chegada, a missão aparece como **revisita**: formulário já aberto, nota pré-preenchida e rolagem no meio do cartão (ver d02b). Escondi a etiqueta "Você marcou…" nas capturas. Para ver a primeira chegada ("aberta", com os dois botões) uso a captura depois de tocar em "Voltar" (d03). **A primeira visita real de uma pessoa nova não foi observada**; se o dono já testou essas aulas, ele provavelmente viu a revisita.
- **Limite 2: o player está sendo editado agora** (`immersive-player.tsx`, 835 linhas a mais que o último commit, mexido entre 08:10 e 08:30). Uma das minhas rodadas de celular caiu com o servidor recompilando (`fullscreen is not defined`) e foi refeita. Números de linha abaixo valem para as 08:30 e vão andar.
- O robô registrou o erro "Cannot read properties of null (reading 'appendChild')" em todas as rodadas: é do meu estilo injetado (esconder a etiqueta), não do app.

---

## 3. Linha do tempo medida (igual nos 4 cursos, desktop e celular)

| # | Momento | O que a pessoa vê e ouve | Medida |
|---|---|---|---|
| 1 | Fim do v05 | Júlia/Camila/Aline/Renata falam a frase que leva à missão (7 a 10 s) e o vídeo **corta na última palavra** (sem respiro: o fim da legenda coincide com o fim do arquivo). Fica a imagem parada. Cartão: **"A SEGUIR · {título do vídeo que acabou}"**, "Sua escolha" (repetido da pergunta) e **Continuar** (d01, m01). | Não avança sozinho. Espera o clique. |
| 2 | Clique em Continuar | O botão vira "Enviando…" por 1 quadro. | **0,07 a 0,13 s** até a missão (d02). |
| 3 | Chegada da missão | Fundo escurecido, cartão central: "LEVE PARA A VIDA REAL", título específico, frase de gancho ("O Lucas calculou…"), "O que fazer" (3 a 5 passos), "Se você ainda não trabalha", exemplo, dois botões (d03, m02, m03). Corte seco, sem fade, sem som. | 160 a 232 palavras (C06 158, C02 232). Desktop: botões visíveis sem rolar (y 667 a 723 de 900). Celular: página de 1.630 a 1.900 px, mas a barra de botões é fixa. |
| 4 | Toque em "Vou fazer depois" ou "Salvar e continuar" | O botão vira "Salvando…" e aparece o quadro de confirmação no fim do cartão (d04, d05, d06, m04, m05). | **0,64 a 1,13 s** (desktop 0,67 a 1,13 s; celular 0,64 a 0,88 s). |
| 5 | "Continuar aula" | A despedida começa sozinha, em tela cheia, sem título (d07, d08, m06). Volume do vídeo sobe de 0 a 1 nos primeiros segundos. | **0,05 a 0,12 s**. Nunca pediu "Assistir". |
| 6 | Fim da despedida | Corte direto (**0,07 s**) para a vinheta DNA Work (4 s, com áudio) (d09, m07). Tem "Pular". | 4,0 s |
| 7 | Tela final | "Meu roteiro" + "Aula concluída" + "Curso concluído" + conquista, "O que você levou", botões; roteiro e frase de fecho embaixo (d10, d11, d12, m08, m09). Sem animação. | Entra quando a vinheta termina (4 s). |

Tempo real da cauda, do fim do v05 ao fim: fala de ponte 7 a 10 s + tempo de ler a missão (cerca de 1 min, estimativa por palavras) + 1 s + despedida 22 a 25 s + vinheta 4 s.

---

## 4. Respostas às perguntas

### 4.1 Vídeo da explicação → missão

- **Existe ponte falada?** Sim, e boa. Todos os v05 de C02 a C11 terminam mandando a pessoa para a missão, e o assunto bate com o título da missão (C05: "Faça o caminho… Anote quanto deu." → "Cronometre o seu trajeto"; C08: "Deixe pronto e, se achar um problema, avise assim."; C11: "Repita, teste com um caso, e veja o que muda."; C02: "escolha um lugar onde gostaria de trabalhar… anote uma dúvida. Depois, volte e conte."). **Existe ponte visual? Não.** O cartão do fim do vídeo diz "A SEGUIR" mas mostra o **título do vídeo que acabou** (o código usa `eyebrow: 'A seguir'` sempre que há retorno de escolha, `NodePanel`, linha ~1816) e repete "Sua escolha". O próximo passo (a missão) não é nomeado, nem no botão ("Continuar").
- **Quanto dura o vão?** Não há vão técnico: do clique à missão são 0,1 s. O que é abrupto é o **corte de conteúdo**: sai uma avatar parada e um cartão de resumo, entra um cartão grande e denso, escuro-centralizado, sem transição.
- **A finalidade fica clara na chegada?** Em parte. O cabeçalho "LEVE PARA A VIDA REAL" + título específico + frase de gancho (que cita o personagem do curso) funcionam bem. Falta dizer que **é a última prática do curso**, que **acontece fora da plataforma** e que **pode ficar para depois**. Essa última frase ("Você termina a aula de qualquer jeito…") só aparece embaixo dos botões, em letra de 14 px (d03).
- **Revisita:** quem já registrou a missão chega com o formulário aberto, a nota antiga preenchida e a página **rolada para o meio do cartão** (rolagem 476 px no desktop, 1.016 no celular): o título e o gancho ficam fora da tela (d02b). Causa provável: `MissionPanel` abre em `reporting` e foca o campo sem `preventScroll` (`noteRef.current?.focus({ preventScroll: false })`, ~linha 2140). Para quem refaz a aula (como o dono nos testes), a entrada é pior.

### 4.2 Depois do toque

- **A despedida toca?** Sim, em 100% dos percursos, sozinha (0,05 a 0,12 s depois de "Continuar aula"). Não foi pulada nem pediu "Assistir".
- **Há reconhecimento do que a pessoa escolheu?** Só um quadro pequeno: "Missão registrada no Meu roteiro." (com a nota repetida, se houve) ou "Anotado. Essa missão fica em “Missões para depois”." É um aviso de sistema, não um retorno: não diz "boa", não diz "combinado", não diz "falta só o fechamento". O botão seguinte é "Continuar aula". A despedida não diferencia quem fez de quem deixou para depois (nem poderia: é o mesmo vídeo).
- **A mensagem parece feedback?** Parece recibo. Está no fim de um cartão alto (no desktop a página rola para centralizá-la), com texto de 16 px e borda fina.

### 4.3 Despedida e tela final

- **A despedida parece fim de curso?** Não. Visual idêntico a v04/v05 (d08, m06), sem rótulo. A barra de etapas a trata como "Vídeo" (`lessonSteps`/`STEP_LABEL`, linhas ~371 a 386). O título pequeno no topo é o da **aula** ("Fica uma hora a mais e resolve?"), não o do curso. Legendas desligadas por padrão.
- **A tela final diz o quê?** H2 **"Meu roteiro"** (título do nó `end` nos dados, igual em todos os cursos, e igual ao título do bloco do roteiro logo abaixo). Chip laranja **"Aula concluída"** (fixo no código, `EndPanel`, linha ~2414) e chip cinza "Curso concluído" (`outcomeLabel`). O cartão **"Conquista · Curso concluído · {curso}"** com a trilha ("3 de 3 cursos") e "Ver meu selo"/"Ver o caminho até o Selo" é o único sinal de curso concluído.
- **Celebração, selo, certificado?** Selo: só o cartão de conquista e o link. **Nenhuma animação, nenhum som, nenhum confete.** Certificado: não há (o reconhecimento é o Selo DNA Work da trilha).
- **Frase de fecho:** existe em todos os cursos (`closingLine`, ex.: "Combinado bom é o que funciona na hora. Se falhar, você avisa.") e é a melhor linha de encerramento, mas é desenhada em 32 px **no fim da página, depois do roteiro** (d11, m09). Quase ninguém chega lá.

### 4.4 Bugs e anomalias

1. **Revisita: mensagem diz uma coisa e o servidor faz outra.** Quem já tinha "Já experimentei" e toca "Vou fazer depois" vê "Anotado. Essa missão fica em Missões para depois", mas o servidor **não rebaixa** (`recordMissionFromLesson` / `mergeLessonMission`, de propósito). A tela final mostra o chip "Vida real: para depois" **e**, no roteiro logo abaixo, "Já experimentei" (d10). Gravidade: menor.
2. **Revisita: a nota antiga volta preenchida**, e "Já experimentei" sem mexer manda a nota antiga de novo. Para testar "sem nota" foi preciso esvaziar o campo. Gravidade: menor (talvez desejável, mas não está avisado).
3. **Chegada da missão rolada para o meio** em revisita (item 4.1). Gravidade: média para quem refaz.
4. **C01, tela final:** o lado direito do palco fica **vazio** (sem o retrato da Marina), enquanto os outros cursos mostram a avatar (d13). Sem erro de rede registrado; causa não investigada. Gravidade: menor.
5. **C01 não segue o desenho dos demais:** a última prática (`m04`) é uma **atividade "Na prática"** (`reflection` com roteiro), não a missão "Leve para a vida real". O fluxo depois dela é o mesmo (confirmação, despedida, vinheta, fim), mas a etiqueta, o texto e o chip final ("Prática feita") são outros. Conferir se é intencional. (C06 usa o id `a04`, só o nome do nó; comporta-se igual.)
6. Sem travamento, sem duplo fim, sem vídeo pulado, sem rolagem horizontal, sem erro de console do app.

---

## 5. As despedidas de C01 a C11 funcionam como fecho de curso?

Critério: (a) diz que o curso acabou, (b) recapitula o essencial, (c) se despede/deseja algo, (d) o último que se ouve não é conteúdo novo nem pergunta. Todas têm 51 a 65 palavras e 20 a 26 s; a avatar nunca fala de experiência própria; nenhuma cita CIEE/IEL/THEO.

| Curso | Última frase | (a) curso acabou | (b) recapitula | (c) despedida | Veredito |
|---|---|---|---|---|---|
| C01 (Marina) | "Foi bom caminhar com você até aqui. Boa sorte no seu primeiro dia. Torço por você." | sim ("até aqui") | sim | sim | **Funciona.** É o modelo. |
| C02 (Camila) | "É a que você confirmou. Até mais." | não | sim | fraca ("Até mais") | Fraco. Termina como fecho de aula. |
| C03 | "Advertência não é jeito de descobrir a regra. Bom trabalho." | não | sim | ambígua ("Bom trabalho") | Fraco. Último pensamento é conteúdo novo. |
| C04 (Thiago) | "Mensagem boa é a que a pessoa responde… Até a próxima." | não | sim | "Até a próxima" sugere outra aula | Fraco. |
| C05 (Júlia) | "Horário combinado se combina antes. Depois, só dá para avisar. Saia com margem." | não | sim, forte | não | Médio. Termina em ordem ("Saia com margem."). |
| C06 (Patrícia) | "Respeito aparece no que a gente faz depois de perceber o limite do outro. Cuide de você." | não | sim | sim ("Cuide de você") | Bom, falta dizer que acabou. |
| C07 (Gustavo) | "Qual é o prazo? E o que falta para começar? São duas perguntas. Faça as duas." | não | sim | não | Médio. Termina em tarefa. |
| C08 (Aline) | "Cabem numa mensagem e tiram você do papel de consertar o que não é seu. Até a próxima." | não | sim | "Até a próxima" | Fraco. |
| C09 (Enzo) | "Dá para contar a conquista sem mostrar a tela de ninguém." | não | sim | não | Médio. Termina em dica. |
| C10 (Beatriz) | "Quem continua depois de você vai saber de onde seguir." | não | sim | não | Médio. Boa imagem, sem despedida. |
| C11 (Renata) | "Antes de dizer entendi, pergunte: qual parte eu já entendi? E qual falta?" | não | sim | não | Fraco. Termina em pergunta (soa como início de cena). |

Padrões: **nenhuma de C02 a C11 diz que o curso acabou**; 3 usam "Até a próxima"/"Até mais", que combina com outra aula e não com o fim; 7 terminam em ordem, dica ou pergunta. Todas recapitulam bem (a parte "tira o fôlego" funciona). Elas funcionam como **recapitulação da última aula**, não como encerramento do curso. A solução barata é **escrita e visual** (seção 7), porque regravar custa caro.

---

## 6. Causas-raiz

1. **Não existe um "momento" entre a explicação e a missão.** O estado "vídeo terminou" do nó `content` reusa o cartão genérico de cena (`NodePanel`: eyebrow "A seguir" quando há `carry`, título do vídeo, retorno da escolha, botão "Continuar"). Ele não olha o próximo nó. Já existe o dado (`lesson.graph`, `leadsToChoice`/`questionVideoFollows` fazem algo parecido para perguntas), só não há versão para missão.
2. **A missão chega como um cartão de formulário**, sem transição, sem "última prática", com o aviso "pode deixar para depois" escondido embaixo. Na revisita, ainda abre o formulário e rola para o campo.
3. **A confirmação é um recibo de sistema e o botão é "Continuar aula".** Nada prepara o fechamento ("falta só o fechamento do curso") e a despedida entra por autoplay, sem moldura.
4. **A despedida é um nó `content` comum.** O player não sabe que é o fecho (a regra "último `content` antes do `end`, depois de missão/atividade" não existe). Por isso: mesmo título, mesmo ícone de etapa, mesmo topo, sem rótulo "Fechamento".
5. **A tela final é a tela de fim de aula** (`EndPanel`): o título vem do dado ("Meu roteiro"), o chip fixo é "Aula concluída", a conquista de curso é um cartão entre outros, a `closingLine` foi para o fim da página e não há celebração. O dado já diz "Curso concluído" (`outcomeLabel`, conquista), mas o desenho o rebaixa.
6. **Conteúdo das despedidas:** escritas como resumo da aula; só o C01 foi escrita como adeus.

---

## 7. Propostas, em ordem de prioridade

### 7.1 Grátis (UI do player, textos escritos)

| # | Proposta | Onde | Efeito |
|---|---|---|---|
| 1 | **Cartão-ponte antes da missão.** Quando o próximo nó é `mission` (ou a atividade final), o cartão do fim do vídeo muda: eyebrow **"Agora é com você"**, título **"Sua missão: {título da missão}"**, uma linha **"É uma prática para fazer fora daqui. Se não der agora, deixe para depois."**, botão **"Ver a missão"** (no lugar de "Continuar"). Esconder (ou reduzir) o "Sua escolha" repetido. | `NodePanel` (~1816) + `ContinueAction` (rótulo). Lê o próximo nó do grafo. | Resolve o "abrupto": quem ouve a frase de ponte vê, na tela, o nome da missão e sabe o que vem. |
| 2 | **Fechamento identificado.** Último `content` antes do `end` e depois de missão/atividade vira a etapa **"Fechamento"** (ícone de bandeira na barra), com **título-cartão de 1,5 s** sobre o início do vídeo: "Fechamento do curso" + nome do curso, e o topo mostra o nome do curso em vez do título da aula. Ligar a legenda por padrão nesse vídeo. | `lessonSteps`/`STEP_LABEL`/`STEP_ICON` (~371 a 386), `NodePanel` (título hoje `sr-only` no desktop). | A despedida deixa de ser "mais um vídeo". |
| 3 | **Tela final de curso concluído.** Quando há `conquest` (curso inteiro concluído): H2 **"Você concluiu {nome do curso}"**, chip principal **"Curso concluído"** (sem "Aula concluída"), `closingLine` logo abaixo do título (hoje fica no fim da página), **celebração curta** (confete em CSS por 1,5 s, **sem repetir**, desligada com `prefers-reduced-motion`), cartão de conquista com o **selo** em destaque e botão primário "Ver meu selo"/"Ver o caminho até o Selo". "Voltar ao curso" vira secundário. | `EndPanel` (~2377 a 2440) e bloco `recap.closingLine` (~1252). | Responde ao "encerramento do curso" sem custo de mídia. |
| 4 | **Reconhecimento depois do toque.** Trocar o quadro de confirmação por texto que acolhe e prepara o fecho. Já experimentei: **"Boa! Missão registrada no Meu roteiro."** + "Falta só o fechamento do curso." Vou fazer depois: **"Combinado. A missão fica em “Missões para depois”, no Meu roteiro."** + "Falta só o fechamento do curso." Botão: **"Ver o fechamento"** (em vez de "Continuar aula"). Manter a nota exibida. | `MissionPanel`, bloco `mission-saved` (~2238) e rótulo do botão (`mission-continue`). | A pessoa sente retorno e sabe que está no fim. |
| 5 | **Chegada da missão mais cuidada.** Transição de 200 ms (fade/subida, respeitando `prefers-reduced-motion`); chip **"Última prática do curso"** quando depois dela só há despedida; levar a frase "Você termina a aula de qualquer jeito; “Vou fazer depois” guarda a missão" para **antes dos botões**; sempre abrir rolado no topo (focar o campo com `preventScroll: true` e, na revisita, não pular para o campo). Opcional: recolher "Se você ainda não trabalha" em um bloco que abre ao toque (reduz 40 a 55 palavras). | `MissionPanel` (~2105, foco do campo ~2140), efeito de rolagem do `Stage` (~950). | Entrada menos brusca, também para quem refaz a aula. |
| 6 | **Coerência na revisita.** Usar o status devolvido pelo servidor para a confirmação ("Você já tinha marcado Já experimentei; mantive."), e fazer o chip final ("Vida real: …") e o roteiro mostrarem o mesmo estado. | `saved` do `use-player-session`/`MissionPanel`; `realLifeChipLabel`. | Tira a contradição vista em d10. |
| 7 | **Textos das despedidas (sem regravar).** Mostrar abaixo do vídeo, ou na tela final, uma **linha escrita de fecho** (por curso, a partir da `closingLine` que já existe) e a legenda ligada. Não mexer no áudio. | Mesmos pontos de 2 e 3. | Cobre o "Até a próxima"/"Faça as duas." sem custo. |
| 8 | C01: conferir se a última prática deve ser missão; corrigir o retrato vazio no fim. | Dados do C01 (rascunho: não mexi) e `EndPanel`/`frame`. | Consistência. |

Ordem de entrega sugerida: **1, 3, 4, 2** (as quatro respondem diretamente à queixa), depois 5, 6, 7, 8.

### 7.2 Falas novas (PAGAS, precisam de aprovação do dono)

A verba de mídia é de cerca de US$ 9, reservada para novas tentativas. As propostas abaixo ficam fora do plano grátis. Cálculo: 2,62 palavras por segundo; US$ 0,0207 por segundo. Sem experiência própria da avatar; sem slogan.

| Id | Fala | Palavras | Duração | Custo por vídeo | Para C02 a C11 (10 vídeos) | Recomendação |
|---|---|---|---|---|---|---|
| **S1** (fecho do curso) | "Você terminou o curso. Leve o que viu para a sua semana. Boa sorte." | 14 | 5,3 s | **US$ 0,11** | **US$ 1,11** (mais as tentativas) | **Só se o dono quiser fala de despedida.** Entra como vídeo curto novo depois da despedida (precisa mexer no rascunho do curso: não feito) ou como trecho final. Não regravar a despedida inteira: ~29 s x US$ 0,0207 = US$ 0,60 por curso, US$ 6 no total. |
| **S2** (ponte antes da missão) | "Agora é com você. Escolha um momento da sua semana e teste isso de verdade." | 15 | 5,7 s | US$ 0,12 | US$ 1,19 | **Não recomendo.** O v05 já termina chamando a missão (7 a 10 s); o ganho vem do cartão-ponte escrito (7.1 item 1). |
| **S3a** (retorno a "Já experimentei") | "Que bom. Conte no Meu roteiro como foi." | 8 | 3,1 s | US$ 0,06 | US$ 0,64 (só 1 por avatar) | **Não recomendo.** Mais um vídeo no meio do fluxo; o texto do item 4 faz o mesmo. |
| **S3b** (retorno a "Vou fazer depois") | "Tudo bem. A missão fica guardada no Meu roteiro." | 9 | 3,4 s | US$ 0,07 | US$ 0,71 | **Não recomendo.** Idem. |

Resumo de custo: o plano grátis fecha a queixa com **US$ 0**. Se o dono quiser uma despedida falada nova, **S1** custa **cerca de US$ 1,11 mais um colchão de tentativas** (US$ 1,50 no total, aproximadamente), e deixa o resto da verba intacto. Cada fala nova tem de passar pelas regras de conteúdo antes de gerar.

---

## 8. Evidências (capturas desta pasta)

Desktop (C05 "Horário é combinado", Júlia, salvo quando indicado):

- `d01-video-termina-card-continuar.jpg`: fim do v05, "A SEGUIR · {título do vídeo}" + "Sua escolha" + Continuar.
- `d02-clique-continuar-enviando.jpg`: 1º quadro depois do clique ("Enviando…").
- `d02b-revisita-missao-chega-no-meio-do-cartao.jpg`: revisita, página rolada, nota antiga preenchida.
- `d03-missao-chegada-primeira-vez.jpg`: missão aberta (os dois botões), depois de "Voltar".
- `d04-vou-fazer-depois-confirmacao.jpg`, `d05-ja-experimentei-com-nota-confirmacao.jpg`, `d06-ja-experimentei-sem-nota-confirmacao.jpg`: as três confirmações.
- `d07-despedida-comeca-sozinha.jpg`, `d08-despedida-tocando.jpg`: despedida igual a qualquer vídeo.
- `d09-vinheta-marca.jpg`: vinheta de 4 s.
- `d10-fim-vou-fazer-depois.jpg`, `d11-fim-ja-experimentei.jpg`: tela final inteira (chip "Vida real: para depois" x roteiro "Já experimentei" no d10; frase de fecho no pé do d11).
- `d12-fim-C02.jpg`, `d12-fim-C08.jpg`, `d12-fim-C11.jpg`, `d13-fim-C01.jpg` (retrato vazio), `d14-fim-C06.jpg`: mesma tela final nos outros cursos. `d15-despedida-C01.jpg`: a despedida do C01.

Celular 375x812:

- `m01-video-termina-card-continuar.jpg`, `m02-missao-chegada-barra-fixa.jpg`, `m03-missao-pagina-inteira.jpg`, `m04-vou-fazer-depois-confirmacao.jpg`, `m05-ja-experimentei-confirmacao.jpg`, `m06-despedida-tocando.jpg`, `m07-vinheta.jpg`, `m08-fim-topo.jpg`, `m09-fim-pagina-inteira.jpg`.

Medidas por percurso (amostrador, 80 ms): do clique em Continuar à missão 0,07 a 0,13 s; do toque à confirmação 0,64 a 1,13 s; do "Continuar aula" ao autoplay da despedida 0,05 a 0,12 s; do fim da despedida à vinheta 0,07 s; vinheta 4 s. Despedidas com legenda coincidindo com o fim do arquivo (folga final 0,0 a 0,1 s) em C01 a C11.

## 9. Arquivos tocados

Criados: esta pasta (`diagnostico.md` e as capturas). Nenhum arquivo do app, do robô ou dos cursos foi alterado. A conta `aluna@demo.local` ganhou tentativas e registros de missão novos nos cursos C01, C02, C05, C06, C08 e C11 (efeito normal do robô). Nenhum rascunho foi tocado, nada foi publicado, nenhum servidor foi reiniciado.
