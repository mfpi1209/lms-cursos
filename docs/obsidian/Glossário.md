---
tags: [glossário]
atualizado: 2026-11-13
fonte:
  - docs/direcao-cinematografica.md
  - docs/biblioteca-de-modelos.md
  - docs/gasto-seguro-e-orcamento.md
  - packages/course-schema/src/screen-mock.ts
  - apps/web/src/scripts/refazer-tomadas.ts
---

# Glossário

| Termo | O que é |
|---|---|
| **Cena** | Uma unidade do roteiro: vídeo (`V..`), decisão (`Q..`), avaliação (`AV..`) etc. Ver [[Sintaxe do roteiro Markdown]]. |
| **Tomada** | Grupo de planos seguidos na mesma câmera. Vira um pedido ao HeyGen. Ver [[Direção e câmeras]]. |
| **Plano** | Um trecho da cena com um enquadramento (apresentador, cartão, painel). A cena dirigida é uma lista de planos. |
| **Kit** | Pacote pronto: estúdio, instrutor, câmeras, voz, marca e direção. Ver [[Kits, estúdios e instrutores]]. |
| **Look** | Imagem-base do apresentador no HeyGen, de onde saem as câmeras. |
| **Câmera** | Um enquadramento do instrutor no estúdio (ex.: frontal à esquerda). Cada câmera tem um look e uma zona. |
| **Zona** | Onde o apresentador fica no quadro: esquerda, direita ou centro. O lado vazio recebe o painel. |
| **Estúdio com zonas** | Cenário com câmeras de zona. O lado livre mostra o painel. |
| **Painel** | Quadro no lado vazio com o "Texto na tela" como título e os tópicos. Ver [[Tópicos do painel]]. |
| **Tela simulada** | Demonstração de tela desenhada pela plataforma, sem gravação humana. Ver [[Telas simuladas]]. |
| **Tópico** | Linha curta do painel que entra no ritmo da fala. Fica no arquivo `.topicos.md`. |
| **Na fala** | Sufixo `(na fala: "trecho")` que prende um passo ou tópico a um trecho da narração. |
| **Fit** | Resultado do ajuste de uma gravação de tela à narração: `ok`, `short` ou `trimmed`. |
| **Mãos paradas** | Opção do curso (`handsStill`): gestos só de rosto e tronco. |
| **Orçamento (quote)** | Cálculo do custo de geração antes de pagar. Nada é cobrado. Ver [[Geração de mídia, orçamento e teto diário]]. |
| **Teto** | Limite de gasto em 24 h por workspace (janela deslizante). Passou, a rota devolve 402. |
| **Lote** | Conjunto de jobs criado a partir de um orçamento aprovado. |
| **Job de mídia** | Pedido de voz, avatar ou tela na fila do worker. Ver [[Worker e fila]]. |
| **Outbox** | Tabela de eventos gravados na mesma transação e consumidos pelo worker. |
| **Rascunho** | Documento editável do curso (`course_drafts`). |
| **Versão publicada** | Snapshot imutável do curso, fixado na matrícula. |
| **Workspace** | Espaço de uma organização. Tudo é filtrado por ele. |
| **RGM** | Registro do aluno na instituição. É a chave do cadastro pela API. Ver [[API de integração v1 e webhooks]]. |
| **Link de acesso** | Link de uso único que faz o aluno entrar sem senha. Ver [[Segurança, acesso e login]]. |
| **Robô aluno** | Script que faz as aulas como um aluno. Ver [[Testes e robô aluno]]. |
| **Pulsos** | Região das mãos e punhos, conferida por tomada em [[Conferência de qualidade]]. |
