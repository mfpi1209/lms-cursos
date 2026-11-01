# Política de cookies do portal DNA Work

Rascunho para revisão jurídica. Vigência: [DATA DE VIGÊNCIA]. Portal: [URL DO PORTAL].

## O essencial

- O portal usa só dois cookies: um para manter você conectado e um para lembrar o tema claro ou escuro.
- Antes de você entrar com login, não há nenhum cookie.
- Não usamos cookies de anúncios, de rastreamento, de estatísticas ou de redes sociais.
- Nenhum cookie é de terceiros: todos são criados pelo próprio portal.
- Se você bloquear o cookie de sessão, o login deixa de funcionar.
- O portal também guarda algumas preferências no seu navegador (tema, legendas), que ficam só no seu aparelho.

## O que são cookies e "tecnologias parecidas"

Um cookie é um pequeno arquivo de texto que o site grava no seu navegador para lembrar algo entre uma página e outra, por exemplo que você já fez login.

Os navegadores também têm dois "armários" onde um site pode guardar preferências:

- localStorage: fica guardado até você apagar;
- sessionStorage: some quando você fecha a aba.

A ANPD (a agência do governo que cuida da proteção de dados) chama tudo isso de tecnologias similares. Por isso, explicamos aqui o que o portal guarda em cada um.

## Cookies que o portal usa

| Nome | Para que serve | Quanto tempo dura | Quem cria |
| --- | --- | --- | --- |
| `better-auth.session_token` (com conexão segura, o nome ganha o prefixo `__Secure-`) | Mantém você conectado depois do login. Sem ele, cada página pediria sua senha de novo. | 14 dias. Cada dia em que você usa o portal, o prazo é renovado. | O portal, só depois do login. |
| `lms-theme` | Lembra se você escolheu tema claro ou escuro, para a página já abrir no seu tema. | 1 ano. | O portal, só quando você muda o tema. |

Detalhes técnicos do cookie de sessão: ele é "HttpOnly" (scripts da página não conseguem lê-lo), "SameSite=Lax" (não é enviado a outros sites) e, em conexão HTTPS, "Secure" (só viaja criptografado). Ele contém um código aleatório, não contém seu nome nem seu e-mail.

O cookie `lms-theme` guarda só a sua escolha: claro, escuro ou seguir o sistema.

## O que o portal guarda no seu navegador

Esses itens não são cookies. Ficam só no seu aparelho e não são enviados ao servidor.

| Nome | Onde fica | Para que serve | Quanto tempo dura | Quem cria |
| --- | --- | --- | --- | --- |
| `lms-theme` | localStorage | Cópia da sua preferência de tema, usada se o cookie sumir. | Até você apagar. | O portal, quando você muda o tema. |
| `lms.player.captions` | localStorage | Lembra se você ligou ou desligou as legendas dos vídeos. | Até você apagar. | O portal, quando você mexe nas legendas. |
| `lms.bumper.played:<aula>` | sessionStorage | Marca que a vinheta da marca já tocou naquela aula, para não repetir. | Até você fechar a aba. | O portal, ao tocar a vinheta. |
| Preferência de tela cheia do player | sessionStorage | Lembra se você estava em tela cheia na aula. | Até você fechar a aba. | O portal, ao entrar ou sair da tela cheia. |
| Duas preferências de painéis do estúdio | localStorage | Só para a equipe que cria cursos: lembram se um painel estava aberto ou fechado. Alunos não têm acesso ao estúdio. | Até apagar. | O portal, no estúdio. |

## O que não usamos

- Nenhum cookie ou script de estatísticas (como Google Analytics).
- Nenhum pixel ou tag de marketing ou de redes sociais.
- Nenhuma gravação de sessão ou mapa de calor.
- Nenhum cookie de terceiros. As fontes e os demais arquivos das páginas vêm do próprio portal, então seu navegador não conversa com outros serviços ao usar o portal.

Se um dia isso mudar, atualizamos esta página antes e pedimos seu consentimento antes de ativar qualquer cookie que não seja necessário.

## Por que não pedimos consentimento para esses cookies

A lei de proteção de dados (LGPD) e o guia da ANPD sobre cookies separam os cookies "necessários" dos "não necessários". Os necessários são os que o site precisa para funcionar e prestar o serviço que você pediu. O cookie de sessão é desse tipo: sem ele, não há login. O cookie de tema só existe porque você escolheu um tema.

Para cookies necessários, a lei não exige consentimento, mas exige transparência. Esta página é a nossa transparência. Base legal proposta: [A CONFIRMAR: legítimo interesse ou execução de contrato].

## Como apagar ou bloquear cookies

Você pode apagar ou bloquear cookies e o armazenamento do navegador nas configurações dele. Os caminhos mais comuns:

- Chrome (computador e Android): Configurações > Privacidade e segurança > Cookies e dados do site (ou "Dados do site de terceiros") e Limpar dados de navegação.
- Safari (iPhone e iPad): Ajustes > Apps > Safari > Avançado > Dados dos Sites. Para bloquear: Ajustes > Apps > Safari > Bloquear todos os cookies.
- Safari (Mac): Safari > Ajustes > Privacidade > Gerenciar dados de sites.
- Firefox: Configurações > Privacidade e segurança > Cookies e dados de sites.
- Edge: Configurações > Cookies e permissões do site.

Os nomes dos menus podem mudar de uma versão para outra. Procure por "cookies" ou "dados do site" nas configurações do navegador.

Dentro do portal, a forma direta de encerrar o cookie de sessão é clicar em Sair.

## O que acontece se você bloquear

- Cookie de sessão bloqueado: o login não funciona. Você consegue abrir a página de entrada, mas não consegue entrar nem ver os cursos.
- Cookie de tema apagado: o portal volta ao tema do seu sistema. Nada mais muda.
- localStorage ou sessionStorage bloqueados: o portal continua funcionando, mas não lembra as legendas, o tema ou a vinheta entre uma aula e outra.

## Mudanças nesta política

Se o portal passar a usar qualquer cookie ou armazenamento novo, atualizamos a tabela acima antes. Se o cookie novo não for necessário, pedimos seu consentimento antes de ativá-lo.

## Fale com a gente

Dúvidas sobre cookies ou sobre seus dados: Caio Vinicius Pinheiro / Luan Melo Villas Boas, contato@dnawork.ai. Veja também a [Política de privacidade](./politica-de-privacidade.md) e os [Termos de uso](./termos-de-uso.md).
