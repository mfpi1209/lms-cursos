# Instrutores novos: um por trilha nova

Data: 31/10/2026. Direção de elenco e de marca para os 4 avatares fictícios das trilhas novas do pacote-15 (ver `importacao.md`, seção 3, e `analise-fable.md`). Hoje os 12 cursos usam 8 instrutores já existentes; este documento propõe um instrutor **novo e exclusivo por trilha**, para a trilha ter um rosto só e para nenhum instrutor atual repetir mais um curso. Nada aqui foi gerado, pago ou aplicado: é o briefing para `apps/worker/src/scripts/novo-instrutor.ts` (`BASE_PROMPT`, `STUDIO`, `PRONOUN`) e para a escolha de voz pelo produtor.

## 1. Regras aplicadas

- **Personagens 100% fictícios**, descritos só em texto (sem foto de referência de pessoa real, sem nome de famoso). Cada `BASE_PROMPT` abre com `Photorealistic video presenter, a fictional …`, como o do Rafael.
- **Nomes** que não existem em nenhum curso (instrutores e personagens; lista completa na seção 4). Conferido por busca em `docs/`, `packages/db/src` e `apps/web/src`: Mauro, Laís, Vinícius e Flávia aparecem 0 vezes.
- **Elenco diverso** entre si e em relação aos 12 atuais (seção 3): o elenco atual tem no máximo 45 anos (Helena), nenhum homem acima de 34, nenhum homem de ascendência asiática, ninguém careca nem com cabelo grisalho masculino, nenhuma pessoa de ascendência árabe, nenhum corpo largo. Os 4 novos cobrem exatamente esses vazios; idades de 31 a 48.
- **Roupa**: profissional casual, lisa, sem logotipo, **sem relógio, pulseira ou qualquer acessório nos pulsos** (defeito de relógio duplicado), **sem listras finas ou estampas miúdas** (moiré), **sem verde-folha** nem verde-oliva (confunde com as plantas do cenário; "folhas fantasma"). Cores escolhidas para não brigar com o marinho `#1d1e4c` e o laranja `#FF7A08`: carvão, ameixa, lilás, cinza médio, azul-ardósia, creme e branco. Nenhuma peça laranja, terracota, mostarda ou marinho (já usadas por Patrícia, Helena e Rafael, e colam na marca).
- **Estúdios** aprovados: `docs/brand/cenario/estudio-jovem-6.png`, `-7.png`, `-8.png` (descrições em `STUDIO_DESCS`). Os 8 kits existentes usam o 8 quatro vezes (Patrícia, Enzo, Thiago, Helena), o 7 quatro (Marina, Rafael, Beatriz, Gustavo) e o 6 duas (Júlia, Renato); por isso os novos usam o 6 duas vezes, o 7 uma e o 8 uma.
- **Mãos** relaxadas e visíveis; sem gesto. Boca fechada no retrato-base (lip-sync).
- **Óculos** só em um caso (Laís), com `glasses without glare`, como no Renato.

## 2. Perfis

### 2.1 Mauro: Respeito e diálogo

| Campo | Valor |
|---|---|
| Nome | **Mauro** |
| Idade aparente | ~48 |
| Pronome | `he` |
| Trilha | Respeito e diálogo (O outro só é diferente; Discordar sem brigar; Minha ideia também conta) |
| Personalidade (uso interno) | Acolhedor e firme: escuta antes de responder, nunca ridiculariza, mas não deixa passar desrespeito; o "tio" que todo mundo respeita porque ele respeita todo mundo. |
| Estúdio sugerido | **7** (arco de madeira com LED à esquerda, parede curva laranja com logo DW à direita): o mais quente dos três, combina com a trilha de convivência. |

`BASE_PROMPT` (inglês):

```
Photorealistic video presenter, a fictional Black Brazilian man about 48 years old, deep brown skin, cleanly shaved bald head, short well-groomed salt-and-pepper beard, broad shoulders and a solid, heavyset build, warm, attentive and firm expression, calm natural smile with mouth closed. Smart-casual outfit: plain charcoal-gray fine-knit crew-neck sweater with the plain white collar of a shirt showing underneath, solid colors, no pattern, no stripes, no logos, no watch, no bracelet, nothing on the wrists, no other accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people.
```

