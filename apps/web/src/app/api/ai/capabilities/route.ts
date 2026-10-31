import { route } from '@/server/http';
import { requireStaff } from '@/server/viewer';
import { getAiConfig } from '@/server/agent';

/**
 * Provedor de IA configurado neste ambiente (sem expor chaves).
 * `mode`: demo = nenhuma chamada paga sai daqui; real = provedor pago liberado por ALLOW_PAID_PROVIDERS.
 */
export async function GET() {
  return route(async () => {
    await requireStaff();
    const cfg = getAiConfig();
    return {
      mode: cfg.mode,
      paidAllowed: cfg.paidAllowed,
      configured: cfg.configured,
      provider: cfg.provider,
      model: cfg.model,
      fallbackProvider: cfg.fallbackProvider,
      fallbackModel: cfg.fallbackModel,
      blockedProvider: cfg.blockedProvider ?? null,
      guardReason: cfg.guardReason ?? null,
      note: cfg.note,
    };
  });
}
