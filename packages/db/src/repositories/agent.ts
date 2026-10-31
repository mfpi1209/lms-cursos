import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { CastMemberSchema, CourseDocumentSchema, LessonGraphSchema, ObjectiveSchema, ExperienceFamilySchema, SceneDirectionSchema, compileLesson, directionNarration, migrateCourseDocument, richTextFromPlain, richTextToPlain, sameWords, type AnyNode, type CourseDocument, type Lesson, type LessonGraph, type SceneDirection } from '@lms/course-schema';
import { z } from 'zod';
import type { Database, DbOrTx } from '../client';
import { newId } from '../ids';
import { DomainError } from '../errors';
import * as s from '../schema';
import { getDraft, saveDraft } from './authoring';

export type AgentTask = (typeof s.agentTaskEnum.enumValues)[number];
export const AGENT_TASKS = s.agentTaskEnum.enumValues;
/** Tarefas que operam sobre uma aula específica. */
export const LESSON_TASKS: readonly AgentTask[] = ['lesson', 'revise_lesson', 'scene_variations', 'scene_direction', 'evaluate_lesson'];

/** Mensagem devolvida ao tentar aplicar um cartão de qualidade (avaliação é informativa). */
export const QUALITY_NOT_APPLICABLE_MESSAGE = 'Um cartão de qualidade não é aplicado ao rascunho: use as correções sugeridas (revisar, dirigir, gerar vídeos) a partir dos achados.';

export type LessonQualityRow = typeof s.lessonQuality.$inferSelect;

/** Grava (ou substitui) o último cartão de qualidade da aula. */
export async function upsertLessonQuality(db: DbOrTx, input: { courseId: string; lessonId: string; draftRevision: number; scorecard: Record<string, unknown>; overall: number; runId?: string | null; proposalId?: string | null }): Promise<LessonQualityRow> {
  const id = newId('lqa');
  const [row] = await db
    .insert(s.lessonQuality)
    .values({ id, courseId: input.courseId, lessonId: input.lessonId, draftRevision: input.draftRevision, scorecard: input.scorecard, overall: input.overall, runId: input.runId ?? null, proposalId: input.proposalId ?? null })
    .onConflictDoUpdate({
      target: [s.lessonQuality.courseId, s.lessonQuality.lessonId],
      set: { draftRevision: input.draftRevision, scorecard: input.scorecard, overall: input.overall, runId: input.runId ?? null, proposalId: input.proposalId ?? null, createdAt: new Date() },
    })
    .returning();
  return row!;
}

export async function getLessonQuality(db: DbOrTx, courseId: string, lessonId: string): Promise<LessonQualityRow | null> {
  const [row] = await db.select().from(s.lessonQuality).where(and(eq(s.lessonQuality.courseId, courseId), eq(s.lessonQuality.lessonId, lessonId))).limit(1);
  return row ?? null;
}

export async function listLessonQuality(db: DbOrTx, courseId: string): Promise<LessonQualityRow[]> {
  return db.select().from(s.lessonQuality).where(eq(s.lessonQuality.courseId, courseId)).orderBy(desc(s.lessonQuality.createdAt)).limit(200);
}

/**
 * Qualidade do curso para a API: uma entrada por aula do rascunho (cartão ou
 * null) com `stale` quando o rascunho mudou desde a avaliação.
 */
export async function courseQuality(db: DbOrTx, courseId: string, doc: CourseDocument, draftRevision: number) {
  const rows = await listLessonQuality(db, courseId);
  const byLesson = new Map(rows.map((r) => [r.lessonId, r]));
  return doc.modules.flatMap((m) => m.lessons).map((l) => {
    const r = byLesson.get(l.id);
    return { lessonId: l.id, title: l.title, scorecard: r ? r.scorecard : null, stale: !!r && r.draftRevision !== draftRevision, evaluatedAt: r?.createdAt ?? null, draftRevision: r?.draftRevision ?? null };
  });
}

export type AgentRunRow = typeof s.agentRuns.$inferSelect;
export type ProposalRow = typeof s.agentProposals.$inferSelect;

export async function createRun(db: DbOrTx, input: Omit<typeof s.agentRuns.$inferInsert, 'id' | 'createdAt' | 'status'>) {
  const id = newId('run');
  const [row] = await db.insert(s.agentRuns).values({ id, ...input }).returning();
  await db.insert(s.outboxEvents).values({ id: newId('obx'), type: 'agent_run.queued', version: 1, payload: { runId: id } });
  return row!;
}

export async function getRun(db: DbOrTx, runId: string) {
  const [row] = await db.select().from(s.agentRuns).where(eq(s.agentRuns.id, runId)).limit(1);
  return row ?? null;
}

export async function listRunsForCourse(db: DbOrTx, courseId: string, limit = 50) {
  return db.select().from(s.agentRuns).where(eq(s.agentRuns.courseId, courseId)).orderBy(desc(s.agentRuns.createdAt)).limit(limit);
}

export async function findOpenRun(db: DbOrTx, courseId: string, task: AgentTask, lessonId?: string) {
  const rows = await db
    .select()
    .from(s.agentRuns)
    .where(and(eq(s.agentRuns.courseId, courseId), eq(s.agentRuns.task, task), inArray(s.agentRuns.status, ['queued', 'running'])))
    .orderBy(desc(s.agentRuns.createdAt))
    .limit(50);
  return rows.find((r) => lessonId === undefined || r.lessonId === lessonId) ?? null;
}

