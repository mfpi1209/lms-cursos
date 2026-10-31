import { isRichTextEmpty, mediaPresentationStale, variableScope, type AnyNode, type Condition, type CourseDocument, type LessonGraph, type Presentation, type Scalar, type VariableDeclaration } from '@lms/course-schema';
import { buildStoryboard } from '@/components/studio/storyboard/scene-model';
import type { QueueLike } from '@/components/studio/video-stats';

/**
 * Modo de teste do estúdio: links "Testar a partir daqui", valores padrão das
 * variáveis e estado do vídeo de cada cena. Tudo puro (sem React).
 */

/* ------------------------------ variáveis ------------------------------- */

export interface TestVariable {
  name: string;
  label: string;
  type: VariableDeclaration['type'];
  scope: 'lesson' | 'course';
  initial: Scalar;
  /** valores conhecidos (texto): os que o curso grava ou compara, na ordem em que aparecem */
  options: Scalar[];
}

function collectCondition(c: Condition | undefined, name: string, out: Scalar[]) {
  if (!c) return;
  switch (c.op) {
    case 'and':
    case 'or':
      for (const x of c.conditions) collectCondition(x, name, out);
      return;
    case 'not':
      collectCondition(c.condition, name, out);
      return;
    case 'in':
      if (c.var === name) out.push(...c.values);
      return;
    case 'eq':
    case 'neq':
      if (c.var === name) out.push(c.value);
      return;
    default:
  }
}

/** Valores que um texto pode ter: `set` em efeitos e comparações em condições (curso inteiro), depois o inicial. */
function knownValues(doc: CourseDocument | undefined, graph: LessonGraph, v: VariableDeclaration): Scalar[] {
  const graphs = doc ? doc.modules.flatMap((m) => m.lessons.map((l) => l.graph)) : [graph];
  const sets: Scalar[] = [];
  const conds: Scalar[] = [];
  for (const g of graphs) {
    if (!g.variables.some((d) => d.name === v.name)) continue;
    for (const e of g.edges) {
      for (const f of e.effects ?? []) if (f.var === v.name && f.op === 'set') sets.push(f.value);
      collectCondition(e.condition, v.name, conds);
    }
    for (const n of g.nodes) if (n.type === 'consequence') for (const f of n.effects ?? []) if (f.var === v.name && f.op === 'set') sets.push(f.value);
  }
  const all = [...sets, ...conds, v.initial].filter((x) => typeof x === v.type);
  return [...new Set(all)];
}

export function testVariables(graph: LessonGraph, doc?: CourseDocument): TestVariable[] {
  return graph.variables.map((v) => ({
    name: v.name,
    label: v.label?.trim() || v.name,
    type: v.type,
    scope: variableScope(v),
    initial: v.initial,
    options: v.type === 'string' ? knownValues(doc, graph, v) : v.type === 'boolean' ? [true, false] : [],
  }));
}

/** A aula LÊ variáveis de curso (condições)? Então o teste precisa escolher o valor (ex.: `perfil`). */
export function readsCourseVariables(graph: LessonGraph): boolean {
  const names = new Set(graph.variables.filter((v) => variableScope(v) === 'course').map((v) => v.name));
  if (names.size === 0) return false;
  const found: Scalar[] = [];
  return graph.edges.some((e) => [...names].some((n) => {
    found.length = 0;
    collectCondition(e.condition, n, found);
    return found.length > 0;
  }));
}

/**
 * Valores padrão para começar numa cena:
 * - se TODAS as arestas que chegam na cena exigem `var == valor` (variante por
 *   perfil), usa esse valor — a cena `q03_experiencia` já abre com `experiencia`;
 * - senão, o primeiro valor conhecido (textos) ou o inicial.
 */
export function defaultTestValues(graph: LessonGraph, nodeId: string, doc?: CourseDocument): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  const vars = testVariables(graph, doc);
  for (const v of vars) out[v.name] = v.type === 'string' && v.options.length ? v.options[0]! : v.initial;
  const incoming = graph.edges.filter((e) => e.to === nodeId);
  for (const v of vars) {
    if (incoming.length === 0) continue;
    const required = incoming.map((e) => (e.condition && e.condition.op === 'eq' && e.condition.var === v.name ? e.condition.value : undefined));
    const first = required[0];
    if (first !== undefined && required.every((x) => x === first) && typeof first === v.type) out[v.name] = first;
  }
  return out;
}

/* -------------------------------- links --------------------------------- */

export const TEST_NODE_PARAM = 'cena';
export const TEST_VAR_PREFIX = 'v.';

