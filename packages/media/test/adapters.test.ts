import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CINEMATIC_SAFETY_SUFFIX, ElevenLabsAdapter, HEYGEN_ADAPTER_VERSION, HeyGenAdapter, HeyGenError, clampCinematicDuration, isTransparentUnsupportedError, verifyHeyGenWebhookSignature, sceneHashSync, simulatedSilenceWav, sniffMime, mediaConfigFromEnv } from '../src';

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('HeyGenAdapter — cena em movimento (cinematic_avatar)', () => {
  it('envia type cinematic_avatar, avatar_id em lista, modelo, duração ajustada, sufixo de segurança e Idempotency-Key (sem callback)', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'cin_1', status: 'pending', output_format: 'mp4' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    const r = await hg.createCinematicVideo({ title: 'c/l/n#s1 (movimento)', lookIds: ['look_1', 'look_1', ' '], prompt: '  The presenter walks into the office;   slow tracking shot  ', durationSeconds: 7.2, resolution: '1080p', model: 'seedance_2', idempotencyKey: 'req:s1:0' });
    expect(r).toEqual({ videoId: 'cin_1', status: 'pending' });
    const c = calls[0]!;
    expect(c.url).toBe('https://api.test/v3/videos');
    expect(c.init.method).toBe('POST');
    expect(new Headers(c.init.headers).get('Idempotency-Key')).toBe('req:s1:0');
    const body = JSON.parse(String(c.init.body));
    expect(body).toEqual({
      type: 'cinematic_avatar', title: 'c/l/n#s1 (movimento)', avatar_id: ['look_1'], model: 'seedance_2', aspect_ratio: '16:9', resolution: '1080p', duration: 8,
      prompt: `The presenter walks into the office; slow tracking shot. ${CINEMATIC_SAFETY_SUFFIX}`,
    });
    expect(body.callback_url).toBeUndefined();
    expect(body.callback_id).toBeUndefined();
  });

  it('duração fica em 4–15 s (5–15 no heygen_video_1, que só faz 720p)', async () => {
    expect(clampCinematicDuration(1.2)).toBe(4);
    expect(clampCinematicDuration(22)).toBe(15);
    expect(clampCinematicDuration(9.01)).toBe(10);
    expect(clampCinematicDuration(3, 'heygen_video_1')).toBe(5);
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'cin_2', status: 'pending' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await hg.createCinematicVideo({ title: 't', lookIds: ['a', 'b', 'c', 'd'], prompt: 'Walks.', durationSeconds: 30, resolution: '1080p', model: 'heygen_video_1', idempotencyKey: 'k2' });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ duration: 15, resolution: '720p', model: 'heygen_video_1', avatar_id: ['a', 'b', 'c'] });
    expect(body.prompt.endsWith(CINEMATIC_SAFETY_SUFFIX)).toBe(true);
    await expect(hg.createCinematicVideo({ title: 't', lookIds: [], prompt: 'x', durationSeconds: 5, idempotencyKey: 'k3' })).rejects.toThrow(/sem look/);
    await expect(hg.createCinematicVideo({ title: 't', lookIds: ['a'], prompt: '  ', durationSeconds: 5, idempotencyKey: 'k4' })).rejects.toThrow(/sem pedido/);
  });

  it('status da cena em movimento usa o mesmo GET /v3/videos/{id} (status + video_url)', async () => {
    const { fetch } = fakeFetch(() => json({ data: { status: 'completed', video_url: 'https://cdn.test/c.mp4', duration: 8 } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    expect(await hg.getVideo('cin_1')).toMatchObject({ status: 'completed', videoUrl: 'https://cdn.test/c.mp4', durationSeconds: 8 });
  });
});

describe('HeyGenAdapter (v3)', () => {
  it('cria vídeo com script+voz, enviando x-api-key e Idempotency-Key', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'vid_1', status: 'waiting' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    const r = await hg.createAvatarVideo({ title: 'Cena', avatarId: 'look_1', script: 'Olá', voiceId: 'v1', idempotencyKey: 'job-1' });
    expect(r).toEqual({ videoId: 'vid_1', status: 'waiting' });
    const c = calls[0]!;
    expect(c.url).toBe('https://api.test/v3/videos');
    const h = new Headers(c.init.headers);
    expect(h.get('x-api-key')).toBe('k');
    expect(h.get('Idempotency-Key')).toBe('job-1');
    const body = JSON.parse(String(c.init.body));
    expect(body).toMatchObject({ type: 'avatar', avatar_id: 'look_1', script: 'Olá', voice_id: 'v1', aspect_ratio: '16:9', resolution: '1080p', output_format: 'mp4' });
    expect(body.audio_asset_id).toBeUndefined();
  });

  it('usa audio_asset_id (áudio externo) e omite script/voz', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'vid_2', status: 'waiting' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await hg.createAvatarVideo({ title: 'Cena', avatarId: 'look_1', audioAssetId: 'aud_9', idempotencyKey: 'job-2' });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.audio_asset_id).toBe('aud_9');
    expect(body.script).toBeUndefined();
    expect(body.voice_id).toBeUndefined();
    expect(body.aspect_ratio).toBe('auto');
  });

  it('rejeita roteiro acima de 5000 caracteres antes de chamar a API', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await expect(hg.createAvatarVideo({ title: 't', avatarId: 'a', script: 'x'.repeat(5001), idempotencyKey: 'j' })).rejects.toThrow(/5\.000/);
    expect(calls).toHaveLength(0);
  });

  it('mapeia erros da API com código, mensagem e Retry-After', async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'retry-after': '7' }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    const err = await hg.getVideo('v').catch((e) => e);
    expect(err).toBeInstanceOf(HeyGenError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 7 });
  });

  it('lê o status do vídeo', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { id: 'v', status: 'completed', video_url: 'https://cdn/x.mp4?Expires=1', duration: 12.5 } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    const r = await hg.getVideo('v');
    expect(calls[0]!.url).toBe('https://api.test/v3/videos/v');
    expect(r).toMatchObject({ status: 'completed', videoUrl: 'https://cdn/x.mp4?Expires=1', durationSeconds: 12.5 });
  });

  it('verifica assinatura de webhook (HMAC-SHA256 do corpo bruto) em tempo constante', () => {
    const secret = 'whsec_test';
    const raw = JSON.stringify({ event_type: 'avatar_video.success', event_data: { video_id: 'v' } });
    const sig = createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyHeyGenWebhookSignature(raw, sig, secret)).toBe(true);
    expect(verifyHeyGenWebhookSignature(raw, sig.toUpperCase(), secret)).toBe(true);
    expect(verifyHeyGenWebhookSignature(raw + ' ', sig, secret)).toBe(false);
    expect(verifyHeyGenWebhookSignature(raw, null, secret)).toBe(false);
    expect(verifyHeyGenWebhookSignature(raw, 'abcd', secret)).toBe(false);
  });
});

