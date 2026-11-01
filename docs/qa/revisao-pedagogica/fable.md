# Revisão pedagógica dos 26 cursos — versão publicada

Data: 31/10/2026. Fonte: `docs/qa/raio-x/raio-x.json` (versão `publicada` de cada curso, 620 vídeos com ASR), `trilhas[].checagemFinal`, `frasesRepetidasEmVariosCursos` e alertas. Contexto: `docs/qa/revisao-final/revisao-fable.md`, `docs/novos-cursos/analise-fable.md`, `revisao-pre-gravacao.md`, `aplicado-pre-gravacao.md` e `docs/qa/lancamento/robo/decisoes-linha-de-base.md`. Só leitura: nada foi editado, publicado nem gerado.

Convenções: códigos do JSON (`C14·A12·q25·C`). Nas correções, **só texto** = título, situação, opção, retorno, missão, ponte, resumo, checklist; **exige regravar vídeo** inclui também "remontagem" (reaproveitar plano já gravado, sem gravação nova), indicado quando for o caso. A lista estruturada está em `fable.json`.

---

## 1. Veredito geral

**Dá para lançar.** Nenhum item bloqueia: não há orientação errada em tema sensível (assédio, dados, IA, saúde, direitos), não há promessa de selo, certificado ou contratação, não há citação a CIEE/IEL, as leis citadas estão certas (Jovem Aprendiz 14–24, LinkedIn 16+, hora extra e "trabalhar fora do horário" tratados como resposta fraca) e os gabaritos das 8 checagens finais estão corretos. As 11 reações em vídeo que contradiziam o retorno escrito estão com `videoDesativado: true`: o aluno vê só o texto.

O que mais preocupa, em ordem: (1) **C14·A12** promete "o que fazer depois, inclusive quando a resposta é não" e o conteúdo do "não" foi cortado do vídeo (sobrou só no resumo); (2) **C06·A2·v03** ainda diz "agente de integração do seu contrato" no áudio, contra a regra do dono; (3) **C14·A3** manda o aluno "se cadastrar na DNA Work" em opção, retorno, resumo e checklist: só pode ficar se o cadastro existir mesmo; (4) nas **4 checagens finais antigas**, a resposta certa é a mais longa em 16 de 24 itens, o que entrega o gabarito e tira o valor diagnóstico (as 4 novas já foram corrigidas); (5) duas contradições internas pequenas no C14 (checklist "dez conexões" × "não há quantidade obrigatória"; checklist "mensagem de agradecimento" × resumo "opcional"). Tudo isso é texto ou remontagem; a regravação, se tudo for feito, não passa de 27 segundos.

---

## 2. Lista priorizada

Nenhum item **bloqueia lançamento**. Abaixo, **corrigir antes** (P1–P23) e **pode esperar** (P24–P35).

### Corrigir antes

**P1 — C14·A12·v23 (Explicação "Suas perguntas, e o depois")** · **exige regravar vídeo (remontagem, 0 s novos)**
- Problema: a aula se chama "Prepare a entrevista e os próximos passos", o resumo diz "sabe o que fazer depois, inclusive quando a resposta é não" e v22·s1 fala "saber o que fazer depois". Mas os planos s3 ("E se a resposta for não? Dói, mas faz parte. Pergunte, com educação, o que você pode melhorar. Anote, ajuste e siga para a próxima.") e s4 foram removidos, e a cauda de s2 ("Depois da entrevista, mande uma mensagem curta agradecendo") foi cortada. O vídeo ficou com 1:01 e termina em "o que vou aprender nos primeiros meses?" + chamada. O "não" só aparece no texto do fim.
- Por que importa: é a última aula do maior curso e o único lugar da plataforma que prepara o aluno para a rejeição, o que é a experiência mais comum de quem procura o primeiro emprego. Prometer e não entregar fecha o curso em falso.
- Correção: devolver o plano s3 ao v23 (já gravado; entra entre s2 e a chamada). Fala: "E se a resposta for não? Dói, mas faz parte. Pergunte, com educação, o que você pode melhorar. Anote, ajuste e siga para a próxima." Não devolver s4 ("Cada entrevista é um treino para a vaga que vai dar certo": promessa). Se a remontagem não for possível, alternativa só texto: trocar o resumo da aula para "Ao final, você prepara o ambiente da entrevista online e leva duas perguntas para fazer." e manter a linha do "não" no `fim.resumo`, que já existe.

