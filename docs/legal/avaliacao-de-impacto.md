# Avaliação de impacto do portal DNA Work

Documento interno que junta o Relatório de Impacto à Proteção de Dados Pessoais (RIPD; LGPD, arts. 5, XVII, e 38) e a avaliação de impacto à segurança e à saúde de crianças e adolescentes do ECA Digital (Lei 15.211/2025, art. 16, parágrafo único, II; Decreto 12.880/2026, art. 47). Versão 1, 01/11/2026, feita a partir do código. Não é parecer jurídico. O resumo público, exigido pelo art. 47, §1, está em `resumo-publico-avaliacao-de-impacto.md`.

O art. 47 pede: identificação e análise de riscos; avaliação da probabilidade e da gravidade; tratamento e mitigação; acompanhamento contínuo da efetividade. A ANPD pode definir conteúdo mínimo e periodicidade (§2); até lá, usamos esta estrutura. O art. 38, parágrafo único, da LGPD pede descrição dos tipos de dados, metodologia, medidas e mecanismos de mitigação.

## 1. Escopo

- Sistema: portal de cursos em vídeo, Next.js + PostgreSQL, com worker de mídia. Público: jovens de 15 a 24 anos, contas criadas pela equipe. Sem cadastro aberto, anúncios, perfis, recomendação, chat, compras ou pagamento.
- Dados: ver `registro-de-operacoes.md`. Em resumo: nome, e-mail, hash de senha; IP e navegador da sessão; percurso e respostas; texto livre curto; selo com nome; registros de auditoria.
- Fora do escopo: estúdio de autoria (só conteúdo e contas da equipe); site dnawork.ai.
- Metodologia: leitura do código (branch `feat/incremento-1-fluxo-vertical`), medições em navegador relatadas no briefing, e comparação com LGPD, Lei 15.211/2025 e Decreto 12.880/2026. Probabilidade e gravidade em três níveis (baixa, média, alta), julgamento qualitativo.

## 2. Por que a avaliação é necessária

- O portal é direcionado a jovens de 15 a 24, portanto inclui adolescentes por desenho; tratamos como "direcionado" ou "de acesso provável" (Lei 15.211/2025, art. 1) até o advogado concluir o contrário.
- Não há dado de idade, então não é possível aplicar medidas diferentes a adolescentes; todas as medidas valem para todos.
- Alguns cursos tratam de assédio, conflito e exclusão no trabalho, e os campos livres podem receber relatos pessoais.

## 3. Riscos

Colunas: probabilidade (P) e gravidade (G) antes das mitigações; o que existe; o que falta; onde está a pendência.

