# QA completo — 2026-10-24

Quatro frentes, todas em simulação (nenhuma chamada paga, IA em modo demonstração):
revisão de código, auditoria dos prompts, uso e acessibilidade do estúdio, testes
automáticos + lado do aluno. Capturas em `screens/` (`qa-completo-*`, `qa-aluno-*`,
`fix-aluno-*`, `fix-estudio-*`).

## Resultado antes das correções

- **Passou:** typecheck (7 projetos), 206 testes unitários/integração, build de
  produção (Next 16, 16 páginas), 11 testes de ponta a ponta (desktop + Pixel 7).
  Player de ponta a ponta só com teclado; vídeos em trechos (206); permissões;
  contrastes 5–7,6:1 nos novos componentes.
- **Encontrado:** 23 achados de código (3 altos), 20 de prompts (3 altos), 30 de
  estúdio (5 altos), 14 do aluno (3 altos).

## Correções aplicadas

### Servidor e pagamentos (worker, media, rotas)
- Chave de repetição do HeyGen derivada só do estado gravado (sem cobrança dupla
  após falha do fundo de continuidade).
- Processo em simulação nunca conclui um job real: falha com aviso claro; o
  reaproveitamento por hash exige o mesmo modo (simulado/real) e o mesmo workspace.
- Clipes já pagos de um vídeo que falhou/cancelou são **resgatados** (harvest) e
  reaproveitados na próxima tentativa.
- Vídeos dirigidos podem ser cancelados em execução; mensagem correta por caso.
- Resposta corrompida da ElevenLabs é erro permanente; o corpo bruto é gravado
  antes de interpretar (retentativa nunca sintetiza de novo).
- Revisores não geram ângulos (rota paga exige editor); consulta de geração presa
  ao workspace.
- Vídeo só é gerado se as falas dos planos batem com a fala atual da cena (422).
- Transições não cortam mais a fala (áudio concatenado; vídeo em xfade sobre
  quadro congelado). `COMPOSE_PIPELINE_VERSION` entra no hash.
- Jobs de plano único: sem tomada indevida por outro worker (10 min), sem
  `sleep` no laço; timeouts nas chamadas aos provedores; lease com dono.
- Fundo de continuidade: 3 falhas ou 4xx → fallback para o fundo da apresentação
  sem perder o clipe pago.
- Execuções do agente: claim atômico; cancelada não vira proposta.
- **Legendas WebVTT** para todo vídeo (dirigido e plano único), a partir do
  alinhamento da ElevenLabs; proporcionais (`approx`) na voz do HeyGen. Novo
  `asset_kind = captions` (migração 0008).

### IA e direção (packages/ai, course-schema)
- Pedido de caminhada coerente: câmera, enquadramento e ritmo por ação; abre com
  o ambiente **vazio** no primeiro segundo (fundo de continuidade sem a pessoa);
  "sentar" com mínimo de 8 s; passos "cerca de N"; `CINEMATIC_PROMPT_VERSION`.
- Gênero da pessoa apresentadora configurável (Ela/Ele/Neutro) no pedido e no
  sufixo de segurança do HeyGen.
- Conferência de falas por sequência de palavras (menos reparos pagos); cenas
  com mais de 312 palavras pulam a chamada; regras de número de planos e
  mínimo de palavras consistentes entre prompt, capacidades e validador.
- Gestos com dedos/sinais barrados pelo validador; vocabulário de 15 gestos
  seguros; gesto não se repete em planos seguidos.
- Orçamento de cenas em movimento por lote; conversão de excedentes revalidada.
- Limites do esquema de proposta afrouxados e aplicados pelo validador
  (reparáveis); erros de parse viram reparo; um lote ruim não derruba a aula.
- Assistente: ação paga só com verbo de geração + objeto, sem negação;
  confirmação curta só sobre o cartão oferecido na vez anterior; escopo
  aula × cena; intenções "faz ela andar", "dirija a cena X"; rotas reais no
  contexto; explica por que descartou cartões.
- "Aplicar direção" preserva cenas ajustadas à mão (opt-in para substituir) e
  re-confere as falas.
- Playbook por tipo de cena, direção anterior da aula e pistas por frase no
  prompt da IA diretora; ponto de vista narrativo repassado.

### Aluno (player, /aprender)
- Progresso do cartão de curso = aulas concluídas / aulas da versão.
- Legendas: `<track>` WebVTT com botão CC (preferência salva); sem VTT, texto da
  cena como legenda de apoio.
- Celular: pergunta e opções abaixo do vídeo, "Confirmar escolha" fixo no rodapé;
  ações pós-vídeo em barra própria. Desktop: sobreposição nunca cobre a barra
  nativa nem cresce além do vídeo.
- Foco sempre à vista; título com margem do cabeçalho fixo; aviso de carregamento
  e rede lenta; título compacto para caber na primeira tela; pílula do assistente
  oculta na prévia.

### Estúdio (interface)
- Diálogos com foco inicial, trava de Tab, Esc e retorno do foco (`useFocusTrap`,
  portal estável `#overlay-root`); foco encaminhado após cada ação assíncrona;
  resultados anunciados (`aria-live`).
- Texto de "cobrança" só fora da simulação (cartões de próximos passos e diálogo
  de ângulo dizem "demonstração").
- Painel do curso acessível durante a montagem (aba "Montagem" ao lado).
- Sem rolagem lateral no celular; editor de plano e controle de enquadramento
  reorganizados em telas estreitas; pílula do assistente não cobre conteúdo;
  painel do assistente empurra o conteúdo em telas grandes.
- "Aplicar direção" lista as cenas ajustadas à mão e só as substitui com opt-in;
  cenas puladas aparecem no aviso.
- Contagem única de vídeos (prontos / desatualizados / faltando) em storyboard,
  montagem, produção e revisão; nomes legíveis em vez de ids e códigos
  (MEDIA_STALE → "Vídeo desatualizado", slugs → títulos); textos truncados
  resolvidos; enquadramento preservado ao sair da cena em movimento; links
  "Ver na cena" levam à cena.

## Verificação final
- `pnpm -r typecheck`: limpo (7 projetos).
- Testes: course-schema 26 · media 76 · course-engine 10 · ai 107 · db 13 ·
  worker 28 = **260**, todos passando (DB de teste, provedores falsos).
- Ponta a ponta (Playwright, dev server em simulação): **11/11**.
- Conferência manual no navegador: sem erros de console após recarga, sem
  rolagem lateral, foco inicial no assistente ao abrir com ⌘K.

## Pendências aceitas
- Qualquer workspace membro pode baixar um asset pelo id (ids aleatórios; a
  verificação de matrícula fica para a fase de LMS dinâmico).
- Aula conclui mesmo com avaliação reprovada (conclusão ≠ domínio, por desenho).
- Áudio dos vídeos ~4–4,6 Mbps, sem versão leve para dados móveis.
