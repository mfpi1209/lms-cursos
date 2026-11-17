/**
 * "Isso cai em": traduz uma marca da revisão (cena + instante no vídeo da cena) no alvo exato do conserto. Função PURA
 * (roda no servidor, no navegador e nos testes): recebe o retrato da cena (`SceneReviewContext`, montado no servidor a
 * partir do rascunho, do asset e da legenda WebVTT) e devolve:
 *
 *  - TOMADA: o rótulo do `refazer-tomadas` (`aula/cena#<1º plano>`), índice, câmera e o trecho dela no vídeo. Grupos
 *    de planos = `continuousTakeGroups` sobre TODOS os planos (a mesma conta do `refazer-tomadas`); tempos = os do
 *    painel de pulsos (`shotTimeline`, proporcional à fala), refinados pela legenda quando há (o início de cada plano é
 *    achado na fala com `matchStepCues`, o mesmo casamento da montagem);
 *  - PLANO: id, layout, enquadramento, a fala do plano e o corte mais próximo;
 *  - FALA: a legenda e a palavra no instante (e as palavras dali em diante, para sugerir um `(na fala: "…")`);
 *  - TELA SIMULADA: gravação (seção do `.telas.md`) e o passo ativo, pela mesma agenda da montagem
 *    (`planSceneScreens` + `splitMockDurations`), com o início real de cada gravação (`durationSec` gravado);
 *  - PAINEL DE TÓPICOS: o tópico aceso e os visíveis, pela agenda da montagem (`scheduleZonePanel`).
 */
import { continuousTakeGroups, screenMockStepLine, shotNeedsPresenter, shotTimeline, takeRetake, type ScreenMock, type Shot } from '@lms/course-schema';
import { ZONE_PANEL, matchStepCues, planSceneScreens, scheduleSteps, scheduleZonePanel, splitMockDurations, wordsFromCues, type CaptionCue, type CaptionWord } from '@lms/media/timing';

export const REVIEW_CATEGORIES = [
  { id: 'cut', label: 'Corte/emenda' },
  { id: 'sync', label: 'Sincronia fala×tela' },
  { id: 'gesture', label: 'Gesto/mão' },
  { id: 'wrist', label: 'Pulso/acessório' },
  { id: 'face', label: 'Avatar travou/rosto' },
  { id: 'screen', label: 'Tela simulada' },
  { id: 'topics', label: 'Painel de tópicos' },
  { id: 'speech', label: 'Fala/legenda' },
  { id: 'other', label: 'Outro' },
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number]['id'];
export const categoryLabel = (id: string): string => REVIEW_CATEGORIES.find((c) => c.id === id)?.label ?? id;
/** categorias que pedem refazer a tomada do apresentador */
export const RETAKE_CATEGORIES: readonly ReviewCategory[] = ['gesture', 'wrist', 'face'];

export type ReviewShot = Pick<Shot, 'id' | 'line' | 'cameraId' | 'framing' | 'layout'> & { slide?: { title?: string; bullets?: string[] } };

/** Retrato serializável de uma cena com vídeo, para resolver marcas (montado no servidor). */
export interface SceneReviewContext {
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  title: string;
  /** vídeo da cena (asset) e o hash da cena que o gerou */
  assetId: string;
  sceneHash: string | null;
  captionsAssetId: string | null;
  /** duração gravada no asset (s); o player pode corrigir com a duração real do vídeo */
  durationSec: number | null;
  /** legenda WebVTT da cena já lida (tempo do vídeo final) */
  cues: CaptionCue[];
  captionsApprox: boolean;
  /** voz à parte (ElevenLabs): planos de slide/cartão não precisam do apresentador */
  hasNarrationAudio: boolean;
  /** planos da direção (null = cena sem direção, plano único) */
  shots: ReviewShot[] | null;
  /** planos tirados no ajuste fino (não estão no vídeo) */
  dropped: string[];
  retake: Record<string, number>;
  cameras: Array<{ id: string; zone?: string }>;
  topics: Array<{ text: string; cue?: string }> | null;
  /** cena com o cartão "Pergunta a seguir" no fim (o painel termina antes dele) */
  teaser: boolean;
  /** gravações de tela da cena, na ordem (null = cena de apresentador) */
  screens: Array<{ fileName: string; durationSec?: number; source?: 'upload' | 'mock'; mock?: ScreenMock }> | null;
}

