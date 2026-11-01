# Pacote de expansão (26 cursos) · análise técnica, custo e plano

_2026-11-01 · só leitura: nada foi executado, gerado ou publicado. Gêmeo: `analise.json` (por curso e por item). Pedagogia por curso: `pedagogia-C01-C09.md`, `pedagogia-C10-C18.md`, `pedagogia-C19-C26.md`. Cortes: `cortes.md`._

## 1 · Veredito

**Adotar parcialmente, reescrevendo.** O pacote está tecnicamente bem amarrado (IDs, versões e âncoras batem 26/26; sem CIEE/IEL, slogans, THEO ou "eu já passei por isso"), mas erra nas três coisas que o dono pediu:

- **Missão de verdade:** 23/26 práticas viram "escreva um texto curto sobre a Luana/Bia/Ana" na tela. Só muda a palavra "missão"; não muda a natureza. No C01 chega a **apagar** a missão real do piloto.
- **Vozes distintas e fim memorável:** 26 encerramentos com o mesmo esqueleto de 4 parágrafos (≈57 s cada), 15/16 instrutores com a mesma frase média (11,5–14,4 palavras), ~0 perguntas, nenhuma frase das fichas de voz usada. É a fórmula única em versão nova.
- **Caminho de inserção:** cena nova dentro de aula antiga → **nenhuma matrícula atual migra** (regra `onlyAppendedLessons`); em 13 cursos ainda cria duas decisões seguidas.

Custo: ≈ **US$ 55** de fala nova (3.012 s a 0,0183 US$/s); o saldo é ≈ US$ 33 e o piloto C01 (US$ 9,34) ainda espera aprovação. Aproveitar do pacote: decisões + feedbacks textuais, as demonstrações, as fichas como guia, as correções C24/C22/C14 e os **95 cortes grátis**. **C01: o piloto prevalece.**

## 2 · Validação técnica

**Âncoras e IDs.** 26/26 `course.id`, versão publicada, instrutor e nó-âncora conferem com o raio-X atual (rascunho e publicada). Único snapshot defasado: **C01** (pacote: rev 92; atual: rev 93 = piloto aplicado, 4 aulas, `despedida` em aula_04, planos "missão" regravados). Nos outros 25, rascunho = publicada.

**Posição da âncora.** Em 13 cursos (C06, C14–C20, C22–C26) a prática vem logo depois de uma decisão (q04/q05/q25): o fluxo do pacote ficaria decisão → reação → demo → nova decisão. Em 10 cursos (C01, C04, C05, C07–C12) o vídeo anterior termina com "Agora, monte a sua frase/mensagem" ou "Hora da missão" — inserir 1,5 min antes da prática quebra a promessa (o próprio pacote avisa).

**O que o motor já faz (grátis):** vídeo de demonstração e aprofundamento (`content`), decisão com feedback só texto (`choice` + `options[].feedback`, sem `reaction`), aprofundamento comum (arestas por `optionId` para o mesmo destino), vídeo antes do `end` (igual à `despedida` do piloto), "comparar outra escolha" (motor já permite voltar e responder de novo), histórico por versão (matrícula fixa `courseVersionId`; respostas vivem na tentativa daquela versão), "pelo menos 5 de 6" na checagem da trilha (`Math.ceil(6×0,8)=5`, já implementado).

**O que precisa de código:**

| Pedido | Hoje | Falta | Tamanho |
|---|---|---|---|
| Texto curto com critérios + exemplo | `reflection` sem molde = texto livre (800 ok) | campos `selfReview {criteria, example}` + botões nos 2 players + estúdio | P (1 dia) |
| Seleção múltipla (C20) | `assessment multiple` existe no schema/player, **0 cursos usam**; semântica de nota/tentativas | modo formativo, manter respostas, "Fazer depois" | M (1–2 dias) · alternativa: `choice` |
| Ordenação (C24) | não existe | tipo de nó novo (schema, motor, players, estúdio, recap) | G (3–5 dias) para 1 prática · alternativa: molde de etapas (C24 a02 já é assim) |
| Classificação (C25) | não existe | idem | G · alternativa: 3 decisões curtas |
| Pendência / "Retomar atividades" / textos "sem pendências" | "Fazer depois" envia resposta vazia; nada é salvo | estado de pendência + tela final condicional | M (2 dias) |
| Redirecionar entradas da âncora | editar `edges` (from/to/optionId) | script, mesmo padrão da `proposta.json` do piloto | P |

