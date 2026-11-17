/**
 * Arquivos de roteiro da revisão (funções puras sobre o TEXTO dos arquivos): seção e linha no `*.telas.md`, no
 * `*.topicos.md` e no roteiro do curso, e o trecho atual de cada seção (o "Estado atual" do prompt de correção).
 */
import { parseSceneTopicsMarkdown, parseScreenMocksMarkdown, screenMockLookupKey, type ScreenMock } from '@lms/course-schema';
import type { SceneReviewContext } from './resolve';

const memo = new Map<string, { mocks?: ReturnType<typeof parseScreenMocksMarkdown>; topics?: ReturnType<typeof parseSceneTopicsMarkdown> }>();
function slot(text: string) {
  let m = memo.get(text);
  if (!m) {
    if (memo.size > 64) memo.clear();
    m = {};
    memo.set(text, m);
  }
  return m;
}
const parsedMocks = (text: string) => (slot(text).mocks ??= parseScreenMocksMarkdown(text));
const parsedTopics = (text: string) => (slot(text).topics ??= parseSceneTopicsMarkdown(text));

export interface SpecFile {
  /** caminho relativo à raiz do repositório */
  path: string;
  text: string;
}

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

/** Linha (1-based) do cabeçalho `## <nome>` (sem caixa) e a linha do item `- …` de número `item` (1-based) da seção. */
export function sectionLines(text: string, heading: string, item?: number): { heading: number; item?: number } | undefined {
  const lines = text.split(/\r?\n/);
  const want = heading.trim().toLowerCase();
  const h = lines.findIndex((l) => {
    const m = /^##\s+(.+?)\s*$/.exec(l);
    return !!m && m[1]!.trim().toLowerCase() === want;
  });
  if (h < 0) return undefined;
  if (!item) return { heading: h + 1 };
  let n = 0;
  for (let i = h + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) break;
    if (/^[-*]\s+/.test(lines[i]!)) {
      n++;
      if (n === item) return { heading: h + 1, item: i + 1 };
    }
  }
  return { heading: h + 1 };
}

export interface SpecHit {
  file: string;
  section: string;
  line: number;
  itemLine?: number;
  /** a seção do arquivo é igual ao que está no rascunho (senão o arquivo e o rascunho divergem) */
  matchesDraft: boolean;
}

/** Seção da tela no `.telas.md`: `## <arquivo>@<CENA>` ou `## <arquivo>`; prefere o arquivo cuja seção é igual ao mock do rascunho. */
export function findScreenSection(files: readonly SpecFile[], fileName: string, nodeId: string, mock: ScreenMock | undefined, step?: number): SpecHit | undefined {
  const base = screenMockLookupKey(fileName);
  const keys = [`${base}@${nodeId.toLowerCase()}`, base];
  let fallback: SpecHit | undefined;
  for (const f of files) {
    const { mocks } = parsedMocks(f.text);
    const lookup = new Map([...mocks].map(([k, v]) => [k.toLowerCase(), { k, v }]));
    for (const key of keys) {
      const hit = lookup.get(key);
      if (!hit) continue;
      const lines = sectionLines(f.text, hit.k, step);
      if (!lines) continue;
      const res: SpecHit = { file: f.path, section: hit.k, line: lines.heading, ...(lines.item ? { itemLine: lines.item } : {}), matchesDraft: !!mock && stable(hit.v) === stable(mock) };
      if (res.matchesDraft) return res;
      fallback ??= res;
      break;
    }
  }
  return fallback;
}

/** Seção `## V07` do `.topicos.md` da cena; prefere o arquivo cujos tópicos são iguais aos do rascunho. */
export function findTopicSection(files: readonly SpecFile[], nodeId: string, topics: SceneReviewContext['topics'], item?: number): SpecHit | undefined {
  const code = nodeId.toUpperCase();
  let fallback: SpecHit | undefined;
  for (const f of files) {
    const parsed = parsedTopics(f.text).topics.get(code);
    if (!parsed) continue;
    const lines = f.text.split(/\r?\n/);
    const h = lines.findIndex((l) => new RegExp(`^##\\s+(?:cena\\s+)?${code}\\b`, 'i').test(l));
    if (h < 0) continue;
    const sec = sectionLines(f.text, lines[h]!.replace(/^##\s+/, ''), item);
    const res: SpecHit = { file: f.path, section: code, line: h + 1, ...(sec?.item ? { itemLine: sec.item } : {}), matchesDraft: stable(parsed.map((t) => ({ text: t.text, ...(t.cue ? { cue: t.cue } : {}) }))) === stable(topics ?? []) };
    if (res.matchesDraft) return res;
    fallback ??= res;
  }
  return fallback;
}

/** Cena `### V07 — …` no roteiro do curso (o roteiro irmão do arquivo de telas/tópicos). */
export function findScriptScene(files: readonly SpecFile[], nodeId: string, prefer?: string): { file: string; line: number } | undefined {
  const re = new RegExp(`^###\\s+${nodeId.toUpperCase()}\\b`);
  const ordered = prefer ? [...files].sort((a, b) => (a.path.includes(prefer) ? -1 : b.path.includes(prefer) ? 1 : 0)) : files;
  for (const f of ordered) {
    const i = f.text.split(/\r?\n/).findIndex((l) => re.test(l));
    if (i >= 0) return { file: f.path, line: i + 1 };
  }
  return undefined;
}

/**
 * Roteiro do curso: o `*.topicos.md`/`*.telas.md` com mais seções IGUAIS às do rascunho dá o nome (`c1-ia-na-pratica`).
 * `scenes` = todas as cenas com tópicos ou telas do rascunho.
 */
export function courseStem(specs: { telas: SpecFile[]; topicos: SpecFile[] }, scenes: ReadonlyArray<Pick<SceneReviewContext, 'nodeId' | 'topics' | 'screens'>>): string | undefined {
  const score = new Map<string, number>();
  const stem = (p: string) => p.replace(/^.*\//, '').replace(/\.(telas|topicos)\.md$/, '');
  for (const sc of scenes) {
    if (sc.topics?.length) for (const f of specs.topicos) if (findTopicSection([f], sc.nodeId, sc.topics)?.matchesDraft) score.set(stem(f.path), (score.get(stem(f.path)) ?? 0) + 1);
    for (const r of sc.screens ?? []) if (r.mock) for (const f of specs.telas) if (findScreenSection([f], r.fileName, sc.nodeId, r.mock)?.matchesDraft) score.set(stem(f.path), (score.get(stem(f.path)) ?? 0) + 1);
  }
  return [...score].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Linhas da seção a partir do cabeçalho da linha `line` (1-based) até o próximo cabeçalho do mesmo nível ou acima. */
export function sectionBody(text: string, line: number, maxLines = 30): string[] {
  const lines = text.split(/\r?\n/);
  const start = line - 1;
  const level = (/^(#+)\s/.exec(lines[start] ?? '')?.[1] ?? '##').length;
  const out: string[] = [lines[start] ?? ''];
  for (let i = start + 1; i < lines.length && out.length < maxLines; i++) {
    const h = /^(#+)\s/.exec(lines[i]!);
    if (h && h[1]!.length <= level) break;
    out.push(lines[i]!);
  }
  while (out.length && !out[out.length - 1]!.trim()) out.pop();
  return out;
}
