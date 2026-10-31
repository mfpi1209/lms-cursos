import { CARD_LIMITS, CHIPS_LIMITS, chipLabel, clampFullFrameShots, gestureKey, isCardLayout, isHandSignGesture, nextChipsCamera, resolveCameraPlacement, richTextToPlain, sameWords, spokenWords, stripBold, type AnyNode, type Camera, type CameraZone, type LessonGraph, type ResolvedPlacement, type SceneDirection, type ZoneCameraSet } from '@lms/course-schema';

export { sameWords, spokenWords };
import { CARD_MAX_WORDS, CARD_MIN_WORDS, CINEMATIC_MAX_WORDS, CINEMATIC_MIN_WORDS, MAX_CINEMATIC_PER_SCENE, MAX_SHOT_WORDS, MAX_WIDE_SHOTS_PER_SCENE, MIN_SHOT_WORDS } from './capabilities';
import { splitSentences } from './sentences';
import { SLIDE_LAYOUTS, type DirectionSceneProposal } from './schemas';

/** Tipos de cena que viram vídeo do apresentador (e portanto recebem direção). */
export const DIRECTION_NODE_TYPES = ['scenario', 'content', 'choice', 'consequence'] as const;
export type DirectionNodeType = (typeof DIRECTION_NODE_TYPES)[number];

/** Cena-alvo da IA diretora. `narration` é o texto falado (a fala ou, sem fala, o texto da tela). */
export interface DirectionTarget {
  nodeId: string;
  type: DirectionNodeType;
  title: string;
  narration: string;
  screenText: string;
  /** true quando `narration` veio do campo narration (false = texto da tela) */
  hasNarration: boolean;
  /** posição (0 = primeira) entre as cenas com vídeo da aula, antes de qualquer filtro */
  position?: number;
}

export const MAX_SHOTS_PER_SCENE = 12;
export const MAX_SLIDE_BULLETS = 4;
export const MAX_BULLET_WORDS = 8;
/** Velocidade média de fala em português (palavras por segundo) usada nas estimativas. */
export const WORDS_PER_SECOND_PT = 2.6;

function screenTextOf(n: AnyNode): string {
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body);
  if (n.type === 'choice') return richTextToPlain(n.prompt);
  return '';
}

/**
 * Cenas da aula que podem receber direção: tipos com vídeo que tenham fala ou
 * texto. `nodeIds` restringe (ids desconhecidos são ignorados).
 */
