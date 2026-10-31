# Decisões e premissas reversíveis

| # | Decisão | Motivo | Reversível? |
|---|---|---|---|
| 1 | Módulos e aulas vivem **dentro do JSONB** do rascunho (`course_drafts.document`), não em tabelas próprias | Uma única revisão/conflito para o documento inteiro; o autor edita briefing, árvore e grafos como uma unidade | Sim: extrair `modules`/`lessons` para tabelas quando houver edição concorrente por aula ou busca relacional |
| 2 | Worker usa **polling do outbox no Postgres**; Redis/BullMQ só quando entrarem jobs de ingestão/mídia | O fluxo vertical não precisa de fila; evita dependência obrigatória | Sim: o outbox já é o ponto de entrada para enfileirar em BullMQ |
| 3 | Um único workspace criado no seed; `workspaceId` em todas as consultas de autoria | Isolamento desde o início sem billing/multiempresa | — |
| 4 | Prévia executa o motor **sem persistência** com o estado indo e voltando pelo cliente (`/api/preview/step`) | Mesmo motor e mesmo player com zero tabelas extras | Sim: trocar por tentativas efêmeras persistidas se a prévia precisar de histórico |
| 5 | Progresso = concluídos obrigatórios / (concluídos + obrigatórios ainda alcançáveis) | Ramos exclusivos não inflam o denominador | — |
| 6 | Objetivo "demonstrado" só com avaliação determinística aprovada; escolhas/reflexões = "tentado" | Separar conclusão de domínio sem inventar precisão | Ajustável por rubrica quando houver avaliação assistida (fase D) |
| 7 | Ciclos irrestritos bloqueiam publicação; repetição de avaliação é controlada por `maxAttempts` no motor | Evita loops sem saída e mantém o grafo analisável | Sim: ciclos com limite declarado podem ser admitidos em versão futura do compilador |
| 8 | Seed de usuários usa `hashPassword` do Better Auth (`account.provider_id = 'credential'`) | Seed roda em `packages/db` sem instanciar a app | — |
| 9 | Sem `proxy.ts`/middleware: autorização nos layouts e Route Handlers | Regras ficam no backend e perto dos dados | — |
| 10 | Conteúdo de texto é Tiptap JSON restrito; sem HTML | Sanitização por construção | — |
| 11 | Direção por planos é **montada por nós** (ffmpeg) sobre clipes curtos do HeyGen, um por plano | A API não tem ângulo/zoom/transição/slide; montar localmente permite reaproveitar clipes e editar enquadramento sem pagar de novo | Sim: trocar o compositor por `type: "studio"`/Hyperframes do HeyGen se ganharem esses recursos |
| 12 | Narração sintetizada **uma vez** com timestamps e cortada por plano | Prosódia contínua e um único custo de voz | Sim: síntese por plano com `previous_request_ids` (eleven_v4) |
| 13 | Apresentador andando só como **cena em movimento** (`cinematic_avatar`) com narração por cima, sem fala | Vídeo com leitura labial não anda; o modo cinematográfico não aceita nosso áudio nem é estável em português | Sim: se o HeyGen liberar áudio próprio no modo cinematográfico ou lip-sync confiável sobre ele |
| 14 | **Posição por câmera**: cada câmera tem `placement` (`inherit` padrão, centro, direita, esquerda, `full_frame`); visuais sentados usam `full_frame` (MP4 com o fundo do próprio look, sem alfa nem fundo do curso) | O recorte transparente corta cadeira e mesa de um visual sentado; misturar a câmera em pé à direita com a sentada em tela cheia dá um corte natural. `inherit` mantém chaves e hash antigos (nada fica desatualizado) | Sim: remover o campo volta tudo ao comportamento do curso; clipes de cada modo têm chave própria |
