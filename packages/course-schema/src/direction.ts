import { z } from 'zod';

/**
 * Direção cinematográfica de uma cena: uma lista de planos (shots) que cobrem
 * a fala do apresentador em ordem. É independente do provedor: o worker
 * transforma cada plano em clipes (HeyGen por look/câmera) e monta o resultado
 * (ffmpeg) com enquadramentos, slides, letreiros e transições.
 */
export const FRAMINGS = ['wide', 'medium', 'close', 'extreme_close'] as const;
export const FramingSchema = z.enum(FRAMINGS);

export const LAYOUTS = [
  'presenter', // apresentador em tela cheia
  'presenter_slide_right', // apresentador à esquerda, slide à direita
  'presenter_slide_left', // slide à esquerda, apresentador à direita
  'slide_with_pip', // slide em tela cheia, apresentador em janela no canto
  'slide', // só o slide (voz continua)
  'lower_third', // apresentador com letreiro na parte de baixo
  'cinematic', // cena em movimento: o apresentador caminha/age SEM falar; a narração toca por cima (HeyGen cinematic_avatar)
  'card', // cartão de marca em tela cheia (título + 2–3 tópicos com palavras-chave em negrito); sem apresentador, a voz continua
  'presenter_panel', // apresentadora em tela cheia (deslocada à direita) + painel marinho à esquerda com título e 2–3 tópicos que acendem quando ditos (cartão padrão em câmera única)
  'presenter_chips', // estúdio com zonas: apresentadora em tela cheia SEM transformação (câmera de zona) + painel de vidro marinho na parede livre com título e 2–4 palavras-chave em pílulas que surgem quando ditas
] as const;
export const LayoutSchema = z.enum(LAYOUTS);

/** Variantes do cartão de marca (layout `card`): fundo claro ou marinho, sempre com o acento da marca. */
export const SLIDE_VARIANTS = ['light', 'navy'] as const;
export type SlideVariant = (typeof SLIDE_VARIANTS)[number];

/** Layouts de cartão (título + 2–3 tópicos com `**negrito**`, limites de CARD_LIMITS; pílulas: até 4): o cartão em tela cheia, a apresentadora com painel e a apresentadora com pílulas (estúdio com zonas). */
export const CARD_LAYOUTS = ['card', 'presenter_panel', 'presenter_chips'] as const;
export function isCardLayout(layout: string | undefined | null): boolean {
  return layout === 'card' || layout === 'presenter_panel' || layout === 'presenter_chips';
}

/* ------------------------------------------------------------------ */
/* Estúdio com zonas                                                    */
/* ------------------------------------------------------------------ */

/**
 * Zona da câmera (`Camera.zone`): ONDE a apresentadora está no quadro do
 * próprio visual (a parede livre fica do lado oposto). Câmeras de zona são
 * `full_frame` (o cenário do visual é o plano). `center` = 3/4 centralizada.
 */
export const CAMERA_ZONES = ['left', 'right', 'center'] as const;
export type CameraZone = (typeof CAMERA_ZONES)[number];
export const CAMERA_ZONE_LABELS: Record<CameraZone, string> = {
  left: 'Apresentadora à esquerda',
  right: 'Apresentadora à direita',
  center: 'Apresentadora ao centro',
};

/** Lado da parede livre (onde vão pílulas e pergunta): o oposto da apresentadora; centro/sem zona = direita. */
export function freeSideOf(zone: CameraZone | null | undefined): 'left' | 'right' {
  return zone === 'right' ? 'left' : 'right';
}

/** Pílulas (`presenter_chips`): até 4 pílulas de até 4 palavras (o rótulo é a parte em negrito do tópico). */
export const CHIPS_LIMITS = { chips: 4, labelWords: 4 } as const;

/**
 * Rótulo da pílula a partir do tópico: o PRIMEIRO trecho em `**negrito**`
 * (sem negrito, o tópico inteiro), sem pontuação final, até 4 palavras, com
 * inicial maiúscula ("Ajudar no **negócio da família**" → "Negócio da família").
 */
