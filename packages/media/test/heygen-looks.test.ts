import { describe, expect, it } from 'vitest';
import { buildCameraPrompt, buildSceneLookPrompt, HeyGenError, HeyGenLooksAdapter, LookGenerationRateLimiter, lookIdempotencyKey, sceneLookAngleOf, SimulatedHeyGenLooks } from '../src';

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

describe('buildCameraPrompt', () => {
  it('descreve câmera em inglês preservando identidade, figurino, cenário e luz', () => {
    const p = buildCameraPrompt({ angle: 'left', framing: 'close' });
    expect(p).toMatch(/^Same person, same face and identity, same outfit, same setting and lighting\./);
    expect(p).toContain("Camera: close-up, head and shoulders, from the subject's left side, about 30 degrees off-axis, eye level.");
    expect(p).toContain('Neutral expression, mouth closed, looking at the camera.');
    expect(p).toContain('not a tiny face');
    expect(p).not.toContain('Additional direction');
  });

  it('cobre todos os ângulos e enquadramentos e sempre pede rosto visível', () => {
    for (const angle of ['front', 'left', 'right', 'high', 'low'] as const) {
      for (const framing of ['wide', 'medium', 'close', 'extreme_close'] as const) {
        const p = buildCameraPrompt({ angle, framing });
        expect(p).toContain('Face clearly visible');
        expect(p).toContain('looking at the camera');
        expect(p.length).toBeLessThanOrEqual(1000);
      }
    }
    expect(buildCameraPrompt({ angle: 'front', framing: 'wide' })).toContain('straight-on from the front, eye level');
    expect(buildCameraPrompt({ angle: 'high', framing: 'medium' })).toContain('slightly high angle');
    expect(buildCameraPrompt({ angle: 'low', framing: 'extreme_close' })).toContain('extreme close-up');
  });

  it('inclui o texto extra limpo e limitado a 300 caracteres', () => {
    const p = buildCameraPrompt({ angle: 'right', framing: 'medium', extra: '  slight smile\n\nwarm   light ' });
    expect(p).toContain('Additional direction (keep everything above): slight smile warm light');
    // visual sentado: pose explícita em inglês (mesa e cadeira no quadro); pedido em pé não ganha a pose
    const seated = buildCameraPrompt({ angle: 'front', framing: 'medium', extra: 'Sentada à mesa de reunião, plano médio, de frente, mãos sobre a mesa, mesmo escritório' });
    expect(seated).toContain('Pose: seated upright on a chair at a table');
    expect(seated).toContain('Additional direction (keep everything above): Sentada à mesa de reunião');
    expect(seated.length).toBeLessThanOrEqual(1000);
    expect(p).not.toContain('Pose: seated');
    const long = buildCameraPrompt({ angle: 'right', framing: 'medium', extra: 'x'.repeat(500) });
    expect(long).toContain('x'.repeat(300));
    expect(long).not.toContain('x'.repeat(301));
  });

  it('rejeita ângulo inválido', () => {
    expect(() => buildCameraPrompt({ angle: 'top' as never, framing: 'medium' })).toThrow();
  });
});

