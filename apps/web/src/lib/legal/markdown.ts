/**
 * Leitor mínimo e SEGURO de markdown para os textos públicos (privacidade, cookies, termos, segurança).
 * Entende só o que esses textos usam: títulos (#–####), parágrafos, listas (com e sem número), tabelas,
 * citação (>), linha (---), **negrito**, *itálico*, `código` e [links](destino). Nunca gera HTML: devolve uma árvore de dados
 * que o componente renderiza com elementos React (qualquer `<tag>` no texto aparece como texto, sem virar marcação).
 * Links: só rotas internas (`/…`), `https:` e `mailto:`; qualquer outro destino (ex.: `javascript:`) vira texto puro.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3 | 4; c: Inline[]; id: string }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

/** `./politica-de-privacidade.md` → `/privacidade`, etc. Outros `.md` relativos ficam como estão (viram texto, ver `safeHref`). */
export type LinkMap = Record<string, string>;

export function slugify(text: string): string {
  return text
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Destino permitido ou `null`. Aplica o mapa de `./x.md` → rota (com âncora preservada). */
export function safeHref(raw: string, map: LinkMap = {}): string | null {
  const href = raw.trim();
  const rel = href.match(/^\.?\/?([a-z0-9-]+\.md)(#.*)?$/i);
  if (rel) {
    const route = map[rel[1]!];
    return route ? `${route}${rel[2] ?? ''}` : null;
  }
  if (/^\/(?!\/)/.test(href)) return href;
  if (/^#[\w-]+$/.test(href)) return href;
  if (/^https:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  return null;
}

/** Texto simples de uma sequência (para ids de títulos e testes). */
export function inlineToText(c: Inline[]): string {
  return c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : inlineToText(x.c))).join('');
}

export function parseInline(src: string, map: LinkMap = {}): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#|<>-]/.test(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), map) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] !== '*' && src[i + 1] !== ' ') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), map) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = src.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
      if (m) {
        flush();
        const href = safeHref(m[2]!, map);
        const inner = parseInline(m[1]!, map);
        if (href) out.push({ t: 'link', href, c: inner });
        else out.push(...inner);
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const splitRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '`') inCode = !inCode;
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
};
const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(src: string, map: LinkMap = {}): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  let i = 0;
  const startsBlock = (l: string) => /^(#{1,4})\s/.test(l) || /^\s*([-*])\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^>\s?/.test(l) || /^-{3,}\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const c = parseInline(h[2]!, map);
      let id = slugify(inlineToText(c)) || 'secao';
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      blocks.push({ t: 'heading', level: h[1]!.length as 1 | 2 | 3 | 4, c, id });
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]!)) {
      const head = splitRow(line).map((c) => parseInline(c, map));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
        const cells = splitRow(lines[i]!).map((c) => parseInline(c, map));
        while (cells.length < head.length) cells.push([]);
        rows.push(cells.slice(0, head.length));
        i++;
      }
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) parts.push(lines[i++]!.replace(/^>\s?/, ''));
      blocks.push({ t: 'quote', c: parseInline(parts.join(' '), map) });
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i]!)) {
        let text = lines[i]!.replace(re, '');
        i++;
        // continuação recuada do mesmo item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !ul.test(lines[i]!) && !ol.test(lines[i]!)) text += ` ${lines[i++]!.trim()}`;
        items.push(parseInline(text, map));
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!) && !(lines[i]!.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]!))) parts.push(lines[i++]!.trim());
    blocks.push({ t: 'p', c: parseInline(parts.join(' '), map) });
  }
  return blocks;
}