**P2 — C06·A2·v03·s2** · **exige regravar vídeo (corte de áudio; se regravar, 25 palavras ≈ 10 s)**
- Texto atual (áudio): "Você também pode pedir apoio a quem acompanha seu trabalho, ao canal indicado pela empresa, à escola ou ao agente de integração do seu contrato."
- Problema: é a única citação a "agente de integração" nos 26 cursos. A regra do dono é não citar. A revisão anterior registrou que o trecho foi "devolvido no acabamento", então houve decisão de manter; registro aqui porque o pedido desta revisão é apontar.
- Por que importa: para aprendiz o termo correto seria "entidade formadora"; "agente de integração" é figura do estágio. Além da regra, é impreciso para metade do público.
- Correção: cortar o áudio depois de "à escola" (a frase fecha bem: "...ao canal indicado pela empresa, à escola."). Se preferir regravar o plano: "Você também pode pedir apoio a quem acompanha seu trabalho, ao canal indicado pela empresa ou à escola." (≈ 9 s). Nenhum texto de tela cita o termo.

**P3 — C14·A3 (q05 situação, q05·A rótulo e retorno, fim resumo e checklist, v05 textoTela)** · **só texto (condicional)**
- Texto atual: situação "Caminhos possíveis: seu cadastro na DNA Work, programas de Jovem Aprendiz (14 a 24 anos, com requisitos próprios), a página 'trabalhe conosco' das empresas, o LinkedIn e as pessoas que você conhece."; opção A (forte) "Me cadastro na DNA Work e aviso conhecidos."; retorno "Você combina dois caminhos que funcionam. Faça assim: cadastre-se na DNA Work e conte para três pessoas."; resumo "Use vários caminhos: seu cadastro na DNA Work, Jovem Aprendiz, as empresas e as pessoas."; checklist "cadastro feito na DNA Work".
- Problema: o plano s2 que explicava o cadastro ("a gente é agente de integração... tecnologia de match") foi removido do vídeo, mas o texto continua orientando o aluno a se cadastrar e trata isso como a resposta forte. Se o cadastro/matching não existir no produto no lançamento, é promessa que a DNA Work não cumpre; se existir, está bom (a plataforma pode falar de si).
- Correção: confirmar com o dono. Se o cadastro **não** existir, usar: situação "Caminhos possíveis: programas de Jovem Aprendiz (14 a 24 anos, com requisitos próprios), a página 'trabalhe conosco' das empresas, o LinkedIn e as pessoas que você conhece."; opção A "Procuro nas páginas das empresas e aviso conhecidos."; retorno "Você combina dois caminhos que funcionam. Faça assim: escolha três empresas para acompanhar e conte para três pessoas."; resumo "Use vários caminhos: Jovem Aprendiz, as empresas, o LinkedIn e as pessoas."; checklist "três empresas escolhidas"; textoTela "Jovem Aprendiz · Trabalhe conosco · LinkedIn · Pessoas". A reação em vídeo da opção A ("Você combina dois caminhos que funcionam.") serve para os dois casos.

**P4 — C14·A5·fim_aula_05 checklist "Meu LinkedIn"** · **só texto**
- Texto atual: item "dez conexões". As instruções da missão m04 dizem "não há quantidade obrigatória de conexões".
- Por que importa: contradição na mesma aula; para adolescente tímido, meta numérica vira pressão sem motivo.
- Correção: item "primeiras conexões".

**P5 — C14·A12·fim_aula_12 checklist "Dia da entrevista"** · **só texto**
- Texto atual: item "mensagem de agradecimento escrita". O resumo diz "um agradecimento breve depois é opcional, se houver canal" e o vídeo não fala mais disso.
- Correção: item "agradecimento enviado, se houver canal".

**P6 — C14·A12·q24·C retorno** · **só texto**
- Texto atual: "Apoie o aparelho e procure uma posição confortável que mantenha imagem e som estáveis. Adapte o enquadramento às suas condições."
- Problema: a opção é "fraca" ("Deitado na cama, segurando o celular na mão"), mas o retorno não diz por que é fraca nem traz o "Faça assim". A reação em vídeo (desativada) era dura ("postura largada"); o texto foi suavizado demais e ficou sem conteúdo.
- Correção: "Deitado e com o celular na mão, a imagem treme e o enquadramento fica estranho para quem entrevista. Faça assim: apoie o aparelho na altura dos olhos e, se puder, sente-se; adapte o enquadramento às suas condições."

