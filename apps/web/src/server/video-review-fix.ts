import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { allLessons, findLesson, type CourseDocument } from '@lms/course-schema';
import { DomainError, authoring, getDb, media, reviewMarks } from '@lms/db';

type ReviewMarkView = reviewMarks.ReviewMarkView;
import { sceneContextFromNode } from '@/lib/video-review/context';
import { buildBrief, isVagueMark, type BriefInput, type BriefSpec } from '@/lib/video-review/brief';
import { classifyFix, type FixPlan } from '@/lib/video-review/fix';
import { resolveMark, speechWindow, type MarkResolution, type ReviewCategory, type SceneReviewContext } from '@/lib/video-review/resolve';
import { courseStem, findScreenSection, findScriptScene, findTopicSection, sectionBody, type SpecFile, type SpecHit } from '@/lib/video-review/specs';
import { awaitsNewVideo, shouldMarkReady, transition, TransitionError, type MarkStatus } from '@/lib/video-review/status';
import { applyRetakes, parseTakeRef } from '@/scripts/refazer-tomadas-calc';
import { draftFingerprint, getMediaConfig, reusedMediaFor } from './media';
import { buildQuoteItems } from './media-quote';
import { mediaBudgetCheck } from './spend';
import { lessonSceneContexts, resolveSaved } from './video-review';

/**
 * "Corrigir" da revisão: prompt de correção por marca, classificação do conserto (grátis / edição / pago / manual) com
 * o MESMO orçamento do estúdio e do gerar-curso (`buildQuoteItems`), e os estados da marca até "pronta para conferir".
 *
 * Nada pago sai daqui: conserto pago só registra o pedido e a aprovação (o operador executa a seco e depois com
 * `--confirmar`). Conserto grátis só é enfileirado com o estúdio em modo REAL (com mídia simulada o job sairia
 * simulado e trocaria o vídeo da cena por um falso): em demonstração ele fica com o operador, com os comandos prontos.
 */

/* ---------------- arquivos de roteiro ---------------- */

/** Raiz do repositório (onde fica `docs/roteiros`), subindo a partir da pasta do processo. */
export function repoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'docs', 'roteiros'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(start);
}

function readSpecs(root: string, dir: string, suffix: string, stem?: string): SpecFile[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  const files = readdirSync(abs).filter((f) => f.endsWith(suffix)).sort();
  if (stem) files.sort((a, b) => (a.startsWith(stem) ? -1 : b.startsWith(stem) ? 1 : 0));
  return files.map((f) => ({ path: path.join(dir, f), text: readFileSync(path.join(abs, f), 'utf8') }));
}

export interface ReviewSpecs {
  telas: SpecFile[];
  topicos: SpecFile[];
  roteiros: SpecFile[];
  stem?: string;
}

/** Arquivos de roteiro do curso (`docs/roteiros`), com o roteiro deste curso primeiro. */
export function loadReviewSpecs(doc: CourseDocument, root = repoRoot()): ReviewSpecs {
  const light = allLessons(doc).flatMap((l) => l.graph.nodes.map((n) => sceneContextFromNode(doc, l, n, { durationSec: null, cues: [] })).filter((x): x is SceneReviewContext => !!x));
  const stem = courseStem({ telas: readSpecs(root, 'docs/roteiros/telas', '.telas.md'), topicos: readSpecs(root, 'docs/roteiros/telas', '.topicos.md') }, light);
  return { telas: readSpecs(root, 'docs/roteiros/telas', '.telas.md', stem), topicos: readSpecs(root, 'docs/roteiros/telas', '.topicos.md', stem), roteiros: readSpecs(root, 'docs/roteiros', '.md', stem), ...(stem ? { stem } : {}) };
}

