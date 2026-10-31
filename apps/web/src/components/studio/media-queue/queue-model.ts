/**
 * Fila de produção de vídeos do curso: tipos da resposta de
 * GET /api/courses/[courseId]/media-queue, rótulos das etapas e formatação de
 * tempo. O HeyGen não informa porcentagem de progresso; por isso mostramos
 * etapas e tempo estimado, nunca uma barra de porcentagem por vídeo.
 */

export type QueueJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'reconciliation_required';
export type QueuePhase = 'waiting' | 'narrating' | 'uploading' | 'rendering' | 'downloading' | 'composing' | 'attaching' | 'done' | 'failed' | 'canceled';

export interface MediaQueueItem {
  jobId: string;
  lessonId: string;
  lessonTitle: string;
  nodeId: string;
  sceneTitle: string;
  status: QueueJobStatus;
  phase: QueuePhase;
  /** 1-based na fila de espera do curso (só para waiting) */
  position: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** tempo estimado até ficar pronto */
  etaSeconds: number | null;
  error: string | null;
  outputUrl: string | null;
  simulated: boolean;
}

export interface MediaQueueSummary {
  waiting: number;
  active: number;
  succeeded: number;
  failed: number;
  canceled: number;
  total: number;
}

export interface MediaQueueResponse {
  simulation: boolean;
  limits: { perCourse: number; global: number };
  summary: MediaQueueSummary;
  /** média de duração (início ao fim) dos vídeos concluídos; null sem histórico */
  avgSeconds: number | null;
  /** estimativa para terminar tudo o que está ativo ou na fila */
  etaSeconds: number | null;
  items: MediaQueueItem[];
}

export const PHASE_LABEL: Record<QueuePhase, string> = {
  waiting: 'Na fila',
  narrating: 'Gerando narração',
  uploading: 'Enviando ao HeyGen',
  rendering: 'Renderizando no HeyGen',
  downloading: 'Baixando os planos',
  composing: 'Montando planos e slides',
  attaching: 'Anexando à cena',
  done: 'Pronto',
  failed: 'Falhou',
  canceled: 'Cancelado',
};

/** Etapas de um vídeo em produção, na ordem. */
export const ACTIVE_PHASES = ['narrating', 'uploading', 'rendering', 'downloading', 'composing', 'attaching'] as const;
export type ActivePhase = (typeof ACTIVE_PHASES)[number];

export function isActivePhase(p: QueuePhase): p is ActivePhase {
  return (ACTIVE_PHASES as readonly QueuePhase[]).includes(p);
}

/** Estimativa usada antes de existir histórico de vídeos concluídos no curso. */
export const FALLBACK_SECONDS_PER_VIDEO = 4 * 60;

/** "menos de 1 min", "cerca de 4 min", "cerca de 1 h 20 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return 'menos de 1 min';
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `cerca de ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `cerca de ${h} h` : `cerca de ${h} h ${m} min`;
}

/** Tempo decorrido desde um instante: "há menos de 1 min", "há 3 min", "há 1 h 5 min". */
export function formatElapsed(fromIso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  if (s < 60) return 'há menos de 1 min';
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `há ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `há ${h} h` : `há ${h} h ${m} min`;
}

/** Estimativa de quanto falta para um lote de N vídeos, respeitando o limite simultâneo. */
export function estimateBatchSeconds(count: number, perCourse: number, avgSeconds: number | null): number {
  const per = Math.max(1, perCourse);
  return Math.ceil(count / per) * (avgSeconds ?? FALLBACK_SECONDS_PER_VIDEO);
}

/** Mensagem de falha em palavras simples; o texto técnico continua disponível no title. */
export function humanizeJobError(item: Pick<MediaQueueItem, 'status' | 'error'>): string {
  if (item.status === 'reconciliation_required') return 'Não conseguimos confirmar se o HeyGen terminou este vídeo. Confira no painel do HeyGen antes de pedir de novo.';
  const raw = (item.error ?? '').trim();
  if (!raw) return 'O provedor não informou o motivo da falha.';
  const low = raw.toLowerCase();
  if (/(quota|credit|crédito|insufficient|saldo)/.test(low)) return 'O HeyGen recusou o pedido por falta de créditos na conta.';
  if (/(timeout|timed out|tempo esgotado|demorou)/.test(low)) return 'O HeyGen demorou demais para responder.';
  if (/(401|403|unauthori|forbidden|api key|chave)/.test(low)) return 'O HeyGen recusou o acesso. Confira a chave de API configurada.';
  if (/(rate limit|429|too many)/.test(low)) return 'O HeyGen recebeu pedidos demais ao mesmo tempo. Tente de novo em alguns minutos.';
  return raw;
}
