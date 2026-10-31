import { CINEMATIC_MIN_SECONDS_BY_ACTION } from '@lms/course-schema';
/**
 * O que o pipeline de vídeo consegue fazer hoje, e como. Dado simples e
 * editável: a IA diretora recebe este texto em <capacidades> e não deve pedir
 * nada marcado como indisponível. Atualize aqui quando o pipeline mudar
 * (pesquisa de provedor, novo motor, nova etapa de montagem).
 *
 * - native: o provedor de avatar produz (HeyGen)
 * - composited: simulado/montado por nós na edição (ffmpeg)
 * - limited: existe com restrições (ver `note`)
 * - unavailable: não existe; nunca pedir
 */
/** Limites de duração do plano, em palavras (2,6 palavras/s): ≈ 10 s no máximo, ≈ 1,2 s no mínimo (3 palavras, sem exceção quando há mais de um plano). */
export const MAX_SHOT_WORDS = 26;
export const MIN_SHOT_WORDS = 3;
/** Wide prejudica a sincronia labial: no máximo um por cena. */
export const MAX_WIDE_SHOTS_PER_SCENE = 1;
/**
 * Cena em movimento (layout cinematic): a fala vai de ≈ 1,5 s a 15 s (2,6
 * palavras/s) — pode ser mais curta que o movimento, porque a imagem dura pelo
 * menos o mínimo da ação (CINEMATIC_MIN_SECONDS_BY_ACTION) e segue sem fala; no máximo 1 por cena.
 */
export const CINEMATIC_MIN_WORDS = 4;
export const CINEMATIC_MAX_WORDS = 38;
export const MAX_CINEMATIC_PER_SCENE = 1;
export const DEFAULT_MAX_CINEMATIC_PER_LESSON = 2;
/**
 * Cartão de marca em tela cheia (layout card): 5–15 s de fala por cima (2,6
 * palavras/s). O apresentador não aparece, então o limite de 26 palavras do
 * gesto repetido não vale aqui. Nunca dois cartões seguidos.
 */
export const CARD_MIN_WORDS = 13;
export const CARD_MAX_WORDS = 39;
/** Planos com apresentador entre dois cartões, em modo de câmera única: 20–40 s ≈ 52–104 palavras (orientação ao diretor). */
export const PRESENTER_RUN_WORDS = { min: 52, max: 104 } as const;
/** Maior fala que cabe numa cena dirigida (12 planos × 26 palavras); acima disso a cena nem vai ao modelo. */
export const MAX_SHOTS_PER_SCENE_WORDS = 12 * MAX_SHOT_WORDS;

/** Mínimos de imagem por ação, em texto (ex.: "walk_in_and_sit 7 s, …"). */
export function cinematicMinimaText(): string {
  return Object.entries(CINEMATIC_MIN_SECONDS_BY_ACTION).map(([a, n]) => `${a} ${n} s`).join(', ');
}

export type CapabilityMode = 'native' | 'composited' | 'limited' | 'unavailable';

export interface VideoCapability {
  id: string;
  label: string;
  mode: CapabilityMode;
  note: string;
  /** onde a restrição vale (ex.: "nos planos com fala"); aparece junto do rótulo do modo */
  scope?: string;
}

export const VIDEO_CAPABILITIES_VERSION = '2026-10-29.3';

