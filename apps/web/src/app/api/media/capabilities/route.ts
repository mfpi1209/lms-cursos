import { mediaPriceTable } from '@lms/media';
import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { getMediaConfig, SCRIPT_MAX_CHARS } from '@/server/media';
import { dailyBudgetUsd, workspaceSpendLimits } from '@/server/spend';

/**
 * O que está configurado neste ambiente (sem expor chaves).
 * `mode`: demo = jobs simulados, identificados como tal, nada é cobrado; real = HeyGen/ElevenLabs liberados por ALLOW_PAID_PROVIDERS.
 */
export async function GET() {
  return route(async () => {
    const viewer = await requireStaff();
    const cfg = getMediaConfig();
    const limits = await workspaceSpendLimits(viewer.workspace.id);
    return {
      mode: cfg.mode,
      paidAllowed: cfg.paidAllowed,
      simulation: cfg.simulation,
      simulationReason: cfg.simulationReason ?? null,
      providers: { heygen: !!cfg.heygenApiKey, elevenlabs: !!cfg.elevenLabsApiKey },
      webhook: !!cfg.heygenWebhookSecret && !!cfg.heygenCallbackUrl,
      limits: { scriptMaxChars: SCRIPT_MAX_CHARS, elevenLabsMaxChars: 10000 },
      elevenLabsModelId: cfg.elevenLabsModelId,
      /** estimativa em USD pela tabela (MEDIA_PRICES_JSON); os provedores não publicam tabela por vídeo na API */
      costEstimateAvailable: true,
      prices: mediaPriceTable(),
      dailyBudgetUsd: { media: dailyBudgetUsd('media', limits), ai: dailyBudgetUsd('ai', limits) },
    };
  });
}
