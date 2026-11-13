/**
 * CONFERÊNCIA das cenas de tela simulada de um curso: fala × tela, segundo a segundo. SÓ LÊ o banco e o storage.
 *
 *   set -a; . ./.env; set +a
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/qa-telas.ts --course <id> [--cenas v07,v12] --out <pasta>
 *       [--passo 1] [--linhas 2] [--storage <pasta do storage local>] [--sem-video]
 *
 * Para cada cena do rascunho com `screenRecordings`, pega o VÍDEO FINAL da cena (`node.media.assetId`) e a LEGENDA
 * (`node.media.captions.assetId`, WebVTT) e monta o "storyboard": um quadro a cada `--passo` segundos (só a região
 * da tela: o celular, as duas telas da comparação ou a janela do computador) e, embaixo de cada quadro, o que a
 * narração diz naquele intervalo (palavras da legenda; dentro de cada legenda o tempo é repartido pelas palavras).
 * É o artefato para conferir sincronia (o passo aparece quando a fala chega nele?) e coerência (a tela mostra o que
 * a fala descreve? duas telas quando a fala compara? nenhum balão repetido?).
 *
 * Saída em `--out`:
 *   <cena>-01.png, <cena>-02.png…   páginas do storyboard (2 linhas de celular por página ≈ 12 s)
 *   videos/<cena>.mp4               cópia do vídeo final (de onde saem os quadros; `--sem-video` não o mostra no index)
 *   index.html                      todas as cenas: fala, passos da tela (como estão no banco), vídeo e storyboard
 *
 * `--storage`: com storage local, a pasta de `STORAGE_DIR` é relativa a onde o comando roda; informe aqui a pasta
 * certa (ex.: `<raiz>/.data/storage`) quando rodar de outra pasta (um worktree).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScreenMock } from '@lms/course-schema';
import { ffprobe, renderStoryboard, storyboardClock, type StoryboardSource } from '@lms/media/compose';

export interface QaArgs {
  course: string;
  cenas: string[];
  out: string;
  stepSec: number;
  rows: number;
  storage?: string;
  copyVideo: boolean;
}

export function parseQaArgs(argv: string[]): QaArgs {
  const a: QaArgs = { course: '', cenas: [], out: '', stepSec: 1, rows: 2, copyVideo: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (k === '--course') a.course = argv[++i] ?? '';
    else if (k === '--cenas') a.cenas = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--out') a.out = argv[++i] ?? '';
    else if (k === '--passo') a.stepSec = Number((argv[++i] ?? '').replace(',', '.'));
    else if (k === '--linhas') a.rows = Math.floor(Number(argv[++i]));
    else if (k === '--storage') a.storage = argv[++i] ?? '';
    else if (k === '--sem-video') a.copyVideo = false;
    else throw new Error(`flag desconhecida: ${k}`);
  }
  if (!a.course || !a.out) throw new Error('uso: qa-telas.ts --course <id> [--cenas v07,…] --out <pasta> [--passo 1] [--linhas 2] [--storage <pasta>] [--sem-video]');
  if (!(a.stepSec > 0) || !Number.isFinite(a.stepSec)) throw new Error('--passo precisa ser um número de segundos maior que zero');
  if (!(a.rows >= 1)) throw new Error('--linhas precisa ser 1 ou mais');
  return a;
}

/** Trechos do vídeo final (um por gravação da cena), pela duração gravada em cada `screenRecordings[i]`. */
export function sceneSources(file: string, totalSec: number, recs: ReadonlyArray<{ fileName: string; durationSec?: number; kind: StoryboardSource['kind'] }>): StoryboardSource[] {
  const known = recs.reduce((a, r) => a + (r.durationSec ?? 0), 0);
  const missing = recs.filter((r) => !r.durationSec).length;
  const each = missing ? Math.max(0, totalSec - known) / missing : 0;
  let pos = 0;
  return recs.map((r, i) => {
    const d = i === recs.length - 1 ? Math.max(0.1, totalSec - pos) : Math.min(r.durationSec ?? each, Math.max(0.1, totalSec - pos));
    const s: StoryboardSource = { file, fileStartSec: pos, sceneStartSec: pos, durationSec: d, kind: r.kind, label: r.fileName.replace(/\.mp4$/i, '') };
    pos += d;
    return s;
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Um passo da tela em uma linha, na sintaxe do arquivo de telas (para ler ao lado do storyboard). */
export function stepLine(st: ScreenMock['steps'][number]): string {
  const side = st.side ? `[${st.side === 'left' ? 'esq' : 'dir'}] ` : '';
  const tail = `${st.weight !== undefined ? ` (peso ${st.weight})` : ''}${st.cue ? ` (na fala: "${st.cue}")` : ''}`;
  const body = (() => {
    switch (st.kind) {
      case 'type': return `digita: ${st.text}`;
      case 'message': return `${st.from === 'user' ? 'usuário' : st.from === 'ai' ? 'ia' : 'outro'}: ${st.text}`;
      case 'show': return `mostra: ${[st.title ?? '', ...st.lines].join(' | ')}`;
      case 'toggle': return `${st.on ? 'liga' : 'desliga'}: ${st.label}`;
      case 'tap': return `toca: ${st.label}`;
      case 'cell': return `célula: ${st.ref} = ${st.value}`;
      case 'event': return `evento: ${[st.title, st.day, st.time, st.color].filter(Boolean).join(' | ')}`;
      case 'highlight': return `destaca: ${st.text}`;
    }
  })();
  return `${side}${body}${tail}`;
}

export interface QaSceneEntry {
  scene: string;
  title: string;
  lesson: string;
  spoken: string;
  durationSec?: number;
  recordings: Array<{ fileName: string; model?: string; startSec?: number; steps: string[] }>;
  pages: string[];
  /** caminho relativo do vídeo (copiado) */
  video?: string;
  note?: string;
  error?: string;
}

export function buildQaIndexHtml(title: string, entries: QaSceneEntry[]): string {
  const blocks = entries
    .map((e) => `<section id="${esc(e.scene)}">
  <h2>${esc(e.scene)} — ${esc(e.title)}</h2>
  <p class="meta">${esc(e.lesson)}${e.durationSec ? ` · ${e.durationSec.toFixed(1)} s` : ''}${e.note ? ` · <b>${esc(e.note)}</b>` : ''}</p>
  ${e.error ? `<p class="erro">${esc(e.error)}</p>` : ''}
  <p class="fala">${esc(e.spoken)}</p>
  <div class="lado">
    <div class="spec">${e.recordings.map((r) => `<h3>${esc(r.fileName)}${r.model ? ` · ${esc(r.model)}` : ''}${r.startSec !== undefined ? ` · começa em ${storyboardClock(r.startSec)}` : ''}</h3>${r.steps.length ? `<ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="meta">gravação enviada (sem passos)</p>'}`).join('')}</div>
    ${e.video ? `<video controls preload="none" src="${e.video.split('/').map(encodeURIComponent).join('/')}"></video>` : ''}
  </div>
  ${e.pages.map((p) => `<img loading="lazy" src="${encodeURIComponent(p)}" alt="storyboard ${esc(e.scene)}">`).join('\n  ')}
</section>`)
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#f4f5f7;color:#1b1f24}h1{font-size:20px}
nav a{display:inline-block;margin:0 8px 6px 0;font-size:13px}section{background:#fff;border:1px solid #d8dce2;border-radius:10px;padding:14px;margin:0 0 20px}
h2{font-size:17px;margin:0 0 4px}h3{font-size:13px;margin:8px 0 2px;color:#b45309}.meta{margin:0 0 8px;color:#5b6572;font-size:13px}
.fala{font-size:14px;line-height:1.5;background:#f8fafc;border-left:4px solid #0b1424;padding:8px 12px;margin:8px 0}
.lado{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}.spec{flex:1 1 520px;font-size:13px;line-height:1.4}.spec ol{margin:0;padding-left:22px}
video{flex:0 1 480px;width:480px;max-width:100%;background:#000;border-radius:6px}img{display:block;width:100%;max-width:1812px;margin:12px 0;border:1px solid #d8dce2}.erro{color:#b00020}</style></head>
<body><h1>${esc(title)} (${entries.length} cena(s))</h1>
<nav>${entries.map((e) => `<a href="#${esc(e.scene)}">${esc(e.scene)}</a>`).join('')}</nav>
${blocks}
</body></html>
`;
}

export async function runQa(args: QaArgs, log: (m: string) => void = console.log): Promise<{ entries: QaSceneEntry[]; indexPath: string }> {
  if (args.storage) process.env.STORAGE_DIR = path.resolve(args.storage);
  // só aqui o banco é carregado (os testes das funções puras não precisam dele)
  const { loadScreenScenes, readStorage, storyboardKindOf } = await import('./telas-db');
  const outDir = path.resolve(args.out);
  await mkdir(path.join(outDir, 'videos'), { recursive: true });
  const scenes = await loadScreenScenes(args.course, args.cenas);
  log(`[qa-telas] ${args.course}: ${scenes.length} cena(s) com tela`);
  const entries: QaSceneEntry[] = [];
  for (const sc of scenes) {
    const id = sc.nodeId.toLowerCase();
    const entry: QaSceneEntry = {
      scene: sc.nodeId,
      title: sc.title,
      lesson: sc.lessonTitle,
      spoken: sc.spoken,
      recordings: sc.recordings.map((r) => ({ fileName: r.fileName, ...(r.mock ? { model: `${r.mock.model}/${r.mock.device}` } : {}), steps: r.mock ? r.mock.steps.map(stepLine) : [] })),
      pages: [],
    };
    entries.push(entry);
    try {
      if (!sc.videoStorageKey) throw new Error('cena sem vídeo final no rascunho (ainda não foi montada)');
      const file = path.join(outDir, 'videos', `${id}.mp4`);
      await writeFile(file, await readStorage(sc.videoStorageKey));
      if (args.copyVideo) entry.video = `videos/${id}.mp4`;
      const total = (await ffprobe(file)).durationSeconds;
      entry.durationSec = total;
      const sources = sceneSources(file, total, sc.recordings.map((r) => ({ fileName: r.fileName, ...(r.durationSec ? { durationSec: r.durationSec } : {}), kind: storyboardKindOf(r.mock) })));
      sources.forEach((s, i) => (entry.recordings[i]!.startSec = s.sceneStartSec));
      if (!sc.words.length) entry.note = 'sem legenda: os quadros saem sem a fala';
      else if (sc.captionsApprox) entry.note = 'legenda com tempo aproximado';
      const r = await renderStoryboard({ title: `${sc.nodeId} — ${sc.title}`, sources, words: sc.words, stepSec: args.stepSec, rowsPerPage: args.rows, outDir, baseName: id });
      entry.pages = r.pages;
      log(`[qa-telas] ${sc.nodeId}: ${total.toFixed(1)} s, ${r.tiles.length} quadro(s), ${r.pages.length} página(s)`);
    } catch (e) {
      entry.error = String(e instanceof Error ? e.message : e);
      log(`[qa-telas] ${sc.nodeId}: FALHOU (${entry.error})`);
    }
  }
  const indexPath = path.join(outDir, 'index.html');
  await writeFile(indexPath, buildQaIndexHtml(`Conferência das telas — ${args.course}`, entries));
  return { entries, indexPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let args: QaArgs;
  try {
    args = parseQaArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  }
  runQa(args).then(
    (r) => {
      console.log(`[qa-telas] ${r.indexPath}`);
      process.exit(r.entries.some((e) => e.error) ? 1 : 0);
    },
    (e) => {
      console.error(`[qa-telas] erro: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