**Migração de matrículas (ponto crítico).** `matricula-migracao.ts` só migra se as aulas/cenas são iguais, só saíram cenas, ou **só entraram aulas no fim**. Cena nova em aula antiga em 26/26 cursos → "matrícula fica na versão antiga": quem já está matriculado nunca vê a expansão. **Caminho seguro:** o complemento vira uma **aula nova no fim** de cada curso (demo → decisão → aprofundamento → prática → despedida → fim). Resolve de uma vez a migração, as duas decisões seguidas e a promessa quebrada, e é o que o dono quer (cursos maiores). Alternativa: estender a regra para aceitar inserções quando o `currentNodeId` sobrevive (1–2 dias + testes; muda regra de produção). Atenção: aula nova obrigatória **reabre** matrículas concluídas (comportamento atual) — decidir se a aula extra é opcional.

**Cortes (resumo; detalhe em `cortes.md`).** Os 96 candidatos casam **96/96 com planos inteiros** que têm tempo do whisper (início/fim) no raio-X: não precisa de escuta nem de estimativa por palavras. Total ≈ 503 s. Dá para tirar por `media.adjust.drop` + recomposição, grátis. Exceções: os 4 do C01 já são regravados pelo piloto; C25·v01·s3 tem uma frase de ensino antes do anúncio (cortar só a última frase com `adjust.cut.last`).

**Defeito já existente que o pacote acerta em apontar:** 26 práticas de montar frase (C06·a03 e todas de C15–C26) dizem "Escreva uma resposta curta…" num componente de blocos. Correção de texto, grátis.

## 3 · Pedagogia

Ver `pedagogia-*.md`. Convergem com esta análise: C01 não adotar (conflita com o piloto); os outros 25 "adotar com correções". Transversais: prática continua exercício de tela (P0); a prática pede copiar a frase que acabou de aparecer (C01, C02, C04, C05, C08, C09, C19, C20, C24); demo/aprofundamento repetem vídeos existentes (C02, C03, C06, C07, C09, C21, C22, C26); encerramentos com esqueleto único e registro "ensaístico" (jargão como "sustentação", "procedimento aplicável", "referência" por gestor); feedbacks novos sem "faça assim". Limpo em termos proibidos, segurança e experiência pessoal do avatar.

## 4 · Custo e tempo

- **Ritmo real medido** (717 planos gravados, tempo whisper): **2,62 palavras/s** (0,38 s/palavra). Por instrutor: Patrícia 2,46 … Thiago 3,09.
- **Pacote:** 7.938 palavras → **≈ 3.012 s (50 min)** → **≈ US$ 55** (faixa 50–61) a 0,0183 US$/s (piloto: US$ 9,34 / 510 s). Encerramentos de 140–160 palavras = 53–61 s cada = US$ 27 só deles. Demo ≈ 34 s, aprofundamento ≈ 26 s por curso.
- **Com encerramento de ~75 palavras:** ≈ 2.281 s → **≈ US$ 42**.
- **Orçamento:** teto anterior US$ 100 (usado); sistema US$ 140 com US$ 107 gastos → **saldo ≈ US$ 33**; piloto C01 pendente US$ 9,34. Pacote inteiro não cabe: precisa de nova aprovação (~US$ 65–70) ou fases.
- **Grátis:** todos os textos, 95 cortes + recomposição, C24/C22 por blocos, tela final/roteiro. **Barato:** C14, 4 substituições de fala = 6 planos ≈ 55 s ≈ US$ 1.

