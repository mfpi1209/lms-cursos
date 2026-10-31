/**
 * Layout PURO da apresentadora sobre o cenário — a MESMA função serve à prévia
 * do estúdio (CSS) e à montagem do worker (ffmpeg). Sem dependências do Node.
 *
 * Entrada: tamanho do quadro de saída (16:9), o cenário (tamanho da imagem e,
 * opcionalmente, a janela de enquadramento `frame`, em frações da imagem), o
 * clipe da apresentadora (tamanho da caixa da pessoa) e os controles do autor:
 * centro horizontal (`presenterX` ou o predefinido esquerda/centro/direita),
 * tamanho (`presenterScale`), base (`presenterBottom`), folga acima da cabeça
 * (`headroom`, que DERIVA o tamanho) e a faixa do balcão (`foregroundFrom`).
 *
 * Regras:
 * - escala sempre uniforme (nunca estica); a cabeça pode sair pelo topo com
 *   tamanho > 1, nunca a base;
 * - o tronco continua para fora da borda inferior: a base só sobe do fundo do
 *   quadro quando há uma faixa de balcão escondendo o corte (e nunca acima da
 *   linha do balcão) — nada de "flutuar" com o corte à mostra;
 * - o cenário é recortado em 16:9 (janela `frame` ou cobertura centralizada) e
 *   escalado para o quadro, sem distorção.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Janela de enquadramento do cenário, em frações da imagem (0–1). */
export interface BackdropFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutPlacement = 'left' | 'center' | 'right';

/** centro horizontal da pessoa (fração da largura) por posição predefinida */
export const LAYOUT_CENTER_X: Record<LayoutPlacement, number> = { left: 0.3, center: 0.5, right: 0.7 };
/** margem mínima entre a pessoa e a borda lateral (fração da largura) */
export const LAYOUT_EDGE_MARGIN = 0.03;
export const LAYOUT_DEFAULT_SCALE = 0.92;
export const LAYOUT_SCALE_RANGE: [number, number] = [0.5, 1.2];
export const LAYOUT_X_RANGE: [number, number] = [0.15, 0.85];
export const LAYOUT_BOTTOM_RANGE: [number, number] = [0.5, 1];
export const LAYOUT_FOREGROUND_RANGE: [number, number] = [0.5, 1];
export const LAYOUT_HEADROOM_RANGE: [number, number] = [0.05, 0.08];
/**
 * Topo da cabeça nos clipes de plano médio do HeyGen (fração da altura do
 * clipe, pessoa centralizada, ≈ 3,7% abaixo da borda superior).
 */
export const PRESENTER_HEAD_OFFSET = 0.037;
/**
 * Clipe nominal do apresentador (HeyGen 1080p, plano médio, 1920×1072) e a
 * caixa da pessoa do recorte de referência da prévia (`/studio/presenter-cutout.png`,
 * medida por cropdetect no alfa) — usados pela prévia do estúdio.
 */
export const NOMINAL_CLIP = { width: 1920, height: 1072, box: { x: 556, y: 88, w: 786, h: 984 } } as const;

export interface CompositionInput {
  /** quadro de saída (16:9) */
  frame: { width: number; height: number };
  /** cenário: tamanho da imagem e janela de enquadramento opcional; ausente = cor lisa */
  backdrop?: { width: number; height: number; frame?: BackdropFrame | null };
  /**
   * clipe da apresentadora (tamanho inteiro). `headOffset` = topo da cabeça
   * como fração da altura do clipe (padrão PRESENTER_HEAD_OFFSET). `box` =
   * caixa da pessoa dentro do clipe (pixels do clipe; ausente = o clipe inteiro):
   * é o que se sobrepõe ao cenário; a escala e a base valem para o clipe inteiro.
   */
  clip: { width: number; height: number; headOffset?: number; box?: Rect };
  placement?: LayoutPlacement;
  /** centro horizontal livre (fração da largura); ausente = predefinido da posição */
  presenterX?: number | null;
  /** altura do clipe / altura do quadro (escala uniforme) */
  presenterScale?: number | null;
  /** base do recorte (fração da altura); ausente = 1 */
  presenterBottom?: number | null;
  /**
   * folga acima da cabeça (fração da altura): o clipe desce até o topo da cabeça
   * cair nessa linha (o tronco continua para fora do quadro); se com isso a base
   * do clipe ficasse acima da base exigida, o tamanho sobe (nunca desce) até
   * encostar — nunca "flutua"
   */
  headroom?: number | null;
  /** faixa do balcão (fração da altura a partir da qual o cenário cobre a pessoa) */
  foregroundFrom?: number | null;
  /** margem lateral mínima (fração da largura); padrão LAYOUT_EDGE_MARGIN */
  edgeMargin?: number;
}