export const VIDEO_CAPABILITIES: readonly VideoCapability[] = [
  {
    id: 'camera_switch',
    label: 'Troca de câmera (ângulo)',
    mode: 'native',
    note: 'O HeyGen não tem parâmetro de ângulo ou enquadramento: cada câmera é um look separado do mesmo apresentador. Trocar de câmera entre planos exige ao menos 2 câmeras no kit; com uma câmera só, o corte é recorte (zoom) digital.',
  },
  {
    id: 'framing',
    label: 'Enquadramento (wide, medium, close, extreme_close)',
    mode: 'composited',
    note: 'Recorte digital a partir do enquadramento nativo da câmera; close e extreme_close perdem nitidez se a câmera nativa já for aberta, então use extreme_close raramente. Wide prejudica a leitura labial (rosto pequeno): só para situar, no máximo 1 por cena e nunca numa fala longa; prefira medium e close para falar. Câmera em tela cheia (posicao "tela cheia"): SEM recorte — o plano é a composição do próprio visual (o cenário, com placas e logos, não pode ser cortado); use o enquadramento nativo dela.',
  },
  {
    id: 'camera_move',
    label: 'Movimento de câmera (push_in, pull_out, pan, drift)',
    mode: 'composited',
    note: 'Movimento digital lento sobre o plano; mantenha sutil. Nunca numa câmera em tela cheia (use static).',
  },
  {
    id: 'slides',
    label: 'Slides, apresentador com slide ao lado e janela (PiP)',
    mode: 'composited',
    note: 'Montados na edição sobre o vídeo do apresentador; a voz continua.',
  },
  {
    id: 'card',
    label: 'Cartão de marca em tela cheia (layout card)',
    mode: 'composited',
    note: `Cartão com a identidade da plataforma (fundo claro ou marinho, acento laranja): título de até 8 palavras e 2–3 tópicos de até 12 palavras com as palavras-chave entre ** (negrito). O apresentador some e a voz continua; nenhum clipe pago. Fala por cima de ${CARD_MIN_WORDS} a ${CARD_MAX_WORDS} palavras (≈ 5–15 s); nunca dois cartões seguidos.`,
  },
  {
    id: 'presenter_panel',
    label: 'Apresentadora + painel (layout presenter_panel; cartão padrão em câmera única)',
    mode: 'composited',
    note: `A apresentadora continua em tela cheia (deslocada à direita, sem zoom) e um painel marinho à esquerda mostra o título (até 8 palavras) e 2–3 tópicos de até 12 palavras com as palavras-chave entre ** (negrito); cada tópico acende quando a palavra-chave é dita, então use nos tópicos as MESMAS palavras-chave da fala. Exige clipe do apresentador (com gesto). Fala por cima de ${CARD_MIN_WORDS} a ${CARD_MAX_WORDS} palavras (≈ 5–15 s); nunca dois cartões seguidos.`,
  },
  {
    id: 'presenter_chips',
    label: 'Apresentadora + pílulas (layout presenter_chips; só no estúdio com zonas)',
    mode: 'composited',
    note: `Só quando o kit tem câmeras com zona (atributo zona em <cameras>): a câmera de zona já deixa a parede livre do lado oposto à apresentadora; o vídeo entra SEM zoom nem deslocamento e um painel de vidro marinho na parede livre mostra o título (até 8 palavras) e 2–4 pílulas — a parte em ** (negrito) de cada tópico, até 4 palavras — que surgem quando a palavra-chave é dita (use nos tópicos as MESMAS palavras-chave da fala, na ordem). Use numa câmera de zona esquerda ou direita (nunca na 3/4 centralizada) e alterne o lado a cada plano de pílulas. Fala por cima de ${CARD_MIN_WORDS} a ${CARD_MAX_WORDS} palavras (≈ 5–15 s); nunca dois cartões seguidos.`,
  },
  {
    id: 'lower_third',
    label: 'Letreiro (lower third)',
    mode: 'composited',
    note: 'Texto curto na parte de baixo da tela (até 80 caracteres).',
  },
  {
    id: 'transitions',
    label: 'Transições (cut, crossfade, whip, dip_to_color)',
    mode: 'composited',
    note: 'Aplicadas na montagem entre planos.',
  },
  {
    id: 'walking',
    label: 'Andar, levantar, mudar de posição ou sair do quadro',
    mode: 'unavailable',
    scope: 'nos planos com fala',
    note: 'O apresentador com sincronia labial (todos os layouts, exceto cinematic) fica sempre no mesmo lugar. Nunca peça para andar, levantar ou se deslocar enquanto ele fala; se o autor pedir movimento, traduza em movimentos de câmera, mudanças de enquadramento e gestos, ou, numa fala que narra uma situação, use uma cena em movimento (cinematic).',
  },
  {
    id: 'cinematic_walk',
    label: 'Cena em movimento (layout cinematic)',
    mode: 'limited',
    note: `Cena em movimento: o apresentador caminha/age sem falar enquanto a narração toca por cima; fala de ${CINEMATIC_MIN_WORDS} a ${CINEMATIC_MAX_WORDS} palavras (≈ 1,5–15 s); a imagem dura pelo menos o mínimo da ação (${cinematicMinimaText()}) e pode ser mais longa que a fala; o lugar dela vira o fundo dos outros planos da cena; cobrada à parte e mais cara; sem leitura labial. cinematic.prompt descreve só o LUGAR, em inglês (ambiente, luz, objetos que a ação usa); a ação vem de cinematic.action e a câmera e o ritmo são definidos pelo sistema para cada ação. No máximo ${MAX_CINEMATIC_PER_SCENE} por cena e o limite por aula de <estilo>.`,
  },
  {
    id: 'gestures',
    label: 'Gestos e emoção (motionPrompt)',
    mode: 'limited',
    note: 'O motionPrompt vale em photo avatars (motores avatar_iv e avatar_v) e, em video avatars, só no avatar_v. O movimento pedido dura cerca de 10 s e depois se repete: um gesto por plano, planos curtos, e nunca o mesmo gesto em dois planos seguidos. Gestos com dedos, sinais com a mão e acenos saem errados: nunca use. Em photo avatars os gestos de mão são limitados: prefira cabeça, olhar, expressão e mãos próximas do corpo.',
  },
  {
    id: 'props',
    label: 'Objetos, mudança de luz ou de cenário, outras pessoas em cena',
    mode: 'unavailable',
    scope: 'nos planos com fala',
    note: 'Fundo e luz são fixos por vídeo; não há outros personagens nem objetos manipulados. Para mostrar algo, use um slide. Na cena em movimento o lugar pode ter objetos (porta, mesa, cadeira, notebook), mas nunca outras pessoas.',
  },
  {
    id: 'shot_length',
    label: 'Duração do plano',
    mode: 'limited',
    note: `Cada plano entre ${MIN_SHOT_WORDS} e ${MAX_SHOT_WORDS} palavras (≈ 1,2 s a 10 s a 2,6 palavras/s); mínimo ${MIN_SHOT_WORDS} palavras por plano quando há mais de um plano, sem exceção. O limite de 10 s vem do gesto que se repete; abaixo disso o corte fica brusco.`,
  },
];

