import { getDb, agent, authoring, media, DomainError } from '@lms/db';
import { LlmError, QualityScorecardSchema, type MediaQueueItem, type QualityScorecard } from '@lms/ai';
import { HttpError } from '@/server/viewer';

/** Rascunho atual do curso (404 em pt-BR quando não existe). */
export async function loadDraft(courseId: string) {
  const draft = await authoring.getDraft(getDb(), courseId);
  if (!draft) throw new DomainError('NOT_FOUND', 'Rascunho não encontrado');
  return draft;
}

/** Job de mídia mais recente por cena (a lista do banco já vem do mais novo para o mais antigo). */
export async function loadMediaQueue(courseId: string): Promise<MediaQueueItem[]> {
  const jobs = await media.listJobsForCourse(getDb(), courseId);
  const latest = new Map<string, MediaQueueItem>();
  for (const j of jobs) {
    const k = `${j.lessonId}:${j.nodeId}`;
    if (!latest.has(k)) latest.set(k, { lessonId: j.lessonId, nodeId: j.nodeId, status: j.status });
  }
  return [...latest.values()];
}

/** Último cartão de qualidade por aula (lesson_quality), para os próximos passos ("Avaliar a aula…", achados com nota ≤ 3). */
export async function loadQuality(courseId: string): Promise<Record<string, QualityScorecard | null>> {
  const rows = await agent.listLessonQuality(getDb(), courseId);
  const out: Record<string, QualityScorecard | null> = {};
  for (const r of rows) {
    const p = QualityScorecardSchema.safeParse(r.scorecard);
    out[r.lessonId] = p.success ? p.data : null;
  }
  return out;
}

/**
 * Freio de sanidade do assistente: no máximo 30 turnos por usuário a cada 10
 * minutos (janela deslizante). Fica em memória, por processo do servidor web:
 * reinicia com o processo e não é compartilhado entre réplicas. Serve contra
 * cliques repetidos e laços acidentais, não como controle de custo.
 */
export const ASSISTANT_TURN_LIMIT = 30;
export const ASSISTANT_TURN_WINDOW_MS = 10 * 60 * 1000;

const globalForAssistant = globalThis as unknown as { __lmsAssistantTurns?: Map<string, number[]> };
const turns = (globalForAssistant.__lmsAssistantTurns ??= new Map<string, number[]>());

export function takeAssistantTurn(userId: string, now = Date.now()): void {
  const recent = (turns.get(userId) ?? []).filter((t) => now - t < ASSISTANT_TURN_WINDOW_MS);
  if (recent.length >= ASSISTANT_TURN_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0]! + ASSISTANT_TURN_WINDOW_MS - now) / 1000));
    turns.set(userId, recent);
    throw new HttpError(429, `Você enviou muitas mensagens ao assistente. Tente de novo em ${Math.ceil(retryAfterSeconds / 60)} min.`, { retryAfterSeconds, limit: ASSISTANT_TURN_LIMIT, windowMinutes: ASSISTANT_TURN_WINDOW_MS / 60000 });
  }
  recent.push(now);
  turns.set(userId, recent);
}

/** Erros do provedor de IA em pt-BR, sem detalhes internos (nunca expõe chaves). */
export function llmHttpError(e: unknown): unknown {
  if (!(e instanceof LlmError)) return e;
  if (e.kind === 'rate_limit') return new HttpError(429, 'O provedor de IA está ocupado agora. Tente de novo em instantes.');
  if (e.kind === 'auth') return new HttpError(503, 'O provedor de IA não está configurado corretamente.');
  if (e.kind === 'refusal') return new HttpError(422, 'O provedor de IA recusou este pedido. Reformule e tente de novo.');
  return new HttpError(502, 'Não foi possível falar com o provedor de IA agora. Tente de novo.');
}
