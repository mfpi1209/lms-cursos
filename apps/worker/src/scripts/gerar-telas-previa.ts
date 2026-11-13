/**
 * Prévia LOCAL das telas simuladas, sem custo: sem banco, sem provedor, sem rede.
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/gerar-telas-previa.ts \
 *       (--todos | --file docs/roteiros/c1-ia-na-pratica.md [--file …]) --out <pasta> [--paralelo 4]
 *
 * Para cada roteiro lê o arquivo de telas irmão (`<pasta do roteiro>/telas/<nome>.telas.md`, a mesma localização do
 * CLI de importação; `parseScreenMocksMarkdown`), importa o roteiro com ele e, para cada gravação de tela que tem
 * `mock`, estima a duração pela fala da cena (palavras ÷ 2,5 por segundo — a mesma conta do planejamento) dividida
 * entre as gravações da cena como na montagem do worker (`splitMockDurations`: proporcional ao peso total dos passos
 * de cada tela, mínimo de 2 s). Renderiza tudo com `renderScreenMock`.
 *
 * Saída em `--out`:
 *   <curso>/<cena>-<arquivo>.mp4   o vídeo da tela (mudo, 1920x1080, 30 fps)
 *   <curso>/<cena>-<arquivo>.png   o último quadro
 *   index.html                     grade: cena, arquivo, modelo, a fala da cena e o <video controls> (caminho relativo)
 *
 * Flags: `--file <roteiro>` (repetível) ou `--todos` (os `docs/roteiros/c[1-5]-*.md`), `--out <pasta>` (obrigatória),
 * `--paralelo N` (renderizações simultâneas, padrão 4).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allLessons, importMarkdownCourse, parseScreenMocksMarkdown, richTextToPlain, type ScreenMock } from '@lms/course-schema';
import { renderScreenMock, runFfmpeg, splitMockDurations } from '@lms/media/compose';
import { estimateLineSeconds } from '../compose-plan';

export interface PreviewArgs {
  files: string[];
  todos: boolean;
  out: string;
  parallel: number;
}

export function parseArgs(argv: string[]): PreviewArgs {
  const a: PreviewArgs = { files: [], todos: false, out: '', parallel: 4 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--todos') a.todos = true;
    else if (k === '--file') a.files.push(argv[++i] ?? '');
    else if (k === '--out') a.out = argv[++i] ?? '';
    else if (k === '--paralelo') a.parallel = Math.max(1, Math.floor(Number(argv[++i])) || 4);
    else throw new Error(`flag desconhecida: ${k}`);
  }
  if (!a.out) throw new Error('uso: gerar-telas-previa.ts (--todos | --file <roteiro>…) --out <pasta> [--paralelo N]');
  if (!a.todos && !a.files.length) throw new Error('informe --file <roteiro> (repetível) ou --todos');
  return a;
}

/** Arquivo de telas irmão do roteiro: `<pasta do roteiro>/telas/<nome-do-roteiro>.telas.md` (igual ao CLI de importação). */
export function siblingScreensPath(roteiro: string): string {
  return path.join(path.dirname(roteiro), 'telas', `${path.basename(roteiro).replace(/\.md$/i, '')}.telas.md`);
}

/** Os 5 roteiros do piloto: `docs/roteiros/c[1-5]-*.md`. */
export function pilotScripts(root: string): string[] {
  const dir = path.join(root, 'docs', 'roteiros');
  return readdirSync(dir).filter((f) => /^c[1-5]-.*\.md$/.test(f)).sort().map((f) => path.join(dir, f));
}

/**
 * Duração estimada de cada tela da cena: palavras da fala ÷ 2,5 por segundo, dividida entre as gravações da cena
 * proporcionalmente ao peso total dos passos de cada tela (passo sem peso = 1), mínimo de 2 s cada.
 */
export function estimateMockDurations(spoken: string, mocks: Array<{ steps: Array<{ weight?: number }> }>): number[] {
  const total = Math.max(1, estimateLineSeconds(spoken));
  return splitMockDurations(mocks.map((m) => ({ mockWeight: m.steps.reduce((a, s) => a + (s.weight ?? 1), 0) })), total);
}

