import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffprobe, runFfmpeg, sec } from './ffmpeg';
import { normalizeLoudnessInPlace, type LoudnessResult } from './loudness';
import { crossfadeForPose, poseDifference } from './pose';
import { JOIN, cleanTransitions, framingPunchPlan, joinPause, tightenFromFile, zoneFocusX, type TightenResult } from './join';
import { renderBrandCardToFile, renderCaptionToFile, renderSlideToFile, slideToneFor, type SlideSpec } from './slides';
import { renderWatermarkToFile, watermarkPlacementFor } from './watermark';
import { skipIfUnrenderable } from './raster';
import { PANEL_SHIFT, panelRevealTimes, panelSpecFromSlide, renderPanelStatesToFiles } from './panel';
import { LOWER_THIRD_WINDOW, TEASER_FADE, chipPopFrameCount, chipTimeline, lowerThirdWindow, renderChipsGraphics, renderLowerThirdSprite, renderTeaserSprite, teaserWindow, type ChipsGraphics, type PlacedSprite, type Zone, type ZonePaletteInput } from './zones';
import type { WatermarkCorner } from '../brand-tokens';

/**
 * Compositor de cena dirigida (ffmpeg). Cada plano usa o clipe do apresentador
 * daquele plano (o áudio sempre vem do clipe), aplica enquadramento como zoom
 * digital relativo ao enquadramento nativo da câmera, movimento de câmera,
 * layout (apresentador, tela dividida com slide, slide com PiP, slide, letreiro)
 * e junta os planos com transições. A FALA NUNCA É ENCOBERTA: o áudio dos planos
 * é sempre concatenado (sem acrossfade) e a transição visual (xfade), quando existe,
 * acontece sobre o último quadro congelado do plano que sai (tpad) enquanto o plano
 * que entra já começa — duração total = soma das durações dos planos.
 *
 * Emendas sem "travamento" (`ComposeSceneInput.joins`, padrão ligado; ver join.ts): o
 * plano do apresentador que sai termina logo depois da última palavra e o que entra
 * começa um instante antes da primeira (corte no ponto de menor volume), a imagem não
 * congela além de 1 quadro, a troca é corte seco (a fusão sobre quadro congelado só
 * escondia a parada) e planos seguidos da mesma câmera alternam o enquadramento
 * (punch-in leve, centrado no rosto). Com `joins: false` vale a montagem antiga.
 *
 * O grafo de filtros é gerado por uma função pura (`buildComposeCommand`), testável
 * sem ffmpeg; `composeScene` só sonda os clipes, monta o plano e executa.
 *
 * Layout `cinematic` (cena em movimento): vídeo do clipe em tela cheia, SEM o
 * áudio próprio do clipe (mudo) — o áudio é o trecho da narração do plano
 * (`ShotClip.audioPath`). A duração do plano é a MAIOR entre a narração e o
 * clipe (a imagem tem um mínimo por ação e pode durar mais que a fala): com o
 * clipe mais longo, a narração entra depois de um respiro (`cinematicShotTiming`:
 * metade da sobra, até 1,2 s) e o resto é silêncio; com a narração mais longa, o
 * vídeo desacelera até 10% e, se ainda faltar, congela o último quadro.
 * Letreiro (`caption`) opcional por cima; sem slide.
 * `framing` e `cameraMove` são ignorados: o movimento já está no clipe.
 *
 * Layout `card` (cartão de marca): como `slide`, em tela cheia e sem o
 * apresentador (só o áudio do trecho), mas desenhado pelo modelo de cartão da
 * marca (`renderBrandCardPng`: título + tópicos com palavras-chave em negrito,
 * variante clara/marinho).
 *
 * Layout `presenter_panel` (apresentadora + painel, cartão padrão em câmera
 * única): o clipe do apresentador em TELA CHEIA, só deslocado ~7,8% para a
 * direita (sem zoom nem movimento: `framing`/`cameraMove` ignorados), sob a
 * camada do painel (compose/panel.ts) trocada por estado quando cada tópico é
 * dito (`overlay … enable='gte(t,a)*lt(t,b)'`, janelas sem sobreposição). Sem os estados, cai para `presenter`.
 *
 * Layout `presenter_chips` (estúdio com zonas, compose/zones.ts): o clipe da
 * câmera de zona em TELA CHEIA sem transformação nenhuma (a câmera já deixa a
 * parede livre); por cima, na coluna da parede livre (`ShotClip.zone`), o
 * painel de vidro marinho (entra em 0,25 s) e as pílulas que surgem quando
 * ditas (sprites do pop com o tempo deslocado, halo na atual, assentadas
 * depois). Sem os gráficos, cai para `presenter`.
 *
 * Camadas da CENA (depois das transições, no tempo final): letreiro com o nome
 * (`ComposePlan.lowerThird`, 0,6–4,5 s, desliza da esquerda) e a pergunta a
 * seguir (`ComposePlan.teaser`, últimos ≈ 3 s, sobe e acende); o painel de
 * pílulas que ainda estiver na tela some quando a pergunta entra.
 *
 * Marca d'água (`ComposeSceneInput.watermark`): logo da marca no rodapé de
 * CADA plano (sobreposto antes das transições, então acompanha o corte), com a
 * superfície certa por layout (logo branco com sombra suave sobre o vídeo;
 * colorido/branco sobre cartão claro/marinho) — ver compose/watermark.ts.
 */
export type Framing = 'wide' | 'medium' | 'close' | 'extreme_close';
export type Layout = 'presenter' | 'presenter_slide_right' | 'presenter_slide_left' | 'slide_with_pip' | 'slide' | 'lower_third' | 'cinematic' | 'card' | 'presenter_panel' | 'presenter_chips';
export type CameraMove = 'static' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'drift';
export type Transition = 'cut' | 'crossfade' | 'whip' | 'dip_to_color';

/** Estruturalmente compatível com `Shot` de @lms/course-schema. */
export interface ComposeShot {
  id: string;
  framing?: Framing;
  layout?: Layout;
  cameraMove?: CameraMove;
  transitionIn?: Transition;
  slide?: SlideSpec;
  caption?: string;
  /** câmera do plano (a mesma câmera em planos seguidos alterna o enquadramento: `framingPunchPlan`) */
  cameraId?: string;
  /** fala do plano (a pausa na emenda é maior depois de fim de frase) */
  line?: string;
}

/**
 * Mídia de um plano: clipe do apresentador (`videoPath`, áudio vem dele) ou,
 * para o layout `slide` (apresentador invisível), apenas o áudio do trecho
 * (`audioPath`) — economiza um clipe pago no provedor. Com os DOIS (cena em
 * movimento), o vídeo vem do clipe (mudo) e o áudio vem de `audioPath`, que
 * também define a duração do plano.
 */
export interface ShotClip {
  videoPath?: string;
  audioPath?: string;
  cameraNativeFraming?: Framing;
  /** início do trecho do clipe usado por este plano (clipe compartilhado por planos fundidos) */
  startSeconds?: number;
  /** duração do trecho; ausente = até o fim do clipe */
  durationSeconds?: number;
  /**
   * centro horizontal do apresentador no clipe (fração da largura; padrão 0,5):
   * clipe já posicionado à direita/esquerda (placePresenter) — os recortes de
   * enquadramento e da tela dividida seguem a pessoa, não o meio do quadro
   */
  focusX?: number;
  /** estúdio com zonas: onde a apresentadora está no quadro da câmera do plano (a parede livre fica do outro lado) */
  zone?: Zone;
  /**
   * alinhamento por palavra do clipe (tempo do ARQUIVO do clipe): a emenda termina ~0,1 s depois da última palavra
   * e começa um instante antes da primeira (`tightenBounds`); sem ele, só o som decide
   */
  words?: Array<{ start: number; end: number }>;
}