export function previewHref(courseId: string, lessonId: string, opts: { nodeId?: string; variables?: Record<string, Scalar> } = {}): string {
  const qs = new URLSearchParams();
  if (opts.nodeId) qs.set(TEST_NODE_PARAM, opts.nodeId);
  for (const [k, v] of Object.entries(opts.variables ?? {})) qs.set(`${TEST_VAR_PREFIX}${k}`, String(v));
  const q = qs.toString();
  return `/estudio/cursos/${encodeURIComponent(courseId)}/aulas/${encodeURIComponent(lessonId)}/previa${q ? `?${q}` : ''}`;
}

/** Lê `?cena=` e `?v.<nome>=` contra as declarações (tipos convertidos; desconhecidos ignorados). */
export function parseTestParams(graph: LessonGraph, params: Record<string, string | string[] | undefined>): { nodeId?: string; variables: Record<string, Scalar> } {
  const one = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);
  const nodeId = one(params[TEST_NODE_PARAM]);
  const variables: Record<string, Scalar> = {};
  for (const v of graph.variables) {
    const raw = one(params[`${TEST_VAR_PREFIX}${v.name}`]);
    if (raw === undefined) continue;
    if (v.type === 'number') {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) variables[v.name] = n;
    } else if (v.type === 'boolean') {
      if (raw === 'true' || raw === 'false') variables[v.name] = raw === 'true';
    } else variables[v.name] = raw.slice(0, 200);
  }
  return { nodeId: nodeId && graph.nodes.some((n) => n.id === nodeId) ? nodeId : undefined, variables };
}

/* --------------------------------- vídeo -------------------------------- */

export type SceneVideoStatus = 'ready' | 'stale' | 'stale_presentation' | 'generating' | 'none';

export const VIDEO_STATUS_LABEL: Record<SceneVideoStatus, string> = {
  ready: 'pronto',
  stale: 'desatualizado',
  stale_presentation: 'desatualizado (apresentação mudou)',
  generating: 'em geração',
  none: 'sem vídeo',
};

function mediaOf(n: AnyNode) {
  return n.type === 'scenario' || n.type === 'content' || n.type === 'choice' || n.type === 'consequence' ? n.media : undefined;
}

export function hasDirection(n: AnyNode): boolean {
  return (n.type === 'scenario' || n.type === 'content' || n.type === 'choice' || n.type === 'consequence') && !!n.direction;
}

export function hasVideo(n: AnyNode): boolean {
  return mediaOf(n)?.kind === 'video';
}

/** Estado do vídeo de uma cena; com `presentation`, vídeo gerado com outra apresentação conta como `stale_presentation`. */
export function sceneVideoStatus(lessonId: string, n: AnyNode, queue?: readonly QueueLike[], presentation?: Presentation): SceneVideoStatus {
  if (queue?.some((q) => q.lessonId === lessonId && q.nodeId === n.id && (q.status === 'queued' || q.status === 'running'))) return 'generating';
  const m = mediaOf(n);
  if (m?.kind === 'video') {
    if (m.stale) return 'stale';
    if (mediaPresentationStale(m, presentation, n)) return 'stale_presentation';
    return 'ready';
  }
  return 'none';
}

/** Cena "de vídeo": já tem vídeo ou tem direção (vídeo planejado). */
export function isVideoScene(n: AnyNode): boolean {
  return hasVideo(n) || hasDirection(n);
}

/** Cena que RECEBE vídeo: tipo com mídia e texto (ou fala) para narrar — mesmo sem direção nem vídeo ainda. */
export function isNarratedScene(n: AnyNode): boolean {
  if (n.type !== 'scenario' && n.type !== 'content' && n.type !== 'choice' && n.type !== 'consequence') return false;
  const text = n.type === 'choice' ? n.prompt : n.body;
  if (text && !isRichTextEmpty(text)) return true;
  return 'narration' in n && typeof n.narration === 'string' && n.narration.trim().length > 0;
}

/* --------------------------------- cenas -------------------------------- */

export interface TestScene {
  node: AnyNode;
  seq: number;
  group: 'main' | 'branch' | 'unreachable';
  title: string;
}

/** Cenas na ordem do storyboard, agrupadas (caminho, ramos de decisão, fora do caminho). */
export function testScenes(graph: LessonGraph): TestScene[] {
  const model = buildStoryboard(graph);
  return model.all.map((e) => ({
    node: e.node,
    seq: e.seq,
    group: !e.reachable ? 'unreachable' : model.groupedUnder.has(e.node.id) ? 'branch' : 'main',
    title: e.node.title?.trim() || e.node.id,
  }));
}

export const SCENE_GROUP_LABEL: Record<TestScene['group'], string> = {
  main: 'Caminho principal',
  branch: 'Ramos das decisões',
  unreachable: 'Fora do caminho',
};
