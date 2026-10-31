# Lote 03 — Celular no trabalho: quando pega mal?

- Curso: `crs_hd4jnnpx3oj0xf14` (slug `celular-no-trabalho-quando-pega-mal`), workspace `wsp_eogwtp01f358wyof`
- Roteiro: `docs/roteiros/lote/03_celular_no_trabalho.md` (cópia de `Downloads/03_celular_no_trabalho.md`)
- Instrutor: **Rafael** ("Seu orientador"), kit `estudio7-rafael`, voz Gabriel (ElevenLabs), estúdio 7
- Paleta: invertida `{ base: "#FF7A08", accent: "#1D1E4C" }`
- Script próprio: `packages/db/src/scripts/lote/03-celular.ts` (`--show`, `--palette`)

## Situação (2026-10-30, 15:45 UTC)

| Etapa | Estado |
|---|---|
| Roteiro adaptado e importado | feito (rascunho rev. 11 com vídeos) |
| Instrutor, voz e paleta | feito (Rafael, pronome `he`, voz Gabriel, 3 câmeras prontas, paleta invertida) |
| Vídeos | 4 gravados (V00 33,8 s · V01 40,5 s · V02 33,8 s · V03 38,9 s), anexados, nenhum desatualizado. Disparados às 12:23 pela sessão principal (`lote-videos.sh`) |
| Conferência quadro a quadro | feita (ver abaixo) |
| QA como aluno | feito: todos os caminhos no motor + passeio da aluna pela API + prévia no navegador |
| Publicação | versão 1 (`ver_v7f7uto1eu4hd5my`) da revisão 11 |
| Matrículas | `enr_2h35fnnyqj08cft9` (aluno@demo.local), `enr_z1jp9crqtczue5nd` (aluna@demo.local) |

## Conferência dos vídeos (quadro a quadro, a cada 3 s + zoom nas pílulas)

| Vídeo | Rosto/voz | Letreiro | Pílulas | Pergunta a seguir | Marca d'água | Cores |
|---|---|---|---|---|---|---|
| V00 | Rafael, 3/4 e lateral; fala termina com a chamada | "Rafael · Seu orientador · DNA Work" | Celular no trabalho: Ferramenta da tarefa · Fonte de interrupção · Regra (acendem uma a uma) | "O que faz?" | sim, rodapé direito | véu laranja, título e ícones marinho |
| V01 | ok | — (só no 1º vídeo da aula) | Antes de usar o aparelho: Finalidade · Momento · Orientação da equipe | "Você pode usar também?" | sim | ok |
| V02 | ok | "Rafael · Seu orientador · DNA Work" | Recado importante: Explique o necessário · Canal · Detalhes pessoais (a 3ª acende por volta de 17 s) | "Como combina?" | sim | ok |
| V03 | ok | — | Antes de fotografar ou filmar: Autorização · **Cobre** · Canal e o equipamento (a 3ª acende por volta de 32 s) | — (segue para a missão) | sim | ok |

Pendência de texto (minha): a pílula "**Cobre**" sozinha confunde (parece o metal). O certo seria "O que ela cobre". Ver achado 8.

## QA como aluno

- **Todos os caminhos** (`packages/db/src/scripts/lote/03-caminhos.ts`, motor real, sem gravar): aula 1 tem 9 combinações, todas terminam em `fim_aula_01`; aula 2 tem 1.029 combinações (escolha × avaliação com 2 chances por pergunta), que terminam em `fim_aula_02` (405) ou `fim_aula_02_revisar` (624). Nenhuma cena fica inalcançável, sem laço, sem erro.
- **Aluna de teste pela API** (login próprio, matrícula real): aula 1 com as respostas fracas (retornos dizem o que fazer, sem julgar), missão M01 montada e fim; aula 2 com a resposta forte, M02, avaliação com erros na 1ª chance e aprovação com 2 de 3, encerramento "aprovado". "Meu roteiro" guarda as duas frases.
- **Prévia no navegador** (aula 1): cena de abertura com "Ler a fala", "Assistir" e "Pular vídeo"; pergunta com a situação e a chamada; depois de "Confirmar escolha", o cartão "Sua escolha" com o retorno aparece **antes** do vídeo seguinte; legendas (CC) disponíveis.
- Textos: sem CIEE/IEL, futsal ou slogan; sem "Marina" nem "orientadora". Única ocorrência de gênero errado: `brief.tone` interno ("apresentadora em conversa com o aluno"), que não aparece para o aluno (achado 9).

## Ajustes no roteiro (texto, antes de gravar)

1. Marina → Rafael, "sua orientadora" → "seu orientador"; "Direção da instrutora" → "Direção do instrutor".
2. Gramática do objetivo final: "consegue confirma… e combina" → "consegue confirmar… e combinar".
3. Rafael tirado de "Personagens de exemplo (fictícios)" (ver achado 2).
4. `Chamada:` em Q01, Q02 e Q03 (o motor fala a frase num plano final do vídeo anterior):
   - Q01 "Agora é com você: o que você faria no lugar do Caio?"
   - Q02 "Agora é com você: o que você faria no lugar da Ana?"
   - Q03 "Agora é com você: como você combinaria esse recado?"
