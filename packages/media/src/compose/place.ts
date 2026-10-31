import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ffprobe, ffprobeJson, runFfmpeg, sec } from './ffmpeg';
import { LAYOUT_BOTTOM_RANGE, LAYOUT_CENTER_X, LAYOUT_EDGE_MARGIN, LAYOUT_FOREGROUND_RANGE, LAYOUT_HEADROOM_RANGE, LAYOUT_X_RANGE, PRESENTER_HEAD_OFFSET, clampRange, computeComposition, type BackdropFrame, type Composition, type PresenterGrade } from './layout';

/**
 * Apresentador posicionado sobre o fundo da apresentação ("pessoa à direita do
 * quadro", como numa chamada de vídeo). O HeyGen sempre centraliza o avatar,
 * então pedimos o vídeo com FUNDO TRANSPARENTE (WebM com canal alfa) e
 * montamos nós mesmos:
 *  - fundo: imagem (cobre o quadro, recortada, com desfoque leve de
 *    profundidade, gblur sigma 1,5) ou cor lisa;
 *  - apresentador: recortado na caixa da pessoa (detectada no canal alfa com
 *    cropdetect, união de todos os quadros), escalado para altura
 *    `scale × H`, centro em x ≈ 0,30 / 0,50 / 0,70 × W (esquerda / centro /
 *    direita), com margem mínima de 3% das bordas, alinhado embaixo (tronco
 *    cortado na base do quadro, como numa webcam);
 *  - áudio: o do clipe do apresentador; saída H.264 + AAC com faststart.
 * Tipos de entrada:
 *  - `alpha`: WebM VP9/VP8 com alfa (decodificado com libvpx — o decodificador
 *    nativo do ffmpeg descarta o alfa);
 *  - `chroma`: MP4 com fundo verde puro (#00FF00) — plano B se o HeyGen recusar
 *    WebM para o avatar: colorkey + despill;
 *  - `opaque`: substituto da simulação (vídeo sem alfa): só um recorte central
 *    3:4 do quadro, colocado no lugar da pessoa — prévia da montagem.
 * O grafo de filtros sai de uma função pura (`buildPlacePresenterCommand`).
 */
export type PresenterPlacement = 'center' | 'right' | 'left';
export type PresenterKind = 'alpha' | 'chroma' | 'opaque';

/** centro horizontal da pessoa (fração da largura) por posição (ver layout.ts) */
export const PLACEMENT_CENTER_X: Record<PresenterPlacement, number> = LAYOUT_CENTER_X;
/** margem mínima entre a pessoa e a borda lateral (fração da largura) */
export const PLACEMENT_EDGE_MARGIN = LAYOUT_EDGE_MARGIN;
/** cor do fundo pedido ao HeyGen no plano B (chroma) */
export const CHROMA_KEY_COLOR = '#00FF00';
export const BACKGROUND_BLUR_SIGMA = 1.5;
export const DEFAULT_PRESENTER_SCALE = 0.92;
/** filtro de recorte do verde (plano B): colorkey em RGB + remoção do reflexo verde na borda */
export const CHROMA_KEY_FILTER = `format=rgba,colorkey=color=0x00FF00:similarity=0.3:blend=0.08,despill=type=green`;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fundo da montagem. Imagem: `foregroundFrom` = fração da altura a partir da
 * qual a faixa da PRÓPRIA imagem é colocada por cima da pessoa (balcão/mesa na
 * frente dela); `frame` = janela de enquadramento (frações da imagem);
 * `size` = tamanho da imagem (sondado por `placePresenter`; sem ele, cobertura
 * centralizada pelo próprio ffmpeg e sem `frame`).
 */
export type PlaceBackground =
  | { type: 'image'; path: string; foregroundFrom?: number; frame?: BackdropFrame | null; size?: { width: number; height: number }; /** false = cenário já tratado (sem o desfoque leve de profundidade) */ blur?: boolean }
  | { type: 'color'; value: string };

/** Limites da posição livre (centro horizontal), da base do recorte, da faixa do balcão e da folga (frações do quadro). */
export const PRESENTER_X_RANGE = LAYOUT_X_RANGE;
export const PRESENTER_BOTTOM_RANGE = LAYOUT_BOTTOM_RANGE;
export const FOREGROUND_FROM_RANGE = LAYOUT_FOREGROUND_RANGE;
export const HEADROOM_RANGE = LAYOUT_HEADROOM_RANGE;