export function chipLabel(bullet: string): string {
  const bold = /\*\*([^*]+?)\*\*/.exec(bullet)?.[1];
  const base = (bold ?? stripBold(bullet)).replace(/\s+/g, ' ').trim().replace(/[.,;:!?…]+$/u, '');
  const words = base.split(' ').filter(Boolean).slice(0, CHIPS_LIMITS.labelWords).join(' ').replace(/[.,;:!?…]+$/u, '');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/** Câmeras de zona prontas do kit (por zona; a primeira de cada). */
export interface ZoneCameraSet {
  left?: string;
  right?: string;
  center?: string;
}

/**
 * Câmeras de zona do kit: só as PRONTAS (com look) que têm `zone`. Modo
 * "estúdio com zonas" = há ao menos uma câmera de zona lateral (esquerda ou
 * direita); sem ela devolve null e tudo segue como antes (`presenter_panel`).
 */
export function zoneCamerasOf(cameras: ReadonlyArray<Pick<Camera, 'id'> & Partial<Pick<Camera, 'zone' | 'status' | 'lookId'>>> | null | undefined): ZoneCameraSet | null {
  const out: ZoneCameraSet = {};
  for (const c of cameras ?? []) {
    if (!c.zone || (c.status ?? 'ready') !== 'ready' || (c.lookId !== undefined && !c.lookId)) continue;
    if (!out[c.zone]) out[c.zone] = c.id;
  }
  return out.left || out.right ? out : null;
}

/** Zona da câmera do plano (cameraId ausente = a principal, a primeira do kit). */
export function cameraZoneOf(cameras: ReadonlyArray<Pick<Camera, 'id'> & Partial<Pick<Camera, 'zone'>>> | null | undefined, cameraId: string | null | undefined): CameraZone | undefined {
  const list = cameras ?? [];
  const cam = cameraId ? list.find((c) => c.id === cameraId) : list[0];
  return cam?.zone;
}

/**
 * Câmera de FALA da cena `sceneIndex` (ordem das cenas narradas da aula) no
 * estúdio com zonas: com câmera 3/4 (centro), ela nas cenas pares e as zonas
 * alternando nas ímpares (esquerda, depois direita); sem 3/4, alterna
 * esquerda/direita a cada cena.
 */
export function zoneTalkCamera(z: ZoneCameraSet, sceneIndex: number): string {
  const sides = [z.left, z.right].filter((x): x is string => !!x);
  if (z.center) return sceneIndex % 2 === 0 ? z.center : sides[Math.floor(sceneIndex / 2) % sides.length]!;
  return sides[sceneIndex % sides.length]!;
}

/**
 * Câmera do próximo plano de pílulas: a zona OPOSTA à do plano de pílulas
 * anterior (nunca dois seguidos do mesmo lado); sem anterior, a apresentadora
 * à esquerda (pílulas à direita). Só há um lado no kit = esse lado.
 */
export function nextChipsCamera(z: ZoneCameraSet, previous: 'left' | 'right' | undefined): { zone: 'left' | 'right'; cameraId: string } {
  const want: 'left' | 'right' = previous === 'left' ? 'right' : 'left';
  const zone: 'left' | 'right' = z[want] ? want : want === 'left' ? 'right' : 'left';
  return { zone, cameraId: z[zone]! };
}

/**
 * Ícones de linha dos tópicos do painel (`presenter_panel`). A escolha
 * automática é por palavra-chave em pt-BR (`panelIconFor`); `slide.icons[i]`
 * fixa o ícone do tópico i.
 */
export const PANEL_ICONS = ['house', 'calendar', 'heart', 'book', 'briefcase', 'users', 'message', 'message-circle', 'phone', 'clock', 'map-pin', 'search', 'star', 'check', 'file', 'user-circle'] as const;
export type PanelIcon = (typeof PANEL_ICONS)[number];

const PANEL_ICON_RULES: Array<[RegExp, PanelIcon]> = [
  [/fam[ií]lia|neg[oó]cio|casa|\blar\b/i, 'house'],
  [/evento|escola|agenda|data|calend/i, 'calendar'],
  [/volunt|esporte|cuidad|ajuda ao/i, 'heart'],
  [/curr[ií]culo|documento|arquivo|formul/i, 'file'],
  [/curso|estud|leitura|livro|aprend/i, 'book'],
  [/vaga|emprego|trabalho|empresa|carreira|est[aá]gio/i, 'briefcase'],
  [/grupo|equipe|time|turma|colega|pessoas/i, 'users'],
  [/entrevista|conversa/i, 'message-circle'],
  [/mensagem|e-?mail|whats|redes/i, 'message'],
  [/telefone|liga[çc]|celular/i, 'phone'],
  [/hor[aá]rio|pontual|minutos|hora|tempo/i, 'clock'],
  [/local|endere[çc]o|bairro|caminho|lugar/i, 'map-pin'],
  [/pesquis|procur|busca/i, 'search'],
  [/perfil|voc[eê] mesm|identidade/i, 'user-circle'],
  [/destaque|conquista|resultado|melhor/i, 'star'],
];

/** Ícone do tópico: o explícito, senão o da primeira regra que casa (negrito primeiro), senão `check`. */
export function panelIconFor(bullet: string, explicit?: string | null): PanelIcon {
  if (explicit && (PANEL_ICONS as readonly string[]).includes(explicit)) return explicit as PanelIcon;
  const bold = [...bullet.matchAll(/\*\*([^*]+?)\*\*/g)].map((m) => m[1]!).join(' ');
  for (const text of [bold, bullet]) {
    if (!text) continue;
    for (const [re, icon] of PANEL_ICON_RULES) if (re.test(text)) return icon;
  }
  return 'check';
}

/** Limites do cartão de marca: título curto (≤ 8 palavras), 2–3 tópicos de até 12 palavras. */
export const CARD_LIMITS = { titleWords: 8, bullets: 3, bulletWords: 12 } as const;

/**
 * Marcação `**negrito**` nos tópicos dos cartões: segmentos em ordem, com
 * `bold` nas palavras-chave. Sem marcação = um segmento normal.
 */
export function boldSegments(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*([^*]+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index!;
    if (i > last) out.push({ text: text.slice(last, i), bold: false });
    out.push({ text: m[1]!, bold: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.filter((s) => s.text.length > 0);
}

/** Texto sem a marcação `**` (para contagens, legendas e leitores de tela). */
export function stripBold(text: string): string {
  return text.replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/\*\*/g, '');
}

export const CAMERA_MOVES = ['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'drift'] as const;
export const CameraMoveSchema = z.enum(CAMERA_MOVES);

export const TRANSITIONS = ['cut', 'crossfade', 'whip', 'dip_to_color'] as const;
export const TransitionSchema = z.enum(TRANSITIONS);

export const SlideSchema = z.object({
  /** título curto do slide */
  title: z.string().max(80).default(''),
  /** até 4 tópicos curtos (no cartão de marca: 2–3, com `**palavra-chave**` em negrito) */
  bullets: z.array(z.string().max(90)).max(4).default([]),
  /** destaque grande (ex.: uma pergunta, um número escrito por extenso, uma frase-chave) */
  highlight: z.string().max(120).optional(),
  /** imagem opcional do workspace */
  imageAssetId: z.string().max(64).optional(),
  /** tema visual do slide */
  style: z.enum(['clean', 'bold', 'quote', 'checklist']).default('clean'),
  /** variante do cartão de marca (layout `card`): claro ou marinho; ausente = alterna por cena */
  variant: z.enum(SLIDE_VARIANTS).optional(),
  /** painel (`presenter_panel`): ícone de cada tópico (mesma ordem; null/ausente = automático por palavra-chave) */
  icons: z.array(z.enum(PANEL_ICONS).nullable()).max(4).optional(),
  /** painel: linha de cima (ex.: "Aula 1 · Título da aula"); ausente = a aula do vídeo */
  eyebrow: z.string().max(90).optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

/**
 * Cena em movimento (layout `cinematic`): vídeo gerado por prompt (HeyGen
 * `cinematic_avatar`) em que o apresentador caminha ou age em silêncio, boca
 * fechada; a narração do plano (ElevenLabs) toca por cima como voz em off.
 * Sem leitura labial: só para falas que narram uma situação, nunca para falas
 * que ensinam ou perguntam ao aluno. 4–15 s; cobrada à parte e mais cara.
 */
/**
 * Ações de uma cena em movimento. Cada uma vira um pedido ASSERTIVO para o
 * modelo cinematográfico: verbo de movimento explícito, início e fim, número de
 * passos, corpo inteiro visível e câmera acompanhando (ver buildCinematicPrompt).
 */
export const CINEMATIC_ACTIONS = ['walk_toward_camera', 'walk_across', 'walk_away', 'walk_in_and_sit', 'walk_and_look_around'] as const;
export type CinematicAction = (typeof CINEMATIC_ACTIONS)[number];
export const CINEMATIC_ACTION_LABELS: Record<CinematicAction, string> = {
  walk_toward_camera: 'Caminha em direção à câmera',
  walk_across: 'Atravessa o quadro caminhando',
  walk_away: 'Caminha se afastando (câmera atrás)',
  walk_in_and_sit: 'Entra caminhando e se senta',
  walk_and_look_around: 'Caminha observando o lugar',
};

/** Pronome do apresentador (gênero) usado nos pedidos em inglês e nas instruções. */
export const PRESENTER_PRONOUNS = ['she', 'he', 'they'] as const;
export const PresenterPronounSchema = z.enum(PRESENTER_PRONOUNS);
export type PresenterPronoun = (typeof PRESENTER_PRONOUNS)[number];
export const PRESENTER_PRONOUN_LABELS: Record<PresenterPronoun, string> = { she: 'Ela', he: 'Ele', they: 'Neutro' };

/**
 * Formas em inglês. Em "they" o sujeito é "the presenter" (singular, para os
 * verbos concordarem) e o possessivo é "their".
 */
export function presenterWords(p: PresenterPronoun = 'she'): { subj: string; Subj: string; obj: string; poss: string } {
  if (p === 'he') return { subj: 'he', Subj: 'He', obj: 'him', poss: 'his' };
  if (p === 'they') return { subj: 'the presenter', Subj: 'The presenter', obj: 'them', poss: 'their' };
  return { subj: 'she', Subj: 'She', obj: 'her', poss: 'her' };
}

/** Rótulo pt-BR neutro ou pelo pronome ("a apresentadora", "o apresentador", "a pessoa apresentadora"). */
export function presenterLabelPt(p: PresenterPronoun = 'she'): string {
  return p === 'he' ? 'o apresentador' : p === 'they' ? 'a pessoa apresentadora' : 'a apresentadora';
}

/**
 * Versão do texto gerado por `buildCinematicPrompt`. Mudar o texto muda a
 * chave de reaproveitamento das cenas em movimento (uma nova renderização);
 * suba a versão sempre que o pedido mudar.
 */
export const CINEMATIC_PROMPT_VERSION = '2026-10-24.1';

type W = ReturnType<typeof presenterWords>;

/**
 * Especificação por ação. Todas abrem no lugar VAZIO no primeiro segundo (esse
 * quadro vira o fundo dos outros planos da cena e nunca contém o apresentador);
 * câmera, enquadramento e ritmo ficam dentro de cada ação (nenhuma linha
 * compartilhada os contradiz).
 */
const ACTION_SPEC: Record<CinematicAction, {
  verb: (w: W) => string;
  /** o que acontece depois do primeiro segundo vazio */
  entrance: (w: W) => string;
  end: (w: W) => string;
  camera: (w: W) => string;
  pace: string;
  /** fração do tempo (depois do segundo vazio) caminhando; o resto é a ação final */
  walking: number;
}> = {
  walk_toward_camera: {
    verb: () => 'WALKS STRAIGHT TOWARD THE CAMERA',
    entrance: (w) => `${w.subj} steps into view at the far end of the space and walks straight toward the camera`,
    end: (w) => `${w.subj} stops a few steps from the camera and glances at the lens, lips closed`,
    camera: (w) => `static camera at eye level, locked off, no camera movement; ${w.subj} grows larger in the frame while approaching; full body visible from head to feet while walking`,
    pace: 'calm, steady walking pace',
    walking: 1,
  },
  walk_across: {
    verb: () => 'WALKS ACROSS THE FRAME FROM LEFT TO RIGHT',
    entrance: (w) => `${w.subj} steps into view from the left edge of the frame, already walking`,
    end: (w) => `${w.subj} reaches the right third of the frame, still walking`,
    camera: (w) => `static wide camera at eye level, locked off, showing ${w.poss} whole path from left to right; side profile view, full body visible from head to feet`,
    pace: 'steady walking pace',
    walking: 1,
  },
  walk_away: {
    verb: () => 'WALKS AWAY FROM THE CAMERA DOWN THE SPACE',
    entrance: (w) => `${w.subj} steps in from behind the camera, back to the lens, and walks away down the space`,
    end: (w) => `${w.subj} reaches the door at the far end and puts ${w.poss} hand on the handle`,
    camera: (w) => `static camera at shoulder height, locked off, looking down the space; ${w.subj} gets smaller in the frame while walking away; full body visible from head to feet`,
    pace: 'calm, steady walking pace',
    walking: 1,
  },
  walk_in_and_sit: {
    verb: () => 'WALKS INTO THE FRAME AND SITS DOWN AT THE DESK',
    entrance: (w) => `${w.subj} steps into view from the right side of the frame and walks to the desk; the chair is already pulled out`,
    end: (w) => `${w.subj} sits down on the chair at the desk, hands on the table, looking at the laptop, and stays seated, still, lips closed for the last second`,
    camera: () => 'static medium-wide camera at eye level, locked off, with the desk and the chair fully visible the whole time',
    pace: 'calm walking pace',
    walking: 0.5,
  },
  walk_and_look_around: {
    verb: () => 'WALKS SLOWLY THROUGH THE SPACE, LOOKING AROUND',
    entrance: (w) => `${w.subj} steps into view at the side of the frame, walking slowly and looking around the place`,
    end: (w) => `${w.subj} pauses, relaxed, lips closed`,
    camera: (w) => `slow lateral tracking shot alongside ${w.obj} at eye level, gentle and smooth; full body visible from head to feet`,
    pace: 'calm, slow walking pace',
    walking: 1,
  },
};

/** Abertura comum: o primeiro segundo mostra o lugar vazio. */
export const CINEMATIC_EMPTY_OPENING = 'The shot opens on the EMPTY setting for the first second (no person anywhere in frame)';

/**
 * Tempo MÍNIMO de imagem por ação (s): o movimento precisa caber inteiro (o
 * segundo vazio + entrar E sentar, por exemplo). A fala pode ser mais curta: a
 * imagem segue sem narração.
 */
export const CINEMATIC_MIN_SECONDS_BY_ACTION: Record<CinematicAction, number> = {
  walk_in_and_sit: 8,
  walk_toward_camera: 6,
  walk_away: 6,
  walk_across: 5,
  walk_and_look_around: 5,
};

/**
 * Duração pedida à cena em movimento: o maior entre o mínimo da ação e o
 * trecho da narração + 0,5 s (arredondado para cima), dentro de 4–15 s.
 */
export function cinematicClipSeconds(action: CinematicAction | undefined, narrationSeconds: number): number {
  const min = CINEMATIC_MIN_SECONDS_BY_ACTION[action ?? 'walk_across'];
  const speech = Number.isFinite(narrationSeconds) ? Math.ceil(Math.max(0, narrationSeconds) + 0.5) : 0;
  return Math.min(15, Math.max(4, Math.max(min, speech)));
}

/** Passos aproximados para `walkingSeconds` de caminhada (≈ 1,6 passo/s), entre 3 e 20. */
export function cinematicSteps(walkingSeconds: number): number {
  return Math.max(3, Math.min(20, Math.round(walkingSeconds * 1.6)));
}

/**
 * Monta o pedido final, assertivo, para a cena em movimento. `details` é o que
 * o autor/IA descreve do lugar (em inglês: ambiente, luz, objetos). A ação vem
 * primeiro e em maiúsculas; o primeiro segundo mostra o lugar VAZIO (é desse
 * quadro que sai o fundo dos outros planos da cena); a caminhada ocupa o resto
 * (≈ N passos); câmera, enquadramento e ritmo são os da ação.
 */
export function buildCinematicPrompt(args: { action?: CinematicAction; details: string; durationSeconds: number; pronoun?: PresenterPronoun }): string {
  const action = args.action ?? 'walk_across';
  const a = ACTION_SPEC[action];
  const w = presenterWords(args.pronoun);
  const d = Math.max(4, Math.min(15, Math.round(args.durationSeconds)));
  const walkingSeconds = Math.max(1, (d - 1) * a.walking);
  const steps = cinematicSteps(walkingSeconds);
  const walkS = Math.round(walkingSeconds);
  const details = args.details.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
  return [
    `MAIN ACTION (the whole ${d} seconds): the presenter ${a.verb(w)}.`,
    `Start: ${CINEMATIC_EMPTY_OPENING}; then ${a.entrance(w)}.`,
    `Walking: about ${steps} steps in about ${walkS} second${walkS === 1 ? '' : 's'}, ${a.pace}, feet and legs in frame, natural arm swing; once in view, ${w.subj} never stands still for more than one second until the final moment.`,
    `End: ${a.end(w)}.`,
    details ? `Setting: ${details}.` : '',
    `Camera: ${a.camera(w)}; one continuous shot, no cuts.`,
    'Style: photorealistic, natural light, realistic human motion and physics.',
  ].filter(Boolean).join(' ');
}

export const CinematicSchema = z.object({
  /** ação de movimento (vira o pedido assertivo); sem ela, "atravessa o quadro" */
  action: z.enum(CINEMATIC_ACTIONS).optional(),
  /**
   * detalhes do lugar em INGLÊS (ambiente, luz, objetos); a ação e a câmera vêm
   * de `action` via buildCinematicPrompt. O apresentador não fala.
   * Pode ficar vazio no rascunho (autor editando); o worker e a IA exigem preenchido.
   */
  prompt: z.string().max(600).default(''),
  /** rótulo pt-BR para o autor (ex.: "Chegando ao prédio da empresa") */
  setting: z.string().max(200).optional(),
});
export type Cinematic = z.infer<typeof CinematicSchema>;

/** Id de plano: curto, só letras, dígitos, _ e - (ids antigos são normalizados no parse da direção). */
export const SHOT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export const ShotSchema = z.object({
  id: z.string().regex(SHOT_ID_RE),
  /** trecho EXATO da fala coberto por este plano (concatenar todos os trechos = narration) */
  line: z.string().min(1).max(1200),
  /** câmera do kit (id); ausente = câmera principal */
  cameraId: z.string().max(40).optional(),
  framing: FramingSchema.default('medium'),
  layout: LayoutSchema.default('presenter'),
  cameraMove: CameraMoveSchema.default('static'),
  /** gesto/emoção do apresentador neste plano (HeyGen motion_prompt, em inglês) */
  motionPrompt: z.string().max(200).optional(),
  slide: SlideSchema.optional(),
  /** letreiro (lower third) */
  caption: z.string().max(80).optional(),
  transitionIn: TransitionSchema.default('cut'),
  /** obrigatório no layout `cinematic` (ignorado nos demais) */
  cinematic: CinematicSchema.optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

/** Plano de cena em movimento (layout `cinematic` com pedido de câmera preenchido). */
export function shotIsCinematic(shot: Pick<Shot, 'layout'> & { cinematic?: { prompt?: string } | null }): boolean {
  return shot.layout === 'cinematic' && !!shot.cinematic?.prompt?.trim();
}

/** Limites da cena em movimento (HeyGen cinematic_avatar aceita 4–15 s). */
export const CINEMATIC_MIN_SECONDS = 4;
export const CINEMATIC_MAX_SECONDS = 15;

/**
 * Normaliza ids de plano antes da validação (rascunhos antigos continuam
 * legíveis): caracteres fora de [A-Za-z0-9_-] viram "_", vazios viram "sN" e
 * repetidos ganham sufixo "_2", "_3"…
 */
function normalizeShotIds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { shots?: unknown }).shots)) return raw;
  const r = raw as { shots: unknown[] };
  const seen = new Set<string>();
  let changed = false;
  const shots = r.shots.map((shot, i) => {
    if (!shot || typeof shot !== 'object') return shot;
    const orig = (shot as { id?: unknown }).id;
    let id = typeof orig === 'string' ? orig.trim().replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) : '';
    if (!id) id = `s${i + 1}`;
    let unique = id;
    for (let k = 2; seen.has(unique); k++) unique = `${id.slice(0, 40 - String(k).length - 1)}_${k}`;
    seen.add(unique);
    if (unique === orig) return shot;
    changed = true;
    return { ...(shot as object), id: unique };
  });
  return changed ? { ...r, shots } : raw;
}

export const SceneDirectionSchema = z.preprocess(
  normalizeShotIds,
  z
    .object({
      version: z.literal(1).default(1),
      shots: z.array(ShotSchema).min(1).max(12),
      /** nota curta do diretor: intenção da cena (para revisão humana) */
      intent: z.string().max(300).default(''),
      /** quem definiu: IA (proposta aprovada) ou autor */
      source: z.enum(['ai', 'author']).default('author'),
    })
    .superRefine((d, ctx) => {
      const seen = new Set<string>();
      d.shots.forEach((s, i) => {
        if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['shots', i, 'id'], message: `id de plano repetido: ${s.id}` });
        seen.add(s.id);
      });
    }),
);
export type SceneDirection = z.infer<typeof SceneDirectionSchema>;

/**
 * Kit de câmeras do curso: cada câmera é um visual (look) do mesmo apresentador
 * no provedor — trocar de câmera entre planos = trocar de look. Quando há só uma
 * câmera, cortes e enquadramentos são simulados por zoom digital na montagem.
 */
/** Posição por câmera: `inherit` = a do curso; `full_frame` = tela cheia com o fundo do próprio visual. */
export const CAMERA_PLACEMENTS = ['inherit', 'center', 'right', 'left', 'full_frame'] as const;
export type CameraPlacement = (typeof CAMERA_PLACEMENTS)[number];
export const CAMERA_PLACEMENT_LABELS: Record<CameraPlacement, string> = {
  inherit: 'Igual ao curso',
  center: 'Centro',
  right: 'Direita',
  left: 'Esquerda',
  full_frame: 'Tela cheia (fundo do próprio visual)',
};

export const CameraSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(60),
  /** id do look no HeyGen */
  lookId: z.string().max(120),
  previewUrl: z.string().max(1000).optional(),
  /** enquadramento nativo do look (o zoom digital parte dele) */
  nativeFraming: FramingSchema.default('medium'),
  /** ângulo descritivo para a IA diretora */
  angle: z.enum(['front', 'left', 'right', 'high', 'low']).default('front'),
  /** câmera gerada por IA (HeyGen POST /v3/avatars type prompt): fica 'generating' até o look existir */
  status: z.enum(['ready', 'generating', 'failed']).default('ready'),
  /** id da geração no HeyGen, persistido no rascunho para nunca perder um resultado pago */
  generationId: z.string().max(120).optional(),
  /** pedido de câmera usado na geração (ex.: "plano fechado, perfil à esquerda") */
  generationPrompt: z.string().max(1000).optional(),
  /** look de origem da geração */
  sourceLookId: z.string().max(120).optional(),
  generationError: z.string().max(500).optional(),
  /**
   * posição da pessoa apresentadora quando o plano usa esta câmera. Ausente ou
   * `inherit` = a do curso (`presentation.presenterPlacement`). `full_frame` =
   * o vídeo do look em tela cheia com o PRÓPRIO fundo (sem transparência, sem
   * fundo do curso por cima) — para visuais sentados à mesa, que perderiam a
   * cadeira e a mesa no recorte.
   */
  placement: z.enum(CAMERA_PLACEMENTS).optional(),
  /** altura relativa ao quadro (só direita/esquerda); ausente = a do curso */
  scale: z.number().min(0.5).max(1.2).optional(),
  /** centro horizontal próprio (fração da largura; só direita/esquerda); ausente = o do curso */
  x: z.number().min(0.15).max(0.85).optional(),
  /** base do recorte própria (fração da altura; só direita/esquerda); ausente = a do curso */
  bottom: z.number().min(0.5).max(1).optional(),
  /**
   * estúdio com zonas: ONDE a apresentadora está no quadro deste visual
   * (`left` = terço esquerdo, parede livre à direita; `right` = o inverso;
   * `center` = 3/4 centralizada). Ausente = câmera comum (sem zonas).
   */
  zone: z.enum(CAMERA_ZONES).optional(),
});
export type Camera = z.infer<typeof CameraSchema>;

