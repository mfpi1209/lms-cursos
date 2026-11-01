# Análise editorial do pacote de 15 cursos (docs/novos-cursos/pacote-15)

Data: 31/10/2026. Análise só de leitura: nada do projeto, do banco ou do servidor foi alterado.

Base lida inteira: `PROMPT_PORTAL_DNA.md`, `LEIA_ME.md`, `catalogo.json`, os 15 pares `curso.json` + `roteiro.md` (os JSON reproduzem os roteiros sem divergência; conferido por script); a transcrição dos 14 cursos publicados (`docs/qa/acabamento/transcricao-rascunho.csv`, 2.570 linhas); `short-titles.ts`; `trails.ts`; `docs/qa/enriquecimento/brief.md` e `Revisao_transcricoes_DNA_Work.md`; e, no motor, `nodes.ts`, `reaction.ts`, `scaffold.ts`, `library-defaults.ts`, `docs/biblioteca-de-modelos.md` e o player (`lesson-player.tsx`, `immersive-player.tsx`, `scaffold-composer.tsx`).

Convenções: C01–C14 são os cursos publicados na ordem da transcrição (C01 Meu primeiro dia, C02 Que roupa eu uso?, C03 Celular no trabalho, C04 WhatsApp sem complicação, C05 Horário é combinado, C06 Brincadeiras têm limite, C07 Como falar com a equipe, C08 O espaço também é do outro, C09 Posso postar isso?, C10 Terminei. E agora?, C11 Não entendi. Posso perguntar?, C12 Recebi uma correção. E agora?, C13 Comecei a trabalhar, C14 Minha primeira vaga; nomes finais do brief §5). Os novos são citados pela pasta e pela aula (`a01`, `a02`).

---

## 1. Visão geral do pacote

**Público e objetivo.** O mesmo da plataforma: ensino médio, aprendizes, estagiários e primeiro emprego, sem experiência exigida. Os 15 cursos ampliam o catálogo em cinco direções: convivência e respeito (3), tecnologia com critério (3), autonomia no trabalho (4), participação e crescimento (2) e pensar e resolver (3). Cada curso tem 2 aulas, 4 falas, 2 decisões com 3 alternativas e retorno escrito, 2 atividades "Na prática" de texto livre e fechamentos em texto.

**Qualidade editorial.** O pacote é sóbrio, cuidadoso e coerente com as diretrizes de proteção do brief: não promete selo, certificado nem contratação; não cita CIEE/IEL; não inventa slogan; não exige relato pessoal; não usa dados reais; explica consequências sem humilhar; prevê menor de idade (`nem-toda-brincadeira/a02`: "Se você é menor de idade, também pode procurar um adulto de confiança ou responsável pelo programa"); separa saúde de organização (`seu-ritmo-tambem-importa`); e, no tema IA, trata a invenção de fatos sem jargão ("A IA escreveu que haverá certificado na oficina. Você não informou isso"). As explicações têm frases de valor real para o aluno, por exemplo `travei-como-peco-ajuda/a01`: "Não existe obrigação de tentar primeiro uma ação perigosa para merecer ajuda"; `parece-verdade-sera/a02`: "Dizer 'não consegui confirmar' também é uma resposta responsável"; `nem-toda-brincadeira/a02`: "Não prometa sigilo que o canal não garante".

**Pontos fortes.**
- Temas que o catálogo não cobre: raciocínio aplicado (`por-onde-eu-comeco`, `faz-sentido`, `onde-esta-o-problema`), verificação de informação, IA, dados em prints e links, diferenças de estilo (`o-outro-so-e-diferente/a01`), impasse entre pares (`discordar-sem-brigar/a02`), proposta testável (`minha-ideia-tambem-conta`).
- Decisões com uma alternativa "errada" que é um erro real e recorrente de iniciante, e não uma caricatura: "Pergunto à mesma IA se ela tem certeza e aceito se disser que sim" (`ia-como-aliada/a02`), "Envio e peço que apaguem depois" (`seus-dados-tambem-trabalham/a01`), "Prometo compensar trabalhando sem parar" (`seu-ritmo-tambem-importa/a02`), "Envia um convite com um horário escolhido por você" (`por-onde-eu-comeco/a01`).
- Falas curtas (25 a 41 palavras), abaixo do limite de 120 que o simulador de alunos penaliza.

**Problemas sistêmicos (valem para os 15; detalhados no item 2 e no 5).**
1. **A resposta certa é previsível.** Em 28 das 30 decisões a alternativa recomendada é a 2ª; em 29 das 30 ela é a mais longa das três (conferido por script sobre os `curso.json`). O brief §9 pede explicitamente "Não premiar a mais longa". Com a posição e o tamanho denunciando a resposta, a decisão perde o valor diagnóstico.
2. **Dois distratores caricatos na maioria das decisões.** Não há a alternativa "razoável, mas incompleta" (o `ok` / "Quase lá" dos cursos atuais): "Concluir que não serve para trabalhar", "Tento mudar toda a minha personalidade", "Vamos mudar todos os sistemas hoje", "Minha ideia vai acabar com todas as dúvidas", "Ignoro, porque todo print é falso", "Está tudo impossível", "Não consigo fazer nada", "Clico para descobrir", "Guardar todas as versões com o nome final". O aluno não é convidado a pensar; é convidado a reconhecer o óbvio.
3. **A abertura da aula 2 entrega a resposta antes da pergunta** em pelo menos 9 cursos (ver item 2). A Revisão de transcrições já apontou isso nos cursos atuais ("Várias introduções ensinam a resposta antes de pedir uma escolha").
4. **Retornos explicam a consequência, mas quase nunca o próximo passo.** O brief §9 pede "o que a escolha resolve, o que falta e o próximo passo"; os retornos do pacote têm 1 frase de consequência ("A primeira entrega pode atrasar sem que ninguém consiga se reorganizar.").
5. **Uma decisão por aula** (30 no total), contra o modelo da aula curta do motor (abertura → caso → pergunta → reação → explicação → **pergunta** → Na prática), que nos cursos atuais rende 3 decisões por curso.
6. **Fora do padrão de fala da casa:** sem "Oi! Eu sou…/Hoje, vamos…", sem "Agora, vamos…" na aula 2, sem o fato do caso + "Agora, responda:" fechando o vídeo que antecede a pergunta, sem chamada da atividade, sem personagens nomeados (só "Dani"), sem título no formato "No lugar da X, o que você…?", alternativas ora em 1ª pessoa, ora no infinitivo, ora como mensagem solta.
7. **Práticas em texto livre de 800 caracteres**, enquanto o padrão implementado e pedido no brief §14 é montar a frase escolhendo uma opção por grupo (com título de grupo, uma prévia, "Prefiro escrever" e "Fazer depois").
8. **Fechamento idêntico nas 30 aulas** ("Guarde esse exemplo como ponto de partida. Na sua rotina, ajuste o plano ao que você sabe…") — "o plano" não faz sentido em aulas cujo produto é uma frase de apoio ou uma pergunta.
9. **Registro às vezes formal demais para 15–19 anos:** "atribuir uma intenção", "delimita", "não sustentada", "proporcional", "dependências", "sinal de resultado", "administrável", "hipótese", "evidência", "sistema de produção".
10. **Sobreposição alta com o catálogo atual** em 6 cursos (item 3): três são quase duplicatas de aulas de "Comecei a trabalhar" ou de "Brincadeiras têm limite".