/** Valor dentro do intervalo, ou undefined quando ausente/inválido. */
export const clampFraction = clampRange;

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** Caixa padrão da pessoa quando a detecção não é possível: alfa/chroma = faixa central de 50%; opaco = recorte central 3:4. */
export function defaultPresenterBox(kind: PresenterKind, srcW: number, srcH: number): Box {
  const w = kind === 'opaque' ? Math.min(srcW, even(srcH * 0.75)) : even(srcW * 0.5);
  return { x: Math.floor((srcW - w) / 4) * 2, y: 0, w, h: srcH };
}

/** Caixa ajustada a números pares e dentro do quadro de origem (yuva420p exige pares). */
export function normalizeBox(box: Box, srcW: number, srcH: number): Box {
  const x = Math.max(0, Math.floor(box.x / 2) * 2);
  const y = Math.max(0, Math.floor(box.y / 2) * 2);
  const w = Math.max(2, Math.min(srcW - x, even(box.w)));
  const h = Math.max(2, Math.min(srcH - y, even(box.h)));
  return { x, y, w: w - (w % 2) || 2, h: h - (h % 2) || 2 };
}

export interface PlacementGeometry {
  /** recorte (caixa da pessoa) no quadro de origem */
  crop: Box;
  /** tamanho da pessoa no quadro final */
  width: number;
  height: number;
  /** canto superior esquerdo da pessoa no quadro final */
  x: number;
  y: number;
  /** centro horizontal efetivo (fração da largura), depois da margem */
  centerX: number;
  /** composição completa (recorte do cenário, faixa do balcão, valores efetivos) */
  composition: Composition;
}

export interface PlacementGeometryInput {
  placement: PresenterPlacement;
  scale: number;
  width: number;
  height: number;
  srcWidth: number;
  srcHeight: number;
  box: Box;
  /** centro horizontal livre (fração da largura) */
  x?: number;
  /** base do recorte (fração da altura) */
  bottom?: number;
  /** folga acima da cabeça (deriva o tamanho) */
  headroom?: number;
  /** faixa do balcão (só com cenário) */
  foregroundFrom?: number;
  /** cenário (tamanho + janela); ausente = cor lisa */
  backdrop?: { width: number; height: number; frame?: BackdropFrame | null };
}

/**
 * Geometria da montagem: `computeComposition` (layout.ts, o mesmo da prévia do
 * estúdio): a escala vale para o clipe inteiro (altura = scale × H) e só a
 * caixa da pessoa (cropdetect) é sobreposta; o topo da cabeça é o do clipe
 * (PRESENTER_HEAD_OFFSET). Sem `x`/`bottom`/`headroom`/cenário, a mesma regra de
 * antes (centro predefinido, margem de 3%, base alinhada).
 */
export function placementGeometry(opts: PlacementGeometryInput): PlacementGeometry {
  const { width: W, height: H } = opts;
  const crop = normalizeBox(opts.box, opts.srcWidth, opts.srcHeight);
  const composition = computeComposition({
    frame: { width: W, height: H },
    backdrop: opts.backdrop,
    clip: { width: opts.srcWidth, height: opts.srcHeight, headOffset: PRESENTER_HEAD_OFFSET, box: crop },
    placement: opts.placement,
    presenterX: opts.x,
    presenterScale: Number.isFinite(opts.scale) ? opts.scale : DEFAULT_PRESENTER_SCALE,
    presenterBottom: opts.bottom,
    headroom: opts.headroom,
    foregroundFrom: opts.foregroundFrom,
  });
  const p = composition.presenter;
  return { crop, width: p.w, height: p.h, x: p.x, y: p.y, centerX: composition.centerX, composition };
}

export interface PlacePresenterPlan {
  presenter: {
    path: string;
    kind: PresenterKind;
    /** codec do WebM com alfa (escolhe o decodificador libvpx) */
    codec?: string;
    width: number;
    height: number;
    hasAudio: boolean;
    durationSeconds: number;
    /** caixa da pessoa no quadro de origem (sem ela, a caixa padrão do tipo) */
    box?: Box;
  };
  background: PlaceBackground;
  placement: PresenterPlacement;
  scale: number;
  /** centro horizontal livre (fração da largura); ausente = predefinido da posição */
  x?: number;
  /** base do recorte (fração da altura); ausente = base do quadro */
  bottom?: number;
  /** folga acima da cabeça (fração da altura): deriva o tamanho */
  headroom?: number;
  /** harmonização de cor só da camada da apresentadora */
  grade?: PresenterGrade;
  width: number;
  height: number;
  fps: number;
}