function specFor(specs: ReviewSpecs, scene: SceneReviewContext | undefined, r: MarkResolution | null, category: ReviewCategory, plan: FixPlan | null): BriefSpec | null {
  if (!r) return null;
  const text = (h: SpecHit, files: SpecFile[]) => files.find((f) => f.path === h.file)?.text ?? '';
  const target = plan?.target;
  if (r.screen && (target === 'screen' || category === 'screen' || category === 'sync')) {
    const st = r.screen.step ?? r.screen.nextStep;
    const h = findScreenSection(specs.telas, r.screen.fileName, r.nodeId, scene?.screens?.[r.screen.recordingIndex - 1]?.mock, st?.index);
    if (h) return { kind: 'screen', file: h.file, line: h.line, ...(h.itemLine ? { itemLine: h.itemLine } : {}), section: h.section, current: sectionBody(text(h, specs.telas), h.line), matchesDraft: h.matchesDraft };
  }
  if (r.topic && (target === 'topics' || category === 'topics' || category === 'sync')) {
    const idx = r.topic.index ?? r.topic.next?.index;
    const h = findTopicSection(specs.topicos, r.nodeId, scene?.topics ?? null, idx ?? undefined);
    if (h) return { kind: 'topics', file: h.file, line: h.line, ...(h.itemLine ? { itemLine: h.itemLine } : {}), section: h.section, current: sectionBody(text(h, specs.topicos), h.line), matchesDraft: h.matchesDraft };
  }
  if (target === 'speech' || category === 'speech') {
    const h = findScriptScene(specs.roteiros, r.nodeId, specs.stem);
    if (h) {
      const f = specs.roteiros.find((x) => x.path === h.file)!;
      return { kind: 'speech', file: h.file, line: h.line, section: r.nodeId.toUpperCase(), current: sectionBody(f.text, h.line, 16), matchesDraft: true };
    }
  }
  return null;
}

/* ---------------- visão da marca (resolução + prompt + plano) ---------------- */

export interface MarkView extends Omit<ReviewMarkView, 'resolution' | 'brief'> {
  resolution: MarkResolution | null;
  stale: boolean;
  brief: string;
  vague: boolean;
  plan: FixPlan | null;
}

export function storedPlan(m: Pick<ReviewMarkView, 'fix'>): FixPlan | null {
  return ((m.fix as { plan?: FixPlan } | null)?.plan as FixPlan | undefined) ?? null;
}

/** Arquivos de telas/tópicos da cena da marca (para os comandos de aplicar). */
function specFiles(m: Pick<ReviewMarkView, 'nodeId'>, r: MarkResolution | null, specs: ReviewSpecs, scene?: SceneReviewContext): { telasFile: string | null; topicosFile: string | null } {
  return {
    telasFile: (r?.screen ? findScreenSection(specs.telas, r.screen.fileName, m.nodeId, scene?.screens?.[r.screen.recordingIndex - 1]?.mock)?.file : null) ?? null,
    topicosFile: (r?.topic ? findTopicSection(specs.topicos, m.nodeId, scene?.topics ?? null)?.file : null) ?? null,
  };
}

/** Plano provisório (sem orçamento) para o prompt de uma marca ainda não classificada. */
function provisionalPlan(courseId: string, m: ReviewMarkView, r: MarkResolution | null, specs: ReviewSpecs, scene?: SceneReviewContext): FixPlan {
  return classifyFix({ courseId, lessonId: m.lessonId, nodeId: m.nodeId, category: m.category as ReviewCategory, resolution: r, scene: null, retakeUsd: null, ...specFiles(m, r, specs, scene), simulation: true });
}

export function briefInputFor(course: { id: string; title: string }, m: ReviewMarkView, scenes: SceneReviewContext[], specs: ReviewSpecs, plan?: FixPlan | null): BriefInput {
  const { resolution, stale } = resolveSaved(m, scenes);
  const scene = scenes.find((s) => s.nodeId === m.nodeId);
  const p = plan ?? storedPlan(m) ?? provisionalPlan(course.id, m, resolution, specs, scene);
  const cues = scene && !stale ? scene.cues : [];
  return {
    course,
    mark: { id: m.id, lessonId: m.lessonId, nodeId: m.nodeId, sceneTimeSec: m.sceneTimeSec, category: m.category as ReviewCategory, note: m.note, expected: m.expected },
    resolution,
    stale,
    speech: cues.length ? speechWindow(cues, m.sceneTimeSec, 3) : null,
    spec: specFor(specs, scene, resolution, m.category as ReviewCategory, p),
    topics: scene?.topics ?? null,
    plan: p,
    studioUrl: `/estudio/cursos/${course.id}/assistir?aula=${encodeURIComponent(m.lessonId)}`,
  };
}

export function markView(course: { id: string; title: string }, m: ReviewMarkView, scenes: SceneReviewContext[], specs: ReviewSpecs): MarkView {
  const input = briefInputFor(course, m, scenes, specs);
  return { ...m, resolution: input.resolution, stale: input.stale, brief: buildBrief(input), vague: isVagueMark(m), plan: storedPlan(m) };
}

/**
 * Marcas pendentes cujo vídeo da cena mudou desde o pedido de conserto viram "pronta para conferir" (grava a
 * transição no histórico). Devolve as marcas atualizadas.
 */
