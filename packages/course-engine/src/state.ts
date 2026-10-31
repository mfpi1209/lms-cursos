import { scalarType, variableScope, type LessonGraph, type RichTextDocument, type Scalar, type VariableValues } from '@lms/course-schema';

export const STATE_VERSION = 1 as const;

export interface AnswerRecord {
  optionIds?: string[];
  text?: string;
  passed?: boolean;
  correctCount?: number;
  attempts?: number;
  answeredAt: string;
}

/**
 * Uma entrada do caminho. Além do nó e do instante, guarda um snapshot COMPACTO
 * do que é preciso para voltar a esta cena exatamente como ela foi encontrada
 * (ver `navigateBack` em navigation.ts):
 * - `vars`: variáveis ao ENTRAR no nó (já com os efeitos da aresta e da
 *   consequência de chegada) — no máximo 30 escalares;
 * - `entryAnswer`: a resposta que o nó já tinha ao entrar (só em revisitas,
 *   quando o grafo volta a uma cena já respondida). Ausente = sem resposta.
 * Respostas, cenas concluídas e o resto do caminho são derivados do próprio
 * caminho; estados antigos sem `vars` são reconstruídos por replay.
 */
export interface PathStep {
  nodeId: string;
  at: string;
  vars?: VariableValues;
  entryAnswer?: AnswerRecord;
}

export interface AttemptState {
  stateVersion: typeof STATE_VERSION;
  status: 'in_progress' | 'completed';
  currentNodeId: string;
  variables: VariableValues;
  /**
   * Caminho ATUAL em ordem; revisitas ficam registradas como novas entradas.
   * Voltar uma cena corta o caminho (o histórico completo fica nos eventos).
   */
  path: PathStep[];
  answers: Record<string, AnswerRecord>;
  completedNodeIds: string[];
  startedAt: string;
  completedAt?: string;
}

export type Intent =
  | { kind: 'advance' }
  | { kind: 'choose'; optionId: string }
  | { kind: 'reflect'; text: string }
  | { kind: 'assess'; optionIds: string[] };

export interface Evidence {
  objectiveId: string;
  nodeId: string;
  kind: 'choice' | 'reflection' | 'assessment';
  value: Record<string, unknown>;
}

export interface AssessmentOutcome {
  passed: boolean;
  correctCount: number;
  totalCorrect: number;
  attemptsUsed: number;
  attemptsLeft: number;
  /** o aluno permanece no nó para tentar de novo */
  retry: boolean;
}

export interface StepResult {
  state: AttemptState;
  /** feedback da opção/avaliação escolhida, quando houver */
  feedback?: RichTextDocument;
  assessment?: AssessmentOutcome;
  evidence: Evidence[];
  transitioned: boolean;
  fromNodeId: string;
  toNodeId: string;
}

export class EngineError extends Error {
  constructor(
    public readonly code:
      | 'ATTEMPT_COMPLETED'
      | 'NODE_MISMATCH'
      | 'NODE_NOT_FOUND'
      | 'INTENT_MISMATCH'
      | 'INVALID_OPTION'
      | 'TEXT_TOO_SHORT'
      | 'TEXT_TOO_LONG'
      | 'NO_TRANSITION'
      | 'NOT_EXECUTABLE'
      | 'BACK_NOT_ALLOWED'
      | 'NO_PREVIOUS_SCENE'
      | 'INVALID_TARGET'
      | 'INVALID_VARIABLE',
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface CreateInitialStateOptions {
  now?: Date;
  /**
   * Valores de variáveis de CURSO (`scope: 'course'`) trazidos de tentativas
   * anteriores da mesma matrícula. Só substituem `initial` de variáveis
   * declaradas como de curso neste grafo e com o mesmo tipo; o resto é ignorado.
   */
  carried?: Record<string, Scalar>;
}

/** Valores de `carried` aplicáveis às variáveis de curso deste grafo (tipo conferido). */
export function carriedForGraph(graph: LessonGraph, carried: Record<string, Scalar> | undefined): VariableValues {
  const out: VariableValues = {};
  if (!carried) return out;
  for (const v of graph.variables) {
    if (variableScope(v) !== 'course') continue;
    if (!Object.prototype.hasOwnProperty.call(carried, v.name)) continue;
    const value = carried[v.name];
    if (value === undefined || value === null) continue;
    if (scalarType(value) !== v.type) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[v.name] = value;
  }
  return out;
}

/**
 * Estado inicial de uma tentativa. Aceita `now` diretamente (compatibilidade)
 * ou `{ now, carried }`.
 */
export function createInitialState(graph: LessonGraph, opts: Date | CreateInitialStateOptions = {}): AttemptState {
  const { now = new Date(), carried } = opts instanceof Date ? { now: opts, carried: undefined } : opts;
  const variables: VariableValues = {};
  for (const v of graph.variables) variables[v.name] = v.initial;
  Object.assign(variables, carriedForGraph(graph, carried));
  const at = now.toISOString();
  return {
    stateVersion: STATE_VERSION,
    status: 'in_progress',
    currentNodeId: graph.startNodeId,
    variables,
    path: [{ nodeId: graph.startNodeId, at, vars: { ...variables } }],
    answers: {},
    completedNodeIds: [],
    startedAt: at,
  };
}