export interface ResolvedTake {
  /** rótulo do `refazer-tomadas`: `aula/cena#<1º plano>` */
  id: string;
  index: number;
  total: number;
  firstShotId: string;
  shotIds: string[];
  cameraId: string | null;
  cameraZone: string | null;
  start: number;
  end: number;
  /** variação atual da tomada (0 = original) */
  variation: number;
  /** dá para refazer só esta tomada com o `refazer-tomadas` */
  retakeable: boolean;
  why?: string;
}

export interface ResolvedShot {
  id: string;
  /** posição do plano na direção (1-based) */
  index: number;
  total: number;
  layout: string;
  framing: string | null;
  cameraId: string | null;
  start: number;
  end: number;
  line: string;
  slide?: { title: string; bullets: string[] };
  /** corte (troca de plano ou de tomada) mais próximo do instante */
  nearestCut?: { at: number; deltaSec: number; from: string; to: string; cameraChange: boolean };
  /** tempos achados na legenda (senão, proporcionais ao tamanho da fala) */
  timing: 'fala' | 'proporcional';
}

export interface ResolvedSpeech {
  /** legenda no instante (ou a mais próxima antes dele) */
  cue: string;
  cueStart: number;
  cueEnd: number;
  word: string | null;
  /** algumas palavras antes e depois do instante */
  around: string;
  /** até 5 palavras a partir do instante: serve de `(na fala: "…")` */
  fromHere: string;
  approx: boolean;
}

export interface ResolvedStep {
  /** 1-based */
  index: number;
  line: string;
  start: number;
  end: number;
  cue?: string;
}

export interface ResolvedScreen {
  /** 1-based */
  recordingIndex: number;
  total: number;
  fileName: string;
  /** seção do arquivo de telas (`## <section>` ou `## <section>@<CENA>`) */
  section: string;
  start: number;
  end: number;
  model: string | null;
  generated: boolean;
  step?: ResolvedStep;
  /** antes do 1º passo: o passo que vem */
  nextStep?: ResolvedStep;
  totalSteps: number;
  timing: 'fala' | 'proporcional';
}

export interface ResolvedTopic {
  /** tópico aceso mais recente (1-based) ou null (nenhum aceso ainda) */
  index: number | null;
  text: string | null;
  cue?: string;
  start?: number;
  page: number;
  visible: string[];
  lit: number;
  next?: { index: number; text: string; start: number };
  total: number;
}