Em resumo: o pacote vale a produção, mas não como está. Ele precisa de uma passada editorial única (posição e tamanho das alternativas, um distrator razoável por decisão, próximo passo nos retornos, aberturas e pontes no padrão da casa, montagem das práticas por grupos) e de uma decisão do dono sobre 6 sobreposições.

---

## 2. Curso a curso

Classificação: **pronto** (só forma/padrão da casa), **pequenos ajustes** (conteúdo pontual), **revisão importante** (sobreposição ou estrutura).

Os ajustes de forma comuns a todos (item 1, problemas 1–9) não são repetidos abaixo; cada ficha traz só o que é específico.

### 2.1 `o-outro-so-e-diferente` — O outro só é diferente (Patrícia) — **revisão importante**
- **Objetivo real:** separar preferência/estilo pessoal de atitude que humilha; não presumir intenção.
- **a01 (Dani fala pouco e manda sugestões por escrito):** situação nova no catálogo e bem resolvida. A explicação é exemplar ao evitar rótulos: "Não precisa investigar diagnóstico, crença ou vida pessoal". Ajustes: a pergunta "Como você reage?" é vaga; o aluno é um colega na conversa, então o título deveria ser "O que você responde ao colega?" com a situação completa no painel. A op3 "Exijo que Dani explique por que é assim" é caricata; trocar por algo plausível e incompleto, por exemplo "Digo ao colega que Dani manda sugestões por escrito e deixo por isso" (resolve o julgamento, mas não combina nada com a Dani). Retorno da op1 sem próximo passo.
- **a02 (colega imita sotaque; ela pede para parar; "é meu jeito de brincar"):** repete o que C06 (Bruno, q02 e q03), `nem-toda-brincadeira/a01` e as situações cv6 e ip4 das checagens já ensinam. As três alternativas são "aceitar", "mandar a vítima aguentar" e "apoiar": não há decisão. Recomendação: substituir a situação por outro caso de **diferença que não é erro** — colega de outra geração que prefere ligar em vez de mandar mensagem; colega que não participa do almoço coletivo por religião ou alimentação; ritmo de trabalho diferente — mantendo a tese da aula ("respeitar não é concordar com tudo") e deixando o limite/humilhação para "Brincadeiras têm limite".
- **Tom:** adequado; "atribuir uma intenção" e "combinar uma forma de participação" podem ficar mais coloquiais.
- **Riscos:** o a01 roça neurodiversidade sem nomear; está bem. "Sotaque" (a02) é tema de discriminação regional: se mantido, não deixar a resposta "certa" depender de o aluno confrontar o colega.

### 2.2 `ia-como-aliada` — IA como aliada (Enzo) — **pequenos ajustes**
- **Objetivo real:** pedir com objetivo/contexto/formato, conferir fatos, não colar dados.
- **Decisões:** a01 op1 "Escreva alguma coisa legal" é caricata; op3 "complete sozinho tudo o que estiver faltando" é um erro plausível, bom. A op2 recomendada é um prompt de 20 palavras (a mais longa, de novo). a02 é a melhor decisão do pacote: a op3 "Pergunto à mesma IA se ela tem certeza" é exatamente o que um iniciante faz. Sugestão para a01: acrescentar como "ok" a opção "Peço um convite e colo o e-mail da coordenação para a IA entender o contexto" — abre a conversa sobre dados que não devem entrar (consistente com a02).
- **Retornos:** op2 de a01 ("Ainda será preciso revisar") já aponta o próximo passo; os demais não.
- **Tom:** didático, um pouco expositivo ("Uma estrutura útil é: preciso de um resultado, para um público, usando estas informações, neste formato"). Transformar em exemplo falado.
- **Riscos / confirmar com o dono:** (1) "ferramenta autorizada no contexto do trabalho" depende da política da organização, como o próprio catálogo registra; muitas organizações proíbem IA em dados de cliente; (2) idade: ferramentas populares exigem 13+ com consentimento ou 18+; a fala "uma ferramenta autorizada" cobre, mas a abertura do curso deveria dizer uma vez "se a sua organização permite e você tem idade para usar a ferramenta"; (3) não citar marcas (está correto hoje).
- **Prática:** "checklist de três verificações" vira scaffold natural (3 grupos: fatos / invenções / dados).

### 2.3 `parece-verdade-sera` — Parece verdade. Será? (Enzo) — **pequenos ajustes**
- **Objetivo real:** verificar origem, data e contexto antes de repassar ou agir.
- **Decisões:** a01 op3 "Ignoro, porque todo print é falso" é caricata; trocar por "Pergunto no grupo quem publicou e espero alguém responder" (ok: busca a fonte, mas sem o canal oficial e sem avisar que não está confirmado). a02: op1 e op3 (três posts = três confirmações; muitos seguidores) são erros reais de leitura de rede, aceitáveis, mas a op2 tem 17 palavras contra 6 e 7.
- **Sobreposição:** a02 (vaga divulgada por perfis sem fonte) conversa com C14·A3 (golpes: "procure a vaga no site oficial antes de enviar qualquer documento"). Não é duplicata — o foco aqui é não repassar sem fonte — mas a explicação de a02 ("Confira o domínio e evite fornecer dados só porque a mensagem parece urgente") repete C14·A3·v06 quase literalmente. Reduzir a um gancho: "Se o aviso pede dados ou dinheiro, vale o que você viu em Minha primeira vaga".
- **Tom:** bom. "Confira o domínio" é técnico; preferir "confira se o endereço do site é mesmo o da organização".
- **Riscos:** nenhum fato a confirmar.

### 2.4 `seus-dados-tambem-trabalham` — Seus dados também trabalham (Thiago) — **pequenos ajustes**
- **Objetivo real:** não expor dados ao pedir ajuda com print; conferir destinatário e permissão de link.
- **Título:** "Seus dados também trabalham" não comunica o conteúdo a um adolescente e sugere outro assunto (monetização de dados). Alternativas: "O que aparece no seu print?" ou "Antes de enviar, confira".
- **Decisões:** a01 é concreta e boa (telefone de cliente e conversa pessoal ao fundo); a op3 "Envio e peço que apaguem depois" é plausível. a02 (link "qualquer pessoa com o link") é útil; op3 "Publico no grupo mais amplo para alguém encaminhar" é fraca, trocar por "Mando o link e aviso para não repassar" (ok: cuida da circulação, mas não da permissão).
- **Sobreposição controlada:** C04·A2·v03 já diz "confira destinatário, conteúdo e anexos" e C09·A2 trata de comunicar exposição. Aqui o ângulo é interno (ajuda com print, acesso a planilha), portanto manter, citando C04/C09 como pré-requisito recomendado.
- **Riscos:** não cita LGPD nem faz afirmação legal: correto. "Procedimento interno" supõe que exista; a fala já diz "peça ajuda para conter o acesso", que cobre quem não tem procedimento.

