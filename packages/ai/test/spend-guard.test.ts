import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_PRICES, LlmError, aiConfigFromEnv, aiPriceTable, createAdapter, createAdaptersFromEnv, describeAiMode, estimateAiCostUsd, paidProvidersAllowed, priceForModel } from '../src';

const paidEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-not-real', OPENAI_MODEL: 'gpt-5-mini', ...extra });

describe('trava de provedores pagos (ALLOW_PAID_PROVIDERS)', () => {
  it('sem a variável, AI_PROVIDER pago com chave cai para fake em modo demo (configurado) e informa o motivo', () => {
    const cfg = aiConfigFromEnv(paidEnv());
    expect(paidProvidersAllowed(paidEnv())).toBe(false);
    expect(cfg.provider).toBe('fake');
    expect(cfg.mode).toBe('demo');
    expect(cfg.paidAllowed).toBe(false);
    expect(cfg.configured).toBe(true);
    expect(cfg.blockedProvider).toBe('openai');
    expect(cfg.guardReason).toMatch(/ALLOW_PAID_PROVIDERS/);
    expect(cfg.fallbackProvider).toBeUndefined();
    expect(cfg.note).toMatch(/DEMONSTRAÇÃO/);
    expect(describeAiMode(cfg)).not.toMatch(/sk-test/);
  });

  it('em produção com chaves a trava continua fechada sem a variável', () => {
    const cfg = aiConfigFromEnv(paidEnv({ NODE_ENV: 'production', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'ant-not-real' }));
    expect(cfg.provider).toBe('fake');
    expect(cfg.blockedProvider).toBe('anthropic');
  });

  it('com ALLOW_PAID_PROVIDERS=1 (ou true) o provedor pedido vale e o modo é real', () => {
    for (const v of ['1', 'true', 'TRUE']) {
      const cfg = aiConfigFromEnv(paidEnv({ ALLOW_PAID_PROVIDERS: v }));
      expect(cfg.provider).toBe('openai');
      expect(cfg.model).toBe('gpt-5-mini');
      expect(cfg.mode).toBe('real');
      expect(cfg.paidAllowed).toBe(true);
      expect(cfg.blockedProvider).toBeUndefined();
    }
    expect(aiConfigFromEnv(paidEnv({ ALLOW_PAID_PROVIDERS: '0' })).provider).toBe('fake');
    expect(aiConfigFromEnv(paidEnv({ ALLOW_PAID_PROVIDERS: 'yes' })).provider).toBe('fake');
  });

  it('fake explícito continua demo e configurado, com ou sem a variável', () => {
    expect(aiConfigFromEnv({ AI_PROVIDER: 'fake' })).toMatchObject({ provider: 'fake', configured: true, mode: 'demo' });
    expect(aiConfigFromEnv({ AI_PROVIDER: 'fake', ALLOW_PAID_PROVIDERS: '1' })).toMatchObject({ provider: 'fake', configured: true, mode: 'demo', paidAllowed: true });
  });

  it('sem provedor nem chaves continua "não configurado" (não vira demo por acidente)', () => {
    expect(aiConfigFromEnv({})).toMatchObject({ provider: 'fake', configured: false, mode: 'demo' });
  });

  it('createAdapter recusa instanciar um adapter pago com a trava fechada; createAdaptersFromEnv devolve o fake', () => {
    expect(() => createAdapter('openai', paidEnv())).toThrowError(LlmError);
    expect(() => createAdapter('anthropic', { ANTHROPIC_API_KEY: 'x' })).toThrowError(/ALLOW_PAID_PROVIDERS/);
    const set = createAdaptersFromEnv(paidEnv());
    expect(set.primary.provider).toBe('fake');
    expect(set.fallback).toBeUndefined();
  });

  it('o fallback pago só entra com a trava aberta', () => {
    const env = paidEnv({ AI_FALLBACK_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'ant-not-real' });
    expect(aiConfigFromEnv(env).fallbackProvider).toBeUndefined();
    expect(aiConfigFromEnv({ ...env, ALLOW_PAID_PROVIDERS: '1' }).fallbackProvider).toBe('anthropic');
  });
});

describe('estimativa de custo de IA (tabela de preços)', () => {
  it('casa o id do modelo por prefixo mais longo', () => {
    expect(priceForModel('gpt-5-mini-2026-03-01', DEFAULT_AI_PRICES)).toEqual(DEFAULT_AI_PRICES['gpt-5-mini']);
    expect(priceForModel('gpt-5-2026-03-01', DEFAULT_AI_PRICES)).toEqual(DEFAULT_AI_PRICES['gpt-5']);
    expect(priceForModel('claude-opus-5-5', DEFAULT_AI_PRICES)).toEqual(DEFAULT_AI_PRICES['claude-opus-5-5']);
    expect(priceForModel('modelo-desconhecido', DEFAULT_AI_PRICES)).toBeUndefined();
  });

  it('calcula tokens × preço por milhão (OpenAI: cache incluso na entrada; Anthropic: cache à parte)', () => {
    // gpt-5: 1.25 / 10 por 1M
    expect(estimateAiCostUsd('gpt-5', { inputTokens: 1000, outputTokens: 500 }, { table: DEFAULT_AI_PRICES })).toBeCloseTo(0.00625, 6);
    // 1000 de entrada dos quais 400 em cache (0.125/1M): 600*1.25 + 400*0.125 + 500*10
    expect(estimateAiCostUsd('gpt-5', { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 400 }, { table: DEFAULT_AI_PRICES, cacheIncludedInInput: true })).toBeCloseTo((600 * 1.25 + 400 * 0.125 + 500 * 10) / 1e6, 9);
    // anthropic opus: 4 / 20 / 0.2
    expect(estimateAiCostUsd('claude-opus-5-5', { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 50_000 }, { table: DEFAULT_AI_PRICES })).toBeCloseTo((10_000 * 4 + 2_000 * 20 + 50_000 * 0.2) / 1e6, 9);
    expect(estimateAiCostUsd('x-desconhecido', { inputTokens: 1, outputTokens: 1 }, { table: DEFAULT_AI_PRICES })).toBeUndefined();
  });

  it('AI_PRICES_JSON sobrescreve por chave e ignora JSON inválido', () => {
    const table = aiPriceTable({ AI_PRICES_JSON: '{"gpt-5":{"input":2,"output":20},"meu-modelo":{"input":1,"output":1},"ruim":{"input":"x"}}' });
    expect(table['gpt-5']).toEqual({ input: 2, output: 20 });
    expect(table['meu-modelo']).toEqual({ input: 1, output: 1 });
    expect(table['ruim']).toBeUndefined();
    expect(table['gpt-5-mini']).toEqual(DEFAULT_AI_PRICES['gpt-5-mini']);
    expect(estimateAiCostUsd('gpt-5', { inputTokens: 1_000_000, outputTokens: 0 }, { table })).toBe(2);
    expect(aiPriceTable({ AI_PRICES_JSON: '{nope' })).toBe(DEFAULT_AI_PRICES);
  });
});
