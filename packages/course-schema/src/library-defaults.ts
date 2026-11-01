import type { KnowledgeArea, LibraryTemplateInput, TemplateDataByKind } from './library';

/**
 * Peças padrão da biblioteca (workspace DNA Work), tiradas do que já foi
 * aprovado na construção dos cursos "Pode entrar" e "Comece bem". Os
 * INSTRUTORES (câmeras com lookIds) não ficam aqui: são extraídos dos
 * rascunhos pelo script `packages/db/src/scripts/biblioteca-modelos.ts`.
 * As imagens dos estúdios ganham `imageAssetId` quando o script as envia ao
 * workspace (storage local, sem custo).
 */

type Def<K extends LibraryTemplateInput['kind']> = { kind: K; key: string; name: string; description: string; data: TemplateDataByKind[K] };

/* ------------------------------------------------------------------ */
/* Estúdios                                                             */
/* ------------------------------------------------------------------ */

/** Descrição dos estúdios jovens nos pedidos de câmera (o `DESC` de gerar-estudios.sh). */
export const STUDIO_SCENERY_PROMPTS = {
  '6': 'studio: clean wall, navy pegboard and orange arch left, navy shelf with DW logo right',
  '7': 'studio: clean wall, wooden arch with LED left, orange curved wall with DW logo right',
  '8': 'studio: clean wall, navy panels with wood slats and LED both sides, DW logo right',
} as const;

const ZONE_FRAMING =
  'Plano médio-aberto, da cintura para cima, olhando para a câmera. Esquerda: instrutor no terço esquerdo, parede livre à direita (pílulas à direita). Direita: o inverso. 3/4: centralizado, ângulo 3/4, câmera principal. Todas em tela cheia (full_frame), com o fundo do próprio visual.';

export const DEFAULT_STUDIOS: Array<Def<'studio'>> = (['6', '7', '8'] as const).map((n) => ({
  kind: 'studio' as const,
  key: `estudio-jovem-${n}`,
  name: `Estúdio jovem ${n}`,
  description: n === '7' ? 'Estúdio aprovado: arco de madeira com LED à esquerda e parede curva laranja com o logo DW à direita.' : `Estúdio jovem ${n} (teste de cenário).`,
  data: {
    mode: 'zones' as const,
    sceneryPrompt: STUDIO_SCENERY_PROMPTS[n],
    imagePath: `docs/brand/cenario/estudio-jovem-${n}.png`,
    zones: ['left', 'right', 'center'],
    framingNotes: ZONE_FRAMING,
  },
}));

export const RECEPTION_STUDIO: Def<'studio'> = {
  kind: 'studio',
  key: 'recepcao-dnawork',
  name: 'Recepção DNA Work (com balcão)',
  description: 'Recepção com balcão: instrutora recortada e montada atrás do balcão, à direita.',
  data: {
    mode: 'composite',
    sceneryPrompt: 'DNA Work reception: light lobby, reception desk in front, navy and orange brand details',
    imagePath: 'docs/brand/cenario/recepcao-dnawork-1920.png',
    zones: [],
    framingNotes: 'Imagem inteira; instrutora em x 0,375, 82% da altura, base na linha do tampo (0,85) e a faixa do balcão por cima dela; sem desfoque extra.',
    placement: { presenterPlacement: 'right', presenterScale: 0.82, presenterX: 0.375, presenterBottom: 0.85 },
  },
};

/* ------------------------------------------------------------------ */
/* Vozes                                                                */
/* ------------------------------------------------------------------ */

export const DEFAULT_VOICES: Array<Def<'voice'>> = [
  {
    kind: 'voice',
    key: 'voz-ana-dias',
    name: 'Ana Dias (ElevenLabs)',
    description: 'Voz da Marina: feminina, calorosa, português do Brasil.',
    data: { provider: 'elevenlabs', voiceId: 'MZxV5lN3cv7hi1376O0m', voiceName: 'Ana Dias', language: 'pt-BR', pronoun: 'she', notes: 'Aprovada no curso Pode entrar.' },
  },
  {
    kind: 'voice',
    key: 'voz-gabriel',
    name: 'Gabriel (ElevenLabs)',
    description: 'Voz do Rafael: masculina, jovem, português do Brasil (biblioteca pública do ElevenLabs).',
    data: {
      provider: 'elevenlabs',
      voiceId: 'lvkgCBi6spByiTZMPJEK',
      voiceName: 'Gabriel (ElevenLabs)',
      language: 'pt-BR',
      pronoun: 'he',
      libraryOwnerId: '695123f7b1a8ef0f0869ac6e3ffd5b2be1af46d4f9be19f5847178865912c795',
      notes: 'Aprovada no curso Comece bem. Adicionar à conta é grátis (ocupa 1 vaga de voz).',
    },
  },
];

