import { spawnSync, fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Rasterização de SVG (resvg) à prova de queda.
 *
 * O resvg é código Rust nativo. Em certas geometrias (ex.: grupo com opacidade + sombra
 * desfocada + giro + `clip-path` numa imagem; ver `zones.ts`) ele dá pânico `Option::unwrap() on
 * None` em `geom.rs`, e como o pânico cruza a fronteira FFI vira ABORT do processo node inteiro
 * (o worker de mídia caía a cada retomada de um job com clipes já pagos). Aqui:
 *
 *  1. `validateSvg` recusa, antes de chamar o resvg, SVG vazio, sem dimensões válidas ou com
 *     `NaN`/`Infinity`/`undefined` nos atributos (geometria inválida);
 *  2. a rasterização roda num processo filho (`raster-child.mjs`): se o resvg abortar, só o filho
 *     morre — o pai recebe `SvgRenderError` (vira erro do job, não queda do worker) e sobe outro filho.
 *
 * `RESVG_ISOLATION=off` roda no próprio processo (só validação), útil em depuração; a versão
 * síncrona (`rasterizeSvgSync`) sempre isola.
 */

export type SvgRenderErrorCode = 'invalid' | 'crash' | 'timeout' | 'spawn';

export class SvgRenderError extends Error {
  constructor(public readonly code: SvgRenderErrorCode, message: string) {
    super(message);
    this.name = 'SvgRenderError';
  }
}

export interface RasterOptions {
  /** cor de fundo (padrão transparente) */
  background?: string;
  /** devolve também os pixels RGBA (para medir caixas de alfa) */
  pixels?: boolean;
}

export interface Raster {
  png: Uint8Array;
  /** RGBA, `width * height * 4` bytes; só quando pedido */
  pixels?: Uint8Array;
  width: number;
  height: number;
}

/**
 * Desenha um gráfico OPCIONAL (pílulas, painel, cartão, letreiro, marca d'água…): se o SVG for
 * inválido ou o rasterizador cair, avisa no log e devolve `undefined` (a montagem segue sem aquele
 * gráfico). Outros erros (disco, bug) continuam subindo.
 */
export async function skipIfUnrenderable<T>(what: string, draw: () => Promise<T>): Promise<T | undefined> {
  try {
    return await draw();
  } catch (e) {
    if (e instanceof SvgRenderError) {
      console.warn(`[compose] ${what}: gráfico ignorado (${e.code}): ${e.message}`);
      return undefined;
    }
    throw e;
  }
}

/** Área máxima aceita (px²): protege de dimensão absurda (≈ 7000×7000). */
const MAX_PIXELS = 50_000_000;
const RENDER_TIMEOUT_MS = 120_000;
const IDLE_MS = 30_000;
const HELPER = fileURLToPath(new URL('./raster-child.mjs', import.meta.url));

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Valida o SVG antes do resvg. Lança `SvgRenderError('invalid')` se estiver vazio, sem `<svg>`,
 * sem largura/altura positivas (atributos ou `viewBox`), grande demais, ou com `NaN`/`Infinity`/
 * `undefined` em transformações, `viewBox` e nas dimensões/posições das formas (dados
 * `href="data:…"` são ignorados: base64 pode conter "NaN").
 */
export function validateSvg(svg: unknown): asserts svg is string {
  if (typeof svg !== 'string' || !svg.trim()) throw new SvgRenderError('invalid', 'SVG vazio');
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) throw new SvgRenderError('invalid', 'SVG sem elemento <svg>');
  const tag = open[0];
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let w = num(attr('width'));
  let h = num(attr('height'));
  if (attr('width') !== undefined && w === undefined && !/%\s*$/.test(attr('width')!)) throw new SvgRenderError('invalid', `largura inválida do SVG: "${attr('width')}"`);
  if (attr('height') !== undefined && h === undefined && !/%\s*$/.test(attr('height')!)) throw new SvgRenderError('invalid', `altura inválida do SVG: "${attr('height')}"`);
  if (vb && (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)))) throw new SvgRenderError('invalid', `viewBox inválido do SVG: "${attr('viewBox')}"`);
  if (vb) {
    if (!(vb[2]! > 0 && vb[3]! > 0)) throw new SvgRenderError('invalid', `viewBox de tamanho zero: "${attr('viewBox')}"`);
    if (w === undefined || /%\s*$/.test(attr('width') ?? '')) w = vb[2];
    if (h === undefined || /%\s*$/.test(attr('height') ?? '')) h = vb[3];
  }
  if (w === undefined || h === undefined) throw new SvgRenderError('invalid', 'SVG sem largura/altura');
  if (!(w > 0 && h > 0)) throw new SvgRenderError('invalid', `SVG de tamanho zero (${w}×${h})`);
  if (w * h > MAX_PIXELS) throw new SvgRenderError('invalid', `SVG grande demais (${w}×${h})`);
  // geometria quebrada (NaN/Infinity/undefined) em transformações e nas formas que o resvg mede. Não olha
  // `filter`/`d`: o satori gera `NaN` em `<filter>` de `boxShadow: none` e o resvg tolera.
  const stripped = svg.replace(/(?:xlink:)?href\s*=\s*"[^"]*"/gi, '');
  const broken = /(?:^|[\s,(=:;-])(?:NaN|-?Infinity|undefined)(?=$|[\s,)\]:;a-z%])/i;
  for (const m of stripped.matchAll(/<(rect|image|circle|ellipse|line|use|g|svg)\b([^>]*)>/gi)) {
    for (const a of m[2]!.matchAll(/\s(x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|transform|viewBox)\s*=\s*"([^"]*)"/g)) {
      if (broken.test(a[2]!)) throw new SvgRenderError('invalid', `SVG com valor inválido em <${m[1]} ${a[1]}="${a[2]!.slice(0, 40)}">`);
    }
  }
}

