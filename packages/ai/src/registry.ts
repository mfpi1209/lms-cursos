import { LlmError, type LlmAdapter, type StructuredRequest, type StructuredResult } from './adapter';
import { AnthropicAdapter, ANTHROPIC_DEFAULT_MODEL } from './anthropic';
import { OpenAIAdapter } from './openai';
import { createTemplateFakeAdapter } from './templates';

export type ProviderName = 'anthropic' | 'openai' | 'fake';

export interface AiConfig {
  configured: boolean;
  provider: ProviderName;
  model: string;
  fallbackProvider?: ProviderName;
  fallbackModel?: string;
  note: string;
  /** `ALLOW_PAID_PROVIDERS=1`: provedores pagos liberados neste processo */
  paidAllowed: boolean;
  /** demo = nenhuma chamada paga sai deste processo; real = provedor pago em uso */
  mode: 'demo' | 'real';
  /** provedor pedido pelo ambiente mas bloqueado pela trava (sem ALLOW_PAID_PROVIDERS) */
  blockedProvider?: ProviderName;
  /** por que o provedor pago foi bloqueado (pt-BR, sem segredos) */
  guardReason?: string;
}

/**
 * Trava de gasto (auditoria P0-1): chamadas pagas só saem deste processo com
 * `ALLOW_PAID_PROVIDERS=1` (ou `true`). Vale também em produção: ter chaves não
 * basta. Sem a variável, a IA cai para o modo de demonstração (`fake`) e a mídia
 * para simulação, mesmo com AI_PROVIDER e chaves definidos.
 */
export function paidProvidersAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ALLOW_PAID_PROVIDERS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

export const PAID_GUARD_REASON = 'ALLOW_PAID_PROVIDERS não está definido como 1: provedores pagos bloqueados neste processo (modo de demonstração).';

export function aiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!env.OPENAI_API_KEY && !!env.OPENAI_MODEL;
  const requested = (env.AI_PROVIDER || '').toLowerCase() as ProviderName | '';
  const paidAllowed = paidProvidersAllowed(env);
  let provider: ProviderName;
  if (requested === 'anthropic' || requested === 'openai' || requested === 'fake') provider = requested;
  else if (hasAnthropic) provider = 'anthropic';
  else if (hasOpenAI) provider = 'openai';
  else provider = 'fake';
  // 'fake' só conta como configurado quando pedido explicitamente (modo de demonstração)
  const available = (p: ProviderName) => (p === 'anthropic' ? hasAnthropic : p === 'openai' ? hasOpenAI : requested === 'fake');

  // trava: provedor pago sem ALLOW_PAID_PROVIDERS cai para fake (configurado: o modo de demonstração funciona)
  let blockedProvider: ProviderName | undefined;
  if (provider !== 'fake' && !paidAllowed) {
    blockedProvider = provider;
    provider = 'fake';
  }
  const configured = blockedProvider ? true : available(provider);
  const model = provider === 'anthropic' ? env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL : provider === 'openai' ? env.OPENAI_MODEL || '' : 'fake-deterministic';
  const fbReq = (env.AI_FALLBACK_PROVIDER || '').toLowerCase() as ProviderName | '';
  const fallbackProvider = !blockedProvider && fbReq && fbReq !== provider && fbReq !== 'fake' && paidAllowed && available(fbReq as ProviderName) ? (fbReq as ProviderName) : undefined;
  const fallbackModel = fallbackProvider === 'anthropic' ? env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL : fallbackProvider === 'openai' ? env.OPENAI_MODEL : undefined;
  const guardReason = blockedProvider ? `${PAID_GUARD_REASON} Provedor ${blockedProvider} ignorado.` : undefined;
  const note = blockedProvider
    ? `MODO DE DEMONSTRAÇÃO (trava de gasto): ${guardReason}`
    : configured
      ? provider === 'fake'
        ? 'MODO DE DEMONSTRAÇÃO: propostas-modelo genéricas, sem provedor de IA.'
        : `Provedor ${provider} (${model})${fallbackProvider ? `, fallback ${fallbackProvider}` : ''}`
      : provider === 'fake'
        ? 'Nenhum provedor de IA configurado. Defina ANTHROPIC_API_KEY (ou OPENAI_API_KEY + OPENAI_MODEL).'
        : `AI_PROVIDER=${provider} sem credenciais: defina a chave correspondente.`;
  return { configured, provider, model, fallbackProvider, fallbackModel, note, paidAllowed, mode: provider === 'fake' ? 'demo' : 'real', blockedProvider, guardReason };
}

/** Resumo do modo para logs (nomes, nunca chaves). */
export function describeAiMode(cfg: AiConfig = aiConfigFromEnv()): string {
  const base = `IA: modo ${cfg.mode} · provedor ${cfg.provider}${cfg.model ? ` (${cfg.model})` : ''} · ALLOW_PAID_PROVIDERS=${cfg.paidAllowed ? '1' : 'não'}`;
  return cfg.blockedProvider ? `${base} · ${cfg.blockedProvider} bloqueado pela trava` : base;
}

export function createAdapter(provider: ProviderName, env: NodeJS.ProcessEnv = process.env): LlmAdapter {
  // defesa em profundidade: nunca instanciar um adapter pago sem a trava liberada
  if (provider !== 'fake' && !paidProvidersAllowed(env)) throw new LlmError(provider, 'auth', PAID_GUARD_REASON);
  if (provider === 'anthropic') return new AnthropicAdapter(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL);
  if (provider === 'openai') return new OpenAIAdapter(env.OPENAI_API_KEY!, env.OPENAI_MODEL || '');
  return createTemplateFakeAdapter();
}

export interface AdapterSet {
  primary: LlmAdapter;
  fallback?: LlmAdapter;
}

export function createAdaptersFromEnv(env: NodeJS.ProcessEnv = process.env): AdapterSet {
  const cfg = aiConfigFromEnv(env);
  if (!cfg.configured) throw new LlmError(cfg.provider, 'auth', cfg.note);
  return { primary: createAdapter(cfg.provider, env), fallback: cfg.fallbackProvider ? createAdapter(cfg.fallbackProvider, env) : undefined };
}

/**
 * Fallback entre fornecedores: só em erros transitórios (429/5xx/rede), nunca
 * em recusa, erro de schema ou de autenticação; registrado no resultado.
 * Reenviar dados a um segundo fornecedor só acontece quando ele foi configurado
 * explicitamente (AI_FALLBACK_PROVIDER).
 */
export async function generateWithFallback<T>(set: AdapterSet, req: StructuredRequest<T>, log: (m: string) => void = () => {}): Promise<StructuredResult<T>> {
  try {
    return await set.primary.generateStructured(req);
  } catch (e) {
    if (set.fallback && e instanceof LlmError && e.retryable) {
      log(`[ai] ${set.primary.provider} falhou (${e.kind}); usando fallback ${set.fallback.provider}`);
      const r = await set.fallback.generateStructured(req);
      return { ...r, fallbackUsed: true };
    }
    throw e;
  }
}
