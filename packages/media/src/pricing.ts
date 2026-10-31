/**
 * Tabela de preços de mídia, SÓ PARA ESTIMATIVA. Os provedores não publicam
 * uma tabela por vídeo na API; os padrões abaixo são aproximações de 2026-10
 * (plano pago típico) e podem estar defasados — a fatura do provedor é a referência.
 * Sobrescreva com `MEDIA_PRICES_JSON`, por exemplo:
 *   MEDIA_PRICES_JSON='{"elevenLabsUsdPer1kChars":0.3,"heygenUsdPerSecond":0.0167,"heygenCinematicUsdPerSecond":0.12}'
 */
export interface MediaPrices {
  /** ElevenLabs: USD por 1.000 caracteres sintetizados */
  elevenLabsUsdPer1kChars: number;
  /** HeyGen: USD por segundo de vídeo de avatar (≈ 1 crédito/min no plano API) */
  heygenUsdPerSecond: number;
  /** HeyGen: USD por segundo de cena em movimento (cinematic_avatar), bem mais cara */
  heygenCinematicUsdPerSecond: number;
}

/** Padrões (ESTIMATIVAS; sem garantia de exatidão). */
export const DEFAULT_MEDIA_PRICES: MediaPrices = {
  elevenLabsUsdPer1kChars: 0.3,
  heygenUsdPerSecond: 1 / 60,
  heygenCinematicUsdPerSecond: 0.12,
};

export function mediaPriceTable(env: NodeJS.ProcessEnv = process.env): MediaPrices {
  const raw = env.MEDIA_PRICES_JSON?.trim();
  if (!raw) return DEFAULT_MEDIA_PRICES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof MediaPrices, unknown>>;
    const pick = (k: keyof MediaPrices) => (typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) && (parsed[k] as number) >= 0 ? (parsed[k] as number) : DEFAULT_MEDIA_PRICES[k]);
    return { elevenLabsUsdPer1kChars: pick('elevenLabsUsdPer1kChars'), heygenUsdPerSecond: pick('heygenUsdPerSecond'), heygenCinematicUsdPerSecond: pick('heygenCinematicUsdPerSecond') };
  } catch {
    console.warn('[media] MEDIA_PRICES_JSON inválido; usando a tabela padrão de estimativas');
    return DEFAULT_MEDIA_PRICES;
  }
}

export interface MediaCostInput {
  /** caracteres narrados pelo ElevenLabs (0 quando a voz é do HeyGen ou a narração foi reaproveitada) */
  elevenLabsChars: number;
  /** segundos de vídeo de avatar no HeyGen */
  heygenSeconds: number;
  /** segundos de cenas em movimento (cinematic_avatar) */
  cinematicSeconds?: number;
}

/** Custo ESTIMADO em USD (6 casas) de uma cena/job a partir das quantidades. */
export function estimateMediaCostUsd(input: MediaCostInput, prices: MediaPrices = mediaPriceTable()): number {
  const usd = (input.elevenLabsChars / 1000) * prices.elevenLabsUsdPer1kChars + input.heygenSeconds * prices.heygenUsdPerSecond + (input.cinematicSeconds ?? 0) * prices.heygenCinematicUsdPerSecond;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
