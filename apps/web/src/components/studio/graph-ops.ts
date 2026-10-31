import {
  AnyNodeSchema,
  type AnyNode,
  type Condition,
  type CourseDocument,
  type Edge,
  type ExecutableNodeType,
  type Lesson,
  type LessonGraph,
  type MediaRef,
  type Module,
  type NodeType,
  type Objective,
  NODE_TYPE_LABELS,
  SCHEMA_VERSION,
  richTextFromPlain,
  richTextToPlain,
} from '@lms/course-schema';

/**
 * Operações puras sobre o grafo da aula e o documento do curso.
 * Nenhuma regra de validação vive aqui — isso é papel de `compileLesson`.
 * Toda função devolve um novo objeto (nunca muta a entrada).
 */

export function shortId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto.getRandomValues(new Uint8Array(6)) : null;
  for (let i = 0; i < 6; i++) {
    const n = bytes ? bytes[i]! % alphabet.length : Math.floor(Math.random() * alphabet.length);
    out += alphabet[n];
  }
  return out;
}

export const newNodeId = (type: string) => `${type}_${shortId()}`;
export const newOptionId = () => `opt_${shortId()}`;
export const newEdgeId = () => `edge_${shortId()}`;
export const newModuleId = () => `mod_${shortId()}`;
export const newLessonId = () => `aula_${shortId()}`;

export function slugId(prefix: string, text: string, taken: Set<string>): string {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || shortId();
  let id = `${prefix}_${base}`;
  let i = 2;
  while (taken.has(id)) id = `${prefix}_${base}_${i++}`;
  return id;
}

/* ------------------------------------------------------------------ */
/* Ordem e layout                                                      */
/* ------------------------------------------------------------------ */

/** Nós em ordem de BFS a partir do início; os inalcançáveis vêm depois, na ordem do array. */
export function orderedNodes(graph: LessonGraph): { node: AnyNode; reachable: boolean }[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Edge[]>();
  for (const e of graph.edges) out.set(e.from, [...(out.get(e.from) ?? []), e]);
  const seen = new Set<string>();
  const result: { node: AnyNode; reachable: boolean }[] = [];
  const queue: string[] = byId.has(graph.startNodeId) ? [graph.startNodeId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    result.push({ node, reachable: true });
    for (const e of out.get(id) ?? []) if (!seen.has(e.to) && byId.has(e.to)) queue.push(e.to);
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) result.push({ node: n, reachable: false });
  return result;
}

/** Camadas BFS (profundidade mínima a partir do início). Inalcançáveis ficam numa camada extra. */
export function bfsLayers(graph: LessonGraph): string[][] {
  const byId = new Set(graph.nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const e of graph.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const depth = new Map<string, number>();
  const queue: string[] = byId.has(graph.startNodeId) ? [graph.startNodeId] : [];
  if (queue[0]) depth.set(queue[0], 0);
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const to of out.get(id) ?? []) {
      if (!byId.has(to) || depth.has(to)) continue;
      depth.set(to, d + 1);
      queue.push(to);
    }
  }
  const layers: string[][] = [];
  for (const n of graph.nodes) {
    const d = depth.get(n.id);
    if (d === undefined) continue;
    (layers[d] ??= []).push(n.id);
  }
  const unreachable = graph.nodes.filter((n) => !depth.has(n.id)).map((n) => n.id);
  if (unreachable.length) layers.push(unreachable);
  return layers.filter(Boolean);
}

const LAYER_GAP_Y = 180;
const NODE_GAP_X = 300;

