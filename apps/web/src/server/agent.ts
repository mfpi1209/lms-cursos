import { aiConfigFromEnv, describeAiMode, type AiConfig, type RevisionFocus } from '@lms/ai';
import { getDb, agent, media, DomainError } from '@lms/db';
import type { Viewer } from './viewer';
import { aiBudgetCheck, openRunEstimateUsd } from './spend';

let modeLogged = false;
/** Loga o modo resolvido (demo/real) uma vez por processo, só nomes (nunca chaves). */
export function logAiModeOnce(cfg: AiConfig) {
  if (modeLogged) return;
  modeLogged = true;
  console.log(`[web] ${describeAiMode(cfg)}`);
}

export function getAiConfig() {
  const cfg = aiConfigFromEnv();
  logAiModeOnce(cfg);
  return cfg;
}

export function requireAiConfigured() {
  const cfg = getAiConfig();
  if (!cfg.configured) throw new DomainError('VALIDATION', cfg.note);
  return cfg;
}

export interface EnqueueRunInput {
  courseId: string;
  task: agent.AgentTask;
  lessonId?: string;
  instruction?: string;
  /** revise_lesson: foco do comando de revisão */
  focus?: RevisionFocus;
  /** scene_variations: cena-alvo */
  nodeId?: string;
  /** scene_direction: cenas-alvo (ausente = todas as cenas com vídeo que têm fala ou texto) */
  nodeIds?: string[];
  /** evaluate_lesson: avaliar também os vídeos produzidos (padrão true) */
  includeVideo?: boolean;
}

/**
 * Enfileira uma execução do agente. Para tarefas sobre uma aula, qualquer
 * execução aberta (gerar, revisar ou variar) na mesma aula bloqueia (409).
 * Com provedor pago, o teto diário de IA do workspace é checado (402).
 */
export async function enqueueRun(viewer: Viewer, input: EnqueueRunInput) {
  const cfg = requireAiConfigured();
  const open = input.lessonId ? await agent.findOpenRunForLesson(getDb(), input.courseId, input.lessonId) : await agent.findOpenRun(getDb(), input.courseId, input.task);
  if (open) throw new DomainError('CONFLICT', 'Já existe uma geração em andamento para este item', { runId: open.id });
  // teto: só gasta quem usa provedor pago; a execução aberta conta pelo valor estimado por execução
  if (cfg.provider !== 'fake') media.assertWithinBudget(await aiBudgetCheck(viewer.workspace.id, openRunEstimateUsd()));
  return agent.createRun(getDb(), {
    workspaceId: viewer.workspace.id, courseId: input.courseId, task: input.task, lessonId: input.lessonId ?? null, provider: cfg.provider, model: cfg.model, instructionsVersion: 'pending',
    input: { instruction: input.instruction ?? null, focus: input.focus ?? null, nodeId: input.nodeId ?? null, ...(input.nodeIds ? { nodeIds: input.nodeIds } : {}), ...(input.includeVideo !== undefined ? { includeVideo: input.includeVideo } : {}) }, createdBy: viewer.user.id,
  });
}
