import { execFile } from 'node:child_process';
import { ffmpegBin } from './ffmpeg';
import type { CameraMove, Framing, Layout, Transition } from './compose';
import type { Zone } from './zones';

/**
 * Emendas entre planos SEM "travamento".
 *
 * Cada plano do apresentador é um clipe gerado separadamente: o clipe que sai termina com o avatar parado, de
 * boca fechada, por alguns décimos depois da última palavra, e o que entra começa com OUTRA pose (e, às vezes,
 * um respiro antes da primeira palavra). Parada + salto = o "rápido travamento" que o aluno vê no corte.
 *
 * Esta peça resolve em duas frentes (tudo local, sem custo):
 *  1. `tightenBounds`: o plano que sai termina logo depois da última palavra e o que entra começa um instante
 *     antes da primeira, com o corte no ponto de MENOR VOLUME (`quietestIn`); a pausa natural entre frases
 *     (`joinPause`) é preservada em ÁUDIO, e a IMAGEM nunca fica parada além disso.
 *  2. `framingPunchPlan`: em cada troca de plano da MESMA câmera o enquadramento alterna (base ↔ punch-in
 *     leve, centrado no rosto), que é o que um editor faria para esconder o salto de pose.
 * `cleanTransitions` tira a fusão sobre quadro congelado (a fusão só existia por causa da parada).
 */

/** frequência de amostragem da análise de volume */
const SR = 16000;
/** janela da análise (10 ms) */
const WIN = SR / 100;
export const ENVELOPE_STEP = 0.01;

export const JOIN = {
  /** pausa de ÁUDIO entre planos de clipes diferentes: depois de fim de frase / no meio de frase (s) */
  pauseSentence: 0.2,
  pauseMid: 0.15,
  /**
   * quanto da pausa fica no plano que sai (o resto, no que entra): o avatar que sai já "assentou" a pose no fim da fala, então
   * a cauda é curta; o que entra já está se mexendo antes da primeira palavra, então o respiro fica com ele
   */
  tailShare: 0.3,
  /** respiro no começo da cena e no fim dela (não há emenda: a vinheta/pergunta cuida do resto) */
  sceneLead: 0.12,
  sceneTail: 0.25,
  /** o ponto de corte é o mais silencioso dentro de ± esta folga (s) */
  cutSlack: 0.03,
  /** limites do limiar de fala (dBFS): o piso medido + 12 dB, entre estes valores */
  thrMin: -60,
  thrMax: -46,
  /** quanto o som pode passar do fim da última palavra (do alinhamento) antes de ser tratado como ruído (s) */
  hintTolerance: 0.3,
  /** punch-in alternado (zoom do quadro; 1,14 ≈ 12% de recorte) */
  punch: 1.14,
  /** o recorte do punch-in tira no máximo isto do TOPO (fração da altura): a cabeça nunca é cortada */
  punchTopCut: 0.015,
  /** posição horizontal da pessoa no quadro por zona do estúdio (o recorte vai para o lado dela) */
  zoneFocusX: { left: 0.27, right: 0.73, center: 0.5 } as Record<Zone, number>,
} as const;