### 2.5 `tudo-e-urgente` — Tudo é urgente? (Júlia) — **revisão importante**
- **Objetivo real:** tornar visível um conflito de prazo e pedir decisão de prioridade.
- **Sobreposição:** a02 repete C13·A3·q05 (Luana: lista até as 15h, relatório às 14h30, meia hora cada) na estrutura e nos números (1 h; A 40 min; B 50 min), e a prática a02 ("Tenho A e B para a mesma hora e consigo concluir uma. Qual priorizamos…") é quase idêntica ao exemplo de C13·A3·m03 ("Tenho duas entregas para o mesmo horário e só consigo concluir uma. Posso priorizar a lista e combinar outro prazo…"). Também repete `seu-ritmo-tambem-importa/a02` (pedido de ajuste).
- **Decisões:** a01 op1 "Abandono a tarefa anterior sem avisar" é caricata; op3 "Prometo entregar as duas" é plausível. a02 tem duas mensagens de 4 palavras ("Vou dar um jeito." / "Não consigo fazer nada.") contra uma de 20.
- **Recomendação:** fundir com `seu-ritmo-tambem-importa` em um só curso "Tudo é urgente?": a01 = pedido "para agora" sem prazo nem impacto (deste curso); a02 = quando as tarefas não cabem: listar demandas, prazos e bloqueios e pedir ajuste (de `seu-ritmo`, que é o conteúdo novo). Cortar a cena de 40/50 minutos.
- **Riscos:** "Não é necessário prometer trabalho fora do horário" é uma boa proteção; manter.

### 2.6 `travei-como-peco-ajuda` — Travei. Como peço ajuda? (Renato) — **revisão importante**
- **Objetivo real:** saber quando parar de tentar (ação difícil de desfazer) e pedir ajuda com contexto.
- **a01 (botão que pode apagar a pasta da equipe):** é a contribuição nova do curso e das melhores do pacote; a explicação ("o erro precisa ser reversível e o teste autorizado… Não existe obrigação de tentar primeiro uma ação perigosa para merecer ajuda") responde ao brief §9 ("não tratar como inadequado: precisar de apoio"). A op3 "Tento em vários arquivos até entender" é caricata; trocar por "Procuro a ajuda do sistema e tento só se parecer simples" (ok: busca informação, mas ainda arrisca).
- **a02 (exportar relatório; erro ao selecionar período; já conferi as datas):** duplicata de C13·A2·q03 ("Eu explico o caso, minha consulta e a dúvida específica") e de pe4 (Bianca: "Explico o que estou fazendo, o que já tentei e a mensagem de erro"). Até a op3 "Você pode fazer tudo por mim?" ecoa C13·A2·q03·B.
- **Recomendação:** não produzir como curso. Levar a01 para `onde-esta-o-problema` como aula de abertura ("Antes de mexer, saiba se dá para desfazer") e aposentar a02. Alternativa, se o dono quiser manter o título: reescrever a02 com um ângulo ausente do catálogo — "pedi ajuda e a pessoa está ocupada: o que faço enquanto espero" (o que é seguro adiantar, como registrar o que já tentou, quando avisar que o prazo se aproxima).

### 2.7 `errei-e-agora` — Errei. E agora? (Beatriz) — **revisão importante**
- **Objetivo real:** avisar o erro com fatos, conter o impacto, mudar o processo.
- **Sobreposição:** espelha C13·A4 nas duas aulas: a01 (enviei versão antiga; aviso qual versão e indico a correta) = C13·A4·q06 (Caio: lista com três datas erradas; "aviso as linhas afetadas e proponho enviar a correção") e pe5 (João); a02 (mudança no processo: identificação da versão + conferência) = C13·A4·q07 ("confiro as datas com a fonte antes do envio"). O tom é bom ("frio na barriga"), mas o aluno que fez "Comecei a trabalhar" verá o mesmo caso.
- **Decisões:** a01 op3 "Apago meu arquivo e finjo que não enviei" é caricata; op1 "Espero alguém perceber" é plausível. a02 op3 "Guardar todas as versões com o nome final" não faz sentido como escolha.
- **Recomendação:** manter o curso (a trilha "Autonomia" precisa dele e C13 é o percurso inicial, não o aprofundamento), mas diferenciar os casos: a01 com um erro que **já produziu efeito** e foi percebido por outra pessoa (cliente recebeu valor errado; etiqueta impressa errada no estoque), trabalhando o que dizer quando ainda não se sabe o impacto e como reagir à reação do gestor; a02 com a prevenção proporcional (manter "Não é necessário criar dez etapas para todo erro pequeno").
- **Riscos:** cumpre o pedido do catálogo ("sem prometer ausência de consequências").

### 2.8 `minha-ideia-tambem-conta` — Minha ideia também conta (Gustavo) — **pequenos ajustes**
- **Objetivo real:** observar com fato e efeito; propor um teste pequeno com sinal de resultado.
- **Decisões:** a01 é boa (op1 "Esse processo é péssimo" é caricata mas reconhecível; op3 "Mudo a pasta da equipe sem avisar" é o erro real do iniciante com iniciativa). a02 é fraca: a abertura já diz "Um teste pequeno, combinado com a equipe, pode mostrar se a ideia ajuda" e as alternativas erradas são "Vamos mudar todos os sistemas hoje" e "Minha ideia vai acabar com todas as dúvidas". Substituir por opções razoáveis: "Crio o atalho e aviso no grupo que já está lá" (ok: age, mas sem autorização nem forma de avaliar) e "Peço que a liderança decida e não proponho nada" (deixa a ideia morrer).
- **Sobreposição leve:** C10·A2·v03 ("Se notar uma melhoria, apresente a ideia antes de mudar um procedimento compartilhado") — este curso aprofunda; manter.
- **Tom:** "sinal de resultado" e "delimita o teste" pedem tradução ("como saber se funcionou").

