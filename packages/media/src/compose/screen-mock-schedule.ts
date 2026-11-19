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
 *
 * Limites de tela vazia/parada (`startsFromCues`): (a) a espera vazia no início é ≤ 3 s — passos antes do primeiro
 * casamento se distribuem entre 0,4 s e ele; sem passos antes, o primeiro passo começa em no máximo 35% da duração
 * (salvo `cue` explícito ou `digita` cujo texto é dito na fala, que respeitam a fala); (b) passos depois do último
 * casamento se espalham até ~90% da duração; (c) o último passo sem casamento não começa depois de `dur - 6 s`.
 */

export interface StepWindow {
  index: number;
  start: number;
  end: number;
  weight: number;
  /** só `digita`: quanto a FALA leva para dizer o texto digitado (a digitação acompanha a fala); ausente = ritmo padrão */
  typeSec?: number;
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
    // se a primeira palavra se repete antes da segunda casar ("lado a lado. À esquerda"), o trecho começa na última
    let first = j;
    const limit = Math.min(speech.length, j + k + slack);
    for (let q = j; q < limit && p < k; q++) {
      if (same(speech[q]!, phrase[p]!)) {
        p++;
        last = q;
      } else if (p === 1 && k > 1 && same(speech[q]!, phrase[0]!)) first = q;
    }
    if (p >= need) return { at: first, end: last + 1 };
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

/**
 * Onde a fala TERMINA de dizer um texto digitado que começa no token `start`: procura as 3 últimas palavras do texto
 * adiante (até ~1,6× o tamanho do texto) e confere que ao menos 60% das palavras do texto estão, em ordem, até ali.
 * Devolve o índice do último token, ou `undefined` (o texto não é ditado na fala; ex.: só o `cue` casou).
 */
function spokenEnd(speech: string[], text: string[], start: number): number | undefined {
  const n = text.length;
  if (n < 2) return undefined;
  const tail = text.slice(-Math.min(3, n));
  const limit = Math.min(speech.length, start + Math.ceil(n * 1.6) + 8);
  for (let j = start + Math.max(0, Math.floor(n * 0.5) - tail.length); j < limit; j++) {
    if (!same(speech[j]!, tail[0]!)) continue;
    let p = 0;
    let last = j;
    for (let q = j; q < Math.min(limit, j + tail.length + 2) && p < tail.length; q++) {
      if (same(speech[q]!, tail[p]!)) {
        p++;
        last = q;
      }
    }
    if (p < tail.length) continue;
    let hit = 0;
    let q = start;
    for (const w of text) {
      for (let k = q; k <= last; k++) {
        if (same(speech[k]!, w)) {
          hit++;
          q = k + 1;
          break;
        }
      }
    }
    if (hit >= Math.ceil(n * 0.6)) return last;
  }
  return undefined;
}

export interface CueMatch {
  /** início (s) de cada passo achado na fala; `undefined` = sem correspondência */
  times: Array<number | undefined>;
  /** só `digita` achado e DITADO na fala: instante em que a fala termina de dizer o texto; senão `undefined` */
  typeEnds: Array<number | undefined>;
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
  const typeEnds: Array<number | undefined> = [];
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
      typeEnds.push(undefined);
      continue;
    }
    const t = Math.max(words[at[found.at]!]!.start, lastTime);
    lastTime = t;
    times.push(t);
    // texto digitado que a fala dita: até onde vai (a digitação acompanha a fala)
    const endTok = st.kind === 'type' && typeof st.text === 'string' ? spokenEnd(speech, tokens(st.text), found.at) : undefined;
    const endWord = endTok !== undefined ? words[at[endTok]!]! : undefined;
    typeEnds.push(endWord ? Math.max(t, endWord.end ?? endWord.start + 0.3) : undefined);
    // segue depois do trecho achado (e do que sobra do texto do passo), para o texto repetido noutro passo não casar de novo
    pos = Math.max(pos, found.at + 1, endTok !== undefined ? endTok + 1 : found.end + rest);
  }
  return { times, typeEnds, nextIndex: pos >= speech.length ? words.length : at[pos]! };
}