/** Cancela uma execução presa (fila ou em andamento). O worker ignora runs canceladas. */
export async function cancelRun(db: DbOrTx, runId: string) {
  const [row] = await db
    .update(s.agentRuns)
    .set({ status: 'canceled', finishedAt: new Date(), error: 'cancelada pelo autor' })
    .where(and(eq(s.agentRuns.id, runId), inArray(s.agentRuns.status, ['queued', 'running'])))
    .returning();
  return row ?? null;
}

/**
 * Varredura: execuções em andamento há mais de `maxAgeMs` (worker caiu no meio
 * de uma chamada ao provedor) viram `failed`, liberando novos pedidos.
 */
export async function sweepStaleRuns(db: DbOrTx, maxAgeMs: number) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  return db
    .update(s.agentRuns)
    .set({ status: 'failed', finishedAt: new Date(), error: `sem resposta após ${Math.round(maxAgeMs / 60000)} min (worker reiniciado?)` })
    .where(and(inArray(s.agentRuns.status, ['queued', 'running']), lt(s.agentRuns.createdAt, cutoff)))
    .returning({ id: s.agentRuns.id });
}

/** Qualquer execução aberta (gerar, revisar ou variar) sobre a mesma aula. */
export async function findOpenRunForLesson(db: DbOrTx, courseId: string, lessonId: string) {
  const rows = await db.select().from(s.agentRuns).where(and(eq(s.agentRuns.courseId, courseId), eq(s.agentRuns.lessonId, lessonId))).orderBy(desc(s.agentRuns.createdAt)).limit(20);
  return rows.find((r) => r.status === 'queued' || r.status === 'running') ?? null;
}

/** Execuções abertas do curso indexadas por aula (para pular aulas ocupadas num lote). */
export async function openRunsByLesson(db: DbOrTx, courseId: string): Promise<Map<string, AgentRunRow>> {
  const rows = await db.select().from(s.agentRuns).where(and(eq(s.agentRuns.courseId, courseId), inArray(s.agentRuns.status, ['queued', 'running']))).orderBy(desc(s.agentRuns.createdAt)).limit(200);
  const m = new Map<string, AgentRunRow>();
  for (const r of rows) if (r.lessonId && !m.has(r.lessonId)) m.set(r.lessonId, r);
  return m;
}

/** Última proposta de estrutura ainda não decidida (pendente ou em conflito): vai ao prompt de "pedir outra proposta". */
export async function latestOpenOutlineProposal(db: DbOrTx, courseId: string) {
  const rows = await db
    .select()
    .from(s.agentProposals)
    .where(and(eq(s.agentProposals.courseId, courseId), eq(s.agentProposals.kind, 'outline'), inArray(s.agentProposals.status, ['proposed', 'conflict'])))
    .orderBy(desc(s.agentProposals.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateRun(db: DbOrTx, runId: string, patch: Partial<typeof s.agentRuns.$inferInsert>) {
  const [row] = await db.update(s.agentRuns).set(patch).where(eq(s.agentRuns.id, runId)).returning();
  return row ?? null;
}

export async function createProposal(db: DbOrTx, input: Omit<typeof s.agentProposals.$inferInsert, 'id' | 'createdAt' | 'status'>) {
  const id = newId('prp');
  const [row] = await db.insert(s.agentProposals).values({ id, ...input }).returning();
  await db.update(s.agentRuns).set({ proposalId: id }).where(eq(s.agentRuns.id, input.runId));
  return row!;
}

export async function getProposal(db: DbOrTx, proposalId: string) {
  const [row] = await db.select().from(s.agentProposals).where(eq(s.agentProposals.id, proposalId)).limit(1);
  return row ?? null;
}

export async function updateProposal(db: DbOrTx, proposalId: string, patch: Partial<typeof s.agentProposals.$inferInsert>) {
  const [row] = await db.update(s.agentProposals).set(patch).where(eq(s.agentProposals.id, proposalId)).returning();
  return row ?? null;
}

const OutlinePayload = z.object({
  cast: z.array(CastMemberSchema).default([]),
  objectives: z.array(ObjectiveSchema),
  modules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().default(''),
      lessons: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().default(''), family: ExperienceFamilySchema, estimatedMinutes: z.number().int(), objectiveIds: z.array(z.string()), rationale: z.string().default(''), keyScenes: z.array(z.string()).default([]) })),
    }),
  ),
  /** aulas da estrutura atual que a proposta remove de propósito (declaradas pela IA) */
  removedLessonIds: z.array(z.string()).default([]),
});
export type OutlinePayloadT = z.infer<typeof OutlinePayload>;
const LessonIssue = z.object({ code: z.string(), message: z.string(), nodeId: z.string().optional() });
const LessonPayload = z.object({
  lessonId: z.string(),
  graph: LessonGraphSchema,
  /** a proposta ainda tem erros de estrutura depois dos reparos: aplicar exige `acceptErrors` */
  hasErrors: z.boolean().optional(),
  /** erros e avisos da proposta (compilador + regras), para a tela "Ver proposta" */
  issues: z.object({ errors: z.array(LessonIssue).default([]), warnings: z.array(LessonIssue).default([]) }).optional(),
  /** revise_lesson restrita: só estas cenas mudam; ao aplicar, só elas entram sobre a aula ATUAL */
  nodeIds: z.array(z.string()).optional(),
});
/** Variações de uma cena: cada item traz o grafo completo da aula com a variação aplicada. */
const SceneVariationsPayload = z.object({ lessonId: z.string(), nodeId: z.string(), variations: z.array(z.object({ label: z.string(), graph: LessonGraphSchema })).min(1) });

