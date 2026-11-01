/**
 * Mapa de tempos e remendos (revisão editorial, SEM regravar): aplica nos RASCUNHOS o plano consolidado
 * `docs/qa/remendos/spec.json` — um ajuste fino por vídeo (tirar plano, frase do começo/fim, oração de
 * abertura, trecho do meio, cartão), o corte de "Ela fica salva no seu roteiro." nos avisos de atividade,
 * reações desligadas (fica o retorno escrito) e os textos de tela (situação, opções, retornos, atividade).
 * Montagem local (ffmpeg), custo 0. Não publica.
 *
 *   MEDIA_SIMULATION=1 ALLOW_PAID_PROVIDERS=0 ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/oneoff/remendos-mapa.ts [--dry-run] [--only C01·A1·v00,…] [--skip-videos] [--skip-text]
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { authoring, getDb } from '@lms/db';
import type { CourseDocument } from '@lms/course-schema';
import type { AdjustRequest } from '@lms/media';
import { adjustScene, loadSceneAdjust, trimReactionOpener } from '../../adjust';

const COURSES = ['crs_99hpdsc8w88osiuh', 'crs_arbeohlw3xp5v3zx', 'crs_hd4jnnpx3oj0xf14', 'crs_4z17p0m6d43qxmmo', 'crs_4tj8a3q3g9gudgb7', 'crs_b8zeh4b2gguseghq', 'crs_bmf11akamtxoti28', 'crs_8g0csi2hflfztfge', 'crs_gjn468p3y6hwua4f', 'crs_q52zsimeeahpa9bq', 'crs_u4nfw88a4n2n0ubv', 'crs_5vccpfypr6fmxojb', 'crs_gujuaiykqcsl2n31', 'crs_hvvgkvtd1rb2um0l'];
const ROOT = new URL('../../../../../', import.meta.url).pathname;
const LOG = `${ROOT}docs/qa/remendos/aplicado.log`;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? new Set(args[i + 1]!.split(',')) : null;
})();

type VideoSpec = { items: string[]; drop: string[]; cutFirst: Record<string, number>; cutLast: Record<string, number>; lead: Record<string, number>; skip: Record<string, string[]>; teaser?: string };
type OptSpec = { label?: string; feedback?: string; quality?: 'strong' | 'ok' | 'weak'; disableReaction?: boolean; trimOpener?: boolean; scoreLike?: string };
type ChoiceSpec = { items: string[]; situacao?: string; options?: Record<string, OptSpec>; feedbackAppendAll?: string };
const spec = JSON.parse(readFileSync(`${ROOT}docs/qa/remendos/spec.json`, 'utf8')) as { videos: Record<string, VideoSpec>; choices: Record<string, ChoiceSpec>; reflections: Record<string, { items: string[]; prompt: string }> };

const log = (line: string) => {
  console.log(line);
  if (!DRY) appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
};
const norm = (t: string) => t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const plain = (d: unknown): string[] => ((d as { content?: Array<{ content?: Array<{ text?: string }> }> } | undefined)?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? '').join(''));

/** "C01·A2·v02" → curso, aula e nó no rascunho */
async function resolve(code: string) {
  const [c, a, node] = code.split('·') as [string, string, string];
  const courseId = COURSES[Number(c.slice(1)) - 1]!;
  const d = (await authoring.getDraft(getDb(), courseId))!;
  const lessons = (d.document as CourseDocument).modules.flatMap((m) => m.lessons);
  const lesson = lessons[Number(a.slice(1)) - 1]!;
  return { courseId, lessonId: lesson.id, nodeId: node };
}

/** trecho do meio → índices de palavra na gravação do plano */
function findPhrase(words: Array<{ text: string }>, phrase: string): [number, number] | null {
  const want = phrase.split(/\s+/).map(norm).filter(Boolean);
  const have = words.map((w) => norm(w.text));
  for (let i = 0; i + want.length <= have.length; i++) if (want.every((t, j) => have[i + j] === t)) return [i, i + want.length - 1];
  return null;
}