/** Posições para o mapa: usa `layout.positions`; o que faltar ganha posição determinística por camada. */
export function resolvePositions(graph: LessonGraph): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = { ...graph.layout.positions };
  const layers = bfsLayers(graph);
  layers.forEach((layer, li) => {
    const missing = layer.filter((id) => !positions[id]);
    if (missing.length === 0) return;
    // alinha ao centro das posições existentes na camada, se houver
    const present = layer.filter((id) => positions[id]).map((id) => positions[id]!);
    const centerX = present.length ? present.reduce((s, p) => s + p.x, 0) / present.length : 0;
    const baseY = present.length ? Math.max(...present.map((p) => p.y)) : li * LAYER_GAP_Y;
    const width = (missing.length - 1) * NODE_GAP_X;
    missing.forEach((id, i) => {
      positions[id] = { x: centerX - width / 2 + i * NODE_GAP_X + (present.length ? NODE_GAP_X : 0), y: baseY };
    });
  });
  return positions;
}

/* ------------------------------------------------------------------ */
/* Fábricas                                                            */
/* ------------------------------------------------------------------ */

const emptyDoc = () => richTextFromPlain('');

export function createNode(type: ExecutableNodeType, id = newNodeId(type)): AnyNode {
  const base = { id, objectiveIds: [] as string[], required: true, title: NODE_TYPE_LABELS[type] };
  switch (type) {
    case 'scenario':
      return { ...base, type, body: emptyDoc() };
    case 'content':
      return { ...base, type, body: emptyDoc() };
    case 'choice':
      return {
        ...base,
        type,
        prompt: emptyDoc(),
        options: [
          { id: newOptionId(), label: 'Opção 1' },
          { id: newOptionId(), label: 'Opção 2' },
        ],
      };
    case 'consequence':
      return { ...base, type, body: emptyDoc(), tone: 'neutral' };
    case 'reflection':
      return { ...base, type, prompt: emptyDoc(), minLength: 20, maxLength: 1500 };
    case 'assessment':
      return {
        ...base,
        type,
        prompt: emptyDoc(),
        mode: 'single',
        options: [
          { id: newOptionId(), label: 'Alternativa 1', correct: true },
          { id: newOptionId(), label: 'Alternativa 2', correct: false },
        ],
        passing: { kind: 'all_correct' },
        maxAttempts: 2,
      };
    case 'end':
      return { ...base, type, summary: emptyDoc(), outcomeLabel: 'Aula concluída' };
  }
}

/** Grafo mínimo aceito pelo compilador: situação inicial → encerramento. */
export function minimalLessonGraph(): LessonGraph {
  const start = createNode('scenario');
  const end = createNode('end');
  return {
    schemaVersion: SCHEMA_VERSION,
    startNodeId: start.id,
    variables: [],
    nodes: [start, end],
    edges: [{ id: newEdgeId(), from: start.id, to: end.id }],
    layout: { positions: { [start.id]: { x: 0, y: 0 }, [end.id]: { x: 0, y: LAYER_GAP_Y } } },
  };
}

export function createLesson(title: string): Lesson {
  return { id: newLessonId(), title, description: '', estimatedMinutes: 15, family: 'decision_consequence', objectiveIds: [], graph: minimalLessonGraph() };
}

export function createModule(title: string): Module {
  return { id: newModuleId(), title, description: '', lessons: [] };
}

export function createObjective(title: string, taken: Set<string>): Objective {
  return { id: slugId('obj', title, taken), title, criterion: '', required: true };
}

/* ------------------------------------------------------------------ */
/* Mutações do grafo                                                   */
/* ------------------------------------------------------------------ */

export function replaceNode(graph: LessonGraph, node: AnyNode): LessonGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)) };
}

export function addNode(graph: LessonGraph, node: AnyNode, position?: { x: number; y: number }): LessonGraph {
  const positions = { ...graph.layout.positions };
  if (position) positions[node.id] = position;
  else {
    const resolved = resolvePositions(graph);
    const maxY = Math.max(0, ...Object.values(resolved).map((p) => p.y));
    positions[node.id] = { x: 0, y: maxY + LAYER_GAP_Y };
  }
  return { ...graph, nodes: [...graph.nodes, node], layout: { positions } };
}