**P7 — C02 descrição do curso ("Objetivo final")** · **só texto**
- Texto atual: "Ao final, a pessoa consegue consulta a orientação de vestimenta e combina alternativas quando necessário."
- Correção: "Ao final, a pessoa consegue consultar a orientação de vestimenta e combinar alternativas quando necessário."

**P8 — C20·A2·v03 (abertura "Antes de usar, confira")** · **verificar áudio; se preciso, regravar s1–s3 (47 palavras ≈ 17 s)**
- Problema: o ASR ouviu "EA" nas três vezes em que a fala diz "IA" ("o que a EA devolve", "resposta de EA", "A EA escreveu"); em q02 e q04 do mesmo curso ouviu "pediu aí a um aviso". Nos outros vídeos do C20 o whisper transcreveu "IA" certo, então a pronúncia variou. Se o aluno ouvir "ea"/"aí a", perde a palavra-chave do curso.
- Correção: ouvir v03, q02 e q04. Se a sigla não estiver inteligível, regravar v03 com a sigla soletrada no roteiro ("i-a") ou trocar por "a inteligência artificial" nas três frases: "Agora, vamos olhar o que a inteligência artificial devolve. Uma resposta pode soar segura e ainda estar errada." / "No fim desta aula, tem uma missão para você: crie seu checklist de revisão de uma resposta de IA com três verificações." / "A inteligência artificial escreveu que haverá certificado na oficina."

**P9–P23 — Checagens finais das trilhas Primeiro emprego, Imagem e postura, Rotina e combinados e Convivência** · **só texto**
- Problema: em 16 dos 24 itens a opção correta é a mais longa, com 1,5× a 2,5× a média (alertas `opcao_muito_longa`); proponho reescrever 15 e aceitar rc6. Como as opções já são embaralhadas por aluno, o tamanho é a única pista que sobra, e ela entrega o gabarito. Nas 4 trilhas novas isso já foi consertado (correta é a mais longa em só 2 de 24). O gabarito em si está certo em todos.
- Por que importa: a checagem final é o que dá o resultado da trilha (80% de acerto). Se a certa é reconhecível pelo tamanho, a checagem mede atenção visual, não aprendizado.
- Correção (encurtar a correta e, quando preciso, alongar um distrator; conteúdo preservado):
  - **P9 pe1**: b "Confirmo por e-mail horário, entrada e quem procurar."; a "Chego cedo e pergunto na porta a alguém que estiver passando."
  - **P10 pe4**: c "Conto o que fiz, o que já tentei e o erro que aparece."; a "Digo que o sistema não funciona e espero alguém consertar."
  - **P11 pe5**: a "Aviso quem recebeu o que está errado e mando a versão corrigida."; b "Corrijo só no meu arquivo e espero alguém perguntar pela lista."
  - **P12 ip1**: c "Pergunto se há orientação de roupa e calçado."; a "Vou com a roupa que uso no dia a dia, que deve servir."
  - **P13 ip2**: a "Aviso que só tenho a cinza-escura e pergunto se serve."; b "Vou com a cinza-escura e não comento nada com ninguém."; c "Falto no sábado para não aparecer com a roupa errada."
  - **P14 ip3**: b "Pergunto em qual situação foi e o que esperam que eu faça."; a "Digo que vou melhorar e tento mudar um pouco de tudo."; c "Digo que sempre fui assim e que isso não vai mudar."
  - **P15 ip4**: c "Digo que falo sobre a tarefa, não sobre esse comentário, e procuro apoio."; a "Respondo no mesmo tom, na frente de todo mundo."; b "Finjo que não ouvi e deixo pra lá, para não criar clima."
  - **P16 ip5**: b "Não posto essa e tiro outra, com autorização de quem aparece."; c "Posto só para os amigos próximos, que não vão espalhar."
  - **P17 ip6**: a "Apago o vídeo, aviso o colega e sigo a orientação da empresa."; b "Deixo no ar, porque já tem muitas visualizações e ficou bom."
  - **P18 rc1**: a "Aviso que terminei, onde está e o que ficou pendente."; b "Não aviso: quem precisar vai achar o arquivo na pasta."; c "Mando só 'feito!' no grupo e volto para outra tarefa."
  - **P19 rc2**: b "Peço um exemplo do que pode e do que não pode no balcão."; a "Faço como os colegas fazem, porque eles já conhecem a regra."; c "Não uso o celular nunca no trabalho, para não errar."
  - **P20 rc3**: c "Mostro as duas orientações a quem me orienta e pergunto qual vale."; a "Envio pelos dois caminhos, por garantia, e não pergunto nada."; b "Escolho o caminho que achar mais fácil e envio logo."
  - **P21 cv1**: b "Peço um minuto, digo o assunto e que o prazo é hoje."; a "Interrompo na hora e falo tudo de uma vez, sem avisar."
  - **P22 cv2**: c "Digo que entendi sexta e pergunto como alinhar o prazo."; a "Digo que ela está errada e que o prazo sempre foi sexta."; b "Faço correndo, sem comentar a diferença com ninguém."
  - **P23 cv6**: a "Peço com calma que ele pare e, se continuar, procuro a pessoa de referência."; b "Rio junto para não criar clima e deixo passar mais uma vez."; c "Faço um comentário sobre a roupa dele também, para ele sentir."
  - rc6 fica como está: a correta é uma mensagem-modelo e os distratores são, por natureza, curtos ("Oi! Me libera a planilha?"); o aluno julga o conteúdo, não o tamanho.

