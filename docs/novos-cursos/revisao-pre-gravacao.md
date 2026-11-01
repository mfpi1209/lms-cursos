# Revisão pré-gravação — 12 cursos novos, aula 3 de "Liberdade e intimidade" e 24 checagens

Data: 31/10/2026. Só leitura: rascunhos lidos no banco (`course_drafts`, 13 documentos), `trails.ts`, o motor (`scaffold.ts`, `immersive-player.tsx`, `trail-check-form.tsx`) e os três documentos de contexto (`analise-fable.md`, `brief.md`, `revisao-fable.md`). Nada foi alterado além deste arquivo.

Base: 26 aulas, 52 decisões, 156 reações, 26 atividades "Na prática", 26 fechamentos, 24 situações de checagem. Cada aula foi lida na ordem em que o aluno assiste (abertura → decisão 1 → reação/retorno → explicação → decisão 2 → atividade → fim), e as 9 combinações de opções de cada atividade foram montadas com a mesma regra do compositor (`assembleScaffold`).

Convenções: caminho `curso/aula/nó/plano` ou `curso/aula/nó/opção`. Gravidade: **alta** (bloqueia a gravação ou o selo), **média** (muda uma fala gravada ou uma decisão), **baixa** (texto de tela ou acabamento). O que não aparece abaixo foi lido e está bom.

## 1. Veredito por curso

| Curso | Veredito | Motivo |
|---|---|---|
| Por onde eu começo? (`crs_dp9s7pdro9j6e3m0`) | **gravar após ajustes** (leves) | Yuri entra colado à explicação (v04·s3); "etapa 3" na fala; 2 reações repetem o retorno inteiro; objetivo da aula 2 com erro de concordância. |
| Faz sentido? (`crs_0ua5onij460lpzs0`) | **gravar após ajustes** | q01·b (ok) é uma interpretação acusatória, pior que a weak; q03·c caricata; v04·s1 começa sem sujeito; 3 reações repetem o retorno. |
| Onde está o problema? (`crs_d5rsi8gt36rv0qbq`) | **gravar após ajustes** | 3 alternativas caricatas/autodenunciantes; "sistema de produção" na fala; 2 reações repetem o retorno. Decisão do dono: o caso "formulário de teste / caixa esperada" (aulas 2 e 3) segue abstrato para quem está no balcão (analise-fable 2.15). |
| Seus dados também trabalham (`crs_tg9iqz8wmmf5pw77`) | **gravar após ajustes** | A explicação da aula 2 (v04·s2/s3) entrega a resposta da 2ª decisão e afirma um "procedimento interno" que ninguém confirmou; abertura com jargão; missão colada ao caso (v03·s2). |
| Parece verdade. Será? (`crs_au1463izc386by27`) | **gravar após ajustes** | q01·b "todo print é falso" é caricata e está classificada como ok; "confira o domínio" repete C14·A3; "o site dela" na chamada de q04. |
| IA como aliada (`crs_m60hsx8on6ebcyqg`) | **gravar após ajustes**; **não publicar** sem a política de IA | A explicação v04·s2 diz literalmente a resposta de q04 ("transforme em dados fictícios"). A fala já condiciona o uso a "ferramenta autorizada": a gravação não depende da política, a publicação sim. |
| Tudo é urgente? (`crs_4jh683s5h351z2db`) | **gravar após ajustes** | Frase de saúde em v04·s2 fala de um "mal-estar" que a aula nunca mencionou e cita "atendimento adequado" (fato a confirmar): tirar da gravação; q02·c com pessoa verbal errada; q04·a weak com retorno de ok; texto de tela de v04 cita a atividade que foi cortada. |
| Errei. E agora? (`crs_njtlqq7y7fyfeqcr`) | **gravar após ajustes** | A explicação v02·s2 entrega a resposta de q02 ("se alguém reagir com irritação…"); "R$ 480 / R$ 840" na fala (risco de leitura do TTS); objetivo da aula 2 com erro de concordância. |
| Aprender faz parte do trabalho (`crs_gl0hjkmqfgnnur9y`) | **gravar após ajustes** (um deles obrigatório) | **Alta:** a abertura promete "transformar feedback em um plano pequeno de desenvolvimento", que é o curso antigo; o curso reorientado é "o que já faço sozinho" e "aprender observando". Resto: 2 reações repetem o retorno. |
| Minha ideia também conta (`crs_5k5upah2xphlfvi5`) | **gravar após ajustes** (leves) | Só texto de tela (3 alternativas que denunciam o próprio defeito) e 1 reação longa demais. É o curso mais pronto. |
| Discordar sem brigar (`crs_2rt2rsoii8bpydp2`) | **gravar após ajustes** | A explicação da aula 1 fala de "discordar" logo depois de uma decisão sobre "receber a discordância" (v02·s1); q04·a "deixar o prazo estourar" está como ok e q04·b denuncia o próprio defeito; concordância "verificá-lo" na atividade. |
| O outro só é diferente (`crs_t303ykqfmhj3yb1g`) | **gravar após ajustes** | q02: a situação não diz que a necessidade do Otávio era urgente, e é a urgência que separa a strong da ok (muda a chamada gravada); q03: parar a piada (b) é tão adequado quanto convidar (a), aceitar as duas (brief §9); atividade da aula 2 perde o "?" do convite na montagem. |
| Liberdade e intimidade — aula 3 (`crs_b8zeh4b2gguseghq/aula_03`) | **gravar após ajustes** | O caso de q04 não é apresentado ("as piadas continuam": quais?); "responsável pelo programa" na fala e nas pílulas (fato a confirmar; a aula 2 do mesmo curso já lista as portas de apoio de outro jeito); "Rebeca" repete a personagem de Tudo é urgente?. |
| Checagens das 4 trilhas (`trails.ts`) | **não liberar o selo ainda** | **Alta:** nas 24 situações a opção correta é sempre a primeira ("a"), e o formulário não embaralha. Em 21 de 24 a correta também é a mais longa. 8 distratores caricatos. |

Em nenhum curso há promessa de selo por curso, agente de integração, "Comparar outra escolha" ou "Ver um exemplo". Nenhuma abertura da aula 2 entrega a resposta da 1ª decisão. As chamadas estão no fim da fala e batem com `bridge.call` (conferido nas 52). Os retornos têm as três partes nas 156 opções. As aberturas de reação não se repetem dentro de uma aula.

## 2. Padrões sistêmicos

**S1 · Checagem com resposta sempre na posição "a" (alta).** Nas 24 situações novas, `correct: true` está na primeira opção; `trail-check-form.tsx` renderiza na ordem do arquivo, sem embaralhar; as checagens existentes variam (b, a, b, c, a, b…). Quem marcar "a" em tudo ganha o selo. Correção (código, `trails.ts`): mover a opção correta para as posições abaixo e renumerar os ids a/b/c pela ordem nova:
rd1→b, rd2→c, rd3→a, rd4→b, rd5→c, rd6→a · tc1→c, tc2→a, tc3→b, tc4→c, tc5→b, tc6→a · au1→b, au2→a, au3→c, au4→b, au5→c, au6→a · pr1→c, pr2→b, pr3→a, pr4→c, pr5→b, pr6→a.
Também: em 21 de 24 a correta é a mais longa (rd2: 16 × 6 e 11 palavras; au4: 17 × 7 e 8; au5: 15 × 5 e 9). Os distratores reescritos na seção 4 já ficam mais longos; onde não, encurtar a correta uma ou duas palavras.

**S2 · 14 reações repetem o retorno inteiro (média, gravado).** O padrão da casa é reação = abertura + a 1ª parte do retorno; o painel "Sua escolha" mostra as três partes em seguida. Em 14 opções a reação chega a 23–26 palavras e inclui "Falta… Faça assim: …", que o aluno lê de novo logo depois (repetição vídeo × painel, lição P2/P6 da revisão anterior). Cortar para abertura + 1ª frase (textos no JSON): `dp9s a1·q01·c`, `dp9s a2·q04·c`, `0ua a1·q02·b`, `0ua a2·q04·a`, `2rt2 a2·q03·a`, `5k5 a1·q02·a`, `au14 a1·q02·c`, `njt a2·q03·b`, `gl0 a1·q02·a`, `gl0 a1·q02·c`, `d5r a2·q04·c`, `d5r a3·q06·b`, `b8z a3·q05·b`; `0ua a2·q03·c` é substituída (seção 4).