5. Retomada neutra no começo dos vídeos que vêm depois das respostas:
   - V01 "Seja qual for a sua escolha, a ideia é a mesma: a atenção na pessoa vem primeiro."
   - V03 "Qualquer que tenha sido a sua escolha, o que deixa tudo mais leve é combinar antes."
6. `Cartão:` nos 4 vídeos (2–3 tópicos com o negrito dito na fala), para ter pílulas (ver achado 1).

## O que o motor fez sozinho

- Importação com `--kit estudio7-rafael`: estúdio, câmeras de zona, voz, letreiro, marca d'água e vinheta, sem copiar de outro curso. 0 erros de compilação.
- `Chamada:` (recurso novo da ponte) virou plano final "chamada" voltado à lente, com gesto convidativo.
- Planos de zona: fala na 3/4 nos vídeos de abertura, nas laterais nos de conteúdo; pílulas numa lateral, alternando o lado.
- Orçamento oficial por cena, com teto diário e sem cobrança.
- Simulação de alunos de teste (grátis): 5 perfis terminam as 2 aulas em cerca de 7,2 min, notas 4, 4, 4, 4 e 5.

## Achados (onde precisou contornar)

1. **"Texto na tela" não vira pílula.** Só `Cartão:` gera o plano `presenter_chips`. O roteiro do GPT (formato atual do prompt) diz "texto na tela sem cartões conceituais", então os vídeos sairiam só com o instrutor falando. Contorno: escrevi cartões à mão. Sugestão: quando a cena não tem cartão, o importador poderia gerar pílulas a partir das palavras de "Texto na tela" que aparecem na fala (ou o prompt do GPT poderia pedir `Cartão:` sempre).
2. **O instrutor listado em "Personagens de exemplo" entra no elenco duplicado** como "Personagem de exemplo (fictício)", ao lado do mesmo nome como "Seu orientador". O prompt do GPT sempre coloca a orientadora nessa linha. Sugestão: o importador ignora nessa linha o nome do instrutor do kit/`--presenter`.
3. **O importador não aceita paleta** (`branding.videoPalette`). Reimportar reconstrói a marca e apaga a paleta, que precisa ser regravada por script a cada reimportação. Sugestão: flag `--video-palette base,accent` ou paleta no kit.
4. **O orçamento padrão inclui vídeo das perguntas** (q01–q03, US$ 0,64 a mais) mesmo com `Voz opcional: não`. A regra do lote é pergunta só em texto. Contorno: orçamento com `nodeIds` só dos vídeos. O botão "Calcular orçamento" do estúdio teria incluído as perguntas. Sugestão: respeitar `Voz opcional: não` (ou a ausência de narração própria) na elegibilidade.
5. **Pagar exige o usuário no Terminal.** O modo automático bloqueia `POST media-jobs/batch` (esperado pelas regras do lote). O orçamento vale 30 min, então se o usuário demora, é preciso gerar outro.
6. **Teto diário do lote:** restavam US$ 19,58 de US$ 50 às 11:31 UTC. Com cerca de US$ 3,3 por curso, cabem 5–6 cursos, não 12.
7. Simulação dos alunos: (a) "TOO_MUCH_TEXT" em Q01 e Q02 (cerca de 105 palavras, situação + 3 escolhas + feedbacks), conteúdo do roteiro mantido; (b) o texto "Quando errei (…)" aparece também para resposta `ok`, um detalhe de redação do simulador.

8. **Rótulo da pílula = só o negrito.** Um negrito curto e ambíguo ("cobre") vira uma pílula sem sentido. Também não há como corrigir de graça depois de pago: a remontagem sem custo (`recompose-directed.ts`) lê a direção guardada no job, não a do rascunho, e editar o cartão no rascunho deixa o vídeo desatualizado. Sugestões: (a) o importador avisa quando o negrito tem 1 palavra que não é substantivo/verbo claro; (b) remontagem sem custo a partir da direção ATUAL do rascunho quando só mudou texto de cartão (pílulas são sobreposição local). Pedido à sessão principal: remontar V03 com "O que ela **cobre**" se (b) existir.
9. `brief.tone` do importador fixo no feminino ("apresentadora"), mesmo com kit de instrutor `he`.
10. O aviso "Pergunta que vem a seguir" usa só a última frase do título da pergunta ("O que faz?", "Como combina?"), que fica vaga fora de contexto. Sugestão: usar o título inteiro, ou um campo curto próprio.
11. O navegador do app é compartilhado entre sessões (login de equipe já ativo). Para não trocar o login dos outros, o QA da área do aluno foi feito pela API com cookie próprio, e o visual pela prévia do estúdio.

## O que precisou da sessão principal

- Disparar os vídeos pagos (o modo automático bloqueou `media-jobs/batch` aqui; o primeiro orçamento venceu antes de alguém rodar o comando).
- Nenhuma correção de código foi necessária para entregar.

## Custo

- Vídeos: 4 jobs reais, estimado **US$ 3,31** (V00 0,79 · V01 0,92 · V02 0,76 · V03 0,85); `cost_actual_usd` ainda vazio nos jobs. Nenhuma regravação.
- Orçamentos, simulação de alunos, importação, publicação e QA: US$ 0.