export async function reconcileMarks(workspaceId: string, marks: ReviewMarkView[], scenes: SceneReviewContext[]): Promise<ReviewMarkView[]> {
  const out: ReviewMarkView[] = [];
  for (const m of marks) {
    const scene = scenes.find((s) => s.nodeId === m.nodeId);
    const atRequest = ((m.fix as { assetAtRequest?: string } | null)?.assetAtRequest) ?? m.sceneAssetId;
    if (scene && shouldMarkReady(m.status as MarkStatus, atRequest, scene.assetId)) {
      out.push(await reviewMarks.updateMark(getDb(), { workspaceId, markId: m.id, actorId: null, patch: { status: transition(m.status as MarkStatus, { type: 'asset_changed' }), fix: { ...(m.fix ?? {}), newAssetId: scene.assetId } }, note: 'vídeo novo da cena' }));
    } else out.push(m);
  }
  return out;
}

/** Marcas de uma aula prontas para a tela: reconciliadas, com resolução, prompt e plano. */
export async function lessonMarkViews(workspaceId: string, courseId: string, lessonId: string): Promise<{ marks: MarkView[]; scenes: SceneReviewContext[] }> {
  const db = getDb();
  const [course, draft] = await Promise.all([authoring.getCourse(db, courseId), authoring.getDraft(db, courseId)]);
  if (!course || !draft) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  const scenes = await lessonSceneContexts(workspaceId, draft.document, lessonId);
  const specs = loadReviewSpecs(draft.document);
  const marks = await reconcileMarks(workspaceId, await reviewMarks.listMarks(db, { workspaceId, courseId, lessonId }), scenes);
  return { marks: marks.map((m) => markView({ id: course.id, title: draft.document.title }, m, scenes, specs)), scenes };
}

/* ---------------- orçamento (mesmo núcleo do estúdio e do gerar-curso) ---------------- */

/**
 * Orçamento da cena no rascunho atual: `changed` = o hash da cena mudou em relação ao vídeo anexado (o rascunho já
 * tem uma correção); `usd` = custo de produzir (0 = reaproveita a fala/clipes pagos). Só lê. O hash é calculado no
 * modo real (como o worker grava) para comparar com `generatedFrom.sceneHash`; nada é enfileirado com este cfg.
 */
export async function sceneQuote(doc: CourseDocument, workspaceId: string, courseId: string, lessonId: string, nodeId: string): Promise<{ changed: boolean; usd: number } | null> {
  const cfg = { ...getMediaConfig(), simulation: false };
  const { items } = await buildQuoteItems(getDb(), { doc, workspaceId, courseId, lessonIds: [lessonId], nodeIds: [nodeId], includeStale: true, cfg });
  const it = items.find((i) => i.lessonId === lessonId && i.nodeId === nodeId);
  if (!it) return null;
  const node = findLesson(doc, lessonId)?.lesson.graph.nodes.find((n) => n.id === nodeId) as { media?: { generatedFrom?: { sceneHash?: string } } } | undefined;
  const prev = node?.media?.generatedFrom?.sceneHash;
  return { changed: !!prev && it.sceneHash !== prev, usd: +it.estimatedUsd.toFixed(2) };
}

/** Orçamento de refazer tomadas (variação nova só nelas), como o `refazer-tomadas` a seco. */
export async function retakeQuote(doc: CourseDocument, workspaceId: string, courseId: string, tomadas: string[]): Promise<number> {
  if (!tomadas.length) return 0;
  const { doc: next, scenes } = applyRetakes(doc, tomadas.map(parseTakeRef));
  const cfg = { ...getMediaConfig(), simulation: false };
  const { items } = await buildQuoteItems(getDb(), { doc: next, workspaceId, courseId, lessonIds: [...new Set(scenes.map((s) => s.lessonId))], nodeIds: [...new Set(scenes.map((s) => s.nodeId))], includeStale: true, cfg });
  return +media.quoteTotals(items).estimatedUsd.toFixed(2);
}

/**
 * Remontagem grátis pelo MESMO caminho do lote do estúdio (orçamento → jobs numa transação; reaproveitados anexados).
 * Só em modo real e só se o orçamento da cena for exatamente US$ 0; senão erra (nada criado).
 */
