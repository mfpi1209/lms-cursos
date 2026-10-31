/**
 * Ajuste fino SEM REGRAVAR (A17): remonta uma cena dirigida a partir dos clipes já pagos (ffmpeg local,
 * nenhum provedor, custo 0) ou apara a interjeição de abertura de uma reação. Usado pelo job de mídia
 * `input.kind = 'adjust'` (pedido pelo estúdio) e pelos scripts `ajuste-fino.ts` / `aparar-reacoes.ts`.
 *
 * Cena: o estado ACUMULADO fica em `media.adjust` (planos tirados, frases tiradas, cartão); cada pedido soma
 * ao estado atual e a montagem sempre parte do job de origem (`media.generatedFrom.jobId`). Mídia ajustada
 * antes por script (sem `media.adjust`) tem o estado reconstruído do rascunho.
 */
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { authoring, getDb, media, newId, schema } from '@lms/db';
import { SceneDirectionSchema, type CourseDocument, type SceneDirection } from '@lms/course-schema';
import { ADJUST_PROVIDER, adjustOptions, deriveAdjustState, isAdjustJobInput, keptWordRange, mergeAdjust, reactionOpener, validateAdjust, type AdjustJobInput, type AdjustRequest, type AdjustState, type TimedWord } from '@lms/media';
import { ffprobe, normalizeLoudnessInPlace, runFfmpeg, wordsFromAlignment, type CharAlignment } from '@lms/media/compose';
import { fail, readAsset, storeGeneratedAsset } from './media';
import { renderDirectedScene, sceneCaptions, type DirectedInput } from './compose-scene';
import { packWords, storeCaptions, unpackWords, type PackedWords } from './narration';

export const ADJUST_JOB_NOTE = 'Ajuste fino sem regravar (montagem local; nenhum provedor chamado)';
const MAX_ATTEMPTS = 3;
/** job de ajuste em `running` sem atualização há mais tempo que isto: o worker morreu no meio; volta para a fila */
export const ADJUST_STALE_MS = 10 * 60 * 1000;

/** Erro que o autor pode corrigir (mensagem vai para a tela). */
export class AdjustError extends Error {}

type NodeLike = { id: string; type: string; direction?: SceneDirection; media?: Record<string, unknown> & { assetId?: string; generatedFrom?: { jobId?: string }; adjust?: AdjustState } };

function findNode(doc: CourseDocument, lessonId: string, nodeId: string): NodeLike | undefined {
  for (const m of doc.modules) for (const l of m.lessons) if (l.id === lessonId) return l.graph.nodes.find((n) => n.id === nodeId) as unknown as NodeLike | undefined;
  return undefined;
}

