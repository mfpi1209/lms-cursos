import { describe, expect, it } from 'vitest';
import { HEYGEN_PROMPT_MAX } from '@lms/media';
import type { Camera, CourseDocument } from '@lms/course-schema';
import {
  applyResultToDocument,
  buildRegenPrompt,
  checkSpend,
  parseArgs,
  planCameras,
  regenIdempotencyKey,
  replaceKitCameras,
  swapDirectionCameras,
  WRIST_TEXT,
  type RegenResultFile,
} from '../src/regerar-cameras';

const SCENERY = 'studio: clean wall, navy panels with wood slats and LED both sides, DW logo right';

describe('plano de câmeras', () => {
  it('ids novos com sufixo, mesma zona', () => {
    const p = planCameras({ name: 'Thiago', studioLabel: '8', sufixo: 'v2', cameras: ['esq', 'dir', '34'] });
    expect(p.map((c) => [c.oldId, c.id, c.zone])).toEqual([
      ['cam_thiago8_esq', 'cam_thiago8v2_esq', 'left'],
      ['cam_thiago8_dir', 'cam_thiago8v2_dir', 'right'],
      ['cam_thiago8_34', 'cam_thiago8v2_34', 'center'],
    ]);
  });
  it('subconjunto', () => {
    expect(planCameras({ name: 'Thiago', studioLabel: '8', sufixo: 'v2', cameras: ['34'] }).map((c) => c.id)).toEqual(['cam_thiago8v2_34']);
  });
});

describe('pedido de câmera', () => {
  for (const [angle, position] of [['front', 'left_third'], ['front', 'right_third'], ['three_quarter', 'center']] as const) {
    it(`${angle}/${position}: tem o trecho dos pulsos e cabe no limite`, () => {
      const r = buildRegenPrompt({ angle, position, scenery: SCENERY, pronoun: 'he' });
      expect(r.prompt).toContain(WRIST_TEXT);
      expect(r.prompt.endsWith(WRIST_TEXT)).toBe(true);
      expect(r.prompt.length).toBeLessThanOrEqual(HEYGEN_PROMPT_MAX);
      expect(r.prompt).toContain('mid-thigh up');
      expect(r.prompt).not.toContain('waist up');
      expect(r.prompt).toContain('DW logo right');
      expect(r.sceneryShortened).toBe(false);
      if (position === 'left_third') expect(r.prompt).toContain('LEFT third');
    });
  }
  it('estúdio longo é encurtado, o trecho dos pulsos nunca', () => {
    const long = Array.from({ length: 60 }, (_, i) => `element${i}`).join(' ').slice(0, 300);
    const r = buildRegenPrompt({ angle: 'front', position: 'left_third', scenery: long, pronoun: 'he' });
    expect(r.prompt.length).toBeLessThanOrEqual(HEYGEN_PROMPT_MAX);
    expect(r.prompt).toContain(WRIST_TEXT);
    expect(r.sceneryShortened).toBe(true);
    expect(r.scenery.length).toBeLessThan(long.length);
  });
  it('Idempotency-Key estável e distinta por câmera/prompt', () => {
    const ref = { base64: 'AAAA', mediaType: 'image/png' };
    const a = { workspaceId: 'w', presenterKey: 'instrutor-thiago', cameraId: 'cam_thiago8v2_esq', baseLookId: 'look1', prompt: 'p', referenceImage: ref };
    expect(regenIdempotencyKey(a)).toBe(regenIdempotencyKey({ ...a }));
    expect(regenIdempotencyKey(a)).not.toBe(regenIdempotencyKey({ ...a, cameraId: 'cam_thiago8v2_dir' }));
    expect(regenIdempotencyKey(a)).not.toBe(regenIdempotencyKey({ ...a, prompt: 'q' }));
    expect(regenIdempotencyKey(a)).toMatch(/^[A-Za-z0-9_:.-]{1,255}$/);
  });
});