export interface PreviewEntry {
  course: string;
  scene: string;
  sceneTitle: string;
  file: string;
  model: string;
  spoken: string;
  durationSec: number;
  /** caminho relativo à pasta de saída */
  video: string;
  poster: string;
  error?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export function buildIndexHtml(entries: PreviewEntry[]): string {
  const cards = entries
    .map((e) => `<article>
  <h2>${esc(e.scene)} · ${esc(e.file)}</h2>
  <p class="meta">${esc(e.course)} · modelo <b>${esc(e.model)}</b> · ${e.durationSec.toFixed(1)} s</p>
  ${e.error ? `<p class="erro">Falhou: ${esc(e.error)}</p>` : `<video controls preload="none" poster="${enc(e.poster)}" src="${enc(e.video)}"></video>`}
  <p class="fala"><b>${esc(e.sceneTitle)}</b> — ${esc(e.spoken)}</p>
</article>`)
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia das telas</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f5f7;color:#1b1f24}h1{font-size:20px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
article{background:#fff;border:1px solid #d8dce2;border-radius:10px;padding:12px}h2{font-size:15px;margin:0 0 4px}
.meta{margin:0 0 8px;color:#5b6572;font-size:13px}video{width:100%;background:#000;border-radius:6px}.fala{font-size:13px;line-height:1.45}.erro{color:#b00020}</style></head>
<body><h1>Prévia das telas (${entries.length})</h1><div class="grade">
${cards}
</div></body></html>
`;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

interface Job {
  entry: PreviewEntry;
  mock: ScreenMock;
}

/** Lê o roteiro + telas irmãs e devolve as telas a renderizar (com a duração estimada). */
export function planPreview(roteiroPath: string): { course: string; jobs: Job[]; issues: string[] } {
  const md = readFileSync(roteiroPath, 'utf8');
  const telasFile = siblingScreensPath(roteiroPath);
  if (!existsSync(telasFile)) throw new Error(`arquivo de telas não encontrado: ${telasFile}`);
  const parsed = parseScreenMocksMarkdown(readFileSync(telasFile, 'utf8'));
  const result = importMarkdownCourse(md, { screenMocks: parsed.mocks, screenMockIssues: parsed.issues });
  const course = path.basename(roteiroPath).replace(/\.md$/i, '');
  const jobs: Job[] = [];
  for (const lesson of allLessons(result.document)) {
    for (const node of lesson.graph.nodes) {
      const recs = (node as { screenRecordings?: Array<{ fileName: string; mock?: ScreenMock }> }).screenRecordings?.filter((r) => r.mock);
      if (!recs?.length) continue;
      const n = node as unknown as { id: string; title?: string; narration?: string; body?: unknown };
      const spoken = (n.narration?.trim() ? n.narration : richTextToPlain(n.body as never)).trim();
      const durations = estimateMockDurations(spoken, recs.map((r) => r.mock!));
      recs.forEach((r, i) => {
        const base = `${slug(n.id)}-${slug(r.fileName.replace(/\.mp4$/i, ''))}`;
        jobs.push({ mock: r.mock!, entry: { course, scene: n.id, sceneTitle: n.title ?? n.id, file: r.fileName, model: r.mock!.model, spoken, durationSec: durations[i]!, video: `${course}/${base}.mp4`, poster: `${course}/${base}.png` } });
      });
    }
  }
  return { course, jobs, issues: parsed.issues.map((i) => `${i.code}${i.key ? ` ${i.key}` : ''}: ${i.message}`) };
}

async function renderJob(job: Job, outDir: string) {
  const mp4 = path.join(outDir, job.entry.video);
  await mkdir(path.dirname(mp4), { recursive: true });
  await renderScreenMock(job.mock, { outPath: mp4, durationSec: job.entry.durationSec });
  await runFfmpeg(['-ss', Math.max(0, job.entry.durationSec - 0.2).toFixed(3), '-i', mp4, '-frames:v', '1', path.join(outDir, job.entry.poster)]);
}

/** Renderiza tudo (até `parallel` por vez) e escreve o index.html. Uma tela com erro não derruba as outras. */
export async function generatePreview(args: PreviewArgs, root: string, log: (m: string) => void = console.log): Promise<{ entries: PreviewEntry[]; failed: number; indexPath: string }> {
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const scripts = args.todos ? pilotScripts(root) : args.files.map((f) => path.resolve(f));
  const jobs: Job[] = [];
  for (const f of scripts) {
    const p = planPreview(f);
    for (const i of p.issues) log(`[previa] ${path.basename(f)}: ${i}`);
    jobs.push(...p.jobs);
  }
  log(`[previa] ${jobs.length} tela(s) em ${scripts.length} roteiro(s); paralelo ${args.parallel}`);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const j = jobs[next++];
      if (!j) return;
      const t0 = Date.now();
      try {
        await renderJob(j, outDir);
      } catch (e) {
        j.entry.error = String(e instanceof Error ? e.message : e);
      }
      log(`[previa] ${++done}/${jobs.length} ${j.entry.video} ${j.entry.error ? `FALHOU: ${j.entry.error}` : `ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.parallel, jobs.length) || 1 }, worker));
  const entries = jobs.map((j) => j.entry);
  const indexPath = path.join(outDir, 'index.html');
  await writeFile(indexPath, buildIndexHtml(entries));
  return { entries, failed: entries.filter((e) => e.error).length, indexPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const t0 = Date.now();
  generatePreview(parseArgs(process.argv.slice(2)), root)
    .then((r) => {
      console.log(`[previa] pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${r.entries.length} tela(s), ${r.failed} falha(s)\n[previa] ${r.indexPath}`);
      process.exit(r.failed ? 1 : 0);
    })
    .catch((e) => {
      console.error(String(e instanceof Error ? e.message : e));
      process.exit(1);
    });
}
