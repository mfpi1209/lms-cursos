import { existsSync, mkdtempSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHIP_POP_SECONDS, LOWER_THIRD_WINDOW, buildComposeCommand, chipPopFrameCount, chipPopKeyframe, chipTimeline, chipsColumn, flowChips, lowerThirdRect, lowerThirdWindow, plannedChipsFor, pngSize, renderChipsGraphics, shadeRect,
  renderLowerThirdSprite, renderTeaserSprite, teaserQuestion, teaserWindow, watermarkRect,
  SCREEN_TEXT_WINDOW, fitScreenText, parseScreenText, renderScreenTextSprite, screenTextWindow, screenTextZone, type ComposePlan, type PlannedChips,
} from '../src/compose';
import { platformBrandName } from '../src';

const base = (over: Partial<ComposePlan['shots'][number]>[], extra: Partial<ComposePlan> = {}): ComposePlan => ({
  width: 1920, height: 1080, fps: 25, background: '#000000',
  shots: over.map((o, i) => ({ id: `s${i}`, layout: 'presenter', framing: 'medium', nativeFraming: 'medium', move: 'static', transition: 'cut', duration: 4, clip: { path: `/c${i}.mp4`, width: 1920, height: 1080, hasAudio: true }, ...o })),
  ...extra,
});

const chipsPlan = (at: number[]): PlannedChips => ({
  panels: [0, ...at].map((from, j) => ({ path: `/panel-${j}.png`, x: 896, y: 98, from: j === 0 ? 0 : at[j - 1]!, to: j < at.length ? at[j]! : 6 })),
  chips: at.map((a, j) => ({ x: 964, y: 368 + j * 100, popPattern: `/chip-${j}-pop-%02d.png`, popCount: 6, at: a, halo: `/chip-${j}-halo.png`, haloFrom: a + 0.24, haloUntil: at[j + 1] ?? 6, settled: `/chip-${j}-settled.png` })),
});

