/**
 * Agendamento dos passos da tela simulada (função pura). Os passos ocupam, em sequência, a janela entre uma folga
 * inicial (≈ 0,4 s) e uma folga final em que o estado final fica parado; o tempo de cada passo é proporcional
 * ao peso (padrão 1).
 *
 * Com o alinhamento por palavra da narração (`scheduleStepsWithCues`), cada passo começa quando a fala chega nele:
 * acha-se na fala o trecho de cada passo (texto digitado, rótulo, título/linhas ou o `cue` explícito), em ordem
 * crescente; passo sem correspondência é interpolado entre o anterior e o próximo achados (respeitando o peso); antes
 * do primeiro passo achado a tela fica no estado inicial. Sem nenhum passo achado (ou sem alinhamento) vale o
 * agendamento proporcional de `scheduleSteps`.
 */

export interface StepWindow {
  index: number;
  start: number;
  end: number;
  weight: number;
}

export interface StepSchedule {
  windows: StepWindow[];
  /** folga inicial (s) antes do primeiro passo */
  leadSec: number;
  /** segundos finais com o estado final segurado */
  holdSec: number;
  durationSec: number;
}

export const SCREEN_MOCK_LEAD_SEC = 0.4;

export function scheduleSteps(weights: Array<number | undefined>, durationSec: number, opts: { leadSec?: number; holdSec?: number } = {}): StepSchedule {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) throw new Error('durationSec deve ser positivo');
  const lead = Math.min(opts.leadSec ?? SCREEN_MOCK_LEAD_SEC, durationSec * 0.15);
  // segura o final por 12% da duração (entre 0,5 e 2 s), sem passar de 25% da duração
  const hold = Math.min(opts.holdSec ?? Math.min(2, Math.max(0.5, durationSec * 0.12)), durationSec * 0.25);
  const span = Math.max(0, durationSec - lead - hold);
  const ws = weights.map((w) => (w !== undefined && Number.isFinite(w) && w > 0 ? w : 1));
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let cursor = lead;
  const windows = ws.map((weight, index) => {
    const start = cursor;
    cursor += (span * weight) / total;
    return { index, start, end: index === ws.length - 1 ? lead + span : cursor, weight };
  });
  return { windows, leadSec: lead, holdSec: hold, durationSec };
}

/* ---------------- passos no ritmo da fala ---------------- */

export interface CueWord {
  text: string;
  start: number;
  end?: number;
}

/** Forma mínima de um passo para achar o trecho da fala (compatível com `MockStep` e `ScreenMockStep`). */
export interface CueStep {
  kind: string;
  weight?: number;
  cue?: string;
  [k: string]: unknown;
}

const STOP = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'que', 'se', 'com', 'por', 'para', 'pra', 'ao', 'ou', 'eu', 'me', 'te', 'ja', 'mas', 'so', 'ela', 'ele', 'isso', 'esta', 'este', 'aqui']);

const norm = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const tokens = (t: string): string[] => t.split(/\s+/).map(norm).filter(Boolean);

/** Palavras "iguais" com tolerância: mesma forma ou uma é o começo da outra (plural/flexão), com 4+ letras. */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/** Textos candidatos do passo, em ordem de preferência (o `cue` explícito é tratado à parte). */
function stepTexts(st: CueStep): string[] {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (st.kind) {
    case 'type':
    case 'message':
    case 'highlight':
      return [str(st.text)];
    case 'show': {
      const lines = Array.isArray(st.lines) ? st.lines.map(str) : [];
      return [str(st.title), ...lines].filter(Boolean);
    }
    case 'toggle':
    case 'tap':
      return [str(st.label)];
    case 'cell':
      return [str(st.value)];
    case 'event':
      return [str(st.title)];
    default:
      return [];
  }
}

/**
 * Primeira posição `j >= from` da fala em que `phrase` casa (ordem crescente, tolerante): a primeira palavra da frase
 * está em `j` e, das `k` palavras, ao menos `need` aparecem em ordem dentro de uma janela de `k + slack` palavras.
 */
