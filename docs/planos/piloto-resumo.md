# Piloto Cruzeiro EaD: resumo da implementação

Branch `feat/cruzeiro-piloto`, a partir de `feat/cruzeiro-f1-lancamento`. Sem push, deploy, publicação ou migração. Nenhum provedor pago foi chamado.

O certificado (b) ficou para depois, por decisão do dono.

## O que entrou

| Item | O que faz | Onde |
|---|---|---|
| 0. Compatibilidade | O snapshot vale só para os roteiros de referência (`curso-comece-bem`, `curso-primeira-vaga`). Os roteiros de cliente em `docs/roteiros/` passam pelo teste "importa com 0 erros". | `packages/course-schema/test/roteiros-compat.test.ts` |
| a1. Sintaxe do vídeo próprio | Uma ou mais linhas `Vídeo próprio: <arquivo>.mp4` na cena `V..`, na ordem de exibição. Gera três avisos (ver abaixo). Cena com gravação não recebe direção de avatar. | `nodes.ts` (`screenRecordings`, `ScreenRecording`, `sceneUsesScreenRecording`), `markdown-course.ts`, `docs/roteiros/exemplos/exemplo-video-proprio.md` |
| a2. Montagem | A cena com gravação pede **só a voz** (nunca avatar, custo HeyGen 0), pela mesma cotação e aprovação de hoje. Monta as gravações em sequência, em 1920x1080 e 30 fps, com borda preta e sem o áudio original. A narração e a legenda vêm do alinhamento. A marca d'água continua. | `packages/media/src/compose/screen.ts`, `apps/worker/src/screen-scene.ts`, `apps/web/src/server/media-screen.ts` |
| a3. Estúdio "Gravações de tela" | Lista as gravações com os estados "Falta mídia", "Enviado", "Mídia curta — regravar" e "Mídia cortada — conferir". Envio em lote, ligado pelo nome do arquivo. Limite em `SCREEN_RECORDING_MAX_MB` (padrão 1024). O arquivo é gravado no rascunho; nada é gerado. | `/estudio/cursos/[id]/gravacoes`, `POST /api/courses/[id]/screen-recordings` |
| c. API pelo RGM | A API identifica o aluno pelo RGM, obrigatório (`RGM_EM_BRANCO`). Repetir a chamada devolve `sem_mudanca`. A troca de e-mail só acontece por RGM conhecido, com auditoria `student.email_changed` e encerramento das sessões. Conflitos têm códigos próprios. O CSV do estúdio segue a mesma regra. | `packages/db/src/repositories/students.ts`, `docs/integracao/api-v1.md` |
| d. Reflexões na exportação | `reflexoes[]` na API (`aula_id`, `aula`, `cena`, `titulo`, `obrigatoria`, `resposta`, `respondida_em`) e uma coluna `Resposta: <aula> · <título>` por reflexão no CSV. A missão do piloto (`A01 — Entregue a sua missão`) é uma reflexão obrigatória e entra junto. | `packages/db/src/repositories/reports.ts`, `apps/web/src/lib/progresso-csv.ts` |
| e. Política e DPA | Modelo "o cliente é o controlador, a DNA é a operadora". Os campos do controlador vêm de `LEGAL_CONTROLLER_*` e `LEGAL_DPO_*`. O aviso de rascunho fica ligado por padrão e só sai com `LEGAL_PUBLISHED=1`. Inclui a minuta do contrato de operação. **Não publicar até confirmar o controlador.** | `apps/web/src/content/legal/`, `apps/web/src/lib/legal/controller.ts`, `docs/legal/dpa-contrato-operacao.md`, `docs/legal/pendencias.md` |

## Regra de duração da gravação de tela

A narração sempre manda no tempo da cena. N é a duração da narração e R a soma das gravações.