async function videoRequest(code: string, v: VideoSpec | null): Promise<{ target: Awaited<ReturnType<typeof resolve>>; req: AdjustRequest; notes: string[] } | null> {
  const target = await resolve(code);
  const ctx = await loadSceneAdjust(target.courseId, target.lessonId, target.nodeId);
  const notes: string[] = [];
  const req: AdjustRequest = {};
  const shotWords = (id: string) => {
    const u = ctx.input.units!.find((x) => x.shotIds.length === 1 && x.shotIds[0] === id);
    return u ? ctx.wordsByUnit.get(u.id) : undefined;
  };
  const cur = ctx.current;
  const drop = (v?.drop ?? []).filter((id) => !cur.drop.includes(id));
  if (drop.length) req.drop = drop;
  const cut: NonNullable<AdjustRequest['cut']> = [];
  const want = (id: string, side: 'first' | 'last', n: number) => {
    const have = cur.cut[id]?.[side] ?? 0;
    for (let i = have; i < n; i++) cut.push({ shotId: id, side });
  };
  for (const [id, n] of Object.entries(v?.cutFirst ?? {})) want(id, 'first', n);
  for (const [id, n] of Object.entries(v?.cutLast ?? {})) want(id, 'last', n);
  // aviso da atividade: fica "No fim desta aula, tem uma missão para você: …"; sai "Ela fica salva no seu roteiro."
  const missao = shotWords('missao');
  if (missao && /salva no seu roteiro\.?$/i.test(missao.map((w) => w.text).join(' ')) && !cur.drop.includes('missao')) {
    want('missao', 'last', 1);
    notes.push('missao: −"Ela fica salva no seu roteiro."');
  }
  if (cut.length) req.cut = cut;
  const lead = Object.entries(v?.lead ?? {}).filter(([id, n]) => (cur.cut[id]?.lead ?? 0) !== n);
  if (lead.length) req.trimLead = lead.map(([shotId, words]) => ({ shotId, words }));
  const skip: NonNullable<AdjustRequest['skip']> = [];
  for (const [id, phrases] of Object.entries(v?.skip ?? {})) {
    const ws = shotWords(id);
    for (const p of phrases) {
      const r = ws ? findPhrase(ws, p) : null;
      if (!r) throw new Error(`${code} ${id}: trecho não encontrado na gravação: "${p}"`);
      if (!(cur.cut[id]?.skip ?? []).some(([a, b]) => a === r[0] && b === r[1])) skip.push({ shotId: id, from: r[0], to: r[1] });
    }
  }
  if (skip.length) req.skip = skip;
  if (v?.teaser !== undefined && v.teaser !== cur.teaser) req.teaser = v.teaser;
  // remontar o que já foi aplicado (mesmo estado): reenvia o cartão atual
  if (!Object.keys(req).length && args.includes('--rerender')) req.teaser = cur.teaser !== undefined ? cur.teaser : (ctx.input.nextQuestion ?? null);
  return Object.keys(req).length ? { target, req, notes } : null;
}

