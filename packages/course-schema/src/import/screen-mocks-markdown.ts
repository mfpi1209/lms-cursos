import { ScreenMockSchema, type ScreenMock } from '../screen-mock';

/**
 * Lê o arquivo de telas de um roteiro (`docs/roteiros/telas/<roteiro>.telas.md`): uma seção `## gravacao_x` por
 * arquivo de gravação, com `Modelo:`, `Aparelho:`, `App:` e os passos `- digita: …`. A sintaxe completa está no
 * comentário do topo de `../screen-mock.ts`. Nunca lança: erros viram `issues` (com o número da linha) e a seção
 * com erro fica de fora de `mocks`.
 *
 * - chave = nome da seção sem `.mp4` (como escrito; quem consulta compara sem caixa);
 * - seção qualificada pela cena, `## gravacao_x (V31)`, vale só para aquela cena e tem precedência; a chave dela é
 *   `gravacao_x@V31` (cena em maiúsculas). Sem qualificação (`gravacao_x`) vale para todas as cenas que usam o
 *   arquivo. O importador procura primeiro `nome@CENA`, depois `nome`. Seção repetida (mesma chave): vale a primeira;
 *   a repetição gera SCREEN_MOCK_DUPLICATE ("seção duplicada") com a linha;
 * - rótulos aceitam com e sem acento e em qualquer caixa (`Usuário:`, `usuario:`, `CÉLULA:`);
 * - `Aparelho:` celular → phone, computador → desktop (padrão phone);
 * - sufixo ` (na fala: "trecho")` (com ou sem ` (peso N)`) vira `cue` do passo;
 * - texto livre antes da primeira seção `##` é ignorado.
 */

export interface ScreenMockIssue {
  code: 'SCREEN_MOCK_SYNTAX' | 'SCREEN_MOCK_SCHEMA' | 'SCREEN_MOCK_DUPLICATE' | 'SCREEN_MOCK_EMPTY';
  message: string;
  key?: string;
  line?: number;
}