**S3 · Explicação que entrega a resposta da 2ª decisão (média, gravado).** Em três aulas a explicação diz, em uma frase, exatamente a opção strong que vem a seguir: `tg9 a2·v04·s2/s3` ("comunique pelo procedimento interno… não esconda nem presuma que apagar resolve" → q04 Wesley), `m60 a2·v04·s2` ("transforme o exemplo em dados fictícios" → q04 Samuel), `njt a1·v02·s2` ("se alguém reagir com irritação, ouça e volte ao que vai ser feito" → q02 Gisele). Brief §8: "decisão diagnóstica: não entregar a resposta antes". Correção: trocar a frase por uma pergunta-ponte ("E quando o envio já saiu errado? Veja o caso do Wesley.") e levar a regra para o fim da aula (texto, sem custo). Textos no JSON.

**S4 · Personagem da 2ª decisão sem ponte (baixa a média, gravado).** Lição P3 da revisão anterior: nos cursos atuais o personagem da pergunta 2 entra sem apresentação e só o cartão salva. Aqui, na maioria das aulas, o personagem tem plano próprio e a chamada carrega "no lugar de X" — bom. Quatro casos colam o personagem à frase anterior no mesmo plano: `dp9s a2·v04·s3` ("Se faltar algo, ajuste antes da entrega. O Yuri tem quatro etapas…"), `t303 a2·v03·s2` e `tg9 a2·v03·s2` (a frase da missão e o começo do caso no mesmo plano: lição P1), `njt a1·v02·s2/s3` (resolvido em S3). Correção: plano próprio para o caso, e "Veja o caso de X:" onde a transição é brusca. Evitar "Agora, o X… Agora, responda" (lição P8).

**S5 · Números e cifras na fala (baixa, gravado).** `njt a1·v01·s5` "digitou R$ 480 em vez de R$ 840"; `4jh a1·v02·s3` "para as 16h. Às 15h"; `dp9s a2·v04·chamada` "a etapa 3". A síntese de voz pode ler "erre cifrão quatrocentos e oitenta" ou "dezesseis agá". Escrever por extenso na fala (o painel mantém os algarismos). Conferir como o TTS leu "15h"/"14h30" em C13·A3 antes de decidir sobre as horas.

**S6 · Fechamentos prometem o roteiro (baixa, tela).** 13 fechamentos dizem "Seu plano fica no roteiro" (ou variantes). "Fazer depois" não salva nada (`immersive-player.tsx:1875`), e o brief §14 pede que nada prometa salvamento. Padrão: "Se você salvou, X fica no Meu roteiro." Textos no JSON.

**S7 · "Missão" × "Na prática" (baixa, decisão do dono).** As 25 aberturas dizem "tem uma missão para você", e a tela diz "Na prática" (item 45 da revisão anterior: sem ação nos cursos gravados). Aqui ainda não há gravação: trocar agora é grátis. Sugestão de padrão, se o dono quiser: "No fim desta aula, você vai praticar: <ação>." Não está no JSON por ser decisão de vocabulário da casa.

**S8 · Texto de tela da explicação = enunciado da prática (baixa, tela).** Pendência já registrada (analise-fable 5.1; importacao 2.3). As pílulas já trazem as ideias; basta trocar o `body` das 26 explicações por um título de 2 a 4 palavras (ex.: "Fato ou hipótese"). Não listado item a item.

**S9 · Alternativas que denunciam o próprio defeito (baixa, tela).** "…sem avisar ninguém", "…sem exemplos", "…e não proponho nada", "…sem verificar", "…só porque apareceu a mensagem". A revisão anterior já corrigiu isso em C09 (brief §9). Lista e textos na seção 4.

**S10 · Concordância na montagem das atividades.** Conferidas as 9 combinações de cada atividade. Dois problemas reais: `t303 a2·a02` (o compositor apaga o "?" final da opção, e o molde "{convite}. {saida}." vira "Estamos indo almoçar. Quer vir. Sem problema se não puder.") e `2rt2 a1·a01` ("Podemos verificá-lo" com "Falta conferir uma informação importante"). Um de clareza: `njt a1·a01` ("Enviei a versão anterior do arquivo. … Vou avisar quem recebeu e indicar o valor correto."). Os demais moldes fecham em todas as combinações, inclusive maiúscula inicial e pontuação colada.

**O que está bom e não deve ser mexido:** as aberturas "Oi! Eu sou…"; as chamadas (fato + "Agora, responda"); os casos de Por onde eu começo?, Faz sentido? (q02 Aurora), Minha ideia (q04 Leandro: segunda tentativa com condição diferente), Errei (q04 Elaine), Aprender (Priscila nas duas decisões), Onde está o problema? (q02 Cleiton, q04 Débora); as frases de proteção ("Sobrecarga não define a sua capacidade nem o seu valor", "Não existe obrigação de tentar primeiro uma ação perigosa para merecer ajuda", "Dizer 'não consegui confirmar' também é uma resposta responsável", "sem precisar contar a sua vida pessoal"); os retornos em três partes; as pílulas com palavras que a fala diz; e as pontes das atividades ("Você viu que…").

## 3. Problemas por curso

Formato: **caminho** — problema — gravidade — correção (o texto final está no JSON quando é aplicável).

### 3.1 O outro só é diferente (`crs_t303ykqfmhj3yb1g`, Patrícia)

1. **aula_01/v02/chamada + q02 (situação)** — A Fernanda combinou responder "no fim da manhã e no fim da tarde"; o Otávio "precisou de uma resposta". Nada diz que era urgente. Sem urgência, esperar o horário combinado (a, ok) é a resposta certa, e "pergunto como chamá-la quando for urgente" (c, strong) não tem base. Brief §9: o aluno precisa ter toda a informação — **média** (gravado) — chamada: "Hoje o Otávio precisou de uma resposta urgente dela e achou que ela estava ignorando o pedido. Agora, responda: no lugar do Otávio, o que você faz?" (27 palavras); `bridge.call` e situação iguais.
2. **aula_02/v03/s2** — "…escreva um convite que a pessoa possa recusar sem se explicar. A equipe almoça junta toda sexta." A missão e o caso no mesmo plano (S4) — **baixa** — s2 só a missão; s3: "A equipe almoça junta toda sexta. O Murilo nunca vai e come em outro lugar."
3. **aula_02/q03/b** — "Peço ao colega que pare com a brincadeira, sem falar com o Murilo." está como ok, mas responde ao que a situação apresenta (a piada) tanto quanto a (convidar). A explicação seguinte diz "não faça dele assunto", que é exatamente b. Brief §9: duas adequadas, aceitar ambas — **média** — `quality` strong; retorno e reação reescritos (JSON); na aresta `e_q03_b`, pontos +2 como em a.
4. **aula_02/q04/b (retorno)** — "por um canal adequado": canal a confirmar (importacao §6) — **baixa** — "…em particular ou com alguém de confiança."
5. **aula_02/a02 (atividade)** — Molde "{convite}. {saida}." com opções que terminam em "?": o compositor apaga a pontuação final da opção e o resultado é "Quer vir. Sem problema se não puder." — **média** (tela) — molde "{convite}? {saida}." e as três opções de convite terminando na pergunta (JSON).
6. **aula_02 (sobreposição)** — q04 (Isadora, sotaque) ainda toca o tema de "Brincadeiras têm limite" e da aula 3 nova. Aceitável: a resposta não depende de confronto e o foco é "ouvir quem foi alvo". Sem ação.

### 3.2 Discordar sem brigar (`crs_2rt2rsoii8bpydp2`, Gustavo)

1. **aula_01/v02/s1** — A decisão 1 é "receber uma crítica em público"; a explicação abre com "Fale da proposta, do dado ou do efeito esperado" (como discordar). Quem escolheu "fico quieto" ouve um conselho sobre outra situação — **média** (gravado) — s1: "Quando a crítica vem para você, peça um exemplo. Quando é você quem discorda, fale da proposta, do dado ou do efeito esperado."
2. **aula_01/q01/a** — "Fico quieto" presume aluno homem — **baixa** — "Não respondo e mudo a planilha sem perguntar nada a ele."
3. **aula_01/a01 (atividade)** — "Podemos verificá-lo antes do envio" + "Falta conferir uma informação importante" (feminino) — **baixa** — "Podemos verificar isso antes do envio".
4. **aula_02/q04** — a "Espero a resposta do destinatário, mesmo que o prazo passe de quarta" está como ok: deixar o prazo estourar não é "parte do caminho". b "Peço que o gestor escolha por nós e deixo de participar da conversa" denuncia o próprio defeito (S9), e levar ao gestor é o que a explicação sugere ("se a decisão couber a outra pessoa, apresentem as opções") — **média** — a → weak (reação atual serve); b → "Levo as duas opções ao gestor e peço que ele escolha.", ok, retorno e reação novos (JSON); arestas: `e_q04_a` sem pontos, `e_q04_b` +1.
5. **aula_02/q03/a (reação)** — 26 palavras com "Falta… Faça assim" (S2) — **média** — JSON.

