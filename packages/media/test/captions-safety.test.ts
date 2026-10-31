import { describe, expect, it } from 'vitest';
import { ElevenLabsAdapter, ElevenLabsError, HeyGenAdapter, HeyGenError, COMPOSE_PIPELINE_VERSION, directionLinesMatchSpoken, parseTimestampsResponse, spokenWords } from '../src';
import { approxWords, buildCaptionCues, mapWordsToTimeline, syntheticAlignment, toWebVtt, vttTimestamp, wordsFromAlignment, wrapCaption, type CharAlignment } from '../src/compose';

function alignmentOf(text: string, dt = 0.05): CharAlignment {
  const characters = Array.from(text);
  return { characters, startTimes: characters.map((_, i) => i * dt), endTimes: characters.map((_, i) => (i + 1) * dt) };
}

describe('legendas (função pura)', () => {
  it('palavras a partir do alinhamento, com recorte por intervalo', () => {
    const w = wordsFromAlignment(alignmentOf('Olá, mundo. Tudo bem?'));
    expect(w.map((x) => x.text)).toEqual(['Olá,', 'mundo.', 'Tudo', 'bem?']);
    expect(w[0]).toEqual({ text: 'Olá,', start: 0, end: expect.closeTo(0.2, 5) });
    expect(w[2]!.start).toBeCloseTo(12 * 0.05, 5);
    expect(wordsFromAlignment(alignmentOf('Olá, mundo. Tudo bem?'), { from: 0.5, to: 0.8 }).map((x) => x.text)).toEqual(['Tudo']);
  });

  it('uma legenda por frase; frase longa quebra na vírgula; no máximo 2 linhas de 42; curtas são fundidas', () => {
    const text = 'Quando o prazo aperta, a primeira reação é esconder o problema, mas isso custa caro para todo o time. Certo. Então vamos ver como avisar cedo.';
    const cues = buildCaptionCues(wordsFromAlignment(alignmentOf(text, 0.06)));
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(84);
      expect(c.end - c.start).toBeLessThanOrEqual(5.5);
      expect(c.end).toBeGreaterThan(c.start);
    }
    // a 1ª frase (101 chars) quebra numa vírgula
    expect(cues[0]!.text).toMatch(/,$/);
    // "Certo." (0,36 s) é curto demais sozinho: fundido ao vizinho
    expect(cues.some((c) => c.text === 'Certo.')).toBe(false);
    expect(cues.map((c) => c.text).join(' ')).toBe(text);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.end - 1e-9);
    expect(wrapCaption('a primeira reação é esconder o problema, mas isso custa caro').split('\n')).toHaveLength(2);
  });

  it('WebVTT válido (cabeçalho, tempos hh:mm:ss.mmm, sem "-->" no texto)', () => {
    const vtt = toWebVtt([{ start: 0, end: 1.5, text: 'Oi --> tudo bem' }, { start: 61.25, end: 3725.004, text: 'Fim.' }]);
    expect(vtt.startsWith('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nOi → tudo bem\n\n2\n00:01:01.250 --> 01:02:05.004\nFim.\n')).toBe(true);
    expect(vttTimestamp(0.0004)).toBe('00:00:00.000');
  });

  it('linha do tempo final: plano após crossfade começa no fim do anterior (sem sobreposição); cena em movimento soma o respiro', () => {
    // mesmo cálculo do compositor: planos de 4 s e 7 s (cena em movimento com respiro de 1,2 s) e 3 s após crossfade
    const a = { words: [{ text: 'Primeira', start: 0.1, end: 0.6 }, { text: 'fala.', start: 0.7, end: 1.2 }], sourceStart: 0, timelineStart: 0, duration: 4 };
    const cine = { words: [{ text: 'Chegando.', start: 0.2, end: 0.9 }], sourceStart: 0, timelineStart: 4, duration: 7, audioDelay: 1.2 };
    // plano fundido: usa o trecho 2,0–5,0 s do clipe compartilhado (palavras fora do trecho ficam com o outro plano)
    const merged = { words: [{ text: 'antes', start: 1.5, end: 1.9 }, { text: 'Depois', start: 2.2, end: 2.8 }], sourceStart: 2, timelineStart: 11, duration: 3 };
    const words = mapWordsToTimeline([a, cine, merged]);
    expect(words.map((w) => [w.text, Number(w.start.toFixed(3))])).toEqual([['Primeira', 0.1], ['fala.', 0.7], ['Chegando.', 5.4], ['Depois', 11.2]]);
    const cues = buildCaptionCues(words);
    expect(cues[cues.length - 1]!.start).toBeCloseTo(11.2, 3);
  });

  it('sem alinhamento (voz do HeyGen): tempos proporcionais aos caracteres', () => {
    const w = approxWords('um dois três', 10, 3);
    expect(w).toHaveLength(3);
    expect(w[0]!.start).toBe(10);
    expect(w[2]!.end).toBeLessThanOrEqual(13);
    expect(buildCaptionCues(w)).toHaveLength(1);
    // simulação: alinhamento sintético gera legendas utilizáveis
    expect(buildCaptionCues(wordsFromAlignment(syntheticAlignment('Olá. Tudo bem com você hoje?', 3))).length).toBeGreaterThan(0);
  });
});