/** Direção de vídeo proposta para cenas de uma aula (só o campo `direction` de cada nó). */
const SceneDirectionPayload = z.object({ lessonId: z.string(), scenes: z.array(z.object({ nodeId: z.string(), direction: SceneDirectionSchema })).min(1) });
export type SceneDirectionPayload = z.infer<typeof SceneDirectionPayload>;

/** Tipos de nó que aceitam direção (os mesmos que têm vídeo do apresentador). */
const DIRECTION_NODE_TYPES: ReadonlyArray<AnyNode['type']> = ['scenario', 'content', 'choice', 'consequence'];

/** Grafo mínimo de uma aula ainda sem cenas. */
export function placeholderGraph(title: string): LessonGraph {
  return LessonGraphSchema.parse({
    schemaVersion: 1,
    startNodeId: 'inicio',
    nodes: [
      { id: 'inicio', type: 'scenario', title: title, body: richTextFromPlain('Esta aula ainda não tem cenas. Gere com o assistente ou escreva no storyboard.') },
      { id: 'fim', type: 'end', title: 'Encerramento', summary: richTextFromPlain('Fim da aula.') },
    ],
    edges: [{ id: 'e_inicio_fim', from: 'inicio', to: 'fim' }],
  });
}

export function isPlaceholderGraph(g: LessonGraph): boolean {
  return g.nodes.length <= 2 && g.nodes.some((n) => n.id === 'inicio') && g.nodes.some((n) => n.type === 'end');
}

export type OutlineLessonStatus = 'kept' | 'retitled' | 'new' | 'removed' | 'contentLost';

export interface OutlineLessonPlan {
  lessonId: string;
  title: string;
  /** título atual, quando a aula continua com outro título */
  previousTitle?: string;
  status: OutlineLessonStatus;
  /** cenas da aula ATUAL (sem contar o encerramento); 0 para aulas novas ou vazias */
  sceneCount: number;
  /** cenas com vídeo já anexado na aula atual */
  mediaCount: number;
  /** módulo em que a aula fica (proposta) ou ficava (removida) */
  moduleId: string;
}

export interface OutlineApplyPlan {
  lessons: OutlineLessonPlan[];
  /** aulas que perdem cenas (removidas com conteúdo) */
  lost: OutlineLessonPlan[];
  lostScenes: number;
  kept: number;
  retitled: number;
  added: number;
  removed: number;
}

const visibleScenes = (g: LessonGraph) => (isPlaceholderGraph(g) ? 0 : g.nodes.filter((n) => n.type !== 'end').length);
const mediaScenes = (g: LessonGraph) => g.nodes.filter((n) => 'media' in n && !!n.media).length;

/**
 * O que acontece com cada aula ao aplicar a estrutura sobre o rascunho ATUAL:
 * mantém (mesmo id, cenas preservadas), renomeada (mesmo id, outro título),
 * nova, removida (sem cenas) ou perde conteúdo (removida com N cenas).
 */
export function outlineApplyPlan(doc: CourseDocument, payload: Pick<OutlinePayloadT, 'modules'>): OutlineApplyPlan {
  const current = new Map<string, { lesson: Lesson; moduleId: string }>();
  for (const m of doc.modules) for (const l of m.lessons) current.set(l.id, { lesson: l, moduleId: m.id });
  const lessons: OutlineLessonPlan[] = [];
  const seen = new Set<string>();
  for (const m of payload.modules) {
    for (const l of m.lessons) {
      seen.add(l.id);
      const prev = current.get(l.id);
      if (!prev) {
        lessons.push({ lessonId: l.id, title: l.title, status: 'new', sceneCount: 0, mediaCount: 0, moduleId: m.id });
        continue;
      }
      const same = prev.lesson.title.trim() === l.title.trim();
      lessons.push({ lessonId: l.id, title: l.title, ...(same ? {} : { previousTitle: prev.lesson.title }), status: same ? 'kept' : 'retitled', sceneCount: visibleScenes(prev.lesson.graph), mediaCount: mediaScenes(prev.lesson.graph), moduleId: m.id });
    }
  }
  for (const [id, { lesson, moduleId }] of current) {
    if (seen.has(id)) continue;
    const scenes = visibleScenes(lesson.graph);
    lessons.push({ lessonId: id, title: lesson.title, status: scenes > 0 ? 'contentLost' : 'removed', sceneCount: scenes, mediaCount: mediaScenes(lesson.graph), moduleId });
  }
  const lost = lessons.filter((l) => l.status === 'contentLost');
  return {
    lessons,
    lost,
    lostScenes: lost.reduce((a, l) => a + l.sceneCount, 0),
    kept: lessons.filter((l) => l.status === 'kept').length,
    retitled: lessons.filter((l) => l.status === 'retitled').length,
    added: lessons.filter((l) => l.status === 'new').length,
    removed: lessons.filter((l) => l.status === 'removed' || l.status === 'contentLost').length,
  };
}

