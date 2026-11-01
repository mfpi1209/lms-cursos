/**
 * Revisão final (Fable): aplica nos RASCUNHOS dos 14 cursos atuais as correções aprovadas em
 * `docs/qa/revisao-final/spec.json` (gerado do bloco JSON de `revisao-fable.md`): um ajuste fino por vídeo
 * (plano inteiro = drop; frase do começo/fim = cut first/last; frase do meio = skip), a reação sem a interjeição,
 * a emenda de uma frase no vídeo próprio de uma pergunta, os textos de tela, o cartão do fim e a ordem da
 * atividade. Montagem local (ffmpeg), custo 0. Não publica.
 *
 *   MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0 ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/revisao-final.ts [--dry-run] [--skip-videos] [--skip-text] [--only C04·A2·v03,…]
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authoring, getDb, media } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import { keptWordRange, sentenceSpans, type AdjustRequest } from '@lms/media';
import { ffprobe, normalizeLoudnessInPlace, runFfmpeg, wordsFromAlignment, type CharAlignment } from '@lms/media/compose';
import { adjustScene, loadSceneAdjust, trimReactionOpener } from '../../adjust';
import { readAsset, storeGeneratedAsset } from '../../media';
import { storeCaptions } from '../../narration';

const COURSES = ['crs_99hpdsc8w88osiuh', 'crs_arbeohlw3xp5v3zx', 'crs_hd4jnnpx3oj0xf14', 'crs_4z17p0m6d43qxmmo', 'crs_4tj8a3q3g9gudgb7', 'crs_b8zeh4b2gguseghq', 'crs_bmf11akamtxoti28', 'crs_8g0csi2hflfztfge', 'crs_gjn468p3y6hwua4f', 'crs_q52zsimeeahpa9bq', 'crs_u4nfw88a4n2n0ubv', 'crs_5vccpfypr6fmxojb', 'crs_gujuaiykqcsl2n31', 'crs_hvvgkvtd1rb2um0l'];
const ROOT = new URL('../../../../../', import.meta.url).pathname;
const LOG = `${ROOT}docs/qa/revisao-final/aplicado.log`;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? new Set(args[i + 1]!.split(',')) : null;
})();

type Opt = { feedback?: string; quality?: 'strong' | 'ok' | 'weak'; label?: string; scoreLike?: string };
type Spec = {
  videos: Record<string, { itens: string[]; palavras: string[]; teaser?: string }>;
  reacoes: Record<string, { itens: string[]; palavras: string }>;
  escolhas: Record<string, { itens: string[]; prompt?: string; opcoes: Record<string, Opt> }>;
  fins: Record<string, { itens: string[]; bullets: string[] }>;
  ordem: Record<string, { itens: string[]; mover: string; depois: string; antes: string }>;
  emenda: Record<string, { itens: string[]; palavras: string }>;
};
const spec = JSON.parse(readFileSync(`${ROOT}docs/qa/revisao-final/spec.json`, 'utf8')) as Spec;

const log = (line: string) => {
  console.log(line);
  if (!DRY) appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
};
const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const plain = (d: unknown): string[] => ((d as { content?: Array<{ content?: Array<{ text?: string }> }> } | undefined)?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? '').join(''));

async function resolve(code: string) {
  const [c, a, node] = code.split('·') as [string, string, string];
  const courseId = COURSES[Number(c.slice(1)) - 1]!;
  const d = (await authoring.getDraft(getDb(), courseId))!;
  const lesson = (d.document as CourseDocument).modules.flatMap((m) => m.lessons)[Number(a.slice(1)) - 1]!;
  return { courseId, lessonId: lesson.id, nodeId: node };
}

async function saveWithRetry(courseId: string, note: string, edit: (doc: CourseDocument) => boolean) {
  const db = getDb();
  for (let attempt = 1; attempt <= 6; attempt++) {
    const d = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d.document) as CourseDocument;
    if (!edit(doc)) return false;
    try {
      await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note });
      return true;
    } catch (e) {
      if (attempt === 6) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Vídeos dirigidos: frase → mecanismo (drop / cut first / cut last / skip)                  */