### 3.3 Minha ideia também conta (`crs_5k5upah2xphlfvi5`, Gustavo)

1. **aula_01/q01/a** — "Esse processo é péssimo, é um absurdo ninguém conseguir achar nada." caricata (analise-fable 2.8) — **baixa** — "Digo ao gestor que esse processo é ruim e que ninguém acha nada." (o retorno continua valendo).
2. **aula_01/q02/a** — "…sem exemplos." denuncia o defeito (S9); a reação tem 26 palavras com "Faça assim" (S2) — **baixa / média** — "Digo que é uma impressão minha, de quem usa o formulário todo dia."; reação cortada (JSON).
3. **aula_02/q03/b** — "…e não proponho nada." (S9) — **baixa** — "Levo o problema à liderança e espero que ela diga o que fazer."

### 3.4 Seus dados também trabalham (`crs_tg9iqz8wmmf5pw77`, Thiago)

1. **aula_01/v01/s1** — "identificar informações expostas e escolher um compartilhamento adequado": jargão na primeira frase do curso (brief §7) — **baixa** (gravado) — "Hoje, vamos ver o que um print mostra sem querer e o que conferir antes de enviar um arquivo ou link."
2. **aula_01/a01 (grupo c)** — pergunta do grupo "E o que sobra de supérfluo?" — **baixa** — "O que mais pode sair?"
3. **aula_02/v03/s2** — missão e caso no mesmo plano (S4) — **baixa** — s2 só a missão; plano novo: "Você precisa compartilhar uma planilha interna."
4. **aula_02/q03/c** — "Publico no grupo mais amplo para alguém encaminhar." é fraca demais; a decisão fica sem ok (analise-fable 2.4) — **baixa** — "Mando o link como está e peço para ninguém repassar.", ok, retorno e reação novos (JSON); aresta `e_q03_c` +1.
5. **aula_02/v04/s2–s3** — "Se perceber um envio indevido, comunique pelo procedimento interno… Não esconda o ocorrido nem presuma que apagar sua mensagem resolve tudo." entrega a resposta de q04 (S3) e afirma um "procedimento interno" a confirmar (importacao §6) — **média** (gravado) — s2: "Se o nome do arquivo está certo, mas o link abre para qualquer pessoa, o problema continua: permissão também faz parte do envio."; s3: "E quando o envio já saiu errado? Veja o que aconteceu com o Wesley."; a regra vai para o fim da aula (JSON).
6. **aula_02/q04 (a, b, c)** — "procedimento" nos retornos e na opção strong — **baixa** — "a pessoa responsável" (JSON).
7. **Sobreposição** — a02 toca C04·A2 ("destinatário, conteúdo e anexos") e C09·A2; mantido como pré-requisito recomendado (decisão anterior). Sem ação.

### 3.5 Parece verdade. Será? (`crs_au1463izc386by27`, Enzo)

1. **aula_01/q01/b** — "Ignoro o print, porque todo print é falso." é a alternativa caricata que a análise mandou trocar, e aqui está classificada como **ok**; o retorno ("Você não espalha a dúvida, mas pode perder um aviso real") descreve outra atitude — **média** — "Não repasso e espero alguém confirmar no grupo.", ok, retorno e reação ajustados (JSON).
2. **aula_01/v01/chamada + q01** — "como você procede?" é formal para a chamada falada — **baixa** (gravado) — "…Agora, responda: o que você faz?"; título e situação idem.
3. **aula_01/q02/c (reação)** — 25 palavras com "Faça assim" (S2) — **média** — JSON.
4. **aula_02/q03/b (retorno)** — "…nem a segurança do link… antes de passar dados": a situação não tem link nem pedido de dados — **baixa** — JSON.
5. **aula_02/v04/s2 + pílula** — "Confira o domínio e evite fornecer dados…" repete C14·A3·v06 quase literalmente e "domínio" é técnico (analise-fable 2.3) — **média** (gravado) — "Confira se o endereço do site é mesmo o da organização e não entregue dados só porque a mensagem parece urgente. …"; pílula "Confira o **endereço do site**".
6. **aula_02/v04/chamada + q04** — "O site dela pede um pagamento pequeno": "dela" = da vaga? — **baixa** (gravado) — "O site indicado pede um pagamento pequeno para liberar a vaga."
7. **Checagem** — tc4 (Tales) repete q04 com a mesma opção strong, palavra por palavra. Ver seção 4.

### 3.6 IA como aliada (`crs_m60hsx8on6ebcyqg`, Enzo)

1. **aula_02/v04/s2 + pílula** — "Não cole cadastros, senhas ou documentos internos… transforme o exemplo em dados fictícios" é a opção strong de q04 (Samuel), dita 20 segundos antes (S3) — **média** (gravado) — s2: "A IA também não precisa de tudo o que está na sua tela para ajudar. Usar IA com critério inclui saber o que não entra no pedido, e quando não usar."; pílula 3 "O que **não entra** no pedido"; a regra completa vai para o fim da aula (JSON).
2. **aula_02/q03/b (retorno e reação)** — "o que não foi sustentado": registro formal — **baixa** — "o que ninguém confirmou" (JSON).
3. **Pendente do dono (não bloqueia a gravação):** política de uso de IA e idade mínima das ferramentas. A fala já diz "uma ferramenta autorizada no contexto do trabalho" e nunca cita marca; publicar só com a política confirmada.
4. **Ordem na trilha:** a vitrine ordena por título (importacao §3), então "IA como aliada" aparece antes de "Parece verdade. Será?". A recomendação Parece verdade → IA não é representável hoje; registrar.

### 3.7 Tudo é urgente? (`crs_4jh683s5h351z2db`, Júlia)

1. **aula_01/q02/c** — "Pergunto até quando preciso da lista e aviso do relatório." Quem precisa da lista é o gestor; a frase sai errada na voz da Rebeca — **média** (tela, mas confunde a escolha) — "Pergunto até quando ele precisa da lista e aviso do relatório."
2. **aula_01/q01/a** — "…sem avisar." (S9) — **baixa** — "Paro a tarefa combinada e começo o novo pedido, já que é ‘para agora’."
3. **aula_02/q03/a** — "Escondo a dificuldade de todo mundo e espero a situação passar sozinha." (S9, caricata) — **baixa** — "Vou fazendo o que dá e só aviso se alguma entrega atrasar."
4. **aula_02/v04 (texto de tela)** — "Organize três demandas fictícias por prazo, esforço estimado e dependência." é a atividade de "Seu ritmo" que foi cortada na fusão: referência a algo que não existe — **média** (tela) — "Separe o que precisa ser feito, o que depende de outra pessoa e o tempo disponível."
5. **aula_02/v04/s2** — "Se o mal-estar persistir ou afetar sua rotina, busque apoio de confiança e atendimento adequado quando necessário." A aula não falou de mal-estar (a abertura fala de "dificuldade para dar conta"); "atendimento adequado" é fato a confirmar (importacao §6, analise-fable 6.10); a frase cai entre "estimativas" e a pergunta sobre autorização, sem ligação (lição P1) — **média** (gravado) — s2 só "Estimativas podem mudar, então apresente como estimativa, não como promessa."; a proteção vai para o fim da aula, em texto (pode mudar depois sem custo): "Se a sobrecarga estiver pesando além do trabalho, procure alguém de confiança."
6. **aula_02/q04/a** — "Está tudo impossível, não vou conseguir entregar nada no prazo e não sei o que fazer." é caricata (analise-fable 2.5 "Não consigo fazer nada"); está como weak, mas retorno ("mostra desconforto, mas não explica qual ajuste") e abertura da reação ("Vale pensar no que fica de fora") são de ok. Brief §9: não tratar como inadequado "precisar de apoio" — **média** — "Estou com muita coisa e não vou conseguir entregar tudo no prazo.", ok; retorno e reação atuais servem; aresta `e_q04_a` +1.
7. **aula_02/v05/s2** — "tornar a carga administrável" (analise-fable: registro) — **baixa** (gravado) — "O objetivo é que o trabalho caiba no tempo, respeitando os combinados e o que é de cada função."
8. **aula_01/v02/s3** — "16h"/"15h" na fala (S5): conferir leitura do TTS.
9. **Checagem** — au1 (Odilon, 14h/13h) repete q02 (Rebeca, 16h/15h). Ver seção 4.