function applyOutline(doc: CourseDocument, payload: OutlinePayloadT): CourseDocument {
  const existing = new Map<string, Lesson>();
  for (const m of doc.modules) for (const l of m.lessons) existing.set(l.id, l);
  const modules = payload.modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    lessons: m.lessons.map((l) => {
      const prev = existing.get(l.id);
      return {
        id: l.id, title: l.title, description: l.description, estimatedMinutes: l.estimatedMinutes, family: l.family, objectiveIds: l.objectiveIds,
        ...(prev?.allowBack !== undefined ? { allowBack: prev.allowBack } : {}),
        // cenas previstas e justificativa da dinâmica ficam na aula: o gerador de aula as lê
        ...(l.keyScenes.length ? { keyScenes: l.keyScenes.slice(0, 8) } : {}),
        ...(l.rationale.trim() ? { rationale: l.rationale.trim().slice(0, 400) } : {}),
        graph: prev?.graph ?? placeholderGraph(l.title),
      };
    }),
  }));
  const steps = new Set([...doc.wizard.completedSteps, 'estrutura' as const]);
  // todas as aulas da estrutura são obrigatórias (aulas adicionadas à mão depois entram pela tela de estrutura)
  return CourseDocumentSchema.parse({ ...doc, cast: payload.cast.length ? payload.cast : doc.cast, objectives: payload.objectives, modules, completion: { requiredLessonIds: modules.flatMap((m) => m.lessons.map((l) => l.id)) }, wizard: { ...doc.wizard, completedSteps: [...steps] } });
}

function applyLesson(doc: CourseDocument, payload: Pick<z.infer<typeof LessonPayload>, 'lessonId' | 'graph'>): CourseDocument {
  let found = false;
  const modules = doc.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => { if (l.id !== payload.lessonId) return l; found = true; return { ...l, graph: payload.graph }; }) }));
  if (!found) throw new DomainError('NOT_FOUND', `A aula "${payload.lessonId}" não existe mais no rascunho`);
  return CourseDocumentSchema.parse({ ...doc, modules });
}

const MEDIA_NODE_TYPES: ReadonlyArray<AnyNode['type']> = ['scenario', 'content', 'choice', 'consequence'];
const sameSpoken = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * Traz para o grafo ATUAL só as cenas-alvo de um grafo proposto (a cena, suas
 * opções e as arestas que saem dela). O resto da aula fica exatamente como
 * está, inclusive edições feitas depois da proposta. Mídia e direção das
 * cenas-alvo seguem a regra da revisão: a mídia continua (desatualizada se a
 * fala mudou); a direção só sobrevive se as falas dos planos ainda batem.
 * Arestas para cenas que não existem no grafo atual são descartadas.
 */
export function mergeScenesIntoGraph(current: LessonGraph, proposed: LessonGraph, nodeIds: readonly string[]): LessonGraph {
  const targets = new Set(nodeIds);
  const proposedById = new Map(proposed.nodes.map((n) => [n.id, n]));
  const nodes: AnyNode[] = current.nodes.map((cur): AnyNode => {
    if (!targets.has(cur.id)) return cur;
    const p = proposedById.get(cur.id);
    if (!p) return cur;
    if (p.type !== cur.type || !MEDIA_NODE_TYPES.includes(p.type)) return p;
    const spokenBefore = spokenTextOf(cur);
    const spokenNow = spokenTextOf(p);
    const changed = !sameSpoken(spokenBefore, spokenNow);
    const prevMedia = 'media' in cur ? cur.media : undefined;
    const media = prevMedia ? { media: changed ? { ...prevMedia, stale: true } : prevMedia } : {};
    const prevDirection = 'direction' in cur ? cur.direction : undefined;
    const keepDirection = prevDirection && spokenNow && sameSpoken(prevDirection.shots.map((x) => x.line).join(' '), spokenNow);
    const { media: _m, direction: _d, ...rest } = p as AnyNode & { media?: unknown; direction?: unknown };
    void _m;
    void _d;
    return { ...rest, ...media, ...(keepDirection ? { direction: prevDirection } : {}) } as AnyNode;
  });
  // cenas-alvo que ainda não existem na aula atual (a proposta criou): entram no fim
  for (const id of targets) if (!current.nodes.some((n) => n.id === id) && proposedById.has(id)) nodes.push(proposedById.get(id)!);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [...current.edges.filter((e) => !targets.has(e.from)), ...proposed.edges.filter((e) => targets.has(e.from) && ids.has(e.to))];
  const seenEdge = new Set<string>();
  const uniqueEdges = edges.filter((e) => (seenEdge.has(e.id) ? false : (seenEdge.add(e.id), true)));
  return { ...current, nodes, edges: uniqueEdges, startNodeId: ids.has(current.startNodeId) ? current.startNodeId : proposed.startNodeId };
}

/** Recompila a aula depois de aplicar (contagens gravadas no resumo da proposta). */
function compiledSummary(doc: CourseDocument, lessonId: string) {
  const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) return { errors: 0, warnings: 0 };
  const c = compileLesson(lesson.graph, { lessonId, objectiveIds: new Set(doc.objectives.map((o) => o.id)) });
  return { errors: c.errors.length, warnings: c.warnings.length, errorCodes: [...new Set(c.errors.map((e) => e.code))] };
}

/** Texto falado de um nó: a fala ou, sem fala, o texto da tela. */
function spokenTextOf(n: AnyNode): string {
  const narration = 'narration' in n && typeof n.narration === 'string' ? n.narration.trim() : '';
  if (narration) return narration;
  if (n.type === 'scenario' || n.type === 'content' || n.type === 'consequence') return richTextToPlain(n.body).trim();
  if (n.type === 'choice') return richTextToPlain(n.prompt).trim();
  return '';
}