## 5 · Conflitos

**Com o piloto C01 (rev 93, aguardando US$ 9,34):**

| Item | Pacote | Piloto | Resolução |
|---|---|---|---|
| Vídeo final | aula_02, antes de fim_aula_02 | curso tem 4 aulas; `despedida` em aula_04 (60 palavras, callback) | descartar o do pacote |
| Prática m02 | texto livre "Na situação de Luana…" | missão real GUARDAR (aviso nas notas + contato), com molde | manter piloto |
| Demo "nome não está na lista" | novo vídeo antes de m02 | já contado em v03·ex3 (Davi); chegada é a aula_03 | descartar ou virar decisão extra na aula_03 (~US$ 1,2) |
| Personagens | "Paula" | Renata (RH), Caio; Luana e Davi já existem | Renata |
| Promessa antes da prática | insere 1,5 min entre v03 e m02 | v03: "Agora, monte o seu aviso e salve nas notas" | não inserir |
| 4 cortes do C01 | cortar anúncios | planos já regravados | sem ação |
| "Não criar aulas novas" | proíbe | aulas novas no fim = único caminho migrável; dono quer cursos maiores | aulas novas com conteúdo |

**Com as decisões do dono:** ok em CIEE/IEL/agente (0), slogans (0 menções à marca nas falas), THEO, experiência pessoal (0), mídia paga só com aprovação, "Fazer depois" mantido, feedbacks novos sem bordão. **Viola no espírito** "missão de verdade" (23/26 texto na tela). **Risco alto** em "vozes distintas" e "fim memorável" (métricas acima).

**Fichas de voz (16/16 batem com o cadastro).** Pontos fortes: intenção + "evitar" funcionam como guarda-corpo (Patrícia: não responsabilizar o alvo; Júlia: não culpar transporte; Renato: nada de "é simples"); sem estereótipo de raça/gênero/aparência. Limites: são notas de direção, não voz — nada que HeyGen/ElevenLabs apliquem além de pontuação e quebra de plano; os roteiros não as realizam; falta o que diferencia de verdade (abertura, fecho, tamanho de frase por pessoa). Proposta: 3 regras operacionais por instrutor (frase alvo; 1 gesto-assinatura: Laís mostra a evidência, Flávia pergunta "de que depende?", Thiago lê a mensagem; 1 jeito de fechar), aplicadas primeiro nos 26 encerramentos.

**CORRECOES_ADICIONAIS.** C24 a01: claim verificado (blocos misturam reunião/kits/relatório) — corrigir **mantendo o molde** com os 4 grupos no caso da reunião; não precisa de componente de 4 campos. C22 a01: coerente, grátis; só 2×2 combinações → manter "Outra resposta". C14: A2·v03·s3 e A4·v08·s4 são planos inteiros (regravar 5 s cada: aplicar); A8·v14 e A9·v17 são parciais (regravar 2 planos cada, ~35 s) e são preferência de estilo — para A8 proponho o meio-termo: "Dois extremos atrapalham: ficar em silêncio o tempo todo ou falar por cima dos outros. Entre eles há várias formas de ajudar: fazer uma pergunta, organizar uma ideia, acompanhar o tempo." Textos de interface: adotar; 3 deles dependem da pendência. As 4 decisões "duas opções fortes" (C03 q01, C06 q01, C14 q25, C15 q03) já estão forte/forte/fraca no banco — nada a fazer.

## 6 · Correções propostas

**P0 (antes de adotar qualquer coisa)**
1. **C01:** não aplicar o pacote por cima do piloto. Grátis.
2. **Inserção:** aula nova no fim de cada curso em vez de "antes da prática". Grátis; script de 1 dia.
3. **Práticas:** reescrever as 26 como missões reais (molde + ação fora da tela + caminho "ainda sem vaga", padrão do piloto). C24 ordenação → molde de etapas; C25 classificação → 3 decisões; C20 seleção múltipla → `choice`. Grátis; 2–3 dias editoriais. Evita 1–2 semanas de motor.
4. **Orçamento:** aprovar em fases (pilotos ≈ US$ 12 → lotes por trilha). Decisão do dono.
5. **Pendência:** decidir construir (M) ou tirar os textos de tela que a pressupõem.

