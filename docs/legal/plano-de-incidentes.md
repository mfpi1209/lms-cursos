# Plano de resposta a incidentes de segurança com dados pessoais

Documento interno. Versão de 01/11/2026. Base: LGPD, arts. 46 e 48; Resolução CD/ANPD nº 15/2024 (Regulamento de Comunicação de Incidente de Segurança), conferida em bibliotecadigital.mj.gov.br e na página da ANPD "Comunicação de incidente de segurança". Não é parecer jurídico.

Incidente, para este plano: qualquer evento que afete a confidencialidade, a integridade ou a disponibilidade de dados de alunos ou da equipe. Exemplos: vazamento do banco, senha de `admin` exposta, código do selo listado em massa, servidor perdido sem backup, e-mail com dados enviado à pessoa errada, pessoa da equipe acessando dados sem motivo, ransomware.

## 1. Papéis

- Coordenador do incidente: o encarregado (Caio Vinicius Pinheiro / Luan Melo Villas Boas; definir qual dos dois assume cada caso).
- Técnico: quem opera o servidor e o banco `[A CONFIRMAR: nome]`.
- Decisor: a direção da DNA Work `[A CONFIRMAR: nome]`. Decide comunicar ou não, aprova textos.
- Jurídico: advogado externo `[A CONFIRMAR]`.
- Canal interno: `[A CONFIRMAR: grupo ou e-mail interno]`. Não usar ferramentas de IA nem chats públicos para discutir dados do incidente.

## 2. Prazos que contam

| O quê | Prazo | Fonte |
| --- | --- | --- |
| Comunicar à ANPD, se houver risco ou dano relevante | 3 dias úteis a partir do conhecimento de que o incidente afetou dados pessoais | Res. 15/2024, art. 6 |
| Comunicar aos titulares afetados | mesmos 3 dias úteis | Res. 15/2024, art. 9 |
| Complementar a comunicação à ANPD | até 20 dias úteis após a comunicação, com justificativa | Res. 15/2024, art. 6, §3 |
| Agentes de pequeno porte | prazos contados em dobro | Res. 15/2024, art. 6, §8; Res. 2/2022 `[A CONFIRMAR: se a DNA Work se enquadra; mesmo assim, usar 3 dias como meta]` |
| Guardar o registro do incidente, comunicado ou não | mínimo de 5 anos | Res. 15/2024, art. 10 |
| Divulgação pública quando não for possível avisar cada titular | no mínimo 3 meses no site | Res. 15/2024, art. 9, §3 |

O relógio começa quando a DNA Work sabe que dados pessoais foram afetados, não quando termina a investigação. Comunicar com o que se sabe e complementar depois é o caminho previsto.

## 3. Passo a passo

### Hora 0 a 4: triagem e contenção

1. Quem percebe registra no canal interno: o que viu, quando, onde. Abre o registro do incidente (seção 6).
2. Técnico contém: revogar sessões (apagar linhas de `session`), trocar `BETTER_AUTH_SECRET` e senhas de banco, bloquear IPs, tirar o portal do ar se necessário. Preservar logs antes de qualquer limpeza (copiar logs do servidor e, quando existir, a tabela `access_logs`).
3. Coordenador avalia, com o que se sabe: quais tabelas ou arquivos foram afetados; quantos alunos; se houve acesso de fora ou só exposição; se já parou.

### Dia 1: avaliação de risco

Decidir se há "risco ou dano relevante" (Res. 15/2024, art. 5). É relevante quando pode afetar significativamente direitos dos titulares e envolve ao menos um critério, entre eles: dados sensíveis; dados de crianças, adolescentes ou idosos; dados financeiros; dados de autenticação; dados protegidos por sigilo; dados em larga escala.

Regra prática para o portal: como todos os alunos são tratados como adolescentes, qualquer incidente que exponha nome, e-mail, percurso, texto livre ou hash de senha de alunos atende ao critério "dados de adolescentes" e, se puder afetar seus direitos, é relevante. Texto livre exposto deve ser tratado como se contivesse dado sensível, porque pode conter. Na dúvida, comunicar.

Casos que em geral não são relevantes: exposição apenas de dados já públicos do selo para quem tinha o código; falha interna sem acesso de terceiros, corrigida no mesmo dia, sem cópia dos dados; dados só da equipe, em pequeno número, sem senha.

### Dias 1 a 3: comunicação

