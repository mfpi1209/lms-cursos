/**
 * DESENGASGO (grátis, local; nada pago): tira da imagem os trechos PARADOS (>= 200 ms) dos vídeos dos cursos
 * (cenas, vídeo próprio da pergunta e reações), sem mexer no áudio nem na duração.
 *
 * Causa: o HeyGen entrega quadros idênticos repetidos enquanto o áudio segue. A técnica (tools/desengasgo/desengasgo.py):
 * os quadros repetidos do meio do trecho são trocados por quadros novos (fluxo óptico ou mistura entre o último quadro antes e o
 * primeiro depois) + deriva de câmera contínua e bem leve (zoom 1,00 -> 1,00x -> 1,00, no máx. 2,5%) na MENOR amplitude que faz
 * todo par de quadros passar do limite do medidor do robô (tools/robo-aluno/trava.py). Mesmo número de quadros; áudio copiado
 * sem recodificar. Mais em docs/qa/lancamento/desengasgo.md.
 *
 * Cada vídeo tratado vira um asset NOVO (o antigo fica no storage); o script troca só `assetId` no RASCUNHO (nó de vídeo,
 * vídeo da pergunta ou reação), preservando `media.adjust` e o resto. Não publica. Idempotente: um asset que já é resultado
 * do desengasgo, ou que já tem filho, não é tratado de novo (reaproveita o filho).
 *
 * Validação de cada asset novo (sem passar, NÃO entra no curso):
 *   - medidor do robô: 0 trechos >= --min-ms;  - ffprobe: quadros e durações de vídeo e áudio iguais ao original (±1 quadro);
 *   - áudio idêntico bit a bit (md5 dos pacotes);  - whisper (asr.py): a fala continua igual.
 *
 * Fica de fora: as cenas da lista `--excluir` (padrão: as 35 cenas que ainda vão receber a fala da missão; o asset novo delas
 * chega pela gravação e o desengasgo roda depois), cenas `stale` e nós com job aberto. Rode DEPOIS de qualquer remontagem
 * (`remontar-emendas.ts` refaz a cena a partir dos clipes e perde o desengasgo).
 *
 * Preparo (uma vez):  python3 -m venv .data/desengasgo-venv && .data/desengasgo-venv/bin/pip install numpy opencv-python-headless
 *
 *   set -a; . ./.env; set +a; export MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0
 *   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/desengasgo.ts <curso>… [opções]
 *
 *   <curso>             id (crs_…) ou código C01…C14
 *   --dry-run           mede e lista o que seria feito; não gera mídia nem grava nada
 *   --varrer            só mede (rascunho E versão publicada, tudo que é vídeo) e grava o relatório; não trata
 *   --so=aula/no,…      só esses nós (ex.: aula_02/v03,aula_01/q02)
 *   --sem=aula_03,…     pula essas aulas (ex.: aula em gravação)
 *   --min-ms=200        trecho mínimo a tratar (padrão 200)
 *   --excluir=<json>    lista de cenas a pular (padrão: docs/qa/lancamento/robo/correcoes-missao-falada.antes-depois.json); --excluir=nenhum desliga
 *   --prever=<pasta>    NÃO grava asset nem rascunho: só gera os vídeos tratados na pasta (inclusive nas cenas excluídas), com a validação
 *   --sem-whisper       pula a conferência da fala (não use para valer)
 *   --paralelo=3        tratamentos ao mesmo tempo (padrão 3; whisper sempre no máx. 2)
 *   --relatorio=<json>  grava o relatório (padrão docs/qa/lancamento/desengasgo/resultado-<data>.json)
 *   --log=<arquivo>
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desc, eq, sql } from 'drizzle-orm';
import { authoring, getDb, media, schema } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';

if (process.env.ALLOW_PAID_PROVIDERS === '1' || process.env.MEDIA_SIMULATION !== '1') {
  console.error('[desengasgo] rode com MEDIA_SIMULATION=1 e ALLOW_PAID_PROVIDERS=0 (o desengasgo é local e grátis)');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DRY = args.includes('--dry-run');
const VARRER = args.includes('--varrer');
const SEM_WHISPER = args.includes('--sem-whisper');
const ONLY = new Set((flag('so') ?? '').split(',').filter(Boolean));
const SEM_AULAS = new Set((flag('sem') ?? '').split(',').filter(Boolean));
const MIN_MS = Number(flag('min-ms') ?? 200);
const PARALELO = Number(flag('paralelo') ?? 3);
const PREVER = flag('prever');
const LOG = flag('log');
const REPO = path.resolve(process.cwd());
const EXCLUIR = flag('excluir') ?? path.join(REPO, 'docs/qa/lancamento/robo/correcoes-missao-falada.antes-depois.json');
const RELATORIO = flag('relatorio') ?? path.join(REPO, `docs/qa/lancamento/desengasgo/resultado-${new Date().toISOString().slice(0, 10)}.json`);
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? '.data/storage');
const PY = process.env.DESENGASGO_PY ?? path.join(REPO, '.data/desengasgo-venv/bin/python');
const TOOL = path.join(REPO, 'tools/desengasgo/desengasgo.py');
const TRAVA = path.join(REPO, 'tools/robo-aluno/trava.py');
const ASR = process.env.DESENGASGO_ASR ?? '/private/tmp/claude-501/-Users-marcelopinheiro-Documents-lms-cursos/d0a554ce-1049-40a7-9324-d388a79c4adc/scratchpad/asr/asr.py';
const CACHE_ROBO = path.join(REPO, 'docs/qa/lancamento/robo/cache-trava.json');
const CACHE_PROPRIO = path.join(REPO, '.data/desengasgo-medidas.json');
const VERSAO = 1;
const COURSES = args.filter((a) => !a.startsWith('--'));

const CODIGOS: Record<string, string> = {
  C01: 'Meu primeiro dia', C02: 'Que roupa eu uso?', C03: 'Celular no trabalho', C04: 'WhatsApp sem complicação', C05: 'Horário é combinado',
  C06: 'Brincadeiras têm limite', C07: 'Como falar com a equipe', C08: 'O espaço também é do outro', C09: 'Posso postar isso?', C10: 'Terminei. E agora?',
  C11: 'Não entendi. Posso perguntar?', C12: 'Recebi uma correção. E agora?', C13: 'Comecei a trabalhar', C14: 'Minha primeira vaga',
};
const log = (m: string) => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  if (LOG) appendFileSync(LOG, line + '\n');
};

// ---------- infraestrutura ----------
function run(cmd: string, a: string[], opts: { input?: string } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, a, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    p.on('error', (e) => resolve({ code: 127, out, err: String(e) }));
    if (opts.input) p.stdin.write(opts.input);
    p.stdin.end();
  });
}
async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      res[i] = await fn(items[i]!, i);
    }
  }));
  return res;
}

type Parada = { t: number; ms: number; fala_db: number; com_fala: boolean; onde: string };
type Medida = { id?: string; dur?: number; quadros?: number; paradas?: Parada[]; erro?: string };
const cacheRobo: Record<string, Medida> = existsSync(CACHE_ROBO) ? JSON.parse(readFileSync(CACHE_ROBO, 'utf8')) : {};
const cacheProprio: Record<string, Medida> = existsSync(CACHE_PROPRIO) ? JSON.parse(readFileSync(CACHE_PROPRIO, 'utf8')) : {};

/** Mede um arquivo com o MESMO medidor do robô (trava.py); reaproveita o cache do robô quando o arquivo é o mesmo. */
async function medir(assetId: string, file: string, usarCache = true): Promise<Medida> {
  const st = await stat(file);
  const kRobo = `${assetId}:${st.size}:${Math.floor(st.mtimeMs)}`;
  const kProprio = `${assetId}:${st.size}`;
  if (usarCache) {
    if (cacheRobo[kRobo]?.paradas) return cacheRobo[kRobo]!;
    if (cacheProprio[kProprio]?.paradas) return cacheProprio[kProprio]!;
  }
  const r = await run('nice', ['-n', '10', 'python3', TRAVA, file]);
  if (r.code !== 0) return { erro: r.err.slice(0, 200) };
  const m = (Object.values(JSON.parse(r.out)) as Medida[])[0]!;
  if (usarCache && m.paradas) {
    cacheProprio[kProprio] = { ...m, id: assetId };
    writeFileSync(CACHE_PROPRIO, JSON.stringify(cacheProprio));
  }
  return m;
}