describe('ElevenLabs: erros depois do 200 nunca são repetíveis (a síntese já foi cobrada)', () => {
  const ok = (body: string) => (async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
  it('corpo inválido, sem áudio ou alinhamento inconsistente -> ElevenLabsError retryable=false', async () => {
    for (const body of ['nao-json', JSON.stringify({ alignment: {} }), JSON.stringify({ audio_base64: 'QQ==', alignment: { characters: ['a'], character_start_times_seconds: [], character_end_times_seconds: [0] } })]) {
      const e = await new ElevenLabsAdapter('k', 'https://el.test', ok(body)).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' }).catch((x) => x);
      expect(e).toBeInstanceOf(ElevenLabsError);
      expect(e.retryable).toBe(false);
    }
    expect(() => parseTimestampsResponse('{}')).toThrow(ElevenLabsError);
  });
  it('o corpo bruto pode ser guardado e interpretado depois, sem nova chamada', async () => {
    let calls = 0;
    const body = JSON.stringify({ audio_base64: Buffer.from('ID3x').toString('base64'), alignment: { characters: ['O', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] } });
    const fake = (async () => { calls++; return new Response(body, { status: 200, headers: { 'character-cost': '2' } }); }) as unknown as typeof fetch;
    const r = await new ElevenLabsAdapter('k', 'https://el.test', fake).synthesizeWithTimestampsRaw({ text: 'Oi', voiceId: 'v' });
    expect(r.characterCost).toBe(2);
    expect(parseTimestampsResponse(r.raw).alignment.characters).toEqual(['O', 'i']);
    expect(calls).toBe(1);
  });
  it('5xx/429 e timeout são repetíveis; 4xx não', async () => {
    const st = (n: number) => (async () => new Response('x', { status: n })) as unknown as typeof fetch;
    expect((await new ElevenLabsAdapter('k', 'u', st(500)).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' }).catch((x) => x)).retryable).toBe(true);
    expect((await new ElevenLabsAdapter('k', 'u', st(429)).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' }).catch((x) => x)).retryable).toBe(true);
    expect((await new ElevenLabsAdapter('k', 'u', st(401)).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' }).catch((x) => x)).retryable).toBe(false);
    const abort = (async (_u: unknown, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    const e = await new ElevenLabsAdapter('k', 'u', abort).synthesizeWithTimestamps({ text: 'a', voiceId: 'v' }).catch((x) => x);
    expect(e).toMatchObject({ status: 504, retryable: true });
  });
});

describe('HeyGen: timeouts', () => {
  it('cada chamada leva AbortSignal; timeout vira HeyGenError 504 (repetível; o POST leva Idempotency-Key)', async () => {
    const abort = (async (_u: unknown, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    const e = await new HeyGenAdapter('k', 'https://hg.test', abort).getVideo('v1').catch((x) => x);
    expect(e).toBeInstanceOf(HeyGenError);
    expect(e).toMatchObject({ status: 504, code: 'timeout' });
  });
});

describe('direção x fala da cena', () => {
  it('compara sequências de palavras (minúsculas, sem pontuação); recusa plano sem palavras', () => {
    expect(spokenWords('Olá, MUNDO! 2 vezes')).toEqual(['olá', 'mundo', '2', 'vezes']);
    expect(directionLinesMatchSpoken(['Olá, mundo.', 'Tudo bem?'], 'olá mundo — tudo bem')).toEqual({ ok: true });
    expect(directionLinesMatchSpoken(['Olá, mundo.'], 'Olá, mundo. Tudo bem?')).toEqual({ ok: false, reason: 'mismatch' });
    expect(directionLinesMatchSpoken(['Olá, mundo.', '...'], 'Olá, mundo.')).toEqual({ ok: false, reason: 'empty_line', index: 1 });
    expect(COMPOSE_PIPELINE_VERSION).toBe('compose-2');
  });
});
