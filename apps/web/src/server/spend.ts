import { eq } from 'drizzle-orm';
import { getDb, media, schema } from '@lms/db';

type BudgetCheck = media.BudgetCheck;

/** Janela do teto "diário": últimas 24 h (deslizante, sem fuso horário). */
export const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Padrões quando o ambiente não define o teto (USD). `-1`/`unlimited` desliga. */
export const DEFAULT_MEDIA_DAILY_BUDGET_USD = 50;
export const DEFAULT_AI_DAILY_BUDGET_USD = 20;
/** Execução de IA aberta ainda sem custo: conta este valor estimado no teto (AI_RUN_ESTIMATE_USD). */
export function openRunEstimateUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.AI_RUN_ESTIMATE_USD ?? 0.5);
  return Number.isFinite(n) && n >= 0 ? n : 0.5;
}

export type SpendLimits = { mediaDailyUsd?: number; aiDailyUsd?: number };

export async function workspaceSpendLimits(workspaceId: string): Promise<SpendLimits> {
  const [row] = await getDb().select({ spendLimits: schema.workspaces.spendLimits }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  return row?.spendLimits ?? {};
}

/** Teto efetivo: override do workspace > variável de ambiente > padrão. null = sem teto. */
export function dailyBudgetUsd(kind: 'media' | 'ai', limits: SpendLimits, env: NodeJS.ProcessEnv = process.env): number | null {
  const override = kind === 'media' ? limits.mediaDailyUsd : limits.aiDailyUsd;
  if (override !== undefined && override !== null) return media.parseBudgetUsd(override, null);
  return media.parseBudgetUsd(kind === 'media' ? env.MEDIA_DAILY_BUDGET_USD : env.AI_DAILY_BUDGET_USD, kind === 'media' ? DEFAULT_MEDIA_DAILY_BUDGET_USD : DEFAULT_AI_DAILY_BUDGET_USD);
}

/** Checagem do teto de mídia para um acréscimo `addUsd` (não lança). */
export async function mediaBudgetCheck(workspaceId: string, addUsd: number): Promise<BudgetCheck> {
  const [limits, spend] = await Promise.all([workspaceSpendLimits(workspaceId), media.mediaSpendSince(getDb(), { workspaceId, since: new Date(Date.now() - BUDGET_WINDOW_MS) })]);
  return media.checkBudget({ kind: 'media', limitUsd: dailyBudgetUsd('media', limits), spentUsd: spend.committedUsd, addUsd });
}

/** Checagem do teto de IA para um acréscimo `addUsd` (não lança). */
export async function aiBudgetCheck(workspaceId: string, addUsd: number): Promise<BudgetCheck> {
  const [limits, spend] = await Promise.all([workspaceSpendLimits(workspaceId), media.aiSpendSince(getDb(), { workspaceId, since: new Date(Date.now() - BUDGET_WINDOW_MS), openRunEstimateUsd: openRunEstimateUsd() })]);
  return media.checkBudget({ kind: 'ai', limitUsd: dailyBudgetUsd('ai', limits), spentUsd: spend.committedUsd, addUsd });
}