export interface ApplyDirectionResult {
  doc: CourseDocument;
  applied: number;
  staled: number;
  /** cenas cuja direção atual foi ajustada pelo autor (source 'author') e não foram sobrescritas */
  skippedAuthored: string[];
  /** cenas cuja fala mudou desde a proposta (as falas dos planos não batem mais) */
  skippedMismatch: string[];
}

/** Cenas-alvo da proposta cuja direção atual no rascunho foi ajustada pelo autor. */
export function authoredDirectionTargets(doc: CourseDocument, payload: { lessonId: string; scenes: Array<{ nodeId: string }> }): string[] {
  const lesson = doc.modules.flatMap((m) => m.lessons).find((l) => l.id === payload.lessonId);
  if (!lesson) return [];
  const targets = new Set(payload.scenes.map((s) => s.nodeId));
  return lesson.graph.nodes.filter((n) => targets.has(n.id) && 'direction' in n && n.direction?.source === 'author').map((n) => n.id);
}

/**
 * Escreve `direction` nos nós-alvo da aula, sem tocar no resto. Nós cuja
 * direção mudou e que já têm mídia ficam com `media.stale = true` (o vídeo foi
 * montado com outra direção). Nós que sumiram ou mudaram de tipo são ignorados.
 * Mesmo com `force`, cada direção é conferida contra a fala ATUAL do nó (as
 * palavras dos planos, em ordem): se a fala mudou, a cena é pulada. Direções
 * ajustadas pelo autor (`source: 'author'`) só são sobrescritas com
 * `overwriteAuthored`.
 */
export function applyDirectionToDocument(doc: CourseDocument, payload: SceneDirectionPayload, opts: { overwriteAuthored?: boolean } = {}): ApplyDirectionResult {
  const byNode = new Map(payload.scenes.map((s) => [s.nodeId, s.direction]));
  let found = false;
  let applied = 0;
  let staled = 0;
  const skippedAuthored: string[] = [];
  const skippedMismatch: string[] = [];
  const modules = doc.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => {
      if (l.id !== payload.lessonId) return l;
      found = true;
      const nodes = l.graph.nodes.map((n): AnyNode => {
        const direction: SceneDirection | undefined = byNode.get(n.id);
        if (!direction || !DIRECTION_NODE_TYPES.includes(n.type)) return n;
        const prev = 'direction' in n ? n.direction : undefined;
        if (!sameWords(directionNarration(direction), spokenTextOf(n))) {
          skippedMismatch.push(n.id);
          return n;
        }
        if (prev?.source === 'author' && !opts.overwriteAuthored && stableStringify(prev) !== stableStringify(direction)) {
          skippedAuthored.push(n.id);
          return n;
        }
        applied++;
        const changed = stableStringify(prev ?? null) !== stableStringify(direction);
        const media = 'media' in n ? n.media : undefined;
        if (changed && media) {
          staled++;
          return { ...n, direction, media: { ...media, stale: true } } as AnyNode;
        }
        return { ...n, direction } as AnyNode;
      });
      return { ...l, graph: { ...l.graph, nodes } };
    }),
  }));
  if (!found) throw new DomainError('NOT_FOUND', `A aula "${payload.lessonId}" não existe mais no rascunho`);
  return { doc: CourseDocumentSchema.parse({ ...doc, modules }), applied, staled, skippedAuthored, skippedMismatch };
}

/** Serialização estável (chaves ordenadas) para comparar documentos vindos de JSONB e de parse Zod. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Objetivos + esqueleto de módulos/aulas (sem grafos) para detectar edição manual concorrente. */
function outlineSkeleton(doc: CourseDocument) {
  return { objectives: doc.objectives, completion: doc.completion, modules: doc.modules.map((m) => ({ id: m.id, title: m.title, description: m.description, lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, description: l.description, family: l.family, estimatedMinutes: l.estimatedMinutes, objectiveIds: l.objectiveIds })) })) };
}

async function outlineSkeletonChanged(db: DbOrTx, courseId: string, baseRevision: number, now: CourseDocument): Promise<boolean> {
  const [rev] = await db.select().from(s.draftRevisions).where(and(eq(s.draftRevisions.courseId, courseId), eq(s.draftRevisions.revision, baseRevision))).limit(1);
  if (!rev) return false;
  return stableStringify(outlineSkeleton(migrateCourseDocument(rev.document))) !== stableStringify(outlineSkeleton(now));
}

async function lessonGraphAtRevision(db: DbOrTx, courseId: string, revision: number, lessonId: string): Promise<LessonGraph | null> {
  const [rev] = await db.select().from(s.draftRevisions).where(and(eq(s.draftRevisions.courseId, courseId), eq(s.draftRevisions.revision, revision))).limit(1);
  if (!rev) return null;
  for (const m of rev.document.modules) for (const l of m.lessons) if (l.id === lessonId) return l.graph;
  return null;
}

/**
 * Aplica uma proposta como nova revisão do rascunho (origem "agent").
 * Propostas têm baseRevision: se a parte afetada mudou desde então, o conflito
 * é marcado e exige `force` explícito do autor.
 * - outline: substitui a estrutura.
 * - lesson / revise_lesson: substitui o grafo da aula.
 * - scene_variations: exige `choice` (índice da variação) e substitui o grafo
 *   da aula pelo grafo daquela variação; mesmas regras de conflito de `lesson`.
 * - scene_direction: grava `direction` nos nós-alvo (resto da aula intacto) e
 *   marca a mídia desses nós como desatualizada quando a direção mudou; mesmas
 *   regras de conflito de `lesson`.
 */
