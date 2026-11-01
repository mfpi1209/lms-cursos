# Avaliação de melhor interesse e teste de legítimo interesse

Documento interno. Versão de 01/11/2026. Não é parecer jurídico; serve para o advogado decidir e para a DNA Work comprovar que avaliou (LGPD, arts. 6, X, 10, §3, e 37).

Fontes conferidas: LGPD art. 14 (melhor interesse, caput; §4, mínimo necessário; §6, informação simples e acessível); Enunciado CD/ANPD nº 1/2023 (dados de crianças e adolescentes podem ser tratados nas hipóteses dos arts. 7 e 11, "desde que observado e prevalecente o seu melhor interesse, a ser avaliado no caso concreto"); Guia Orientativo da ANPD sobre legítimo interesse (02/02/2024), que propõe o teste em três fases: finalidade, necessidade, balanceamento e salvaguardas, documentado para fins de prestação de contas.

Premissa do portal: a idade não é coletada, então todo aluno é tratado como adolescente. Público de 15 a 24 anos; sem anúncios, perfis, recomendação, chat ou compras.

## Parte A. Melhor interesse, por atividade

Formato: benefício para o aluno; risco para o aluno; o que reduz o risco; conclusão. Numeração igual à do `registro-de-operacoes.md`.

**1. Conta.** Benefício: acesso ao curso com nome próprio, progresso guardado e selo em seu nome. Risco: nome e e-mail em um sistema a mais; acesso por terceiros se a senha vazar. Reduz: só nome e e-mail; hash de senha; sem cadastro aberto; sem recuperação de senha por link (também limita ataques por e-mail). Conclusão: compatível com o melhor interesse; dado mínimo (art. 14, §4). Pendente: definir se há responsável no ingresso (`pendencias.md`, 1.2).

**2. Sessão.** Benefício: não precisar digitar a senha a cada página; detectar uso da conta por outra pessoa. Risco: IP e navegador guardados por até 14 dias, sem uso visível para o aluno. Reduz: dados vencem sozinhos; não há geolocalização nem cruzamento. Conclusão: compatível. Ver teste B1.

**3. Registro de acesso (quando existir).** Benefício indireto: obrigação legal que protege também o aluno em caso de uso indevido da conta. Risco: rastro de 6 meses de IP e horário. Reduz: tabela separada, sem interface, só por ordem judicial, apagada ao fim do prazo. Conclusão: compatível se limitado ao mínimo do art. 5, VIII, da Lei 12.965/2014 (data, hora, IP) mais o id da conta; nada além disso.

**4. Percurso.** Benefício: é o próprio curso. Risco: registro detalhado de escolhas em situações de trabalho simuladas, que poderia ser lido como avaliação da pessoa. Reduz: os eventos registram decisões em cenários, não características do aluno; não há nota, ranking ou envio a empresas; a equipe não lê rotineiramente. Conclusão: compatível. Condição: continuar sem uso em recrutamento (se mudar, refazer esta avaliação e a política).

**5. Texto livre.** Benefício: refletir e guardar o que aprendeu. Risco: o maior do portal. Em cursos sobre assédio e conflito, o aluno pode escrever sobre fatos vividos, citar colegas ou revelar dado sensível (saúde, orientação sexual, religião). Reduz: campos curtos (200 e 500 caracteres); nota opcional; aviso na política; regra interna de não ler sem motivo; apagamento a pedido. Falta: aviso no próprio campo e botão de apagar a nota (`pendencias.md`, "Para o código"). Conclusão: compatível só com o aviso no campo e o apagamento fácil; sem isso, o risco fica alto para adolescentes.

**6. Checagem final.** Benefício: aprovação que gera o selo; possibilidade de refazer. Risco: baixo; respostas a perguntas de múltipla escolha. Conclusão: compatível.

**7. Selo (emissão).** Benefício: reconhecimento concreto, usável em currículo. Risco: o nome fica "congelado" no selo; se o aluno mudar o nome na conta (ex.: nome social), o selo antigo mantém o anterior. Reduz: reemitir é o mesmo selo (um por pessoa e trilha), então a equipe pode corrigir o `holderName` a pedido. Conclusão: compatível; incluir a correção do nome no procedimento de direitos.