/** fração do quadro largo visível em cada enquadramento */
export const FRAMING_SCALE: Record<Framing, number> = { wide: 1, medium: 0.8, close: 0.6, extreme_close: 0.45 };

export const TRANSITION_SPEC: Record<Transition, { xfade?: string; duration: number }> = {
  cut: { duration: 0 },
  crossfade: { xfade: 'fade', duration: 0.4 },
  whip: { xfade: 'slideleft', duration: 0.25 },
  dip_to_color: { xfade: 'fadeblack', duration: 0.5 },
};

const SLIDE_LAYOUTS: Layout[] = ['presenter_slide_right', 'presenter_slide_left', 'slide_with_pip', 'slide', 'card'];
/** Layouts em que o apresentador NÃO aparece (só o áudio do trecho; nenhum clipe pago). */
export const PRESENTERLESS_LAYOUTS: readonly Layout[] = ['slide', 'card'];
export function layoutHidesPresenter(layout: Layout | undefined): boolean {
  return !!layout && PRESENTERLESS_LAYOUTS.includes(layout);
}

/** Maior desaceleração aplicada a um clipe de cena em movimento mais curto que a narração (10%). */
export const CINEMATIC_MAX_SLOWDOWN = 1.1;
/** Maior respiro antes da narração numa cena em movimento mais longa que a fala (s). */
export const CINEMATIC_MAX_LEAD_IN = 1.2;

/**
 * Tempo do plano de cena em movimento: dura o maior entre narração e clipe; a
 * narração começa depois de `leadIn` = metade da sobra do clipe (até 1,2 s).
 */
export function cinematicShotTiming(narrationSeconds: number, clipSeconds: number | undefined): { duration: number; leadIn: number } {
  const narr = Math.max(0, narrationSeconds);
  const clip = clipSeconds && clipSeconds > 0 ? clipSeconds : 0;
  return { duration: Math.max(narr, clip), leadIn: Math.min(CINEMATIC_MAX_LEAD_IN, Math.max(0, clip - narr) * 0.5) };
}

/** Tamanho do PNG de slide que cada layout consome (null = layout sem slide). */
export function slideSizeForLayout(layout: Layout, width = 1920, height = 1080): { width: number; height: number } | null {
  if (layout === 'presenter_slide_left' || layout === 'presenter_slide_right') return { width: even(width / 2), height };
  if (layout === 'slide' || layout === 'slide_with_pip' || layout === 'card') return { width, height };
  return null;
}

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Zoom relativo: quanto recortar do clipe para ir do enquadramento nativo ao pedido (nunca "abre" além do nativo). */
export function framingCropRatio(target: Framing, native: Framing): number {
  return Math.min(1, FRAMING_SCALE[target] / FRAMING_SCALE[native]);
}

/** centro vertical do recorte: planos fechados sobem para o terço superior (rosto) */
export function framingFocusY(ratio: number): number {
  return 0.5 - (1 - ratio) * 0.3;
}

export interface PlannedShot {
  id: string;
  layout: Layout;
  framing: Framing;
  nativeFraming: Framing;
  move: CameraMove;
  transition: Transition;
  /** duração da transição (s), no lugar da padrão do tipo; 0 = corte seco (fusão adaptada à pose) */
  transitionSeconds?: number;
  duration: number;
  clip: {
    path: string; width?: number; height?: number; hasAudio: boolean; /** padrão true */ hasVideo?: boolean; start?: number;
    /** áudio separado (narração do plano): o áudio do clipe é ignorado (mudo) */
    audioPath?: string;
    /** atraso (s) do áudio separado: respiro antes da narração (cena em movimento mais longa que a fala) */
    audioDelay?: number;
    /**
     * duração do vídeo do clipe a partir de `start`: cena em movimento desacelera até 10% se for mais curto que o
     * plano; apresentador congela no máximo 1 quadro além dela (`presenterFreeze`)
     */
    videoSeconds?: number;
    /** centro horizontal do apresentador no clipe (padrão 0,5) */
    focusX?: number;
  };
  slidePath?: string;
  captionPath?: string;
  /** PNG transparente do tamanho do quadro com a marca d'água deste plano */
  watermarkPath?: string;
  /** painel (`presenter_panel`): camada de cada estado e o instante (s, no plano) em que entra; o primeiro em 0 */
  panelStates?: Array<{ path: string; from: number }>;
  /** pílulas (`presenter_chips`): painel e sprites com os tempos (s, no plano) */
  chips?: PlannedChips;
  /** punch-in alternado (zoom ≥ 1 sobre o enquadramento do plano; ausente/1 = enquadramento base) */
  punch?: number;
}

export interface PlannedChips {
  /** painel por estado (j pílulas): entra em `from` (o primeiro em 0, com fade) e sai em `to` */
  panels: Array<{ path: string; x: number; y: number; from: number; to: number }>;
  chips: Array<{
    x: number; y: number;
    /** quadros do pop (padrão %02d), quantos são, e o instante em que começa */
    popPattern: string; popCount: number; at: number;
    /** apagada (ainda não dita) de 0 até `at` */
    wait?: string;
    /** com halo de haloFrom até haloUntil; assentada depois */
    halo: string; haloFrom: number; haloUntil: number;
    settled: string;
  }>;
}

export interface ComposePlan {
  width: number;
  height: number;
  fps: number;
  background: string;
  shots: PlannedShot[];
  /** letreiro com o nome (sprite posicionado), na janela `lowerThirdWindow` da cena */
  lowerThird?: PlacedSprite;
  /** pergunta a seguir (sprite posicionado), nos últimos ≈ 3 s da cena */
  teaser?: PlacedSprite;
}

export interface ShotTimelineEntry {
  id: string;
  /** início do plano na cena montada (s) */
  start: number;
  duration: number;
  /** atraso do áudio dentro do plano (s); 0 fora da cena em movimento */
  audioDelay: number;
  /** onde, no clipe, este plano realmente começa (s): o começo do trecho depois do aperto da emenda; ausente = plano sem clipe de vídeo */
  clipStart?: number;
}

export interface ComposeCommand {
  /** argumentos de entrada do ffmpeg (todos os -i, na ordem) */
  inputArgs: string[];
  filterComplex: string;
  videoLabel: string;
  audioLabel: string;
  /** duração final esperada = soma das durações dos planos (as transições não encurtam a cena) */
  totalDuration: number;
  /** sobreposição de ÁUDIO antes de cada plano: sempre 0 (a fala nunca é encoberta) */
  overlaps: number[];
  /** duração da transição VISUAL antes de cada plano (0 = corte seco); acontece sobre o quadro congelado do plano anterior */
  transitions: number[];
  /** linha do tempo final de cada plano: início, duração e atraso da narração (respiro da cena em movimento) */
  timeline: ShotTimelineEntry[];
  /** layout efetivamente usado (cai para `presenter` se faltar slide/letreiro) */
  layouts: Layout[];
  /** janelas das camadas da cena (s, tempo final): letreiro e pergunta a seguir */
  overlays: { lowerThird?: { from: number; to: number }; teaser?: { from: number; to: number } };
}

/** x do recorte de largura `cw` centrado em `fx` (fração), dentro do quadro */
function focusCropX(W: number, cw: number, fx = 0.5): number {
  return Math.min(W - cw, Math.max(0, Math.round(fx * W - cw / 2)));
}