- ANPD: pelo formulário eletrônico da ANPD (Res. 15/2024, art. 6, §4), link na página "Comunicação de incidente de segurança" em gov.br/anpd. Conteúdo mínimo (art. 6, §2): natureza e categoria dos dados; número de titulares, separando adolescentes quando possível; medidas técnicas e de segurança usadas; riscos; motivo de eventual atraso; medidas adotadas; data do incidente e do conhecimento; contato do encarregado. O que não se sabe, dizer que não se sabe e complementar em 20 dias úteis.
- Titulares: e-mail da conta, individual (art. 9, §1 e §2), em linguagem simples (modelo da seção 5). Conteúdo (art. 9): o que aconteceu; que dados; riscos; o que fizemos; o que a pessoa pode fazer; contato. Se não for possível avisar cada um, aviso no portal e no site por 3 meses (§3).
- Cuidado com adolescentes: texto curto, sem alarme e sem culpa; dizer o que fazer em uma frase (trocar a senha; não responder a mensagens estranhas); indicar que o responsável pode escrever para contato@dnawork.ai. Se o incidente envolver texto livre de cursos sobre assédio, considerar que o conteúdo pode ser íntimo: avisar com mais cuidado e oferecer apagar a nota.
- Nunca enviar dados do incidente (lista de afetados, trechos vazados) por e-mail aberto ou chat.

### Dias 3 a 20: recuperação e complemento

- Restaurar serviço; forçar troca de senha de todos os afetados `[A CONFIRMAR: mecanismo; hoje não há recuperação de senha, então a troca é feita pela equipe e enviada por canal combinado]`.
- Complementar a ANPD com o que foi apurado.
- Responder a titulares que escreverem, pelo procedimento de direitos.

## 4. Decisão de não comunicar

Se o decisor concluir que não há risco relevante, registrar por escrito: o que aconteceu, por que não é relevante, quem decidiu, quando. O registro fica 5 anos e pode ser pedido pela ANPD (Res. 15/2024, arts. 8 e 10).

## 5. Modelos

**Aviso ao aluno (e-mail)**

> Assunto: Aviso importante sobre seus dados no portal DNA Work
>
> Oi, [nome]. Em [data], tivemos um problema de segurança no portal. [Uma frase sobre o que aconteceu.] Os dados que podem ter sido vistos são: [lista curta]. Sua senha não foi exposta em texto legível [ajustar]. O que já fizemos: [uma ou duas frases]. O que você pode fazer: troque sua senha no portal [ou: vamos enviar uma senha nova por [canal]]; desconfie de mensagens que peçam seus dados. Se tiver menos de 18 anos, mostre este e-mail a um responsável. Dúvidas: contato@dnawork.ai. Já avisamos a ANPD, a agência que cuida da proteção de dados. Pedimos desculpa pelo ocorrido. [Nome do encarregado], DNA Work.

**Aviso público (portal e site, quando não for possível avisar cada um)**

> Em [data], o portal DNA Work teve um problema de segurança que pode ter exposto [dados] de alunos. Já contivemos o problema e avisamos a ANPD. Se você tem conta no portal, [orientação]. Dúvidas: contato@dnawork.ai. Este aviso fica aqui até [data, mínimo 3 meses].

**Registro interno de decisão**

> Incidente nº [n]. Conhecimento em [data/hora]. Resumo: [...]. Dados afetados: [...]. Titulares: [n], dos quais adolescentes: [desconhecido/estimativa]. Risco relevante: sim/não, porque [...]. Comunicação à ANPD: [data] / não. Comunicação aos titulares: [data, meio] / não. Decidido por [nome].

## 6. Registro do incidente

Pasta restrita do encarregado, um arquivo por incidente, com: linha do tempo; dados e tabelas afetados; número de titulares; avaliação de risco; comunicações enviadas (cópias); medidas; lições. Guardar por 5 anos. Lista de incidentes (inclusive os não comunicados) na mesma pasta.

## 7. Revisão pós-incidente

Em até 15 dias após o fim: reunião de uma hora com coordenador, técnico e decisor. Perguntas: o que permitiu o incidente; o que atrasou a detecção; o que atrasou a resposta; que item da `avaliacao-de-impacto.md` muda; que mitigação entra em `pendencias.md`. Registrar as respostas no arquivo do incidente e atualizar a avaliação de impacto.

## 8. Prevenção mínima ligada a este plano

Sem estes itens, o plano não tem o que proteger: HTTPS; backup com teste de restauração; segredos fora do código; lista de quem tem `admin` revisada a cada 3 meses `[A CONFIRMAR]`; logs do servidor guardados por ao menos 30 dias `[A CONFIRMAR]`; e-mail transacional para poder avisar alunos em massa (hoje não existe: um incidente com muitos alunos exigiria envio manual).

## 9. Teste do plano

Fazer um exercício de mesa (simulação de 1 hora, sem tocar em dados reais) antes de o portal receber alunos reais e depois a cada 12 meses `[A CONFIRMAR]`. Cenário sugerido: "o arquivo de backup foi copiado por alguém de fora".