describe('buildSceneLookPrompt (dentro do cenário, imagem de referência)', () => {
  it('mesma pessoa e roupa, DENTRO do cenário da referência, ângulo pedido, luz prática, mãos visíveis, olhando para a câmera', () => {
    const p = buildSceneLookPrompt({ angle: 'three_quarter', scenery: 'Recepção DNA Work', pronoun: 'she' });
    expect(p).toMatch(/^Same person, same face and identity and outfit as the source look\./);
    expect(p).toContain('Placed INSIDE the setting shown in the reference image (Recepção DNA Work)');
    expect(p).toContain('three-quarter view');
    expect(p).toContain('medium-wide shot from the waist up');
    expect(p).toContain('shallow depth of field');
    expect(p).toContain("Lit by the environment's practical lights");
    expect(p).toContain('Natural posture with hands visible');
    expect(p).toContain('looking at the camera');
    expect(p).toContain('Photorealistic');
    expect(p.length).toBeLessThanOrEqual(1000);
    expect(buildSceneLookPrompt({ angle: 'front' })).toContain('Placed INSIDE the setting shown in the reference image,');
    expect(buildSceneLookPrompt({ angle: 'close', pronoun: 'he' })).toContain('medium close-up from the chest up');
    expect(sceneLookAngleOf('scene_close')).toBe('close');
  });

  it('envia reference_images (até 3 URLs públicas) no POST /v3/avatars; a chave muda com as referências', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { avatar_item: { id: 'look_scene' } } }));
    const a = new HeyGenLooksAdapter('k', 'https://api.test', fetch);
    const r = await a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:abc', referenceImages: ['https://cdn.example.com/api/assets/ast_1'] });
    expect(r.generationId).toBe('look_scene');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ type: 'prompt', avatar_id: 'look_1', reference_images: [{ type: 'url', url: 'https://cdn.example.com/api/assets/ast_1' }], aspect_ratio: '16:9' });
    await expect(a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:abc', referenceImages: ['/api/assets/x'] })).rejects.toThrow(/URLs públicas/);
    // imagem embutida (base64): objeto {type:'base64', media_type, data}; a chave usa o hash do conteúdo
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    await a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:b64', referenceImages: [{ base64: png, mediaType: 'image/png' }] });
    expect(JSON.parse(String(calls.at(-1)!.init.body)).reference_images).toEqual([{ type: 'base64', media_type: 'image/png', data: png }]);
    expect(lookIdempotencyKey('w', 'l', 'p', [{ base64: png, mediaType: 'image/png' }])).toMatch(/^lookgen:[0-9a-f]{48}$/);
    await expect(a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:b64', referenceImages: [{ base64: png, mediaType: 'image/webp' }] })).rejects.toThrow(/PNG ou JPEG/);
    await expect(a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:abc', referenceImages: ['https://a/1', 'https://a/2', 'https://a/3', 'https://a/4'] })).rejects.toThrow(/no máximo 3/);
    // sem referências o corpo não leva o campo (pedidos por ângulo inalterados)
    await a.generateLookFromPrompt({ sourceLookId: 'look_1', prompt: 'p', idempotencyKey: 'lookgen:abd' });
    expect(JSON.parse(String(calls.at(-1)!.init.body))).not.toHaveProperty('reference_images');
    expect(lookIdempotencyKey('w', 'l', 'p', ['https://a/1'])).not.toBe(lookIdempotencyKey('w', 'l', 'p'));
    expect(lookIdempotencyKey('w', 'l', 'p', [])).toBe(lookIdempotencyKey('w', 'l', 'p'));
  });
});

describe('lookIdempotencyKey', () => {
  it('é estável, respeita o formato do HeyGen e varia por workspace/origem/prompt', () => {
    const a = lookIdempotencyKey('ws1', 'look_1', 'prompt');
    expect(a).toBe(lookIdempotencyKey('ws1', 'look_1', ' prompt '));
    expect(a).toMatch(/^[A-Za-z0-9_:.-]{1,255}$/);
    expect(a).not.toBe(lookIdempotencyKey('ws2', 'look_1', 'prompt'));
    expect(a).not.toBe(lookIdempotencyKey('ws1', 'look_2', 'prompt'));
    expect(a).not.toBe(lookIdempotencyKey('ws1', 'look_1', 'other'));
  });
});

