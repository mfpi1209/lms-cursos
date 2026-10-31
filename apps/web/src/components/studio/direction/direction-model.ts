import type { CinematicAction } from '@lms/course-schema';
import {
  directionNarration,
  type Camera,
  type CAMERA_MOVES,
  type FRAMINGS,
  type LAYOUTS,
  type Presentation,
  type SceneDirection,
  type Shot,
  type Slide,
  type TRANSITIONS,
} from '@lms/course-schema';
import { markMediaStale, replaceNode, shortId } from '@/components/studio/graph-ops';
import { isSpokenNode, type SpokenNode } from '@/components/studio/storyboard/narration-fields';
import type { GraphChange } from '@/components/studio/storyboard/scene-fields';

/**
 * Modelo da direção cinematográfica no estúdio: rótulos, estimativas e
 * operações puras sobre a lista de planos. Nada aqui fala com a API.
 */

export type Framing = (typeof FRAMINGS)[number];
export type Layout = (typeof LAYOUTS)[number];
export type CameraMove = (typeof CAMERA_MOVES)[number];
export type Transition = (typeof TRANSITIONS)[number];
export type SlideStyle = Slide['style'];
export type CameraAngle = Camera['angle'];
export type DirectionStyle = Presentation['directionStyle'];

export const MAX_SHOTS = 12;
export const MAX_CAMERAS = 16;
export const MAX_BULLETS = 4;
/** velocidade média de fala usada para estimar a duração de um plano */
export const WORDS_PER_SECOND = 2.6;

export const FRAMING_ORDER: Framing[] = ['wide', 'medium', 'close', 'extreme_close'];
export const FRAMING_LABEL: Record<Framing, string> = { wide: 'Aberto', medium: 'Médio', close: 'Close', extreme_close: 'Close extremo' };
/** zoom digital aplicado ao visual nativo (aberto = 1) */
export const FRAMING_SCALE: Record<Framing, number> = { wide: 1, medium: 1.25, close: 1.65, extreme_close: 2.2 };

export const LAYOUT_ORDER: Layout[] = ['presenter', 'presenter_panel', 'presenter_chips', 'card', 'lower_third', 'presenter_slide_right', 'presenter_slide_left', 'slide_with_pip', 'slide', 'cinematic'];
export const LAYOUT_LABEL: Record<Layout, string> = {
  presenter: 'Só o apresentador',
  presenter_slide_right: 'Slide à direita',
  presenter_slide_left: 'Slide à esquerda',
  slide_with_pip: 'Slide com janela',
  slide: 'Só o slide',
  lower_third: 'Com letreiro',
  cinematic: 'Cena em movimento',
  card: 'Cartão de marca',
  presenter_panel: 'Apresentadora + painel',
  presenter_chips: 'Apresentadora + pílulas',
};
/** Texto de apoio das pílulas (estúdio com zonas). */
export const CHIPS_HELP = 'Estúdio com zonas: a câmera de zona já deixa a parede livre; um painel de vidro marinho ali mostra o título e 2–4 pílulas (a parte em **negrito** de cada tópico) que surgem quando são ditas. Alterne o lado entre os planos de pílulas.';
/** Texto de apoio do painel (cartão padrão em câmera única). */
export const PANEL_HELP = 'A apresentadora continua em tela cheia (deslocada à direita) e um painel marinho à esquerda mostra o título e 2–3 tópicos com **palavras-chave**; cada tópico acende quando é dito.';
/** Texto de apoio do cartão de marca (tela cheia, sem apresentador, a voz continua). */
export const CARD_HELP = 'Cartão com a identidade da plataforma em tela cheia: título e 2–3 tópicos com **palavras-chave** em negrito; a apresentadora some e a voz continua. Sem clipe pago.';

/** Texto de apoio da cena em movimento (cobrada à parte, sem leitura labial). */
export const CINEMATIC_HELP = 'A apresentadora caminha ou age sem falar; a narração toca por cima. Cobrada à parte.';
/**
 * Duração aceita pela cena em movimento (s) e faixa de palavras da FALA (2,6
 * palavras/s): a fala pode ser curta (≈ 1,5 s), porque a imagem dura pelo menos
 * o mínimo da ação (CINEMATIC_MIN_SECONDS_BY_ACTION) e segue sem narração.
 */