function isolationOff(): boolean {
  return process.env.RESVG_ISOLATION === 'off';
}

/* ---------------- filho persistente (assíncrono) ---------------- */

interface Pending {
  id: number;
  req: { svg: string; background?: string; pixels?: boolean };
  resolve: (r: Raster) => void;
  reject: (e: Error) => void;
  timer?: NodeJS.Timeout;
  timedOut?: boolean;
}

let child: ChildProcess | null = null;
let ready = false;
let nextId = 1;
const queue: Pending[] = [];
let current: Pending | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let stderrTail = '';

function settle(p: Pending, err: Error | null, value?: Raster) {
  if (p.timer) clearTimeout(p.timer);
  if (err) p.reject(err);
  else p.resolve(value!);
}

function startChild(): ChildProcess {
  const c = fork(HELPER, [], { execArgv: [], serialization: 'advanced', stdio: ['ignore', 'inherit', 'pipe', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } });
  child = c;
  ready = false;
  stderrTail = '';
  c.stderr?.on('data', (d: Buffer) => {
    process.stderr.write(d);
    stderrTail = (stderrTail + d.toString('utf8')).slice(-1500);
  });
  c.on('message', (m: { ready?: boolean; id?: number; ok?: boolean; error?: string; png?: Uint8Array; pixels?: Uint8Array; width?: number; height?: number }) => {
    if (m.ready) {
      ready = true;
      pump();
      return;
    }
    const p = current;
    if (!p || m.id !== p.id) return;
    current = null;
    if (m.ok) settle(p, null, { png: new Uint8Array(m.png!), ...(m.pixels ? { pixels: new Uint8Array(m.pixels) } : {}), width: m.width!, height: m.height! });
    else settle(p, new SvgRenderError('invalid', `resvg recusou o SVG: ${m.error}`));
    pump();
  });
  const onGone = (why: string) => {
    if (child !== c) return;
    child = null;
    ready = false;
    const p = current;
    current = null;
    if (p) {
      const detail = /panicked at[^\n]*(?:\n[^\n]*)?/.exec(stderrTail)?.[0]?.replace(/\s+/g, ' ').trim();
      settle(p, new SvgRenderError(p.timedOut ? 'timeout' : 'crash', `o rasterizador (resvg) encerrou ao desenhar o SVG (${why})${detail ? `: ${detail}` : ''}`));
    }
    pump();
  };
  c.on('exit', (code, signal) => onGone(signal ? `sinal ${signal}` : `código ${code}`));
  c.on('error', (e) => {
    const p = current;
    current = null;
    if (child === c) {
      child = null;
      ready = false;
    }
    const err = new SvgRenderError('spawn', `não foi possível iniciar o rasterizador: ${e.message}`);
    if (p) settle(p, err);
    for (const q of queue.splice(0)) settle(q, err);
  });
  return c;
}