describe('estúdio com zonas: geometria e tempo', () => {
  it('coluna de conteúdo (700 px a 96 px da borda livre) e véu do lado livre, como o modelo aprovado', () => {
    expect(chipsColumn({ width: 1920, zone: 'left' })).toEqual({ x: 1123, width: 701, side: 'right' });
    expect(chipsColumn({ width: 1920, zone: 'right' })).toEqual({ x: 96, width: 701, side: 'left' });
    expect(chipsColumn({ width: 1920, zone: 'center' })).toEqual({ x: 1248, width: 576, side: 'right' });
    expect(shadeRect({ width: 1920, height: 1080, zone: 'left' })).toEqual({ x: 960, y: 0, w: 960, h: 1080, side: 'right' });
    expect(shadeRect({ width: 1920, height: 1080, zone: 'right' })).toEqual({ x: 0, y: 0, w: 960, h: 1080, side: 'left' });
    // 3/4 (apresentadora ao centro): véu mais estreito
    expect(shadeRect({ width: 1920, height: 1080, zone: 'center' }).w).toBe(845);
  });

  it('pílulas fluem em linhas com 16 px de espaço', () => {
    expect(flowChips([380, 300, 250], 701, 76, 16)).toEqual([{ x: 0, y: 0 }, { x: 396, y: 0 }, { x: 0, y: 92 }]);
    expect(flowChips([800], 701, 76, 16)).toEqual([{ x: 0, y: 0 }]);
  });

  it('pop: 0,8 → 1,06 → 1,0 com giro leve e halo; ≈ 0,24 s (6 quadros a 25 fps)', () => {
    expect(chipPopKeyframe(0)).toEqual({ scale: 0.8, rotate: -4, opacity: 0.3, halo: 0 });
    expect(chipPopKeyframe(0.55).scale).toBe(1.06);
    expect(chipPopKeyframe(1)).toEqual({ scale: 1, rotate: 0, opacity: 1, halo: 1 });
    expect(chipPopFrameCount(25)).toBe(6);
    expect(CHIP_POP_SECONDS).toBeCloseTo(0.24);
  });

  it('linha do tempo das pílulas: halo na atual até a próxima surgir; a última fica com halo até o fim', () => {
    expect(chipTimeline([0.65, 1.9, 2.9], 5)).toEqual([
      { at: 0.65, haloFrom: 0.89, haloUntil: 1.9 },
      { at: 1.9, haloFrom: 2.14, haloUntil: 2.9 },
      { at: 2.9, haloFrom: 3.14, haloUntil: 5 },
    ]);
  });

  it('janelas: letreiro 0,6–4,5 s (cena curta encurta; curtíssima = sem); pergunta nos últimos 3 s', () => {
    expect(LOWER_THIRD_WINDOW).toEqual({ from: 0.6, to: 4.5, slide: 0.3 });
    expect(lowerThirdWindow(20)).toEqual({ from: 0.6, to: 4.5 });
    expect(lowerThirdWindow(4)).toEqual({ from: 0.6, to: 3.8 });
    expect(lowerThirdWindow(2)).toBeNull();
    expect(teaserWindow(12.5)).toEqual({ from: 9.5, to: 12.5 });
    expect(teaserWindow(2)).toEqual({ from: 0, to: 2 });
    expect(teaserQuestion('Você coloca o negócio da família no currículo, mesmo sem salário e sem carteira?')).toBe('Você coloca o negócio da família no currículo, mesmo sem salário e sem carteira?');
    expect(teaserQuestion('A referência do Henrique está ocupada e há uma planilha restrita à vista, que parece precisar de organização urgente hoje. Como você continuaria a partir daqui?')).toBe('A referência do Henrique está ocupada e há uma planilha restrita à vista, que parece precisar de organização urgente hoje. Como você…');
  });

  it("letreiro nunca encosta na marca d'água (direita ou esquerda)", () => {
    const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const side of ['left', 'right'] as const) {
      const lt = lowerThirdRect({ width: 1920, height: 1080, w: 420, h: 84, watermarkSide: side });
      const wm = watermarkRect({ width: 1920, height: 1080, aspect: 6, side });
      expect(overlap(lt, wm), side).toBe(false);
      expect(lt.x).toBe(86);
    }
    expect(lowerThirdRect({ width: 1920, height: 1080, w: 420, h: 84 }).y).toBe(1080 - 119 - 84);
    expect(platformBrandName('dnawork')).toBe('DNA Work');
    expect(platformBrandName('lms', { NEXT_PUBLIC_BRAND_NAME: 'Cursos' } as unknown as NodeJS.ProcessEnv)).toBe('Cursos');
  });
});

