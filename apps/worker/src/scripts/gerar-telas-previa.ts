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
 * `--paralelo N` (renderizações simultâneas, padrão 4), `--cenas v07,v12` (só essas cenas).
 *
 * COM O TEMPO REAL DA FALA (`--course <id>`, um `--file` só; LÊ o banco, nunca escreve):
 *
 *   ./apps/worker/node_modules/.bin/tsx --env-file=.env apps/worker/src/scripts/gerar-telas-previa.ts \
 *       --file docs/roteiros/c1-ia-na-pratica.md --course <id> [--cenas v12,v16] --out <pasta> [--storage <pasta do storage>] [--passo 1]
 *
 * Para cada cena que já tem legenda no rascunho do curso (a narração já foi gerada), as palavras da legenda (WebVTT;
 * dentro de cada legenda o tempo é repartido pelas palavras) fazem o papel do alinhamento da narração: a duração de
 * cada tela e o início de cada passo saem da MESMA conta da montagem (`planSceneScreens`), e a duração total é a do
 * vídeo já montado. A prévia mostra, então, a sincronia que a cena terá depois de remontada com a spec atual. Para
 * essas cenas saem também o "storyboard" (`<cena>-01.png`…: um quadro a cada `--passo` segundos com a fala embaixo,
 * igual ao de `qa-telas.ts`), `tempos.txt` e, no index, a tabela "passo → instante → o que a fala diz ali". Cena sem
 * legenda no banco segue pela estimativa.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allLessons, importMarkdownCourse, parseScreenMocksMarkdown, richTextToPlain, type ScreenMock } from '@lms/course-schema';
import { captionBetween, planSceneScreens, renderScreenMock, renderStoryboard, runFfmpeg, splitMockDurations, storyboardClock, type CaptionWord, type StoryboardSource } from '@lms/media/compose';
import { estimateLineSeconds } from '../compose-plan';
import { stepLine } from './qa-telas';

export interface PreviewArgs {
  files: string[];
  todos: boolean;
  out: string;
  parallel: number;
  /** curso no banco (só leitura): usa a legenda de cada cena como tempo da fala */
  course?: string;
  /** só estas cenas (ids, sem caixa) */
  cenas?: string[];
  /** pasta do storage local (quando o comando não roda na raiz do repositório) */
  storage?: string;
  /** segundos por quadro do storyboard (padrão 1) */
  stepSec?: number;
}

/** Tempo real da fala de uma cena (da legenda no banco). */
export interface SceneTiming {
  words: CaptionWord[];
  narrationSec: number;
}