describe('HeyGenLooksAdapter', () => {
  it('POST /v3/avatars type=prompt com avatar_id, x-api-key e Idempotency-Key; generationId = avatar_item.id', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { avatar_item: { id: 'lk_new', name: 'n', avatar_type: 'photo_avatar', status: 'processing' }, avatar_group: null } }));
    const a = new HeyGenLooksAdapter('secret-key', 'https://api.test', fetch);
    const r = await a.generateLookFromPrompt({ sourceLookId: 'lk_src', prompt: 'Same person.', idempotencyKey: 'lookgen:abc', name: 'Câmera IA' });
    expect(r).toEqual({ generationId: 'lk_new' });
    const c = calls[0]!;
    expect(c.url).toBe('https://api.test/v3/avatars');
    expect(c.init.method).toBe('POST');
    const h = new Headers(c.init.headers);
    expect(h.get('x-api-key')).toBe('secret-key');
    expect(h.get('Idempotency-Key')).toBe('lookgen:abc');
    expect(h.get('content-type')).toBe('application/json');
    const body = JSON.parse(String(c.init.body));
    expect(body).toEqual({ type: 'prompt', name: 'Câmera IA', prompt: 'Same person.', avatar_id: 'lk_src', aspect_ratio: '16:9' });
    // nunca define avatar_group_id: o resultado fica no grupo do look de origem
    expect(body.avatar_group_id).toBeUndefined();
    expect((c.init as Record<string, unknown>).idempotencyKey).toBeUndefined();
  });

  it('personagem novo: POST /v3/avatars type=prompt SEM avatar_id nem avatar_group_id', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { avatar_item: { id: 'lk_base', status: 'processing' }, avatar_group: { id: 'ag_new' } } }));
    const a = new HeyGenLooksAdapter('k', 'https://api.test', fetch);
    const r = await a.createCharacterFromPrompt({ prompt: 'A young Brazilian man.', idempotencyKey: 'lookgen:new', name: 'Rafael' });
    expect(r).toEqual({ generationId: 'lk_base' });
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({ type: 'prompt', name: 'Rafael', prompt: 'A young Brazilian man.', aspect_ratio: '16:9' });
    expect(new Headers(calls[0]!.init.headers).get('Idempotency-Key')).toBe('lookgen:new');
    await expect(a.createCharacterFromPrompt({ prompt: ' ', idempotencyKey: 'k1' })).rejects.toThrow(/vazio/);
    expect(calls).toHaveLength(1);
  });

  it('valida prompt, Idempotency-Key e resposta sem id', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { avatar_item: null, avatar_group: { id: 'ag' } } }));
    const a = new HeyGenLooksAdapter('k', 'https://api.test', fetch);
    await expect(a.generateLookFromPrompt({ sourceLookId: 'lk', prompt: 'x'.repeat(1001), idempotencyKey: 'k1' })).rejects.toThrow(/1\.000/);
    await expect(a.generateLookFromPrompt({ sourceLookId: 'lk', prompt: 'ok', idempotencyKey: 'chave inválida!' })).rejects.toThrow(/Idempotency/);
    expect(calls).toHaveLength(0);
    await expect(a.generateLookFromPrompt({ sourceLookId: 'lk', prompt: 'ok', idempotencyKey: 'k1' })).rejects.toThrow(/sem id/);
  });

  it('converte erros do provedor em HeyGenError com Retry-After', async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: 'rate_limit_exceeded', message: 'slow down' } }, 429, { 'retry-after': '12' }));
    const a = new HeyGenLooksAdapter('k', 'https://api.test', fetch);
    const err = await a.generateLookFromPrompt({ sourceLookId: 'lk', prompt: 'ok', idempotencyKey: 'k1' }).catch((e) => e);
    expect(err).toBeInstanceOf(HeyGenError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limit_exceeded', retryAfterSeconds: 12 });
    expect(String(err.message)).not.toContain('k1');
  });

  it('GET /v3/avatars/looks/{id}: mapeia status', async () => {
    const responses: Record<string, unknown> = {
      lk_done: { id: 'lk_done', status: 'completed', preview_image_url: 'https://cdn/p.png', supported_api_engines: ['avatar_iv', 'avatar_v'] },
      lk_proc: { id: 'lk_proc', status: 'processing' },
      lk_fail: { id: 'lk_fail', status: 'failed', error: { code: 'generation_failed', message: 'Bad image' } },
      lk_cons: { id: 'lk_cons', status: 'pending_consent' },
      lk_null: { id: 'lk_null', status: null },
      lk_pub: { id: 'lk_pub', status: null, preview_image_url: 'https://cdn/pub.png' },
    };
    const { fetch, calls } = fakeFetch((url) => json({ data: responses[url.split('/').pop()!] }));
    const a = new HeyGenLooksAdapter('k', 'https://api.test', fetch);
    expect(await a.getLookGeneration('lk_done')).toEqual({ status: 'completed', lookId: 'lk_done', previewUrl: 'https://cdn/p.png', supportedEngines: ['avatar_iv', 'avatar_v'] });
    expect(calls[0]!.url).toBe('https://api.test/v3/avatars/looks/lk_done');
    expect(new Headers(calls[0]!.init.headers).get('x-api-key')).toBe('k');
    expect(await a.getLookGeneration('lk_proc')).toEqual({ status: 'processing' });
    expect(await a.getLookGeneration('lk_fail')).toEqual({ status: 'failed', error: 'Bad image' });
    expect(await a.getLookGeneration('lk_cons')).toEqual({ status: 'pending' });
    expect(await a.getLookGeneration('lk_null')).toEqual({ status: 'pending' });
    expect((await a.getLookGeneration('lk_pub')).status).toBe('completed');
  });

  it('codifica o id na URL', async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: { status: 'processing' } }));
    await new HeyGenLooksAdapter('k', 'https://api.test', fetch).getLookGeneration('a/b');
    expect(calls[0]!.url).toBe('https://api.test/v3/avatars/looks/a%2Fb');
  });
});