describe('estúdio com zonas: filtergraph', () => {
  it('presenter_chips: tela cheia SEM transformação; painel por estado e pílulas com tempo deslocado (pop, halo, assentada)', () => {
    const cmd = buildComposeCommand(base([{ layout: 'presenter_chips', framing: 'close', move: 'push_in', duration: 6, chips: chipsPlan([0.65, 1.9]) }]));
    expect(cmd.layouts).toEqual(['presenter_chips']);
    expect(cmd.filterComplex).not.toContain('zoompan');
    // só a normalização do clipe (quadro inteiro); nenhum recorte de enquadramento/deslocamento
    expect(cmd.filterComplex).not.toMatch(/crop=(?!1920:1080,)/);
    expect(cmd.filterComplex).not.toContain('pad=1920');
    expect(cmd.inputArgs).toContain('/chip-1-pop-%02d.png');
    expect(cmd.filterComplex).toContain('fade=t=in:st=0:d=0.25:alpha=1');
    expect(cmd.filterComplex).toContain('setpts=PTS-STARTPTS+0.650/TB[kc0_0]');
    expect(cmd.filterComplex).toContain('setpts=PTS-STARTPTS+0.890/TB[kh0_0]');
    expect(cmd.filterComplex).toContain('setpts=PTS-STARTPTS+1.900/TB[ks0_0]');
    expect(cmd.filterComplex).toContain('overlay=964:468:eof_action=pass:format=auto');
    // a última pílula fica com halo até o fim (sem estado assentado)
    expect(cmd.filterComplex).not.toContain('[ks0_1]');
    expect(cmd.overlays).toEqual({});
  });

  it('sem gráficos de pílulas cai para presenter', () => {
    expect(buildComposeCommand(base([{ layout: 'presenter_chips' }])).layouts).toEqual(['presenter']);
  });

  it('letreiro (0,6–4,5 s, desliza) e pergunta (últimos 3 s, sobe) por cima das transições; o véu com as pílulas fica até o fim', () => {
    const plan = base([{ duration: 5 }, { layout: 'presenter_chips', duration: 6, transition: 'crossfade', chips: chipsPlan([0.65, 1.9]) }], {
      lowerThird: { path: '/lt.png', x: 62, y: 853, w: 500, h: 160 },
      teaser: { path: '/tz.png', x: 205, y: 300, w: 819, h: 400 },
    });
    const cmd = buildComposeCommand(plan);
    expect(cmd.totalDuration).toBe(11);
    expect(cmd.overlays).toEqual({ lowerThird: { from: 0.6, to: 4.5 }, teaser: { from: 8, to: 11 } });
    expect(cmd.filterComplex).toContain("enable='between(t,0.600,4.500)'");
    expect(cmd.filterComplex).toContain('fade=t=out:st=4.200:d=0.300:alpha=1');
    expect(cmd.filterComplex).toContain('setpts=PTS-STARTPTS+8.000/TB,fade=t=in:st=8.000:d=0.350:alpha=1');
    // a pergunta entra abaixo das pílulas, dentro do véu: o painel não é cortado
    expect(cmd.filterComplex).not.toContain("enable='lt(t,");
    expect(cmd.filterComplex).toMatch(/\[tzv\]format=yuv420p\[vout\]/);
    // sem camadas: a junção sai direto
    expect(buildComposeCommand(base([{}])).filterComplex).toContain('[v0]null[vout]');
  });

  it('pílulas posicionadas pelos gráficos e tempos pelas palavras ditas', () => {
    const g = { side: 'right' as const, panels: [0, 1, 2].map((j) => ({ path: `/p${j}.png`, x: 1, y: 2, w: 3, h: 4 })), chips: [0, 1].map((j) => ({ x: 10, y: 20 + j, popPattern: `/c${j}-%02d.png`, popFrames: ['a', 'b', 'c', 'd', 'e', 'f'], halo: `/h${j}`, settled: `/s${j}` })) };
    const words = [{ text: 'negócio', start: 1 }, { text: 'eventos', start: 3 }];
    const p = plannedChipsFor(g, ['no **negócio da família**', 'organizar **eventos**'], words, 6, 25);
    expect(p.chips.map((c) => c.at)).toEqual([0.9, 2.9]);
    expect(p.panels.map((x) => [x.from, x.to])).toEqual([[0, 0.9], [0.9, 2.9], [2.9, 6]]);
  });
});

