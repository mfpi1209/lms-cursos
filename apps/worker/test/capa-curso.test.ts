import { describe, expect, it } from 'vitest';
import { HEYGEN_PROMPT_MAX } from '@lms/media';
import { COVER_WRIST_TEXT, buildCoverPrompt, checkCoverSpend, coverIdempotencyKey, parseArgs, posterFromResult, type CoverResultFile } from '../src/capa-curso';

const SCENERY = 'studio: clean wall, navy panels with wood slats and LED both sides, DW logo right';
const ref = { base64: 'AAAA', mediaType: 'image/png' };

describe('prompt da capa', () => {
  it('cabe no limite e traz roupa, pose, pulsos e enquadramento', () => {
    const { prompt, sceneryShortened } = buildCoverPrompt({ roupa: 'navy blazer over a white blouse', pose: 'holding a printed resume at chest height', lado: 'esq', scenery: SCENERY });
    expect(prompt.length).toBeLessThanOrEqual(HEYGEN_PROMPT_MAX);
    expect(prompt).toContain('navy blazer over a white blouse');
    expect(prompt).toContain('holding a printed resume at chest height');
    expect(prompt).toContain(COVER_WRIST_TEXT);
    expect(prompt).toContain('no watch, no bracelet, no rings');
    expect(prompt).toContain('wrists');
    expect(prompt).toContain('LEFT third');
    expect(prompt).toContain('16:9');
    expect(prompt).toContain('DW logo right');
    expect(prompt).toContain('no new text, logos');
    expect(sceneryShortened).toBe(false);
  });
  it('lado direito', () => {
    expect(buildCoverPrompt({ roupa: 'a', pose: 'b', lado: 'dir', scenery: SCENERY }).prompt).toContain('RIGHT third');
  });
  it('estúdio longo é encurtado; roupa, pose e pulsos ficam', () => {
    const long = Array.from({ length: 80 }, (_, i) => `element${i}`).join(' ');
    const r = buildCoverPrompt({ roupa: 'green cardigan', pose: 'arms crossed', lado: 'esq', scenery: long });
    expect(r.prompt.length).toBeLessThanOrEqual(HEYGEN_PROMPT_MAX);
    expect(r.sceneryShortened).toBe(true);
    expect(r.prompt).toContain('green cardigan');
    expect(r.prompt).toContain(COVER_WRIST_TEXT);
  });
  it('roupa/pose gigantes: erro em português, sem cortar', () => {
    expect(() => buildCoverPrompt({ roupa: 'x '.repeat(600), pose: 'y', lado: 'esq', scenery: SCENERY })).toThrow(/encurte/);
    expect(() => buildCoverPrompt({ roupa: '', pose: 'y', lado: 'esq' })).toThrow(/obrigatórias/);
  });
});

describe('argumentos', () => {
  const base = ['--course', 'crs_1', '--roupa', 'blazer', '--pose', 'segurando um currículo'];
  it('padrões', () => {
    const a = parseArgs([...base, '--max-usd', '1']);
    expect(a).toMatchObject({ course: 'crs_1', sufixo: 'v1', lado: 'esq', confirmar: false, aplicar: false, maxUsd: 1 });
  });
  it('exige curso, roupa e pose; rejeita opção desconhecida e --seco+--confirmar', () => {
    expect(() => parseArgs(['--roupa', 'a', '--pose', 'b'])).toThrow(/--course/);
    expect(() => parseArgs(['--course', 'c', '--pose', 'b'])).toThrow(/--roupa/);
    expect(() => parseArgs(['--course', 'c', '--roupa', 'a'])).toThrow(/--pose/);
    expect(() => parseArgs([...base, '--x', '1'])).toThrow(/desconhecida/);
    expect(() => parseArgs([...base, '--seco', '--confirmar'])).toThrow(/OU/);
    expect(() => parseArgs([...base, '--lado', 'meio'])).toThrow(/--lado/);
  });
  it('--aplicar exige --de-arquivo e dispensa roupa/pose', () => {
    expect(() => parseArgs(['--aplicar', '--course', 'c'])).toThrow(/--de-arquivo/);
    expect(parseArgs(['--aplicar', '--course', 'c', '--de-arquivo', 'x.json'])).toMatchObject({ aplicar: true, deArquivo: 'x.json' });
  });
});

