# Pendências: privacidade, termos e governança do portal DNA Work

Documento interno para o responsável pelo produto, para a revisão jurídica e para a equipe de código. Acompanha o conjunto listado em `README.md`. Rascunhos escritos em 01/11/2026 a partir do código do repositório e de medições em navegador. Nada aqui é parecer jurídico.

## Como usar este arquivo

- Os quatro textos públicos moraram aqui até 01/11/2026 e agora vivem em `apps/web/src/content/legal/` (ver `README.md`). Os nomes de arquivo citados abaixo continuam valendo, nessa pasta.
- Os textos públicos (`politica-de-privacidade.md`, `politica-de-cookies.md`, `termos-de-uso.md`, `resumo-publico-avaliacao-de-impacto.md`) prometem só o que o sistema faz hoje. Onde um fato não era conhecido, há um placeholder em `[COLCHETES]`; onde depende de código ou infra, `[PENDENTE ATÉ ESTAR NO AR: ...]`.
- Cada base legal e cada prazo de retenção está marcado `[A CONFIRMAR]`. O advogado decide; a seção 3 e a seção 4 trazem a proposta, e `avaliacao-melhor-interesse-e-legitimo-interesse.md` traz o raciocínio.
- A seção 5 lista o que precisa mudar antes de cada frase pública ser verdadeira. A seção 11 ("Para o código") é a especificação ordenada para a equipe técnica.

## 1. Decisões do responsável (negócio)

1. Confirmar: "Hoje, o portal não envia seu progresso, respostas ou notas para empresas". O código não tem nenhuma função que envie dados do aluno a terceiros. Mas a DNA Work oferece vagas e trabalha com empresas parceiras. Se existe, ou existirá, qualquer uso do progresso em recrutamento ou em relatórios a parceiras, a política e os termos precisam dizer isso antes, com base legal própria, e as frases atuais saem (risco R11 da avaliação de impacto).
2. Decidir como o aluno chega ao portal. Hoje o cadastro público está desligado (`disableSignUp: true`) e as contas são criadas pela equipe. A base legal da conta e o texto dos termos (seção 2) dependem disso: o aluno assina algo com a DNA Work? Uma escola ou empresa parceira indica a turma? Um responsável participa? Como e por qual canal a senha inicial é entregue?
3. Se uma empresa ou escola parceira indica alunos e recebe qualquer informação de volta, ela pode ser controladora conjunta ou separada. Isso precisa constar no contrato com a parceira. Pedir ao advogado.
4. Encarregado (LGPD art. 41; Resolução CD/ANPD nº 18/2024). O responsável informou "Caio Vinicius Pinheiro / Luan Melo Villas Boas", e os textos trazem os dois nomes como dados. Pela resolução, conforme resumo de fontes públicas (texto integral não lido nesta rodada; conferir no DOU): a indicação é por ato formal escrito, datado e assinado, que descreva as atividades (art. 3); identidade e contato devem ser divulgados em local de destaque no site e mantidos atualizados (arts. 8 e 9); o encarregado declara eventual conflito de interesses, definido como situação que comprometa sua objetividade e julgamento técnico (arts. 2, II, 20 e 21). Pontos para o advogado: (a) se dois encarregados simultâneos são admitidos ou se um deve ser titular e o outro substituto; (b) conflito de interesses: Caio também responde pelo site dnawork.ai, e se ele decide sobre marketing ou tratamento de dados no site, avaliar se isso compromete a objetividade; (c) redigir o ato de indicação. Enquanto isso, os documentos internos tratam "o encarregado" como um dos dois, registrando quem assume cada caso.
5. Canal de atendimento de direitos. O e-mail informado, contato@dnawork.ai, parece ser a caixa geral da empresa. Problemas: várias pessoas podem ler pedidos de adolescentes; ninguém é dono do prazo de 15 dias. Confirmar quem tem acesso à caixa. Sugestão: um endereço dedicado (por exemplo, privacidade@dnawork.ai) encaminhado só ao encarregado, ou ao menos uma pasta restrita e uma regra de encaminhamento. O procedimento (`procedimento-direitos-do-titular.md`) já prevê a pasta restrita.
6. Decidir se o aluno pode cancelar o próprio selo (hoje só a equipe pode marcar `revokedAt`) e a regra do selo quando a conta é apagada (proposta: revogar e anonimizar o nome; ver seção 11, item 4).
7. Confirmar hospedagem: provedor, país e se há transferência internacional (LGPD arts. 33 a 36). O código suporta mídia em disco local ou S3 (`STORAGE_PROVIDER`); o texto público diz "disco do servidor" e precisa ser ajustado se a produção usar S3.
8. Aprovar a decisão de não ter banner de cookies (seção 6).
9. Endereço: o responsável informou Rua do Bosque, 1621, loja 2, São Paulo/SP, CEP 01136-001, e foi esse o usado nos textos. O cadastro público do CNPJ mostra Rua do Bosque, 1484, Barra Funda, CEP 01136-001. Se o endereço atual é o 1621, o cadastro na Receita pode precisar de atualização; se não, corrigir os textos. Decidir antes de publicar.
10. CNAE: o cadastro do CNPJ traz 77.40-3-00 (gestão de ativos intangíveis não financeiros). Pedir ao advogado se a atividade de cursos e encaminhamento a vagas pede CNAE adicional ou ajuste do objeto social; não afeta os textos públicos, mas afeta contratos e a análise do Marco Civil (fins econômicos).
11. Classificação indicativa: aprovar a proposta dos termos (seção 15: "não recomendado para menores de 12 anos", a confirmar) ou pedir outra ao advogado; depois, a faixa etária precisa aparecer na tela de entrada.
12. Canais de apoio a indicar nos termos e no resumo público (risco R12): decidir se o portal indica algum canal externo para quem se identificar com situações de assédio, e qual.
13. Nomear as pessoas do `plano-de-incidentes.md` (técnico, decisor, advogado, canal interno) e marcar o exercício de mesa.
14. Forma de aceite da `politica-interna-de-acesso.md` pela equipe.

