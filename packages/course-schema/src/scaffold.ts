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
  /** nome curto da lacuna, lido no botão antes da escolha (ex.: "seu momento") */
  label: z.string().max(60).default(''),
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