function moveFilter(move: CameraMove, ratio: number, W: number, H: number, fps: number, duration: number, focusX = 0.5, punched = false): string {
  const fy = framingFocusY(ratio);
  const Z0 = 1 / ratio;
  if (move === 'static') {
    if (ratio >= 0.999) return '';
    const cw = even(W * ratio);
    const ch = even(H * ratio);
    const x = focusCropX(W, cw, focusX);
    // punch-in: o recorte tira quase tudo de baixo (o corpo) e no máximo `punchTopCut` do topo — a cabeça nunca é cortada
    const y = punched
      ? Math.round(Math.min(H - ch, Math.max(0, Math.min(JOIN.punchTopCut * H, (H - ch) * 0.12))))
      : Math.round(Math.min(H - ch, Math.max(0, fy * H - ch / 2)));
    return `crop=${cw}:${ch}:${x}:${y},scale=${W}:${H}:flags=lanczos,setsar=1`;
  }
  const N = Math.max(1, Math.round(duration * fps) - 1);
  // progresso suavizado (smoothstep) de 0 a 1 ao longo do plano
  const E = `(min(on/${N},1)*min(on/${N},1)*(3-2*min(on/${N},1)))`;
  const f = (n: number) => Number(n.toFixed(4));
  let z: string;
  let x: string;
  let y: string;
  const cx = `(iw*${f(focusX)}-iw/zoom/2)`;
  const cy = `(ih*${f(fy)}-ih/zoom/2)`;
  const slackX = `(iw-iw/zoom)`;
  const slackY = `(ih-ih/zoom)`;
  switch (move) {
    case 'push_in':
      z = `${f(Z0)}*(1+0.12*${E})`;
      x = cx; y = cy;
      break;
    case 'pull_out':
      z = `${f(Z0)}*(1.12-0.12*${E})`;
      x = cx; y = cy;
      break;
    case 'pan_left':
    case 'pan_right': {
      z = `${f(Math.max(Z0, 1.12))}`;
      const p = move === 'pan_right' ? E : `(1-${E})`;
      x = `${slackX}*(0.1+0.8*${p})`;
      y = cy;
      break;
    }
    case 'drift':
    default:
      z = `${f(Z0 * 1.06)}`;
      x = `${slackX}*(0.5+0.3*sin(2*PI*on/${fps * 9}))`;
      y = `(${cy}+${slackY}*0.15*sin(2*PI*on/${fps * 13}))`;
      break;
  }
  // supersampling 2x antes do zoompan evita o "tremido" do arredondamento de pixel
  return `scale=${W * 2}:${H * 2}:flags=bicubic,zoompan=z='${z}':x='clip(${x},0,iw-iw/zoom)':y='clip(${y},0,ih-ih/zoom)':d=1:s=${W}x${H}:fps=${fps},setsar=1`;
}

/** Fator de desaceleração (1 = nenhum) para o vídeo da cena em movimento cobrir `duration`; o resto é quadro congelado. */
export function cinematicSlowdown(videoSeconds: number | undefined, duration: number): number {
  if (!videoSeconds || videoSeconds <= 0 || videoSeconds >= duration) return 1;
  return Math.min(CINEMATIC_MAX_SLOWDOWN, duration / videoSeconds);
}

/**
 * Quanto quadro congelado ao fim do clipe (tpad): o apresentador nunca congela além de 1 quadro. Com a duração do
 * vídeo conhecida, só o que falta (no máximo 1 quadro a mais); sem ela, o padrão antigo de 2 s.
 */
export function presenterFreeze(videoSeconds: number | undefined, duration: number, fps: number): number {
  if (videoSeconds === undefined) return 2;
  const frame = 1 / fps;
  return Math.max(frame, Math.min(2, duration - videoSeconds + frame));
}