## 2. Placeholders

| Placeholder | Onde aparece | Status |
| --- | --- | --- |
| `[RAZÃO SOCIAL]` | todos | preenchido: DNA Work Treinamento e Desenvolvimento Profissional Ltda. (confere com o cadastro público) |
| `[CNPJ]` | todos | preenchido: 40.380.163/0001-61 (confere) |
| `[ENDEREÇO]` | privacidade, termos | preenchido com o endereço informado pelo responsável; divergência com o cadastro público (item 1.9) |
| `[NOME DO ENCARREGADO]` | todos | preenchido com os dois nomes informados; forma de indicação pendente (item 1.4) |
| `[E-MAIL DO ENCARREGADO]` | todos | preenchido: contato@dnawork.ai; ver item 1.5 |
| `[PROVEDOR DE HOSPEDAGEM]`, `[PAÍS]` | privacidade, registro de operações, modelo C do procedimento | código/infra |
| `[DATA DE VIGÊNCIA]` | topo dos textos públicos | negócio, após revisão jurídica |
| `[URL DO PORTAL]` | topo dos textos públicos, seção do selo | código/infra |
| `[A CONFIRMAR: ...]` | bases, prazos, ingresso, foro, classificação, selo, responsável | advogado e negócio |
| `[PENDENTE ATÉ ESTAR NO AR: ...]` | HTTPS, backups, registro de acesso, aviso no campo e apagar nota | código/infra; remover só quando for verdade |

## 3. Bases legais propostas

Premissas:

- O portal não coleta idade. Logo, não dá para separar adolescentes (15 a 17) de adultos. A proposta é aplicar a todos o padrão do art. 14 da LGPD: melhor interesse, linguagem simples (art. 14 §6), mínimo necessário (art. 14 §4).
- O Enunciado CD/ANPD nº 1/2023 (DOU 24/05/2023) diz que o tratamento de dados de crianças e adolescentes "poderá ser realizado com base nas hipóteses legais previstas no art. 7º ou no art. 11 da LGPD, desde que observado e prevalecente o seu melhor interesse, a ser avaliado no caso concreto". A avaliação está feita em `avaliacao-melhor-interesse-e-legitimo-interesse.md`, parte A.
- Não há dado sensível (art. 5, II) coletado de propósito. Risco residual: o aluno pode escrever algo sensível nos campos livres (risco R1).

| Tratamento | Base proposta | Por quê | O que o advogado deve checar |
| --- | --- | --- | --- |
| Conta (nome, e-mail, hash de senha, papel) | Execução de contrato (art. 7, V) se o aluno é parte de um acordo com a DNA Work; senão, legítimo interesse (art. 7, IX) | A conta é indispensável para o serviço pedido | Se um adolescente pode ser "parte" do contrato; se há termo aceito; se o ingresso vem por parceira (ver 1.3) |
| Sessão (IP, user agent, token, validade) | Legítimo interesse (art. 7, IX): segurança da conta (teste B1) | Dados mínimos, expectativa óbvia, retenção curta | Se prefere execução de contrato |
| Registro de acesso (Marco Civil), a criar | Obrigação legal (art. 7, II) | Lei 12.965/2014, art. 15 (seção 8) | Confirmar a aplicação do art. 15 e o conteúdo mínimo do registro |
| Percurso (matrículas, tentativas, eventos, evidências, checagem final) | Execução de contrato (art. 7, V) | É o próprio serviço | Mesmo ponto da conta sobre adolescentes |
| Texto livre ("Na prática", nota da missão) | Execução de contrato para a atividade; consentimento (art. 7, I) para a nota opcional | A nota é opcional e pode ser apagada a pedido | Qual base protege mais; se o consentimento de menor de 18 precisa de responsável (art. 14 §1 fala de crianças) |
| Selo: emissão | Execução de contrato | Resultado prometido da trilha | - |
| Selo: página pública por código | Legítimo interesse (art. 7, IX) da DNA Work e do aluno (teste B2) | Só quem tem o código abre; `noindex`; o aluno decide compartilhar; revogação a pedido | Se é melhor consentimento na emissão ou nome abreviado por padrão (configuração mais protetiva, Lei 15.211/2025, art. 7) |
| Registros de auditoria | Legítimo interesse (art. 7, IX) (teste B3) | Prestação de contas | Prazo |
| Melhoria com números agrupados | Legítimo interesse (art. 7, IX) (teste B4) | Finalidade esperada; sem terceiros nem perfil | Grupo mínimo de 10 (proposta) |
| Cookie de sessão | Legítimo interesse ou execução de contrato (teste B5) | Cookie necessário segundo o guia da ANPD | Qual das duas |
| Cookie e localStorage de preferências | Provavelmente não são dado pessoal | Guardam uma palavra ou um número no aparelho | Confirmar o enquadramento |
| Pedidos de direitos e registro de incidentes | Obrigação legal (art. 7, II) | LGPD arts. 18 e 19; Res. CD/ANPD 15/2024, art. 10 | Prazo de guarda do log de pedidos (proposta: 5 anos) |
| HeyGen, ElevenLabs, Anthropic e OpenAI no estúdio | Não envolve dados de alunos | Verificado no código | Contratos com os fornecedores; nomes de autores em metadados |

