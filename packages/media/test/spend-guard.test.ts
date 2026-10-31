import { describe, expect, it } from 'vitest';
import { DEFAULT_MEDIA_PRICES, describeMediaMode, estimateMediaCostUsd, mediaConfigFromEnv, mediaPriceTable, narrationPreflight, paidProvidersAllowed } from '../src';

const keys: NodeJS.ProcessEnv = { HEYGEN_API_KEY: 'hg-test-not-real', ELEVENLABS_API_KEY: 'el-test-not-real' };

describe('trava de provedores pagos na mídia (ALLOW_PAID_PROVIDERS)', () => {
  it('com chaves e sem a variável, a mídia é simulada (demo) e o motivo é a trava', () => {
    const cfg = mediaConfigFromEnv(keys);
    expect(paidProvidersAllowed(keys)).toBe(false);
    expect(cfg.simulation).toBe(true);
    expect(cfg.mode).toBe('demo');
    expect(cfg.paidAllowed).toBe(false);
    expect(cfg.simulationReason).toMatch(/ALLOW_PAID_PROVIDERS/);
    expect(describeMediaMode(cfg)).not.toMatch(/hg-test|el-test/);
  });

  it('em produção com chaves a trava continua fechada sem a variável', () => {
    expect(mediaConfigFromEnv({ ...keys, NODE_ENV: 'production' }).simulation).toBe(true);
  });

  it('com ALLOW_PAID_PROVIDERS=1 e chave do HeyGen, o modo é real', () => {
    const cfg = mediaConfigFromEnv({ ...keys, ALLOW_PAID_PROVIDERS: '1' });
    expect(cfg.simulation).toBe(false);
    expect(cfg.mode).toBe('real');
    expect(cfg.paidAllowed).toBe(true);
    expect(cfg.simulationReason).toBeUndefined();
  });

  it('MEDIA_SIMULATION=1 força simulação mesmo com a trava aberta; sem chave do HeyGen idem', () => {
    expect(mediaConfigFromEnv({ ...keys, ALLOW_PAID_PROVIDERS: '1', MEDIA_SIMULATION: '1' })).toMatchObject({ simulation: true, mode: 'demo', simulationReason: 'MEDIA_SIMULATION=1' });
    expect(mediaConfigFromEnv({ ALLOW_PAID_PROVIDERS: '1' })).toMatchObject({ simulation: true, mode: 'demo', simulationReason: 'HEYGEN_API_KEY ausente' });
  });
});

describe('estimativa de custo de mídia (tabela de preços)', () => {
  it('ElevenLabs por 1k caracteres + HeyGen por segundo (+ cena em movimento)', () => {
    // 2000 chars × 0.3/1k = 0.6; 60 s × 1/60 = 1.0
    expect(estimateMediaCostUsd({ elevenLabsChars: 2000, heygenSeconds: 60 }, DEFAULT_MEDIA_PRICES)).toBeCloseTo(1.6, 6);
    expect(estimateMediaCostUsd({ elevenLabsChars: 0, heygenSeconds: 30 }, DEFAULT_MEDIA_PRICES)).toBeCloseTo(0.5, 6);
    expect(estimateMediaCostUsd({ elevenLabsChars: 0, heygenSeconds: 0, cinematicSeconds: 10 }, DEFAULT_MEDIA_PRICES)).toBeCloseTo(1.2, 6);
    expect(estimateMediaCostUsd({ elevenLabsChars: 0, heygenSeconds: 0 }, DEFAULT_MEDIA_PRICES)).toBe(0);
  });

  it('MEDIA_PRICES_JSON sobrescreve campo a campo e ignora valores inválidos', () => {
    const t = mediaPriceTable({ MEDIA_PRICES_JSON: '{"elevenLabsUsdPer1kChars":0.5,"heygenUsdPerSecond":"x","heygenCinematicUsdPerSecond":-1}' });
    expect(t.elevenLabsUsdPer1kChars).toBe(0.5);
    expect(t.heygenUsdPerSecond).toBe(DEFAULT_MEDIA_PRICES.heygenUsdPerSecond);
    expect(t.heygenCinematicUsdPerSecond).toBe(DEFAULT_MEDIA_PRICES.heygenCinematicUsdPerSecond);
    expect(estimateMediaCostUsd({ elevenLabsChars: 1000, heygenSeconds: 0 }, t)).toBe(0.5);
    expect(mediaPriceTable({ MEDIA_PRICES_JSON: '{' })).toBe(DEFAULT_MEDIA_PRICES);
  });
});

describe('pré-checagem barata antes de pagar a narração', () => {
  it('reprova avatar simulado, voz simulada e voz nula no ElevenLabs; aprova o resto', () => {
    expect(narrationPreflight({ avatarId: 'sim_avatar_ana', voiceProvider: 'heygen', voiceId: null }).ok).toBe(false);
    expect(narrationPreflight({ avatarId: 'look_real', voiceProvider: 'elevenlabs', voiceId: null })).toMatchObject({ ok: false, reason: expect.stringMatching(/voiceId/) });
    expect(narrationPreflight({ avatarId: 'look_real', voiceProvider: 'heygen', voiceId: 'sim_voice_ana' }).ok).toBe(false);
    expect(narrationPreflight({ avatarId: '', voiceProvider: 'heygen', voiceId: null }).ok).toBe(false);
    expect(narrationPreflight({ avatarId: 'look_real', voiceProvider: 'heygen', voiceId: null })).toEqual({ ok: true });
    expect(narrationPreflight({ avatarId: 'look_real', voiceProvider: 'elevenlabs', voiceId: 'v1' })).toEqual({ ok: true });
  });
});
