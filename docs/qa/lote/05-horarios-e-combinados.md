# Lote 05 — "Horário é combinado" (2026-10-30)

**Curso:** `crs_4tj8a3q3g9gudgb7` (slug `horario-e-combinado`) · publicado (versão 2) · 1 módulo, 2 aulas, 4 vídeos, 3 decisões, 2 missões, 1 avaliação (~7,1 min).
**Instrutora:** Júlia, "Sua orientadora" (nova; mulher branca, 26, cabelo liso escuro preso em rabo baixo, camisa listrada marinho e branca), estúdio 6.
**Voz:** Malu – Casual Explainer (ElevenLabs, biblioteca pública, `fhtZMBwha5du5OxuvexO`; jovem, clara, explica passo a passo sem formalidade).
**Paleta:** invertida (`branding.videoPalette = { base: "#FF7A08", accent: "#1D1E4C" }`).
**Alunos de teste matriculados:** aluno@demo.local (`enr_ld33t22839494yu5`), aluna@demo.local (`enr_aw5iso8io4g5q7tc`), ambos na versão 2.

## Custo

| Item | Valor |
|---|---|
| Visual da Júlia (1 personagem + 3 câmeras, HeyGen) | ~4 créditos HeyGen (rodado pelo usuário via `lote-rostos.sh` → `05-gerar-julia.sh`, 12:24) |
| Voz Malu adicionada à conta ElevenLabs | grátis (1 vaga de voz) |
| Vídeos V00–V03 (orçamento `mqt_cvokszlqemft9jg8`, disparado pela sessão principal com o "APROVO" do usuário de lá) | **US$ 3,18** estimado (151 s) — dentro do teto de US$ 4 |
| Perguntas Q01–Q03 | US$ 0 (só texto, sem voz) |

`cost_actual_usd` ficou vazio nos 4 jobs (só há o estimado). Nesta sessão nada pago foi disparado.

## Entregas

- Roteiro: `docs/roteiros/lote/05_horarios_e_combinados.md` (cópia ajustada):
  - Marina → Júlia na fala e nas notas; "consegue planeja" → "consegue planejar";
  - Júlia tirada de "Personagens de exemplo" (virava personagem fictício duplicado no elenco, achado 3);
  - `Chamada:` em Q01–Q03 ("o que ainda falta no plano do Lucas?", "o que você faria no lugar dele?", "como a Yasmin deve conversar?");
  - retomada que serve para qualquer escolha no início de V01 ("Qualquer que tenha sido a sua escolha…") e V03 ("Seja qual for o caminho que você escolheu…");
  - V00/V02 terminam apresentando a situação (Lucas no ônibus; Yasmin com compromisso na sexta) e V01 apresenta o novo problema do Lucas antes da Q02; V03 termina em "Agora, monte a sua frase." (vem a missão);
  - `Cartão:` em V01 ("Antes de sair, confirme": horário, entrada, trajeto) e V03 ("Ao avisar, informe": período, pendente, próximo passo) para gerar pílulas.
- Biblioteca: `voz-malu`, `instrutora-julia` (câmeras `cam_julia6_esq/dir/34`, look base `cam_julia_base`, prompt do personagem), kit `estudio6-julia` (estúdio 6, voz Malu, marca DNA Work, direção com zonas, regras e alunos de teste iguais ao kit da Marina).
- Scripts meus (`packages/db/src/scripts/lote/`): `05-biblioteca-julia.ts` (`voz | kit <curso>`), `05-paleta.ts`, `05-rotulos.ts`; `05-gerar-julia.sh` (rosto, pago; salvo pela sessão principal a partir do meu comando).

## Conferência dos vídeos (quadro a quadro, 12 quadros por vídeo + quadro final)