async function enqueueFreeRemount(input: { workspaceId: string; courseId: string; userId: string; doc: CourseDocument; revision: number; lessonId: string; nodeId: string }): Promise<{ jobIds: string[]; reused: number }> {
  const db = getDb();
  const cfg = getMediaConfig();
  if (cfg.simulation) throw new DomainError('VALIDATION', 'Estúdio em modo demonstração: a remontagem fica com o operador');
  const { items, errors } = await buildQuoteItems(db, { doc: input.doc, workspaceId: input.workspaceId, courseId: input.courseId, lessonIds: [input.lessonId], nodeIds: [input.nodeId], includeStale: true, cfg });
  const totals = media.quoteTotals(items);
  if (errors.length || totals.estimatedUsd !== 0) throw new DomainError('VALIDATION', 'A remontagem desta cena não sai de graça: precisa de aprovação');
  const quote = await media.createQuote(db, { workspaceId: input.workspaceId, courseId: input.courseId, draftRevision: input.revision, draftHash: draftFingerprint(input.doc), simulated: cfg.simulation, items, params: { nodeIds: [input.nodeId], includeStale: true, origin: 'revisao-marca' }, createdBy: input.userId });
  media.assertWithinBudget(await mediaBudgetCheck(input.workspaceId, 0));
  const result = await media.createJobsFromQuote(db, { quoteId: quote.id, workspaceId: input.workspaceId, courseId: input.courseId, userId: input.userId, currentDraftRevision: input.revision, currentDraftHash: draftFingerprint(input.doc), simulated: cfg.simulation });
  for (const it of result.reused) {
    const job = it.reusedJobId ? await media.getJob(db, it.reusedJobId) : null;
    if (job?.outputAssetId) await authoring.setNodeMedia(db, { courseId: input.courseId, lessonId: it.lessonId, nodeId: it.nodeId, userId: input.userId, note: `Mídia reaproveitada (revisão, orçamento ${quote.id})`, media: reusedMediaFor(job, it.sceneHash, String((job.input as { script?: unknown }).script ?? '')) });
  }
  return { jobIds: result.created.map((j) => j.id), reused: result.reused.length };
}

/* ---------------- ações ---------------- */

