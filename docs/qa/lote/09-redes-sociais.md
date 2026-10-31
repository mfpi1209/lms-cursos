# Lote 09 · Redes sociais e bastidores do trabalho (Enzo)

Estado: **entregue.** O curso está publicado (versão 2, rascunho rev. 20), com 4 vídeos e os alunos de teste matriculados.

- Curso: `crs_gjn468p3y6hwua4f` (slug `redes-sociais-e-bastidores-do-trabalho`).
- Roteiro: `docs/roteiros/lote/09_redes_sociais.md` (cópia adaptada do `Downloads/09_redes_sociais.md`).
- Instrutor: **Enzo** (Seu orientador). Personagem fictício criado só por texto: homem branco, cerca de 24 anos, cabelo ondulado castanho, camiseta branca e jaqueta leve verde-oliva. Estúdio 8 (`cam_enzo8_34` principal, `cam_enzo8_esq`, `cam_enzo8_dir`).
- Voz: **Matheus (ElevenLabs)**, `NQmLEqxcRTkWYIYZSYod` ("Matheus - Energetic and Dynamic", biblioteca pública, jovem e animada).
- Biblioteca: voz `voz-matheus`, instrutor `instrutor-enzo` e kit `estudio8-enzo`.
- Paleta: invertida `{ base: "#FF7A08", accent: "#1D1E4C" }` (véu laranja, texto e destaque marinho), confirmada nos quadros.
- Alunos de teste: aluno@demo.local (`enr_tcdwfdtn9n8gs410`) e aluna@demo.local (`enr_jmjukvzb1bhhom1t`), ambos na versão 2.
- Scripts próprios em `packages/db/src/scripts/lote/`:
  - `09-biblioteca-enzo.ts` (`--voz` / `--kit`);
  - `09-ajustes.ts` (`--paleta` / `--kit` / `--rotulos` / `--elenco`);
  - `09-gerar-enzo.sh` (visual pago, rodado pelo usuário via `lote-rostos.sh`).

## Passo a passo

1. **Roteiro copiado e ajustado** (antes de gravar):
   - Enzo no lugar da Marina, na fala e na direção ("Eu sou o Enzo, seu orientador");
   - `Chamada:` nas três perguntas ("Agora é com você: o que a Malu confere antes de postar?" etc.);
   - V01 e V03 começam com uma frase que serve para qualquer escolha ("Seja qual for a sua escolha…", "Qualquer que tenha sido a sua escolha…");
   - erro no objetivo corrigido ("consegue verifica" virou "verificar").
2. **Voz** escolhida na busca grátis do ElevenLabs e registrada **na hora** na biblioteca, antes de qualquer outra sessão.
3. **Importação** com `--kit estudio7-rafael` mais o nome, a voz e o pronome do Enzo. Resultado: 0 erros, 2 aulas, 12 cenas, 3 decisões, cerca de 7,6 min.
4. **Paleta** aplicada por script, sem reimportar.
5. **Visual do Enzo** (pago, rodado pelo usuário): personagem base e 3 câmeras. A sessão principal registrou o instrutor e o kit (`09-biblioteca-enzo.ts --kit`) e aplicou o kit (rev. 14: 22 planos passaram para `cam_enzo8_*`).
6. **Vídeos V00 a V03**: orçamento oficial de US$ 3,23, aprovado pelo usuário ("Produção e entrega. APROVO") e disparado pela sessão principal às 12:29. Tudo pronto às 12:48.
7. **Ajustes sem reimportar** (os vídeos continuaram em dia):
   - rótulos das missões com acento;
   - o Enzo repetido saiu da lista de personagens.
8. **Publicado** (v1 e depois v2). As matrículas passaram para a v2.

## Conferência dos vídeos (quadro a quadro, 1 quadro a cada 3 s)

| Vídeo | Duração | Câmera | Letreiro | Pergunta a seguir | Marca d'água | Áudio |
|---|---|---|---|---|---|---|
| V00 | 36 s | 3/4, chamada na esquerda | "Enzo · Seu orientador · DNA Work" (laranja, texto marinho) | "O que você confere antes de publicar?" | sim | -25,6 dB, sem silêncio longo |
| V01 | 43 s | esquerda | — (correto) | "Isso basta?" (cortado, ver achado 5) | sim | -25,3 dB |
| V02 | 37 s | 3/4, chamada na esquerda | sim | "E agora?" (cortado) | sim | -25,6 dB |
| V03 | 42 s | esquerda | — | — (correto: depois vem a missão) | sim | -25,7 dB |

O mesmo rosto em todos os quadros, sem defeito de boca ou de mãos visível. Ritmo de cerca de 155 palavras por minuto. Não houve transcrição automática do áudio; o texto de origem é o do roteiro.

## Teste como aluno (prévia, todas as cenas)

- **Aula 1:**
  - V00 → Q01 (escolhi a fraca): o retorno "Sua escolha" aparece **antes** do V01;
  - V01 → Q02 (escolhi a ok) → M01: montei a frase com as 3 partes;
  - "Meu roteiro" e "O que você levou" aparecem, com a frase certa.