/** Posição resolvida de um plano (câmera + curso). */
export type ResolvedPlacement = 'center' | 'right' | 'left' | 'full_frame';

/**
 * Resolve a posição do apresentador para uma câmera: `inherit`/ausente usa a do
 * curso; `scale` ausente usa a do curso. `transparent` = o worker pede o vídeo
 * com fundo transparente e monta a pessoa ao lado sobre o fundo (direita/esquerda).
 * `center` e `full_frame` são vídeos opacos do provedor, sem montagem por nós.
 */
export interface ResolvedCameraPlacement {
  placement: ResolvedPlacement;
  scale: number;
  transparent: boolean;
  /** centro horizontal livre (fração da largura): o da câmera, senão o do curso; ausente = predefinido da posição */
  x?: number;
  /** base do recorte (fração da altura): a da câmera, senão a do curso; ausente = base do quadro */
  bottom?: number;
  /** folga acima da cabeça (fração da altura; do curso): deriva o tamanho */
  headroom?: number;
}

const clampRange = (n: unknown, min: number, max: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined);

export function resolveCameraPlacement(
  presentation: CoursePlacementLike | null | undefined,
  camera?: Pick<Camera, 'placement' | 'scale'> & Partial<Pick<Camera, 'x' | 'bottom'>> | null,
): ResolvedCameraPlacement {
  const courseRaw = presentation?.presenterPlacement;
  const course: ResolvedPlacement = courseRaw === 'right' || courseRaw === 'left' ? courseRaw : 'center';
  const own = camera?.placement;
  const placement: ResolvedPlacement = !own || own === 'inherit' ? course : own;
  const scale = clampRange(camera?.scale, 0.5, 1.2) ?? clampRange(presentation?.presenterScale, 0.5, 1.2) ?? 0.92;
  const transparent = placement === 'right' || placement === 'left';
  // posição livre e base só fazem sentido na montagem nossa (direita/esquerda); só entram quando definidas
  const x = transparent ? clampRange(camera?.x, 0.15, 0.85) ?? clampRange(presentation?.presenterX, 0.15, 0.85) : undefined;
  const bottom = transparent ? clampRange(camera?.bottom, 0.5, 1) ?? clampRange(presentation?.presenterBottom, 0.5, 1) : undefined;
  const headroom = transparent ? clampRange(presentation?.presenterHeadroom, 0.05, 0.08) : undefined;
  return { placement, scale, transparent, ...(x !== undefined ? { x } : {}), ...(bottom !== undefined ? { bottom } : {}), ...(headroom !== undefined ? { headroom } : {}) };
}