- **R menor que N, até 3 s de diferença:** congela o último quadro. `fit = ok`.
- **R menor que N, mais de 3 s de diferença:** monta congelando, para prévia, e marca `fit = short` ("mídia curta").
- **R maior que N:** acelera só os trechos parados, até 1,5x. Os trechos são detectados com `freezedetect=n=-60dB:d=0.5`. Se ainda não couber, corta o fim e marca `fit = trimmed` ("mídia cortada"). Um corte de até 0,1 s não marca.
- **Onde fica gravado:** o `fit` e a duração medida vão para o rascunho (`screenRecordings[i]`) e para o resultado do job.

## Avisos novos do importador

- `SCREEN_MEDIA_MISSING`: a cena tem gravação sem arquivo enviado ("falta mídia").
- `SCREEN_LIST_MISMATCH`: a cena difere da linha "Cenas com gravação de tela" das notas de montagem.
- `SCREEN_RECORDING_WRONG_SCENE`: a linha `Vídeo próprio:` está numa cena que não é `V..`. A linha é ignorada.
- Nome de arquivo inválido (sem `.mp4` ou com pasta) é erro de formato.

## Testes

- course-schema 340, course-engine 81, email 13, media 235, db 361, worker 80, web 353, ai 183. Todos passam.
- Typecheck limpo, exceto os erros que já existiam em `packages/db/src/scripts/oneoff/*`.
- **Teste intermitente:** `reports.test.ts` › "paginação e filtro desde" falhou uma vez e passou nas duas rodadas completas seguintes.
- **Banco de teste:** as suítes precisam rodar uma de cada vez, porque a do `db` apaga e recria o `lms_cursos_test`.
- **Robô nos 26 cursos** (rodada `piloto-regressao`, caminhos 1 e 4): 190 de 190 execuções chegaram ao fim, com 0 bloqueantes, 0 importantes e 5 menores (travamentos de 120 a 160 ms). É idêntico à `f1-regressao`: nenhum achado novo.
- **Curso de ensaio:** "ENSAIO piloto - vídeo próprio" (`crs_knhwo4792j42nza7`), importado só como rascunho no banco local.

## Limitações conhecidas (para depois)

- **Rota `media-jobs`:** o job de tela é gravado com o rótulo `provider: heygen`, e o processamento ignora esse rótulo. A rota também ainda exige um `avatarId`, que é ignorado. Num curso sem apresentador escolhido, o estúdio não consegue pedir a cena de tela.
- **Vinheta final:** não está ligada à cena de tela.
- **Montagem completa:** o caminho inteiro contra o banco (narração, anexo, escrita no rascunho) não tem teste ponta a ponta. As peças e uma montagem real com vídeo sintético têm.
- **`freezedetect`:** calibrado só com vídeo sintético. Ajustar com as primeiras gravações reais.
- **Tela "Gravações de tela":** não foi aberta no navegador nesta rodada. Um envio real de 1 GB não foi testado.
- **Proxy:** precisa aceitar 1 GB. Se houver Cloudflare no plano gratuito, ele corta em 100 MB.
- **Upload interrompido:** se uma gravação sumir do curso durante o envio, fica um arquivo órfão no armazenamento.
- **Controlador por variável de ambiente:** vale para o servidor inteiro. Com mais de um cliente no mesmo servidor, o controlador precisa ir para as configurações do workspace.
- **Documentos legais internos:** a avaliação de impacto, o plano de incidentes e o procedimento de direitos ainda dizem "Controladora: DNA Work".

## Pendências do dono

1. Confirmar o controlador e quem assina, e fazer a revisão jurídica da política e do DPA.
2. Definir o certificado: modelo, emissor, CNPJ e assinatura.
3. O conversor da outra sessão precisa:
   - gerar uma linha `Vídeo próprio:` por arquivo (62 cenas, 73 MP4 na leva 1);
   - corrigir `REACTION_LENGTH` (23 reações com menos de 8 palavras);
   - ligar a cena `A01` a um objetivo (`NO_OBJECTIVE`).
4. Guardar na plataforma as 11 imagens da apresentadora do curso de origem, que ainda apontam para o HeyGen.
5. Carga horária: os cursos somam cerca de 5 h de vídeo para 30 h de carga.
