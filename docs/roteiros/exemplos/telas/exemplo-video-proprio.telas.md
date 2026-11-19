# Telas simuladas: exemplo de vídeo próprio

Este arquivo fica na pasta `telas/` ao lado do roteiro `exemplo-video-proprio.md`; o importador o acha sozinho.
Cada seção `## nome` é uma gravação (o nome é o do `Vídeo próprio:`, sem `.mp4`). Sintaxe em
`packages/course-schema/src/screen-mock.ts`. Telas genéricas, sem marca real e sem dado pessoal.

## gravacao_livros_pedido
Modelo: form
Aparelho: computador
App: Pedido para a IA
- digita: Tema: marketing para iniciantes
- digita: Tipo: livros de introdução
- digita: Quantidade: 5 títulos (peso 2)
- toca: Enviar pedido
- destaca: o pedido diz tema, tipo e quantidade

## gravacao_livros_resposta
Modelo: chat
Aparelho: celular
App: Assistente de IA
- usuário: Quero 5 livros de introdução a marketing, para quem está no primeiro semestre.
- ia: Aqui vai uma lista: 1. Marketing na Prática. 2. Primeiros Passos em Vendas. 3. O Cliente em Primeiro Lugar. 4. Marca e Mensagem. 5. Marketing Digital sem Mistério. (peso 3)
- destaca: um desses títulos pode não existir

## gravacao_busca_confere
Modelo: browser
Aparelho: computador
App: Buscador
- digita: "Marketing Digital sem Mistério" livro autor
- mostra: Resultados da busca | Nenhum livro com esse título | Resultados parecidos, de outros assuntos
- destaca: conferir por fora mostra que o livro foi inventado