/* ------------------------------------------------------------------ */
/* Marca e direção                                                      */
/* ------------------------------------------------------------------ */

export const DEFAULT_BRANDING: Def<'branding'> = {
  kind: 'branding',
  key: 'marca-dnawork',
  name: 'DNA Work · logo no rodapé',
  description: "Marca d'água só com o logo DNA Work no rodapé direito (opacidade 0,7) e a vinheta de assinatura, sem slogan.",
  data: {
    watermark: { enabled: true, position: 'bottom-right', opacity: 0.7 },
    bumper: { playOn: ['course_end'], skippable: true },
    theme: 'immersive',
    notes: 'Nunca inventar slogan da DNA Work. Vinheta sem frase; a marca d\'água é só o logo.',
  },
};

export const DIRECTION_ZONES: Def<'direction'> = {
  kind: 'direction',
  key: 'direcao-estudio-zonas',
  name: 'Estúdio com zonas · pílulas',
  description: 'Fala na 3/4 e nas laterais alternando; listas viram pílulas no painel marinho da parede livre; letreiro e pergunta a seguir.',
  data: {
    directionStyle: { cameraMode: 'single', cardsPerMinute: 2, gestures: 'natural', pace: 'balanced', useSlides: true },
    cardLayout: 'presenter_chips',
    lowerThird: true,
    nextQuestion: true,
    rules: [
      'Fala na câmera 3/4 nas cenas pares e nas laterais alternando nas ímpares.',
      'Listas, regras e definições viram pílulas numa câmera LATERAL, do lado oposto às pílulas anteriores (nunca duas vezes seguidas do mesmo lado).',
      'Pílulas: até 4, rótulo = o trecho em negrito do tópico, até 4 palavras; cada pílula surge quando a palavra é dita.',
      'Cortes só entre frases; sem zoom nas câmeras de zona (tela cheia, sem transformação).',
      'Letreiro com nome e papel na primeira cena narrada da aula (0,6 s a 4,5 s), nunca sobre a marca d\'água.',
      'Cartão "A seguir" com a pergunta nos últimos 3 s da cena que vem antes de uma decisão.',
      'Chamada para a pergunta: último plano da cena antes de uma decisão, numa câmera FRONTAL (olho no olho), gesto convidativo, sem pílulas.',
      'Reação a cada resposta: vídeo curto de plano único na câmera principal (3/4), sem pílulas nem cartões, com marca d\'água e legenda.',
    ],
  },
};