const grandes = (m: Medida) => (m.paradas ?? []).filter((p) => p.ms >= MIN_MS);

// ---------- documento do curso ----------
type MediaRef = { kind?: string; assetId?: string; stale?: boolean; adjust?: unknown; generatedFrom?: { jobId?: string } };
type Option = { id: string; reaction?: { media?: MediaRef } };
type NodeLike = { id: string; type: string; media?: MediaRef | null; options?: Option[]; direction?: { shots?: unknown[] } };
type Ref = { aulaId: string; noId: string; tipo: 'cena' | 'pergunta' | 'reacao'; opcao?: string; ref: MediaRef; assetId: string };

function refsDe(doc: CourseDocument): Ref[] {
  const out: Ref[] = [];
  for (const m of doc.modules)
    for (const l of m.lessons)
      for (const n0 of l.graph.nodes) {
        const n = n0 as unknown as NodeLike;
        if (n.media?.kind === 'video' && n.media.assetId)
          out.push({ aulaId: l.id, noId: n.id, tipo: n.type === 'choice' ? 'pergunta' : 'cena', ref: n.media, assetId: n.media.assetId });
        for (const o of n.options ?? [])
          if (o.reaction?.media?.kind === 'video' && o.reaction.media.assetId)
            out.push({ aulaId: l.id, noId: n.id, tipo: 'reacao', opcao: o.id, ref: o.reaction.media, assetId: o.reaction.media.assetId });
      }
  return out;
}