export const CINEMATIC_SECONDS = { min: 4, max: 15 } as const;
export const CINEMATIC_WORDS = { min: 4, max: 38 } as const;
/** Pedidos de câmera de exemplo (inglês) e o rótulo pt-BR correspondente. */
export const CINEMATIC_EXAMPLES: Array<{ label: string; setting: string; action: CinematicAction; prompt: string }> = [
  { label: 'Chegando ao prédio', setting: 'Chegando ao prédio da empresa', action: 'walk_toward_camera', prompt: 'the sidewalk in front of a modern glass office building in a Brazilian city; trees and morning sunlight' },
  { label: 'Corredor até a sala', setting: 'Caminhando até a sala da entrevista', action: 'walk_away', prompt: 'a bright modern office corridor with glass walls and plants; a door to the interview room at the end; morning light' },
  { label: 'Entrando para a vídeo chamada', setting: 'Entrando e sentando para a vídeo chamada', action: 'walk_in_and_sit', prompt: 'a tidy home office with a wooden desk, an open laptop and a plant; soft morning daylight from a window' },
  { label: 'Recepção da empresa', setting: 'Observando a recepção da empresa', action: 'walk_and_look_around', prompt: 'a modern company reception with a front desk, sofas and plants; daylight through large windows' },
];

export function isCinematicShot(s: Pick<Shot, 'layout'>): boolean {
  return s.layout === 'cinematic';
}

/** Quantas cenas em movimento a direção tem. */
export function cinematicCount(d: Pick<SceneDirection, 'shots'> | undefined): number {
  return d ? d.shots.filter(isCinematicShot).length : 0;
}

export const MAX_CINEMATIC_OPTIONS = [0, 1, 2, 3] as const;