describe('guarda de teto e de ambiente', () => {
  const ok = { ALLOW_PAID_PROVIDERS: '1', HEYGEN_API_KEY: 'k' };
  it('--max-usd obrigatório', () => {
    expect(() => checkSpend({ images: 3, maxUsd: undefined, confirmar: false, env: {} })).toThrow(/max-usd/);
    expect(() => checkSpend({ images: 3, maxUsd: Number.NaN, confirmar: false, env: {} })).toThrow(/max-usd/);
  });
  it('recusa imagens × US$ 1 acima do teto', () => {
    expect(() => checkSpend({ images: 3, maxUsd: 2, confirmar: false, env: {} })).toThrow(/passa do teto/);
    expect(checkSpend({ images: 3, maxUsd: 3, confirmar: false, env: {} }).usd).toBe(3);
  });
  it('recusa teto acima de US$ 5', () => {
    expect(() => checkSpend({ images: 1, maxUsd: 6, confirmar: false, env: {} })).toThrow(/teto aprovado/);
  });
  it('--confirmar exige ALLOW_PAID_PROVIDERS=1 e HEYGEN_API_KEY', () => {
    expect(() => checkSpend({ images: 3, maxUsd: 5, confirmar: true, env: { HEYGEN_API_KEY: 'k' } })).toThrow(/ALLOW_PAID_PROVIDERS/);
    expect(() => checkSpend({ images: 3, maxUsd: 5, confirmar: true, env: { ALLOW_PAID_PROVIDERS: '1' } })).toThrow(/HEYGEN_API_KEY/);
    expect(() => checkSpend({ images: 3, maxUsd: 5, confirmar: true, env: ok })).not.toThrow();
  });
  it('sem imagem nova (tudo já pedido) não exige chave', () => {
    expect(checkSpend({ images: 0, maxUsd: 5, confirmar: true, env: {} }).usd).toBe(0);
  });
});

describe('argumentos', () => {
  it('padrão é seco, cameras e sufixo', () => {
    const a = parseArgs(['--presenter', 'instrutor-thiago', '--sufixo', 'v2', '--max-usd', '5']);
    expect(a.confirmar).toBe(false);
    expect(a.cameras).toEqual(['esq', 'dir', '34']);
    expect(a.maxUsd).toBe(5);
  });
  it('recusa seco+confirmar, câmera inválida, sem sufixo, aplicar sem curso', () => {
    expect(() => parseArgs(['--presenter', 'x', '--sufixo', 'v2', '--seco', '--confirmar'])).toThrow();
    expect(() => parseArgs(['--presenter', 'x', '--sufixo', 'v2', '--cameras', 'esq,zz'])).toThrow(/--cameras/);
    expect(() => parseArgs(['--presenter', 'x'])).toThrow(/sufixo/);
    expect(() => parseArgs(['--aplicar', '--sufixo', 'v2'])).toThrow(/--course/);
  });
});

function doc(): CourseDocument {
  const cam = (id: string, zone: Camera['zone']) => ({ id, name: id, lookId: `look_${id}`, nativeFraming: 'medium', angle: 'front', status: 'ready', zone }) as Camera;
  const node = (id: string, cams: Array<string | undefined>) => ({ id, direction: { shots: cams.map((c, i) => ({ id: `s${i}`, ...(c ? { cameraId: c } : {}) })) } });
  return {
    presentation: { avatarId: 'look_cam_thiago8_34', cameras: [cam('cam_thiago8_34', 'center'), cam('cam_thiago8_esq', 'left'), cam('cam_thiago8_dir', 'right')] },
    modules: [{ lessons: [{ graph: { nodes: [node('a', ['cam_thiago8_esq', 'cam_thiago8_dir', undefined, 'outra']), node('b', ['cam_thiago8_34', 'cam_thiago8_esq'])] } }] }],
  } as unknown as CourseDocument;
}