async function resolverCurso(a: string): Promise<{ id: string; codigo: string }> {
  const db = getDb();
  if (CODIGOS[a]) {
    const rows = await db.select().from(schema.courses).where(eq(schema.courses.title, CODIGOS[a]!));
    const vivo = rows.filter((r) => r.status !== 'archived');
    if (vivo.length !== 1) throw new Error(`código ${a} (${CODIGOS[a]}): ${vivo.length} cursos não arquivados com esse título`);
    return { id: vivo[0]!.id, codigo: a };
  }
  const c = await authoring.getCourse(db, a);
  if (!c) throw new Error(`curso ${a} não existe`);
  const codigo = Object.entries(CODIGOS).find(([, t]) => t === c.title)?.[0] ?? c.title;
  return { id: c.id, codigo };
}

type Excluidas = Set<string>;
function carregarExcluidas(): Excluidas {
  if (EXCLUIR === 'nenhum' || !existsSync(EXCLUIR)) return new Set();
  const j = JSON.parse(readFileSync(EXCLUIR, 'utf8')) as { mudancas?: Array<{ courseId: string; aula: string; no: string }> } | Array<unknown>;
  const lista = Array.isArray(j) ? ((j.find((x) => Array.isArray(x) && x[0] === 'mudancas') as [string, Array<{ courseId: string; aula: string; no: string }>] | undefined)?.[1] ?? []) : (j.mudancas ?? []);
  return new Set(lista.map((m) => `${m.courseId}/${m.aula}/${m.no}`));
}

// ---------- validação ----------
type Sonda = { vq: number; vd: number; ad: number; md5: string };
async function sonda(file: string): Promise<Sonda> {
  const p = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,nb_frames', '-of', 'json', file]);
  const s = (JSON.parse(p.out).streams ?? []) as Array<{ codec_type: string; duration?: string; nb_frames?: string }>;
  const v = s.find((x) => x.codec_type === 'video');
  const a = s.find((x) => x.codec_type === 'audio');
  const m = await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-map', '0:a', '-c', 'copy', '-f', 'md5', '-']);
  return { vq: Number(v?.nb_frames ?? 0), vd: Number(v?.duration ?? 0), ad: Number(a?.duration ?? 0), md5: m.out.trim() };
}