### 2.9 `discordar-sem-brigar` — Discordar sem brigar (Gustavo) — **pequenos ajustes** (beira revisão)
- **Objetivo real:** discordar ligando a preocupação ao objetivo comum; sair de impasse com critério.
- **a01 (colega quer enviar hoje; falta confirmar um dado):** mesmo movimento de C07·A2·q03 (Elisa: "apresento os dois prazos e proponho alinhar") e cv2; a diferença é o par (colega) em vez do gestor. A op1 "Você sempre faz tudo correndo" é caricata; op3 "Fico em silêncio" é plausível.
- **a02 (dois formatos; impasse entre pares):** conteúdo novo e útil ("Definam o critério antes de defender o formato"). Manter.
- **Recomendação:** diferenciar a01 de C07 trocando o caso para **receber** discordância ("um colega diz que seu jeito de organizar a planilha atrapalha o dele") ou para uma conversa que esquentou (como retomar o assunto sem devolver no mesmo tom). Assim o curso cobre os dois lados: discordar e ser contrariado.
- **Riscos:** nenhum.

### 2.10 `nem-toda-brincadeira` — Nem toda brincadeira é brincadeira (Patrícia) — **revisão importante**
- **Objetivo real:** reconhecer constrangimento; parar quando se participou; apoiar quem foi alvo sem expor.
- **Sobreposição forte, já reconhecida no LEIA_ME e no catálogo:** a01 (apelido sobre o corpo; ele pede que não usem) = C06·A1·q02 (Bruno: "Eu digo que entendi e paro de repetir a brincadeira"; retorno "Pare e reconheça o pedido sem exigir justificativa") e cv5/cv6 da checagem de Convivência. A frase-chave é a mesma: "Entendi. Não vou repetir" (aqui) × "entendi, vou parar" (Revisão, C06·A1·q02·B).
- **O que é novo:** a02 — apoiar uma colega que relata em particular e tem receio da liderança; o cuidado com exposição ("Publicar o relato dela para pressionar a equipe" é um erro real da geração das redes); "Não prometa sigilo que o canal não garante"; menor de idade. C06·A2 trata o mesmo tema em 1ª pessoa (quem sofre); aqui é a pessoa ao lado.
- **Recomendação:** fundir em "Brincadeiras têm limite" como aula 3 "Quando o alvo é outra pessoa" (uma decisão: a02 deste pacote; explicação de a02), descartando a01. O brief §5 pede que esse curso "continue abrangendo apelidos, preferências, contato pessoal e busca de apoio"; a aula 3 fecha o conjunto com o papel de quem assiste. Custo: 2 falas novas (abertura e explicação) em vez de 4, com a mesma instrutora (Patrícia, que já faz C06).
- **Riscos:** tema sensível tratado com cuidado; manter a frase de menor de idade e evitar "responsável pelo programa" como única porta (nem todo aluno está em programa): "um adulto de confiança, na escola ou no trabalho".

### 2.11 `seu-ritmo-tambem-importa` — Seu ritmo também importa (Júlia) — **revisão importante**
- **Objetivo real:** transformar "não dou conta" em lista de demandas, prazos e bloqueios; pedir ajuste sem detalhes pessoais.
- **Valor:** a tese da abertura ("Ter dificuldade para dar conta de tudo não prova falta de esforço") e o retorno de a01·op3 ("Uma situação de sobrecarga não define sua capacidade ou seu valor") são exatamente o equilíbrio que o brief §1 pede. A op3 de a02 "Prometo compensar trabalhando sem parar" é um ótimo distrator.
- **Sobreposição:** a02 = `tudo-e-urgente/a02` e C13·A3 (apresentar conflito e proposta). a01 = C13·A3·v04 ("Anote a tarefa, o prazo e o que falta para concluir").
- **Risco de saúde:** o título sugere tema de saúde/neurodiversidade; a fala a01 "Se o mal-estar persistir ou afetar sua rotina, busque apoio de confiança e atendimento adequado quando necessário" é correta e suficiente, mas "atendimento adequado" é vago sem ser orientação clínica. Manter curta, sem ampliar; não é lugar de linha de apoio nem de diagnóstico.
- **Recomendação:** fundir com `tudo-e-urgente` (ver 2.5), preservando a tese e o distrator acima. Se o dono preferir manter dois cursos, este precisa deixar de pedir ajuste de prazo (já em `tudo-e-urgente`) e tratar só de **capacidade**: o que depende de mim, o que depende de outra pessoa, como dizer "não cabe" sem se justificar com a vida pessoal.

### 2.12 `aprender-faz-parte` — Aprender faz parte do trabalho (Helena) — **revisão importante**
- **Objetivo real:** transformar um retorno em uma prática observável com momento de revisão.
- **Sobreposição 1:1 com C13·A5:** a01 (recados incompletos → "pergunto quais informações costumam faltar e escolho uma melhoria") = C13·A5·q08 (Joana: "você precisa melhorar suas atualizações" → "peço um exemplo e pergunto o que deveria incluir"); a02 (nos próximos três recados confiro o prazo e peço retorno) = C13·A5·q09·A ("incluo pendências nas atualizações e peço revisão na sexta"). Também repete C12·A2 (combinar ajuste e revisão). A situação de a02 ("Seu foco é enviar recados com prazo claro.") não é uma situação: não há caso.
- **Decisões:** a01 op1 "Decido que sou ruim de comunicação" é plausível e vale manter; op3 "Tento mudar toda a minha personalidade" é caricata.
- **Recomendação:** reorientar o curso para o que o catálogo não tem — aprender **sem** ter recebido retorno e **reconhecer progresso** (brief §11: "reconhecimento de progresso"): a01 "O que eu já faço com autonomia?" (registrar o que mudou desde o começo, sem copiar informação interna; escolher a próxima habilidade); a02 "Como aprender uma tarefa observando" (pedir para acompanhar, anotar, praticar, conferir — o enunciado de C13·A2·m02 já aponta esse roteiro, mas nenhuma decisão o trabalha). Nome possível: "O que eu já sei fazer?". Se não houver tempo, fundir em C13·A6.

### 2.13 `por-onde-eu-comeco` — Por onde eu começo? (Renato) — **pronto** (ajustes de forma)
- **Objetivo real:** entender o resultado esperado, separar o que se sabe do que falta, ordenar etapas por dependência.
- **Decisões:** as melhores do pacote. a01 (reunião com 6 pessoas; sem duração nem horários): op1 "Reserva uma sala no primeiro horário livre" e op3 "Envia um convite com um horário escolhido por você" são erros plausíveis e distintos; falta só uma gradação (op1 poderia ser "Reservo a sala e pergunto a duração depois" — ok). a02 (kits; conteúdo não confirmado): op3 "Comprar materiais antes de conferir o que já existe" é plausível.
- **Explicações:** claras e faláveis ("O resultado é uma reunião viável, não apenas uma sala reservada"; "Confirmar o conteúdo vem antes de separar").
- **Prática a01:** "Complete: preciso conseguir; já sei; falta descobrir; meu primeiro passo" já é um molde de 4 grupos; cabe direto no scaffold. a02 (plano de 4 etapas com marcação do que confirmar) também.
- **Riscos:** nenhum. Único cuidado: a abertura de a02 explica a dependência antes da pergunta; aceitável aqui porque a pergunta pede ordenar, não reconhecer o conceito.