function normalizeClip(clip: PlannedShot['clip'], W: number, H: number, fps: number, bg: string, duration: number, slow = 1, freezeSeconds = 2): string {
  const target = W / H;
  const ar = clip.width && clip.height ? clip.width / clip.height : target;
  const fill = Math.abs(ar - target) / target < 0.05;
  const geom = fill
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${bg.replace('#', '0x')}`;
  const head = clip.start && clip.start > 0 ? `trim=start=${sec(clip.start)},setpts=PTS-STARTPTS,` : '';
  const stretch = slow > 1.0005 ? `setpts=${slow.toFixed(4)}*PTS,` : '';
  return `${head}${stretch}fps=${fps},${geom},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${freezeSeconds},trim=duration=${sec(duration)},setpts=PTS-STARTPTS`;
}

/** Monta entradas e filtergraph (função pura). */
export function buildComposeCommand(plan: ComposePlan): ComposeCommand {
  const { width: W, height: H, fps, background } = plan;
  if (plan.shots.length === 0) throw new Error('cena sem planos');
  const inputArgs: string[] = [];
  let nextInput = 0;
  const addInput = (args: string[]) => {
    inputArgs.push(...args);
    return nextInput++;
  };
  const chains: string[] = [];
  const layouts: Layout[] = [];
  const durations: number[] = [];
  const delays: number[] = [];
  const tail = `fps=${fps},format=yuv420p,setsar=1,settb=AVTB`;

  // durações e transições alinhadas a quadros: offsets do xfade caem sempre num quadro exato
  const frames = (t: number) => Math.round(t * fps) / fps;
  const allDurations = plan.shots.map((s) => Math.max(frames(0.2), frames(s.duration)));
  const total = allDurations.reduce((a, b) => a + b, 0);
  // a pergunta a seguir ocupa os últimos ≈ 3 s: o painel de pílulas que ainda estiver na tela some quando ela entra
  const teaserWin = plan.teaser ? teaserWindow(total) : undefined;
  let shotStart = 0;
  plan.shots.forEach((s, i) => {
    const D = allDurations[i]!;
    const start = shotStart;
    shotStart += D;
    durations.push(D);
    let layout = s.layout;
    if (SLIDE_LAYOUTS.includes(layout) && !s.slidePath) layout = 'presenter';
    if (layout === 'lower_third' && !s.captionPath) layout = 'presenter';
    if (layout === 'presenter_panel' && !s.panelStates?.length) layout = 'presenter';
    if (layout === 'presenter_chips' && !s.chips) layout = 'presenter';
    const cinematic = layout === 'cinematic';
    if (!layoutHidesPresenter(layout) && s.clip.hasVideo === false) throw new Error(`plano "${s.id}": sem vídeo do apresentador, só o layout "slide" (com slide) é possível`);
    layouts.push(layout);

    const ci = addInput(['-i', s.clip.path]);
    // áudio separado (cena em movimento): o som do clipe é descartado e a narração do plano entra no lugar
    const ai = s.clip.audioPath ? addInput(['-i', s.clip.audioPath]) : s.clip.hasAudio ? ci : addInput(['-f', 'lavfi', '-t', sec(D), '-i', 'anullsrc=r=48000:cl=stereo']);
    const aHead = !s.clip.audioPath && s.clip.hasAudio && s.clip.start && s.clip.start > 0 ? `atrim=start=${sec(s.clip.start)},asetpts=PTS-STARTPTS,` : '';
    // respiro antes da narração (silêncio antes; o apad completa o silêncio depois)
    const delayMs = s.clip.audioPath && s.clip.audioDelay && s.clip.audioDelay > 0 ? Math.round(Math.min(s.clip.audioDelay, Math.max(0, D - 0.1)) * 1000) : 0;
    const aDelay = delayMs > 0 ? `,adelay=delays=${delayMs}:all=1` : '';
    delays.push(delayMs / 1000);
    // micro-fades nas bordas do plano (entrada 12 ms, saída 25 ms): a junção concatenada não estala nem "fissura"
    const aEdge = D > 0.1 ? `,afade=t=in:st=0:d=0.012,afade=t=out:st=${sec(Math.max(0, D - 0.025))}:d=0.025` : '';
    chains.push(`[${ai}:a]${aHead}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${aDelay},apad,atrim=duration=${sec(D)},asetpts=PTS-STARTPTS${aEdge}[a${i}]`);

    const needsPresenter = !layoutHidesPresenter(layout);
    if (cinematic) {
      // movimento já está no clipe: sem recorte de enquadramento nem movimento digital
      chains.push(`[${ci}:v]${normalizeClip(s.clip, W, H, fps, background, D, cinematicSlowdown(s.clip.videoSeconds, D), Math.max(2, Math.ceil(D)))}[p${i}]`);
    } else if (needsPresenter) {
      // painel: só o deslocamento; pílulas: nada (nenhum zoom/movimento digital)
      const fixed = layout === 'presenter_panel' || layout === 'presenter_chips';
      // punch-in alternado (só onde cabe sem cortar nada: ver `punchFits`); com ele, o plano fixo vira recorte estático
      const punch = s.punch && s.punch > 1 && (layout === 'presenter' || layout === 'lower_third' || layout === 'presenter_chips') ? s.punch : 1;
      const ratio = (fixed ? 1 : framingCropRatio(s.framing, s.nativeFraming)) / punch;
      const mv = fixed && punch === 1 ? '' : moveFilter(punch > 1 ? 'static' : s.move, ratio, W, H, fps, D, s.clip.focusX, punch > 1);
      chains.push(`[${ci}:v]${normalizeClip(s.clip, W, H, fps, background, D, 1, presenterFreeze(s.clip.videoSeconds, D, fps))}${mv ? `,${mv}` : ''}[p${i}]`);
    }
    // com marca d'água, o layout sai em [r i] e a marca d'água fecha em [v i]
    const vo = s.watermarkPath ? `r${i}` : `v${i}`;
    const slideInput = (w: number, h: number) => {
      const si = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(D), '-i', s.slidePath!]);
      chains.push(`[${si}:v]scale=${w}:${h},setsar=1,format=yuv420p,trim=duration=${sec(D)},setpts=PTS-STARTPTS[s${i}]`);
    };
    switch (layout) {
      case 'presenter':
        chains.push(`[p${i}]${tail}[${vo}]`);
        break;
      case 'presenter_slide_right':
      case 'presenter_slide_left': {
        const half = even(W / 2);
        slideInput(W - half, H);
        chains.push(`[p${i}]crop=${half}:${H}:${focusCropX(W, half, s.clip.focusX)}:0[ph${i}]`);
        const pair = layout === 'presenter_slide_right' ? `[ph${i}][s${i}]` : `[s${i}][ph${i}]`;
        chains.push(`${pair}hstack=inputs=2,${tail}[${vo}]`);
        break;
      }
      case 'slide_with_pip': {
        slideInput(W, H);
        const pw = even(W * 0.28);
        const ph = even((pw * H) / W);
        const m = Math.round(W * 0.03);
        const r = Math.round(pw * 0.06);
        const alpha = `if(lte(hypot(max(0,abs(X-W/2)-(W/2-${r})),max(0,abs(Y-H/2)-(H/2-${r}))),${r}),255,0)`;
        chains.push(`[p${i}]scale=${pw}:${ph},format=yuva444p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${alpha}'[pip${i}]`);
        chains.push(`[s${i}][pip${i}]overlay=x=${W - pw - m}:y=${H - ph - m}:format=auto,${tail}[${vo}]`);
        break;
      }
      case 'slide':
      case 'card':
        slideInput(W, H);
        chains.push(`[s${i}]${tail}[${vo}]`);
        break;
      case 'cinematic': {
        if (s.captionPath) {
          const ki = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(D), '-i', s.captionPath]);
          chains.push(`[${ki}:v]scale=${W}:${H},format=rgba,fade=t=in:st=0.25:d=0.35:alpha=1,trim=duration=${sec(D)},setpts=PTS-STARTPTS[c${i}]`);
          chains.push(`[p${i}][c${i}]overlay=0:0:format=auto,${tail}[${vo}]`);
        } else chains.push(`[p${i}]${tail}[${vo}]`);
        break;
      }
      case 'presenter_panel': {
        // tela cheia deslocada à direita; a faixa exposta à esquerda fica sob a sombra do painel
        const sh = even(W * PANEL_SHIFT);
        chains.push(`[p${i}]crop=${W - sh}:${H}:0:0,pad=${W}:${H}:${sh}:0:color=0x0f1030[pb${i}]`);
        const states = s.panelStates!;
        let cur = `pb${i}`;
        states.forEach((st, j) => {
          const si = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(D), '-i', st.path]);
          const a = Math.max(0, Math.min(D, st.from));
          const b = j + 1 < states.length ? Math.max(a, Math.min(D, states[j + 1]!.from)) : D + 1;
          chains.push(`[${si}:v]format=rgba,trim=duration=${sec(D)},setpts=PTS-STARTPTS[pl${i}_${j}]`);
          const next = j === states.length - 1 ? `pz${i}` : `pq${i}_${j}`;
          chains.push(`[${cur}][pl${i}_${j}]overlay=0:0:format=auto:enable='gte(t,${sec(a)})*lt(t,${sec(b)})'[${next}]`);
          cur = next;
        });
        chains.push(`[${cur}]${tail}[${vo}]`);
        break;
      }
      case 'presenter_chips': {
        // tela cheia sem transformação; véu + título + pílulas no lado livre até o fim do plano (a pergunta a seguir entra abaixo das pílulas)
        const c = s.chips!;
        const until = D;
        const en = until < D - 1e-6 ? `:enable='lt(t,${sec(until)})'` : '';
        let cur = `p${i}`;
        let kn = 0;
        const over = (src: string, x: number, y: number, extra = '') => {
          const next = `kq${i}_${kn++}`;
          chains.push(`[${cur}][${src}]overlay=${x}:${y}${extra}:format=auto${en}[${next}]`);
          cur = next;
        };
        if (until > 0.05) {
          // painel: um estado por quantidade de pílulas (cresce para baixo quando cada uma surge)
          c.panels.forEach((pn, j) => {
            const from = Math.max(0, Math.min(until, pn.from));
            const to = Math.max(from, Math.min(D, pn.to));
            if (to - from < 0.02) return;
            const pi = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(to - from), '-i', pn.path]);
            chains.push(`[${pi}:v]format=rgba,${j === 0 ? 'fade=t=in:st=0:d=0.25:alpha=1,' : ''}setpts=PTS-STARTPTS+${sec(from)}/TB[kp${i}_${j}]`);
            over(`kp${i}_${j}`, pn.x, pn.y, ':eof_action=pass');
          });
          c.chips.forEach((ch, j) => {
            // apagada (35%) até ser dita: o aluno vê o que vem
            if (ch.wait && ch.at > 0.02) {
              const wi = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(Math.min(ch.at, D)), '-i', ch.wait]);
              chains.push(`[${wi}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,setpts=PTS-STARTPTS[kw${i}_${j}]`);
              over(`kw${i}_${j}`, ch.x, ch.y, ':eof_action=pass');
            }
            if (ch.at >= until) return;
            // pop: sequência curta de quadros começando em `at`
            const qi = addInput(['-framerate', String(fps), '-start_number', '0', '-i', ch.popPattern]);
            chains.push(`[${qi}:v]format=rgba,setpts=PTS-STARTPTS+${sec(ch.at)}/TB[kc${i}_${j}]`);
            over(`kc${i}_${j}`, ch.x, ch.y, ':eof_action=pass');
            const haloDur = Math.min(ch.haloUntil, D) - ch.haloFrom;
            if (haloDur > 0.02) {
              const hi = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(haloDur), '-i', ch.halo]);
              chains.push(`[${hi}:v]format=rgba,setpts=PTS-STARTPTS+${sec(ch.haloFrom)}/TB[kh${i}_${j}]`);
              over(`kh${i}_${j}`, ch.x, ch.y, ':eof_action=pass');
            }
            const settledDur = D - ch.haloUntil;
            if (settledDur > 0.02) {
              const ti = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(settledDur), '-i', ch.settled]);
              chains.push(`[${ti}:v]format=rgba,setpts=PTS-STARTPTS+${sec(ch.haloUntil)}/TB[ks${i}_${j}]`);
              over(`ks${i}_${j}`, ch.x, ch.y, ':eof_action=pass');
            }
          });
        }
        chains.push(`[${cur}]${tail}[${vo}]`);
        break;
      }
      case 'lower_third': {
        const ki = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(D), '-i', s.captionPath!]);
        chains.push(`[${ki}:v]scale=${W}:${H},format=rgba,fade=t=in:st=0.25:d=0.35:alpha=1,trim=duration=${sec(D)},setpts=PTS-STARTPTS[c${i}]`);
        chains.push(`[p${i}][c${i}]overlay=0:0:format=auto,${tail}[${vo}]`);
        break;
      }
    }
    if (s.watermarkPath) {
      const wi = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(D), '-i', s.watermarkPath]);
      // mesma base de tempo do plano (AVTB): com bases diferentes o overlay perdia o ÚLTIMO quadro de cada plano (~1 por plano; imagem mais curta que o som)
      chains.push(`[${wi}:v]format=rgba,trim=duration=${sec(D)},setpts=PTS-STARTPTS,settb=AVTB[w${i}]`);
      chains.push(`[${vo}][w${i}]overlay=0:0:format=auto,${tail}[v${i}]`);
    }
  });

  // junção: áudio sempre concatenado (nada da fala é encoberto); vídeo com xfade
  // sobre o último quadro congelado do plano anterior (tpad) — duração = soma dos planos
  const overlaps: number[] = [0];
  const transitions: number[] = [0];
  let v = 'v0';
  let a = 'a0';
  let acc = durations[0]!;
  const starts: number[] = [0];
  for (let i = 1; i < plan.shots.length; i++) {
    starts.push(acc);
    const spec = TRANSITION_SPEC[plan.shots[i]!.transition] ?? TRANSITION_SPEC.cut;
    const want = plan.shots[i]!.transitionSeconds ?? spec.duration;
    // a transição cobre o começo do plano que entra: no máximo 45% dele
    const T = spec.xfade && want > 0 ? Math.min(want, 0.45 * Math.min(durations[i - 1]!, durations[i]!)) : 0;
    const T3 = Number((Math.floor(T * fps) / fps).toFixed(3));
    const nv = `xv${i}`;
    const na = `xa${i}`;
    // relógio único em toda junção (base AVTB, pts pelo nº do quadro): misturar concat (corte seco) e xfade com
    // bases diferentes fazia o xfade descartar o resto da imagem (vídeo acabava antes do áudio: imagem congelada)
    const clock = `settb=AVTB,setpts=N/(${fps}*TB)`;
    if (T3 <= 0 || !spec.xfade) {
      chains.push(`[${v}]${clock}[cv${i}]`);
      chains.push(`[v${i}]${clock}[cn${i}]`);
      chains.push(`[cv${i}][cn${i}]concat=n=2:v=1:a=0,${clock}[${nv}]`);
      transitions.push(0);
    } else {
      chains.push(`[${v}]${clock},tpad=stop_mode=clone:stop_duration=${sec(T3)}[hv${i}]`);
      chains.push(`[v${i}]${clock}[cn${i}]`);
      chains.push(`[hv${i}][cn${i}]xfade=transition=${spec.xfade}:duration=${sec(T3)}:offset=${sec(acc)},${clock}[${nv}]`);
      transitions.push(T3);
    }
    chains.push(`[${a}][a${i}]concat=n=2:v=0:a=1[${na}]`);
    overlaps.push(0);
    acc += durations[i]!;
    v = nv;
    a = na;
  }
  // camadas da cena (tempo final, por cima das transições): letreiro com o nome e pergunta a seguir
  const overlays: ComposeCommand['overlays'] = {};
  const k = H / 1080;
  const joined = v;
  const lt = plan.lowerThird ? lowerThirdWindow(acc) : null;
  if (plan.lowerThird && lt) {
    const sl = LOWER_THIRD_WINDOW.slide;
    const li = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(lt.to), '-i', plan.lowerThird.path]);
    chains.push(`[${li}:v]format=rgba,fade=t=in:st=${sec(lt.from)}:d=${sec(sl)}:alpha=1,fade=t=out:st=${sec(lt.to - sl)}:d=${sec(sl)}:alpha=1[ltw]`);
    // desliza 40 px da esquerda na entrada e volta na saída (curva cúbica)
    const pin = `pow(1-min(1,max(0,(t-${sec(lt.from)})/${sec(sl)})),3)`;
    const pout = `pow(min(1,max(0,(t-${sec(lt.to - sl)})/${sec(sl)})),3)`;
    chains.push(`[${v}][ltw]overlay=x='${plan.lowerThird.x}-${Math.round(40 * k)}*(${pin}+${pout})':y=${plan.lowerThird.y}:eval=frame:format=auto:enable='between(t,${sec(lt.from)},${sec(lt.to)})'[ltv]`);
    v = 'ltv';
    overlays.lowerThird = lt;
  }
  if (plan.teaser && teaserWin && teaserWin.to - teaserWin.from > 0.3) {
    const ti = addInput(['-loop', '1', '-framerate', String(fps), '-t', sec(teaserWin.to - teaserWin.from), '-i', plan.teaser.path]);
    chains.push(`[${ti}:v]format=rgba,setpts=PTS-STARTPTS+${sec(teaserWin.from)}/TB,fade=t=in:st=${sec(teaserWin.from)}:d=${sec(TEASER_FADE)}:alpha=1[tzw]`);
    // sobe 30 px enquanto acende
    chains.push(`[${v}][tzw]overlay=x=${plan.teaser.x}:y='${plan.teaser.y}+${Math.round(30 * k)}*pow(1-min(1,max(0,(t-${sec(teaserWin.from)})/${sec(TEASER_FADE)})),3)':eval=frame:format=auto[tzv]`);
    v = 'tzv';
    overlays.teaser = teaserWin;
  }
  chains.push(v === joined ? `[${v}]null[vout]` : `[${v}]format=yuv420p[vout]`);
  chains.push(`[${a}]anull[aout]`);
  const timeline = plan.shots.map((s, i) => ({ id: s.id, start: Number(starts[i]!.toFixed(3)), duration: durations[i]!, audioDelay: delays[i] ?? 0, ...(s.clip.start !== undefined && s.clip.hasVideo !== false && !s.clip.audioPath && !layoutHidesPresenter(layouts[i]) ? { clipStart: s.clip.start } : {}) }));
  return { inputArgs, filterComplex: chains.join(';'), videoLabel: '[vout]', audioLabel: '[aout]', totalDuration: Number(acc.toFixed(3)), overlaps, transitions, timeline, layouts, overlays };
}

