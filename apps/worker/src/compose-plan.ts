import { createHash } from 'node:crypto';
import { CINEMATIC_MAX_SECONDS, clampShotToNativeFraming, resolveCameraPlacement, shotIsCinematic, type Camera, type CinematicAction, type ResolvedPlacement, type Shot } from '@lms/course-schema';
import type { ShotTiming } from '@lms/media/compose';

/**
 * Planejamento puro do vídeo dirigido (sem banco nem provedores).
 *
 * Itens de produção:
 * - `clip`: um vídeo de avatar no HeyGen (um plano, ou planos curtos vizinhos
 *   fundidos — a montagem recorta o clipe nos tempos originais);
 * - `audio`: plano `slide` (apresentador invisível) — só o trecho de áudio da
 *   narração, SEM clipe pago; a montagem usa o PNG do slide + esse áudio;
 * - `cinematic`: cena em movimento (HeyGen `cinematic_avatar`, por prompt): o
 *   trecho de áudio fica no NOSSO storage (como `audio`; não vai ao HeyGen) e o
 *   clipe é mudo na montagem — a narração toca por cima. Nunca é fundido.
 *
 * Cada item tem uma chave de reaproveitamento (`itemKey`) derivada do que o
 * produz (fala, voz, look, gesto, motor, fundo…). Um item com a mesma chave já
 * produzido por QUALQUER job do workspace (mesmo bloco primeiro) é reaproveitado:
 * editar a fala de um plano só refaz aquele plano.
 */
export const MIN_UNIT_SECONDS = 1.2;

export interface RenderUnit {
  /** id do primeiro plano do item (chave em input.shots) */
  id: string;
  kind: 'clip' | 'audio' | 'cinematic';
  shotIds: string[];
  /** fala do item (falas dos planos unidas por espaço) */
  script: string;
  cameraId?: string;
  motionPrompt?: string;
  /** pedido de câmera (inglês) da cena em movimento */
  cinematicPrompt?: string;
  cinematicAction?: CinematicAction;
}

/** Estado persistido por item em `job.input.shots[itemId]` (retries/reconciliação retomam daqui). */
export interface ShotState {
  kind?: 'clip' | 'audio' | 'cinematic';
  /** pedido final (assertivo) enviado na cena em movimento; fixado com a duração */
  cinematicFinalPrompt?: string;
  /** chave de reaproveitamento (ver itemKey); na cena em movimento, a do trecho de áudio */
  key?: string;
  /** cena em movimento: chave do clipe (prompt + look + duração + modelo + resolução), calculada após o corte do áudio */
  videoKey?: string;
  /** cena em movimento: duração pedida ao HeyGen (cinematicClipSeconds: mínimo da ação ou trecho + 0,5 s, 4–15 s) */
  cinematicSeconds?: number;
  /** clipe do apresentador renderizado sobre o fundo de continuidade da cena (quadro da cena em movimento) */
  plateBackground?: boolean;
  /** o HeyGen recusou o fundo de continuidade: clipe refeito com o fundo da apresentação */
  plateFallback?: boolean;
  /** simulação: início do trecho na narração (substituto do apresentador gerado depois do fundo) */
  simStartAt?: number;
  /** asset de áudio no HeyGen (segmento enviado) */
  audioAssetId?: string;
  /** segmento de áudio no NOSSO storage (itens `audio`) */
  segmentAssetId?: string;
  segmentSeconds?: number;
  heygenVideoId?: string | null;
  /** clipe baixado para o nosso storage */
  clipAssetId?: string;
  clipSeconds?: number;
  /** trecho de cada plano dentro do clipe (planos fundidos) */
  offsets?: Record<string, { start: number; duration?: number }>;
  /** reaproveitado de outro job com a mesma chave (sem nova cobrança) */
  reusedFrom?: string;
  /** incrementa quando o HeyGen falha e o item é reenviado (nova Idempotency-Key) */
  submitSeq?: number;
  failures?: number;
  lastFailure?: string;
  /** palavras da fala com tempos relativos ao trecho de áudio do item: [texto, início, fim] (legendas) */
  words?: Array<[string, number, number]>;
  /** colheita após estado final: o HeyGen informou falha deste clipe (não baixar) */
  harvestFailed?: boolean;
  // ---- apresentador posicionado (direita/esquerda) ----
  /** pedido enviado ao HeyGen: `alpha` = WebM transparente; `chroma` = plano B, fundo verde em MP4 */
  placementRequest?: 'alpha' | 'chroma';
  /** chave do vídeo transparente (sem fundo nem posição): reaproveitável entre posições, tamanhos e fundos */
  alphaKey?: string;
  /** vídeo do apresentador antes da montagem sobre o fundo (alfa, verde ou, na simulação, substituto opaco) */
  alphaClipAssetId?: string;
  alphaClipSeconds?: number;
  alphaKind?: 'alpha' | 'chroma' | 'opaque';
  /** vídeo transparente reaproveitado de outro job (sem nova cobrança) */
  reusedAlphaFrom?: string;
  /** centro horizontal da pessoa no clipe montado (enquadramentos seguem a pessoa) */
  focusX?: number;
  /** falhas da montagem sobre o fundo (3 = falha o job; o vídeo pago continua guardado) */
  placeFailures?: number;
}