**8. Selo (página pública).** Benefício: o aluno pode provar o selo sem depender da DNA Work. Risco: nome completo de um adolescente em página sem login; o código pode ser repassado além do pretendido; terceiros podem guardar a página. Reduz: só por código não sequencial; `noindex`; nenhum dado além do selo (sem e-mail, foto ou idade); revogação a pedido; o aluno escolhe compartilhar. Alternativas avaliadas: (a) consentimento na emissão ("quero página pública"), (b) exibir só primeiro nome e inicial, (c) página só com login. Conclusão: compatível com legítimo interesse se a página continuar com o mínimo e com revogação simples; recomendar ao advogado a alternativa (a) como opção de maior proteção, ou ao menos a (b) como configuração padrão mais protetiva (Lei 15.211/2025, art. 7). Ver teste B2.

**9. Auditoria.** Benefício: saber quem matriculou, publicou ou restaurou algo; corrigir erros. Risco: baixo; o aluno aparece só por id. Conclusão: compatível. Ver teste B3.

**10. Outbox.** Acessório do percurso; só ids. Compatível.

**11. Números agrupados.** Benefício: aulas melhores. Risco: relatório pequeno pode identificar alguém (uma turma de 3 alunos, por exemplo). Reduz: regra de grupo mínimo (teste B4). Conclusão: compatível com a regra.

**12. Cookies e preferências.** Sem risco identificável além da sessão. Compatível.

Conclusão geral: nenhuma atividade usa o aluno como produto, cria perfil ou expõe mais do que o serviço pede. Os dois pontos onde o melhor interesse ainda não prevalece de forma plena são o texto livre (falta o aviso no campo e o apagamento fácil) e a página pública do selo (decidir a configuração padrão). Ambos estão em `pendencias.md`.

## Parte B. Teste de legítimo interesse (LGPD, art. 10)

Aplicado a cada atividade cuja base proposta é o art. 7, IX. Cada teste segue as três fases do guia da ANPD. Se o advogado concluir que outra base cabe melhor (por exemplo, execução de contrato para a sessão), o teste fica como registro.

### B1. Sessão de login (IP, user agent, token)

- Finalidade: manter o aluno autenticado e detectar uso indevido da conta (art. 10, II: "proteção, em relação ao titular, do exercício regular de seus direitos ou prestação de serviços que o beneficiem"). Situação concreta: toda visita após o login. Interesse legítimo, lícito e esperado por quem usa um site com senha.
- Necessidade: token é indispensável; validade, idem. IP e user agent são o mínimo para distinguir uma sessão da pessoa de uma sessão de um invasor. Não há alternativa menos invasiva que cumpra a mesma função. Dados vencem em 14 dias.
- Balanceamento e salvaguardas: expectativa do titular alta (é como todo login funciona); impacto baixo (sem localização, sem cruzamento, sem uso além da segurança). Salvaguardas: cookie HttpOnly e SameSite; HTTPS `[PENDENTE ATÉ ESTAR NO AR]`; limpeza de sessões vencidas `[A CONFIRMAR: 30 dias]`; transparência na política ("Seu acesso"); direito de oposição atendido por e-mail (na prática, encerrar a conta, pois a sessão é inseparável do login). Resultado: o interesse prevalece.

### B2. Página pública do selo por código

