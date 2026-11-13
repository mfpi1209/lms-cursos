# Plano: piloto da Cruzeiro EaD (primeira leva)

> **Versão 2 (decisões de 13/11/2026).**
> - **Certificado (b):** fica para depois. Não entra nesta onda.
> - **Vídeo próprio (a):** MP4 em tela cheia + narração com a voz da instrutora + legenda da narração, **sem avatar no canto**. O picture-in-picture fica para depois do piloto.
> - **Duração:** a narração manda no tempo da cena.
>   - Gravação mais curta: congela o último quadro até 3 s. Acima disso, marca **"mídia curta"** (regravar).
>   - Gravação mais longa: primeiro acelera os trechos parados (até 1,5x); só depois corta o fim e marca **"mídia cortada"** (conferir).
>   - Cena com várias gravações (ex.: C1 V07 tem 3): toca em sequência, na ordem do roteiro; a regra vale para a soma.
> - **Dados (e):** modelo "workspace de cliente": o cliente é o **controlador**, a DNA é a **operadora**. Campos para nome e CNPJ do controlador. Contrato de operação (DPA) preparado para assinatura. **Não publicar** até confirmar o controlador.
> - **Ensaio da Tarefa 1:** rodado contra o banco local (`localhost`). 5 cursos, 0 erros.
> - **Leva 1:** 62 cenas com gravação e 73 arquivos MP4 listados nas notas de montagem. Os roteiros ainda não têm a linha `Vídeo próprio:` (vem do conversor).
>
> O texto abaixo é a versão 1; onde houver conflito, valem as decisões acima.


Base: branch `feat/cruzeiro-f1-lancamento` (tip `57054b4`), que já tem formato EaD, link mágico, API de alunos, exportação de progresso, webhooks e tarefa com entrega. Branch nova: `feat/cruzeiro-piloto`. Nada é implementado antes do seu OK.

Restrições do pedido: não publicar, não criar conta, não gerar vídeo nem gastar crédito, não fazer deploy nem migração em produção.

## Antes de tudo: compatibilidade

- A rede `roteiros-compat.test.ts` compara **todos** os `docs/roteiros/*.md` do primeiro nível com uma foto (snapshot) guardada. Colocar os 5 roteiros novos ali faria o teste falhar, porque eles não têm foto.
- **Proposta:** fixar no teste a lista dos roteiros de referência (`curso-comece-bem` e `curso-primeira-vaga`). Os roteiros da Cruzeiro mudam a cada versão do conversor e não devem virar foto. Em vez disso, ganham um teste próprio: importar com **0 erros**.
- **Esforço:** 0,5 h.

## a) Vídeo próprio na cena (gravação de tela + instrutora no canto)

O que já existe: a montagem (`packages/media/src/compose/compose.ts`) já sobrepõe a instrutora num canto (`overlay` em `:444`, layouts `card` e `presenter_chips`) e já gera legenda pelo alinhamento da narração.

- **Documento** (`nodes.ts`): campo opcional `screenRecording: { fileName, assetId? }` nas cenas `scenario` e `content`. Sem esse campo, a cena funciona como hoje.
- **Plano de câmera** (`direction.ts`): layout novo `screen_pip`, em que o fundo é o MP4 e a instrutora fica num canto, num quadro menor.
  - Canto e tamanho seguem os campos que a câmera já tem (`placement`, `scale`).
  - Na cena com vídeo próprio, todos os planos usam esse layout.
- **Importador:**
  - Linha `Vídeo próprio: tela-c1-a3.mp4` na cena `V..`. O arquivo pode não existir ainda.
  - Aviso `SCREEN_MEDIA_MISSING`, que vira "falta mídia" no estúdio.
  - **Conferência cruzada:** o importador compara a linha `Cenas com gravação de tela` das notas de montagem com as cenas que têm `Vídeo próprio`. Se houver diferença, gera o aviso `SCREEN_LIST_MISMATCH`, com o código da cena.
  - Documentado no cabeçalho do importador e em `docs/roteiros/exemplos/`.
- **Duração:** quem manda é a narração.
  - Se a gravação for mais curta que a fala, o último quadro fica congelado até a fala acabar.
  - Se for mais longa, é cortada no fim da fala, com um aviso no estúdio.
  - Opção por cena para acelerar até 1,25 vez, se a diferença for pequena.