## 4. Prazos de retenção propostos

Fato atual: nada é apagado automaticamente, exceto a sessão, que vence em 14 dias e é renovada a cada dia de uso. Não há rotina de limpeza nem backup configurado.

| Dado | Prazo proposto | Raciocínio | Ação necessária |
| --- | --- | --- | --- |
| Conta e percurso | Conta ativa + 12 meses após encerramento `[A CONFIRMAR]`; pedido explícito de exclusão não espera esse prazo | Tempo de o aluno voltar ou contestar um selo | Rotina (seção 11, item 5); definir "conta encerrada" (negócio) |
| Inatividade | Conta sem login por 24 meses é encerrada após aviso `[A CONFIRMAR]` | O aviso depende de e-mail, que não existe | E-mail transacional (código) |
| Sessões vencidas | Apagar em até 30 dias `[A CONFIRMAR]` | Após vencer, a linha só guarda IP e user agent sem uso | Rotina (código) |
| Registro de acesso (Marco Civil) | 6 meses, fixo em lei | Lei 12.965/2014, art. 15 | Tabela e rotina (seção 11, item 3) |
| Texto livre | Mesmo prazo do percurso; nota apagada a pedido, de forma independente | A nota é opcional | Botão de apagar (código) |
| Selos | 5 anos após a emissão `[A CONFIRMAR]`; revogação a pedido; na exclusão da conta: revogar e anonimizar `[A CONFIRMAR]` | O selo precisa funcionar enquanto for usado em currículo | Decisão de negócio; rotina (código) |
| Checagem final | Mesmo prazo do percurso | Explica o selo | - |
| Registros de auditoria | 2 anos `[A CONFIRMAR]` | Prestação de contas | Rotina (código) |
| Outbox processado | 30 dias `[A CONFIRMAR]` | Guarda `userId` sem necessidade após o processamento | Rotina (código) |
| Backups | Rotativos, 30 dias `[A CONFIRMAR]` | Hoje não há backup | Infra |
| Log de pedidos de direitos; registro de incidentes | 5 anos `[A CONFIRMAR]`; incidentes: mínimo de 5 anos (Res. 15/2024, art. 10) | Comprovação perante a ANPD | Procedimento |

## 4A. O que o conjunto agora cobre e o que ainda não existe

Cobertos por documento (rascunho): termos de uso; registro de operações (art. 37); avaliação de melhor interesse e testes de legítimo interesse; avaliação de impacto (RIPD + Decreto 12.880/2026, art. 47) e resumo público; procedimento de direitos; plano de incidentes; política interna de acesso. Ver `README.md`.

Ainda não existe: ato de indicação do encarregado; aceite dos termos registrado com data por conta; HTTPS e backup em produção; exercício de mesa do plano de incidentes. (Criados no código em 01/11/2026, ainda fora do ar: páginas públicas e links, scripts de exportar e apagar, rotina de retenção, registro de acesso, aviso no campo de texto e botão de apagar nota; ver a situação da seção 11.)

Teste interno com o time: não depende destes documentos, por serem poucas pessoas da própria equipe em homologação com login. Mesmo assim: contas individuais, sem as de demonstração, e remoção ao fim do teste.

## 5. Itens a corrigir antes de o texto ser verdadeiro

Em ordem. "Código" = equipe técnica; "Negócio" = DNA Work; "Infra" = servidor e hospedagem.

1. (Código) Retratos dos instrutores: **feito**. A correção foi aplicada e uma varredura em navegador das páginas do aluno não mostrou nenhuma requisição externa; a frase "seu navegador não conversa com serviços de terceiros" vale. Repetir a medição no servidor de produção, após HTTPS, antes de publicar.
2. (Infra) HTTPS em produção. Só então remover o marcador do HTTPS e confirmar que o cookie passa a se chamar `__Secure-better-auth.session_token` com flag Secure.
3. (Infra) Backups com expiração e teste de restauração. Só então remover o marcador de backup e preencher o prazo.
4. (Negócio) Itens da seção 1, em especial 1.2 (ingresso), 1.4 (encarregado), 1.5 (caixa de e-mail), 1.9 (endereço).
5. (Negócio + advogado) Fechar bases e prazos (seções 3 e 4) e tirar os `[A CONFIRMAR]`.
6. (Código) Seção 11, na ordem.
7. (Negócio) Assinar a política interna de acesso; fazer o exercício de mesa do plano de incidentes.
8. (Negócio) Se um dia houver envio de dados a parceiras ou uso em recrutamento: atualizar política, termos e avaliações antes, avisar os alunos e, se a base for consentimento, colher antes.