export interface ApplyProposalInput {
  proposalId: string;
  userId: string;
  expectedRevision: number;
  /** aplica mesmo com a aula/estrutura editada depois da proposta (conflito de revisão) */
  force?: boolean;
  /** scene_variations: índice da variação */
  choice?: number;
  /** scene_direction: sobrescreve também cenas com direção ajustada pelo autor */
  overwriteAuthored?: boolean;
  /** outline: confirma a perda das cenas das aulas removidas (sem isto, 409 CONTENT_LOSS) */
  confirmLoss?: boolean;
  /** lesson/revise_lesson: aplica mesmo uma proposta que ainda tem erros de estrutura (sem isto, 409 PROPOSAL_HAS_ERRORS) */
  acceptErrors?: boolean;
}

/**
 * Aplica uma proposta como nova revisão do rascunho (origem "agent").
 * Propostas têm baseRevision: se a parte afetada mudou desde então, o conflito
 * é marcado e exige `force` explícito do autor.
 * - outline: substitui a estrutura; aulas com o mesmo id mantêm as cenas. Se
 *   alguma aula com cenas for removida, exige `confirmLoss` (409 CONTENT_LOSS
 *   com a lista). O plano por aula vai para o resumo.
 * - lesson: substitui o grafo da aula; com `hasErrors` exige `acceptErrors`.
 * - revise_lesson: substitui o grafo; restrita a `nodeIds`, só essas cenas
 *   entram sobre a aula ATUAL (edições em outras cenas sobrevivem, mesmo com `force`).
 * - scene_variations: exige `choice` e troca SÓ a cena-alvo (opções e saídas)
 *   sobre a aula ATUAL; mesmas regras de conflito de `lesson`.
 * - scene_direction: grava `direction` nos nós-alvo (resto da aula intacto) e
 *   marca a mídia desses nós como desatualizada quando a direção mudou.
 * Aulas aplicadas são recompiladas e as contagens ficam no resumo (`compiled`).
 */