export function estimateLineSeconds(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length / 2.5;
}

/** Plano que precisa do apresentador renderizado (os layouts `slide` e `card` com slide não precisam). */
export function shotNeedsPresenter(shot: Pick<Shot, 'layout' | 'slide'>, hasNarrationAudio: boolean): boolean {
  if (!hasNarrationAudio) return true; // voz do HeyGen: o áudio só existe dentro do clipe
  return !((shot.layout === 'slide' || shot.layout === 'card') && shot.slide);
}

/** Velocidade usada para checar falas de cena em movimento antes de pagar (mesma da IA diretora). */
const CINEMATIC_WORDS_PER_SECOND = 2.6;

/**
 * Problemas de planejamento das cenas em movimento (vazio = ok): exigem narração
 * própria (ElevenLabs/simulada), pedido de câmera e fala de até 15 s.
 */
export function cinematicPlanProblems(shots: Shot[], opts: { hasNarrationAudio: boolean }): string[] {
  const out: string[] = [];
  for (const s of shots) {
    if (s.layout !== 'cinematic') continue;
    if (!shotIsCinematic(s)) {
      out.push(`O plano "${s.id}" é uma cena em movimento sem pedido de câmera; preencha "Pedido de câmera (inglês)" ou troque o layout.`);
      continue;
    }
    if (!opts.hasNarrationAudio) out.push(`O plano "${s.id}" é uma cena em movimento, que exige a narração do ElevenLabs (a voz do HeyGen não toca por cima do vídeo); troque a voz da apresentação ou o layout do plano.`);
    const words = s.line.trim().split(/\s+/).filter(Boolean).length;
    const seconds = words / CINEMATIC_WORDS_PER_SECOND;
    if (seconds > CINEMATIC_MAX_SECONDS) out.push(`A fala do plano "${s.id}" (cena em movimento) dura cerca de ${Math.round(seconds)} s, mas a cena em movimento tem no máximo ${CINEMATIC_MAX_SECONDS} s; divida a fala em dois planos (≈ 38 palavras no máximo).`);
  }
  return out;
}

/**
 * Agrupa os planos em itens. A decisão de fusão usa a duração estimada pelo texto
 * (determinística antes de pagar a narração — permite calcular as chaves e
 * reaproveitar antes de sintetizar). Só funde planos de apresentador vizinhos.
 */
