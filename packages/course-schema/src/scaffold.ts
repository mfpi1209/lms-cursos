import { z } from 'zod';

/*
 * Composição guiada ("Monte sua frase"): uma reflexão pode trazer um molde com
 * lacunas (`{slotId}`) e, para cada lacuna, blocos prontos para tocar. Quem é
 * tímido não encara um campo em branco: monta a própria frase escolhendo partes
 * (ou escreve uma parte curta em "Outro…", se a lacuna permitir).
 *
 * O schema é tolerante (o estúdio edita aos poucos); as regras de publicação
 * ficam no compilador (`scaffoldIssues`): toda lacuna do molde precisa de um
 * bloco com o mesmo id, ids únicos, de 2 a 5 opções e nenhuma opção vazia.
 */

export const SCAFFOLD_SLOT_ID_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const PLACEHOLDER_RE = /\{([^{}\s]*)\}/g;

export const SCAFFOLD_MIN_OPTIONS = 2;
export const SCAFFOLD_MAX_OPTIONS = 5;

export const ScaffoldSlotSchema = z.object({
  /** id usado no molde como `{id}` (letras, números e _) */
  id: z.string().min(1).max(40),
  /** nome curto da lacuna (ex.: "seu momento"); também serve de rótulo do grupo quando não há `question` */
  label: z.string().max(60).default(''),
  /**
   * pergunta do grupo, como o aluno lê acima das opções (ex.: "Como você quer começar?"). Opcional:
   * sem ela, o grupo usa o nome da lacuna (quando é legível) ou "Escolha a parte N".
   */
  question: z.string().max(100).optional(),
  /** blocos prontos (2 a 5, verificados na publicação) */
  options: z.array(z.string().max(160)).max(SCAFFOLD_MAX_OPTIONS).default([]),
  /** "Outro…": o aluno escreve a própria parte (curta) */
  allowCustom: z.boolean().default(true),
  customMaxLength: z.number().int().min(5).max(200).default(60),
});
export type ScaffoldSlot = z.infer<typeof ScaffoldSlotSchema>;

export const ReflectionScaffoldSchema = z.object({
  /** frase-molde com lacunas `{slotId}`, ex.: "Estou {momento}. {experiencia}." */
  template: z.string().max(600),
  slots: z.array(ScaffoldSlotSchema).max(8).default([]),
});
export type ReflectionScaffold = z.infer<typeof ReflectionScaffoldSchema>;

export type ScaffoldPart = { kind: 'text'; text: string } | { kind: 'slot'; slotId: string };

/** Quebra o molde em trechos de texto e lacunas, na ordem. */
export function parseScaffoldTemplate(template: string): ScaffoldPart[] {
  const parts: ScaffoldPart[] = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: template.slice(last, at) });
    parts.push({ kind: 'slot', slotId: m[1] ?? '' });
    last = at + m[0].length;
  }
  if (last < template.length) parts.push({ kind: 'text', text: template.slice(last) });
  return parts;
}

/** Ids das lacunas citadas no molde (com repetição, na ordem). */
export function scaffoldPlaceholders(template: string): string[] {
  return parseScaffoldTemplate(template).flatMap((p) => (p.kind === 'slot' ? [p.slotId] : []));
}

/** Limpa uma parte escolhida/escrita: espaços e pontuação final (o molde já pontua). */
export function cleanScaffoldValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[\s.!?…;,]+$/u, '').trim();
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase('pt-BR'));
}

/**
 * Monta a frase: troca cada `{slot}` pelo valor (ou por `empty` quando ainda
 * vazio), normaliza espaços e põe maiúscula no começo das frases.
 */
export function assembleScaffold(scaffold: Pick<ReflectionScaffold, 'template'>, values: Readonly<Record<string, string | undefined>>, empty = '…'): string {
  const text = parseScaffoldTemplate(scaffold.template)
    .map((p) => {
      if (p.kind === 'text') return p.text;
      const v = cleanScaffoldValue(values[p.slotId] ?? '');
      return v || empty;
    })
    .join('');
  return capitalizeSentences(text.replace(/\s+/g, ' ').replace(/\s+([.,;!?])/g, '$1').trim());
}