type CoursePlacementLike = { presenterPlacement?: string | null; presenterScale?: number | null; presenterX?: number | null; presenterBottom?: number | null; presenterHeadroom?: number | null };

/**
 * Posição de uma câmera para o hash de cena: só quando DIFERE da do curso (a
 * câmera `inherit`, ou com tamanho próprio sem efeito, mantém o hash de antes e
 * o vídeo pronto continua valendo). Direita/esquerda levam o tamanho.
 */
export function cameraPlacementHashPart(pres: CoursePlacementLike, cam: Pick<Camera, 'placement' | 'scale' | 'x' | 'bottom'> | undefined): { placement: string; scale?: number; x?: number; bottom?: number } | undefined {
  if (!cam) return undefined;
  const course = resolveCameraPlacement(pres, null);
  const own = resolveCameraPlacement(pres, cam);
  if (own.placement === course.placement && (!own.transparent || (own.scale === course.scale && own.x === course.x && own.bottom === course.bottom))) return undefined;
  return { placement: own.placement, ...(own.transparent ? { scale: own.scale, ...(own.x !== undefined ? { x: own.x } : {}), ...(own.bottom !== undefined ? { bottom: own.bottom } : {}) } : {}) };
}

/* ------------------------------------------------------------------ */
/* Câmera em tela cheia: sem zoom digital                              */
/* ------------------------------------------------------------------ */