Perfil de voz (ElevenLabs, escolha do produtor):
- Masculina, idade percebida 40 a 55 (`middle-aged` nos filtros), timbre grave-médio, encorpado, sem aspereza.
- Ritmo lento a moderado (cerca de 130 a 145 palavras por minuto no teste de 30 s), pausas naturais entre frases; nada de locutor de rádio.
- Português do Brasil com sotaque neutro (sem marca regional forte, "s" não chiado), uso `conversational` ou `informative/educational`, estilo "calmo e firme".

### 2.2 Laís: Tecnologia com critério

| Campo | Valor |
|---|---|
| Nome | **Laís** |
| Idade aparente | ~33 |
| Pronome | `she` |
| Trilha | Tecnologia com critério (Seus dados também trabalham; Parece verdade. Será?; IA como aliada) |
| Personalidade (uso interno) | Curiosa e precisa: gosta de abrir a caixa e ver como funciona, desconfia com bom humor e nunca dá uma resposta sem dizer de onde ela veio. |
| Estúdio sugerido | **8** (painéis marinho com ripas de madeira e LED dos dois lados, logo DW à direita): o mais "tech" e frio dos três. |

`BASE_PROMPT` (inglês):

```
Photorealistic video presenter, a fictional Brazilian woman of Lebanese descent about 33 years old, light olive skin, thick dark brown wavy hair gathered in a loose low bun with no loose strands over the face, thin round gold-rimmed glasses without glare, natural light makeup, curious, sharp and friendly expression, slight knowing smile with mouth closed. Smart-casual outfit: plain cream blouse with a simple collar under an open dark plum fine-knit cardigan, solid colors, no pattern, no stripes, no logos, no watch, no bracelet, nothing on the wrists, small simple stud earrings only. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people.
```

Perfil de voz:
- Feminina, idade percebida 28 a 38 (`young adult` / `middle-aged`), timbre médio, claro, com boa dicção de consoantes (muitos termos técnicos: "cookies", "QR code", "prompt").
- Ritmo moderado a ágil (cerca de 150 a 165 palavras por minuto), entonação variada o suficiente para soar interessada, sem ser "animadora".
- Português do Brasil com sotaque neutro; uso `informative/educational` ou `narrative`; evitar vozes com reverberação ou tom de propaganda.

### 2.3 Vinícius: Autonomia no trabalho

| Campo | Valor |
|---|---|
| Nome | **Vinícius** (pode se apresentar como Vini) |
| Idade aparente | ~31 |
| Pronome | `he` |
| Trilha | Autonomia no trabalho (Tudo é urgente?; Errei. E agora?; Aprender faz parte do trabalho) |
| Personalidade (uso interno) | Direto e encorajador: prático, fala de erro como quem já errou e consertou, dá o próximo passo em vez de sermão. |
| Estúdio sugerido | **6** (pegboard marinho e arco laranja à esquerda, estante marinho com logo DW à direita): o painel de ferramentas combina com "mão na massa". |

`BASE_PROMPT` (inglês):

```
Photorealistic video presenter, a fictional Brazilian man of Japanese descent about 31 years old, light warm skin, straight black hair cut short on the sides and slightly longer on top, neatly styled, clean-shaven, lean athletic build, energetic, direct and encouraging expression, easy natural smile with mouth closed. Smart-casual outfit: plain white crew-neck t-shirt under an open plain slate-blue (dusty medium blue) lightweight overshirt with sleeves rolled once above the wrist, solid colors, no pattern, no stripes, no logos, no watch, no bracelet, nothing on the wrists, no other accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people.
```

Perfil de voz:
- Masculina, idade percebida 26 a 34 (`young adult`), timbre médio (nem grave de narrador, nem agudo), com energia.
- Ritmo moderado a ágil (cerca de 150 a 165 palavras por minuto), frases curtas bem marcadas; deve soar bem em reações de 8 a 26 palavras.
- Português do Brasil com sotaque neutro; uso `conversational`; evitar vozes "de YouTuber" (gritadas) e vozes muito jovens (abaixo de 25 percebidos), para não parecer colega do aluno em vez de orientador.

### 2.4 Flávia: Pensar e resolver

| Campo | Valor |
|---|---|
| Nome | **Flávia** |
| Idade aparente | ~41 |
| Pronome | `she` |
| Trilha | Pensar e resolver (Por onde eu começo?; Faz sentido?; Onde está o problema?) |
| Personalidade (uso interno) | Analítica e leve: desmonta o problema em partes com uma calma quase divertida; faz a pergunta certa em vez de dar a resposta pronta. |
| Estúdio sugerido | **6** (o vaso lilás da estante ecoa a blusa; o estúdio 6 é o menos usado pelos kits atuais). |

