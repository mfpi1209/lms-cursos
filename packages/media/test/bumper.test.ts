import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ElevenLabsSfxAdapter, bumperSoundPrompt, estimateSoundEffectUsd } from '../src';
import {
  BUMPER_RENDERER_VERSION, bumperAnimationSeconds, bumperAnimationTime, bumperSpecHash, bumperStateAt, bumperSynthFilter, ffprobe, generateBumperAudio, normalizeBumperSpec, renderBumper, renderBumperFrames, pngSize, appendBumperToVideo, generateTestClip,
  type BumperSpec,
} from '../src/compose';
import { readFileSync } from 'node:fs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'lms-bumper-'));
const base: BumperSpec = { brand: 'dnawork', style: 'reveal', variant: 'light', durationSec: 3, tagline: 'Frase de teste da vinheta.', audio: { kind: 'synth', preset: 'warm' }, placement: 'outro' };

describe('vinheta: especificação e hash', () => {
  it('normaliza limites (3–5 s, frase ≤ 60) e preenche a frase do preset', () => {
    const n = normalizeBumperSpec({ ...base, durationSec: 9, tagline: 'x'.repeat(80) });
    expect(n.durationSec).toBe(5);
    expect(n.tagline).toHaveLength(60);
    expect(normalizeBumperSpec({ ...base, durationSec: 1 }).durationSec).toBe(3);
    expect(normalizeBumperSpec({ ...base, tagline: undefined }).tagline).toBe('');
    expect(normalizeBumperSpec({ ...base, aspect: undefined }).aspect).toBe('16:9');
  });
  it('hash: estável, muda com estilo/variante/duração/áudio/proporção e inclui a versão do renderizador', () => {
    const h = bumperSpecHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(bumperSpecHash({ ...base })).toBe(h);
    expect(bumperSpecHash({ ...base, style: 'sweep' })).not.toBe(h);
    expect(bumperSpecHash({ ...base, variant: 'navy' })).not.toBe(h);
    expect(bumperSpecHash({ ...base, durationSec: 4 })).not.toBe(h);
    expect(bumperSpecHash({ ...base, audio: { kind: 'none' } })).not.toBe(h);
    expect(bumperSpecHash({ ...base, aspect: '9:16' })).not.toBe(h);
    // áudio de arquivo: identificado pelo assetId (o caminho local não entra)
    expect(bumperSpecHash({ ...base, audio: { kind: 'file', assetId: 'ast_1', path: '/tmp/a.mp3' } })).toBe(bumperSpecHash({ ...base, audio: { kind: 'file', assetId: 'ast_1', path: '/x/b.mp3' } }));
    expect(BUMPER_RENDERER_VERSION).toMatch(/^bumper-\d+/);
  });
  it('coreografia: começa vazia, termina completa; intro é a mesma ao contrário e mais rápida', () => {
    for (const style of ['reveal', 'sweep', 'pulse'] as const) {
      const A = bumperAnimationSeconds(style, 4);
      const start = bumperStateAt(style, 0, 4);
      const end = bumperStateAt(style, A, 4);
      expect(start.underline.w).toBe(0);
      expect(start.tagline.opacity).toBe(0);
      expect(end.underline.opacity).toBe(1);
      expect(end.tagline.opacity).toBe(1);
      expect(end.tagline.typed).toBe(1);
      expect(Math.abs(end.logo.scale - 1)).toBeLessThan(0.02);
      // outro: tempo de animação = tempo do vídeo; intro: segura a marca e volta ao vazio no fim
      expect(bumperAnimationTime(style, 'outro', 1, 4)).toBe(1);
      expect(bumperAnimationTime(style, 'intro', 0, 4)).toBe(A);
      expect(bumperAnimationTime(style, 'intro', 4, 4)).toBeCloseTo(0, 5);
    }
    // sweep: a barra atravessa o quadro
    expect(bumperStateAt('sweep', 0.05, 4).bar!.x).toBeLessThan(0);
    expect(bumperStateAt('sweep', 0.85, 4).bar!.x).toBeGreaterThan(1);
  });
});

describe('vinheta: áudio sintetizado', () => {
  it('monta o grafo com as notas, loudnorm e a duração exata; gera WAV estéreo 48 kHz do tamanho pedido', async () => {
    const f = bumperSynthFilter('warm', 3);
    expect(f).toContain('aevalsrc=');
    expect((f.match(/aevalsrc=/g) ?? []).length).toBe(4); // 3 notas + pad
    expect(f).toContain('loudnorm=I=-16');
    expect(f).toContain('atrim=duration=3.000');
    expect(bumperSynthFilter('bright', 3)).toContain('aphaser');
    expect((bumperSynthFilter('minimal', 3).match(/aevalsrc=/g) ?? []).length).toBe(2);
    const dir = tmp();
    for (const preset of ['warm', 'bright', 'minimal'] as const) {
      const out = await generateBumperAudio({ kind: 'synth', preset }, 3, path.join(dir, `${preset}.wav`));
      const p = await ffprobe(out);
      expect(p.hasAudio).toBe(true);
      expect(p.durationSeconds).toBeCloseTo(3, 1);
    }
    const silent = await ffprobe(await generateBumperAudio({ kind: 'none' }, 3, path.join(dir, 'none.wav')));
    expect(silent.hasAudio).toBe(true);
    expect(silent.durationSeconds).toBeCloseTo(3, 1);
  }, 60_000);
});