/** Todas as lacunas do molde têm valor? */
export function isScaffoldComplete(scaffold: Pick<ReflectionScaffold, 'template'>, values: Readonly<Record<string, string | undefined>>): boolean {
  return scaffoldPlaceholders(scaffold.template).every((id) => cleanScaffoldValue(values[id] ?? '').length > 0);
}

export interface ScaffoldIssue {
  code: 'SCAFFOLD_EMPTY_TEMPLATE' | 'SCAFFOLD_UNKNOWN_SLOT' | 'SCAFFOLD_DUPLICATE_SLOT' | 'SCAFFOLD_SLOT_ID' | 'SCAFFOLD_SLOT_OPTIONS' | 'SCAFFOLD_UNUSED_SLOT' | 'SCAFFOLD_TOO_LONG';
  /** erro bloqueia a publicação; aviso é editorial */
  level: 'error' | 'warning';
  message: string;
}

/**
 * Regras do molde (usadas pelo compilador):
 * - erro: molde vazio ou sem lacunas; `{x}` sem bloco `x`; ids repetidos ou
 *   inválidos; bloco com menos de 2 ou mais de 5 opções, ou opção vazia;
 * - aviso: bloco que o molde não usa; frase montada mais longa que `maxLength`.
 */
export function scaffoldIssues(scaffold: ReflectionScaffold, maxLength?: number): ScaffoldIssue[] {
  const issues: ScaffoldIssue[] = [];
  const err = (code: ScaffoldIssue['code'], message: string) => issues.push({ code, level: 'error', message });
  const placeholders = scaffoldPlaceholders(scaffold.template);
  if (!scaffold.template.trim() || placeholders.length === 0) err('SCAFFOLD_EMPTY_TEMPLATE', 'O molde da frase precisa ter ao menos uma lacuna, como {momento}');
  const ids = new Set<string>();
  for (const slot of scaffold.slots) {
    if (ids.has(slot.id)) err('SCAFFOLD_DUPLICATE_SLOT', `Lacuna "${slot.id}" repetida no molde`);
    ids.add(slot.id);
    if (!SCAFFOLD_SLOT_ID_RE.test(slot.id)) err('SCAFFOLD_SLOT_ID', `Id de lacuna inválido "${slot.id}": use letras, números e _`);
    const opts = slot.options.map((o) => o.trim());
    if (opts.length < SCAFFOLD_MIN_OPTIONS || opts.length > SCAFFOLD_MAX_OPTIONS)
      err('SCAFFOLD_SLOT_OPTIONS', `A lacuna "${slot.label || slot.id}" precisa de ${SCAFFOLD_MIN_OPTIONS} a ${SCAFFOLD_MAX_OPTIONS} opções (tem ${opts.length})`);
    if (opts.some((o) => !o)) err('SCAFFOLD_SLOT_OPTIONS', `A lacuna "${slot.label || slot.id}" tem uma opção vazia`);
  }
  for (const id of new Set(placeholders)) if (!ids.has(id)) err('SCAFFOLD_UNKNOWN_SLOT', `O molde usa {${id}}, mas não há lacuna com esse id`);
  for (const id of ids) if (!placeholders.includes(id)) issues.push({ code: 'SCAFFOLD_UNUSED_SLOT', level: 'warning', message: `A lacuna "${id}" não aparece no molde` });
  if (maxLength !== undefined && issues.every((i) => i.level !== 'error')) {
    // pior caso: a opção mais longa (ou o "Outro…" no limite) em cada lacuna
    const longest: Record<string, string> = {};
    for (const s of scaffold.slots) {
      const best = s.options.reduce((a, o) => (o.length > a.length ? o : a), '');
      longest[s.id] = s.allowCustom && s.customMaxLength > best.length ? 'x'.repeat(s.customMaxLength) : best;
    }
    const len = assembleScaffold(scaffold, longest).length;
    if (len > maxLength) issues.push({ code: 'SCAFFOLD_TOO_LONG', level: 'warning', message: `A frase montada pode chegar a ${len} caracteres, acima do máximo de ${maxLength}` });
  }
  return issues;
}


