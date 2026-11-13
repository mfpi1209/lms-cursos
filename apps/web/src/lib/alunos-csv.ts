/*
 * CSV de alunos (importação do estúdio). Sem dependências, roda no navegador e no servidor.
 *
 * Formato: `nome,email,rgm,telefone,cursos` na primeira linha; `cursos` são slugs separados por `;`.
 * Aceita BOM, separador `,` `;` ou tabulação (detectado no cabeçalho), campos entre aspas (com `""`, separador e quebra de linha dentro),
 * CRLF/LF, linhas em branco e acentos (UTF-8). Colunas na ordem que vierem; nomes de coluna sem diferença de caixa/acento.
 */

export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_BYTES = 2 * 1024 * 1024;

export interface CsvStudentRow {
  /** número da linha no arquivo (cabeçalho = 1), para o relatório */
  linha: number;
  nome: string;
  email: string;
  rgm: string;
  telefone: string;
  cursos: string[];
}

export interface CsvParseResult {
  rows: CsvStudentRow[];
  /** problemas do arquivo inteiro (cabeçalho sem coluna obrigatória, linhas demais…); com algum, nada deve ser importado */
  fatal: string[];
}

const ALIASES: Record<string, 'nome' | 'email' | 'rgm' | 'telefone' | 'cursos'> = {
  nome: 'nome',
  name: 'nome',
  aluno: 'nome',
  email: 'email',
  'e-mail': 'email',
  rgm: 'rgm',
  telefone: 'telefone',
  celular: 'telefone',
  fone: 'telefone',
  whatsapp: 'telefone',
  curso: 'cursos',
  cursos: 'cursos',
};

function normHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Escolhe o separador pela primeira linha (fora de aspas): o mais frequente entre `;` `,` e tab. Empate: vírgula. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch]! += 1;
  }
  if (counts[';']! > counts[',']! && counts[';']! >= counts['\t']!) return ';';
  if (counts['\t']! > counts[',']! && counts['\t']! > counts[';']!) return '\t';
  return ',';
}

/** Lê o texto em matriz de células (RFC 4180 com tolerância). Guarda o número da linha física em que cada registro começa. */
export function parseCsvCells(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const out: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let wasQuoted = false;
  const endCell = () => {
    cells.push(cell);
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    out.push({ line: startLine, cells });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '' && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
    } else if (ch === delimiter) endCell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      startLine = line;
    } else cell += ch;
  }
  if (cell !== '' || cells.length > 0 || wasQuoted) endRow();
  return out;
}

export function parseStudentsCsv(input: string): CsvParseResult {
  const text = input.replace(/^﻿/, '');
  const fatal: string[] = [];
  if (!text.trim()) return { rows: [], fatal: ['O arquivo está vazio.'] };
  const delimiter = detectDelimiter(text);
  const records = parseCsvCells(text, delimiter).filter((r) => r.cells.some((c) => c.trim() !== ''));
  const header = records.shift();
  if (!header) return { rows: [], fatal: ['O arquivo está vazio.'] };

  const col: Partial<Record<'nome' | 'email' | 'rgm' | 'telefone' | 'cursos', number>> = {};
  header.cells.forEach((h, i) => {
    const key = ALIASES[normHeader(h)];
    if (key && col[key] === undefined) col[key] = i;
  });
  const missing = (['nome', 'email', 'rgm'] as const).filter((k) => col[k] === undefined);
  if (missing.length) fatal.push(`Faltam colunas no cabeçalho: ${missing.join(', ')}. Use: nome,email,rgm,telefone,cursos.`);
  if (records.length > CSV_MAX_ROWS) fatal.push(`O arquivo tem ${records.length} linhas; o máximo por importação é ${CSV_MAX_ROWS}. Divida em partes.`);
  if (fatal.length) return { rows: [], fatal };

  const get = (cells: string[], k: keyof typeof col) => (col[k] === undefined ? '' : (cells[col[k]!] ?? '').trim());
  const rows = records.map<CsvStudentRow>((r) => ({
    linha: r.line,
    nome: get(r.cells, 'nome'),
    email: get(r.cells, 'email'),
    rgm: get(r.cells, 'rgm'),
    telefone: get(r.cells, 'telefone'),
    cursos: [...new Set(get(r.cells, 'cursos').split(/[;|,]/).map((s) => s.trim()).filter(Boolean))],
  }));
  return { rows, fatal };
}

/** Célula segura para planilha: aspas quando preciso e apóstrofo antes de `= + - @` (injeção de fórmula ao abrir no Excel). */
export function csvCell(value: string, delimiter = ';'): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /["\n\r]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV das linhas com erro (as mesmas colunas da entrada mais `erro`), com BOM e `;` para abrir direto no Excel em português. */
export function errorsToCsv(items: Array<{ row: CsvStudentRow; reason: string }>): string {
  const head = ['linha', 'nome', 'email', 'rgm', 'telefone', 'cursos', 'erro'];
  const lines = items.map(({ row, reason }) => [String(row.linha), row.nome, row.email, row.rgm, row.telefone, row.cursos.join(';'), reason].map((c) => csvCell(c)).join(';'));
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
}