export interface PlacePresenterCommand {
  inputArgs: string[];
  filterComplex: string;
  videoLabel: string;
  audioLabel?: string;
  durationSeconds: number;
  geometry: PlacementGeometry;
}

/** Decodificador que preserva o alfa do WebM (o nativo `vp9`/`vp8` descarta). */
export function alphaDecoder(codec: string | undefined): string | undefined {
  if (codec === 'vp9') return 'libvpx-vp9';
  if (codec === 'vp8') return 'libvpx';
  return undefined;
}

/**
 * Harmonização de cor da apresentadora (só a camada dela), conservadora:
 * colorbalance nos meios-tons/sombras com luminosidade preservada (tons de pele
 * naturais, sem halo nas bordas — o alfa não é tocado). `none` = sem filtro.
 */
export const PRESENTER_GRADE_FILTER: Record<PresenterGrade, string> = {
  none: '',
  warm: 'eq=saturation=1.04:brightness=0.01',
  cool: 'eq=saturation=0.97:brightness=0.01,colorbalance=rm=-0.02:bm=0.03:pl=1',
};

/** Filtros que deixam o apresentador com alfa (yuva420p) conforme o tipo de entrada (+ harmonização opcional). */
export function presenterKeyFilter(kind: PresenterKind, grade: PresenterGrade = 'none'): string {
  const g = PRESENTER_GRADE_FILTER[grade] ?? '';
  if (kind === 'chroma') return `${CHROMA_KEY_FILTER}${g ? `,${g}` : ''},format=yuva420p`;
  if (kind === 'alpha') return g ? `format=rgba,${g},format=yuva420p` : 'format=yuva420p';
  return g ? `${g},format=yuv420p` : 'format=yuv420p';
}