## 6. Banner de consentimento: por que a recomendação é não ter

Decisão recomendada: sem banner. Transparência pela política de cookies, com links na página de login e no rodapé.

Razões:

- O portal usa só cookies necessários (sessão) e uma preferência que a própria pessoa aciona (tema). Não há cookies analíticos, de publicidade ou de terceiros. Antes do login não há cookie algum.
- O guia da ANPD "Cookies e proteção de dados pessoais" (18/10/2022) define cookies necessários como os usados "para que o site ou aplicação realize funções básicas e opere corretamente" e mostra, no exemplo 3, cookies de autenticação tratados com base em legítimo interesse. O guia não diz que banner é obrigatório quando só há cookies necessários.
- Um banner com um único botão "ok" não dá escolha real e vira ruído.
- Público adolescente: menos camadas e menos cliques.

Ressalva do guia a levar ao advogado: o gerenciamento pelo navegador "possui uma função complementar, que não afasta a necessidade de disponibilização ao titular de um mecanismo direto e próprio para o gerenciamento de cookies". Para o portal, o mecanismo direto é o botão Sair e o seletor de tema. Confirmar se isso basta.

Condição: se qualquer cookie ou script não necessário for adicionado, passa a ser obrigatório, antes de ativar: atualizar a política, definir base legal e colocar um banner com recusa tão fácil quanto a aceitação. Com público adolescente, publicidade comportamental é vedada pelo ECA Digital (Lei 15.211/2025, arts. 22 e 26).

Nota sobre o LinkedIn: o botão "Adicionar ao LinkedIn" na página da trilha é um link de navegação (`linkedin.ts`), não uma requisição da página; leva trilha, código, data e URL de verificação, sem nome ou e-mail. A política passou a explicar isso. Não é cookie nem script de terceiro.

## 7. ECA Digital e normas de 2026: avaliação

O que foi confirmado em fontes oficiais:

- Lei 15.211/2025 (ECA Digital): em vigor em 17/03/2026, pelo art. 41-A, incluído pela Lei 15.352/2026. Texto: planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm.
- Escopo (art. 1): produto ou serviço "direcionado a crianças e a adolescentes" ou de "acesso provável" por eles.
- Obrigações que importam: configuração por padrão "no modelo mais protetivo disponível" (art. 7); princípios da LGPD (art. 7 §2); proibição de perfilamento para publicidade (arts. 22 e 26); verificação de idade para conteúdo impróprio ou proibido (art. 9 §1); informar a faixa etária indicada "a todos os usuários... no momento do acesso" (art. 8, V); informações sobre riscos e medidas de segurança a pais, responsáveis, crianças e adolescentes (art. 16); em caso de tratamento de dados de crianças e adolescentes, mapear riscos e "elaborar relatório de impacto, de monitoramento e de avaliação da proteção de dados pessoais" (art. 16, parágrafo único, I e II).
- Decreto 12.880/2026 (18/03/2026): dá competência à ANPD (art. 1, parágrafo único); termos de uso informam a classificação indicativa "em língua portuguesa e de forma acessível" (art. 12, §4); avaliação de impacto à segurança e à saúde, com "identificação e análise de riscos, avaliação da probabilidade de ocorrência e da gravidade do impacto potencial, tratamento e mitigação dos riscos e acompanhamento contínuo da efetividade das medidas adotadas", com versão resumida pública "em linguagem clara e acessível" (art. 47 e §1); a ANPD pode definir conteúdo mínimo e periodicidade (§2). Relatório semestral (art. 45) só acima de um milhão de usuários menores de 18. Texto: www2.camara.leg.br/legin/fed/decret/2026/decreto-12880-18-marco-2026-798813-publicacaooriginal-178481-pe.html.
- Lei 15.352/2026: transforma a ANPD em agência reguladora e fixa a vigência do ECA Digital.
- Cronograma da ANPD (gov.br/anpd/pt-br/assuntos/eca-digital): Etapa I a partir de março/2026; Etapa II a partir de agosto/2026 (parâmetros de aferição de idade); Etapa III a partir de janeiro/2027 (fiscalização). A página não define "acesso provável" nem trata de plataformas educacionais.
- FAQ ECA Digital da ANPD (30/07/2026): verificação de idade exigida de fornecedores de conteúdo proibido; não trata de plataformas educacionais fechadas.

O que não foi possível confirmar:

- Resolução CD/ANPD nº 33/2026: fontes oficiais secundárias a descrevem como adequação organizacional da ANPD; texto não lido. Pedir ao advogado o texto no DOU.
- Datas de publicação da Lei 15.352/2026 divergem entre fontes; usar a do Planalto (25/02/2026).

Avaliação para o portal (para o advogado decidir):

- Forte chance de se enquadrar no art. 1 da Lei 15.211/2025. Não assumimos isso no texto público; tratamos como provável e já fizemos a avaliação de impacto e o resumo público.
- Já atendido: sem publicidade, perfilamento, recomendação, comunicação entre usuários, compras ou loot boxes; dados mínimos; linguagem simples; sem configurações de privacidade a escolher.
- Ainda em aberto: classificação indicativa (termos, seção 15, e tela de entrada); ferramentas de supervisão parental (o portal não tem tempo de uso, recomendação nem comunicação, então pode haver pouco a configurar, mas avaliar); representante legal no país (empresa brasileira; confirmar se há algo a fazer); contas vinculadas a responsáveis para menores de 16 (contexto de redes sociais na FAQ; confirmar se há obrigação análoga).
- Verificação de idade: sem conteúdo proibido ou impróprio e com contas criadas pela equipe, pelo texto do decreto não há verificação obrigatória. Acompanhar a Etapa II.

