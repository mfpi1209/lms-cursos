import {
  applyEffects,
  isExecutableNodeType,
  scalarType,
  variableScope,
  type LessonGraph,
  type Scalar,
  type VariableValues,
} from '@lms/course-schema';
import { createInitialState, EngineError, type AnswerRecord, type AttemptState, type PathStep } from './state';

/**
 * Navegação para trás ("Cena anterior" / "Voltar para esta cena").
 *
 * Estratégia: SNAPSHOT por passo do caminho, com REPLAY só como reserva.
 * - Cada entrada de `state.path` guarda `vars` (variáveis ao entrar no nó) e,
 *   em revisitas, `entryAnswer` (a resposta que o nó já tinha ao entrar).
 * - Voltar ao passo `i` = variáveis de `path[i].vars`; respostas desfeitas do
 *   fim para o começo até `i` (cada nó volta ao que tinha ao entrar); cenas
 *   concluídas = as que ficaram antes de `i`; o caminho é cortado em `i`.
 * - Estados gravados antes dos snapshots (sem `vars`) são reconstruídos por
 *   replay das arestas do próprio caminho (efeitos da aresta escolhida + da
 *   consequência de chegada), partindo das variáveis iniciais.
 *
 * Por que snapshot e não só replay: o replay a partir das intenções depende
 * dos eventos (fora do estado), das variáveis de curso herdadas no início
 * (que o estado não separa do que a própria aula gravou) e de respostas
 * sobrescritas em revisitas. O snapshot é exato, determinístico, pequeno
 * (≤ 30 escalares por passo) e vive no próprio estado.
 *
 * Função pura: o servidor valida dono/revisão, grava o novo estado e registra
 * o evento `navigated_back` (os eventos continuam só de inclusão).
 */

export type NavigationTarget =
  /** uma cena para trás */
  | { kind: 'back' }
  /** uma cena já visitada do caminho atual (índice em `state.path`; `nodeId` confere) */
  | { kind: 'goto'; pathIndex: number; nodeId?: string };

export interface NavigationOptions {
  /** `allowBack` da aula; ausente = permitido */
  allowBack?: boolean;
}

export interface NavigationResult {
  state: AttemptState;
  fromNodeId: string;
  toNodeId: string;
  /** posição (em `state.path`) para onde voltou */
  pathIndex: number;
  /** quantos passos foram desfeitos */
  undone: number;
  /** o caminho antigo não tinha snapshots e foi reconstruído por replay */
  reconstructed: boolean;
}

export type BackAvailability = { ok: true } | { ok: false; code: 'ATTEMPT_COMPLETED' | 'BACK_NOT_ALLOWED' | 'NO_PREVIOUS_SCENE'; message: string };

/** Pode voltar? (concluída → "Rever"; aula estrita → não; primeira cena → não) */
export function backAvailability(state: AttemptState, opts: NavigationOptions = {}): BackAvailability {
  if (state.status === 'completed') return { ok: false, code: 'ATTEMPT_COMPLETED', message: 'A aula já foi concluída. Use “Rever” para ver suas respostas.' };
  if (opts.allowBack === false) return { ok: false, code: 'BACK_NOT_ALLOWED', message: 'Esta aula não permite voltar cenas.' };
  if (state.path.length < 2) return { ok: false, code: 'NO_PREVIOUS_SCENE', message: 'Você está na primeira cena desta tentativa.' };
  return { ok: true };
}

export function canGoBack(state: AttemptState, opts: NavigationOptions = {}): boolean {
  return backAvailability(state, opts).ok;
}

/** Variáveis iniciais para o replay de estados antigos (sem snapshot no primeiro passo). */
function replayBase(graph: LessonGraph, state: AttemptState): VariableValues {
  const base: VariableValues = {};
  for (const v of graph.variables) base[v.name] = v.initial;
  // variável de curso que o caminho nunca gravou: o valor atual é o herdado
  const visited = new Set(state.path.map((p) => p.nodeId));
  for (const v of graph.variables) {
    if (variableScope(v) !== 'course') continue;
    const written =
      graph.edges.some((e) => visited.has(e.from) && visited.has(e.to) && e.effects?.some((f) => f.var === v.name)) ||
      graph.nodes.some((n) => n.type === 'consequence' && visited.has(n.id) && n.effects?.some((f) => f.var === v.name));
    const cur = state.variables[v.name];
    if (!written && cur !== undefined && scalarType(cur) === v.type) base[v.name] = cur;
  }
  return base;
}

/**
 * Caminho com `vars` em todos os passos. Passos sem snapshot (estados
 * antigos) são derivados do anterior pela aresta que liga os dois.
 */
export function ensurePathSnapshots(graph: LessonGraph, state: AttemptState): { path: PathStep[]; reconstructed: boolean } {
  if (state.path.every((p) => p.vars)) return { path: state.path, reconstructed: false };
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: PathStep[] = [];
  let prev: VariableValues | undefined;
  for (let k = 0; k < state.path.length; k++) {
    const step = state.path[k]!;
    let vars = step.vars;
    if (!vars) {
      if (k === 0 || !prev) vars = replayBase(graph, state);
      else {
        const from = state.path[k - 1]!.nodeId;
        const candidates = graph.edges.filter((e) => e.from === from && e.to === step.nodeId);
        const chosen = state.answers[from]?.optionIds ?? [];
        const edge = candidates.find((e) => e.optionId && chosen.includes(e.optionId)) ?? candidates.find((e) => !e.optionId) ?? candidates[0];
        vars = applyEffects(edge?.effects, prev);
        const target = nodes.get(step.nodeId);
        if (target?.type === 'consequence') vars = applyEffects(target.effects, vars);
      }
    }
    out.push({ ...step, vars: { ...vars } });
    prev = vars;
  }
  return { path: out, reconstructed: true };
}

