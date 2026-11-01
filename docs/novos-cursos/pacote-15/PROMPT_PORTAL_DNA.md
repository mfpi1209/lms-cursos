# Prompt para criar os cursos no portal DNA Work

Você trabalhará no projeto existente do portal DNA Work. Implemente os 15 cursos do pacote anexado como rascunhos no estúdio, usando os roteiros e o catálogo fornecidos. Execute o trabalho; não entregue somente um plano.

## Fonte de conteúdo e escopo
Leia catalogo.json e, para cada curso, curso.json e roteiro.md. O JSON usa um contrato editorial intermediário, não um schema nativo confirmado do portal. Inspecione o código antes de adaptar.
São 15 cursos, 30 aulas, 60 roteiros de vídeo, 30 decisões, 90 feedbacks exclusivos e 30 atividades. Não existe vídeo produzido neste pacote.
Não invente aulas faltantes, IDs existentes, URLs de mídia, duração real, depoimentos, aprovação pedagógica ou certificados. Instrutores são sugestões: mapear aos agentes realmente cadastrados.
Preserve a redação dos roteiros. Ajustes indispensáveis devem ser relatados. Não transformar todas as decisões em perguntas decorativas.

## 1. Inspecionar o projeto
Leia as instruções locais e identifique modelos de curso, aula, cena, escolha, feedback, atividade, roteiro pessoal, mídia, progresso, catálogo e publicação.
Localize APIs, serviços e importadores existentes. Reutilize validações e componentes do projeto.
Identifique o ambiente ativo e trabalhe em desenvolvimento ou no ambiente autorizado. Não publique cursos nem execute alterações em produção.
Crie um mapeamento do contrato editorial para o schema real. Se um recurso não for suportado, implemente uma adaptação compatível ou registre o bloqueio específico; nunca descarte conteúdo silenciosamente.

## 2. Evitar duplicações
Compare título, slug e objetivo com cursos existentes. Não sobrescreva os cursos publicados.
Os IDs dna-proposta-* são chaves externas editoriais, não IDs reais do banco. Use-os para tornar a importação idempotente.
Uma nova execução deve atualizar apenas o rascunho gerenciado por esta importação, sem duplicar entidades ou apagar alterações manuais posteriores. Detecte conflitos.
Marque para revisão os temas sobre limites/brincadeiras, comunicação, dúvidas e dados/redes sociais. Não una nem substitua cursos por similaridade de nome.
Cadastre as trilhas propostas somente se fizer sentido com a taxonomia existente; caso contrário, preserve a classificação editorial como metadado de revisão.

## 3. Construir cada aula
Fluxo: vídeo de abertura → situação e decisão → somente feedback da alternativa selecionada → vídeo de explicação comum → Na prática → fechamento.
Todas as alternativas devem ficar visíveis. Seleção única, confirmação explícita, possibilidade de comparar outra escolha.
O feedback é textual: não gerar três vídeos nem reproduzir os três feedbacks em sequência.
A explicação comum deve funcionar após qualquer alternativa. Preservar essa ligação.
Vídeo ainda ausente: mostrar estado de produção pendente no estúdio e permitir prévia textual identificada. Nunca simular mídia pronta.
Não gerar legendas com timestamps inventados: sincronizar somente após a mídia existir.
Manter transcrição acessível e controles do player existentes.

## 4. Atividade Na prática
Usar o título Na prática, não Missão.
Exibir enunciado, instrução, campo e ações claramente, na identidade roxa da marca.
O contrato deste pacote é texto curto, não preenchimento de lacunas. Não inventar menus de alternativas que não foram roteirizados.
Campo Minha resposta, até 800 caracteres, aceita situação fictícia, valida conteúdo não vazio para salvar.
Ver um exemplo revela a referência sem preencher automaticamente.
Não avaliar texto livre por correspondência exata nem usar IA para atribuir nota sem um requisito aprovado.
Salvar no meu roteiro persiste por aluno, curso, aula e atividade; só mostrar sucesso após confirmação.
Manter o texto em caso de erro; permitir editar resposta salva.
Fazer depois mantém pendência e permite seguir. Não marcar a prática como realizada.
Se a política atual do portal exigir atividade obrigatória, preservar a regra e reportar a divergência; não alterar conclusão global silenciosamente.
Não coletar dados sensíveis ou exigir relatos pessoais.

## 5. Mídias e instrutores
Mapear os orientadores sugeridos aos agentes autorizados: Patrícia, Enzo, Thiago, Júlia, Renato, Beatriz, Gustavo e Helena.
Preparar os 60 jobs de vídeo como rascunhos, com a fala integral, agente e instruções de produção.
Reutilizar o estúdio e a identidade já aprovados. Não regenerar avatares ou ativos existentes.
Não iniciar chamadas pagas de geração nem substituir vídeos sem autorização específica.
Apoios visuais: poucas palavras por vez, coerentes com a fala, sem cobrir rosto, legendas ou controles. Tom próximo, respeitoso e natural, sem infantilizar.

## 6. Duração e catálogo
duration_seconds=null significa duração não medida, nunca zero.
Após produção, calcular pelos arquivos efetivamente usados e seus recortes. Somar o caminho assistido; não somar alternativas mutuamente exclusivas ou replays opcionais.
Separar tempo de vídeo medido de eventual estimativa de estudo. Não apresentar estimativa como duração real.
Não colocar cursos com duração desconhecida na seção até 10 minutos.
Títulos, duração, quantidade de aulas e progresso devem ficar dentro dos cards.
Não hardcodar valores de mockups. Usar uma única fonte de duração no catálogo, ficha e aula.
Os novos cursos ficam fora do catálogo público enquanto estiverem em rascunho.

## 7. Progresso e publicação
Preservar regras existentes de retomada, vídeo pulado, conclusão e certificados.
A proposta editorial requer decisão confirmada e chegada ao fechamento nas duas aulas; práticas opcionais ficam registradas como pendentes.
Confrontar essa proposta com a regra real do portal e documentar diferenças antes de qualquer alteração global.
Distinguir roteiro pronto, mídia pendente, revisão pendente e pronto para publicar usando estados existentes ou metadados compatíveis.
Não conceder selos, certificados ou promessas de reconhecimento inexistentes.
Não publicar automaticamente.

## 8. Validação
Validar 15 cursos, duas aulas por curso, quatro roteiros de vídeo por curso, duas decisões e duas práticas por curso.
Checar referências de navegação, exatamente uma opção recomendada por decisão, 90 feedbacks e ausência de cenas órfãs.
Testar uma rota por alternativa, retomada após sair, erro no salvamento e reimportação sem duplicação.
Testar desktop e celular, teclado, foco, rótulos acessíveis e ausência de controles escondidos por hover.
As respostas do aluno são privadas por conta: testar isolamento entre usuários.
Não afirme que foi testado algo que não executou.

## Entrega
Apresente a lista dos cursos criados com os IDs reais e links de prévia do estúdio, o mapeamento implementado, os testes executados, as pendências de mídia e as sobreposições editoriais.
Se não houver acesso ao ambiente, entregue importador/migração compatível, instruções de execução e validações locais; diga claramente que os cursos ainda não foram cadastrados.