/* -------------------------------------------------------------------------- */
/* Apresentação "tudo visível": grupos, prévia em trechos e restauração        */
/* -------------------------------------------------------------------------- */

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/[\s_-]+/g, ' ').trim();

/** Grupos de escolha na ordem em que as lacunas aparecem no molde (cada lacuna uma vez; só as que existem). */
export function scaffoldGroups(scaffold: ReflectionScaffold): ScaffoldSlot[] {
  const byId = new Map(scaffold.slots.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: ScaffoldSlot[] = [];
  for (const id of scaffoldPlaceholders(scaffold.template)) {
    const slot = byId.get(id);
    if (!slot || seen.has(id)) continue;
    seen.add(id);
    out.push(slot);
  }
  return out;
}

/**
 * Rótulo do grupo para o aluno: a pergunta do grupo; senão o nome da lacuna, quando é um nome
 * legível (não só o id técnico); senão "Escolha a parte N". Nunca mostra o id técnico.
 */
export function scaffoldGroupLabel(slot: Pick<ScaffoldSlot, 'id' | 'label' | 'question'>, position: number): string {
  const q = slot.question?.trim();
  if (q) return q;
  const label = slot.label.trim();
  // nome igual ao id (ex.: "acao", "revisao") ou com "_" é identificador técnico: não aparece
  const technical = label.toLocaleLowerCase('pt-BR') === slot.id.toLocaleLowerCase('pt-BR') || label.includes('_');
  if (label && !technical) return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
  return `Escolha a parte ${position}`;
}

/** Quantos grupos ainda estão sem escolha válida (texto vazio/só espaços não conta). */
export function scaffoldMissingCount(scaffold: ReflectionScaffold, values: Readonly<Record<string, string | undefined>>): number {
  return scaffoldGroups(scaffold).filter((s) => !cleanScaffoldValue(values[s.id] ?? '')).length;
}

export type ScaffoldSegment = { kind: 'text'; text: string } | { kind: 'value'; slotId: string; text: string } | { kind: 'missing'; slotId: string };

const MISSING = '';

/**
 * A frase montada em trechos (texto fixo do molde, parte escolhida, parte que falta), com a MESMA
 * normalização de `assembleScaffold` (espaços, pontuação colada, maiúscula no começo das frases).
 * Completa, `segments.map(text).join('')` é exatamente a frase enviada.
 */
export function scaffoldSegments(scaffold: Pick<ReflectionScaffold, 'template'>, values: Readonly<Record<string, string | undefined>>): ScaffoldSegment[] {
  // caracteres com o índice do trecho de origem
  const raw: Array<{ seg: number; kind: 'text' | 'value' | 'missing'; slotId?: string }> = [];
  const chars: string[] = [];
  const kinds: Array<{ kind: 'text' | 'value' | 'missing'; slotId?: string }> = [];
  parseScaffoldTemplate(scaffold.template).forEach((p, i) => {
    if (p.kind === 'text') {
      kinds[i] = { kind: 'text' };
      for (const ch of p.text) (chars.push(ch), raw.push({ seg: i, kind: 'text' }));
      return;
    }
    const v = cleanScaffoldValue(values[p.slotId] ?? '');
    kinds[i] = v ? { kind: 'value', slotId: p.slotId } : { kind: 'missing', slotId: p.slotId };
    for (const ch of v || MISSING) (chars.push(ch), raw.push({ seg: i, kind: kinds[i]!.kind, slotId: p.slotId }));
  });
  // 1) espaços em sequência viram um; 2) sem espaço antes de . , ; ! ?; 3) sem espaço nas pontas
  let c = chars.map((ch, i) => ({ ch, seg: raw[i]!.seg }));
  c = c.reduce<typeof c>((acc, x) => {
    const ws = /\s/.test(x.ch);
    if (ws && acc.length && /\s/.test(acc[acc.length - 1]!.ch)) return acc;
    acc.push(ws ? { ...x, ch: ' ' } : x);
    return acc;
  }, []);
  c = c.filter((x, i) => !(x.ch === ' ' && i + 1 < c.length && /[.,;!?]/.test(c[i + 1]!.ch)));
  while (c.length && c[0]!.ch === ' ') c.shift();
  while (c.length && c[c.length - 1]!.ch === ' ') c.pop();
  // 4) maiúscula no começo do texto e depois de . ! ? … seguidos de espaço
  for (let i = 0; i < c.length; i++) {
    const startOfSentence = i === 0 || (i >= 2 && c[i - 1]!.ch === ' ' && /[.!?…]/.test(c[i - 2]!.ch));
    if (startOfSentence && /\p{Ll}/u.test(c[i]!.ch)) c[i] = { ...c[i]!, ch: c[i]!.ch.toLocaleUpperCase('pt-BR') };
  }
  // reagrupa por trecho de origem
  const out: ScaffoldSegment[] = [];
  let cur: { seg: number; text: string } | null = null;
  const flush = () => {
    if (!cur) return;
    const k = kinds[cur.seg]!;
    if (k.kind === 'missing') out.push({ kind: 'missing', slotId: k.slotId! });
    else if (k.kind === 'value') out.push({ kind: 'value', slotId: k.slotId!, text: cur.text });
    else if (cur.text) out.push({ kind: 'text', text: cur.text });
    cur = null;
  };
  for (const x of c) {
    if (!cur || cur.seg !== x.seg) {
      flush();
      cur = { seg: x.seg, text: '' };
    }
    cur.text += x.ch;
  }
  flush();
  // espaço que ficou preso entre duas partes do mesmo tipo de texto: já está no trecho de texto; a parte que falta não carrega texto
  return out;
}

export type ScaffoldPick = { kind: 'option'; value: string } | { kind: 'custom'; text: string };

/**
 * Restaura as escolhas a partir de uma frase já salva (revisita): casa a frase com o molde e, para
 * cada lacuna, acha a opção correspondente (sem diferenciar maiúsculas) ou, se a lacuna aceita
 * "Prefiro escrever", o texto escrito. Frase que não casa com o molde → `null` (começa vazio).
 */
export function restoreScaffoldPicks(scaffold: ReflectionScaffold, saved: string | null | undefined): Record<string, ScaffoldPick> | null {
  const text = saved?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const byId = new Map(scaffold.slots.map((s) => [s.id, s]));
  const order: string[] = [];
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let pattern = '';
  for (const p of parseScaffoldTemplate(scaffold.template)) {
    if (p.kind === 'text') {
      pattern += p.text
        .split(/(\s+)/)
        .map((t) => (/^\s+$/.test(t) ? '\\s*' : esc(t)))
        .join('');
    } else {
      order.push(p.slotId);
      pattern += '(.+?)';
    }
  }
  let m: RegExpMatchArray | null = null;
  try {
    m = text.match(new RegExp(`^\\s*${pattern}\\s*$`, 'iu'));
  } catch {
    return null;
  }
  if (!m) return null;
  const picks: Record<string, ScaffoldPick> = {};
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    const slot = byId.get(id);
    const got = cleanScaffoldValue(m[i + 1] ?? '');
    if (!slot || !got) return null;
    const opt = slot.options.find((o) => fold(cleanScaffoldValue(o)) === fold(got));
    const pick: ScaffoldPick | null = opt ? { kind: 'option', value: opt } : slot.allowCustom ? { kind: 'custom', text: got.slice(0, slot.customMaxLength) } : null;
    if (!pick) return null;
    const prev = picks[id];
    if (prev && fold(prev.kind === 'option' ? prev.value : prev.text) !== fold(pick.kind === 'option' ? pick.value : pick.text)) return null;
    picks[id] = pick;
  }
  return picks;
}