export interface ParsedScreenMocks {
  mocks: Map<string, ScreenMock>;
  issues: ScreenMockIssue[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MODEL_ALIASES: Record<string, string> = {
  chat: 'chat', conversa: 'chat',
  browser: 'browser', navegador: 'browser', site: 'browser',
  form: 'form', formulario: 'form', perfil: 'form',
  settings: 'settings', ajustes: 'settings', configuracoes: 'settings',
  calendar: 'calendar', agenda: 'calendar', calendario: 'calendar',
  sheet: 'sheet', planilha: 'sheet',
  notes: 'notes', notas: 'notes', anotacoes: 'notes',
};
const DEVICE_ALIASES: Record<string, 'phone' | 'desktop'> = { celular: 'phone', phone: 'phone', telefone: 'phone', computador: 'desktop', desktop: 'desktop', pc: 'desktop', notebook: 'desktop' };
const WEIGHT_RE = /\s*\(\s*peso\s+(\d+(?:[.,]\d+)?)\s*\)\s*$/i;
const CUE_RE = /\s*\(\s*na\s+fala\s*:\s*["“”']([^"“”]+?)["“”']\s*\)\s*$/i;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const META_RE = /^(modelo|aparelho|app)\s*:\s*(.*)$/i;
const STEP_RE = /^-\s+([^:]+?)\s*:\s*(.*)$/;

export const screenMockKey = (name: string) => name.trim().replace(/\.mp4$/i, '').trim();
/** Chave de comparação (sem caixa, sem `.mp4`). */
export const screenMockLookupKey = (name: string) => screenMockKey(name).toLowerCase();

type RawStep = { obj: Record<string, unknown>; line: number };

function parseStep(label: string, rawValue: string, line: number, issue: (message: string, l?: number) => void): RawStep | undefined {
  let value = rawValue.trim();
  let weight: number | undefined;
  let cue: string | undefined;
  // sufixos `(peso N)` e `(na fala: "trecho")`, em qualquer ordem
  for (let k = 0; k < 2; k++) {
    const c = CUE_RE.exec(value);
    if (c && cue === undefined) {
      cue = c[1]!.trim();
      value = value.slice(0, c.index).trim();
      continue;
    }
    const w = WEIGHT_RE.exec(value);
    if (w && weight === undefined) {
      weight = Number(w[1]!.replace(',', '.'));
      value = value.slice(0, w.index).trim();
      continue;
    }
    break;
  }
  const wt = { ...(weight !== undefined ? { weight } : {}), ...(cue ? { cue } : {}) };
  const parts = () => value.split('|').map((p) => p.trim());
  const need = (what: string): boolean => {
    if (value) return true;
    issue(`passo "${label}:" sem ${what}`, line);
    return false;
  };
  const l = fold(label);
  switch (l) {
    case 'digita':
      return need('texto') ? { obj: { kind: 'type', text: value, ...wt }, line } : undefined;
    case 'usuario':
    case 'ia':
    case 'outro':
      return need('texto') ? { obj: { kind: 'message', from: l === 'usuario' ? 'user' : l === 'ia' ? 'ai' : 'other', text: value, ...wt }, line } : undefined;
    case 'mostra': {
      const [title, ...lines] = parts();
      return need('título') ? { obj: { kind: 'show', ...(title ? { title } : {}), lines: lines.filter(Boolean), ...wt }, line } : undefined;
    }
    case 'liga':
    case 'desliga':
      return need('rótulo') ? { obj: { kind: 'toggle', label: value, on: l === 'liga', ...wt }, line } : undefined;
    case 'toca':
      return need('rótulo') ? { obj: { kind: 'tap', label: value, ...wt }, line } : undefined;
    case 'celula': {
      const eq = value.indexOf('=');
      if (eq < 0) {
        issue('passo "célula:" precisa de "B2 = valor"', line);
        return undefined;
      }
      return { obj: { kind: 'cell', ref: value.slice(0, eq).trim().toUpperCase(), value: value.slice(eq + 1).trim(), ...wt }, line };
    }
    case 'evento': {
      const [title, day, time, color] = parts();
      if (!title || !day || !time) {
        issue('passo "evento:" precisa de "título | dia | hora" (cor opcional)', line);
        return undefined;
      }
      return { obj: { kind: 'event', title, day, time, ...(color ? { color } : {}), ...wt }, line };
    }
    case 'destaca':
      return need('texto') ? { obj: { kind: 'highlight', text: value, ...wt }, line } : undefined;
    default:
      issue(`passo desconhecido "${label}:" (use digita, usuário, ia, outro, mostra, liga, desliga, toca, célula, evento ou destaca)`, line);
      return undefined;
  }
}

export function parseScreenMocksMarkdown(md: string): ParsedScreenMocks {
  const mocks = new Map<string, ScreenMock>();
  const issues: ScreenMockIssue[] = [];
  const lines = md.replace(/^﻿/, '').split(/\r?\n/);
  const seen = new Map<string, number>();

  type Section = { key: string; line: number; model?: string; device?: string; app?: string; steps: RawStep[]; bad: boolean };
  let cur: Section | undefined;

  const flush = () => {
    if (!cur) return;
    const sec = cur;
    cur = undefined;
    const add = (message: string, line = sec.line, code: ScreenMockIssue['code'] = 'SCREEN_MOCK_SCHEMA') => issues.push({ code, message, key: sec.key, line });
    if (sec.bad) return;
    if (!sec.steps.length) return add('seção sem nenhum passo ("- digita: …", "- ia: …")', sec.line, 'SCREEN_MOCK_EMPTY');
    const parsed = ScreenMockSchema.safeParse({ model: sec.model, ...(sec.device ? { device: sec.device } : {}), app: sec.app, steps: sec.steps.map((s) => s.obj) });
    if (!parsed.success) {
      for (const e of parsed.error.issues) {
        const [head, idx] = e.path;
        const stepLine = head === 'steps' && typeof idx === 'number' ? sec.steps[idx]?.line : undefined;
        const where = head === 'model' ? 'Modelo' : head === 'app' ? 'App' : head === 'steps' && typeof idx === 'number' ? `passo ${idx + 1}` : head === 'steps' ? 'passos' : String(head ?? 'seção');
        add(`${where}: ${e.message}`, stepLine ?? sec.line);
      }
      return;
    }
    mocks.set(sec.key, parsed.data);
  };

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    const sec = SECTION_RE.exec(line);
    if (sec && !line.startsWith('###')) {
      flush();
      const q = /^(.*?)\s*\(\s*([A-Za-z]+\d+)\s*\)\s*$/.exec(sec[1]!);
      const key = q ? `${screenMockKey(q[1]!)}@${q[2]!.toUpperCase()}` : screenMockKey(sec[1]!);
      const lk = key.toLowerCase();
      const dupAt = seen.get(lk);
      const bad = !key || key.startsWith('@') || dupAt !== undefined;
      if (!key || key.startsWith('@')) issues.push({ code: 'SCREEN_MOCK_SYNTAX', message: 'seção sem nome de arquivo', line: n });
      else if (dupAt !== undefined) issues.push({ code: 'SCREEN_MOCK_DUPLICATE', message: `seção duplicada "${key}" (a primeira está na linha ${dupAt}); a repetição foi ignorada`, key, line: n });
      else seen.set(lk, n);
      cur = { key, line: n, steps: [], bad };
      return;
    }
    if (!cur || !line || line.startsWith('#') || /^[-*_]{3,}$/.test(line) || line.startsWith('<!--')) return;
    const here = cur;
    const issue = (message: string, l = n) => {
      here.bad = true;
      issues.push({ code: 'SCREEN_MOCK_SYNTAX', message, key: here.key, line: l });
    };
    const meta = META_RE.exec(line);
    if (meta) {
      const k = fold(meta[1]!);
      const v = meta[2]!.trim();
      if (k === 'app') here.app = v;
      else if (k === 'modelo') {
        const m = MODEL_ALIASES[fold(v)];
        if (m) here.model = m;
        else issue(`Modelo "${v}" desconhecido (use chat, browser, form, settings, calendar, sheet ou notes)`);
      } else {
        const d = DEVICE_ALIASES[fold(v)];
        if (d) here.device = d;
        else issue(`Aparelho "${v}" desconhecido (use celular ou computador)`);
      }
      return;
    }
    if (line.startsWith('-')) {
      const m = STEP_RE.exec(line);
      if (!m) return issue('passo precisa de "- rótulo: valor"');
      const step = parseStep(m[1]!, m[2]!, n, issue);
      if (step) here.steps.push(step);
      return;
    }
    issue(`linha não reconhecida: "${line.slice(0, 60)}"`);
  });
  flush();
  return { mocks, issues };
}