/** Remove o nó, todas as arestas que o tocam e sua posição. Se era o início, o primeiro nó restante assume. */
export function removeNode(graph: LessonGraph, nodeId: string): LessonGraph {
  const nodes = graph.nodes.filter((n) => n.id !== nodeId);
  if (nodes.length === 0) return graph; // o schema exige ao menos um nó
  const edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  const positions = { ...graph.layout.positions };
  delete positions[nodeId];
  const startNodeId = graph.startNodeId === nodeId ? nodes[0]!.id : graph.startNodeId;
  return { ...graph, nodes, edges, startNodeId, layout: { positions } };
}

export function duplicateNode(graph: LessonGraph, nodeId: string): { graph: LessonGraph; newId: string } | null {
  const src = graph.nodes.find((n) => n.id === nodeId);
  if (!src) return null;
  const newId = newNodeId(src.type);
  let copy: AnyNode = structuredClone(src);
  copy = { ...copy, id: newId, title: src.title ? `${src.title} (cópia)` : undefined };
  if (copy.type === 'choice' || copy.type === 'assessment') {
    copy = { ...copy, options: copy.options.map((o) => ({ ...o, id: newOptionId() })) } as AnyNode;
  }
  const pos = resolvePositions(graph)[nodeId] ?? { x: 0, y: 0 };
  return { graph: addNode(graph, copy, { x: pos.x + 60, y: pos.y + 60 }), newId };
}

export function setStartNode(graph: LessonGraph, nodeId: string): LessonGraph {
  return graph.nodes.some((n) => n.id === nodeId) ? { ...graph, startNodeId: nodeId } : graph;
}

export function moveNode(graph: LessonGraph, nodeId: string, position: { x: number; y: number }): LessonGraph {
  const current = graph.layout.positions[nodeId];
  if (current && current.x === position.x && current.y === position.y) return graph;
  return { ...graph, layout: { positions: { ...graph.layout.positions, [nodeId]: { x: Math.round(position.x), y: Math.round(position.y) } } } };
}

export function removeEdges(graph: LessonGraph, edgeIds: string[]): LessonGraph {
  const set = new Set(edgeIds);
  const touched = new Set(graph.edges.filter((e) => set.has(e.id)).map((e) => e.from));
  let next = { ...graph, edges: graph.edges.filter((e) => !set.has(e.id)) };
  for (const from of touched) next = normalizeOutgoing(next, from);
  return next;
}

export function replaceEdge(graph: LessonGraph, edge: Edge): LessonGraph {
  return normalizeOutgoing({ ...graph, edges: graph.edges.map((e) => (e.id === edge.id ? edge : e)) }, edge.from);
}

/** Aresta "principal" de um nó que não é decisão: a sem condição (preferindo a marcada como fallback). */
export function primaryEdge(graph: LessonGraph, nodeId: string): Edge | undefined {
  const outs = graph.edges.filter((e) => e.from === nodeId && !e.optionId);
  return outs.find((e) => e.isDefault) ?? outs.find((e) => !e.condition);
}

export function conditionalEdges(graph: LessonGraph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.from === nodeId && !e.optionId && !!e.condition && !e.isDefault);
}

/**
 * Define/substitui a saída única de um nó que não é decisão. Se o nó tem saídas
 * condicionais, a saída única vira o fallback (`isDefault`).
 */
export function setNextEdge(graph: LessonGraph, from: string, to: string | null): LessonGraph {
  const existing = primaryEdge(graph, from);
  let edges: Edge[];
  if (to === null) {
    edges = existing ? graph.edges.filter((e) => e.id !== existing.id) : graph.edges;
  } else if (existing) {
    edges = graph.edges.map((e) => (e.id === existing.id ? { ...e, to, condition: undefined } : e));
  } else {
    edges = [...graph.edges, { id: newEdgeId(), from, to }];
  }
  return normalizeOutgoing({ ...graph, edges }, from);
}