export async function applyProposal(db: DbOrTx, input: ApplyProposalInput) {
  const proposal = await getProposal(db, input.proposalId);
  if (!proposal) throw new DomainError('NOT_FOUND', 'Proposta não encontrada');
  if (proposal.kind === 'evaluate_lesson') throw new DomainError('VALIDATION', QUALITY_NOT_APPLICABLE_MESSAGE, { kind: 'quality_scorecard' });
  if (proposal.status === 'applied') throw new DomainError('CONFLICT', 'Proposta já aplicada', { appliedRevision: proposal.appliedRevision });
  if (proposal.status === 'rejected') throw new DomainError('CONFLICT', 'Proposta foi descartada');
  const draft = await getDraft(db, proposal.courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  if (draft.revision !== input.expectedRevision) throw new DomainError('CONFLICT', 'O rascunho mudou; recarregue antes de aplicar', { currentRevision: draft.revision });

  let next: CourseDocument;
  let applyInfo: Record<string, unknown> = {};
  let compiledLessonId: string | null = null;
  if (proposal.kind === 'outline') {
    const payload = OutlinePayload.parse(proposal.payload);
    const hadLessons = draft.document.modules.some((m) => m.lessons.some((l) => !isPlaceholderGraph(l.graph)));
    const skeletonChanged = draft.revision !== proposal.baseRevision && (await outlineSkeletonChanged(db, proposal.courseId, proposal.baseRevision, draft.document));
    if ((hadLessons || skeletonChanged) && draft.revision !== proposal.baseRevision && !input.force) {
      await updateProposal(db, proposal.id, { status: 'conflict' });
      throw new DomainError('CONFLICT', 'A estrutura foi editada depois desta proposta. Confirme para substituir mesmo assim.', { conflict: true, currentRevision: draft.revision });
    }
    // perda de conteúdo: aulas com cenas que a proposta remove exigem confirmação explícita
    const plan = outlineApplyPlan(draft.document, payload);
    if (plan.lost.length && !input.confirmLoss) {
      throw new DomainError('CONFLICT', `${plan.lost.length === 1 ? 'Uma aula com cenas seria removida' : `${plan.lost.length} aulas com cenas seriam removidas`} (${plan.lostScenes} ${plan.lostScenes === 1 ? 'cena' : 'cenas'}). Confirme a perda para aplicar.`, { code: 'CONTENT_LOSS', contentLoss: true, lost: plan.lost, lostScenes: plan.lostScenes, currentRevision: draft.revision });
    }
    next = applyOutline(draft.document, payload);
    applyInfo = { plan: plan.lessons, lost: plan.lost.length, lostScenes: plan.lostScenes, kept: plan.kept, retitled: plan.retitled, added: plan.added, removed: plan.removed, ...(plan.lost.length ? { lossConfirmed: true } : {}) };
  } else {
    let payload: z.infer<typeof LessonPayload> | null = null;
    let direction: SceneDirectionPayload | null = null;
    /** cenas que entram sobre o grafo atual (variação: a cena-alvo; revisão restrita: nodeIds); null = aula inteira */
    let scopedNodeIds: string[] | null = null;
    if (proposal.kind === 'scene_direction') {
      direction = SceneDirectionPayload.parse(proposal.payload);
    } else if (proposal.kind === 'scene_variations') {
      const vp = SceneVariationsPayload.parse(proposal.payload);
      if (input.choice === undefined || !Number.isInteger(input.choice)) throw new DomainError('VALIDATION', 'Escolha qual variação aplicar (choice)');
      const chosen = vp.variations[input.choice];
      if (!chosen) throw new DomainError('VALIDATION', `Variação ${input.choice} não existe (há ${vp.variations.length})`);
      payload = { lessonId: vp.lessonId, graph: chosen.graph };
      scopedNodeIds = [vp.nodeId];
    } else {
      payload = LessonPayload.parse(proposal.payload);
      if (payload.hasErrors && !input.acceptErrors) {
        const errors = payload.issues?.errors ?? [];
        throw new DomainError('CONFLICT', `A proposta ainda tem ${errors.length || 'erros'} ${errors.length === 1 ? 'erro de estrutura' : 'erros de estrutura'}. Confirme para aplicar mesmo assim e corrigir no storyboard.`, { code: 'PROPOSAL_HAS_ERRORS', hasErrors: true, errors, currentRevision: draft.revision });
      }
      if (proposal.kind === 'revise_lesson' && payload.nodeIds?.length) scopedNodeIds = payload.nodeIds;
    }
    const lessonId = direction ? direction.lessonId : payload!.lessonId;
    if (draft.revision !== proposal.baseRevision && !input.force) {
      const before = await lessonGraphAtRevision(db, proposal.courseId, proposal.baseRevision, lessonId);
      const now = draft.document.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.graph;
      if (before && now && stableStringify(before) !== stableStringify(now)) {
        await updateProposal(db, proposal.id, { status: 'conflict' });
        throw new DomainError('CONFLICT', 'Esta aula foi editada depois da proposta. Confirme para substituir mesmo assim.', { conflict: true, currentRevision: draft.revision, scoped: !!scopedNodeIds, scopedNodeIds: scopedNodeIds ?? [] });
      }
    }
    if (direction) {
      const r = applyDirectionToDocument(draft.document, direction, { overwriteAuthored: input.overwriteAuthored });
      if (r.applied === 0) {
        if (r.skippedAuthored.length) {
          throw new DomainError('CONFLICT', `${r.skippedAuthored.length === 1 ? 'A cena foi ajustada' : 'As cenas foram ajustadas'} por você depois da direção da IA. Confirme para sobrescrever.`, { authoredConflict: true, skippedAuthored: r.skippedAuthored, skippedMismatch: r.skippedMismatch, currentRevision: draft.revision });
        }
        throw new DomainError('VALIDATION', 'A fala das cenas mudou depois desta proposta; dirija as cenas de novo.', { skippedMismatch: r.skippedMismatch });
      }
      next = r.doc;
      applyInfo = { applied: r.applied, staled: r.staled, skippedAuthored: r.skippedAuthored, skippedMismatch: r.skippedMismatch };
    } else if (scopedNodeIds) {
      // só as cenas-alvo entram sobre a aula ATUAL: edições em outras cenas sobrevivem (mesmo com force)
      const current = draft.document.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)?.graph;
      if (!current) throw new DomainError('NOT_FOUND', `A aula "${lessonId}" não existe mais no rascunho`);
      next = applyLesson(draft.document, { lessonId, graph: mergeScenesIntoGraph(current, payload!.graph, scopedNodeIds) });
      applyInfo = { scopedNodeIds };
      compiledLessonId = lessonId;
    } else {
      next = applyLesson(draft.document, payload!);
      compiledLessonId = lessonId;
    }
  }
  const compiled = compiledLessonId ? compiledSummary(next, compiledLessonId) : null;
  return db.transaction(async (tx) => {
    const saved = await saveDraft(tx, { courseId: proposal.courseId, document: next, expectedRevision: draft.revision, userId: input.userId, origin: 'agent', note: `Proposta ${proposal.kind} ${proposal.id}` });
    const summary = proposal.kind === 'scene_variations'
      ? { ...proposal.summary, choice: input.choice, ...applyInfo, ...(compiled ? { compiled } : {}) }
      : proposal.kind === 'scene_direction' || proposal.kind === 'outline'
        ? { ...proposal.summary, ...applyInfo }
        : { ...proposal.summary, ...applyInfo, ...(compiled ? { compiled } : {}), ...(input.acceptErrors ? { errorsAccepted: true } : {}) };
    await updateProposal(tx, proposal.id, { status: 'applied', appliedRevision: saved.revision, decidedAt: new Date(), summary });
    await tx.insert(s.auditLogs).values({ id: newId('aud'), actorId: input.userId, action: 'agent.proposal.apply', entityType: 'course', entityId: proposal.courseId, data: { proposalId: proposal.id, kind: proposal.kind, revision: saved.revision, forced: !!input.force, ...(input.confirmLoss ? { confirmLoss: true } : {}), ...(input.acceptErrors ? { acceptErrors: true } : {}), ...(input.overwriteAuthored ? { overwriteAuthored: true } : {}), ...(input.choice !== undefined ? { choice: input.choice } : {}) } });
    return proposal.kind === 'scene_direction'
      ? { revision: saved.revision, skippedAuthored: (applyInfo.skippedAuthored as string[] | undefined) ?? [], skippedMismatch: (applyInfo.skippedMismatch as string[] | undefined) ?? [] }
      : proposal.kind === 'outline'
        ? { revision: saved.revision, plan: applyInfo.plan as OutlineLessonPlan[], lost: applyInfo.lost as number, lostScenes: applyInfo.lostScenes as number }
        : { revision: saved.revision, ...(compiled ? { compiled } : {}) };
  });
}