function findPhrase(speech: string[], phrase: string[], from: number, need: number, slack: number): { at: number; end: number } | undefined {
  const k = phrase.length;
  if (!k) return undefined;
  for (let j = Math.max(0, from); j < speech.length; j++) {
    if (!same(speech[j]!, phrase[0]!)) continue;
    let p = 0;
    let last = j;
    const limit = Math.min(speech.length, j + k + slack);
    for (let q = j; q < limit && p < k; q++) {
      if (same(speech[q]!, phrase[p]!)) {
        p++;
        last = q;
      }
    }
    if (p >= need) return { at: j, end: last + 1 };
  }
  return undefined;
}

/** Janelas de 3 a 6 palavras de conteúdo do texto: o começo e, depois, deslocamentos (para quando o começo não está na fala). */
function contentChunks(text: string): Array<{ words: string[]; /** palavras de conteúdo do texto depois desta janela */ rest: number }> {
  const content = tokens(text).filter((w) => !STOP.has(w));
  if (content.length < 2 && !(content.length === 1 && content[0]!.length >= 5)) return [];
  const mk = (off: number) => {
    const words = content.slice(off, off + Math.min(6, content.length - off));
    return { words, rest: content.length - off - words.length };
  };
  const out = [mk(0)];
  for (const off of [1, 2, 4, 8, 12]) if (content.length >= off + 3) out.push(mk(off));
  return out;
}

export interface CueMatch {
  /** início (s) de cada passo achado na fala; `undefined` = sem correspondência */
  times: Array<number | undefined>;
  /** índice (em `words`) onde continuar a busca na próxima tela da cena */
  nextIndex: number;
}

/**
 * Acha na fala o início de cada passo. `words` = palavras com tempo (o mesmo alinhamento da legenda). Sempre em ordem
 * crescente (nunca volta no tempo). O `cue` explícito vence a busca automática (e, se não estiver adiante, é
 * procurado na fala toda). `fromIndex` = palavra de `words` em que começar.
 */
export function matchStepCues(steps: ReadonlyArray<CueStep>, words: ReadonlyArray<CueWord>, fromIndex = 0): CueMatch {
  // uma palavra do alinhamento pode virar 0 ou 1 token normalizado; `at` guarda o índice da palavra de origem
  const speech: string[] = [];
  const at: number[] = [];
  words.forEach((w, i) => {
    for (const t of tokens(w.text)) {
      speech.push(t);
      at.push(i);
    }
  });
  let pos = Math.max(0, at.findIndex((x) => x >= fromIndex));
  if (fromIndex > 0 && !at.some((x) => x >= fromIndex)) pos = speech.length;
  let lastTime = -Infinity;
  const times: Array<number | undefined> = [];
  for (const st of steps) {
    let found: { at: number; end: number } | undefined;
    let rest = 0;
    if (st.cue) {
      const ph = tokens(st.cue);
      const need = Math.max(1, Math.ceil(ph.length * 0.8));
      found = findPhrase(speech, ph, pos, need, 2) ?? findPhrase(speech, ph, 0, need, 2);
    }
    if (!found) {
      outer: for (const text of stepTexts(st)) {
        for (const ch of contentChunks(text)) {
          const ph = ch.words;
          found = findPhrase(speech, ph, pos, ph.length <= 2 ? ph.length : Math.ceil(ph.length * 0.6), ph.length + 4);
          if (found) {
            rest = ch.rest;
            break outer;
          }
        }
      }
    }
    if (!found) {
      times.push(undefined);
      continue;
    }
    const t = Math.max(words[at[found.at]!]!.start, lastTime);
    lastTime = t;
    times.push(t);
    // segue depois do trecho achado (e do que sobra do texto do passo), para o texto repetido noutro passo não casar de novo
    pos = Math.max(pos, found.at + 1, found.end + rest);
  }
  return { times, nextIndex: pos >= speech.length ? words.length : at[pos]! };
}

function holdOf(durationSec: number): number {
  return Math.min(Math.min(2, Math.max(0.5, durationSec * 0.12)), durationSec * 0.25);
}