export function directionTargetsFromGraph(graph: LessonGraph, nodeIds?: readonly string[] | null): DirectionTarget[] {
  const only = nodeIds && nodeIds.length ? new Set(nodeIds) : null;
  const out: DirectionTarget[] = [];
  let position = 0;
  for (const n of graph.nodes) {
    if (!(DIRECTION_NODE_TYPES as readonly string[]).includes(n.type)) continue;
    const screenText = screenTextOf(n).trim();
    const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
    const spoken = narration || screenText;
    if (!spoken) continue;
    const pos = position++;
    if (only && !only.has(n.id)) continue;
    out.push({ nodeId: n.id, type: n.type as DirectionNodeType, title: n.title ?? n.id, narration: spoken.slice(0, 5000), screenText, hasNarration: !!narration, position: pos });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Normalização e alinhamento das falas                                */
/* ------------------------------------------------------------------ */

const QUOTE_MAP: Record<string, string> = {
  '“': '"', '”': '"', '„': '"', '«': '"', '»': '"', '″': '"',
  '‘': "'", '’': "'", '‚': "'", '′': "'", '`': "'", '´': "'",
  '–': '-', '—': '-', '−': '-',
};

/**
 * Normaliza texto falado para comparação: aspas e travessões tipográficos
 * viram ASCII, reticências viram "...", espaços (inclusive quebras de linha)
 * colapsam. Devolve também, para cada caractere normalizado, o índice do
 * caractere original (para recortar o texto original depois).
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (norm.length > 0 && pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      norm += ' ';
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    const rep = ch === '…' ? '...' : (QUOTE_MAP[ch] ?? ch);
    for (const r of rep) {
      norm += r;
      map.push(i);
    }
  }
  return { norm, map };
}

export function normalizeSpoken(text: string): string {
  return normalizeWithMap(text).norm;
}

/** Texto falado resultante dos planos (mesma regra de `directionNarration`). */
export function joinLines(lines: readonly string[]): string {
  return lines.map((l) => l.trim()).join(' ');
}

function wordExcerpt(ws: readonly string[], from: number, n = 8): string {
  const t = ws.slice(from, from + n).join(' ');
  return t ? `«${t}${from + n < ws.length ? '…' : ''}»` : '(fim do texto)';
}

/**
 * Compara as falas dos planos com a fala da cena pelas PALAVRAS, em ordem e
 * em minúsculas (pontuação, aspas, reticências e espaços não contam: o texto
 * final é recortado do original por `alignLinesToNarration`). Em caso de
 * divergência, descreve exatamente onde e o que difere, para o reparo.
 */
export function checkLinesMatch(narration: string, lines: readonly string[]): { ok: true } | { ok: false; diff: string } {
  const expected = spokenWords(narration);
  const got = lines.flatMap((l) => spokenWords(l));
  let i = 0;
  while (i < expected.length && i < got.length && expected[i] === got[i]) i++;
  if (i === expected.length && i === got.length) return { ok: true };
  const ctx = i > 0 ? ` depois de «${expected.slice(Math.max(0, i - 4), i).join(' ')}»` : ' logo no início';
  const diff = i >= got.length
    ? `as falas dos planos terminam antes da fala da cena; falta${ctx}: ${wordExcerpt(expected, i, 20)}`
    : i >= expected.length
      ? `as falas dos planos têm texto a mais no fim: ${wordExcerpt(got, i, 20)}`
      : `as falas divergem${ctx}: esperado ${wordExcerpt(expected, i)}, veio ${wordExcerpt(got, i)}`;
  return { ok: false, diff };
}

/**
 * Recorta cada `line` do texto ORIGINAL da fala, em fronteiras de palavra
 * (mantendo aspas, reticências e pontuação exatas do autor). A pontuação logo
 * depois da última palavra de um plano fica com ele; o que vem antes da
 * primeira palavra do plano seguinte (ex.: aspas de abertura) vai com o
 * seguinte. Devolve null se as palavras não baterem ou se um plano ficar sem
 * palavra.
 */
export function alignLinesToNarration(narration: string, lines: readonly string[]): string[] | null {
  const tokens = [...narration.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ word: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  const out: string[] = [];
  let cursor = 0;
  let from = 0;
  for (let li = 0; li < lines.length; li++) {
    const ws = spokenWords(lines[li]!);
    if (!ws.length) return null;
    for (let k = 0; k < ws.length; k++) if (tokens[cursor + k]?.word !== ws[k]) return null;
    cursor += ws.length;
    let to: number;
    if (li === lines.length - 1) to = narration.length;
    else {
      const lastEnd = tokens[cursor - 1]!.end;
      const nextStart = tokens[cursor]?.start ?? narration.length;
      to = lastEnd;
      while (to < nextStart && !/\s/.test(narration[to]!)) to++;
    }
    out.push(narration.slice(from, to).trim());
    from = to;
  }
  if (cursor !== tokens.length) return null;
  return out;
}

/* ------------------------------------------------------------------ */
/* Validação de uma cena dirigida                                      */
/* ------------------------------------------------------------------ */

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Códigos dos problemas de direção (prefixo da mensagem devolvida ao modelo e
 * registrada no estúdio). Os demais problemas continuam sem código.
 */
export const DIRECTION_PROBLEM_CODES = ['CAMERA_SWITCH_IN_SINGLE_MODE', 'PIP_IN_SINGLE_MODE', 'CARD_TOO_LONG', 'CARD_TOO_SHORT', 'CONSECUTIVE_CARDS', 'CARD_TITLE_TOO_LONG', 'CARD_TOO_MANY_BULLETS', 'CARD_BULLET_TOO_LONG', 'CHIPS_WITHOUT_ZONES'] as const;
export type DirectionProblemCode = (typeof DIRECTION_PROBLEM_CODES)[number];
/** Código do aviso (não erro) de plano com apresentador sem gesto. */
export const MISSING_GESTURE = 'MISSING_GESTURE';
/** Código do aviso (não erro) de zoom/movimento digital pedido numa câmera em tela cheia (corrigido automaticamente). */
export const ZOOM_ON_FULL_FRAME = 'ZOOM_ON_FULL_FRAME';
/** Estúdio com zonas: dois planos de pílulas seguidos do MESMO lado (corrigido para o outro lado). */
export const CHIPS_SIDE_REPEAT = 'CHIPS_SIDE_REPEAT';
/** Estúdio com zonas: pílulas numa câmera centralizada/sem zona (não há parede livre; corrigido para uma câmera de zona). */
export const CHIPS_ON_CENTER_CAMERA = 'CHIPS_ON_CENTER_CAMERA';
/** Estúdio com zonas: troca de câmera no meio de uma frase (o corte só acontece entre frases). */
export const CUT_MID_SENTENCE = 'CUT_MID_SENTENCE';

type CameraLike = Pick<Camera, 'id'> & Partial<Pick<Camera, 'placement' | 'scale' | 'nativeFraming' | 'zone'>>;
type PlacementLike = { presenterPlacement?: string | null; presenterScale?: number | null };

/** Câmera do plano (cameraId null/ausente = a principal, a primeira do kit). */
function shotCamera<C extends CameraLike>(cameras: readonly C[], cameraId: string | null | undefined): C | undefined {
  return cameraId ? cameras.find((c) => c.id === cameraId) : cameras[0];
}

/** O plano usa uma câmera em tela cheia (resolvida contra a posição do curso)? */
function onFullFrame(cameras: readonly CameraLike[], cameraId: string | null | undefined, placement: PlacementLike | undefined): boolean {
  const cam = shotCamera(cameras, cameraId);
  return !!cam && resolveCameraPlacement(placement, cam).placement === 'full_frame';
}

/** Layouts em que o apresentador aparece (recebem gesto e contam para a câmera). */
export function layoutShowsPresenter(layout: string): boolean {
  return layout !== 'slide' && layout !== 'card' && layout !== 'cinematic';
}

/**
 * Problemas de uma cena proposta (vazio = válida): fala reproduzida em ordem,
 * ids únicos, câmeras existentes, limites de slide e de planos, layouts
 * coerentes com slide/letreiro.
 */
export function validateDirectionScene(
  scene: DirectionSceneProposal,
  target: DirectionTarget,
  cameras: readonly CameraLike[],
  opts: {
    useSlides?: boolean;
    /** cenas em movimento permitidas nesta cena (padrão 1; 0 = desligadas) */
    maxCinematic?: number;
    /** `single`: só a câmera principal nos planos com apresentador; sem slide_with_pip */
    cameraMode?: 'single' | 'multi';
    /** posição do curso (câmeras `inherit`); identifica as câmeras em tela cheia */
    placement?: PlacementLike;
    /** estúdio com zonas (câmeras de zona do kit; null = sem): as câmeras de zona valem em câmera única e as pílulas só existem aqui */
    zones?: ZoneCameraSet | null;
  } = {},
): string[] {
  const problems: string[] = [];
  const where = `cena "${target.nodeId}"`;
  const single = opts.cameraMode === 'single';
  const zoneIds = new Set(Object.values(opts.zones ?? {}).filter(Boolean));
  const mainCameraId = cameras[0]?.id ?? null;
  const maxCinematic = Math.min(MAX_CINEMATIC_PER_SCENE, opts.maxCinematic ?? MAX_CINEMATIC_PER_SCENE);
  const cinematics = scene.shots.filter((s) => s.layout === 'cinematic').length;
  if (cinematics > maxCinematic) {
    problems.push(maxCinematic === 0
      ? `${where}: cenas em movimento (layout cinematic) estão desligadas neste curso; use outro layout e cinematic null`
      : `${where}: ${cinematics} planos cinematic (máximo ${maxCinematic} por cena); mantenha só o que narra a situação e use presenter nos demais`);
  }
  // câmera em tela cheia: o enquadramento é sempre o nativo (sem zoom digital) — fora das regras de variação e de wide
  const fixedFraming = (k: number) => scene.shots[k]!.layout === 'presenter_panel' || scene.shots[k]!.layout === 'presenter_chips' || onFullFrame(cameras, scene.shots[k]!.cameraId, opts.placement);
  for (let i = 2; i < scene.shots.length; i++) {
    const f = scene.shots[i]!.framing;
    // enquadramento não vale na cena em movimento (o movimento está no clipe) nem nos layouts sem apresentador
    if ([i, i - 1, i - 2].some((k) => !layoutShowsPresenter(scene.shots[k]!.layout) || fixedFraming(k))) continue;
    if (scene.shots[i - 1]!.framing === f && scene.shots[i - 2]!.framing === f) {
      problems.push(`${where}: planos ${i - 1}, ${i} e ${i + 1} com o mesmo enquadramento (${f}); varie (no máximo 2 seguidos iguais)`);
      break;
    }
  }
  if (opts.useSlides === false && scene.shots.some((s) => s.slide || SLIDE_LAYOUTS.includes(s.layout))) {
    problems.push(`${where}: o estilo desta aula desliga os slides; use layouts presenter ou lower_third e slide null`);
  }
  if (scene.shots.length === 0) problems.push(`${where}: nenhum plano`);
  if (scene.shots.length > MAX_SHOTS_PER_SCENE) problems.push(`${where}: ${scene.shots.length} planos (máximo ${MAX_SHOTS_PER_SCENE})`);
  const match = checkLinesMatch(target.narration, scene.shots.map((s) => s.line));
  if (!match.ok) problems.push(`${where}: ${match.diff}. Os campos line devem reproduzir a fala EXATAMENTE, em ordem, sem reescrever, cortar ou acrescentar palavras.`);
  const wides = scene.shots.filter((s, k) => s.framing === 'wide' && s.layout !== 'cinematic' && !fixedFraming(k)).length;
  if (wides > MAX_WIDE_SHOTS_PER_SCENE) problems.push(`${where}: ${wides} planos wide (máximo ${MAX_WIDE_SHOTS_PER_SCENE}: wide prejudica a leitura labial; use medium ou close)`);
  const seen = new Set<string>();
  const cameraIds = new Set(cameras.map((c) => c.id));
  let prevShotLayout: string | null = null;
  scene.shots.forEach((s, i) => {
    const shot = `${where}, plano ${i + 1} (${s.id})`;
    const w = words(s.line);
    const cine = s.layout === 'cinematic';
    // cartão em tela cheia (card) ou apresentadora + painel (presenter_panel): mesmos limites de fala e de tópicos
    const card = isCardLayout(s.layout);
    if (card) {
      // cartão em tela cheia: 5–15 s de fala por cima; o limite de 26 palavras (gesto repetido) não vale sem apresentador
      if (w > CARD_MAX_WORDS) problems.push(`CARD_TOO_LONG: ${shot}: cartão com ${w} palavras (máximo ${CARD_MAX_WORDS}, ≈ 15 s); volte ao apresentador antes`);
      if (w < CARD_MIN_WORDS && scene.shots.length > 1) problems.push(`CARD_TOO_SHORT: ${shot}: cartão com só ${w} palavras (mínimo ${CARD_MIN_WORDS}, ≈ 5 s); junte ao trecho vizinho ou use presenter`);
      if (isCardLayout(prevShotLayout)) problems.push(`CONSECUTIVE_CARDS: ${shot}: dois cartões seguidos; volte ao apresentador entre eles`);
      if (s.cinematic) problems.push(`${shot}: cinematic preenchido com layout ${s.layout}; use cinematic null`);
    } else if (cine) {
      // cena em movimento: fala de ≈ 1,5 a 15 s (a imagem pode durar mais que a fala: mínimo por ação)
      if (w > CINEMATIC_MAX_WORDS) problems.push(`${shot}: cena em movimento com ${w} palavras (máximo ${CINEMATIC_MAX_WORDS}, ≈ 15 s); divida a fala e deixe só a parte que narra a situação no plano cinematic`);
      if (w < CINEMATIC_MIN_WORDS) problems.push(`${shot}: cena em movimento com só ${w} palavras (mínimo ${CINEMATIC_MIN_WORDS}, ≈ 1,5 s); junte ao plano vizinho ou use outro layout`);
      if (!s.cinematic?.prompt.trim()) problems.push(`${shot}: layout cinematic exige cinematic.prompt (em inglês, só o lugar: ambiente, luz e os objetos que a ação usa; a ação vem de cinematic.action)`);
      if (s.cinematic && (s.cinematic.setting?.length ?? 0) > 200) problems.push(`${shot}: cinematic.setting com ${s.cinematic.setting!.length} caracteres (máximo 200); encurte o rótulo`);
      if (s.slide) problems.push(`${shot}: layout cinematic não tem slide; use slide null`);
    } else {
      if (w > MAX_SHOT_WORDS) problems.push(`${shot}: ${w} palavras (máximo ${MAX_SHOT_WORDS}, ≈ 10 s); divida em mais planos`);
      if (s.cinematic) problems.push(`${shot}: cinematic preenchido com layout ${s.layout}; use o layout cinematic ou cinematic null`);
    }
    if (w < MIN_SHOT_WORDS && scene.shots.length > 1) problems.push(`${shot}: só ${w} palavra(s) (mínimo ${MIN_SHOT_WORDS} palavras por plano quando há mais de um plano, sem exceção); junte ao plano vizinho`);
    if (s.layout === 'presenter_chips' && !zoneIds.size) problems.push(`CHIPS_WITHOUT_ZONES: ${shot}: presenter_chips só existe no estúdio com zonas (câmeras com zona); use presenter_panel`);
    // estúdio com zonas: as câmeras de zona (3/4 e laterais) fazem parte da linguagem; as demais seguem a regra da câmera única
    if (single && layoutShowsPresenter(s.layout) && s.cameraId !== null && s.cameraId !== mainCameraId && !zoneIds.has(s.cameraId)) problems.push(`CAMERA_SWITCH_IN_SINGLE_MODE: ${shot}: cameraId "${s.cameraId}" num curso de câmera única; use ${mainCameraId ? `"${mainCameraId}" (principal)` : 'null'} em todos os planos com apresentador`);
    if (single && s.layout === 'slide_with_pip') problems.push(`PIP_IN_SINGLE_MODE: ${shot}: slide_with_pip não existe em câmera única; use o layout presenter_panel (a apresentadora com o painel de tópicos) e volte a presenter`);
    prevShotLayout = s.layout;
    if (s.motionPrompt.length > 200) problems.push(`${shot}: motionPrompt com ${s.motionPrompt.length} caracteres (máximo 200); um gesto + uma emoção`);
    if (isHandSignGesture(s.motionPrompt)) problems.push(`${shot}: motionPrompt "${s.motionPrompt.slice(0, 80)}" usa dedos, sinal com a mão ou aceno (o avatar erra); troque por cabeça, olhar, expressão ou mãos abertas (ex.: "nods slowly, warm")`);
    const prevShot = i > 0 ? scene.shots[i - 1]! : null;
    if (prevShot && gestureKey(s.motionPrompt) && gestureKey(s.motionPrompt) === gestureKey(prevShot.motionPrompt)) problems.push(`${shot}: mesmo gesto do plano anterior ("${gestureKey(s.motionPrompt)}"); varie o gesto entre planos seguidos`);
    if ((s.caption?.length ?? 0) > 80) problems.push(`${shot}: caption com ${s.caption!.length} caracteres (máximo 80); encurte o letreiro`);
    if (s.framing === 'wide' && w > 16 && !cine && !fixedFraming(i)) problems.push(`${shot}: wide numa fala longa (${w} palavras); use wide só para situar, numa fala curta`);
    if (seen.has(s.id)) problems.push(`${shot}: id repetido; use ids únicos (s1, s2…)`);
    seen.add(s.id);
    if (s.cameraId !== null) {
      if (cameraIds.size === 0) problems.push(`${shot}: cameraId "${s.cameraId}" mas não há câmeras cadastradas; use null`);
      else if (!cameraIds.has(s.cameraId)) problems.push(`${shot}: cameraId "${s.cameraId}" não existe; use um de: ${[...cameraIds].join(', ')}`);
    }
    if (SLIDE_LAYOUTS.includes(s.layout) && !s.slide) problems.push(`${shot}: layout ${s.layout} exige slide`);
    if (s.slide) {
      if (!SLIDE_LAYOUTS.includes(s.layout)) problems.push(`${shot}: slide preenchido com layout ${s.layout}; use um layout com slide ou slide null`);
      const maxBullets = s.layout === 'presenter_chips' ? CHIPS_LIMITS.chips : card ? CARD_LIMITS.bullets : MAX_SLIDE_BULLETS;
      const maxBulletWords = card ? CARD_LIMITS.bulletWords : MAX_BULLET_WORDS;
      if (s.slide.bullets.length > maxBullets) problems.push(`${card ? 'CARD_TOO_MANY_BULLETS: ' : ''}${shot}: ${card ? 'cartão' : 'slide'} com ${s.slide.bullets.length} tópicos (máximo ${maxBullets})`);
      if (s.slide.title.length > 80) problems.push(`${shot}: título do slide com ${s.slide.title.length} caracteres (máximo 80)`);
      if (card && words(stripBold(s.slide.title)) > CARD_LIMITS.titleWords) problems.push(`CARD_TITLE_TOO_LONG: ${shot}: título do cartão com ${words(stripBold(s.slide.title))} palavras (máximo ${CARD_LIMITS.titleWords})`);
      if ((s.slide.highlight?.length ?? 0) > 120) problems.push(`${shot}: highlight do slide com ${s.slide.highlight!.length} caracteres (máximo 120)`);
      s.slide.bullets.forEach((b, j) => {
        const bw = words(stripBold(b));
        if (bw > maxBulletWords) problems.push(`${card ? 'CARD_BULLET_TOO_LONG: ' : ''}${shot}: tópico ${j + 1} do ${card ? 'cartão' : 'slide'} com ${bw} palavras (máximo ${maxBulletWords})`);
        else if (b.length > 90) problems.push(`${shot}: tópico ${j + 1} do slide com ${b.length} caracteres (máximo 90)`);
      });
      if (card && s.slide.bullets.length > 0 && s.slide.bullets.length < 2) problems.push(`${shot}: cartão com um tópico só; use 2 ou 3 tópicos (ou só o título com highlight)`);
      if (!s.slide.title.trim() && s.slide.bullets.length === 0 && !s.slide.highlight?.trim()) problems.push(`${shot}: slide vazio`);
    }
    if (s.layout === 'lower_third' && !s.caption?.trim()) problems.push(`${shot}: layout lower_third exige caption`);
  });
  return problems;
}

/**
 * Aviso (não erro): a cena alterna a posição do apresentador mais de uma vez
 * (ex.: em pé à direita → sentada em tela cheia → em pé à direita). Uma mudança
 * por cena é um corte bem-vindo; alternar a cada plano cansa e denuncia a
 * montagem. Só contam os planos em que o apresentador aparece (fora `slide` e
 * `cinematic`). cameraId null = câmera principal (a primeira do kit).
 */
export function directionPlacementWarnings(
  shots: ReadonlyArray<{ id: string; cameraId?: string | null; layout: string }>,
  cameras: ReadonlyArray<Pick<Camera, 'id'> & Partial<Pick<Camera, 'placement' | 'scale'>>>,
  placement?: { presenterPlacement?: string | null; presenterScale?: number | null },
): Array<{ shotId: string; message: string }> {
  const seq: Array<{ id: string; p: ResolvedPlacement }> = [];
  for (const s of shots) {
    if (!layoutShowsPresenter(s.layout)) continue;
    const cam = s.cameraId ? cameras.find((c) => c.id === s.cameraId) : cameras[0];
    seq.push({ id: s.id, p: resolveCameraPlacement(placement, cam ?? null).placement });
  }
  const changes = seq.filter((x, i) => i > 0 && x.p !== seq[i - 1]!.p);
  if (changes.length <= 1) return [];
  return [{ shotId: changes[1]!.id, message: `a posição do apresentador muda ${changes.length} vezes na cena (${seq.map((x) => x.p).join(' → ')}); mude no máximo uma vez por cena (ex.: em pé à direita e depois sentada em tela cheia)` }];
}

/* ------------------------------------------------------------------ */
/* Estúdio com zonas                                                    */
/* ------------------------------------------------------------------ */

const SENTENCE_END_RE = /[.!?…]["'”’»)]*\s*$/;

/**
 * Regras do estúdio com zonas, com CORREÇÃO automática (a direção segue
 * válida; cada ajuste vira um aviso com código):
 * - CHIPS_ON_CENTER_CAMERA: pílulas numa câmera centralizada (ou sem zona)
 *   vão para a câmera de zona que alterna com as pílulas anteriores;
 * - CHIPS_SIDE_REPEAT: duas pílulas seguidas (na cena ou vindo da cena
 *   anterior, `previousChipsZone`) do mesmo lado: a segunda troca de lado;
 * - CUT_MID_SENTENCE (só aviso): troca de câmera entre planos sem fim de
 *   frase no plano anterior.
 * Devolve também o lado das últimas pílulas (para a próxima cena alternar).
 */
export function applyZoneRules(
  direction: SceneDirection,
  cameras: readonly CameraLike[],
  zones: ZoneCameraSet,
  previousChipsZone?: 'left' | 'right',
): { direction: SceneDirection; warnings: Array<{ shotId: string; message: string }>; lastChipsZone?: 'left' | 'right' } {
  const warnings: Array<{ shotId: string; message: string }> = [];
  const zoneOf = (cameraId: string | null | undefined): CameraZone | undefined => shotCamera(cameras, cameraId)?.zone;
  let prev = previousChipsZone;
  let changed = false;
  const shots = direction.shots.map((s) => {
    if (s.layout !== 'presenter_chips') return s;
    const z = zoneOf(s.cameraId);
    let next = s;
    if (z !== 'left' && z !== 'right') {
      const pick = nextChipsCamera(zones, prev);
      warnings.push({ shotId: s.id, message: `${CHIPS_ON_CENTER_CAMERA}: plano "${s.id}" com pílulas numa câmera ${z === 'center' ? 'centralizada (3/4)' : 'sem zona'} (não há parede livre); ajustado para a câmera de zona "${pick.cameraId}" (apresentadora à ${pick.zone === 'left' ? 'esquerda' : 'direita'})` });
      next = { ...s, cameraId: pick.cameraId };
    } else if (prev && z === prev) {
      const pick = nextChipsCamera(zones, prev);
      if (pick.zone !== z) {
        warnings.push({ shotId: s.id, message: `${CHIPS_SIDE_REPEAT}: plano "${s.id}" com pílulas do mesmo lado das anteriores; ajustado para a câmera "${pick.cameraId}" (alterna o lado)` });
        next = { ...s, cameraId: pick.cameraId };
      } else warnings.push({ shotId: s.id, message: `${CHIPS_SIDE_REPEAT}: plano "${s.id}" com pílulas do mesmo lado das anteriores (o kit só tem câmera de zona deste lado)` });
    }
    if (next !== s) changed = true;
    prev = zoneOf(next.cameraId) === 'right' ? 'right' : 'left';
    return next;
  });
  const out = changed ? { ...direction, shots } : direction;
  for (let i = 1; i < out.shots.length; i++) {
    const a = out.shots[i - 1]!;
    const b = out.shots[i]!;
    if (!layoutShowsPresenter(a.layout) || !layoutShowsPresenter(b.layout)) continue;
    if ((a.cameraId ?? null) !== (b.cameraId ?? null) && !SENTENCE_END_RE.test(a.line)) {
      warnings.push({ shotId: b.id, message: `${CUT_MID_SENTENCE}: troca de câmera antes do plano "${b.id}" no meio de uma frase; no estúdio com zonas o corte acontece só entre frases` });
    }
  }
  return { direction: out, warnings, ...(prev ? { lastChipsZone: prev } : {}) };
}

/** Lado (zona da apresentadora) das últimas pílulas de uma direção; undefined sem pílulas. */
export function lastChipsZoneOf(shots: ReadonlyArray<{ layout?: string; cameraId?: string | null }>, cameras: readonly CameraLike[]): 'left' | 'right' | undefined {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]!;
    if (s.layout !== 'presenter_chips') continue;
    const z = shotCamera(cameras, s.cameraId)?.zone;
    if (z === 'left' || z === 'right') return z;
  }
  return undefined;
}

/** Rótulos das pílulas de um plano (como a montagem desenha). */
export function chipsLabelsOf(bullets: readonly string[]): string[] {
  return bullets.slice(0, CHIPS_LIMITS.chips).map(chipLabel).filter(Boolean);
}

/**
 * Aviso (não erro): plano com apresentador sem gesto (`motionPrompt` vazio).
 * Com gestos naturais, todo plano explicativo com apresentador deve ter um
 * gesto do vocabulário seguro; a direção segue válida.
 */
export function directionGestureWarnings(shots: ReadonlyArray<{ id: string; layout: string; motionPrompt?: string | null }>): Array<{ shotId: string; message: string }> {
  return shots
    .filter((s) => layoutShowsPresenter(s.layout) && !(s.motionPrompt ?? '').trim())
    .map((s) => ({ shotId: s.id, message: `${MISSING_GESTURE}: plano "${s.id}" com apresentador sem gesto; acrescente um gesto natural (ex.: "moves both hands gently while explaining, calm")` }));
}

/**
 * Câmera em tela cheia sem zoom digital: planos numa câmera `full_frame` com
 * enquadramento mais fechado que o nativo ou com movimento digital são
 * CORRIGIDOS (enquadramento nativo, static) e cada um gera um aviso
 * ZOOM_ON_FULL_FRAME. A direção segue válida; devolve a direção corrigida.
 */
export function clampDirectionFullFrame(
  direction: SceneDirection,
  cameras: readonly CameraLike[],
  placement?: PlacementLike,
): { direction: SceneDirection; warnings: Array<{ shotId: string; message: string }> } {
  const { shots, adjusted } = clampFullFrameShots(direction.shots, placement, (s) => shotCamera(cameras, s.cameraId) as never);
  if (!adjusted.length) return { direction, warnings: [] };
  const before = new Map(direction.shots.map((s) => [s.id, s]));
  return {
    direction: { ...direction, shots },
    warnings: shots.filter((s) => adjusted.includes(s.id)).map((s) => {
      const b = before.get(s.id)!;
      return { shotId: s.id, message: `${ZOOM_ON_FULL_FRAME}: plano "${s.id}" numa câmera em tela cheia pedia ${b.framing}/${b.cameraMove}; a câmera em tela cheia não aceita zoom nem movimento digital (cortaria o cenário): ajustado para ${s.framing}/${s.cameraMove}` };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Pistas da fala (pré-calculadas para o diretor)                      */
/* ------------------------------------------------------------------ */

const CONTRAST_RE = /(?<!\p{L})(mas|porém|porem|só que|no entanto|entretanto|em vez de|ao contrário|contudo)(?!\p{L})/iu;
const TIME_PLACE_RE = /(?<!\p{L})(chega|chegar|chegou|chegando|entra|entrar|entrou|entrando|segunda|terça|quarta|quinta|sexta|sábado|domingo|manhã|tarde|noite|sala|prédio|escritório|vídeo ?chamada|videochamada|dias? depois|semana)(?!\p{L})/iu;

function isListSentence(t: string): boolean {
  const body = t.replace(/[.!?…]+["'”’»)]*$/, '');
  const commas = (body.match(/,/g) ?? []).length;
  return commas >= 2 || (/:/.test(body) && commas >= 1) || (commas === 1 && / e /.test(body.slice(body.indexOf(','))) && /:/.test(body));
}

/**
 * Pistas determinísticas da fala, por frase (s1, s2…): pergunta final,
 * perguntas no meio, contraste, lista, tempo/lugar e citação. Servem de apoio
 * ao diretor (planos_sugeridos e tabela por tipo de cena); não são regras.
 */
export function sceneCues(narration: string): string[] {
  const sentences = splitSentences(narration);
  const cues: string[] = [];
  const n = sentences.length;
  sentences.forEach((t, i) => {
    const k = `s${i + 1}`;
    if (/\?\s*["'”’»)]*$/.test(t)) cues.push(i === n - 1 ? 'pergunta_final' : `pergunta:${k}`);
    if (CONTRAST_RE.test(t)) cues.push(`contraste:${k}`);
    if (isListSentence(t)) cues.push(`lista:${k}`);
    if (i === 0 && TIME_PLACE_RE.test(t)) cues.push(`tempo_lugar:${k}`);
  });
  if (/[“”"«»]/.test(narration)) cues.push('citacao');
  if (spokenWords(narration).length < 8) cues.push('fala_curta');
  return cues;
}
