# Curso 06 — Liberdade e intimidade são coisas diferentes (lote 2026-10-30)

Estado: **PUBLICADO** (versão 1, da revisão 21), com aluno@demo.local e aluna@demo.local matriculados.
**Pendência (fase de ajustes):** os vídeos saíram **sem pílulas** (ver achado 1). A sessão principal decidiu publicar assim, sem regravar ("Produção e entrega. APROVO, depois ajustamos."). O motor vai gerar pílulas a partir do "Texto na tela" (item A11 em `docs/implementation-status.md`). Sugestão para quando regravar: `Cartão:` em **V01** ("Preferência · Convivência · Respeito") e **V03** ("Limite · Pedido · Apoio").

- Curso: `crs_b8zeh4b2gguseghq` (slug `liberdade-e-intimidade-sao-coisas-diferentes`, letreiro "Liberdade e intimidade")
- Roteiro de trabalho: `docs/roteiros/lote/06_limites_e_intimidade.md`
- Instrutora: **Patrícia** (Sua orientadora): mulher parda de ~38 anos, cabelo curto natural, serena, blusa terracota; estúdio 8; paleta clássica (`{ base: "#1D1E4C", accent: "#FF7A08" }`).
- Voz: **Luciana Cadar** (ElevenLabs `fUAUU80st9SqdYx319Zk`; no catálogo, "a teacher's voice—calm, with moderate intonation").
- Biblioteca: `voz-luciana-cadar` (voice), `instrutor-patricia` (presenter: `cam_patricia8_esq/dir/34` no `estudio-jovem-8`, base `df9f69431e3d5550b4b05c00b7aadd8b`), `estudio8-patricia` (kit).
- Scripts meus: `packages/db/src/scripts/lote/06-biblioteca.ts` (`voz` | `instrutora`) e `06-paleta.ts`. O `06-gerar-patricia.sh` foi salvo pela sessão principal e rodado pelo usuário via `lote-rostos.sh`.
- Matrículas: `enr_xsvqg9ixapr9c3ii` (aluno@) e `enr_3x1zk70mv8mxprs9` (aluna@).

## Ajustes no roteiro (tema delicado)

- Marina → Patrícia. O V00 abre com "Oi, que bom ter você aqui. Eu sou a Patrícia, sua orientadora…". As notas de direção também foram trocadas.
- Corrigi o objetivo final, que tinha erro de concordância: "consegue confirma…" virou "consegue confirmar…, expressar…, buscar…".
- As chamadas ficam no campo `Chamada:` de Q01 a Q03 e o motor as fala num plano próprio no fim do vídeo anterior: "Agora é com você: como a Nina chama essa pessoa?", "…o que o Bruno responde?" e "…o que o Bruno pode fazer?".
- As retomadas servem para qualquer escolha. O V01 começa com "Seja qual for a sua escolha, a ideia é a mesma…" e o V03 com "Qualquer que tenha sido a sua escolha, tem caminho."
- Nada culpa quem sofre o constrangimento:
  - "Sentir incômodo não é exagero" (V02);
  - "A culpa nunca é de quem pediu para parar" (V03);
  - o feedback fraco de Q03 acolhe ("Muita gente faz isso para evitar conflito, e dá para entender…");
  - o feedback fraco de Q01 começa com "É natural seguir o grupo, mas…".
- A quem recorrer (V03): quem acompanha seu trabalho, o canal indicado pela empresa, a escola, o agente de integração do contrato e, para adolescente, uma pessoa adulta de confiança. Se o primeiro apoio não ajudar, procurar outro.
- Linguagem neutra no lugar de "confortável e seguro" e "sozinho": agora é "à vontade e em segurança" e "sem ajuda".
- Tamanho das falas: V00 106, V01 111, V02 ~100 e V03 113 palavras, todas no limite de 120.

## Conferência dos vídeos (folhas de contato a cada 2,5 s + recortes)