### 2.14 `faz-sentido` — Faz sentido? (Helena) — **pequenos ajustes**
- **Objetivo real:** separar o que foi observado da interpretação; não concluir causa por coincidência.
- **a01 (gestor não respondeu; "ele não gostou do meu trabalho"):** situação muito boa para o público (ansiedade de iniciante). As duas erradas (op1 e op3) são a mesma coisa (interpretações); a certa é óbvia. Trocar op3 por "Que ele viu a mensagem e preferiu não responder agora" (ok: parece fato, mas "viu" não está confirmado) — mantém o exercício de separar observação de inferência.
- **a02 (ferramenta nova e atraso):** op3 "Concluir que a ferramenta nunca pode ser o problema" é caricata; trocar por "Pedir para voltar à ferramenta antiga até ter certeza" (ok: prudente, mas decide sem investigar).
- **Tom:** "hipótese", "evidências", "conclusão provisória" aparecem várias vezes; usar uma vez e explicar ("uma explicação possível, que ainda precisa de prova").
- **Riscos:** nenhum. Boa frase a manter: "Isso orienta uma investigação sem culpar alguém antes da hora".

### 2.15 `onde-esta-o-problema` — Onde está o problema? (Renato) — **pequenos ajustes**
- **Objetivo real:** descrever sintoma, testar uma hipótese por vez com segurança, confirmar o resultado final.
- **Contexto:** o caso (formulário de teste que não chega à caixa, endereço de destino configurado, ambiente de teste) supõe escritório/TI e usa "sistema de produção", "ambiente de teste", "mensagem de sucesso". Para quem está no balcão, no estoque ou na cozinha, soa distante. Manter o raciocínio, trocar a instância por algo tangível (impressora de etiqueta que não imprime o preço; pedido que não chega ao setor; QR do cardápio que abre a página errada) ou explicar "produção" como "o sistema que a equipe usa de verdade".
- **Decisões:** a01 op1 "Alterar todas as configurações" é caricata; op3 "Concluir que a internet está ruim" é plausível. a02 op3 "Repete envios sem verificar" é fraca; trocar por "Peço para alguém de fora testar também" (ok: boa ideia, mas sem conferir o destino não prova nada).
- **Recomendação estrutural:** receber a01 de `travei-como-peco-ajuda` como aula inicial ("Antes de mexer: dá para desfazer?"), o que dá 3 aulas e um curso de fechamento forte para a trilha "Pensar e resolver". Explicação a01 já contém a ponte ("Não use dados reais para experimentar nem altere um sistema…").
- **Riscos:** nenhum fato externo.

### Quadro-resumo

| Pasta | Classificação | Decisão editorial |
|---|---|---|
| por-onde-eu-comeco | pronto | produzir |
| faz-sentido | pequenos ajustes | produzir |
| onde-esta-o-problema | pequenos ajustes | produzir (+ a01 de Travei) |
| seus-dados-tambem-trabalham | pequenos ajustes | produzir (novo título) |
| parece-verdade-sera | pequenos ajustes | produzir |
| ia-como-aliada | pequenos ajustes | produzir após validar política de IA |
| minha-ideia-tambem-conta | pequenos ajustes | produzir (refazer a02) |
| discordar-sem-brigar | pequenos ajustes | produzir (diferenciar a01) |
| o-outro-so-e-diferente | revisão importante | produzir (substituir a02) |
| errei-e-agora | revisão importante | produzir (novos casos) |
| aprender-faz-parte | revisão importante | reorientar ("O que eu já sei fazer?") |
| tudo-e-urgente | revisão importante | fundir com Seu ritmo |
| seu-ritmo-tambem-importa | revisão importante | fundido em Tudo é urgente? |
| travei-como-peco-ajuda | revisão importante | a01 vai para Onde está o problema?; a02 descartada |
| nem-toda-brincadeira | revisão importante | vira aula 3 de Brincadeiras têm limite |

Resultado: 12 cursos novos + 1 aula nova em C06 (de 15 propostos).

---

## 3. Sobreposições

### 3.1 Com os 14 cursos atuais

| Novo | Existente | Grau | Recomendação |
|---|---|---|---|
| nem-toda-brincadeira a01 | C06·A1·q02 (Bruno) + cv5/cv6 | duplicata | **Fundir**: a02 vira aula 3 de C06; a01 cai. |
| nem-toda-brincadeira a02 | C06·A2 (procurar apoio, em 1ª pessoa) | complementar | Manter como aula 3 de C06 (papel de quem assiste). |
| o-outro-so-e-diferente a02 | C06 (q02/q03), ip4, cv6 | duplicata de tese | **Substituir** a02 por outro caso de diferença (2.1). |
| travei-como-peco-ajuda a02 | C13·A2·q03 + pe4 + C07·A1 | duplicata | **Fundir** a01 em Onde está o problema?; descartar a02. |
| errei-e-agora a01/a02 | C13·A4·q06/q07 + pe5 | duplicata de casos | **Diferenciar**: casos novos (erro com efeito já produzido; prevenção proporcional). |
| tudo-e-urgente a02 | C13·A3·q05 + m03; C07·A2 | duplicata | **Fundir** com Seu ritmo; cortar a cena 40/50 min. |
| seu-ritmo a01/a02 | C13·A3·v04; tudo-e-urgente a02 | parcial | Fundido (2.11). |
| aprender-faz-parte a01/a02 | C13·A5·q08/q09; C12·A2 | duplicata | **Substituir** o ângulo: progresso e aprendizagem sem retorno (2.12). |
| discordar-sem-brigar a01 | C07·A2·q03 + cv2 | movimento igual, interlocutor diferente | **Diferenciar**: receber discordância / conversa que esquentou. |
| minha-ideia a02 | C10·A2·v03 | menção | Manter; C10 é pré-requisito sugerido. |
| seus-dados a02 | C04·A2·v03 ("destinatário, conteúdo e anexos"); C09·A2 | parcial | Manter; citar C04/C09; foco em permissão do link. |
| parece-verdade a02 | C14·A3·v06 (golpes) | parcial | Manter; reduzir a repetição a um gancho. |
| ia-como-aliada | nenhum | — | Manter. |
| por-onde / faz-sentido / onde-esta | nenhum | — | Manter. |

Observação: o padrão "C13 tem uma aula para cada tema e o catálogo tem o curso específico" já existe hoje (C13·A1 ≈ C11/C07; C13·A2 ≈ C07·A1). A Revisão pediu "diferenciar as aulas [de C13] dos cursos específicos correspondentes". O pacote completa os específicos que faltavam (A3 → Tudo é urgente?; A4 → Errei; A5/A6 → Aprender/Minha ideia). Isso é desejável **desde que os casos sejam outros** — hoje não são.

### 3.2 Entre os 15 novos