/** Substitui a aresta de uma opção de decisão (uma aresta por opção). */
export function setOptionEdge(graph: LessonGraph, from: string, optionId: string, to: string | null): LessonGraph {
  const rest = graph.edges.filter((e) => !(e.from === from && e.optionId === optionId));
  const edges = to === null ? rest : [...rest, { id: newEdgeId(), from, to, optionId }];
  return { ...graph, edges };
}

/** Adiciona uma saída condicional com prioridade única. */
export function addConditionalEdge(graph: LessonGraph, from: string, to: string, condition: Condition): LessonGraph {
  const used = new Set(conditionalEdges(graph, from).map((e) => e.priority ?? 0));
  let priority = 0;
  while (used.has(priority)) priority++;
  const edges = [...graph.edges, { id: newEdgeId(), from, to, condition, priority }];
  return normalizeOutgoing({ ...graph, edges }, from);
}

/**
 * Garante a invariante do compilador para nós que não são decisão: com mais
 * de uma saída, exatamente uma é fallback (a sem condição); com uma só, não há
 * fallback marcado desnecessariamente.
 */
export function normalizeOutgoing(graph: LessonGraph, nodeId: string): LessonGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node || node.type === 'choice') return graph;
  const outs = graph.edges.filter((e) => e.from === nodeId);
  if (outs.length <= 1) {
    const only = outs[0];
    if (only && only.isDefault && !only.condition) {
      return { ...graph, edges: graph.edges.map((e) => (e.id === only.id ? { ...e, isDefault: undefined } : e)) };
    }
    return graph;
  }
  const unconditioned = outs.filter((e) => !e.condition);
  if (unconditioned.length === 0) return graph; // o usuário ainda precisa escolher o fallback
  const fallbackId = (unconditioned.find((e) => e.isDefault) ?? unconditioned[0]!).id;
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (e.from !== nodeId) return e;
      if (e.id === fallbackId) return { ...e, isDefault: true, condition: undefined };
      return e.isDefault ? { ...e, isDefault: undefined } : e;
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Sequência (roteiro): inserir e remover religando                    */
/* ------------------------------------------------------------------ */

/** Arestas que chegam a um nó. */
export function incomingEdges(graph: LessonGraph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.to === nodeId);
}

/**
 * Insere `node` logo depois de `afterId`, religando a sequência:
 * - se `optionId` é dado (afterId é decisão), o novo nó vira o destino da opção
 *   e herda o destino anterior dela como sua própria saída;
 * - senão, o novo nó assume a saída principal de `afterId` e `afterId` passa a
 *   apontar para ele. Saídas condicionais de `afterId` não são tocadas.
 * Nós de encerramento nunca ganham saída. Se `afterId` é decisão e não há
 * `optionId`, o nó entra solto (o autor liga depois).
 */
export function insertNodeAfter(graph: LessonGraph, afterId: string, node: AnyNode, opts: { optionId?: string } = {}): LessonGraph {
  const after = graph.nodes.find((n) => n.id === afterId);
  let next = addNode(graph, node);
  if (!after || after.type === 'end') return next;
  if (after.type === 'choice') {
    if (!opts.optionId) return next;
    const prevTo = graph.edges.find((e) => e.from === afterId && e.optionId === opts.optionId)?.to;
    next = setOptionEdge(next, afterId, opts.optionId, node.id);
    if (prevTo && prevTo !== node.id && node.type !== 'end') next = setNextEdge(next, node.id, prevTo);
    return next;
  }
  const prev = primaryEdge(graph, afterId);
  next = setNextEdge(next, afterId, node.id);
  if (prev && prev.to !== node.id && node.type !== 'end') next = setNextEdge(next, node.id, prev.to);
  return next;
}

/**
 * Saída "única e sem ambiguidade" de um nó: a única aresta de saída, desde que
 * não tenha condição. Decisões com mais de uma opção não têm saída única.
 */
export function soleExit(graph: LessonGraph, nodeId: string): Edge | undefined {
  const outs = graph.edges.filter((e) => e.from === nodeId);
  return outs.length === 1 && !outs[0]!.condition ? outs[0] : undefined;
}