`BASE_PROMPT` (inglês):

```
Photorealistic video presenter, a fictional fair-skinned Brazilian woman about 41 years old, light skin with a few natural freckles, shoulder-length dark brown hair with a few natural gray strands, worn loose and tucked behind the ears, natural light makeup, medium build, thoughtful, calm and slightly amused expression, gentle natural smile with mouth closed. Smart-casual outfit: plain soft lilac blouse with a simple round neckline under an open mid-gray unstructured blazer, solid colors, no pattern, no stripes, no logos, no watch, no bracelet, nothing on the wrists, no necklace, no other accessories. Standing, medium shot from the waist up, facing the camera at eye level, hands relaxed and visible. Soft even studio light, plain light gray background, sharp focus on the face, large enough for lip-sync. No text, no logos, no other people.
```

Perfil de voz:
- Feminina, idade percebida 35 a 48 (`middle-aged`), timbre médio-grave, quente e seguro, sem soar maternal demais (Helena e Patrícia já ocupam esse registro).
- Ritmo moderado (cerca de 140 a 155 palavras por minuto), com pausas marcadas antes das perguntas ("Faz sentido?"); entonação descendente, de quem conclui.
- Português do Brasil com sotaque neutro; uso `informative/educational`; evitar vozes com sorriso audível constante (o tom é de quem pensa junto, não de quem vende).

Todos os quatro prompts têm menos de 1000 caracteres (`HEYGEN_PROMPT_MAX` em `packages/media/src/heygen-looks.ts`): Mauro 773, Laís 830, Vinícius 842, Flávia 849.

## 3. Por que esse elenco é diverso em relação ao atual

| Atual (prompt de referência) | Novo | Diferença |
|---|---|---|
| Marina (27, mulher negra, cabelo cacheado), Helena (45, mulher negra, cabelo grisalho curto) | Mauro (48, homem negro, careca, barba grisalha, corpo largo) | Primeiro homem acima de 34, primeiro careca, primeiro corpo largo. Difere de Gustavo (30, barba escura, magro). |
| Aline (29, ascendência asiática, chanel) | Laís (33, ascendência libanesa, coque, óculos redondos) | Primeira pessoa de ascendência árabe; óculos redondos (os do Renato são retangulares). |
| Enzo (24, pele clara), Thiago (25), Rafael (27), Renato (34) | Vinícius (31, ascendência japonesa, cabelo liso curto) | Primeiro homem de ascendência asiática. |
| Júlia (26, pele clara, rabo de cavalo), Patrícia (38, pixie), Beatriz (28, indígena, cabelo longo) | Flávia (41, pele clara com sardas, cabelo solto com fios grisalhos) | Primeira mulher de pele clara acima de 30; cabelo grisalho natural em mulher branca (Helena é a única grisalha hoje). |

Cores de roupa novas (nenhuma repete as atuais: bege, azul-claro, listras, terracota, coral, oliva, cinza-cardigã, marinho): carvão + branco; creme + ameixa; branco + azul-ardósia; lilás + cinza médio.

## 4. Nomes evitados

**Instrutores atuais (12):** Aline, Beatriz, Camila, Enzo, Gustavo, Helena, Júlia, Marina, Patrícia, Rafael, Renato, Thiago. Também os nomes das vozes da biblioteca já em uso (Gabriel, Ana Dias).

**Personagens dos cursos publicados** (nomes próprios lidos em `docs/qa/revisao-final/transcricao-depois.csv`): Alana, Ana, André, Bia, Bruno, Caio, Davi, Duda, Elisa, Henrique, Iara, Ícaro, Jéssica, Joana, Luan, Luana, Lucas, Malu, Miguel, Nina, Pedro, Ravi, Rebeca, Sara, Vitor, Yasmin.