/** Ordem dos enquadramentos, do mais aberto ao mais fechado. */
export const FRAMING_ORDER: Record<Framing, number> = { wide: 0, medium: 1, close: 2, extreme_close: 3 };
export type ShotFraming = (typeof FRAMINGS)[number];
type Framing = ShotFraming;

/** Layouts em que o enquadramento/movimento do plano recorta o vídeo do apresentador (fora: slide, card, cinematic). */
export function shotUsesPresenterCrop(layout: string | undefined): boolean {
  return layout !== 'slide' && layout !== 'card' && layout !== 'cinematic' && layout !== 'presenter_panel' && layout !== 'presenter_chips';
}

/**
 * Regra da câmera em TELA CHEIA (`full_frame`): a composição do próprio visual
 * É o plano (ex.: a recepção com a placa DNA WORK à direita) — nunca zoom
 * digital além do enquadramento nativo nem movimento digital (push_in,
 * pull_out, pans, drift recortam a placa). Enquadramento mais fechado que o
 * nativo vira o nativo; movimento vira `static`. Devolve o MESMO objeto quando
 * nada muda (hash de cena estável); mais aberto que o nativo fica como está
 * (a montagem nunca "abre" além do nativo).
 */
export function clampShotToNativeFraming<T extends { framing?: Framing; cameraMove?: string; layout?: string }>(shot: T, nativeFraming: Framing): T {
  if (!shotUsesPresenterCrop(shot.layout)) return shot;
  const tighter = FRAMING_ORDER[shot.framing ?? 'medium'] > FRAMING_ORDER[nativeFraming];
  const moving = (shot.cameraMove ?? 'static') !== 'static';
  if (!tighter && !moving) return shot;
  return { ...shot, ...(tighter ? { framing: nativeFraming } : {}), ...(moving ? { cameraMove: 'static' } : {}) };
}