export interface FixSummary {
  marks: MarkView[];
  counts: Record<'free' | 'edit' | 'paid' | 'manual', number>;
  /** soma dos consertos pagos pedidos (US$) */
  paidUsd: number;
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * "Corrigir" (uma marca) / "Corrigir tudo" (as abertas da aula): classifica cada marca aberta, grava o prompt e o plano
 * e muda o status. Conserto grátis com o estúdio em modo real é enfileirado; o resto fica pendente (operador/aprovação).
 */
export async function requestFixes(viewer: { workspaceId: string; userId: string }, courseId: string, markIds: string[]): Promise<FixSummary> {
  const db = getDb();
  const [course, draft] = await Promise.all([authoring.getCourse(db, courseId), authoring.getDraft(db, courseId)]);
  if (!course || !draft) throw new DomainError('NOT_FOUND', 'Curso não encontrado');
  const doc = draft.document;
  const cfg = getMediaConfig();
  const specs = loadReviewSpecs(doc);
  const all = await reviewMarks.listMarks(db, { workspaceId: viewer.workspaceId, courseId });
  const wanted = all.filter((m) => markIds.includes(m.id));
  const scenesBy = new Map<string, SceneReviewContext[]>();
  const sceneQ = new Map<string, Awaited<ReturnType<typeof sceneQuote>>>();
  const retakeQ = new Map<string, number>();
  const summary: FixSummary = { marks: [], counts: { free: 0, edit: 0, paid: 0, manual: 0 }, paidUsd: 0, skipped: [] };
  const info = { id: course.id, title: doc.title };
  for (const m of wanted) {
    if (m.status !== 'open') {
      summary.skipped.push({ id: m.id, reason: `já está ${m.status}` });
      continue;
    }
    if (!scenesBy.has(m.lessonId)) scenesBy.set(m.lessonId, await lessonSceneContexts(viewer.workspaceId, doc, m.lessonId));
    const scenes = scenesBy.get(m.lessonId)!;
    const scene = scenes.find((s) => s.nodeId === m.nodeId);
    const { resolution } = resolveSaved(m, scenes);
    const key = `${m.lessonId}/${m.nodeId}`;
    if (scene && !sceneQ.has(key)) sceneQ.set(key, await sceneQuote(doc, viewer.workspaceId, courseId, m.lessonId, m.nodeId).catch(() => null));
    let retakeUsd: number | null = null;
    if (resolution?.take?.retakeable) {
      if (!retakeQ.has(resolution.take.id)) retakeQ.set(resolution.take.id, await retakeQuote(doc, viewer.workspaceId, courseId, [resolution.take.id]));
      retakeUsd = retakeQ.get(resolution.take.id)!;
    }
    const plan = classifyFix({ courseId, lessonId: m.lessonId, nodeId: m.nodeId, category: m.category as ReviewCategory, resolution, scene: sceneQ.get(key) ?? null, retakeUsd, ...specFiles(m, resolution, specs, scene), simulation: cfg.simulation });
    let enqueued: { jobIds: string[]; reused: number } | null = null;
    let note = plan.label;
    if (plan.autoRun) {
      try {
        enqueued = await enqueueFreeRemount({ workspaceId: viewer.workspaceId, courseId, userId: viewer.userId, doc, revision: draft.revision, lessonId: m.lessonId, nodeId: m.nodeId });
        note = `${plan.label}: ${enqueued.jobIds.length} job(s) na fila`;
      } catch (e) {
        note = `${plan.label}: não enfileirado (${e instanceof Error ? e.message : String(e)}); fica com o operador`;
      }
    }
    const brief = buildBrief(briefInputFor(info, m, scenes, specs, plan));
    const status = transition('open', { type: 'request_fix', kind: plan.kind, enqueued: !!enqueued });
    const updated = await reviewMarks.updateMark(db, {
      workspaceId: viewer.workspaceId, markId: m.id, actorId: viewer.userId, note,
      patch: { status, fixKind: plan.kind, brief, approvalUsd: plan.kind === 'paid' ? plan.usd : null, fix: { plan, assetAtRequest: scene?.assetId ?? m.sceneAssetId, requestedAt: new Date().toISOString(), requestedBy: viewer.userId, mediaMode: cfg.mode, ...(enqueued ? { jobIds: enqueued.jobIds } : {}) } },
    });
    summary.counts[plan.kind]++;
    if (plan.kind === 'paid') summary.paidUsd += plan.usd ?? 0;
    summary.marks.push(markView(info, updated, scenes, specs));
  }
  summary.paidUsd = +summary.paidUsd.toFixed(2);
  return summary;
}

export type MarkAction = 'approve' | 'resolve' | 'reopen' | 'still_wrong' | 'executed';

/**
 * Ações sobre uma marca: aprovar o gasto (registra quem/quanto; o operador executa), resolver, reabrir/cancelar o
 * pedido, "ainda errado" (volta a aberta apontando para o vídeo novo, tentativa +1) e "executada" (o operador rodou).
 */
export async function markAction(viewer: { workspaceId: string; userId: string; name?: string }, courseId: string, markId: string, action: MarkAction): Promise<ReviewMarkView> {
  const db = getDb();
  const m = await reviewMarks.getMark(db, { workspaceId: viewer.workspaceId, markId });
  if (!m || m.courseId !== courseId) throw new DomainError('NOT_FOUND', 'Marca não encontrada');
  const from = m.status as MarkStatus;
  let to: MarkStatus;
  try {
    to = transition(from, action === 'approve' ? { type: 'approve' } : action === 'resolve' ? { type: 'resolve' } : action === 'reopen' ? { type: 'reopen' } : action === 'executed' ? { type: 'executed' } : { type: 'still_wrong' });
  } catch (e) {
    if (e instanceof TransitionError) throw new DomainError('CONFLICT', e.message);
    throw e;
  }
  const base = { workspaceId: viewer.workspaceId, markId, actorId: viewer.userId };
  if (action === 'approve') {
    const plan = storedPlan(m);
    return reviewMarks.updateMark(db, { ...base, patch: { status: to, fix: { ...(m.fix ?? {}), approval: { usd: plan?.usd ?? m.approvalUsd, by: viewer.userId, at: new Date().toISOString() } } }, note: `gasto aprovado: US$ ${(plan?.usd ?? m.approvalUsd ?? 0).toFixed(2)} (será executado pelo operador)` });
  }
  if (action === 'still_wrong') {
    // a marca passa a valer para o vídeo NOVO da cena (mesmo instante), com nova resolução e o pedido limpo
    const draft = await authoring.getDraft(db, courseId);
    const scenes = draft ? await lessonSceneContexts(viewer.workspaceId, draft.document, m.lessonId) : [];
    const scene = scenes.find((s) => s.nodeId === m.nodeId);
    return reviewMarks.updateMark(db, {
      ...base, note: 'ainda errado',
      patch: { status: to, attempts: m.attempts + 1, fixKind: null, fix: null, approvalUsd: null, brief: null, ...(scene && draft ? { sceneAssetId: scene.assetId, sceneHash: scene.sceneHash, draftRevision: draft.revision, resolution: resolveMark(scene, m.sceneTimeSec) as unknown as Record<string, unknown> } : {}) },
    });
  }
  if (action === 'reopen' && awaitsNewVideo(from)) {
    return reviewMarks.updateMark(db, { ...base, patch: { status: to, fixKind: null, fix: null, approvalUsd: null, brief: null }, note: 'pedido de conserto cancelado' });
  }
  return reviewMarks.updateMark(db, { ...base, patch: { status: to } });
}