- **Montagem** (`compose.ts`, `apps/worker/src/compose-plan.ts`, `compose-scene.ts`):
  - O fundo vira um vídeo, não uma imagem.
  - O áudio é só a narração; o som da gravação é descartado.
  - A gravação é normalizada para 1080p e 30 fps.
  - A vinheta da marca e o ajuste fino por plano continuam funcionando.
- **Player:** não muda. Ele toca o MP4 já montado, que funciona no celular, em tela cheia e com legenda.
- **Estúdio:**
  - tela "Gravações de tela" do curso, com a lista das cenas que esperam MP4 e o envio de **vários arquivos de uma vez, ligados pelo nome** (os 70 da leva);
  - limite de upload configurável para vídeo próprio, padrão 1 GB;
  - depois de ligar o arquivo, a cena fica "pronta para montar", sem gerar vídeo.
- **Sem gasto agora:** a instrutora do canto vem do vídeo de avatar da cena. Sem avatar gerado, a cena pode ser montada só com a gravação e a narração em voz, ou ficar esperando o avatar. A geração paga só acontece depois do seu OK.
- **Testes:**
  - importador: linha presente ou ausente, aviso de falta, conferência com as notas;
  - montagem: o plano gerado e uma montagem real curta com vídeos de teste gerados pelo ffmpeg (sem HeyGen), para os casos gravação curta, longa e igual;
  - envio em lote ligado por nome;
  - robô: abrir uma cena com vídeo próprio.
- **Riscos:**
  - Arquivos grandes ocupam disco no servidor e o tempo de upload.
  - A montagem com ffmpeg pesa no servidor, porque é mais pesada que a de imagem.
  - Uma gravação com resolução ou proporção estranha precisa de enquadramento: borda preta, sem cortar.
- **Esforço:** 4 a 5 dias.

## b) Certificado por curso

O que já existe: `Certificado:` e `Carga horária:` são lidos e guardados (`course.certificate`, `courseWorkloadMinutes`). `taskRequirementsMet` está pronto. Há a página pública `/selo/[code]`, com QR.

- **Migrações:**
  - `0023_emissor_certificado`: coluna `workspaces.certificate_issuer` (jsonb) com instituição, CNPJ, `logoAssetId`, `signatureAssetId`, nome e cargo de quem assina, e `showPlatformBrand`.
  - `0024_certificado_curso`: tabela `course_certificates`, com o código no mesmo formato `DNA-XXXX-XXXX`, o nome e o RGM gravados no momento da emissão, a carga horária, o conteúdo programático (módulos e minutos) e a revogação.
- **Regra de emissão:**
  1. curso concluído (aulas obrigatórias);
  2. todas as avaliações aprovadas, pelo "X de Y" do último resultado;
  3. missão respondida: as cenas de reflexão obrigatórias têm texto, como o link colado no piloto, e as tarefas obrigatórias estão aprovadas, se houver.

  Emite na conclusão e, se faltar algo, na primeira vez em que a regra fecha. Gera o evento `certificate.issued` (o webhook já tem esse tipo) e preenche `certificado_codigo` no relatório e na API.
- **Telas:**
  - **fim do curso:** botão "Ver meu certificado";
  - **página pública:** passa a reconhecer certificados de curso, mostrando nome, curso, carga horária, data e validade, **sem o RGM**;
  - **folha de impressão:** mostra o RGM para o próprio aluno e para a equipe, o emissor do workspace e, sem a marca DNA, se o emissor for outro;
  - **estúdio:** "Configurações › Certificado", com upload de logo e assinatura.
- **CPF:** fica fora, porque o pedido usa só o RGM.
- **Testes:**
  - regra de emissão, com cada pendência isolada;
  - emissão única;
  - código único;
  - página pública sem RGM;
  - modelo com e sem marca DNA;
  - robô até o certificado.
- **Riscos:**
  - A Cruzeiro precisa validar o modelo para aceitar como hora complementar.
  - Avaliações reprovadas: hoje o aluno que reprova segue em frente (`Destino`). Com esta regra, ele conclui o curso **sem certificado** até refazer a avaliação. É preciso mostrar isso claramente, com um botão "Refazer avaliação".
- **Esforço:** 3 a 4 dias.

## c) API de cadastro idempotente pelo RGM

O que já existe: `POST /api/integracao/v1/alunos`, com token, matrícula numa lista de cursos e `gerarLink`. Hoje a chave do aluno é o **e-mail**.