export function parseArgs(argv: string[]): PreviewArgs {
  const a: PreviewArgs = { files: [], todos: false, out: '', parallel: 4 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--todos') a.todos = true;
    else if (k === '--file') a.files.push(argv[++i] ?? '');
    else if (k === '--out') a.out = argv[++i] ?? '';
    else if (k === '--paralelo') a.parallel = Math.max(1, Math.floor(Number(argv[++i])) || 4);
    else if (k === '--course') a.course = argv[++i] ?? '';
    else if (k === '--cenas') a.cenas = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--storage') a.storage = argv[++i] ?? '';
    else if (k === '--passo') a.stepSec = Number((argv[++i] ?? '').replace(',', '.')) || 1;
    else throw new Error(`flag desconhecida: ${k}`);
  }
  if (!a.out) throw new Error('uso: gerar-telas-previa.ts (--todos | --file <roteiro>…) --out <pasta> [--paralelo N]');
  if (!a.todos && !a.files.length) throw new Error('informe --file <roteiro> (repetível) ou --todos');
  if (a.course !== undefined && (!a.course || a.todos || a.files.length !== 1)) throw new Error('--course <id> vale para UM roteiro: use com um único --file');
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
  /** com o tempo real da fala: início desta tela na cena e de cada passo (relativo à tela) */
  sceneStartSec?: number;
  stepStarts?: number[];
  stepTypeSecs?: Array<number | undefined>;
  /** passos na sintaxe do arquivo de telas + o instante (na cena) e a fala naquele instante */
  timeline?: Array<{ atSec: number; step: string; speech: string; /** `digita` ditado na fala: segundos que a digitação leva (acompanha a fala) */ typeSec?: number }>;
  /** páginas do storyboard da cena (só na primeira tela da cena) */
  storyboard?: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export function buildIndexHtml(entries: PreviewEntry[]): string {
  const cards = entries
    .map((e) => `<article>
  <h2>${esc(e.scene)} · ${esc(e.file)}</h2>
  <p class="meta">${esc(e.course)} · modelo <b>${esc(e.model)}</b> · ${e.durationSec.toFixed(1)} s</p>
  ${e.error ? `<p class="erro">Falhou: ${esc(e.error)}</p>` : `<video controls preload="none" poster="${enc(e.poster)}" src="${enc(e.video)}"></video>`}
  <p class="fala"><b>${esc(e.sceneTitle)}</b> — ${esc(e.spoken)}</p>${e.timeline ? `
  <table class="tempo"><tr><th>quando</th><th>passo</th><th>a fala nesse instante</th></tr>${e.timeline.map((t) => `<tr><td>${storyboardClock(t.atSec)}</td><td>${esc(t.step)}${t.typeSec !== undefined ? ` <i>(digitado em ${t.typeSec.toFixed(1)} s, no ritmo da fala)</i>` : ''}</td><td>${esc(t.speech)}</td></tr>`).join('')}</table>` : ''}${(e.storyboard ?? []).map((p) => `
  <img class="sb" loading="lazy" src="${enc(p)}" alt="storyboard ${esc(e.scene)}">`).join('')}
</article>`)
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia das telas</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f5f7;color:#1b1f24}h1{font-size:20px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px}
article{background:#fff;border:1px solid #d8dce2;border-radius:10px;padding:12px}h2{font-size:15px;margin:0 0 4px}
.meta{margin:0 0 8px;color:#5b6572;font-size:13px}video{width:100%;max-width:640px;background:#000;border-radius:6px}.fala{font-size:13px;line-height:1.45}.erro{color:#b00020}
.tempo{border-collapse:collapse;font-size:12px;width:100%}.tempo td,.tempo th{border:1px solid #d8dce2;padding:3px 6px;text-align:left;vertical-align:top}.sb{display:block;width:100%;margin:10px 0;border:1px solid #d8dce2}article:has(.sb){grid-column:1/-1}</style></head>
<body><h1>Prévia das telas (${entries.length})</h1><div class="grade">
${cards}
</div></body></html>
`;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

interface Job {
  entry: PreviewEntry;
  mock: ScreenMock;
  /** palavras da cena (tempo real da fala), para o storyboard */
  words?: CaptionWord[];
}

/**
 * Lê o roteiro + telas irmãs e devolve as telas a renderizar. Duração: estimada pela fala; com `timing` (cena → tempo
 * real da fala, chave = id da cena em minúsculas), a duração de cada tela e o início de cada passo vêm da fala, pela
 * mesma conta da montagem. `only` = só estas cenas.
 */
export function planPreview(roteiroPath: string, timing: ReadonlyMap<string, SceneTiming> = new Map(), only: string[] = []): { course: string; jobs: Job[]; issues: string[] } {
  const want = new Set(only.map((s) => s.toLowerCase()));
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
      if (want.size && !want.has(n.id.toLowerCase())) continue;
      const spoken = (n.narration?.trim() ? n.narration : richTextToPlain(n.body as never)).trim();
      const tm = timing.get(n.id.toLowerCase());
      const plan = tm?.words.length ? planSceneScreens(recs.map((r) => ({ steps: r.mock!.steps })), tm.words, tm.narrationSec, splitMockDurations) : undefined;
      const durations = plan ? plan.durations : estimateMockDurations(spoken, recs.map((r) => r.mock!));
      recs.forEach((r, i) => {
        const base = `${slug(n.id)}-${slug(r.fileName.replace(/\.mp4$/i, ''))}`;
        const entry: PreviewEntry = { course, scene: n.id, sceneTitle: n.title ?? n.id, file: r.fileName, model: r.mock!.model, spoken, durationSec: durations[i]!, video: `${course}/${base}.mp4`, poster: `${course}/${base}.png` };
        if (plan && tm) {
          const t0 = plan.starts[i]!;
          entry.sceneStartSec = t0;
          const ss = plan.stepStarts[i];
          if (ss) {
            entry.stepStarts = ss;
            if (plan.typeSecs[i]) entry.stepTypeSecs = plan.typeSecs[i];
            entry.timeline = r.mock!.steps.map((st, k) => ({ atSec: t0 + ss[k]!, step: stepLine(st), ...(plan.typeSecs[i]?.[k] !== undefined ? { typeSec: plan.typeSecs[i]![k]! } : {}), speech: captionBetween(tm.words, t0 + ss[k]! - 0.4, t0 + ss[k]! + 2.2) }));
          }
        }
        jobs.push({ mock: r.mock!, entry, ...(plan && tm ? { words: tm.words } : {}) });
      });
    }
  }
  return { course, jobs, issues: parsed.issues.map((i) => `${i.code}${i.key ? ` ${i.key}` : ''}: ${i.message}`) };
}

async function renderJob(job: Job, outDir: string) {
  const mp4 = path.join(outDir, job.entry.video);
  await mkdir(path.dirname(mp4), { recursive: true });
  await renderScreenMock(job.mock, { outPath: mp4, durationSec: job.entry.durationSec, ...(job.entry.stepStarts ? { stepStarts: job.entry.stepStarts, ...(job.entry.stepTypeSecs ? { stepTypeSecs: job.entry.stepTypeSecs } : {}) } : {}) });
  await runFfmpeg(['-ss', Math.max(0, job.entry.durationSec - 0.2).toFixed(3), '-i', mp4, '-frames:v', '1', path.join(outDir, job.entry.poster)]);
}

/** Renderiza tudo (até `parallel` por vez) e escreve o index.html. Uma tela com erro não derruba as outras. */
export async function generatePreview(args: PreviewArgs, root: string, log: (m: string) => void = console.log): Promise<{ entries: PreviewEntry[]; failed: number; indexPath: string }> {
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });
  const scripts = args.todos ? pilotScripts(root) : args.files.map((f) => path.resolve(f));
  const jobs: Job[] = [];
  const timing = new Map<string, SceneTiming>();
  if (args.course) {
    if (args.storage) process.env.STORAGE_DIR = path.resolve(args.storage);
    // só aqui o banco é carregado (a prévia sem `--course` não precisa dele); SÓ LEITURA
    const { loadScreenScenes } = await import('./telas-db');
    for (const sc of await loadScreenScenes(args.course, args.cenas ?? [])) {
      if (!sc.words.length) continue;
      timing.set(sc.nodeId.toLowerCase(), { words: sc.words, narrationSec: sc.videoDurationSec ?? sc.words[sc.words.length - 1]!.end + 0.35 });
    }
    log(`[previa] ${args.course}: ${timing.size} cena(s) com o tempo real da fala (legenda do banco)`);
  }
  for (const f of scripts) {
    const p = planPreview(f, timing, args.cenas ?? []);
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
  // storyboard por cena (só com o tempo real da fala): os MP4 das telas da cena, em sequência, com a fala embaixo
  const byScene = new Map<string, Job[]>();
  for (const j of jobs) if (j.words && !j.entry.error) byScene.set(`${j.entry.course}/${j.entry.scene}`, [...(byScene.get(`${j.entry.course}/${j.entry.scene}`) ?? []), j]);
  for (const group of byScene.values()) {
    const first = group[0]!;
    const sources: StoryboardSource[] = group.map((j) => ({ file: path.join(outDir, j.entry.video), fileStartSec: 0, sceneStartSec: j.entry.sceneStartSec ?? 0, durationSec: j.entry.durationSec, kind: j.mock.device === 'desktop' ? 'wide' : j.mock.model === 'compare' ? 'pair' : 'phone', label: j.entry.file.replace(/\.mp4$/i, '') }));
    try {
      const sb = await renderStoryboard({ title: `${first.entry.scene} — ${first.entry.sceneTitle} (prévia)`, sources, words: first.words!, stepSec: args.stepSec ?? 1, outDir: path.join(outDir, first.entry.course), baseName: slug(first.entry.scene) });
      first.entry.storyboard = sb.pages.map((p) => `${first.entry.course}/${p}`);
      log(`[previa] storyboard ${first.entry.scene}: ${sb.pages.length} página(s)`);
    } catch (e) {
      log(`[previa] storyboard ${first.entry.scene} FALHOU: ${String(e instanceof Error ? e.message : e)}`);
    }
  }
  const timelineTxt = entries.filter((e) => e.timeline).map((e) => `## ${e.scene} · ${e.file} (${e.durationSec.toFixed(1)} s, começa em ${storyboardClock(e.sceneStartSec ?? 0)})\n${e.timeline!.map((t) => `  ${t.atSec.toFixed(1).padStart(5)}  ${t.step.slice(0, 90)}${t.typeSec !== undefined ? ` ⟶ digitado em ${t.typeSec.toFixed(1)} s` : ''}\n         fala: ${t.speech}`).join('\n')}`).join('\n\n');
  if (timelineTxt) await writeFile(path.join(outDir, 'tempos.txt'), timelineTxt + '\n');
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