**P1**
6. Instrução "Escreva…" nas 26 práticas de molde → "Escolha uma opção em cada grupo. Se precisar, use Outra resposta para escrever do seu jeito." Grátis, 1 h.
7. 95 cortes por `adjust.drop` + recomposição (sem C01; C25·v01·s3 só a última frase). Grátis, meio dia.
8. Encerramentos: 60–90 palavras, 1 callback à história do curso, 1 ação real, despedida da pessoa; "Meu roteiro" e outro curso só na tela. Economiza ≈ US$ 13.
9. C24 a01 (blocos: a = organizar uma reunião viável para seis pessoas / garantir a reunião na próxima semana; b = que serão seis pessoas / que é na próxima semana; c = a duração / a disponibilidade das pessoas / duração e disponibilidade; d = confirmar duração e disponibilidade antes de reservar / perguntar a quem pediu quanto tempo precisa) e C22 a01 (molde do pacote + Outra resposta). Grátis.
10. C14 falas: A2 + A4 (≈ US$ 0,2); A8/A9 só se o dono quiser (≈ US$ 0,8).
11. `selfReview` (critérios + exemplo sob demanda) na reflexão: a única parte das práticas do pacote que acrescenta valor e serve também às missões do piloto. P, 1 dia.

**P2**
12. Operacionalizar as fichas de voz (3 regras por instrutor). 13. Adotar os textos de interface que não dependem de pendência. 14. Manter as 4 decisões com duas opções fortes.

## 7 · Plano recomendado

- **Fase 0 (grátis, 1–2 dias):** instruções das 26 práticas; C24 a01 e C22 a01 por blocos; 95 cortes + recomposição; montar em rascunho as decisões e feedbacks do pacote como nós da futura aula extra (sem mídia).
- **Fase 1 (pilotos, ≈ US$ 12):** aprovar o piloto C01 (US$ 9,34) — vira o padrão; piloto técnico **C24** com aula_03 extra (demo + decisão texto + aprofundamento + prática real por molde de etapas + despedida de ~70 palavras) ≈ 150 s ≈ US$ 2,8; motor: `selfReview`. Pendência fica para depois.
- **Fase 2 (escala, por trilha):** 24 cursos × ≈ 90 s ≈ 2.160 s ≈ **US$ 40**; C14 ganha aula_13 com a prática que falta; medir o vídeo real depois da montagem.

**Decisões do dono (fechadas):**

| | Pergunta | Opções | Recomendo |
|---|---|---|---|
| D1 | C01 | (a) manter piloto, descartar C01 do pacote · (b) + decisão extra "nome não está na lista" na aula_03 (~US$ 1,2) | a |
| D2 | Onde entra o complemento | (a) aula nova no fim · (b) dentro da aula + estender migração (dev 1–2 dias) · (c) dentro da aula; matrículas atuais ficam na versão antiga | a |
| D3 | Práticas | (a) reescrever como missões reais · (b) texto curto do pacote + selfReview · (c) b + construir ordenação/classificação (1–2 semanas) | a |
| D4 | Encerramentos | (a) 60–90 palavras com callback (−US$ 13) · (b) 140–160 como estão | a |
| D5 | Orçamento | (a) só pilotos agora (US$ 12,2) · (b) programa inteiro (~US$ 55) e limite para ~US$ 175 · (c) só o grátis | a |
| D6 | Cortes | (a) aplicar os 95 agora · (b) esperar escuta humana | a |
| D7 | C14 falas | (a) A2 + A4 · (b) as quatro · (c) nenhuma | a |
| D8 | Pendência de atividade | (a) construir agora (M) · (b) depois; só a fala condicional | b |