/** Pausa de áudio alvo na emenda depois de um plano cuja fala termina em `prevLine`. */
export function joinPause(prevLine: string | undefined): number {
  return prevLine && /[.!?…]["'”»)]*\s*$/.test(prevLine.trim()) ? JOIN.pauseSentence : JOIN.pauseMid;
}

/* ------------------------------------------------------------------ */
/* Envelope de volume                                                  */
/* ------------------------------------------------------------------ */

/** Volume (dBFS, RMS de 10 ms) de PCM s16le mono 16 kHz. Função pura. */
export function envelopeFromPcm(pcm: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const n = Math.floor(buf.length / 2);
  const out: number[] = [];
  for (let i = 0; i + WIN <= n; i += WIN) {
    let acc = 0;
    for (let k = i; k < i + WIN; k++) {
      const v = buf.readInt16LE(k * 2);
      acc += v * v;
    }
    out.push(20 * Math.log10(Math.sqrt(acc / WIN) / 32768 + 1e-9));
  }
  return out;
}

function readPcm(src: string, from: number, to: number): Promise<Buffer> {
  return new Promise((resolve) =>
    execFile(ffmpegBin(), ['-nostdin', '-v', 'error', '-ss', from.toFixed(3), '-t', (to - from).toFixed(3), '-i', src, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 64 << 20 }, (err, out) => resolve(err ? Buffer.alloc(0) : (out as Buffer))),
  );
}

/** Envelope (dBFS a cada 10 ms) do áudio de `src` entre `from` e `to`; vazio quando não há som legível. */
export async function audioEnvelope(src: string, from: number, to: number): Promise<number[]> {
  if (!(to - from > 0.03)) return [];
  return envelopeFromPcm(await readPcm(src, Math.max(0, from), to));
}

/** Ponto mais silencioso (centro da janela de 10 ms de menor volume) entre `a` e `b` (s), no tempo de `base`. */
export function quietestIn(env: readonly number[], base: number, a: number, b: number, fallback: number): number {
  const i0 = Math.max(0, Math.floor((a - base) / ENVELOPE_STEP));
  const i1 = Math.min(env.length - 1, Math.ceil((b - base) / ENVELOPE_STEP));
  let best = -1;
  let bestDb = Infinity;
  for (let i = i0; i <= i1; i++) {
    // empate: o mais perto do alvo (centro da janela) — evita andar à toa dentro de um trecho todo mudo
    const db = env[i]! + Math.abs(i - (i0 + i1) / 2) * 1e-6;
    if (db < bestDb) { bestDb = db; best = i; }
  }
  return best < 0 ? fallback : base + (best + 0.5) * ENVELOPE_STEP;
}

/**
 * Ponto de menor volume (janelas de 10 ms) entre `from` e `to` no áudio do clipe: onde cortar sem levar sílaba
 * da palavra vizinha. Sem som legível ou janela curta demais, devolve `fallback`.
 */
export async function quietestPoint(src: string, from: number, to: number, fallback: number): Promise<number> {
  if (!(to - from > 0.03)) return fallback;
  const pcm = await readPcm(src, from, to);
  const n = Math.floor(pcm.length / 2);
  if (n < WIN) return fallback;
  let best = -1;
  let bestRms = Infinity;
  // janelas de 10 ms com passo de 5 ms
  for (let i = 0; i + WIN <= n; i += WIN / 2) {
    let acc = 0;
    for (let k = i; k < i + WIN; k++) { const v = pcm.readInt16LE(k * 2); acc += v * v; }
    const rms = Math.sqrt(acc / WIN);
    if (rms < bestRms) { bestRms = rms; best = i; }
  }
  return best < 0 ? fallback : from + (best + WIN / 2) / SR;
}

/** Limiar de fala (dBFS) pelo piso de ruído do trecho: piso + 12 dB, entre `thrMin` e `thrMax`. */
export function speechThreshold(env: readonly number[]): number {
  if (!env.length) return JOIN.thrMax;
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.05)]!;
  return Math.min(JOIN.thrMax, Math.max(JOIN.thrMin, floor + 12));
}

/** Primeiro e último instante com fala (s, relativos ao começo do envelope): dois blocos seguidos acima do limiar. */
export function speechEdges(env: readonly number[], thr = speechThreshold(env)): { first: number; last: number } | null {
  const on = (i: number) => (env[i] ?? -Infinity) > thr;
  let first = -1;
  for (let i = 0; i + 1 < env.length; i++) if (on(i) && on(i + 1)) { first = i; break; }
  if (first < 0) return null;
  let last = first;
  for (let i = env.length - 1; i > first; i--) if (on(i) && on(i - 1)) { last = i; break; }
  return { first: first * ENVELOPE_STEP, last: (last + 1) * ENVELOPE_STEP };
}

/* ------------------------------------------------------------------ */
/* Aperto das bordas do plano                                          */
/* ------------------------------------------------------------------ */