describe('ElevenLabsAdapter', () => {
  it('sintetiza com xi-api-key, model_id e output_format, lendo character-cost', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(new Uint8Array([73, 68, 51, 1]), { status: 200, headers: { 'character-cost': '42', 'request-id': 'req_1' } }));
    const el = new ElevenLabsAdapter('xk', 'https://el.test', fetch);
    const r = await el.synthesize({ text: 'Bom dia', voiceId: 'voz' });
    expect(calls[0]!.url).toBe('https://el.test/v1/text-to-speech/voz?output_format=mp3_44100_128');
    expect(new Headers(calls[0]!.init.headers).get('xi-api-key')).toBe('xk');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ text: 'Bom dia', model_id: 'eleven_multilingual_v2' });
    expect(r.characterCost).toBe(42);
    expect(r.requestId).toBe('req_1');
    expect(r.bytes.byteLength).toBe(4);
  });
});

describe('utilitários', () => {
  it('hash de cena muda com roteiro, avatar, voz, parâmetros e versão do adapter', () => {
    const base = { script: 'a', avatarId: 'x', voiceProvider: 'heygen' as const, voiceId: 'v', params: { r: '1080p' }, adapterVersion: 'h1' };
    const h = sceneHashSync(base);
    expect(sceneHashSync({ ...base, script: ' a ' })).toBe(h);
    expect(sceneHashSync({ ...base, script: 'b' })).not.toBe(h);
    expect(sceneHashSync({ ...base, voiceId: 'w' })).not.toBe(h);
    expect(sceneHashSync({ ...base, adapterVersion: 'h2' })).not.toBe(h);
  });
  it('wav simulado é um WAV válido e detectável', () => {
    const wav = simulatedSilenceWav(2, 8000);
    expect(wav.byteLength).toBe(44 + 2 * 8000 * 2);
    expect(sniffMime(wav.subarray(0, 32))).toBe('audio/wav');
    expect(sniffMime(new TextEncoder().encode('<script>'))).toBeNull();
  });
  it('sem HEYGEN_API_KEY (ou sem ALLOW_PAID_PROVIDERS=1) o modo é simulado', () => {
    expect(mediaConfigFromEnv({} as NodeJS.ProcessEnv).simulation).toBe(true);
    // trava de gasto (auditoria P0-1): a chave sozinha não libera o modo real
    expect(mediaConfigFromEnv({ HEYGEN_API_KEY: 'k' } as NodeJS.ProcessEnv).simulation).toBe(true);
    expect(mediaConfigFromEnv({ HEYGEN_API_KEY: 'k', ALLOW_PAID_PROVIDERS: '1' } as NodeJS.ProcessEnv).simulation).toBe(false);
    expect(mediaConfigFromEnv({ HEYGEN_API_KEY: 'k', ALLOW_PAID_PROVIDERS: '1', MEDIA_SIMULATION: '1' } as NodeJS.ProcessEnv).simulation).toBe(true);
  });
});