## 8. Marco Civil da Internet: guarda de registros de acesso

Texto conferido em 01/11/2026 no Planalto (Lei 12.965/2014):

- Art. 15, caput: "O provedor de aplicações de internet constituído na forma de pessoa jurídica e que exerça essa atividade de forma organizada, profissionalmente e com fins econômicos deverá manter os respectivos registros de acesso a aplicações de internet, sob sigilo, em ambiente controlado e de segurança, pelo prazo de 6 (seis) meses, nos termos do regulamento."
- Art. 5, VIII: registros de acesso a aplicações são "o conjunto de informações referentes à data e hora de uso de uma determinada aplicação de internet a partir de um determinado endereço IP".
- Art. 10, §1, e art. 15, §3: a disponibilização a terceiros só por ordem judicial. Art. 15, §2: autoridade policial, administrativa ou Ministério Público podem requerer a guarda cautelar por prazo maior.
- Art. 16: na provisão de aplicações, "onerosa ou gratuita", é vedada a guarda de registros de acesso a outras aplicações sem consentimento e de dados pessoais excessivos. Art. 17: a opção por não guardar registros, fora das hipóteses da lei, não gera responsabilidade por danos de terceiros.
- Art. 7, X: direito à exclusão definitiva dos dados ao fim da relação, "ressalvadas as hipóteses de guarda obrigatória de registros previstas nesta Lei".
- Decreto 8.771/2016, art. 13: na guarda dos registros, controle estrito de acesso, autenticação, "inventário detalhado dos acessos aos registros" e técnicas que garantam a inviolabilidade; §2: reter o mínimo e apagar ao fim do prazo legal. O texto consolidado no Planalto mostra também um art. 15-A, atribuído ao Decreto 12.975/2026, que estende a guarda à porta lógica de origem "quando necessária" para identificar o terminal. Não li o Decreto 12.975/2026 em fonte primária; notícias apontam publicação em maio de 2026, vigência em julho de 2026 e projetos de decreto legislativo para sustá-lo. O advogado deve confirmar o estado atual.

Conclusão (para o advogado confirmar): o art. 15 plausivelmente se aplica à DNA Work. Os quatro requisitos do caput são: pessoa jurídica (sim, Ltda.); provedor de aplicações (o portal é uma aplicação de internet); atividade organizada e profissional (sim); fins econômicos. Sobre o último: o fato de o curso ser gratuito para o aluno não afasta, por si, os fins econômicos, porque (a) o art. 16 fala em provisão "onerosa ou gratuita", mostrando que a lei contempla aplicações gratuitas de provedores com fins econômicos, e (b) o critério recai sobre a atividade do provedor como um todo, e o portal integra a atividade empresarial da DNA Work (formação ligada a encaminhamento a vagas). O ponto que o advogado deve fechar é justamente esse: se o portal é parte da atividade econômica da empresa ou uma iniciativa sem fim econômico. O CNAE registrado (item 1.10) entra nessa análise.

Recomendação, que o código vai seguir: criar um registro de acesso separado da sessão, com data e hora, IP e id da conta, guardado por 6 meses e apagado depois por rotina, sem interface, acessível só por script de `admin` com registro de cada consulta (inventário do Decreto 8.771/2016, art. 13, III), e entregue a terceiros só por ordem judicial. Base legal: obrigação legal (art. 7, II). Como hoje o único registro com IP é a sessão, que vence em 14 dias, o portal não cumpre o art. 15 enquanto o registro não existir. Os textos públicos ("Seu acesso", "Para que usamos", "Por quanto tempo guardamos") já descrevem o registro, marcados `[PENDENTE ATÉ ESTAR NO AR]`. Granularidade: uma linha por login e por renovação diária da sessão (`updateAge`) atende "data e hora de uso" sem registrar cada clique; o advogado confirma se basta. Porta lógica: o servidor atrás de proxy normalmente não vê a porta de origem; registrar quando disponível, e o advogado diz se o art. 15-A exige mais. Se o advogado concluir que o art. 15 não se aplica, o registro pode ser removido e o texto volta ao anterior; manter a guarda só por obrigação legal evita guardar IP "por via das dúvidas" (art. 16, II, e LGPD, art. 6, III).

## 9. Observação sobre o site dnawork.ai

Observação feita em 01/11/2026: o site público dnawork.ai tem no rodapé os links "Política de Privacidade" e "Termos de Uso" apontando para `#politica` e `#termos`, sem texto ao clicar, e diz "LGPD compliant". Se os links estão vazios, a afirmação fica sem base e o site e o portal contam histórias diferentes. Sugestão: apontar os links do site para as políticas do portal depois de revisadas, e trocar "LGPD compliant" por uma frase verificável. O responsável pelo site é Caio Vinicius Pinheiro; o responsável pelo produto já encaminhou este ponto a ele, e a correção aguarda a ação dele. Quando a identidade e o contato do encarregado forem divulgados (Res. CD/ANPD 18/2024, art. 9), o site é o lugar natural.