async function saveWithRetry(courseId: string, note: string, edit: (doc: CourseDocument) => boolean) {
  const db = getDb();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const d = (await authoring.getDraft(db, courseId))!;
    const doc = structuredClone(d.document) as CourseDocument;
    if (!edit(doc)) return;
    try {
      await authoring.saveDraft(db, { courseId, document: doc, expectedRevision: d.revision, userId: d.updatedBy, origin: 'script', note });
      return;
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/** Contexto da cena: job de origem, direção original, itens e palavras guardadas, estado atual do ajuste. */
export async function loadSceneAdjust(courseId: string, lessonId: string, nodeId: string) {
  const db = getDb();
  const draft = await authoring.getDraft(db, courseId);
  if (!draft) throw new AdjustError('Rascunho não encontrado');
  const node = findNode(draft.document as CourseDocument, lessonId, nodeId);
  const sourceJobId = node?.media?.generatedFrom?.jobId;
  if (!node || !sourceJobId) throw new AdjustError('Esta cena não tem vídeo gerado pela plataforma');
  const job = await media.getJob(db, sourceJobId);
  const input = job ? (structuredClone(job.input) as unknown as DirectedInput) : null;
  if (!job || !input?.direction || !input.units || !input.shots) throw new AdjustError('O ajuste fino só vale para vídeos dirigidos (com planos)');
  if (input.appendOutro) throw new AdjustError('Cena com a vinheta emendada no fim: o ajuste fino ainda não cobre esse caso');
  const base = SceneDirectionSchema.parse(input.direction);
  const wordsByUnit = new Map<string, TimedWord[]>();
  const wordsByShot = new Map<string, TimedWord[]>();
  for (const u of input.units) {
    const ws = unpackWords(input.shots[u.id]?.words as PackedWords | undefined);
    if (!ws?.length) continue;
    wordsByUnit.set(u.id, ws);
    if (u.shotIds.length === 1) wordsByShot.set(u.shotIds[0]!, ws);
  }
  const stored = node.media?.adjust;
  const current: AdjustState = stored ? { drop: stored.drop ?? [], cut: stored.cut ?? {}, ...(stored.teaser !== undefined ? { teaser: stored.teaser } : {}) } : deriveAdjustState(base.shots, node.direction?.shots ?? base.shots, wordsByShot);
  return { draft, node, job, input, base, wordsByUnit, current };
}

/** O que a tela pode oferecer agora (planos, cortes possíveis, cartão atual). */
export async function sceneAdjustOptions(courseId: string, lessonId: string, nodeId: string) {
  const c = await loadSceneAdjust(courseId, lessonId, nodeId);
  return {
    sourceJobId: c.job.id,
    shots: adjustOptions(c.base.shots, c.input.units!, c.wordsByUnit, c.current),
    teaser: c.current.teaser !== undefined ? c.current.teaser : (c.input.nextQuestion ?? null),
    state: c.current,
  };
}

/**
 * Monta a cena com o pedido somado ao estado atual. `out` = só a prévia (nada anexado); senão guarda o
 * vídeo, refaz as legendas e grava no rascunho a mídia nova (com `media.adjust`) e a direção montada.
 */
export async function adjustScene(opts: { courseId: string; lessonId: string; nodeId: string; request: AdjustRequest; out?: string; renew?: () => Promise<unknown> }) {
  const { courseId, lessonId, nodeId, request } = opts;
  const db = getDb();
  const c = await loadSceneAdjust(courseId, lessonId, nodeId);
  const { job, input, base, wordsByUnit, current } = c;
  const err = validateAdjust(base.shots, input.units!, wordsByUnit, current, request);
  if (err) throw new AdjustError(err);
  const next = mergeAdjust(current, request);
  const drop = new Set(next.drop);
  const direction: SceneDirection = { ...base, shots: base.shots.filter((s) => !drop.has(s.id)) };
  input.units = input.units!.filter((u) => !u.shotIds.every((id) => drop.has(id)));
  // o primeiro plano que sobra entra com corte seco (sem transição de entrada)
  if (drop.has(base.shots[0]!.id)) direction.shots[0] = { ...direction.shots[0]!, transitionIn: 'cut' };
  if (next.teaser === null) delete input.nextQuestion;
  else if (typeof next.teaser === 'string') input.nextQuestion = next.teaser;
  if (c.draft.document.branding?.videoPalette) input.videoPalette = c.draft.document.branding.videoPalette;

  const dir = await mkdtemp(path.join(tmpdir(), 'lms-ajuste-'));
  try {
    const clipFiles = new Map<string, string>();
    const lines = new Map<string, string>();
    for (const [shotId, cut] of Object.entries(next.cut)) {
      if (drop.has(shotId) || (!cut.first && !cut.last && !cut.lead)) continue;
      const u = input.units.find((x) => x.shotIds.length === 1 && x.shotIds[0] === shotId && x.kind === 'clip');
      const st = u ? input.shots![u.id] : undefined;
      const words = u ? wordsByUnit.get(u.id) : undefined;
      if (!u || !st?.clipAssetId || !words?.length) throw new AdjustError(`O plano ${shotId} não tem clipe sozinho com palavras guardadas`);
      const range = keptWordRange(words, cut.first, cut.last, cut.lead ?? 0);
      if (!range) throw new AdjustError(`O plano ${shotId} ficaria sem fala`);
      const clip = await media.getAsset(db, st.clipAssetId);
      if (!clip) throw new AdjustError(`Clipe do plano ${shotId} não encontrado`);
      const src = path.join(dir, `src-${u.id}.mp4`);
      await writeFile(src, await readAsset(clip.storageKey));
      const total = (await ffprobe(src)).durationSeconds;
      const [a, b] = range;
      const t0 = cut.first || cut.lead ? Math.max(0, words[a]!.start - 0.12) : 0;
      const t1 = cut.last ? Math.min(total, words[b]!.end + 0.3) : total;
      const trimmed = path.join(dir, `cut-${u.id}.mp4`);
      await runFfmpeg(['-ss', t0.toFixed(3), '-to', t1.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', trimmed]);
      clipFiles.set(u.id, trimmed);
      const kept = words.slice(a, b + 1).map((w) => ({ ...w }));
      // oração de abertura aparada: a fala segue com maiúscula ("o caminho é…" → "O caminho é…")
      if (cut.lead && kept[0]) kept[0].text = kept[0].text.charAt(0).toLocaleUpperCase('pt-BR') + kept[0].text.slice(1);
      st.words = packWords(kept, t0) as never;
      lines.set(shotId, kept.map((w) => w.text).join(' '));
    }
    if (lines.size) direction.shots = direction.shots.map((sh) => (lines.has(sh.id) ? { ...sh, line: lines.get(sh.id)! } : sh));
    input.direction = direction as never;
    await opts.renew?.();
    const scene = await renderDirectedScene(job, input, direction, dir, { clipFiles, ...(opts.renew ? { renew: opts.renew } : {}) });
    const transcript = direction.shots.map((s) => s.line.trim()).join(' ');
    if (opts.out) {
      await copyFile(scene.output, opts.out);
      return { assetId: null, durationSeconds: scene.durationSeconds, state: next, transcript, loudness: scene.loudness };
    }
    const captions = await sceneCaptions(job, direction, scene.timeline, scene.wordSources);
    const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(scene.output)), durationSeconds: scene.durationSeconds, transcript, createdBy: job.createdBy, ...(scene.loudness ? { metadata: { loudness: scene.loudness } } : {}) });
    const summary = [...next.drop.map((x) => `sem ${x}`), ...Object.entries(next.cut).filter(([, v]) => v.first || v.last || v.lead).map(([k, v]) => `${k} −${v.first}/−${v.last} frase(s)${v.lead ? ` −${v.lead} palavra(s) no começo` : ''}`), ...(request.teaser !== undefined ? ['cartão'] : [])].join(', ');
    await saveWithRetry(courseId, `ajuste fino ${lessonId}/${nodeId}: ${summary}`, (doc) => {
      const n = findNode(doc, lessonId, nodeId);
      if (!n) return false;
      // direção do rascunho = a montada (o plano tirado não volta numa gravação futura)
      n.direction = { ...(n.direction ?? base), shots: direction.shots } as SceneDirection;
      n.media = {
        ...(n.media ?? {}),
        assetId: asset.id, kind: 'video', transcript: transcript.slice(0, 20000), stale: false,
        ...(captions?.assetId ? { captions: { assetId: captions.assetId, lang: captions.lang ?? 'pt-BR', format: 'vtt', ...(captions.approx ? { approx: true } : {}) } } : {}),
        adjust: next,
      };
      return true;
    });
    return { assetId: asset.id, durationSeconds: scene.durationSeconds, state: next, transcript, loudness: scene.loudness };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Reaction = { text: string; media?: { kind: string; assetId: string; transcript?: string; captions?: unknown; generatedFrom?: { jobId?: string } } };
type Opt = { id: string; reaction?: Reaction };

function findOption(doc: CourseDocument, lessonId: string, choiceId: string, optionId: string): Opt | undefined {
  for (const m of doc.modules)
    for (const l of m.lessons) {
      if (l.id !== lessonId) continue;
      const n = l.graph.nodes.find((x) => x.id === choiceId);
      if (n?.type === 'choice') return (n.options as unknown as Opt[]).find((o) => o.id === optionId);
    }
  return undefined;
}

/**
 * Reação que começa direto no conteúdo: tira a interjeição de abertura ("Boa escolha!"…) cortando o vídeo
 * no início da frase seguinte (alinhamento por letra da narração), refaz as legendas e o texto da reação.
 */
export async function trimReactionOpener(opts: { courseId: string; lessonId: string; choiceId: string; optionId: string; dryRun?: boolean }) {
  const db = getDb();
  const draft = await authoring.getDraft(db, opts.courseId);
  if (!draft) throw new AdjustError('Rascunho não encontrado');
  const o = findOption(draft.document as CourseDocument, opts.lessonId, opts.choiceId, opts.optionId);
  const r = o?.reaction;
  const opener = reactionOpener(r?.text);
  if (!r || r.media?.kind !== 'video') throw new AdjustError('Esta resposta não tem reação em vídeo');
  if (!opener) throw new AdjustError('A reação já começa direto no conteúdo');
  const job = r.media.generatedFrom?.jobId ? await media.getJob(db, r.media.generatedFrom.jobId) : null;
  const al = (job?.input as { alignment?: CharAlignment } | undefined)?.alignment;
  const script = String((job?.input as { script?: string } | undefined)?.script ?? '');
  if (!al?.characters?.length || !script.startsWith(opener)) throw new AdjustError('Esta reação não tem o tempo de cada palavra guardado; não dá para cortar sem regravar');
  let idx = opener.length;
  while (idx < al.characters.length && /\s/.test(al.characters[idx]!)) idx++;
  const t0 = Math.max(al.endTimes[opener.length - 1] ?? 0, (al.startTimes[idx] ?? 0) - 0.12);
  const rest = r.text.slice(opener.length).trim();
  if (opts.dryRun) return { opener, cutAt: t0, text: rest, assetId: null as string | null };
  const asset = await media.getAsset(db, r.media.assetId);
  if (!asset) throw new AdjustError('Vídeo da reação não encontrado');
  const dir = await mkdtemp(path.join(tmpdir(), 'lms-reacao-'));
  try {
    const src = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.mp4');
    await writeFile(src, await readAsset(asset.storageKey));
    await runFfmpeg(['-ss', t0.toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
    const loudness = await normalizeLoudnessInPlace(out);
    const seconds = (await ffprobe(out)).durationSeconds;
    const createdBy = asset.createdBy ?? draft.updatedBy;
    const stored = await storeGeneratedAsset({ workspaceId: asset.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(out)), durationSeconds: seconds, transcript: rest, createdBy, metadata: { loudness: { ...loudness, from: asset.id } } });
    const words = wordsFromAlignment(al).filter((w) => w.start >= t0 - 0.01).map((w) => ({ ...w, start: Math.max(0, w.start - t0), end: Math.max(0, w.end - t0) }));
    const cap = await storeCaptions({ workspaceId: asset.workspaceId, createdBy }, words, false);
    await saveWithRetry(opts.courseId, `reação ${opts.choiceId}~${opts.optionId}: sem "${opener}"`, (doc) => {
      const opt = findOption(doc, opts.lessonId, opts.choiceId, opts.optionId);
      if (!opt?.reaction?.media) return false;
      opt.reaction = { ...opt.reaction, text: rest, media: { ...opt.reaction.media, assetId: stored.id, transcript: rest, ...(cap ? { captions: { assetId: cap.assetId, lang: 'pt-BR', format: 'vtt' } } : {}) } };
      return true;
    });
    return { opener, cutAt: t0, text: rest, assetId: stored.id };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Job de mídia `kind: 'adjust'` (pedido pelo estúdio)                 */
/* ------------------------------------------------------------------ */

export function isAdjustJob(job: Pick<media.MediaJobRow, 'input'>): boolean {
  return isAdjustJobInput(job.input);
}

/** Reivindica (queued -> running), monta, anexa e marca sucesso. Erro de pedido é definitivo (nada foi cobrado). */
export async function processAdjustJob(jobId: string) {
  const db = getDb();
  const job = await media.getJob(db, jobId);
  if (!job || job.status !== 'queued' || !isAdjustJob(job)) return;
  const [running] = await db
    .update(schema.mediaJobs)
    .set({ status: 'running', attempts: job.attempts + 1, startedAt: job.startedAt ?? new Date(), phase: 'composing', updatedAt: new Date() })
    .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'queued')))
    .returning();
  if (!running) return;
  const input = running.input as unknown as AdjustJobInput;
  const renew = () => db.update(schema.mediaJobs).set({ updatedAt: new Date() }).where(eq(schema.mediaJobs.id, jobId));
  try {
    let assetId: string | null;
    let note: string;
    if (input.target === 'scene') {
      // o vídeo atual pode ter mudado desde o pedido: o ajuste só vale sobre o mesmo job de origem
      const ctx = await loadSceneAdjust(running.courseId, running.lessonId, running.nodeId);
      if (ctx.job.id !== input.adjustOf) throw new AdjustError('O vídeo da cena mudou depois do pedido; abra a cena de novo e refaça o ajuste');
      const r = await adjustScene({ courseId: running.courseId, lessonId: running.lessonId, nodeId: running.nodeId, request: input.request, renew });
      assetId = r.assetId;
      note = `${ADJUST_JOB_NOTE}: ${r.durationSeconds.toFixed(1)} s`;
    } else {
      const r = await trimReactionOpener({ courseId: running.courseId, lessonId: running.lessonId, choiceId: input.choiceId, optionId: input.optionId });
      assetId = r.assetId;
      note = `${ADJUST_JOB_NOTE}: reação sem "${r.opener}"`;
    }
    const [ok] = await db
      .update(schema.mediaJobs)
      .set({ status: 'succeeded', phase: 'done', outputAssetId: assetId, finishedAt: new Date(), lastError: note, costActualUsd: 0, updatedAt: new Date() })
      .where(and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, 'running')))
      .returning({ id: schema.mediaJobs.id });
    if (!ok) return;
    await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.succeeded', version: 1, payload: { jobId, assetId, adjust: true } });
    console.log(`[media] job ${jobId} concluído: ajuste fino -> ${assetId}`);
  } catch (e) {
    const msg = e instanceof AdjustError ? e.message : `ajuste fino falhou: ${String(e instanceof Error ? e.message : e)}`;
    await fail({ ...running, attempts: MAX_ATTEMPTS }, msg, false);
  }
}

/** Reconciliação: ajuste parado em `running` (worker reiniciado) volta para a fila. */
export async function reconcileAdjustJob(job: media.MediaJobRow) {
  if (Date.now() - job.updatedAt.getTime() < ADJUST_STALE_MS) return;
  const db = getDb();
  if (job.attempts >= MAX_ATTEMPTS) {
    await fail(job, 'ajuste fino interrompido repetidas vezes (worker reiniciado?)', false);
    return;
  }
  const [row] = await db.update(schema.mediaJobs).set({ status: 'queued', phase: 'waiting', updatedAt: new Date(), lastError: 'ajuste interrompido; reenfileirado' }).where(and(eq(schema.mediaJobs.id, job.id), eq(schema.mediaJobs.status, 'running'))).returning({ id: schema.mediaJobs.id });
  if (row) await db.insert(schema.outboxEvents).values({ id: newId('obx'), type: 'media_job.queued', version: 1, payload: { jobId: job.id, retry: true } });
}

export { ADJUST_PROVIDER };