function refChannel(on: boolean) {
  const ch = (child as unknown as { channel?: { ref?: () => void; unref?: () => void } } | null)?.channel;
  if (on) ch?.ref?.();
  else ch?.unref?.();
  const s = child as unknown as { unref?: () => void; ref?: () => void } | null;
  if (on) s?.ref?.();
  else s?.unref?.();
}

function pump() {
  if (current) return;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const next = queue.shift();
  if (!next) {
    // ocioso: solta o filho do laço de eventos e o encerra depois de um tempo
    refChannel(false);
    idleTimer = setTimeout(() => {
      if (!current && !queue.length && child) {
        child.kill();
        child = null;
        ready = false;
      }
    }, IDLE_MS);
    idleTimer.unref();
    return;
  }
  if (!child) startChild();
  refChannel(true);
  if (!ready) {
    queue.unshift(next);
    return; // 'ready' chama pump de novo
  }
  current = next;
  next.timer = setTimeout(() => {
    if (current !== next) return;
    next.timedOut = true;
    const c = child;
    if (c) c.kill('SIGKILL');
  }, RENDER_TIMEOUT_MS);
  try {
    child!.send({ id: next.id, ...next.req });
  } catch (e) {
    current = null;
    settle(next, new SvgRenderError('spawn', `falha ao enviar o SVG ao rasterizador: ${e instanceof Error ? e.message : String(e)}`));
    child?.kill();
    pump();
  }
}

/**
 * Rasteriza o SVG (PNG, e pixels RGBA se pedido) num processo filho. Nunca derruba o processo
 * chamador: SVG inválido ou pânico do resvg viram `SvgRenderError`.
 */
export async function rasterizeSvg(svg: string, opts: RasterOptions = {}): Promise<Raster> {
  validateSvg(svg);
  if (isolationOff()) return rasterizeInProcess(svg, opts);
  return new Promise<Raster>((resolve, reject) => {
    queue.push({ id: nextId++, req: { svg, ...(opts.background ? { background: opts.background } : {}), ...(opts.pixels ? { pixels: true } : {}) }, resolve, reject });
    pump();
  });
}

/** Versão síncrona (um processo por chamada): só para usos raros e em cache (ex.: recorte do logo). */
export function rasterizeSvgSync(svg: string, opts: RasterOptions = {}): Raster {
  validateSvg(svg);
  const r = spawnSync(process.execPath, [HELPER, '--once'], { input: JSON.stringify({ svg, background: opts.background, pixels: !!opts.pixels }), maxBuffer: 256 * 1024 * 1024, timeout: RENDER_TIMEOUT_MS, env: { ...process.env, NODE_OPTIONS: '' } });
  if (r.error) throw new SvgRenderError('spawn', `não foi possível iniciar o rasterizador: ${r.error.message}`);
  if (r.status !== 0) {
    const detail = /panicked at[^\n]*(?:\n[^\n]*)?/.exec(r.stderr?.toString('utf8') ?? '')?.[0]?.replace(/\s+/g, ' ').trim();
    throw new SvgRenderError('crash', `o rasterizador (resvg) encerrou ao desenhar o SVG (${r.signal ? `sinal ${r.signal}` : `código ${r.status}`})${detail ? `: ${detail}` : ''}`);
  }
  const out = JSON.parse(r.stdout.toString('utf8')) as { png: string; pixels?: string; width: number; height: number };
  return { png: new Uint8Array(Buffer.from(out.png, 'base64')), ...(out.pixels ? { pixels: new Uint8Array(Buffer.from(out.pixels, 'base64')) } : {}), width: out.width, height: out.height };
}

async function rasterizeInProcess(svg: string, opts: RasterOptions): Promise<Raster> {
  const { Resvg } = await import('@resvg/resvg-js');
  const r = new Resvg(svg, { fitTo: { mode: 'original' }, background: opts.background ?? 'rgba(0,0,0,0)', font: { loadSystemFonts: false } }).render();
  return { png: new Uint8Array(r.asPng()), ...(opts.pixels ? { pixels: new Uint8Array(r.pixels) } : {}), width: r.width, height: r.height };
}