const filaWhisper: Array<() => void> = [];
let whisperAtivos = 0;
async function comWhisper<T>(fn: () => Promise<T>): Promise<T> {
  if (whisperAtivos >= 2) await new Promise<void>((r) => filaWhisper.push(r));
  whisperAtivos++;
  try {
    return await fn();
  } finally {
    whisperAtivos--;
    filaWhisper.shift()?.();
  }
}

async function asr(video: string, esperado: string, tmp: string): Promise<{ ouvido: string; semelhanca: number; problemas: number }> {
  const out = path.join(tmp, `asr-${createHash('md5').update(video + esperado).digest('hex').slice(0, 8)}.json`);
  const r = await run('nice', ['-n', '10', 'python3', ASR, video, esperado, out]);
  if (r.code !== 0) throw new Error(`asr.py falhou: ${r.err.slice(0, 200)}`);
  const j = JSON.parse(await readFile(out, 'utf8')) as { ouvido: string; semelhanca: number; problemas: unknown[] };
  return { ouvido: j.ouvido, semelhanca: j.semelhanca, problemas: j.problemas.length };
}

type Resultado = {
  de: string; para?: string; ok: boolean; motivo?: string;
  trechos?: Array<{ inicio: number; ms: number; metodo: string; amp: number; corte: boolean; cauda: boolean; estrito: boolean; quadro: number }>;
  antes: number; depois?: number; arquivo?: string; tamanhoAntes?: number; tamanhoDepois?: number;
  fala?: { semelhanca: number; ouvido: string };
};