- **Aula 2:**
  - V02 → Q03 (escolhi a fraca) → V03 → M02 (pulei) → avaliação;
  - errei a pergunta 1 duas vezes, acertei a 2, errei a 3 duas vezes;
  - fim "revisar": "acertou menos de 2 de 3… refaça quando quiser".
- **Área do aluno** (aluno@demo.local): lista de cursos, página do curso ("2 aulas · cerca de 10 min") e as duas aulas respondem 200.
- **Texto:** nada de Marina, futsal, CIEE, IEL ou slogan; a marca é só DNA Work.
- **Alunos de teste** (simulação): Ana Clara, Beatriz, Diego e Jéssica deram 4, Kauã deu 5. Todos terminam em cerca de 7,5 min. A única queixa é texto demais em Q01 (124 palavras) e Q02 (115).

## Achados (onde o motor não deu conta sozinho)

1. **Ovo e galinha do instrutor novo.**
   - O que acontece: o kit só aceita instrutor com câmeras prontas, e o script das câmeras só roda num rascunho que já exista.
   - Contorno: importar com o kit do Rafael, gerar o Enzo nesse rascunho, registrar o instrutor e o kit, e reaplicar o kit.
   - Sugestão: um caminho "instrutor novo" que crie o rascunho, gere as câmeras (pago) e grave o instrutor e o kit no fim, sozinho.
2. **O kit desfaz os ajustes passados na importação.**
   - O que acontece: com `--kit … --voice … --avatar-name Enzo --presenter Enzo --presenter-pronoun he`, o rascunho saiu com voz Gabriel e nome Rafael, porque o `applyKitToDocument` roda depois das trocas.
   - Sugestão: aplicar as trocas depois do kit.
3. **Perguntas "só texto" tratadas como vídeo faltando.**
   - O que acontece: o orçamento sem `nodeIds` incluiu q01, q02 e q03 (US$ 0,74 a mais), e a publicação dá 3 avisos `MEDIA_MISSING` para elas, mesmo com "Voz opcional: não" no roteiro.
   - Sugestão: o importador marcar essas perguntas como "sem vídeo", e o orçamento e a publicação respeitarem isso.
4. **O script do visual parou em silêncio** e precisou ser rodado de novo pelo usuário.
   - O que acontece: a câmera esquerda foi concluída no HeyGen, mas o rascunho ficou com `generating` e as outras duas câmeras nem foram pedidas; não ficou registro.
   - Sugestão: gravar um registro e avisar ao parar.
5. **Título da pergunta cortado no ponto.**
   - O que acontece: "A colega autorizou a imagem. Isso basta?" virou o título "Isso basta?", e o resto foi para o enunciado; o mesmo com "… depois de postar. E agora?".
   - Efeito: o aviso "Pergunta que vem a seguir" do vídeo e o simulador mostram só "Isso basta?" e "E agora?", fora de contexto. Ficou gravado nos vídeos V01 e V02 (não regravei).
   - Sugestão: usar o título inteiro no aviso, ou não cortar títulos curtos.
6. **Rótulos das missões sem acento.**
   - O que acontece: o importador usa o id da parte como rótulo ("Escolha conteudo:", "autorizacao").
   - Contorno: `09-ajustes.ts --rotulos`.
   - Sugestão: um mapa de acentos no importador, ou `{conteúdo}` aceito no roteiro.
7. **Personagem repetido na lista.** "Enzo, orientador virtual" na linha de personagens do roteiro virou também "Personagem de exemplo". Contorno: `--elenco`. Sugestão: ignorar o próprio instrutor nessa linha.
8. **Sem pílulas.**
   - O que acontece: o roteiro do lote diz "texto na tela sem cartões conceituais" e não tem linha `Cartão:`. O motor só cria pílulas (`presenter_chips`) a partir de `Cartão:`, não do "Texto na tela", então os vídeos saíram sem pílulas.
   - Efeito: nas câmeras laterais (V01 e V03) sobra parede vazia à direita.
   - Sugestão: gerar pílulas a partir do "Texto na tela" quando não houver cartão, ou usar a câmera 3/4 quando não houver pílula.
9. **Avaliação com tentativas por pergunta.** O roteiro pede "2 tentativas" para a avaliação inteira, mas o motor dá 2 por pergunta. No caminho de reprovação, a tela mostra "Não foi dessa vez" e "Curso concluído" juntos. Mantive o comportamento do motor, como o roteiro pede.
10. **Teto diário compartilhado.** No primeiro orçamento restavam US$ 19,58 de US$ 50 para os 12 cursos; cerca de US$ 3,2 por curso não cabe para todos.

## Custo

- Visual do Enzo: cerca de 4 gerações HeyGen (personagem e 3 câmeras), aprovado pelo usuário ("aprovo a construção").
- Vídeos: US$ 3,23 estimados (V00 0,77 · V01 0,86 · V02 0,76 · V03 0,83), dentro do limite de US$ 4. O custo real ainda não foi registrado nos jobs.
- Ajustes, QA, simulação e publicação: grátis.
