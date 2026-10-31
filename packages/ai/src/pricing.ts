/**
 * Tabela de preços dos provedores de IA, SÓ PARA ESTIMATIVA de custo por execução.
 * Os valores padrão são preços de lista aproximados (USD por milhão de tokens)
 * conhecidos em 2026-10 e podem estar defasados: a fatura real do provedor é a
 * referência. Sobrescreva com `AI_PRICES_JSON`, por exemplo:
 *   AI_PRICES_JSON='{"gpt-5":{"input":1.25,"output":10},"claude-opus-5-5":{"input":4,"output":20,"cacheRead":0.2}}'
 * A chave é o id do modelo (ou um prefixo dele: `gpt-5` cobre `gpt-5-2026-01-01`).
 */
export interface ModelPrice {
  /** USD por 1M tokens de entrada */
  input: number;
  /** USD por 1M tokens de saída */
  output: number;
  /** USD por 1M tokens lidos do cache (ausente = igual à entrada) */
  cacheRead?: number;
}

export type PriceTable = Record<string, ModelPrice>;

/** Padrões (ESTIMATIVAS; sem garantia de exatidão). */
export const DEFAULT_AI_PRICES: PriceTable = {
  // Anthropic
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // OpenAI
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.005 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025 },
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cacheRead: 0.025 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.1 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075 },
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25 },
  'o4-mini': { input: 1.1, output: 4.4, cacheRead: 0.275 },
  'o3': { input: 2, output: 8, cacheRead: 0.5 },
};

function isPrice(v: unknown): v is ModelPrice {
  const p = v as ModelPrice | null;
  return !!p && typeof p === 'object' && Number.isFinite(p.input) && Number.isFinite(p.output) && (p.cacheRead === undefined || Number.isFinite(p.cacheRead));
}

/** Tabela efetiva: padrões sobrescritos (por chave) pelo JSON de `AI_PRICES_JSON`; JSON inválido é ignorado com aviso. */
export function aiPriceTable(env: NodeJS.ProcessEnv = process.env): PriceTable {
  const raw = env.AI_PRICES_JSON?.trim();
  if (!raw) return DEFAULT_AI_PRICES;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PriceTable = { ...DEFAULT_AI_PRICES };
    for (const [k, v] of Object.entries(parsed)) if (isPrice(v)) out[k] = { input: v.input, output: v.output, ...(v.cacheRead !== undefined ? { cacheRead: v.cacheRead } : {}) };
    return out;
  } catch {
    console.warn('[ai] AI_PRICES_JSON inválido; usando a tabela padrão de estimativas');
    return DEFAULT_AI_PRICES;
  }
}

/** Preço do modelo: chave exata, senão o prefixo mais longo que case (`gpt-5` para `gpt-5-2026-01-01`). */
export function priceForModel(model: string, table: PriceTable = aiPriceTable()): ModelPrice | undefined {
  if (table[model]) return table[model];
  const m = model.toLowerCase();
  let best: { key: string; price: ModelPrice } | undefined;
  for (const [key, price] of Object.entries(table)) {
    const k = key.toLowerCase();
    if ((m === k || m.startsWith(`${k}-`) || m.startsWith(`${k}@`)) && (!best || k.length > best.key.length)) best = { key: k, price };
  }
  return best?.price;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

/**
 * Custo ESTIMADO em USD de uma chamada (tokens × tabela). `undefined` quando o
 * modelo não está na tabela. Tokens lidos do cache saem do total de entrada
 * quando o provedor já os inclui em `inputTokens` (Anthropic não inclui; OpenAI inclui).
 */
export function estimateAiCostUsd(model: string, usage: TokenUsage, opts: { table?: PriceTable; cacheIncludedInInput?: boolean } = {}): number | undefined {
  const price = priceForModel(model, opts.table ?? aiPriceTable());
  if (!price) return undefined;
  const cache = usage.cacheReadTokens ?? 0;
  const billableInput = opts.cacheIncludedInInput ? Math.max(0, usage.inputTokens - cache) : usage.inputTokens;
  const cacheRate = price.cacheRead ?? price.input;
  const usd = (billableInput * price.input + usage.outputTokens * price.output + cache * cacheRate) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