## 10. O que foi verificado e como

Verificado no código em 01/11/2026 (branch `feat/incremento-1-fluxo-vertical`):

- Auth: `apps/web/src/lib/auth.ts`: Better Auth, `disableSignUp: true`, `minPasswordLength: 8`, sessão `expiresIn` 14 dias, `updateAge` 1 dia. Nenhuma biblioteca de envio de e-mail; sem recuperação de senha.
- Tabelas: `packages/db/src/schema/auth.ts` (user com `image` sem uso, session com `ipAddress` e `userAgent`, account com `password`), `identity.ts` (papéis admin, author, reviewer, student em `workspace_memberships`), `learning.ts` (enrollments, lesson_attempts, learner_events, objective_evidence, mission_responses com `note` e mission_response_events), `recognition.ts` (trail_check_attempts com `answers`, trail_badges com `holderName`, `competencies`, `courses`, `workloadMinutes`, `revokedAt`; `userId` com `onDelete: cascade`, então apagar o usuário apaga o selo), `ops.ts` (audit_logs; outbox_events cujo payload de `enrollment.created` e `course.completed` leva `userId`).
- Auditoria: `packages/db/src/repositories/learning.ts` grava `enrollment.create` com `userId` do aluno em `data`.
- "Na prática": `packages/course-schema/src/scaffold.ts`: `allowCustom` padrão true, `customMaxLength` entre 5 e 200, padrão 60. Nota da missão: `MISSION_NOTE_MAX`, 500 caracteres.
- Selo público: `apps/web/src/app/selo/[code]/page.tsx` e `/certificado/page.tsx`, `robots: { index: false, follow: false }`, sem login, mostra nome, trilha, competências, carga horária, cursos, data e status de revogação. Competências curadas em `packages/course-schema/src/trail-credentials.ts` e `docs/selos/`.
- LinkedIn: `apps/web/src/app/(lms)/aprender/trilhas/[trail]/linkedin.ts` monta um link de navegação com trilha, código, data e URL de verificação; sem nome ou e-mail.
- Mídia: `apps/web/src/app/api/assets/[assetId]/route.ts` exige login e workspace; `packages/media/src/storage.ts` suporta `local` e `s3`.
- Cookies e armazenamento: `apps/web/src/lib/theme.ts` (`lms-theme`), `components/player/video-scene.tsx` (`lms.player.captions`), `immersive-player.tsx` (`lms.bumper.played:<aula>`), `immersive/fullscreen.tsx`, preferências do estúdio.
- IA: nenhum uso das tabelas de aluno em `packages/ai` ou `apps/worker`; HeyGen e ElevenLabs só em rotas de mídia e webhooks do estúdio.
- Links para as políticas: nenhum em `apps/web/src/app/login` nem no layout do aluno (`aprender/layout.tsx` tem rodapé só com a marca).
- Scripts: `packages/db/package.json` não tem `dados:exportar` nem `dados:apagar`; os scripts de uso único ficam em `packages/db/src/scripts/oneoff/` com padrão `--apply`.

Tomado do briefing, não medido por mim: ausência de cookies antes do login; atributos HttpOnly e Secure; varredura de rede sem requisições externas após a correção dos retratos. Repetir no servidor de produção.

## 11. Para o código

Especificação ordenada para a equipe técnica. Valores de prazo são propostas `[A CONFIRMAR]`; implementar como configuração com esses padrões, para o advogado mudar sem código novo.