describe('SimulatedHeyGenLooks', () => {
  it('é determinístico e conclui com lookId derivado da origem e o preview da origem', async () => {
    const sim = new SimulatedHeyGenLooks((id) => (id === 'sim_avatar_ana' ? 'https://preview/ana.png' : undefined));
    const key = lookIdempotencyKey('ws', 'sim_avatar_ana', 'p');
    const g1 = await sim.generateLookFromPrompt({ sourceLookId: 'sim_avatar_ana', prompt: 'p', idempotencyKey: key });
    const g2 = await sim.generateLookFromPrompt({ sourceLookId: 'sim_avatar_ana', prompt: 'p', idempotencyKey: key });
    expect(g1.generationId).toBe(g2.generationId);
    expect(g1.generationId.startsWith('sim_gen_')).toBe(true);
    expect(g1.generationId.length).toBeLessThanOrEqual(120);
    expect(SimulatedHeyGenLooks.isSimulatedId(g1.generationId)).toBe(true);
    const r = await sim.getLookGeneration(g1.generationId);
    expect(r.status).toBe('completed');
    expect(r.lookId).toMatch(/^sim_avatar_ana__ia_[0-9a-f]{8}$/);
    expect(r.previewUrl).toBe('https://preview/ana.png');
    // outra instância (ex.: após reinício) decodifica a origem do próprio id
    const fresh = await new SimulatedHeyGenLooks().getLookGeneration(g1.generationId);
    expect(fresh.lookId).toBe(r.lookId);
  });

  it('id desconhecido => failed', async () => {
    expect((await new SimulatedHeyGenLooks().getLookGeneration('lk_real')).status).toBe('failed');
  });
});

describe('LookGenerationRateLimiter', () => {
  it('limita 6 por workspace por hora, sem contar replay da mesma chave, e devolve vaga', () => {
    let t = 0;
    const rl = new LookGenerationRateLimiter(6, 3600_000, () => t);
    for (let i = 0; i < 6; i++) expect(rl.take('ws', `k${i}`).ok).toBe(true);
    expect(rl.take('ws', 'k0')).toEqual({ ok: true, replay: true });
    const blocked = rl.take('ws', 'k6');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(3600);
    expect(rl.take('other', 'k6').ok).toBe(true);
    rl.release('ws', 'k5');
    expect(rl.take('ws', 'k6').ok).toBe(true);
    t = 3600_001;
    expect(rl.take('ws', 'k7').ok).toBe(true);
  });
});