### 3.8 Errei. E agora? (`crs_njtlqq7y7fyfeqcr`, Beatriz)

1. **aula_01/v01/s5** — "digitou R$ 480 em vez de R$ 840" (S5) — **baixa** (gravado) — "digitou quatrocentos e oitenta reais em vez de oitocentos e quarenta." O painel mantém "R$ 480 / R$ 840".
2. **aula_01/v02/s2–s3** — "Se alguém reagir com irritação, ouça e volte ao que vai ser feito." é a resposta de q02 (Gisele), dita antes (S3) — **média** (gravado) — s2 sem a frase; s3: "E se alguém reagir com irritação? O gestor da Gisele ficou irritado ao saber do erro no orçamento e disse que ela deveria ter conferido."; a frase vai para o fim da aula 1 (JSON).
3. **aula_01/q01/c** — "…para ninguém ficar chateado comigo." (S9) — **baixa** — "Digo que deve ter sido falha do sistema."
4. **aula_01/a01 (atividade)** — "Enviei a versão anterior do arquivo" + "Vou avisar quem recebeu e indicar o valor correto" — **baixa** — passo 1: "Vou avisar quem recebeu e mandar a correção".
5. **aula_02/q03/b (reação)** — 24 palavras com "Faça assim" (S2) — **média** — JSON.
6. **obj_aula_02 + descrição da aula 2** — "…e diga como verificar" — **baixa** — "…e diz como verificar se ela reduziu o erro."
7. **Sobreposição com C13·A4** — casos diferentes (orçamento aceito pelo cliente; reação do gestor; proporção da conferência). Resolvido.

### 3.9 Aprender faz parte do trabalho (`crs_gl0hjkmqfgnnur9y`, Helena)

1. **aula_01/v01/s1** — "Hoje, vamos transformar feedback em um plano pequeno de desenvolvimento." É o objetivo do curso **antes** da reorientação (C13·A5); o curso gravado trata de reconhecer o que já se faz sozinho e aprender observando. A promessa não é cumprida e tem jargão ("plano de desenvolvimento") — **alta** (gravado; sem isso, não gravar a aula 1) — "Oi! Eu sou a Helena, sua orientadora neste curso da DNA Work. Hoje, vamos reconhecer o que você já faz sozinho e aprender uma tarefa nova observando quem já faz." Conferir também `brief.topic`/`finalSkill` do rascunho, que podem guardar a frase antiga.
2. **aula_01/q02/a e c (reações)** — 25 e 24 palavras com "Faça assim" (S2) — **média** — JSON.
3. **Sobreposição com C13·A5/C12·A2** — resolvida pela reorientação (Valentina, Fábio, Priscila/Sérgio são casos novos).

### 3.10 Por onde eu começo? (`crs_dp9s7pdro9j6e3m0`, Renato)

1. **aula_02/v04/s3 + chamada** — "Se faltar algo, ajuste antes da entrega. O Yuri tem quatro etapas…" no mesmo plano (S4); "a etapa 3" na fala (S5) — **média** (gravado) — s3 só "Se faltar algo, ajuste antes da entrega."; plano novo: "Veja o caso do Yuri: ele tem quatro etapas para organizar um evento."; chamada: "Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado. Agora, responda: no lugar do Yuri, o que você faz?"
2. **aula_01/q01/c e aula_02/q04/c (reações)** — 25 palavras com "Faça assim" (S2) — **média** — JSON.
3. **aula_01/q01/c** — "um horário que eu mesmo escolhi" presume aluno homem — **baixa** — "…com um horário que eu escolhi."
4. **obj_aula_02 + descrição da aula 2** — "…e marque o que precisa ser confirmado" — **baixa** — "…e marca o que precisa ser confirmado antes de começar."
5. **aula_02/a02 (atividade)** — a ponte pede "organize… na ordem certa" e o título "marque o que precisa ser confirmado", mas os grupos têm ordem fixa e nada é marcado; e1 tem duas opções quase iguais ("Confirmar o conteúdo do kit" / "Confirmar o que cada kit leva") — **baixa** — ponte e título sem "marque/ordem"; 2ª opção de e1 "Confirmar o prazo de entrega" (JSON).

### 3.11 Faz sentido? (`crs_0ua5onij460lpzs0`, Helena)

1. **aula_01/q01/b** — "Que ele decidiu ignorar de propósito a minha mensagem." está como **ok**, mas é uma interpretação tão sem base quanto a weak (a), e mais acusatória. A alternativa ok precisa parecer fato sem ser (analise-fable 2.14) — **média** — "Que ele viu a mensagem e ainda não respondeu."; retorno e reação novos (JSON: "viu" não foi confirmado).
2. **aula_02/q03/c** — "Concluo que a ferramenta nunca pode ser o problema, em caso nenhum." caricata (analise-fable 2.14) — **média** — "Peço para voltar à ferramenta antiga até termos certeza.", ok, retorno e reação novos (JSON); aresta `e_q03_c` +1.
3. **aula_02/v04/s1** — "Pode ter faltado informação, treinamento ou autorização." começa sem sujeito; depois da reação, não fica claro do que se fala — **baixa** (gravado) — "O atraso pode ter outras causas: faltou informação, treinamento ou autorização."
4. **aula_01/q02/b e aula_02/q04/a (reações)** — 23 e 26 palavras com "Faça assim" (S2) — **média** — JSON.
5. **Registro** — "hipótese", "evidência", "conclusão provisória" aparecem várias vezes; a fala explica "uma conclusão provisória pode ser: ainda não sabemos a causa". Aceitável.

### 3.12 Onde está o problema? (`crs_d5rsi8gt36rv0qbq`, Renato)

1. **aula_01/q01/c** — "Tento em vários arquivos até entender o botão." caricata (analise-fable 2.6) — **baixa** — "Procuro a ajuda do sistema e, se parecer simples, tento.", ok, retorno e reação novos (JSON); aresta `e_q01_c` +1.
2. **aula_02/q03/b** — "Altero todas as configurações do formulário até voltar a funcionar." caricata (analise-fable 2.15) — **baixa** — "Refaço o formulário do zero, para garantir que vai funcionar."; retorno e reação ajustados (JSON).
3. **aula_02/q03/c** — "…e não olho mais nada, sem verificar." (S9) — **baixa** — "Acho que é a internet e espero a conexão melhorar."
4. **aula_02/v04/s2** — "sistema de produção" (analise-fable 2.15) — **baixa** (gravado) — "…nem mexa no sistema que a equipe usa de verdade só para descobrir o que acontece."
5. **aula_03/q05/a** — "Encerro o caso só porque apareceu a mensagem…" (S9) — **baixa** — "Aviso que está resolvido: a tela já mostra ‘enviado’."
6. **aula_03/q05/b** — "Repito vários envios de teste sem olhar o destino." caricata (analise-fable 2.15) — **baixa** — "Peço a um colega que também faça um envio de teste.", ok, retorno e reação novos (JSON); aresta `e_q05_b` +1.
7. **aula_02/q04/c e aula_03/q06/b (reações)** — 25 e 26 palavras com "Faça assim" (S2) — **média** — JSON.
8. **Decisão do dono (antes de gravar as aulas 2 e 3):** o caso "formulário de teste que não chega à caixa esperada / ambiente de teste" segue abstrato para quem trabalha no balcão, no estoque ou na cozinha (analise-fable 2.15). As atividades já oferecem "o pedido de teste não chegou ao setor". Se quiser trocar a instância (ex.: pedido que não chega à cozinha; etiqueta que imprime o preço errado), é agora; se mantiver, está coerente.

### 3.13 Liberdade e intimidade — aula 3 (`crs_b8zeh4b2gguseghq/aula_03`, Patrícia)