/**
 * Aplica a regra da tela cheia a uma lista de planos: `cameraOf` devolve a
 * câmera do plano (ausente = principal). Só os planos numa câmera `full_frame`
 * (resolvida contra a posição do curso) mudam. `adjusted` = ids alterados.
 */
export function clampFullFrameShots<T extends { id: string; cameraId?: string | null; framing?: Framing; cameraMove?: string; layout?: string }>(
  shots: readonly T[],
  presentation: CoursePlacementLike | null | undefined,
  cameraOf: (shot: T) => (Pick<Camera, 'placement' | 'scale'> & Partial<Pick<Camera, 'nativeFraming'>>) | null | undefined,
): { shots: T[]; adjusted: string[] } {
  const adjusted: string[] = [];
  const out = shots.map((s) => {
    const cam = cameraOf(s);
    if (!cam || resolveCameraPlacement(presentation, cam).placement !== 'full_frame') return s;
    const c = clampShotToNativeFraming(s, cam.nativeFraming ?? 'medium');
    if (c !== s) adjusted.push(s.id);
    return c;
  });
  return { shots: out, adjusted };
}

/**
 * Posição em `params` de um vídeo de plano único (câmera principal): a do curso,
 * ou a da câmera principal quando ela tem posição própria. Centro = ausente
 * (hash antigo); `full_frame` = look em tela cheia com o próprio fundo.
 */