export interface Composition {
  /** recorte do cenário em pixels da imagem (ausente sem cenário) */
  bgCrop?: Rect;
  /** fator de escala do cenário recortado para o quadro (1 sem cenário) */
  bgScale: number;
  /** retângulo da camada sobreposta (a caixa da pessoa) no quadro (pixels, pares) */
  presenter: Rect;
  /** retângulo do clipe inteiro no quadro (pode sair do quadro: tronco para fora da borda inferior) */
  clip: Rect;
  /** faixa do balcão no quadro (pixels), quando há `foregroundFrom` com cenário */
  foreground?: { y: number; height: number };
  /** valores efetivos (depois de limites e regras) */
  scale: number;
  centerX: number;
  bottom: number;
  /** topo da cabeça efetivo (fração da altura do quadro) */
  headTop: number;
}

export function clampRange(n: unknown, range: [number, number]): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(range[1], Math.max(range[0], n)) : undefined;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Recorte 16:9 (na proporção do quadro) do cenário: pela janela `frame`
 * (largura manda; a altura sai da proporção; tudo contido na imagem) ou pela
 * cobertura centralizada (como `scale=…:force_original_aspect_ratio=increase,crop`).
 */
export function backdropCrop(backdrop: { width: number; height: number; frame?: BackdropFrame | null }, frame: { width: number; height: number }): Rect {
  const iw = Math.max(2, backdrop.width);
  const ih = Math.max(2, backdrop.height);
  const ratio = frame.width / frame.height;
  const f = backdrop.frame;
  let cw: number;
  let ch: number;
  let cx: number;
  let cy: number;
  if (f && Number.isFinite(f.w) && f.w > 0) {
    cw = Math.min(iw, f.w * iw);
    ch = cw / ratio;
    if (ch > ih) {
      ch = ih;
      cw = ch * ratio;
    }
    cx = Math.min(Math.max(0, f.x * iw), iw - cw);
    cy = Math.min(Math.max(0, f.y * ih), ih - ch);
  } else if (iw / ih > ratio) {
    ch = ih;
    cw = ih * ratio;
    cx = (iw - cw) / 2;
    cy = 0;
  } else {
    cw = iw;
    ch = iw / ratio;
    cx = 0;
    cy = (ih - ch) / 2;
  }
  // inteiros contidos na imagem (o recorte é escalado para o quadro em seguida; a paridade vale só para a saída)
  const w = Math.max(2, Math.min(iw, Math.round(cw)));
  const h = Math.max(2, Math.min(ih, Math.round(ch)));
  const x = Math.max(0, Math.min(iw - w, Math.round(cx)));
  const y = Math.max(0, Math.min(ih - h, Math.round(cy)));
  return { x, y, w, h };
}

/** Faixa do balcão (par, dentro do quadro) a partir de `foregroundFrom`; undefined quando ausente ou sem altura útil. */
export function foregroundStrip(foregroundFrom: number | null | undefined, H: number): { y: number; height: number } | undefined {
  const f = clampRange(foregroundFrom, LAYOUT_FOREGROUND_RANGE);
  if (f === undefined) return undefined;
  const y = Math.min(H - 2, Math.floor((f * H) / 2) * 2);
  const height = H - y;
  return height >= 2 ? { y, height } : undefined;
}