/**
 * Remove o nó religando quem chegava nele à sua saída única (quando existe e
 * é inequívoca). Sem saída única, comporta-se como `removeNode` (as arestas de
 * chegada são apagadas). Se era o início, o destino religado assume.
 */
export function removeNodeRewiring(graph: LessonGraph, nodeId: string): LessonGraph {
  const exit = soleExit(graph, nodeId);
  if (!exit || exit.to === nodeId) return removeNode(graph, nodeId);
  const nodes = graph.nodes.filter((n) => n.id !== nodeId);
  if (nodes.length === 0) return graph;
  const touched = new Set<string>();
  const edges: Edge[] = [];
  for (const e of graph.edges) {
    if (e.from === nodeId) continue;
    if (e.to !== nodeId) {
      edges.push(e);
      continue;
    }
    if (e.from === exit.to) continue; // evitaria um auto-laço
    touched.add(e.from);
    edges.push({ ...e, to: exit.to });
  }
  const positions = { ...graph.layout.positions };
  delete positions[nodeId];
  const startNodeId = graph.startNodeId === nodeId ? exit.to : graph.startNodeId;
  let next: LessonGraph = { ...graph, nodes, edges, startNodeId, layout: { positions } };
  for (const from of touched) next = normalizeOutgoing(next, from);
  return next;
}

/** Marca a mídia gerada como desatualizada quando o texto narrado muda. Não gera nada. */
export function markMediaStale(node: AnyNode): AnyNode {
  const media = nodeMedia(node);
  return media?.generatedFrom && !media.stale ? withNodeMedia(node, { ...media, stale: true }) : node;
}

/* ------------------------------------------------------------------ */
/* Condições                                                           */
/* ------------------------------------------------------------------ */

const OP_LABEL: Record<string, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