/**
 * Tempos de início dos passos a partir dos achados na fala (`cueTimes`, relativos ao início da tela). Antes do primeiro
 * achado a tela fica no estado inicial; passos sem achado são interpolados entre os vizinhos pelo peso. Nenhum achado:
 * proporcional (como `scheduleSteps`).
 */
export function startsFromCues(cueTimes: ReadonlyArray<number | undefined>, weights: ReadonlyArray<number | undefined>, durationSec: number): number[] {
  const n = cueTimes.length;
  if (cueTimes.every((t) => t === undefined)) return scheduleSteps([...weights], durationSec).windows.map((w) => w.start);
  const ws = weights.map((w) => (w !== undefined && Number.isFinite(w) && w > 0 ? w : 1));
  const spanEnd = Math.max(0.1, durationSec - holdOf(durationSec));
  const maxStart = Math.max(0, spanEnd - 0.15);
  const starts: number[] = new Array(n).fill(0);
  const found: number[] = [];
  cueTimes.forEach((t, i) => {
    if (t === undefined) return;
    found.push(i);
    starts[i] = Math.min(Math.max(0, t), maxStart);
  });
  const f0 = found[0]!;
  if (f0 > 0) {
    // passos sem achado antes do primeiro achado: só logo antes dele (a tela não muda antes da fala chegar)
    const t1 = starts[f0]!;
    const t0 = Math.max(0, t1 - Math.min(0.5, 0.15 * f0 + 0.2));
    for (let k = 0; k < f0; k++) starts[k] = t0 + ((t1 - t0) * k) / f0;
  }
  found.forEach((from, a) => {
    const to = a + 1 < found.length ? found[a + 1]! : n;
    if (to - from <= 1) return;
    const t0 = starts[from]!;
    const t1 = a + 1 < found.length ? starts[to]! : spanEnd;
    const total = ws.slice(from, to).reduce((x, y) => x + y, 0) || 1;
    let acc = ws[from]!;
    for (let k = from + 1; k < to; k++) {
      starts[k] = t0 + ((t1 - t0) * acc) / total;
      acc += ws[k]!;
    }
  });
  // ordem crescente e dentro da janela útil
  for (let i = 1; i < n; i++) starts[i] = Math.max(starts[i]!, starts[i - 1]!);
  for (let i = n - 1; i >= 0; i--) starts[i] = Math.min(starts[i]!, i === n - 1 ? maxStart : starts[i + 1]!);
  return starts;
}

/**
 * Início (s) de cada passo no ritmo da fala. `steps` da tela; `alignmentWords` = palavras da narração com tempo
 * (relativas ao início DESTA tela); `totalSec` = duração da tela. Sem alinhamento (vazio/ausente): proporcional.
 */
export function scheduleStepsWithCues(steps: ReadonlyArray<CueStep>, alignmentWords: ReadonlyArray<CueWord> | undefined, totalSec: number): number[] {
  if (!(totalSec > 0) || !Number.isFinite(totalSec)) throw new Error('totalSec deve ser positivo');
  const weights = steps.map((s) => s.weight);
  if (!alignmentWords?.length) return scheduleSteps(weights, totalSec).windows.map((w) => w.start);
  return startsFromCues(matchStepCues(steps, alignmentWords).times, weights, totalSec);
}

/** Monta o `StepSchedule` (usado pelo desenho) a partir dos inícios; cada passo vai até o início do próximo. */
export function scheduleFromStarts(starts: ReadonlyArray<number>, weights: ReadonlyArray<number | undefined>, durationSec: number): StepSchedule {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) throw new Error('durationSec deve ser positivo');
  const spanEnd = Math.max(starts[starts.length - 1] ?? 0, durationSec - holdOf(durationSec));
  const windows = starts.map((start, index) => ({
    index,
    start,
    end: index === starts.length - 1 ? spanEnd : starts[index + 1]!,
    weight: weights[index] !== undefined && Number.isFinite(weights[index]!) && weights[index]! > 0 ? weights[index]! : 1,
  }));
  return { windows, leadSec: starts[0] ?? 0, holdSec: Math.max(0, durationSec - spanEnd), durationSec };
}