export function planRenderUnits(shots: Shot[], opts: { hasNarrationAudio: boolean; minSeconds?: number; durations?: number[] }): { units: RenderUnit[]; merged: string[] } {
  const min = opts.minSeconds ?? MIN_UNIT_SECONDS;
  const dur = (i: number) => opts.durations?.[i] ?? estimateLineSeconds(shots[i]!.line);
  const cine = shots.map((s) => s.layout === 'cinematic');
  // cena em movimento nunca é fundida (nem recebe fusão): conta como não-clipe aqui
  const clipShot = shots.map((s, i) => !cine[i] && shotNeedsPresenter(s, opts.hasNarrationAudio));
  let groups: number[][] = shots.map((_, i) => [i]);
  const gdur = (g: number[]) => g.reduce((a, i) => a + dur(i), 0);
  const isClip = (g: number[] | undefined) => !!g && clipShot[g[0]!]!;
  const merged: string[] = [];
  for (;;) {
    const k = groups.findIndex((g, idx) => isClip(g) && gdur(g) < min && groups.length > 1 && (isClip(groups[idx - 1]) || isClip(groups[idx + 1])));
    if (k < 0) break;
    const me = groups[k]!;
    const prev = isClip(groups[k - 1]) ? groups[k - 1] : undefined;
    const next = isClip(groups[k + 1]) ? groups[k + 1] : undefined;
    const cam = (g: number[]) => shots[g[0]!]!.cameraId ?? '';
    let target: number;
    if (!prev) target = k + 1;
    else if (!next) target = k - 1;
    else if (cam(prev) === cam(me) && cam(next) !== cam(me)) target = k - 1;
    else if (cam(next) === cam(me) && cam(prev) !== cam(me)) target = k + 1;
    else target = gdur(prev) <= gdur(next) ? k - 1 : k + 1;
    merged.push(shots[me[0]!]!.id);
    const a = Math.min(k, target);
    groups = [...groups.slice(0, a), [...groups[a]!, ...groups[a + 1]!], ...groups.slice(a + 2)];
    if (groups.length === 1) break;
  }
  const units = groups.map((g): RenderUnit => {
    // câmera/gesto do plano mais longo do item
    const main = g.reduce((best, i) => (dur(i) > dur(best) ? i : best), g[0]!);
    return {
      id: shots[g[0]!]!.id,
      kind: cine[g[0]!] ? 'cinematic' : clipShot[g[0]!] ? 'clip' : 'audio',
      shotIds: g.map((i) => shots[i]!.id),
      script: g.map((i) => shots[i]!.line.trim()).join(' '),
      cameraId: shots[main]!.cameraId,
      motionPrompt: shots[main]!.motionPrompt,
      ...(cine[g[0]!] ? { cinematicPrompt: shots[g[0]!]!.cinematic?.prompt?.trim(), cinematicAction: shots[g[0]!]!.cinematic?.action } : {}),
    };
  });
  return { units, merged };
}

/**
 * Planos como a MONTAGEM os usa: num item cuja câmera é `full_frame` (o
 * visual com o próprio fundo, ex.: a recepção com a placa DNA WORK), nunca há
 * zoom digital além do enquadramento nativo nem movimento digital — o
 * enquadramento mais fechado vira o nativo e push_in/pull_out/pans/drift viram
 * `static` (`clampShotToNativeFraming`). A câmera é a do ITEM (planos fundidos
 * usam o clipe dele). Planos sem mudança são devolvidos como estão.
 */
export function composeShotsFor<T extends Shot>(shots: readonly T[], units: readonly Pick<RenderUnit, 'kind' | 'shotIds'>[], fullFrameNative: (unit: Pick<RenderUnit, 'kind' | 'shotIds'>) => Camera['nativeFraming'] | null): { shots: T[]; adjusted: string[] } {
  const native = new Map<string, Camera['nativeFraming']>();
  for (const u of units) {
    if (u.kind !== 'clip') continue;
    const n = fullFrameNative(u);
    if (n) for (const id of u.shotIds) native.set(id, n);
  }
  const adjusted: string[] = [];
  const out = shots.map((s) => {
    const n = native.get(s.id);
    if (!n) return s;
    const c = clampShotToNativeFraming(s, n);
    if (c !== s) adjusted.push(s.id);
    return c;
  });
  return { shots: out, adjusted };
}

export class CameraNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraNotReadyError';
  }
}

type CameraLike = Pick<Camera, 'id' | 'lookId' | 'nativeFraming'> & { status?: string; name?: string };

/**
 * Câmera do item. `cameraId` ausente = apresentador principal (`input.avatarId`).
 * Câmera inexistente, ainda em geração, com falha ou sem look -> erro claro (o job falha).
 */