### Pode esperar

**P24 — C01·A2·m02 (missão "Avise um imprevisto")** · **só texto**
- Texto atual: molde "Aconteceu {imprevisto}. Minha previsão está {previsao}. Vou {retorno}." com {previsao} = "ainda indefinida | sujeita à retomada do transporte | dependente de uma nova rota". Gera "Minha previsão está dependente de uma nova rota", que ninguém diz.
- Correção: molde "Aconteceu {imprevisto}. Minha previsão de chegada está {previsao}. Vou {retorno}."; {previsao} = "indefinida | presa à retomada do transporte | dependendo de uma nova rota"; exemplo "Aconteceu uma interrupção no transporte. Minha previsão de chegada está indefinida. Vou atualizar pelo canal combinado."

**P25 — C13·A2·m02 instruções** · **só texto**
- Texto atual: "Para aprender uma tarefa: observe um exemplo, anote o que importa, pratique dentro dos seus acessos e confira o resultado. Se precisar de ajuda, explique onde travou." É instrução de outra aula (aprender tarefa), colada numa missão de pedir ajuda.
- Correção: "Antes de enviar, confira se a mensagem diz o que você está fazendo, o que já tentou e qual decisão precisa tomar. Se houver prazo, avise também."

**P26 — C21·A2 (q04·B rótulo; missão a02 opções e exemplo)** · **só texto**
- Texto atual: "Para concluir A preciso de uma autorização; avanço em B. Podemos rever o prazo?"; na missão: "A depende de autorização | A está esperando uma resposta | A precisa de material que ainda não chegou", "Enquanto isso posso avançar em B", "confirmar essa ordem e rever o prazo de A".
- Problema: "A" e "B" como nomes de tarefa confundem num quiz em que A, B e C são as letras das opções; para 14–16 anos é um ruído evitável.
- Correção: rótulo "Para concluir a tarefa 1 preciso de uma autorização; enquanto isso avanço na tarefa 2. Podemos rever o prazo?"; {situacao} "A tarefa 1 depende de autorização | A tarefa 1 está esperando uma resposta | A tarefa 1 precisa de material que ainda não chegou"; {alternativa} "Enquanto isso posso avançar na tarefa 2 | Enquanto isso posso adiantar outra tarefa | Enquanto isso posso preparar o que for possível"; {pedido} "confirmar essa ordem e rever o prazo da tarefa 1 | combinar uma nova ordem das tarefas | dividir a tarefa e rever o prazo"; exemplo "A tarefa 1 depende de autorização, e por isso não consigo concluir no prazo. Enquanto isso posso avançar na tarefa 2. Podemos confirmar essa ordem e rever o prazo da tarefa 1?"