| Par | Problema | Recomendação |
|---|---|---|
| tudo-e-urgente × seu-ritmo | a02 de ambos é "mostrar bloqueio/capacidade e pedir decisão" | Fundir (2.5/2.11). |
| travei a01 × onde-esta a01 | ambos ensinam "tentativa segura / reversível / autorizada" | Fundir (2.6/2.15). |
| nem-toda × o-outro a02 | ambos: brincadeira/imitação, pedido para parar, apoio | Resolver via C06 (3.1). |
| ia-como-aliada a02 × parece-verdade | ambos: "parece seguro e está errado; confira na fonte" | Manter os dois; são a mesma competência em objetos diferentes (texto gerado × print recebido); ordenar Parece verdade → IA na trilha. |
| seus-dados a01 × ia-como-aliada a02 | "não cole dados reais" aparece nos dois | Manter; em IA, uma frase; em Seus dados, a aula inteira. |
| aprender-faz-parte a02 × minha-ideia a02 | ambos: "plano pequeno + sinal para avaliar" | Reorientar Aprender (2.12). |
| discordar a01 × minha-ideia a01 | ambos: "fale do fato, não da pessoa" | Aceitável; estilos diferentes (discordar × observar). |
| faz-sentido a01 × o-outro a01 | ambos: "não preencha o silêncio com uma explicação pronta" | Aceitável; um é raciocínio, outro é convivência. Citar um ao outro na explicação. |

---

## 4. Arquitetura de trilhas (14 atuais + novos)

Premissas: o Selo DNA Work é por trilha e exige checagem final própria (6 situações novas, 5 acertos); cada trilha nova precisa dessa checagem escrita; trilhas de 3 a 5 cursos; as 4 trilhas atuais já têm checagem e cursos publicados, então mudar sua composição custa reescrever situações e pode confundir quem já está no meio. A proposta mantém as 4 trilhas atuais intactas e cria 4 novas, com os cursos já fundidos (item 2). Total: 26 cursos em 8 trilhas.

### Momento 1 — Procurando vaga · Momento 2 — Começando

**T1 · Primeiro emprego** (existente, sem mudança; checagem pronta)
- Objetivo: conseguir a vaga, chegar bem e passar pelas primeiras semanas.
- Ordem: Minha primeira vaga → Meu primeiro dia → Comecei a trabalhar.
- Porta de entrada: Minha primeira vaga (quem ainda procura) ou Comecei a trabalhar (quem já começou; o catálogo deve oferecer as duas portas, brief §15).
- Pré-requisito: nenhum.

### Momento 3 — Situações do dia a dia

**T2 · Rotina e combinados** (existente, sem mudança)
- Objetivo: horários, celular, mensagens, regras vagas e entrega.
- Ordem: Horário é combinado → Celular no trabalho → WhatsApp sem complicação → Não entendi. Posso perguntar? → Terminei. E agora?.
- Porta: Horário é combinado. Pré-requisito sugerido: Comecei a trabalhar.

**T3 · Imagem e postura** (existente, sem mudança)
- Objetivo: roupa, exposição nas redes, receber correção.
- Ordem: Que roupa eu uso? → Posso postar isso? → Recebi uma correção. E agora?.
- Porta: Que roupa eu uso?.

**T4 · Convivência** (existente; C06 ganha a aula 3 "Quando o alvo é outra pessoa")
- Objetivo: conversar com a equipe, cuidar do espaço, limites.
- Ordem: Como falar com a equipe → O espaço também é do outro → Brincadeiras têm limite.
- Porta: Como falar com a equipe. A checagem atual (cv1–cv6) já cobre apelido e limite; a aula 3 pede trocar uma situação (sugiro cv3 ou cv4) por uma de apoio a colega.

**T5 · Respeito e diálogo** (nova)
- Objetivo: lidar com diferenças, discordar sem brigar e trazer ideias.
- Ordem: O outro só é diferente → Discordar sem brigar → Minha ideia também conta.
- Porta: O outro só é diferente. Pré-requisito sugerido: Convivência (ou pelo menos Como falar com a equipe).
- Checagem: 6 situações novas (diferença de estilo; comentário sobre crença/alimentação; discordar do colega; receber discordância; impasse; proposta de melhoria).

**T6 · Tecnologia com critério** (nova; nome do pacote)
- Objetivo: proteger dados, verificar informação, usar IA com critério.
- Ordem: Antes de enviar, confira (ex-Seus dados) → Parece verdade. Será? → IA como aliada.
- Porta: Antes de enviar, confira. Pré-requisito sugerido: Posso postar isso? e WhatsApp sem complicação.
- Checagem: 6 situações (print com dado de cliente; link aberto; aviso sem fonte; vaga repassada; texto de IA com fato inventado; pedido de IA com dado interno).

### Momento 4 — Crescimento

**T7 · Autonomia no trabalho** (nova; 3 cursos após fusões)
- Objetivo: priorizar, reparar erros e escolher o próximo aprendizado.
- Ordem: Tudo é urgente? (com Seu ritmo) → Errei. E agora? → O que eu já sei fazer? (ex-Aprender faz parte).
- Porta: Tudo é urgente?. Pré-requisito: Comecei a trabalhar (este é o aprofundamento das aulas A3–A6).
- Checagem: 6 situações distintas das de C13 (pe3–pe5 já usam confirmar pedido, pedir ajuda e avisar erro; evitar repetir).

**T8 · Pensar e resolver** (nova; nome do pacote)
- Objetivo: entender antes de fazer, separar fato de suposição, investigar com segurança.
- Ordem: Por onde eu começo? → Faz sentido? → Onde está o problema? (com a aula "dá para desfazer?" de Travei).
- Porta: Por onde eu começo?. Pré-requisito: nenhum (o catálogo diz "sem pré-requisito"; manter).
- Checagem: 6 situações (pedido aberto; ordem de etapas; observação × interpretação; coincidência × causa; ação irreversível; confirmar resultado).

### Mapa por momento (visão do catálogo)

| Momento | Trilhas | Entrada recomendada |
|---|---|---|
| Procurando vaga | T1 (Minha primeira vaga) | Minha primeira vaga |
| Começando no trabalho | T1 (Meu primeiro dia, Comecei a trabalhar) → T2 | Comecei a trabalhar |
| Dia a dia | T2, T3, T4, T5, T6 | qualquer porta de trilha |
| Crescimento | T7, T8 | Tudo é urgente? / Por onde eu começo? |

Tamanhos: 3, 5, 3, 3, 3, 3, 3, 3. Nenhuma trilha com 1–2 cursos; nenhuma acima de 5.

Variante com mais mudança (só se o dono quiser reescrever checagens): mover "Recebi uma correção. E agora?" de T3 para T7 e "Antes de enviar, confira" para T3 (que viraria "Imagem e exposição": roupa, postar, dados). É mais lógico tematicamente, mas exige trocar ip3/ip4 da checagem de Imagem e postura e refazer a de Autonomia. Não recomendo agora.

---

## 5. O PROMPT_PORTAL_DNA.md como instrução de construção

