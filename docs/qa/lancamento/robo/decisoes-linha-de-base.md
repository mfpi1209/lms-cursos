# Linha de base do robô: o que depende de decisão

> **Decidido pelo dono em 31/10/2026: seguir todas as recomendações.**
> 1. Cabeçalho na opção A: logo DNA Work à esquerda e nome curto do curso no centro.
> 2. Atividade opcional: `required: false` e "Fazer depois" mantido. "Missão cumprida" só para quem salvou.
> 3. O vídeo final não precisa chamar a missão.
> 4. Meta dos travamentos: zerar os de 200 ms ou mais; os de 120 a 199 ms ficam tolerados.
> 5. Opções que são escolha de item ou fala dirigida a alguém ficam aceitas como exceção à 1ª pessoa.
> 6. O tamanho da atividade fica aceito.
> 7. Exceção aceita: no C14·A6, a atividade fica no meio da aula. É desenho intencional, segundo o dono e a revisão.
>
> O robô já mede contra esse padrão: a linha de base foi reanalisada com as regras novas, e o caminho 4 testa "Fazer depois". Quem implementa as mudanças no player e nos cursos é a sessão principal.

Rodada `linha-de-base`, de 31/10/2026: 14 cursos, 42 aulas e 126 caminhos. Ficam de fora os defeitos que a sessão principal já está corrigindo: títulos das perguntas, missão não anunciada, atividade no meio do C14·A6, a parada do C13 em "Continuar" e os travamentos pelas emendas. Aqui ficam as escolhas de padrão ou de custo.

## 1. Cabeçalho: um padrão só

**Hoje há três padrões:**
- O catálogo e a página do curso mostram o **logo DNA Work**.
- Dentro da aula, à esquerda, aparece o **título do curso em texto** (ex.: "que roupa eu uso?").
- No centro, 13 cursos mostram **"Aula N de M"** e o C02 mostra **"DNA Work"**.

Há ainda os 13 cursos que definem uma marca própria no roteiro (`branding.wordmark`, ex.: "Roupa no trabalho", "Comece bem", "Primeira Vaga"). Essa marca **não aparece em lugar nenhum**.

**Opções:**
- **A. Logo DNA Work à esquerda em todas as telas, nome curto do curso no centro.** Recomendada: o aluno vê a mesma marca do catálogo à aula, e a posição na aula já está na barra de etapas ("2 de 5 etapas").
- **B. Manter o nome do curso à esquerda e "Aula N de M" no centro**, só tirando o "DNA Work" do C02.
- **C. Usar a marca própria de cada curso (`wordmark`) à esquerda.**

Nos três casos, o C02 sai do padrão de hoje.

## 2. Atividade "Na prática": obrigatória ou opcional?

Em **todas as 40 aulas que têm atividade** (o C14 tem 2 aulas sem), a atividade está marcada como obrigatória (`required: true`), mas mostra **"Fazer depois"**, porque aceita resposta vazia (`minLength: 0`). Na prática, ela é opcional.

**Opções:**
- **Opcional (recomendado):** manter "Fazer depois" e acertar a marcação para `required: false`. O aluno não trava.
- **Obrigatória:** tirar "Fazer depois".

Atenção, nos dois casos: hoje o fim da aula mostra "Missão cumprida" também para quem clicou "Fazer depois". A conquista conta a etapa visitada (`achievements` em `immersive-player.tsx`), não a resposta salva. Se a missão for opcional, vale contar só quem salvou.

## 3. O vídeo final deve chamar a missão?

Em **31 das 40 aulas com atividade**, de 13 cursos, o último vídeo termina sem falar da missão. Ela só aparece na tela depois da vinheta, com a frase de ponte escrita ("Você viu que… Agora monte…"). Como a abertura já anuncia a missão, o aluno não é pego de surpresa.

**Opções:**
- **Aceitar (recomendado):** a ponte escrita na tela da atividade já faz a ligação, e não há custo.
- **Regravar ou ajustar o final desses 31 vídeos para chamar a missão:** é mídia nova.

## 4. Travamento entre falas: até onde corrigir

São trechos em que a imagem fica parada (nenhum pixel se mexe) dentro do arquivo do vídeo:
- **74 trechos de 200 a 400 ms no meio do vídeo**, contados como importantes. São visíveis como "engasgo". Os cursos com mais casos são C14 (27), C13 (11) e C11 (9).
- **236 trechos de 120 a 199 ms**, contados como menores. São 3 a 4 quadros, quase imperceptíveis a 1×.

**Opções:**
- **Meta da remontagem: zerar os de 200 ms ou mais e aceitar os menores (recomendado).** A comparação depois das emendas vai medir exatamente isso.
- **Zerar também os de 120 a 199 ms:** dá mais trabalho de emenda e pouco ganho visível.

## 5. Opções de resposta que não estão em 1ª pessoa (C13 e C14)

São 13 opções que, por natureza, não são "Eu…": escolha de item ("De frente para a janela…", "Uma foto de celular…"), frase dirigida a alguém ("Como você quer a lista…?") ou continuação de frase ("...e a feira aconteceu…").

**Opções:**
- **Aceitar como exceção (recomendado):** nesses casos, forçar "Eu…" deixaria o texto artificial.
- **Reescrever.**

## 6. Tamanho da atividade

- **Computador (1440×900):** 11 atividades passam da tela por 120 a 281 px. São do C04·A1, C13 (A1, A2, A4) e C14 (A1, A2, A4, A6, A9, A10). O botão de salvar continua visível.
- **Celular (390×844):** a página da atividade rola de 684 a 1.301 px; a mediana é 985 px. O botão de salvar fica preso no rodapé quando a resposta está pronta.

**Opções:**
- **Aceitar (recomendado):** nada impede salvar.
- **Compactar os grupos:** menos opções ou textos menores.