**P27 — C24·A2·a02 ponte e título da missão** · **só texto**
- Texto atual: o vídeo anuncia "organize um plano de quatro etapas e marque o que precisa ser confirmado antes de começar", mas a missão ("Monte um plano de quatro etapas, da primeira à última") não tem onde marcar o que depende de confirmação.
- Correção: ponte "Você viu que algumas etapas dependem de uma confirmação. Agora monte um plano de quatro etapas: a primeira é o que precisa ser confirmado antes de começar." Título fica.

**P28 — C08·A2·m02 opções {problema}** · **só texto**
- Texto atual: "um material danificado | uma condição que precisa de avaliação | um item que parece inadequado para uso" gera "Percebi uma condição que precisa de avaliação em uma estação de trabalho".
- Correção: "um material danificado | um cabo com a parte exposta | um equipamento que parece inseguro"; exemplo "Percebi um cabo com a parte exposta em uma estação de trabalho. Podemos confirmar quem deve verificar a situação?"

**P29 — C14·A9·m08 opção de {hoje}** · **só texto**
- Texto atual: "terminei os estudos" no molde "Hoje eu {hoje}" gera "Hoje eu terminei os estudos" (parece que foi hoje).
- Correção: "já concluí o ensino médio".

**P30 — Checagem Convivência cv3·c feedback** · **só texto**
- Texto atual: "Foi você. Resolva e siga em frente." Seco demais para um retorno de erro.
- Correção: "Foi você quem sujou: limpe e siga em frente, sem precisar levar isso ao grupo."

**P31–P34 — Descrições de C05, C07, C11, C12 ("Objetivo final")** · **só texto**
- Problema: mistura "consegue + infinitivo" com verbos conjugados ("consegue planejar a chegada e comunica atraso").
- Correção: C05 "Ao final, a pessoa consegue planejar a chegada e comunicar atraso, intervalo ou ausência pelo canal combinado."; C07 "Ao final, a pessoa consegue pedir uma conversa com contexto e apresentar uma discordância respeitosa."; C11 "Ao final, a pessoa consegue pedir esclarecimento, comparar informações diferentes e confirmar a regra aplicável."; C12 "Ao final, a pessoa consegue pedir um exemplo de correção, combinar uma mudança observável e buscar apoio diante de desrespeito."

**P35 — Perguntas com duas opções fortes: C03·A1·q01 (A e B), C06·A1·q01 (A e B), C14·A12·q25 (A e C), C15·A2·q03 (A e B)** · **decisão, sem texto obrigatório**
- As duas fortes são, de fato, comportamentos corretos (silenciar × terminar o atendimento; usar o nome × perguntar; "um dia normal" × "horários e folgas"; convidar × cortar a piada). O C15 foi decisão explícita da revisão pré-gravação. Rebaixar uma delas exigiria regravar a reação ("Isso mesmo!"). Recomendo aceitar as quatro e documentar como exceção à regra "só uma forte".

### Registrado, sem correção proposta