1. **aula_03/v04/chamada + q04 (situação)** — "Uma colega diz em particular que as piadas continuam…": quais piadas, de quem? A aula abre, anuncia a missão e já faz a pergunta. O caso não foi apresentado por inteiro — **média** (gravado) — plano novo antes da chamada: "Uma colega da sua equipe virou alvo de piadas sobre o jeito dela de falar."; chamada: "Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança. Agora, responda: o que você pode fazer?"; situação idem.
2. **aula_03/v05/s2 + pílula + atividade** — "responsável pelo programa": porta de apoio a confirmar (importacao §6; analise-fable 2.10 "nem todo aluno está em programa"); a aula 2 deste curso já lista "quem acompanha seu trabalho, o canal indicado pela empresa, a escola" — **média** (gravado) — "Se você é menor de idade, também pode procurar um adulto de confiança, na escola ou no trabalho. Não precisa relatar uma experiência pessoal para fazer a atividade."; pílula "Na **escola ou no trabalho**"; opção da atividade "Podemos procurar quem acompanha o seu trabalho".
3. **aula_03/q04/a (retorno)** — "Falta não prometer o que não controla." — **baixa** — "Falta cuidar do que você promete."
4. **aula_03/a03 (atividade)** — "Obrigado por confiar em mim" presume aluno homem; "apoiada" presume que quem foi alvo é mulher (q05 é o Ravi) — **baixa** — "Que bom que você me contou"; "Como você quer que eu te apoie? …" (JSON).
5. **aula_03/v05/s3 + q05** — "Rebeca" é a personagem de q02 de Tudo é urgente? (analise-fable 5.2.6: um nome por personagem) — **baixa** — "Letícia" (não aparece em nenhum curso nem checagem).
6. **aula_03/q05/b (reação)** — 26 palavras com "Faça assim" (S2) — **média** — JSON.
7. **Repetição com a aula 2** — a aula 2 já diz "uma pessoa adulta de confiança pode ajudar"; a aula 3 repete a ideia em outro papel (quem apoia). Aceitável; não é a mesma cena.
8. **Checagem de Convivência** — ganhou a aula 3 e não ganhou situação (importacao §6). Pendente, por decisão anterior.

## 4. Checagens das 4 trilhas (`packages/course-schema/src/trails.ts`)

**Plausibilidade e alinhamento:** as 24 situações são plausíveis, têm personagens novos e cobrem os objetivos dos três cursos de cada trilha (duas por curso). Os retornos são curtos e corretos. Três problemas:

1. **Posição fixa da correta (alta)** — ver S1. Sem isso, nenhuma trilha deve liberar selo.
2. **Cópias quase literais das decisões dos cursos (baixa)** — rd1 = o-outro q01 (Dani/Moacir), rd2 = o-outro q03 (Murilo/churrasco), tc1 = seus-dados q01, tc4 = parece-verdade q04 (mesma opção strong, palavra por palavra), tc5 = IA q03, tc6 = IA q04, au1 = tudo-urgente q02 (14h/13h × 16h/15h), au3 = errei q03, pr1 = por-onde q01, pr3 = faz-sentido q01, pr4 = faz-sentido q03/q04, pr5 = onde q02, pr6 = onde q05. Uma checagem pode ser próxima do curso, mas quando é a mesma cena com outro nome vira teste de memória. Sugestão mínima: mudar uma condição em tc4, pr3 e pr6 (textos abaixo); as demais podem ficar.
3. **Distratores caricatos (baixa a média)** — tc3·c "mensagem de grupo nunca é verdadeira", au1·c "não dá para fazer nenhuma das duas", au4·b "não preciso aprender mais nada", au4·c "aprender tudo de uma vez", pr1·c "espero alguém me dizer", pr2·c "entrego primeiro e confiro depois", pr4·c "a balança nunca pode ser o motivo", pr5·c "mudo todos e volto se der errado", pr6·c "repito o envio várias vezes". São os mesmos padrões que a análise mandou trocar nos cursos. Também: pr6·b tem aspas curvas dentro de aspas curvas.

**Correções (código; não entram no JSON dos cursos):**

- **tc3·c** → `“Pergunto no próprio grupo quem mandou e espero alguém responder.”` — retorno: `Perguntar no grupo é um começo, mas quem confirma é a pessoa responsável. Verifique com ela antes de mudar seus planos.`
- **tc4 (situação)** → `O Tales recebeu por mensagem uma vaga de estágio com um link de “cadastro rápido”, que pede CPF e foto do documento antes de qualquer entrevista.` — a (correta): `“Não envio nada e procuro a vaga na página oficial da empresa.”` · b: `“Envio, porque toda empresa pede documento em algum momento.”` → `Documento se entrega a quem você confirmou que é a empresa, e no momento certo. Verifique na página oficial.` · c: `“Pergunto no grupo se alguém já se cadastrou e, se sim, envio.”` → `Outra pessoa ter enviado não confirma a vaga. Vá à fonte antes de entregar dados.`
- **au1·c** → `“Entrego o relatório às 14h e só depois pergunto da lista.”` — retorno: `Você protege o relatório, mas a lista pode ser mais urgente, e ela não sabe do conflito. Pergunte o prazo antes de decidir.`
- **au4·b** → `“Digo que ainda preciso de ajuda em tudo, para não parecer convencida.”` — retorno: `Você apaga o que já faz sozinha. Diga o que já domina e o que vem a seguir.` · **au4·c** → `“Peço para aprender várias coisas de uma vez: caixa, estoque e pedidos.”` — retorno: `Muitos focos ao mesmo tempo dificultam aprender. Escolha um e peça apoio.`
- **pr1·c** → `“Preparo a sala do jeito do último treinamento.”` — retorno: `O último treinamento pode não ter o mesmo tamanho nem horário. Confirme o que falta.`
- **pr2·c** → `“Pergunto o tamanho a cada pessoa na hora da entrega.”` — retorno: `Funciona para poucas pessoas, mas sem separar antes a entrega trava e pode faltar tamanho. Confirme antes.`
- **pr3 (situação)** → `O Hugo mandou uma pergunta ao gestor às 9h. São 11h, o gestor passou duas vezes pela sala e não respondeu. Ele pensa: “Está com raiva de mim”.` — a (correta): `“Que ainda não houve resposta; o resto é suposição.”` · b: `“Que ele está com raiva de mim.”` · c: `“Que ele viu a pergunta e preferiu não responder.”` → `“Viu” e “preferiu” não foram confirmados. Guarde só o que foi observado.`
- **pr4·c** → `“Peço para voltar à balança antiga até ter certeza.”` — retorno: `É prudente, mas decide sem investigar. Compare os dias antes de trocar de novo.`
- **pr5·c** → `“Mudo só um cadastro antigo, que ninguém usa mais.”` — retorno: `Cadastro antigo também é dado real, e o sistema pode não deixar desfazer. Confirme se existe modo de teste.`
- **pr6 (situação)** → `A Selma corrigiu o endereço para onde os pedidos da loja são enviados e a tela mostrou “enviado”. O gerente pergunta se já pode avisar a equipe que está resolvido.` — a (correta): `“Faço um pedido de teste autorizado e confirmo que ele chegou ao setor.”` · b: `“Digo que sim, porque apareceu ‘enviado’.”` → `A mensagem confirma uma etapa, não o recebimento.` · c: `“Peço a um colega que também faça um pedido de teste.”` → `Mais um teste ajuda, mas sem conferir se chegou ao setor nada está provado.`
- Depois das trocas, aplicar S1 (posições) e conferir `trails.test.ts`.

## 5. Correções aplicáveis

Campos: `shot:<id>` (fala gravada), `reaction:<opcao>` (fala gravada), `option_label`, `quality`, `feedback`, `prompt` (situação do painel; a pergunta final continua no 2º parágrafo, como hoje), `title`, `bridge_call`, `intro`, `scaffold`, `end`. Campos extras usados aqui, por falta de equivalente na lista: `body` (texto de tela da explicação), `slide` (pílulas), `description` (descrição da aula) e `shot:<id>+` (plano novo a inserir **antes** da `chamada`). Quando `quality` muda, ajustar os pontos da aresta correspondente (strong +2, ok +1, weak 0). Os textos de `scaffold` descrevem o molde e as opções a trocar; o que não é citado fica como está.