function holdOf(durationSec: number): number {
  return Math.min(Math.min(2, Math.max(0.5, durationSec * 0.12)), durationSec * 0.25);
}

/**
 * Tempos de início dos passos a partir dos achados na fala (`cueTimes`, relativos ao início da tela). Antes do primeiro
 * achado a tela fica no estado inicial; passos sem achado são interpolados entre os vizinhos pelo peso. Nenhum achado:
 * proporcional (como `scheduleSteps`).
 */
export const SCREEN_MOCK_MAX_EMPTY_SEC = 3;
export const SCREEN_MOCK_FIRST_MAX_FRAC = 0.35;
export const SCREEN_MOCK_TAIL_FRAC = 0.9;
export const SCREEN_MOCK_MAX_TAIL_SEC = 6;

/** `pins[i]` = o início do passo `i` vem da fala por inteiro (`cue` explícito ou `digita` dito) e não pode ser adiantado. */
export function startsFromCues(cueTimes: ReadonlyArray<number | undefined>, weights: ReadonlyArray<number | undefined>, durationSec: number, pins: ReadonlyArray<boolean> = []): number[] {
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
    const t1 = starts[f0]!;
    if (t1 > SCREEN_MOCK_MAX_EMPTY_SEC) {
      // fala demora a chegar: os passos anteriores ocupam a tela entre 0,4 s e o primeiro casamento
      const t0 = Math.min(SCREEN_MOCK_LEAD_SEC, t1);
      for (let k = 0; k < f0; k++) starts[k] = t0 + ((t1 - t0) * k) / f0;
    } else {
      // passos sem achado antes do primeiro achado: só logo antes dele (a tela não muda antes da fala chegar)
      const t0 = Math.max(0, t1 - Math.min(0.5, 0.15 * f0 + 0.2));
      for (let k = 0; k < f0; k++) starts[k] = t0 + ((t1 - t0) * k) / f0;
    }
  } else if (!pins[0]) {
    // o primeiro passo casou tarde e não há nada antes: não deixa a tela vazia por mais de 35% da duração
    starts[0] = Math.min(starts[0]!, SCREEN_MOCK_FIRST_MAX_FRAC * durationSec, maxStart);
  }
  const tailEnd = Math.min(spanEnd, Math.max(SCREEN_MOCK_TAIL_FRAC * durationSec, durationSec - SCREEN_MOCK_MAX_TAIL_SEC));
  found.forEach((from, a) => {
    const to = a + 1 < found.length ? found[a + 1]! : n;
    if (to - from <= 1) return;
    const t0 = starts[from]!;
    const tail = a + 1 >= found.length;
    const t1 = tail ? Math.max(t0, tailEnd) : starts[to]!;
    // no trecho final o último passo começa em `t1` (a tela não fica parada depois do último casamento)
    const total = (ws.slice(from, to).reduce((x, y) => x + y, 0) - (tail ? ws[to - 1]! : 0)) || 1;
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
  // o início de `type` achado e de passo com `cue` explícito vem da fala e não é adiantado
  const pins = steps.map((s) => s.kind === 'type' || !!s.cue);
  return startsFromCues(matchStepCues(steps, alignmentWords).times, weights, totalSec, pins);
}

/** Monta o `StepSchedule` (usado pelo desenho) a partir dos inícios; cada passo vai até o início do próximo. */
export function scheduleFromStarts(starts: ReadonlyArray<number>, weights: ReadonlyArray<number | undefined>, durationSec: number, typeSecs: ReadonlyArray<number | undefined> = []): StepSchedule {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) throw new Error('durationSec deve ser positivo');
  const spanEnd = Math.max(starts[starts.length - 1] ?? 0, durationSec - holdOf(durationSec));
  const windows = starts.map((start, index) => ({
    index,
    start,
    end: index === starts.length - 1 ? spanEnd : starts[index + 1]!,
    weight: weights[index] !== undefined && Number.isFinite(weights[index]!) && weights[index]! > 0 ? weights[index]! : 1,
    ...(typeSecs[index] !== undefined && typeSecs[index]! > 0 ? { typeSec: typeSecs[index]! } : {}),
  }));
  return { windows, leadSec: starts[0] ?? 0, holdSec: Math.max(0, durationSec - spanEnd), durationSec };
}