export function resolveCamera(cameras: CameraLike[] | undefined, cameraId: string | undefined, avatarId: string): { lookId: string; nativeFraming: Camera['nativeFraming']; cameraId?: string } {
  const list = cameras ?? [];
  if (!cameraId) {
    const main = list.find((c) => c.lookId === avatarId);
    return { lookId: avatarId, nativeFraming: main?.nativeFraming ?? 'medium' };
  }
  const cam = list.find((c) => c.id === cameraId);
  if (!cam) throw new CameraNotReadyError(`A câmera "${cameraId}" usada na direção não existe mais no kit de câmeras do curso.`);
  const status = cam.status ?? 'ready';
  if (status !== 'ready') throw new CameraNotReadyError(`A câmera "${cam.name ?? cam.id}" ainda não está pronta (${status === 'generating' ? 'em geração' : 'com falha na geração'}); aguarde ou troque a câmera do plano.`);
  if (!cam.lookId?.trim()) throw new CameraNotReadyError(`A câmera "${cam.name ?? cam.id}" não tem look do HeyGen associado.`);
  return { lookId: cam.lookId, nativeFraming: cam.nativeFraming ?? 'medium', cameraId: cam.id };
}

/** Posição resolvida de um item: a da câmera do item (ou da principal), senão a do curso. */
export interface UnitPlacement {
  placement: ResolvedPlacement;
  scale: number;
  /** vídeo transparente montado por nós ao lado (direita/esquerda) */
  transparent: boolean;
  /** centro horizontal livre (fração da largura), só quando definido */
  x?: number;
  /** base do recorte (fração da altura), só quando definida */
  bottom?: number;
  /** folga acima da cabeça, só quando definida */
  headroom?: number;
}

/**
 * Posição do item a partir do kit de câmeras e da posição do curso (`params`).
 * Mesma escolha de câmera de `resolveCamera` (sem `cameraId` = a câmera cujo look
 * é o apresentador principal). Câmera sem `placement` (ou `inherit`) = curso.
 */
export function resolveUnitPlacement(
  cameras: Array<Pick<Camera, 'id' | 'lookId'> & Partial<Pick<Camera, 'placement' | 'scale' | 'x' | 'bottom'>>> | undefined,
  cameraId: string | undefined,
  avatarId: string,
  course: { presenterPlacement?: unknown; presenterScale?: unknown; presenterX?: unknown; presenterBottom?: unknown; presenterHeadroom?: unknown } | undefined,
): UnitPlacement {
  const list = cameras ?? [];
  const cam = cameraId ? list.find((c) => c.id === cameraId) : list.find((c) => c.lookId === avatarId);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return resolveCameraPlacement(
    { presenterPlacement: typeof course?.presenterPlacement === 'string' ? course.presenterPlacement : undefined, presenterScale: num(Number(course?.presenterScale)), presenterX: num(course?.presenterX), presenterBottom: num(course?.presenterBottom), presenterHeadroom: num(course?.presenterHeadroom) },
    cam ?? null,
  );
}

/**
 * Rótulo da posição na chave do clipe. Centro = sem rótulo (chaves antigas
 * inalteradas); direita/esquerda = `right:0.92` (implica vídeo transparente,
 * como antes; posição livre/base só quando definidas: `right:0.92:x0.375:b0.85`);
 * tela cheia = `full_frame:opaque` (fundo do próprio look).
 */
export function placementKeyTag(p: UnitPlacement): string | undefined {
  if (p.transparent) return `${p.placement}:${p.scale}${p.x !== undefined ? `:x${p.x}` : ''}${p.bottom !== undefined ? `:b${p.bottom}` : ''}${p.headroom !== undefined ? `:h${p.headroom}` : ''}`;
  if (p.placement === 'full_frame') return 'full_frame:opaque';
  return undefined;
}

export interface ItemKeyInput {
  kind: 'clip' | 'audio';
  text: string;
  voice: { provider: string; voiceId: string | null; modelId?: string; stability?: number };
  lookId?: string;
  motionPrompt?: string;
  expressiveness?: string;
  removeBackground?: boolean;
  background?: string;
  engine?: string;
  resolution?: string;
  aspectRatio?: string;
  /**
   * posição resolvida (ver placementKeyTag): `right:0.92`/`left:1` = clipe final
   * montado por nós a partir do vídeo transparente; `full_frame:opaque` = look em
   * tela cheia com o próprio fundo. Ausente = centro (chaves antigas inalteradas)
   */
  placement?: string;
  /** harmonização de cor da apresentadora (só quando pedida; chaves antigas inalteradas) */
  grade?: string;
  adapterVersion: string;
  /** itens simulados nunca são reaproveitados por jobs reais (e vice-versa) */
  simulated: boolean;
}

