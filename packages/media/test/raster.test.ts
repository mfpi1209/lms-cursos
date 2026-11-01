import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SvgRenderError, rasterizeSvg, rasterizeSvgSync, renderChipsGraphics, renderShotGraphics, skipIfUnrenderable, validateSvg } from '../src/compose';

/**
 * Quadro do "pop" de uma pílula larga (rótulo longo: pílula de ≈ 555 px) que o resvg 2.6.2 NÃO consegue
 * desenhar: `Option::unwrap() on a None value` em `resvg/src/geom.rs:27`, pânico nativo que vira ABORT do
 * processo node inteiro (derrubou o worker de mídia com o job mjb_0gzjn0axj02bqhzs, curso crs_m60hsx8on6ebcyqg,
 * aula_02, nó v04: bullet "nomes, números e condições"). Gatilho: grupo com opacidade < 1 + sombra desfocada
 * (`<filter>`) + giro + ícone `<image clip-path>`. Se o resvg for atualizado e este arquivo passar a desenhar,
 * o teste "isola o pânico" deve ser trocado por um SVG que ainda quebre (ou removido).
 */
const CRASH_SVG = readFileSync(new URL('./fixtures/chip-pop-resvg-panic.svg', import.meta.url), 'utf8');
const OK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#f00"/></svg>';

describe('validateSvg: recusa geometria inválida antes do resvg', () => {
  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['sem <svg>', '<div>oi</div>'],
    ['largura zero', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="20"/>'],
    ['altura negativa', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="-4"/>'],
    ['largura NaN', '<svg xmlns="http://www.w3.org/2000/svg" width="NaN" height="20"/>'],
    ['viewBox de tamanho zero', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 20"/>'],
    ['viewBox quebrado', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 NaN 20"/>'],
    ['sem dimensões', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['grande demais', '<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"/>'],
    ['transform com NaN', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="x.png" width="4" height="4" transform="matrix(NaN,0,0,1,0,0)"/></svg>'],
    ['retângulo com Infinity', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="0" y="0" width="Infinity" height="4"/></svg>'],
    ['posição undefined', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="undefined" y="0" width="3" height="4"/></svg>'],
  ])('%s', (_name, svg) => {
    expect(() => validateSvg(svg)).toThrowError(SvgRenderError);
    try {
      validateSvg(svg);
    } catch (e) {
      expect((e as SvgRenderError).code).toBe('invalid');
    }
  });

  it('aceita SVG válido, "NaN" dentro de dados embutidos e NaN em <filter> (o satori gera para boxShadow none)', () => {
    expect(() => validateSvg(OK_SVG)).not.toThrow();
    expect(() => validateSvg('<svg width="10" height="10" viewBox="0 0 10 10"><image href="data:image/png;base64,AANaNxx==" width="4" height="4"/></svg>')).not.toThrow();
    expect(() => validateSvg('<svg width="10" height="10"><defs><filter id="f" x="NaN%" width="NaN%"><feGaussianBlur stdDeviation="NaN"/></filter></defs><rect width="4" height="4"/></svg>')).not.toThrow();
    expect(() => validateSvg(CRASH_SVG)).not.toThrow();
  });

  it('rasterizeSvg rejeita o inválido sem chamar o resvg', async () => {
    await expect(rasterizeSvg('<svg width="0" height="0"/>')).rejects.toMatchObject({ name: 'SvgRenderError', code: 'invalid' });
  });
});

describe('rasterizeSvg: o resvg roda num processo filho', () => {
  it('desenha SVG válido (PNG e pixels)', async () => {
    const r = await rasterizeSvg(OK_SVG, { pixels: true });
    expect([r.width, r.height]).toEqual([40, 20]);
    expect(Buffer.from(r.png).subarray(1, 4).toString()).toBe('PNG');
    expect(r.pixels).toHaveLength(40 * 20 * 4);
    expect([...r.pixels!.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    const s = rasterizeSvgSync(OK_SVG);
    expect([s.width, s.height]).toEqual([40, 20]);
  });

  it('isola o pânico nativo do resvg: vira SvgRenderError, o processo segue vivo e o próximo desenho funciona', async () => {
    const err = await rasterizeSvg(CRASH_SVG).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(SvgRenderError);
    expect((err as SvgRenderError).code).toBe('crash');
    expect((err as SvgRenderError).message).toMatch(/resvg/);
    // este processo (o teste) continua aqui; o filho é recriado
    const again = await rasterizeSvg(OK_SVG);
    expect(again.width).toBe(40);
    // também na versão síncrona
    expect(() => rasterizeSvgSync(CRASH_SVG)).toThrowError(SvgRenderError);
    // pedidos em fila: o que cai não leva os vizinhos
    const res = await Promise.allSettled([rasterizeSvg(OK_SVG), rasterizeSvg(CRASH_SVG), rasterizeSvg(OK_SVG)]);
    expect(res.map((x) => x.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});

describe('skipIfUnrenderable: gráfico opcional que não desenha é pulado com aviso', () => {
  it('avisa no log e devolve undefined; outros erros continuam subindo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await skipIfUnrenderable('pílulas do plano s2', () => rasterizeSvg(CRASH_SVG))).toBeUndefined();
      expect(await skipIfUnrenderable('painel', () => rasterizeSvg('<svg width="0" height="10"/>'))).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[0]![0])).toMatch(/pílulas do plano s2.*ignorado.*crash/);
      expect(await skipIfUnrenderable('ok', () => Promise.resolve(7))).toBe(7);
      await expect(skipIfUnrenderable('x', () => Promise.reject(new Error('disco cheio')))).rejects.toThrow('disco cheio');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('pílulas com rótulo longo (job mjb_0gzjn0axj02bqhzs): todos os quadros do pop desenham', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lms-raster-'));
  const label = 'nomes, números e condições';

  it('renderChipsGraphics com o rótulo que derrubava o worker, nos dois tamanhos de quadro', async () => {
    for (const [width, height] of [[1920, 1080], [1280, 720]] as const) {
      const g = await renderChipsGraphics(dir, `long${height}`, { title: 'Confira antes de usar', chips: ['fonte', label, 'não entra'], icons: ['check', 'check', 'check'], eyebrow: 'Aula 2 · Usar IA com critério' }, { width, height, zone: 'left', palette: { base: '#FF7A08', accent: '#1D1E4C' } });
      expect(g.chips).toHaveLength(3);
      for (const c of g.chips) for (const f of [...c.popFrames, c.halo, c.settled, c.wait!]) expect(existsSync(f)).toBe(true);
    }
  });

  it('renderShotGraphics devolve as pílulas do plano (não cai nem descarta o gráfico)', async () => {
    const g = await renderShotGraphics({
      outDir: dir,
      shots: [{ id: 's2', layout: 'presenter_chips', slide: { style: 'checklist', title: 'Confira antes de usar', bullets: ['Compare com a **fonte**', `Confira **${label}**`, 'O que **não entra** no pedido'] } }] as never,
      zones: new Map([['s2', 'left' as const]]),
    });
    expect(g.chips.get('s2')?.chips).toHaveLength(3);
  });
});