describe('guardas de custo', () => {
  const env = { ALLOW_PAID_PROVIDERS: '1', HEYGEN_API_KEY: 'k' };
  it('--max-usd obrigatório e dentro do teto', () => {
    expect(() => checkCoverSpend({ images: 1, maxUsd: undefined, confirmar: false, env: {} })).toThrow(/--max-usd/);
    expect(() => checkCoverSpend({ images: 1, maxUsd: 50, confirmar: false, env: {} })).toThrow(/teto/);
    expect(() => checkCoverSpend({ images: 2, maxUsd: 1, confirmar: false, env: {} })).toThrow(/passa do teto/);
    expect(checkCoverSpend({ images: 1, maxUsd: 1, confirmar: false, env: {} })).toEqual({ usd: 1 });
  });
  it('--confirmar exige ALLOW_PAID_PROVIDERS e HEYGEN_API_KEY; já pedida (0 imagens) não exige', () => {
    expect(() => checkCoverSpend({ images: 1, maxUsd: 1, confirmar: true, env: { HEYGEN_API_KEY: 'k' } })).toThrow(/ALLOW_PAID_PROVIDERS/);
    expect(() => checkCoverSpend({ images: 1, maxUsd: 1, confirmar: true, env: { ALLOW_PAID_PROVIDERS: '1' } })).toThrow(/HEYGEN_API_KEY/);
    expect(checkCoverSpend({ images: 1, maxUsd: 1, confirmar: true, env })).toEqual({ usd: 1 });
    expect(checkCoverSpend({ images: 0, maxUsd: 1, confirmar: true, env: {} })).toEqual({ usd: 0 });
  });
});

describe('Idempotency-Key', () => {
  const k = (o: Partial<Parameters<typeof coverIdempotencyKey>[0]> = {}) => coverIdempotencyKey({ workspaceId: 'w', courseId: 'c', sufixo: 'v1', baseLookId: 'l', prompt: 'p', referenceImage: ref, ...o });
  it('estável e sensível ao pedido', () => {
    expect(k()).toBe(k());
    expect(k()).toMatch(/^lookgen:[0-9a-f]{48}$/);
    expect(k({ prompt: 'q' })).not.toBe(k());
    expect(k({ sufixo: 'v2' })).not.toBe(k());
    expect(k({ courseId: 'd' })).not.toBe(k());
  });
});

describe('--aplicar (puro)', () => {
  const result = (o: Partial<CoverResultFile> = {}): CoverResultFile => ({ version: 1, courseId: 'crs_1', workspaceId: 'w', presenter: 'instrutor-x', sufixo: 'v1', baseLookId: 'l', studioKey: 's', roupa: 'a', pose: 'b', lado: 'esq', prompt: 'p', createdAt: 'now', status: 'completed', previewAssetId: 'ast_capa', ...o });
  const course = { id: 'crs_1', workspaceId: 'w' };
  it('devolve o asset da capa pronta', () => {
    expect(posterFromResult(result(), course)).toBe('ast_capa');
  });
  it('recusa curso/workspace trocado, capa não pronta e sem imagem', () => {
    expect(() => posterFromResult(result({ courseId: 'crs_2' }), course)).toThrow(/curso/);
    expect(() => posterFromResult(result({ workspaceId: 'x' }), course)).toThrow(/workspace/);
    expect(() => posterFromResult(result({ status: 'generating' }), course)).toThrow(/não está pronta/);
    expect(() => posterFromResult(result({ previewAssetId: undefined as unknown as string }), course)).toThrow(/previewAssetId/);
  });
});