/** Lote atômico: ou todas as propostas entram, ou nenhuma (conflito em qualquer uma desfaz o lote). */
export async function applyProposalsBatch(db: Database, input: { proposalIds: string[]; userId: string; expectedRevision: number; force?: boolean; overwriteAuthored?: boolean; confirmLoss?: boolean; acceptErrors?: boolean }) {
  return db.transaction(async (tx) => {
    let revision = input.expectedRevision;
    let applied = 0;
    for (const id of input.proposalIds) {
      const r = await applyProposal(tx, { proposalId: id, userId: input.userId, expectedRevision: revision, force: input.force, overwriteAuthored: input.overwriteAuthored, confirmLoss: input.confirmLoss, acceptErrors: input.acceptErrors });
      revision = r.revision;
      applied++;
    }
    return { revision, applied };
  });
}

function graphSummary(g: LessonGraph | undefined) {
  return { scenes: g?.nodes.length ?? 0, decisions: g?.nodes.filter((n) => n.type === 'choice').length ?? 0, assessments: g?.nodes.filter((n) => n.type === 'assessment').length ?? 0 };
}

/**
 * Resumo de uma proposta para a revisão. Em scene_direction, com o rascunho
 * atual (`current`), traz `authoredTargets`: cenas-alvo cuja direção atual foi
 * ajustada pelo autor (a tela oferece "sobrescrever N cenas ajustadas por você").
 */
export function proposalSummary(kind: AgentTask, payload: Record<string, unknown>, current?: CourseDocument): Record<string, unknown> {
  if (kind === 'outline') {
    const p = payload as { objectives?: unknown[]; modules?: Array<{ lessons?: unknown[] }> };
    const base = { objectives: p.objectives?.length ?? 0, modules: p.modules?.length ?? 0, lessons: p.modules?.reduce((a, m) => a + (m.lessons?.length ?? 0), 0) ?? 0 };
    const parsed = current ? OutlinePayload.safeParse(payload) : null;
    if (!parsed?.success || !current) return base;
    // plano por aula contra o rascunho da proposta (a aplicação recalcula contra o rascunho atual)
    const plan = outlineApplyPlan(current, parsed.data);
    return { ...base, plan: plan.lessons, lost: plan.lost.length, lostScenes: plan.lostScenes, kept: plan.kept, retitled: plan.retitled, added: plan.added, removed: plan.removed };
  }
  if (kind === 'scene_variations') {
    const p = payload as { nodeId?: string; variations?: Array<{ label: string; graph: LessonGraph }> };
    const first = p.variations?.[0]?.graph;
    const node = first?.nodes.find((n) => n.id === p.nodeId);
    return { nodeId: p.nodeId ?? null, nodeType: node?.type ?? null, variations: p.variations?.length ?? 0, labels: p.variations?.map((v) => v.label) ?? [] };
  }
  if (kind === 'evaluate_lesson') {
    const card = (payload as { scorecard?: { overall?: number; scores?: Record<string, number | null>; findings?: unknown[]; basis?: { video?: string[]; simulated?: boolean } } }).scorecard;
    return { overall: card?.overall ?? null, scores: card?.scores ?? {}, findings: card?.findings?.length ?? 0, videos: card?.basis?.video?.length ?? 0, simulated: card?.basis?.simulated ?? false };
  }
  if (kind === 'scene_direction') {
    const p = payload as { scenes?: Array<{ direction?: SceneDirection }> };
    const shots = p.scenes?.flatMap((s) => s.direction?.shots ?? []) ?? [];
    const authoredTargets = current && typeof (payload as { lessonId?: unknown }).lessonId === 'string' && Array.isArray(p.scenes)
      ? authoredDirectionTargets(current, payload as { lessonId: string; scenes: Array<{ nodeId: string }> })
      : [];
    return { scenes: p.scenes?.length ?? 0, shots: shots.length, slides: shots.filter((s) => !!s.slide).length, cameras: new Set(shots.map((s) => s.cameraId ?? '')).size, authoredTargets };
  }
  return graphSummary((payload as { graph?: LessonGraph }).graph);
}

/** Contagem de cenas alteradas/novas/removidas entre o grafo atual e o proposto (para a revisão). */
export function graphDiffSummary(before: LessonGraph, after: LessonGraph): { changed: number; added: number; removed: number; unchanged: number } {
  const prev = new Map(before.nodes.map((n) => [n.id, stableStringify(n)]));
  const next = new Map(after.nodes.map((n) => [n.id, stableStringify(n)]));
  let changed = 0, added = 0, unchanged = 0;
  for (const [id, json] of next) {
    const p = prev.get(id);
    if (p === undefined) added++;
    else if (p !== json) changed++;
    else unchanged++;
  }
  const removed = [...prev.keys()].filter((id) => !next.has(id)).length;
  return { changed, added, removed, unchanged };
}

export function publicRun(r: AgentRunRow) {
  return { id: r.id, task: r.task, lessonId: r.lessonId, status: r.status, provider: r.provider, model: r.model, instructionsVersion: r.instructionsVersion, latencyMs: r.latencyMs, usage: r.usage, costUsd: r.costUsd, fallbackUsed: r.fallbackUsed, repairs: r.repairs, error: r.error, proposalId: r.proposalId, createdAt: r.createdAt, startedAt: r.startedAt, finishedAt: r.finishedAt };
}

export function publicProposal(p: ProposalRow) {
  return { id: p.id, runId: p.runId, kind: p.kind, lessonId: p.lessonId, baseRevision: p.baseRevision, status: p.status, rationale: p.rationale, summary: p.summary, payload: p.payload, appliedRevision: p.appliedRevision, createdAt: p.createdAt };
}