/** Gera o vídeo tratado de UM asset e o valida. Devolve o arquivo (em `tmp`) quando passou em tudo. */
async function tratar(assetId: string, tmp: string): Promise<Resultado & { _file?: string }> {
  const db = getDb();
  const cur = await media.getAsset(db, assetId);
  if (!cur) return { de: assetId, ok: false, motivo: 'asset não existe', antes: 0 };
  const orig = path.join(STORAGE, cur.storageKey);
  const antes = await medir(assetId, orig);
  const gr = grandes(antes);
  const out = path.join(tmp, `${assetId}.mp4`);
  const t = await run('nice', ['-n', '10', PY, TOOL, 'trata', orig, out, '--min-ms', String(MIN_MS), '--crf', '18']);
  if (t.code !== 0) return { de: assetId, ok: false, motivo: `desengasgo.py falhou: ${t.err.trim().split('\n').pop()}`, antes: gr.length };
  const info = JSON.parse(t.out) as { trechos: NonNullable<Resultado['trechos']>; escritos?: number; lidos?: number; semTrechos?: boolean };
  if (info.semTrechos) return { de: assetId, ok: false, motivo: 'sem trecho >= mínimo (nada a fazer)', antes: gr.length };
  const r: Resultado & { _file?: string } = { de: assetId, ok: false, trechos: info.trechos, antes: gr.length, tamanhoAntes: cur.sizeBytes, arquivo: out };
  // 1. medidor do robô (sem cache: arquivo novo)
  const depois = await medir(assetId + '#novo', out, false);
  if (depois.erro) return { ...r, motivo: `medidor falhou: ${depois.erro}` };
  r.depois = grandes(depois).length;
  if (r.depois > 0) return { ...r, motivo: `ainda há ${r.depois} trecho(s) >= ${MIN_MS} ms (${grandes(depois).map((p) => `${p.t}s/${p.ms}ms`).join(', ')})` };
  // 2. ffprobe: quadros, durações, áudio idêntico
  const [so, sn] = await Promise.all([sonda(orig), sonda(out)]);
  if (so.vq !== sn.vq) return { ...r, motivo: `quadros ${so.vq} -> ${sn.vq}` };
  if (Math.abs(so.vd - sn.vd) > 0.04 + 1e-6) return { ...r, motivo: `duração do vídeo ${so.vd} -> ${sn.vd}` };
  if (Math.abs(so.ad - sn.ad) > 0.04 + 1e-6) return { ...r, motivo: `duração do áudio ${so.ad} -> ${sn.ad}` };
  if (so.md5 !== sn.md5) return { ...r, motivo: 'áudio diferente do original (md5 dos pacotes)' };
  r.tamanhoDepois = (await stat(out)).size;
  // 3. fala (whisper): o que se ouve no novo é igual ao que se ouve no original
  if (!SEM_WHISPER) {
    try {
      const f = await comWhisper(async () => {
        const o = await asr(orig, '', tmp);
        const n = await asr(out, o.ouvido, tmp);
        return { semelhanca: n.semelhanca, ouvido: o.ouvido, problemas: n.problemas };
      });
      r.fala = { semelhanca: f.semelhanca, ouvido: f.ouvido };
      if (f.semelhanca < 1 || f.problemas > 0) return { ...r, motivo: `fala mudou (semelhança ${f.semelhanca}, ${f.problemas} diferença(s))` };
    } catch (e) {
      return { ...r, motivo: `whisper: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  r.ok = true;
  r._file = out;
  return r;
}

async function gravarAsset(assetId: string, file: string, resumo: Resultado): Promise<string> {
  const db = getDb();
  const cur = (await media.getAsset(db, assetId))!;
  const buf = await readFile(file);
  const sha = createHash('sha256').update(buf).digest('hex');
  const key = `${cur.workspaceId}/video/${sha.slice(0, 2)}/${sha}.mp4`;
  await mkdir(path.dirname(path.join(STORAGE, key)), { recursive: true });
  await copyFile(file, path.join(STORAGE, key));
  const row = await media.createAsset(db, {
    workspaceId: cur.workspaceId, kind: 'video', source: 'generated', mimeType: 'video/mp4', sizeBytes: (await stat(path.join(STORAGE, key))).size,
    storageProvider: cur.storageProvider, storageKey: key, sha256: sha,
    ...(cur.durationSeconds != null ? { durationSeconds: cur.durationSeconds } : {}),
    ...(cur.transcript ? { transcript: cur.transcript } : {}),
    ...(cur.createdBy ? { createdBy: cur.createdBy } : {}),
    metadata: {
      ...((cur.metadata ?? {}) as Record<string, unknown>),
      desengasgo: { versao: VERSAO, from: cur.id, trechos: resumo.trechos?.length ?? 0, minMs: MIN_MS, em: new Date().toISOString() },
    },
  } as never);
  return row.id;
}

/** Filho já gerado de um asset (idempotência). */
async function filhoDe(assetId: string): Promise<string | null> {
  const rows = await getDb().select({ id: schema.assets.id }).from(schema.assets).where(sql`${schema.assets.metadata}->'desengasgo'->>'from' = ${assetId}`).limit(1);
  return rows[0]?.id ?? null;
}
async function ehFilho(assetId: string): Promise<boolean> {
  const a = await media.getAsset(getDb(), assetId);
  return !!(a?.metadata as { desengasgo?: unknown } | null)?.desengasgo;
}

// ---------- por curso ----------
type Linha = { aula: string; no: string; tipo: string; opcao?: string; de: string; para?: string; antes: number; depois?: number; estado: string; trechos?: Resultado['trechos']; validacao?: { tamanhoAntes?: number; tamanhoDepois?: number; audioIgual: boolean; falaSemelhanca?: number } };
type Rel = {
  curso: string; courseId: string; rascunhoRevAntes: number; rascunhoRevDepois?: number;
  varredura: { rascunho: { videos: number; assets: number; ge200: number; tolerados: number }; publicada?: { versao: number; videos: number; assets: number; ge200: number; tolerados: number; diferemDoRascunho: number } };
  linhas: Linha[]; naoFicaramBons: Array<{ asset: string; motivo: string }>; excluidasComTrecho: Array<{ aula: string; no: string; asset: string; trechos: number }>; ignoradas: string[];
};

async function curso(a: string, tmp: string, excl: Excluidas): Promise<Rel> {
  const db = getDb();
  const { id: courseId, codigo } = await resolverCurso(a);
  const draft = (await authoring.getDraft(db, courseId))!;
  const doc = draft.document as CourseDocument;
  const refs = refsDe(doc);
  const rel: Rel = { curso: codigo, courseId, rascunhoRevAntes: draft.revision, varredura: { rascunho: { videos: refs.length, assets: 0, ge200: 0, tolerados: 0 } }, linhas: [], naoFicaramBons: [], excluidasComTrecho: [], ignoradas: [] };

  // 1. varredura: medir tudo que é vídeo do rascunho e da versão publicada mais nova
  const [pub] = await db.select().from(schema.courseVersions).where(eq(schema.courseVersions.courseId, courseId)).orderBy(desc(schema.courseVersions.versionNumber)).limit(1);
  const refsPub = pub ? refsDe(pub.document as CourseDocument) : [];
  const ids = [...new Set([...refs, ...refsPub].map((r) => r.assetId))];
  const medidas = new Map<string, Medida>();
  await pool(ids, 4, async (id) => {
    const cur = await media.getAsset(db, id);
    if (!cur) { medidas.set(id, { erro: 'asset não existe' }); return; }
    medidas.set(id, await medir(id, path.join(STORAGE, cur.storageKey)));
  });
  const conta = (rs: Ref[]) => {
    const u = [...new Set(rs.map((r) => r.assetId))];
    return { videos: rs.length, assets: u.length, ge200: rs.filter((r) => grandes(medidas.get(r.assetId) ?? {}).length).length, tolerados: rs.filter((r) => (medidas.get(r.assetId)?.paradas ?? []).some((p) => p.ms >= 120 && p.ms < MIN_MS)).length };
  };
  rel.varredura.rascunho = conta(refs);
  if (pub) {
    const idsRasc = new Set(refs.map((r) => r.assetId));
    rel.varredura.publicada = { versao: pub.versionNumber, ...conta(refsPub), diferemDoRascunho: [...new Set(refsPub.map((r) => r.assetId))].filter((x) => !idsRasc.has(x)).length };
  }
  const trechosEm = (id: string) => grandes(medidas.get(id) ?? {}).length;
  log(`[desengasgo] ${codigo} ${courseId}: rascunho rev ${draft.revision}: ${rel.varredura.rascunho.videos} vídeos (${rel.varredura.rascunho.assets} assets), ${rel.varredura.rascunho.ge200} com trecho >= ${MIN_MS} ms${pub ? `; publicada v${pub.versionNumber}: ${rel.varredura.publicada!.ge200} com trecho` : ''}`);
  if (VARRER) return rel;

  // 2. o que tratar
  const abertos = new Set((await media.listJobsForCourse(db, courseId)).filter((j) => j.status === 'queued' || j.status === 'running').map((j) => `${j.lessonId}/${j.nodeId}`));
  const alvo: Ref[] = [];
  for (const r of refs) {
    const chave = `${r.aulaId}/${r.noId}`;
    if (!trechosEm(r.assetId)) continue;
    const motivo =
      SEM_AULAS.has(r.aulaId) ? 'aula pulada (--sem)'
      : ONLY.size && !ONLY.has(chave) ? 'fora de --so'
      : r.tipo === 'cena' && excl.has(`${courseId}/${r.aulaId}/${r.noId}`) ? 'cena na lista da missão falada (o asset novo chega pela gravação)'
      : r.ref.stale ? 'cena desatualizada (será regravada)'
      : [...abertos].some((k) => k === chave || k.startsWith(`${chave}~`)) ? 'job aberto no nó'
      : null;
    if (motivo && PREVER && motivo.startsWith('cena na lista')) { alvo.push(r); continue; }  // --prever também trata as excluídas (só gera o vídeo)
    if (motivo) {
      rel.ignoradas.push(`${chave}${r.opcao ? '~' + r.opcao : ''} ${r.assetId}: ${motivo}`);
      if (motivo.startsWith('cena na lista')) rel.excluidasComTrecho.push({ aula: r.aulaId, no: r.noId, asset: r.assetId, trechos: trechosEm(r.assetId) });
      continue;
    }
    alvo.push(r);
  }
  const unicos = [...new Set(alvo.map((r) => r.assetId))];
  log(`[desengasgo] ${codigo}: ${alvo.length} vídeo(s) a tratar (${unicos.length} asset(s)); ${rel.ignoradas.length} pulado(s)`);
  for (const x of rel.ignoradas) log(`[desengasgo]   pulado: ${x}`);
  if (DRY) {
    for (const r of alvo) log(`[desengasgo]   ${r.aulaId}/${r.noId}${r.opcao ? '~' + r.opcao : ''} ${r.tipo} ${r.assetId}: ${grandes(medidas.get(r.assetId)!).map((p) => `${p.t}s/${p.ms}ms${p.com_fala ? ' (fala)' : ''}`).join(', ')}`);
    return rel;
  }

  // 3. gerar + validar (um asset por vez de cada tipo; reaproveita filhos já gerados)
  const novo = new Map<string, string>();
  const res = new Map<string, Resultado>();
  await pool(unicos, PARALELO, async (id) => {
    if (await ehFilho(id)) { res.set(id, { de: id, ok: false, motivo: 'já é resultado do desengasgo', antes: trechosEm(id) }); return; }
    const pronto = PREVER ? null : await filhoDe(id);
    if (pronto) { novo.set(id, pronto); res.set(id, { de: id, para: pronto, ok: true, motivo: 'filho já existia (idempotente)', antes: trechosEm(id), depois: 0 }); return; }
    const r = await tratar(id, tmp);
    res.set(id, r);
    if (!r.ok) { log(`[desengasgo]   FALHOU ${id}: ${r.motivo}`); return; }
    if (PREVER) {
      mkdirSync(PREVER, { recursive: true });
      const dest = path.join(PREVER, `${codigo}_${id}.mp4`);
      await copyFile(r._file!, dest);
      r.arquivo = dest;
      log(`[desengasgo]   prévia ${id} -> ${dest}: ${r.antes} -> ${r.depois} trecho(s), ${r.trechos!.length} refeito(s)`);
      return;
    }
    r.para = await gravarAsset(id, r._file!, r);
    novo.set(id, r.para);
    log(`[desengasgo]   ${id} -> ${r.para}: ${r.antes} -> ${r.depois} trecho(s) >= ${MIN_MS} ms; ${r.trechos!.map((t) => `${t.inicio}s/${t.ms}ms ${t.metodo} ${(t.amp * 100).toFixed(1)}%`).join(', ')}`);
  });
  for (const [id, r] of res) if (!r.ok && !/já é resultado|nada a fazer/.test(r.motivo ?? '')) rel.naoFicaramBons.push({ asset: id, motivo: r.motivo ?? '?' });
  if (PREVER) {
    for (const r of alvo) rel.linhas.push(linhaDe(r, res.get(r.assetId), undefined, 'prévia'));
    return rel;
  }

  // 4. trocar no rascunho: relê, troca só `assetId` onde ainda é o asset antigo (nunca em cena excluída/desatualizada),
  //    grava com controle de revisão e tenta de novo se o worker gravou no meio
  const trocaveis = new Set(alvo.map((r) => `${r.aulaId}/${r.noId}/${r.opcao ?? ''}`));
  for (let tentativa = 0; tentativa < 6 && novo.size; tentativa++) {
    const d = (await authoring.getDraft(db, courseId))!;
    const copia = structuredClone(d.document) as CourseDocument;
    let n = 0;
    for (const r of refsDe(copia)) {
      const para = novo.get(r.assetId);
      if (!para || !trocaveis.has(`${r.aulaId}/${r.noId}/${r.opcao ?? ''}`)) continue;
      if (r.tipo === 'cena' && excl.has(`${courseId}/${r.aulaId}/${r.noId}`)) continue;
      r.ref.assetId = para;
      n++;
    }
    if (!n) { log(`[desengasgo] ${codigo}: nada a trocar (o rascunho já mudou)`); break; }
    try {
      const saved = await authoring.saveDraft(db, { courseId, document: copia, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `desengasgo: ${n} vídeo(s) sem trecho parado >= ${MIN_MS} ms` } as never);
      rel.rascunhoRevDepois = (saved as { revision: number }).revision;
      log(`[desengasgo] ${codigo}: ${n} referência(s) trocada(s); rascunho ${d.revision} -> ${rel.rascunhoRevDepois}`);
      break;
    } catch (e) {
      if (e instanceof Error && /CONFLICT|alterado por outra/.test(`${(e as { code?: string }).code ?? ''} ${e.message}`) && tentativa < 5) { log(`[desengasgo] ${codigo}: conflito de revisão, tentando de novo`); continue; }
      throw e;
    }
  }
  const depoisDoc = refsDe((await authoring.getDraft(db, courseId))!.document as CourseDocument);
  for (const r of alvo) {
    const atual = depoisDoc.find((x) => x.aulaId === r.aulaId && x.noId === r.noId && (x.opcao ?? '') === (r.opcao ?? ''));
    rel.linhas.push(linhaDe(r, res.get(r.assetId), atual?.assetId, atual && atual.assetId === novo.get(r.assetId) ? 'trocado' : 'não trocado'));
  }
  return rel;
}

function linhaDe(r: Ref, x: Resultado | undefined, atual: string | undefined, estado: string): Linha {
  return { aula: r.aulaId, no: r.noId, tipo: r.tipo, ...(r.opcao ? { opcao: r.opcao } : {}), de: r.assetId, ...(atual && atual !== r.assetId ? { para: atual } : x?.para ? { para: x.para } : {}), antes: x?.antes ?? 0, ...(x?.depois != null ? { depois: x.depois } : {}), estado: x?.ok ? estado : `não tratado: ${x?.motivo ?? '?'}`, ...(x?.trechos ? { trechos: x.trechos } : {}), ...(x?.ok ? { validacao: { tamanhoAntes: x.tamanhoAntes, tamanhoDepois: x.tamanhoDepois, audioIgual: true, ...(x.fala ? { falaSemelhanca: x.fala.semelhanca } : {}) } } : {}) };
}

async function main() {
  if (!COURSES.length) throw new Error('uso: desengasgo.ts <curso>… [--dry-run|--varrer] [--so=aula/no,…] [--sem=aula,…] [--min-ms=200] [--prever=<pasta>] [--relatorio=<json>] [--log=arquivo]');
  if (!DRY && !VARRER && !existsSync(PY)) throw new Error(`python do desengasgo não encontrado em ${PY} (veja o "Preparo" no topo do script ou defina DESENGASGO_PY)`);
  if (!DRY && !VARRER && !SEM_WHISPER && !existsSync(ASR)) throw new Error(`asr.py não encontrado em ${ASR} (defina DESENGASGO_ASR ou use --sem-whisper)`);
  const excl = carregarExcluidas();
  log(`[desengasgo] ${DRY ? 'DRY-RUN' : VARRER ? 'VARREDURA' : PREVER ? 'PRÉVIA' : 'TRATAR'}; mínimo ${MIN_MS} ms; ${excl.size} cena(s) excluída(s)`);
  const tmp = await mkdtemp(path.join(tmpdir(), 'lms-desengasgo-'));
  const rels: Rel[] = [];
  try {
    for (const c of COURSES) rels.push(await curso(c, tmp, excl));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  mkdirSync(path.dirname(RELATORIO), { recursive: true });
  if (!DRY) writeFileSync(RELATORIO, JSON.stringify({ geradoEm: new Date().toISOString(), modo: VARRER ? 'varredura' : PREVER ? 'previa' : 'tratar', minMs: MIN_MS, cursos: rels }, null, 1));
  const tot = rels.reduce((s, r) => s + r.linhas.filter((l) => l.estado === 'trocado').length, 0);
  log(`[desengasgo] fim: ${tot} referência(s) trocada(s) em ${rels.length} curso(s)${DRY ? '' : `; relatório ${RELATORIO}`}`);
}

main().then(() => process.exit(0), (e) => {
  console.error(`[desengasgo] erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