/** Monta entradas e filtergraph (função pura, testável sem ffmpeg). */
export function buildPlacePresenterCommand(plan: PlacePresenterPlan): PlacePresenterCommand {
  const { width: W, height: H, fps } = plan;
  const p = plan.presenter;
  const bg = plan.background;
  const backdrop = bg.type === 'image' && bg.size ? { width: bg.size.width, height: bg.size.height, frame: bg.frame } : undefined;
  const geometry = placementGeometry({
    placement: plan.placement, scale: plan.scale, x: plan.x, bottom: plan.bottom, headroom: plan.headroom,
    foregroundFrom: bg.type === 'image' ? bg.foregroundFrom : undefined,
    // sem o tamanho da imagem, a faixa do balcão ainda vale (o ffmpeg cobre o quadro sozinho)
    backdrop: backdrop ?? (bg.type === 'image' ? { width: W, height: H } : undefined),
    width: W, height: H, srcWidth: p.width, srcHeight: p.height, box: p.box ?? defaultPresenterBox(p.kind, p.width, p.height),
  });
  const inputArgs: string[] = [];
  const dec = p.kind === 'alpha' ? alphaDecoder(p.codec) : undefined;
  if (dec) inputArgs.push('-c:v', dec);
  inputArgs.push('-i', p.path);
  const chains: string[] = [];
  // faixa do balcão/mesa (só com imagem): recorte da própria imagem, nítido, por cima da pessoa
  const foreground = geometry.composition.foreground;
  if (bg.type === 'image') {
    inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', bg.path);
    // enquadramento: recorte 16:9 calculado (janela ou cobertura) e escala para o quadro; sem tamanho conhecido, cobertura pelo ffmpeg
    const crop = geometry.composition.bgCrop;
    const fit = backdrop && crop
      ? `[1:v]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${W}:${H}:flags=lanczos,setsar=1,fps=${fps},format=yuv420p`
      : `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;
    const blur = bg.blur === false ? '' : `,gblur=sigma=${BACKGROUND_BLUR_SIGMA}`;
    if (foreground) {
      chains.push(`${fit}[bgsrc]`, `[bgsrc]split=2[bgwall][bgdesk]`, `[bgwall]${blur ? blur.slice(1) : 'null'}[bg]`, `[bgdesk]crop=${W}:${foreground.height}:0:${foreground.y}[desk]`);
    } else {
      chains.push(`${fit}${blur}[bg]`);
    }
  } else {
    const hex = /^#[0-9a-fA-F]{6}$/.test(bg.value) ? bg.value : '#000000';
    inputArgs.push('-f', 'lavfi', '-i', `color=c=0x${hex.slice(1).toUpperCase()}:s=${W}x${H}:r=${fps}`);
    chains.push(`[1:v]setsar=1,format=yuv420p[bg]`);
  }
  const c = geometry.crop;
  chains.push(`[0:v]fps=${fps},${presenterKeyFilter(p.kind, plan.grade)},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${geometry.width}:${geometry.height}:flags=lanczos,setsar=1[fg]`);
  if (foreground) {
    // pessoa sobre a parede; depois a faixa do balcão por cima dela (a saída acaba com o clipe da pessoa)
    chains.push(`[bg][fg]overlay=x=${geometry.x}:y=${geometry.y}:shortest=1:format=auto[wall]`);
    chains.push(`[wall][desk]overlay=x=0:y=${foreground.y}:format=auto,format=yuv420p[v]`);
  } else {
    chains.push(`[bg][fg]overlay=x=${geometry.x}:y=${geometry.y}:shortest=1:format=auto,format=yuv420p[v]`);
  }
  let audioLabel: string | undefined;
  if (p.hasAudio) {
    chains.push(`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`);
    audioLabel = '[a]';
  }
  return { inputArgs, filterComplex: chains.join(';'), videoLabel: '[v]', audioLabel, durationSeconds: p.durationSeconds, geometry };
}

/** Tamanho de uma imagem (ffprobe); undefined quando não dá para sondar. */
export async function probeImageSize(file: string): Promise<{ width: number; height: number } | undefined> {
  try {
    const p = await ffprobe(file);
    return p.width && p.height ? { width: p.width, height: p.height } : undefined;
  } catch {
    return undefined;
  }
}

/** Codec do vídeo e se o WebM declara canal alfa (tag ALPHA_MODE=1). */
export async function probePresenterAlpha(file: string): Promise<{ codec?: string; alpha: boolean }> {
  const j = await ffprobeJson<{ streams?: Array<{ codec_name?: string; tags?: Record<string, string> }> }>(file, ['-select_streams', 'v:0', '-show_entries', 'stream=codec_name:stream_tags']);
  const s = j.streams?.[0];
  const tags = Object.fromEntries(Object.entries(s?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return { codec: s?.codec_name, alpha: tags.alpha_mode === '1' };
}

/** Lê a última linha `crop=w:h:x:y` do cropdetect (área máxima acumulada). */
export function parseCropdetect(stderr: string): Box | undefined {
  const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const m = all[all.length - 1];
  if (!m) return undefined;
  const [w, h, x, y] = m.slice(1, 5).map(Number) as [number, number, number, number];
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}

/**
 * Caixa da pessoa no clipe: canal alfa (alfa ou verde recortado) -> cropdetect
 * sem reset (área máxima ao longo do clipe, ex.: mãos em gesto). Analisa 1 a cada
 * 5 quadros. Caixa muito pequena (< 2% do quadro) é descartada (usa a padrão).
 */
export async function detectPresenterBox(file: string, kind: PresenterKind, codec?: string): Promise<Box | undefined> {
  if (kind === 'opaque') return undefined;
  const dec = kind === 'alpha' ? alphaDecoder(codec) : undefined;
  const key = kind === 'chroma' ? `${CHROMA_KEY_FILTER},` : 'format=yuva420p,';
  try {
    const { stderr } = await runFfmpeg([...(dec ? ['-c:v', dec] : []), '-i', file, '-an', '-vf', `framestep=5,${key}alphaextract,cropdetect=limit=24:round=2:reset=0`, '-f', 'null', '-'], { loglevel: 'info', timeoutMs: 10 * 60 * 1000 });
    const box = parseCropdetect(stderr);
    const probe = await ffprobe(file);
    if (!box || !probe.width || !probe.height) return undefined;
    if (box.w * box.h < 0.02 * probe.width * probe.height) return undefined;
    return box;
  } catch {
    return undefined;
  }
}

export interface PlacePresenterInput {
  /** vídeo do apresentador: WebM com alfa, MP4 com fundo verde ou (simulação) vídeo opaco */
  presenterVideo: string;
  /** padrão: `alpha` se o arquivo declarar alfa, senão `opaque` */
  kind?: PresenterKind;
  background: PlaceBackground;
  placement: PresenterPlacement;
  scale?: number;
  /** centro horizontal livre (fração da largura) */
  x?: number;
  /** base do recorte (fração da altura; ex.: a linha do balcão) */
  bottom?: number;
  /** folga acima da cabeça (deriva o tamanho) */
  headroom?: number;
  /** harmonização de cor da apresentadora */
  grade?: PresenterGrade;
  output: string;
  width?: number;
  height?: number;
  fps?: number;
  /** preset do x264 (padrão: env COMPOSE_X264_PRESET ou veryfast) */
  preset?: string;
}

export interface PlacePresenterResult {
  output: string;
  durationSeconds: number;
  kind: PresenterKind;
  box?: Box;
  geometry: PlacementGeometry;
}

/** Sonda o clipe, detecta a pessoa, monta e executa. Saída: MP4 H.264 + AAC (faststart). */
export async function placePresenter(input: PlacePresenterInput): Promise<PlacePresenterResult> {
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  const fps = input.fps ?? 25;
  const probe = await ffprobe(input.presenterVideo);
  if (!probe.hasVideo || !probe.width || !probe.height) throw new Error('clipe do apresentador sem vídeo');
  const alpha = await probePresenterAlpha(input.presenterVideo);
  let kind: PresenterKind = input.kind ?? (alpha.alpha ? 'alpha' : 'opaque');
  if (kind === 'alpha' && !alpha.alpha) {
    // o provedor devolveu um vídeo sem alfa: nada a recortar, só posiciona (melhor que falhar um vídeo pago)
    console.warn(`[media] clipe do apresentador sem canal alfa (${alpha.codec ?? 'codec desconhecido'}); posicionado sem recorte`);
    kind = 'opaque';
  }
  const box = await detectPresenterBox(input.presenterVideo, kind, alpha.codec);
  const duration = Math.max(0.1, probe.videoDurationSeconds && probe.audioDurationSeconds ? Math.max(probe.videoDurationSeconds, probe.audioDurationSeconds) : probe.durationSeconds);
  // tamanho do cenário (enquadramento calculado por nós); sem ele, cobertura pelo ffmpeg
  let background = input.background;
  if (background.type === 'image' && !background.size) {
    const size = await probeImageSize(background.path);
    if (size) background = { ...background, size };
  }
  const cmd = buildPlacePresenterCommand({
    presenter: { path: input.presenterVideo, kind, codec: alpha.codec, width: probe.width, height: probe.height, hasAudio: probe.hasAudio, durationSeconds: duration, box },
    background,
    placement: input.placement,
    scale: input.scale ?? DEFAULT_PRESENTER_SCALE,
    x: input.x,
    bottom: input.bottom,
    headroom: input.headroom,
    grade: input.grade,
    width, height, fps,
  });
  await mkdir(path.dirname(input.output), { recursive: true });
  await runFfmpeg([
    ...cmd.inputArgs,
    '-filter_complex', cmd.filterComplex,
    '-map', cmd.videoLabel, ...(cmd.audioLabel ? ['-map', cmd.audioLabel] : []),
    '-t', sec(duration),
    '-c:v', 'libx264', '-preset', input.preset ?? process.env.COMPOSE_X264_PRESET ?? 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    ...(cmd.audioLabel ? ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000'] : []),
    '-movflags', '+faststart',
    input.output,
  ]);
  const out = await ffprobe(input.output);
  return { output: input.output, durationSeconds: out.durationSeconds, kind, box, geometry: cmd.geometry };
}

/**
 * Clipe sintético com alfa (testes): círculo colorido sobre fundo transparente,
 * WebM VP9 yuva420p (`-auto-alt-ref 0`, exigido para alfa), com tom de áudio.
 */
export async function generateAlphaTestClip(opts: { output: string; seconds: number; width?: number; height?: number; fps?: number }) {
  const w = opts.width ?? 640;
  const h = opts.height ?? 360;
  const r = Math.round(h * 0.33);
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.6);
  const inside = `lte(hypot(X-${cx},Y-${cy}),${r})`;
  await runFfmpeg([
    '-f', 'lavfi', '-i', `color=c=black@0:s=${w}x${h}:r=${opts.fps ?? 25}:d=${sec(opts.seconds)},format=yuva420p,geq=lum='if(${inside},170,16)':cb=90:cr=200:a='if(${inside},255,0)'`,
    '-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${sec(opts.seconds)}`,
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '800k', '-deadline', 'realtime', '-cpu-used', '8',
    '-c:a', 'libopus', '-b:a', '64k', '-shortest', opts.output,
  ]);
  return opts.output;
}