**Personagens dos cursos novos e das checagens das trilhas** (nomes próprios lidos em `packages/db/src/scripts/pacote-15/*.ts`, `docs/novos-cursos/pacote-15/*/roteiro.md` e `packages/course-schema/src/trails.ts`): Abigail, Amanda, Aurora, Benício, Bianca, Bruna, Camille, Carol, Cauê, Cecília, Clarice, Cleiton, Dani, Débora, Elaine, Evandro, Ezequiel, Fábio, Fernanda, Gael, Gisele, Heitor, Heloísa, Hugo, Iolanda, Isadora, Ismael, João, Jonas, Kaio, Kelvin, Larissa, Leandro, Letícia, Lia, Lívia, Lorena, Maitê, Marisa, Mateus, Mirela, Moacir, Moisés, Murilo, Natália, Nathan, Noemi, Odilon, Otávio, Priscila, Raíssa, Roberto, Rodrigo, Ronaldo, Samuel, Selma, Sérgio, Sidnei, Sofia, Tainá, Tales, Tamires, Ulisses, Valentina, Wesley, Yuri (além dos repetidos da lista anterior: Ana, Bia, Bruno, Davi, Elisa, Ícaro, Lucas, Luan, Malu, Nina, Pedro, Ravi, Rebeca).

**Descartados por proximidade** (não aparecem, mas confundem de ouvido ou na vitrine): Danilo (Dani), Renata (Renato), Mariana e Marcos (Marina), Tiago (Thiago), Tatiana (Tainá/Tamires), Vini só como apelido de Vinícius.

## 5. Como gerar (quando aprovado)

Para cada instrutor, com o curso-alvo da trilha como `COURSE_ID` (um dos rascunhos da tabela 1.1 de `importacao.md`), no padrão do script:

```
NAME="Mauro"    PRONOUN=he  STUDIO=7 BASE_PROMPT="<prompt 2.1>" VOICE_ID=<escolhida> VOICE_NAME="Mauro (ElevenLabs)" COURSE_ID=crs_t303ykqfmhj3yb1g ... tsx apps/worker/src/scripts/novo-instrutor.ts
NAME="Laís"     PRONOUN=she STUDIO=8 BASE_PROMPT="<prompt 2.2>" ... COURSE_ID=crs_tg9iqz8wmmf5pw77
NAME="Vinícius" PRONOUN=he  STUDIO=6 BASE_PROMPT="<prompt 2.3>" ... COURSE_ID=crs_4jh683s5h351z2db
NAME="Flávia"   PRONOUN=she STUDIO=6 BASE_PROMPT="<prompt 2.4>" ... COURSE_ID=crs_dp9s7pdro9j6e3m0
```

Depois: extrair o kit (`estudio7-mauro`, `estudio8-lais`, `estudio6-vinicius`, `estudio6-flavia`) para a biblioteca e aplicar aos outros dois cursos da trilha; trocar a abertura ("Oi! Eu sou o Mauro, seu orientador…") nas aulas 1. Gerar personagem e 3 câmeras é pago (HeyGen); adicionar voz da biblioteca ElevenLabs é grátis, mas ocupa 1 vaga por voz (4 vagas). Conferir no retrato-base, antes de pedir as câmeras: pulsos limpos (sem relógio), nenhuma folha no quadro, óculos sem reflexo (Laís).

## 6. Tabela-resumo

| Instrutor | Trilha | Idade | Pronome | Aparência (resumo) | Roupa | Estúdio | Voz (critérios) |
|---|---|---|---|---|---|---|---|
| **Mauro** | Respeito e diálogo | ~48 | he | Homem negro, careca, barba grisalha curta, corpo largo; acolhedor e firme | Suéter carvão liso, colarinho branco | 7 | Masc. 40–55, grave-médio, 130–145 ppm, sotaque neutro |
| **Laís** | Tecnologia com critério | ~33 | she | Mulher de ascendência libanesa, pele oliva, coque baixo, óculos redondos sem reflexo; curiosa e precisa | Blusa creme, cardigã ameixa aberto | 8 | Fem. 28–38, médio-claro, 150–165 ppm, dicção nítida, neutro |
| **Vinícius** | Autonomia no trabalho | ~31 | he | Homem de ascendência japonesa, cabelo liso curto, magro-atlético; direto e encorajador | Camiseta branca, overshirt azul-ardósia | 6 | Masc. 26–34, médio com energia, 150–165 ppm, neutro |
| **Flávia** | Pensar e resolver | ~41 | she | Mulher de pele clara com sardas, cabelo castanho com fios grisalhos, solto; analítica e leve | Blusa lilás, blazer cinza médio | 6 | Fem. 35–48, médio-grave, 140–155 ppm, pausas antes das perguntas, neutro |