export interface ComposeSceneInput {
  /** false: não normaliza o volume (testes); padrão: −16 LUFS (A15) */
  loudnorm?: boolean;
  shots: ComposeShot[];
  clips: Map<string, ShotClip>;
  /** PNG do slide por plano (tamanho conforme `slideSizeForLayout`) */
  slides?: Map<string, string>;
  /** PNG transparente do letreiro por plano (layout lower_third) */
  captions?: Map<string, string>;
  output: string;
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
  /** preset do x264 (padrão: env COMPOSE_X264_PRESET ou veryfast) */
  preset?: string;
  /**
   * marca d'água do logo em todos os planos (ausente = sem). `accent` = cor dos
   * slides comuns (o estilo `bold` usa o acento como fundo: decide o tom do logo).
   */
  watermark?: ComposeWatermark | null;
  /**
   * painel (`presenter_panel`) por plano: estados (0..n tópicos acesos, de
   * `renderShotGraphics`) e as palavras ditas no plano com tempos RELATIVOS ao
   * início do plano (alinhamento da narração): cada tópico acende quando é dito
   * (`panelRevealTimes`); sem palavras, espaçados igualmente no plano
   */
  panels?: Map<string, { states: string[]; words?: Array<{ text: string; start: number }> }>;
  /**
   * pílulas (`presenter_chips`) por plano: gráficos de `renderShotGraphics` e
   * as palavras ditas no plano (tempos relativos ao início dele): cada pílula
   * surge quando a palavra-chave é dita (`panelRevealTimes`)
   */
  chips?: Map<string, { graphics: ChipsGraphics; words?: Array<{ text: string; start: number }> }>;
  /** pergunta a seguir (a próxima cena é uma decisão): cartão nos últimos ≈ 3 s, na parede livre do último plano */
  teaser?: { question: string } | null;
  /** letreiro com o nome (primeira cena narrada da aula): 0,6–4,5 s, canto inferior esquerdo */
  lowerThird?: { name: string; role?: string; brand?: string } | null;
  /** cores dos gráficos (pergunta a seguir, letreiro); ausente = as da marca */
  palette?: ZonePaletteInput | null;
  /**
   * emendas sem "travamento" (padrão ligado; `false` ou env `COMPOSE_JOINS=0` = montagem antiga): o plano que sai
   * termina logo depois da última palavra e o que entra começa um instante antes da primeira (corte no ponto de
   * menor volume, imagem e som juntos); a imagem nunca congela além de 1 quadro; a troca de plano é corte seco
   * (nunca fusão sobre quadro congelado); e planos seguidos da mesma câmera alternam o enquadramento (punch-in)
   */
  joins?: boolean;
}

