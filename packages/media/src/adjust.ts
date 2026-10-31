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
  [shotId: string]: { first: number; last: number };
}

/** Estado acumulado do ajuste de uma cena (fica em `media.adjust`). */
export interface AdjustState {
  drop: string[];
  cut: AdjustCuts;
  /** texto do cartão; `null` = sem cartão; ausente = o da gravação original */
  teaser?: string | null;
}

/** Um pedido de ajuste: só o que muda agora (somado ao estado atual). */
export interface AdjustRequest {
  drop?: string[];
  cut?: Array<{ shotId: string; side: 'first' | 'last' }>;
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
export function keptWordRange(words: ReadonlyArray<{ text: string }>, first: number, last: number): [number, number] | null {
  const spans = sentenceSpans(words);
  if (!spans.length) return null;
  const from = first;
  const to = spans.length - 1 - last;
  if (from > to) return null;
  return [spans[from]![0], spans[to]![1]];
}

const norm = (t: string) =>
  t
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Texto falado de um plano depois dos cortes (as palavras guardadas, sem as frases tiradas). */
export function keptText(words: ReadonlyArray<{ text: string }>, cut?: { first: number; last: number }): string | null {
  const r = keptWordRange(words, cut?.first ?? 0, cut?.last ?? 0);
  return r ? words.slice(r[0], r[1] + 1).map((w) => w.text).join(' ') : null;
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
  if (!req.drop?.length && !req.cut?.length && req.teaser === undefined) return 'Nada a ajustar: escolha um plano, uma frase ou mude o cartão.';
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