/** Índice do passo alvo, validado. */
function resolveTarget(state: AttemptState, target: NavigationTarget): number {
  const last = state.path.length - 1;
  if (target.kind === 'back') return last - 1;
  const i = target.pathIndex;
  if (!Number.isInteger(i) || i < 0 || i >= last) throw new EngineError('INVALID_TARGET', 'Só dá para voltar a uma cena já visitada antes da atual.');
  if (target.nodeId !== undefined && state.path[i]!.nodeId !== target.nodeId) throw new EngineError('INVALID_TARGET', 'A cena escolhida não corresponde ao caminho atual.');
  return i;
}

/**
 * Volta a uma cena já visitada, restaurando o estado de quando ela foi
 * aberta. O aluno pode responder de novo: variáveis, pontos e o roteiro
 * passam a refletir a nova resposta.
 */
export function navigateBack(graph: LessonGraph, state: AttemptState, target: NavigationTarget, opts: NavigationOptions = {}): NavigationResult {
  const can = backAvailability(state, opts);
  if (!can.ok) throw new EngineError(can.code, can.message);
  const last = state.path.length - 1;
  if (state.path[last]!.nodeId !== state.currentNodeId) throw new EngineError('NODE_MISMATCH', 'O caminho da tentativa não termina na cena atual.');
  const idx = resolveTarget(state, target);
  const toNodeId = state.path[idx]!.nodeId;
  const toNode = graph.nodes.find((n) => n.id === toNodeId);
  if (!toNode) throw new EngineError('NODE_NOT_FOUND', `A cena "${toNodeId}" não existe nesta versão da aula.`);
  if (!isExecutableNodeType(toNode.type)) throw new EngineError('NOT_EXECUTABLE', `Bloco "${toNode.type}" não tem executor`);

  const { path, reconstructed } = ensurePathSnapshots(graph, state);
  // desfaz as respostas do fim para o começo: cada nó volta ao que tinha ao entrar
  const answers: Record<string, AnswerRecord> = { ...state.answers };
  for (let k = last; k >= idx; k--) {
    const step = path[k]!;
    if (step.entryAnswer) answers[step.nodeId] = step.entryAnswer;
    else delete answers[step.nodeId];
  }
  const kept = path.slice(0, idx + 1);
  const before = new Set(kept.slice(0, idx).map((p) => p.nodeId));
  const next: AttemptState = {
    ...state,
    status: 'in_progress',
    currentNodeId: toNodeId,
    variables: { ...kept[idx]!.vars! },
    path: kept,
    answers,
    completedNodeIds: state.completedNodeIds.filter((id) => before.has(id)),
  };
  delete next.completedAt;
  return { state: next, fromNodeId: state.currentNodeId, toNodeId, pathIndex: idx, undone: last - idx, reconstructed };
}

/* ------------------------------------------------------------------------ */
/* Começar em uma cena (modo de teste do estúdio)                            */
/* ------------------------------------------------------------------------ */

/** Erros de valores de variáveis contra as declarações do grafo (vazio = válido). */
export function validateVariableOverrides(graph: LessonGraph, overrides: Record<string, unknown> | undefined): string[] {
  const errors: string[] = [];
  if (!overrides) return errors;
  const decl = new Map(graph.variables.map((v) => [v.name, v]));
  for (const [name, value] of Object.entries(overrides)) {
    const v = decl.get(name);
    if (!v) {
      errors.push(`Variável "${name}" não existe nesta aula.`);
      continue;
    }
    if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
      errors.push(`Variável "${name}": valor inválido.`);
      continue;
    }
    if (scalarType(value) !== v.type) errors.push(`Variável "${name}" é do tipo ${v.type}, recebeu ${scalarType(value)}.`);
    else if (typeof value === 'number' && !Number.isFinite(value)) errors.push(`Variável "${name}": número inválido.`);
    else if (typeof value === 'string' && value.length > 200) errors.push(`Variável "${name}": texto longo demais.`);
  }
  return errors;
}

export interface StartAtOptions {
  /** valores de variáveis (de aula ou de curso) no lugar de `initial` */
  variables?: Record<string, Scalar>;
  now?: Date;
}

/**
 * Estado inicial começando numa cena qualquer (prévia/teste do estúdio, nunca
 * no LMS). Valida a cena e as variáveis contra o grafo. Respostas de cenas
 * anteriores não existem: condições `answered`/`passed` sobre elas são falsas.
 */
export function createStateAt(graph: LessonGraph, nodeId: string, opts: StartAtOptions = {}): AttemptState {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new EngineError('NODE_NOT_FOUND', `A cena "${nodeId}" não existe nesta aula.`);
  if (!isExecutableNodeType(node.type)) throw new EngineError('NOT_EXECUTABLE', `Bloco "${node.type}" não tem executor`);
  const errors = validateVariableOverrides(graph, opts.variables);
  if (errors.length) throw new EngineError('INVALID_VARIABLE', errors.join(' '));
  const now = opts.now ?? new Date();
  const base = createInitialState(graph, { now });
  const variables: VariableValues = { ...base.variables, ...(opts.variables ?? {}) };
  const at = now.toISOString();
  const state: AttemptState = { ...base, currentNodeId: nodeId, variables, path: [{ nodeId, at, vars: { ...variables } }] };
  if (node.type === 'end') return { ...state, status: 'completed', completedAt: at, completedNodeIds: [nodeId] };
  return state;
}