async function applyVideos() {
  const codes = new Set(Object.keys(spec.videos));
  // vídeos com o aviso de atividade e nada mais no mapa: só o corte do "Ela fica salva…"
  for (let ci = 0; ci < COURSES.length; ci++) {
    const d = (await authoring.getDraft(getDb(), COURSES[ci]!))!;
    (d.document as CourseDocument).modules.flatMap((m) => m.lessons).forEach((l, li) => {
      for (const n of l.graph.nodes as Array<{ id: string; direction?: { shots: Array<{ id: string }> } }>) if (n.direction?.shots.some((s) => s.id === 'missao')) codes.add(`C${String(ci + 1).padStart(2, '0')}·A${li + 1}·${n.id}`);
    });
  }
  let ok = 0;
  let fail = 0;
  for (const code of [...codes].sort()) {
    if (ONLY && !ONLY.has(code)) continue;
    try {
      const r = await videoRequest(code, spec.videos[code] ?? null);
      if (!r) {
        log(`[vídeo] ${code}: já aplicado`);
        continue;
      }
      const items = spec.videos[code]?.items.join(',') ?? '-';
      const desc = `${JSON.stringify(r.req)}${r.notes.length ? ` (${r.notes.join('; ')})` : ''}`;
      if (DRY) {
        log(`[vídeo] ${code} itens ${items}: ${desc}`);
        continue;
      }
      const out = await adjustScene({ ...r.target, request: r.req });
      log(`[vídeo] ${code} itens ${items}: ${out.durationSeconds.toFixed(1)} s · ${desc} · fala: ${out.transcript}`);
      ok++;
    } catch (e) {
      fail++;
      log(`[vídeo] ${code}: FALHOU (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  log(`[vídeo] ${ok} montado(s), ${fail} falha(s)`);
}

async function applyText() {
  const db = getDb();
  // reação com "Quase lá." no começo que passa a ser resposta adequada: corta a interjeição (alinhamento por letra)
  for (const [code, c] of Object.entries(spec.choices)) {
    for (const [optId, o] of Object.entries(c.options ?? {})) {
      if (!o.trimOpener || (ONLY && !ONLY.has(code))) continue;
      const t = await resolve(code);
      try {
        const r = await trimReactionOpener({ courseId: t.courseId, lessonId: t.lessonId, choiceId: t.nodeId, optionId: optId, dryRun: DRY });
        log(`[reação] ${code}~${optId}: sem "${r.opener}" → "${r.text}"`);
      } catch (e) {
        log(`[reação] ${code}~${optId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  for (let ci = 0; ci < COURSES.length; ci++) {
    const courseId = COURSES[ci]!;
    const cc = `C${String(ci + 1).padStart(2, '0')}`;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const d = (await authoring.getDraft(db, courseId))!;
      const doc = structuredClone(d.document) as CourseDocument;
      const changes: string[] = [];
      doc.modules.flatMap((m) => m.lessons).forEach((l, li) => {
        const aa = `${cc}·A${li + 1}`;
        const nodes = l.graph.nodes as unknown as Array<Record<string, any>>;
        for (const n of nodes) {
          const code = `${aa}·${n.id}`;
          // fala da cena = soma dos planos (a direção montada pelo ajuste); senão a cena aparece "desatualizada"
          if (n.direction?.shots?.length && n.media?.adjust) {
            const joined = n.direction.shots.map((s: { line: string }) => s.line.trim()).join(' ');
            if ((n.narration ?? '') !== joined) {
              n.narration = joined;
              changes.push(`${code}: fala da cena = planos`);
            }
          }
          if (n.type === 'choice') {
            // chamada encurtada no vídeo anterior: a chamada guardada acompanha o que a instrutora fala
            const preds = [...new Set(l.graph.edges.filter((e) => e.to === n.id).map((e) => e.from))];
            const host = preds.length === 1 ? nodes.find((x) => x.id === preds[0]) : undefined;
            const callShot = host?.direction?.shots?.find((s: { id: string }) => s.id === 'chamada');
            if (n.bridge?.call && callShot && host?.media?.adjust?.cut?.chamada?.first && n.bridge.call !== callShot.line) {
              n.bridge = { ...n.bridge, call: callShot.line };
              changes.push(`${code}: chamada = "${callShot.line}"`);
            }
            const c = spec.choices[code];
            if (!c) continue;
            if (c.situacao) {
              const ps = plain(n.prompt);
              const question = ps[ps.length - 1] ?? n.title;
              const next = { type: 'doc', content: [para(c.situacao), para(question)] };
              if (JSON.stringify(next) !== JSON.stringify(n.prompt)) {
                n.prompt = next;
                changes.push(`${code}: situação (itens ${c.items.join(',')})`);
              }
            }
            for (const o of n.options as Array<Record<string, any>>) {
              const os = c.options?.[o.id];
              if (c.feedbackAppendAll) {
                const fb = plain(o.feedback);
                if (!fb.some((p) => p === c.feedbackAppendAll)) {
                  o.feedback = { type: 'doc', content: [...((o.feedback?.content as unknown[]) ?? []), para(c.feedbackAppendAll)] };
                  changes.push(`${code}~${o.id}: retorno + complemento (itens ${c.items.join(',')})`);
                }
              }
              if (!os) continue;
              if (os.label && o.label !== os.label) {
                o.label = os.label;
                changes.push(`${code}~${o.id}: opção = ${os.label}`);
              }
              if (os.feedback && plain(o.feedback).join(' ') !== os.feedback) {
                o.feedback = { type: 'doc', content: [para(os.feedback)] };
                changes.push(`${code}~${o.id}: retorno escrito`);
              }
              if (os.quality && o.quality !== os.quality) {
                o.quality = os.quality;
                changes.push(`${code}~${o.id}: classificação = ${os.quality}`);
              }
              if (os.disableReaction && o.reaction && !o.reaction.disabled) {
                o.reaction = { ...o.reaction, disabled: true };
                changes.push(`${code}~${o.id}: reação em vídeo desligada (fica o retorno escrito)`);
              }
              if (os.scoreLike) {
                const like = l.graph.edges.find((e) => e.from === n.id && e.optionId === os.scoreLike);
                const mine = l.graph.edges.find((e) => e.from === n.id && e.optionId === o.id) as Record<string, any> | undefined;
                if (like && mine && JSON.stringify(mine.effects ?? null) !== JSON.stringify((like as Record<string, any>).effects ?? null)) {
                  if ((like as Record<string, any>).effects) mine.effects = structuredClone((like as Record<string, any>).effects);
                  else delete mine.effects;
                  changes.push(`${code}~${o.id}: pontuação igual à da opção ${os.scoreLike}`);
                }
              }
            }
            // opção que passa a ser adequada (trimOpener + strong): pontuação igual à da melhor opção
            for (const [optId, os] of Object.entries(c.options ?? {})) {
              if (os.quality !== 'strong' || os.scoreLike) continue;
              const best = (n.options as Array<Record<string, any>>).find((o) => o.quality === 'strong' && o.id !== optId);
              const like = best ? (l.graph.edges.find((e) => e.from === n.id && e.optionId === best.id) as Record<string, any> | undefined) : undefined;
              const mine = l.graph.edges.find((e) => e.from === n.id && e.optionId === optId) as Record<string, any> | undefined;
              if (like && mine && JSON.stringify(mine.effects ?? null) !== JSON.stringify(like.effects ?? null)) {
                if (like.effects) mine.effects = structuredClone(like.effects);
                else delete mine.effects;
                changes.push(`${code}~${optId}: pontuação igual à da opção ${best!.id}`);
              }
            }
          }
          if (n.type === 'reflection') {
            const r = spec.reflections[code];
            if (r && plain(n.prompt).join(' ') !== r.prompt) {
              n.prompt = { type: 'doc', content: [para(r.prompt)] };
              changes.push(`${code}: texto de apoio da atividade (itens ${r.items.join(',')})`);
            }
          }
        }
      });
      if (!changes.length) break;
      for (const ch of changes) log(`[texto] ${ch}`);
      if (DRY) break;
      try {
        const saved = await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note: `mapa de remendos: ${changes.length} ajuste(s) de texto` });
        log(`[texto] ${cc} ${courseId}: rascunho ${d.revision} → ${saved.revision}`);
        break;
      } catch (e) {
        if (attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
}

async function main() {
  if (!args.includes('--skip-videos')) await applyVideos();
  if (!args.includes('--skip-text')) await applyText();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`[remendos] erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