### 5.1 Conflitos com o motor e com as lições da semana

| § do prompt | O que diz | O que o motor / a casa faz | Consequência |
|---|---|---|---|
| §3 | "somente feedback da alternativa selecionada… O feedback é textual: não gerar três vídeos" | Cada opção tem `reaction` (vídeo de plano único, 8–26 palavras, `reaction.ts`) seguida do retorno escrito "Sua escolha". As 14 cursos usam reação em vídeo. | Ou se escrevem 3 reações faladas por decisão (90 vídeos curtos, pagos) ou os novos cursos ficam sem reação (`reaction` ausente: o player segue). Decisão de orçamento do dono. As reações não podem abrir todas com a mesma interjeição nem dizer "Seja qual for a sua escolha". |
| §3 | "possibilidade de comparar outra escolha" / botão "Comparar outra escolha" | O player não tem retorno à decisão depois de confirmada ("Tentar de novo" existe só para erro de rede; `lesson-player.tsx:83,153`). | Retirar o botão e a frase "Após qualquer feedback… 'Comparar outra escolha' volta à decisão" dos 30 roteiros. A "segunda tentativa" do brief é conteúdo (nova situação), não botão. |
| §3 | Fluxo com uma decisão por aula | Aula curta: abertura → caso → pergunta → reação → explicação → **pergunta** → Na prática → fim; cursos atuais têm 2 decisões na aula 1. | Escrever uma 2ª decisão na aula 1 de cada curso (12 novas), idealmente "mesma situação, condição diferente". |
| §3 | "Preserve a redação dos roteiros" | Padrão de abertura "Oi! Eu sou a/o X, sua orientadora/seu orientador neste curso da DNA Work. Hoje, vamos…" (library-defaults `abertura-aula`); aula 2 "Agora, vamos…"; chamada natural da atividade; o vídeo antes da pergunta termina com o fato do caso + "Agora, responda: …"; vídeo próprio da pergunta não repete. | Reescrever as 30 aberturas; nenhuma das 60 falas termina com "Agora, responda". A redação do pacote é ponto de partida, não texto final. |
| §4 | "texto curto, não preenchimento de lacunas. Não inventar menus de alternativas" | "Na prática" implementada e pedida no brief §14: molde com grupos (título/pergunta por grupo, 2–5 opções, uma prévia "Sua resposta", "Prefiro escrever", "Salvar no meu roteiro", "Fazer depois" só se a cena é opcional). | Escrever 30 scaffolds (`template` + `slots`). O texto livre continua possível via "Prefiro escrever"; 800 caracteres não é limite do grupo (`customMaxLength` ≤ 200 por lacuna). |
| §4 | "Minha resposta", "Resposta salva no seu roteiro", "Autorrevisão", "Ver um exemplo" | Rótulos fixos: "Sua resposta", "Resposta salva no Meu roteiro.", "Continuar aula". Não há campo de autorrevisão nem botão de exemplo; há `intro` (ponte no topo) e a prévia. | Descartar "Autorrevisão" e "Ver um exemplo"; o exemplo vira a primeira combinação dos grupos ou o `intro`. |
| §4 / §7 | "Fazer depois mantém pendência… Não marcar a prática como realizada" e "práticas opcionais ficam registradas como pendentes" | "Fazer depois" só aparece quando a reflexão tem `required:false` e **não salva nada** (`immersive-player.tsx:1875`). O Selo da trilha exige as práticas salvas (`badgeEligibility`). | Definir `required:false` nas 24–30 reflexões para liberar "Fazer depois"; explicar na ficha que o selo pede a prática salva. Não existe estado "pendente" além de "sem resposta". |
| §3 | onscreen_text do vídeo de explicação = enunciado da prática (nos 30 JSON) | Apoio visual: poucas palavras coerentes com a fala; a chamada da prática é falada e a ponte é o `intro`. | Trocar o texto de tela da explicação por 2–3 ideias da fala (o próprio roteiro.md já pede isso em "Apoio visual"). |
| §2 | "Não una nem substitua cursos por similaridade de nome" | Correto para o importador, mas a decisão editorial de fusão (item 3) vem **antes** da importação. | Importar só a lista final decidida pelo dono. |
| §5 | Instrutores Patrícia, Enzo, Thiago, Júlia, Renato, Beatriz, Gustavo, Helena | Todos já apresentam cursos publicados; a biblioteca só tem kits prontos para Marina e Rafael (`docs/biblioteca-de-modelos.md`); kit sem câmeras prontas é recusado e gerar câmeras é pago. | Extrair kits dos cursos publicados desses 8 instrutores antes de importar (script `biblioteca-modelos.ts`, leitura dos rascunhos). Confirmar que as câmeras existem. |
| §6/§8 | "quatro roteiros de vídeo por curso" | Com reações e 2ª decisão: 4 longos + 9 reações por curso. | Ajustar a contagem de validação e o orçamento. |
| §7 | "Não conceder selos…" | Correto. Mas cada trilha nova só dá selo com `TRAIL_CHECKS` escrito (`trails.ts`). | Falta pedir as 6 situações por trilha nova (24 no total) — o prompt não menciona. |

### 5.2 O que falta especificar

1. **Título e formato da pergunta:** "No lugar da X, o que você…?" quando há personagem; opções entre aspas e em 1ª pessoa ("Eu…"); situação completa no painel, inclusive o fato que decide.
2. **Marca de qualidade das opções:** `quality` `strong`/`ok`/`weak` (revisão de respostas "Forte"/"Pode melhorar"). O pacote só tem `recommended: true/false`; precisa de uma opção `ok` por decisão.
3. **Regras das reações:** 8–26 palavras; aberturas variadas; cada uma exclusiva da opção; sem "Seja qual for a sua escolha"; gesto por qualidade (`REACTION_GESTURE`) e proibição de "abre as duas mãos" / "move as duas mãos explicando".
4. **Ordem e tamanho das alternativas:** a certa muda de posição e não é sistematicamente a mais longa.
5. **Retorno escrito com três partes:** o que resolve, o que falta, o próximo passo ("Faça assim: …", como nos cursos atuais).
6. **Personagens:** um nome por curso, fio entre as duas aulas; nomes já usados a evitar (Luana, Davi, Bia, Rafael, Caio, Ana, Iara, Pedro, Lucas, Yasmin, Nina, Bruno, Elisa, André, Luan, Sara, Malu, Ícaro, Henrique, Jéssica, Duda, Miguel, Alana, Vitor, Joana, Júlia, Kaio, Lívia, Gabriel, Bianca, João, Tainá, Mateus, Larissa, Heitor, Sofia, Carol, Roberto; e os nomes das instrutoras e instrutores).
7. **Objetivos de aula no formato de competência** ("Você pergunta como a pessoa prefere contribuir"), porque o selo converte com `competencyFromObjective` ("Você…" → 3ª pessoa). Hoje os `objective` do JSON são imperativos iguais ao enunciado da prática.
8. **Cartão final "O que você levou"** (2 frases por aula) no lugar do fechamento em texto genérico; e itens do Meu roteiro (`recap`) por curso.
9. **Vinheta** depois do último vídeo longo da aula (a explicação), não depois do texto.
10. **Título curto, descrição de uma linha e capa** por curso (short-titles, ficha e catálogo).
11. **Trilha (`courses.trail`) e checagem final** por trilha nova.
12. **Sem avaliação de fim de módulo** (removidas; o pacote já não as tem, mas o prompt deveria dizer).