describe('HeyGen upload de asset', () => {
  it('envia multipart/form-data com o campo "file"', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { id: 'ast_1' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    const r = await hg.uploadAsset(new Uint8Array([1, 2, 3]), 'audio/mpeg');
    expect(r.assetId).toBe('ast_1');
    const body = calls[0]!.init.body;
    expect(body).toBeInstanceOf(FormData);
    const file = (body as FormData).get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe('audio/mpeg');
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBeNull();
  });
});

describe('HeyGenAdapter — fundo transparente (webm com alfa)', () => {
  it('transparent: output_format webm, SEM background e sem remove_background; pedido normal inalterado', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'v', status: 'waiting' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await hg.createAvatarVideo({ title: 't', avatarId: 'a', audioAssetId: 'aud', engine: 'avatar_iv', removeBackground: true, backgroundColor: '#EFE6D8', backgroundAssetId: 'img_1', transparent: true, idempotencyKey: 'k1' });
    const b = JSON.parse(String(calls[0]!.init.body));
    expect(b.output_format).toBe('webm');
    expect(b).not.toHaveProperty('background');
    expect(b).not.toHaveProperty('remove_background');
    expect(b).toMatchObject({ type: 'avatar', avatar_id: 'a', audio_asset_id: 'aud', engine: { type: 'avatar_iv' } });
    // sem transparent: mesmo corpo de antes (mesma versão do adapter, hashes antigos valem)
    await hg.createAvatarVideo({ title: 't', avatarId: 'a', audioAssetId: 'aud', removeBackground: true, backgroundColor: '#EFE6D8', idempotencyKey: 'k2' });
    const b2 = JSON.parse(String(calls[1]!.init.body));
    expect(Object.keys(b2)).toEqual(['type', 'title', 'avatar_id', 'aspect_ratio', 'resolution', 'background', 'output_format', 'remove_background', 'audio_asset_id']);
    expect(b2).toMatchObject({ output_format: 'mp4', background: { type: 'color', value: '#EFE6D8' }, remove_background: true });
    expect(HEYGEN_ADAPTER_VERSION).toBe('heygen-v3.2');
  });
  it('keepLookBackground (tela cheia): MP4 opaco, SEM background e sem remove_background', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'v', status: 'waiting' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await hg.createAvatarVideo({ title: 't', avatarId: 'seated', audioAssetId: 'aud', removeBackground: true, backgroundColor: '#EFE6D8', backgroundAssetId: 'img_1', keepLookBackground: true, idempotencyKey: 'k1:ff' });
    const b = JSON.parse(String(calls[0]!.init.body));
    expect(b.output_format).toBe('mp4');
    expect(b).not.toHaveProperty('background');
    expect(b).not.toHaveProperty('remove_background');
    expect(b).toMatchObject({ type: 'avatar', avatar_id: 'seated', audio_asset_id: 'aud' });
  });
  it('recusa de webm (avatar sem matting) é reconhecida; outros erros não', () => {
    expect(isTransparentUnsupportedError(new HeyGenError(400, 'invalid_parameter', 'This video avatar does not support webm output. The avatar must be trained with matting enabled.'))).toBe(true);
    expect(isTransparentUnsupportedError(new HeyGenError(400, 'invalid_parameter', 'script too long'))).toBe(false);
    expect(isTransparentUnsupportedError(new HeyGenError(500, 'internal', 'webm encoder crashed'))).toBe(false);
    expect(isTransparentUnsupportedError(new Error('webm'))).toBe(false);
  });
});

