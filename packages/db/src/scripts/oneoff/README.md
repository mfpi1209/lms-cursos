# Scripts de uso único (db)

Decisões datadas, listas fixas de cursos. Não rode de novo sem reler; nenhum deles é chamado por outro código. Cada um aceita `--apply` (sem ele, só mostra).

- `gestos-defeitos.ts`: troca o gesto só dos planos/reações com defeito de imagem do avatar (folha fantasma, relógio nos dois pulsos).
- `reordenar-abertura.ts`: o plano do tema passa a vir logo depois da apresentação (só a ordem dos planos muda).
- `revisao-roteiro.ts`: abertura "Agora, vamos…", boas-vindas na 1ª aula (sem selo), aviso da missão e chamadas com "Agora, responda:" (31/10).
- `vinheta-cada-aula.ts`: põe a vinheta da marca no fim de cada aula.
- `remover-avaliacoes.ts`: tira as avaliações de fim de módulo (a verificação passou a ser a checagem da trilha).

Correções de conteúdo do robô de QA (31/10; rascunho; só texto de tela; `--dry-run` por padrão, `--apply` grava; antes/depois em JSON em `docs/qa/lancamento/robo/`; um diff trava qualquer mudança fora dos campos permitidos). Apoio comum: `_rascunho-qa.ts`.

- `qa-titulos-perguntas.ts`: título "No lugar de X, o que você …?" e pergunta no fim do enunciado (quadro "A situação" volta).
- `qa-opcoes-primeira-pessoa.ts`: opções apontadas reescritas em 1ª pessoa. **Revertido** (decisão do dono, item 5).
- `qa-opcoes-primeira-pessoa-reverter.ts`: devolve ao rascunho os 18 rótulos originais (só `options[].label`; confere que nenhuma cena fica desatualizada).
- `qa-atividade-opcional.ts`: atividades "Na prática" (`reflection`) dos 14 cursos atuais e dos 12 novos passam a `required: false` (decisão do dono, item 2; só `required`; confere que o conjunto de cenas desatualizadas não muda).
- `qa-ponte-missao.ts`: ponte "Esta é a missão da aula." na atividade das 5 aulas sem anúncio falado.
- `qa-missao-falada.ts`: fala da missão como PLANO NOVO na narração (`missao` nas 5 aberturas, `missao_fim` no fecho do último vídeo longo de 30 aulas); marca o vídeo como desatualizado; não grava mídia. `--apply` exige `docs/qa/lancamento/emendas.md`.
- `qa-revisao-pedagogica.ts`: revisão pedagógica da Fable (`docs/qa/revisao-pedagogica/`): textos de tela dos cursos (P4–P7, P24–P34) e textos das checagens finais das trilhas em `packages/course-schema/src/trails.ts` (P9–P23, P30). O diff trava qualquer campo fora do previsto; confere que nenhuma cena fica desatualizada.
- `qa-p1-devolver-s3.ts`: P1, devolve o plano s3 ao C14·A12·v23 (tira do `media.adjust.drop` e acerta a narração); o vídeo é refeito por `apps/worker/src/scripts/remontar-emendas.ts`. O corte de áudio do P2 é `apps/worker/src/scripts/qa-p2-cortar-agente.ts`.

- `contas-teste-home.ts`: cria (idempotente, só em banco local) as contas `nova@demo.local` (matriculada, nada começado) e `andamento@demo.local` (matriculada nos 26 cursos publicados) para ver a vitrine em cada estado. Mesmo caminho do seed (usuário + credencial + papel de aluno) e a senha é a `SEED_PASSWORD`; matrícula por `enrollStudent`.

- `conta-teste-lgpd.ts`: cria (só em banco local) UMA conta descartável `lgpd-teste-*@demo.local`, matriculada, com uma missão "Já experimentei" e nota, para testar "Apagar minha nota", `dados:exportar` e `dados:apagar --apply` (únicas contas `@demo.local` em que escrita é permitida). A senha é aleatória e vai para o arquivo de `--senha-em`; não é impressa.