/* ---------------- linha do tempo da cena (várias telas + a fala) ---------------- */

export interface SceneRecordingPlanInput {
  /** tela simulada a gerar: os passos dela */
  steps?: ReadonlyArray<CueStep>;
  /** gravação enviada: a duração dela */
  uploadSec?: number;
}

export interface SceneScreenPlan {
  /** duração (s) de cada gravação da cena, na ordem */
  durations: number[];
  /** início (s) de cada gravação na narração */
  starts: number[];
  /** início (s) de cada passo, relativo ao início da própria tela; `undefined` = proporcional ao peso (sem fala achada) ou gravação enviada */
  stepStarts: Array<number[] | undefined>;
  /** só com `stepStarts`: para cada `digita` ditado na fala, quanto a fala leva para dizê-lo (s); senão `undefined` */
  typeSecs: Array<Array<number | undefined> | undefined>;
}

/**
 * Plano de tempo de uma cena de tela: quanto dura cada gravação e quando começa cada passo, a partir da fala.
 * É a MESMA conta da montagem (`processScreenJob`) e da prévia local: os passos de cada tela são procurados na fala em
 * sequência (a busca de uma tela continua de onde a anterior parou); a duração de cada tela gerada vai até a fala
 * chegar no primeiro passo da próxima (`splitMockDurations`); se alguma tela gerada não achou nenhum passo na fala, a
 * divisão é proporcional ao peso e os passos de todas seguem proporcionais também. `words` vazio = tudo proporcional.
 * O primeiro passo achado que é `digita` ou tem `(na fala: "…")` fica no instante da fala (não é adiantado).
 * `split` = `splitMockDurations` (injetado para este módulo não depender de `screen.ts`).
 */
export function planSceneScreens(
  recs: ReadonlyArray<SceneRecordingPlanInput>,
  words: ReadonlyArray<CueWord>,
  narrationSec: number,
  split: (items: Array<{ uploadSec: number } | { mockWeight: number; cueSec?: number }>, narrationSec: number) => number[],
): SceneScreenPlan {
  const cues = new Map<number, Array<number | undefined>>();
  const ends = new Map<number, Array<number | undefined>>();
  let from = 0;
  recs.forEach((r, i) => {
    if (!r.steps || !words.length) return;
    const m = matchStepCues(r.steps, words, from);
    cues.set(i, m.times);
    ends.set(i, m.typeEnds);
    from = m.nextIndex;
  });
  const weightOf = (steps: ReadonlyArray<CueStep>) => steps.reduce((a, s) => a + (s.weight ?? 1), 0);
  const durations = split(recs.map((r, i) => (r.steps ? { mockWeight: weightOf(r.steps), cueSec: cues.get(i)?.find((t) => t !== undefined) } : { uploadSec: r.uploadSec ?? 0 })), narrationSec);
  // se alguma tela gerada não achou nenhum passo na fala, a divisão foi proporcional: os passos seguem proporcionais também
  if (recs.some((r, i) => r.steps && !cues.get(i)?.some((t) => t !== undefined))) cues.clear();
  const starts: number[] = [];
  durations.reduce((acc, d, i) => (starts[i] = acc) + d, 0);
  const stepStarts = recs.map((r, i) => {
    const ct = cues.get(i);
    if (!r.steps || !ct) return undefined;
    return startsFromCues(ct.map((t) => (t === undefined ? undefined : t - starts[i]!)), r.steps.map((s) => s.weight), durations[i]!, r.steps.map((s) => s.kind === 'type' || !!s.cue));
  });
  const typeSecs = recs.map((_, i) => {
    const ss = stepStarts[i];
    const ct = cues.get(i);
    const en = ends.get(i);
    if (!ss || !ct || !en) return undefined;
    // só vale se o início do passo ficou onde a fala começa a ditar (não foi deslocado pelos limites da agenda)
    return en.map((e, k) => (e !== undefined && ct[k] !== undefined && Math.abs(ss[k]! - (ct[k]! - starts[i]!)) < 0.05 ? e - ct[k]! : undefined));
  });
  return { durations, starts, stepStarts, typeSecs };
}