```json
[
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_01", "no": "v02", "campo": "shot:chamada", "texto_novo": "Hoje o Otávio precisou de uma resposta urgente dela e achou que ela estava ignorando o pedido. Agora, responda: no lugar do Otávio, o que você faz?"},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_01", "no": "q02", "campo": "bridge_call", "texto_novo": "Hoje o Otávio precisou de uma resposta urgente dela e achou que ela estava ignorando o pedido. Agora, responda: no lugar do Otávio, o que você faz?"},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_01", "no": "q02", "campo": "prompt", "texto_novo": "A Fernanda combinou com a equipe responder as mensagens no fim da manhã e no fim da tarde. Hoje o Otávio precisou de uma resposta urgente dela e achou que ela estava ignorando o pedido.\nNo lugar do Otávio, o que você faz?"},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "v03", "campo": "shot:s2", "texto_novo": "No fim desta aula, tem uma missão para você: escreva um convite que a pessoa possa recusar sem se explicar."},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "v03", "campo": "shot:s3", "texto_novo": "A equipe almoça junta toda sexta. O Murilo nunca vai e come em outro lugar."},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "q03", "campo": "quality:b", "texto_novo": "strong"},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "q03", "campo": "feedback:b", "texto_novo": "Você interrompe o comentário na hora, e isso protege o Murilo. Falta mostrar a ele que é bem-vindo. Faça assim: depois, convide-o para um momento que funcione para ele, sem cobrar presença."},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "q03", "campo": "reaction:b", "texto_novo": "Isso protege o Murilo. Você interrompe o comentário na hora, sem expor ninguém."},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "q04", "campo": "feedback:b", "texto_novo": "Você não presume nem expõe: ouve quem foi alvo e deixa a decisão com ela. Falta agir se ela se incomodar. Faça assim: apoie o que ela decidir, em particular ou com alguém de confiança."},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "a02", "campo": "scaffold", "texto_novo": "template: \"{convite}? {saida}.\" · convite: [\"Estamos indo almoçar. Quer vir\", \"Vamos tomar um café depois do expediente. Pode ser\", \"Sexta tem almoço da equipe. Quer ir com a gente\"] · saida: sem mudança"},
  {"curso": "crs_t303ykqfmhj3yb1g", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Respeitar diferenças é convidar sem cobrar e ouvir quando alguém diz que algo incomoda. Se você salvou, seu convite fica no Meu roteiro para adaptar quando precisar."},

  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_01", "no": "v02", "campo": "shot:s1", "texto_novo": "Quando a crítica vem para você, peça um exemplo. Quando é você quem discorda, fale da proposta, do dado ou do efeito esperado."},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_01", "no": "q01", "campo": "option_label:a", "texto_novo": "“Não respondo e mudo a planilha sem perguntar nada a ele.”"},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_01", "no": "a01", "campo": "scaffold", "texto_novo": "proposta, opção 1: \"Podemos verificar isso antes do envio\""},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q03", "campo": "reaction:a", "texto_novo": "Veja o que essa escolha muda. A discussão consome tempo sem criar um critério de escolha."},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q04", "campo": "quality:a", "texto_novo": "weak"},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q04", "campo": "option_label:b", "texto_novo": "“Levo as duas opções ao gestor e peço que ele escolha.”"},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q04", "campo": "quality:b", "texto_novo": "ok"},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q04", "campo": "feedback:b", "texto_novo": "Você busca uma decisão, mas o gestor pode não responder antes de quarta, e a escolha era de vocês. Falta aplicar o critério. Faça assim: usem o critério que combinaram, entreguem no prazo e avisem o que escolheram."},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "q04", "campo": "reaction:b", "texto_novo": "Vamos olhar o efeito disso. Você busca uma decisão, mas o gestor pode não responder antes de quarta."},
  {"curso": "crs_2rt2rsoii8bpydp2", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Quando há impasse, critérios e uma pergunta a quem vai usar ajudam mais do que insistir. Se você salvou, seus critérios ficam no Meu roteiro."},

  {"curso": "crs_5k5upah2xphlfvi5", "aula": "aula_01", "no": "q01", "campo": "option_label:a", "texto_novo": "“Digo ao gestor que esse processo é ruim e que ninguém acha nada.”"},
  {"curso": "crs_5k5upah2xphlfvi5", "aula": "aula_01", "no": "q02", "campo": "option_label:a", "texto_novo": "“Digo que é uma impressão minha, de quem usa o formulário todo dia.”"},
  {"curso": "crs_5k5upah2xphlfvi5", "aula": "aula_01", "no": "q02", "campo": "reaction:a", "texto_novo": "Pense no que acontece depois. Você traz a observação, mas sem exemplo o gestor não consegue avaliar."},
  {"curso": "crs_5k5upah2xphlfvi5", "aula": "aula_02", "no": "q03", "campo": "option_label:b", "texto_novo": "“Levo o problema à liderança e espero que ela diga o que fazer.”"},
  {"curso": "crs_5k5upah2xphlfvi5", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Uma ideia ganha força quando vira um teste combinado, com um sinal para avaliar. Se você salvou, sua proposta fica no Meu roteiro para levar à equipe."},

  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_01", "no": "v01", "campo": "shot:s1", "texto_novo": "Oi! Eu sou o Thiago, seu orientador neste curso da DNA Work. Hoje, vamos ver o que um print mostra sem querer e o que conferir antes de enviar um arquivo ou link."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_01", "no": "a01", "campo": "scaffold", "texto_novo": "grupo c, question: \"O que mais pode sair?\" · label: \"O que mais pode sair\""},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "v03", "campo": "shot:s2", "texto_novo": "No fim desta aula, tem uma missão para você: monte um checklist de envio, com destinatário, conteúdo e acesso."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "v03", "campo": "shot:s3+", "texto_novo": "Você precisa compartilhar uma planilha interna."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q03", "campo": "option_label:c", "texto_novo": "“Mando o link como está e peço para ninguém repassar.”"},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q03", "campo": "quality:c", "texto_novo": "ok"},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q03", "campo": "feedback:c", "texto_novo": "Você cuida da circulação, mas o link continua aberto para qualquer pessoa que o tenha. Falta ajustar a permissão. Faça assim: restrinja o acesso a quem precisa antes de enviar."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q03", "campo": "reaction:c", "texto_novo": "Olhe isso com calma. Você cuida da circulação, mas o link continua aberto para qualquer pessoa que o tenha."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "v04", "campo": "shot:s2", "texto_novo": "Se o nome do arquivo está certo, mas o link abre para qualquer pessoa, o problema continua: permissão também faz parte do envio."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "v04", "campo": "shot:s3", "texto_novo": "E quando o envio já saiu errado? Veja o que aconteceu com o Wesley."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q04", "campo": "feedback:a", "texto_novo": "Você tenta conter, mas atrasa o aviso a quem pode agir. Falta avisar primeiro quem é responsável. Faça assim: avise a pessoa responsável e peça ajuda para conter o acesso."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q04", "campo": "option_label:b", "texto_novo": "“Aviso a pessoa responsável e peço ajuda para conter o acesso.”"},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "q04", "campo": "feedback:c", "texto_novo": "Apagar sua mensagem não resolve o que já foi visto, e esconder atrasa a solução. Falta avisar. Faça assim: conte o que houve à pessoa responsável e peça ajuda para conter o acesso."},
  {"curso": "crs_tg9iqz8wmmf5pw77", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Antes de enviar, confira quem recebe, o que vai e quem consegue abrir. Se algo sair errado, avise logo quem pode agir: apagar a mensagem não resolve o que já foi visto. Se você salvou, seu checklist de envio fica no Meu roteiro."},

  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "v01", "campo": "shot:chamada", "texto_novo": "Não aparece data nem quem publicou. Agora, responda: o que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "bridge_call", "texto_novo": "Não aparece data nem quem publicou. Agora, responda: o que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "title", "texto_novo": "O que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "prompt", "texto_novo": "Chega ao grupo um print dizendo que o horário de entrada mudou amanhã. Não aparece data nem quem publicou.\nO que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "option_label:b", "texto_novo": "“Não repasso e espero alguém confirmar no grupo.”"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "feedback:b", "texto_novo": "Você não espalha a dúvida, mas pode perder um aviso real esperando. Falta verificar. Faça assim: procure o comunicado original ou pergunte se o aviso vale para a equipe."},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q01", "campo": "reaction:b", "texto_novo": "Vamos olhar o efeito disso. Você não espalha a dúvida, mas pode perder um aviso real esperando."},
  {"curso": "crs_au1463izc386by27", "aula": "aula_01", "no": "q02", "campo": "reaction:c", "texto_novo": "Veja o que essa escolha muda. Você amplia um aviso sem origem nem data."},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "q03", "campo": "feedback:b", "texto_novo": "Popularidade não confirma a informação. Falta a publicação da organização. Faça assim: procure quem publicou primeiro e confira a data."},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "v04", "campo": "shot:s2", "texto_novo": "Confira se o endereço do site é mesmo o da organização e não entregue dados só porque a mensagem parece urgente. Se não conseguir verificar, não apresente como certeza. Dizer ‘não consegui confirmar’ também é uma resposta responsável."},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "v04", "campo": "slide", "texto_novo": "Verificar com responsabilidade · Abra o **canal conhecido** · Confira o **endereço do site** · Diga **não consegui confirmar**"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "v04", "campo": "shot:chamada", "texto_novo": "O site indicado pede um pagamento pequeno para liberar a vaga. Agora, responda: no lugar do Kelvin, o que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "q04", "campo": "bridge_call", "texto_novo": "O site indicado pede um pagamento pequeno para liberar a vaga. Agora, responda: no lugar do Kelvin, o que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "q04", "campo": "prompt", "texto_novo": "O Kelvin viu em vários perfis uma vaga de jovem aprendiz. O site indicado pede um pagamento pequeno para liberar a vaga.\nNo lugar do Kelvin, o que você faz?"},
  {"curso": "crs_au1463izc386by27", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Antes de repassar uma oportunidade, confirme na fonte oficial e diga com clareza o que ainda não foi confirmado. Se você salvou, sua sequência de verificações fica no Meu roteiro."},

  {"curso": "crs_m60hsx8on6ebcyqg", "aula": "aula_02", "no": "q03", "campo": "feedback:b", "texto_novo": "Você corrige o que ninguém confirmou e revisa outras possíveis invenções. Falta registrar o que conferiu. Faça assim: compare nomes, números e condições com a informação de origem antes de enviar."},
  {"curso": "crs_m60hsx8on6ebcyqg", "aula": "aula_02", "no": "q03", "campo": "reaction:b", "texto_novo": "É por aí. Você corrige o que ninguém confirmou e revisa outras possíveis invenções."},
  {"curso": "crs_m60hsx8on6ebcyqg", "aula": "aula_02", "no": "v04", "campo": "shot:s2", "texto_novo": "A IA também não precisa de tudo o que está na sua tela para ajudar. Usar IA com critério inclui saber o que não entra no pedido, e quando não usar."},
  {"curso": "crs_m60hsx8on6ebcyqg", "aula": "aula_02", "no": "v04", "campo": "slide", "texto_novo": "Confira antes de usar · Compare com a **fonte** · Confira **nomes, números e condições** · O que **não entra** no pedido"},
  {"curso": "crs_m60hsx8on6ebcyqg", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Antes de usar uma resposta de IA, confira os fatos e retire o que ninguém confirmou. Não cole cadastros, senhas nem documentos internos: troque por dados fictícios. Se você salvou, seu checklist fica no Meu roteiro."},

  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_01", "no": "q01", "campo": "option_label:a", "texto_novo": "“Paro a tarefa combinada e começo o novo pedido, já que é ‘para agora’.”"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_01", "no": "q02", "campo": "option_label:c", "texto_novo": "“Pergunto até quando ele precisa da lista e aviso do relatório.”"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "q03", "campo": "option_label:a", "texto_novo": "“Vou fazendo o que dá e só aviso se alguma entrega atrasar.”"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "v04", "campo": "body", "texto_novo": "Separe o que precisa ser feito, o que depende de outra pessoa e o tempo disponível."},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "v04", "campo": "shot:s2", "texto_novo": "Estimativas podem mudar, então apresente como estimativa, não como promessa."},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "q04", "campo": "option_label:a", "texto_novo": "“Estou com muita coisa e não vou conseguir entregar tudo no prazo.”"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "q04", "campo": "quality:a", "texto_novo": "ok"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "v05", "campo": "shot:s2", "texto_novo": "Se a pessoa não puder decidir, pergunte quem pode ajudar. O objetivo é que o trabalho caiba no tempo, respeitando os combinados e o que é de cada função."},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "v05", "campo": "slide", "texto_novo": "Depois do pedido · **Quando será revisto** · Pergunte **quem pode ajudar** · O trabalho **cabe no tempo**"},
  {"curso": "crs_4jh683s5h351z2db", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Pedir um ajuste é mostrar a situação, o impacto e uma alternativa, sem precisar contar a sua vida pessoal. Se a sobrecarga estiver pesando além do trabalho, procure alguém de confiança. Se você salvou, seu pedido fica no Meu roteiro."},

  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "v01", "campo": "shot:s5", "texto_novo": "Você montou o orçamento de um cliente e digitou quatrocentos e oitenta reais em vez de oitocentos e quarenta."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "v02", "campo": "shot:s2", "texto_novo": "Se não souber o impacto, diga que ainda precisa verificar. Evite prometer que está tudo resolvido antes de confirmar."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "v02", "campo": "shot:s3", "texto_novo": "E se alguém reagir com irritação? O gestor da Gisele ficou irritado ao saber do erro no orçamento e disse que ela deveria ter conferido."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "q01", "campo": "option_label:c", "texto_novo": "“Digo que deve ter sido falha do sistema.”"},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "a01", "campo": "scaffold", "texto_novo": "passo, opção 1: \"Vou avisar quem recebeu e mandar a correção\""},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_01", "no": "fim_aula_01", "campo": "end", "texto_novo": "Quando perceber um erro, avise com fatos e diga o que ainda vai verificar. Se alguém reagir com irritação, ouça e volte ao que vai ser feito. Na próxima aula, vamos ver como mudar o processo para o erro não se repetir."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_02", "no": "q03", "campo": "reaction:b", "texto_novo": "Olhe isso com calma. Uma lista longa demais pesa e acaba não sendo usada."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_02", "no": "obj_aula_02", "campo": "title", "texto_novo": "Você escolhe uma mudança no processo e diz como verificar se ela reduziu o erro."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_02", "no": "aula_02", "campo": "description", "texto_novo": "Você escolhe uma mudança no processo e diz como verificar se ela reduziu o erro."},
  {"curso": "crs_njtlqq7y7fyfeqcr", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Corrigir também é olhar o processo: uma mudança pequena e uma conferência já ajudam. Se você salvou, sua escolha fica no Meu roteiro para acompanhar."},

  {"curso": "crs_gl0hjkmqfgnnur9y", "aula": "aula_01", "no": "v01", "campo": "shot:s1", "texto_novo": "Oi! Eu sou a Helena, sua orientadora neste curso da DNA Work. Hoje, vamos reconhecer o que você já faz sozinho e aprender uma tarefa nova observando quem já faz."},
  {"curso": "crs_gl0hjkmqfgnnur9y", "aula": "aula_01", "no": "q02", "campo": "reaction:a", "texto_novo": "Pense no que acontece depois. Você garante a qualidade, mas deixa de crescer."},
  {"curso": "crs_gl0hjkmqfgnnur9y", "aula": "aula_01", "no": "q02", "campo": "reaction:c", "texto_novo": "Veja o que essa escolha muda. Você assume um risco sem apoio nem combinado."},
  {"curso": "crs_gl0hjkmqfgnnur9y", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Aprender também é observar, anotar e praticar com alguém por perto. Se você salvou, seu plano fica no Meu roteiro para a próxima tarefa nova."},

  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_01", "no": "q01", "campo": "option_label:c", "texto_novo": "“Envio o convite para todos com um horário que eu escolhi.”"},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_01", "no": "q01", "campo": "reaction:c", "texto_novo": "Repare no que isso provoca. O convite transforma uma suposição em compromisso ainda não combinado."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "v04", "campo": "shot:s3", "texto_novo": "Se faltar algo, ajuste antes da entrega."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "v04", "campo": "shot:s4+", "texto_novo": "Veja o caso do Yuri: ele tem quatro etapas para organizar um evento."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "v04", "campo": "shot:chamada", "texto_novo": "Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado. Agora, responda: no lugar do Yuri, o que você faz?"},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "q04", "campo": "bridge_call", "texto_novo": "Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado. Agora, responda: no lugar do Yuri, o que você faz?"},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "q04", "campo": "prompt", "texto_novo": "O Yuri tem quatro etapas para organizar um evento. Ele descobre que a terceira etapa só pode começar depois que o espaço for confirmado.\nNo lugar do Yuri, o que você faz?"},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "q04", "campo": "reaction:c", "texto_novo": "Isso ajuda. Você aproveita o tempo e respeita a dependência entre as etapas."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "a02", "campo": "intro", "texto_novo": "Você viu que algumas etapas dependem de uma confirmação. Agora monte um plano de quatro etapas, da primeira à última."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "a02", "campo": "title", "texto_novo": "Monte um plano de quatro etapas, da primeira à última"},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "a02", "campo": "scaffold", "texto_novo": "e1, opção 2: \"Confirmar o prazo de entrega\""},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "obj_aula_02", "campo": "title", "texto_novo": "Você organiza um plano de quatro etapas e marca o que precisa ser confirmado antes de começar."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "aula_02", "campo": "description", "texto_novo": "Você organiza um plano de quatro etapas e marca o que precisa ser confirmado antes de começar."},
  {"curso": "crs_dp9s7pdro9j6e3m0", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Dividir em etapas e marcar o que depende de confirmação evita retrabalho. Se você salvou, seu plano fica no Meu roteiro."},

  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_01", "no": "q01", "campo": "option_label:b", "texto_novo": "“Que ele viu a mensagem e ainda não respondeu.”"},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_01", "no": "q01", "campo": "feedback:b", "texto_novo": "Quase: ‘ainda não respondeu’ é fato, mas ‘viu a mensagem’ você não confirmou. Falta separar os dois. Faça assim: guarde só o que foi observado e trate o resto como hipótese."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_01", "no": "q01", "campo": "reaction:b", "texto_novo": "Quase lá. ‘Ainda não respondeu’ é fato, mas ‘viu a mensagem’ você não confirmou."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_01", "no": "q02", "campo": "reaction:b", "texto_novo": "Pense no que acontece depois. É uma explicação possível, mas ainda não confirmada."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "q03", "campo": "option_label:c", "texto_novo": "“Peço para voltar à ferramenta antiga até termos certeza.”"},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "q03", "campo": "quality:c", "texto_novo": "ok"},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "q03", "campo": "feedback:c", "texto_novo": "É prudente, mas decide sem investigar: a causa pode ser outra, e a equipe perde a ferramenta nova. Falta verificar. Faça assim: compare o que mudou naquele dia antes de trocar de novo."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "q03", "campo": "reaction:c", "texto_novo": "Olhe isso com calma. É prudente, mas decide sem investigar, e a causa pode ser outra."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "v04", "campo": "shot:s1", "texto_novo": "O atraso pode ter outras causas: faltou informação, treinamento ou autorização."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "q04", "campo": "reaction:a", "texto_novo": "Vale pensar no que fica de fora. Você não conclui cedo, mas ainda não compara com nada."},
  {"curso": "crs_0ua5onij460lpzs0", "aula": "aula_02", "no": "fim_aula_02", "campo": "end", "texto_novo": "Uma conclusão provisória e duas informações para testá-la já formam uma boa investigação. Se você salvou, ela fica no Meu roteiro."},

  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_01", "no": "q01", "campo": "option_label:c", "texto_novo": "“Procuro a ajuda do sistema e, se parecer simples, tento.”"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_01", "no": "q01", "campo": "quality:c", "texto_novo": "ok"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_01", "no": "q01", "campo": "feedback:c", "texto_novo": "Buscar informação ajuda, mas ‘parecer simples’ não diz se dá para desfazer. Falta confirmar o risco. Faça assim: se a ajuda não deixar claro, pergunte a quem conhece o sistema."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_01", "no": "q01", "campo": "reaction:c", "texto_novo": "Repare no que isso provoca. Buscar informação ajuda, mas ‘parecer simples’ não diz se dá para desfazer."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "q03", "campo": "option_label:b", "texto_novo": "“Refaço o formulário do zero, para garantir que vai funcionar.”"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "q03", "campo": "feedback:b", "texto_novo": "Se voltar a funcionar, você não saberá qual era a causa, e pode criar outros problemas. Falta isolar uma hipótese. Faça assim: mude uma coisa por vez, com autorização."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "q03", "campo": "reaction:b", "texto_novo": "Veja o que essa escolha muda. Se voltar a funcionar, você não saberá qual era a causa, e pode criar outros problemas."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "q03", "campo": "option_label:c", "texto_novo": "“Acho que é a internet e espero a conexão melhorar.”"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "v04", "campo": "shot:s2", "texto_novo": "Se não tiver acesso ou autorização, peça apoio e descreva o que observou. Não use dados reais para experimentar nem mexa no sistema que a equipe usa de verdade só para descobrir o que acontece."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_02", "no": "q04", "campo": "reaction:c", "texto_novo": "Vamos olhar o efeito disso. Você escolhe uma causa sem testar, e a investigação para aí."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q05", "campo": "option_label:a", "texto_novo": "“Aviso que está resolvido: a tela já mostra ‘enviado’.”"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q05", "campo": "option_label:b", "texto_novo": "“Peço a um colega que também faça um envio de teste.”"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q05", "campo": "quality:b", "texto_novo": "ok"},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q05", "campo": "feedback:b", "texto_novo": "Mais um teste ajuda, mas sem conferir se chegou ao destino, nada está provado. Falta o critério de sucesso. Faça assim: defina o que precisa chegar e onde, e confira."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q05", "campo": "reaction:b", "texto_novo": "Repare no que isso provoca. Mais um teste ajuda, mas sem conferir o destino, nada está provado."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "q06", "campo": "reaction:b", "texto_novo": "Bom caminho. Você separa o que foi provado do que ainda falta provar."},
  {"curso": "crs_d5rsi8gt36rv0qbq", "aula": "aula_03", "no": "fim_aula_03", "campo": "end", "texto_novo": "Confirmar que funcionou é comparar o resultado com o objetivo e registrar o que foi verificado. Se você salvou, seu critério de sucesso fica no Meu roteiro."},

  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v04", "campo": "shot:s3+", "texto_novo": "Uma colega da sua equipe virou alvo de piadas sobre o jeito dela de falar."},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v04", "campo": "shot:chamada", "texto_novo": "Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança. Agora, responda: o que você pode fazer?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q04", "campo": "bridge_call", "texto_novo": "Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança. Agora, responda: o que você pode fazer?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q04", "campo": "prompt", "texto_novo": "Uma colega da sua equipe virou alvo de piadas sobre o jeito dela de falar. Ela diz, em particular, que as piadas continuam e que tem receio de falar com a liderança.\nO que você pode fazer?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q04", "campo": "feedback:a", "texto_novo": "Você oferece apoio e informação, respeitando a segurança e a vontade dela. Falta cuidar do que você promete. Faça assim: não prometa sigilo nem solução imediata; ofereça ir junto, se ela quiser."},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v05", "campo": "shot:s2", "texto_novo": "Se você é menor de idade, também pode procurar um adulto de confiança, na escola ou no trabalho. Não precisa relatar uma experiência pessoal para fazer a atividade."},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v05", "campo": "slide", "texto_novo": "Apoiar com cuidado · Não prometa **sigilo** · Um **adulto de confiança** · Na **escola ou no trabalho**"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v05", "campo": "shot:s3", "texto_novo": "A Letícia ouviu colegas rirem de uma foto que alguém postou do Ravi."},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "v05", "campo": "shot:chamada", "texto_novo": "Ele estava no corredor e ouviu também. Agora, responda: no lugar da Letícia, o que você faz?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q05", "campo": "bridge_call", "texto_novo": "Ele estava no corredor e ouviu também. Agora, responda: no lugar da Letícia, o que você faz?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q05", "campo": "title", "texto_novo": "No lugar da Letícia, o que você faz?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q05", "campo": "prompt", "texto_novo": "A Letícia ouviu colegas rirem de uma foto que alguém postou do Ravi. Ele estava no corredor e ouviu também.\nNo lugar da Letícia, o que você faz?"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "q05", "campo": "reaction:b", "texto_novo": "Veja o que essa escolha muda. O silêncio dele não prova que está tudo bem."},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "a03", "campo": "scaffold", "texto_novo": "acolhe, opção 2: \"Que bom que você me contou\" · apoio: [\"Como você quer que eu te apoie? Podemos procurar quem acompanha o seu trabalho\", \"Como você quer que eu te apoie? Podemos procurar um adulto de confiança\", \"Quer que eu te ajude a achar um canal seguro\"]"},
  {"curso": "crs_b8zeh4b2gguseghq", "aula": "aula_03", "no": "fim_aula_03", "campo": "end", "texto_novo": "Apoiar é ouvir, respeitar a vontade da pessoa e ajudar a achar um canal de confiança. Se você salvou, sua frase de acolhimento fica no Meu roteiro."}
]
```

Fora do JSON (decisão do dono ou código): S1 e a seção 4 (`trails.ts`); S7 ("missão" × "Na prática"); S8 (texto de tela das explicações); política de IA e idade mínima (IA como aliada, antes de publicar); instância tangível em Onde está o problema? (aulas 2 e 3); checagem de Convivência sem situação para a aula 3; leitura de "16h/15h" pelo TTS (Tudo é urgente? a1·v02·s3); pontos das arestas onde `quality` mudou (`e_q03_b` de O outro; `e_q04_a`/`e_q04_b` de Discordar; `e_q03_c` de Seus dados; `e_q04_a` de Tudo é urgente; `e_q03_c` de Faz sentido; `e_q01_c` e `e_q05_b` de Onde está o problema).
