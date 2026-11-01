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
import { ADJUST_PROVIDER, adjustOptions, carryAdjust, deriveAdjustState, isAdjustJobInput, keptSegments, keptWords, mergeAdjust, reactionOpener, segmentTimes, soloShotWords, validateAdjust, verifySkips, fillSkipText, type AdjustJobInput, type AdjustRequest, type AdjustState, type TimedWord } from '@lms/media';
import { ffprobe, normalizeLoudnessInPlace, quietestPoint, runFfmpeg, wordsFromAlignment, type CharAlignment } from '@lms/media/compose';
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

/**
 * O plano `i` da montagem vem logo depois de algo tirado? (plano inteiro entre ele e o anterior, última frase do
 * anterior cortada, ou primeira frase/começo dele cortado). Função pura (testada).
 */
export function joinsAfterRemoval(baseShots: ReadonlyArray<{ id: string }>, kept: ReadonlyArray<{ id: string }>, i: number, state: Pick<AdjustState, 'drop' | 'cut'>): boolean {
  const cur = kept[i];
  const prev = kept[i - 1];
  if (!cur || !prev) return false;
  const bi = baseShots.findIndex((s) => s.id === cur.id);
  const bp = baseShots.findIndex((s) => s.id === prev.id);
  if (bi - bp > 1) return true;
  const c = state.cut[cur.id];
  const p = state.cut[prev.id];
  return !!(c?.first || c?.lead || p?.last);
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
export async function adjustScene(opts: {
  courseId: string;
  lessonId: string;
  nodeId: string;
  request: AdjustRequest;
  out?: string;
  renew?: () => Promise<unknown>;
  /** remontagem (lote de acabamento): parte deste estado em vez do guardado e aceita pedido vazio */
  remount?: { state?: (current: AdjustState) => AdjustState };
}) {
  const { courseId, lessonId, nodeId } = opts;
  const db = getDb();
  const c = await loadSceneAdjust(courseId, lessonId, nodeId);
  const { job, input, base, wordsByUnit } = c;
  // `skip` é por índice de palavra: confere o texto guardado com as palavras desta gravação; o que não bate não é aplicado
  const shotWords = soloShotWords(input.units!, wordsByUnit);
  const checked = verifySkips(opts.request, shotWords);
  for (const w of checked.warnings) console.warn(`[ajuste] ${courseId} ${lessonId}/${nodeId}: ${w}`);
  const request = checked.request;
  const current = opts.remount?.state ? opts.remount.state(c.current) : c.current;
  const empty = !request.drop?.length && !request.cut?.length && !request.trimLead?.length && !request.skip?.length && request.teaser === undefined;
  const err = opts.remount && empty ? null : validateAdjust(base.shots, input.units!, wordsByUnit, current, request);
  if (err) throw new AdjustError(err);
  // guarda o texto das palavras puladas (para conferir numa regravação futura)
  const next = fillSkipText(mergeAdjust(current, request), shotWords);
  const drop = new Set(next.drop);
  const direction: SceneDirection = { ...base, shots: base.shots.filter((s) => !drop.has(s.id)) };
  input.units = input.units!.filter((u) => !u.shotIds.every((id) => drop.has(id)));
  // o primeiro plano que sobra entra com corte seco (sem transição de entrada)
  if (drop.has(base.shots[0]!.id)) direction.shots[0] = { ...direction.shots[0]!, transitionIn: 'cut' };
  // onde algo foi tirado (plano inteiro, frase do fim do anterior, frase/começo deste), a emenda entra em fusão
  // em vez de corte seco: o salto de fala e de imagem fica suave
  direction.shots = direction.shots.map((sh, i) => (i > 0 && sh.transitionIn !== 'crossfade' && joinsAfterRemoval(base.shots, direction.shots, i, next) ? { ...sh, transitionIn: 'crossfade' } : sh));
  if (next.teaser === null) delete input.nextQuestion;
  else if (typeof next.teaser === 'string') input.nextQuestion = next.teaser;
  if (c.draft.document.branding?.videoPalette) input.videoPalette = c.draft.document.branding.videoPalette;

  const dir = await mkdtemp(path.join(tmpdir(), 'lms-ajuste-'));
  try {
    const clipFiles = new Map<string, string>();
    const lines = new Map<string, string>();
    for (const [shotId, cut] of Object.entries(next.cut)) {
      if (drop.has(shotId) || (!cut.first && !cut.last && !cut.lead && !cut.skip?.length)) continue;
      const u = input.units.find((x) => x.shotIds.length === 1 && x.shotIds[0] === shotId && x.kind === 'clip');
      const st = u ? input.shots![u.id] : undefined;
      const words = u ? wordsByUnit.get(u.id) : undefined;
      if (!u || !st?.clipAssetId || !words?.length) throw new AdjustError(`O plano ${shotId} não tem clipe sozinho com palavras guardadas`);
      const segs = keptSegments(words, cut);
      if (!segs.length) throw new AdjustError(`O plano ${shotId} ficaria sem fala`);
      const clip = await media.getAsset(db, st.clipAssetId);
      if (!clip) throw new AdjustError(`Clipe do plano ${shotId} não encontrado`);
      const src = path.join(dir, `src-${u.id}.mp4`);
      await writeFile(src, await readAsset(clip.storageKey));
      const total = (await ffprobe(src)).durationSeconds;
      // tempo de cada trecho que fica: começo/fim do plano como antes; nas emendas, a respiração nunca invade a palavra
      // vizinha tirada (nem quando o alinhamento é contíguo): ver segmentTimes
      const times = segmentTimes(words, segs, total);
      // ajuste fino pelo SOM: nas emendas ao lado de palavras tiradas, o corte cai no ponto de menor volume entre as
      // duas palavras (o tempo marcado da palavra costuma errar dezenas de ms: sobrava o "-bém" de "Também")
      for (let i = 0; i < segs.length; i++) {
        const [a, b] = segs[i]!;
        if (a > 0) times[i]![0] = await quietestPoint(src, Math.max(0, words[a - 1]!.end - 0.03), Math.min(total, words[a]!.start + 0.06), times[i]![0]);
        if (b < words.length - 1) times[i]![1] = await quietestPoint(src, Math.max(0, words[b]!.end - 0.02), Math.min(total, words[b + 1]!.start + 0.05), times[i]![1]);
      }
      const trimmed = path.join(dir, `cut-${u.id}.mp4`);
      // fusão das emendas no meio do plano (imagem e som juntos, a boca segue sincronizada)
      const XF = 0.18;
      const offsets: number[] = [];
      if (times.length === 1) {
        await runFfmpeg(['-ss', times[0]![0].toFixed(3), '-to', times[0]![1].toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', trimmed]);
        offsets.push(0);
      } else {
        // corte no meio: cada trecho em arquivo próprio e emenda com fusão curta (imagem e som), a boca segue sincronizada
        const parts: string[] = [];
        const durs: number[] = [];
        for (let i = 0; i < times.length; i++) {
          const part = path.join(dir, `seg-${u.id}-${i}.mp4`);
          await runFfmpeg(['-ss', times[i]![0].toFixed(3), '-to', times[i]![1].toFixed(3), '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', part]);
          parts.push(part);
          durs.push((await ffprobe(part)).durationSeconds);
        }
        let acc = 0;
        const fv: string[] = [];
        const fa: string[] = [];
        let lv = '[0:v]';
        let la = '[0:a]';
        for (let i = 0; i < parts.length; i++) {
          offsets.push(i === 0 ? 0 : acc - XF);
          if (i > 0) {
            const off = acc - XF;
            // imagem: troca no MEIO da fusão numa rampa de ~2 quadros (sem "braços fantasma" quando a pose muda);
            // o som faz a fusão inteira (acrossfade), e os dois lados seguem sincronizados
            const k = (XF / 0.08).toFixed(3);
            const w = `clip((P-0.5)*${k}+0.5,0,1)`;
            fv.push(`${lv}[${i}:v]xfade=transition=custom:expr='A*${w}+B*(1-${w})':duration=${XF}:offset=${off.toFixed(3)}[v${i}]`);
            fa.push(`${la}[${i}:a]acrossfade=d=${XF}[a${i}]`);
            lv = `[v${i}]`;
            la = `[a${i}]`;
            acc = off + durs[i]!;
          } else acc = durs[0]!;
        }
        await runFfmpeg([...parts.flatMap((p) => ['-i', p]), '-filter_complex', [...fv, ...fa].join(';'), '-map', lv, '-map', la, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', trimmed]);
      }
      clipFiles.set(u.id, trimmed);
      // palavras que ficam, no tempo do clipe montado (legenda) e com o texto acertado (maiúscula/pontuação nas emendas)
      const kept = keptWords(words, cut);
      let k = 0;
      segs.forEach(([a, b], i) => {
        for (let w = a; w <= b; w++, k++) {
          const shift = offsets[i]! - times[i]![0];
          kept[k] = { ...kept[k]!, start: Math.max(0, words[w]!.start + shift), end: Math.max(0, words[w]!.end + shift) };
        }
      });
      st.words = packWords(kept, 0) as never;
      lines.set(shotId, kept.map((w) => w.text).join(' '));
    }
    if (lines.size) direction.shots = direction.shots.map((sh) => (lines.has(sh.id) ? { ...sh, line: lines.get(sh.id)! } : sh));
    input.direction = direction as never;
    await opts.renew?.();
    const scene = await renderDirectedScene(job, input, direction, dir, { clipFiles, ...(opts.renew ? { renew: opts.renew } : {}) });
    const transcript = direction.shots.map((s) => s.line.trim()).join(' ');
    if (opts.out) {
      await copyFile(scene.output, opts.out);
      return { assetId: null, durationSeconds: scene.durationSeconds, state: next, transcript, loudness: scene.loudness, timeline: scene.timeline, joins: scene.joins };
    }
    const captions = await sceneCaptions(job, direction, scene.timeline, scene.wordSources);
    const asset = await storeGeneratedAsset({ workspaceId: job.workspaceId, kind: 'video', mime: 'video/mp4', bytes: new Uint8Array(await readFile(scene.output)), durationSeconds: scene.durationSeconds, transcript, createdBy: job.createdBy, ...(scene.loudness ? { metadata: { loudness: scene.loudness } } : {}) });
    const summary = [...next.drop.map((x) => `sem ${x}`), ...Object.entries(next.cut).filter(([, v]) => v.first || v.last || v.lead || v.skip?.length).map(([k, v]) => `${k} −${v.first}/−${v.last} frase(s)${v.lead ? ` −${v.lead} palavra(s) no começo` : ''}${v.skip?.length ? ` −${v.skip.length} trecho(s) no meio` : ''}`), ...(request.teaser !== undefined ? ['cartão'] : [])].join(', ');
    await saveWithRetry(courseId, `ajuste fino ${lessonId}/${nodeId}: ${summary}`, (doc) => {
      const n = findNode(doc, lessonId, nodeId);
      if (!n) return false;
      // direção do rascunho = a montada (o plano tirado não volta numa gravação futura)
      n.direction = { ...(n.direction ?? base), shots: direction.shots } as SceneDirection;
      n.media = {
        ...(n.media ?? {}),
        assetId: asset.id, kind: 'video', transcript: transcript.slice(0, 20000), stale: false,
        ...(captions?.assetId ? { captions: { assetId: captions.assetId, lang: captions.lang ?? 'pt-BR', format: 'vtt', ...(captions.approx ? { approx: true } : {}) } } : {}),
        // falas da gravação ajustada: ao regravar, os cortes só voltam onde a fala não mudou (carryAdjust)
        adjust: { ...next, baseLines: Object.fromEntries(base.shots.map((s) => [s.id, s.line.slice(0, 2000)])) },
      };
      return true;
    });
    return { assetId: asset.id, durationSeconds: scene.durationSeconds, state: next, transcript, loudness: scene.loudness, timeline: scene.timeline, joins: scene.joins };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Ajuste fino da mídia ATUAL de uma cena e as falas da gravação ajustada (para levar à regravação). */
export interface PreviousAdjust {
  adjust: AdjustState;
  oldLines: Record<string, string> | null;
}

/**
 * Antes de trocar o vídeo de uma cena pelo regravado: o ajuste da mídia atual (se houver) e as falas da
 * gravação que ele cortou (`adjust.baseLines`, senão a direção do job de origem). Melhor esforço: null
 * quando não há ajuste ou algo falha.
 */
export async function previousSceneAdjust(courseId: string, lessonId: string, nodeId: string): Promise<PreviousAdjust | null> {
  try {
    const db = getDb();
    const draft = await authoring.getDraft(db, courseId);
    const node = draft ? findNode(draft.document as CourseDocument, lessonId, nodeId) : undefined;
    const stored = node?.media?.adjust;
    if (!stored) return null;
    const adjust: AdjustState = { drop: stored.drop ?? [], cut: stored.cut ?? {}, ...(stored.teaser !== undefined ? { teaser: stored.teaser } : {}) };
    let oldLines: Record<string, string> | null = stored.baseLines ?? null;
    const sourceJobId = node?.media?.generatedFrom?.jobId;
    if (!oldLines && sourceJobId) {
      const src = await media.getJob(db, sourceJobId);
      const dir = (src?.input as { direction?: unknown } | undefined)?.direction;
      const parsed = dir ? SceneDirectionSchema.safeParse(dir) : null;
      if (parsed?.success) oldLines = Object.fromEntries(parsed.data.shots.map((s) => [s.id, s.line]));
    }
    return { adjust, oldLines };
  } catch (e) {
    console.warn(`[ajuste] ${courseId} ${lessonId}/${nodeId}: ajuste anterior não lido (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
}

/**
 * Depois de uma regravação (F2): reaplica o ajuste fino que a cena tinha (grátis, montagem local), pela regra
 * de `carryAdjust`: cartão sempre; cortes só nos planos cuja fala não mudou. Se o pedido completo não couber
 * na gravação nova, tenta só o cartão. Nunca lança: na falha, a cena fica com o vídeo novo sem ajuste e um aviso no log.
 */
export async function reapplyAdjustAfterRecording(job: Pick<media.MediaJobRow, 'id' | 'courseId' | 'lessonId' | 'nodeId' | 'input'>, prev: PreviousAdjust | null): Promise<void> {
  if (!prev) return;
  const where = `[ajuste] job ${job.id} ${job.lessonId}/${job.nodeId}`;
  try {
    const dir = (job.input as { direction?: unknown }).direction;
    const parsed = dir ? SceneDirectionSchema.safeParse(dir) : null;
    if (!parsed?.success) return;
    const { request, skipped } = carryAdjust(prev.adjust, prev.oldLines, parsed.data.shots);
    if (skipped.length) console.log(`${where}: fica de fora: ${skipped.join('; ')}`);
    if (!request) return;
    const target = { courseId: job.courseId, lessonId: job.lessonId, nodeId: job.nodeId };
    try {
      const r = await adjustScene({ ...target, request });
      console.log(`${where}: ajuste reaplicado depois da regravação (${r.durationSeconds.toFixed(1)} s)`);
    } catch (e) {
      if (request.teaser === undefined || (!request.drop && !request.cut && !request.trimLead && !request.skip)) throw e;
      console.warn(`${where}: cortes não couberam na gravação nova (${e instanceof Error ? e.message : String(e)}); reaplicando só o cartão`);
      await adjustScene({ ...target, request: { teaser: request.teaser } });
      console.log(`${where}: cartão reaplicado depois da regravação`);
    }
  } catch (e) {
    console.warn(`${where}: ajuste não reaplicado; a cena fica com o vídeo novo sem ajuste (${e instanceof Error ? e.message : String(e)})`);
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
  // começo do que fica: colado no início da 1ª palavra mantida (o fim marcado da palavra tirada costuma vir antes do
  // som acabar; com 0,12 s de folga sobrava o "-bém" de "Também")
  const t0 = Math.max((al.endTimes[opener.length - 1] ?? 0) + 0.02, (al.startTimes[idx] ?? 0) - 0.04);
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
    // a reação já limpa (lote de acabamento) não passa pela limpeza de novo
    const cleaned = !!((asset.metadata ?? {}) as { loudness?: { voiceClean?: string } }).loudness?.voiceClean;
    const loudness = await normalizeLoudnessInPlace(out, undefined, { clean: !cleaned });
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