const MODE_LABEL: Record<CapabilityMode, string> = {
  native: 'nativo',
  composited: 'montado na edição',
  limited: 'limitado',
  unavailable: 'INDISPONÍVEL',
};

/** Texto de <capacidades> para o prompt, ajustado ao kit do curso. */
export function videoCapabilitiesText(ctx: { cameraCount: number; avatarType?: string | null; maxCinematicPerLesson?: number; voiceProvider?: string | null; /** `single` = só a câmera principal nos planos com apresentador */ cameraMode?: 'single' | 'multi'; /** estúdio com zonas (câmeras com zona no kit) */ zones?: boolean } = { cameraCount: 0 }): string {
  // a cena em movimento é muda: exige narração própria (ElevenLabs) e limite por aula > 0
  const cinematicOff = (ctx.maxCinematicPerLesson ?? DEFAULT_MAX_CINEMATIC_PER_LESSON) <= 0 || ctx.voiceProvider === 'heygen';
  const lines = VIDEO_CAPABILITIES.filter((c) => c.id !== 'presenter_chips' || ctx.zones).map((c) => (c.id === 'cinematic_walk' && cinematicOff
    ? `- ${c.label} [${MODE_LABEL.unavailable}]: desligada neste curso (${ctx.voiceProvider === 'heygen' ? 'a voz do HeyGen não toca por cima do vídeo; para usar, troque para uma voz do ElevenLabs na apresentação' : 'limite por aula = 0'}); nunca use o layout cinematic.`
    : `- ${c.label} [${MODE_LABEL[c.mode]}${c.scope ? ` (${c.scope})` : ''}]: ${c.note}`));
  const kit = ctx.zones
    ? 'ESTÚDIO COM ZONAS: as câmeras com zona (atributo zona em <cameras>) são planos do mesmo estúdio — a 3/4 centralizada para conversar e as laterais (apresentadora à esquerda ou à direita, parede livre do outro lado) para as pílulas; trocar entre elas só entre frases, nunca no meio de uma. As listas, regras e definições viram presenter_chips numa câmera lateral, alternando o lado; sem zoom nem movimento digital (tela cheia).'
    : ctx.cameraMode === 'single'
    ? `Modo de câmera ÚNICA: todos os planos com apresentador usam a câmera principal (sem troca de ângulo${ctx.cameraCount >= 2 ? `, mesmo com ${ctx.cameraCount} câmeras no kit` : ''}); o ritmo vem dos cartões (layout presenter_panel: a apresentadora com o painel de tópicos; o card em tela cheia continua disponível) e dos gestos.`
    : ctx.cameraCount >= 2 ? `Este curso tem ${ctx.cameraCount} câmeras: troca de câmera disponível.` : 'Este curso tem uma câmera só (ou nenhuma cadastrada): cortes são zoom digital; varie o enquadramento mesmo assim.';
  const avatar = ctx.avatarType ? `Tipo de avatar: ${ctx.avatarType}${ctx.avatarType === 'photo_avatar' ? ' (gestos de mão limitados).' : '.'}` : 'Tipo de avatar: não informado (assuma photo_avatar: gestos de mão limitados).';
  return [...lines, kit, avatar].join('\n');
}
