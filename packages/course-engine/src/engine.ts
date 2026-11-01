import {
  MISSION_NOTE_MAX,
  applyEffects,
  evaluateCondition,
  isExecutableNodeType,
  type AnyNode,
  type Edge,
  type EvaluationContext,
  type LessonGraph,
  type ExecutableNode,
} from '@lms/course-schema';
import { EngineError, type AttemptState, type Evidence, type Intent, type StepResult, type AssessmentOutcome } from './state';

function nodeMap(graph: LessonGraph): Map<string, AnyNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

function contextOf(state: AttemptState): EvaluationContext {
  const answers: EvaluationContext['answers'] = {};
  for (const [id, a] of Object.entries(state.answers)) answers[id] = { optionIds: a.optionIds, text: a.text, passed: a.passed };
  return { variables: state.variables, answers };
}

/**
 * Seleciona a aresta de saída de forma determinística:
 * 1. filtra por opção (decisões)
 * 2. avalia condicionais em ordem de prioridade
 * 3. usa o fallback (isDefault) ou a única aresta sem condição
 */
export function selectEdge(graph: LessonGraph, fromNodeId: string, ctx: EvaluationContext, optionId?: string): Edge | undefined {
  let candidates = graph.edges.filter((e) => e.from === fromNodeId);
  if (optionId !== undefined) candidates = candidates.filter((e) => e.optionId === optionId);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) {
    const only = candidates[0]!;
    if (only.condition && !only.isDefault && !evaluateCondition(only.condition, ctx)) return undefined;
    return only;
  }
  const conditioned = candidates
    .filter((e) => !e.isDefault && e.condition)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const e of conditioned) if (evaluateCondition(e.condition, ctx)) return e;
  return candidates.find((e) => e.isDefault) ?? candidates.find((e) => !e.condition);
}

function evaluateAssessment(node: Extract<ExecutableNode, { type: 'assessment' }>, optionIds: string[]) {
  const valid = new Set(node.options.map((o) => o.id));
  for (const id of optionIds) if (!valid.has(id)) throw new EngineError('INVALID_OPTION', `Opção "${id}" não existe`);
  const unique = [...new Set(optionIds)];
  if (node.mode === 'single' && unique.length !== 1) throw new EngineError('INVALID_OPTION', 'Escolha exatamente uma opção');
  if (unique.length === 0) throw new EngineError('INVALID_OPTION', 'Escolha ao menos uma opção');
  const correctIds = node.options.filter((o) => o.correct).map((o) => o.id);
  const chosenCorrect = unique.filter((id) => correctIds.includes(id)).length;
  const chosenWrong = unique.length - chosenCorrect;
  let passed: boolean;
  if (node.passing.kind === 'all_correct') passed = chosenCorrect === correctIds.length && chosenWrong === 0;
  else passed = chosenCorrect >= node.passing.min && chosenWrong === 0;
  return { passed, correctCount: chosenCorrect, totalCorrect: correctIds.length };
}

/**
 * Aplica uma intenção do aluno ao estado da tentativa. Função pura: o servidor
 * é a autoridade e persiste o resultado na mesma transação do evento.
 */