export function singleShotPlacementParams(pres: CoursePlacementLike, mainCamera: Pick<Camera, 'placement' | 'scale' | 'x' | 'bottom'> | undefined): { presenterPlacement?: 'right' | 'left' | 'full_frame'; presenterScale?: number; presenterX?: number; presenterBottom?: number; presenterHeadroom?: number } {
  const r = resolveCameraPlacement(pres, mainCamera ?? null);
  if (r.placement === 'center') return {};
  if (r.placement === 'full_frame') return { presenterPlacement: 'full_frame' };
  // inherit: exatamente o que a rota gravava antes (escala do curso, sem arredondar); posição livre e base só quando definidas
  const inherited = !mainCamera || !cameraPlacementHashPart(pres, mainCamera);
  return {
    presenterPlacement: r.placement,
    presenterScale: inherited ? (pres.presenterScale ?? 0.92) : r.scale,
    ...(r.x !== undefined ? { presenterX: r.x } : {}),
    ...(r.bottom !== undefined ? { presenterBottom: r.bottom } : {}),
    ...(r.headroom !== undefined ? { presenterHeadroom: r.headroom } : {}),
  };
}

/** Visual sentado (pedido de ângulo ou nome): sugere `full_frame` para não cortar cadeira e mesa. */
export const SEATED_LOOK_RE = /(sentad[oa]s?|seated|sitting|mesa|cadeira|\btable\b|\bdesk\b)/i;
export function looksSeated(text: string | null | undefined): boolean {
  return !!text && SEATED_LOOK_RE.test(text);
}