- **Sobreposição C13 × cursos novos.** C13·A3 ≈ C21·A1 (dois prazos), C13·A4 ≈ C22·A1 (erro com fatos e próximo passo), C13·A5 ≈ C12·A1 (orientação vaga, pedir exemplo), C13·A6 ≈ C23·A1 (próximo passo de aprendizagem), C13·A2 ≈ C07·A1/C11·A1 (pedir ajuda/exemplo). E C19·A2·q04 (site pede pagamento pela vaga) ≈ C14·A3·q06 ≈ checagem tc4. As respostas são coerentes entre si em todos os pares (não há contradição), então vale como reforço. Mas quem faz as 8 trilhas vê a mesma decisão três vezes. Sugestão sem custo: no catálogo, apresentar C13 como "curso integrador" da trilha Primeiro emprego e não recomendar Autonomia logo depois dele.
- **ASR, só para ouvir e decidir:** C14·A2·v03 ("será um plus" ouvido como "serão tuas"; o cartão na tela cobre); C03·A2·v03 ("aguardo um recado importante" ouvido como "Aguarde": muda a frase-modelo de 1ª pessoa para imperativo); C02·A1·q02·A e C13·A4·q07·C ("Tem um caminho ainda melhor" ouvido como "Tenha"). Nenhum muda o sentido da aula. Trocas tem/tenho, nomes (Yara, Sarah, Victor, Clayton) e "15h"/"15 horas" são transcrição, não erro.
- **Títulos "fora do padrão" (24 alertas em C14, 2 em cada curso novo, 1 em C06·A3).** Em todos, o personagem é o próprio aluno ("Você ajuda na lanchonete da família", "Você vai mandar um print"). Pela regra desta revisão (pergunta direta quando não há personagem), estão certos. Não "corrigir".
- **"Faz sentido pensar assim, mas repara."** (22 vezes, em áudio). "Repara" é imperativo de tu num texto em você; no Brasil falado é natural e não atrapalha. Regravar não compensa.
- **Frases de abertura das reações.** Os 14 cursos antigos usam 6 aberturas (24, 22, 20, 19, 8 e 7 ocorrências); os 12 novos usam 10 (26, 25, 14, 13, 12, 12...). Quem faz uma trilha de 3 cursos ouve cada uma 1 ou 2 vezes. Não soa robótico; só fica repetitivo para quem faz as 8 trilhas seguidas.
- **`estimativaMin` = 1** nas 25 aulas novas (C15–C26 e C06·A3) contra 4–5 min reais. O player usa o tempo de vídeo publicado, não esse campo (`learner-courses.ts:66`), então o aluno não vê. Metadado para acertar quando houver edição.
- **Reações desativadas** (C06·A1·q02·B, C12·A1·q02·A, C13·A1·q01·B, C14·A5·q09·B/C, A6·q11·A, A8·q15·C, A11·q23·C, A12·q24·C, q25·B/C): confirmei `videoDesativado: true` em todas. Nenhuma contradição chega ao aluno.

---

## 3. Visão por trilha

**Primeiro emprego (C01 → C13 → C14).** A ordem lógica para quem ainda procura vaga seria C14 (conseguir) → C01 (chegar) → C13 (começar). Como está, o aluno que entra pela trilha vê "Meu primeiro dia" antes de "Minha primeira vaga". Se a ordem for de exibição, vale inverter para C14, C01, C13; se for só agrupamento, não importa. Repetição: C13·A1 (confirmar tarefa) e C01·A1 (confirmar chegada) são complementares, não repetidas. Lacunas: nada sobre o contrato do aprendiz (jornada, escola obrigatória, CTPS digital, vale-transporte, o que é proibido para menor de 18), nem sobre cansaço/ritmo (os cursos "Seu ritmo também importa" e "Travei: como peço ajuda" do pacote-15 não foram publicados). Checagem final: pe1–pe2 cobrem C01, pe3–pe5 cobrem C13, pe6 cobre C14 (só a aula 2, de 12). Gabarito certo; 3 itens com correta longa (P9–P11). Sugestão futura: trocar pe3 ou pe4 por um item de C14 (golpe de vaga ou "fale sobre você").

**Imagem e postura (C02 → C09 → C12).** Ordem boa (roupa → redes → correção). Sem repetição. C02·A2·v03 e C12·A2·v03 convergem no mesmo ponto ("roupa não define caráter"; "correção não precisa incluir insulto"), o que é coerente. Checagem: 2 itens por curso, gabarito certo; 6 itens com correta longa (P12–P17); ip4 é o pior caso (116 caracteres contra 22 e 34).

**Rotina e combinados (C03, C04, C05, C10, C11).** Cinco cursos, maior trilha. Ordem sugerida: C05 (horário) → C03 (celular) → C04 (WhatsApp) → C11 (não entendi) → C10 (terminei). Hoje C10 vem antes de C11, e "Não entendi" ajuda a fazer "Terminei" melhor. Repetição: C03·A1·q02 (fone no balcão) e C11·A1·q01 (fone na recepção, "bom senso") são quase o mesmo caso com resposta igual; funciona como reforço, mas na checagem rc2 aparece pela terceira vez. Checagem: cobre os 5 cursos, gabarito certo; 3 itens com correta longa (P18–P20).

**Convivência (C06 → C07 → C08).** Ordem boa. C06 tem 3 aulas e é o curso mais completo da trilha; a aula 3 (apoiar quem foi alvo) é a melhor adição do pacote-15. P2 (agente de integração) está aqui. C07·A1 tem uma sutileza: a abertura já sugere "explicar o assunto e perguntar quando ela consegue orientar", que é a opção B (média); o que diferencia a forte é "o prazo". Funciona, mas o aluno atento pode se sentir enganado; não vale regravar. Checagem: 2 itens por curso, gabarito certo; 3 itens com correta longa (P21–P23).