export interface CinematicKeyInput {
  prompt: string;
  lookId: string;
  durationSeconds: number;
  model: string;
  resolution: string;
  adapterVersion: string;
  simulated: boolean;
}

/**
 * Chave do CLIPE da cena em movimento: não inclui o áudio (o clipe é mudo na
 * montagem) — editar só a fala, sem mudar a duração, reaproveita o clipe pago.
 */
export function cinematicKey(input: CinematicKeyInput): string {
  return createHash('sha256').update(JSON.stringify({ k: 'cinematic', p: input.prompt.replace(/\s+/g, ' ').trim(), l: input.lookId, d: input.durationSeconds, m: input.model, r: input.resolution, av: input.adapterVersion, sim: input.simulated })).digest('hex');
}

/** Chave de reaproveitamento de um item (sha256 do JSON canônico). */
export function itemKey(input: ItemKeyInput): string {
  const base = {
    k: input.kind,
    t: input.text.replace(/\s+/g, ' ').trim(),
    v: input.voice,
    sim: input.simulated,
    av: input.adapterVersion,
  };
  const clip = input.kind === 'clip'
    ? { l: input.lookId, m: input.motionPrompt?.trim() || null, e: input.expressiveness ?? null, rb: !!input.removeBackground, bg: input.background ?? null, en: input.engine ?? null, r: input.resolution ?? '1080p', ar: input.aspectRatio ?? '16:9', ...(input.placement ? { pl: input.placement } : {}), ...(input.grade ? { gr: input.grade } : {}) }
    : {};
  return createHash('sha256').update(JSON.stringify({ ...base, ...clip })).digest('hex');
}

/** Offsets dos planos dentro do item, a partir dos tempos de corte da narração. */
export function unitOffsets(unit: RenderUnit, timings: Map<string, ShotTiming>): Record<string, { start: number; duration?: number }> {
  const first = timings.get(unit.shotIds[0]!)!;
  const out: Record<string, { start: number; duration?: number }> = {};
  unit.shotIds.forEach((id, idx) => {
    const t = timings.get(id)!;
    const last = idx === unit.shotIds.length - 1;
    out[id] = last ? { start: t.start - first.start } : { start: t.start - first.start, duration: t.end - t.start };
  });
  return out;
}

/**
 * Trecho do clipe usado por cada plano: offsets gravados (alinhamento) ou, sem
 * eles (voz HeyGen), proporcional aos caracteres de cada fala.
 */
export function shotRanges(unit: RenderUnit, shots: Pick<Shot, 'id' | 'line'>[], offsets: ShotState['offsets'] | undefined, clipSeconds: number): Map<string, { startSeconds: number; durationSeconds?: number }> {
  const out = new Map<string, { startSeconds: number; durationSeconds?: number }>();
  if (unit.shotIds.length === 1) {
    out.set(unit.shotIds[0]!, { startSeconds: 0 });
    return out;
  }
  if (offsets && unit.shotIds.every((id) => offsets[id])) {
    for (const id of unit.shotIds) {
      const o = offsets[id]!;
      out.set(id, o.duration === undefined ? { startSeconds: o.start } : { startSeconds: o.start, durationSeconds: o.duration });
    }
    return out;
  }
  const byId = new Map(shots.map((s) => [s.id, s]));
  const total = unit.shotIds.reduce((a, id) => a + byId.get(id)!.line.trim().length, 0) || 1;
  let cursor = 0;
  unit.shotIds.forEach((id, idx) => {
    const len = (byId.get(id)!.line.trim().length / total) * clipSeconds;
    const last = idx === unit.shotIds.length - 1;
    out.set(id, last ? { startSeconds: cursor } : { startSeconds: cursor, durationSeconds: len });
    cursor += len;
  });
  return out;
}