export interface ComposeWatermark {
  brand: string;
  position: WatermarkCorner;
  opacity: number;
  accent?: string;
}

/**
 * PNG de marca d'água de cada plano (renderizados uma vez por superfície/lado
 * em `dir`). Usa o layout EFETIVO (slide sem PNG cai para apresentador) e a
 * mesma alternância claro/marinho dos cartões de `renderShotGraphics`.
 */
export async function watermarkFilesFor(shots: Array<Pick<ComposeShot, 'id' | 'layout' | 'slide'>>, slides: Map<string, string> | undefined, wm: ComposeWatermark, dir: string, width: number, height: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const cache = new Map<string, string | null>();
  let cardIndex = 0;
  for (const s of shots) {
    let layout: Layout = s.layout ?? 'presenter';
    const isCard = layout === 'card' && !!s.slide;
    const tone = s.slide ? slideToneFor(layout, s.slide, { cardIndex, accent: wm.accent }) : undefined;
    if (isCard) cardIndex++;
    if (SLIDE_LAYOUTS.includes(layout) && !slides?.get(s.id)) layout = 'presenter';
    const p = watermarkPlacementFor(layout, tone, wm.position);
    const key = `${p.surface}-${p.side}`;
    if (!cache.has(key)) cache.set(key, (await skipIfUnrenderable(`marca d'água (${key})`, () => renderWatermarkToFile(path.join(dir, `watermark-${key}.png`), { brand: wm.brand, surface: p.surface, side: p.side, opacity: wm.opacity, width, height }))) ?? null);
    const file = cache.get(key);
    if (file) out.set(s.id, file);
  }
  return out;
}

export interface ComposeSceneResult {
  output: string;
  durationSeconds: number;
  expectedDurationSeconds: number;
  layouts: Layout[];
  overlaps: number[];
  transitions: number[];
  /** linha do tempo final por plano (legendas usam a mesma conta da montagem) */
  timeline: ShotTimelineEntry[];
  /** janelas das camadas da cena (letreiro, pergunta a seguir), quando aplicadas */
  overlays: ComposeCommand['overlays'];
  /** emendas: quanto saiu do começo e do fim de cada plano, de onde veio o fim da fala e o punch-in aplicado */
  joins: Array<{ id: string; headTrim: number; tailTrim: number; source: TightenResult['source']; punch: number }>;
  /** volume antes/depois da normalização (A15) */
  loudness?: LoudnessResult;
}

