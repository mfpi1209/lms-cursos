/**
 * Conferência de pulsos/mãos: para cada cena de apresentador com vídeo, extrai 3 quadros (25%, 50% e 75% do vídeo)
 * recortados na região das mãos e pulsos (calculada pela zona e pelo enquadramento da câmera do plano naquele momento)
 * e monta `painel.png` (grade: uma linha por cena, 3 quadros) + `index.html` (rótulo `aula/cena`, os 3 recortes e o
 * vídeo ao lado). Só lê o banco e o storage e roda ffmpeg: nenhum provedor, nenhum job, nada é gravado no banco.
 * Os rótulos ficam no HTML (o ffmpeg local não tem o filtro drawtext).
 *
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/painel-pulsos.ts --course crs_xxx [--cenas v01,v02,q01~a] --out ./painel-c1
 *
 * Com muitas cenas o painel é paginado (24 linhas por imagem: painel.png, painel-2.png…). O `index.html` mostra tudo.
 */
import { existsSync } from 'node:fs';
import { mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allLessons, type Camera, type CourseDocument, type Shot, type ShotFraming } from '@lms/course-schema';
import { authoring, getDb, media } from '@lms/db';
import { ffprobe, runFfmpeg } from '@lms/media/compose';
import { readAsset } from '../media';

export const PERCENTS = [25, 50, 75] as const;
/** linhas por imagem do painel (24 × 360 px = 8.640 px de altura) */
export const ROWS_PER_PAGE = 24;
const TILE_W = 640;
const TILE_H = 360;

export interface Args {
  course: string;
  out: string;
  cenas?: string[];
}

export function parseArgs(argv: string[]): Args {
  let course = '';
  let out = '';
  let cenas: string[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--course') course = argv[++i] ?? '';
    else if (a === '--out') out = argv[++i] ?? '';
    else if (a === '--cenas') cenas = [...new Set((argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean))];
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!course) throw new Error('--course <id> é obrigatório');
  if (!out) throw new Error('--out <pasta> é obrigatório');
  if (cenas && !cenas.length) throw new Error('--cenas precisa de ids de cena separados por vírgula (ex.: v01,v02,q01~a)');
  return { course, out: path.resolve(out), ...(cenas ? { cenas } : {}) };
}