export const DirectionStyleSchema = z.object({
  /** ritmo: quantos segundos por plano em média */
  pace: z.enum(['calm', 'balanced', 'dynamic']).default('balanced'),
  /** usar slides para listas/ideias-chave */
  useSlides: z.boolean().default(true),
  /** paleta dos slides (cor de destaque) */
  slideAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1a66d1'),
  /** cenas em movimento (layout cinematic) por aula; 0 desliga. Cada uma é cobrada à parte e é mais cara. */
  maxCinematicPerLesson: z.number().int().min(0).max(6).default(2),
  /**
   * continuidade: o lugar da cena em movimento (quadro inicial, desfocado) vira
   * o fundo dos planos do apresentador da MESMA cena (os clipes esperam a cena
   * em movimento ficar pronta). Desligado = fundo da apresentação.
   */
  matchCinematicSetting: z.boolean().default(true),
  /**
   * `single` (padrão): UMA câmera constante (a principal) nos planos com
   * apresentador; o ritmo vem dos cartões de marca em tela cheia (layout `card`),
   * não de trocas de ângulo. `multi`: o kit de câmeras pode alternar.
   */
  cameraMode: z.enum(['single', 'multi']).default('single'),
  /** cartões em tela cheia por minuto de fala (orientação à IA diretora; 0 desliga os cartões) */
  cardsPerMinute: z.number().min(0).max(6).default(2),
  /** gestos: `natural` (mãos abertas explicando, em todo plano com apresentador) ou `minimal` (cabeça e olhar) */
  gestures: z.enum(['natural', 'minimal']).default('natural'),
});
export type DirectionStyle = z.infer<typeof DirectionStyleSchema>;

export function directionNarration(d: SceneDirection): string {
  return d.shots.map((s) => s.line.trim()).join(' ');
}

/* ------------------------------------------------------------------ */
/* Comparação de falas por palavras (seguro para o navegador)          */
/* ------------------------------------------------------------------ */

const WORD_RE = /[\p{L}\p{N}]+/gu;

/** Palavras da fala, em minúsculas (pontuação, aspas e espaços ignorados). */
export function spokenWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []) as string[];
}

/** true quando as duas falas têm as mesmas palavras, na mesma ordem (ignora pontuação e caixa). */
export function sameWords(a: string, b: string): boolean {
  const x = spokenWords(a);
  const y = spokenWords(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

/* ------------------------------------------------------------------ */
/* Gestos (motionPrompt)                                               */
/* ------------------------------------------------------------------ */

/**
 * Gestos com dedos, sinais com a mão e acenos: o avatar os executa mal. A IA
 * diretora recebe reparo quando os usa; o roteiro os descarta.
 */
export const HAND_SIGN_GESTURE_RE = /\b(finger|fingers|point\w*|count\w*|thumbs?|peace|v[- ]?sign|wave\w*|hand sign|ok sign|snap\w*|raises? (a|one|his|her|their) hand)\b/i;

export function isHandSignGesture(motionPrompt: string | null | undefined): boolean {
  return !!motionPrompt && HAND_SIGN_GESTURE_RE.test(motionPrompt);
}

export const GESTURE_MOODS = ['welcoming', 'explaining', 'question', 'serious', 'reassuring', 'positive', 'negative', 'reflective'] as const;
export type GestureMood = (typeof GESTURE_MOODS)[number];

/**
 * Vocabulário de gestos seguros (um gesto + uma emoção, em inglês), por clima
 * da fala. Usado pelos modelos de demonstração, recomendado à IA diretora e
 * oferecido como exemplo no editor.
 */
export const SAFE_GESTURES: ReadonlyArray<{ id: string; prompt: string; mood: GestureMood }> = [
  { id: 'smile_welcoming', prompt: 'smiles softly, welcoming', mood: 'welcoming' },
  { id: 'nod_warm', prompt: 'nods slowly, warm', mood: 'welcoming' },
  { id: 'open_palms_honest', prompt: 'opens both palms, honest', mood: 'explaining' },
  { id: 'hands_explaining', prompt: 'moves both hands gently while explaining, calm', mood: 'explaining' },
  { id: 'hands_together_focused', prompt: 'brings both hands together, focused', mood: 'explaining' },
  { id: 'lean_in_curious', prompt: 'leans in slightly, curious', mood: 'question' },
  { id: 'tilt_head_inviting', prompt: 'tilts the head slightly, inviting', mood: 'question' },
  { id: 'look_lens_serious', prompt: 'looks straight into the lens, serious', mood: 'serious' },
  { id: 'nod_once_firm', prompt: 'nods once firmly, confident', mood: 'serious' },
  { id: 'hand_on_chest_sincere', prompt: 'places a hand on the chest, sincere', mood: 'reassuring' },
  { id: 'relaxed_shoulders_reassuring', prompt: 'relaxes the shoulders and smiles, reassuring', mood: 'reassuring' },
  { id: 'bright_smile_pleased', prompt: 'smiles broadly, pleased', mood: 'positive' },
  { id: 'raise_brows_impressed', prompt: 'raises the eyebrows, impressed', mood: 'positive' },
  { id: 'shake_head_concerned', prompt: 'shakes the head slightly, concerned', mood: 'negative' },
  { id: 'glance_aside_reflective', prompt: 'glances aside briefly, reflective', mood: 'reflective' },
];

/** Chave do gesto (a ação, antes da vírgula da emoção), para comparar planos seguidos. */
export function gestureKey(motionPrompt: string | null | undefined): string {
  return (motionPrompt ?? '').split(',')[0]!.trim().toLowerCase().replace(/\s+/g, ' ');
}