export interface MarkResolution {
  lessonId: string;
  nodeId: string;
  sceneTitle: string;
  timeSec: number;
  durationSec: number;
  take?: ResolvedTake;
  shot?: ResolvedShot;
  speech?: ResolvedSpeech;
  screen?: ResolvedScreen;
  topic?: ResolvedTopic;
  edge?: 'início da cena' | 'fim da cena';
  notes: string[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** `m:ss.s` */
export function fmtTime(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** Duração usada para a conta: a do player (real) quando há, senão a gravada, senão o fim da legenda. */
export function sceneDuration(ctx: Pick<SceneReviewContext, 'durationSec' | 'cues'>, playerDurationSec?: number | null): number {
  if (playerDurationSec && Number.isFinite(playerDurationSec) && playerDurationSec > 0) return playerDurationSec;
  if (ctx.durationSec && ctx.durationSec > 0) return ctx.durationSec;
  return ctx.cues.length ? ctx.cues[ctx.cues.length - 1]!.end : 0;
}

export interface ShotTiming {
  id: string;
  index: number;
  start: number;
  end: number;
}

/**
 * Trecho de cada plano MANTIDO no vídeo: proporcional ao tamanho da fala (`shotTimeline`, o do painel de pulsos) e, com
 * legenda, o início de cada plano onde a fala chega nele (`matchStepCues`). Sempre crescente.
 */
export function shotTimings(shots: ReadonlyArray<Pick<Shot, 'id' | 'line'>>, dropped: readonly string[], durationSec: number, words: ReadonlyArray<CaptionWord>): { spans: ShotTiming[]; timing: 'fala' | 'proporcional' } {
  const base = shotTimeline(shots, { durationSeconds: durationSec, dropped });
  if (!words.length || base.length < 2) return { spans: base, timing: 'proporcional' };
  const found = matchStepCues(base.map((sp) => ({ kind: 'highlight', text: shots[sp.index]!.line })), words).times;
  if (found.slice(1).every((t) => t === undefined)) return { spans: base, timing: 'proporcional' };
  // o casamento começa na 1ª palavra de CONTEÚDO da fala do plano: volta as palavras curtas do começo ("Em", "E a")
  const norm = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const back = (i: number, t: number): number => {
    let wi = words.findIndex((w) => Math.abs(w.start - t) < 1e-6);
    if (wi < 0) return t;
    const lead = shots[base[i]!.index]!.line.split(/\s+/).map(norm).filter(Boolean);
    const at = lead.indexOf(norm(words[wi]!.text));
    for (let k = at - 1; k >= 0 && wi > 0 && norm(words[wi - 1]!.text) === lead[k]; k--) wi--;
    return words[wi]!.start;
  };
  const starts = base.map((sp, i) => (i === 0 ? 0 : found[i] !== undefined ? back(i, found[i]!) : sp.start));
  for (let i = 1; i < starts.length; i++) starts[i] = Math.min(durationSec, Math.max(starts[i]!, starts[i - 1]!));
  return { spans: base.map((sp, i) => ({ ...sp, start: starts[i]!, end: i + 1 < starts.length ? starts[i + 1]! : durationSec })), timing: 'fala' };
}

/** Palavras até o fim da frase (no máximo as dadas), sem a pontuação final: serve de `(na fala: "…")`. */
function untilSentenceEnd(ws: string[]): string {
  const end = ws.findIndex((w) => /[.!?…]["”']?$/u.test(w));
  return (end >= 0 ? ws.slice(0, end + 1) : ws).join(' ').replace(/[.,;:!?…"”']+$/u, '');
}

function speechAt(words: ReadonlyArray<CaptionWord>, cues: ReadonlyArray<CaptionCue>, t: number, approx: boolean): ResolvedSpeech | undefined {
  if (!cues.length) return undefined;
  let ci = cues.findIndex((c) => t >= c.start && t < c.end);
  if (ci < 0) {
    ci = -1;
    cues.forEach((c, i) => {
      if (c.start <= t) ci = i;
    });
    if (ci < 0) ci = 0;
  }
  let wi = words.findIndex((w) => t >= w.start && t < w.end);
  if (wi < 0) {
    wi = words.findIndex((w) => w.start > t);
    if (wi < 0) wi = words.length - 1;
  }
  const w = words[wi];
  // a legenda é a da palavra (entre duas legendas, a que vem)
  if (w) {
    const wc = cues.findIndex((c) => w.start >= c.start - 1e-6 && w.start < c.end);
    if (wc >= 0) ci = wc;
  }
  const cue = cues[ci]!;
  return {
    cue: cue.text,
    cueStart: r3(cue.start),
    cueEnd: r3(cue.end),
    word: w ? w.text : null,
    around: words.slice(Math.max(0, wi - 4), wi + 5).map((x) => x.text).join(' '),
    fromHere: untilSentenceEnd(words.slice(Math.max(0, wi), wi + 5).map((x) => x.text)),
    approx,
  };
}

function directedAt(ctx: SceneReviewContext, t: number, dur: number, words: ReadonlyArray<CaptionWord>, notes: string[]): { take?: ResolvedTake; shot?: ResolvedShot } {
  const shots = ctx.shots!;
  const { spans, timing } = shotTimings(shots, ctx.dropped, dur, words);
  if (!spans.length) return {};
  if (timing === 'proporcional') notes.push('tempos dos planos aproximados (proporcionais à fala)');
  const si = Math.max(0, spans.findIndex((sp, i) => t < sp.end || i === spans.length - 1));
  const span = spans[si]!;
  const shot = shots[span.index]!;
  // grupos de planos sobre TODOS os planos: o mesmo agrupamento do `refazer-tomadas` (takesOf)
  const groups = continuousTakeGroups(shots as unknown as Shot[], { hasNarrationAudio: ctx.hasNarrationAudio });
  const gi = groups.findIndex((g) => g.includes(span.index));
  const g = groups[gi]!;
  const first = shots[g[0]!]!;
  const memberSpans = spans.filter((sp) => g.includes(sp.index));
  const zone = (id: string | undefined) => (id ? (ctx.cameras.find((c) => c.id === id)?.zone ?? null) : null);
  const presenter = first.layout !== 'cinematic' && shotNeedsPresenter(first as Pick<Shot, 'layout' | 'slide'>, ctx.hasNarrationAudio);
  const take: ResolvedTake = {
    id: `${ctx.lessonId}/${ctx.nodeId}#${first.id}`,
    index: gi + 1,
    total: groups.length,
    firstShotId: first.id,
    shotIds: g.map((k) => shots[k]!.id),
    cameraId: first.cameraId ?? null,
    cameraZone: zone(first.cameraId),
    start: r3(Math.min(...memberSpans.map((m) => m.start))),
    end: r3(Math.max(...memberSpans.map((m) => m.end))),
    variation: takeRetake(ctx.retake, g.map((k) => shots[k]!.id)),
    retakeable: presenter,
    ...(presenter ? {} : { why: first.layout === 'cinematic' ? 'cena em movimento (não é clipe de apresentador)' : 'plano de slide/cartão sem apresentador' }),
  };
  // corte mais próximo: fronteiras entre planos mantidos
  let nearestCut: ResolvedShot['nearestCut'];
  for (let i = 1; i < spans.length; i++) {
    const at = spans[i]!.start;
    const d = Math.abs(t - at);
    if (!nearestCut || d < Math.abs(nearestCut.deltaSec)) {
      const a = shots[spans[i - 1]!.index]!;
      const b = shots[spans[i]!.index]!;
      nearestCut = { at: r3(at), deltaSec: r3(t - at), from: a.id, to: b.id, cameraChange: (a.cameraId ?? '') !== (b.cameraId ?? '') };
    }
  }
  const slide = shot.slide && (shot.slide.title || shot.slide.bullets?.length) ? { title: shot.slide.title ?? '', bullets: shot.slide.bullets ?? [] } : undefined;
  return {
    take,
    shot: {
      id: shot.id,
      index: span.index + 1,
      total: shots.length,
      layout: shot.layout ?? 'presenter',
      framing: shot.framing ?? null,
      cameraId: shot.cameraId ?? null,
      start: r3(span.start),
      end: r3(span.end),
      line: shot.line,
      ...(slide ? { slide } : {}),
      ...(nearestCut ? { nearestCut } : {}),
      timing,
    },
  };
}

function screenAt(ctx: SceneReviewContext, t: number, dur: number, words: ReadonlyArray<CaptionWord>): ResolvedScreen | undefined {
  const recs = ctx.screens!;
  if (!recs.length) return undefined;
  // início REAL de cada gravação: a duração gravada de cada uma (como a conferência `qa-telas`); a última vai até o fim
  const known = recs.reduce((a, r) => a + (r.durationSec ?? 0), 0);
  const missing = recs.filter((r) => !r.durationSec).length;
  const each = missing ? Math.max(0, dur - known) / missing : 0;
  const starts: number[] = [];
  const durs: number[] = [];
  let pos = 0;
  recs.forEach((r, i) => {
    const d = i === recs.length - 1 ? Math.max(0.1, dur - pos) : Math.min(r.durationSec ?? each, Math.max(0.1, dur - pos));
    starts.push(pos);
    durs.push(d);
    pos += d;
  });
  let ri = 0;
  for (let i = 0; i < recs.length; i++) if (t >= starts[i]!) ri = i;
  const rec = recs[ri]!;
  const base: ResolvedScreen = {
    recordingIndex: ri + 1,
    total: recs.length,
    fileName: rec.fileName,
    section: rec.fileName.replace(/\.mp4$/i, ''),
    start: r3(starts[ri]!),
    end: r3(starts[ri]! + durs[ri]!),
    model: rec.mock ? `${rec.mock.model}/${rec.mock.device}` : null,
    generated: !!rec.mock,
    totalSteps: rec.mock?.steps.length ?? 0,
    timing: 'proporcional',
  };
  if (!rec.mock) return base;
  // agenda da montagem: passos procurados na fala em sequência (a busca de uma tela continua de onde a anterior parou)
  const plan = planSceneScreens(recs.map((r) => (r.mock ? { steps: r.mock.steps } : { uploadSec: r.durationSec ?? 0 })), words, dur, splitMockDurations);
  const rel = plan.stepStarts[ri];
  const stepStarts = (rel ?? scheduleSteps(rec.mock.steps.map((s) => s.weight), durs[ri]!).windows.map((w) => w.start)).map((x) => starts[ri]! + x);
  const steps = rec.mock.steps;
  const mk = (k: number): ResolvedStep => ({
    index: k + 1,
    line: screenMockStepLine(steps[k]!),
    start: r3(stepStarts[k]!),
    end: r3(k + 1 < steps.length ? stepStarts[k + 1]! : starts[ri]! + durs[ri]!),
    ...(steps[k]!.cue ? { cue: steps[k]!.cue } : {}),
  });
  let k = -1;
  stepStarts.forEach((s0, i) => {
    if (t >= s0) k = i;
  });
  return { ...base, timing: rel ? 'fala' : 'proporcional', ...(k >= 0 ? { step: mk(k) } : { nextStep: mk(0) }) };
}

function topicAt(ctx: SceneReviewContext, t: number, dur: number, words: ReadonlyArray<CaptionWord>): ResolvedTopic | undefined {
  const topics = ctx.topics!;
  if (!topics.length || dur <= 0) return undefined;
  // janela do painel (como `screenTextWindow`): de 0,6 s até o fim, ou até a "Pergunta a seguir" (3 s finais) entrar
  const win = { from: 0.6, to: ctx.teaser ? Math.max(0.7, dur - 3.1) : dur };
  const steps = scheduleZonePanel(topics, words.length ? words : undefined, win, 30);
  let cur = steps[0]!;
  for (const s of steps) if (s.at <= t) cur = s;
  const per = ZONE_PANEL.perPage;
  const shownMax = steps.reduce((n, s) => (s.topic !== undefined ? Math.max(n, s.topic + 1) : n), 0);
  const visible = topics.slice(0, shownMax).slice(cur.page * per, (cur.page + 1) * per).map((x) => x.text);
  const litIdx = cur.lit > 0 ? cur.page * per + cur.lit - 1 : null;
  const litStep = litIdx !== null ? steps.find((s) => s.topic === litIdx) : undefined;
  const nextStep = steps.find((s) => s.topic !== undefined && s.at > t);
  return {
    index: litIdx !== null ? litIdx + 1 : null,
    text: litIdx !== null ? topics[litIdx]!.text : null,
    ...(litIdx !== null && topics[litIdx]!.cue ? { cue: topics[litIdx]!.cue } : {}),
    ...(litStep ? { start: r3(litStep.at) } : {}),
    page: cur.page + 1,
    visible,
    lit: cur.lit,
    ...(nextStep ? { next: { index: nextStep.topic! + 1, text: topics[nextStep.topic!]!.text, start: r3(nextStep.at) } } : {}),
    total: topics.length,
  };
}

/** Resolve o instante `t` (s, no vídeo da cena). `playerDurationSec` = duração real lida pelo player (opcional). */
export function resolveMark(ctx: SceneReviewContext, t: number, playerDurationSec?: number | null): MarkResolution {
  const dur = sceneDuration(ctx, playerDurationSec);
  const time = Math.max(0, Math.min(t, dur || t));
  const words = wordsFromCues(ctx.cues);
  const notes: string[] = [];
  if (!ctx.cues.length) notes.push('cena sem legenda: fala e tempos aproximados');
  else if (ctx.captionsApprox) notes.push('legenda com tempo aproximado');
  const out: MarkResolution = { lessonId: ctx.lessonId, nodeId: ctx.nodeId, sceneTitle: ctx.title, timeSec: r3(time), durationSec: r3(dur), notes };
  if (dur > 0 && time < 1.2) out.edge = 'início da cena';
  else if (dur > 0 && dur - time < 1.2) out.edge = 'fim da cena';
  const speech = speechAt(words, ctx.cues, time, ctx.captionsApprox);
  if (speech) out.speech = speech;
  if (ctx.screens?.length) {
    const screen = screenAt(ctx, time, dur, words);
    if (screen) out.screen = screen;
  } else if (ctx.shots?.length) {
    Object.assign(out, directedAt(ctx, time, dur, words, notes));
  } else {
    out.take = { id: `${ctx.lessonId}/${ctx.nodeId}#unico`, index: 1, total: 1, firstShotId: 'unico', shotIds: [], cameraId: null, cameraZone: null, start: 0, end: r3(dur), variation: 0, retakeable: false, why: 'cena sem direção (plano único): só dá para gerar a cena inteira de novo' };
  }
  if (ctx.topics?.length && !ctx.screens?.length) {
    const topic = topicAt(ctx, time, dur, words);
    if (topic) out.topic = topic;
  }
  return out;
}

/** Fala de `t - span` a `t + span` (s), pelas palavras da legenda: o "Fala naquele trecho" do prompt de correção. */
export function speechWindow(cues: ReadonlyArray<CaptionCue>, t: number, span = 3): { from: number; to: number; text: string } {
  const from = Math.max(0, t - span);
  const to = t + span;
  const words = wordsFromCues(cues).filter((w) => w.end > from && w.start < to);
  return { from: r3(from), to: r3(to), text: words.map((w) => w.text).join(' ') };
}