export interface TightenInput {
  /** trecho do arquivo que o plano usa (s, no tempo do arquivo) */
  from: number;
  to: number;
  /** envelope de volume do trecho (10 ms), a partir de `from` */
  env: readonly number[];
  /** a borda do trecho é a borda do clipe (o começo do 1º plano / o fim do último do item): só ela é apertada */
  head: boolean;
  tail: boolean;
  /** respiro mantido antes da 1ª palavra e depois da última (s) */
  lead: number;
  tailPad: number;
  /** até onde há IMAGEM no arquivo (s; o corte do fim nunca passa daqui + 1 quadro) */
  videoEnd?: number;
  fps: number;
  /** início da 1ª palavra e fim da última do trecho (alinhamento; tempo do arquivo): confere/limita o som */
  firstWord?: number;
  lastWord?: number;
}

export interface TightenResult {
  start: number;
  end: number;
  /** quanto saiu do começo / do fim (s) */
  headTrim: number;
  tailTrim: number;
  /** de onde veio o fim da fala: medido no som, no alinhamento, ou não houve (clipe mudo) */
  source: 'audio' | 'words' | 'none';
}

/**
 * Novo começo e fim do trecho: o plano começa `lead` antes da fala e termina `tailPad` depois dela, com o corte no
 * ponto de menor volume e nos quadros (25 qps). Nunca invade a fala (usa o mais tardio entre o som e a palavra
 * quando concordam). Função pura (testada).
 */
export function tightenBounds(i: TightenInput): TightenResult {
  const none: TightenResult = { start: i.from, end: i.to, headTrim: 0, tailTrim: 0, source: 'none' };
  const edges = speechEdges(i.env);
  if (!edges) return none;
  const frame = 1 / i.fps;
  const abs = { first: i.from + edges.first, last: i.from + edges.last };
  let source: TightenResult['source'] = 'audio';
  // alinhamento por palavra: confere o som. O fim da ÚLTIMA palavra costuma vir ~0,25 s além do som (inclui a cauda),
  // então ele nunca estende o plano; mas som bem depois da última palavra é ruído/respiração, não fala (vale a palavra).
  // O começo da primeira palavra é confiável (±50 ms): se o som só aparece depois dela, vale o mais cedo.
  let first = abs.first;
  let last = abs.last;
  if (i.lastWord !== undefined && last > i.lastWord + JOIN.hintTolerance) { last = i.lastWord + 0.15; source = 'words'; }
  if (i.firstWord !== undefined) first = Math.min(first, i.firstWord);

  let start = i.from;
  let end = i.to;
  if (i.head) {
    const want = first - i.lead;
    if (want > i.from + frame) {
      // o ponto mais silencioso perto do alvo, sempre antes da fala
      const q = quietestIn(i.env, i.from, want - JOIN.cutSlack, Math.min(want + JOIN.cutSlack, first - 0.02), want);
      let st = Math.round(Math.min(q, first - 0.02) / frame) * frame;
      if (st > first - 0.02) st -= frame;
      start = Math.max(i.from, st);
    }
  }
  if (i.tail) {
    const want = last + i.tailPad;
    let cap = i.to;
    if (i.videoEnd !== undefined) cap = Math.min(cap, i.videoEnd + frame);
    if (want < cap - frame) {
      const q = quietestIn(i.env, i.from, Math.max(last + 0.04, want - JOIN.cutSlack), want + JOIN.cutSlack, want);
      let en = Math.round(Math.max(q, last + 0.04) / frame) * frame;
      if (en < last + 0.04) en += frame;
      end = Math.min(cap, en);
    } else end = cap;
  }
  if (end - start < 0.3) return none;
  return { start, end, headTrim: start - i.from, tailTrim: i.to - end, source };
}

/** Mesma conta, lendo o som do arquivo (um ffmpeg por plano). */
export async function tightenFromFile(src: string, p: Omit<TightenInput, 'env'>): Promise<TightenResult> {
  const env = await audioEnvelope(src, p.from, p.to);
  return env.length ? tightenBounds({ ...p, env }) : { start: p.from, end: p.to, headTrim: 0, tailTrim: 0, source: 'none' };
}