export function applyIntent(graph: LessonGraph, state: AttemptState, intent: Intent, now: Date = new Date()): StepResult {
  if (state.status === 'completed') throw new EngineError('ATTEMPT_COMPLETED', 'Esta tentativa já foi concluída');
  const nodes = nodeMap(graph);
  const node = nodes.get(state.currentNodeId);
  if (!node) throw new EngineError('NODE_NOT_FOUND', `Nó atual "${state.currentNodeId}" não existe no grafo`);
  if (!isExecutableNodeType(node.type)) throw new EngineError('NOT_EXECUTABLE', `Bloco "${node.type}" não tem executor`);
  const at = now.toISOString();
  const evidence: Evidence[] = [];
  let next: AttemptState = { ...state, answers: { ...state.answers }, completedNodeIds: [...state.completedNodeIds], path: [...state.path] };
  let feedback: StepResult['feedback'];
  let assessment: AssessmentOutcome | undefined;
  let optionId: string | undefined;

  switch (node.type) {
    case 'scenario':
    case 'content':
    case 'consequence':
      if (intent.kind !== 'advance') throw new EngineError('INTENT_MISMATCH', 'Este bloco só aceita avançar');
      break;
    case 'end':
      throw new EngineError('INTENT_MISMATCH', 'Encerramento não aceita ações');
    case 'choice': {
      if (intent.kind !== 'choose') throw new EngineError('INTENT_MISMATCH', 'Este bloco espera uma escolha');
      const option = node.options.find((o) => o.id === intent.optionId);
      if (!option) throw new EngineError('INVALID_OPTION', `Opção "${intent.optionId}" não existe`);
      optionId = option.id;
      feedback = option.feedback;
      next.answers[node.id] = { optionIds: [option.id], answeredAt: at };
      for (const oid of node.objectiveIds) evidence.push({ objectiveId: oid, nodeId: node.id, kind: 'choice', value: { optionId: option.id } });
      break;
    }
    case 'reflection': {
      if (intent.kind !== 'reflect') throw new EngineError('INTENT_MISMATCH', 'Este bloco espera um texto');
      const text = intent.text.trim();
      if (text.length < node.minLength) throw new EngineError('TEXT_TOO_SHORT', `Escreva ao menos ${node.minLength} caracteres`);
      if (text.length > node.maxLength) throw new EngineError('TEXT_TOO_LONG', `Use no máximo ${node.maxLength} caracteres`);
      next.answers[node.id] = { text, answeredAt: at };
      for (const oid of node.objectiveIds) evidence.push({ objectiveId: oid, nodeId: node.id, kind: 'reflection', value: { length: text.length } });
      break;
    }
    case 'mission': {
      // nunca bloqueia: "Vou fazer depois" e "Já experimentei" avançam; o registro vive também em mission_responses (db)
      if (intent.kind !== 'mission') throw new EngineError('INTENT_MISMATCH', 'Este bloco espera "Já experimentei" ou "Vou fazer depois"');
      const note = (intent.note ?? '').trim();
      if (intent.status !== 'later' && intent.status !== 'done') throw new EngineError('INVALID_MISSION', 'Escolha "Já experimentei" ou "Vou fazer depois"');
      if (intent.status === 'later' && note) throw new EngineError('INVALID_MISSION', 'O registro do que você percebeu vem com "Já experimentei"');
      if (note.length > MISSION_NOTE_MAX) throw new EngineError('TEXT_TOO_LONG', `Use no máximo ${MISSION_NOTE_MAX} caracteres`);
      next.answers[node.id] = { missionStatus: intent.status, ...(note ? { text: note } : {}), answeredAt: at };
      break;
    }
    case 'assessment': {
      if (intent.kind !== 'assess') throw new EngineError('INTENT_MISMATCH', 'Este bloco espera respostas de avaliação');
      const r = evaluateAssessment(node, intent.optionIds);
      const attemptsUsed = (state.answers[node.id]?.attempts ?? 0) + 1;
      const attemptsLeft = Math.max(0, node.maxAttempts - attemptsUsed);
      const retry = !r.passed && attemptsLeft > 0;
      assessment = { ...r, attemptsUsed, attemptsLeft, retry };
      feedback = r.passed ? node.feedbackPassed : node.feedbackFailed;
      if (retry) {
        next.answers[node.id] = { optionIds: [...new Set(intent.optionIds)], passed: false, correctCount: r.correctCount, attempts: attemptsUsed, answeredAt: at };
        return { state: next, feedback, assessment, evidence, transitioned: false, fromNodeId: node.id, toNodeId: node.id };
      }
      next.answers[node.id] = { optionIds: [...new Set(intent.optionIds)], passed: r.passed, correctCount: r.correctCount, attempts: attemptsUsed, answeredAt: at };
      for (const oid of node.objectiveIds)
        evidence.push({ objectiveId: oid, nodeId: node.id, kind: 'assessment', value: { passed: r.passed, correctCount: r.correctCount, totalCorrect: r.totalCorrect, attempts: attemptsUsed } });
      break;
    }
  }

  const edge = selectEdge(graph, node.id, contextOf(next), optionId);
  if (!edge) throw new EngineError('NO_TRANSITION', `Sem transição válida a partir de "${node.id}"`);
  const target = nodes.get(edge.to);
  if (!target) throw new EngineError('NODE_NOT_FOUND', `Destino "${edge.to}" não existe`);

  next.variables = applyEffects(edge.effects, next.variables);
  if (target.type === 'consequence') next.variables = applyEffects(target.effects, next.variables);
  if (!next.completedNodeIds.includes(node.id)) next.completedNodeIds.push(node.id);
  next.currentNodeId = target.id;
  // snapshot de entrada (voltar uma cena restaura exatamente isto)
  const entryAnswer = next.answers[target.id];
  next.path.push(entryAnswer ? { nodeId: target.id, at, vars: { ...next.variables }, entryAnswer } : { nodeId: target.id, at, vars: { ...next.variables } });
  if (target.type === 'end') {
    if (!next.completedNodeIds.includes(target.id)) next.completedNodeIds.push(target.id);
    next.status = 'completed';
    next.completedAt = at;
  }
  return { state: next, feedback, assessment, evidence, transitioned: true, fromNodeId: node.id, toNodeId: target.id };
}