| Vídeo | Duração | Rosto/câmeras | Voz/áudio | Pílulas | Letreiro | Pergunta a seguir | Marca d'água | Cores |
|---|---|---|---|---|---|---|---|---|
| V00 | 46,8 s | Patrícia na 3/4; chamada na lateral esq. ✓ | Luciana, −25,7 dB médio ✓ | **não há** | "Patrícia · Sua orientadora · DNA Work" ✓ | "Como chama a pessoa?" ✓ | DW DNAWORK, rodapé dir. ✓ | marinho + barra laranja ✓ |
| V01 | 51,6 s | lateral esq. o vídeo todo ✓ | ✓ | **não há** (parede livre vazia) | — | "Qual sua resposta?" ✓ | ✓ | ✓ |
| V02 | 41,2 s | 3/4; chamada na esq. ✓ | ✓ | **não há** | ✓ | "Como agir?" ✓ | ✓ | ✓ |
| V03 | 47,5 s | lateral esq. ✓ | ✓ | **não há** (parede livre vazia) | — | (segue para a missão, sem cartão) | ✓ | ✓ |

O rosto é o mesmo em todos os quadros, a boca acompanha a fala e as mãos ficam naturais, sem deformação. A voz usada é a da Luciana (`voiceId` conferido no job). Os 4 vídeos estão em 1920×1080 e têm legenda em VTT.

## QA como aluno

- **Prévia, aula 1:** V00 → Q01 com a resposta fraca. O cartão "Sua escolha" e o retorno aparecem antes do V01. Depois V01 → Q02 com a resposta ok → M01: montei "usar o nome que você indicou" + "confirmar antes de repetir" e cliquei em "Usar esta frase". O Meu roteiro mostrou a frase e "O que você levou" com "Aula concluída".
- **Prévia, aula 2:** V02 → Q03 com a resposta fraca (retorno acolhedor) → V03 → M02. O botão "Pular" da missão funciona, e o roteiro mostra "Monte na aula 2". Na avaliação, errei a pergunta 1 ("Ainda não", com a explicação e 1 tentativa restante) e acertei na segunda tentativa; as perguntas 2 e 3 acertei de primeira. Resultado: "Curso concluído", com a vinheta (dá para pular) e o roteiro.
- **Toda escolha leva a algum lugar:** as 3 opções de cada decisão convergem para a cena seguinte, e a compilação deu 0 erros.
- **Área do aluno** (login aluno@): o curso aparece em `/aprender` como "Novo". A matrícula e as duas aulas respondem 200.
- **Textos:** procurei CIEE, IEL, futsal, slogan e "Marina" no documento e não achei nada.
- **Alunos de teste simulados** (grátis): os 5 terminam em ~7,6 min, com notas 4, 4, 4, 4 e 5.

## O que o motor fez sozinho

- A importação por Markdown com `--kit` + sobrescritas deu 0 erros: 2 aulas, 3 decisões, ~7,7 min. Ao trocar o kit, a reimportação levou a apresentação inteira (câmeras de zona, voz, papel, pronome).
- O campo `Chamada:` virou um plano final olhando para a lente, e o cartão "Pergunta que vem a seguir" entrou sozinho.
- O rosto (personagem + 3 câmeras no estúdio 8) ficou pronto em ~2 min dentro do `lote-rostos.sh`, com avatar_iv/avatar_v.
- O orçamento oficial (`/media-jobs/quote`) não cobra nada. O lote saiu exatamente pelo orçado e os 4 jobs terminaram sem erro.
- O fluxo do aluno funcionou inteiro sem ajuste: escolha → retorno, missão → roteiro, avaliação com 2 tentativas → fim do curso.
- Publicar e matricular (`publicar-e-matricular.ts`) funcionou sem custo.

## Onde precisou contornar / achados