| Vídeo | Duração | Rosto / câmera | Letreiro | Pílulas | "Pergunta que vem a seguir" | Marca d'água / cores |
|---|---|---|---|---|---|---|
| V00 | 31,1 s | Júlia, 3/4 → chamada na câmera esquerda | "Júlia · Sua orientadora · DNA Work" (laranja) | — | "Qual informação falta no planejamento?" | ok / ok |
| V01 | 47,5 s | câmera esquerda (parede livre à direita) | — | Horário · Entrada · Trajeto (véu laranja, título e pílulas marinho, acendem quando ditas) | "O que fazer?" (ver achado 6) | ok / ok |
| V02 | 35,2 s | 3/4 → chamada na esquerda | "Júlia · Sua orientadora · DNA Work" | — | "Como conversa?" | ok / ok |
| V03 | 44,4 s | câmera esquerda | — | Período · Pendente · Próximo passo | — (segue missão) | ok / ok |

- Mesma pessoa em todos os planos (rosto, rabo de cavalo, camisa listrada, brincos), boca nítida, sem zoom digital; estúdio 6 com logo DW na estante.
- Voz: os 4 jobs usaram `fhtZMBwha5du5OxuvexO` (Malu) e o look 3/4 da Júlia; volume parecido entre vídeos (média −23 dB, pico −4,5 dB) e nenhum silêncio > 1,5 s. **Não** transcrevi a fala (há `whisper-cli`, mas nenhum modelo instalado), então a conferência palavra a palavra ficou de fora.
- Nada de futsal, CIEE, IEL, slogan, Marina, Rafael ou câmera `cam_j7_*` no rascunho.

## QA como aluno

- **Prévia (navegador, como autor):** Aula 1 — pular vídeo → Q01 (situação + chamada) → alternativa fraca → cartão "Sua escolha" com o retorno ("Faça assim…") **antes** do V01 → Q02 forte → M01 (frase montada tocando blocos) → fim com "Meu roteiro" (frase e aprendizados). Aula 2 — Q03 ok → V03 → M02 pulada → avaliação: Q1 errada duas vezes, Q2 e Q3 certas (2/3) → `fim_aula_02`, "Curso concluído", checklist "Antes de sair" e vinheta pulável.
- **Rotas no rascunho:** toda escolha leva a uma cena; as duas aulas chegam a um `end`; a avaliação tem `fim_aula_02` (≥ 2 acertos) e `fim_aula_02_revisar` (menos de 2) — conferido pelo grafo, não percorrido no navegador.
- **Área do aluno (aluno@demo.local, por HTTP):** `/aprender`, a página do curso ("2 aulas · cerca de 10 min · 0 de 2 concluídas") e as duas aulas respondem 200 com Júlia no letreiro; os 4 vídeos são servidos ao aluno (`/api/assets/…`, 206 video/mp4).
- **Alunos simulados (biblioteca):** notas 4, 4, 4, 4, 5; todos terminam as 2 aulas em ~7,1 min e recomendam. Queixa única: "texto demais" em Q01/Q02 (~112 palavras; ver achado 8).
- Corrigido após o QA: rótulo das lacunas "Escolha horario:" / "periodo" → "horário" / "período" (`05-rotulos.ts`, só missões, sem vídeo) e republicado (v2; matrículas migradas, vídeos em dia).

## O que funcionou sozinho

- Importação com `--kit` (0 erros), direção com zonas (fala na 3/4 ou na lateral, pílulas na parede livre), letreiro só na primeira cena de cada aula.
- Ponte: `Chamada:` vira plano final próprio na câmera frontal + cartão "Pergunta que vem a seguir"; no player o cartão "Sua escolha" aparece antes do vídeo seguinte.
- Paleta invertida aplicada pelo compositor (véu laranja, texto marinho escolhido pelo contraste), marca d'água, legendas (CC) no player.
- `novo-instrutor.ts` com `PRONOUN`, `ESTUDIO` e prefixo sem acento (`cam_julia6_*`, `cam_julia_base`): 4 looks prontos em ~2 min, todos com `avatar_iv`.
- Orçamento oficial (`/media-jobs/quote`), lote, worker real: 4 vídeos sem falha; publicação, migração de matrículas e simulação de alunos.

## Onde precisei contornar (achados)