describe('estúdio com zonas: desenho', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lms-zones-'));
  it('painel por estado (topo fixo), sprites do pop, halo e assentada; pergunta e letreiro recortados', async () => {
    const g = await renderChipsGraphics(dir, 's1', { title: 'Isso também é experiência', chips: ['Negócio da família', 'Eventos da escola'], icons: ['house', 'calendar'], eyebrow: 'Aula 1 · Você tem mais experiência do que imagina' }, { zone: 'left' });
    expect(g.side).toBe('right');
    expect(g.panels).toHaveLength(3);
    expect(new Set(g.panels.map((p) => `${p.x},${p.y}`)).size).toBe(1);
    expect(g.chips).toHaveLength(2);
    expect(g.chips[0]!.popFrames).toHaveLength(6);
    for (const f of [...g.chips[0]!.popFrames, g.chips[0]!.halo, g.chips[0]!.settled]) expect(existsSync(f)).toBe(true);
    for (const f of [g.chips[0]!.wait!, g.chips[1]!.wait!]) expect(existsSync(f)).toBe(true);
    // o véu tem a altura do quadro e cobre a metade livre
    expect(g.panels[0]).toMatchObject({ x: 960, y: 0, w: 960, h: 1080 });
    // as duas pílulas não cabem lado a lado em 700 px: segunda linha (76 + 16)
    expect(g.chips[1]!.y - g.chips[0]!.y).toBe(92);
    expect(g.chips[1]!.x).toBe(g.chips[0]!.x);
    expect(g.contentBottom).toBeGreaterThan(g.chips[1]!.y);
    const t = await renderTeaserSprite(path.join(dir, 'tz.png'), 'Isso entra no seu currículo?', { zone: 'right' });
    // o cartão visível começa na coluna (o sprite tem 64 px de margem para a sombra)
    expect(t.x + 64).toBe(96);
    // dentro do véu: logo abaixo das pílulas
    const t2 = await renderTeaserSprite(path.join(dir, 'tz2.png'), 'Isso entra no seu currículo?', { zone: 'left', below: g.contentBottom });
    expect(t2.y + 64).toBe(g.contentBottom! + 44);
    expect(pngSize(new Uint8Array(readFileSync(t.path)))).toEqual({ width: t.w, height: t.h });
    const lt = await renderLowerThirdSprite(path.join(dir, 'lt.png'), { name: 'Marina', role: 'Sua orientadora', brand: 'DNA Work' }, { watermarkSide: 'right' });
    expect(lt.x + 40).toBe(86);
    expect(lt.y + lt.h).toBeLessThan(1080);
  }, 30000);
});