### 5.3 Versão revisada dos trechos que precisam mudar

Substituir o §3 "Construir cada aula" por:

> **3. Construir cada aula (modelo da aula curta do portal)**
> Fluxo: abertura com saudação e objetivo ("Oi! Eu sou a/o {nome}, sua orientadora/seu orientador neste curso da DNA Work. Hoje, vamos…"; aula 2: "Agora, vamos…") → caso narrado, terminando com o fato que decide + "Agora, responda: …" → pergunta (título "No lugar da X, o que você…?" quando há personagem; situação completa no painel; 3 opções entre aspas, em 1ª pessoa, com `quality` strong/ok/weak, posição da certa variável e tamanho equilibrado) → reação em vídeo da opção escolhida (8–26 palavras, exclusiva, abertura variada, sem "Seja qual for a sua escolha", gesto seguro) → retorno escrito (o que resolve, o que falta, o próximo passo) → explicação em vídeo que funciona após qualquer opção → segunda pergunta (mesma situação, condição diferente) na aula 1 → "Na prática" → cartão "O que você levou". O vídeo próprio da pergunta não repete a chamada. Não há "Comparar outra escolha" nem avaliação de fim de módulo. A vinheta entra depois do último vídeo longo da aula.

Substituir o §4 "Atividade Na prática" por:

> **4. Atividade "Na prática"**
> Título da atividade = ação específica ("Prepare uma frase de apoio"). Ponte de uma frase no topo (`intro`). Montagem por grupos: molde com 2 a 4 lacunas; cada grupo com título/pergunta e 3 a 4 opções curtas; "Prefiro escrever" ligado (até 200 caracteres por lacuna); uma prévia "Sua resposta"; "Salvar no meu roteiro"; "Resposta salva no Meu roteiro."; "Continuar aula"; "Fazer depois" apenas se a cena for opcional (`required:false`) — e nesse caso nada é salvo. Sem exemplo em botão, sem autorrevisão, sem nota. A resposta é modelo para adaptar; não pedir dados pessoais nem internos. O selo da trilha exige a prática salva: dizer isso na ficha, não na fala.

Acrescentar ao §5 "Mídias e instrutores":

> Antes de importar, extrair da biblioteca os kits (estúdio, câmeras, voz) dos 8 instrutores a partir dos cursos publicados; recusar importação para instrutor sem câmeras prontas. Direção de gesto: nunca "abre as duas mãos" nem "move as duas mãos explicando". Orçar separadamente vídeos longos (4 por curso) e reações (3 por decisão).

Acrescentar ao §7 "Progresso e publicação":

> Registrar `courses.trail` conforme a arquitetura aprovada e, para cada trilha nova, entregar 6 situações de checagem final no formato de `trails.ts` (caso completo, pergunta, 3 opções com retorno, 1 correta). Objetivos de aula no formato "Você + verbo" para a competência do selo.

Substituir no §2 a frase "Não una nem substitua cursos por similaridade de nome" por:

> Importar apenas a lista aprovada pelo dono após a revisão de sobreposições (docs/novos-cursos/analise-fable.md, item 3). Fusões e substituições são decisões editoriais prévias; o importador não as faz.

---

## 6. Ordem de produção

Critério: menor sobreposição, menor dependência do dono, trilhas que fecham cedo (selo disponível), instrutores com kit extraível.

1. **Por onde eu começo?** — pronto; porta de entrada de "Pensar e resolver"; práticas já em formato de molde.
2. **Faz sentido?** — pequenos ajustes; completa o par com o anterior.
3. **Onde está o problema?** (com a aula "dá para desfazer?" de Travei) — fecha a trilha "Pensar e resolver": primeira trilha nova com selo.
4. **Antes de enviar, confira** (ex-Seus dados) — sem dependência externa; porta de "Tecnologia com critério".
5. **Parece verdade. Será?** — sem dependência; segundo da mesma trilha.

Depois: IA como aliada (assim que a política de IA for validada; fecha "Tecnologia com critério"); Tudo é urgente? (fundido); Minha ideia também conta; Discordar sem brigar; O outro só é diferente (com a02 nova); Errei (casos novos); O que eu já sei fazer? (reorientado); aula 3 de Brincadeiras têm limite.

Antes de qualquer gravação, para cada curso: posição/tamanho das alternativas; uma opção `ok`; próximo passo nos retornos; 2ª decisão da aula 1; aberturas e pontes; scaffolds; cartão final; objetivos "Você…"; reações escritas (se aprovadas); e passagem pelo simulador de alunos de teste.

### Pendências que dependem do dono

1. **Fusões e substituições** (item 2/3): aprovar nem-toda → C06 aula 3; Seu ritmo → Tudo é urgente?; Travei a01 → Onde está o problema?; reorientar Aprender faz parte; substituir a02 de O outro; novos casos de Errei.
2. **Reações em vídeo** para os novos cursos: sim (90–117 vídeos curtos, pagos) ou não (consistência com os 14 atuais).
3. **Segunda decisão na aula 1:** confirmar que o modelo da aula curta vale para os novos (12 decisões e, com reações, 36 vídeos curtos a mais).
4. **Política de IA** da organização/dos parceiros (ia-como-aliada) e orientação sobre idade mínima das ferramentas.
5. **Nomes finais** dos cursos (sugestões: "Antes de enviar, confira"; "O que eu já sei fazer?"; manter os demais) e das trilhas novas ("Respeito e diálogo", "Tecnologia com critério", "Autonomia no trabalho", "Pensar e resolver").
6. **Checagens finais** das 4 trilhas novas (24 situações) e 1 situação nova na de Convivência: quem escreve e quando.
7. **Kits dos 8 instrutores** na biblioteca (extração dos cursos publicados; confirmar câmeras e vozes).
8. **"Fazer depois" nas práticas** dos novos cursos: deixar opcional (`required:false`) como pede o pacote, sabendo que o selo exige a prática salva.
9. **Vocabulário de "programa" e "canal"** em temas de apoio (nem-toda/a02): confirmar as portas reais de apoio que a DNA Work pode citar (escola, adulto de confiança, pessoa responsável no trabalho, agente de integração "se houver esse vínculo", como na Revisão item 23).
10. **Referência à saúde** em Tudo é urgente? (frase herdada de Seu ritmo): manter curta como está ou retirar; não ampliar.