1. **Páginas públicas e links.** Rotas públicas, sem login, servindo `politica-de-privacidade.md`, `politica-de-cookies.md`, `termos-de-uso.md` e `resumo-publico-avaliacao-de-impacto.md` (sugestão: `/privacidade`, `/cookies`, `/termos`, `/seguranca`); mapear os links relativos `./x.md` para essas rotas. Links para as quatro páginas na tela de login e no rodapé de `aprender/layout.tsx`. Na tela de login, uma linha "Ao entrar, você concorda com os Termos de uso e a Política de privacidade" com links; `[A CONFIRMAR: se o aceite deve ser registrado com data por conta]`. Quando a classificação indicativa for definida, exibir a faixa etária na tela de entrada (Lei 15.211/2025, art. 8, V).
2. **Scripts de direitos** em `@lms/db`: `pnpm --filter @lms/db dados:exportar <email>` gera, em pasta indicada por argumento, um JSON com tudo o que está ligado ao usuário (user sem hash de senha, memberships, sessions ativas com IP, enrollments, lesson_attempts, learner_events, objective_evidence, mission_responses e events, trail_check_attempts, trail_badges, audit_logs em que `data.userId` é o aluno, e `access_logs` quando existir) e um `resumo.txt` em português simples (conta, N cursos, N selos, datas). `pnpm --filter @lms/db dados:apagar <email>` segue o padrão `--apply` dos scripts existentes (sem a flag, só mostra o que faria): (a) para cada selo, marcar `revokedAt` e trocar `holderName` por "Titular removido a pedido", preservando código, trilha, cursos e datas para a página pública mostrar "Selo cancelado" (exige tornar `trail_badges.userId` nulo e `onDelete: set null`, com migração) `[A CONFIRMAR: ou aceitar a cascata, que apaga o selo]`; (b) apagar `outbox_events` com o `userId` no payload; (c) apagar a linha de `user` (cascata apaga sessões, conta, matrículas, tentativas, eventos, evidências, missões, checagens); (d) manter `audit_logs` e `access_logs` como estão (pseudônimo); (e) imprimir um resumo do que foi apagado para o log de pedidos. Também: `dados:apagar-nota <email> <enrollmentId|lessonId>` para apagar `mission_responses.note` e o histórico em `mission_response_events` daquela resposta, sem tocar o resto.
3. **Registro de acesso (Marco Civil).** Tabela `access_logs` (id, userId, ipAddress, userAgent opcional, occurredAt, kind: `login` | `renew`), gravada no login e a cada renovação diária da sessão (hook do Better Auth ou na verificação de sessão quando `updatedAt` avança). Sem rota HTTP de leitura; consulta só por script `pnpm --filter @lms/db acesso:consultar <email|ip> --motivo "<processo>"` que grava uma linha em `audit_logs` (ação `access_logs.read`, com o motivo) a cada uso. Rotina apaga linhas com mais de 6 meses. Se o servidor expõe a porta de origem (`X-Forwarded-Port` ou equivalente), registrar em coluna opcional. Não apagar `access_logs` ao apagar a conta.
4. **Selo.** Além do item 2(a): rotina que marca `revokedAt` em selos com mais de 5 anos `[A CONFIRMAR]` (ou expiração na leitura, se preferirem). Se o advogado escolher nome abreviado por padrão ou consentimento na emissão (teste B2), implementar a opção e o texto correspondente; não antes.
5. **Rotina de retenção** (job no worker, diária, com os prazos em configuração): sessões vencidas há mais de 30 dias; `outbox_events` processados há mais de 30 dias; `audit_logs` com mais de 2 anos; `access_logs` com mais de 6 meses; contas com `status` encerrado há mais de 12 meses (exige um campo ou tabela de encerramento, a criar, preenchido pelo `dados:apagar` em modo "encerrar" ou pela equipe). Inatividade de 24 meses depende de e-mail transacional; deixar o gatilho preparado, sem envio.
6. **Texto livre.** Aviso curto junto ao campo "O que você percebeu?" e aos espaços de texto do "Na prática": "Escreva sobre você. Não escreva nomes de outras pessoas nem dados como saúde, religião ou orientação sexual." Botão "Apagar minha nota" no "Meu roteiro" e no player, que apaga a nota e o histórico (`mission_response_events` daquela resposta) e registra o evento sem o texto. Só depois disso o marcador `[PENDENTE]` do resumo público sai.
7. **Senha inicial.** Flag na conta exigindo troca de senha no primeiro acesso `[A CONFIRMAR: se o fluxo de entrega da senha inicial será esse]`. Recuperação de senha por e-mail fica para quando houver e-mail transacional.
8. **Relatórios agrupados.** Se forem criados, aplicar a regra de grupo mínimo de 10 e sem filtro por aluno (teste B4); sem analytics de terceiros.
9. **Auditoria.** Registrar as ações novas: `badge.revoke`, `user.delete` (sem dados pessoais no `data`, só ids e motivo), `note.delete`, `access_logs.read`, `user.name.update`.
10. **Texto público.** Após cada item, remover o marcador correspondente nos textos; após HTTPS, atualizar o nome do cookie na política de cookies; após backup, o prazo. Manter `registro-de-operacoes.md` atualizado ao criar qualquer tabela que toque aluno.

### Situação da seção 11 (01/11/2026)

Feito no código (nada disso está em produção, então **nenhum marcador `[PENDENTE ATÉ ESTAR NO AR]` foi removido**; os textos públicos seguem como estavam, incluindo as frases "ainda não temos botão para apagar a nota" e "não existe registro de acesso" que precisam ser trocadas no dia da subida):