1. **Instrutor novo é "ovo e galinha".** As câmeras são geradas dentro de um rascunho, e o kit só aceita instrutor com câmeras prontas. Importei primeiro com o kit da Marina (provisório), esperei o rosto e só então montei `presenter` + `kit` à mão (`05-biblioteca-julia.ts`) e reimportei com `--kit estudio6-julia`. **Sugestão:** `novo-instrutor.ts` registrar `voice` + `presenter` + `kit` no fim (e poder rodar sem curso).
2. **Reimportar apaga a paleta.** O importador monta `branding` só com as flags, então `videoPalette` some a cada reimportação; reapliquei com `05-paleta.ts` três vezes. **Sugestão:** flag `--palette classica|invertida` (ou guardar a paleta no kit/marca) e preservar campos de marca que o roteiro não define.
3. **Orientadora em "Personagens de exemplo" vira personagem duplicado.** O roteiro do GPT lista "Marina, orientadora virtual da DNA Work" entre os personagens fictícios; o importador cria um segundo membro do elenco ("Júlia · Personagem de exemplo (fictício)") além da instrutora do kit. Tirei a linha da cópia. **Sugestão:** o importador ignorar quem tem o nome do instrutor (ou o prompt não listar a orientadora ali).
4. **Pílulas só nascem de `Cartão:`.** O roteiro traz só `Texto na tela:` e pede "sem cartões conceituais"; sem `Cartão:` os vídeos saem só com a instrutora. Adicionei cartões em V01/V03 (como 01, 04 e 10). **Sugestão:** o prompt pedir `Cartão:` nos vídeos "Como aplicar", ou gerar pílulas de `Texto na tela`.
5. **Rótulo da lacuna = id sem acento.** `{horario}`/`{periodo}` aparecem ao aluno como "Escolha horario:". Corrigi no rascunho. **Sugestão:** aceitar `{horário}` no roteiro (id normalizado, rótulo com acento) ou um dicionário de acentos no importador.
6. **Título da pergunta é cortado na última frase.** "Seu transporte tem atrasado frequentemente. O que fazer?" vira pergunta "O que fazer?" e a primeira frase vai para o fim da situação ("Lucas percebeu… Seu transporte tem atrasado…": mistura 3ª e 2ª pessoa). O cartão gravado no V01 diz só "O que fazer?" (o mesmo com "Como conversa?" no V02). Não mexi para não desatualizar vídeo pago. **Sugestão:** o prompt pedir o título da pergunta como uma frase interrogativa completa e o importador avisar quando sobrar menos de 4 palavras.
7. **Orçamento/lote só pela sessão do navegador.** As rotas `media-jobs/quote|batch` exigem login; para script foi preciso entrar com o autor de teste (senha do seed) num cookie. **Sugestão:** um script `orcamento.ts <curso> [nós]` no servidor (sem custo) para as sessões.
8. **Simulador conta os 3 retornos como texto da tela.** "Texto demais" em Q01/Q02 (~112 palavras), mas o aluno lê a situação, as 3 opções e **um** retorno (~75). **Sugestão:** contar só um retorno.
9. **Publicar avisa `MEDIA_MISSING` nas perguntas com `Voz opcional: não`.** Pelas regras do lote elas ficam só em texto; o aviso vira ruído. **Sugestão:** não avisar quando a decisão foi marcada sem voz.
10. **Avaliação: "RESULTADO DA AVALIAÇÃO — Não foi dessa vez" ao errar UMA pergunta duas vezes.** Aparece no topo da pergunta seguinte e soa como reprovação no curso, que ainda está em andamento. **Sugestão:** "Resultado desta pergunta".
11. **Fim de quem reprova também diz "Curso concluído".** `fim_aula_02_revisar` tem `outcomeLabel: "Curso concluído"` com o texto "Você acertou menos de 2 de 3…". O roteiro pede para manter o comportamento atual, então só anoto. **Sugestão:** "Revisão pendente" nesse fim.
12. **Espera do rosto.** O rosto dependia do usuário rodar o comando (o modo automático bloqueia scripts pagos), então o curso ficou ~1 h parado; nada a corrigir no motor, mas vale saber no planejamento do lote.

## Mensagens à sessão principal

Nenhum bloqueio no código do motor; os achados acima ficam para a correção única da sessão principal (1, 2, 3, 5 e 6 são os que mais pesam para os próximos cursos).