- Finalidade: permitir que a pessoa a quem o aluno mostra o selo confira se ele é verdadeiro, e que o próprio aluno prove a conclusão sem pedir nada à DNA Work. Interesse da DNA Work (credibilidade do selo) e do aluno (art. 10, I e II). Situação concreta: o aluno coloca o código no currículo ou no LinkedIn.
- Necessidade: sem página pública, a verificação dependeria de um pedido à DNA Work, mais lento e menos confiável. Dados exibidos são os do selo e nada mais. Pontos a decidir: nome completo é necessário? Para um currículo, sim, pois quem verifica compara com o nome do candidato. Alternativa menos invasiva: nome abreviado por padrão, com opção de nome completo.
- Balanceamento e salvaguardas: expectativa do titular razoável, desde que ele saiba que a página existe e que decide compartilhar (a política diz isso). Impacto: exposição do nome de adolescente a quem tiver o código; risco de repasse e de cópia da página. Salvaguardas: código não sequencial; `noindex`; sem login para ninguém, mas sem busca ou listagem; revogação a pedido; prazo de 5 anos `[A CONFIRMAR]`; só os dados do selo. Resultado: o interesse prevalece com as salvaguardas atuais. Recomendação ao advogado: avaliar a opção de consentimento na emissão ou nome abreviado por padrão como configuração mais protetiva (Lei 15.211/2025, art. 7). Se adotada, a base da página passa a ser consentimento, e a emissão continua em execução de contrato.

### B3. Registros de auditoria

- Finalidade: prestação de contas sobre ações da equipe (publicar, matricular, restaurar) e investigação de erros ou uso indevido (art. 10, II; princípio da responsabilização, art. 6, X). Situação concreta: cada ação administrativa.
- Necessidade: sem registro, não há como saber quem matriculou quem ou quem publicou uma versão. O aluno aparece apenas por id. Prazo proposto: 2 anos `[A CONFIRMAR]`.
- Balanceamento e salvaguardas: expectativa alta (o aluno espera que a equipe seja auditável); impacto mínimo (só id). Salvaguardas: só inclusão; acesso `admin`; retenção limitada; se a conta for apagada, o id vira pseudônimo sem chave. Resultado: o interesse prevalece.

### B4. Melhoria dos cursos com números agrupados

- Finalidade: descobrir onde os alunos travam ou desistem e corrigir aulas (art. 10, I: apoio e promoção de atividades do controlador; também beneficia os alunos seguintes). Situação concreta: revisar uma aula depois de uma turma.
- Necessidade: os dados já existem (percurso e checagem); nenhum dado novo é coletado; nenhum evento de vídeo é registrado hoje (se for criado, atualizar a política antes). O relatório precisa só de contagens, não de nomes.
- Balanceamento e salvaguardas: expectativa alta (é o que se espera de um curso); impacto baixo desde que ninguém seja identificável. Salvaguardas propostas `[A CONFIRMAR]`: (1) todo número agrupado soma no mínimo 10 alunos; abaixo disso, a célula não é exibida; (2) sem filtro por nome, e-mail ou id; (3) sem cruzamento com dado externo; (4) sem uso em recrutamento ou em decisão sobre um aluno; (5) relatório gerado por consulta no banco ou script, sem ferramenta de analytics de terceiros; (6) se um dia for preciso olhar um aluno específico (suporte), isso é outra atividade, com motivo registrado (`politica-interna-de-acesso.md`). Resultado: o interesse prevalece com as salvaguardas. Observação: a ANPD não fixa um número mínimo; 10 é proposta nossa, conservadora para turmas pequenas.

### B5. Cookie de sessão

Mesmo raciocínio de B1. O guia da ANPD sobre cookies (2022) aceita, no exemplo 3, legítimo interesse para cookie de autenticação. Resultado: o interesse prevalece. Alternativa igualmente válida: execução de contrato; o escritório escolhe.

## O que não passa por legítimo interesse

- Registro de acesso do Marco Civil: obrigação legal (art. 7, II), não legítimo interesse.
- Conta, percurso, checagem e emissão do selo: execução de contrato (proposta). Se o advogado entender que o aluno adolescente não é "parte" do contrato, cai em legítimo interesse e os testes acima servem de modelo.
- Nota da missão: a proposta é consentimento, porque é opcional e revogável; o guia da ANPD lembra que consentimento só vale com escolha real, e aqui há.

## Revisão

Refazer esta avaliação quando: houver dado de idade; houver envio a parceiras ou uso em recrutamento; houver eventos novos (vídeo, tempo de tela); a ANPD publicar parâmetros do ECA Digital que toquem plataformas educacionais; ou a cada 12 meses.