export interface HandsRegion {
  /** fração da largura/altura do quadro (qualquer resolução; em 1920x1080 multiplique por 1920/1080) */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Região das mãos/pulsos como fração do quadro. Estúdio em tela cheia: a pessoa ocupa metade da largura, na zona da
 * câmera (esquerda, centro 3/4 ou direita); as mãos ficam na metade de baixo (plano médio: da cintura para cima;
 * mais fechado = as mãos descem para a borda; mais aberto = sobem um pouco). Sempre 50% × 50% do quadro
 * (960×540 em 1920×1080, mesma proporção 16:9 do vídeo).
 */
export function handsRegion(zone: Camera['zone'] | undefined, framing: ShotFraming | undefined): HandsRegion {
  const x = zone === 'left' ? 0.02 : zone === 'right' ? 0.48 : 0.25;
  const f = framing ?? 'medium';
  const y = f === 'wide' ? 0.45 : 0.5;
  return { x, y, w: 0.5, h: 0.5 };
}

/** Expressão de `crop` do ffmpeg (independe da resolução real do vídeo): w:h:x:y. */
export function cropExpr(r: HandsRegion): string {
  const f = (n: number) => +n.toFixed(4);
  return `iw*${f(r.w)}:ih*${f(r.h)}:iw*${f(r.x)}:ih*${f(r.y)}`;
}

/** Plano falado no instante `percent` do vídeo (aproximação pelo tamanho da fala de cada plano). */
export function shotAtPercent<T extends Pick<Shot, 'line'>>(shots: readonly T[], percent: number): T | undefined {
  if (!shots.length) return undefined;
  const total = shots.reduce((a, s) => a + s.line.length, 0) || 1;
  let acc = 0;
  for (const s of shots) {
    acc += s.line.length;
    if ((percent / 100) * total <= acc) return s;
  }
  return shots[shots.length - 1];
}

export function frameTime(durationSeconds: number, percent: number): number {
  return +(durationSeconds * (percent / 100)).toFixed(3);
}

interface Row {
  label: string;
  title: string;
  video: string;
  frames: string[];
  /** zona/enquadramento por quadro (para a legenda) */
  notes: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildIndexHtml(courseTitle: string, rows: Row[], pages: string[]): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Pulsos — ${esc(courseTitle)}</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}h1{font-size:18px}.row{display:grid;grid-template-columns:140px repeat(3,minmax(0,1fr)) minmax(0,1.4fr);gap:8px;align-items:start;border-top:1px solid #333;padding:8px 0}.row img,.row video{width:100%;display:block;background:#000}.lb{font-weight:600}.lb small{display:block;font-weight:400;color:#aaa}.note{color:#999;font-size:11px}</style></head><body>
<h1>Conferência de pulsos — ${esc(courseTitle)} (${rows.length} cenas)</h1>
<p>${pages.map((p) => `<a style="color:#8cf" href="${esc(p)}">${esc(p)}</a>`).join(' · ')}</p>
${rows.map((r) => `<div class="row"><div class="lb">${esc(r.label)}<small>${esc(r.title)}</small></div>${r.frames.map((f, i) => `<div><img loading="lazy" src="${esc(f)}" alt="${esc(r.label)} ${PERCENTS[i]}%"><div class="note">${PERCENTS[i]}% · ${esc(r.notes[i] ?? '')}</div></div>`).join('')}<video controls preload="none" src="${esc(r.video)}"></video></div>`).join('\n')}
</body></html>
`;
}

async function localFile(storageKey: string, fallbackDir: string, id: string, storageDir: string): Promise<string> {
  const local = path.join(storageDir, storageKey);
  if (existsSync(local)) return local;
  const file = path.join(fallbackDir, `${id}.mp4`);
  await writeFile(file, await readAsset(storageKey));
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const draft = await authoring.getDraft(db, args.course);
  if (!draft) throw new Error(`rascunho de ${args.course} não existe`);
  const doc = draft.document as CourseDocument;
  const cameras = (doc.presentation.cameras ?? []) as Camera[];
  const mainCam = cameras.find((c) => c.lookId === doc.presentation.avatarId) ?? cameras[0];
  const storageDir = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');
  const framesDir = path.join(args.out, 'quadros');
  const videosDir = path.join(args.out, 'videos');
  const tilesDir = path.join(args.out, '.tiles');
  await mkdir(framesDir, { recursive: true });
  await mkdir(videosDir, { recursive: true });
  await rm(tilesDir, { recursive: true, force: true });
  await mkdir(tilesDir, { recursive: true });

  const only = args.cenas ? new Set(args.cenas) : null;
  const rows: Row[] = [];
  const tiles: string[] = [];
  for (const l of allLessons(doc)) {
    for (const n of l.graph.nodes) {
      if (only && !only.has(n.id)) continue;
      const m = (n as { media?: { kind?: string; assetId?: string } }).media;
      if (m?.kind !== 'video' || !m.assetId) continue;
      const asset = await media.getAsset(db, m.assetId);
      if (!asset?.storageKey) { console.log(`[pulsos] ${l.id}/${n.id}: vídeo sem arquivo no storage; pulado`); continue; }
      const shots = (n as { direction?: { shots?: Shot[] } }).direction?.shots ?? [];
      // cena só de tela (gravação de tela sem apresentador): nada de mãos a conferir
      if (shots.length && shots.every((s) => s.layout === 'slide' || s.layout === 'card' || s.layout === 'cinematic')) continue;
      const src = await localFile(asset.storageKey, videosDir, asset.id, storageDir);
      const link = path.join(videosDir, `${asset.id}.mp4`);
      if (src !== link) { await rm(link, { force: true }); await symlink(src, link); }
      const info = await ffprobe(src);
      const label = `${l.id}/${n.id}`;
      const safe = label.replace(/[^A-Za-z0-9_-]+/g, '_');
      const frames: string[] = [];
      const notes: string[] = [];
      for (const pct of PERCENTS) {
        const shot = shotAtPercent(shots, pct);
        const cam = (shot?.cameraId ? cameras.find((c) => c.id === shot.cameraId) : undefined) ?? mainCam;
        const framing = shot && cam?.placement === 'full_frame' ? cam.nativeFraming : (shot?.framing ?? cam?.nativeFraming);
        const region = handsRegion(cam?.zone, framing);
        const rel = path.join('quadros', `${safe}_${pct}.png`);
        await runFfmpeg(['-ss', String(frameTime(info.durationSeconds, pct)), '-i', src, '-frames:v', '1', '-vf', `crop=${cropExpr(region)}`, path.join(args.out, rel)]);
        frames.push(rel);
        notes.push(`${cam?.zone ?? 'centro'} / ${framing ?? 'medium'}${shot ? ` / plano ${shot.id}` : ''}`);
        const tile = path.join(tilesDir, `t${String(tiles.length + 1).padStart(5, '0')}.png`);
        await runFfmpeg(['-i', path.join(args.out, rel), '-vf', `scale=${TILE_W}:${TILE_H}`, tile]);
        tiles.push(tile);
      }
      rows.push({ label, title: (n as { title?: string }).title ?? n.id, video: path.join('videos', `${asset.id}.mp4`), frames, notes });
      console.log(`[pulsos] ${label}: 3 quadros`);
    }
  }
  if (!rows.length) throw new Error('nenhuma cena de apresentador com vídeo (confira --course e --cenas)');

  // painel.png em páginas: uma linha por cena, 3 quadros (25/50/75%)
  const pages: string[] = [];
  for (let p = 0; p * ROWS_PER_PAGE < rows.length; p++) {
    const pageRows = Math.min(ROWS_PER_PAGE, rows.length - p * ROWS_PER_PAGE);
    const name = p === 0 ? 'painel.png' : `painel-${p + 1}.png`;
    const dir = path.join(tilesDir, `p${p}`);
    await mkdir(dir, { recursive: true });
    const slice = tiles.slice(p * ROWS_PER_PAGE * 3, (p * ROWS_PER_PAGE + pageRows) * 3);
    for (let i = 0; i < slice.length; i++) await symlink(slice[i]!, path.join(dir, `f${String(i + 1).padStart(5, '0')}.png`));
    await runFfmpeg(['-framerate', '1', '-i', path.join(dir, 'f%05d.png'), '-vf', `tile=3x${pageRows}`, '-frames:v', '1', path.join(args.out, name)]);
    pages.push(name);
  }
  await rm(tilesDir, { recursive: true, force: true });
  await writeFile(path.join(args.out, 'index.html'), buildIndexHtml(doc.title, rows, pages));
  console.log(`[pulsos] ${rows.length} cenas; abra ${path.join(args.out, 'index.html')} (e ${pages.join(', ')})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then(() => process.exit(0), (e) => { console.error(`[pulsos] erro: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