- **Mudança:** a chave passa a ser o **RGM** dentro do workspace.
  - Um RGM conhecido atualiza nome, e-mail e telefone daquele aluno.
  - Um RGM novo com um e-mail que já pertence a outro RGM dá erro naquela linha, sem trocar dono de conta.
  - O CSV do estúdio segue a mesma regra.
- **Arquivos:** `packages/db/src/repositories/students.ts`, `apps/web/src/server/integration-students.ts`, os testes e `docs/integracao/api-v1.md`.
- **Riscos:**
  - **Troca de e-mail de quem já tem conta:** a troca precisa ser deliberada. Fica registrada em auditoria, e as sessões abertas dessa pessoa são encerradas.
  - **Conta antiga sem RGM:** quem foi cadastrado antes sem RGM recebe o RGM quando o e-mail bater.
- **Esforço:** 0,5 a 1 dia.

## d) Exportação de progresso com o texto das reflexões

O que já existe: o CSV e `GET /api/integracao/v1/progresso`, com RGM, matrícula, primeiro e último acesso, aulas, notas por avaliação, tarefa, conclusão e `certificado_codigo` (ainda vazio).

- **Mudança:** campo `reflexoes[]` com aula, cena, título e texto da resposta mais recente.
  - No CSV, uma coluna por cena de reflexão (`Resposta: <aula> · <cena>`).
  - O certificado passa a vir preenchido com o item (b).
- **Arquivos:** `packages/db/src/repositories/reports.ts`, `apps/web/src/lib/progresso-csv.ts`, a documentação e o registro de operações, porque o texto livre do aluno passa a sair da plataforma.
- **Riscos:** o texto livre pode conter dado pessoal. O acesso fica só para admin e tokens com escopo, e cada exportação gera auditoria.
- **Esforço:** 0,5 a 1 dia.

## e) Termos e política publicados

O que já existe: as páginas `/privacidade`, `/cookies`, `/termos` e `/seguranca`, com o aviso "Rascunho em revisão jurídica" (`LEGAL_DRAFT = true`).

- **Mudança:**
  - preencher o que já se sabe: hospedagem e país, data de vigência, endereço do portal;
  - incluir os dados novos: RGM, telefone, link de acesso, texto das reflexões, certificado, envio para a Cruzeiro pela API e pelo CSV;
  - tirar o `[PENDENTE ATÉ ESTAR NO AR]` só onde já for verdade (HTTPS e backup dependem do servidor);
  - trocar o aviso de rascunho por uma variável de ambiente, para desligar na produção.
- **Bloqueio:** preciso da revisão do advogado, ou do seu OK para publicar sem ela, e da decisão sobre **quem é o controlador** dos dados do piloto, a DNA ou a Cruzeiro. Isso muda o texto.
- **Esforço:** 1 dia de texto e código, mais o tempo da revisão jurídica.

## Ordem e esforço

| Item | Esforço | Depende de |
|---|---|---|
| 0. Compatibilidade dos roteiros | 0,5 h | — |
| a. Vídeo próprio com a instrutora no canto | 4 a 5 dias | — |
| b. Certificado por curso | 3 a 4 dias | modelo aceito pela Cruzeiro |
| c. API idempotente pelo RGM | 0,5 a 1 dia | — |
| d. Reflexões na exportação | 0,5 a 1 dia | b, para o código do certificado |
| e. Termos e política publicados | 1 dia | advogado e controlador |
| **Total** | **9 a 12 dias** de trabalho | |

**Execução:** em paralelo, com agentes.
- **Onda 1:** item 0, mais (a) com o Fable, mais (c) e (d) com o Sonnet.
- **Onda 2:** (b) com o Sonnet e (e) com o Fable.
- **Final:** robô nos 26 cursos atuais, mais um curso de ensaio importado como **rascunho**, sem publicar.

## Decisões que preciso de você

1. Modelo do certificado aceito pela Cruzeiro: quem assina e com que CNPJ.
2. Quem é o controlador dos dados do piloto (DNA ou Cruzeiro), e se os termos vão ao ar com ou sem revisão do advogado.
3. Duração da gravação diferente da fala: congelar o último quadro e cortar (minha proposta) ou outra regra.
4. Gravação de tela sem avatar gerado: montar só com a narração em voz (a voz também é gerada e paga, só que mais barata que o avatar) ou esperar o avatar.
