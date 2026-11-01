/**
 * Ajuste fino SEM REGRAVAR (A17): regras puras compartilhadas entre o estúdio (pedido, tela) e o
 * worker (montagem). Nada aqui chama provedor nem toca em arquivo.
 *
 * Cena dirigida: a partir dos clipes já pagos do job de origem, o autor pode
 *  - tirar um plano inteiro (`drop`);
 *  - tirar a primeira ou a última frase de um plano (`cut`), quando o plano é um clipe sozinho e tem 2+ frases
 *    (corte pelo tempo das palavras: áudio e vídeo juntos, a boca continua sincronizada);
 *  - trocar o cartão "Pergunta a seguir" do fim do vídeo (`teaser`).
 * O estado ACUMULADO fica na mídia do nó (`media.adjust`): cada pedido soma ao anterior e a montagem sempre
 * parte do job de origem.
 *
 * Reação a uma resposta: tirar a interjeição de abertura ("Boa escolha!"…) pelo alinhamento por letra.
 */

/** Provedor gravado no job (só ffmpeg local; custo 0). */
export const ADJUST_PROVIDER = 'local-adjust';
export const ADJUST_VERSION = 'adjust-1';

/** Interjeições de abertura que a reação pode perder sem mudar o sentido. */
export const REACTION_OPENERS = ['Boa escolha!', 'Isso mesmo!', 'Exatamente!', 'Quase lá.'] as const;

export interface AdjustCuts {
  /** `lead`: palavras tiradas do começo da 1ª frase que sobra (ex.: "Seja qual for a sua escolha,") */
  [shotId: string]: { first: number; last: number; lead?: number; skip?: Array<[number, number]>; skipText?: string[] };
}
/* `skip`: trechos tirados do MEIO do plano, em índices de palavra da gravação (inclusivos), ex.: "as duas soam falsas."
 * `skipText`: o texto (normalizado, `norm`) das palavras puladas, na mesma ordem de `skip` ('' = desconhecido). Serve para
 * conferir, ao reaplicar numa gravação nova, que o índice ainda aponta para as mesmas palavras. Ausente em ajuste antigo. */

/** Estado acumulado do ajuste de uma cena (fica em `media.adjust`). */
export interface AdjustState {
  drop: string[];
  cut: AdjustCuts;
  /** texto do cartão; `null` = sem cartão; ausente = o da gravação original */
  teaser?: string | null;
  /**
   * falas dos planos da gravação que o ajuste cortou (plano → fala), guardadas no ajuste: ao regravar,
   * os cortes só voltam nos planos cuja fala não mudou (`carryAdjust`). Opcional: ajuste antigo não tem.
   */
  baseLines?: Record<string, string>;
}

/** Um pedido de ajuste: só o que muda agora (somado ao estado atual). */
export interface AdjustRequest {
  drop?: string[];
  cut?: Array<{ shotId: string; side: 'first' | 'last' }>;
  /** apara as primeiras palavras do plano (uma oração de abertura, até a vírgula) */
  trimLead?: Array<{ shotId: string; words: number }>;
  /** tira um trecho do meio do plano (índices de palavra da gravação, inclusivos) */
  skip?: Array<{ shotId: string; from: number; to: number; /** texto (norm) esperado nas palavras puladas; se não bater, o trecho não é aplicado */ text?: string }>;
  teaser?: string | null;
}

export type AdjustJobInput =
  | { kind: 'adjust'; target: 'scene'; adjustOf: string; request: AdjustRequest }
  | { kind: 'adjust'; target: 'reaction'; choiceId: string; optionId: string };

export function isAdjustJobInput(input: unknown): input is AdjustJobInput {
  const i = input as { kind?: unknown; target?: unknown } | null;
  return !!i && i.kind === 'adjust' && (i.target === 'scene' || i.target === 'reaction');
}