export const DIRECTION_SINGLE: Def<'direction'> = {
  kind: 'direction',
  key: 'direcao-camera-unica',
  name: 'Câmera única · painel',
  description: 'Uma câmera constante; o ritmo vem do painel marinho com tópicos que acendem e dos cartões de marca.',
  data: {
    directionStyle: { cameraMode: 'single', cardsPerMinute: 2, gestures: 'natural', pace: 'balanced', useSlides: true },
    cardLayout: 'presenter_panel',
    lowerThird: false,
    nextQuestion: false,
    rules: [
      'Uma câmera (a principal) em todos os planos com apresentador; nunca trocar de ângulo.',
      'Corridas de fala de 20 a 40 s; um cartão de 5 a 15 s sempre que a fala enumera, define ou dá a regra; nunca dois cartões seguidos.',
      'Painel: título até 8 palavras, 2 a 3 tópicos de até 12 palavras com **palavra-chave** em negrito.',
      'Chamada para a pergunta: último plano da cena antes de uma decisão, na câmera principal, gesto convidativo.',
      'Reação a cada resposta: vídeo curto de plano único na câmera principal, sem cartões, com marca d\'água e legenda.',
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Base de conhecimento do motor                                        */
/* ------------------------------------------------------------------ */

const DIR = 'docs/direcao-cinematografica.md';
const ROT = 'docs/prompts/prompt-gpt-roteiro-curso.md';
const BRAND = 'docs/brand/dnawork.md';
const COST = 'docs/gasto-seguro-e-orcamento.md';

export const ENGINE_KNOWLEDGE: Record<KnowledgeArea, { name: string; rules: Array<{ id: string; title: string; text: string; source?: string }> }> = {
  produto: {
    name: 'Produto e público',
    rules: [
      { id: 'publico-jovem', title: 'Para quem é', text: 'Jovens de 16 a 24 anos buscando estágio, Jovem Aprendiz ou primeiro emprego; muitos tímidos, leem no celular e chegam por link no WhatsApp. O player precisa funcionar bem em 375 px.', source: `${ROT}; ${BRAND}` },
      { id: 'sai-com-algo', title: 'O aluno leva algo', text: 'Ao terminar, a pessoa sabe o que fazer numa situação real e sai com algo pronto para usar: uma frase, um plano ou um checklist ("Meu roteiro").', source: ROT },
      { id: 'sem-theo', title: 'Sem THEO nos cursos', text: 'Os cursos não se associam ao THEO nem à entrevista pelo WhatsApp; o THEO não aparece nos cursos.', source: BRAND },
      { id: 'instrutor-por-curso', title: 'Um instrutor e uma voz por curso', text: 'Cada curso tem instrutor próprio (nome que não colide com os personagens do roteiro, papel no gênero certo: "Seu orientador"/"Sua orientadora", perfis diversos) e voz própria: nada de voz repetida entre cursos; antes de escolher, ver as vozes da biblioteca e registrar a escolhida na hora.', source: 'docs/lote-12-cursos.md' },
      { id: 'varios-instrutores', title: 'Vários instrutores', text: 'A plataforma tem várias instrutoras e instrutores (avatar, voz, câmeras, cenários), escolhidos por curso pela biblioteca de modelos.', source: BRAND },
    ],
  },
  roteiro: {
    name: 'Roteiro e aulas',
    rules: [
      { id: 'curto-pratico', title: 'Curto e prático', text: 'Aulas de 3 a 6 minutos, 5 a 7 cenas contando o FIM; cada ideia vira uma decisão ou uma ação. Curso padrão de cerca de 15 minutos.', source: ROT },
      { id: 'decidir-antes', title: 'Decidir antes de explicar', text: 'O aluno escolhe entre 3 respostas plausíveis em primeira pessoa, de tamanho parecido; a melhor nunca é óbvia pelo formato e muda de posição. Feedback começa com "Você…", nunca humilha e termina com "Faça assim: …".', source: ROT },
      { id: 'sem-escrita', title: 'Sem escrita obrigatória', text: 'Tudo é escolha; a produção pessoal é "Montar frase" com blocos para tocar (no máximo 1 por aula). Voz é treino opcional, nunca obrigatório.', source: ROT },
      { id: 'ponte-chamada', title: 'Chamada antes da pergunta', text: 'Todo vídeo que vem logo antes de uma decisão termina com a instrutora chamando o aluno ("Agora é com você: …"). A frase fica na decisão ("Chamada:" no roteiro, até 16 palavras) e entra sozinha como último plano do vídeo; não repetir na fala.', source: `${ROT}; packages/course-schema/src/bridge.ts` },
      { id: 'reacao-resposta', title: 'Reação a cada resposta', text: 'Cada opção de decisão tem uma reação falada da instrutora (8 a 26 palavras, 5 a 10 s): acolhe, explica em uma frase, sem julgar nem dar sermão. Toca em vídeo logo depois da escolha, antes de "Sua escolha"; sem a coluna "Reação", o importador deriva do feedback.', source: `${ROT}; packages/course-schema/src/reaction.ts` },
      { id: 'ponte-retomada', title: 'Retomada depois da pergunta', text: 'O vídeo que vem depois de uma decisão começa retomando a pergunta numa frase que serve para qualquer resposta ("Seja qual for a sua escolha, repara…"), sem dizer qual era a certa; nunca "Agora, …" como se nada tivesse acontecido.', source: ROT },
      { id: 'abertura-aula', title: 'Abertura do curso e de cada aula', text: 'O primeiro vídeo abre com "Oi! Eu sou a/o {nome}, sua orientadora/seu orientador neste curso da DNA Work. Hoje, vamos…" e diz o que a pessoa sabe fazer ao final. Cada aula seguinte abre com "Agora, vamos…" (ou "Nesta aula, você vai…"), no presente, derivado do objetivo.', source: `${ROT}; docs/qa/lote/revisao-roteiro.md` },
      { id: 'missao-selo', title: 'Atividade e reconhecimento', text: 'Toda aula com atividade anuncia no começo o que o aluno vai montar ("No fim desta aula, tem uma missão para você: …"); a tela da atividade ("Na prática") confirma quando a resposta é salva. As boas-vindas dizem o que a pessoa sabe fazer ao final e NÃO prometem selo por curso: cada curso concluído é uma conquista dentro da plataforma; o Selo DNA Work é da trilha (todos os cursos concluídos, atividades "Na prática" salvas e checagem final aprovada), com verificação pública e link para o LinkedIn.', source: 'docs/qa/lote/revisao-roteiro.md; decisão do autor em 31/10 (conquista por curso + selo por trilha)' },
      { id: 'realidade-brasileira', title: 'Realidade brasileira e fatos corretos', text: 'Situações, vagas, valores em R$, transporte e bairros reais; personagens fictícios e diversos; na dúvida, não afirmar números. Sem citar marcas, empresas ou pessoas reais.', source: ROT },
      { id: 'importador', title: 'Roteiro em Markdown', text: 'O roteiro segue o formato de docs/prompts/prompt-gpt-roteiro-curso.md e entra pelo importador (packages/db/src/scripts/import-markdown-course.ts) com um kit da biblioteca (--kit), sem IA e sem custo.', source: ROT },
    ],
  },
  fala: {
    name: 'Fala da instrutora',
    rules: [
      { id: 'conversa', title: 'Conversa, não palestra', text: 'Segunda pessoa ("você"), coloquial e correta ("a gente", "então", "vamos por partes"), frases curtas, tom próximo e encorajador.', source: ROT },
      { id: 'tamanho-fala', title: 'Tamanho da fala', text: 'Cenas de situação, explicação ou decisão: 60 a 120 palavras. Consequências: 40 a 90 palavras.', source: DIR },
      { id: 'nao-ler-lista', title: 'Não ler a lista', text: 'As palavras-chave ficam na tela (pílulas/cartões) e são ditas na fala, mas a fala nunca lê a lista do cartão palavra por palavra.', source: `${DIR}; ${ROT}` },
      { id: 'leveza', title: 'Temas sérios com leveza', text: 'Temas importantes (limites, intimidade, correção, redes sociais) com leveza, como a Marina e o Rafael: próximo, sem sermão, sem infantilizar, sem julgar.', source: 'docs/lote-12-cursos.md' },
      { id: 'nao-rotular', title: 'Não rotular', text: 'Nunca chamar o aluno de inseguro ou despreparado nem tirar conclusão sobre personalidade por voz, aparência, sotaque ou timidez.', source: ROT },
    ],
  },
  video: {
    name: 'Linguagem de vídeo',
    rules: [
      { id: 'legendas', title: 'Legendas sempre', text: 'O player nasce com legendas ligadas (caixa escura, texto branco, embaixo); o worker garante o WebVTT em todo vídeo anexado.', source: DIR },
      { id: 'gestos', title: 'Gestos naturais', text: 'Um gesto com as mãos visíveis em todo plano explicativo; nada de contar nos dedos ou sinais com as mãos.', source: DIR },
      { id: 'montagem-nossa', title: 'Direção montada por nós', text: 'Cada plano vira um clipe curto do HeyGen e a montagem (enquadramento, cartões, letreiros, transições) é feita por nós com ffmpeg: editar a montagem não paga de novo.', source: 'docs/decisions.md' },
      { id: 'narracao-unica', title: 'Narração sintetizada uma vez', text: 'A voz da cena é sintetizada uma vez, com tempos por palavra, e cortada por plano: prosódia contínua e um só custo de voz.', source: 'docs/decisions.md' },
      { id: 'movimento', title: 'Cena em movimento só sem fala', text: 'Instrutor andando só como cena em movimento, com a narração por cima e sem leitura labial; é mais caro e cobrado à parte.', source: 'docs/decisions.md' },
    ],
  },
  camera: {
    name: 'Câmeras e estúdio',
    rules: [
      { id: 'kit-por-estudio', title: 'Kit de câmeras por estúdio', text: 'Cada instrutor tem, por estúdio, 3 câmeras geradas NO cenário: esquerda (terço esquerdo), direita (terço direito) e 3/4 (centro, a principal), todas em tela cheia com o fundo do próprio visual.', source: DIR },
      { id: 'zona', title: 'Zona da câmera', text: 'A zona diz onde o instrutor está no quadro; a parede livre fica do lado oposto e recebe pílulas e a pergunta a seguir. Modo de zonas = ao menos uma câmera lateral pronta.', source: DIR },
      { id: 'sentado-full-frame', title: 'Visual sentado em tela cheia', text: 'Visuais sentados à mesa usam posição "tela cheia" (full_frame): o recorte transparente cortaria cadeira e mesa.', source: 'docs/decisions.md' },
      { id: 'balcao', title: 'Cenário com balcão', text: 'Na recepção, a instrutora é montada atrás do balcão: base na linha do tampo e a faixa do balcão por cima; nada "flutua".', source: DIR },
      { id: 'instrutor-novo', title: 'Instrutor novo', text: '1 personagem fictício criado só por texto + 3 câmeras dentro do estúdio (esquerda, direita, 3/4) ≈ 4 créditos HeyGen, pago e aprovado à parte (gerar-instrutor.sh com COURSE_ID, INSTRUTOR, PRONOUN, ESTUDIO). Se as 3 câmeras já estão prontas, nada é gerado. Logo depois, registrar instrutor, voz e kit na biblioteca.', source: 'docs/lote-12-cursos.md' },
      { id: 'kit-remapeia', title: 'Trocar de instrutor sem reimportar', text: 'Aplicar um kit num curso já montado passa os planos da direção para as câmeras do instrutor novo na mesma zona (esquerda→esquerda, direita→direita, 3/4→3/4).', source: 'docs/lote-12-cursos.md' },
      { id: 'pronome', title: 'Pronome certo', text: 'O pronome do instrutor (ela/ele) vai nos pedidos de câmera e nas instruções da IA; confira ao trocar de instrutor.', source: 'packages/course-schema/src/direction.ts' },
    ],
  },
  cartoes: {
    name: 'Cartões e pílulas',
    rules: [
      { id: 'painel-marinho', title: 'Painel de vidro marinho', text: 'Pílulas num painel marinho a 84% com borda branca suave na parede livre: linha laranja "Aula N · título", título branco e pílulas brancas com texto marinho e ícone num círculo laranja.', source: DIR },
      { id: 'limites-cartao', title: 'Limites do cartão', text: 'Título até 8 palavras; 2 a 3 tópicos de até 12 palavras com **palavra-chave** em negrito (1 a 4 palavras, dita na fala). Pílulas: até 4.', source: `${DIR}; ${ROT}` },
      { id: 'tempo-pilula', title: 'Quando a pílula surge', text: 'Cada pílula surge 0,1 s antes da palavra ser dita (mínimo 0,6 s entre elas), com um pop curto e halo laranja na pílula atual.', source: DIR },
      { id: 'cartao-tela-cheia', title: 'Cartão de marca em tela cheia', text: 'Sem apresentador (só áudio, nenhum clipe pago), fundo claro ou marinho com acento laranja; nunca dois cartões seguidos.', source: DIR },
    ],
  },
  marca: {
    name: 'Marca',
    rules: [
      { id: 'sem-slogan', title: 'Nunca inventar slogan', text: 'Não criar slogans nem frases de efeito para a DNA Work. A vinheta aprovada é só a assinatura, sem frase.', source: ROT },
      { id: 'marca-dagua', title: "Marca d'água", text: "Só o logo DNA Work, pequeno, no rodapé direito, opacidade 0,7, nos vídeos montados.", source: 'packages/course-schema/src/course.ts' },
      { id: 'dna-agente', title: 'Papel da DNA Work', text: 'A DNA Work é o agente de integração e oferece as vagas. Nunca citar outros agentes de integração (CIEE, IEL e afins).', source: 'docs/lote-12-cursos.md' },
      { id: 'paleta-video', title: 'Paleta do vídeo', text: 'Duas paletas da marca, alternadas entre cursos (branding.videoPalette): clássica (véu marinho #1D1E4C, destaque laranja #FF7A08) e invertida (véu laranja, título e ícones marinho). O texto escolhe branco ou marinho pelo contraste.', source: 'docs/lote-12-cursos.md' },
      { id: 'wordmark-curto', title: 'Marca do curso curta', text: 'A marca em texto do cabeçalho (wordmark) é curta, de 1 a 3 palavras; o título inteiro do curso ali vira um cabeçalho estranho no player.', source: 'docs/qa/lote/10-terminei-a-tarefa.md' },
      { id: 'cores', title: 'Cores', text: 'Navy #1D1E4C, laranja #FF7A08 e fundo claro #F4F7FA.', source: BRAND },
      { id: 'tom-marca', title: 'Tom', text: 'Direto, informal, "você", frases curtas, promessa de praticidade; menos jargão de plataforma.', source: BRAND },
    ],
  },
  producao: {
    name: 'Produção e publicação',
    rules: [
      { id: 'ordem', title: 'Ordem de um curso', text: 'Roteiro no formato do GPT → importar com --kit (sem vídeo) → revisar as falas novas (abertura, chamadas, missão) e aprovar → orçamento oficial → "aprovo" → gravar → conferir (vídeo, legenda, desatualizado, amostra ouvida) → publicar → matricular.', source: 'docs/lote-12-cursos.md' },
      { id: 'nao-reimportar', title: 'Depois de vídeo pago, não reimportar', text: 'Com vídeo pago, editar o rascunho em vez de reimportar o roteiro: reimportar descarta os vídeos e apaga paleta e marca em texto.', source: 'docs/lote-12-cursos.md' },
      { id: 'republicar', title: 'Republicar move as matrículas', text: 'Ao republicar (ex.: depois de gravar reações), mover as matrículas para a versão nova (publicar-e-matricular.ts) quando aulas e cenas são as mesmas; senão o aluno continua na versão antiga.', source: 'docs/lote-12-cursos.md' },
      { id: 'volume', title: 'Volume igual em tudo', text: 'Todo áudio sai num volume único (−16 LUFS na montagem). Gravações à parte, como as reações, chegaram entre −25,6 e −17,9 LUFS: conferir e normalizar antes de publicar.', source: 'docs/qa/lote/12-correcao-de-postura.md' },
      { id: 'uma-sessao-por-curso', title: 'Lote: uma sessão por curso', text: 'Cada curso do lote tem sua sessão, seu relatório (docs/qa/lote/NN-*.md) e seus scripts (packages/db/src/scripts/lote/). O que precisou ser contornado vira achado do motor, corrigido UMA vez pela sessão principal; a sessão do curso não edita código compartilhado.', source: 'docs/lote-12-cursos.md' },
      { id: 'servidores', title: 'Servidores', text: 'Uma só porta (3010) para todos, cuidada pela sessão principal: ninguém mais para, reinicia ou troca o modo. Modo mídia real só durante a gravação; fora disso, modo demonstração.', source: 'docs/lote-12-cursos.md' },
    ],
  },
  custo: {
    name: 'Custo e aprovação',
    rules: [
      { id: 'aprovacao', title: 'Pago só com aprovação', text: 'Qualquer chamada paga (HeyGen, ElevenLabs, IA) só com aprovação explícita do autor. Sem ALLOW_PAID_PROVIDERS=1 tudo roda em demonstração.', source: COST },
      { id: 'orcamento', title: 'Orçamento antes de produzir', text: 'Vídeos em lote passam por "Calcular orçamento" → "Aprovar e produzir"; cenas com o mesmo hash são reaproveitadas sem custo; há teto diário por workspace.', source: COST },
      { id: 'kit-sem-custo', title: 'Aplicar modelo não custa', text: 'Usar um kit ou peça da biblioteca só copia dados para o rascunho. Gerar câmeras novas de um instrutor num estúdio é um passo pago à parte.', source: 'packages/course-schema/src/library.ts' },
      { id: 'trocar-fundo', title: 'Trocar fundo sem custo', text: 'Cena de plano único com fala já paga pode ser remontada sobre outro fundo sem gerar de novo.', source: DIR },
      { id: 'teto-curso', title: 'Quanto custa um curso', text: 'Meta de até US$ 4 em vídeos por curso (o lote saiu ≈ US$ 3,20 cada), com as perguntas só em texto; chamada nova grava só o plano dela (≈ US$ 0,10) e cada reação ≈ US$ 0,14. Orçamento pedindo só os vídeos (nodeIds). O teto conta as últimas 24 h do workspace.', source: 'docs/lote-12-cursos.md' },
      { id: 'creditos-heygen', title: 'Créditos antes do lote', text: 'Conferir o saldo de créditos de API do HeyGen antes de disparar um lote: ele acabou no meio e o motor só avisa quando falha.', source: 'docs/aderencia-motor-lote.md' },
      { id: 'scripts-pagos', title: 'Scripts pagos no Terminal', text: 'O modo automático bloqueia scripts pagos. Não contornar: passar ao usuário o comando exato para ele rodar no Terminal, depois do orçamento e do "aprovo".', source: 'docs/lote-12-cursos.md' },
      { id: 'segredos', title: 'Chaves', text: 'Nunca imprimir chaves do .env em logs, telas ou mensagens.', source: COST },
    ],
  },
};

export const DEFAULT_KNOWLEDGE: Array<Def<'knowledge'>> = (Object.keys(ENGINE_KNOWLEDGE) as KnowledgeArea[]).map((area) => ({
  kind: 'knowledge' as const,
  key: `regras-${area}`,
  name: ENGINE_KNOWLEDGE[area].name,
  description: `Regras aprendidas na construção dos cursos: ${ENGINE_KNOWLEDGE[area].name.toLowerCase()}.`,
  data: { area, rules: ENGINE_KNOWLEDGE[area].rules },
}));

const ALL_KNOWLEDGE_KEYS = DEFAULT_KNOWLEDGE.map((k) => k.key);

/* ------------------------------------------------------------------ */
/* Alunos de teste (perfis fictícios do público)                        */
/* ------------------------------------------------------------------ */

export const DEFAULT_LEARNERS: Array<Def<'learner'>> = [
  {
    kind: 'learner',
    key: 'aluno-ana-clara',
    name: 'Ana Clara · tímida, primeiro emprego',
    description: 'Busca vaga de Jovem Aprendiz; nunca fez entrevista e trava quando precisa falar ou escrever.',
    data: { name: 'Ana Clara', age: 17, city: 'Belém (PA)', situation: 'Termina o ensino médio e busca a primeira vaga de Jovem Aprendiz; nunca fez entrevista.', audienceProfile: 'first_job', level: 'beginner', traits: ['shy'], device: 'celular', minutesAvailable: 20, readingTolerance: 80, answerStyle: 'cautious', voiceComfort: false },
  },
  {
    kind: 'learner',
    key: 'aluno-diego',
    name: 'Diego · pouco tempo',
    description: 'Trabalha de dia e estuda à noite; faz o curso no ônibus, em pedaços curtos.',
    data: { name: 'Diego', age: 19, city: 'Guarulhos (SP)', situation: 'Trabalha como entregador de dia, estuda à noite e quer um estágio administrativo.', audienceProfile: 'first_job', level: 'beginner', traits: ['low_time'], device: 'celular', minutesAvailable: 10, readingTolerance: 60, answerStyle: 'impulsive', voiceComfort: true },
  },
  {
    kind: 'learner',
    key: 'aluno-beatriz',
    name: 'Beatriz · lê pouco, usa legenda',
    description: 'Tem baixa visão, usa fonte grande e assiste com legenda; textos longos cansam.',
    data: { name: 'Beatriz', age: 20, city: 'Curitiba (PR)', situation: 'Faz curso técnico em administração; tem baixa visão e assiste a tudo com legenda e fonte grande.', audienceProfile: 'first_job', level: 'beginner', traits: ['low_reading', 'accessibility'], device: 'celular', minutesAvailable: 25, readingTolerance: 50, answerStyle: 'mixed', voiceComfort: false },
  },
  {
    kind: 'learner',
    key: 'aluno-kaua',
    name: 'Kauã · mudança de área',
    description: 'Já trabalhou no comércio e quer estágio na faculdade; responde com atenção e tem pouca paciência para o óbvio.',
    data: { name: 'Kauã', age: 22, city: 'Salvador (BA)', situation: 'Trabalhou dois anos no comércio e agora busca estágio em tecnologia na faculdade.', audienceProfile: 'career_change', level: 'intermediate', traits: [], device: 'computador', minutesAvailable: 30, readingTolerance: 140, answerStyle: 'best', voiceComfort: true },
  },
  {
    kind: 'learner',
    key: 'aluno-jessica',
    name: 'Jéssica · já trabalhou',
    description: 'Tem experiência em atendimento e voltou a estudar; quer dicas práticas para a primeira vaga de estágio.',
    data: { name: 'Jéssica', age: 24, city: 'Fortaleza (CE)', situation: 'Trabalhou com atendimento em loja, voltou a estudar e procura o primeiro estágio.', audienceProfile: 'experienced', level: 'intermediate', traits: [], device: 'celular', minutesAvailable: 25, readingTolerance: 100, answerStyle: 'mixed', voiceComfort: true },
  },
];

const ALL_LEARNER_KEYS = DEFAULT_LEARNERS.map((k) => k.key);

/** Kits padrão (as chaves dos instrutores são as do script de extração). */
export const DEFAULT_KITS: Array<Def<'kit'>> = [
  {
    kind: 'kit',
    key: 'estudio7-marina',
    name: 'Estúdio 7 · Marina',
    description: 'Marina no estúdio 7 com zonas (esquerda, direita, 3/4), voz Ana Dias, logo no rodapé e pílulas.',
    data: { studioKey: 'estudio-jovem-7', presenterKey: 'instrutor-marina', voiceKey: 'voz-ana-dias', brandingKey: 'marca-dnawork', directionKey: 'direcao-estudio-zonas', knowledgeKeys: ALL_KNOWLEDGE_KEYS, learnerKeys: ALL_LEARNER_KEYS },
  },
  {
    kind: 'kit',
    key: 'estudio7-rafael',
    name: 'Estúdio 7 · Rafael',
    description: 'Rafael no estúdio 7 com zonas (esquerda, direita, 3/4), voz Gabriel, logo no rodapé e pílulas.',
    data: { studioKey: 'estudio-jovem-7', presenterKey: 'instrutor-rafael', voiceKey: 'voz-gabriel', brandingKey: 'marca-dnawork', directionKey: 'direcao-estudio-zonas', knowledgeKeys: ALL_KNOWLEDGE_KEYS, learnerKeys: ALL_LEARNER_KEYS },
  },
  {
    kind: 'kit',
    key: 'recepcao-marina',
    name: 'Recepção · Marina',
    description: 'Marina na recepção DNA Work com balcão (câmera principal + 3/4 no cenário), voz Ana Dias e painel.',
    data: { studioKey: 'recepcao-dnawork', presenterKey: 'instrutor-marina', voiceKey: 'voz-ana-dias', brandingKey: 'marca-dnawork', directionKey: 'direcao-camera-unica', knowledgeKeys: ALL_KNOWLEDGE_KEYS, learnerKeys: ALL_LEARNER_KEYS },
  },
];

/** Todas as peças padrão (menos instrutores), na ordem de gravação. */
export function defaultLibraryTemplates(): LibraryTemplateInput[] {
  return [...DEFAULT_STUDIOS, RECEPTION_STUDIO, ...DEFAULT_VOICES, DEFAULT_BRANDING, DIRECTION_ZONES, DIRECTION_SINGLE, ...DEFAULT_KNOWLEDGE, ...DEFAULT_LEARNERS, ...DEFAULT_KITS] as LibraryTemplateInput[];
}