/** Tópicos do painel como desenhados (até 3, sem vazios). */
export function panelBullets(slide: SlideSpec | undefined): string[] {
  return (slide?.bullets ?? []).slice(0, 3).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Pílulas como desenhadas: os tópicos (até 4, sem vazios), com o `**negrito**` (as palavras-chave marcam o tempo). */
export function chipsBullets(slide: SlideSpec | undefined): string[] {
  return (slide?.bullets ?? []).slice(0, 4).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Pílulas no plano: posições dos gráficos + tempos (cada pílula surge quando
 * a palavra-chave do tópico é dita; o pop dura os quadros desenhados).
 */
export function plannedChipsFor(g: ChipsGraphics, bullets: string[], words: Array<{ text: string; start: number }> | undefined, duration: number, fps: number): PlannedChips {
  const n = Math.min(bullets.length, g.chips.length);
  const reveal = panelRevealTimes(bullets.slice(0, n), words, duration);
  const popCount = g.chips[0]?.popFrames.length ?? chipPopFrameCount(fps);
  const times = chipTimeline(reveal, duration, popCount / fps);
  // painel com j pílulas: de quando a j-ésima surge até a próxima (o último até o fim)
  const panels = g.panels.slice(0, n + 1).map((p, j) => ({ path: p.path, x: p.x, y: p.y, from: j === 0 ? 0 : times[j - 1]!.at, to: j < n ? times[j]!.at : duration }));
  return {
    panels,
    chips: g.chips.slice(0, n).map((c, j) => ({ x: c.x, y: c.y, popPattern: c.popPattern, popCount: c.popFrames.length, at: times[j]!.at, ...(c.wait ? { wait: c.wait } : {}), halo: c.halo, haloFrom: times[j]!.haloFrom, haloUntil: times[j]!.haloUntil, settled: c.settled })),
  };
}

/** Estados do painel com o instante de entrada: o estado j (j tópicos acesos) entra em `reveal[j-1]`; o estado 0 em 0. */
export function panelStatesFor(states: string[], reveal: number[]): Array<{ path: string; from: number }> {
  let prev = 0;
  return states.map((p, j) => {
    if (j === 0) return { path: p, from: 0 };
    prev = Math.max(prev, reveal[j - 1] ?? prev);
    return { path: p, from: Number(prev.toFixed(3)) };
  });
}

/** Sonda os clipes, monta o plano e executa o ffmpeg. Saída: MP4 H.264 + AAC com faststart. */
export async function composeScene(input: ComposeSceneInput): Promise<ComposeSceneResult> {
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  // o HeyGen entrega 25 fps; montar em 25 evita duplicar/descartar quadros
  const fps = input.fps ?? 25;
  const joinsOn = input.joins !== false && process.env.COMPOSE_JOINS !== '0';
  const shots: PlannedShot[] = [];
  const joinInfo: ComposeSceneResult['joins'] = [];
  await mkdir(path.dirname(input.output), { recursive: true });
  const outDir = path.dirname(input.output);
  const marks = input.watermark ? await watermarkFilesFor(input.shots, input.slides, input.watermark, outDir, width, height) : null;
  // enquadramento alternado: planos seguidos da mesma câmera (base, punch-in, base…)
  const punches = joinsOn ? framingPunchPlan(input.shots.map((s) => ({ id: s.id, cameraId: s.cameraId, layout: s.layout, framing: s.framing, cameraMove: s.cameraMove, zone: input.clips.get(s.id)?.zone }))) : new Map<string, number>();
  for (const [idx, s] of input.shots.entries()) {
    const clip = input.clips.get(s.id);
    const src = clip?.videoPath ?? clip?.audioPath;
    if (!clip || !src) throw new Error(`plano "${s.id}" sem clipe do apresentador nem áudio`);
    const p = await ffprobe(src);
    if (clip.videoPath && !p.hasVideo) throw new Error(`clipe do plano "${s.id}" sem vídeo`);
    if (!p.hasVideo && !p.hasAudio) throw new Error(`mídia do plano "${s.id}" sem vídeo e sem áudio`);
    const full = p.videoDurationSeconds && p.audioDurationSeconds ? Math.max(p.videoDurationSeconds, p.audioDurationSeconds) : p.durationSeconds;
    let start = Math.max(0, clip.startSeconds ?? 0);
    // vídeo + áudio separado (cena em movimento): dura o maior entre a narração e o clipe; narração com respiro inicial
    const separate = clip.videoPath && clip.audioPath ? await ffprobe(clip.audioPath) : null;
    if (separate && !separate.hasAudio) throw new Error(`narração do plano "${s.id}" sem áudio`);
    const videoSeconds = separate ? Math.max(0.1, (p.videoDurationSeconds ?? p.durationSeconds) - start) : undefined;
    const cine = separate ? cinematicShotTiming(Math.max(0.1, separate.audioDurationSeconds ?? separate.durationSeconds), videoSeconds) : null;
    let duration = clip.durationSeconds ?? (cine ? Math.max(0.1, cine.duration) : Math.max(0.1, full - start));
    // emendas: o apresentador do clipe (som do próprio clipe) tem o começo e o fim apertados na fala; a imagem não
    // passa de 1 quadro além do que o clipe tem (se acabar antes, corta o som ali: o resto é silêncio)
    let tight: TightenResult | undefined;
    if (joinsOn && clip.videoPath && p.hasVideo && !clip.audioPath) {
      const videoEnd = p.videoDurationSeconds ?? p.durationSeconds;
      const head = start <= 1e-3;
      const tail = clip.durationSeconds === undefined;
      if ((head || tail) && p.hasAudio) {
        const prevLine = input.shots[idx - 1]?.line;
        const to = start + duration;
        const ws = clip.words?.filter((w) => w.start >= start - 0.05 && w.start < to);
        tight = await tightenFromFile(src, {
          from: start, to, head, tail, fps, videoEnd,
          lead: idx === 0 ? JOIN.sceneLead : joinPause(prevLine) * (1 - JOIN.tailShare),
          tailPad: idx === input.shots.length - 1 ? JOIN.sceneTail : joinPause(s.line) * JOIN.tailShare,
          ...(ws?.length ? { firstWord: ws[0]!.start, lastWord: ws[ws.length - 1]!.end } : {}),
        });
        if (tight.source !== 'none') {
          start = tight.start;
          duration = tight.end - tight.start;
        }
      }
      duration = Math.min(duration, Math.max(0.1, videoEnd - start + 1 / fps));
    }
    const headTrim = tight && tight.source !== 'none' ? tight.headTrim : 0;
    const punch = punches.get(s.id) ?? 1;
    joinInfo.push({ id: s.id, headTrim, tailTrim: tight && tight.source !== 'none' ? tight.tailTrim : 0, source: tight?.source ?? 'none', punch });
    // com o começo apertado, as palavras (pílulas e painel) chegam antes no plano
    const shiftWords = (ws?: Array<{ text: string; start: number }>) => (ws && headTrim > 0 ? ws.map((w) => ({ ...w, start: w.start - headTrim })) : ws);
    const panelIn = input.panels?.get(s.id);
    const chipsIn = input.chips?.get(s.id);
    const focusX = clip.focusX !== undefined && Math.abs(clip.focusX - 0.5) > 1e-6 ? clip.focusX : punch > 1 ? zoneFocusX(clip.zone) : undefined;
    const videoLeft = clip.videoPath && p.hasVideo ? Math.max(0.1, (p.videoDurationSeconds ?? p.durationSeconds) - start) : undefined;
    shots.push({
      id: s.id,
      layout: s.layout ?? 'presenter',
      framing: s.framing ?? 'medium',
      nativeFraming: clip.cameraNativeFraming ?? 'medium',
      move: s.cameraMove ?? 'static',
      transition: s.transitionIn ?? 'cut',
      duration,
      ...(punch > 1 ? { punch } : {}),
      clip: {
        path: src, width: p.width, height: p.height, hasAudio: p.hasAudio, hasVideo: !!clip.videoPath && p.hasVideo, start,
        ...(focusX !== undefined && Math.abs(focusX - 0.5) > 1e-6 ? { focusX } : {}),
        ...(separate ? { audioPath: clip.audioPath, videoSeconds, audioDelay: clip.durationSeconds === undefined ? cine!.leadIn : 0 } : joinsOn && videoLeft !== undefined ? { videoSeconds: videoLeft } : {}),
      },
      slidePath: input.slides?.get(s.id),
      captionPath: input.captions?.get(s.id),
      ...(marks?.get(s.id) ? { watermarkPath: marks.get(s.id) } : {}),
      ...(s.layout === 'presenter_panel' && panelIn ? { panelStates: panelStatesFor(panelIn.states, panelRevealTimes(panelBullets(s.slide), shiftWords(panelIn.words), duration)) } : {}),
      ...(s.layout === 'presenter_chips' && chipsIn ? { chips: plannedChipsFor(chipsIn.graphics, chipsBullets(s.slide), shiftWords(chipsIn.words), duration, fps) } : {}),
    });
  }
  if (joinsOn) {
    // troca de plano = corte seco: a fusão (xfade) só existia sobre o último quadro congelado do plano que sai
    const clean = cleanTransitions(shots.map((x) => ({ layout: x.layout, transition: x.transition, hasVideo: x.clip.hasVideo !== false && !x.clip.audioPath })));
    clean.forEach((t, i) => { if (t !== undefined) shots[i] = { ...shots[i]!, transitionSeconds: t }; });
  }
  // fusões entre planos do apresentador: com a pose muito diferente nos dois lados, a fusão longa mostra
  // "braços fantasma" — fica curta ou vira corte seco (o áudio segue emendado com micro-fades)
  for (let i = 1; i < shots.length && !joinsOn; i++) {
    const cur = shots[i]!;
    const prev = shots[i - 1]!;
    if (!TRANSITION_SPEC[cur.transition]?.xfade || cur.transition === 'whip' || cur.transition === 'dip_to_color') continue;
    if (cur.clip.hasVideo === false || prev.clip.hasVideo === false || cur.clip.audioPath || prev.clip.audioPath) continue;
    const diff = await poseDifference(prev.clip.path, (prev.clip.start ?? 0) + Math.max(0, prev.duration - 0.06), cur.clip.path, cur.clip.start ?? 0);
    const t = crossfadeForPose(diff);
    if (t !== null) shots[i] = { ...cur, transitionSeconds: t };
  }
  // camadas da cena: pergunta na parede livre do ÚLTIMO plano; letreiro no canto inferior esquerdo, longe da marca d'água
  const lastShot = input.shots[input.shots.length - 1]!;
  const lastZone = input.clips.get(lastShot.id)?.zone;
  // último plano com véu e pílulas: a pergunta entra abaixo delas, dentro do véu (modelo aprovado)
  const lastChips = lastShot.layout === 'presenter_chips' ? input.chips?.get(lastShot.id)?.graphics : undefined;
  const below = lastChips?.contentBottom ?? null;
  const teaser = input.teaser?.question?.trim() ? await skipIfUnrenderable('pergunta a seguir', () => renderTeaserSprite(path.join(outDir, 'teaser.png'), input.teaser!.question, { width, height, zone: lastZone, below, palette: input.palette })) : undefined;
  const lowerThird = input.lowerThird?.name?.trim()
    ? await skipIfUnrenderable('letreiro com o nome', () => renderLowerThirdSprite(path.join(outDir, 'lower-third.png'), input.lowerThird!, { width, height, watermarkSide: input.watermark ? (input.watermark.position === 'bottom-left' ? 'left' : 'right') : null, palette: input.palette }))
    : undefined;
  const cmd = buildComposeCommand({ width, height, fps, background: input.background ?? '#000000', shots, ...(teaser ? { teaser } : {}), ...(lowerThird ? { lowerThird } : {}) });
  // DIAGNÓSTICO, só quando a variável de ambiente COMPOSE_DUMP=<arquivo.json> está definida (nunca em produção):
  // grava o comando da montagem (entradas, filter_complex, duração, transições) para investigar imagem e som
  // desencontrados. Não altera a montagem; sem a variável, não faz nada. Mantido de propósito: foi o que achou o
  // desvio de relógio nas emendas (ver os testes de compose.test.ts).
  if (process.env.COMPOSE_DUMP) await writeFile(process.env.COMPOSE_DUMP, JSON.stringify({ inputArgs: cmd.inputArgs, filterComplex: cmd.filterComplex, totalDuration: cmd.totalDuration, transitions: cmd.transitions }, null, 1));
  await runFfmpeg([
    ...cmd.inputArgs,
    '-filter_complex', cmd.filterComplex,
    '-map', cmd.videoLabel, '-map', cmd.audioLabel,
    '-c:v', 'libx264', '-preset', input.preset ?? process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    '-t', sec(cmd.totalDuration),
    input.output,
  ]);
  // volume único (A15): a mesma voz sai no mesmo nível em todos os cursos, e a vinheta (−16 LUFS) emenda sem salto
  const loudness = input.loudnorm === false ? undefined : await normalizeLoudnessInPlace(input.output);
  const out = await ffprobe(input.output);
  return { output: input.output, durationSeconds: out.durationSeconds, expectedDurationSeconds: cmd.totalDuration, layouts: cmd.layouts, overlaps: cmd.overlaps, transitions: cmd.transitions, timeline: cmd.timeline, overlays: cmd.overlays, joins: joinInfo, ...(loudness ? { loudness } : {}) };
}

/**
 * Renderiza os gráficos da cena: slide no tamanho certo para o layout de cada
 * plano e letreiro transparente para `lower_third` (texto = caption ou título do slide).
 */
export async function renderShotGraphics(opts: {
  shots: ComposeShot[];
  outDir: string;
  accent?: string;
  width?: number;
  height?: number;
  /** preset de marca dos cartões (`PLATFORM_BRAND`): dnawork (padrão) | lms */
  brand?: string | null;
  /** carrega imagem do slide (imageAssetId) como data URI; ausente = sem imagem */
  loadImage?: (assetId: string) => Promise<string | undefined>;
  /**
   * logo do próprio cartão de marca (padrão: desenhado). `false` quando a
   * marca d'água GLOBAL da montagem cobre o cartão (não duplica).
   */
  cardWatermark?: false | { position?: WatermarkCorner; opacity?: number };
  /** painel: linha de cima padrão ("Aula N · título"), quando o slide não traz a própria */
  panelEyebrow?: string;
  /** painel: ícone do tópico (explícito ou por palavra-chave; ver `panelIconFor` no course-schema); padrão = o explícito ou `check` */
  panelIconFor?: (bullet: string, explicit?: string | null) => string;
  /** pílulas: rótulo da pílula a partir do tópico (ver `chipLabel` no course-schema); padrão = o negrito ou o tópico */
  chipLabelFor?: (bullet: string) => string;
  /** pílulas: zona da câmera de cada plano (a coluna vai na parede livre); ausente = centro (coluna à direita) */
  zones?: Map<string, Zone>;
  /** quadros por segundo da montagem (quadros do pop das pílulas); padrão 25 */
  fps?: number;
  /** cores dos gráficos do estúdio com zonas (`branding.videoPalette`); ausente = as da marca */
  palette?: ZonePaletteInput | null;
}): Promise<{ slides: Map<string, string>; captions: Map<string, string>; panels: Map<string, string[]>; chips: Map<string, ChipsGraphics> }> {
  const W = opts.width ?? 1920;
  const H = opts.height ?? 1080;
  await mkdir(opts.outDir, { recursive: true });
  const slides = new Map<string, string>();
  const captions = new Map<string, string>();
  const panels = new Map<string, string[]>();
  const chips = new Map<string, ChipsGraphics>();
  let cardIndex = 0;
  for (const s of opts.shots) {
    const layout = s.layout ?? 'presenter';
    const safe = s.id.replace(/[^A-Za-z0-9_-]/g, '_');
    const size = slideSizeForLayout(layout, W, H);
    if (layout === 'presenter_chips' && s.slide) {
      const bullets = chipsBullets(s.slide);
      const label = opts.chipLabelFor ?? ((b: string) => (/\*\*([^*]+?)\*\*/.exec(b)?.[1] ?? b.replace(/\*\*/g, '')).split(/\s+/).slice(0, 4).join(' '));
      const iconFor = opts.panelIconFor ?? ((_b: string, e?: string | null) => e ?? 'check');
      const spec = { title: s.slide.title ?? '', chips: bullets.map(label), icons: bullets.map((b, i) => iconFor(b, (s.slide as { icons?: Array<string | null> }).icons?.[i] ?? null)), eyebrow: (s.slide as { eyebrow?: string }).eyebrow?.trim() || opts.panelEyebrow };
      const g = await skipIfUnrenderable(`pílulas do plano ${s.id}`, () => renderChipsGraphics(opts.outDir, safe, spec, { width: W, height: H, fps: opts.fps ?? 25, zone: opts.zones?.get(s.id), palette: opts.palette }));
      if (g) chips.set(s.id, g);
    } else if (layout === 'presenter_panel' && s.slide) {
      const spec = panelSpecFromSlide(s.slide, opts.panelIconFor ?? ((_b, e) => e ?? 'check'), opts.panelEyebrow);
      const g = await skipIfUnrenderable(`painel do plano ${s.id}`, () => renderPanelStatesToFiles(opts.outDir, safe, spec, { width: W, height: H }));
      if (g) panels.set(s.id, g);
    } else if (layout === 'card' && s.slide) {
      // cartão de marca: claro/marinho alternando por cartão na cena quando a variante não é pedida
      const index = cardIndex++;
      const g = await skipIfUnrenderable(`cartão do plano ${s.id}`, () => renderBrandCardToFile(path.join(opts.outDir, `card-${safe}.png`), s.slide!, { ...size!, brand: opts.brand, index, ...(opts.cardWatermark !== undefined ? { watermark: opts.cardWatermark } : {}) }));
      if (g) slides.set(s.id, g);
    } else if (size && s.slide) {
      const imageDataUri = s.slide.imageAssetId && opts.loadImage ? await opts.loadImage(s.slide.imageAssetId) : undefined;
      const g = await skipIfUnrenderable(`slide do plano ${s.id}`, () => renderSlideToFile(path.join(opts.outDir, `slide-${safe}.png`), s.slide!, { ...size, accent: opts.accent, imageDataUri }));
      if (g) slides.set(s.id, g);
    }
    // cena em movimento: letreiro só com caption explícito (não usa título de slide)
    const text = layout === 'cinematic' ? s.caption : (s.caption ?? s.slide?.title);
    if ((layout === 'lower_third' || layout === 'cinematic') && text) {
      const g = await skipIfUnrenderable(`letreiro do plano ${s.id}`, () => renderCaptionToFile(path.join(opts.outDir, `caption-${safe}.png`), text, { width: W, height: H, accent: opts.accent }));
      if (g) captions.set(s.id, g);
    }
  }
  return { slides, captions, panels, chips };
}