/** A interjeição de abertura da reação, quando há conteúdo depois dela. */
export function reactionOpener(text: string | undefined | null): (typeof REACTION_OPENERS)[number] | null {
  const t = (text ?? '').trim();
  return REACTION_OPENERS.find((o) => t.startsWith(o + ' ') && t.slice(o.length).trim().length > 0) ?? null;
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

/** Frases de uma lista de palavras: pares [primeira, última] (inclusivos), pela pontuação final. */
export function sentenceSpans(words: ReadonlyArray<{ text: string }>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  words.forEach((w, i) => {
    if (/[.!?…]["”'»)]?$/.test(w.text) || i === words.length - 1) {
      out.push([start, i]);
      start = i + 1;
    }
  });
  return out;
}

/** Faixa de palavras que sobra depois de tirar `first` frases do começo e `last` do fim; null se não sobra nada. */
export function keptWordRange(words: ReadonlyArray<{ text: string }>, first: number, last: number, lead = 0): [number, number] | null {
  const spans = sentenceSpans(words);
  if (!spans.length) return null;
  const from = first;
  const to = spans.length - 1 - last;
  if (from > to) return null;
  const start = spans[from]![0] + Math.max(0, lead);
  if (start > spans[to]![1] || (from === to && start > spans[from]![1])) return null;
  return [start, spans[to]![1]];
}

const norm = (t: string) =>
  t
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Trechos de palavras que sobram (pares inclusivos, em ordem) depois de frases do começo/fim, da oração de
 * abertura e dos trechos do meio (`skip`); [] = nada sobra.
 */
export function keptSegments(words: ReadonlyArray<{ text: string }>, cut?: { first: number; last: number; lead?: number; skip?: ReadonlyArray<readonly [number, number]> }): Array<[number, number]> {
  const r = keptWordRange(words, cut?.first ?? 0, cut?.last ?? 0, cut?.lead ?? 0);
  if (!r) return [];
  let segs: Array<[number, number]> = [[r[0], r[1]]];
  for (const [a, b] of [...(cut?.skip ?? [])].sort((x, y) => x[0] - y[0])) {
    segs = segs.flatMap(([s, e]): Array<[number, number]> => {
      if (b < s || a > e) return [[s, e]];
      const out: Array<[number, number]> = [];
      if (a > s) out.push([s, a - 1]);
      if (b < e) out.push([b + 1, e]);
      return out;
    });
  }
  return segs;
}

/**
 * Palavras faladas depois dos cortes, com o texto acertado para a legenda: maiúscula quando o trecho tirado
 * começava a frase; o ponto final da frase tirada passa para a palavra antes do corte.
 */
export function keptWords<W extends { text: string }>(words: ReadonlyArray<W>, cut?: { first: number; last: number; lead?: number; skip?: ReadonlyArray<readonly [number, number]> }): W[] {
  const segs = keptSegments(words, cut);
  const out: W[] = [];
  const endsSentence = (t: string) => /[.!?…]["”'»)]?$/.test(t);
  segs.forEach(([s, e], i) => {
    const part = words.slice(s, e + 1).map((w) => ({ ...w }));
    if (i > 0 && part[0]) {
      const prevKept = out[out.length - 1];
      // o que sobra depois do corte começa frase: maiúscula
      if (prevKept && endsSentence(prevKept.text)) part[0].text = part[0].text.charAt(0).toLocaleUpperCase('pt-BR') + part[0].text.slice(1);
    }
    out.push(...part);
    // trecho tirado logo depois deste (no meio ou no fim do que sobra) que terminava a frase: o ponto vem para cá
    const range = keptWordRange(words, cut?.first ?? 0, cut?.last ?? 0, cut?.lead ?? 0)!;
    const runEnd = i < segs.length - 1 ? segs[i + 1]![0] - 1 : range[1];
    const lastKept = out[out.length - 1];
    if (runEnd > e && lastKept && endsSentence(words[runEnd]!.text) && !endsSentence(lastKept.text)) {
      lastKept.text = lastKept.text.replace(/[,;:]$/, '') + words[runEnd]!.text.match(/[.!?…]["”'»)]?$/)![0];
    }
  });
  if (cut?.lead && out[0]) out[0].text = out[0].text.charAt(0).toLocaleUpperCase('pt-BR') + out[0].text.slice(1);
  return out;
}

/** Texto falado de um plano depois dos cortes (as palavras guardadas, sem as frases tiradas). */
export function keptText(words: ReadonlyArray<{ text: string }>, cut?: { first: number; last: number; lead?: number; skip?: ReadonlyArray<readonly [number, number]> }): string | null {
  const ws = keptWords(words, cut);
  return ws.length ? ws.map((w) => w.text).join(' ') : null;
}

/**
 * Estado já aplicado quando a mídia não traz `media.adjust` (ajustes feitos por script): planos que sumiram
 * da direção do rascunho = tirados; plano cujo texto ficou menor = frases tiradas do começo/fim.
 */
export function deriveAdjustState(baseShots: ReadonlyArray<{ id: string; line: string }>, draftShots: ReadonlyArray<{ id: string; line: string }>, wordsByShot: ReadonlyMap<string, ReadonlyArray<{ text: string }>>): AdjustState {
  const draft = new Map(draftShots.map((s) => [s.id, s.line]));
  const state: AdjustState = { drop: [], cut: {} };
  for (const s of baseShots) {
    const line = draft.get(s.id);
    if (line === undefined) {
      state.drop.push(s.id);
      continue;
    }
    if (norm(line) === norm(s.line)) continue;
    const words = wordsByShot.get(s.id);
    if (!words?.length) continue;
    const n = sentenceSpans(words).length;
    found: for (let first = 0; first < n; first++)
      for (let last = 0; first + last < n; last++) {
        if (first === 0 && last === 0) continue;
        if (norm(keptText(words, { first, last }) ?? '') === norm(line)) {
          state.cut[s.id] = { first, last };
          break found;
        }
      }
  }
  return state;
}

/** Soma um pedido ao estado atual (cortes acumulam; teaser ausente mantém o atual). */
export function mergeAdjust(current: AdjustState, req: AdjustRequest): AdjustState {
  const drop = [...new Set([...current.drop, ...(req.drop ?? [])])];
  const cut: AdjustCuts = Object.fromEntries(Object.entries(current.cut).map(([k, v]) => [k, { ...v }]));
  for (const c of req.cut ?? []) {
    const cur = cut[c.shotId] ?? { first: 0, last: 0 };
    cut[c.shotId] = { ...cur, [c.side]: cur[c.side] + 1 };
  }
  for (const t of req.trimLead ?? []) {
    const cur = cut[t.shotId] ?? { first: 0, last: 0 };
    cut[t.shotId] = { ...cur, lead: Math.max(0, t.words) };
  }
  for (const k of req.skip ?? []) {
    const cur = cut[k.shotId] ?? { first: 0, last: 0 };
    const pair: [number, number] = [Math.min(k.from, k.to), Math.max(k.from, k.to)];
    const prev = [...(cur.skip ?? [])];
    const texts = prev.map((_, i) => cur.skipText?.[i] ?? '');
    const at = prev.findIndex(([a, b]) => a === pair[0] && b === pair[1]);
    if (at >= 0) {
      if (k.text && !texts[at]) texts[at] = k.text;
    } else {
      prev.push(pair);
      texts.push(k.text ?? '');
    }
    cut[k.shotId] = { ...cur, skip: prev, ...(texts.some(Boolean) ? { skipText: texts } : {}) };
  }
  const teaser = req.teaser !== undefined ? (req.teaser === null ? null : req.teaser.trim() || null) : current.teaser;
  return { drop, cut, ...(teaser !== undefined ? { teaser } : {}) };
}

export interface AdjustUnit {
  id: string;
  kind: string;
  shotIds: string[];
}

export interface AdjustShotOption {
  id: string;
  /** texto que o aluno ouve hoje neste plano */
  line: string;
  canDrop: boolean;
  canCutFirst: boolean;
  canCutLast: boolean;
}

/**
 * O que a tela pode oferecer, plano a plano, no estado atual: só planos que ainda estão no vídeo;
 * tirar plano só quando ele não divide clipe com outro e não é o último que sobra; cortar frase só em clipe
 * sozinho com 2+ frases restantes.
 */
export function adjustOptions(baseShots: ReadonlyArray<{ id: string; line: string }>, units: ReadonlyArray<AdjustUnit>, wordsByUnit: ReadonlyMap<string, ReadonlyArray<{ text: string }>>, state: AdjustState): AdjustShotOption[] {
  const remaining = baseShots.filter((s) => !state.drop.includes(s.id));
  return remaining.map((s) => {
    const unit = units.find((u) => u.shotIds.includes(s.id));
    const solo = !!unit && unit.shotIds.length === 1;
    const words = solo ? wordsByUnit.get(unit!.id) : undefined;
    const cut = state.cut[s.id] ?? { first: 0, last: 0 };
    const sentencesLeft = words?.length ? sentenceSpans(words).length - cut.first - cut.last : 0;
    const clip = solo && unit!.kind === 'clip' && !!words?.length;
    return {
      id: s.id,
      line: (words?.length ? keptText(words, cut) : null) ?? s.line,
      canDrop: remaining.length > 1 && solo,
      canCutFirst: clip && sentencesLeft >= 2,
      canCutLast: clip && sentencesLeft >= 2,
    };
  });
}

/** Erro do pedido (texto para o autor) ou null quando o pedido pode ser montado. */
export function validateAdjust(baseShots: ReadonlyArray<{ id: string; line: string }>, units: ReadonlyArray<AdjustUnit>, wordsByUnit: ReadonlyMap<string, ReadonlyArray<{ text: string }>>, current: AdjustState, req: AdjustRequest): string | null {
  if (!req.drop?.length && !req.cut?.length && !req.trimLead?.length && !req.skip?.length && req.teaser === undefined) return 'Nada a ajustar: escolha um plano, uma frase ou mude o cartão.';
  for (const t of req.trimLead ?? []) {
    const unit = units.find((u) => u.shotIds.length === 1 && u.shotIds[0] === t.shotId);
    const words = unit ? wordsByUnit.get(unit.id) : undefined;
    if (!unit || !words?.length) return `O plano ${t.shotId} não tem clipe sozinho com palavras guardadas.`;
    const cut = mergeAdjust(current, req).cut[t.shotId]!;
    if (!keptWordRange(words, cut.first, cut.last, cut.lead ?? 0)) return `O plano ${t.shotId} ficaria sem fala.`;
  }
  for (const k of req.skip ?? []) {
    const unit = units.find((u) => u.shotIds.length === 1 && u.shotIds[0] === k.shotId);
    const words = unit ? wordsByUnit.get(unit.id) : undefined;
    if (!unit || !words?.length) return `O plano ${k.shotId} não tem clipe sozinho com palavras guardadas.`;
    if (!Number.isInteger(k.from) || !Number.isInteger(k.to) || k.from < 0 || k.to >= words.length || k.from > k.to) return `Trecho fora do plano ${k.shotId}.`;
    if (!keptSegments(words, mergeAdjust(current, req).cut[k.shotId]).length) return `O plano ${k.shotId} ficaria sem fala; use "Tirar o plano".`;
  }
  const opts = new Map(adjustOptions(baseShots, units, wordsByUnit, current).map((o) => [o.id, o]));
  for (const id of req.drop ?? []) {
    const o = opts.get(id);
    if (!o) return `O plano ${id} não está mais no vídeo.`;
    if (!o.canDrop) return `O plano ${id} não pode sair sozinho (é o único que sobra ou divide o clipe com outro).`;
  }
  const next = mergeAdjust(current, { drop: req.drop ?? [] });
  if (baseShots.every((s) => next.drop.includes(s.id))) return 'Sobraria um vídeo vazio: deixe pelo menos um plano.';
  const after = mergeAdjust(current, req);
  for (const c of req.cut ?? []) {
    const o = opts.get(c.shotId);
    if (!o || (c.side === 'first' ? !o.canCutFirst : !o.canCutLast)) return `Não dá para tirar a ${c.side === 'first' ? 'primeira' : 'última'} frase do plano ${c.shotId}.`;
    if (after.drop.includes(c.shotId)) return `O plano ${c.shotId} está saindo; não precisa cortar frase dele.`;
    const unit = units.find((u) => u.shotIds.length === 1 && u.shotIds[0] === c.shotId)!;
    const words = wordsByUnit.get(unit.id)!;
    const cut = after.cut[c.shotId]!;
    if (!keptWordRange(words, cut.first, cut.last)) return `O plano ${c.shotId} ficaria sem fala; use "Tirar o plano".`;
  }
  if (typeof req.teaser === 'string' && req.teaser.trim().split(/\s+/).length > 22) return 'O cartão aceita até 22 palavras.';
  return null;
}

/* ---------- ponto de corte dos trechos que ficam (montagem) ---------- */

/** folga mínima mantida entre o ponto de corte e a palavra vizinha tirada */
const CUT_GUARD = 0.01;
/** abaixo disso o intervalo entre as palavras é "contíguo": corta no ponto médio */
const CONTIGUOUS_GAP = 0.02;

interface Timed {
  start: number;
  end: number;
}

/** Ponto de corte DEPOIS da palavra que fica (`kept`), antes da tirada (`removed`): até `ahead` s de respiração, sem invadir a tirada. */
function cutAfter(kept: Timed, removed: Timed, ahead: number): number {
  const gap = removed.start - kept.end;
  if (gap < CONTIGUOUS_GAP) return kept.end + Math.max(0, gap) / 2;
  return Math.min(kept.end + ahead, removed.start - CUT_GUARD);
}

/** Ponto de corte ANTES da palavra que fica (`kept`), depois da tirada (`removed`): até `back` s de respiração, sem invadir a tirada nem a própria palavra. */
function cutBefore(removed: Timed, kept: Timed, back: number): number {
  const gap = kept.start - removed.end;
  if (gap < CONTIGUOUS_GAP) return Math.min(kept.start, removed.end + Math.max(0, gap) / 2);
  return Math.max(kept.start - back, removed.end + CUT_GUARD);
}

/**
 * Tempo [início, fim] (s, no clipe de origem) de cada trecho de `segs` (pares inclusivos de índices de palavra, em
 * ordem). Começo/fim do plano ficam como estão (0 e `total`); nas emendas, a fala para logo depois da última
 * palavra que fica e volta logo antes da primeira que volta, com respiração que NUNCA invade a palavra vizinha
 * tirada: fim ≤ início da próxima − 0,01 s e começo ≥ fim da anterior + 0,01 s; intervalo < 20 ms (alinhamento
 * contíguo) corta no ponto médio. As palavras que ficam nunca são cortadas (início ≤ início da 1ª, fim ≥ fim da última).
 */
export function segmentTimes(words: ReadonlyArray<Timed>, segs: ReadonlyArray<readonly [number, number]>, total: number): Array<[number, number]> {
  return segs.map(([a, b], i): [number, number] => {
    const first = words[a]!;
    const last = words[b]!;
    // começo: do plano, ou depois de palavras tiradas (lead / trecho do meio)
    const start = a === 0 ? 0 : Math.max(0, cutBefore(words[a - 1]!, first, i === 0 ? 0.12 : 0.2));
    // fim: do plano, ou antes de palavras tiradas (frase do fim / trecho do meio)
    const end = b === words.length - 1 ? total : Math.min(total, Math.max(last.end, cutAfter(last, words[b + 1]!, 0.3)));
    return [Math.min(start, first.start), end];
  });
}

/* ---------- `skip` conferido pelo texto ---------- */

/** Texto normalizado das palavras `from..to` (inclusivas); null se o intervalo sai das palavras. */
export function skipTextOf(words: ReadonlyArray<{ text: string }>, from: number, to: number): string | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= words.length || from > to) return null;
  return norm(words.slice(from, to + 1).map((w) => w.text).join(' '));
}

/** Palavras de cada plano que é um clipe sozinho (plano → palavras), para conferir/guardar o texto dos `skip`. */
export function soloShotWords<W extends { text: string }>(units: ReadonlyArray<AdjustUnit>, wordsByUnit: ReadonlyMap<string, ReadonlyArray<W>>): Map<string, ReadonlyArray<W>> {
  const out = new Map<string, ReadonlyArray<W>>();
  for (const u of units) {
    const w = wordsByUnit.get(u.id);
    if (u.shotIds.length === 1 && w?.length) out.set(u.shotIds[0]!, w);
  }
  return out;
}

/**
 * Tira do pedido os `skip` cujo texto esperado (`text`) não bate com as palavras da gravação atual (índice que
 * passou a apontar para outras palavras, ou fora do plano). `skip` sem texto (ajuste antigo) passa como estava.
 */
export function verifySkips(req: AdjustRequest, shotWords: ReadonlyMap<string, ReadonlyArray<{ text: string }>>): { request: AdjustRequest; warnings: string[] } {
  if (!req.skip?.some((k) => k.text)) return { request: req, warnings: [] };
  const warnings: string[] = [];
  const skip = req.skip.filter((k) => {
    if (!k.text) return true;
    const words = shotWords.get(k.shotId);
    const now = words ? skipTextOf(words, Math.min(k.from, k.to), Math.max(k.from, k.to)) : null;
    if (now === k.text) return true;
    warnings.push(`trecho ${k.shotId} palavras ${k.from}-${k.to} não aplicado: as palavras não batem com as da gravação anterior (esperado "${k.text}", agora "${now ?? 'fora do plano'}")`);
    return false;
  });
  const { skip: _old, ...rest } = req;
  return { request: skip.length ? { ...rest, skip } : rest, warnings };
}

/** Guarda o texto das palavras puladas nos `skip` do estado que ainda não o têm (para conferir numa regravação futura). */
export function fillSkipText(state: AdjustState, shotWords: ReadonlyMap<string, ReadonlyArray<{ text: string }>>): AdjustState {
  let changed = false;
  const cut: AdjustCuts = {};
  for (const [id, c] of Object.entries(state.cut)) {
    const words = shotWords.get(id);
    if (!c.skip?.length || !words) {
      cut[id] = c;
      continue;
    }
    const texts = c.skip.map(([a, b], i) => c.skipText?.[i] || skipTextOf(words, a, b) || '');
    if (texts.some((x, i) => x !== (c.skipText?.[i] ?? ''))) changed = true;
    cut[id] = { ...c, ...(texts.some(Boolean) ? { skipText: texts } : {}) };
  }
  return changed ? { ...state, cut } : state;
}

/** Plano da chamada (`chamada`, `chamada_N`): não conta como plano novo na regravação. Mesma regra de `isCallShotId` (@lms/course-schema, bridge.ts); este pacote não depende do schema, então a regra é repetida aqui: mantenha as duas em sincronia. */
const CALL_SHOT_RE = /^chamada(_\d+)?$/;

export interface AdjustCarry {
  /** pedido para reaplicar sobre a gravação nova; null = nada a reaplicar */
  request: AdjustRequest | null;
  /** o que ficou de fora, para o log (ex.: "cortar s3: fala mudou") */
  skipped: string[];
}

/**
 * Ajuste fino que sobrevive à regravação (F2): a partir do ajuste da gravação anterior (`prev`), das falas
 * daquela gravação (`oldLines`, plano → fala; `prev.baseLines` quando houver) e dos planos da gravação nova,
 * monta o pedido a reaplicar:
 *  - cartão (`teaser`, inclusive `null` = sem cartão): sempre;
 *  - tirar plano / cortar frase / aparar a abertura: só nos planos cuja fala não mudou (o corte é por frase e
 *    palavra da gravação), e nenhum quando a cena ganhou planos novos que não sejam de chamada (abertura
 *    reescrita: os cortes antigos encurtavam a abertura antiga);
 *  - sem as falas antigas (ajuste antigo, job de origem sumido): só o cartão.
 */
export function carryAdjust(prev: AdjustState, oldLines: Readonly<Record<string, string>> | null | undefined, newShots: ReadonlyArray<{ id: string; line: string }>): AdjustCarry {
  const req: AdjustRequest = {};
  const skipped: string[] = [];
  const was = oldLines ?? prev.baseLines ?? null;
  const now = new Map(newShots.map((s) => [s.id, s.line]));
  const rewritten = !!was && newShots.some((s) => !(s.id in was) && !CALL_SHOT_RE.test(s.id));
  const why = (id: string) => (!was ? 'sem as falas da gravação anterior' : rewritten ? 'abertura reescrita' : !now.has(id) ? 'plano saiu do roteiro' : 'fala mudou');
  const keep = (id: string) => !!was && !rewritten && now.has(id) && id in was && norm(now.get(id)!) === norm(was[id]!);
  const drop = prev.drop.filter((id) => (keep(id) ? true : (skipped.push(`tirar ${id}: ${why(id)}`), false)));
  // não tira todos os planos que sobraram
  if (drop.length && newShots.every((s) => drop.includes(s.id))) skipped.push(...drop.splice(0).map((id) => `tirar ${id}: sobraria um vídeo vazio`));
  if (drop.length) req.drop = drop;
  const cut: NonNullable<AdjustRequest['cut']> = [];
  const trimLead: NonNullable<AdjustRequest['trimLead']> = [];
  const skip: NonNullable<AdjustRequest['skip']> = [];
  for (const [id, c] of Object.entries(prev.cut)) {
    if (!c.first && !c.last && !c.lead && !c.skip?.length) continue;
    if (drop.includes(id)) continue;
    if (!keep(id)) {
      skipped.push(`cortar ${id}: ${why(id)}`);
      continue;
    }
    for (let i = 0; i < c.first; i++) cut.push({ shotId: id, side: 'first' });
    for (let i = 0; i < c.last; i++) cut.push({ shotId: id, side: 'last' });
    if (c.lead) trimLead.push({ shotId: id, words: c.lead });
    (c.skip ?? []).forEach(([from, to], i) => skip.push({ shotId: id, from, to, ...(c.skipText?.[i] ? { text: c.skipText[i]! } : {}) }));
  }
  if (cut.length) req.cut = cut;
  if (trimLead.length) req.trimLead = trimLead;
  if (skip.length) req.skip = skip;
  if (prev.teaser !== undefined) req.teaser = prev.teaser;
  return { request: Object.keys(req).length ? req : null, skipped };
}