- Item 1: rotas `/privacidade`, `/cookies`, `/termos`, `/seguranca` (públicas, `noindex` e aviso "Rascunho em revisão jurídica" enquanto `LEGAL_DRAFT = true`); links na tela de entrada (com a frase "Ao entrar, você concorda com os Termos de uso. Veja como cuidamos dos seus dados na Política de privacidade."), no rodapé da área do aluno e no rodapé do player. Sem faixa etária até a classificação indicativa ser definida. **Não feito:** aceite registrado com data por conta (depende do advogado).
- Item 2: `dados:exportar`, `dados:apagar` (simulação por padrão, `--apply`; `--encerrar`), `dados:apagar-nota`. A opção (a) foi adotada: `trail_badges.user_id` ficou opcional com `ON DELETE SET NULL` (migração `0019_privacidade_acesso_titular`), o selo é cancelado e anonimizado e a página pública mostra "Selo cancelado". Se o advogado preferir a cascata (apagar o selo), basta tirar essa etapa do script e reverter a coluna.
- Item 3: tabela `access_logs` (sem user agent: mínimo necessário), gravada no login e na renovação diária da sessão pelo fluxo de autenticação; falha do registro nunca bloqueia o login; `acesso:consultar <email|ip> --motivo "..."` grava `access_logs.read`; purga aos 6 meses (nunca abaixo disso). Coluna `source_port` existe, mas só é preenchida se o proxy repassar a porta em um cabeçalho (`CLIENT_PORT_HEADER`); `X-Forwarded-Port` não serve (é a porta do servidor). Pendente para o advogado: se o Decreto 12.975/2026 (art. 15-A) exige a porta lógica.
- Item 4 (parcial): expiração de selos após 5 anos existe na rotina, **desligada** (`RETENTION_BADGE_EXPIRY_ENABLED=0`). Nome abreviado: **não feito**, aguarda decisão.
- Item 5: job diário no worker (`apps/worker/src/retention.ts`). Ligado por padrão só em produção (`NODE_ENV=production`): sessões 30 dias após vencer, outbox processado 30 dias, auditoria 2 anos, registro de acesso 6 meses; `RETENTION_DRY_RUN=1` só registra no log. **Desligado por padrão** (aguardam o advogado): apagar contas encerradas (`RETENTION_CLOSED_ACCOUNTS_ENABLED`, 12 meses) e expirar selos. Encerrar a conta (tabela `account_closures`) apenas marca; **não bloqueia o login**. **Não feito:** inatividade de 24 meses (depende de e-mail transacional).
- Item 6: aviso "Não escreva nomes de outras pessoas nem dados sensíveis." junto à nota da missão, ao texto do "Na prática" (reflexão e "Prefiro escrever") e à resposta aberta; botão "Apagar minha nota" no "Meu roteiro" (inclui a gaveta do player) e em "Missões para depois", com confirmação, via `DELETE /api/enrollments/:id/missions/:node`. Apaga a nota, o histórico e as cópias do texto nas tentativas e eventos da aula; grava `note.delete` sem o texto. **Não há** botão dentro do painel da missão durante a aula (a nota é apagada pelo "Meu roteiro"). Se o aluno apagar a nota no "Meu roteiro" com a aula aberta em outra aba, a aba da aula só vê a mudança ao recarregar.
- Item 9: ações registradas: `badge.revoke`, `user.delete`, `user.close`, `note.delete`, `access_logs.read`, `data.export`, `retention.run`. **Não feito:** `user.name.update` (não há tela de edição de nome).

**Não feito nesta rodada, com o motivo:**

- Item 7, troca obrigatória da senha no primeiro acesso: depende da decisão do responsável sobre como a senha inicial é entregue; mexe no fluxo de login e em coluna do Better Auth.
- Item 8, relatórios agrupados: os relatórios não existem; a regra de grupo mínimo vale quando forem criados.
- Nome abreviado no selo: decisão do advogado (teste B2); não implementar antes.
- Aceite dos termos registrado com data por conta: depende de decisão do advogado.

**O que a subida precisa configurar** (web): `TRUSTED_PROXIES` (IP ou CIDR do Traefik na rede do EasyPanel; sem isso uma cadeia `X-Forwarded-For` com mais de um valor resulta em IP vazio e um aviso no log), `CLIENT_IP_HEADERS` (padrão `x-forwarded-for`; atrás do Cloudflare, `cf-connecting-ip,x-forwarded-for`), opcional `CLIENT_PORT_HEADER`. Worker: `RETENTION_*` (todos opcionais). Rodar `pnpm --filter @lms/db migrate` (migração 0019). Medir o IP gravado em `access_logs` com um login real em produção antes de remover o marcador.

## Fontes

- LGPD, Lei 13.709/2018: planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (arts. 6, 7, 9, 10, 11, 14, 18, 19, 37, 38, 41, 46, 48 conferidos em 01/11/2026).
- Marco Civil da Internet, Lei 12.965/2014: planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm (arts. 5, 7, 10, 13, 15, 16, 17 conferidos em 01/11/2026). Decreto 8.771/2016: planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8771.htm (arts. 11, 13, 15, 15-A).
- Enunciado CD/ANPD nº 1/2023: gov.br/anpd (DOU de 24/05/2023).
- Guia Orientativo "Cookies e proteção de dados pessoais", ANPD, 18/10/2022: gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf.
- Guia Orientativo "Hipóteses legais de tratamento de dados pessoais: legítimo interesse", ANPD, 02/02/2024: gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf.
- Resolução CD/ANPD nº 15/2024 (comunicação de incidente): bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html; página da ANPD: gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis.
- Resolução CD/ANPD nº 18/2024 (encarregado): bibliotecadigital.mj.gov.br/handle/1/13151; texto integral não lido nesta rodada, resumo por fontes públicas.
- Lei 15.211/2025 (ECA Digital): planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm.
- Decreto 12.880/2026: www2.camara.leg.br/legin/fed/decret/2026/decreto-12880-18-marco-2026-798813-publicacaooriginal-178481-pe.html.
- Lei 15.352/2026: planalto.gov.br/ccivil_03/_ato2023-2026/2026/lei/l15352.htm.
- ANPD, página do ECA Digital e cronograma: gov.br/anpd/pt-br/assuntos/eca-digital; FAQ de 30/07/2026.
- Portaria MJSP nº 502/2021 e Guia Prático de Classificação Indicativa: gov.br/mj/pt-br/assuntos/seus-direitos/classificacao-1 (só a estrutura; faixa etária por tema não conferida).
- Decreto 12.975/2026: não lido em fonte primária; citado por notícias e pelo texto consolidado do Decreto 8.771/2016 no Planalto.
- Resolução CD/ANPD nº 33/2026: não lida.