| # | Risco para o aluno | P | G | Mitigação existente | Mitigação que falta | Pendência |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Escrever dado sensível ou relato sobre terceiros nos campos livres (cursos de assédio e conflito), ficando guardado e legível pela equipe | alta | alta | campos curtos (200/500 caracteres); nota opcional; aviso na política; regra interna de não ler sem motivo | aviso no próprio campo; botão para apagar a nota; apagamento independente da conta | código: aviso e apagar nota |
| R2 | Exposição do nome completo de adolescente na página pública do selo; repasse do código além do pretendido; cópia da página por terceiros | média | média | só por código não sequencial; `noindex`; só dados do selo; revogação a pedido; aluno decide compartilhar | decisão sobre configuração padrão mais protetiva (nome abreviado ou consentimento na emissão); prazo de 5 anos com expiração | advogado: B2 da avaliação de LI; código: expiração |
| R3 | Sem dado de idade, o portal não distingue adolescentes e não consegue aplicar nenhuma regra específica (por exemplo, responsável, supervisão) | alta | média | tratamento de todos como adolescentes: mínimo de dados, linguagem simples, sem anúncios ou perfil | decisão de negócio sobre ingresso (há responsável? há turma por escola?); acompanhar parâmetros da ANPD (Etapa II do cronograma do ECA Digital) | negócio e advogado: `pendencias.md` 1.2 e 7 |
| R4 | Perda total de dados e selos por falha do servidor único (banco e mídia no mesmo lugar, sem backup) | média | alta | nenhuma | backup com expiração (30 dias `[A CONFIRMAR]`), teste de restauração, separação de banco e mídia se possível | infra: `pendencias.md` 5.3 |
| R5 | Acesso ou vazamento por falta de HTTPS em produção (cookie de sessão e senha em trânsito) | alta até o HTTPS | alta | cookie HttpOnly/SameSite; senha em hash | HTTPS com cookie Secure | infra: `pendencias.md` 5.2 |
| R6 | Pedido de direitos (acesso, exclusão) não atendido em 15 dias por falta de ferramenta e de processo | alta | média | política diz que o atendimento é manual por e-mail | scripts `dados:exportar` e `dados:apagar`; procedimento escrito; caixa de e-mail com responsável | código e negócio: `procedimento-direitos-do-titular.md` |
| R7 | Pessoa da equipe lendo notas ou percurso de aluno sem motivo (curiosidade, uso em recrutamento informal) | média | alta | papéis no banco; auditoria de ações administrativas (não de leitura) | política interna de acesso assinada; registro de motivo; revisão periódica de quem tem `admin` | negócio: `politica-interna-de-acesso.md` |
| R8 | Senha inicial criada pela equipe e enviada por canal inseguro (WhatsApp, e-mail aberto); sem "esqueci minha senha" | alta | média | senha mínima de 8; cadastro fechado | procedimento de entrega da senha inicial com troca obrigatória no primeiro acesso; recuperação de senha por e-mail (depende de e-mail transacional) | código: troca no primeiro acesso; negócio: canal de entrega `[A CONFIRMAR]` |
| R9 | Conta usada por outra pessoa (irmão, colega), gerando selo em nome errado ou expondo o percurso | média | média | termos de uso proíbem; revogação do selo | nenhuma detecção automática; aceitar o risco e documentar | advogado: termos |
| R10 | Incidente de segurança sem plano: demora para conter e comunicar; adolescentes afetados sem aviso em linguagem simples | média | alta | nenhuma | plano de incidentes com prazos da Resolução CD/ANPD 15/2024 e modelos | `plano-de-incidentes.md` (escrito; precisa de aprovação e teste) |
| R11 | Uso futuro do percurso em recrutamento ou envio a parceiras sem aviso, contrariando a política | média (modelo de negócio inclui vagas) | alta | código não tem nenhuma função de envio; política promete avisar antes | decisão formal do responsável; se mudar, nova base legal, nova avaliação e aviso prévio | negócio: `pendencias.md` 1.1 e 1.3 |
| R12 | Conteúdo sobre assédio e desrespeito reativar experiência pessoal difícil, sem canal de apoio | média | média | cenários simulados, sem imagem explícita; curso ensina a recorrer a uma pessoa de referência | aviso nos termos de que o portal não é canal de denúncia nem de apoio; indicar canais externos `[A CONFIRMAR: quais]`; classificação indicativa | negócio e advogado: termos, seção 15 |
| R13 | Confundir avatares de IA com pessoas reais ou atribuir a eles autoridade que não têm | baixa | baixa | política e termos informam que são avatares | aviso visível no player `[A CONFIRMAR: se necessário]` | advogado |
| R14 | Dados guardados além da finalidade por falta de rotina de retenção (sessões vencidas, contas inativas, outbox, auditoria) | alta | baixa | sessão vence sozinha | rotina de retenção com prazos propostos | código: `pendencias.md`, "Para o código" |
| R15 | Registro de acesso do Marco Civil, quando existir, usado para fins além da ordem judicial, ou guardado além de 6 meses | baixa | média | não existe ainda | tabela separada, sem interface, acesso só por script `admin` com inventário, rotina de apagamento em 6 meses | código |
| R16 | Transferência internacional sem base (servidor ou S3 fora do Brasil) | desconhecida | média | nenhuma | confirmar hospedagem; se fora do Brasil, enquadrar nos arts. 33 a 36 | infra e advogado |

## 4. O que já está certo (e deve ser mantido)

- Sem anúncios, sem perfilamento, sem recomendação algorítmica, sem comunicação entre usuários, sem loot box, sem compra (Lei 15.211/2025, arts. 20 a 26, atendidos por ausência).
- Configuração mais protetiva por padrão (art. 7): não há configuração de privacidade a escolher; nada é público além do selo por código.
- Mídia servida só a quem está logado; navegador não fala com terceiros (após a correção dos retratos, `pendencias.md` 5.1).
- Texto do aluno não vai para IA nem para terceiros.
- Linguagem simples em todos os textos públicos (LGPD, art. 14, §6).

## 5. Tratamento dos riscos: ordem recomendada

1. HTTPS (R5) e backup (R4): sem isso, nenhum outro controle segura.
2. Aviso no campo e apagar nota (R1).
3. Scripts de exportar e apagar, caixa de e-mail com responsável (R6).
4. Política interna de acesso assinada pela equipe (R7).
5. Rotina de retenção e registro de acesso (R14, R15).
6. Decisões de negócio e jurídicas: ingresso e responsável (R3), selo público (R2), recrutamento (R11), classificação indicativa e canais de apoio (R12).
7. Troca de senha no primeiro acesso e recuperação de senha (R8), que dependem de e-mail transacional.

Riscos aceitos por ora, com registro: R9 (conta compartilhada) e R13 (avatares), por serem de baixa gravidade e cobertos por informação.

## 6. Acompanhamento contínuo (Decreto 12.880/2026, art. 47)

- Responsável: encarregado (Caio Vinicius Pinheiro / Luan Melo Villas Boas) com a equipe técnica.
- Revisão a cada 6 meses `[A CONFIRMAR]` e sempre que: um item da seção 5 for concluído (atualizar a coluna "existente"); houver incidente; houver dado, integração ou relatório novo; a ANPD publicar ato sobre o art. 47 (conteúdo mínimo e periodicidade) ou sobre aferição de idade.
- Indicadores simples: número de pedidos de direitos e prazo médio de resposta; número de notas apagadas a pedido; número de selos revogados; incidentes registrados; pendências abertas da seção 5.
- Cada revisão gera uma versão nova deste arquivo e do resumo público, com data.

## 7. Parecer do encarregado

[A PREENCHER após a revisão jurídica: concordância com os riscos e com a ordem de tratamento; itens em que a DNA Work decide aceitar o risco e por quê.]