**Respeito e diálogo (C15 → C16 → C17).** Ordem boa (diferença → discordar → propor). Linguagem um pouco mais abstrata que nos antigos ("separar diferenças pessoais de comportamentos que prejudicam a convivência"), mas os casos são concretos (Dani, Murilo, Isadora, Cauê, Maitê, Amanda, Leandro) e resgatam o aluno. Retornos no formato "o que você fez + o que falta + faça assim" são os melhores da plataforma. Checagem: rd1–rd2 (C15), rd3–rd5 (C16), rd6 (C17); gabarito certo; correta nunca é a mais longa.

**Tecnologia com critério (C18 → C19 → C20).** Ordem boa. Segurança impecável: dados fictícios, canal autorizado, "não cole cadastros, senhas nem documentos internos", "pergunte qual é a regra para uso de IA no seu trabalho" (sem afirmar política nem idade). C19·A2·q04 repete C14·A3·q06. P8 (áudio "IA") está aqui. Checagem: 2 itens por curso, gabarito certo, tamanhos equilibrados.

**Autonomia no trabalho (C21 → C22 → C23).** Ordem boa. É a trilha que mais se sobrepõe ao C13 (aulas 3, 4 e 6). C21·A2·q04·C ("trabalhar sem parar, inclusive fora do horário") como fraca é o recado certo para aprendiz. C21 fim: "Se a sobrecarga estiver pesando além do trabalho, procure alguém de confiança" é o único resquício do tema saúde; fica curto. Checagem: au1/au5 (C21), au2/au3 (C22), au4/au6 (C23); gabarito certo.

**Pensar e resolver (C24 → C25 → C26).** Ordem boa (entender → julgar → investigar). C26 com 3 aulas fecha bem (parar → investigar → confirmar). É a trilha mais "escolar"; os casos (reunião, kits, chuva e vendas, formulário de teste) mantêm o pé no trabalho. Checagem: 2 itens por curso, gabarito certo.

**Entre trilhas.** Não encontrei contradição de orientação entre cursos: avisar cedo com fatos (C01, C05, C09, C13·A4, C18·A2, C22), pedir exemplo antes de mudar (C11, C12, C13·A5, C16·A1), não presumir regra pelo colega (C02, C03, C11, C19), proteger dados antes de enviar (C03·A2, C09, C13·A2, C18, C20) dizem a mesma coisa com as mesmas palavras-chave ("canal combinado", "pessoa de referência", "confirme antes").

---

## 4. O que está bom e deve ser preservado

- A arquitetura "abertura anuncia a missão → caso → pergunta → reação → explicação com cartão → segunda pergunta → missão em blocos → Meu roteiro" é consistente nos 26 cursos e o aluno sabe sempre o que vem.
- As missões em blocos geram frases que dá para mandar de verdade (C01, C04, C07, C10, C13·A1, C14·A4/A6/A9, C18·A2, C22·A1); testei as combinações e só C01·A2 e C08·A2 travam (P24, P28).
- Retornos que explicam o porquê e dão o próximo passo, em especial os dos 12 novos ("Falta X. Faça assim: Y") e os de C06 ("Muita gente faz isso para evitar conflito, e dá para entender").
- As situações são de aprendiz brasileiro de verdade: lanchonete da família, lava-jato, ônibus que atrasa, apelido sobre aparência, print com CPF, "organiza isso pra mim, tá?".
- Distratores plausíveis, quase sempre um erro real de iniciante e não caricatura; nos novos, a "média" razoável que o pacote original não tinha.
- Cuidado com menor de idade e com quem não tem dinheiro: "pessoa adulta de confiança", "sem depender de um gasto que você não pode assumir", "não precisa relatar uma experiência pessoal", "precisar de renda é legítimo".
- O corte do "Selo de competência" em todas as aberturas e do "agente de integração/match" em C14·A3 deixou a plataforma sem nenhuma promessa que não possa cumprir. Manter assim.
- Checagens das 4 trilhas novas: correta espalhada, tamanhos equilibrados, feedback curto com o porquê. É o modelo para consertar as 4 antigas.