/* ------------------------------------------------------------------ */
/* Enquadramento alternado                                             */
/* ------------------------------------------------------------------ */

export interface PunchShot {
  id: string;
  cameraId?: string;
  layout?: Layout;
  framing?: Framing;
  cameraMove?: CameraMove;
  /** zona da câmera do plano (estúdio com zonas) */
  zone?: Zone;
}

/** O plano mostra o apresentador em vídeo (a câmera conta para a alternância)? */
function showsPresenter(layout: Layout | undefined): boolean {
  return !layout || layout === 'presenter' || layout === 'lower_third' || layout === 'presenter_chips' || layout === 'presenter_panel' || layout === 'presenter_slide_left' || layout === 'presenter_slide_right' || layout === 'slide_with_pip';
}

/**
 * O punch-in cabe neste plano sem cortar nada? Só o apresentador em tela cheia (letreiro por cima não é afetado:
 * é desenhado depois do recorte). Pílulas: só nas zonas esquerda/direita (a pessoa fica do lado oposto à coluna;
 * o recorte vai para o lado dela e a afasta ainda menos da coluna); 3/4 ao centro, painel, tela dividida e PiP
 * ficam como estão (o recorte comeria o painel/cartão ou o braço).
 */
export function punchFits(s: PunchShot): boolean {
  if ((s.cameraMove ?? 'static') !== 'static') return false;
  if (!s.layout || s.layout === 'presenter' || s.layout === 'lower_third') return true;
  if (s.layout === 'presenter_chips') return s.zone === 'left' || s.zone === 'right';
  return false;
}

/**
 * Plano a plano: quais recebem o punch-in. Em cada troca de plano da MESMA câmera (mesmo enquadramento pedido),
 * um plano fica no enquadramento base e o seguinte com o punch-in, e assim por diante. Câmera diferente,
 * enquadramento diferente ou plano sem apresentador: volta ao base. Devolve o fator de zoom por plano (1 = base).
 */
export function framingPunchPlan(shots: readonly PunchShot[], punch = JOIN.punch): Map<string, number> {
  const out = new Map<string, number>();
  let prevPunched = false;
  shots.forEach((s, i) => {
    const prev = shots[i - 1];
    const sameCamera = !!prev && showsPresenter(prev.layout) && showsPresenter(s.layout) && (prev.cameraId ?? '') === (s.cameraId ?? '') && (prev.framing ?? 'medium') === (s.framing ?? 'medium');
    const punched = sameCamera && !prevPunched && punchFits(s) && (prev?.cameraMove ?? 'static') === 'static';
    if (punched) out.set(s.id, punch);
    prevPunched = punched;
  });
  return out;
}

/** Fração do quadro (horizontal) onde está a pessoa, pela zona da câmera. */
export function zoneFocusX(zone: Zone | undefined): number {
  return zone ? JOIN.zoneFocusX[zone] : 0.5;
}

/* ------------------------------------------------------------------ */
/* Transições                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fusão só sobre quadros reais: a fusão (xfade) de `compose.ts` acontece sobre o ÚLTIMO QUADRO CONGELADO do plano
 * que sai. Quando esse plano é o apresentador em vídeo, isso é exatamente a parada que o aluno vê; vira corte seco
 * (o enquadramento alternado e o aperto das falas cuidam do salto). Plano que sai com imagem estática (cartão,
 * slide) segue como está. Devolve a duração a usar por plano (undefined = não mexe).
 */
export function cleanTransitions(shots: ReadonlyArray<{ layout: Layout; transition: Transition; hasVideo: boolean }>): Array<number | undefined> {
  return shots.map((s, i) => {
    if (i === 0 || s.transition === 'cut') return undefined;
    const prev = shots[i - 1]!;
    return prev.hasVideo && showsPresenter(prev.layout) ? 0 : undefined;
  });
}