1. **"Texto na tela" não vira pílula, e eu não pus `Cartão:` antes de gravar.** Os 4 vídeos saíram sem pílulas, e no V01 e no V03 a parede livre fica vazia o vídeo todo. É o mesmo achado dos cursos 01, 02 e 03; eles acrescentaram `Cartão:` antes da gravação e eu não fiz isso a tempo. Como o motor não monta pílulas sem regravar, não mexi no rascunho e avisei a sessão principal. *Sugestão:* com kit de pílulas, o importador gerar pílulas a partir do "Texto na tela" (que já vem como "A · B · C"), ou pelo menos avisar na importação que o vídeo sairá sem pílulas.
2. **O importador não tem caminho para instrutor novo.** O `--kit` exige um instrutor com câmeras prontas, só que o kit da Patrícia só existe depois de gerar o rosto, e gerar o rosto exige um curso. Contorno: importei com `--kit estudio7-marina` + sobrescritas (`--presenter`, `--avatar-name`, `--presenter-pronoun she`, `--voice`), gerei o rosto, registrei a instrutora e o kit, e reimportei com `--kit estudio8-patricia`. Além disso, o log do import diz "Marina no Estúdio jovem 7" mesmo com `--presenter Patrícia`, o que engana.
3. **`novo-instrutor.ts` só funcionava com "he" e no estúdio 7.** A sessão principal corrigiu durante o lote (`PRONOUN`, `ESTUDIO`, `CAM_PREFIX`). Mesmo assim, ele não registra o instrutor na biblioteca, e precisei do `06-biblioteca.ts`. *Sugestão:* o script terminar gravando presenter + kit.
4. **Reimportar apaga `branding.videoPalette`:** o kit não carrega paleta. Reapliquei com o `06-paleta.ts` depois de cada import. *Sugestão:* pôr a paleta no kit ou criar `--video-palette`, e o import preservar a paleta do rascunho.
5. **O letreiro foi cortado sem aviso:** sem `--wordmark`, o import usou o título truncado ("Liberdade e intimidade são coisas difer…"). Reimportei com `--wordmark "Liberdade e intimidade"`.
6. **O orçamento sem filtro inclui as perguntas.** Para deixar "perguntas só em texto", passei os `nodeIds` dos vídeos.
7. **A câmera "3/4" saiu de frente:** a `cam_patricia8_34` ficou centralizada e quase frontal, igual à base.
8. **A chamada repete "Agora" no V01:** a fala termina com "Agora veja o Bruno…" e a chamada começa com "Agora é com você…". Ficou um pouco repetitivo. Não regravei. *Sugestão:* o importador avisar quando a última frase da fala e a chamada começam com a mesma palavra.
9. **O título da pergunta vira texto com a pessoa errada:** a Q01 mostra "…Ela ainda não sabe se a pessoa gosta desse nome. **Você ouviu um apelido.** Agora é com você…". O prefixo do título "Você ouviu um apelido." foi parar no corpo, em 2ª pessoa, no meio de uma situação da Nina. Pequeno, mas confunde. *Sugestão:* não colar o prefixo do título no enunciado, ou avisar.
10. **Falsos positivos do simulador:** ele elogia "treinar falando em voz alta" num curso com `Voz opcional: não` e soma os feedbacks de todas as alternativas como texto na tela (Q01: 122 palavras), igual ao achado do curso 08.
11. **Acessibilidade:** as alternativas das perguntas e da avaliação aparecem para leitor de tela só como "a", "b" e "c" (`radio "a"`), sem o texto da alternativa.
12. **Teto de mídia:** quando o curso começou, restavam US$ 19,58 do teto diário para o lote inteiro; depois o limite subiu para US$ 80.

## Custo

- Rosto (HeyGen): ~4 créditos (1 personagem + 3 câmeras), rodado pelo usuário em `lote-rostos.sh`.
- Vídeos: **US$ 3,62** estimados (4 vídeos, 174 s, voz ElevenLabs + HeyGen), disparados pela sessão principal às 12:30 com a aprovação do usuário. O job não grava o custo real (`cost_actual_usd` vazio).
- Eu não gastei nada diretamente.