describe('expressividade (HeyGen v3 + ElevenLabs v4)', () => {
  it('HeyGen envia motor, expressividade, gesto e recorte de fundo; não manda expressiveness no avatar_v', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { video_id: 'v', status: 'waiting' } }));
    const hg = new HeyGenAdapter('k', 'https://api.test', fetch);
    await hg.createAvatarVideo({ title: 't', avatarId: 'a', audioAssetId: 'aud', engine: 'avatar_iv', expressiveness: 'high', motionPrompt: 'nods and opens hands, warm', removeBackground: true, backgroundColor: '#EFE6D8', idempotencyKey: 'k1' });
    const b = JSON.parse(String(calls[0]!.init.body));
    expect(b).toMatchObject({ engine: { type: 'avatar_iv' }, expressiveness: 'high', motion_prompt: 'nods and opens hands, warm', remove_background: true, background: { type: 'color', value: '#EFE6D8' } });
    await hg.createAvatarVideo({ title: 't', avatarId: 'a', script: 'oi', voiceId: 'v', engine: 'avatar_v', expressiveness: 'high', idempotencyKey: 'k2' });
    expect(JSON.parse(String(calls[1]!.init.body)).expressiveness).toBeUndefined();
  });
  it('ElevenLabs v4 manda só stability/similarity e continuidade; v2 mantém o conjunto completo', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(new Uint8Array([1]), { status: 200 }));
    const el = new ElevenLabsAdapter('x', 'https://el.test', fetch);
    await el.synthesize({ text: 'Oi', voiceId: 'v', modelId: 'eleven_v4', stability: 0.35, previousText: 'antes' });
    const b4 = JSON.parse(String(calls[0]!.init.body));
    expect(b4.voice_settings).toEqual({ stability: 0.35, similarity_boost: 0.75 });
    expect(b4.previous_text).toBe('antes');
    await el.synthesize({ text: 'Oi', voiceId: 'v', modelId: 'eleven_multilingual_v2' });
    expect(JSON.parse(String(calls[1]!.init.body)).voice_settings).toMatchObject({ style: 0, use_speaker_boost: true });
  });
});