/** Monta a composição (função pura). */
export function computeComposition(input: CompositionInput): Composition {
  const W = input.frame.width;
  const H = input.frame.height;
  const bgCrop = input.backdrop ? backdropCrop(input.backdrop, input.frame) : undefined;
  const bgScale = bgCrop ? W / bgCrop.w : 1;
  const foreground = input.backdrop ? foregroundStrip(input.foregroundFrom, H) : undefined;
  const fgFrom = foreground ? foreground.y / H : undefined;
  // base: só sobe do fundo do quadro quando a faixa do balcão esconde o corte, e nunca acima da linha do balcão
  const wantBottom = clampRange(input.presenterBottom, LAYOUT_BOTTOM_RANGE) ?? 1;
  const bottom = fgFrom !== undefined ? Math.max(fgFrom, wantBottom) : 1;
  const headOffset = clampRange(input.clip.headOffset, [0, 0.9]) ?? PRESENTER_HEAD_OFFSET;
  const headroom = clampRange(input.headroom, LAYOUT_HEADROOM_RANGE);
  const clipW = Math.max(1, input.clip.width);
  const clipH = Math.max(1, input.clip.height);
  const box = input.clip.box ?? { x: 0, y: 0, w: clipW, h: clipH };
  // altura do clipe inteiro no quadro (escala uniforme; inteiro par, como a saída yuv420p exige)
  let ph = even((clampRange(input.presenterScale, LAYOUT_SCALE_RANGE) ?? LAYOUT_DEFAULT_SCALE) * H);
  const baseY = Math.round(bottom * H);
  let clipTop: number;
  if (headroom !== undefined) {
    // topo da cabeça na linha da folga; o tronco continua para fora. Se a base do clipe subisse da base exigida, cresce até encostar
    clipTop = Math.round(headroom * H - headOffset * ph);
    if (clipTop + ph < baseY) {
      ph = even(Math.min(LAYOUT_SCALE_RANGE[1] * H, ((bottom - headroom) * H) / (1 - headOffset)));
      clipTop = baseY - ph;
    }
  } else {
    clipTop = baseY - ph;
  }
  const k = ph / clipH;
  const bw = even(box.w * k);
  const bh = even(box.h * k);
  const m = Math.round(W * (input.edgeMargin ?? LAYOUT_EDGE_MARGIN));
  const cx = clampRange(input.presenterX, LAYOUT_X_RANGE) ?? LAYOUT_CENTER_X[input.placement ?? 'center'];
  // a caixa da pessoa centrada em cx (posição do clipe inteiro daí), com a margem lateral mínima para a caixa
  let clipX = cx * W - (box.x + box.w / 2) * k;
  const lo = m;
  const hi = W - bw - m;
  const boxX = clipX + box.x * k;
  // caixa que não cabe com as margens (ex.: clipe inteiro sem caixa detectada): fica no centro pedido e transborda
  if (hi >= lo) clipX += Math.min(hi, Math.max(lo, boxX)) - boxX;
  const bx = Math.round(clipX + box.x * k);
  const by = Math.round(clipTop + box.y * k);
  const clip = { x: Math.round(clipX), y: clipTop, w: Math.round(clipW * k), h: ph };
  return {
    ...(bgCrop ? { bgCrop } : {}),
    bgScale,
    presenter: { x: bx, y: by, w: bw, h: bh },
    clip,
    ...(foreground ? { foreground } : {}),
    scale: Number((ph / H).toFixed(4)),
    centerX: Number(((bx + bw / 2) / W).toFixed(4)),
    bottom: Number(((clip.y + clip.h) / H).toFixed(4)),
    headTop: Number(((clip.y + headOffset * ph) / H).toFixed(4)),
  };
}

/** Predefinidos de enquadramento do cenário. */
export const BACKDROP_FRAME_PRESETS = ['wide', 'medium'] as const;
export type BackdropFramePreset = (typeof BACKDROP_FRAME_PRESETS)[number];
export const BACKDROP_FRAME_PRESET_LABELS: Record<BackdropFramePreset, string> = {
  wide: 'Plano aberto (imagem inteira)',
  medium: 'Plano médio (sem piso)',
};

/**
 * Janela "plano médio" genérica: sem o piso (os 20% de baixo), centralizada,
 * mantendo a proporção do quadro. Cenários com metadados próprios trazem a
 * janela exata (ex.: a recepção sem balcão mantém a placa à direita).
 */
export function mediumFrameFor(backdrop: { width: number; height: number }, frame: { width: number; height: number } = { width: 16, height: 9 }): BackdropFrame {
  const ratio = frame.width / frame.height;
  const hPx = Math.min(backdrop.height, backdrop.height * 0.8);
  const wPx = Math.min(backdrop.width, hPx * ratio);
  const h = (wPx / ratio) / backdrop.height;
  return { x: (1 - wPx / backdrop.width) / 2, y: 0, w: wPx / backdrop.width, h };
}

/**
 * A janela respeita a proporção do quadro? Em frações da imagem, a proporção
 * em pixels é (w·iw)/(h·ih); sem o tamanho da imagem, assume 16:9 (w ≈ h).
 * Devolve a altura corrigida quando difere mais de 1%.
 */
export function frameAspectFix(frame: BackdropFrame, image: { width: number; height: number } = { width: 16, height: 9 }, out: { width: number; height: number } = { width: 16, height: 9 }): number | undefined {
  const wantH = (frame.w * image.width) / (out.width / out.height) / image.height;
  return Math.abs(wantH - frame.h) > 0.01 ? Number(Math.min(1, wantH).toFixed(4)) : undefined;
}

/** Harmonização de cor da camada da apresentadora (só ela; valores conservadores). */
export const PRESENTER_GRADES = ['none', 'warm', 'cool'] as const;
export type PresenterGrade = (typeof PRESENTER_GRADES)[number];
export const PRESENTER_GRADE_LABELS: Record<PresenterGrade, string> = { none: 'Sem ajuste', warm: 'Mais quente', cool: 'Mais fria' };
/** filtro CSS equivalente para a prévia (tons de pele naturais; sem halo). `warm` espelha `eq=saturation=1.04:brightness=0.01`. */
export const PRESENTER_GRADE_CSS: Record<PresenterGrade, string> = {
  none: 'none',
  warm: 'brightness(1.02) saturate(1.04)',
  cool: 'brightness(1.01) saturate(0.97) hue-rotate(6deg)',
};
