import { getDb, media } from '@lms/db';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { requireCourseInWorkspace } from '@/server/courses';
import { getMediaConfig } from '@/server/media';
import { getAiConfig } from '@/server/agent';
import { BUDGET_WINDOW_MS, dailyBudgetUsd, openRunEstimateUsd, workspaceSpendLimits } from '@/server/spend';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Gasto (estimado × real) de IA e mídia: do curso (todo o período) e do
 * workspace nos últimos 30 dias, além do teto diário e do que já está
 * comprometido na janela de 24 h. Só jobs reais (simulados nunca são cobrados).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  return route(async () => {
    const viewer = await requireStaff();
    const { courseId } = await ctx.params;
    await requireCourseInWorkspace(viewer, courseId);
    const db = getDb();
    const ws = viewer.workspace.id;
    const now = Date.now();
    const epoch = new Date(0);
    const openRun = openRunEstimateUsd();
    const [limits, courseMedia, courseAi, wsMedia30, wsAi30, wsMedia24, wsAi24] = await Promise.all([
      workspaceSpendLimits(ws),
      media.mediaSpendSince(db, { workspaceId: ws, courseId, since: epoch }),
      media.aiSpendSince(db, { workspaceId: ws, courseId, since: epoch, openRunEstimateUsd: openRun }),
      media.mediaSpendSince(db, { workspaceId: ws, since: new Date(now - THIRTY_DAYS_MS) }),
      media.aiSpendSince(db, { workspaceId: ws, since: new Date(now - THIRTY_DAYS_MS), openRunEstimateUsd: openRun }),
      media.mediaSpendSince(db, { workspaceId: ws, since: new Date(now - BUDGET_WINDOW_MS) }),
      media.aiSpendSince(db, { workspaceId: ws, since: new Date(now - BUDGET_WINDOW_MS), openRunEstimateUsd: openRun }),
    ]);
    const sum = (a: media.SpendTotals, b: media.SpendTotals) => ({ actualUsd: a.actualUsd + b.actualUsd, estimatedUsd: a.estimatedUsd + b.estimatedUsd, openEstimatedUsd: a.openEstimatedUsd + b.openEstimatedUsd, committedUsd: a.committedUsd + b.committedUsd, items: a.items + b.items, openItems: a.openItems + b.openItems });
    return {
      mode: { ai: getAiConfig().mode, media: getMediaConfig().mode },
      note: 'Valores em USD, estimados pelas tabelas de preços (AI_PRICES_JSON / MEDIA_PRICES_JSON) salvo quando o provedor informa o custo real; a fatura do provedor é a referência.',
      course: { media: courseMedia, ai: courseAi, total: sum(courseMedia, courseAi) },
      workspaceLast30Days: { media: wsMedia30, ai: wsAi30, total: sum(wsMedia30, wsAi30) },
      budget: {
        windowHours: BUDGET_WINDOW_MS / 3_600_000,
        media: media.checkBudget({ kind: 'media', limitUsd: dailyBudgetUsd('media', limits), spentUsd: wsMedia24.committedUsd, addUsd: 0 }),
        ai: media.checkBudget({ kind: 'ai', limitUsd: dailyBudgetUsd('ai', limits), spentUsd: wsAi24.committedUsd, addUsd: 0 }),
        openRunEstimateUsd: openRun,
      },
    };
  });
}