/* ------------------------------------------------------------------ */

type Words = Array<{ text: string; start: number; end: number }>;

/** índices de palavra de um trecho dentro da gravação do plano */
function findPhrase(words: ReadonlyArray<{ text: string }>, phrase: string): [number, number][] {
  const want = phrase.split(/\s+/).map(norm).filter(Boolean);
  const have = words.map((w) => norm(w.text));
  const hits: [number, number][] = [];
  for (let i = 0; i + want.length <= have.length; i++) if (want.every((t, j) => have[i + j] === t)) hits.push([i, i + want.length - 1]);
  return hits;
}

type Plan = { req: AdjustRequest; notes: string[]; pending: string[] };

async function planVideo(code: string, v: Spec['videos'][string]): Promise<Plan> {
  const t = await resolve(code);
  const ctx = await loadSceneAdjust(t.courseId, t.lessonId, t.nodeId);
  const cur = ctx.current;
  const req: AdjustRequest = {};
  const notes: string[] = [];
  const pending: string[] = [];
  const drop: string[] = [];
  const cut: NonNullable<AdjustRequest['cut']> = [];
  const skip: NonNullable<AdjustRequest['skip']> = [];
  for (const phrase of v.palavras) {
    let done = false;
    let placed = false;
    for (const s of ctx.base.shots) {
      const u = ctx.input.units!.find((x) => x.shotIds.length === 1 && x.shotIds[0] === s.id);
      const words = u ? ctx.wordsByUnit.get(u.id) : undefined;
      if (!words?.length) continue;
      for (const [i, j] of findPhrase(words, phrase)) {
        const spans = sentenceSpans(words);
        const first = spans.findIndex(([a]) => a === i);
        const last = spans.findIndex(([, b]) => b === j);
        if (first < 0 || last < 0 || last < first) {
          pending.push(`"${phrase}" no plano ${s.id}: não começa/termina em fronteira de frase (corte no meio de frase não é aplicado)`);
          placed = true;
          break;
        }
        const c = cur.cut[s.id] ?? { first: 0, last: 0 };
        const range = keptWordRange(words, c.first, c.last, c.lead ?? 0);
        const alreadyOut = cur.drop.includes(s.id) || !range || j < range[0] || i > range[1] || (c.skip ?? []).some(([a, b]) => a <= i && b >= j);
        if (alreadyOut) {
          done = true;
          placed = true;
          break;
        }
        const firstKept = spans.findIndex(([, b]) => b >= range![0]);
        const lastKept = spans.length - 1 - c.last;
        const n = last - first + 1;
        if (first <= firstKept && last >= lastKept) {
          drop.push(s.id);
          notes.push(`${s.id}: plano inteiro (tira "${phrase}")`);
        } else if (first <= firstKept) {
          for (let k = 0; k < n; k++) cut.push({ shotId: s.id, side: 'first' });
          notes.push(`${s.id}: −${n} frase(s) do começo ("${phrase}")`);
        } else if (last >= lastKept) {
          for (let k = 0; k < n; k++) cut.push({ shotId: s.id, side: 'last' });
          notes.push(`${s.id}: −${n} frase(s) do fim ("${phrase}")`);
        } else {
          skip.push({ shotId: s.id, from: i, to: j });
          notes.push(`${s.id}: frase inteira do meio [${i}-${j}] ("${phrase}")`);
        }
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) pending.push(`"${phrase}": não encontrada nos planos`);
    if (done) notes.push(`"${phrase}": já aplicado`);
  }
  if (drop.length) req.drop = [...new Set(drop)];
  if (cut.length) req.cut = cut;
  if (skip.length) req.skip = skip;
  if (v.teaser !== undefined && v.teaser !== cur.teaser) req.teaser = v.teaser;
  return { req, notes, pending };
}

async function applyVideos() {
  let ok = 0;
  let fail = 0;
  for (const [code, v] of Object.entries(spec.videos)) {
    if (ONLY && !ONLY.has(code)) continue;
    try {
      const p = await planVideo(code, v);
      for (const x of p.pending) log(`[vídeo] ${code}: PENDENTE — ${x}`);
      if (!Object.keys(p.req).length) {
        log(`[vídeo] ${code}: já aplicado${p.pending.length ? ' (restante pendente)' : ''}`);
        continue;
      }
      const desc = `${JSON.stringify(p.req)} (${p.notes.join('; ')})`;
      if (DRY) {
        log(`[vídeo] ${code} itens ${v.itens.join(',')}: ${desc}`);
        continue;
      }
      const t = await resolve(code);
      const out = await adjustScene({ ...t, request: p.req });
      log(`[vídeo] ${code} itens ${v.itens.join(',')}: ${out.durationSeconds.toFixed(1)} s · ${desc} · fala: ${out.transcript}`);
      ok++;
    } catch (e) {
      fail++;
      log(`[vídeo] ${code}: FALHOU (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  log(`[vídeo] ${ok} montado(s), ${fail} falha(s)`);
}

async function applyReactions() {
  for (const [key, r] of Object.entries(spec.reacoes)) {
    if (ONLY && !ONLY.has(key)) continue;
    const [code, optId] = key.split('~') as [string, string];
    const t = await resolve(code);
    try {
      const probe = await trimReactionOpener({ courseId: t.courseId, lessonId: t.lessonId, choiceId: t.nodeId, optionId: optId, dryRun: true });
      if (norm(probe.opener) !== norm(r.palavras)) {
        log(`[reação] ${key}: PENDENTE — a interjeição é "${probe.opener}", não "${r.palavras}"`);
        continue;
      }
      if (DRY) {
        log(`[reação] ${key}: sem "${probe.opener}" → "${probe.text}"`);
        continue;
      }
      const res = await trimReactionOpener({ courseId: t.courseId, lessonId: t.lessonId, choiceId: t.nodeId, optionId: optId });
      log(`[reação] ${key} itens ${r.itens.join(',')}: sem "${res.opener}" → "${res.text}" (asset ${res.assetId})`);
    } catch (e) {
      log(`[reação] ${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vídeo próprio da pergunta (sem planos): tira uma frase inteira do meio, com o tempo de cada palavra  */
/* ------------------------------------------------------------------ */

async function applyEmendas() {
  for (const [code, e] of Object.entries(spec.emenda)) {
    if (ONLY && !ONLY.has(code)) continue;
    const t = await resolve(code);
    const db = getDb();
    const draft = (await authoring.getDraft(db, t.courseId))!;
    const lesson = (draft.document as CourseDocument).modules.flatMap((m) => m.lessons).find((l) => l.id === t.lessonId)!;
    const node = lesson.graph.nodes.find((n) => n.id === t.nodeId) as unknown as { media?: { assetId: string; transcript?: string; generatedFrom?: { jobId?: string } }; narration?: string };
    const m = node?.media;
    if (!m?.assetId) {
      log(`[emenda] ${code}: sem vídeo`);
      continue;
    }
    const transcript = m.transcript ?? node.narration ?? '';
    if (!transcript.includes(e.palavras)) {
      log(`[emenda] ${code}: já aplicado (a frase não está mais na fala)`);
      continue;
    }
    const job = m.generatedFrom?.jobId ? await media.getJob(db, m.generatedFrom.jobId) : null;
    const al = (job?.input as { alignment?: CharAlignment } | undefined)?.alignment;
    const script = String((job?.input as { script?: string } | undefined)?.script ?? '');
    if (!al?.characters?.length || script.replace(/\s+/g, ' ') !== transcript.replace(/\s+/g, ' ') && !script.includes(e.palavras)) {
      log(`[emenda] ${code}: PENDENTE — o vídeo não tem o tempo de cada palavra guardado`);
      continue;
    }
    const words = wordsFromAlignment(al) as Words;
    const hits = findPhrase(words, e.palavras);
    if (hits.length !== 1) {
      log(`[emenda] ${code}: PENDENTE — frase encontrada ${hits.length}x`);
      continue;
    }
    const [a, b] = hits[0]!;
    const spans = sentenceSpans(words);
    if (!spans.some(([x]) => x === a) || !spans.some(([, y]) => y === b) || a === 0 || b === words.length - 1) {
      log(`[emenda] ${code}: PENDENTE — não é uma frase inteira entre outras duas`);
      continue;
    }
    // mesmas margens do ajuste fino (adjust.ts): respiração antes do trecho tirado e antes do que volta
    const t1End = Math.max(words[a - 1]!.end + 0.06, Math.min(words[a - 1]!.end + 0.3, words[a]!.start - 0.02));
    const t2Start = Math.max(words[b]!.end + 0.02, words[b + 1]!.start - 0.2);
    const newTranscript = transcript.replace(`${e.palavras} `, '').replace(e.palavras, '');
    if (DRY) {
      log(`[emenda] ${code}: tira "${e.palavras}" (palavras ${a}-${b}); trechos 0–${t1End.toFixed(2)} s + ${t2Start.toFixed(2)} s–fim; fala: ${newTranscript}`);
      continue;
    }
    const asset = (await media.getAsset(db, m.assetId))!;
    const dir = await mkdtemp(path.join(tmpdir(), 'lms-emenda-'));
    try {
      const src = path.join(dir, 'in.mp4');
      await writeFile(src, await readAsset(asset.storageKey));
      const total = (await ffprobe(src)).durationSeconds;
      const times: Array<[number, number]> = [[0, t1End], [t2Start, total]];
      const parts: string[] = [];
      const durs: number[] = [];
      for (let i = 0; i < 2; i++) {
        const part = path.join(dir, `seg-${i}.mp4`);
        await runFfmpeg(['-ss', times[i]![0].toFixed(3), '-to', times[i]![1].toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', part]);
        parts.push(part);
        durs.push((await ffprobe(part)).durationSeconds);
      }
      const XF = 0.18;
      const off = durs[0]! - XF;
      const k = (XF / 0.08).toFixed(3);
      const w = `clip((P-0.5)*${k}+0.5,0,1)`;
      const out = path.join(dir, 'out.mp4');
      await runFfmpeg([
        ...parts.flatMap((p) => ['-i', p]),
        '-filter_complex', `[0:v][1:v]xfade=transition=custom:expr='A*${w}+B*(1-${w})':duration=${XF}:offset=${off.toFixed(3)}[v1];[0:a][1:a]acrossfade=d=${XF}[a1]`,
        '-map', '[v1]', '-map', '[a1]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', out,
      ]);
      const cleaned = !!((asset.metadata ?? {}) as { loudness?: { voiceClean?: string } }).loudness?.voiceClean;
      const loudness = await normalizeLoudnessInPlace(out, undefined, { clean: !cleaned });
      const seconds = (await ffprobe(out)).durationSeconds;
      const createdBy = asset.createdBy ?? draft.updatedBy;
      const stored = await storeGeneratedAsset({ workspaceId: asset.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(out)), durationSeconds: seconds, transcript: newTranscript, createdBy, metadata: { loudness: { ...loudness, from: asset.id } } });
      // legendas: palavras que ficam, no tempo do vídeo novo
      const shift2 = off - t2Start;
      const kept = words.flatMap((x, i) => (i >= a && i <= b ? [] : [{ ...x, start: Math.max(0, i > b ? x.start + shift2 : x.start), end: Math.max(0, i > b ? x.end + shift2 : x.end) }]));
      const cap = await storeCaptions({ workspaceId: asset.workspaceId, createdBy }, kept, false);
      await saveWithRetry(t.courseId, `emenda ${t.lessonId}/${t.nodeId}: sem "${e.palavras}"`, (doc) => {
        const n = doc.modules.flatMap((mm) => mm.lessons).find((l) => l.id === t.lessonId)?.graph.nodes.find((x) => x.id === t.nodeId) as unknown as { media?: Record<string, unknown>; narration?: string } | undefined;
        if (!n?.media) return false;
        n.narration = newTranscript;
        n.media = { ...n.media, assetId: stored.id, transcript: newTranscript, stale: false, ...(cap ? { captions: { assetId: cap.assetId, lang: 'pt-BR', format: 'vtt' } } : {}), emenda: { removed: e.palavras, from: asset.id } };
        return true;
      });
      log(`[emenda] ${code} itens ${e.itens.join(',')}: ${seconds.toFixed(1)} s (era ${total.toFixed(1)} s) · asset ${stored.id} · fala: ${newTranscript}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Textos de tela, cartão do fim, ordem                                                       */
/* ------------------------------------------------------------------ */

async function applyText() {
  const videoNodes = new Set(Object.keys(spec.videos));
  for (let ci = 0; ci < COURSES.length; ci++) {
    const courseId = COURSES[ci]!;
    const cc = `C${String(ci + 1).padStart(2, '0')}`;
    let changes: string[] = [];
    const ok = await saveWithRetry(courseId, `revisão final: textos`, (doc) => {
      changes = [];
      doc.modules.flatMap((m) => m.lessons).forEach((l, li) => {
        const aa = `${cc}·A${li + 1}`;
        const nodes = l.graph.nodes as unknown as Array<Record<string, any>>;
        for (const n of nodes) {
          const code = `${aa}·${n.id}`;
          if (ONLY && !ONLY.has(code)) continue;
          // fala da cena = soma dos planos; senão a cena aparece "desatualizada"
          if (videoNodes.has(code) && n.direction?.shots?.length && n.media?.adjust) {
            const joined = n.direction.shots.map((s: { line: string }) => s.line.trim()).join(' ');
            if ((n.narration ?? '') !== joined) {
              n.narration = joined;
              changes.push(`${code}: fala da cena = planos`);
            }
          }
          if (n.type === 'choice') {
            // a chamada da pergunta = final falado do vídeo anterior (corte na chamada)
            const preds = [...new Set(l.graph.edges.filter((e) => e.to === n.id).map((e) => e.from))];
            const host = preds.length === 1 ? nodes.find((x) => x.id === preds[0]) : undefined;
            const callShot = host?.direction?.shots?.find((s: { id: string }) => s.id === 'chamada');
            if (host && videoNodes.has(`${aa}·${host.id}`) && n.bridge?.call && callShot && n.bridge.call !== callShot.line) {
              n.bridge = { ...n.bridge, call: callShot.line };
              changes.push(`${code}: chamada = "${callShot.line}"`);
            }
            const c = spec.escolhas[code];
            if (!c) continue;
            if (c.prompt !== undefined && JSON.stringify(plain(n.prompt)) !== JSON.stringify([c.prompt])) {
              n.prompt = { type: 'doc', content: [para(c.prompt)] };
              changes.push(`${code}: situação (${c.itens.join(',')})`);
            }
            for (const [optId, os] of Object.entries(c.opcoes)) {
              const o = (n.options as Array<Record<string, any>>).find((x) => x.id === optId);
              if (!o) throw new Error(`${code}: opção ${optId} não existe`);
              if (os.label && o.label !== os.label) {
                o.label = os.label;
                changes.push(`${code}~${optId}: opção = ${os.label}`);
              }
              if (os.feedback && plain(o.feedback).join('\n') !== os.feedback) {
                o.feedback = { type: 'doc', content: [para(os.feedback)] };
                changes.push(`${code}~${optId}: retorno`);
              }
              if (os.quality && o.quality !== os.quality) {
                o.quality = os.quality;
                changes.push(`${code}~${optId}: classificação = ${os.quality}`);
              }
              if (os.scoreLike) {
                const like = l.graph.edges.find((e) => e.from === n.id && e.optionId === os.scoreLike) as Record<string, any> | undefined;
                const mine = l.graph.edges.find((e) => e.from === n.id && e.optionId === optId) as Record<string, any> | undefined;
                if (like && mine && JSON.stringify(mine.effects ?? null) !== JSON.stringify(like.effects ?? null)) {
                  if (like.effects) mine.effects = structuredClone(like.effects);
                  else delete mine.effects;
                  changes.push(`${code}~${optId}: pontuação igual à da opção ${os.scoreLike}`);
                }
              }
            }
          }
          if (n.type === 'end') {
            const f = spec.fins[aa];
            if (f) {
              const items = f.bullets.map((b) => ({ type: 'listItem', content: [para(b)] }));
              const summary = { type: 'doc', content: [para('O que você levou'), { type: 'bulletList', content: items }] };
              if (JSON.stringify(n.summary) !== JSON.stringify(summary)) {
                n.summary = summary;
                changes.push(`${code}: cartão do fim (${f.itens.join(',')})`);
              }
              const rc = (n.recap as Array<Record<string, any>> | undefined)?.find((r) => r.id === 'o_que_levou');
              if (rc && rc.text !== f.bullets.join('\n')) {
                rc.text = f.bullets.join('\n');
                changes.push(`${code}: recap "o que você levou"`);
              }
            }
          }
        }
        // ordem: a atividade passa para depois da última pergunta
        const o = spec.ordem[aa];
        if (o) {
          const edges = l.graph.edges as unknown as Array<Record<string, any>>;
          const afterId = o.depois;
          const alreadyMoved = edges.filter((e) => e.from === afterId).every((e) => e.to === o.mover) && edges.some((e) => e.from === o.mover && e.to === o.antes);
          if (!alreadyMoved) {
            const next = edges.find((e) => e.from === o.mover)!.to as string; // para onde a atividade levava (v21)
            for (const e of edges) {
              if (e.to === o.mover) e.to = next; // quem chegava na atividade vai direto ao próximo
              else if (e.from === afterId && e.to === o.antes) e.to = o.mover; // a última pergunta leva à atividade
            }
            edges.find((e) => e.from === o.mover)!.to = o.antes; // a atividade leva ao fim
            // posições do mapa: nova ordem
            const order: string[] = [];
            let cur: string | undefined = l.graph.startNodeId as string;
            const seen = new Set<string>();
            while (cur && !seen.has(cur)) {
              seen.add(cur);
              order.push(cur);
              cur = edges.find((e) => e.from === cur)?.to;
            }
            const pos = (l.graph as any).layout?.positions as Record<string, { x: number; y: number }> | undefined;
            if (pos) order.forEach((id, i) => { if (pos[id]) pos[id] = { ...pos[id]!, y: i * 180 }; });
            changes.push(`${aa}: ${o.mover} movida para depois de ${afterId} (ordem ${order.join(' → ')})`);
          }
        }
      });
      return changes.length > 0 && !DRY;
    });
    if (!changes.length) continue;
    for (const ch of changes) log(`[texto] ${ch}`);
    if (DRY) continue;
    if (ok) log(`[texto] ${cc} ${courseId}: rascunho salvo`);
  }
}

async function main() {
  if (!args.includes('--skip-videos')) {
    await applyVideos();
    await applyReactions();
    await applyEmendas();
  }
  if (!args.includes('--skip-text')) await applyText();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[revisao-final] erro: ${e instanceof Error ? e.stack : String(e)}`);
    process.exit(1);
  },
);