describe('vinheta: render', () => {
  it('reveal 16:9 3 s: MP4 1920×1080 H.264 + AAC, 30 fps, 90 quadros, com áudio', async () => {
    const dir = tmp();
    const r = await renderBumper(base, { output: path.join(dir, 'out.mp4'), workDir: path.join(dir, 'work'), keepFrames: true });
    expect(r.frames).toBe(90);
    expect(r.fps).toBe(30);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.hash).toBe(bumperSpecHash(base));
    expect(r.durationSec).toBeCloseTo(3, 1);
    expect(readdirSync(path.join(dir, 'work', 'frames')).filter((f) => f.endsWith('.png'))).toHaveLength(90);
    const p = await ffprobe(r.videoPath);
    expect(p).toMatchObject({ width: 1920, height: 1080, hasAudio: true, hasVideo: true });
    expect(p.durationSeconds).toBeCloseTo(3, 1);
  }, 120_000);
  it('pulse 9:16 sem som: 1080×1920 com faixa AAC silenciosa; sweep navy intro; quadros de amostra', async () => {
    const dir = tmp();
    const r = await renderBumper({ ...base, style: 'pulse', variant: 'light', aspect: '9:16', audio: { kind: 'none' } }, { output: path.join(dir, 'v.mp4'), workDir: path.join(dir, 'w') });
    const p = await ffprobe(r.videoPath);
    expect(p).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
    const frames = await renderBumperFrames({ ...base, style: 'sweep', variant: 'navy', placement: 'intro' }, [0.2, 1.5, 2.9], dir, 'sweep');
    expect(frames).toHaveLength(3);
    for (const f of frames) expect(pngSize(new Uint8Array(readFileSync(f)))).toEqual({ width: 1920, height: 1080 });
  }, 120_000);
  it('preset lms (sem logo) usa a marca em texto; áudio de arquivo é cortado na duração', async () => {
    const dir = tmp();
    const tone = path.join(dir, 'tone.mp3');
    await generateTestClip({ output: path.join(dir, 'clip.mp4'), seconds: 2 });
    const { generateToneMp3 } = await import('../src/compose');
    await generateToneMp3(tone, 8);
    const r = await renderBumper({ ...base, brand: 'lms', variant: 'navy', tagline: undefined, audio: { kind: 'file', path: tone, assetId: 'ast_tone' } }, { output: path.join(dir, 'lms.mp4'), workDir: path.join(dir, 'w') });
    const p = await ffprobe(r.videoPath);
    expect(p.durationSeconds).toBeCloseTo(3, 1);
    expect(p.hasAudio).toBe(true);
    // concatenação da vinheta ao fim de um vídeo montado (appendOutro)
    const joined = await appendBumperToVideo({ video: path.join(dir, 'clip.mp4'), bumper: r.videoPath, output: path.join(dir, 'joined.mp4') });
    expect(joined.durationSeconds).toBeCloseTo(5, 0);
  }, 120_000);
});

describe('ElevenLabs Sound Effects (adapter; nunca chamado de verdade)', () => {
  it('prompt padrão em inglês, estimativa por segundo e chamada com fetch injetado', async () => {
    expect(bumperSoundPrompt({ durationSeconds: 3, mood: 'warm' })).toMatch(/^sonic logo, warm and confident, two-note rise, soft synth pad/);
    expect(estimateSoundEffectUsd(3, { elevenLabsUsdPer1kChars: 0.3, heygenUsdPerSecond: 0, heygenCinematicUsdPerSecond: 0 })).toBeCloseTo(0.09, 6);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg', 'character-cost': '300' } });
    }) as typeof fetch;
    const a = new ElevenLabsSfxAdapter('chave-de-teste', 'https://api.example.test', fetchImpl);
    const r = await a.generate({ text: 'sonic logo', durationSeconds: 3, promptInfluence: 0.4 });
    expect(r.bytes.byteLength).toBe(3);
    expect(r.characterCost).toBe(300);
    expect(calls[0]!.url).toBe('https://api.example.test/v1/sound-generation');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: 'sonic logo', duration_seconds: 3, prompt_influence: 0.4 });
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('chave-de-teste');
    await expect(a.generate({ text: '', durationSeconds: 3 })).rejects.toThrow(/descrição vazia/);
    await expect(a.generate({ text: 'x', durationSeconds: 40 })).rejects.toThrow(/duração/);
    const failing = new ElevenLabsSfxAdapter('k', 'https://api.example.test', (async () => new Response('nope', { status: 429 })) as typeof fetch);
    await expect(failing.generate({ text: 'x' })).rejects.toMatchObject({ status: 429, retryable: true });
  });
});