export const MOVE_ORDER: CameraMove[] = ['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'drift'];
export const MOVE_LABEL: Record<CameraMove, string> = {
  static: 'Parada',
  push_in: 'Aproximar devagar',
  pull_out: 'Afastar devagar',
  pan_left: 'Deslizar para a esquerda',
  pan_right: 'Deslizar para a direita',
  drift: 'Flutuar',
};
/** Rótulo curto do movimento (cartões estreitos da linha do tempo); o completo vai no title. */
export const MOVE_SHORT: Record<CameraMove, string> = {
  static: 'Parada',
  push_in: 'Aproximar',
  pull_out: 'Afastar',
  pan_left: 'Esquerda',
  pan_right: 'Direita',
  drift: 'Flutuar',
};

export const TRANSITION_ORDER: Transition[] = ['cut', 'crossfade', 'whip', 'dip_to_color'];
export const TRANSITION_LABEL: Record<Transition, string> = { cut: 'Corte seco', crossfade: 'Fusão', whip: 'Chicote', dip_to_color: 'Passagem pela cor' };

export const SLIDE_STYLE_ORDER: SlideStyle[] = ['clean', 'bold', 'quote', 'checklist'];
export const SLIDE_STYLE_LABEL: Record<SlideStyle, string> = { clean: 'Limpo', bold: 'Forte', quote: 'Citação', checklist: 'Lista de verificação' };

export const ANGLE_ORDER: CameraAngle[] = ['front', 'left', 'right', 'high', 'low'];
export const ANGLE_LABEL: Record<CameraAngle, string> = { front: 'De frente', left: 'Pela esquerda', right: 'Pela direita', high: 'De cima', low: 'De baixo' };

export const PACE_ORDER: DirectionStyle['pace'][] = ['calm', 'balanced', 'dynamic'];
export const PACE: Record<DirectionStyle['pace'], { label: string; seconds: number }> = {
  calm: { label: 'Calmo', seconds: 7 },
  balanced: { label: 'Equilibrado', seconds: 5 },
  dynamic: { label: 'Dinâmico', seconds: 3 },
};

export const DEFAULT_SLIDE_ACCENT = '#1a66d1';

/** Gestos de exemplo (motion prompt do HeyGen, em inglês). */
/** Gestos de exemplo (motion prompt do HeyGen, em inglês): um gesto + uma emoção, do vocabulário seguro (sem dedos/sinais). */
export const GESTURE_EXAMPLES = ['smiles softly, welcoming', 'nods slowly, warm', 'opens both palms, honest', 'leans in slightly, curious', 'places a hand on the chest, sincere'];

export const newShotId = () => `shot_${shortId()}`;
export const newCameraId = () => `cam_${shortId()}`;

export function layoutHasSlide(l: Layout): boolean {
  return l === 'presenter_slide_right' || l === 'presenter_slide_left' || l === 'slide_with_pip' || l === 'slide' || l === 'card' || l === 'presenter_panel' || l === 'presenter_chips';
}

/** Layouts em que a apresentadora NÃO aparece (nenhum clipe pago; só o áudio do trecho). */
export function layoutHidesPresenter(l: Layout): boolean {
  return l === 'slide' || l === 'card';
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Duração estimada de um plano, em segundos (palavras / 2,6), no mínimo 1 s. */
export function shotSeconds(shot: Pick<Shot, 'line'>): number {
  return Math.max(1, wordCount(shot.line) / WORDS_PER_SECOND);
}

export function directionSeconds(d: SceneDirection): number {
  return d.shots.reduce((s, x) => s + shotSeconds(x), 0);
}

export function formatSeconds(s: number): string {
  const r = Math.round(s);
  if (r < 60) return `${r} s`;
  return `${Math.floor(r / 60)} min ${r % 60} s`;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** As falas dos planos, juntas, são a fala da cena? (ignora espaços) */
export function directionMatches(d: SceneDirection, script: string): boolean {
  return squash(directionNarration(d)) === squash(script);
}

export function framingSequence(d: Pick<SceneDirection, 'shots'>): string {
  return d.shots.map((s) => (s.layout === 'cinematic' ? 'Em movimento' : FRAMING_LABEL[s.framing])).join(' → ');
}

export function slideCount(d: Pick<SceneDirection, 'shots'>): number {
  return d.shots.filter((s) => layoutHasSlide(s.layout)).length;
}

export function emptySlide(): Slide {
  return { title: '', bullets: [], style: 'clean' };
}

export function newShot(line: string, base?: Partial<Shot>): Shot {
  return {
    framing: 'medium',
    layout: 'presenter',
    cameraMove: 'static',
    transitionIn: 'cut',
    ...base,
    id: newShotId(),
    line,
  };
}

export function sceneDirection(node: SpokenNode): SceneDirection | undefined {
  return node.direction;
}

/* ------------------------------------------------------------------ */
/* Câmeras                                                             */
/* ------------------------------------------------------------------ */

/** Câmera que um plano usa (ausente = principal, a primeira do kit). */
export function shotCamera(presentation: Presentation, cameraId?: string): Camera | undefined {
  const cams = presentation.cameras ?? [];
  if (!cameraId) return cams[0];
  const cam = cams.find((c) => c.id === cameraId);
  // câmera ainda gerando (ou que falhou) não tem visual: o plano usa a principal
  return cam && (cam.status ?? 'ready') === 'ready' ? cam : cams[0];
}

export function cameraLabel(presentation: Presentation, cameraId?: string): string {
  const cams = presentation.cameras ?? [];
  if (!cameraId || cams[0]?.id === cameraId) return cams[0]?.name || 'Principal';
  const cam = cams.find((c) => c.id === cameraId);
  if (!cam) return 'Câmera removida';
  if (cam.status === 'generating') return `${cam.name || 'Câmera'} (gerando)`;
  if (cam.status === 'failed') return `${cam.name || 'Câmera'} (falhou)`;
  return cam.name || 'Câmera sem nome';
}

export function cameraPreviewUrl(presentation: Presentation, cameraId?: string): string | undefined {
  return shotCamera(presentation, cameraId)?.previewUrl ?? presentation.avatarPreviewUrl;
}

/** Zoom digital do enquadramento a partir do enquadramento nativo da câmera (nunca menor que 1). */
export function framingZoom(framing: Framing, native: Framing = 'wide'): number {
  return Math.max(1, FRAMING_SCALE[framing] / FRAMING_SCALE[native]);
}

/* ------------------------------------------------------------------ */
/* Operações sobre os planos                                           */
/* ------------------------------------------------------------------ */

export function updateShot(d: SceneDirection, shotId: string, fn: (s: Shot) => Shot): SceneDirection {
  return { ...d, shots: d.shots.map((s) => (s.id === shotId ? fn(s) : s)) };
}

/** Divide um plano na posição do cursor; devolve null se um dos lados ficaria vazio. */
export function splitShot(d: SceneDirection, shotId: string, at: number): { direction: SceneDirection; newId: string } | null {
  if (d.shots.length >= MAX_SHOTS) return null;
  const i = d.shots.findIndex((s) => s.id === shotId);
  const cur = d.shots[i];
  if (!cur) return null;
  const a = cur.line.slice(0, at).trim();
  const b = cur.line.slice(at).trim();
  if (!a || !b) return null;
  const { id: _id, line: _line, transitionIn: _t, ...rest } = cur;
  void _id;
  void _line;
  void _t;
  const second = newShot(b, { ...rest, transitionIn: 'cut' });
  const shots = [...d.shots];
  shots.splice(i, 1, { ...cur, line: a }, second);
  return { direction: { ...d, shots }, newId: second.id };
}

export function mergeWithNext(d: SceneDirection, shotId: string): SceneDirection | null {
  const i = d.shots.findIndex((s) => s.id === shotId);
  const cur = d.shots[i];
  const next = d.shots[i + 1];
  if (!cur || !next) return null;
  const shots = [...d.shots];
  shots.splice(i, 2, { ...cur, line: `${cur.line.trim()} ${next.line.trim()}`.slice(0, 1200) });
  return { ...d, shots };
}

/** Remove um plano; sem planos, a cena volta a ser um plano único (sem direção). */
export function removeShot(d: SceneDirection, shotId: string): SceneDirection | undefined {
  const shots = d.shots.filter((s) => s.id !== shotId);
  return shots.length ? { ...d, shots } : undefined;
}

export function insertShotAfter(d: SceneDirection, afterId: string | null, shot: Shot): SceneDirection | null {
  if (d.shots.length >= MAX_SHOTS) return null;
  const i = afterId ? d.shots.findIndex((s) => s.id === afterId) : d.shots.length - 1;
  const shots = [...d.shots];
  shots.splice(i < 0 ? shots.length : i + 1, 0, shot);
  return { ...d, shots };
}

/* ------------------------------------------------------------------ */
/* Gravação no rascunho                                                */
/* ------------------------------------------------------------------ */

/**
 * Altera a direção (e, opcionalmente, a fala) de uma cena numa única
 * alteração do rascunho. Qualquer edição manual marca a direção como do
 * autor e deixa desatualizado o vídeo gerado a partir da versão anterior.
 */
export function patchDirection(
  changeGraph: GraphChange,
  nodeId: string,
  fn: (d: SceneDirection | undefined, node: SpokenNode) => { direction?: SceneDirection | undefined; narration?: string } | null,
  coalesce?: string,
) {
  changeGraph((g) => {
    const cur = g.nodes.find((n) => n.id === nodeId);
    if (!cur || !isSpokenNode(cur)) return g;
    const r = fn(cur.direction, cur);
    if (!r) return g;
    const next: SpokenNode = { ...cur };
    if ('direction' in r) {
      if (r.direction) next.direction = { ...r.direction, source: 'author' };
      else delete next.direction;
    }
    if ('narration' in r) next.narration = r.narration ? r.narration : undefined;
    return replaceNode(g, markMediaStale(next));
  }, coalesce);
}