describe('troca de câmeras na direção', () => {
  it('troca cada antiga pela nova correspondente e conta', () => {
    const d = doc();
    const n = swapDirectionCameras(d, new Map([['cam_thiago8_esq', 'cam_thiago8v2_esq'], ['cam_thiago8_dir', 'cam_thiago8v2_dir'], ['cam_thiago8_34', 'cam_thiago8v2_34']]));
    expect(n).toBe(4);
    const shots = d.modules.flatMap((m) => m.lessons.flatMap((l) => l.graph.nodes.flatMap((x) => (x as unknown as { direction: { shots: Array<{ cameraId?: string }> } }).direction.shots.map((s) => s.cameraId))));
    expect(shots).toEqual(['cam_thiago8v2_esq', 'cam_thiago8v2_dir', undefined, 'outra', 'cam_thiago8v2_34', 'cam_thiago8v2_esq']);
  });

  const result = (status: 'completed' | 'generating'): RegenResultFile => ({
    version: 1, presenter: 'instrutor-thiago', workspaceId: 'w', sufixo: 'v2', baseLookId: 'base', studioKey: 'estudio-jovem-8', createdAt: 'x',
    cameras: (['esq', 'dir', '34'] as const).map((key) => ({
      key, id: `cam_thiago8v2_${key}`, oldId: `cam_thiago8_${key}`, name: key, zone: key === 'esq' ? 'left' : key === 'dir' ? 'right' : 'center', angle: key === '34' ? 'three_quarter' : 'front', prompt: 'p',
      generationId: `g_${key}`, lookId: `look_new_${key}`, status: key === 'dir' ? status : 'completed', previewUrl: `https://x/${key}.png`,
    })),
  });

  it('aplica: novas na frente (3/4 primeiro), direção trocada, avatar principal novo; documento original intacto', () => {
    const d = doc();
    const r = applyResultToDocument(d, result('completed'));
    expect(r.document.presentation!.cameras.map((c) => c.id)).toEqual(['cam_thiago8v2_34', 'cam_thiago8v2_esq', 'cam_thiago8v2_dir', 'cam_thiago8_34', 'cam_thiago8_esq', 'cam_thiago8_dir']);
    expect(r.document.presentation!.avatarId).toBe('look_new_34');
    expect(r.document.presentation!.avatarPreviewUrl).toBe('https://x/34.png');
    expect(r.changes.join(' ')).toContain('4 plano');
    expect(d.presentation!.avatarId).toBe('look_cam_thiago8_34');
  });
  it('câmera ainda gerando não entra nem troca a direção dela', () => {
    const r = applyResultToDocument(doc(), result('generating'));
    expect(r.skipped).toEqual(['cam_thiago8v2_dir (generating)']);
    expect(r.document.presentation!.cameras.map((c) => c.id)).not.toContain('cam_thiago8v2_dir');
    const shots = (r.document.modules[0]!.lessons[0]!.graph.nodes[0] as unknown as { direction: { shots: Array<{ cameraId?: string }> } }).direction.shots;
    expect(shots[1]!.cameraId).toBe('cam_thiago8_dir');
    expect(shots[0]!.cameraId).toBe('cam_thiago8v2_esq');
  });
  it('rodar de novo não duplica câmeras', () => {
    const once = applyResultToDocument(doc(), result('completed')).document;
    const twice = applyResultToDocument(once, result('completed')).document;
    expect(twice.presentation!.cameras).toHaveLength(6);
  });
  it('kit: novas substituem as antigas da mesma zona', () => {
    const cur = doc().presentation!.cameras as Camera[];
    const novas = applyResultToDocument(doc(), result('completed')).document.presentation!.cameras.slice(0, 3);
    expect(replaceKitCameras(cur, novas).map((c) => c.id)).toEqual(['cam_thiago8v2_34', 'cam_thiago8v2_esq', 'cam_thiago8v2_dir']);
    expect(replaceKitCameras(cur, [novas[1]!]).map((c) => c.id)).toEqual(['cam_thiago8_34', 'cam_thiago8v2_esq', 'cam_thiago8_dir']);
  });
});