export function describeCondition(cond: Condition | undefined, nodeTitle?: (id: string) => string): string {
  if (!cond) return '';
  const t = nodeTitle ?? ((id: string) => id);
  switch (cond.op) {
    case 'always':
      return 'sempre';
    case 'and':
      return cond.conditions.map((c) => describeCondition(c, t)).join(' e ');
    case 'or':
      return cond.conditions.map((c) => describeCondition(c, t)).join(' ou ');
    case 'not':
      return `não (${describeCondition(cond.condition, t)})`;
    case 'in':
      return `${cond.var} em [${cond.values.join(', ')}]`;
    case 'answered':
      return cond.optionId ? `respondeu "${cond.optionId}" em ${t(cond.nodeId)}` : `respondeu ${t(cond.nodeId)}`;
    case 'passed':
      return `aprovado em ${t(cond.nodeId)}`;
    default:
      return `${cond.var} ${OP_LABEL[cond.op] ?? cond.op} ${String(cond.value)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Documento do curso                                                  */
/* ------------------------------------------------------------------ */

/** Aplica `fn` à aula; devolve o MESMO documento se nada mudou (evita marcar como sujo à toa). */
export function updateLesson(doc: CourseDocument, lessonId: string, fn: (l: Lesson) => Lesson): CourseDocument {
  let changed = false;
  const modules = doc.modules.map((m) => {
    const idx = m.lessons.findIndex((l) => l.id === lessonId);
    if (idx === -1) return m;
    const current = m.lessons[idx]!;
    const next = fn(current);
    if (next === current) return m;
    changed = true;
    return { ...m, lessons: m.lessons.map((l, i) => (i === idx ? next : l)) };
  });
  return changed ? { ...doc, modules } : doc;
}

export function updateLessonGraph(doc: CourseDocument, lessonId: string, fn: (g: LessonGraph) => LessonGraph): CourseDocument {
  return updateLesson(doc, lessonId, (l) => {
    const graph = fn(l.graph);
    return graph === l.graph ? l : { ...l, graph };
  });
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item!);
  return copy;
}

/* ------------------------------------------------------------------ */
/* Mídia                                                               */
/* ------------------------------------------------------------------ */

/** Tipos de nó cujo schema declara `media` — derivado do schema, não de uma lista fixa. */
export const MEDIA_NODE_TYPES: ReadonlySet<NodeType> = new Set(
  AnyNodeSchema.options.filter((o) => 'media' in o.shape).map((o) => o.shape.type.value as NodeType),
);

export function nodeSupportsMedia(node: AnyNode): boolean {
  return MEDIA_NODE_TYPES.has(node.type);
}

export function nodeMedia(node: AnyNode): MediaRef | undefined {
  return (node as AnyNode & { media?: MediaRef }).media;
}

export function withNodeMedia(node: AnyNode, media: MediaRef | undefined): AnyNode {
  const { media: _old, ...rest } = node as AnyNode & { media?: MediaRef };
  void _old;
  return (media ? { ...rest, media } : rest) as AnyNode;
}

/** Texto narrável do bloco (roteiro padrão para geração de vídeo). */
export function nodeScriptText(node: AnyNode): string {
  switch (node.type) {
    case 'scenario':
    case 'content':
    case 'consequence':
      return richTextToPlain(node.body);
    case 'choice':
    case 'reflection':
    case 'assessment':
      return richTextToPlain(node.prompt);
    case 'end':
      return richTextToPlain(node.summary);
    default:
      return '';
  }
}

/** Igualdade estrutural ignorando ordem de chaves e propriedades `undefined`. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

/** Cópia do documento sem a propriedade `media` de nenhum nó. */
export function stripMedia(doc: CourseDocument): CourseDocument {
  return {
    ...doc,
    modules: doc.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({ ...l, graph: { ...l.graph, nodes: l.graph.nodes.map((n) => withNodeMedia(n, undefined)) } })),
    })),
  };
}

export function docsEqualIgnoringMedia(a: CourseDocument, b: CourseDocument): boolean {
  return deepEqual(stripMedia(a), stripMedia(b));
}

type MediaIndex = Map<string, { exists: boolean; media: MediaRef | undefined }>;
function indexMedia(doc: CourseDocument): MediaIndex {
  const idx: MediaIndex = new Map();
  for (const m of doc.modules) for (const l of m.lessons) for (const n of l.graph.nodes) idx.set(`${l.id}/${n.id}`, { exists: true, media: nodeMedia(n) });
  return idx;
}

/**
 * Mescla a `media` do servidor nos nós locais cuja mídia NÃO mudou localmente
 * em relação à base (último documento conhecido no servidor). Alterações locais
 * de mídia prevalecem. Devolve o mesmo objeto se nada mudou.
 */
export function mergeServerMedia(local: CourseDocument, base: CourseDocument, server: CourseDocument): CourseDocument {
  const baseIdx = indexMedia(base);
  const serverIdx = indexMedia(server);
  let changed = false;
  const modules = local.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => ({
      ...l,
      graph: {
        ...l.graph,
        nodes: l.graph.nodes.map((n) => {
          const key = `${l.id}/${n.id}`;
          const s = serverIdx.get(key);
          if (!s) return n;
          const localMedia = nodeMedia(n);
          const baseMedia = baseIdx.get(key)?.media;
          if (!deepEqual(localMedia, baseMedia)) return n; // mídia editada localmente: mantém
          if (deepEqual(localMedia, s.media)) return n;
          changed = true;
          return withNodeMedia(n, s.media);
        }),
      },
    })),
  }));
  return changed ? { ...local, modules } : local;
}

/**
 * Rebase estreito após 409: se o servidor só difere da base em `media` de nós
 * (o que o worker de mídia e o reaproveitamento gravam), traz essas mídias para
 * o documento local e permite reenviar a gravação. Caso contrário, null.
 */
export function narrowRebase(local: CourseDocument, base: CourseDocument, server: CourseDocument): CourseDocument | null {
  if (!docsEqualIgnoringMedia(base, server)) return null;
  return mergeServerMedia(local, base, server);
}