describe('texto na tela no lado vazio', () => {
  it('interpreta: "Título: a, b, c" vira título + itens; "A · B" vira itens; o resto é frase', () => {
    expect(parseScreenText('Onde ela erra: fatos recentes, números, citações e fontes.')).toEqual({ title: 'Onde ela erra', items: ['fatos recentes', 'números', 'citações e fontes'] });
    expect(parseScreenText('Escola · Família · Bairro')).toEqual({ items: ['Escola', 'Família', 'Bairro'] });
    expect(parseScreenText("Bia: 'Tenho medo de que a IA faça o meu trabalho.'")).toEqual({ text: "Bia: 'Tenho medo de que a IA faça o meu trabalho.'" });
    expect(parseScreenText('Pedir para entender é estudar. Entregar o texto da IA como seu é colar.')).toEqual({ text: 'Pedir para entender é estudar. Entregar o texto da IA como seu é colar.' });
    // itens demais ou longos demais: frase
    expect(parseScreenText('Passos: um, dois, três, quatro')?.items).toBeUndefined();
    expect(parseScreenText('   ')).toBeNull();
    expect(parseScreenText(undefined)).toBeNull();
  });

  it('janela: entra em 0,6 s e vai até o fim; some antes da pergunta a seguir; cena curta = sem', () => {
    expect(SCREEN_TEXT_WINDOW.from).toBe(0.6);
    expect(screenTextWindow(12)).toEqual({ from: 0.6, to: 12 });
    expect(screenTextWindow(20, 17)).toEqual({ from: 0.6, to: 16.9 });
    expect(screenTextWindow(1.2)).toBeNull();
  });

  it('cabe em até 3 linhas: tamanho encolhe e texto muito longo é cortado', () => {
    expect(fitScreenText('Habilidade', 600, 1)).toEqual({ size: 46, text: 'Habilidade' });
    const long = 'palavra '.repeat(60).trim();
    const f = fitScreenText(long, 600, 1);
    expect(f.size).toBe(34);
    expect(f.text.length).toBeLessThan(long.length);
    expect(f.text.endsWith('…')).toBe(true);
  });

  it('só vale com todos os planos presenter na mesma câmera de zona lateral', () => {
    const clips = (z: Record<string, 'left' | 'right' | 'center' | undefined>) => new Map(Object.entries(z).map(([id, zone]) => [id, { zone }]));
    expect(screenTextZone([{ id: 'a' }, { id: 'b', layout: 'presenter' }], clips({ a: 'left', b: 'left' }))).toBe('left');
    expect(screenTextZone([{ id: 'a' }], clips({ a: 'right' }))).toBe('right');
    expect(screenTextZone([{ id: 'a' }, { id: 'b', layout: 'presenter_chips' }], clips({ a: 'left', b: 'left' }))).toBeUndefined();
    expect(screenTextZone([{ id: 'a' }], clips({ a: 'center' }))).toBeUndefined();
    expect(screenTextZone([{ id: 'a' }, { id: 'b' }], clips({ a: 'left', b: 'right' }))).toBeUndefined();
    expect(screenTextZone([{ id: 'a' }], clips({}))).toBeUndefined();
  });

  it('posição: apresentadora à direita = painel à esquerda; à esquerda = painel à direita; topo fixo; dentro do quadro', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lms-stext-'));
    const spec = parseScreenText('Onde ela erra: fatos recentes, números, citações e fontes.')!;
    const r = await renderScreenTextSprite(path.join(dir, 'r.png'), spec, { zone: 'right' });
    const l = await renderScreenTextSprite(path.join(dir, 'l.png'), spec, { zone: 'left' });
    expect(r.side).toBe('left');
    expect(l.side).toBe('right');
    expect(r.x + r.w / 2).toBeLessThan(960);
    expect(l.x + l.w / 2).toBeGreaterThan(960);
    for (const s of [r, l]) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(1920);
      expect(s.y + s.h).toBeLessThan(1080 * 0.86);
      expect(existsSync(s.path)).toBe(true);
    }
    // legível no celular: ocupa menos de 40% da largura e nunca passa do meio do quadro
    expect(pngSize(readFileSync(l.path)).width).toBeLessThan(1920 * 0.45);
  });

  it('filtergraph: entra em 0,6 s (fade + desliza da borda) e fica até o fim; some antes da pergunta; plano segue sem pílulas', () => {
    const sprite = { path: '/st.png', x: 32, y: 120, w: 829, h: 300, side: 'left' as const };
    const cmd = buildComposeCommand(base([{ duration: 8 }], { screenText: sprite }));
    expect(cmd.overlays.screenText).toEqual({ from: 0.6, to: 8 });
    expect(cmd.filterComplex).toContain('fade=t=in:st=0.600:d=0.350:alpha=1');
    expect(cmd.filterComplex).toContain("enable='between(t,0.600,8.000)'");
    expect(cmd.filterComplex).toContain("overlay=x='32-40*pow(");
    expect(cmd.filterComplex).toMatch(/\[stv\]format=yuv420p\[vout\]/);
    const right = buildComposeCommand(base([{ duration: 8 }], { screenText: { ...sprite, side: 'right' } }));
    expect(right.filterComplex).toContain("overlay=x='32+40*pow(");
    const withTeaser = buildComposeCommand(base([{ duration: 12 }], { screenText: sprite, teaser: { path: '/tz.png', x: 205, y: 300, w: 819, h: 400 } }));
    expect(withTeaser.overlays.screenText).toEqual({ from: 0.6, to: 8.9 });
    expect(withTeaser.filterComplex).toContain('fade=t=out:st=8.650:d=0.25:alpha=1');
    // sem sprite: nada
    expect(buildComposeCommand(base([{ duration: 8 }])).overlays.screenText).toBeUndefined();
  });
});
