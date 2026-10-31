import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWatermark } from '../src';
import {
  PANEL_SHIFT, buildComposeCommand, panelRevealTimes, panelStatesFor, pngSize, renderPanelPng, renderWatermarkPng, slideToneFor, watermarkFilesFor, watermarkPlacementFor, watermarkRect, type ComposePlan,
} from '../src/compose';

const base = (over: Partial<ComposePlan['shots'][number]>[]): ComposePlan => ({
  width: 1920, height: 1080, fps: 25, background: '#000000',
  shots: over.map((o, i) => ({ id: `s${i}`, layout: 'presenter', framing: 'medium', nativeFraming: 'medium', move: 'static', transition: 'cut', duration: 4, clip: { path: `/c${i}.mp4`, width: 1920, height: 1080, hasAudio: true }, ...o })),
});

describe("marca d'água do logo", () => {
  it('resolveWatermark: ligada por padrão com logo (dnawork), desligável, preset sem logo = nenhuma', () => {
    expect(resolveWatermark(undefined, undefined)).toEqual({ brand: 'dnawork', position: 'bottom-right', opacity: 0.7 });
    expect(resolveWatermark({ enabled: false }, 'dnawork')).toBeNull();
    expect(resolveWatermark({ position: 'bottom-left', opacity: 2 }, 'dnawork')).toEqual({ brand: 'dnawork', position: 'bottom-left', opacity: 1 });
    expect(resolveWatermark({ enabled: true }, 'lms')).toBeNull();
  });

  it('geometria: canto inferior direito com margem segura; superfícies por layout (PiP manda para a esquerda)', () => {
    const r = watermarkRect({ width: 1920, height: 1080, aspect: 6, side: 'right' });
    expect(r).toEqual({ x: 1920 - 58 - 156, y: 1080 - 49 - 26, w: 156, h: 26 });
    expect(watermarkPlacementFor('presenter', undefined, 'bottom-right')).toEqual({ surface: 'video', side: 'right' });
    expect(watermarkPlacementFor('card', 'dark', 'bottom-right')).toEqual({ surface: 'dark', side: 'right' });
    expect(watermarkPlacementFor('slide_with_pip', 'light', 'bottom-right')).toEqual({ surface: 'light', side: 'left' });
    expect(watermarkPlacementFor('presenter_slide_right', 'light', 'bottom-right')).toEqual({ surface: 'light', side: 'right' });
    expect(watermarkPlacementFor('presenter_panel', undefined, 'bottom-left')).toEqual({ surface: 'dark', side: 'left' });
    expect(slideToneFor('card', { variant: 'navy' })).toBe('dark');
    expect(slideToneFor('card', {}, { cardIndex: 1 })).toBe('dark');
    expect(slideToneFor('slide', { style: 'bold' }, { accent: '#1D1E4C' })).toBe('dark');
  });

  it('PNG do tamanho do quadro, transparente fora do logo; cartões de um tom por estado', async () => {
    const png = await renderWatermarkPng({ brand: 'dnawork', surface: 'video', side: 'right', opacity: 0.7 });
    expect(png && pngSize(png)).toEqual({ width: 1920, height: 1080 });
    expect(await renderWatermarkPng({ brand: 'lms', surface: 'video', side: 'right', opacity: 0.7 })).toBeNull();
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-wm-'));
    const files = await watermarkFilesFor([{ id: 'a', layout: 'presenter' }, { id: 'b', layout: 'card', slide: { title: 't' } }, { id: 'c', layout: 'card', slide: { title: 't' } }, { id: 'd', layout: 'presenter' }], new Map([['b', '/b.png'], ['c', '/c.png']]), { brand: 'dnawork', position: 'bottom-right', opacity: 0.7 }, dir, 1920, 1080);
    expect(path.basename(files.get('a')!)).toBe('watermark-video-right.png');
    expect(path.basename(files.get('b')!)).toBe('watermark-light-right.png');
    expect(path.basename(files.get('c')!)).toBe('watermark-dark-right.png');
    expect(files.get('d')).toBe(files.get('a'));
  });

  it('filtergraph: a marca d’água fecha cada plano antes das transições', () => {
    const cmd = buildComposeCommand(base([{ watermarkPath: '/wm.png' }, { transition: 'crossfade', watermarkPath: '/wm.png' }]));
    expect(cmd.inputArgs.filter((a) => a === '/wm.png')).toHaveLength(2);
    expect(cmd.filterComplex).toContain('[r0][w0]overlay=0:0');
    expect(cmd.filterComplex).toMatch(/\[r1\]\[w1\]overlay=0:0:format=auto,[^;]*\[v1\]/);
    expect(buildComposeCommand(base([{}])).filterComplex).not.toContain('overlay');
  });
});

describe('apresentadora + painel (presenter_panel)', () => {
  it('tópicos acendem quando a palavra-chave em negrito é dita, em ordem; sem palavra = espaçado', () => {
    const words = [['Ajudar', 0.24], ['no', 0.68], ['negócio', 0.84], ['da', 1.16], ['família,', 1.28], ['organizar', 2.16], ['um', 2.68], ['evento', 2.8], ['da', 3.16], ['escola,', 3.28]].map(([text, start]) => ({ text: text as string, start: start as number }));
    const bullets = ['Ajudar no **negócio da família**', 'Organizar **eventos** e trabalhos da escola', '**Voluntariado**, esporte e **cursos online**'];
    const t = panelRevealTimes(bullets, words, 10);
    expect(t[0]).toBeCloseTo(0.74);
    expect(t[1]).toBeCloseTo(2.7);
    expect(t[2]).toBeCloseTo(7.5); // não dito: espaçado (3/4 do plano)
    expect(panelRevealTimes(bullets, undefined, 8)).toEqual([2, 4, 6]);
    expect(panelStatesFor(['/0.png', '/1.png', '/2.png', '/3.png'], t).map((x) => x.from)).toEqual([0, 0.74, 2.7, 7.5]);
  });

  it('filtergraph: tela cheia deslocada (sem zoom/movimento) + estados com enable por tempo; sem estados cai para presenter', () => {
    const cmd = buildComposeCommand(base([{ layout: 'presenter_panel', framing: 'close', move: 'push_in', duration: 6, panelStates: [{ path: '/p0.png', from: 0 }, { path: '/p1.png', from: 1.5 }, { path: '/p2.png', from: 3 }] }]));
    const sh = Math.round((1920 * PANEL_SHIFT) / 2) * 2;
    expect(cmd.filterComplex).toContain(`crop=${1920 - sh}:1080:0:0,pad=1920:1080:${sh}:0`);
    expect(cmd.filterComplex).not.toContain('zoompan');
    expect(cmd.filterComplex).toContain("enable='gte(t,0.000)*lt(t,1.500)'");
    expect(cmd.filterComplex).toContain("enable='gte(t,1.500)*lt(t,3.000)'");
    expect(cmd.filterComplex).toMatch(/enable='gte\(t,3\.000\)\*lt\(t,7\.000\)'/);
    expect(cmd.layouts).toEqual(['presenter_panel']);
    expect(buildComposeCommand(base([{ layout: 'presenter_panel' }])).layouts).toEqual(['presenter']);
  });

  it('camada do painel: PNG do quadro', async () => {
    const png = await renderPanelPng({ title: 'Isso também é experiência', bullets: ['Ajudar no **negócio da família**', 'Organizar **eventos**'], icons: ['house', 'calendar'], eyebrow: 'Aula 1 · Teste' }, { lit: 1 });
    expect(pngSize(png)).toEqual({ width: 1920, height: 1080 });
  });
});
